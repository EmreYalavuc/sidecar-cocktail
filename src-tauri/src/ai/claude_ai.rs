use reqwest::Client;
use serde_json::{json, Value};
use crate::ai::gemini::GenerateResult;

const BASE: &str = "https://api.anthropic.com/v1";

pub async fn generate(
    api_key: &str,
    model:   &str,
    prompt:  &str,
) -> Result<GenerateResult, String> {
    let client = Client::new();

    let body = json!({
        "model": model,
        "max_tokens": 1024,
        "messages": [{ "role": "user", "content": prompt }]
    });

    let resp: Value = client
        .post(format!("{BASE}/messages"))
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Parse failed: {e}"))?;

    if let Some(err) = resp.get("error") {
        return Err(format!(
            "Claude API error: {}",
            err["message"].as_str().unwrap_or("unknown")
        ));
    }

    let text = resp["content"][0]["text"]
        .as_str()
        .ok_or("No text in response")?
        .to_string();

    let input_tokens  = resp["usage"]["input_tokens"].as_u64().unwrap_or(0) as u32;
    let output_tokens = resp["usage"]["output_tokens"].as_u64().unwrap_or(0) as u32;

    Ok(GenerateResult { text, input_tokens, output_tokens })
}

pub fn estimate_cost(model: &str, input_tokens: u32, output_tokens: u32) -> f64 {
    let (input_rate, output_rate) = match model {
        m if m.contains("opus")   => (15.0 / 1_000_000.0, 75.0 / 1_000_000.0),
        m if m.contains("sonnet") => (3.0  / 1_000_000.0, 15.0 / 1_000_000.0),
        m if m.contains("haiku")  => (0.80 / 1_000_000.0, 4.0  / 1_000_000.0),
        _                         => (3.0  / 1_000_000.0, 15.0 / 1_000_000.0),
    };
    input_tokens as f64 * input_rate + output_tokens as f64 * output_rate
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opus_more_expensive_than_haiku() {
        let opus  = estimate_cost("claude-opus-4-8",         1000, 1000);
        let haiku = estimate_cost("claude-haiku-4-5-20251001", 1000, 1000);
        assert!(opus > haiku);
    }

    #[test]
    fn zero_tokens_zero_cost() {
        assert_eq!(estimate_cost("claude-sonnet-4-6", 0, 0), 0.0);
    }

    #[test]
    fn sonnet_rate_correct() {
        // 1M input $3.00, 1M output $15.00
        let cost = estimate_cost("claude-sonnet-4-6", 1_000_000, 1_000_000);
        let expected = 3.0 + 15.0;
        assert!((cost - expected).abs() < 0.001);
    }

    #[test]
    fn unknown_model_fallback_to_sonnet() {
        let unknown = estimate_cost("claude-unknown",    100, 100);
        let sonnet  = estimate_cost("claude-sonnet-4-6", 100, 100);
        assert!((unknown - sonnet).abs() < 1e-10);
    }
}
