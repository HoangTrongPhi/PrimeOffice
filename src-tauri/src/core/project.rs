//! Project standard (spec §3.2, "agent + Abyss"): can PrimeOffice show this folder, and what is
//! missing. Every check is listed — passed or not — so the UI shows the whole checklist, and every
//! failed one says how to fix it.

use std::path::Path;
use std::time::Instant;

use serde::{Deserialize, Serialize};

use super::providers::{modified_ms, AgentProvider};
use super::{Issue, Severity};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCheck {
    pub code: String,
    pub severity: Severity,
    pub passed: bool,
    pub title: String,
    pub message: String,
    /// What to do when it failed.
    pub fix: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSessions {
    pub provider: String,
    pub sessions: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectReport {
    pub path: String,
    pub name: String,
    /// No failed check at the error level: the office and history can show it.
    pub ready: bool,
    pub ok: bool,
    pub cancelled: bool,
    pub elapsed_ms: u64,
    pub checks: Vec<ProjectCheck>,
    /// Failed checks, as the suite's report issues.
    pub issues: Vec<Issue>,
    pub sessions: Vec<ProviderSessions>,
    pub last_session_ms: Option<u64>,
}

struct Spec {
    code: &'static str,
    severity: Severity,
    title: &'static str,
    fix: &'static str,
}

const FILES: &[(Spec, &[&str])] = &[
    (Spec { code: "agent.instructions", severity: Severity::Warn, title: "Agent instructions (CLAUDE.md or AGENTS.md)", fix: "Run /init in Claude Code inside this folder, or write CLAUDE.md by hand" }, &["CLAUDE.md", "AGENTS.md", ".claude/CLAUDE.md"]),
    (Spec { code: "agent.settings", severity: Severity::Info, title: "Project agent settings (.claude/)", fix: "Optional: create .claude/ for project settings, skills or agents" }, &[".claude"]),
    (Spec { code: "vcs.git", severity: Severity::Warn, title: "Git repository", fix: "Run `git init` in this folder" }, &[".git"]),
    (Spec { code: "abyss.spec", severity: Severity::Warn, title: "Spec (docs/SPEC.md)", fix: "Write docs/SPEC.md (Abyss docs/app-specs/00_SHARED_FRAMEWORK.md §3)" }, &["docs/SPEC.md"]),
    (Spec { code: "abyss.progress", severity: Severity::Warn, title: "Progress log (docs/PROGRESS.md)", fix: "Add docs/PROGRESS.md (template: 00_SHARED_FRAMEWORK.md §15)" }, &["docs/PROGRESS.md"]),
    (Spec { code: "abyss.changelog", severity: Severity::Info, title: "Changelog (docs/CHANGELOG.md or CHANGELOG.md)", fix: "Add docs/CHANGELOG.md" }, &["docs/CHANGELOG.md", "CHANGELOG.md"]),
    (Spec { code: "abyss.readme", severity: Severity::Info, title: "README.md", fix: "Add a README.md with what the project is and how to run it" }, &["README.md"]),
];

fn check(spec: &Spec, passed: bool, message: String) -> ProjectCheck {
    ProjectCheck { code: spec.code.into(), severity: spec.severity, passed, title: spec.title.into(), message, fix: if passed { String::new() } else { spec.fix.into() } }
}

/// Check `dir` against the standard. Never fails: a missing folder is a failed check.
pub fn check_project(dir: &Path, providers: &[Box<dyn AgentProvider>]) -> ProjectReport {
    let started = Instant::now();
    let name = dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| dir.to_string_lossy().into_owned());
    let mut checks = Vec::new();

    let exists = dir.is_dir() && std::fs::read_dir(dir).is_ok();
    checks.push(check(
        &Spec { code: "folder.exists", severity: Severity::Error, title: "Folder exists and can be read", fix: "Pick the folder again (it was moved, renamed or is on a missing drive)" },
        exists,
        if exists { "Found".into() } else { format!("{} cannot be read", dir.display()) },
    ));

    let mut sessions = Vec::new();
    let mut last_session_ms = None;
    for p in providers {
        let files = p.sessions_for_project(dir);
        if !files.is_empty() {
            last_session_ms = files.iter().map(|f| modified_ms(f)).max().max(last_session_ms);
            sessions.push(ProviderSessions { provider: p.id().into(), sessions: files.len() });
        }
    }
    let total: usize = sessions.iter().map(|s| s.sessions).sum();
    checks.push(check(
        &Spec { code: "agent.sessions", severity: Severity::Error, title: "Agent sessions for this folder", fix: "Start an agent in this exact folder once (e.g. `claude` in a terminal opened here)" },
        total > 0,
        if total > 0 { sessions.iter().map(|s| format!("{} {}", s.sessions, s.provider)).collect::<Vec<_>>().join(", ") + " session(s)" } else { "No agent has run in this folder yet".into() },
    ));

    for (spec, candidates) in FILES {
        let hit = if exists { candidates.iter().find(|c| dir.join(c).exists()) } else { None };
        checks.push(check(spec, hit.is_some(), hit.map(|h| format!("Found {h}")).unwrap_or_else(|| format!("Missing {}", candidates.join(" / ")))));
    }

    let issues: Vec<Issue> = checks.iter().filter(|c| !c.passed).map(|c| Issue::new(c.severity, &c.code, format!("{} — {}", c.title, c.fix)).at(dir)).collect();
    let ready = !issues.iter().any(|i| i.severity == Severity::Error);
    ProjectReport {
        path: dir.to_string_lossy().into_owned(),
        name,
        ready,
        ok: ready,
        cancelled: false,
        elapsed_ms: started.elapsed().as_millis() as u64,
        checks,
        issues,
        sessions,
        last_session_ms,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::providers::claude::{fixtures, ClaudeProvider};

    fn providers(root: &Path) -> Vec<Box<dyn AgentProvider>> {
        vec![Box::new(ClaudeProvider::new(root.to_path_buf()))]
    }

    #[test]
    fn lists_everything_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let proj = tmp.path().join("Game");
        std::fs::create_dir_all(&proj).unwrap();
        let r = check_project(&proj, &providers(&tmp.path().join("projects")));
        assert!(!r.ready);
        let failed: Vec<&str> = r.checks.iter().filter(|c| !c.passed).map(|c| c.code.as_str()).collect();
        assert_eq!(failed, ["agent.sessions", "agent.instructions", "agent.settings", "vcs.git", "abyss.spec", "abyss.progress", "abyss.changelog", "abyss.readme"]);
        assert!(r.checks.iter().filter(|c| !c.passed).all(|c| !c.fix.is_empty()), "every failure says how to fix it");
        assert_eq!(r.issues.len(), failed.len());
    }

    #[test]
    fn ready_when_sessions_exist() {
        let tmp = tempfile::tempdir().unwrap();
        let proj = tmp.path().join("Game");
        std::fs::create_dir_all(proj.join("docs")).unwrap();
        std::fs::write(proj.join("CLAUDE.md"), "x").unwrap();
        std::fs::write(proj.join("docs/PROGRESS.md"), "x").unwrap();
        let root = tmp.path().join("projects");
        let dir = root.join(crate::core::providers::claude::normalize_project_path(&proj.to_string_lossy()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("s1.jsonl"), fixtures::user("hi", "2026-11-09T06:00:00Z") + "\n").unwrap();
        let r = check_project(&proj, &providers(&root));
        assert!(r.ready, "{:?}", r.issues);
        assert_eq!(r.sessions, vec![ProviderSessions { provider: "claude".into(), sessions: 1 }]);
        assert!(r.checks.iter().find(|c| c.code == "agent.instructions").unwrap().passed);
        assert!(r.last_session_ms.is_some());
    }

    #[test]
    fn missing_folder_is_a_failed_check() {
        let tmp = tempfile::tempdir().unwrap();
        let r = check_project(&tmp.path().join("nope"), &providers(tmp.path()));
        assert!(!r.ready);
        assert!(!r.checks[0].passed && r.checks[0].severity == Severity::Error);
    }
}
