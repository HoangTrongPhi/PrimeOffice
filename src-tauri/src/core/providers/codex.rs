//! Codex CLI (ChatGPT): rollouts at `~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<id>.jsonl`, one
//! `{ timestamp, ordinal, type, payload }` record per line (verified on Codex CLI 0.167, see
//! docs/FORMATS.md). No public contract: every field is optional and unknown records are skipped.
//! Only the rollouts are read — never `auth.json` or the SQLite state beside them.

use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::Value;

use super::claude::parse_iso_ms;
use super::{AgentProvider, AgentSession, OpenTool, ProviderState, ProviderStatus, SessionAction, SessionParser, SessionStatus};
use crate::core::activity::{clip, one_line, ActionKind};

pub const ID: &str = "codex";
const MAX_ACTIONS: usize = 50;
const TEXT_MAX: usize = 500;
const CMD_MAX: usize = 60;
/// No open tool and no new record for this long: the turn is over (a `task_complete` may be missing).
const IDLE_DONE_MS: u64 = 5_000;
/// Used until a `token_count` / `task_started` record says the real window.
const DEFAULT_CONTEXT: u64 = 200_000;
/// The first line of a rollout (`session_meta`) carries the base instructions: it is long.
const META_LINE_MAX: u64 = 4 * 1024 * 1024;

#[derive(Debug, Default)]
pub struct CodexParser {
    session_id: String,
    cwd: String,
    entrypoint: String,
    model: String,
    started_at: Option<String>,
    last_at: Option<String>,
    last_at_ms: u64,
    first_prompt: String,
    last_prompt: String,
    prompt_count: u32,
    last_reply: String,
    context_tokens: u64,
    context_window: u64,
    actions: VecDeque<SessionAction>,
    open: Vec<OpenTool>,
    turn_ended: bool,
}

/// Text of a `message` payload: its `input_text` / `output_text` / `text` parts joined.
fn message_text(payload: &Value) -> String {
    let mut out = String::new();
    for part in payload.get("content").and_then(Value::as_array).into_iter().flatten() {
        if let Some(t) = part.get("text").and_then(Value::as_str) {
            if !out.is_empty() {
                out.push('\n');
            }
            out.push_str(t);
        }
    }
    out.trim().to_string()
}

/// A JS/JSON string literal starting right after its opening quote, unescaped.
fn read_string_literal(s: &str, quote: char) -> String {
    let mut out = String::new();
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        match c {
            '\\' => match chars.next() {
                Some('n') | Some('r') | Some('t') => out.push(' '),
                Some(other) => out.push(other),
                None => break,
            },
            c if c == quote => break,
            c => out.push(c),
        }
    }
    out
}

/// The shell command of a tool call. Codex 0.167 sends JavaScript (`tools.exec_command({cmd:"…"})`);
/// older versions sent JSON arguments (`{"command":["bash","-lc","…"]}` or `{"cmd":"…"}`).
fn command_of(raw: &str) -> Option<String> {
    if let Ok(v) = serde_json::from_str::<Value>(raw) {
        let cmd = v.get("cmd").or_else(|| v.get("command"))?;
        return match cmd {
            Value::String(s) => Some(s.clone()),
            // `["bash", "-lc", "<script>"]`: the script is the last item.
            Value::Array(items) => items.last().and_then(Value::as_str).map(str::to_string),
            _ => None,
        };
    }
    for key in ["cmd:", "\"cmd\":", "command:", "\"command\":"] {
        if let Some(i) = raw.find(key) {
            let rest = raw[i + key.len()..].trim_start();
            let quote = rest.chars().next()?;
            if matches!(quote, '"' | '\'' | '`') {
                return Some(read_string_literal(&rest[1..], quote));
            }
        }
    }
    None
}

/// `*** Update File: src/a.rs` → "Editing a.rs" (the first file of the patch).
fn patch_label(raw: &str) -> String {
    for (marker, verb) in [("*** Update File: ", "Editing"), ("*** Add File: ", "Writing"), ("*** Delete File: ", "Deleting")] {
        if let Some(i) = raw.find(marker) {
            let path: String = raw[i + marker.len()..].chars().take_while(|c| !matches!(c, '\n' | '\r' | '\\' | '"')).collect();
            let name = path.trim().rsplit(['/', '\\']).next().unwrap_or("").to_string();
            if !name.is_empty() {
                return format!("{verb} {name}");
            }
        }
    }
    "Editing files".into()
}

