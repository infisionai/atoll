//! Local-only provider flow coverage for the automatable E5 checks.

use super::elevenlabs::ElevenLabs;
use super::elevenlabs_cache::write_audio_bytes_atomic;
use super::elevenlabs_catalog::DEFAULT_VOICE_ID;
use super::elevenlabs_cost;
use crate::store::SqliteStore;
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

struct FakeResponse {
    status: u16,
    content_type: &'static str,
    body: Vec<u8>,
    hold_connection: bool,
}

impl FakeResponse {
    fn json(status: u16, body: &str) -> Self {
        Self {
            status,
            content_type: "application/json",
            body: body.as_bytes().to_vec(),
            hold_connection: false,
        }
    }

    fn audio(body: &[u8]) -> Self {
        Self {
            status: 200,
            content_type: "audio/mpeg",
            body: body.to_vec(),
            hold_connection: false,
        }
    }

    fn timeout() -> Self {
        Self {
            status: 200,
            content_type: "audio/mpeg",
            body: Vec::new(),
            hold_connection: true,
        }
    }
}

struct FakeHttpServer {
    base_url: String,
    request_count: Arc<AtomicUsize>,
    generation_count: Arc<AtomicUsize>,
    paths: Arc<Mutex<Vec<String>>>,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl FakeHttpServer {
    fn new(responses: Vec<FakeResponse>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let address = listener.local_addr().unwrap();
        let responses = Arc::new(Mutex::new(responses.into_iter().collect::<VecDeque<_>>()));
        let request_count = Arc::new(AtomicUsize::new(0));
        let generation_count = Arc::new(AtomicUsize::new(0));
        let paths = Arc::new(Mutex::new(Vec::new()));
        let stop = Arc::new(AtomicBool::new(false));
        let thread_responses = Arc::clone(&responses);
        let thread_requests = Arc::clone(&request_count);
        let thread_generations = Arc::clone(&generation_count);
        let thread_paths = Arc::clone(&paths);
        let thread_stop = Arc::clone(&stop);
        let thread = std::thread::spawn(move || {
            let mut workers = Vec::new();
            while !thread_stop.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        let responses = Arc::clone(&thread_responses);
                        let requests = Arc::clone(&thread_requests);
                        let generations = Arc::clone(&thread_generations);
                        let paths = Arc::clone(&thread_paths);
                        let stop = Arc::clone(&thread_stop);
                        workers.push(std::thread::spawn(move || {
                            serve_fake_connection(
                                stream,
                                responses,
                                requests,
                                generations,
                                paths,
                                stop,
                            );
                        }));
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(1));
                    }
                    Err(error) => {
                        if error.kind() != std::io::ErrorKind::Interrupted {
                            std::thread::sleep(Duration::from_millis(1));
                        }
                    }
                }
            }
            for worker in workers {
                worker.join().unwrap();
            }
        });
        Self {
            base_url: format!("http://{address}"),
            request_count,
            generation_count,
            paths,
            stop,
            thread: Some(thread),
        }
    }

    fn requests(&self) -> usize {
        self.request_count.load(Ordering::Relaxed)
    }

    fn generations(&self) -> usize {
        self.generation_count.load(Ordering::Relaxed)
    }

    fn paths(&self) -> Vec<String> {
        self.paths.lock().unwrap().clone()
    }
}

