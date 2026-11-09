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

/// State, startup hook and IPC commands, shared by the real app and the IPC tests.
fn configure<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    builder
        .manage(LogBus::default())
        .manage(JobRegistry::default())
        .manage(commands::office_cmd::OfficeState::default())
        .setup(|app| {
            logbus::emit(
                app.handle(),
                Level::Info,
                "app",
                format!("PrimeOffice v{} started ({} {})", env!("CARGO_PKG_VERSION"), std::env::consts::OS, std::env::consts::ARCH),
            );
            commands::office_cmd::start(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_cmd::app_info,
            commands::app_cmd::log_history,
            commands::app_cmd::ui_log,
            commands::app_cmd::cancel_job,
            commands::app_cmd::open_url,
            commands::app_cmd::reveal_in_explorer,
            commands::app_cmd::get_settings,
            commands::app_cmd::set_settings,
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
    configure(
        Builder::default()
            .plugin(tauri_plugin_dialog::init())
            .plugin(tauri_plugin_fs::init())
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init()),
    )
    .run(tauri::generate_context!())
    .expect("error while running PrimeOffice");
}
