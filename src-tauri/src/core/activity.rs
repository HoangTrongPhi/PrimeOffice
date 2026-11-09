//! Tool use → what the agent is doing, in words ("Editing App.tsx") and as a kind the office animates
//! (typing vs reading). Port of `formatToolStatus` from pixel-agents' Claude provider; unknown tools fall
//! back to "Using <tool>" — a tool we have never seen must never break anything.

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ActionKind {
    Read,
    Edit,
    Run,
    Search,
    Web,
    Subagent,
    Ask,
    Plan,
    Skill,
    Other,
}

const BASH_MAX: usize = 60;
const DESC_MAX: usize = 50;

/// Tools the office draws as "reading" rather than "typing".
pub const READING_TOOLS: &[&str] = &["Read", "Grep", "Glob", "WebFetch", "WebSearch"];
/// Tools that spawn a sub-agent.
pub const SUBAGENT_TOOLS: &[&str] = &["Task", "Agent"];

fn base_name(v: Option<&Value>) -> String {
    v.and_then(Value::as_str)
        .map(|p| p.rsplit(['/', '\\']).next().unwrap_or(p).to_string())
        .unwrap_or_default()
}

/// Cut to `max` characters (not bytes) with an ellipsis.
pub fn clip(s: &str, max: usize) -> String {
    let s = s.trim();
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let mut out: String = s.chars().take(max).collect();
        out.push('…');
        out
    }
}

/// One-line, whitespace-collapsed text (prompts and replies span many lines).
pub fn one_line(s: &str, max: usize) -> String {
    clip(&s.split_whitespace().collect::<Vec<_>>().join(" "), max)
}

/// `(kind, label)` for one tool call.
pub fn describe(tool: &str, input: &Value) -> (ActionKind, String) {
    let s = |k: &str| input.get(k).and_then(Value::as_str).unwrap_or("");
    match tool {
        "Read" => (ActionKind::Read, format!("Reading {}", base_name(input.get("file_path")))),
        "Edit" | "MultiEdit" => (ActionKind::Edit, format!("Editing {}", base_name(input.get("file_path")))),
        "Write" => (ActionKind::Edit, format!("Writing {}", base_name(input.get("file_path")))),
        "NotebookEdit" => (ActionKind::Edit, "Editing notebook".into()),
        "Bash" | "PowerShell" => {
            let desc = s("description");
            let label = if !desc.is_empty() { clip(desc, BASH_MAX) } else { one_line(s("command"), BASH_MAX) };
            (ActionKind::Run, format!("Running: {label}"))
        }
        "Glob" => (ActionKind::Search, "Searching files".into()),
        "Grep" => (ActionKind::Search, "Searching code".into()),
        "WebFetch" => (ActionKind::Web, "Fetching web content".into()),
        "WebSearch" => (ActionKind::Web, "Searching the web".into()),
        "Task" | "Agent" => {
            let d = s("description");
            (ActionKind::Subagent, if d.is_empty() { "Running subtask".into() } else { format!("Subtask: {}", clip(d, DESC_MAX)) })
        }
        "AskUserQuestion" => (ActionKind::Ask, "Waiting for your answer".into()),
        "EnterPlanMode" | "ExitPlanMode" => (ActionKind::Plan, "Planning".into()),
        "Skill" => {
            let name = s("skill");
            (ActionKind::Skill, if name.is_empty() { "Using a skill".into() } else { format!("Skill: {name}") })
        }
        _ => {
            // MCP tools are `mcp__<server>__<tool>`: show the tool part.
            let short = tool.rsplit("__").next().unwrap_or(tool);
            (ActionKind::Other, format!("Using {short}"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn labels_known_tools() {
        assert_eq!(describe("Edit", &json!({ "file_path": "C:\\a\\src\\App.tsx" })), (ActionKind::Edit, "Editing App.tsx".into()));
        assert_eq!(describe("Read", &json!({ "file_path": "/x/y.rs" })).1, "Reading y.rs");
        assert_eq!(describe("Bash", &json!({ "command": "npm\n  test" })).1, "Running: npm test");
        assert_eq!(describe("Bash", &json!({ "command": "x", "description": "Run tests" })).1, "Running: Run tests");
        assert_eq!(describe("Agent", &json!({ "description": "Find files" })), (ActionKind::Subagent, "Subtask: Find files".into()));
        assert_eq!(describe("Skill", &json!({ "skill": "pdf" })).1, "Skill: pdf");
    }

    #[test]
    fn unknown_tools_never_fail() {
        assert_eq!(describe("mcp__server__do_thing", &Value::Null), (ActionKind::Other, "Using do_thing".into()));
        assert_eq!(describe("Edit", &Value::Null).1, "Editing ");
    }

    #[test]
    fn clip_counts_characters() {
        assert_eq!(clip("tiếng Việt", 5), "tiếng…");
        assert_eq!(one_line("a\n\n b ", 10), "a b");
    }
}