/// `(kind, label)` for one Codex tool call (`custom_tool_call`, `function_call`, `local_shell_call`).
fn describe_call(name: &str, payload: &Value) -> (ActionKind, String) {
    let raw = payload.get("input").or_else(|| payload.get("arguments")).and_then(Value::as_str).unwrap_or("");
    if name == "apply_patch" || raw.contains("apply_patch") || raw.contains("*** Begin Patch") {
        return (ActionKind::Edit, patch_label(raw));
    }
    let shell = payload.pointer("/action/command").and_then(Value::as_array).and_then(|a| a.last()).and_then(Value::as_str).map(str::to_string);
    if let Some(cmd) = shell.or_else(|| command_of(raw)).filter(|c| !c.trim().is_empty()) {
        return (ActionKind::Run, format!("Running: {}", one_line(&cmd, CMD_MAX)));
    }
    match name {
        "exec" | "shell" | "exec_command" | "local_shell" | "container.exec" => (ActionKind::Run, "Running a command".into()),
        "web_search" | "web.run" => (ActionKind::Web, "Searching the web".into()),
        "update_plan" => (ActionKind::Plan, "Planning".into()),
        "view_image" => (ActionKind::Read, "Viewing an image".into()),
        _ => (ActionKind::Other, format!("Using {}", name.rsplit("__").next().unwrap_or(name))),
    }
}

impl CodexParser {
    fn on_prompt(&mut self, text: String) {
        if self.first_prompt.is_empty() {
            self.first_prompt = text.clone();
        }
        self.last_prompt = text;
        self.prompt_count += 1;
        self.open.clear();
        self.turn_ended = false;
    }

    fn on_tool_call(&mut self, payload: &Value, at: Option<&str>) {
        let name = payload.get("name").and_then(Value::as_str).unwrap_or("shell").to_string();
        let id = payload.get("call_id").or_else(|| payload.get("id")).and_then(Value::as_str).unwrap_or("").to_string();
        let (kind, label) = describe_call(&name, payload);
        if !id.is_empty() && !self.open.iter().any(|o| o.id == id) {
            self.open.push(OpenTool { id, tool: name.clone(), label: label.clone(), agent_type: None, background: false });
        }
        if self.actions.len() == MAX_ACTIONS {
            self.actions.pop_front();
        }
        self.actions.push_back(SessionAction { at: at.map(str::to_string), kind, tool: name, label });
        self.turn_ended = false;
    }

    fn on_response_item(&mut self, payload: &Value, at: Option<&str>) {
        match payload.get("type").and_then(Value::as_str).unwrap_or("") {
            "message" => {
                let text = message_text(payload);
                match payload.get("role").and_then(Value::as_str) {
                    // Context the CLI injects (`<environment_context>…`) is not a prompt.
                    Some("user") if !text.is_empty() && !text.starts_with('<') => self.on_prompt(text),
                    Some("assistant") if !text.is_empty() => self.last_reply = text,
                    _ => {}
                }
            }
            "custom_tool_call" | "function_call" | "local_shell_call" => self.on_tool_call(payload, at),
            "custom_tool_call_output" | "function_call_output" | "local_shell_call_output" => {
                if let Some(id) = payload.get("call_id").and_then(Value::as_str) {
                    self.open.retain(|o| o.id != id);
                }
            }
            _ => {}
        }
    }

    fn on_event(&mut self, payload: &Value) {
        let window = |v: &Value| v.get("model_context_window").and_then(Value::as_u64).filter(|w| *w > 0);
        match payload.get("type").and_then(Value::as_str).unwrap_or("") {
            "task_started" => {
                self.open.clear();
                self.turn_ended = false;
                if let Some(w) = window(payload) {
                    self.context_window = w;
                }
            }
            "task_complete" | "turn_aborted" => {
                self.open.clear();
                self.turn_ended = true;
                if let Some(t) = payload.get("last_agent_message").and_then(Value::as_str).map(str::trim).filter(|t| !t.is_empty()) {
                    self.last_reply = t.to_string();
                }
            }
            "token_count" => {
                let info = payload.get("info").unwrap_or(&Value::Null);
                // What the last request sent: the context in use (cached tokens are part of it).
                if let Some(n) = info.pointer("/last_token_usage/input_tokens").and_then(Value::as_u64).filter(|n| *n > 0) {
                    self.context_tokens = n;
                }
                if let Some(w) = window(info) {
                    self.context_window = w;
                }
            }
            _ => {}
        }
    }

    fn status(&self, modified_ms: u64, now_ms: u64, window_ms: u64) -> SessionStatus {
        if now_ms.saturating_sub(modified_ms) > window_ms {
            return SessionStatus::Stale;
        }
        if self.turn_ended {
            return SessionStatus::Done;
        }
        if self.open.is_empty() && now_ms.saturating_sub(self.last_at_ms.max(modified_ms)) > IDLE_DONE_MS {
            return SessionStatus::Done;
        }
        SessionStatus::Active
    }
}

