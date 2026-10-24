use std::path::Path;
use std::process::Command;

#[derive(Debug)]
pub struct DiffResult {
    pub diff:          String,
    pub lines_added:   i64,
    pub lines_removed: i64,
    #[allow(dead_code)]
    pub is_untracked:  bool,
}

/// Get unified diff for a file. Falls back gracefully on any error.
pub fn diff_file(repo_root: &Path, file_path: &Path) -> DiffResult {
    // Check if file is tracked by git
    let tracked = Command::new("git")
        .args(["ls-files", "--error-unmatch"])
        .arg(file_path)
        .current_dir(repo_root)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if tracked {
        diff_tracked(repo_root, file_path)
    } else {
        diff_untracked(repo_root, file_path)
    }
}

fn diff_tracked(repo_root: &Path, file_path: &Path) -> DiffResult {
    let out = Command::new("git")
        .args(["diff", "HEAD", "--unified=3", "--"])
        .arg(file_path)
        .current_dir(repo_root)
        .output();

    match out {
        Ok(o) if o.status.success() || !o.stdout.is_empty() => {
            let diff = String::from_utf8_lossy(&o.stdout).to_string();
            let (added, removed) = count_lines(&diff);
            DiffResult { diff, lines_added: added, lines_removed: removed, is_untracked: false }
        }
        _ => DiffResult::empty(false),
    }
}

fn diff_untracked(repo_root: &Path, file_path: &Path) -> DiffResult {
    // git diff --no-index works for untracked files, simulating diff against /dev/null
    let null = if cfg!(windows) { "NUL" } else { "/dev/null" };
    let out = Command::new("git")
        .args(["diff", "--no-index", "--unified=3", null])
        .arg(file_path)
        .current_dir(repo_root)
        .output();

    match out {
        // exit 1 is normal for git diff --no-index when there are differences
        Ok(o) if !o.stdout.is_empty() => {
            let diff = String::from_utf8_lossy(&o.stdout).to_string();
            let (added, removed) = count_lines(&diff);
            DiffResult { diff, lines_added: added, lines_removed: removed, is_untracked: true }
        }
        _ => DiffResult::empty(true),
    }
}

fn count_lines(diff: &str) -> (i64, i64) {
    let mut added = 0i64;
    let mut removed = 0i64;
    for line in diff.lines() {
        if line.starts_with('+') && !line.starts_with("+++") {
            added += 1;
        } else if line.starts_with('-') && !line.starts_with("---") {
            removed += 1;
        }
    }
    (added, removed)
}

impl DiffResult {
    fn empty(is_untracked: bool) -> Self {
        Self { diff: String::new(), lines_added: 0, lines_removed: 0, is_untracked }
    }
}

/// Find the git repo root for a given path.
pub fn find_repo_root(path: &Path) -> Option<std::path::PathBuf> {
    let out = Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .current_dir(path)
        .output()
        .ok()?;
    if out.status.success() {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        Some(std::path::PathBuf::from(s))
    } else {
        None
    }
}