fn serve_fake_connection(
    mut stream: TcpStream,
    responses: Arc<Mutex<VecDeque<FakeResponse>>>,
    requests: Arc<AtomicUsize>,
    generations: Arc<AtomicUsize>,
    paths: Arc<Mutex<Vec<String>>>,
    stop: Arc<AtomicBool>,
) {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
    let mut request = Vec::with_capacity(8192);
    let mut chunk = [0u8; 1024];
    let header_end = loop {
        if let Some(position) = request.windows(4).position(|window| window == b"\r\n\r\n") {
            break Some(position + 4);
        }
        if request.len() >= 8192 {
            break None;
        }
        match stream.read(&mut chunk) {
            Ok(0) => break None,
            Ok(size) => {
                request.extend_from_slice(&chunk[..size]);
            }
            Err(error)
                if error.kind() == std::io::ErrorKind::TimedOut
                    || error.kind() == std::io::ErrorKind::WouldBlock =>
            {
                break None;
            }
            Err(_) => break None,
        }
    };
    let Some(header_end) = header_end else {
        return;
    };
    let content_length = String::from_utf8_lossy(&request[..header_end])
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().ok())
        })
        .flatten()
        .unwrap_or(0);
    let chunked = String::from_utf8_lossy(&request[..header_end])
        .lines()
        .any(|line| {
            let Some((name, value)) = line.split_once(':') else {
                return false;
            };
            name.eq_ignore_ascii_case("transfer-encoding")
                && value
                    .split(',')
                    .any(|encoding| encoding.trim().eq_ignore_ascii_case("chunked"))
        });
    let request_length = header_end.saturating_add(content_length);
    while (chunked && !chunked_body_complete(&request, header_end))
        || (!chunked && request.len() < request_length)
    {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(size) => request.extend_from_slice(&chunk[..size]),
            Err(error)
                if error.kind() == std::io::ErrorKind::TimedOut
                    || error.kind() == std::io::ErrorKind::WouldBlock =>
            {
                break;
            }
            Err(_) => break,
        }
    }
    if (!chunked && request.len() < request_length)
        || (chunked && !chunked_body_complete(&request, header_end))
    {
        return;
    }

    let first_line = String::from_utf8_lossy(&request)
        .lines()
        .next()
        .unwrap_or_default()
        .to_string();
    let path = first_line.split_whitespace().nth(1).unwrap_or_default();
    let path_without_query = path.split('?').next().unwrap_or(path);
    paths.lock().unwrap().push(path_without_query.to_string());
    requests.fetch_add(1, Ordering::Relaxed);
    if path_without_query.starts_with("/v1/text-to-speech/")
        || path_without_query == "/v1/music"
        || path_without_query == "/v1/sound-generation"
    {
        generations.fetch_add(1, Ordering::Relaxed);
    }

    let response = responses.lock().unwrap().pop_front();
    let Some(response) = response else {
        return;
    };
    if response.hold_connection {
        for _ in 0..200 {
            if stop.load(Ordering::Relaxed) {
                break;
            }
            std::thread::sleep(Duration::from_millis(1));
        }
        return;
    }
    let reason = if response.status < 400 { "OK" } else { "Error" };
    let _ = write!(
        stream,
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        response.status,
        reason,
        response.content_type,
        response.body.len()
    );
    let _ = stream.write_all(&response.body);
}

fn chunked_body_complete(request: &[u8], body_start: usize) -> bool {
    let mut cursor = body_start;
    loop {
        let Some(relative_end) = request[cursor..]
            .windows(2)
            .position(|window| window == b"\r\n")
        else {
            return false;
        };
        let line_end = cursor + relative_end;
        let size = String::from_utf8_lossy(&request[cursor..line_end])
            .split(';')
            .next()
            .and_then(|value| usize::from_str_radix(value.trim(), 16).ok());
        let Some(size) = size else {
            return false;
        };
        cursor = line_end + 2;
        if size == 0 {
            return request.len() >= cursor + 2;
        }
        let data_end = cursor.saturating_add(size);
        if request.len() < data_end + 2 || &request[data_end..data_end + 2] != b"\r\n" {
            return false;
        }
        cursor = data_end + 2;
    }
}

impl Drop for FakeHttpServer {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(thread) = self.thread.take() {
            thread.join().unwrap();
        }
    }
}

fn subscription_body() -> &'static str {
    include_str!("fixtures/eleven-subscription.min.json")
}

fn voices_body() -> &'static str {
    include_str!("fixtures/eleven-voices.min.json")
}

fn temp_dir(label: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "atoll-elevenlabs-integration-{label}-{}",
        std::process::id()
    ))
}

