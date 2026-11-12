//! Agent providers: where a coding agent keeps its sessions and how to read them. Claude Code is
//! complete, Codex (ChatGPT) reads its rollouts; Gemini and DeepSeek only report whether they are
//! found (spec §3.3).
//! A new agent is one more file here — the office, history and project check stay as they are.

pub mod claude;
pub mod codex;
pub mod deepseek;
pub mod gemini;

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use super::activity::ActionKind;
use super::CoreError;

/// One thing the agent did (a tool call), newest last.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionAction {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub at: Option<String>,
    pub kind: ActionKind,
    pub tool: String,
    pub label: String,
}

/// A tool call that started and has not finished yet.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenTool {
    pub id: String,
    pub tool: String,
    pub label: String,
    /// `Agent`/`Task` calls: the sub-agent type asked for (`subagent_type`, e.g. `gameplay-programmer`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_type: Option<String>,
    /// `Agent`/`Task` calls started with `run_in_background`: the sub-agent outlives the tool call.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub background: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionStatus {
    /// Executing its turn.
    Active,
    /// Blocked on the user (a question, a permission).
    Waiting,
    /// Turn finished, nothing pending.
    Done,
    /// No activity inside the active window.
    Stale,
}

/// What PrimeOffice knows about one session (spec §3.1).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSession {
    pub provider: String,
    pub session_id: String,
    pub title: String,
    pub cwd: String,
    pub transcript_path: String,
    pub entrypoint: String,
    pub model: String,
    pub started_at: Option<String>,
    pub last_activity_at: Option<String>,
    /// File modification time, ms since the epoch.
    pub modified_ms: u64,
    pub status: SessionStatus,
    pub last_prompt: String,
    pub last_reply: String,
    pub prompt_count: u32,
    pub context_tokens: u64,
    pub max_context_tokens: u64,
    pub actions: Vec<SessionAction>,
    pub open_tools: Vec<OpenTool>,
    /// Team role typed in the session's first message by Add agent (`src/lib/briefing.ts`):
    /// "boss", "member" or "" (none). Read from the transcript, so it is the same whichever client
    /// (PrimeOffice, a terminal, Claude Desktop) opens the session.
    #[serde(default)]
    pub team_role: String,
    /// The agent's own name from that first message ("You are Batman, …"), "" when none was given.
    #[serde(default)]
    pub person: String,
    /// Sub-agents this session started (`Agent`/`Task` calls), oldest first, each ticked when done.
    #[serde(default)]
    pub sub_tasks: Vec<SubTask>,
}

/// A sub-agent the session ordered, and whether it has finished.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubTask {
    /// The `Agent`/`Task` tool call.
    pub id: String,
    pub agent_type: String,
    pub description: String,
    pub done: bool,
    #[serde(default)]
    pub background: bool,
}

/// The agent's name in a briefing's first line ("You are Batman, the Boss …" → "Batman").
pub fn person_of(first_prompt: &str) -> String {
    if team_role(first_prompt).is_empty() {
        return String::new();
    }
    let head = first_prompt.lines().next().unwrap_or("");
    head.strip_prefix("You are ").and_then(|r| r.split_once(", ")).map(|(n, _)| n.trim().to_string()).filter(|n| !n.is_empty() && n.chars().count() <= 40).unwrap_or_default()
}

/// What a first message asks for, without the team text Add agent puts in front of it
/// (`src/lib/briefing.ts` `firstMessage`: preamble, "Your task: <name>", then the task).
pub fn task_of(first_prompt: &str) -> String {
    if team_role(first_prompt).is_empty() {
        return first_prompt.to_string();
    }
    let mut parts = first_prompt.split("\n\n").skip(1).map(str::trim).filter(|p| !p.is_empty());
    // The rest of the preamble paragraph is joined by single newlines, so after it comes the task.
    match parts.next() {
        Some(p) => match p.strip_prefix("Your task: ") {
            Some(name) => name.lines().next().unwrap_or("").trim().to_string(),
            None => p.to_string(),
        },
        None => String::new(),
    }
}

/// Opening lines of the role texts in `src/lib/briefing.ts` (`rolePreamble`); keep them in step.
const BOSS_MARK: &str = "the Boss of the agent team working in this folder.";
const MEMBER_MARK: &str = "a member of the agent team working in this folder.";

