//! History: recent sessions with their title, last prompt, recent actions and last reply; and the
//! provider list.

use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::core::providers::{home_dir, modified_ms, now_ms, read_session, registry, AgentSession, ProviderStatus};

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionQuery {
    /// Only sessions that ran in this folder.
    #[serde(default)]
    pub project: Option<String>,
    /// Only this provider (`claude`, …).
    #[serde(default)]
    pub provider: Option<String>,
    /// Newest N sessions (default 30, at most 200).
    #[serde(default)]
    pub limit: Option<usize>,
    /// Window for the "active" status, minutes (default 30).
    #[serde(default)]
    pub window_minutes: Option<u64>,
}

/// Sessions, newest first. Files are picked by modification time before any is read, so a long
/// history costs only the sessions shown.
pub fn list(home: &Path, q: &SessionQuery) -> Vec<AgentSession> {
    let now = now_ms();
    let window = q.window_minutes.unwrap_or(30).max(1) * 60_000;
    let limit = q.limit.unwrap_or(30).clamp(1, 200);
    let providers = registry(home);
    let mut files: Vec<(u64, usize, PathBuf)> = Vec::new();
    for (i, p) in providers.iter().enumerate() {
        if q.provider.as_deref().is_some_and(|id| id != p.id()) {
            continue;
        }
        let found = match &q.project {
            Some(dir) => p.sessions_for_project(Path::new(dir)),
            None => p.session_files(),
        };
        files.extend(found.into_iter().map(|f| (modified_ms(&f), i, f)));
    }
    files.sort_by(|a, b| b.0.cmp(&a.0));
    files.truncate(limit);
    files.iter().filter_map(|(_, i, f)| read_session(providers[*i].as_ref(), f, now, window).ok().flatten()).collect()
}

#[tauri::command]
pub async fn list_sessions(query: Option<SessionQuery>) -> Result<Vec<AgentSession>, String> {
    let home = home_dir().ok_or("No home folder")?;
    let q = query.unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || list(&home, &q)).await.map_err(|e| e.to_string())
}

/// One session in full (the History detail view), by transcript path.
#[tauri::command]
pub async fn get_session(path: String) -> Result<AgentSession, String> {
    let home = home_dir().ok_or("No home folder")?;
    tauri::async_runtime::spawn_blocking(move || {
        let p = PathBuf::from(&path);
        for provider in registry(&home) {
            if let Some(s) = read_session(provider.as_ref(), &p, now_ms(), 30 * 60_000).map_err(|e| e.to_string())? {
                return Ok(s);
            }
        }
        Err(format!("No provider can read {path}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn list_providers() -> Result<Vec<ProviderStatus>, String> {
    let home = home_dir().ok_or("No home folder")?;
    tauri::async_runtime::spawn_blocking(move || registry(&home).iter().map(|p| p.detect(now_ms(), 30 * 60_000)).collect()).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::providers::claude::fixtures;

    #[test]
    fn lists_newest_first_with_limit() {
        let home = tempfile::tempdir().unwrap();
        let dir = home.path().join(".claude/projects/D--Game");
        std::fs::create_dir_all(&dir).unwrap();
        for (i, name) in ["old", "mid", "new"].iter().enumerate() {
            let f = dir.join(format!("{name}.jsonl"));
            std::fs::write(&f, fixtures::user(&format!("prompt {name}"), "2026-11-09T06:00:00Z") + "\n").unwrap();
            let t = std::time::SystemTime::now() - std::time::Duration::from_secs(100 - i as u64 * 10);
            std::fs::File::options().write(true).open(&f).unwrap().set_modified(t).unwrap();
        }
        let all = list(home.path(), &SessionQuery::default());
        assert_eq!(all.iter().map(|s| s.last_prompt.as_str()).collect::<Vec<_>>(), ["prompt new", "prompt mid", "prompt old"]);
        let two = list(home.path(), &SessionQuery { project: Some("D:\\Game".into()), limit: Some(2), ..Default::default() });
        assert_eq!(two.len(), 2);
        assert!(list(home.path(), &SessionQuery { provider: Some("codex".into()), ..Default::default() }).is_empty());
    }
}