impl SessionParser for CodexParser {
    fn feed_line(&mut self, line: &str) {
        let Ok(rec) = serde_json::from_str::<Value>(line) else { return };
        let payload = rec.get("payload").unwrap_or(&Value::Null);
        let at = rec.get("timestamp").and_then(Value::as_str);
        if let Some(t) = at {
            if self.started_at.is_none() {
                self.started_at = Some(t.to_string());
            }
            self.last_at = Some(t.to_string());
            self.last_at_ms = parse_iso_ms(t).unwrap_or(self.last_at_ms);
        }
        let s = |k: &str| payload.get(k).and_then(Value::as_str).filter(|v| !v.is_empty());
        match rec.get("type").and_then(Value::as_str).unwrap_or("") {
            "session_meta" => {
                if let Some(id) = s("id").or_else(|| s("session_id")) {
                    self.session_id = id.to_string();
                }
                if let Some(c) = s("cwd") {
                    self.cwd = c.to_string();
                }
                if let Some(o) = s("originator").or_else(|| s("source")) {
                    self.entrypoint = o.to_string();
                }
            }
            "turn_context" => {
                if let Some(m) = s("model") {
                    self.model = m.to_string();
                }
                if let Some(c) = s("cwd") {
                    self.cwd = c.to_string();
                }
            }
            "response_item" => self.on_response_item(payload, at),
            "event_msg" => self.on_event(payload),
            _ => {}
        }
    }

    fn session(&self, path: &Path, modified_ms: u64, now_ms: u64, window_ms: u64) -> AgentSession {
        let session_id = if self.session_id.is_empty() { path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default() } else { self.session_id.clone() };
        AgentSession {
            provider: ID.into(),
            session_id,
            title: one_line(&self.first_prompt, 60),
            cwd: self.cwd.clone(),
            transcript_path: path.to_string_lossy().into_owned(),
            entrypoint: self.entrypoint.clone(),
            model: self.model.clone(),
            started_at: self.started_at.clone(),
            last_activity_at: self.last_at.clone(),
            modified_ms,
            status: self.status(modified_ms, now_ms, window_ms),
            last_prompt: clip(&self.last_prompt, TEXT_MAX),
            last_reply: clip(&self.last_reply, TEXT_MAX),
            prompt_count: self.prompt_count,
            context_tokens: self.context_tokens,
            max_context_tokens: if self.context_window > 0 { self.context_window } else { DEFAULT_CONTEXT },
            actions: self.actions.iter().cloned().collect(),
            open_tools: self.open.clone(),
        }
    }
}

pub struct CodexProvider {
    root: PathBuf,
    /// Rollout → the folder it ran in (lower case, no trailing slash). A rollout's `session_meta`
    /// never changes, and the observer asks every second.
    cwds: Mutex<HashMap<PathBuf, String>>,
}

fn folder_key(path: &str) -> String {
    path.trim_end_matches(['\\', '/']).replace('/', "\\").to_lowercase()
}

/// `cwd` of a rollout, from its first line (`session_meta`).
fn rollout_cwd(path: &Path) -> Option<String> {
    let file = std::fs::File::open(path).ok()?;
    let mut line = String::new();
    BufReader::new(file).take(META_LINE_MAX).read_line(&mut line).ok()?;
    let rec: Value = serde_json::from_str(&line).ok()?;
    rec.pointer("/payload/cwd").and_then(Value::as_str).map(folder_key)
}

impl CodexProvider {
    pub fn new(root: PathBuf) -> Self {
        CodexProvider { root, cwds: Mutex::new(HashMap::new()) }
    }
}

impl AgentProvider for CodexProvider {
    fn id(&self) -> &'static str {
        ID
    }

    fn display_name(&self) -> &'static str {
        "Codex CLI (ChatGPT)"
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
            note: if found { "Codex CLI sessions (rollout files)".into() } else { "Install Codex CLI and run `codex` once".into() },
        }
    }

    fn session_files(&self) -> Vec<PathBuf> {
        // sessions/YYYY/MM/DD/rollout-*.jsonl
        walkdir::WalkDir::new(&self.root)
            .max_depth(4)
            .into_iter()
            .flatten()
            .filter(|e| e.file_type().is_file())
            .map(|e| e.into_path())
            .filter(|p| p.extension().is_some_and(|x| x.eq_ignore_ascii_case("jsonl")) && p.file_name().is_some_and(|n| n.to_string_lossy().starts_with("rollout-")))
            .collect()
    }

    fn sessions_for_project(&self, dir: &Path) -> Vec<PathBuf> {
        let want = folder_key(&dir.to_string_lossy());
        let files = self.session_files();
        let mut cwds = self.cwds.lock().unwrap_or_else(|e| e.into_inner());
        files
            .into_iter()
            .filter(|f| {
                if !cwds.contains_key(f) {
                    // An empty rollout (just created) is tried again next time.
                    let Some(cwd) = rollout_cwd(f) else { return false };
                    cwds.insert(f.clone(), cwd);
                }
                cwds.get(f).is_some_and(|c| *c == want)
            })
            .collect()
    }

    fn parser(&self) -> Option<Box<dyn SessionParser>> {
        Some(Box::new(CodexParser::default()))
    }
}

