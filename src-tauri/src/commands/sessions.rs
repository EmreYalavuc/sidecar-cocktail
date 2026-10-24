use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionRow {
    pub id: String,
    pub project_path: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub tool_count: i64,
    pub file_count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EventRow {
    pub id: String,
    pub session_id: String,
    pub event_type: String,
    pub tool_name: Option<String>,
    pub tool_input: Option<String>,
    pub tool_output: Option<String>,
    pub working_dir: Option<String>,
    pub file_paths: String,
    pub timestamp: String,
    pub risk_level: Option<String>,
    pub is_bookmarked: bool,
    pub annotation: Option<String>,
}

#[tauri::command]
pub fn list_sessions(state: State<Arc<AppState>>) -> Result<Vec<SessionRow>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, project_path, started_at, ended_at, tool_count, file_count
             FROM sessions ORDER BY started_at DESC LIMIT 100",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(SessionRow {
                id:           row.get(0)?,
                project_path: row.get(1)?,
                started_at:   row.get(2)?,
                ended_at:     row.get(3)?,
                tool_count:   row.get(4)?,
                file_count:   row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

#[tauri::command]
pub fn list_events(session_id: String, state: State<Arc<AppState>>) -> Result<Vec<EventRow>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, session_id, event_type, tool_name, tool_input, tool_output,
                    working_dir, file_paths, timestamp, risk_level, is_bookmarked, annotation
             FROM events WHERE session_id = ?1 ORDER BY timestamp DESC LIMIT 500",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([&session_id], |row| {
            Ok(EventRow {
                id:           row.get(0)?,
                session_id:   row.get(1)?,
                event_type:   row.get(2)?,
                tool_name:    row.get(3)?,
                tool_input:   row.get(4)?,
                tool_output:  row.get(5)?,
                working_dir:  row.get(6)?,
                file_paths:   row.get(7)?,
                timestamp:    row.get(8)?,
                risk_level:   row.get(9)?,
                is_bookmarked: {
                    let v: i64 = row.get(10)?;
                    v != 0
                },
                annotation:   row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

#[tauri::command]
pub fn toggle_bookmark(event_id: String, state: State<Arc<AppState>>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE events SET is_bookmarked = NOT is_bookmarked WHERE id = ?1",
        [&event_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_annotation(
    event_id: String,
    note: String,
    state: State<Arc<AppState>>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE events SET annotation = ?1 WHERE id = ?2",
        [&note, &event_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
