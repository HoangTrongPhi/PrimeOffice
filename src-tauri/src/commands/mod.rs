//! Tauri IPC handlers. Each submodule wraps one `core` engine; handlers stay thin and run
//! blocking work on the async runtime's blocking pool.

pub mod app_cmd;
pub mod chat_cmd;
pub mod office_cmd;
pub mod project_cmd;
pub mod session_cmd;
pub mod skills_cmd;
pub mod studio_cmd;
pub mod term_cmd;

/// The JSON the frontend sends (see `src/types/primeoffice.ts`) must decode into the command inputs.
#[cfg(test)]
mod contract_tests {
    use super::office_cmd::OfficeFilter;
    use super::session_cmd::SessionQuery;
    use serde_json::json;

    #[test]
    fn office_filter_from_ts() {
        let f: OfficeFilter = serde_json::from_value(json!({ "projects": ["D:/Game"], "windowMinutes": 60 })).unwrap();
        assert_eq!((f.projects.len(), f.window_minutes), (1, Some(60)));
        let empty: OfficeFilter = serde_json::from_value(json!({})).unwrap();
        assert!(empty.projects.is_empty() && empty.window_minutes.is_none());
    }

    #[test]
    fn session_query_from_ts() {
        let q: SessionQuery = serde_json::from_value(json!({ "project": "D:/Game", "provider": "claude", "limit": 10, "windowMinutes": 30 })).unwrap();
        assert_eq!((q.project.as_deref(), q.provider.as_deref(), q.limit), (Some("D:/Game"), Some("claude"), Some(10)));
        let none: SessionQuery = serde_json::from_value(json!({ "project": null })).unwrap();
        assert_eq!(none, SessionQuery::default());
    }
}
