use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, Runtime, State};

use crate::utils::jobs::JobRegistry;
use crate::utils::logbus::{LogBus, LogEntry};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AbyssContext {
    pub managed: bool,
    pub launcher_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub debug: bool,
    /// Whether the Abyss launcher started us (it sets `ABYSS=1`).
    pub abyss: AbyssContext,
}

#[tauri::command]
pub fn app_info<R: Runtime>(app: AppHandle<R>) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        debug: cfg!(debug_assertions),
        abyss: AbyssContext { managed: std::env::var("ABYSS").is_ok_and(|v| v == "1"), launcher_version: std::env::var("ABYSS_VERSION").ok() },
    }
}

/// Entries logged before the frontend subscribed to `log://entry`.
#[tauri::command]
pub fn log_history(bus: State<'_, LogBus>) -> Vec<LogEntry> {
    bus.history()
}

/// Mirror a UI-side log line to stderr so `tauri dev` output shows frontend errors too.
/// (Not re-emitted: the UI already shows its own lines in the drawer.)
#[tauri::command]
pub fn ui_log(level: String, message: String) {
    eprintln!("[UI {level}] {message}");
}

/// Stop a running job at its next check; false when it already finished.
#[tauri::command]
pub fn cancel_job(jobs: State<'_, JobRegistry>, job_id: u64) -> bool {
    jobs.cancel(job_id)
}

/// Open a web or mail link in the default browser / mail app.
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    let allowed = (url.starts_with("https://") || url.starts_with("http://") || url.starts_with("mailto:"))
        && !url.chars().any(|c| c.is_whitespace() || c.is_control() || c == '"');
    if !allowed {
        return Err(format!("Not an http(s) or mailto link: {url}"));
    }
    #[cfg(windows)]
    let result = std::process::Command::new("explorer").arg(&url).spawn();
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(&url).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(&url).spawn();
    result.map(|_| ()).map_err(|e| e.to_string())
}

/// Show a file selected in Explorer / Finder / the file manager.
#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("Not found: {path}"));
    }
    #[cfg(windows)]
    let result = std::process::Command::new("explorer").arg(format!("/select,{}", p.display())).spawn();
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg("-R").arg(&p).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(p.parent().unwrap_or(&p)).spawn();
    result.map(|_| ()).map_err(|e| e.to_string())
}

/// The user guide PDF bundled as a resource (`docs/user-guide/PrimeOffice_User_Guide_<lang>.pdf`, built
/// from the Help content by `npm run guide`); Vietnamese unless `lang` is `en`.
pub fn user_guide_path<R: Runtime>(app: &AppHandle<R>, lang: &str) -> Result<PathBuf, String> {
    let lang = if lang == "en" { "en" } else { "vi" };
    let path = app.path().resolve(format!("user-guide/PrimeOffice_User_Guide_{lang}.pdf"), BaseDirectory::Resource).map_err(|e| e.to_string())?;
    if path.is_file() {
        Ok(path)
    } else {
        Err(format!("User guide not found: {}", path.display()))
    }
}

/// Open the user guide PDF in the default PDF viewer.
#[tauri::command]
pub fn open_user_guide<R: Runtime>(app: AppHandle<R>, lang: String) -> Result<(), String> {
    let path = user_guide_path(&app, &lang)?;
    #[cfg(windows)]
    let result = std::process::Command::new("explorer").arg(&path).spawn();
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(&path).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(&path).spawn();
    result.map(|_| ()).map_err(|e| e.to_string())
}

/// The folder the window was started with (Explorer's "Open with", `primeoffice.exe D:\Game`),
/// handed to the UI once.
pub struct StartupFolder(Mutex<Option<String>>);

impl StartupFolder {
    pub fn new(folder: Option<String>) -> Self {
        StartupFolder(Mutex::new(folder))
    }
}

/// The start folder the first time it is asked for, then null (a reload of the UI does not open it again).
#[tauri::command]
pub fn take_startup_folder(startup: State<'_, StartupFolder>) -> Option<String> {
    startup.0.lock().ok().and_then(|mut f| f.take())
}

#[cfg(test)]
mod tests {
    /// `open_user_guide` resolves `user-guide/PrimeOffice_User_Guide_<lang>.pdf`: both PDFs exist and are bundled there.
    #[test]
    fn user_guide_pdfs_are_bundled() {
        let conf: serde_json::Value = serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap();
        for lang in ["vi", "en"] {
            let file = format!("PrimeOffice_User_Guide_{lang}.pdf");
            let source = format!("../docs/user-guide/{file}");
            assert_eq!(conf["bundle"]["resources"][&source], format!("user-guide/{file}"), "tauri.conf.json bundle.resources");
            assert!(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(&source).is_file(), "{source} missing: run npm run guide");
        }
    }
}