/// The team role a first message gives its session ("boss", "member" or "").
pub fn team_role(first_prompt: &str) -> String {
    let head = first_prompt.lines().next().unwrap_or("");
    if !head.starts_with("You are ") {
        String::new()
    } else if head.contains(BOSS_MARK) {
        "boss".into()
    } else if head.contains(MEMBER_MARK) {
        "member".into()
    } else {
        String::new()
    }
}

/// Feeds a session's transcript line by line (whole file or new lines only) and says what it shows.
pub trait SessionParser: Send {
    fn feed_line(&mut self, line: &str);
    /// The session as of the lines fed so far; `now_ms` decides Done vs Stale and idle turns.
    fn session(&self, path: &Path, modified_ms: u64, now_ms: u64, window_ms: u64) -> AgentSession;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProviderState {
    /// Sessions found in the active window.
    Active,
    /// Its session folder exists.
    Detected,
    NotFound,
    /// Known agent PrimeOffice cannot observe yet.
    Unsupported,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub id: String,
    pub name: String,
    pub state: ProviderState,
    pub session_root: Option<String>,
    pub sessions: usize,
    /// Can PrimeOffice show this provider's agents in the office today?
    pub observable: bool,
    pub note: String,
}

pub trait AgentProvider: Send + Sync {
    fn id(&self) -> &'static str;
    fn display_name(&self) -> &'static str;
    fn detect(&self, now_ms: u64, window_ms: u64) -> ProviderStatus;
    /// Every session transcript this provider has, newest first is not required.
    fn session_files(&self) -> Vec<PathBuf>;
    /// Transcripts of sessions that ran in `dir`.
    fn sessions_for_project(&self, dir: &Path) -> Vec<PathBuf>;
    /// None for providers that cannot be read yet.
    fn parser(&self) -> Option<Box<dyn SessionParser>>;
    /// Sub-agents a session started, each with its own transcript. Default: none.
    fn sub_agents(&self, _session: &Path) -> Vec<SubAgentFile> {
        Vec::new()
    }
    /// Parser for a sub-agent transcript from `sub_agents`.
    fn sub_parser(&self) -> Option<Box<dyn SessionParser>> {
        None
    }
}

/// A sub-agent's transcript and what its sidecar says about it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SubAgentFile {
    pub path: PathBuf,
    /// The parent's `Agent`/`Task` tool call that started it.
    pub tool_use_id: String,
    pub agent_type: String,
    pub description: String,
    /// The sidecar says it ended.
    pub finished: bool,
}

/// The user's home folder (`USERPROFILE` on Windows).
pub fn home_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).map(PathBuf::from)
}

/// All providers, rooted at `home`.
pub fn registry(home: &Path) -> Vec<Box<dyn AgentProvider>> {
    vec![
        Box::new(claude::ClaudeProvider::new(home.join(".claude").join("projects"))),
        Box::new(codex::CodexProvider::new(home.join(".codex").join("sessions"))),
        Box::new(gemini::GeminiProvider::new(home.join(".gemini").join("tmp"))),
        Box::new(deepseek::DeepSeekProvider),
    ]
}

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

