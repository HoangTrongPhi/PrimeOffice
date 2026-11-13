//! End-to-end IPC tests: the real command set (`configure`) on Tauri's mock runtime, invoked
//! with the same JSON the frontend stores send (`src/stores/*Store.ts` via `src/lib/ipc.ts`).

use std::fs;
use std::path::Path;
use std::sync::mpsc;

use serde_json::{json, Value};
use tauri::ipc::{CallbackFn, InvokeBody, InvokeResponseBody};
use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{App, Listener, Manager, WebviewWindow, WebviewWindowBuilder};

use crate::utils::jobs::JobRegistry;

pub(crate) struct Harness {
    pub app: App<MockRuntime>,
    webview: WebviewWindow<MockRuntime>,
}

#[allow(dead_code)]
impl Harness {
    pub fn new() -> Self {
        let app = super::configure(mock_builder(), None).build(mock_context(noop_assets())).expect("build mock app");
        let webview = WebviewWindowBuilder::new(&app, "main", Default::default()).build().expect("main window");
        Harness { app, webview }
    }

    /// `invoke(cmd, args)` exactly as `@tauri-apps/api/core` would send it.
    pub fn invoke(&self, cmd: &str, args: Value) -> Result<Value, Value> {
        self.invoke_body(cmd, args).map(|body| body.deserialize::<Value>().expect("JSON response"))
    }

    /// For commands that answer with an ArrayBuffer (`tauri::ipc::Response`).
    pub fn invoke_raw(&self, cmd: &str, args: Value) -> Result<Vec<u8>, Value> {
        match self.invoke_body(cmd, args)? {
            InvokeResponseBody::Raw(bytes) => Ok(bytes),
            InvokeResponseBody::Json(j) => panic!("{cmd}: expected raw bytes, got JSON {j}"),
        }
    }

