//! PrimeOffice — Tauri 2 backend: IPC command registration and app bootstrap.

pub mod cli;
mod commands;
pub mod core;
pub mod utils;

#[cfg(test)]
mod ipc_tests;

use tauri::{Builder, Runtime};
use utils::jobs::JobRegistry;
use utils::logbus::{self, Level, LogBus};

/// State, startup hook and IPC commands, shared by the real app and the IPC tests. `open_with` is
/// the window start's argument (`cli::open_with`).
fn configure<R: Runtime>(builder: Builder<R>, open_with: Option<Result<std::path::PathBuf, String>>) -> Builder<R> {
    let startup_folder = open_with.as_ref().and_then(|r| r.as_ref().ok()).map(|p| p.to_string_lossy().into_owned());
    builder
        .manage(LogBus::default())
        .manage(JobRegistry::default())
        .manage(commands::office_cmd::OfficeState::default())
        .manage(commands::app_cmd::StartupFolder::new(startup_folder))
        .setup(move |app| {
            logbus::emit(
                app.handle(),
                Level::Info,
                "app",
                format!("PrimeOffice v{} started ({} {})", env!("CARGO_PKG_VERSION"), std::env::consts::OS, std::env::consts::ARCH),
            );
            match &open_with {
                Some(Ok(folder)) => logbus::emit(app.handle(), Level::Info, "app", format!("Opened with {}", folder.display())),
                Some(Err(arg)) => logbus::emit(app.handle(), Level::Warn, "app", format!("Ignored the start argument {arg}: not a folder")),
                None => {}
            }
            commands::office_cmd::start(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_cmd::app_info,
            commands::app_cmd::log_history,
            commands::app_cmd::ui_log,
            commands::app_cmd::cancel_job,
            commands::app_cmd::open_url,
            commands::app_cmd::open_user_guide,
            commands::app_cmd::reveal_in_explorer,
            commands::app_cmd::take_startup_folder,
            commands::office_cmd::office_snapshot,
            commands::office_cmd::office_send,
            commands::office_cmd::office_agents,
            commands::office_cmd::office_set_filter,
            commands::project_cmd::check_project,
            commands::project_cmd::list_projects,
            commands::project_cmd::add_project,
            commands::project_cmd::remove_project,
            commands::session_cmd::list_sessions,
            commands::session_cmd::get_session,
            commands::session_cmd::list_providers,
        ])
}

pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    configure(
        Builder::default()
            .plugin(tauri_plugin_dialog::init())
            .plugin(tauri_plugin_fs::init())
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init()),
        cli::open_with(&args),
    )
    .run(tauri::generate_context!())
    .expect("error while running PrimeOffice");
}
