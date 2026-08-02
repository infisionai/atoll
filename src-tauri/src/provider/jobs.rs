//! Generation job payload interpretation — pure functions (response field names vary, so parse defensively)

use serde_json::Value;

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum JobPhase {
    Running,
    Done,
    Failed,
}

/// Find job ids in a submit/status response
pub fn extract_job_ids(v: &Value) -> Vec<String> {
    let mut ids = Vec::new();
    let mut push = |s: Option<&str>| {
        if let Some(s) = s {
            if !s.is_empty() && !ids.contains(&s.to_string()) {
                ids.push(s.to_string());
            }
        }
    };

    for key in [
        "job_id",
        "jobId",
        "generation_id",
        "generationId",
        "id",
        "identifier",
        "creationIdentifier",
    ] {
        push(v.get(key).and_then(|x| x.as_str()));
    }
    for key in ["jobs", "results", "items", "creations"] {
        if let Some(arr) = v.get(key).and_then(|x| x.as_array()) {
            for item in arr {
                for k in [
                    "job_id",
                    "jobId",
                    "generation_id",
                    "generationId",
                    "id",
                    "identifier",
                    "creationIdentifier",
                ] {
                    push(item.get(k).and_then(|x| x.as_str()));
                }
            }
        }
    }
    if let Some(arr) = v.get("job_ids").and_then(|x| x.as_array()) {
        for item in arr {
            push(item.as_str());
        }
    }
    ids
}

/// Collect http(s) URLs across the whole payload (for extracting result media).
/// URLs under raw keys come first — the original beats min/thumbnail variants
pub fn extract_urls(v: &Value) -> Vec<String> {
    let mut raw = Vec::new();
    let mut rest = Vec::new();
    walk(v, None, &mut raw, &mut rest);
    for u in rest {
        if !raw.contains(&u) {
            raw.push(u);
        }
    }
    raw
}

fn walk(v: &Value, key: Option<&str>, raw: &mut Vec<String>, rest: &mut Vec<String>) {
    match v {
        Value::String(s) => {
            if (s.starts_with("https://") || s.starts_with("http://"))
                && raw.len() + rest.len() < 20
            {
                let is_raw = key.is_some_and(|k| k.to_lowercase().contains("raw"));
                let out = if is_raw { raw } else { rest };
                if !out.contains(s) {
                    out.push(s.clone());
                }
            }
        }
        Value::Array(arr) => arr.iter().for_each(|x| walk(x, key, raw, rest)),
        Value::Object(map) => map.iter().for_each(|(k, x)| walk(x, Some(k), raw, rest)),
        _ => {}
    }
}

/// Classify status strings — decides whether the job is finished.
/// Looks at status not only at the top level but also in the `generation` object
/// and in jobs/results array items
/// (real job_status responses have the shape `{ generation: { status, ... } }`)
pub fn classify_status(v: &Value) -> JobPhase {
    let read = |x: &Value| -> Option<String> {
        ["status", "state", "phase"]
            .iter()
            .find_map(|k| x.get(*k).and_then(|s| s.as_str()))
            .map(|s| s.to_lowercase())
    };

    let mut statuses = Vec::new();
    if let Some(s) = read(v) {
        statuses.push(s);
    }
    if let Some(s) = v.get("generation").and_then(|g| read(g)) {
        statuses.push(s);
    }
    for key in ["jobs", "results", "items", "generations"] {
        if let Some(arr) = v.get(key).and_then(|x| x.as_array()) {
            statuses.extend(arr.iter().filter_map(&read));
        }
    }
    if statuses.is_empty() {
        return JobPhase::Running;
    }

    let is_failed = |s: &str| {
        [
            "failed",
            "error",
            "cancel",
            "rejected",
            "nsfw",
            "ip_detected",
        ]
        .iter()
        .any(|m| s.contains(m))
    };
    let is_done = |s: &str| {
        [
            "completed",
            "complete",
            "succeeded",
            "success",
            "done",
            "finished",
        ]
        .iter()
        .any(|m| s.contains(m))
    };

    if statuses.iter().any(|s| is_failed(s)) {
        JobPhase::Failed
    } else if statuses.iter().all(|s| is_done(s)) {
        JobPhase::Done
    } else {
        JobPhase::Running
    }
}

/// Next polling interval in seconds as reported by the server — defaults to 3
pub fn poll_after_seconds(v: &Value) -> u64 {
    v.get("poll_after_seconds")
        .and_then(|x| x.as_u64())
        .unwrap_or(3)
        .clamp(1, 30)
}

