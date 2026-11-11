//! Claude Code: transcripts at `~/.claude/projects/<normalized cwd>/<session>.jsonl`, one JSON record
//! per line. The format has no public contract, so every field is optional and unknown records are
//! skipped (verified on Claude Code 2.1.317, see pixel-agents/docs/SURVEY.md §5).

use std::collections::VecDeque;
use std::path::{Path, PathBuf};

use serde_json::Value;

use super::{AgentProvider, AgentSession, OpenTool, SubAgentFile, ProviderState, ProviderStatus, SessionAction, SessionParser, SessionStatus};
use crate::core::activity::{clip, describe, one_line};

pub const ID: &str = "claude";
const MAX_ACTIONS: usize = 50;
const TEXT_MAX: usize = 500;
/// A turn whose last record is assistant text, quiet this long, is over.
const IDLE_DONE_MS: u64 = 5_000;
/// A tool that is not known to run long, quiet this long, is most likely waiting for permission.
const PERMISSION_GUESS_MS: u64 = 10_000;
/// Tools that run long or ask by themselves: never guessed as waiting for permission.
const LONG_OR_EXEMPT: &[&str] = &["Task", "Agent", "Bash", "PowerShell", "WebFetch", "WebSearch", "AskUserQuestion", "ExitPlanMode"];
/// Tools that put the question to the user.
const ASKING: &[&str] = &["AskUserQuestion", "ExitPlanMode"];

/// Claude Code's folder name for a working directory: every character outside `[A-Za-z0-9-]` becomes
/// `-`, per UTF-16 code unit (same as `core/src/normalizeProjectPath.ts` in pixel-agents).
pub fn normalize_project_path(path: &str) -> String {
    let mut out = String::with_capacity(path.len());
    for c in path.chars() {
        if c.is_ascii_alphanumeric() || c == '-' {
            out.push(c);
        } else {
            for _ in 0..c.len_utf16() {
                out.push('-');
            }
        }
    }
    out
}

