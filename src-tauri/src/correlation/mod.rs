use std::time::Instant;

/// Tracks the currently open PreToolUse → PostToolUse window.
#[derive(Debug)]
pub struct ActiveWindow {
    pub event_id:   String,
    pub session_id: String,
    pub tool_name:  String,
    pub file_paths: Vec<String>,
    pub opened_at:  Instant,
}

#[derive(Debug, Default)]
pub struct CorrelationState {
    pub active_window: Option<ActiveWindow>,
}

impl CorrelationState {
    pub fn open_window(&mut self, event_id: String, session_id: String, tool_name: String, file_paths: Vec<String>) {
        self.active_window = Some(ActiveWindow {
            event_id,
            session_id,
            tool_name,
            file_paths,
            opened_at: Instant::now(),
        });
    }

    pub fn close_window(&mut self) {
        self.active_window = None;
    }

    /// Returns (score 0–100, label) for a file change arriving right now.
    pub fn score(&self, file_path: &str) -> (u8, &'static str) {
        let Some(w) = &self.active_window else {
            return (15, "External");
        };

        let elapsed = w.opened_at.elapsed();

        // Base score from recency within the window
        let mut score: u8 = if elapsed.as_secs() < 2 { 75 } else { 60 };

        // Bonus: file is in the tool's declared paths
        let norm = file_path.replace('\\', "/").to_lowercase();
        let path_match = w.file_paths.iter().any(|p| {
            let pn = p.replace('\\', "/").to_lowercase();
            norm == pn || norm.ends_with(&pn) || pn.ends_with(&norm)
        });
        if path_match {
            score = score.saturating_add(20);
        }

        // Bonus: writing / editing tools are more likely to produce changes
        if matches!(w.tool_name.as_str(), "Edit" | "Write" | "MultiEdit") {
            score = score.saturating_add(5);
        }

        let score = score.min(100);
        let label = match score {
            90..=100 => "High",
            60..=89  => "High",
            30..=59  => "Medium",
            _        => "Low",
        };
        (score, label)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_window_returns_external() {
        let s = CorrelationState::default();
        let (score, label) = s.score("/any/file.rs");
        assert_eq!(label, "External");
        assert_eq!(score, 15);
    }

    #[test]
    fn window_without_path_match_base_score() {
        let mut s = CorrelationState::default();
        s.open_window("e1".into(), "sess".into(), "Bash".into(), vec![]);
        let (score, label) = s.score("/some/other.rs");
        // base 75 (fresh window) — no path bonus, no tool bonus for Bash
        assert!(score >= 60);
        assert_eq!(label, "High");
    }

    #[test]
    fn edit_tool_with_path_match_boosts_score() {
        let mut s = CorrelationState::default();
        s.open_window("e1".into(), "sess".into(), "Edit".into(), vec!["/proj/src/main.rs".into()]);
        let (score, label) = s.score("/proj/src/main.rs");
        // base 75 + path 20 + edit 5 = 100
        assert_eq!(score, 100);
        assert_eq!(label, "High");
    }

    #[test]
    fn close_window_resets_to_external() {
        let mut s = CorrelationState::default();
        s.open_window("e1".into(), "sess".into(), "Edit".into(), vec!["/f.rs".into()]);
        s.close_window();
        let (_, label) = s.score("/f.rs");
        assert_eq!(label, "External");
    }

    #[test]
    fn path_match_case_insensitive() {
        let mut s = CorrelationState::default();
        s.open_window("e1".into(), "sess".into(), "Write".into(), vec!["/Proj/SRC/File.RS".into()]);
        let (score, _) = s.score("/proj/src/file.rs");
        assert!(score > 75, "Expected path match bonus, got {score}");
    }
}
