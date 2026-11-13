//! Skill library settings and listing (`core::skills`). The library is the installed
//! `skill-library` folder unless the user picks another one in Settings; the choice and the
//! "only this template's skills" switch are saved in `skills.json`.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, Runtime, State};

use super::office_cmd::data_file;
use crate::core::skills::{self, SkillTemplate};
use crate::utils::logbus::{self, Level};

pub const LIBRARY_DIR: &str = "skill-library";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSettings {
    /// The library folder the user picked; none = the default one.
    #[serde(default)]
    pub root: Option<String>,
    /// Start template sessions with `--setting-sources project,local` (no personal skills/plugins).
    #[serde(default = "yes")]
    pub isolate: bool,
}

fn yes() -> bool {
    true
}

impl Default for SkillSettings {
    fn default() -> Self {
        SkillSettings { root: None, isolate: true }
    }
}

#[derive(Default)]
pub struct SkillState(pub Mutex<Option<SkillSettings>>);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillLibrary {
    /// The folder in use.
    pub root: String,
    /// The folder used when none is picked (next to the installed app).
    pub default_root: String,
    /// True when the user picked `root`.
    pub custom: bool,
    pub isolate: bool,
    pub templates: Vec<SkillTemplate>,
    /// Why the library cannot be read or created, if so.
    pub error: Option<String>,
}

/// `skill-library` next to the installed app (the installer puts the guides there); the app's data
/// folder when the resources cannot be found.
pub fn default_root<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    app.path().resolve(LIBRARY_DIR, BaseDirectory::Resource).unwrap_or_else(|_| data_file(app, LIBRARY_DIR))
}

fn settings_path<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    data_file(app, "skills.json")
}

fn load<R: Runtime>(app: &AppHandle<R>, state: &SkillState) -> Result<SkillSettings, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.is_none() {
        let saved = std::fs::read_to_string(settings_path(app)).ok().and_then(|s| serde_json::from_str::<SkillSettings>(&s).ok());
        *guard = Some(saved.unwrap_or_default());
    }
    Ok(guard.clone().unwrap_or_default())
}

fn root_of<R: Runtime>(app: &AppHandle<R>, settings: &SkillSettings) -> PathBuf {
    settings.root.as_deref().filter(|r| !r.trim().is_empty()).map(PathBuf::from).unwrap_or_else(|| default_root(app))
}

fn library<R: Runtime>(app: &AppHandle<R>, settings: &SkillSettings) -> SkillLibrary {
    let root = root_of(app, settings);
    let error = skills::path_problem(&root.to_string_lossy()).or_else(|| skills::ensure_structure(&root).err().map(|e| format!("Cannot create the library in {}: {e}", root.display())));
    let templates = if error.is_none() { skills::list_templates(&root) } else { Vec::new() };
    SkillLibrary {
        root: root.to_string_lossy().into_owned(),
        default_root: default_root(app).to_string_lossy().into_owned(),
        custom: settings.root.is_some(),
        isolate: settings.isolate,
        templates,
        error,
    }
}

/// The library (its structure created where missing) and every template in it.
#[tauri::command]
pub async fn skill_library<R: Runtime>(app: AppHandle<R>, state: State<'_, SkillState>) -> Result<SkillLibrary, String> {
    let settings = load(&app, &state)?;
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || library(&handle, &settings)).await.map_err(|e| e.to_string())
}

/// Use another library folder (`root` none = the default one) and/or switch isolation; answers the
/// library as it now is.
#[tauri::command]
pub async fn save_skill_library<R: Runtime>(app: AppHandle<R>, state: State<'_, SkillState>, root: Option<String>, isolate: bool) -> Result<SkillLibrary, String> {
    let root = root.map(|r| r.trim().trim_end_matches(['\\', '/']).to_string()).filter(|r| !r.is_empty());
    if let Some(problem) = root.as_deref().and_then(skills::path_problem) {
        return Err(problem);
    }
    if let Some(r) = root.as_deref() {
        if Path::new(r).exists() && !Path::new(r).is_dir() {
            return Err(format!("{r} is a file, not a folder"));
        }
    }
    let next = SkillSettings { root, isolate };
    let json = serde_json::to_string_pretty(&next).map_err(|e| e.to_string())?;
    crate::utils::paths::write_atomic(&settings_path(&app), json.as_bytes()).map_err(|e| format!("Cannot save the skill settings: {e}"))?;
    *state.0.lock().map_err(|e| e.to_string())? = Some(next.clone());
    let handle = app.clone();
    let lib = tauri::async_runtime::spawn_blocking(move || library(&handle, &next)).await.map_err(|e| e.to_string())?;
    logbus::emit(&app, Level::Info, "skills", format!("Skill library: {} ({} templates)", lib.root, lib.templates.len()));
    Ok(lib)
}

/// Arguments that start a Claude Code session with skill template `id` (`core::skills::template_args`).
pub fn args_for<R: Runtime>(app: &AppHandle<R>, state: &SkillState, id: &str) -> Result<Vec<String>, String> {
    let settings = load(app, state)?;
    skills::template_args(&root_of(app, &settings), id, settings.isolate)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn settings_default_to_isolated_and_the_default_folder() {
        let s: SkillSettings = serde_json::from_value(json!({})).unwrap();
        assert_eq!(s, SkillSettings::default());
        assert!(s.isolate && s.root.is_none());
        let s: SkillSettings = serde_json::from_value(json!({ "root": "D:/Skills", "isolate": false })).unwrap();
        assert_eq!((s.root.as_deref(), s.isolate), (Some("D:/Skills"), false));
    }
}
