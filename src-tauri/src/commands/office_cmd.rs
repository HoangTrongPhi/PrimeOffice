//! The office: a background thread ticks the observer every second and emits the resulting
//! pixel-agents messages on `office://message`; the UI asks for a snapshot when it (re)loads.

use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

use crate::core::observer::{Observer, ObserverConfig, Seat};
use crate::core::providers::{home_dir, now_ms, registry, AgentSession};
use crate::utils::logbus::{self, Level};

/// Event name; keep in sync with `EVENTS.office` in `src/lib/ipc.ts`. Payload: an array of messages.
pub const OFFICE_EVENT: &str = "office://message";
const TICK: Duration = Duration::from_millis(1000);

/// What the office UI changes by itself and expects back on every load: its Settings menu, where
/// agents sit and which folder belongs to which area. Saved in `office.json` next to `layout.json`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct OfficePrefs {
    pub sound_enabled: bool,
    pub always_show_labels: bool,
    pub show_areas: bool,
    /// Folder name → area labels (pixel-agents' `saveAreaMappings`).
    pub area_mappings: BTreeMap<String, Vec<String>>,
    /// Transcript path → seat (pixel-agents' `saveAgentSeats`, re-keyed from agent ids).
    pub seats: BTreeMap<String, Seat>,
}

impl Default for OfficePrefs {
    fn default() -> Self {
        OfficePrefs { sound_enabled: false, always_show_labels: true, show_areas: false, area_mappings: BTreeMap::new(), seats: BTreeMap::new() }
    }
}

impl OfficePrefs {
    /// Saved prefs, the defaults when there are none or the file is unreadable. Seats of transcripts
    /// that no longer exist are dropped, so the file does not grow forever.
    pub fn load(path: &Path) -> Self {
        let mut prefs: OfficePrefs = std::fs::read_to_string(path).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
        prefs.seats.retain(|p, _| Path::new(p).is_file());
        prefs
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        crate::utils::paths::write_atomic(path, json.as_bytes()).map_err(|e| format!("Cannot save the office settings: {e}"))
    }

    fn seats_by_path(&self) -> HashMap<PathBuf, Seat> {
        self.seats.iter().map(|(p, s)| (PathBuf::from(p), s.clone())).collect()
    }
}

/// Tauri state: the observer, shared by the ticking thread and the commands, and the office prefs.
#[derive(Clone)]
pub struct OfficeState {
    pub observer: Arc<Mutex<Observer>>,
    pub prefs: Arc<Mutex<OfficePrefs>>,
}

impl Default for OfficeState {
    fn default() -> Self {
        let home = home_dir().unwrap_or_else(std::env::temp_dir);
        OfficeState { observer: Arc::new(Mutex::new(Observer::new(registry(&home), ObserverConfig::default()))), prefs: Arc::new(Mutex::new(OfficePrefs::default())) }
    }
}

/// Start the ticking thread (from `setup`), after loading the saved office prefs.
pub fn start<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<OfficeState>().inner().clone();
    let prefs = OfficePrefs::load(&prefs_path(app));
    if let Ok(mut o) = state.observer.lock() {
        o.set_seats(prefs.seats_by_path());
    }
    if let Ok(mut p) = state.prefs.lock() {
        *p = prefs;
    }
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

fn data_file<R: Runtime>(app: &AppHandle<R>, name: &str) -> PathBuf {
    app.path().app_local_data_dir().unwrap_or_else(|_| std::env::temp_dir().join(env!("CARGO_PKG_NAME"))).join(name)
}

pub fn layout_path<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    data_file(app, "layout.json")
}

pub fn prefs_path<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    data_file(app, "office.json")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficeSnapshot {
    /// `settingsLoaded` for the office UI.
    pub settings: Value,
    /// `areaMappingsLoaded`: which folder sits in which area.
    pub area_mappings: Value,
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
    let prefs = office.prefs.lock().map_err(|e| e.to_string())?;
    Ok(OfficeSnapshot { settings: settings_message(&prefs), area_mappings: json!({ "type": "areaMappingsLoaded", "mappings": prefs.area_mappings }), existing, layout, activity })
}

/// A `ClientMessage` from the office UI. PrimeOffice only observes, so launching, terminals and
/// hooks are ignored; the layout, the office's own settings, seats and folder areas are saved, and
/// the × on an agent hides it until it works again.
#[tauri::command]
pub fn office_send<R: Runtime>(app: AppHandle<R>, office: State<'_, OfficeState>, message: Value) -> Result<(), String> {
    match message.get("type").and_then(Value::as_str) {
        Some("saveLayout") => {
            let layout = message.get("layout").filter(|l| l.is_object()).ok_or("saveLayout without a layout")?;
            let json = serde_json::to_string_pretty(layout).map_err(|e| e.to_string())?;
            crate::utils::paths::write_atomic(&layout_path(&app), json.as_bytes()).map_err(|e| format!("Cannot save the layout: {e}"))?;
            logbus::emit(&app, Level::Info, "office", "Layout saved");
            Ok(())
        }
        Some("closeAgent") => {
            let id = message.get("id").and_then(Value::as_u64).ok_or("closeAgent without an id")?;
            if office.observer.lock().map_err(|e| e.to_string())?.dismiss(id as u32) {
                logbus::emit(&app, Level::Info, "office", format!("Agent {id} hidden until it works again"));
            }
            Ok(())
        }
        _ => {
            let mut observer = office.observer.lock().map_err(|e| e.to_string())?;
            let mut prefs = office.prefs.lock().map_err(|e| e.to_string())?;
            if apply_pref_message(&mut prefs, &mut observer, &message)? {
                prefs.save(&prefs_path(&app))?;
            }
            Ok(())
        }
    }
}

