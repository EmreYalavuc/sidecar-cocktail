use crate::events::ProcessedEvent;

pub fn permission_explainer(event: &ProcessedEvent) -> String {
    let tool   = event.tool_name.as_deref().unwrap_or("unknown");
    let input  = event.tool_input.as_ref()
        .and_then(|v| serde_json::to_string_pretty(v).ok())
        .unwrap_or_default();

    format!(r#"You are a security-focused code assistant. Analyze this Claude Code tool call and respond with ONLY valid JSON matching this exact schema:

{{
  "risk_level": "Low|Medium|High|Critical",
  "explanation": "Clear explanation of what this tool call will actually do",
  "side_effects": ["list", "of", "specific", "side", "effects"],
  "recommendation": "Neutral, factual recommendation (do not approve or reject)"
}}

Tool: {tool}
Input:
{input}

Respond with JSON only. No markdown, no code blocks."#)
}

#[allow(dead_code)]
pub fn code_reviewer(file_path: &str, diff: &str) -> String {
    format!(r#"You are a senior code reviewer. Analyze this code diff and respond with ONLY valid JSON:

{{
  "risk_level": "Low|Medium|High|Critical",
  "summary": "One sentence summary of the change",
  "behavioral_changes": ["list of semantic/behavioral changes"],
  "potential_issues": ["bugs, regressions, or security risks if any"],
  "verdict": "Approved|Review|Concern"
}}

File: {file_path}
Diff:
{diff}

Respond with JSON only."#)
}

pub fn activity_summarizer(events_json: &str) -> String {
    format!(r#"You are a development activity analyst. Summarize this Claude Code session and respond with ONLY valid JSON:

{{
  "headline": "One-sentence session summary",
  "milestones": ["completed tasks or milestones"],
  "failed_commands": ["commands that failed or errored"],
  "pending_items": ["unfinished or incomplete items"],
  "risk_summary": "Overall risk assessment for the session",
  "note": "Clearly label any inferences vs confirmed facts"
}}

Session events (JSON array):
{events_json}

Respond with JSON only."#)
}
