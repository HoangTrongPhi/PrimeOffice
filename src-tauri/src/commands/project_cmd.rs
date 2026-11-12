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

/// Built-in Claude Code sub-agent types, offered before the folder's own.
const BUILT_IN_AGENTS: &[&str] = &["general-purpose", "Explore", "Plan"];

/// The sub-agent types a Claude Code session in `dir` can start: the built-ins, then
/// `<dir>/.claude/agents/*.md` and `~/.claude/agents/*.md` (each file's `name:`, else its stem).
pub fn agent_types_in(dir: &Path, home: Option<&Path>) -> Vec<String> {
    let mut out: Vec<String> = BUILT_IN_AGENTS.iter().map(|s| s.to_string()).collect();
    let folders = [Some(dir.join(".claude").join("agents")), home.map(|h| h.join(".claude").join("agents"))];
    for folder in folders.into_iter().flatten() {
        let Ok(rd) = std::fs::read_dir(&folder) else { continue };
        let mut found: Vec<String> = rd
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|x| x.eq_ignore_ascii_case("md")))
            .filter_map(|p| {
                let text = std::fs::read_to_string(&p).unwrap_or_default();
                let named = text.strip_prefix("---").and_then(|fm| fm.split("\n---").next()).and_then(|fm| fm.lines().find_map(|l| l.trim().strip_prefix("name:").map(|n| n.trim().trim_matches(['"', '\'']).to_string())));
                named.filter(|n| !n.is_empty()).or_else(|| p.file_stem().map(|s| s.to_string_lossy().into_owned()))
            })
            .collect();
        found.sort_by_key(|n| n.to_lowercase());
        for n in found {
            if !out.iter().any(|o| o.eq_ignore_ascii_case(&n)) {
                out.push(n);
            }
        }
    }
    out
}

/// Sub-agent types for the Boss's "Add sub-agent" order.
#[tauri::command]
pub fn agent_types(path: String) -> Vec<String> {
    agent_types_in(Path::new(&path), home_dir().as_deref())
}

#[cfg(test)]
mod agent_type_tests {
    use super::*;

    #[test]
    fn lists_built_ins_then_the_folder_s_and_the_user_s_agents() {
        let dir = tempfile::tempdir().unwrap();
        let home = tempfile::tempdir().unwrap();
        let a = dir.path().join(".claude").join("agents");
        std::fs::create_dir_all(&a).unwrap();
        std::fs::write(a.join("qa.md"), "---\nname: qa-tester\ndescription: x\n---\nbody").unwrap();
        std::fs::write(a.join("writer.md"), "no front matter").unwrap();
        let h = home.path().join(".claude").join("agents");
        std::fs::create_dir_all(&h).unwrap();
        std::fs::write(h.join("explore.md"), "---\nname: Explore\n---\n").unwrap();
        std::fs::write(h.join("reviewer.md"), "---\nname: \"code-reviewer\"\n---\n").unwrap();
        assert_eq!(agent_types_in(dir.path(), Some(home.path())), ["general-purpose", "Explore", "Plan", "qa-tester", "writer", "code-reviewer"]);
    }
}
