//! Tauri IPC commands — thin adapters. The logic lives in store.rs.
//! One-to-one with the frontend `src/ipc/commands.ts`. If you change one side, always change both.

use crate::provider::connection::ProviderStatusDto;
use crate::provider::Providers;
use crate::store::{GraphDoc, SqliteStore, WorkspaceMeta};
use rand::RngCore;
use std::sync::Arc;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

pub struct AppState(pub Mutex<SqliteStore>);
pub struct ProviderState(pub Providers);

#[tauri::command]
pub fn list_workspaces(state: State<AppState>) -> Result<Vec<WorkspaceMeta>, String> {
    state.0.lock().unwrap().list()
}

#[tauri::command]
pub fn create_workspace(state: State<AppState>, name: String) -> Result<WorkspaceMeta, String> {
    state.0.lock().unwrap().create(&name)
}

#[tauri::command]
pub fn rename_workspace(state: State<AppState>, id: String, name: String) -> Result<(), String> {
    state.0.lock().unwrap().rename(&id, &name)
}

#[tauri::command]
pub fn duplicate_workspace(state: State<AppState>, id: String) -> Result<WorkspaceMeta, String> {
    state.0.lock().unwrap().duplicate(&id)
}

#[tauri::command]
pub fn delete_workspace(state: State<AppState>, id: String) -> Result<(), String> {
    state.0.lock().unwrap().delete(&id)
}

#[tauri::command]
pub fn load_graph(state: State<AppState>, workspace_id: String) -> Result<GraphDoc, String> {
    state.0.lock().unwrap().load_graph(&workspace_id)
}

#[tauri::command]
pub fn save_graph(
    state: State<AppState>,
    workspace_id: String,
    graph: GraphDoc,
) -> Result<(), String> {
    state.0.lock().unwrap().save_graph(&workspace_id, &graph)
}

