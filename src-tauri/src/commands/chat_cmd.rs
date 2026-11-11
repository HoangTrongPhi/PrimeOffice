//! Chat: give an agent work from PrimeOffice. Each message is one turn of the vendor's own CLI in its
//! documented non-interactive mode — Claude Code: `claude -p --output-format stream-json`, with
//! `--resume <session>` to continue a session. The CLI signs in by itself, as it does in a terminal:
//! PrimeOffice never reads a credential and never talks to the vendor's servers (docs/INTEGRATION_PLAN.md §2).
//! The session is an ordinary Claude Code session in `~/.claude/projects`, so the office shows it and
//! every other client (terminal `claude --resume`, Claude Desktop's `/resume`) can continue it.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Runtime, State};

use crate::core::providers::home_dir;
use crate::utils::logbus::{self, Level};

/// Event name; keep in sync with `EVENTS.chat` in `src/lib/ipc.ts`. Payload: `{ chatId, line }` for
/// each stream-json record of the CLI, then one `{ chatId, done: { code, stderr } }`.
pub const CHAT_EVENT: &str = "chat://event";
const PERMISSION_MODES: &[&str] = &["default", "acceptEdits", "plan", "bypassPermissions"];
const PROMPT_MAX: usize = 200_000;
const STDERR_TAIL: usize = 2_000;

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    /// Project folder the agent works in.
    pub cwd: String,
    pub prompt: String,
    /// Session to continue; none starts a new session.
    #[serde(default)]
    pub session_id: Option<String>,
    /// Model alias or id (`opus`, `sonnet`, `haiku`, `claude-…`); none = the CLI's default.
    #[serde(default)]
    pub model: Option<String>,
    /// `default` | `acceptEdits` | `plan` | `bypassPermissions`; none = the CLI's default.
    #[serde(default)]
    pub permission_mode: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatCli {
    pub found: bool,
    pub path: Option<String>,
    /// How to get it when it is missing.
    pub hint: String,
}

/// A turn that is running: its process, and the session it continues (one turn per session at a time).
struct Running {
    child: Arc<Mutex<Child>>,
    session_id: Option<String>,
}

#[derive(Default)]
pub struct ChatState {
    next: AtomicU64,
    running: Arc<Mutex<HashMap<u64, Running>>>,
}

fn is_session_id(s: &str) -> bool {
    s.len() == 36 && s.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

fn is_model(s: &str) -> bool {
    !s.is_empty() && s.len() <= 64 && s.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '[' | ']'))
}

/// The Claude Code CLI: on `PATH`, else where its installers put it (`~/.local/bin`, npm's global bin).
pub fn find_claude(path_var: Option<&std::ffi::OsStr>, home: Option<&Path>, appdata: Option<&Path>) -> Option<PathBuf> {
    let names: &[&str] = if cfg!(windows) { &["claude.exe", "claude.cmd"] } else { &["claude"] };
    let mut dirs: Vec<PathBuf> = path_var.map(|p| std::env::split_paths(p).collect()).unwrap_or_default();
    dirs.extend(home.map(|h| h.join(".local").join("bin")));
    dirs.extend(appdata.map(|a| a.join("npm")));
    dirs.iter().flat_map(|d| names.iter().map(move |n| d.join(n))).find(|p| p.is_file())
}

fn claude_cli() -> Option<PathBuf> {
    let appdata = std::env::var_os("APPDATA").map(PathBuf::from);
    find_claude(std::env::var_os("PATH").as_deref(), home_dir().as_deref(), appdata.as_deref())
}

