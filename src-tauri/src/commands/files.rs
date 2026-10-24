use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use tauri::State;
use serde::{Deserialize, Serialize};
use crate::{AppState, watcher};

#[derive(Debug, Serialize, Deserialize)]
pub struct FileChangeRow {
    pub id:            String,
    pub session_id:    String,
    pub event_id:      Option<String>,
    pub file_path:     String,
    pub change_type:   String,
    pub diff:          Option<String>,
    pub lines_added:   i64,
    pub lines_removed: i64,
    pub confidence:    String,
    pub timestamp:     String,
}

#[tauri::command]
pub fn list_file_changes(
    session_id: String,
    state: State<Arc<AppState>>,
) -> Result<Vec<FileChangeRow>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT id, session_id, event_id, file_path, change_type, diff,
                lines_added, lines_removed, confidence, timestamp
         FROM file_changes WHERE session_id = ?1
         ORDER BY timestamp DESC LIMIT 500",
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([&session_id], |row| {
        Ok(FileChangeRow {
            id:            row.get(0)?,
            session_id:    row.get(1)?,
            event_id:      row.get(2)?,
            file_path:     row.get(3)?,
            change_type:   row.get(4)?,
            diff:          row.get(5)?,
            lines_added:   row.get(6)?,
            lines_removed: row.get(7)?,
            confidence:    row.get(8)?,
            timestamp:     row.get(9)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(rows)
}

#[tauri::command]
pub fn start_watching(
    path: String,
    app: tauri::AppHandle,
    state: State<Arc<AppState>>,
) -> Result<(), String> {
    {
        let stops = state.watcher_stops.lock().map_err(|e| e.to_string())?;
        if stops.contains_key(&path) {
            return Ok(()); // already watching
        }
    }

    let stop = Arc::new(AtomicBool::new(false));
    {
        let mut stops = state.watcher_stops.lock().map_err(|e| e.to_string())?;
        stops.insert(path.clone(), Arc::clone(&stop));
    }
    {
        let mut paths = state.watch_paths.lock().map_err(|e| e.to_string())?;
        if !paths.contains(&path) {
            paths.push(path.clone());
        }
    }

    let state_arc = Arc::clone(&state);
    watcher::start_watcher(path, app, state_arc, stop);
    Ok(())
}

#[tauri::command]
pub fn stop_watching(
    path: String,
    state: State<Arc<AppState>>,
) -> Result<(), String> {
    let mut stops = state.watcher_stops.lock().map_err(|e| e.to_string())?;
    if let Some(stop) = stops.remove(&path) {
        stop.store(true, Ordering::Relaxed);
    }
    let mut paths = state.watch_paths.lock().map_err(|e| e.to_string())?;
    paths.retain(|p| p != &path);
    Ok(())
}

#[tauri::command]
pub fn stop_all_watchers(state: State<Arc<AppState>>) -> Result<(), String> {
    let mut stops = state.watcher_stops.lock().map_err(|e| e.to_string())?;
    for (_, stop) in stops.drain() {
        stop.store(true, Ordering::Relaxed);
    }
    let mut paths = state.watch_paths.lock().map_err(|e| e.to_string())?;
    paths.clear();
    Ok(())
}

#[tauri::command]
pub fn get_watch_paths(state: State<Arc<AppState>>) -> Result<Vec<String>, String> {
    let paths = state.watch_paths.lock().map_err(|e| e.to_string())?;
    Ok(paths.clone())
}

