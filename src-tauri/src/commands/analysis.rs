use std::sync::Arc;
use tauri::State;
use serde::{Deserialize, Serialize};
use crate::{AppState, ai, ai::gemini};

#[derive(Debug, Serialize, Deserialize)]
pub struct AnalysisRow {
    pub id:               String,
    pub event_id:         String,
    pub session_id:       String,
    pub mode:             String,
    pub provider:         String,
    pub risk_level:       Option<String>,
    pub content:          String,
    pub tokens_used:      i64,
    pub cost_usd:         f64,
    pub secrets_redacted: i64,
    pub created_at:       String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionCost {
    pub total_tokens: i64,
    pub total_cost_usd: f64,
    pub analysis_count: i64,
}

#[tauri::command]
pub async fn analyze_event(
    event_id:   String,
    mode:       String,     // "permission" | "code_review" | "summary"
    provider:   String,
    model:      String,
    app:        tauri::AppHandle,
    state:      State<'_, Arc<AppState>>,
) -> Result<ai::AnalysisResult, String> {
    // Load event from DB
    let (session_id, event_type, tool_name, tool_input, tool_output, file_paths) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db.prepare(
            "SELECT session_id, event_type, tool_name, tool_input, tool_output, file_paths
             FROM events WHERE id = ?1"
        ).map_err(|e| e.to_string())?;

        stmt.query_row([&event_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, String>(5)?,
            ))
        }).map_err(|e| e.to_string())?
    };

    // Build a synthetic ProcessedEvent for prompt construction
    let event = crate::events::ProcessedEvent {
        id:           event_id.clone(),
        session_id:   session_id.clone(),
        event_type,
        tool_name:    tool_name.clone(),
        tool_input:   tool_input.as_deref()
            .and_then(|s| serde_json::from_str(s).ok()),
        tool_output:  tool_output.clone(),
        working_dir:  None,
        file_paths:   serde_json::from_str(&file_paths).unwrap_or_default(),
        timestamp:    chrono::Utc::now().to_rfc3339(),
        risk_level:   None,
        is_bookmarked: false,
        annotation:   None,
    };

    let prompt = match mode.as_str() {
        "permission" | "code_review" => ai::prompts::permission_explainer(&event),
        "summary" => {
            // For summary, load recent events for the session
            let events_json = load_session_events_json(&state, &session_id)?;
            ai::prompts::activity_summarizer(&events_json)
        }
        _ => return Err(format!("Unknown mode: {mode}")),
    };

    let state_ref: &AppState = &state;
    ai::analyze(&app, state_ref, &event_id, &session_id, &mode, prompt, &provider, &model).await
}

#[tauri::command]
pub async fn get_gemini_models(api_key: String) -> Result<Vec<gemini::GeminiModel>, String> {
    gemini::list_models(&api_key).await
}

/// Fetches available Gemini models using the API key stored in the OS keyring.
/// The key is never exposed to the frontend.
#[tauri::command]
pub async fn fetch_gemini_models() -> Result<Vec<String>, String> {
    let key = keyring::Entry::new("sidecar-cocktail", "gemini")
        .and_then(|e| e.get_password())
        .map_err(|_| "No Gemini API key stored. Save your key in Settings first.".to_string())?;
    let models = gemini::list_models(&key).await?;
    Ok(models.into_iter().map(|m| m.name).collect())
}

/// Validates an API key by making a lightweight test request.
/// Returns Ok(true) if valid, Err(message) if invalid or unreachable.
#[tauri::command]
pub async fn validate_api_key(provider: String, key: String) -> Result<bool, String> {
    match provider.as_str() {
        "gemini" => {
            let models = gemini::list_models(&key).await?;
            Ok(!models.is_empty())
        }
        "claude" => Ok(true), // Claude key validation not implemented — optimistically accept
        _ => Err(format!("Unknown provider: {provider}")),
    }
}

#[tauri::command]
pub fn get_session_cost(
    session_id: String,
    state: State<Arc<AppState>>,
) -> Result<SessionCost, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let row = db.query_row(
        "SELECT COALESCE(SUM(tokens_used),0), COALESCE(SUM(cost_usd),0.0), COUNT(*)
         FROM analyses WHERE session_id = ?1",
        [&session_id],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, f64>(1)?, row.get::<_, i64>(2)?)),
    ).map_err(|e| e.to_string())?;

    Ok(SessionCost {
        total_tokens:    row.0,
        total_cost_usd:  row.1,
        analysis_count:  row.2,
    })
}

#[tauri::command]
pub fn list_analyses(
    session_id: String,
    state: State<Arc<AppState>>,
) -> Result<Vec<AnalysisRow>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT id, event_id, session_id, mode, provider, risk_level, content,
                tokens_used, cost_usd, secrets_redacted, created_at
         FROM analyses WHERE session_id = ?1 ORDER BY created_at DESC LIMIT 200"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([&session_id], |row| {
        Ok(AnalysisRow {
            id:               row.get(0)?,
            event_id:         row.get(1)?,
            session_id:       row.get(2)?,
            mode:             row.get(3)?,
            provider:         row.get(4)?,
            risk_level:       row.get(5)?,
            content:          row.get(6)?,
            tokens_used:      row.get(7)?,
            cost_usd:         row.get(8)?,
            secrets_redacted: row.get(9)?,
            created_at:       row.get(10)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(rows)
}

fn load_session_events_json(state: &AppState, session_id: &str) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT event_type, tool_name, tool_input, timestamp, risk_level
         FROM events WHERE session_id = ?1 ORDER BY timestamp ASC LIMIT 50"
    ).map_err(|e| e.to_string())?;

    let rows: Vec<serde_json::Value> = stmt.query_map([session_id], |row| {
        Ok(serde_json::json!({
            "event_type": row.get::<_, String>(0)?,
            "tool_name":  row.get::<_, Option<String>>(1)?,
            "tool_input": row.get::<_, Option<String>>(2)?,
            "timestamp":  row.get::<_, String>(3)?,
            "risk_level": row.get::<_, Option<String>>(4)?,
        }))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    serde_json::to_string(&rows).map_err(|e| e.to_string())
}
