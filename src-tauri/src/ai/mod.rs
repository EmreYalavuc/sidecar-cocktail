pub mod gemini;
pub mod claude_ai;
pub mod redactor;
pub mod prompts;

use keyring::Entry;
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use crate::AppState;

const SERVICE: &str = "sidecar-cocktail";

fn get_key(provider: &str) -> Option<String> {
    Entry::new(SERVICE, provider).ok()?.get_password().ok()
}

pub fn get_key_pub(provider: &str) -> Option<String> {
    get_key(provider)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisResult {
    pub id:              String,
    pub event_id:        String,
    pub session_id:      String,
    pub mode:            String,
    pub provider:        String,
    pub risk_level:      Option<String>,
    pub content:         String,
    pub tokens_used:     u32,
    pub cost_usd:        f64,
    pub secrets_redacted: u32,
    pub created_at:      String,
}

/// Run analysis for an event. Called from IPC auto-trigger or manual command.
pub async fn analyze(
    app:        &tauri::AppHandle,
    state:      &AppState,
    event_id:   &str,
    session_id: &str,
    mode:       &str,
    prompt:     String,
    provider:   &str,
    model:      &str,
) -> Result<AnalysisResult, String> {
    // Redact secrets before sending
    let redacted = redactor::redact(&prompt);
    if redacted.secrets_removed > 0 {
        log::info!("Redacted {} secret(s) before AI call", redacted.secrets_removed);
    }

    let api_key = get_key(provider).ok_or_else(|| format!("No API key set for {provider}"))?;

    // Call AI provider
    let result = match provider {
        "gemini" => gemini::generate(&api_key, model, &redacted.text).await,
        "claude" => claude_ai::generate(&api_key, model, &redacted.text).await,
        other    => Err(format!("Unknown provider: {other}")),
    }?;

    // Parse risk level from JSON response
    let risk_level = serde_json::from_str::<serde_json::Value>(&result.text)
        .ok()
        .and_then(|v| v["risk_level"].as_str().map(String::from));

    let cost = match provider {
        "gemini" => gemini::estimate_cost(model, result.input_tokens, result.output_tokens),
        "claude" => claude_ai::estimate_cost(model, result.input_tokens, result.output_tokens),
        _        => 0.0,
    };

    let analysis = AnalysisResult {
        id:               uuid::Uuid::new_v4().to_string(),
        event_id:         event_id.to_string(),
        session_id:       session_id.to_string(),
        mode:             mode.to_string(),
        provider:         provider.to_string(),
        risk_level,
        content:          result.text.clone(),
        tokens_used:      result.input_tokens + result.output_tokens,
        cost_usd:         cost,
        secrets_redacted: redacted.secrets_removed as u32,
        created_at:       chrono::Utc::now().to_rfc3339(),
    };

    // Persist
    persist_analysis(state, &analysis)?;

    // Emit to frontend
    let _ = app.emit("sidecar://analysis", &analysis);

    Ok(analysis)
}

fn persist_analysis(state: &AppState, a: &AnalysisResult) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO analyses
            (id, event_id, session_id, mode, provider, risk_level, content,
             tokens_used, cost_usd, secrets_redacted, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        rusqlite::params![
            a.id, a.event_id, a.session_id, a.mode, a.provider,
            a.risk_level, a.content, a.tokens_used, a.cost_usd,
            a.secrets_redacted, a.created_at,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}
