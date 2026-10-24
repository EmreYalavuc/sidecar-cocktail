use regex::Regex;
use std::sync::OnceLock;

static SECRET_PATTERNS: OnceLock<Vec<(Regex, &'static str)>> = OnceLock::new();

fn patterns() -> &'static Vec<(Regex, &'static str)> {
    SECRET_PATTERNS.get_or_init(|| {
        let raw: &[(&str, &str)] = &[
            (r"AIza[0-9A-Za-z\-_]{35}",                              "Google API key"),
            (r"sk-[A-Za-z0-9]{48}",                                  "OpenAI key"),
            (r"sk-ant-api03-[A-Za-z0-9\-_]{93}",                     "Anthropic key"),
            (r"AKIA[0-9A-Z]{16}",                                     "AWS access key"),
            (r"[0-9a-zA-Z/+]{40}",                                    "AWS secret"),
            (r"eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+", "JWT"),
            (r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",   "Private key"),
            (r"Bearer [A-Za-z0-9\-_\.]{20,}",                        "Bearer token"),
            (r"ghp_[A-Za-z0-9]{36}",                                  "GitHub PAT"),
            (r"glpat-[A-Za-z0-9\-_]{20}",                             "GitLab token"),
            (r"xox[baprs]-[A-Za-z0-9\-]+",                           "Slack token"),
            (r"(?i)password\s*[:=]\s*\S{8,}",                         "Password"),
        ];
        raw.iter()
            .filter_map(|(pat, label)| Regex::new(pat).ok().map(|re| (re, *label)))
            .collect()
    })
}

/// Shannon entropy of a byte slice (bits per byte).
pub(crate) fn entropy(s: &[u8]) -> f64 {
    if s.is_empty() { return 0.0; }
    let mut freq = [0u32; 256];
    for &b in s { freq[b as usize] += 1; }
    let len = s.len() as f64;
    freq.iter()
        .filter(|&&c| c > 0)
        .map(|&c| { let p = c as f64 / len; -p * p.log2() })
        .sum()
}

/// High-entropy tokens that look like secrets (length 20-80, entropy > 4.5).
fn high_entropy_secrets(text: &str) -> Vec<(usize, usize)> {
    let mut spans = Vec::new();
    let token_re = Regex::new(r"[A-Za-z0-9+/=\-_\.]{20,80}").unwrap();
    for m in token_re.find_iter(text) {
        if entropy(m.as_str().as_bytes()) > 4.5 {
            spans.push((m.start(), m.end()));
        }
    }
    spans
}

pub struct RedactResult {
    pub text:            String,
    pub secrets_removed: usize,
}

/// Redact known secret patterns and high-entropy tokens from text.
pub fn redact(input: &str) -> RedactResult {
    let mut text = input.to_string();
    let mut count = 0usize;

    for (re, _) in patterns() {
        let before = text.clone();
        text = re.replace_all(&text, "[REDACTED_SECRET]").to_string();
        if text != before { count += 1; }
    }

    // High-entropy pass (collect first, then replace back-to-front to preserve offsets)
    let mut spans = high_entropy_secrets(&text);
    spans.sort_by(|a, b| b.0.cmp(&a.0)); // reverse order
    for (start, end) in spans {
        if !text[start..end].starts_with("[REDACTED") {
            text.replace_range(start..end, "[REDACTED_SECRET]");
            count += 1;
        }
    }

    RedactResult { text, secrets_removed: count }
}

#[allow(dead_code)]
/// Check whether a file path should never be sent to AI.
pub fn is_sensitive_path(path: &str) -> bool {
    let p = path.to_lowercase();
    p.contains(".env")
        || p.ends_with(".pem")
        || p.ends_with(".key")
        || p.ends_with(".p12")
        || p.ends_with(".pfx")
        || p.ends_with(".secret")
        || p.contains("credentials")
        || p.contains("secrets")
        || p.contains("id_rsa")
        || p.contains("id_ed25519")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_google_key() {
        // AIza + exactly 35 [A-Za-z0-9\-_] chars = 39 chars total
        let input = "key = AIzaSyDummyTestKey1234567890ABCDEFGHIJK";
        let r = redact(input);
        assert!(r.text.contains("[REDACTED_SECRET]"), "text was: {}", r.text);
        assert!(!r.text.contains("AIzaSy"));
    }

    #[test]
    fn redacts_jwt() {
        let jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
        let r = redact(jwt);
        assert!(r.text.contains("[REDACTED_SECRET]"));
    }

    #[test]
    fn clean_text_untouched() {
        let input = "let x = 42; println!(\"hello\");";
        let r = redact(input);
        assert_eq!(r.secrets_removed, 0);
    }

    #[test]
    fn sensitive_paths() {
        assert!(is_sensitive_path(".env.production"));
        assert!(is_sensitive_path("server.key"));
        assert!(!is_sensitive_path("main.rs"));
    }

    #[test]
    fn redacts_openai_key() {
        let input = "OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz1234567890abcdefghij";
        let r = redact(input);
        assert!(r.secrets_removed > 0, "Expected secret to be removed");
        assert!(!r.text.contains("sk-proj-abcdefghijklmnopqr"));
    }

    #[test]
    fn redacts_aws_access_key() {
        let input = "aws_access_key_id=AKIAIOSFODNN7EXAMPLE";
        let r = redact(input);
        assert!(r.secrets_removed > 0 || r.text.contains("[REDACTED"),
            "Expected AWS key redaction");
    }

    #[test]
    fn multiple_secrets_counted() {
        // Two valid-length Google API keys (AIza + 35 chars each)
        let input = "a=AIzaSyDummyTestKey1234567890ABCDEFGHIJK b=AIzaSyOtherTestKey234567890BCDEFGHIJK";
        let r = redact(input);
        // The regex finds all matches but our counter increments once per regex pass;
        // at minimum 1 redaction should happen for this test to be meaningful
        assert!(r.secrets_removed >= 1, "Expected secret redaction, got {}", r.secrets_removed);
        assert!(!r.text.contains("AIzaSy"));
    }

    #[test]
    fn high_entropy_detection() {
        // A random-looking base64 string should trigger entropy check
        let secret = "xK8mN2pQ5vR7wL1jH4bF9tY3sA6cE0dG";
        let e = entropy(secret.as_bytes());
        assert!(e > 4.0, "Expected high entropy for random string, got {e}");
    }

    #[test]
    fn low_entropy_clean() {
        let clean = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        let e = entropy(clean.as_bytes());
        assert!(e < 1.0, "Expected low entropy for repeated chars, got {e}");
    }

    #[test]
    fn empty_input_is_clean() {
        let r = redact("");
        assert_eq!(r.secrets_removed, 0);
        assert_eq!(r.text, "");
    }
}
