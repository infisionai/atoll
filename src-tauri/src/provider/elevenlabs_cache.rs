//! Atomic local media persistence for native ElevenLabs results.

use std::path::{Path, PathBuf};

pub fn write_audio_bytes_atomic(
    directory: &Path,
    job_id: &str,
    bytes: &[u8],
    extension: &str,
) -> Result<PathBuf, String> {
    std::fs::create_dir_all(directory)
        .map_err(|error| format!("eleven-cache: unable to create media cache: {error}"))?;
    let safe_id: String = job_id
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || *character == '-' || *character == '_'
        })
        .take(64)
        .collect();
    if safe_id.is_empty() {
        return Err("eleven-cache: invalid job id".into());
    }
    let extension = if extension.is_empty() {
        "bin"
    } else {
        extension
    };
    let destination = directory.join(format!("{safe_id}.{extension}"));
    let temporary = directory.join(format!(".{safe_id}.{extension}.tmp"));
    let _ = std::fs::remove_file(&temporary);
    let result = (|| -> Result<(), String> {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| format!("eleven-cache: unable to create temporary result: {error}"))?;
        use std::io::Write;
        file.write_all(bytes)
            .and_then(|_| file.sync_all())
            .map_err(|error| format!("eleven-cache: unable to write result: {error}"))?;
        drop(file);
        std::fs::rename(&temporary, &destination)
            .map_err(|error| format!("eleven-cache: unable to commit result: {error}"))
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result.map(|_| destination)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_audio_to_a_temp_file_then_atomic_destination() {
        let directory =
            std::env::temp_dir().join(format!("atoll-elevenlabs-cache-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&directory);
        let path = write_audio_bytes_atomic(&directory, "job-1", b"audio", "ogg").unwrap();
        assert_eq!(
            path.extension().and_then(|value| value.to_str()),
            Some("ogg")
        );
        assert_eq!(std::fs::read(&path).unwrap(), b"audio");
        assert!(!directory.join(".job-1.ogg.tmp").exists());
        let _ = std::fs::remove_dir_all(directory);
    }
}