/// Sample rollout lines for tests.
#[cfg(test)]
pub mod fixtures {
    use serde_json::json;

    pub fn meta(id: &str, cwd: &str, at: &str) -> String {
        json!({ "timestamp": at, "ordinal": 0, "type": "session_meta", "payload": { "id": id, "session_id": id, "cwd": cwd, "originator": "codex-tui", "base_instructions": { "text": "You are Codex" } } }).to_string()
    }
    pub fn event(kind: &str, extra: serde_json::Value, at: &str) -> String {
        let mut payload = json!({ "type": kind });
        payload.as_object_mut().unwrap().extend(extra.as_object().cloned().unwrap_or_default());
        json!({ "timestamp": at, "type": "event_msg", "payload": payload }).to_string()
    }
    pub fn turn_context(model: &str, at: &str) -> String {
        json!({ "timestamp": at, "type": "turn_context", "payload": { "model": model, "cwd": "D:\\Game" } }).to_string()
    }
    pub fn message(role: &str, text: &str, at: &str) -> String {
        let part = if role == "assistant" { "output_text" } else { "input_text" };
        json!({ "timestamp": at, "type": "response_item", "payload": { "type": "message", "role": role, "content": [{ "type": part, "text": text }] } }).to_string()
    }
    pub fn exec(call_id: &str, input: &str, at: &str) -> String {
        json!({ "timestamp": at, "type": "response_item", "payload": { "type": "custom_tool_call", "status": "completed", "call_id": call_id, "name": "exec", "input": input } }).to_string()
    }
    pub fn exec_output(call_id: &str, at: &str) -> String {
        json!({ "timestamp": at, "type": "response_item", "payload": { "type": "custom_tool_call_output", "call_id": call_id, "output": [{ "type": "input_text", "text": "ok" }] } }).to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::fixtures::*;
    use super::*;
    use serde_json::json;

    const T0: &str = "2026-11-09T08:30:00.000Z";
    const T1: &str = "2026-11-09T08:30:01.000Z";
    const T2: &str = "2026-11-09T08:30:02.000Z";

    fn parse(lines: &[String]) -> CodexParser {
        let mut p = CodexParser::default();
        lines.iter().for_each(|l| p.feed_line(l));
        p
    }

    #[test]
    fn follows_a_turn() {
        let t0 = parse_iso_ms(T0).unwrap();
        let mut p = parse(&[
            meta("abc", "D:\\Game", T0),
            event("task_started", json!({ "model_context_window": 258400 }), T0),
            message("developer", "<permissions instructions>", T0),
            message("user", "<environment_context>\n<cwd>D:\\Game</cwd>", T0),
            turn_context("gpt-6-luna", T0),
            message("user", "Fix the build", T0),
            message("assistant", "I'll look at the build first.", T1),
            exec("call_1", r#"const r = await tools.exec_command({cmd:"cargo build --release","workdir":"D:\\Game"});"#, T1),
        ]);
        let s = p.session(Path::new("x/rollout-1.jsonl"), t0, t0 + 2_000, 60_000);
        assert_eq!((s.provider.as_str(), s.session_id.as_str(), s.status), ("codex", "abc", SessionStatus::Active));
        assert_eq!((s.title.as_str(), s.prompt_count, s.cwd.as_str()), ("Fix the build", 1, "D:\\Game"));
        assert_eq!((s.model.as_str(), s.entrypoint.as_str(), s.max_context_tokens), ("gpt-6-luna", "codex-tui", 258_400));
        assert_eq!(s.actions[0].label, "Running: cargo build --release");
        assert_eq!(s.open_tools.len(), 1);
        assert_eq!(p.session(Path::new("x"), t0, t0 + 50_000, 60_000).status, SessionStatus::Active, "an open command runs long");

        p.feed_line(&exec_output("call_1", T2));
        p.feed_line(&event("token_count", json!({ "info": { "last_token_usage": { "input_tokens": 13797, "cached_input_tokens": 10880 }, "model_context_window": 258400 } }), T2));
        p.feed_line(&event("task_complete", json!({ "last_agent_message": "Done: the build is green." }), T2));
        let s = p.session(Path::new("x/rollout-1.jsonl"), t0, t0 + 3_000, 60_000);
        assert_eq!((s.status, s.last_reply.as_str(), s.context_tokens), (SessionStatus::Done, "Done: the build is green.", 13_797));
        assert!(s.open_tools.is_empty());
        assert_eq!(p.session(Path::new("x"), t0, t0 + 90_000, 60_000).status, SessionStatus::Stale);
    }

    #[test]
    fn idle_without_task_complete_is_done() {
        let t0 = parse_iso_ms(T0).unwrap();
        let p = parse(&[message("user", "Hi", T0), message("assistant", "Hello", T0)]);
        assert_eq!(p.session(Path::new("r.jsonl"), t0, t0 + 1_000, 60_000).status, SessionStatus::Active);
        assert_eq!(p.session(Path::new("r.jsonl"), t0, t0 + 6_000, 60_000).status, SessionStatus::Done);
        assert_eq!(p.session(Path::new("rollout-x.jsonl"), 0, 0, u64::MAX).session_id, "rollout-x", "no session_meta → file name");
    }

    #[test]
    fn labels_tool_calls() {
        let call = |name: &str, payload: serde_json::Value| describe_call(name, &payload);
        assert_eq!(call("exec", json!({ "input": "const r = await tools.exec_command({cmd:\"git log -5 --pretty=format:\\\"%s\\\"\"});" })).1, "Running: git log -5 --pretty=format:\"%s\"");
        assert_eq!(call("shell", json!({ "arguments": "{\"command\":[\"bash\",\"-lc\",\"npm test\"]}" })), (ActionKind::Run, "Running: npm test".into()));
        assert_eq!(call("local_shell", json!({ "action": { "command": ["pwsh", "-c", "dir"] } })).1, "Running: dir");
        assert_eq!(call("apply_patch", json!({ "input": "*** Begin Patch\n*** Update File: src/main.rs\n@@" })), (ActionKind::Edit, "Editing main.rs".into()));
        assert_eq!(call("exec", json!({ "input": "await tools.apply_patch({patch:\"*** Begin Patch\\n*** Add File: docs/A.md\\n+x\"})" })).1, "Writing A.md");
        assert_eq!(call("exec", json!({ "input": "text(ALL_TOOLS.filter(x => x));" })).1, "Running a command");
        assert_eq!(call("mcp__srv__do_thing", json!({})), (ActionKind::Other, "Using do_thing".into()));
    }

    #[test]
    fn skips_noise_and_garbage() {
        let p = parse(&["not json".into(), json!({ "type": "world_state", "payload": { "full": true } }).to_string(), json!({ "type": "response_item", "payload": { "type": "reasoning", "encrypted_content": "x" } }).to_string(), json!({ "type": "response_item" }).to_string(), json!({ "payload": 3 }).to_string()]);
        let s = p.session(Path::new("r.jsonl"), 0, 0, u64::MAX);
        assert_eq!((s.prompt_count, s.actions.len(), s.title.as_str()), (0, 0, ""));
    }

    #[test]
    fn finds_rollouts_by_folder() {
        let home = tempfile::tempdir().unwrap();
        let day = home.path().join("2026").join("11").join("09");
        std::fs::create_dir_all(&day).unwrap();
        std::fs::write(day.join("rollout-a.jsonl"), meta("a", "D:\\Game", T0) + "\n").unwrap();
        std::fs::write(day.join("rollout-b.jsonl"), meta("b", "D:\\Other", T0) + "\n").unwrap();
        std::fs::write(day.join("notes.jsonl"), "{}\n").unwrap();
        let p = CodexProvider::new(home.path().to_path_buf());
        assert_eq!(p.session_files().len(), 2, "only rollout-*.jsonl");
        let game = p.sessions_for_project(Path::new("d:/game/"));
        assert_eq!(game.len(), 1);
        assert!(game[0].ends_with("rollout-a.jsonl"));
        assert!(p.sessions_for_project(Path::new("D:\\Nope")).is_empty());
        let status = p.detect(0, u64::MAX);
        assert_eq!((status.state, status.observable, status.sessions), (ProviderState::Active, true, 2));
        assert_eq!(CodexProvider::new(home.path().join("missing")).detect(0, 1).state, ProviderState::NotFound);
    }
}
