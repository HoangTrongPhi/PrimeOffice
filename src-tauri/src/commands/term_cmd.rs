//! Terminal: a real terminal inside PrimeOffice for what needs the vendor CLI's own screen — signing
//! in (`/login`), `/resume`, slash commands, or simply working in the TUI. A terminal is a pseudo
//! console (`portable-pty`: ConPTY on Windows) running a shell or a vendor CLI exactly as a terminal
//! window would: the user types, the CLI answers. PrimeOffice passes the bytes through and nothing
//! else — it does not type on the user's behalf and does not read what is shown
//! (docs/INTEGRATION_PLAN.md §2).

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, Runtime, State};

use super::chat_cmd::{installed, is_session_id};
use crate::utils::logbus::{self, Level};

/// Event name; keep in sync with `EVENTS.term` in `src/lib/ipc.ts`. Payload: `{ termId, data }` for
/// output, then one `{ termId, exit: code | null }`.
pub const TERM_EVENT: &str = "term://event";
/// Terminals open at once.
const MAX_TERMS: usize = 8;
const WRITE_MAX: usize = 1_000_000;
const SIZE: std::ops::RangeInclusive<u16> = 2..=500;

/// What a terminal can start. `programs` are tried in order; the shell is found per platform.
struct Preset {
    id: &'static str,
    label: &'static str,
    programs: &'static [&'static str],
    hint: &'static str,
}

const SHELL: &str = "shell";
const PRESETS: &[Preset] = &[
    Preset { id: "claude", label: "Claude Code", programs: &["claude"], hint: "Install Claude Code: https://code.claude.com/docs/en/setup" },
    Preset { id: "codex", label: "Codex", programs: &["codex"], hint: "Install Codex CLI: npm install -g @openai/codex" },
    Preset { id: "gemini", label: "Gemini", programs: &["gemini"], hint: "Install Gemini CLI: npm install -g @google/gemini-cli" },
    Preset { id: SHELL, label: "Shell", programs: &[], hint: "" },
];

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TermPreset {
    pub id: String,
    pub label: String,
    pub found: bool,
    pub path: Option<String>,
    /// How to get it when it is missing.
    pub hint: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TermRequest {
    /// `claude` | `codex` | `gemini` | `shell`.
    pub preset: String,
    /// Folder the terminal starts in.
    pub cwd: String,
    pub cols: u16,
    pub rows: u16,
    /// Claude Code only: open this session (`claude --resume <id>`).
    #[serde(default)]
    pub session_id: Option<String>,
}

/// The shell of this PC: PowerShell 7, else Windows PowerShell; `$SHELL`, else `sh`.
fn shell() -> PathBuf {
    if cfg!(windows) {
        installed("pwsh").unwrap_or_else(|| PathBuf::from("powershell.exe"))
    } else {
        std::env::var_os("SHELL").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/bin/sh"))
    }
}

fn program_of(preset: &Preset) -> Option<PathBuf> {
    if preset.id == SHELL {
        return Some(shell());
    }
    preset.programs.iter().find_map(|p| installed(p))
}

/// The command line of a request: program and arguments, checked.
pub fn term_argv(req: &TermRequest, program_of: impl Fn(&str) -> Option<PathBuf>) -> Result<Vec<String>, String> {
    if !Path::new(&req.cwd).is_dir() {
        return Err(format!("{} is not a folder", req.cwd));
    }
    if !SIZE.contains(&req.cols) || !SIZE.contains(&req.rows) {
        return Err(format!("{}×{} is not a terminal size", req.cols, req.rows));
    }
    let preset = PRESETS.iter().find(|p| p.id == req.preset).ok_or_else(|| format!("`{}` is not something a terminal can start", req.preset))?;
    let program = program_of(preset.id).ok_or_else(|| format!("{} is not installed. {}", preset.label, preset.hint))?;
    let program = program.to_string_lossy().into_owned();
    // A `.cmd` (npm's launcher) is a script: the command processor runs it.
    let lower = program.to_lowercase();
    let mut argv = if cfg!(windows) && (lower.ends_with(".cmd") || lower.ends_with(".bat")) { vec!["cmd.exe".into(), "/d".into(), "/c".into(), program] } else { vec![program] };
    if let Some(id) = req.session_id.as_deref().filter(|s| !s.is_empty()) {
        if preset.id != "claude" {
            return Err("Only Claude Code opens a session by id".into());
        }
        if !is_session_id(id) {
            return Err(format!("`{id}` is not a session id"));
        }
        argv.extend(["--resume".into(), id.into()]);
    }
    Ok(argv)
}

/// What a terminal reports.
pub enum PtyOutput {
    /// Text the program printed (escape sequences included).
    Data(String),
    /// The program ended; none when its exit code is not known.
    Exit(Option<u32>),
}

struct PtyInner {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

/// A running terminal. Everything is a no-op (false) once its program has ended.
#[derive(Clone)]
pub struct Pty(Arc<Mutex<Option<PtyInner>>>);

impl Pty {
    fn with<T>(&self, f: impl FnOnce(&mut PtyInner) -> Option<T>) -> Option<T> {
        self.0.lock().ok()?.as_mut().and_then(f)
    }
    /// Keys typed by the user.
    pub fn write(&self, data: &str) -> bool {
        self.with(|p| p.writer.write_all(data.as_bytes()).and_then(|_| p.writer.flush()).ok()).is_some()
    }
    pub fn resize(&self, cols: u16, rows: u16) -> bool {
        self.with(|p| p.master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }).ok()).is_some()
    }
    /// Ask the program to end. The result of the call itself is not used: portable-pty 0.9 reports
    /// a successful `TerminateProcess` as an error on Windows; the end shows up as `PtyOutput::Exit`.
    pub fn kill(&self) -> bool {
        self.with(|p| {
            let _ = p.killer.kill();
            Some(())
        })
        .is_some()
    }
}

