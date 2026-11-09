//! The office: a background thread ticks the observer every second and emits the resulting
//! pixel-agents messages on `office://message`; the UI asks for a snapshot when it (re)loads.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

use crate::core::observer::{Observer, ObserverConfig};
use crate::core::providers::{home_dir, now_ms, registry, AgentSession};
use crate::utils::logbus::{self, Level};

/// Event name; keep in sync with `EVENTS.office` in `src/lib/ipc.ts`. Payload: an array of messages.
pub const OFFICE_EVENT: &str = "office://message";
const TICK: Duration = Duration::from_millis(1000);

/// Tauri state: the observer, shared by the ticking thread and the commands.
#[derive(Clone)]
pub struct OfficeState {
    pub observer: Arc<Mutex<Observer>>,
}

impl Default for OfficeState {
    fn default() -> Self {
        let home = home_dir().unwrap_or_else(std::env::temp_dir);
        OfficeState { observer: Arc::new(Mutex::new(Observer::new(registry(&home), ObserverConfig::default()))) }
    }
}

/// Start the ticking thread (from `setup`).
pub fn start<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<OfficeState>().inner().clone();
    let handle = app.clone();
    let spawned = std::thread::Builder::new().name("office-observer".into()).spawn(move || loop {
        let msgs = match state.observer.lock() {
            Ok(mut o) => o.tick(now_ms()),
            Err(_) => return,
        };
        if !msgs.is_empty() {
            let _ = handle.emit(OFFICE_EVENT, &msgs);
        }
        std::thread::sleep(TICK);
    });
    if let Err(e) = spawned {
        logbus::emit(app, Level::Error, "office", format!("Cannot start the observer: {e}"));
    }
}

pub fn layout_path<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    app.path().app_local_data_dir().unwrap_or_else(|_| std::env::temp_dir().join(env!("CARGO_PKG_NAME"))).join("layout.json")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficeSnapshot {
    /// `settingsLoaded` for the office UI.
    pub settings: Value,
    /// `existingAgents`, sent before the layout (the webview buffers agents until `layoutLoaded`).
    pub existing: Value,
    /// Saved layout, or null for the bundled default.
    pub layout: Option<Value>,
    /// Tools, bubbles and gauges, sent after the layout.
    pub activity: Vec<Value>,
}

#[tauri::command]
pub fn office_snapshot<R: Runtime>(app: AppHandle<R>, office: State<'_, OfficeState>) -> Result<OfficeSnapshot, String> {
    let layout = std::fs::read_to_string(layout_path(&app)).ok().and_then(|s| serde_json::from_str::<Value>(&s).ok()).filter(Value::is_object);
    let (existing, activity) = office.observer.lock().map_err(|e| e.to_string())?.snapshot();
    Ok(OfficeSnapshot { settings: settings_message(), existing, layout, activity })
}

/// A `ClientMessage` from the office UI. PrimeOffice only observes, so most are ignored; the layout
/// is saved.
#[tauri::command]
pub fn office_send<R: Runtime>(app: AppHandle<R>, message: Value) -> Result<(), String> {
    match message.get("type").and_then(Value::as_str) {
        Some("saveLayout") => {
            let layout = message.get("layout").filter(|l| l.is_object()).ok_or("saveLayout without a layout")?;
            let json = serde_json::to_string_pretty(layout).map_err(|e| e.to_string())?;
            crate::utils::paths::write_atomic(&layout_path(&app), json.as_bytes()).map_err(|e| format!("Cannot save the layout: {e}"))?;
            logbus::emit(&app, Level::Info, "office", "Layout saved");
            Ok(())
        }
        _ => Ok(()),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficeAgent {
    pub id: u32,
    pub session: AgentSession,
}

#[tauri::command]
pub fn office_agents(office: State<'_, OfficeState>) -> Result<Vec<OfficeAgent>, String> {
    Ok(office.observer.lock().map_err(|e| e.to_string())?.agents().into_iter().map(|(id, session)| OfficeAgent { id, session }).collect())
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficeFilter {
    /// Project folders to show; empty = all.
    #[serde(default)]
    pub projects: Vec<String>,
    /// Active window in minutes (default 30).
    #[serde(default)]
    pub window_minutes: Option<u64>,
}

/// Which sessions the office shows. Takes effect on the next tick.
#[tauri::command]
pub fn office_set_filter(office: State<'_, OfficeState>, filter: OfficeFilter) -> Result<(), String> {
    let mut o = office.observer.lock().map_err(|e| e.to_string())?;
    let window_ms = filter.window_minutes.map(|m| m.clamp(1, 7 * 24 * 60) * 60_000).unwrap_or(o.config().window_ms);
    o.set_config(ObserverConfig { window_ms, projects: filter.projects.iter().map(PathBuf::from).collect() });
    Ok(())
}

/// `settingsLoaded` as the office UI expects it. PrimeOffice observes only: no hooks, no terminal.
pub fn settings_message() -> Value {
    // The office compares major.minor to decide on its "Updated to vX" notice: mark it seen.
    let seen = env!("CARGO_PKG_VERSION").split('.').take(2).collect::<Vec<_>>().join(".");
    json!({ "type": "settingsLoaded", "soundEnabled": false, "lastSeenVersion": seen, "extensionVersion": env!("CARGO_PKG_VERSION"),
        "watchAllSessions": true, "alwaysShowLabels": true, "ghostHeadlessAgents": false, "hooksEnabled": false, "hooksInfoShown": true,
        "externalAssetDirectories": [], "showAreas": false, "bypassPermissions": false, "showHostDirectories": false })
}
