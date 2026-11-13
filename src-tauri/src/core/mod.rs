//! Engines: plain functions over files, no `tauri` imports, so the commands, the command line
//! (`cli.rs`) and the tests all call the same code.

pub mod activity;
pub mod observer;
pub mod project;
pub mod providers;
pub mod skills;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};

/// Progress and cancel for one long operation. Engines report `(done, total, message)` and check
/// `cancelled()` between units of work (each file, each frame…).
pub struct RunCtx<'a> {
    pub progress: &'a (dyn Fn(u64, u64, &str) + Sync),
    pub cancel: &'a AtomicBool,
}

impl RunCtx<'_> {
    pub fn cancelled(&self) -> bool {
        self.cancel.load(Ordering::Relaxed)
    }
}

/// A context that reports nothing and is never cancelled (tests, quick calls).
pub fn quiet_ctx<R>(f: impl FnOnce(&RunCtx) -> R) -> R {
    let cancel = AtomicBool::new(false);
    f(&RunCtx { progress: &|_, _, _| {}, cancel: &cancel })
}

/// Errors that stop a whole operation. A single unreadable file is an `Issue` instead.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("{0}")]
    Input(String),
    #[error("{path}: {source}")]
    Io { path: PathBuf, source: std::io::Error },
}

impl CoreError {
    pub fn io(path: impl Into<PathBuf>, source: std::io::Error) -> Self {
        CoreError::Io { path: path.into(), source }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Info,
    Warn,
    Error,
}

/// Something a report wants the user to see; the job carries on past it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub severity: Severity,
    /// Stable kebab-case id, e.g. `unreadable-file`.
    pub code: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

impl Issue {
    pub fn new(severity: Severity, code: &str, message: impl Into<String>) -> Self {
        Issue { severity, code: code.into(), message: message.into(), path: None }
    }

    pub fn at(mut self, path: impl AsRef<std::path::Path>) -> Self {
        self.path = Some(path.as_ref().to_string_lossy().into_owned());
        self
    }
}

/// Issues at or above `level`.
pub fn count_at_least(issues: &[Issue], level: Severity) -> usize {
    issues.iter().filter(|i| i.severity >= level).count()
}
