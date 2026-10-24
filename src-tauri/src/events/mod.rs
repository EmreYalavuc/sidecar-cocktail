use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Raw payload Claude Code hook dispatcher sends us.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct HookPayload {
    // Claude Code uses different casing across versions – accept both
    #[serde(alias = "event_name", alias = "hook_event_name")]
    pub event_name: Option<String>,

    pub session_id: Option<String>,
    pub tool_name:  Option<String>,
    pub tool_input: Option<Value>,

    /// stdout / result from the tool
    #[serde(alias = "tool_response")]
    pub tool_output: Option<String>,

    /// Whether the tool call failed
    pub is_error: Option<bool>,

    /// Working directory
    #[serde(alias = "cwd")]
    pub working_dir: Option<String>,

    /// Prompt text for UserPromptSubmit
    pub prompt: Option<String>,

    /// Catch-all for any extra fields
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, Value>,
}

/// Normalised event we store and emit to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessedEvent {
    pub id:           String,
    pub session_id:   String,
    pub event_type:   String,
    pub tool_name:    Option<String>,
    pub tool_input:   Option<Value>,
    pub tool_output:  Option<String>,
    pub working_dir:  Option<String>,
    pub file_paths:   Vec<String>,
    pub timestamp:    String,
    pub risk_level:   Option<String>,
    pub is_bookmarked: bool,
    pub annotation:   Option<String>,
}

impl ProcessedEvent {
    pub fn from_payload(payload: &HookPayload) -> Self {
        let id         = uuid::Uuid::new_v4().to_string();
        let session_id = payload.session_id.clone().unwrap_or_else(|| "unknown".into());
        let event_type = payload.event_name.clone().unwrap_or_else(|| "Unknown".into());
        let timestamp  = chrono::Utc::now().to_rfc3339();

        let file_paths = extract_file_paths(payload);
        let risk_level = score_risk(&event_type, payload.tool_name.as_deref(), &payload.tool_input);

        Self {
            id,
            session_id,
            event_type,
            tool_name:    payload.tool_name.clone(),
            tool_input:   payload.tool_input.clone(),
            tool_output:  payload.tool_output.clone(),
            working_dir:  payload.working_dir.clone(),
            file_paths,
            timestamp,
            risk_level:   Some(risk_level.to_string()),
            is_bookmarked: false,
            annotation:   None,
        }
    }
}

/// Extract file paths from tool input for common tools.
pub fn extract_file_paths(p: &HookPayload) -> Vec<String> {
    let Some(input) = &p.tool_input else { return vec![] };

    // Edit / Write / Read
    if let Some(path) = input.get("path").and_then(|v| v.as_str()) {
        return vec![path.to_string()];
    }
    // MultiEdit
    if let Some(arr) = input.get("edits").and_then(|v| v.as_array()) {
        return arr
            .iter()
            .filter_map(|e| e.get("path")?.as_str().map(|s| s.to_string()))
            .collect();
    }
    // Glob / LS
    if let Some(path) = input.get("pattern").and_then(|v| v.as_str()) {
        return vec![path.to_string()];
    }

    vec![]
}

/// Heuristic risk scorer — Phase 4 will replace with Gemini analysis.
pub fn score_risk(event_type: &str, tool_name: Option<&str>, input: &Option<Value>) -> &'static str {
    match event_type {
        "PermissionRequest" => return "High",
        "PostToolUseFailure" => return "Medium",
        "SessionEnd" | "SessionStart" | "Stop" | "UserPromptSubmit" => return "Low",
        _ => {}
    }

    let Some(tool) = tool_name else { return "Low" };

    match tool {
        "Bash" | "PowerShell" | "cmd" => {
            let cmd = input
                .as_ref()
                .and_then(|i| i.get("command").or_else(|| i.get("script")).or_else(|| i.get("code")))
                .and_then(|c| c.as_str())
                .unwrap_or("");
            bash_risk(cmd)
        }
        "Write" => "Medium",
        "Edit" | "MultiEdit" => "Low",
        "Read" | "Glob" | "Grep" | "LS" => "Low",
        "WebFetch" | "WebSearch" => "Low",
        _ => "Medium",
    }
}