    fn invoke_body(&self, cmd: &str, args: Value) -> Result<InvokeResponseBody, Value> {
        let url = if cfg!(windows) { "http://tauri.localhost" } else { "tauri://localhost" };
        get_ipc_response(
            &self.webview,
            InvokeRequest {
                cmd: cmd.into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: url.parse().unwrap(),
                body: InvokeBody::Json(args),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
    }

    pub fn ok(&self, cmd: &str, args: Value) -> Value {
        self.invoke(cmd, args).unwrap_or_else(|e| panic!("{cmd} failed: {e}"))
    }

    /// Collect payloads of a backend event.
    pub fn listen(&self, event: &str) -> mpsc::Receiver<Value> {
        let (tx, rx) = mpsc::channel();
        self.app.listen_any(event, move |e| {
            let _ = tx.send(serde_json::from_str(e.payload()).unwrap_or(Value::Null));
        });
        rx
    }
}

pub(crate) fn s(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

fn project_tree() -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("CLAUDE.md"), "# rules").unwrap();
    fs::create_dir_all(dir.path().join("docs")).unwrap();
    fs::write(dir.path().join("docs/SPEC.md"), "spec").unwrap();
    dir
}

#[test]
fn app_info_and_log() {
    let h = Harness::new();
    let info = h.ok("app_info", json!({}));
    assert!(info["version"].as_str().is_some_and(|v| !v.is_empty()));
    assert_eq!(info["debug"], cfg!(debug_assertions));
    assert!(info["abyss"]["managed"].is_boolean());
    // A command logs, then the UI backfills it.
    let dir = project_tree();
    h.ok("check_project", json!({ "path": s(dir.path()) }));
    let logs = h.ok("log_history", json!({}));
    assert!(logs.as_array().unwrap().iter().any(|l| l["source"] == "project"));
    assert_eq!(h.ok("ui_log", json!({ "level": "warn", "message": "from the UI" })), Value::Null);
    assert!(h.invoke("open_url", json!({ "url": "file:///C:/x" })).is_err());
    assert_eq!(h.ok("take_startup_folder", json!({})), Value::Null, "started without a folder");
}

#[test]
fn startup_folder_is_handed_over_once() {
    let dir = project_tree();
    let app = super::configure(mock_builder(), Some(Ok(dir.path().to_path_buf()))).build(mock_context(noop_assets())).expect("build mock app");
    let webview = WebviewWindowBuilder::new(&app, "main", Default::default()).build().expect("main window");
    let h = Harness { app, webview };
    assert_eq!(h.ok("take_startup_folder", json!({})), json!(s(dir.path())));
    assert_eq!(h.ok("take_startup_folder", json!({})), Value::Null, "a UI reload does not open it again");
}

#[test]
fn check_project_lists_what_is_missing() {
    let h = Harness::new();
    let dir = project_tree();
    let r = h.ok("check_project", json!({ "path": s(dir.path()) }));
    assert_eq!(r["ready"], false, "no agent session has run in a fresh temp folder");
    let checks = r["checks"].as_array().unwrap();
    let by_code = |c: &str| checks.iter().find(|x| x["code"] == c).unwrap().clone();
    assert_eq!(by_code("folder.exists")["passed"], true);
    assert_eq!(by_code("agent.instructions")["passed"], true);
    assert_eq!(by_code("abyss.spec")["passed"], true);
    let missing = by_code("agent.sessions");
    assert_eq!((missing["passed"].as_bool(), missing["severity"].as_str()), (Some(false), Some("error")));
    assert!(!missing["fix"].as_str().unwrap().is_empty());
    assert!(r["issues"].as_array().unwrap().iter().any(|i| i["code"] == "agent.sessions"));
}

#[test]
fn office_snapshot_and_messages() {
    let h = Harness::new();
    let snap = h.ok("office_snapshot", json!({}));
    assert_eq!(snap["settings"]["type"], "settingsLoaded");
    assert_eq!(snap["existing"]["type"], "existingAgents");
    assert!(snap["activity"].is_array());
    assert!(h.ok("office_agents", json!({})).is_array());
    assert_eq!(h.ok("office_send", json!({ "message": { "type": "focusAgent", "id": 1 } })), Value::Null, "observer-only: ignored");
    assert_eq!(h.ok("office_send", json!({ "message": { "type": "closeAgent", "id": 999 } })), Value::Null, "unknown agent: nothing to hide");
    assert!(h.invoke("office_send", json!({ "message": { "type": "closeAgent" } })).is_err());
    assert_eq!(snap["areaMappings"]["type"], "areaMappingsLoaded");
    assert!(h.invoke("office_send", json!({ "message": { "type": "saveLayout" } })).is_err());
    assert_eq!(h.ok("office_set_filter", json!({ "filter": { "projects": [], "windowMinutes": 45 } })), Value::Null);
}

#[test]
fn studios_start_with_one_and_reject_bad_lists() {
    let h = Harness::new();
    let studios = h.ok("list_studios", json!({}));
    assert_eq!(studios["active"], studios["studios"][0]["id"]);
    assert!(!studios["studios"].as_array().unwrap().is_empty());
    // Saving the same list writes nothing; a bad list is refused before anything is written.
    assert_eq!(h.ok("save_studios", json!({ "studios": studios })), studios);
    assert!(h.invoke("save_studios", json!({ "studios": { "active": "x", "studios": [] } })).is_err());
    assert!(h.invoke("save_studios", json!({ "studios": { "active": "a", "studios": [{ "id": "../a", "name": "A", "kind": "video" }] } })).is_err());
}

#[test]
fn chat_refuses_bad_requests_before_starting_anything() {
    let h = Harness::new();
    let cli = h.ok("chat_cli", json!({}));
    assert!(cli["found"].is_boolean() && !cli["hint"].as_str().unwrap().is_empty());
    // The JSON the chat store sends; none of these reaches the CLI.
    assert!(h.invoke("chat_send", json!({ "request": { "cwd": "Z:\\no\\such\\folder", "prompt": "hi" } })).is_err());
    let dir = project_tree();
    assert!(h.invoke("chat_send", json!({ "request": { "cwd": s(dir.path()), "prompt": "   " } })).is_err());
    assert!(h.invoke("chat_send", json!({ "request": { "cwd": s(dir.path()), "prompt": "hi", "sessionId": "--flag", "model": null, "permissionMode": "manual" } })).is_err());
    assert_eq!(h.ok("chat_stop", json!({ "chatId": 999 })), false);
    assert!(h.invoke("chat_history", json!({ "path": s(&dir.path().join("CLAUDE.md")) })).is_err(), "only Claude Code transcripts");
}

#[test]
fn terminal_refuses_bad_requests_and_unknown_ids() {
    let h = Harness::new();
    let presets = h.ok("term_presets", json!({}));
    assert_eq!(presets.as_array().unwrap().iter().map(|p| p["id"].as_str().unwrap()).collect::<Vec<_>>(), ["claude", "codex", "gemini", "shell"]);
    let dir = project_tree();
    // The JSON the terminal store sends; none of these starts anything.
    assert!(h.invoke("term_open", json!({ "request": { "preset": "shell", "cwd": "Z:\\no\\such\\folder", "cols": 80, "rows": 24, "sessionId": null } })).is_err());
    assert!(h.invoke("term_open", json!({ "request": { "preset": "cmd /c del", "cwd": s(dir.path()), "cols": 80, "rows": 24 } })).is_err());
    assert!(h.invoke("term_open", json!({ "request": { "preset": "shell", "cwd": s(dir.path()), "cols": 0, "rows": 24 } })).is_err());
    assert!(h.invoke("term_open", json!({ "request": { "preset": "shell", "cwd": s(dir.path()), "cols": 80, "rows": 24, "sessionId": "b522fcf1-505a-44f1-a1ca-e857b386b71c" } })).is_err());
    assert_eq!(h.ok("term_write", json!({ "termId": 999, "data": "x" })), false);
    assert_eq!(h.ok("term_resize", json!({ "termId": 999, "cols": 80, "rows": 24 })), false);
    assert!(h.invoke("term_resize", json!({ "termId": 999, "cols": 80, "rows": 0 })).is_err());
    assert_eq!(h.ok("term_close", json!({ "termId": 999 })), false);
}

#[test]
fn skill_library_is_created_listed_and_used_only_by_claude() {
    let h = Harness::new();
    let lib = tempfile::tempdir().unwrap();
    let root = lib.path().join("Skills");
    // The JSON the settings dialog sends.
    let saved = h.ok("save_skill_library", json!({ "root": s(&root), "isolate": true }));
    assert_eq!((saved["custom"].as_bool(), saved["isolate"].as_bool(), saved["error"].is_null()), (Some(true), Some(true), true));
    let ids: Vec<&str> = saved["templates"].as_array().unwrap().iter().map(|t| t["id"].as_str().unwrap()).collect();
    assert_eq!(ids, ["game", "video"]);
    assert!(root.join("HUONG_DAN.md").is_file() && root.join("templates/game/repos").is_dir());
    assert_eq!(h.ok("skill_library", json!({}))["root"], saved["root"]);
    assert!(h.invoke("save_skill_library", json!({ "root": "C:\\a&b", "isolate": true })).is_err());
    let dir = project_tree();
    assert!(h.invoke("term_open", json!({ "request": { "preset": "shell", "cwd": s(dir.path()), "cols": 80, "rows": 24, "skillTemplate": "game" } })).is_err(), "only Claude Code");
    assert!(h.invoke("chat_send", json!({ "request": { "cwd": s(dir.path()), "prompt": "hi", "sessionId": null, "model": null, "permissionMode": null, "skillTemplate": "../video" } })).is_err());
    // Back to the default folder.
    assert_eq!(h.ok("save_skill_library", json!({ "root": null, "isolate": true }))["custom"], false);
}

/// A shell through the real commands: its output arrives as `term://event`s, typed keys reach it,
/// closing it ends it.
#[test]
fn terminal_runs_the_shell() {
    let h = Harness::new();
    let events = h.listen("term://event");
    let dir = project_tree();
    let id = h.ok("term_open", json!({ "request": { "preset": "shell", "cwd": s(dir.path()), "cols": 100, "rows": 30, "sessionId": null } }));
    let (mut text, mut typed, mut closed, mut exit) = (String::new(), false, false, None);
    while let Ok(e) = events.recv_timeout(std::time::Duration::from_secs(60)) {
        assert_eq!(e["termId"], id);
        if let Some(d) = e["data"].as_str() {
            // What xterm does in the app: answer the console's cursor question.
            if d.contains("\u{1b}[6n") {
                h.ok("term_write", json!({ "termId": id, "data": "\u{1b}[1;1R" }));
            }
            text.push_str(d);
            if !typed {
                typed = true;
                assert_eq!(h.ok("term_resize", json!({ "termId": id, "cols": 120, "rows": 40 })), true);
                assert_eq!(h.ok("term_write", json!({ "termId": id, "data": "echo prime-$(20+22)-office\r" })), true);
            }
            if !closed && text.contains("prime-42-office") {
                closed = true;
                assert_eq!(h.ok("term_close", json!({ "termId": id })), true);
            }
        } else if e.get("exit").is_some() {
            exit = Some(e["exit"].clone());
            break;
        }
    }
    assert!(text.contains("prime-42-office"), "the shell ran the typed line: {text:?}");
    assert!(exit.is_some(), "the end is reported");
    assert_eq!(h.ok("term_write", json!({ "termId": id, "data": "x" })), false, "an ended terminal is gone");
}

#[test]
fn providers_and_sessions() {
    let h = Harness::new();
    let providers = h.ok("list_providers", json!({}));
    let ids: Vec<&str> = providers.as_array().unwrap().iter().map(|p| p["id"].as_str().unwrap()).collect();
    assert_eq!(ids, ["claude", "codex", "gemini", "deepseek"]);
    assert_eq!(providers[3]["state"], "unsupported");
    let dir = project_tree();
    let none = h.ok("list_sessions", json!({ "query": { "project": s(dir.path()), "limit": 5 } }));
    assert!(none.as_array().unwrap().is_empty());
    assert!(h.invoke("get_session", json!({ "path": s(&dir.path().join("missing.jsonl")) })).is_err());
}

#[test]
fn cancel_unknown_job() {
    let h = Harness::new();
    let jobs = h.app.state::<JobRegistry>();
    let running = jobs.start("history").unwrap();
    assert_eq!(h.ok("cancel_job", json!({ "jobId": running.id })), true);
    drop(running);
    assert_eq!(h.ok("cancel_job", json!({ "jobId": 999 })), false);
}
