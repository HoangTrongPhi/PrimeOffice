//! Command line, same exe as the app: `primeoffice check <folder>`, `history <folder>`, `providers`.
//! Runs without a window, for scripts and CI. Exit codes: 0 done and nothing at the `--fail-on`
//! level, 1 issues at that level (or a failed step), 2 bad arguments or input.

use std::path::{Path, PathBuf};
use std::time::Instant;

use clap::{Args, Parser, Subcommand, ValueEnum};
use serde::Serialize;

use crate::commands::project_cmd;
use crate::commands::session_cmd::{self, SessionQuery};
use crate::core::activity::one_line;
use crate::core::providers::{home_dir, now_ms, registry, ProviderState};
use crate::core::{count_at_least, Issue, Severity};

const APP: &str = "PrimeOffice";
const EXAMPLES: &str = "\
Examples:
  primeoffice check D:\\Game --report check.json
  primeoffice check D:\\Game --fail-on warn --quiet
  primeoffice history D:\\Game --last 5
  primeoffice providers

Exit codes: 0 done, 1 issues at the --fail-on level, 2 bad arguments or input.
In cmd.exe run `start /wait primeoffice.exe ...` to wait for the exit code.";

/// Subcommands the exe answers on the command line; any other first argument opens the window
/// (e.g. a folder from Explorer's "Open with").
const SUBCOMMANDS: &[&str] = &["check", "history", "providers", "help"];

#[derive(Parser, Debug)]
#[command(name = "primeoffice", version, about = "PrimeOffice — Pixel office for your AI coding agents", after_help = EXAMPLES)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Subcommand, Debug)]
pub enum Command {
    /// Check a project folder against the PrimeOffice standard and list everything missing.
    Check(CheckArgs),
    /// The latest agent sessions of a folder: title, last prompt, recent actions, last reply.
    History(HistoryArgs),
    /// Which agents (Claude Code, Codex, Gemini, DeepSeek) are found on this PC.
    Providers,
}

#[derive(Args, Debug)]
pub struct CheckArgs {
    /// Project folder.
    pub folder: PathBuf,
    #[command(flatten)]
    pub common: Common,
}

#[derive(Args, Debug)]
pub struct HistoryArgs {
    /// Project folder.
    pub folder: PathBuf,
    /// How many sessions, newest first.
    #[arg(long, default_value_t = 5)]
    pub last: usize,
    /// Write the sessions as JSON.
    #[arg(long, value_name = "FILE")]
    pub report: Option<PathBuf>,
}

/// Flags every subcommand that fits them has.
#[derive(Args, Debug, Clone)]
pub struct Common {
    /// Write the whole result (the same structure the app shows) as JSON.
    #[arg(long, value_name = "FILE")]
    pub report: Option<PathBuf>,
    /// Issue level that makes the exit code 1.
    #[arg(long, value_enum, default_value_t = FailOn::Error)]
    pub fail_on: FailOn,
    /// Only the summary line and errors.
    #[arg(long)]
    pub quiet: bool,
}

#[derive(ValueEnum, Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailOn {
    Warn,
    Error,
}

impl FailOn {
    pub fn severity(self) -> Severity {
        match self {
            FailOn::Warn => Severity::Warn,
            FailOn::Error => Severity::Error,
        }
    }
}

/// True when the process was started for the command line rather than the app window.
pub fn wants_cli(args: &[String]) -> bool {
    args.get(1).is_some_and(|a| SUBCOMMANDS.contains(&a.as_str()) || matches!(a.as_str(), "--help" | "-h" | "--version" | "-V"))
}

/// What a window start was given (Explorer's "Open with", a shortcut, `primeoffice.exe D:\Game`):
/// `Ok(folder)` for an existing folder, `Err(arg)` for anything else, `None` without an argument or
/// for a command-line start.
pub fn open_with(args: &[String]) -> Option<Result<PathBuf, String>> {
    if wants_cli(args) {
        return None;
    }
    let arg = args.get(1)?;
    let path = PathBuf::from(arg);
    Some(if path.is_dir() { Ok(path) } else { Err(arg.clone()) })
}

/// Release builds use the Windows GUI subsystem: borrow the calling terminal's console for output.
fn attach_console() {
    #[cfg(windows)]
    {
        extern "system" {
            fn AttachConsole(process_id: u32) -> i32;
        }
        const ATTACH_PARENT_PROCESS: u32 = u32::MAX;
        unsafe {
            AttachConsole(ATTACH_PARENT_PROCESS);
        }
    }
}

// ---------------------------------------------------------------- output