// ── Generation execution / job tracking ──

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JobUpdate {
    pub job_id: String,
    pub node_id: String,
    pub workspace_id: String,
    /// running | done | failed
    pub status: String,
    pub urls: Vec<String>,
    /// Local cache file path — when present, the frontend uses it instead of the remote URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub local_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// Submit a generation — calls the provider-specific submit tool, then starts job tracking
#[tauri::command]
pub async fn submit_generation(
    app: AppHandle,
    prov: State<'_, ProviderState>,
    store: State<'_, AppState>,
    workspace_id: String,
    node_id: String,
    kind: String,
    params: serde_json::Value,
    provider: Option<String>,
) -> Result<serde_json::Value, String> {
    if !matches!(kind.as_str(), "image" | "video" | "audio" | "3d") {
        return Err(format!("Unsupported generation kind: {kind}"));
    }
    let provider_id = provider.unwrap_or_else(|| Providers::DEFAULT_ID.into());
    let p = prov.0.by_id(&provider_id)?;
    let mut params = params;
    enrich_media_urls(&store, &mut params);
    p.prepare_params(&mut params).await?;

    if p.is_native() {
        if kind != "audio" {
            return Err("eleven-validation: ElevenLabs generation kind must be audio".into());
        }
        let job_id = uuid_v7();
        let payload = serde_json::json!({
            "provider": provider_id,
            "model": params.get("model"),
            "status": "running",
        });
        {
            let s = store.0.lock().unwrap();
            s.insert_job(
                &job_id,
                &workspace_id,
                &node_id,
                "running",
                &payload.to_string(),
                &provider_id,
            )?;
        }
        emit_job(
            &app,
            &job_id,
            &workspace_id,
            &node_id,
            "running",
            vec![],
            None,
            None,
        );
        spawn_native_generation(
            app.clone(),
            Arc::clone(p),
            job_id.clone(),
            workspace_id,
            node_id,
            params,
        );
        return Ok(serde_json::json!({ "jobIds": [job_id] }));
    }

    let (tool, args) = p.submit_call(&kind, &params)?;
    let payload = p.submit_tool_call(&tool, args).await?;

    let job_ids = crate::provider::jobs::extract_job_ids(&payload);
    if job_ids.is_empty() {
        return Err(format!("No job id found in the submit response: {payload}"));
    }

    {
        let s = store.0.lock().unwrap();
        for id in &job_ids {
            let _ = s.insert_job(id, &workspace_id, &node_id, "running", &payload.to_string(), &provider_id);
        }
    }

    for id in &job_ids {
        spawn_job_poll(app.clone(), id.clone(), workspace_id.clone(), node_id.clone(), provider_id.clone());
    }

    Ok(serde_json::json!({ "jobIds": job_ids }))
}

/// Pre-run estimate — a get_cost:true preflight against the submit tool (no job submitted, no credits spent)
#[tauri::command]
pub async fn estimate_cost(
    prov: State<'_, ProviderState>,
    store: State<'_, AppState>,
    kind: String,
    params: serde_json::Value,
    provider: Option<String>,
) -> Result<f64, String> {
    if !matches!(kind.as_str(), "image" | "video" | "audio" | "3d") {
        return Err(format!("Unsupported generation kind: {kind}"));
    }
    let provider_id = provider.unwrap_or_else(|| Providers::DEFAULT_ID.into());
    let p = prov.0.by_id(&provider_id)?;
    let mut params = params;
    enrich_media_urls(&store, &mut params);
    p.prepare_params(&mut params).await?;
    if p.is_native() {
        let _ = p.estimate_call(&kind, &params)?;
        return crate::provider::elevenlabs_cost::estimate(&kind, &params);
    }
    let (tool, args) = p.estimate_call(&kind, &params)?;
    let payload = p.poll_tool_call(&tool, args).await?;
    // higgsfield: cost.credits / magnific (simulate_cost): response keys vary, so fall back to the shared extractor
    payload
        .pointer("/cost/credits")
        .and_then(|v| v.as_f64())
        .or_else(|| crate::provider::connection::extract_credits(&payload))
        .ok_or_else(|| format!("No credits found in the estimate response: {payload}"))
}

/// Enrich upstream references — looks up the result's remote URL and originating provider
/// for medias[].value (a job id) from the stored job row and attaches them.
/// Provider converters use this to distinguish same- vs cross-provider inputs
fn enrich_media_urls(store: &State<'_, AppState>, params: &mut serde_json::Value) {
    let Some(medias) = params.get_mut("medias").and_then(|v| v.as_array_mut()) else {
        return;
    };
    let s = store.0.lock().unwrap();
    for m in medias {
        let Some(job_id) = m.get("value").and_then(|v| v.as_str()) else { continue };
        let Ok((payload, _, provider)) = s.jobs_for_workspace_by_job(job_id) else { continue };
        let v: serde_json::Value = serde_json::from_str(&payload).unwrap_or_default();
        if let Some(url) = crate::provider::jobs::extract_urls(&v)
            .into_iter()
            .find(|u| u.starts_with("https://"))
        {
            m["url"] = serde_json::json!(url);
        }
        m["provider"] = serde_json::json!(provider);
    }
}

/// Job status list for a workspace — reconciles pushes missed while the canvas was loading
#[tauri::command]
pub fn list_jobs(state: State<AppState>, workspace_id: String) -> Result<Vec<JobUpdate>, String> {
    use crate::provider::jobs::{extract_urls, failure_message};
    let rows = state.0.lock().unwrap().jobs_for_workspace(&workspace_id)?;
    Ok(rows
        .into_iter()
        .map(|(job_id, node_id, status, payload, media_path)| {
            let v: serde_json::Value = serde_json::from_str(&payload).unwrap_or_default();
            JobUpdate {
                job_id,
                node_id,
                workspace_id: workspace_id.clone(),
                urls: if status == "done" { extract_urls(&v) } else { vec![] },
                local_path: media_path,
                message: (status == "failed").then(|| failure_message(&v)),
                status,
            }
        })
        .collect())
}

/// Cancel a job — providers have no cancel API, so this only stops local tracking.
/// A generation already submitted keeps running on the server and may still consume credits.
#[tauri::command]
pub fn cancel_job(state: State<AppState>, job_id: String) -> Result<(), String> {
    state.0.lock().unwrap().set_job_status(&job_id, "canceled")
}

/// Status polling worker — pushes status until completion and records it in the DB (30 minutes max).
/// Routes the status tool and balance refresh by provider_id
pub fn spawn_job_poll(
    app: AppHandle,
    job_id: String,
    workspace_id: String,
    node_id: String,
    provider_id: String,
) {
    if provider_id == crate::provider::elevenlabs::PROVIDER_ID {
        log::error!("ElevenLabs jobs are synchronous and must not start a poll worker: {job_id}");
        return;
    }
    tauri::async_runtime::spawn(async move {
        use crate::provider::jobs::{classify_status, extract_urls, failure_message, poll_after_seconds, JobPhase};
        let started = std::time::Instant::now();

        loop {
            if started.elapsed().as_secs() > 30 * 60 {
                emit_job(&app, &job_id, &workspace_id, &node_id, "failed", vec![], None, Some("Tracking timed out (30 minutes)".into()));
                break;
            }

            // Local cancellation check — if something else (cancel_job) already closed it, end quietly
            if let Some(state) = app.try_state::<AppState>() {
                let status = state.0.lock().unwrap().job_status_of(&job_id);
                if !matches!(status, Ok(Some(ref s)) if s == "running") {
                    break;
                }
            }

            let prov = app.state::<ProviderState>();
            let p = match prov.0.by_id(&provider_id) {
                Ok(p) => p.clone(),
                Err(e) => {
                    emit_job(&app, &job_id, &workspace_id, &node_id, "failed", vec![], None, Some(e));
                    break;
                }
            };
            let (tool, args) = match p.status_call(&job_id) {
                Ok(call) => call,
                Err(error) => {
                    update_job_row(
                        &app,
                        &job_id,
                        "failed",
                        &serde_json::json!({"error": error}),
                    );
                    emit_job(
                        &app,
                        &job_id,
                        &workspace_id,
                        &node_id,
                        "failed",
                        vec![],
                        None,
                        Some(error),
                    );
                    break;
                }
            };
            let result = p.poll_tool_call(tool, args).await;

            match result {
                Ok(payload) => match classify_status(&payload) {
                    JobPhase::Done => {
                        let urls = extract_urls(&payload);
                        update_job_row(&app, &job_id, "done", &payload);
                        // Cache the result media locally — even if this fails, the remote URL still works
                        let local = match urls.first() {
                            Some(url) => download_media(&app, &job_id, url).await,
                            None => None,
                        };
                        if let (Some(path), Some(state)) = (&local, app.try_state::<AppState>()) {
                            let _ = state.0.lock().unwrap().set_job_media(&job_id, path);
                        }
                        emit_job(&app, &job_id, &workspace_id, &node_id, "done", urls, local, None);
                        // Credits were deducted — refetch the balance and push (balance refreshes on job completion)
                        if p.refresh_balance().await.is_ok() {
                            let _ = app.emit("provider/balance-changed", p.status().await);
                        }
                        break;
                    }
                    JobPhase::Failed => {
                        let msg = failure_message(&payload);
                        update_job_row(&app, &job_id, "failed", &payload);
                        emit_job(&app, &job_id, &workspace_id, &node_id, "failed", vec![], None, Some(msg));
                        if p.refresh_balance().await.is_ok() {
                            let _ = app.emit("provider/balance-changed", p.status().await);
                        }
                        break;
                    }
                    JobPhase::Running => {
                        let wait = poll_after_seconds(&payload);
                        tokio::time::sleep(std::time::Duration::from_secs(wait)).await;
                    }
                },
                Err(e) => {
                    // Transient error — retry shortly (permanent errors like expired connections also land here, but the 30-minute cap applies)
                    log::warn!("job_status failed ({job_id}): {e}");
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                }
            }
        }
    });
}

fn spawn_native_generation(
    app: AppHandle,
    provider: Arc<crate::provider::Provider>,
    job_id: String,
    workspace_id: String,
    node_id: String,
    params: serde_json::Value,
) {
    tauri::async_runtime::spawn(async move {
        match provider.generate_audio("audio", &params).await {
            Ok(result) => {
                match write_native_media(&app, &job_id, &result.bytes, result.extension) {
                    Ok(path) => {
                        let payload = serde_json::json!({
                            "provider": crate::provider::elevenlabs::PROVIDER_ID,
                            "result": "local",
                            "output_format": params.get("output_format"),
                        });
                        update_job_row(&app, &job_id, "done", &payload);
                        let media_recorded = app
                            .try_state::<AppState>()
                            .map(|state| {
                                state
                                    .0
                                    .lock()
                                    .unwrap()
                                    .set_job_media(&job_id, &path)
                                    .is_ok()
                            })
                            .unwrap_or(false);
                        if !media_recorded {
                            finish_native_failure(
                                &app,
                                &job_id,
                                &workspace_id,
                                &node_id,
                                "eleven-cache: unable to record the local result path".into(),
                            );
                            spawn_native_balance_refresh(&app, Arc::clone(&provider));
                            return;
                        }
                        emit_job(
                            &app,
                            &job_id,
                            &workspace_id,
                            &node_id,
                            "done",
                            vec![],
                            Some(path),
                            None,
                        );
                        spawn_native_balance_refresh(&app, Arc::clone(&provider));
                    }
                    Err(error) => {
                        finish_native_failure(
                            &app,
                            &job_id,
                            &workspace_id,
                            &node_id,
                            error,
                        );
                        spawn_native_balance_refresh(&app, Arc::clone(&provider));
                    }
                }
            }
            Err(error) => {
                finish_native_failure(&app, &job_id, &workspace_id, &node_id, error);
                spawn_native_balance_refresh(&app, Arc::clone(&provider));
            }
        }
    });
}

fn spawn_native_balance_refresh(app: &AppHandle, provider: Arc<crate::provider::Provider>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if provider.refresh_balance().await.is_ok() {
            let _ = app.emit("provider/balance-changed", provider.status().await);
        }
    });
}