pub fn modified_ms(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Bytes read from the head and the tail of a transcript for history. Titles, the last prompt and
/// recent actions sit at the end; the first prompt and `cwd` at the start.
pub const HEAD_BYTES: u64 = 256 * 1024;
pub const TAIL_BYTES: u64 = 4 * 1024 * 1024;

/// Whole lines of `path` from byte `from` (the partial first line is dropped when `from > 0`).
pub fn read_lines_from(path: &Path, from: u64) -> Result<(Vec<String>, u64), CoreError> {
    let mut f = File::open(path).map_err(|e| CoreError::io(path, e))?;
    let len = f.metadata().map_err(|e| CoreError::io(path, e))?.len();
    let from = from.min(len);
    f.seek(SeekFrom::Start(from)).map_err(|e| CoreError::io(path, e))?;
    let mut buf = Vec::with_capacity((len - from) as usize);
    f.read_to_end(&mut buf).map_err(|e| CoreError::io(path, e))?;
    // Only complete lines; the rest is read next time.
    let end = buf.iter().rposition(|&b| b == b'\n').map(|i| i + 1).unwrap_or(0);
    let text = String::from_utf8_lossy(&buf[..end]);
    let mut lines: Vec<String> = text.lines().map(str::to_string).collect();
    if from > 0 && !lines.is_empty() {
        // `from` may land mid-line: the first piece is not a whole record.
        let mut prev = [0u8; 1];
        let starts_clean = {
            let mut g = File::open(path).map_err(|e| CoreError::io(path, e))?;
            g.seek(SeekFrom::Start(from - 1)).is_ok() && g.read_exact(&mut prev).is_ok() && prev[0] == b'\n'
        };
        if !starts_clean {
            lines.remove(0);
        }
    }
    Ok((lines, from + end as u64))
}

/// Read a session for history: head + tail when the file is large. Returns the parser and the offset
/// reached, so a caller can keep reading new lines from there.
pub fn read_session_bounded(parser: &mut dyn SessionParser, path: &Path) -> Result<u64, CoreError> {
    let len = std::fs::metadata(path).map_err(|e| CoreError::io(path, e))?.len();
    if len <= HEAD_BYTES + TAIL_BYTES {
        let (lines, end) = read_lines_from(path, 0)?;
        lines.iter().for_each(|l| parser.feed_line(l));
        return Ok(end);
    }
    let mut f = File::open(path).map_err(|e| CoreError::io(path, e))?;
    let mut head = vec![0u8; HEAD_BYTES as usize];
    f.read_exact(&mut head).map_err(|e| CoreError::io(path, e))?;
    let cut = head.iter().rposition(|&b| b == b'\n').map(|i| i + 1).unwrap_or(0);
    String::from_utf8_lossy(&head[..cut]).lines().for_each(|l| parser.feed_line(l));
    let (lines, end) = read_lines_from(path, len - TAIL_BYTES)?;
    lines.iter().for_each(|l| parser.feed_line(l));
    Ok(end)
}

/// One session read for history, or None when the provider cannot read it.
pub fn read_session(provider: &dyn AgentProvider, path: &Path, now_ms: u64, window_ms: u64) -> Result<Option<AgentSession>, CoreError> {
    let Some(mut parser) = provider.parser() else { return Ok(None) };
    read_session_bounded(parser.as_mut(), path)?;
    Ok(Some(parser.session(path, modified_ms(path), now_ms, window_ms)))
}

/// Detection for providers that are found by their session folder: counts `ext` files up to `depth`
/// levels deep that changed inside the window.
#[allow(clippy::too_many_arguments)]
pub fn detect_folder(id: &str, name: &str, root: &Path, ext: &str, depth: usize, now_ms: u64, window_ms: u64, found_note: &str, missing_note: &str) -> ProviderStatus {
    let found = root.is_dir();
    let recent = if found {
        walkdir::WalkDir::new(root)
            .max_depth(depth)
            .into_iter()
            .flatten()
            .filter(|e| e.file_type().is_file() && e.path().extension().is_some_and(|x| x.eq_ignore_ascii_case(ext)))
            .filter(|e| now_ms.saturating_sub(modified_ms(e.path())) <= window_ms)
            .count()
    } else {
        0
    };
    ProviderStatus {
        id: id.into(),
        name: name.into(),
        state: if found { ProviderState::Detected } else { ProviderState::NotFound },
        session_root: Some(root.to_string_lossy().into_owned()),
        sessions: recent,
        observable: false,
        note: if found { found_note.into() } else { missing_note.into() },
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn team_role_from_first_message() {
        use super::team_role;
        assert_eq!(team_role("You are Batman, the Boss of the agent team working in this folder.\nKeep the team…"), "boss");
        assert_eq!(team_role("You are the Boss of the agent team working in this folder."), "boss");
        assert_eq!(team_role("You are Ada, a member of the agent team working in this folder. The Boss is Batman."), "member");
        assert_eq!(team_role("Fix the build"), "");
        assert_eq!(team_role("Fix it.\nYou are the Boss of the agent team working in this folder."), "");
    }

    use super::*;

    #[test]
    fn reads_whole_lines_only() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.jsonl");
        std::fs::write(&p, "one\ntwo\nthr").unwrap();
        let (lines, end) = read_lines_from(&p, 0).unwrap();
        assert_eq!((lines, end), (vec!["one".to_string(), "two".to_string()], 8));
        let (mid, _) = read_lines_from(&p, 2).unwrap();
        assert_eq!(mid, vec!["two".to_string()], "partial first line dropped");
        let (clean, _) = read_lines_from(&p, 4).unwrap();
        assert_eq!(clean, vec!["two".to_string()], "offset at a line start keeps the line");
    }

    #[test]
    fn registry_has_every_provider() {
        let ids: Vec<&str> = registry(Path::new("C:/nobody")).iter().map(|p| p.id()).collect();
        assert_eq!(ids, ["claude", "codex", "gemini", "deepseek"]);
    }
}
