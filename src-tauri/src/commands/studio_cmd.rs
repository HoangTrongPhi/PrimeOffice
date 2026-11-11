//! Studios: each one is a company of its own in the Office tab — a name, a kind (which floor plan and
//! departments it starts from), the project folders that belong to it and its own office layout.
//! Saved in `studios.json`; the layout of studio `<id>` is `layout-<id>.json` (`layout.json` for the
//! first studio, which is the office PrimeOffice had before studios).

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime, State};

use super::office_cmd::{data_file, OfficeState};
use crate::utils::logbus::{self, Level};

/// The studio every install starts with; it keeps the layout saved before studios existed.
pub const MAIN_ID: &str = "main";
const NAME_MAX: usize = 40;
const ID_MAX: usize = 40;
const STUDIOS_MAX: usize = 12;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Studio {
    /// `[a-z0-9-]`, unique; names the layout file.
    pub id: String,
    pub name: String,
    /// Template id (`game`, `video`, `classic`, see `src/lib/studios.ts`). Unknown kinds are kept:
    /// the UI falls back to the classic office.
    pub kind: String,
    /// Project folders whose agents work here; empty = every project.
    #[serde(default)]
    pub projects: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Studios {
    /// Id of the studio the office shows.
    pub active: String,
    pub studios: Vec<Studio>,
}

impl Default for Studios {
    fn default() -> Self {
        Studios { active: MAIN_ID.into(), studios: vec![Studio { id: MAIN_ID.into(), name: "Game studio".into(), kind: "game".into(), projects: Vec::new() }] }
    }
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= ID_MAX && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

impl Studios {
    /// Checked and tidied: at least one studio, valid unique ids, non-empty names, an existing
    /// active studio, no folder listed twice in a studio.
    pub fn normalized(mut self) -> Result<Self, String> {
        if self.studios.is_empty() {
            return Err("At least one studio is needed".into());
        }
        if self.studios.len() > STUDIOS_MAX {
            return Err(format!("At most {STUDIOS_MAX} studios"));
        }
        let mut ids = HashSet::new();
        for s in &mut self.studios {
            if !valid_id(&s.id) {
                return Err(format!("Studio id `{}` must be 1–{ID_MAX} characters of a-z, 0-9 and -", s.id));
            }
            if !ids.insert(s.id.clone()) {
                return Err(format!("Two studios share the id `{}`", s.id));
            }
            s.name = s.name.trim().chars().take(NAME_MAX).collect();
            if s.name.is_empty() {
                return Err("A studio needs a name".into());
            }
            if s.kind.trim().is_empty() {
                return Err(format!("Studio `{}` has no kind", s.name));
            }
            let mut seen = HashSet::new();
            s.projects.retain(|p| !p.trim().is_empty() && seen.insert(p.to_lowercase()));
        }
        if !ids.contains(&self.active) {
            self.active = self.studios[0].id.clone();
        }
        Ok(self)
    }

    /// Saved studios; the default (one Game studio) when there are none or the file is unreadable.
    pub fn load(path: &Path) -> Self {
        std::fs::read_to_string(path).ok().and_then(|s| serde_json::from_str::<Studios>(&s).ok()).and_then(|s| s.normalized().ok()).unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        crate::utils::paths::write_atomic(path, json.as_bytes()).map_err(|e| format!("Cannot save the studios: {e}"))
    }
}

/// File name of a studio's saved layout.
pub fn layout_file(id: &str) -> String {
    if id == MAIN_ID {
        "layout.json".into()
    } else {
        format!("layout-{id}.json")
    }
}

pub fn studios_path<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    data_file(app, "studios.json")
}

#[tauri::command]
pub fn list_studios(office: State<'_, OfficeState>) -> Result<Studios, String> {
    Ok(office.studios.lock().map_err(|e| e.to_string())?.clone())
}

/// Replace the studio list (add, rename, remove, assign folders, switch). The layout of a removed
/// studio is deleted. Returns the list as saved.
#[tauri::command]
pub fn save_studios<R: Runtime>(app: AppHandle<R>, office: State<'_, OfficeState>, studios: Studios) -> Result<Studios, String> {
    let next = studios.normalized()?;
    let mut current = office.studios.lock().map_err(|e| e.to_string())?;
    if *current == next {
        return Ok(next);
    }
    next.save(&studios_path(&app))?;
    for gone in current.studios.iter().filter(|s| !next.studios.iter().any(|n| n.id == s.id)) {
        // The first studio's layout.json stays: it is also what an older PrimeOffice reads.
        if gone.id != MAIN_ID {
            let _ = std::fs::remove_file(data_file(&app, &layout_file(&gone.id)));
        }
        logbus::emit(&app, Level::Info, "office", format!("Studio removed: {}", gone.name));
    }
    if current.active != next.active {
        if let Some(s) = next.studios.iter().find(|s| s.id == next.active) {
            logbus::emit(&app, Level::Info, "office", format!("Studio: {}", s.name));
        }
    }
    *current = next.clone();
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn studio(id: &str, name: &str) -> Studio {
        Studio { id: id.into(), name: name.into(), kind: "video".into(), projects: Vec::new() }
    }

    #[test]
    fn starts_with_one_game_studio() {
        let d = Studios::default();
        assert_eq!((d.active.as_str(), d.studios.len(), d.studios[0].kind.as_str()), (MAIN_ID, 1, "game"));
        assert_eq!(d.clone().normalized().unwrap(), d);
        assert_eq!((layout_file(MAIN_ID), layout_file("video-1")), ("layout.json".to_string(), "layout-video-1.json".to_string()));
    }

    #[test]
    fn checks_and_tidies() {
        let mut s = Studios::default();
        s.studios.push(Studio { projects: vec!["D:\\Vlog".into(), "d:\\vlog".into(), " ".into()], ..studio("video-1", "  YouTube  ") });
        s.active = "gone".into();
        let n = s.normalized().unwrap();
        assert_eq!((n.active.as_str(), n.studios[1].name.as_str(), n.studios[1].projects.len()), (MAIN_ID, "YouTube", 1));

        let bad = |studios: Vec<Studio>| Studios { active: MAIN_ID.into(), studios }.normalized().is_err();
        assert!(bad(vec![]));
        assert!(bad(vec![studio("a", "A"), studio("a", "B")]), "duplicate id");
        assert!(bad(vec![studio("../x", "A")]), "an id is a file name part");
        assert!(bad(vec![studio("UPPER", "A")]));
        assert!(bad(vec![studio("a", "   ")]));
        assert!(bad((0..13).map(|i| studio(&format!("s{i}"), "S")).collect()));
    }

    #[test]
    fn round_trips_through_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("studios.json");
        assert_eq!(Studios::load(&file), Studios::default(), "missing file");
        let mut s = Studios::default();
        s.studios.push(studio("video-1", "YouTube"));
        s.active = "video-1".into();
        s.save(&file).unwrap();
        assert_eq!(Studios::load(&file), s);
        std::fs::write(&file, "{ not json").unwrap();
        assert_eq!(Studios::load(&file), Studios::default(), "unreadable file");
        // The JSON the frontend sends.
        let from_ts: Studios = serde_json::from_value(serde_json::json!({ "active": "main", "studios": [{ "id": "main", "name": "Game", "kind": "game" }] })).unwrap();
        assert!(from_ts.studios[0].projects.is_empty());
    }
}