fn finish_native_failure(
    app: &AppHandle,
    job_id: &str,
    workspace_id: &str,
    node_id: &str,
    error: String,
) {
    let message = if error.starts_with("eleven-cache:") {
        format!(
            "{error}; audio was generated but could not be saved; credits were likely already spent"
        )
    } else {
        error
    };
    update_job_row(
        app,
        job_id,
        "failed",
        &serde_json::json!({"error": message.clone()}),
    );
    emit_job(
        app,
        job_id,
        workspace_id,
        node_id,
        "failed",
        vec![],
        None,
        Some(message),
    );
}

fn write_native_media(
    app: &AppHandle,
    job_id: &str,
    bytes: &[u8],
    extension: &str,
) -> Result<String, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("eleven-cache: unable to locate media cache: {error}"))?
        .join("media");
    crate::provider::elevenlabs_cache::write_audio_bytes_atomic(&directory, job_id, bytes, extension)
        .map(|path| path.to_string_lossy().into_owned())
}

/// Resolve an ElevenLabs running row after restart. Native generation has no remote job id to poll.
pub fn fail_lost_native_job(app: &AppHandle, job_id: &str, workspace_id: &str, node_id: &str) {
    let message = "Generation result lost because the app closed — run again";
    update_job_row(
        app,
        job_id,
        "failed",
        &serde_json::json!({"error": message}),
    );
    emit_job(
        app,
        job_id,
        workspace_id,
        node_id,
        "failed",
        vec![],
        None,
        Some(message.into()),
    );
}