/// Extract the failure reason — searches the top level and the `generation` object
pub fn failure_message(v: &Value) -> String {
    fn from(x: &Value) -> Option<String> {
        for key in [
            "error",
            "message",
            "failure_reason",
            "failureReason",
            "reason",
        ] {
            match x.get(key) {
                Some(Value::String(s)) if !s.is_empty() => return Some(s.clone()),
                Some(Value::Object(o)) => {
                    if let Some(Value::String(s)) = o.get("message") {
                        if !s.is_empty() {
                            return Some(s.clone());
                        }
                    }
                }
                _ => {}
            }
        }
        None
    }
    from(v)
        .or_else(|| v.get("generation").and_then(from))
        .or_else(|| {
            v.get("generation")
                .and_then(|g| g.get("status"))
                .and_then(|s| s.as_str())
                .map(|s| format!("Generation failed: {s}"))
        })
        .unwrap_or_else(|| "Generation failed".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn extract_job_ids_magnific_creations() {
        // Magnific: creation-identifier family of keys
        assert_eq!(
            extract_job_ids(&json!({"creationIdentifier": "cr-1"})),
            vec!["cr-1"]
        );
        assert_eq!(
            extract_job_ids(
                &json!({"creations": [{"identifier": "cr-a"}, {"identifier": "cr-b"}]})
            ),
            vec!["cr-a", "cr-b"]
        );
    }

    #[test]
    fn extract_job_ids_various_shapes() {
        assert_eq!(extract_job_ids(&json!({"job_id": "j1"})), vec!["j1"]);
        assert_eq!(
            extract_job_ids(&json!({"jobs": [{"id": "a"}, {"job_id": "b"}]})),
            vec!["a", "b"]
        );
        assert_eq!(
            extract_job_ids(&json!({"job_ids": ["x", "y"]})),
            vec!["x", "y"]
        );
        assert!(extract_job_ids(&json!({"foo": 1})).is_empty());
    }

    #[test]
    fn extract_job_ids_kling_generation_id() {
        assert_eq!(
            extract_job_ids(&json!({"generation_id": "g-1"})),
            vec!["g-1"]
        );
        assert_eq!(
            extract_job_ids(&json!({"generationId": "g-2"})),
            vec!["g-2"]
        );
    }

    #[test]
    fn extract_urls_walks_nested() {
        let v = json!({"results": [{"url": "https://a/img.png"}], "nested": {"video": "https://b/v.mp4"}, "n": 1});
        let urls = extract_urls(&v);
        assert!(urls.contains(&"https://a/img.png".to_string()));
        assert!(urls.contains(&"https://b/v.mp4".to_string()));
    }

    #[test]
    fn classify_status_terminal_detection() {
        assert_eq!(
            classify_status(&json!({"status": "completed"})),
            JobPhase::Done
        );
        assert_eq!(
            classify_status(&json!({"state": "SUCCESS"})),
            JobPhase::Done
        );
        assert_eq!(
            classify_status(&json!({"status": "failed"})),
            JobPhase::Failed
        );
        assert_eq!(
            classify_status(&json!({"status": "queued"})),
            JobPhase::Running
        );
        assert_eq!(classify_status(&json!({})), JobPhase::Running);
    }

    #[test]
    fn classify_status_nested_generation() {
        // Real job_status response shape
        assert_eq!(
            classify_status(
                &json!({"generation": {"status": "completed"}, "poll_after_seconds": 3})
            ),
            JobPhase::Done
        );
        assert_eq!(
            classify_status(&json!({"generation": {"status": "in_progress"}})),
            JobPhase::Running
        );
        assert_eq!(
            classify_status(&json!({"generation": {"status": "nsfw"}})),
            JobPhase::Failed
        );
        // Submit response shape — pending in an array item means Running
        assert_eq!(
            classify_status(&json!({"results": [{"id": "a", "status": "pending"}]})),
            JobPhase::Running
        );
        // Distinguish ip_detect (in progress) from ip_detected (failed)
        assert_eq!(
            classify_status(&json!({"generation": {"status": "ip_detect"}})),
            JobPhase::Running
        );
        assert_eq!(
            classify_status(&json!({"generation": {"status": "ip_detected"}})),
            JobPhase::Failed
        );
    }

    #[test]
    fn extract_urls_prefers_raw() {
        let v = json!({"generation": {"results": {
            "minUrl": "https://cdn/x-min.jpg",
            "rawUrl": "https://cdn/x-raw.jpg",
            "thumbnailUrl": "https://cdn/x-thumb.jpg"
        }}});
        assert_eq!(extract_urls(&v)[0], "https://cdn/x-raw.jpg");
    }

    #[test]
    fn failure_message_nested() {
        assert_eq!(
            failure_message(&json!({"generation": {"status": "failed", "error": "bad prompt"}})),
            "bad prompt"
        );
        assert_eq!(
            failure_message(&json!({"error": {"message": "no credits"}})),
            "no credits"
        );
        // Magnific creation_status shape as verified against the live server (camelCase)
        assert_eq!(
            failure_message(
                &json!({"creationIdentifier": "c", "status": "failed", "failureReason": "NSFW: Content detected"})
            ),
            "NSFW: Content detected"
        );
        assert_eq!(
            failure_message(&json!({"generation": {"status": "nsfw"}})),
            "Generation failed: nsfw"
        );
    }

    #[test]
    fn poll_after_defaults_and_clamps() {
        assert_eq!(poll_after_seconds(&json!({})), 3);
        assert_eq!(poll_after_seconds(&json!({"poll_after_seconds": 10})), 10);
        assert_eq!(poll_after_seconds(&json!({"poll_after_seconds": 500})), 30);
    }
}
