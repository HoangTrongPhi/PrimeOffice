//! Gemini CLI: chats under `~/.gemini/tmp/<project hash>/` (**kiểm chứng** the layout before reading
//! them — spec P6). Detection only for now.

use std::path::{Path, PathBuf};

use super::{detect_folder, AgentProvider, ProviderStatus, SessionParser};

pub struct GeminiProvider {
    root: PathBuf,
}

impl GeminiProvider {
    pub fn new(root: PathBuf) -> Self {
        GeminiProvider { root }
    }
}

impl AgentProvider for GeminiProvider {
    fn id(&self) -> &'static str {
        "gemini"
    }
    fn display_name(&self) -> &'static str {
        "Gemini CLI"
    }
    fn detect(&self, now_ms: u64, window_ms: u64) -> ProviderStatus {
        detect_folder(self.id(), self.display_name(), &self.root, "json", 3, now_ms, window_ms, "Session folder found; reading Gemini chats comes in a later version", "Install Gemini CLI and run it once")
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