/// `2026-11-09T06:14:52.303Z` → ms since the epoch (UTC only; other forms → None).
pub fn parse_iso_ms(s: &str) -> Option<u64> {
    let b = s.as_bytes();
    if b.len() < 19 || b[4] != b'-' || b[7] != b'-' || b[10] != b'T' {
        return None;
    }
    let num = |r: std::ops::Range<usize>| s.get(r)?.parse::<i64>().ok();
    let (y, m, d) = (num(0..4)?, num(5..7)?, num(8..10)?);
    let (hh, mm, ss) = (num(11..13)?, num(14..16)?, num(17..19)?);
    let mut ms = 0i64;
    if b.get(19) == Some(&b'.') {
        let frac: String = s[20..].chars().take_while(char::is_ascii_digit).collect();
        let f3: String = format!("{frac:0<3}").chars().take(3).collect();
        ms = f3.parse().ok()?;
    }
    // Days from 1970-01-01 (Howard Hinnant's days_from_civil).
    let y2 = if m <= 2 { y - 1 } else { y };
    let era = y2.div_euclid(400);
    let yoe = y2 - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    let total = ((days * 24 + hh) * 60 + mm) * 60 + ss;
    u64::try_from(total * 1000 + ms).ok()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
enum Last {
    #[default]
    Nothing,
    Prompt,
    ToolUse,
    ToolResult,
    Text,
}

#[derive(Debug, Default)]
pub struct ClaudeParser {
    session_id: String,
    custom_title: String,
    agent_name: String,
    summary: String,
    first_prompt: String,
    last_prompt: String,
    last_prompt_hint: String,
    cwd: String,
    entrypoint: String,
    model: String,
    started_at: Option<String>,
    last_at: Option<String>,
    last_at_ms: u64,
    prompt_count: u32,
    last_reply: String,
    context_tokens: u64,
    actions: VecDeque<SessionAction>,
    open: Vec<OpenTool>,
    turn_ended: bool,
    last: Last,
    /// Reads a sub-agent's own transcript (`<session>/subagents/agent-*.jsonl`): its records are
    /// sidechain records, and only an explicit end of turn ends it (no idle guess).
    sidechain: bool,
}

/// Text of a user prompt worth showing, or None for tool results, reminders and command output.
fn prompt_text(raw: &str) -> Option<String> {
    let t = raw.trim();
    if t.is_empty() {
        return None;
    }
    if let Some(rest) = t.strip_prefix("<command-name>") {
        // `/init` and friends: the command is the prompt.
        let name = rest.split("</command-name>").next().unwrap_or("").trim();
        let args = t.split("<command-args>").nth(1).and_then(|a| a.split("</command-args>").next()).unwrap_or("").trim();
        return Some(if args.is_empty() { name.to_string() } else { format!("{name} {args}") });
    }
    if t.starts_with('<') || t.starts_with("Caveat:") {
        return None;
    }
    Some(t.to_string())
}

impl ClaudeParser {
    /// Parser for a sub-agent transcript (see `sidechain`).
    pub fn sub_agent() -> Self {
        ClaudeParser { sidechain: true, ..Default::default() }
    }

    fn push_action(&mut self, a: SessionAction) {
        if self.actions.len() == MAX_ACTIONS {
            self.actions.pop_front();
        }
        self.actions.push_back(a);
    }

    fn on_prompt(&mut self, text: String) {
        if text.starts_with("[Request interrupted") {
            self.open.clear();
            self.turn_ended = true;
            self.last = Last::Text;
            return;
        }
        if self.first_prompt.is_empty() {
            self.first_prompt = text.clone();
        }
        self.last_prompt = text;
        self.prompt_count += 1;
        self.open.clear();
        self.turn_ended = false;
        self.last = Last::Prompt;
    }

    fn on_user(&mut self, rec: &Value) {
        if rec.get("isMeta").and_then(Value::as_bool) == Some(true) || rec.get("isCompactSummary").and_then(Value::as_bool) == Some(true) {
            return;
        }
        let content = rec.pointer("/message/content");
        match content {
            Some(Value::String(s)) => {
                if let Some(t) = prompt_text(s) {
                    self.on_prompt(t);
                }
            }
            Some(Value::Array(items)) => {
                let mut prompt = String::new();
                for it in items {
                    match it.get("type").and_then(Value::as_str) {
                        Some("tool_result") => {
                            if let Some(id) = it.get("tool_use_id").and_then(Value::as_str) {
                                self.open.retain(|o| o.id != id);
                            }
                            self.last = Last::ToolResult;
                        }
                        Some("text") => {
                            if let Some(t) = it.get("text").and_then(Value::as_str).and_then(prompt_text) {
                                if !prompt.is_empty() {
                                    prompt.push('\n');
                                }
                                prompt.push_str(&t);
                            }
                        }
                        _ => {}
                    }
                }
                if !prompt.is_empty() {
                    self.on_prompt(prompt);
                }
            }
            _ => {}
        }
    }

    fn on_assistant(&mut self, rec: &Value, at: Option<&str>) {
        let msg = rec.get("message").unwrap_or(&Value::Null);
        if let Some(m) = msg.get("model").and_then(Value::as_str).filter(|m| !m.starts_with('<')) {
            self.model = m.to_string();
        }
        if let Some(u) = msg.get("usage") {
            let n = |k: &str| u.get(k).and_then(Value::as_u64).unwrap_or(0);
            let total = n("input_tokens") + n("cache_creation_input_tokens") + n("cache_read_input_tokens");
            if total > 0 {
                self.context_tokens = total;
            }
        }
        let mut used_tool = false;
        for it in msg.get("content").and_then(Value::as_array).into_iter().flatten() {
            match it.get("type").and_then(Value::as_str) {
                Some("text") => {
                    let t = it.get("text").and_then(Value::as_str).unwrap_or("").trim();
                    if !t.is_empty() {
                        self.last_reply = t.to_string();
                        self.last = Last::Text;
                    }
                }
                Some("tool_use") => {
                    let tool = it.get("name").and_then(Value::as_str).unwrap_or("tool").to_string();
                    let id = it.get("id").and_then(Value::as_str).unwrap_or("").to_string();
                    let input = it.get("input").unwrap_or(&Value::Null);
                    let (kind, label) = describe(&tool, input);
                    if !id.is_empty() && !self.open.iter().any(|o| o.id == id) {
                        let spawn = matches!(tool.as_str(), "Agent" | "Task");
                        let agent_type = if spawn { Some(input.get("subagent_type").and_then(Value::as_str).filter(|t| !t.is_empty()).unwrap_or("general-purpose").to_string()) } else { None };
                        let background = spawn && input.get("run_in_background").and_then(Value::as_bool) == Some(true);
                        self.open.push(OpenTool { id, tool: tool.clone(), label: label.clone(), agent_type, background });
                    }
                    self.push_action(SessionAction { at: at.map(str::to_string), kind, tool, label });
                    used_tool = true;
                    self.last = Last::ToolUse;
                }
                _ => {}
            }
        }
        if used_tool {
            self.turn_ended = false;
        } else if msg.get("stop_reason").and_then(Value::as_str) == Some("end_turn") && self.open.is_empty() {
            self.turn_ended = true;
        }
    }

    fn title(&self) -> String {
        [&self.custom_title, &self.agent_name, &self.summary]
            .into_iter()
            .find(|t| !t.trim().is_empty())
            .map(|t| one_line(t, 80))
            .unwrap_or_else(|| one_line(&self.first_prompt, 60))
    }

    fn status(&self, modified_ms: u64, now_ms: u64, window_ms: u64) -> SessionStatus {
        let last_ms = self.last_at_ms.max(modified_ms);
        let quiet = now_ms.saturating_sub(last_ms);
        if now_ms.saturating_sub(modified_ms) > window_ms {
            return SessionStatus::Stale;
        }
        if self.open.iter().any(|o| ASKING.contains(&o.tool.as_str())) {
            return SessionStatus::Waiting;
        }
        if self.turn_ended {
            return SessionStatus::Done;
        }
        if !self.open.is_empty() {
            let maybe_permission = self.open.iter().all(|o| !LONG_OR_EXEMPT.contains(&o.tool.as_str()));
            return if maybe_permission && quiet > PERMISSION_GUESS_MS { SessionStatus::Waiting } else { SessionStatus::Active };
        }
        if !self.sidechain && matches!(self.last, Last::Text | Last::Nothing) && quiet > IDLE_DONE_MS {
            return SessionStatus::Done;
        }
        SessionStatus::Active
    }
}

impl SessionParser for ClaudeParser {
    fn feed_line(&mut self, line: &str) {
        let Ok(rec) = serde_json::from_str::<Value>(line) else { return };
        let s = |k: &str| rec.get(k).and_then(Value::as_str);
        if let Some(id) = s("sessionId") {
            if self.session_id.is_empty() {
                self.session_id = id.to_string();
            }
        }
        if rec.get("isSidechain").and_then(Value::as_bool) == Some(true) && !self.sidechain {
            return; // sub-agent records (older Claude Code wrote them inline)
        }
        let kind = s("type").unwrap_or("");
        let at = s("timestamp");
        if matches!(kind, "user" | "assistant" | "system") {
            if let Some(c) = s("cwd") {
                self.cwd = c.to_string();
            }
            if let Some(e) = s("entrypoint") {
                self.entrypoint = e.to_string();
            }
            if let Some(t) = at {
                if self.started_at.is_none() {
                    self.started_at = Some(t.to_string());
                }
                self.last_at = Some(t.to_string());
                self.last_at_ms = parse_iso_ms(t).unwrap_or(self.last_at_ms);
            }
        }
        match kind {
            "user" => self.on_user(&rec),
            "assistant" => self.on_assistant(&rec, at),
            "system" if s("subtype") == Some("turn_duration") => {
                self.open.clear();
                self.turn_ended = true;
            }
            "last-prompt" => {
                if let Some(p) = s("lastPrompt") {
                    self.last_prompt_hint = p.to_string();
                }
            }
            "custom-title" => self.custom_title = s("customTitle").unwrap_or("").to_string(),
            "agent-name" => self.agent_name = s("agentName").unwrap_or("").to_string(),
            "summary" => self.summary = s("summary").unwrap_or("").to_string(),
            _ => {}
        }
    }

    fn session(&self, path: &Path, modified_ms: u64, now_ms: u64, window_ms: u64) -> AgentSession {
        let session_id = if self.session_id.is_empty() { path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default() } else { self.session_id.clone() };
        let last_prompt = if self.last_prompt.is_empty() { &self.last_prompt_hint } else { &self.last_prompt };
        let max_context = if self.model.contains("[1m]") || self.context_tokens > 200_000 { 1_000_000 } else { 200_000 };
        AgentSession {
            provider: ID.into(),
            session_id,
            title: self.title(),
            cwd: self.cwd.clone(),
            transcript_path: path.to_string_lossy().into_owned(),
            entrypoint: self.entrypoint.clone(),
            model: self.model.clone(),
            started_at: self.started_at.clone(),
            last_activity_at: self.last_at.clone(),
            modified_ms,
            status: self.status(modified_ms, now_ms, window_ms),
            last_prompt: clip(last_prompt, TEXT_MAX),
            last_reply: clip(&self.last_reply, TEXT_MAX),
            prompt_count: self.prompt_count,
            context_tokens: self.context_tokens,
            max_context_tokens: max_context,
            actions: self.actions.iter().cloned().collect(),
            open_tools: self.open.clone(),
        }
    }
}

/// One entry of a conversation as Chat shows it; the same shape as `ChatItem` in `src/lib/chatEvents.ts`.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TalkItem {
    User { text: String },
    Assistant { text: String, streaming: bool },
    Tool { id: String, name: String, label: String, done: bool, error: bool },
    Notice { tone: &'static str, text: String },
}

/// A session's conversation for Chat (`chat_history`).
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub items: Vec<TalkItem>,
    /// The transcript is longer than what was read or kept: `items` is its end.
    pub truncated: bool,
}

