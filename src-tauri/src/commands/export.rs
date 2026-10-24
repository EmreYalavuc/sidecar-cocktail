use std::sync::Arc;
use tauri::State;
use serde::{Deserialize, Serialize};
use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
struct ExportEvent {
    id:          String,
    event_type:  String,
    tool_name:   Option<String>,
    tool_input:  Option<String>,
    tool_output: Option<String>,
    file_paths:  String,
    timestamp:   String,
    risk_level:  Option<String>,
    annotation:  Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ExportFileChange {
    file_path:    String,
    change_type:  String,
    lines_added:  i64,
    lines_removed: i64,
    confidence:   String,
    timestamp:    String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ExportAnalysis {
    mode:            String,
    provider:        String,
    risk_level:      Option<String>,
    content:         String,
    tokens_used:     i64,
    cost_usd:        f64,
    secrets_redacted: i64,
    created_at:      String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionExport {
    session_id:   String,
    project_path: String,
    started_at:   String,
    ended_at:     Option<String>,
    events:       Vec<ExportEvent>,
    file_changes: Vec<ExportFileChange>,
    analyses:     Vec<ExportAnalysis>,
    stats: ExportStats,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportStats {
    total_events:      usize,
    total_file_changes: usize,
    total_tokens:      i64,
    total_cost_usd:    f64,
    risk_breakdown:    RiskBreakdown,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct RiskBreakdown {
    critical: usize,
    high:     usize,
    medium:   usize,
    low:      usize,
}

fn load_session_data(state: &AppState, session_id: &str) -> Result<SessionExport, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let (project_path, started_at, ended_at) = db.query_row(
        "SELECT project_path, started_at, ended_at FROM sessions WHERE id = ?1",
        [session_id],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?)),
    ).map_err(|e| e.to_string())?;

    let mut stmt = db.prepare(
        "SELECT id, event_type, tool_name, tool_input, tool_output, file_paths, timestamp, risk_level, annotation
         FROM events WHERE session_id = ?1 ORDER BY timestamp ASC"
    ).map_err(|e| e.to_string())?;
    let events: Vec<ExportEvent> = stmt.query_map([session_id], |r| Ok(ExportEvent {
        id:          r.get(0)?, event_type: r.get(1)?, tool_name: r.get(2)?,
        tool_input:  r.get(3)?, tool_output: r.get(4)?, file_paths: r.get(5)?,
        timestamp:   r.get(6)?, risk_level: r.get(7)?, annotation: r.get(8)?,
    })).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut stmt = db.prepare(
        "SELECT file_path, change_type, lines_added, lines_removed, confidence, timestamp
         FROM file_changes WHERE session_id = ?1 ORDER BY timestamp ASC"
    ).map_err(|e| e.to_string())?;
    let file_changes: Vec<ExportFileChange> = stmt.query_map([session_id], |r| Ok(ExportFileChange {
        file_path: r.get(0)?, change_type: r.get(1)?, lines_added: r.get(2)?,
        lines_removed: r.get(3)?, confidence: r.get(4)?, timestamp: r.get(5)?,
    })).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut stmt = db.prepare(
        "SELECT mode, provider, risk_level, content, tokens_used, cost_usd, secrets_redacted, created_at
         FROM analyses WHERE session_id = ?1 ORDER BY created_at ASC"
    ).map_err(|e| e.to_string())?;
    let analyses: Vec<ExportAnalysis> = stmt.query_map([session_id], |r| Ok(ExportAnalysis {
        mode: r.get(0)?, provider: r.get(1)?, risk_level: r.get(2)?, content: r.get(3)?,
        tokens_used: r.get(4)?, cost_usd: r.get(5)?, secrets_redacted: r.get(6)?, created_at: r.get(7)?,
    })).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut breakdown = RiskBreakdown::default();
    for e in &events {
        match e.risk_level.as_deref() {
            Some("Critical") => breakdown.critical += 1,
            Some("High")     => breakdown.high += 1,
            Some("Medium")   => breakdown.medium += 1,
            _                => breakdown.low += 1,
        }
    }
    let total_tokens  = analyses.iter().map(|a| a.tokens_used).sum();
    let total_cost    = analyses.iter().map(|a| a.cost_usd).sum();

    Ok(SessionExport {
        session_id: session_id.to_string(), project_path, started_at, ended_at,
        stats: ExportStats {
            total_events: events.len(), total_file_changes: file_changes.len(),
            total_tokens, total_cost_usd: total_cost, risk_breakdown: breakdown,
        },
        events, file_changes, analyses,
    })
}

#[tauri::command]
pub fn export_json(session_id: String, state: State<Arc<AppState>>) -> Result<String, String> {
    let data = load_session_data(&state, &session_id)?;
    serde_json::to_string_pretty(&data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_markdown(session_id: String, state: State<Arc<AppState>>) -> Result<String, String> {
    let data = load_session_data(&state, &session_id)?;
    Ok(render_markdown(&data))
}

#[tauri::command]
pub fn export_html(session_id: String, state: State<Arc<AppState>>) -> Result<String, String> {
    let data = load_session_data(&state, &session_id)?;
    Ok(render_html(&data))
}

fn render_markdown(d: &SessionExport) -> String {
    let mut md = String::new();
    md.push_str(&format!("# Sidecar Session Report\n\n"));
    md.push_str(&format!("**Session:** `{}`  \n", d.session_id));
    md.push_str(&format!("**Project:** `{}`  \n", d.project_path));
    md.push_str(&format!("**Started:** {}  \n\n", d.started_at));

    md.push_str("## Summary\n\n");
    md.push_str(&format!("| Metric | Value |\n|---|---|\n"));
    md.push_str(&format!("| Events | {} |\n", d.stats.total_events));
    md.push_str(&format!("| File Changes | {} |\n", d.stats.total_file_changes));
    md.push_str(&format!("| Total Tokens | {} |\n", d.stats.total_tokens));
    md.push_str(&format!("| Total Cost | ${:.4} |\n", d.stats.total_cost_usd));
    md.push_str(&format!("| Critical | {} | High | {} | Medium | {} | Low | {} |\n\n",
        d.stats.risk_breakdown.critical, d.stats.risk_breakdown.high,
        d.stats.risk_breakdown.medium, d.stats.risk_breakdown.low));

    md.push_str("## Events\n\n");
    for e in &d.events {
        let risk = e.risk_level.as_deref().unwrap_or("—");
        md.push_str(&format!("### `{}` — {} `[{}]`\n", e.event_type, e.timestamp, risk));
        if let Some(t) = &e.tool_name { md.push_str(&format!("**Tool:** {t}  \n")); }
        if let Some(n) = &e.annotation { md.push_str(&format!("**Note:** {n}  \n")); }
        md.push('\n');
    }

    md.push_str("## File Changes\n\n");
    for fc in &d.file_changes {
        md.push_str(&format!("- `{}` ({}) +{} -{} [{}]\n",
            fc.file_path, fc.change_type, fc.lines_added, fc.lines_removed, fc.confidence));
    }

    md.push_str("\n## AI Analyses\n\n");
    for a in &d.analyses {
        let risk = a.risk_level.as_deref().unwrap_or("—");
        md.push_str(&format!("### {} — {} [{risk}]\n", a.mode, a.created_at));
        md.push_str(&format!("*Provider: {} · Tokens: {} · Cost: ${:.5}*\n\n", a.provider, a.tokens_used, a.cost_usd));
        md.push_str(&format!("{}\n\n", a.content));
    }

    md
}

fn render_html(d: &SessionExport) -> String {
    let md = render_markdown(d);
    format!(r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Sidecar Report — {}</title>
<style>
  body {{ font-family: system-ui, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #1a1a2e; }}
  pre, code {{ background: #f4f4f8; padding: 2px 6px; border-radius: 4px; font-size: 0.85em; }}
  table {{ border-collapse: collapse; width: 100%; }}
  td, th {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
  h1 {{ color: #d97706; }} h2 {{ color: #1a2b3c; border-bottom: 2px solid #d97706; padding-bottom: 4px; }}
  @media print {{ body {{ margin: 20px; }} }}
</style>
</head>
<body>
<pre>{}</pre>
</body>
</html>"#, d.session_id, md)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionCompareData {
    pub a: SessionSummary,
    pub b: SessionSummary,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionSummary {
    pub session_id:   String,
    pub project_path: String,
    pub started_at:   String,
    pub event_count:  i64,
    pub file_count:   i64,
    pub total_tokens: i64,
    pub total_cost:   f64,
    pub risk_critical: i64,
    pub risk_high:     i64,
    pub risk_medium:   i64,
    pub risk_low:      i64,
    pub top_tools:    Vec<(String, i64)>,
}

#[tauri::command]
pub fn compare_sessions(
    session_a: String,
    session_b: String,
    state: State<Arc<AppState>>,
) -> Result<SessionCompareData, String> {
    Ok(SessionCompareData {
        a: session_summary(&state, &session_a)?,
        b: session_summary(&state, &session_b)?,
    })
}

fn session_summary(state: &AppState, session_id: &str) -> Result<SessionSummary, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let (project_path, started_at) = db.query_row(
        "SELECT project_path, started_at FROM sessions WHERE id = ?1",
        [session_id],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
    ).map_err(|e| e.to_string())?;

    let event_count: i64 = db.query_row(
        "SELECT COUNT(*) FROM events WHERE session_id = ?1", [session_id], |r| r.get(0)
    ).unwrap_or(0);
    let file_count: i64 = db.query_row(
        "SELECT COUNT(*) FROM file_changes WHERE session_id = ?1", [session_id], |r| r.get(0)
    ).unwrap_or(0);

    let (total_tokens, total_cost): (i64, f64) = db.query_row(
        "SELECT COALESCE(SUM(tokens_used),0), COALESCE(SUM(cost_usd),0.0) FROM analyses WHERE session_id = ?1",
        [session_id], |r| Ok((r.get(0)?, r.get(1)?))
    ).unwrap_or((0, 0.0));

    let risk_critical: i64 = db.query_row("SELECT COUNT(*) FROM events WHERE session_id=?1 AND risk_level='Critical'", [session_id], |r| r.get(0)).unwrap_or(0);
    let risk_high:     i64 = db.query_row("SELECT COUNT(*) FROM events WHERE session_id=?1 AND risk_level='High'",     [session_id], |r| r.get(0)).unwrap_or(0);
    let risk_medium:   i64 = db.query_row("SELECT COUNT(*) FROM events WHERE session_id=?1 AND risk_level='Medium'",   [session_id], |r| r.get(0)).unwrap_or(0);
    let risk_low:      i64 = db.query_row("SELECT COUNT(*) FROM events WHERE session_id=?1 AND risk_level='Low'",      [session_id], |r| r.get(0)).unwrap_or(0);

    let mut stmt = db.prepare(
        "SELECT tool_name, COUNT(*) as cnt FROM events WHERE session_id=?1 AND tool_name IS NOT NULL GROUP BY tool_name ORDER BY cnt DESC LIMIT 5"
    ).map_err(|e| e.to_string())?;
    let top_tools: Vec<(String, i64)> = stmt.query_map([session_id], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok()).collect();

    Ok(SessionSummary {
        session_id: session_id.to_string(), project_path, started_at,
        event_count, file_count, total_tokens, total_cost,
        risk_critical, risk_high, risk_medium, risk_low, top_tools,
    })
}