/// The complete UTF-8 text at the start of `buf`; an unfinished character at its end stays for the
/// next read (output arrives in arbitrary pieces). Bytes that are not UTF-8 become U+FFFD.
pub fn take_text(buf: &mut Vec<u8>) -> String {
    let keep = match std::str::from_utf8(buf) {
        Ok(_) => 0,
        // `error_len() == None`: the input ends inside a character.
        Err(e) if e.error_len().is_none() => buf.len() - e.valid_up_to(),
        Err(_) => 0,
    };
    let cut = buf.len() - keep;
    let text = String::from_utf8_lossy(&buf[..cut]).into_owned();
    buf.drain(..cut);
    text
}

/// Start `argv` in `cwd` on a new pseudo console of `cols`×`rows` and report what it prints, then
/// its end.
pub fn spawn_pty(argv: &[String], cwd: &Path, cols: u16, rows: u16, sink: impl Fn(PtyOutput) + Send + 'static) -> Result<Pty, String> {
    let pair = native_pty_system().openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }).map_err(|e| format!("Cannot open a terminal: {e}"))?;
    let mut cmd = CommandBuilder::from_argv(argv.iter().map(Into::into).collect());
    cmd.cwd(cwd);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    let mut child = pair.slave.spawn_command(cmd).map_err(|e| format!("Cannot start {}: {e}", argv.first().map(String::as_str).unwrap_or("the program")))?;
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().map_err(|e| format!("Cannot read the terminal: {e}"))?;
    let writer = pair.master.take_writer().map_err(|e| format!("Cannot write to the terminal: {e}"))?;
    let pty = Pty(Arc::new(Mutex::new(Some(PtyInner { master: pair.master, writer, killer: child.clone_killer() }))));

    // The end comes from two sides: the program exits (waiter), then its output runs dry (reader).
    // On Windows the output only ends once the console is closed, so the waiter closes it.
    let (code_tx, code_rx) = mpsc::channel::<Option<u32>>();
    let closing = pty.clone();
    std::thread::Builder::new()
        .name("term-wait".into())
        .spawn(move || {
            let code = child.wait().ok().map(|s| s.exit_code());
            // Sent first: the reader may reach the end of the output while the console is closing.
            let _ = code_tx.send(code);
            let inner = closing.0.lock().ok().and_then(|mut p| p.take());
            drop(inner);
        })
        .map_err(|e| format!("Cannot start the terminal: {e}"))?;
    std::thread::Builder::new()
        .name("term-read".into())
        .spawn(move || {
            let (mut chunk, mut pending) = ([0u8; 8192], Vec::new());
            loop {
                match reader.read(&mut chunk) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        pending.extend_from_slice(&chunk[..n]);
                        let text = take_text(&mut pending);
                        if !text.is_empty() {
                            sink(PtyOutput::Data(text));
                        }
                    }
                }
            }
            if !pending.is_empty() {
                sink(PtyOutput::Data(String::from_utf8_lossy(&pending).into_owned()));
            }
            sink(PtyOutput::Exit(code_rx.recv().ok().flatten()));
        })
        .map_err(|e| format!("Cannot start the terminal: {e}"))?;
    Ok(pty)
}