/// Console output in the suite's format: a title line, one `OK  `/`WARN`/`FAIL`/`SKIP` line per step
/// with at most 20 detail lines (problems first), and a closing line.
pub struct Out {
    pub quiet: bool,
}

impl Out {
    pub fn title(&self, command: &str, target: &Path) {
        if !self.quiet {
            println!("{APP} {} — {command} on {}", env!("CARGO_PKG_VERSION"), target.display());
        }
    }

    pub fn step(&self, mark: &str, title: &str, summary: &str, details: &[String]) {
        let failed = mark == "FAIL";
        if self.quiet && !failed {
            println!("{mark} {title}: {summary}");
            for d in details.iter().filter(|d| d.trim_start().starts_with('!')).take(20) {
                println!("       {d}");
            }
            return;
        }
        println!("{mark} {title}: {summary}");
        let mut lines: Vec<&String> = details.iter().filter(|d| d.trim_start().starts_with('!')).collect();
        lines.extend(details.iter().filter(|d| !d.trim_start().starts_with('!')));
        for d in lines.iter().take(20) {
            println!("       {d}");
        }
        if details.len() > 20 {
            println!("       … {} more line(s) in the report", details.len() - 20);
        }
    }

    pub fn finish(&self, ok: bool, elapsed_ms: u64) {
        println!("{} in {elapsed_ms} ms", if ok { "Finished" } else { "Stopped after a failed step" });
    }
}

pub fn mark_for(issues: &[Issue], cancelled: bool) -> &'static str {
    if cancelled {
        "SKIP"
    } else if count_at_least(issues, Severity::Error) > 0 {
        "FAIL"
    } else if count_at_least(issues, Severity::Warn) > 0 {
        "WARN"
    } else {
        "OK  "
    }
}

pub fn write_report<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let json = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    crate::utils::paths::write_atomic(path, json.as_bytes()).map_err(|e| format!("Cannot write report {}: {e}", path.display()))?;
    Ok(())
}

// ---------------------------------------------------------------- commands

pub fn run(args: &[String]) -> i32 {
    attach_console();
    let cli = match Cli::try_parse_from(args) {
        Ok(c) => c,
        Err(e) => {
            let code = if e.use_stderr() { 2 } else { 0 };
            let _ = e.print();
            return code;
        }
    };
    match cli.command {
        Command::Check(a) => check(a),
        Command::History(a) => history(a),
        Command::Providers => providers(),
    }
}

fn check(a: CheckArgs) -> i32 {
    let out = Out { quiet: a.common.quiet };
    out.title("check", &a.folder);
    let report = project_cmd::check(&a.folder);
    if !report.checks.first().is_some_and(|c| c.passed) {
        eprintln!("Folder not found: {}", a.folder.display());
        return 2;
    }
    let details: Vec<String> = report
        .checks
        .iter()
        .map(|c| match (c.passed, c.severity) {
            (true, _) => format!("✓ {} — {}", c.title, c.message),
            (false, Severity::Error) => format!("! ✗ {} — fix: {}", c.title, c.fix),
            (false, _) => format!("✗ {} — fix: {}", c.title, c.fix),
        })
        .collect();
    let missing = report.checks.iter().filter(|c| !c.passed).count();
    let summary = format!(
        "{} — {} of {} checks passed{}",
        if report.ready { "ready" } else { "not ready" },
        report.checks.len() - missing,
        report.checks.len(),
        if missing > 0 { format!(", {missing} missing") } else { String::new() }
    );
    out.step(mark_for(&report.issues, false), "Project standard", &summary, &details);
    if let Some(path) = &a.common.report {
        if let Err(e) = write_report(path, &report) {
            eprintln!("{e}");
            return 1;
        }
        if !out.quiet {
            println!("Report written to {}", path.display());
        }
    }
    let failed = count_at_least(&report.issues, a.common.fail_on.severity()) > 0;
    out.finish(!failed, report.elapsed_ms);
    i32::from(failed)
}

