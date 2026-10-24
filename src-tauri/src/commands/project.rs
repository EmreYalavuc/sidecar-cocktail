use std::collections::HashMap;
use std::path::Path;
use serde::{Deserialize, Serialize};
use crate::ai::{self, gemini, claude_ai};

const IGNORE_DIRS: &[&str] = &[
    ".git", "node_modules", "target", "dist", ".next", "__pycache__",
    "vendor", ".cache", "build", ".venv", "venv", ".idea", ".vscode",
    "coverage", ".turbo", ".output", "out", "tmp",
];

const KEY_FILES: &[&str] = &[
    "package.json", "Cargo.toml", "pyproject.toml", "go.mod", "go.sum",
    "requirements.txt", "composer.json", "build.gradle", "pom.xml",
    "README.md", "README.txt", ".env.example", "docker-compose.yml",
    "Dockerfile", "Makefile", "tsconfig.json", "vite.config.ts",
    "vite.config.js", "next.config.js", "next.config.ts", "tauri.conf.json",
    "angular.json", "svelte.config.js", "nuxt.config.ts",
];

const LANG_EXTENSIONS: &[(&str, &str)] = &[
    ("rs", "Rust"), ("ts", "TypeScript"), ("tsx", "TypeScript/React"),
    ("js", "JavaScript"), ("jsx", "JavaScript/React"), ("py", "Python"),
    ("go", "Go"), ("java", "Java"), ("kt", "Kotlin"), ("swift", "Swift"),
    ("cpp", "C++"), ("c", "C"), ("cs", "C#"), ("rb", "Ruby"),
    ("php", "PHP"), ("dart", "Dart"), ("vue", "Vue"), ("svelte", "Svelte"),
    ("sql", "SQL"), ("sh", "Shell"), ("ps1", "PowerShell"),
    ("html", "HTML"), ("css", "CSS"), ("scss", "SCSS"), ("md", "Markdown"),
    ("yaml", "YAML"), ("yml", "YAML"), ("json", "JSON"), ("toml", "TOML"),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeepAnalysisResult {
    pub path:         String,
    pub file_count:   usize,
    pub lang_counts:  HashMap<String, usize>,
    pub tree_preview: String,
    pub analysis:     String,
    pub provider:     String,
    pub model:        String,
    pub tokens_used:  u32,
    pub cost_usd:     f64,
}

#[tauri::command]
pub async fn deep_analyze_project(
    path:     String,
    provider: String,
    model:    String,
) -> Result<DeepAnalysisResult, String> {
    let root = Path::new(&path);
    if !root.exists() {
        return Err(format!("Path does not exist: {path}"));
    }

    // --- 1. Walk directory tree ---
    let mut lang_counts: HashMap<String, usize> = HashMap::new();
    let mut file_count = 0usize;
    let mut tree_lines: Vec<String> = Vec::new();
    let mut key_contents: Vec<(String, String)> = Vec::new(); // (filename, content)
    let mut sample_sources: Vec<(String, String)> = Vec::new();
    let mut sampled_per_lang: HashMap<String, usize> = HashMap::new();

    walk_dir(
        root, root, 0, 4,
        &mut lang_counts, &mut file_count, &mut tree_lines,
        &mut key_contents, &mut sample_sources, &mut sampled_per_lang,
    );

    // Sort tree lines are already in order from walk
    let tree_preview = tree_lines.join("\n");

    // --- 2. Build prompt ---
    let lang_summary = {
        let mut pairs: Vec<_> = lang_counts.iter().collect();
        pairs.sort_by(|a, b| b.1.cmp(a.1));
        pairs.iter()
            .take(12)
            .map(|(l, n)| format!("{l}: {n}"))
            .collect::<Vec<_>>()
            .join(", ")
    };

    let mut prompt = format!(
        "You are a senior software architect. Analyze this codebase and return a structured JSON report.\n\
        \n\
        ## Project Path\n{path}\n\
        \n\
        ## File Statistics\n\
        Total files: {file_count}\n\
        Languages: {lang_summary}\n\
        \n\
        ## Directory Structure (depth ≤ 4)\n\
        ```\n{preview}\n```\n",
        path = path,
        file_count = file_count,
        lang_summary = lang_summary,
        preview = tree_preview.chars().take(3000).collect::<String>(),
    );

    if !key_contents.is_empty() {
        prompt.push_str("\n## Key Configuration Files\n");
        for (name, content) in &key_contents {
            let snippet = content.chars().take(800).collect::<String>();
            prompt.push_str(&format!("\n### {name}\n```\n{snippet}\n```\n"));
        }
    }

    if !sample_sources.is_empty() {
        prompt.push_str("\n## Source File Samples (first 60 lines each)\n");
        for (path_str, content) in sample_sources.iter().take(8) {
            let snippet = content.chars().take(1200).collect::<String>();
            prompt.push_str(&format!("\n### {path_str}\n```\n{snippet}\n```\n"));
        }
    }

    prompt.push_str(
        "\n## Task\n\
        Return ONLY valid JSON with this exact shape (no markdown fences):\n\
        {\n\
          \"title\": \"<short project name>\",\n\
          \"purpose\": \"<1-2 sentences: what this project does>\",\n\
          \"tech_stack\": [\"<tech1>\", \"<tech2>\", ...],\n\
          \"architecture\": \"<2-3 sentences: overall structure and patterns>\",\n\
          \"key_modules\": [\n\
            { \"name\": \"<module>\", \"role\": \"<what it does>\" }\n\
          ],\n\
          \"entry_points\": [\"<file1>\", \"<file2>\"],\n\
          \"data_flow\": \"<how data moves through the system>\",\n\
          \"notable_patterns\": [\"<pattern1>\", \"<pattern2>\"],\n\
          \"recommendations\": [\"<rec1>\", \"<rec2>\"]\n\
        }"
    );

    // --- 3. Call AI ---
    let api_key = ai::get_key_pub(&provider)
        .ok_or_else(|| format!("No API key for {provider}. Save it in Settings first."))?;

    let result = match provider.as_str() {
        "gemini" => gemini::generate(&api_key, &model, &prompt).await,
        "claude" => claude_ai::generate(&api_key, &model, &prompt).await,
        other    => Err(format!("Unknown provider: {other}")),
    }?;

    let cost = match provider.as_str() {
        "gemini" => gemini::estimate_cost(&model, result.input_tokens, result.output_tokens),
        "claude" => claude_ai::estimate_cost(&model, result.input_tokens, result.output_tokens),
        _        => 0.0,
    };

    Ok(DeepAnalysisResult {
        path,
        file_count,
        lang_counts,
        tree_preview: tree_preview.chars().take(4000).collect(),
        analysis: result.text,
        provider,
        model,
        tokens_used: result.input_tokens + result.output_tokens,
        cost_usd: cost,
    })
}

fn walk_dir(
    root:            &Path,
    dir:             &Path,
    depth:           usize,
    max_depth:       usize,
    lang_counts:     &mut HashMap<String, usize>,
    file_count:      &mut usize,
    tree_lines:      &mut Vec<String>,
    key_contents:    &mut Vec<(String, String)>,
    sample_sources:  &mut Vec<(String, String)>,
    sampled_per_lang:&mut HashMap<String, usize>,
) {
    if depth > max_depth { return; }

    let Ok(entries) = std::fs::read_dir(dir) else { return };
    let indent = "  ".repeat(depth);

    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let entry_path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if name.starts_with('.') && name != ".env.example" { continue; }

        if entry_path.is_dir() {
            if IGNORE_DIRS.contains(&name.as_str()) { continue; }
            tree_lines.push(format!("{indent}{name}/"));
            walk_dir(root, &entry_path, depth + 1, max_depth,
                     lang_counts, file_count, tree_lines,
                     key_contents, sample_sources, sampled_per_lang);
        } else {
            *file_count += 1;

            // Detect language
            if let Some(ext) = entry_path.extension().and_then(|e| e.to_str()) {
                let lang = LANG_EXTENSIONS.iter()
                    .find(|(e, _)| *e == ext)
                    .map(|(_, l)| l.to_string())
                    .unwrap_or_else(|| ext.to_uppercase());
                *lang_counts.entry(lang.clone()).or_insert(0) += 1;

                // Sample source files (max 3 per language, skip huge files)
                let is_source = matches!(ext, "rs"|"ts"|"tsx"|"js"|"jsx"|"py"|"go"|"java"|"kt"|"swift"|"cpp"|"cs"|"rb"|"php"|"vue"|"svelte");
                if is_source {
                    let count = sampled_per_lang.entry(lang.clone()).or_insert(0);
                    if *count < 3 {
                        if let Ok(content) = std::fs::read_to_string(&entry_path) {
                            if content.len() < 60_000 {
                                let rel = entry_path.strip_prefix(root)
                                    .map(|p| p.to_string_lossy().to_string())
                                    .unwrap_or(name.clone());
                                let first_60: String = content.lines().take(60).collect::<Vec<_>>().join("\n");
                                sample_sources.push((rel, first_60));
                                *count += 1;
                            }
                        }
                    }
                }
            }

            // Read key config files
            if KEY_FILES.contains(&name.as_str()) && key_contents.len() < 12 {
                if let Ok(content) = std::fs::read_to_string(&entry_path) {
                    key_contents.push((name.clone(), content));
                }
            }

            if depth <= 3 {
                tree_lines.push(format!("{indent}{name}"));
            }
        }
    }
}