#[derive(Default)]
pub struct TermState {
    next: AtomicU64,
    terms: Arc<Mutex<HashMap<u64, Pty>>>,
}

impl TermState {
    fn get(&self, term_id: u64) -> Option<Pty> {
        self.terms.lock().ok()?.get(&term_id).cloned()
    }
}

/// What a terminal can start on this PC.
#[tauri::command]
pub fn term_presets() -> Vec<TermPreset> {
    PRESETS
        .iter()
        .map(|p| {
            let path = program_of(p);
            TermPreset { id: p.id.into(), label: p.label.into(), found: path.is_some(), path: path.map(|x| x.to_string_lossy().into_owned()), hint: p.hint.into() }
        })
        .collect()
}

/// Open a terminal; answers the id its `term://event`s carry.
#[tauri::command]
pub fn term_open<R: Runtime>(app: AppHandle<R>, terms: State<'_, TermState>, request: TermRequest) -> Result<u64, String> {
    let argv = term_argv(&request, |id| PRESETS.iter().find(|p| p.id == id).and_then(program_of))?;
    let mut open = terms.terms.lock().map_err(|e| e.to_string())?;
    if open.len() >= MAX_TERMS {
        return Err(format!("{MAX_TERMS} terminals are open already; close one first"));
    }
    let term_id = terms.next.fetch_add(1, Ordering::Relaxed) + 1;
    let (handle, map) = (app.clone(), terms.terms.clone());
    let pty = spawn_pty(&argv, Path::new(&request.cwd), request.cols, request.rows, move |out| match out {
        PtyOutput::Data(data) => {
            let _ = handle.emit(TERM_EVENT, json!({ "termId": term_id, "data": data }));
        }
        PtyOutput::Exit(code) => {
            if let Ok(mut m) = map.lock() {
                m.remove(&term_id);
            }
            let _ = handle.emit(TERM_EVENT, json!({ "termId": term_id, "exit": code }));
        }
    })?;
    open.insert(term_id, pty);
    let folder = Path::new(&request.cwd).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    logbus::emit(&app, Level::Info, "terminal", format!("Terminal opened in {folder} ({})", request.preset));
    Ok(term_id)
}

/// Keys typed in a terminal; false when it has ended.
#[tauri::command]
pub fn term_write(terms: State<'_, TermState>, term_id: u64, data: String) -> Result<bool, String> {
    if data.len() > WRITE_MAX {
        return Err(format!("More than {WRITE_MAX} bytes at once"));
    }
    Ok(terms.get(term_id).is_some_and(|p| p.write(&data)))
}

#[tauri::command]
pub fn term_resize(terms: State<'_, TermState>, term_id: u64, cols: u16, rows: u16) -> Result<bool, String> {
    if !SIZE.contains(&cols) || !SIZE.contains(&rows) {
        return Err(format!("{cols}×{rows} is not a terminal size"));
    }
    Ok(terms.get(term_id).is_some_and(|p| p.resize(cols, rows)))
}