fn history(a: HistoryArgs) -> i32 {
    let started = Instant::now();
    let out = Out { quiet: false };
    out.title("history", &a.folder);
    if !a.folder.is_dir() {
        eprintln!("Folder not found: {}", a.folder.display());
        return 2;
    }
    let Some(home) = home_dir() else {
        eprintln!("No home folder");
        return 2;
    };
    let query = SessionQuery { project: Some(a.folder.to_string_lossy().into_owned()), limit: Some(a.last.max(1)), ..Default::default() };
    let sessions = session_cmd::list(&home, &query);
    for s in &sessions {
        let mut details = vec![format!("prompt: {}", one_line(&s.last_prompt, 160))];
        details.extend(s.actions.iter().rev().take(5).map(|x| format!("- {}", x.label)));
        if !s.last_reply.is_empty() {
            details.push(format!("reply: {}", one_line(&s.last_reply, 160)));
        }
        let when = s.last_activity_at.clone().unwrap_or_default();
        out.step("OK  ", &format!("{} ({})", s.title, s.provider), &format!("{when} · {} prompt(s) · {:?}", s.prompt_count, s.status), &details);
    }
    if sessions.is_empty() {
        out.step("WARN", "Sessions", "no agent session for this folder", &[]);
    }
    if let Some(path) = &a.report {
        if let Err(e) = write_report(path, &sessions) {
            eprintln!("{e}");
            return 1;
        }
        println!("Report written to {}", path.display());
    }
    out.finish(true, started.elapsed().as_millis() as u64);
    0
}

fn providers() -> i32 {
    let started = Instant::now();
    let Some(home) = home_dir() else {
        eprintln!("No home folder");
        return 2;
    };
    let out = Out { quiet: false };
    out.title("providers", &home);
    for p in registry(&home) {
        let st = p.detect(now_ms(), 30 * 60_000);
        let mark = match st.state {
            ProviderState::Active | ProviderState::Detected => "OK  ",
            ProviderState::NotFound | ProviderState::Unsupported => "SKIP",
        };
        let root: Vec<String> = st.session_root.iter().cloned().collect();
        out.step(mark, &st.name, &format!("{:?}, {} recent session(s) — {}", st.state, st.sessions, st.note), &root);
    }
    out.finish(true, started.elapsed().as_millis() as u64);
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        std::iter::once("primeoffice").chain(list.iter().copied()).map(String::from).collect()
    }

    #[test]
    fn parses_flags() {
        assert!(!wants_cli(&args(&[])));
        assert!(!wants_cli(&args(&["D:/some/folder"])), "Open with → window");
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().to_string_lossy().into_owned();
        assert_eq!(open_with(&args(&[&folder])), Some(Ok(dir.path().to_path_buf())));
        let missing = dir.path().join("missing").to_string_lossy().into_owned();
        assert_eq!(open_with(&args(&[&missing])), Some(Err(missing.clone())));
        assert_eq!(open_with(&args(&[])), None);
        assert_eq!(open_with(&args(&["check", &folder])), None, "a command, not a window");
        assert!(wants_cli(&args(&["check", "D:/a"])) && wants_cli(&args(&["providers"])) && wants_cli(&args(&["--help"])) && wants_cli(&args(&["--version"])));

        let c = Cli::try_parse_from(args(&["check", "D:/a", "--report", "r.json", "--quiet", "--fail-on", "warn"])).unwrap();
        let Command::Check(c) = c.command else { panic!("check") };
        assert_eq!((c.folder, c.common.report, c.common.quiet, c.common.fail_on), (PathBuf::from("D:/a"), Some(PathBuf::from("r.json")), true, FailOn::Warn));
        let h = Cli::try_parse_from(args(&["history", "D:/a", "--last", "3"])).unwrap();
        assert!(matches!(h.command, Command::History(HistoryArgs { last: 3, .. })));
        assert!(Cli::try_parse_from(args(&["check"])).is_err(), "folder required");
        assert!(Cli::try_parse_from(args(&["check", "D:/a", "--report"])).is_err(), "value missing");
        assert!(Cli::try_parse_from(args(&["check", "D:/a", "--bogus"])).is_err(), "unknown flag");
        assert!(Cli::try_parse_from(args(&["check", "D:/a", "--fail-on", "info"])).is_err(), "bad level");
    }

    #[test]
    fn runs_check_and_history() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("CLAUDE.md"), "x").unwrap();
        let report = dir.path().join("out/r.json");
        // A fresh temp folder has no agent session: not ready → exit 1.
        let code = run(&args(&["check", &dir.path().to_string_lossy(), "--report", &report.to_string_lossy(), "--quiet"]));
        assert_eq!(code, 1);
        let json: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&report).unwrap()).unwrap();
        assert_eq!(json["ready"], false);
        assert!(json["checks"].as_array().unwrap().iter().any(|c| c["code"] == "agent.instructions" && c["passed"] == true));
        assert_eq!(run(&args(&["check", &dir.path().join("missing").to_string_lossy()])), 2);
        assert_eq!(run(&args(&["history", &dir.path().to_string_lossy()])), 0);
        assert_eq!(run(&args(&["history", &dir.path().join("missing").to_string_lossy()])), 2);
        assert_eq!(run(&args(&["check", "--nope"])), 2);
    }
}