/// Checked arguments for one turn. The prompt goes in on stdin, never on the command line.
pub fn turn_args(req: &ChatRequest) -> Result<Vec<String>, String> {
    if !Path::new(&req.cwd).is_dir() {
        return Err(format!("{} is not a folder", req.cwd));
    }
    if req.prompt.trim().is_empty() {
        return Err("The message is empty".into());
    }
    if req.prompt.len() > PROMPT_MAX {
        return Err(format!("The message is longer than {PROMPT_MAX} bytes"));
    }
    let mut args: Vec<String> = ["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages"].map(String::from).to_vec();
    if let Some(id) = req.session_id.as_deref().filter(|s| !s.is_empty()) {
        if !is_session_id(id) {
            return Err(format!("`{id}` is not a session id"));
        }
        args.extend(["--resume".into(), id.into()]);
    }
    if let Some(m) = req.model.as_deref().filter(|s| !s.is_empty()) {
        if !is_model(m) {
            return Err(format!("`{m}` is not a model name"));
        }
        args.extend(["--model".into(), m.into()]);
    }
    if let Some(mode) = req.permission_mode.as_deref().filter(|s| !s.is_empty()) {
        if !PERMISSION_MODES.contains(&mode) {
            return Err(format!("`{mode}` is not a permission mode"));
        }
        args.extend(["--permission-mode".into(), mode.into()]);
    }
    Ok(args)
}

/// What a running turn reports.
pub enum TurnOutput {
    /// One stream-json record.
    Line(Value),
    /// The process ended: exit code (none when killed) and the end of its stderr.
    Done { code: Option<i32>, stderr: String },
}

/// Start `program args` in `cwd`, feed `prompt` on stdin and report every JSON line of its stdout,
/// then `Done`. Lines that are not JSON are dropped (the CLI's stdout is stream-json only).
pub fn spawn_turn(program: &Path, args: &[String], cwd: &Path, prompt: &str, sink: impl Fn(TurnOutput) + Send + 'static) -> Result<Arc<Mutex<Child>>, String> {
    let mut cmd = Command::new(program);
    cmd.args(args).current_dir(cwd).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: no console flashes up
    }
    let mut child = cmd.spawn().map_err(|e| format!("Cannot start {}: {e}", program.display()))?;
    let (mut stdin, stdout, mut stderr) = match (child.stdin.take(), child.stdout.take(), child.stderr.take()) {
        (Some(i), Some(o), Some(e)) => (i, o, e),
        _ => return Err("Cannot open the agent's pipes".into()),
    };
    let prompt = prompt.to_string();
    // Its own thread: a long prompt must not block while the CLI is not reading yet.
    std::thread::spawn(move || {
        let _ = stdin.write_all(prompt.as_bytes());
    });
    let err_tail = std::thread::spawn(move || {
        let mut text = String::new();
        let _ = stderr.read_to_string(&mut text);
        let cut = text.len().saturating_sub(STDERR_TAIL);
        let start = (cut..=text.len()).find(|i| text.is_char_boundary(*i)).unwrap_or(text.len());
        text[start..].trim().to_string()
    });
    let child = Arc::new(Mutex::new(child));
    let waiter = child.clone();
    std::thread::Builder::new()
        .name("chat-turn".into())
        .spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                if let Ok(v) = serde_json::from_str::<Value>(&line) {
                    sink(TurnOutput::Line(v));
                }
            }
            let code = waiter.lock().ok().and_then(|mut c| c.wait().ok()).and_then(|s| s.code());
            sink(TurnOutput::Done { code, stderr: err_tail.join().unwrap_or_default() });
        })
        .map_err(|e| format!("Cannot start the reader: {e}"))?;
    Ok(child)
}

/// Is the Claude Code CLI installed, and where.
#[tauri::command]
pub fn chat_cli() -> ChatCli {
    let path = claude_cli();
    ChatCli {
        found: path.is_some(),
        path: path.map(|p| p.to_string_lossy().into_owned()),
        hint: "Install Claude Code (https://code.claude.com/docs/en/setup), run `claude` once in a terminal and sign in there.".into(),
    }
}