fn uuid_v7() -> String {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default();
    let mut bytes = [0_u8; 16];
    for (index, byte) in bytes[..6].iter_mut().enumerate() {
        *byte = (timestamp >> (40 - index * 8)) as u8;
    }
    rand::thread_rng().fill_bytes(&mut bytes[6..]);
    bytes[6] = (bytes[6] & 0x0f) | 0x70;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
        bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    )
}

/// Download the result media into the app data `media/` folder — returns the local path on success
async fn download_media(app: &AppHandle, job_id: &str, url: &str) -> Option<String> {
    let dir = app.path().app_data_dir().ok()?.join("media");
    std::fs::create_dir_all(&dir).ok()?;

    // The job id comes from an external server response — sanitize before it
    // becomes a filename (path traversal defense)
    let safe_id: String = job_id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(64)
        .collect();
    if safe_id.is_empty() {
        return None;
    }

    // Extract the extension from the URL path (query string stripped)
    let ext = url
        .split('?')
        .next()
        .and_then(|p| p.rsplit('.').next())
        .filter(|e| e.len() <= 5 && e.chars().all(|c| c.is_ascii_alphanumeric()))
        .unwrap_or("bin");
    let path = dir.join(format!("{safe_id}.{ext}"));

    let mut resp = reqwest::get(url).await.ok()?;
    if !resp.status().is_success() {
        log::warn!("Media download failed ({safe_id}): HTTP {}", resp.status());
        return None;
    }
    // Size cap — stream to disk in chunks so a huge (or malicious) response
    // can't exhaust memory or the disk
    const MAX_MEDIA_BYTES: u64 = 512 * 1024 * 1024;
    if resp.content_length().is_some_and(|len| len > MAX_MEDIA_BYTES) {
        log::warn!("Media too large ({safe_id}): {:?} bytes", resp.content_length());
        return None;
    }
    let mut file = std::fs::File::create(&path).ok()?;
    let mut written: u64 = 0;
    while let Ok(Some(chunk)) = resp.chunk().await {
        written += chunk.len() as u64;
        if written > MAX_MEDIA_BYTES {
            log::warn!("Media exceeded the size cap ({safe_id}) — aborting download");
            drop(file);
            let _ = std::fs::remove_file(&path);
            return None;
        }
        use std::io::Write;
        if file.write_all(&chunk).is_err() {
            let _ = std::fs::remove_file(&path);
            return None;
        }
    }
    Some(path.to_string_lossy().into_owned())
}

