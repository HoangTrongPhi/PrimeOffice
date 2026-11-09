//! Projects: check a folder against the standard (spec §3.2) and keep the list of opened ones in
//! `%LOCALAPPDATA%\com.phineas.primeoffice\projects.json`.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};

use crate::core::project::{check_project as run_check, ProjectReport};
use crate::core::providers::{home_dir, registry};
use crate::utils::logbus::{self, Level};

fn projects_path<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    app.path().app_local_data_dir().unwrap_or_else(|_| std::env::temp_dir().join(env!("CARGO_PKG_NAME"))).join("projects.json")
}

fn load<R: Runtime>(app: &AppHandle<R>) -> Vec<String> {
    std::fs::read_to_string(projects_path(app)).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

fn save<R: Runtime>(app: &AppHandle<R>, list: &[String]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    crate::utils::paths::write_atomic(&projects_path(app), json.as_bytes()).map_err(|e| e.to_string())
}

/// Check one folder with every provider, rooted at the user's home.
pub fn check(path: &Path) -> ProjectReport {
    let home = home_dir().unwrap_or_else(std::env::temp_dir);
    run_check(path, &registry(&home))
}

#[tauri::command]
pub async fn check_project<R: Runtime>(app: AppHandle<R>, path: String) -> Result<ProjectReport, String> {
    let p = PathBuf::from(&path);
    let report = tauri::async_runtime::spawn_blocking(move || check(&p)).await.map_err(|e| e.to_string())?;
    let missing = report.checks.iter().filter(|c| !c.passed).count();
    let level = if report.ready { Level::Info } else { Level::Warn };
    logbus::emit(&app, level, "project", format!("{}: {} — {missing} item(s) missing", report.name, if report.ready { "ready" } else { "not ready" }));
    Ok(report)
}

/// Reports for every opened project, most recently added first.
#[tauri::command]
pub async fn list_projects<R: Runtime>(app: AppHandle<R>) -> Result<Vec<ProjectReport>, String> {
    let list = load(&app);
    tauri::async_runtime::spawn_blocking(move || list.iter().map(|p| check(Path::new(p))).collect()).await.map_err(|e| e.to_string())
}

/// Add (or move to the top) a project folder; returns its report.
#[tauri::command]
pub async fn add_project<R: Runtime>(app: AppHandle<R>, path: String) -> Result<ProjectReport, String> {
    let mut list = load(&app);
    list.retain(|p| !p.eq_ignore_ascii_case(&path));
    list.insert(0, path.clone());
    save(&app, &list)?;
    check_project(app, path).await
}

#[tauri::command]
pub fn remove_project<R: Runtime>(app: AppHandle<R>, path: String) -> Result<bool, String> {
    let mut list = load(&app);
    let before = list.len();
    list.retain(|p| !p.eq_ignore_ascii_case(&path));
    save(&app, &list)?;
    Ok(list.len() != before)
}