/// Send one message: a new session, or the next turn of `session_id`. Returns the chat id its
/// `chat://event`s carry.
#[tauri::command]
pub fn chat_send<R: Runtime>(app: AppHandle<R>, chat: State<'_, ChatState>, request: ChatRequest) -> Result<u64, String> {
    let args = turn_args(&request)?;
    let program = claude_cli().ok_or("Claude Code CLI not found. Install it, run `claude` once in a terminal and sign in.")?;
    let session_id = request.session_id.clone().filter(|s| !s.is_empty());
    let mut running = chat.running.lock().map_err(|e| e.to_string())?;
    if session_id.is_some() && running.values().any(|r| r.session_id == session_id) {
        return Err("This session is still working on its last message".into());
    }
    let chat_id = chat.next.fetch_add(1, Ordering::Relaxed) + 1;
    let (handle, map) = (app.clone(), chat.running.clone());
    let child = spawn_turn(&program, &args, Path::new(&request.cwd), &request.prompt, move |out| match out {
        TurnOutput::Line(line) => {
            let _ = handle.emit(CHAT_EVENT, json!({ "chatId": chat_id, "line": line }));
        }
        TurnOutput::Done { code, stderr } => {
            if let Ok(mut m) = map.lock() {
                m.remove(&chat_id);
            }
            let _ = handle.emit(CHAT_EVENT, json!({ "chatId": chat_id, "done": { "code": code, "stderr": stderr } }));
        }
    })?;
    running.insert(chat_id, Running { child, session_id });
    let folder = Path::new(&request.cwd).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    logbus::emit(&app, Level::Info, "chat", format!("Message sent to Claude Code in {folder}"));
    Ok(chat_id)
}