/// Apply a settings / seats / areas message to the prefs; true when they changed and need saving.
/// Other messages are ignored.
pub fn apply_pref_message(prefs: &mut OfficePrefs, observer: &mut Observer, message: &Value) -> Result<bool, String> {
    let flag = || message.get("enabled").and_then(Value::as_bool).ok_or_else(|| format!("{} without `enabled`", message["type"]));
    let before = prefs.clone();
    match message.get("type").and_then(Value::as_str) {
        Some("setSoundEnabled") => prefs.sound_enabled = flag()?,
        Some("setAlwaysShowLabels") => prefs.always_show_labels = flag()?,
        Some("setShowAreas") => prefs.show_areas = flag()?,
        Some("saveAreaMappings") => {
            prefs.area_mappings = serde_json::from_value(message.get("mappings").cloned().unwrap_or(Value::Null)).map_err(|e| format!("saveAreaMappings: {e}"))?;
        }
        Some("saveAgentSeats") => {
            let raw: HashMap<String, Seat> = serde_json::from_value(message.get("seats").cloned().unwrap_or(Value::Null)).map_err(|e| format!("saveAgentSeats: {e}"))?;
            let by_id: HashMap<u32, Seat> = raw.into_iter().filter_map(|(k, v)| k.parse().ok().map(|id| (id, v))).collect();
            if observer.remember_seats(&by_id) {
                prefs.seats = observer.seats().iter().map(|(p, s)| (p.to_string_lossy().into_owned(), s.clone())).collect();
            }
        }
        _ => {}
    }
    Ok(*prefs != before)
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

/// `settingsLoaded` as the office UI expects it, with the saved prefs. PrimeOffice observes only:
/// no hooks, no terminal.
pub fn settings_message(prefs: &OfficePrefs) -> Value {
    // The office compares major.minor to decide on its "Updated to vX" notice: mark it seen.
    let seen = env!("CARGO_PKG_VERSION").split('.').take(2).collect::<Vec<_>>().join(".");
    json!({ "type": "settingsLoaded", "soundEnabled": prefs.sound_enabled, "lastSeenVersion": seen, "extensionVersion": env!("CARGO_PKG_VERSION"),
        "watchAllSessions": true, "alwaysShowLabels": prefs.always_show_labels, "ghostHeadlessAgents": false, "hooksEnabled": false, "hooksInfoShown": true,
        "externalAssetDirectories": [], "showAreas": prefs.show_areas, "bypassPermissions": false, "showHostDirectories": false })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_observer() -> Observer {
        Observer::new(Vec::new(), ObserverConfig::default())
    }

    #[test]
    fn prefs_follow_the_office_settings() {
        let mut prefs = OfficePrefs::default();
        let mut obs = empty_observer();
        assert_eq!(settings_message(&prefs)["alwaysShowLabels"], true);
        assert!(apply_pref_message(&mut prefs, &mut obs, &json!({ "type": "setSoundEnabled", "enabled": true })).unwrap());
        assert!(apply_pref_message(&mut prefs, &mut obs, &json!({ "type": "setAlwaysShowLabels", "enabled": false })).unwrap());
        assert!(apply_pref_message(&mut prefs, &mut obs, &json!({ "type": "setShowAreas", "enabled": true })).unwrap());
        assert!(!apply_pref_message(&mut prefs, &mut obs, &json!({ "type": "setShowAreas", "enabled": true })).unwrap(), "unchanged → no save");
        assert!(apply_pref_message(&mut prefs, &mut obs, &json!({ "type": "saveAreaMappings", "mappings": { "Game": ["Studio"] } })).unwrap());
        assert!(!apply_pref_message(&mut prefs, &mut obs, &json!({ "type": "focusAgent", "id": 1 })).unwrap());
        assert!(apply_pref_message(&mut prefs, &mut obs, &json!({ "type": "setSoundEnabled" })).is_err());
        let m = settings_message(&prefs);
        assert_eq!((m["soundEnabled"].as_bool(), m["alwaysShowLabels"].as_bool(), m["showAreas"].as_bool()), (Some(true), Some(false), Some(true)));

        // Round trip through office.json; a seat whose transcript is gone is dropped on load.
        let dir = tempfile::tempdir().unwrap();
        let transcript = dir.path().join("s1.jsonl");
        std::fs::write(&transcript, "").unwrap();
        prefs.seats.insert(transcript.to_string_lossy().into_owned(), Seat { palette: 2, hue_shift: 0, seat_id: Some("chair-3".into()) });
        prefs.seats.insert(dir.path().join("gone.jsonl").to_string_lossy().into_owned(), Seat { palette: 1, hue_shift: 0, seat_id: None });
        let file = dir.path().join("office.json");
        prefs.save(&file).unwrap();
        let back = OfficePrefs::load(&file);
        assert_eq!((back.sound_enabled, back.area_mappings["Game"].clone(), back.seats.len()), (true, vec!["Studio".to_string()], 1));
        assert_eq!(OfficePrefs::load(&dir.path().join("missing.json")), OfficePrefs::default());
    }
}