pub fn bash_risk(cmd: &str) -> &'static str {
    let c = cmd.to_lowercase();

    // Critical patterns
    let critical = [
        "rm -rf", "rm -fr", "drop table", "drop database",
        "truncate ", "format ", ":(){:|:&};:", // fork bomb
        "dd if=", "mkfs", "> /dev/sd",
        "git push --force", "git push -f",
        "chmod -r 777", "chmod 777 /",
    ];
    if critical.iter().any(|p| c.contains(p)) {
        return "Critical";
    }

    // High patterns
    let high = [
        "sudo ", "su -", "passwd ", "useradd", "userdel",
        "curl | bash", "wget | sh", "curl | sh",
        "npm publish", "cargo publish",
        "git reset --hard", "git clean -f",
        "kill ", "pkill ", "taskkill",
        "reg delete", "reg add",
        "Remove-Item", "del /f",
        "psql", "mysql ", "sqlite3",
    ];
    if high.iter().any(|p| c.contains(p)) {
        return "High";
    }

    "Medium"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permission_request_is_high() {
        assert_eq!(score_risk("PermissionRequest", None, &None), "High");
    }

    #[test]
    fn session_events_are_low() {
        assert_eq!(score_risk("SessionStart", None, &None), "Low");
        assert_eq!(score_risk("SessionEnd", None, &None), "Low");
        assert_eq!(score_risk("Stop", None, &None), "Low");
    }

    #[test]
    fn post_failure_is_medium() {
        assert_eq!(score_risk("PostToolUseFailure", None, &None), "Medium");
    }

    #[test]
    fn bash_rm_rf_is_critical() {
        assert_eq!(bash_risk("rm -rf /"), "Critical");
        assert_eq!(bash_risk("git push --force origin main"), "Critical");
        assert_eq!(bash_risk("DROP TABLE users"), "Critical");
    }

    #[test]
    fn bash_sudo_is_high() {
        assert_eq!(bash_risk("sudo apt-get install curl"), "High");
        assert_eq!(bash_risk("git reset --hard HEAD"), "High");
    }

    #[test]
    fn bash_plain_is_medium() {
        assert_eq!(bash_risk("cargo build --release"), "Medium");
        assert_eq!(bash_risk("ls -la"), "Medium");
    }

    #[test]
    fn edit_tool_is_low() {
        assert_eq!(score_risk("PreToolUse", Some("Edit"), &None), "Low");
        assert_eq!(score_risk("PreToolUse", Some("Read"), &None), "Low");
    }

    #[test]
    fn write_tool_is_medium() {
        assert_eq!(score_risk("PreToolUse", Some("Write"), &None), "Medium");
    }

    #[test]
    fn extract_file_paths_from_edit() {
        let payload = HookPayload {
            event_name: Some("PreToolUse".into()),
            session_id: None,
            tool_name:  Some("Edit".into()),
            tool_input: Some(serde_json::json!({ "path": "/src/main.rs" })),
            tool_output: None,
            is_error: None,
            working_dir: None,
            prompt: None,
            extra: Default::default(),
        };
        let paths = extract_file_paths(&payload);
        assert_eq!(paths, vec!["/src/main.rs"]);
    }

    #[test]
    fn extract_file_paths_from_multiedit() {
        let payload = HookPayload {
            event_name: Some("PreToolUse".into()),
            session_id: None,
            tool_name:  Some("MultiEdit".into()),
            tool_input: Some(serde_json::json!({
                "edits": [
                    { "path": "/a.rs" },
                    { "path": "/b.rs" }
                ]
            })),
            tool_output: None,
            is_error: None,
            working_dir: None,
            prompt: None,
            extra: Default::default(),
        };
        let paths = extract_file_paths(&payload);
        assert_eq!(paths.len(), 2);
    }
}