fn update_job_row(app: &AppHandle, job_id: &str, status: &str, payload: &serde_json::Value) {
    if let Some(state) = app.try_state::<AppState>() {
        let _ = state.0.lock().unwrap().update_job(job_id, status, &payload.to_string());
    }
}

#[allow(clippy::too_many_arguments)]
fn emit_job(
    app: &AppHandle,
    job_id: &str,
    workspace_id: &str,
    node_id: &str,
    status: &str,
    urls: Vec<String>,
    local_path: Option<String>,
    message: Option<String>,
) {
    let _ = app.emit(
        "job/updated",
        JobUpdate {
            job_id: job_id.into(),
            node_id: node_id.into(),
            workspace_id: workspace_id.into(),
            status: status.into(),
            urls,
            local_path,
            message,
        },
    );
}

// ── Provider connections ──

#[tauri::command]
pub async fn list_providers(
    state: State<'_, ProviderState>,
) -> Result<Vec<ProviderStatusDto>, String> {
    let mut out = Vec::with_capacity(state.0 .0.len());
    for p in &state.0 .0 {
        out.push(p.status().await);
    }
    Ok(out)
}

#[tauri::command]
pub async fn connect_provider(
    app: AppHandle,
    state: State<'_, ProviderState>,
    id: String,
) -> Result<ProviderStatusDto, String> {
    let p = state.0.by_id(&id)?;
    let result = p.connect().await;
    let status = p.status().await;
    let _ = app.emit("provider/status-changed", status.clone());
    result?;
    p.invalidate_catalog().await;
    Ok(status)
}

#[tauri::command]
pub async fn set_provider_api_key(
    app: AppHandle,
    state: State<'_, ProviderState>,
    provider_id: String,
    api_key: String,
) -> Result<ProviderStatusDto, String> {
    let provider = state.0.by_id(&provider_id)?;
    let status = provider.set_api_key(&api_key).await?;
    let _ = app.emit("provider/status-changed", status.clone());
    Ok(status)
}

#[tauri::command]
pub async fn disconnect_provider(
    app: AppHandle,
    state: State<'_, ProviderState>,
    id: String,
) -> Result<(), String> {
    let p = state.0.by_id(&id)?;
    p.disconnect().await?;
    p.invalidate_catalog().await;
    let _ = app.emit("provider/status-changed", p.status().await);
    Ok(())
}

#[tauri::command]
pub async fn get_catalog(
    state: State<'_, ProviderState>,
    id: String,
    refresh: Option<bool>,
) -> Result<serde_json::Value, String> {
    state.0.by_id(&id)?.catalog(refresh.unwrap_or(false)).await
}

/// Video presets — a Higgsfield-only concept, so no id parameter
#[tauri::command]
pub async fn get_presets(
    state: State<'_, ProviderState>,
    refresh: Option<bool>,
) -> Result<serde_json::Value, String> {
    match state.0.by_id(Providers::DEFAULT_ID)?.as_ref() {
        crate::provider::Provider::Higgsfield(h) => h.presets(refresh.unwrap_or(false)).await,
        _ => Err("Presets are Higgsfield-only".into()),
    }
}

#[tauri::command]
pub async fn refresh_balance(
    app: AppHandle,
    state: State<'_, ProviderState>,
    id: String,
) -> Result<f64, String> {
    let p = state.0.by_id(&id)?;
    let balance = p.refresh_balance().await?;
    let _ = app.emit("provider/balance-changed", p.status().await);
    Ok(balance)
}