/// End a terminal's program; false when it already ended.
#[tauri::command]
pub fn term_close(terms: State<'_, TermState>, term_id: u64) -> bool {
    terms.get(term_id).is_some_and(|p| p.kill())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn request(cwd: &Path, preset: &str) -> TermRequest {
        TermRequest { preset: preset.into(), cwd: cwd.to_string_lossy().into_owned(), cols: 80, rows: 24, session_id: None }
    }

    #[test]
    fn builds_checked_command_lines() {
        let dir = tempfile::tempdir().unwrap();
        let exe = |id: &str| (id != "codex").then(|| PathBuf::from(format!("C:\\bin\\{id}.exe")));
        assert_eq!(term_argv(&request(dir.path(), "claude"), exe).unwrap(), ["C:\\bin\\claude.exe"]);
        let resume = TermRequest { session_id: Some("b522fcf1-505a-44f1-a1ca-e857b386b71c".into()), ..request(dir.path(), "claude") };
        assert_eq!(term_argv(&resume, exe).unwrap()[1..], ["--resume", "b522fcf1-505a-44f1-a1ca-e857b386b71c"]);
        if cfg!(windows) {
            let npm = |_: &str| Some(PathBuf::from("C:\\npm\\claude.CMD"));
            assert_eq!(term_argv(&resume, npm).unwrap(), ["cmd.exe", "/d", "/c", "C:\\npm\\claude.CMD", "--resume", "b522fcf1-505a-44f1-a1ca-e857b386b71c"]);
        }

        let bad = |f: fn(&mut TermRequest)| {
            let mut r = request(dir.path(), "claude");
            f(&mut r);
            term_argv(&r, exe).is_err()
        };
        assert!(bad(|r| r.cwd = "Z:\\no\\such\\folder".into()));
        assert!(bad(|r| r.preset = "format C:".into()), "only the presets start");
        assert!(bad(|r| r.preset = "codex".into()), "not installed");
        assert!(bad(|r| r.cols = 0));
        assert!(bad(|r| r.rows = 9000));
        assert!(bad(|r| r.session_id = Some("--dangerously-skip-permissions".into())), "an id cannot smuggle a flag");
        assert!(term_argv(&TermRequest { session_id: resume.session_id.clone(), ..request(dir.path(), "shell") }, exe).is_err(), "a shell has no sessions");
        assert!(term_argv(&TermRequest { session_id: Some(String::new()), ..request(dir.path(), "shell") }, exe).is_ok());
    }

    #[test]
    fn text_waits_for_the_rest_of_a_character() {
        let all = "ok ✓ xong".as_bytes();
        let mut buf = all[..5].to_vec(); // "ok " and two of the three bytes of ✓
        assert_eq!(take_text(&mut buf), "ok ");
        assert_eq!(buf.len(), 2);
        buf.extend_from_slice(&all[5..]);
        assert_eq!(take_text(&mut buf), "✓ xong");
        assert!(buf.is_empty());
        let mut bad = vec![b'a', 0xff, b'b'];
        assert_eq!(take_text(&mut bad), "a\u{fffd}b");
        assert!(bad.is_empty());
    }

    /// The presets as the frontend gets them: every one listed, the shell always there.
    #[test]
    fn lists_presets() {
        let presets = term_presets();
        assert_eq!(presets.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(), ["claude", "codex", "gemini", "shell"]);
        assert!(presets[3].found);
        assert!(presets.iter().all(|p| p.found == p.path.is_some() && (p.id == "shell" || !p.hint.is_empty())));
    }

    /// Everything a terminal prints until it ends. Like a terminal emulator (xterm in the app), it
    /// answers the console's "where is the cursor" (`ESC[6n`), which ConPTY waits for at the start.
    fn collect(pty: &Pty, rx: &mpsc::Receiver<PtyOutput>) -> (String, Option<Option<u32>>) {
        let mut text = String::new();
        loop {
            match rx.recv_timeout(Duration::from_secs(30)) {
                Ok(PtyOutput::Data(d)) => {
                    if d.contains("[6n") {
                        pty.write("[1;1R");
                    }
                    text.push_str(&d);
                }
                Ok(PtyOutput::Exit(code)) => return (text, Some(code)),
                Err(_) => return (text, None),
            }
        }
    }

    /// A real pseudo console: the command processor prints, takes typed keys, and ends.
    #[cfg(windows)]
    #[test]
    fn runs_a_program_on_a_real_console() {
        let dir = tempfile::tempdir().unwrap();
        let (tx, rx) = mpsc::channel();
        let argv = ["cmd.exe", "/d", "/c", "echo hello from the pty& exit /b 3"].map(String::from);
        let pty = spawn_pty(&argv, dir.path(), 80, 24, move |out| {
            let _ = tx.send(out);
        })
        .unwrap();
        let (text, exit) = collect(&pty, &rx);
        assert!(text.contains("hello from the pty"), "{text:?}");
        assert_eq!(exit, Some(Some(3)));
        assert!(!pty.write("x") && !pty.resize(100, 30) && !pty.kill(), "nothing works on an ended terminal");

        let (tx, rx) = mpsc::channel();
        let pty = spawn_pty(&["cmd.exe".to_string(), "/d".to_string()], dir.path(), 80, 24, move |out| {
            let _ = tx.send(out);
        })
        .unwrap();
        assert!(pty.resize(120, 40));
        assert!(pty.write("echo typed-%CD:~0,0%marker\r\n"));
        assert!(pty.write("exit\r\n"));
        let (text, exit) = collect(&pty, &rx);
        assert!(text.contains("typed-marker"), "typed keys reached the program: {text:?}");
        assert_eq!(exit, Some(Some(0)));

        let (tx, rx) = mpsc::channel();
        let pty = spawn_pty(&["cmd.exe".to_string(), "/d".to_string()], dir.path(), 80, 24, move |out| {
            let _ = tx.send(out);
        })
        .unwrap();
        assert!(pty.kill());
        assert!(collect(&pty, &rx).1.is_some(), "a killed terminal reports its end");
        assert!(spawn_pty(&["Z:\\no\\such\\program.exe".to_string()], dir.path(), 80, 24, |_| {}).is_err());
    }
}
