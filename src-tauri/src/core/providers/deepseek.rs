//! DeepSeek has no official coding-agent CLI that keeps local sessions. It reaches the office
//! through whichever tool drives it (Aider, Cline, an API bridge — spec Q3).

use std::path::{Path, PathBuf};

use super::{AgentProvider, ProviderState, ProviderStatus, SessionParser};

pub struct DeepSeekProvider;

impl AgentProvider for DeepSeekProvider {
    fn id(&self) -> &'static str {
        "deepseek"
    }
    fn display_name(&self) -> &'static str {
        "DeepSeek"
    }
    fn detect(&self, _now_ms: u64, _window_ms: u64) -> ProviderStatus {
        ProviderStatus {
            id: self.id().into(),
            name: self.display_name().into(),
            state: ProviderState::Unsupported,
            session_root: None,
            sessions: 0,
            observable: false,
            note: "No local session format yet; planned through the tool that runs DeepSeek".into(),
        }
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
