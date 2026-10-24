export type RiskLevel = "Low" | "Medium" | "High" | "Critical";
export type ConfidenceLevel = "High" | "Medium" | "Low" | "External";
export type AnalysisMode = "permission" | "code_review" | "summary";
export type AIProvider = "gemini" | "claude";

export interface Session {
  id: string;
  project_path: string;
  started_at: string;
  ended_at: string | null;
  tool_count: number;
  file_count: number;
}

export interface ClaudeEvent {
  id: string;
  session_id: string;
  event_type:
    | "PreToolUse"
    | "PostToolUse"
    | "PostToolUseFailure"
    | "PermissionRequest"
    | "UserPromptSubmit"
    | "Stop"
    | "SessionStart"
    | "SessionEnd";
  tool_name: string | null;
  tool_input: Record<string, unknown> | null;
  tool_output: string | null;
  working_dir: string | null;
  file_paths: string[];
  timestamp: string;
  risk_level: RiskLevel | null;
  is_bookmarked: boolean;
  annotation: string | null;
}

export interface FileChange {
  id: string;
  session_id: string;
  event_id: string | null;
  file_path: string;
  change_type: "modified" | "created" | "deleted" | "renamed";
  diff: string | null;
  lines_added: number;
  lines_removed: number;
  confidence: ConfidenceLevel;
  timestamp: string;
}

export interface Analysis {
  id: string;
  event_id: string;
  session_id: string;
  mode: AnalysisMode;
  provider: AIProvider;
  model?: string;
  risk_level: RiskLevel | null;
  content: string;
  tokens_used: number;
  cost_usd: number;
  secrets_redacted: number;
  created_at: string;
}

export interface Bookmark {
  id: string;
  event_id: string;
  label: string;
  note: string | null;
  created_at: string;
}

export interface AppSettings {
  gemini_api_key_set: boolean;
  claude_api_key_set: boolean;
  active_provider: AIProvider;
  gemini_model: string;
  claude_model: string;
  ipc_port: number;
  watch_path: string | null;
  watch_paths: string[];
  excluded_paths: string[];
  auto_analyze_risk: RiskLevel;
  notifications_enabled: boolean;
}

export interface SessionStats {
  total_events: number;
  total_file_changes: number;
  total_tokens: number;
  total_cost_usd: number;
  risk_breakdown: Record<RiskLevel, number>;
}
