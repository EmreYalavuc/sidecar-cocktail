use axum::{Router, Json, extract::State, http::StatusCode};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use crate::{AppState, ai, events::{HookPayload, ProcessedEvent}};

pub struct IpcState {
    pub app:      AppHandle,
    pub db_state: Arc<AppState>,
}

pub async fn start_server(app: AppHandle, db_state: Arc<AppState>, port: u16) {
    let state = Arc::new(IpcState { app, db_state });

    let router = Router::new()
        .route("/event",  axum::routing::post(handle_event))
        .route("/health", axum::routing::get(|| async { "ok" }))
        .with_state(state);

    let addr = format!("127.0.0.1:{}", port);
    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            log::error!("IPC server failed to bind {}: {}", addr, e);
            return;
        }
    };

    log::info!("IPC server listening on {}", addr);

    if let Err(e) = axum::serve(listener, router).await {
        log::error!("IPC server error: {}", e);
    }
}

async fn handle_event(
    State(state): State<Arc<IpcState>>,
    Json(payload): Json<HookPayload>,
) -> StatusCode {
    let event = ProcessedEvent::from_payload(&payload);

    // Update correlation window
    update_correlation(&state.db_state, &event);

    // Persist to SQLite
    if let Err(e) = persist_event(&state.db_state, &event) {
        log::warn!("Failed to persist event: {}", e);
    }

    // Send notification for Critical/High risk
    maybe_notify(&state.app, &event);

    // Emit to frontend — non-blocking
    let _ = state.app.emit("sidecar://event", &event);

    // Auto-trigger AI analysis based on configured risk threshold
    let risk = event.risk_level.as_deref().unwrap_or("Low");
    let (should_analyze, provider, model) = {
        let settings = state.db_state.db.lock()
            .ok()
            .map(|db| crate::commands::config::load_from_db(&db))
            .unwrap_or_default();
        let ok = risk_meets_threshold(risk, &settings.auto_analyze_risk);
        let m = if settings.active_provider == "gemini" {
            settings.gemini_model.clone()
        } else {
            settings.claude_model.clone()
        };
        (ok, settings.active_provider.clone(), m)
    };
    if should_analyze {
        let app_clone   = state.app.clone();
        let state_clone = Arc::clone(&state.db_state);
        let ev_clone    = event.clone();
        tokio::spawn(async move {
            auto_analyze(&app_clone, &state_clone, &ev_clone, &provider, &model).await;
        });
    }

    StatusCode::OK
}

fn risk_meets_threshold(risk: &str, threshold: &str) -> bool {
    let rank = |r: &str| match r { "Critical" => 4, "High" => 3, "Medium" => 2, "Low" => 1, _ => 0 };
    rank(risk) >= rank(threshold)
}

async fn auto_analyze(app: &AppHandle, state: &AppState, event: &ProcessedEvent, provider: &str, model: &str) {
    // Verify key is present before calling
    let key_name = if provider == "gemini" { "gemini" } else { "claude" };
    if keyring::Entry::new("sidecar-cocktail", key_name)
        .and_then(|e| e.get_password()).is_err() {
        log::debug!("Auto-analysis skipped: no {} key stored", key_name);
        return;
    }

    let prompt = ai::prompts::permission_explainer(event);
    if let Err(e) = ai::analyze(
        app, state,
        &event.id, &event.session_id,
        "permission", prompt, provider, model
    ).await {
        log::debug!("Auto-analysis skipped: {}", e);
    }
}

fn update_correlation(state: &AppState, event: &ProcessedEvent) {
    let Ok(mut corr) = state.correlation.lock() else { return };

    match event.event_type.as_str() {
        "PreToolUse" => {
            corr.open_window(
                event.id.clone(),
                event.session_id.clone(),
                event.tool_name.clone().unwrap_or_default(),
                event.file_paths.clone(),
            );
        }
        "PostToolUse" | "PostToolUseFailure" => {
            corr.close_window();
        }
        _ => {}
    }
}

fn persist_event(state: &AppState, event: &ProcessedEvent) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Upsert session stub so FK constraint is satisfied
    db.execute(
        "INSERT OR IGNORE INTO sessions (id, project_path, started_at)
         VALUES (?1, ?2, ?3)",
        rusqlite::params![
            event.session_id,
            event.working_dir.as_deref().unwrap_or("unknown"),
            event.timestamp,
        ],
    ).map_err(|e| e.to_string())?;

    let file_paths_json = serde_json::to_string(&event.file_paths).unwrap_or_default();
    let tool_input_json = event.tool_input.as_ref()
        .and_then(|v| serde_json::to_string(v).ok());

    db.execute(
        "INSERT INTO events
            (id, session_id, event_type, tool_name, tool_input, tool_output,
             working_dir, file_paths, timestamp, risk_level, is_bookmarked)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,0)",
        rusqlite::params![
            event.id,
            event.session_id,
            event.event_type,
            event.tool_name,
            tool_input_json,
            event.tool_output,
            event.working_dir,
            file_paths_json,
            event.timestamp,
            event.risk_level,
        ],
    ).map_err(|e| e.to_string())?;

    // Increment session tool count
    db.execute(
        "UPDATE sessions SET tool_count = tool_count + 1 WHERE id = ?1",
        rusqlite::params![event.session_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

fn maybe_notify(app: &AppHandle, event: &ProcessedEvent) {
    use tauri_plugin_notification::NotificationExt;

    let risk = event.risk_level.as_deref().unwrap_or("Low");
    if !matches!(risk, "Critical" | "High") {
        return;
    }

    let title = format!("{} Risk — {}", risk,
        event.tool_name.as_deref().unwrap_or(&event.event_type));
    let body = event.tool_input
        .as_ref()
        .and_then(|i| i.get("command").or_else(|| i.get("path")))
        .and_then(|v| v.as_str())
        .unwrap_or("See Sidecar for details")
        .chars()
        .take(120)
        .collect::<String>();

    let _ = app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show();
}