/// Stop a running turn; false when it already ended.
#[tauri::command]
pub fn chat_stop(chat: State<'_, ChatState>, chat_id: u64) -> Result<bool, String> {
    let running = chat.running.lock().map_err(|e| e.to_string())?;
    let Some(r) = running.get(&chat_id) else { return Ok(false) };
    let killed = r.child.lock().map_err(|e| e.to_string())?.kill().is_ok();
    Ok(killed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    fn request(cwd: &Path) -> ChatRequest {
        ChatRequest { cwd: cwd.to_string_lossy().into_owned(), prompt: "Fix the build".into(), session_id: None, model: None, permission_mode: None }
    }

    #[test]
    fn builds_checked_arguments() {
        let dir = tempfile::tempdir().unwrap();
        let base = ["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages"];
        assert_eq!(turn_args(&request(dir.path())).unwrap(), base);
        let full = ChatRequest { session_id: Some("b522fcf1-505a-44f1-a1ca-e857b386b71c".into()), model: Some("claude-opus-5-5[1m]".into()), permission_mode: Some("acceptEdits".into()), ..request(dir.path()) };
        assert_eq!(turn_args(&full).unwrap()[5..], ["--resume", "b522fcf1-505a-44f1-a1ca-e857b386b71c", "--model", "claude-opus-5-5[1m]", "--permission-mode", "acceptEdits"]);
        assert!(!turn_args(&full).unwrap().iter().any(|a| a.contains("Fix the build")), "the prompt goes in on stdin");

        let bad = |f: fn(&mut ChatRequest)| {
            let mut r = request(dir.path());
            f(&mut r);
            turn_args(&r).is_err()
        };
        assert!(bad(|r| r.cwd = "Z:\\no\\such\\folder".into()));
        assert!(bad(|r| r.prompt = "  \n".into()));
        assert!(bad(|r| r.session_id = Some("--dangerously-skip-permissions".into())), "an id cannot smuggle a flag");
        assert!(bad(|r| r.model = Some("opus --add-dir C:\\".into())));
        assert!(bad(|r| r.permission_mode = Some("yolo".into())));
        let empty = ChatRequest { session_id: Some(String::new()), model: Some(String::new()), permission_mode: Some(String::new()), ..request(dir.path()) };
        assert_eq!(turn_args(&empty).unwrap(), base, "empty options are left to the CLI");
    }

    #[test]
    fn finds_the_cli_on_path_then_in_its_install_folders() {
        let name = if cfg!(windows) { "claude.exe" } else { "claude" };
        let (on_path, home) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        assert_eq!(find_claude(Some(on_path.path().as_os_str()), Some(home.path()), None), None);
        let local = home.path().join(".local").join("bin");
        std::fs::create_dir_all(&local).unwrap();
        std::fs::write(local.join(name), "").unwrap();
        assert_eq!(find_claude(Some(on_path.path().as_os_str()), Some(home.path()), None), Some(local.join(name)));
        std::fs::write(on_path.path().join(name), "").unwrap();
        assert_eq!(find_claude(Some(on_path.path().as_os_str()), Some(home.path()), None), Some(on_path.path().join(name)), "PATH first");
        assert_eq!(find_claude(None, None, None), None);
    }

    /// The real CLI, two turns of one session. Uses the signed-in plan (two tiny Haiku requests), so
    /// it only runs by hand: `cargo test real_cli -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn real_cli_continues_a_session() {
        let program = claude_cli().expect("Claude Code CLI installed");
        let dir = tempfile::tempdir().unwrap();
        let turn = |req: &ChatRequest| -> (String, String) {
            let (tx, rx) = mpsc::channel();
            spawn_turn(&program, &turn_args(req).unwrap(), Path::new(&req.cwd), &req.prompt, move |out| {
                if let TurnOutput::Line(v) = out {
                    let _ = tx.send(v);
                }
            })
            .unwrap();
            let lines: Vec<Value> = rx.iter().collect();
            let result = lines.iter().find(|l| l["type"] == "result").unwrap_or_else(|| panic!("no result record in {} lines", lines.len()));
            assert_eq!(result["is_error"], false, "{result}");
            (result["session_id"].as_str().unwrap().to_string(), result["result"].as_str().unwrap_or("").to_string())
        };
        let first = ChatRequest { model: Some("haiku".into()), prompt: "Remember the word PINEAPPLE. Reply with exactly: OK".into(), ..request(dir.path()) };
        let (session, reply) = turn(&first);
        println!("turn 1: session {session}, reply {reply:?}");
        let second = ChatRequest { session_id: Some(session.clone()), prompt: "Which word did I ask you to remember? Reply with that word only.".into(), ..first };
        let (again, reply) = turn(&second);
        println!("turn 2: session {again}, reply {reply:?}");
        assert_eq!(again, session, "--resume continues the same session");
        assert!(reply.to_uppercase().contains("PINEAPPLE"), "the session kept its context: {reply}");
    }

    /// A stand-in CLI: prints one JSON record and one line of noise, echoes stdin to stderr.
    #[cfg(windows)]
    #[test]
    fn streams_json_lines_then_done() {
        let dir = tempfile::tempdir().unwrap();
        let script = dir.path().join("fake.cmd");
        std::fs::write(&script, "@echo off\r\necho {\"type\":\"system\",\"subtype\":\"init\"}\r\necho not json\r\nmore 1>&2\r\nexit /b 3\r\n").unwrap();
        let (tx, rx) = mpsc::channel();
        let args = ["/d".to_string(), "/c".to_string(), script.to_string_lossy().into_owned()];
        spawn_turn(Path::new("cmd.exe"), &args, dir.path(), "hello agent", move |out| {
            let _ = tx.send(match out {
                TurnOutput::Line(v) => v,
                TurnOutput::Done { code, stderr } => json!({ "done": code, "stderr": stderr }),
            });
        })
        .unwrap();
        let got: Vec<Value> = rx.iter().collect();
        assert_eq!(got.len(), 2, "{got:?}");
        assert_eq!(got[0]["subtype"], "init");
        assert_eq!(got[1]["done"], 3);
        assert!(got[1]["stderr"].as_str().unwrap().contains("hello agent"), "stdin reached the process: {got:?}");
        assert!(spawn_turn(Path::new("Z:\\no\\such\\cli.exe"), &[], dir.path(), "x", |_| {}).is_err());
    }
}
