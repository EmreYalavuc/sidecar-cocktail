mod db;
mod commands;
mod events;
mod ipc;
mod git;
mod watcher;
mod correlation;
mod ai;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{
    Arc, Mutex,
    atomic::AtomicBool,
};
use rusqlite::Connection;
use tauri::{
    Manager,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use correlation::CorrelationState;

pub struct AppState {
    pub db:            Mutex<Connection>,
    pub ipc_port:      Mutex<u16>,
    pub correlation:   Mutex<CorrelationState>,
    pub watch_paths:   Mutex<Vec<String>>,
    pub watcher_stops: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

fn db_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("sidecar.db")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let path = db_path(app.handle());
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            let conn = db::open(&path).expect("Failed to open database");

            // Load persisted watch_paths from DB
            let saved_settings = commands::config::load_from_db(&conn);
            let saved_paths = saved_settings.watch_paths.clone();
            let saved_port  = saved_settings.ipc_port;

            let state = Arc::new(AppState {
                db:            Mutex::new(conn),
                ipc_port:      Mutex::new(saved_port),
                correlation:   Mutex::new(CorrelationState::default()),
                watch_paths:   Mutex::new(vec![]),
                watcher_stops: Mutex::new(HashMap::new()),
            });

            app.manage(Arc::clone(&state));

            // Re-start watchers for all previously-watched paths
            for watch_path in saved_paths {
                let stop = Arc::new(AtomicBool::new(false));
                {
                    let mut stops = state.watcher_stops.lock().unwrap();
                    stops.insert(watch_path.clone(), Arc::clone(&stop));
                }
                {
                    let mut paths = state.watch_paths.lock().unwrap();
                    paths.push(watch_path.clone());
                }
                let app_h = app.handle().clone();
                let s     = Arc::clone(&state);
                watcher::start_watcher(watch_path, app_h, s, stop);
            }

            // Spawn IPC server
            let app_handle = app.handle().clone();
            let ipc_state  = Arc::clone(&state);
            tauri::async_runtime::spawn(async move {
                ipc::start_server(app_handle, ipc_state, saved_port).await;
            });

            setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // sessions
            commands::sessions::list_sessions,
            commands::sessions::list_events,
            commands::sessions::toggle_bookmark,
            commands::sessions::set_annotation,
            // settings (API keys)
            commands::settings::save_api_key,
            commands::settings::has_api_key,
            commands::settings::delete_api_key,
            commands::settings::get_ipc_port,
            commands::settings::set_ipc_port,
            // config (persistent settings)
            commands::config::get_settings,
            commands::config::save_settings,
            commands::config::add_watch_path,
            commands::config::remove_watch_path,
            commands::config::list_watch_paths,
            // files / watchers
            commands::files::list_file_changes,
            commands::files::start_watching,
            commands::files::stop_watching,
            commands::files::stop_all_watchers,
            commands::files::get_watch_paths,
            // analysis
            commands::analysis::analyze_event,
            commands::analysis::get_gemini_models,
            commands::analysis::fetch_gemini_models,
            commands::analysis::validate_api_key,
            commands::analysis::get_session_cost,
            commands::analysis::list_analyses,
            // project deep analysis
            commands::project::deep_analyze_project,
            // export
            commands::export::export_json,
            commands::export::export_markdown,
            commands::export::export_html,
            commands::export::compare_sessions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sidecar");
}

fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Sidecar", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit",         true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().cloned().unwrap())
        .menu(&menu)
        .tooltip("Sidecar — AI Coding Monitor")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    w.show().ok();
                    w.set_focus().ok();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    if w.is_visible().unwrap_or(false) {
                        w.hide().ok();
                    } else {
                        w.show().ok();
                        w.set_focus().ok();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}