fn success_responses() -> Vec<FakeResponse> {
    let mut responses = vec![
        FakeResponse::json(200, subscription_body()),
        FakeResponse::json(200, subscription_body()),
        FakeResponse::json(200, voices_body()),
    ];
    for _ in 0..3 {
        responses.push(FakeResponse::audio(b"fake-audio"));
        responses.push(FakeResponse::json(200, subscription_body()));
    }
    responses
}

fn generation_params() -> [(String, Value); 3] {
    [
        (
            "tts".into(),
            json!({
                "model": "elevenlabs/tts/eleven_multilingual_v2",
                "text": "Hello from the local fake server",
                "voice_id": DEFAULT_VOICE_ID
            }),
        ),
        (
            "music".into(),
            json!({
                "model": "elevenlabs/music/music_v2",
                "prompt": "A calm instrumental loop",
                "music_length_ms": 3_000
            }),
        ),
        (
            "sfx".into(),
            json!({
                "model": "elevenlabs/sfx/eleven_text_to_sound_v2",
                "text": "A soft rain shower",
                "duration_seconds": 0.5
            }),
        ),
    ]
}

#[tokio::test]
async fn mock_end_to_end_flow_validates_reads_catalog_generates_saves_and_persists_done() {
    let directory = temp_dir("success");
    let _ = std::fs::remove_dir_all(&directory);
    let server = FakeHttpServer::new(success_responses());
    let provider = ElevenLabs::with_base_url(directory.clone(), &server.base_url);

    provider.set_api_key("fake-integration-key").await.unwrap();
    assert_eq!(provider.refresh_balance().await.unwrap(), 8_800.0);
    let catalog = provider.catalog(false).await.unwrap();
    assert_eq!(catalog.as_array().unwrap().len(), 6);
    assert_eq!(server.requests(), 3);

    let db_path = directory.join("atoll.db");
    let store = SqliteStore::open(&db_path).unwrap();
    let workspace = store.create("E5 fake workspace").unwrap();

    for (mode, params) in generation_params() {
        let before_estimate = server.requests();
        let estimate = elevenlabs_cost::estimate("audio", &params).unwrap();
        assert!(estimate > 0.0);
        assert_eq!(server.requests(), before_estimate);

        let result = provider.generate("audio", &params).await.unwrap();
        let job_id = format!("job-{mode}");
        let path = write_audio_bytes_atomic(
            &directory.join("media"),
            &job_id,
            &result.bytes,
            result.extension,
        )
        .unwrap();
        store
            .insert_job(
                &job_id,
                &workspace.id,
                &format!("node-{mode}"),
                "running",
                "{}",
                "elevenlabs",
            )
            .unwrap();
        store
            .update_job(&job_id, "done", r#"{"result":"local"}"#)
            .unwrap();
        store
            .set_job_media(&job_id, path.to_str().unwrap())
            .unwrap();
        let rows = store.jobs_for_workspace(&workspace.id).unwrap();
        let row = rows.iter().find(|row| row.0 == job_id).unwrap();
        assert_eq!(row.2, "done");
        assert_eq!(row.4.as_deref(), Some(path.to_str().unwrap()));
        assert_eq!(std::fs::read(&path).unwrap(), b"fake-audio");
        provider.refresh_balance().await.unwrap();
    }

    drop(store);
    let reopened = SqliteStore::open(&directory.join("atoll.db")).unwrap();
    let rows = reopened
        .jobs_for_workspace(&reopened.list().unwrap()[0].id)
        .unwrap();
    assert_eq!(rows.len(), 3);
    assert!(rows.iter().all(|row| row.2 == "done" && row.4.is_some()));
    assert_eq!(server.generations(), 3);
    let _ = std::fs::remove_dir_all(directory);
}

#[tokio::test]
async fn mock_failures_never_retry_and_validation_failures_never_submit() {
    let validation_server =
        FakeHttpServer::new(vec![FakeResponse::json(401, r#"{"detail":"invalid key"}"#)]);
    let validation_dir = temp_dir("validation-401");
    let provider = ElevenLabs::with_base_url(validation_dir.clone(), &validation_server.base_url);
    assert!(provider.set_api_key("fake-invalid-key").await.is_err());
    assert_eq!(validation_server.generations(), 0);
    let _ = std::fs::remove_dir_all(validation_dir);

    let invalid_params_server =
        FakeHttpServer::new(vec![FakeResponse::json(200, subscription_body())]);
    let invalid_dir = temp_dir("validation-fields");
    let invalid_provider =
        ElevenLabs::with_base_url(invalid_dir.clone(), &invalid_params_server.base_url);
    invalid_provider
        .set_api_key("fake-validation-key")
        .await
        .unwrap();
    let invalid_error = invalid_provider
        .generate(
            "audio",
            &json!({"model": "elevenlabs/tts/not-a-real-model", "text": "no submit"}),
        )
        .await
        .unwrap_err();
    assert!(
        invalid_error.starts_with("Not an ElevenLabs model ID")
            || invalid_error.starts_with("Unsupported")
    );
    assert_eq!(invalid_params_server.generations(), 0);
    let _ = std::fs::remove_dir_all(invalid_dir);

    for (label, status) in [
        ("401", 401),
        ("402", 402),
        ("422", 422),
        ("429", 429),
        ("500", 500),
    ] {
        let server = FakeHttpServer::new(vec![
            FakeResponse::json(200, subscription_body()),
            FakeResponse::json(status, r#"{"detail":{"message":"fake failure"}}"#),
        ]);
        let directory = temp_dir(&format!("generation-{label}"));
        let provider = ElevenLabs::with_base_url(directory.clone(), &server.base_url);
        provider.set_api_key("fake-generation-key").await.unwrap();
        let generation_error = provider
            .generate(
                "audio",
                &json!({
                    "model": "elevenlabs/sfx/eleven_text_to_sound_v2",
                    "text": "fake failure",
                    "duration_seconds": 0.5
                }),
            )
            .await
            .unwrap_err();
        assert!(
            generation_error.starts_with("eleven-"),
            "status {status} error: {generation_error}"
        );
        assert_eq!(
            server.generations(),
            1,
            "status {status} was not submitted; error={generation_error}; requests={} paths={:?}",
            server.requests(),
            server.paths()
        );
        let _ = std::fs::remove_dir_all(directory);
    }

    let empty_server = FakeHttpServer::new(vec![
        FakeResponse::json(200, subscription_body()),
        FakeResponse::audio(b""),
    ]);
    let empty_dir = temp_dir("generation-empty");
    let empty_provider = ElevenLabs::with_base_url(empty_dir.clone(), &empty_server.base_url);
    empty_provider.set_api_key("fake-empty-key").await.unwrap();
    let empty_error = empty_provider
        .generate(
            "audio",
            &json!({
                "model": "elevenlabs/music/music_v2",
                "prompt": "empty"
            }),
        )
        .await
        .unwrap_err();
    assert!(
        empty_error.starts_with("eleven-result-empty"),
        "empty result error: {empty_error}; requests={} paths={:?}",
        empty_server.requests(),
        empty_server.paths()
    );
    assert_eq!(
        empty_server.generations(),
        1,
        "paths: {:?}",
        empty_server.paths()
    );
    let _ = std::fs::remove_dir_all(empty_dir);

    let timeout_server = FakeHttpServer::new(vec![
        FakeResponse::json(200, subscription_body()),
        FakeResponse::timeout(),
    ]);
    let timeout_dir = temp_dir("generation-timeout");
    let timeout_provider = ElevenLabs::with_base_url_and_timeout(
        timeout_dir.clone(),
        &timeout_server.base_url,
        Duration::from_millis(30),
    );
    timeout_provider
        .set_api_key("fake-timeout-key")
        .await
        .unwrap();
    let timeout_error = timeout_provider
        .generate(
            "audio",
            &json!({
                "model": "elevenlabs/tts/eleven_multilingual_v2",
                "text": "timeout"
            }),
        )
        .await
        .unwrap_err();
    assert!(
        timeout_error.starts_with("eleven-submit-timeout"),
        "timeout error: {timeout_error}"
    );
    assert_eq!(timeout_server.generations(), 1);
    let _ = std::fs::remove_dir_all(timeout_dir);
}
