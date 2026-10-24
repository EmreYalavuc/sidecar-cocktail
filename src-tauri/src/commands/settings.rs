use keyring::Entry;
use std::sync::Arc;
use tauri::State;
use crate::AppState;

const SERVICE: &str = "sidecar-cocktail";

#[tauri::command]
pub fn save_api_key(provider: String, key: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE, &provider).map_err(|e| e.to_string())?;
    entry.set_password(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn has_api_key(provider: String) -> bool {
    Entry::new(SERVICE, &provider)
        .and_then(|e| e.get_password())
        .is_ok()
}

#[tauri::command]
pub fn delete_api_key(provider: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE, &provider).map_err(|e| e.to_string())?;
    entry.delete_credential().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_ipc_port(state: State<Arc<AppState>>) -> u16 {
    *state.ipc_port.lock().unwrap_or_else(|e| e.into_inner())
}

#[tauri::command]
pub fn set_ipc_port(port: u16, state: State<Arc<AppState>>) -> Result<(), String> {
    let mut p = state.ipc_port.lock().map_err(|e| e.to_string())?;
    *p = port;
    Ok(())
}
