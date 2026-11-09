//! Codex CLI (ChatGPT): rollouts at `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` (third-party
//! sources, **kiểm chứng** before reading them — spec P6). Detection only for now.

use std::path::{Path, PathBuf};

use super::{detect_folder, AgentProvider, ProviderStatus, SessionParser};

pub struct CodexProvider {
    root: PathBuf,
}

impl CodexProvider {
    pub fn new(root: PathBuf) -> Self {
        CodexProvider { root }
    }
}

impl AgentProvider for CodexProvider {
    fn id(&self) -> &'static str {
        "codex"
    }
    fn display_name(&self) -> &'static str {
        "Codex CLI (ChatGPT)"
    }
    fn detect(&self, now_ms: u64, window_ms: u64) -> ProviderStatus {
        detect_folder(self.id(), self.display_name(), &self.root, "jsonl", 4, now_ms, window_ms, "Session folder found; reading Codex rollouts comes in a later version", "Install Codex CLI and run it once")
    }
    fn session_files(&self) -> Vec<PathBuf> {
        Vec::new()
    }
    fn sessions_for_project(&self, _dir: &Path) -> Vec<PathBuf> {
        Vec::new()
    }
    fn parser(&self) -> Option<Box<dyn SessionParser>> {
        None
    }
}
