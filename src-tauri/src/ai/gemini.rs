use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const BASE: &str = "https://generativelanguage.googleapis.com/v1beta";

#[derive(Debug, Serialize, Deserialize)]
pub struct GeminiModel {
    pub name:         String,
    pub display_name: String,
    pub description:  String,
}

#[derive(Debug)]
pub struct GenerateResult {
    pub text:         String,
    pub input_tokens: u32,
    pub output_tokens: u32,
}

pub async fn list_models(api_key: &str) -> Result<Vec<GeminiModel>, String> {
    let client = Client::new();
    let url    = format!("{BASE}/models?key={api_key}");

    let resp: Value = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let models = resp["models"]
        .as_array()
        .ok_or("No models field")?
        .iter()
        .filter_map(|m| {
            let name = m["name"].as_str()?.to_string();
            // Only include generateContent-capable models
            let supports = m["supportedGenerationMethods"]
                .as_array()
                .map(|a| a.iter().any(|v| v.as_str() == Some("generateContent")))
                .unwrap_or(false);
            if !supports { return None; }
            Some(GeminiModel {
                name:         name.trim_start_matches("models/").to_string(),
                display_name: m["displayName"].as_str().unwrap_or("").to_string(),
                description:  m["description"].as_str().unwrap_or("").to_string(),
            })
        })
        .collect();

    Ok(models)
}

pub async fn generate(
    api_key: &str,
    model:   &str,
    prompt:  &str,
) -> Result<GenerateResult, String> {
    let client = Client::new();
    let url    = format!("{BASE}/models/{model}:generateContent?key={api_key}");

    let body = json!({
        "contents": [{ "parts": [{ "text": prompt }] }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.2
        }
    });

    let resp: Value = client
        .post(&url)
        .json(&body)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Parse failed: {e}"))?;

    // Check for API error
    if let Some(err) = resp.get("error") {
        return Err(format!(
            "Gemini API error {}: {}",
            err["code"].as_i64().unwrap_or(0),
            err["message"].as_str().unwrap_or("unknown")
        ));
    }

    let text = resp["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or("No text in response")?
        .to_string();

    let usage = &resp["usageMetadata"];
    let input_tokens  = usage["promptTokenCount"].as_u64().unwrap_or(0) as u32;
    let output_tokens = usage["candidatesTokenCount"].as_u64().unwrap_or(0) as u32;

    Ok(GenerateResult { text, input_tokens, output_tokens })
}

/// Estimate USD cost based on model name and token counts.
pub fn estimate_cost(model: &str, input_tokens: u32, output_tokens: u32) -> f64 {
    let (input_rate, output_rate) = match model {
        m if m.contains("2.5-pro")        => (3.50 / 1_000_000.0, 10.50 / 1_000_000.0),
        m if m.contains("2.5-flash")      => (0.075 / 1_000_000.0, 0.30 / 1_000_000.0),
        m if m.contains("2.0-flash")      => (0.075 / 1_000_000.0, 0.30 / 1_000_000.0),
        m if m.contains("1.5-pro")        => (1.25 / 1_000_000.0, 5.00 / 1_000_000.0),
        m if m.contains("1.5-flash")      => (0.075 / 1_000_000.0, 0.30 / 1_000_000.0),
        m if m.contains("3.8") || m.contains("3.7") => (0.10 / 1_000_000.0, 0.40 / 1_000_000.0),
        _ => (0.10 / 1_000_000.0, 0.40 / 1_000_000.0),
    };
    input_tokens as f64 * input_rate + output_tokens as f64 * output_rate
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cost_zero_tokens_is_zero() {
        assert_eq!(estimate_cost("gemini-2.5-flash", 0, 0), 0.0);
    }

    #[test]
    fn cost_2_5_pro_rates() {
        // 1M input @ $3.50, 1M output @ $10.50
        let c = estimate_cost("gemini-2.5-pro", 1_000_000, 1_000_000);
        let expected = 3.50 + 10.50;
        assert!((c - expected).abs() < 0.001, "got {c}, expected {expected}");
    }

    #[test]
    fn cost_2_5_flash_cheaper_than_pro() {
        let flash = estimate_cost("gemini-2.5-flash", 1000, 500);
        let pro   = estimate_cost("gemini-2.5-pro",   1000, 500);
        assert!(flash < pro);
    }

    #[test]
    fn cost_3_8_model_uses_default_rates() {
        let c = estimate_cost("gemini-3.8-flash", 1_000_000, 1_000_000);
        let expected = 0.10 + 0.40;
        assert!((c - expected).abs() < 0.001);
    }

    #[test]
    fn cost_unknown_model_fallback() {
        let c1 = estimate_cost("gemini-unknown-xyz", 100, 100);
        let c2 = estimate_cost("gemini-3.8-flash",   100, 100);
        assert!((c1 - c2).abs() < 1e-10, "Unknown should use same rates as 3.8");
    }
}
