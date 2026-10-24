use notify::{RecommendedWatcher, RecursiveMode, Watcher, Event, EventKind, Config};
use regex::Regex;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};
use crate::{AppState, git};

const DEBOUNCE_MS: u64 = 500;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FileChangePayload {
    pub id:               String,
    pub session_id:       String,
    pub event_id:         Option<String>,
    pub file_path:        String,
    pub change_type:      String,
    pub diff:             String,
    pub lines_added:      i64,
    pub lines_removed:    i64,
    pub confidence:       String,
    pub confidence_score: u8,
    pub timestamp:        String,
}

static DEFAULT_IGNORES: &[&str] = &[
    r"[/\\]\.git[/\\]",
    r"[/\\]node_modules[/\\]",
    r"[/\\]target[/\\]",
    r"[/\\]dist[/\\]",
    r"[/\\]build[/\\]",
    r"[/\\]\.venv[/\\]",
    r"[/\\]__pycache__[/\\]",
    r"\.(exe|dll|so|dylib|bin|obj|o|a|lib|pdb)$",
    r"\.(png|jpg|jpeg|gif|ico|svg|mp4|mp3|woff2?)$",
    r"\.db(-wal|-shm)?$",
];

fn build_ignore_patterns(watch_path: &Path) -> Vec<Regex> {
    let mut patterns: Vec<String> = DEFAULT_IGNORES.iter().map(|s| s.to_string()).collect();

    let ignore_file = watch_path.join(".monitorignore");
    if let Ok(contents) = std::fs::read_to_string(&ignore_file) {
        for line in contents.lines() {
            let line = line.trim();
            if !line.is_empty() && !line.starts_with('#') {
                patterns.push(line.to_string());
            }
        }
    }

    patterns.iter().filter_map(|p| Regex::new(p).ok()).collect()
}

fn should_ignore(path: &Path, patterns: &[Regex]) -> bool {
    let path_str = path.to_string_lossy();
    patterns.iter().any(|re| re.is_match(&path_str))
}

pub fn start_watcher(
    watch_path: String,
    app: AppHandle,
    state: Arc<AppState>,
    stop: Arc<AtomicBool>,
) {
    std::thread::spawn(move || {
        let watch_dir = PathBuf::from(&watch_path);
        let repo_root = git::find_repo_root(&watch_dir)
            .unwrap_or_else(|| watch_dir.clone());

        let ignore_patterns = build_ignore_patterns(&watch_dir);

        let pending: Arc<Mutex<HashMap<PathBuf, (String, Instant)>>> =
            Arc::new(Mutex::new(HashMap::new()));

        let (tx, rx) = std::sync::mpsc::channel::<notify::Result<Event>>();

        let mut watcher = match RecommendedWatcher::new(tx, Config::default()) {
            Ok(w) => w,
            Err(e) => { log::error!("Failed to create watcher: {}", e); return; }
        };

        if let Err(e) = watcher.watch(&watch_dir, RecursiveMode::Recursive) {
            log::error!("Watcher failed to watch {}: {}", watch_path, e);
            return;
        }

        log::info!("Watching: {}", watch_path);

        let ip_clone    = Arc::clone(&pending);
        let app_clone   = app.clone();
        let state_clone = Arc::clone(&state);
        let repo_clone  = repo_root.clone();
        let stop_clone  = Arc::clone(&stop);

        // Debounce thread
        std::thread::spawn(move || {
            loop {
                if stop_clone.load(Ordering::Relaxed) { break; }
                std::thread::sleep(Duration::from_millis(DEBOUNCE_MS));
                let batch: HashMap<PathBuf, (String, Instant)> = {
                    let mut p = ip_clone.lock().unwrap();
                    std::mem::take(&mut *p)
                };
                for (path, (change_type, _)) in batch {
                    process_change(&path, &change_type, &repo_clone, &app_clone, &state_clone);
                }
            }
        });

        // Event receive loop — uses timeout to allow stop-flag checks
        loop {
            if stop.load(Ordering::Relaxed) {
                log::info!("Watcher stopped: {}", watch_path);
                break;
            }
            match rx.recv_timeout(Duration::from_millis(200)) {
                Ok(Ok(event)) => {
                    let change_type = classify(&event.kind);
                    if change_type.is_empty() { continue; }
                    for path in event.paths {
                        if should_ignore(&path, &ignore_patterns) { continue; }
                        let mut p = pending.lock().unwrap();
                        p.insert(path, (change_type.clone(), Instant::now()));
                    }
                }
                Ok(Err(e)) => log::warn!("Watch error: {}", e),
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    });
}

fn classify(kind: &EventKind) -> String {
    match kind {
        EventKind::Create(_) => "created".into(),
        EventKind::Modify(_) => "modified".into(),
        EventKind::Remove(_) => "deleted".into(),
        _ => String::new(),
    }
}

fn process_change(
    path: &Path,
    change_type: &str,
    repo_root: &Path,
    app: &AppHandle,
    state: &AppState,
) {
    let id        = uuid::Uuid::new_v4().to_string();
    let timestamp = chrono::Utc::now().to_rfc3339();
    let file_path = path.to_string_lossy().to_string();

    let diff_result = if change_type != "deleted" {
        git::diff_file(repo_root, path)
    } else {
        git::DiffResult { diff: String::new(), lines_added: 0, lines_removed: 0, is_untracked: false }
    };

    let (confidence_score, confidence, event_id, session_id) = {
        let corr = state.correlation.lock().unwrap();
        let (score, label) = corr.score(&file_path);
        let (eid, sid) = corr.active_window
            .as_ref()
            .map(|w| (Some(w.event_id.clone()), w.session_id.clone()))
            .unwrap_or((None, "unknown".into()));
        (score, label.to_string(), eid, sid)
    };

    let payload = FileChangePayload {
        id: id.clone(),
        session_id: session_id.clone(),
        event_id: event_id.clone(),
        file_path: file_path.clone(),
        change_type: change_type.to_string(),
        diff: diff_result.diff.clone(),
        lines_added: diff_result.lines_added,
        lines_removed: diff_result.lines_removed,
        confidence: confidence.clone(),
        confidence_score,
        timestamp: timestamp.clone(),
    };

    if let Err(e) = persist_file_change(state, &payload) {
        log::warn!("Failed to persist file change: {}", e);
    }

    let _ = app.emit("sidecar://file-change", &payload);
}

fn persist_file_change(state: &AppState, fc: &FileChangePayload) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    db.execute(
        "INSERT OR IGNORE INTO sessions (id, project_path, started_at) VALUES (?1, 'watcher', ?2)",
        rusqlite::params![fc.session_id, fc.timestamp],
    ).map_err(|e| e.to_string())?;

    db.execute(
        "INSERT INTO file_changes
            (id, session_id, event_id, file_path, change_type, diff,
             lines_added, lines_removed, confidence, timestamp)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        rusqlite::params![
            fc.id, fc.session_id, fc.event_id, fc.file_path,
            fc.change_type, fc.diff, fc.lines_added, fc.lines_removed,
            fc.confidence, fc.timestamp,
        ],
    ).map_err(|e| e.to_string())?;

    Ok(())
}