/// Bytes read from the end of a transcript for its conversation, and entries kept.
pub const TALK_BYTES: u64 = 8 * 1024 * 1024;
pub const TALK_ITEMS: usize = 1_000;
/// One prompt or reply is cut to this many characters.
const TALK_TEXT_MAX: usize = 20_000;

/// The main conversation in transcript lines: prompts, replies and tool calls in order. Sub-agent
/// records, reminders and command output are left out, as in the session summary.
pub fn conversation_from_lines<'a>(lines: impl IntoIterator<Item = &'a str>) -> Vec<TalkItem> {
    let mut items: Vec<TalkItem> = Vec::new();
    let prompt = |items: &mut Vec<TalkItem>, text: String| {
        if text.starts_with("[Request interrupted") {
            items.push(TalkItem::Notice { tone: "info", text: "Interrupted.".into() });
        } else {
            items.push(TalkItem::User { text: clip(&text, TALK_TEXT_MAX) });
        }
    };
    for line in lines {
        let Ok(rec) = serde_json::from_str::<Value>(line) else { continue };
        let flag = |k: &str| rec.get(k).and_then(Value::as_bool) == Some(true);
        if flag("isSidechain") || flag("isMeta") {
            continue;
        }
        let content = rec.pointer("/message/content");
        match rec.get("type").and_then(Value::as_str) {
            Some("user") if flag("isCompactSummary") => items.push(TalkItem::Notice { tone: "info", text: "The conversation above was compacted here.".into() }),
            Some("user") => match content {
                Some(Value::String(s)) => {
                    if let Some(t) = prompt_text(s) {
                        prompt(&mut items, t);
                    }
                }
                Some(Value::Array(parts)) => {
                    let mut text = String::new();
                    for p in parts {
                        match p.get("type").and_then(Value::as_str) {
                            Some("tool_result") => {
                                let id = p.get("tool_use_id").and_then(Value::as_str).unwrap_or("");
                                let failed = p.get("is_error").and_then(Value::as_bool) == Some(true);
                                if let Some(TalkItem::Tool { done, error, .. }) = items.iter_mut().rev().find(|it| matches!(it, TalkItem::Tool { id: i, .. } if i == id)) {
                                    (*done, *error) = (true, failed);
                                }
                            }
                            Some("text") => {
                                if let Some(t) = p.get("text").and_then(Value::as_str).and_then(prompt_text) {
                                    if !text.is_empty() {
                                        text.push('\n');
                                    }
                                    text.push_str(&t);
                                }
                            }
                            _ => {}
                        }
                    }
                    if !text.is_empty() {
                        prompt(&mut items, text);
                    }
                }
                _ => {}
            },
            Some("assistant") => {
                for p in content.and_then(Value::as_array).into_iter().flatten() {
                    match p.get("type").and_then(Value::as_str) {
                        Some("text") => {
                            let t = p.get("text").and_then(Value::as_str).unwrap_or("").trim();
                            if !t.is_empty() {
                                items.push(TalkItem::Assistant { text: clip(t, TALK_TEXT_MAX), streaming: false });
                            }
                        }
                        Some("tool_use") => {
                            let id = p.get("id").and_then(Value::as_str).unwrap_or("");
                            let name = p.get("name").and_then(Value::as_str).unwrap_or("tool");
                            if !id.is_empty() && !items.iter().any(|it| matches!(it, TalkItem::Tool { id: i, .. } if i == id)) {
                                let (_, label) = describe(name, p.get("input").unwrap_or(&Value::Null));
                                items.push(TalkItem::Tool { id: id.into(), name: name.into(), label, done: false, error: false });
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }
    // What is read back is over: nothing is shown as still running.
    for it in &mut items {
        if let TalkItem::Tool { done, .. } = it {
            *done = true;
        }
    }
    items
}

/// The conversation of the transcript at `path`: all of it, or its end when it is longer than
/// `TALK_BYTES` / `TALK_ITEMS`.
pub fn conversation(path: &Path) -> Result<Conversation, crate::core::CoreError> {
    let len = std::fs::metadata(path).map_err(|e| crate::core::CoreError::io(path, e))?.len();
    let (lines, _) = super::read_lines_from(path, len.saturating_sub(TALK_BYTES))?;
    let mut items = conversation_from_lines(lines.iter().map(String::as_str));
    let mut truncated = len > TALK_BYTES;
    if items.len() > TALK_ITEMS {
        items.drain(..items.len() - TALK_ITEMS);
        truncated = true;
    }
    Ok(Conversation { items, truncated })
}

pub struct ClaudeProvider {
    root: PathBuf,
}

impl ClaudeProvider {
    pub fn new(root: PathBuf) -> Self {
        ClaudeProvider { root }
    }

    fn jsonl_in(dir: &Path) -> Vec<PathBuf> {
        std::fs::read_dir(dir)
            .into_iter()
            .flatten()
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.is_file() && p.extension().is_some_and(|x| x.eq_ignore_ascii_case("jsonl")))
            .collect()
    }

    /// The session folder for `dir`, matched without case (drive letters differ: `c:` vs `C:`).
    pub fn project_dir(&self, dir: &Path) -> Option<PathBuf> {
        let want = normalize_project_path(&dir.to_string_lossy().trim_end_matches(['\\', '/']).to_string());
        let exact = self.root.join(&want);
        if exact.is_dir() {
            return Some(exact);
        }
        let lower = want.to_lowercase();
        std::fs::read_dir(&self.root).ok()?.flatten().map(|e| e.path()).find(|p| p.is_dir() && p.file_name().is_some_and(|n| n.to_string_lossy().to_lowercase() == lower))
    }
}

impl AgentProvider for ClaudeProvider {
    fn id(&self) -> &'static str {
        ID
    }

    fn display_name(&self) -> &'static str {
        "Claude Code"
    }

    fn detect(&self, now_ms: u64, window_ms: u64) -> ProviderStatus {
        let found = self.root.is_dir();
        let active = if found { self.session_files().iter().filter(|p| now_ms.saturating_sub(super::modified_ms(p)) <= window_ms).count() } else { 0 };
        ProviderStatus {
            id: ID.into(),
            name: self.display_name().into(),
            state: if active > 0 {
                ProviderState::Active
            } else if found {
                ProviderState::Detected
            } else {
                ProviderState::NotFound
            },
            session_root: Some(self.root.to_string_lossy().into_owned()),
            sessions: active,
            observable: true,
            note: if found { "CLI, Desktop app and IDE sessions (transcripts)".into() } else { "Run `claude` once to create ~/.claude/projects".into() },
        }
    }

    fn session_files(&self) -> Vec<PathBuf> {
        std::fs::read_dir(&self.root).into_iter().flatten().flatten().map(|e| e.path()).filter(|p| p.is_dir()).flat_map(|d| Self::jsonl_in(&d)).collect()
    }

    fn sessions_for_project(&self, dir: &Path) -> Vec<PathBuf> {
        self.project_dir(dir).map(|d| Self::jsonl_in(&d)).unwrap_or_default()
    }

    fn parser(&self) -> Option<Box<dyn SessionParser>> {
        Some(Box::new(ClaudeParser::default()))
    }

    /// `<session>.jsonl` → `<session>/subagents/agent-<id>.jsonl`, each with `agent-<id>.meta.json`
    /// (`toolUseId`, `agentType`, `description`, `finished`). A transcript without a readable
    /// sidecar is skipped: it cannot be tied to the call that started it (it is tried again later).
    fn sub_agents(&self, session: &Path) -> Vec<SubAgentFile> {
        let dir = session.with_extension("").join("subagents");
        let Ok(rd) = std::fs::read_dir(&dir) else { return Vec::new() };
        rd.flatten()
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|x| x.eq_ignore_ascii_case("jsonl")) && p.file_stem().is_some_and(|n| n.to_string_lossy().starts_with("agent-")))
            .filter_map(|path| {
                let meta: Value = serde_json::from_slice(&std::fs::read(path.with_extension("meta.json")).ok()?).ok()?;
                let s = |k: &str| meta.get(k).and_then(Value::as_str).unwrap_or("").to_string();
                let tool_use_id = s("toolUseId");
                if tool_use_id.is_empty() {
                    return None;
                }
                let agent_type = Some(s("agentType")).filter(|t| !t.is_empty()).unwrap_or_else(|| "general-purpose".into());
                Some(SubAgentFile { tool_use_id, agent_type, description: s("description"), finished: meta.get("finished").and_then(Value::as_bool) == Some(true), path })
            })
            .collect()
    }

    fn sub_parser(&self) -> Option<Box<dyn SessionParser>> {
        Some(Box::new(ClaudeParser::sub_agent()))
    }
}

/// Sample transcript lines for tests (here and in the observer / commands).
#[cfg(test)]
pub mod fixtures {
    use serde_json::json;

    pub fn user(text: &str, at: &str) -> String {
        json!({ "type": "user", "sessionId": "s1", "cwd": "D:\\Game", "entrypoint": "cli", "timestamp": at, "message": { "role": "user", "content": text } }).to_string()
    }
    pub fn tool_use(id: &str, name: &str, input: serde_json::Value, at: &str) -> String {
        json!({ "type": "assistant", "sessionId": "s1", "cwd": "D:\\Game", "timestamp": at, "message": { "model": "claude-opus-5-5", "content": [{ "type": "tool_use", "id": id, "name": name, "input": input }], "usage": { "input_tokens": 10, "cache_read_input_tokens": 1000, "cache_creation_input_tokens": 0 } } }).to_string()
    }
    pub fn tool_result(id: &str, at: &str) -> String {
        json!({ "type": "user", "sessionId": "s1", "timestamp": at, "message": { "role": "user", "content": [{ "type": "tool_result", "tool_use_id": id, "content": "ok" }] } }).to_string()
    }
    pub fn reply(text: &str, at: &str) -> String {
        json!({ "type": "assistant", "sessionId": "s1", "timestamp": at, "message": { "model": "claude-opus-5-5", "stop_reason": "end_turn", "content": [{ "type": "text", "text": text }] } }).to_string()
    }
    pub fn title(t: &str) -> String {
        json!({ "type": "custom-title", "customTitle": t, "sessionId": "s1" }).to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::fixtures::*;
    use super::*;

    #[test]
    fn conversation_keeps_prompts_replies_and_tools_in_order() {
        let at = "2026-11-09T06:00:00Z";
        let failed = serde_json::json!({ "type": "user", "sessionId": "s1", "timestamp": at, "message": { "role": "user", "content": [{ "type": "tool_result", "tool_use_id": "t2", "is_error": true, "content": "exit 1" }] } }).to_string();
        let side = serde_json::json!({ "type": "assistant", "isSidechain": true, "message": { "content": [{ "type": "text", "text": "sub-agent talk" }] } }).to_string();
        let compact = serde_json::json!({ "type": "user", "isCompactSummary": true, "message": { "role": "user", "content": "This session is being continued…" } }).to_string();
        let lines = [
            user("Fix the build", at),
            user("<system-reminder>not a prompt</system-reminder>", at),
            tool_use("t1", "Read", serde_json::json!({ "file_path": "D:\\Game\\src\\main.rs" }), at),
            tool_use("t1", "Read", serde_json::json!({ "file_path": "D:\\Game\\src\\main.rs" }), at),
            tool_result("t1", at),
            tool_use("t2", "Bash", serde_json::json!({ "command": "cargo build" }), at),
            failed,
            side,
            "not json".to_string(),
            reply("Fixed.", at),
            compact,
            user("[Request interrupted by user]", at),
            user("Now the tests", at),
            tool_use("t3", "Edit", serde_json::json!({ "file_path": "a.rs" }), at),
        ];
        let items = conversation_from_lines(lines.iter().map(String::as_str));
        let tool = |id: &str, name: &str, label: &str, error: bool| TalkItem::Tool { id: id.into(), name: name.into(), label: label.into(), done: true, error };
        assert_eq!(
            items,
            [
                TalkItem::User { text: "Fix the build".into() },
                tool("t1", "Read", "Reading main.rs", false),
                tool("t2", "Bash", "Running: cargo build", true),
                TalkItem::Assistant { text: "Fixed.".into(), streaming: false },
                TalkItem::Notice { tone: "info", text: "The conversation above was compacted here.".into() },
                TalkItem::Notice { tone: "info", text: "Interrupted.".into() },
                TalkItem::User { text: "Now the tests".into() },
                tool("t3", "Edit", "Editing a.rs", false),
            ]
        );
        // The JSON is what `ChatItem` in src/lib/chatEvents.ts expects.
        assert_eq!(serde_json::to_value(&items[1]).unwrap(), serde_json::json!({ "kind": "tool", "id": "t1", "name": "Read", "label": "Reading main.rs", "done": true, "error": false }));
        assert_eq!(serde_json::to_value(&items[3]).unwrap(), serde_json::json!({ "kind": "assistant", "text": "Fixed.", "streaming": false }));
        assert_eq!(serde_json::to_value(&items[5]).unwrap(), serde_json::json!({ "kind": "notice", "tone": "info", "text": "Interrupted." }));
    }

    /// A real transcript, by hand: `PRIMEOFFICE_TRANSCRIPT=<file> cargo test real_transcript -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn real_transcript_conversation() {
        let path = std::env::var("PRIMEOFFICE_TRANSCRIPT").expect("PRIMEOFFICE_TRANSCRIPT");
        let talk = conversation(Path::new(&path)).unwrap();
        let count = |f: fn(&TalkItem) -> bool| talk.items.iter().filter(|it| f(it)).count();
        println!(
            "{} items (truncated: {}): {} prompts, {} replies, {} tools, {} notices",
            talk.items.len(),
            talk.truncated,
            count(|it| matches!(it, TalkItem::User { .. })),
            count(|it| matches!(it, TalkItem::Assistant { .. })),
            count(|it| matches!(it, TalkItem::Tool { .. })),
            count(|it| matches!(it, TalkItem::Notice { .. })),
        );
        for it in talk.items.iter().take(6) {
            println!("{}", one_line(&serde_json::to_string(it).unwrap(), 160));
        }
        assert!(!talk.items.is_empty());
    }

    #[test]
    fn conversation_of_a_long_transcript_is_its_end() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s1.jsonl");
        let at = "2026-11-09T06:00:00Z";
        let text: String = (0..TALK_ITEMS + 5).map(|i| user(&format!("prompt {i}"), at) + "\n").collect();
        std::fs::write(&path, text).unwrap();
        let talk = conversation(&path).unwrap();
        assert!(talk.truncated);
        assert_eq!(talk.items.len(), TALK_ITEMS);
        assert_eq!(talk.items.last(), Some(&TalkItem::User { text: format!("prompt {}", TALK_ITEMS + 4) }));
        std::fs::write(&path, user("only one", at) + "\n").unwrap();
        assert_eq!(conversation(&path).unwrap(), Conversation { items: vec![TalkItem::User { text: "only one".into() }], truncated: false });
        assert!(conversation(&dir.path().join("missing.jsonl")).is_err());
    }
    use serde_json::json;

    const T0: &str = "2026-11-09T06:00:00.000Z";
    const T1: &str = "2026-11-09T06:00:01.000Z";
    const T2: &str = "2026-11-09T06:00:02.500Z";

    fn parse(lines: &[String]) -> ClaudeParser {
        let mut p = ClaudeParser::default();
        lines.iter().for_each(|l| p.feed_line(l));
        p
    }

    #[test]
    fn normalizes_like_claude_code() {
        assert_eq!(normalize_project_path("P:\\Phineas_LIB\\Gogo_Gadgets"), "P--Phineas-LIB-Gogo-Gadgets");
        assert_eq!(normalize_project_path("D:\\Dự án"), "D--D---n", "one dash per UTF-16 unit");
        assert_eq!(normalize_project_path("a😀b"), "a--b", "surrogate pair → two dashes");
    }

    #[test]
    fn parses_iso_timestamps() {
        assert_eq!(parse_iso_ms("1970-01-01T00:00:01.5Z"), Some(1500));
        assert_eq!(parse_iso_ms("2026-11-09T06:14:52.303Z"), Some(1_794_204_892_303));
        assert_eq!(parse_iso_ms("garbage"), None);
    }

    #[test]
    fn follows_a_turn() {
        let t0 = parse_iso_ms(T0).unwrap();
        let mut p = parse(&[user("Fix the build", T0), tool_use("t1", "Edit", json!({ "file_path": "D:\\Game\\main.rs" }), T1)]);
        let s = p.session(Path::new("x/s1.jsonl"), t0, t0 + 2_000, 60_000);
        assert_eq!((s.status, s.title.as_str(), s.last_prompt.as_str()), (SessionStatus::Active, "Fix the build", "Fix the build"));
        assert_eq!(s.open_tools.len(), 1);
        assert_eq!(s.actions[0].label, "Editing main.rs");
        assert_eq!((s.context_tokens, s.max_context_tokens, s.model.as_str()), (1010, 200_000, "claude-opus-5-5"));

        p.feed_line(&tool_result("t1", T2));
        p.feed_line(&reply("Done: the build is green.", T2));
        p.feed_line(&title("Build fix"));
        let s = p.session(Path::new("x/s1.jsonl"), t0, t0 + 3_000, 60_000);
        assert_eq!((s.status, s.title.as_str(), s.last_reply.as_str()), (SessionStatus::Done, "Build fix", "Done: the build is green."));
        assert!(s.open_tools.is_empty());
        assert_eq!(s.prompt_count, 1);
        assert_eq!(s.cwd, "D:\\Game");
    }

    #[test]
    fn guesses_waiting_states() {
        let t0 = parse_iso_ms(T0).unwrap();
        let p = parse(&[user("Q", T0), tool_use("a", "AskUserQuestion", json!({}), T0)]);
        assert_eq!(p.session(Path::new("s.jsonl"), t0, t0 + 1, 60_000).status, SessionStatus::Waiting);
        let p = parse(&[user("Q", T0), tool_use("e", "Edit", json!({}), T0)]);
        assert_eq!(p.session(Path::new("s.jsonl"), t0, t0 + 1_000, 60_000).status, SessionStatus::Active);
        assert_eq!(p.session(Path::new("s.jsonl"), t0, t0 + 20_000, 60_000).status, SessionStatus::Waiting, "quiet Edit → permission prompt");
        let p = parse(&[user("Q", T0), tool_use("b", "Bash", json!({ "command": "cargo build" }), T0)]);
        assert_eq!(p.session(Path::new("s.jsonl"), t0, t0 + 50_000, 60_000).status, SessionStatus::Active, "Bash runs long");
        assert_eq!(p.session(Path::new("s.jsonl"), t0, t0 + 90_000, 60_000).status, SessionStatus::Stale);
    }

    #[test]
    fn skips_noise_and_garbage() {
        let p = parse(&[
            "not json".into(),
            json!({ "type": "user", "isMeta": true, "message": { "content": "meta" } }).to_string(),
            json!({ "type": "user", "message": { "content": "<system-reminder>x</system-reminder>" } }).to_string(),
            json!({ "type": "user", "message": { "content": "<command-name>/init</command-name><command-args></command-args>" } }).to_string(),
            json!({ "type": "assistant", "isSidechain": true, "message": { "content": [{ "type": "tool_use", "id": "z", "name": "Read" }] } }).to_string(),
            json!({ "type": "weird-new-record", "x": 1 }).to_string(),
            json!({ "type": "last-prompt", "lastPrompt": "hint" }).to_string(),
        ]);
        let s = p.session(Path::new("abc.jsonl"), 0, 0, 1);
        assert_eq!((s.last_prompt.as_str(), s.prompt_count, s.session_id.as_str()), ("/init", 1, "abc"));
        assert!(s.open_tools.is_empty(), "sidechain tool ignored");
    }

    #[test]
    fn interrupt_ends_the_turn() {
        let p = parse(&[user("Go", T0), tool_use("t", "Edit", json!({}), T0), user("[Request interrupted by user]", T1)]);
        let s = p.session(Path::new("s.jsonl"), 0, 0, u64::MAX);
        assert_eq!((s.status, s.prompt_count), (SessionStatus::Done, 1));
    }

    #[test]
    fn notes_sub_agent_spawns() {
        let p = parse(&[
            user("Go", T0),
            tool_use("a", "Agent", json!({ "description": "Review", "subagent_type": "qa-lead", "run_in_background": true }), T0),
            tool_use("b", "Task", json!({ "description": "Look" }), T0),
            tool_use("c", "Read", json!({ "file_path": "x" }), T0),
        ]);
        let s = p.session(Path::new("s.jsonl"), 0, 0, u64::MAX);
        let got: Vec<(Option<&str>, bool)> = s.open_tools.iter().map(|o| (o.agent_type.as_deref(), o.background)).collect();
        assert_eq!(got, [(Some("qa-lead"), true), (Some("general-purpose"), false), (None, false)]);
    }

    #[test]
    fn sub_agent_parser_reads_sidechain_and_waits_for_the_end() {
        let t0 = parse_iso_ms(T0).unwrap();
        let side = json!({ "type": "assistant", "isSidechain": true, "timestamp": T0, "message": { "content": [{ "type": "text", "text": "Thinking aloud" }] } }).to_string();
        let mut p = ClaudeParser::sub_agent();
        p.feed_line(&side);
        assert_eq!(p.session(Path::new("a.jsonl"), t0, t0 + 60_000, u64::MAX).status, SessionStatus::Active, "no idle guess");
        p.feed_line(&reply("Done", T1));
        assert_eq!(p.session(Path::new("a.jsonl"), t0, t0 + 1, u64::MAX).status, SessionStatus::Done);
    }

    #[test]
    fn lists_sub_agents_from_their_sidecars() {
        let home = tempfile::tempdir().unwrap();
        let subs = home.path().join("D--Game").join("s1").join("subagents");
        std::fs::create_dir_all(&subs).unwrap();
        for n in ["agent-a", "agent-b", "agent-c"] {
            std::fs::write(subs.join(format!("{n}.jsonl")), "").unwrap();
        }
        std::fs::write(subs.join("agent-a.meta.json"), json!({ "agentType": "writer", "description": "Lore", "toolUseId": "toolu_1", "finished": true }).to_string()).unwrap();
        std::fs::write(subs.join("agent-b.meta.json"), json!({ "description": "x", "toolUseId": "toolu_2" }).to_string()).unwrap();
        // agent-c: no sidecar → skipped.
        let p = ClaudeProvider::new(home.path().to_path_buf());
        let mut found = p.sub_agents(&home.path().join("D--Game").join("s1.jsonl"));
        found.sort_by(|a, b| a.tool_use_id.cmp(&b.tool_use_id));
        let got: Vec<(&str, &str, bool)> = found.iter().map(|f| (f.tool_use_id.as_str(), f.agent_type.as_str(), f.finished)).collect();
        assert_eq!(got, [("toolu_1", "writer", true), ("toolu_2", "general-purpose", false)]);
        assert!(p.sub_agents(&home.path().join("D--Game").join("none.jsonl")).is_empty());
    }

    #[test]
    fn finds_project_sessions_without_case() {
        let home = tempfile::tempdir().unwrap();
        let root = home.path().join("projects");
        std::fs::create_dir_all(root.join("D--Game")).unwrap();
        std::fs::write(root.join("D--Game").join("s1.jsonl"), user("hi", T0) + "\n").unwrap();
        let p = ClaudeProvider::new(root);
        assert_eq!(p.sessions_for_project(Path::new("d:\\Game\\")).len(), 1);
        assert_eq!(p.sessions_for_project(Path::new("D:\\Other")).len(), 0);
        assert_eq!(p.session_files().len(), 1);
        assert_eq!(p.detect(0, u64::MAX).state, ProviderState::Active);
    }
}
