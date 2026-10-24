use std::sync::Arc;
use tauri::State;
use serde::{Deserialize, Serialize};
use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedSettings {
    pub active_provider:       String,
    pub gemini_model:          String,
    pub claude_model:          String,
    pub auto_analyze_risk:     String,
    pub ipc_port:              u16,
    pub notifications_enabled: bool,
    pub watch_paths:           Vec<String>,
}

impl Default for PersistedSettings {
    fn default() -> Self {
        Self {
            active_provider:       "gemini".into(),
            gemini_model:          "gemini-2.5-flash-lite".into(),
            claude_model:          "claude-sonnet-4-6".into(),
            auto_analyze_risk:     "High".into(),
            ipc_port:              7878,
            notifications_enabled: true,
            watch_paths:           vec![],
        }
    }
}

fn get_str(db: &rusqlite::Connection, key: &str) -> Option<String> {
    db.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [key],
        |r| r.get(0),
    ).ok()
}

fn set_str(db: &rusqlite::Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    db.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        rusqlite::params![key, value],
    )?;
    Ok(())
}

pub fn load_from_db(db: &rusqlite::Connection) -> PersistedSettings {
    let default = PersistedSettings::default();

    let watch_paths: Vec<String> = db.prepare(
        "SELECT path FROM watch_paths ORDER BY added_at ASC"
    ).ok()
    .and_then(|mut stmt| {
        stmt.query_map([], |r| r.get(0)).ok().map(|rows| {
            rows.filter_map(|r| r.ok()).collect()
        })
    })
    .unwrap_or_default();

    PersistedSettings {
        active_provider:       get_str(db, "active_provider").unwrap_or(default.active_provider),
        gemini_model:          get_str(db, "gemini_model").unwrap_or(default.gemini_model),
        claude_model:          get_str(db, "claude_model").unwrap_or(default.claude_model),
        auto_analyze_risk:     get_str(db, "auto_analyze_risk").unwrap_or(default.auto_analyze_risk),
        ipc_port:              get_str(db, "ipc_port")
            .and_then(|v| v.parse().ok()).unwrap_or(default.ipc_port),
        notifications_enabled: get_str(db, "notifications_enabled")
            .map(|v| v == "true").unwrap_or(default.notifications_enabled),
        watch_paths,
    }
}

#[tauri::command]
pub fn get_settings(state: State<Arc<AppState>>) -> Result<PersistedSettings, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    Ok(load_from_db(&db))
}

#[tauri::command]
pub fn save_settings(
    settings: PersistedSettings,
    state: State<Arc<AppState>>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    set_str(&db, "active_provider",       &settings.active_provider).map_err(|e| e.to_string())?;
    set_str(&db, "gemini_model",          &settings.gemini_model).map_err(|e| e.to_string())?;
    set_str(&db, "claude_model",          &settings.claude_model).map_err(|e| e.to_string())?;
    set_str(&db, "auto_analyze_risk",     &settings.auto_analyze_risk).map_err(|e| e.to_string())?;
    set_str(&db, "ipc_port",              &settings.ipc_port.to_string()).map_err(|e| e.to_string())?;
    set_str(&db, "notifications_enabled", if settings.notifications_enabled { "true" } else { "false" }).map_err(|e| e.to_string())?;

    // Sync watch_paths table
    db.execute("DELETE FROM watch_paths", []).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    for path in &settings.watch_paths {
        db.execute(
            "INSERT OR IGNORE INTO watch_paths (path, added_at) VALUES (?1, ?2)",
            rusqlite::params![path, now],
        ).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn add_watch_path(path: String, state: State<Arc<AppState>>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    db.execute(
        "INSERT OR IGNORE INTO watch_paths (path, added_at) VALUES (?1, ?2)",
        rusqlite::params![path, now],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn remove_watch_path(path: String, state: State<Arc<AppState>>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM watch_paths WHERE path = ?1", [&path])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_watch_paths(state: State<Arc<AppState>>) -> Result<Vec<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare("SELECT path FROM watch_paths ORDER BY added_at ASC")
        .map_err(|e| e.to_string())?;
    let paths: Vec<String> = stmt.query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(paths)
}
