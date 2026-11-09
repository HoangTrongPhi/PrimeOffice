//! The office's live feed. Every tick it reads what is new in each recent transcript and turns the
//! change into pixel-agents `ServerMessage`s (`agentCreated`, `agentToolStart`, `agentStatus`, …), so
//! the vendored office UI (`src/office/`) runs unchanged. Pure: no tauri, the caller emits.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::providers::{modified_ms, read_lines_from, read_session_bounded, AgentProvider, AgentSession, OpenTool, SessionParser, SessionStatus};

/// What the office shows for an agent; changes between ticks become messages.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Shown {
    Active,
    /// Turn finished (green check bubble).
    Done,
    /// Asked the user something (AskUserQuestion, plan approval).
    Asking,
    /// Most likely a permission prompt ("…" bubble).
    Permission,
}

/// A sub-agent of a tracked session, read from its own transcript.
struct Sub {
    /// The parent's `Agent`/`Task` tool call (pixel-agents' `parentToolId`).
    parent_tool_id: String,
    agent_type: String,
    parser: Box<dyn SessionParser>,
    offset: u64,
    len: u64,
    mtime: u64,
    /// Open tools sent as `subagentToolStart`: (tool id, label, tool).
    tools: Vec<(String, String, String)>,
    /// The office has (or may have) its character: a `subagentClear` is owed when it ends.
    shown: bool,
    /// Ended for good (sidecar says so, or stale): no more reading.
    finished: bool,
}

struct Tracked {
    agent_id: u32,
    /// Index into `Observer::providers`.
    provider: usize,
    parser: Box<dyn SessionParser>,
    offset: u64,
    len: u64,
    mtime: u64,
    palette: u32,
    hue_shift: u32,
    directory: String,
    tools: Vec<(String, String, String)>,
    shown: Option<Shown>,
    context: u64,
    session: Option<AgentSession>,
    /// Closed with the office's × (`closeAgent`): hidden until the transcript grows again.
    dismissed: bool,
    /// Sub-agents by transcript path.
    subs: HashMap<PathBuf, Sub>,
}

/// Where an agent sits and how it looks (pixel-agents' `SeatAssignment`), remembered per transcript
/// so seat moves survive an office reload and an app restart.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Seat {
    pub palette: u32,
    pub hue_shift: u32,
    #[serde(default)]
    pub seat_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ObserverConfig {
    /// Sessions whose transcript changed within this many ms are in the office.
    pub window_ms: u64,
    /// Project folders to show; empty = every project.
    pub projects: Vec<PathBuf>,
}

impl Default for ObserverConfig {
    fn default() -> Self {
        ObserverConfig { window_ms: 30 * 60 * 1000, projects: Vec::new() }
    }
}

pub struct Observer {
    providers: Vec<Box<dyn AgentProvider>>,
    tracked: HashMap<PathBuf, Tracked>,
    next_id: u32,
    config: ObserverConfig,
    /// Remembered seats by transcript path.
    seats: HashMap<PathBuf, Seat>,
}

fn palette_for(id: u32) -> (u32, u32) {
    let n = id.saturating_sub(1);
    (n % 6, if n < 6 { 0 } else { 45 * (1 + (n / 6 - 1) % 7) })
}

/// `agentToolStart` for a parent tool; `Agent`/`Task` calls carry the sub-agent type and whether
/// it runs in the background (the office keeps a background sub-agent past the parent's turn).
fn tool_start(id: u32, o: &OpenTool) -> Value {
    let mut m = json!({ "type": "agentToolStart", "id": id, "toolId": o.id, "status": o.label, "toolName": o.tool });
    if let Some(t) = &o.agent_type {
        m["agentType"] = json!(t);
    }
    if o.background {
        m["runInBackground"] = json!(true);
    }
    m
}

fn sub_tool_start(id: u32, sub: &Sub, tool_id: &str, label: &str, tool: &str) -> Value {
    json!({ "type": "subagentToolStart", "id": id, "parentToolId": sub.parent_tool_id, "toolId": tool_id, "status": label, "toolName": tool, "agentType": sub.agent_type })
}

/// Read what is new in `t`'s sub-agents and send their tools; `subagentClear` when one ends.
fn sync_subs(provider: &dyn AgentProvider, path: &Path, t: &mut Tracked, now_ms: u64, window: u64, out: &mut Vec<Value>) {
    let id = t.agent_id;
    for f in provider.sub_agents(path) {
        let mtime = modified_ms(&f.path);
        let len = std::fs::metadata(&f.path).map(|m| m.len()).unwrap_or(0);
        if let Some(sub) = t.subs.get_mut(&f.path) {
            if sub.finished {
                continue;
            }
            if len < sub.offset {
                sub.offset = 0;
            }
            if len != sub.len || mtime != sub.mtime {
                if let Ok((lines, end)) = read_lines_from(&f.path, sub.offset) {
                    lines.iter().for_each(|l| sub.parser.feed_line(l));
                    sub.offset = end;
                }
                sub.len = len;
                sub.mtime = mtime;
            }
        } else {
            // Old sub-agents that ended before the office saw them are noted, never shown.
            let old = f.finished || now_ms.saturating_sub(mtime) > window;
            let Some(mut parser) = provider.sub_parser() else { return };
            let offset = if old { len } else { read_session_bounded(parser.as_mut(), &f.path).unwrap_or(len) };
            t.subs.insert(f.path.clone(), Sub { parent_tool_id: f.tool_use_id.clone(), agent_type: f.agent_type.clone(), parser, offset, len, mtime, tools: Vec::new(), shown: !old, finished: old });
            if old {
                continue;
            }
        }
        let Some(sub) = t.subs.get_mut(&f.path) else { continue };
        let s = sub.parser.session(&f.path, sub.mtime, now_ms, window);
        let over = f.finished || matches!(s.status, SessionStatus::Done | SessionStatus::Stale);
        if over {
            if sub.shown {
                out.push(json!({ "type": "subagentClear", "id": id, "parentToolId": sub.parent_tool_id }));
            }
            sub.shown = false;
            sub.tools.clear();
            sub.finished = f.finished || s.status == SessionStatus::Stale;
            continue;
        }
        for o in &s.open_tools {
            if !sub.tools.iter().any(|(tid, _, _)| tid == &o.id) {
                out.push(sub_tool_start(id, sub, &o.id, &o.label, &o.tool));
                sub.tools.push((o.id.clone(), o.label.clone(), o.tool.clone()));
                sub.shown = true;
            }
        }
        let parent = sub.parent_tool_id.clone();
        sub.tools.retain(|(tid, _, _)| {
            let open = s.open_tools.iter().any(|o| &o.id == tid);
            if !open {
                out.push(json!({ "type": "subagentToolDone", "id": id, "parentToolId": parent, "toolId": tid }));
            }
            open
        });
    }
}

fn shown_for(s: &AgentSession) -> Shown {
    match s.status {
        SessionStatus::Active | SessionStatus::Stale => Shown::Active,
        SessionStatus::Done => Shown::Done,
        SessionStatus::Waiting => {
            if s.open_tools.iter().any(|t| matches!(t.tool.as_str(), "AskUserQuestion" | "ExitPlanMode")) {
                Shown::Asking
            } else {
                Shown::Permission
            }
        }
    }
}

impl Observer {
    pub fn new(providers: Vec<Box<dyn AgentProvider>>, config: ObserverConfig) -> Self {
        Observer { providers, tracked: HashMap::new(), next_id: 1, config, seats: HashMap::new() }
    }

    /// Seats remembered from an earlier run (applied to agents created from now on).
    pub fn set_seats(&mut self, seats: HashMap<PathBuf, Seat>) {
        self.seats = seats;
    }

    pub fn seats(&self) -> &HashMap<PathBuf, Seat> {
        &self.seats
    }

    /// The office's `saveAgentSeats` (keyed by agent id): remember each seat by its transcript.
    /// Returns true when something changed.
    pub fn remember_seats(&mut self, by_id: &HashMap<u32, Seat>) -> bool {
        let mut changed = false;
        for (path, t) in &mut self.tracked {
            let Some(seat) = by_id.get(&t.agent_id) else { continue };
            t.palette = seat.palette;
            t.hue_shift = seat.hue_shift;
            if self.seats.get(path) != Some(seat) {
                self.seats.insert(path.clone(), seat.clone());
                changed = true;
            }
        }
        changed
    }

    /// The office's × (`closeAgent`). An observer cannot end a session, so the agent is hidden: it
    /// leaves on the next tick and walks back in when its transcript grows again (same id, same
    /// seat). False when no agent has that id.
    pub fn dismiss(&mut self, agent_id: u32) -> bool {
        match self.tracked.values_mut().find(|t| t.agent_id == agent_id) {
            Some(t) => {
                t.dismissed = true;
                true
            }
            None => false,
        }
    }

    pub fn config(&self) -> &ObserverConfig {
        &self.config
    }

    /// New config; agents the new project filter hides are closed on the next tick.
    pub fn set_config(&mut self, config: ObserverConfig) {
        self.config = config;
    }

    /// Read new lines everywhere and return the messages that bring the office up to date.
    pub fn tick(&mut self, now_ms: u64) -> Vec<Value> {
        let mut out = Vec::new();
        let window = self.config.window_ms;

        // Discover and read.
        let mut seen: Vec<PathBuf> = Vec::new();
        for pi in 0..self.providers.len() {
            let provider = &self.providers[pi];
            if provider.parser().is_none() {
                continue;
            }
            let files = if self.config.projects.is_empty() {
                provider.session_files()
            } else {
                self.config.projects.iter().flat_map(|p| provider.sessions_for_project(p)).collect()
            };
            for file in files {
                let mtime = modified_ms(&file);
                if now_ms.saturating_sub(mtime) > window && !self.tracked.contains_key(&file) {
                    continue;
                }
                seen.push(file.clone());
                let len = std::fs::metadata(&file).map(|m| m.len()).unwrap_or(0);
                if let Some(t) = self.tracked.get_mut(&file) {
                    if len < t.offset {
                        // Rewritten from scratch: start over.
                        t.offset = 0;
                    }
                    if len != t.len || mtime != t.mtime {
                        if let Ok((lines, end)) = read_lines_from(&file, t.offset) {
                            lines.iter().for_each(|l| t.parser.feed_line(l));
                            t.offset = end;
                            // New lines = the agent is at work again: a closed agent comes back.
                            if !lines.is_empty() {
                                t.dismissed = false;
                            }
                        }
                        t.len = len;
                        t.mtime = mtime;
                    }
                } else {
                    let Some(mut parser) = provider.parser() else { continue };
                    let Ok(offset) = read_session_bounded(parser.as_mut(), &file) else { continue };
                    let agent_id = self.next_id;
                    self.next_id += 1;
                    let (palette, hue_shift) = self.seats.get(&file).map(|s| (s.palette, s.hue_shift)).unwrap_or_else(|| palette_for(agent_id));
                    self.tracked.insert(file.clone(), Tracked { agent_id, provider: pi, subs: HashMap::new(), parser, offset, len, mtime, palette, hue_shift, directory: String::new(), tools: Vec::new(), shown: None, context: 0, session: None, dismissed: false });
                }
            }
        }

        // Diff each tracked session against what the office shows.
        let mut gone = Vec::new();
        for (path, t) in self.tracked.iter_mut() {
            let s = t.parser.session(path, t.mtime, now_ms, window);
            let filtered_out = !seen.contains(path);
            if s.status == SessionStatus::Stale || filtered_out {
                if t.shown.is_some() {
                    out.push(json!({ "type": "agentClosed", "id": t.agent_id }));
                }
                gone.push(path.clone());
                continue;
            }
            let id = t.agent_id;
            if t.dismissed {
                if t.shown.take().is_some() {
                    out.push(json!({ "type": "agentClosed", "id": id }));
                }
                // Sent again in full when it comes back.
                t.tools.clear();
                t.subs.clear();
                t.context = 0;
                continue;
            }
            if t.shown.is_none() {
                t.directory = Path::new(&s.cwd).file_name().map(|n| n.to_string_lossy().into_owned()).filter(|n| !n.is_empty()).unwrap_or_else(|| s.title.clone());
                let mut created = json!({ "type": "agentCreated", "id": id, "directoryName": t.directory, "isExternal": true, "palette": t.palette, "hueShift": t.hue_shift });
                if let Some(seat) = self.seats.get(path).and_then(|s| s.seat_id.clone()) {
                    created["seatId"] = json!(seat);
                }
                out.push(created);
                t.shown = Some(Shown::Active);
            }
            // Tools.
            for o in &s.open_tools {
                if !t.tools.iter().any(|(tid, _, _)| tid == &o.id) {
                    out.push(tool_start(id, o));
                    t.tools.push((o.id.clone(), o.label.clone(), o.tool.clone()));
                }
            }
            t.tools.retain(|(tid, _, _)| {
                let open = s.open_tools.iter().any(|o| &o.id == tid);
                if !open {
                    out.push(json!({ "type": "agentToolDone", "id": id, "toolId": tid }));
                }
                open
            });
            // Status.
            let want = shown_for(&s);
            let had = t.shown.unwrap_or(Shown::Active);
            if want != had {
                if had == Shown::Permission {
                    out.push(json!({ "type": "agentToolPermissionClear", "id": id }));
                }
                match want {
                    Shown::Active => out.push(json!({ "type": "agentStatus", "id": id, "status": "active" })),
                    Shown::Done => {
                        out.push(json!({ "type": "agentToolsClear", "id": id }));
                        t.tools.clear();
                        out.push(json!({ "type": "agentStatus", "id": id, "status": "waiting" }));
                    }
                    Shown::Asking => out.push(json!({ "type": "agentStatus", "id": id, "status": "waiting", "awaitingInput": true })),
                    Shown::Permission => out.push(json!({ "type": "agentToolPermission", "id": id })),
                }
                t.shown = Some(want);
            }
            // Sub-agents, after the parent's tools (its `Agent` call creates their characters).
            sync_subs(self.providers[t.provider].as_ref(), path, t, now_ms, window, &mut out);
            if s.context_tokens > 0 && s.context_tokens != t.context {
                out.push(json!({ "type": "agentContextUsage", "id": id, "contextTokens": s.context_tokens, "maxContextTokens": s.max_context_tokens }));
                t.context = s.context_tokens;
            }
            t.session = Some(s);
        }
        for p in gone {
            self.tracked.remove(&p);
        }
        out
    }

    /// Everything a freshly loaded office needs, after its layout: `existingAgents` first, then each
    /// agent's tools, bubble and context gauge (the order pixel-agents' server uses).
    pub fn snapshot(&self) -> (Value, Vec<Value>) {
        let mut shown: Vec<(&PathBuf, &Tracked)> = self.tracked.iter().filter(|(_, t)| t.shown.is_some()).collect();
        shown.sort_by_key(|(_, t)| t.agent_id);
        let mut meta = serde_json::Map::new();
        let mut dirs = serde_json::Map::new();
        let mut external = serde_json::Map::new();
        for (path, t) in &shown {
            let mut m = json!({ "palette": t.palette, "hueShift": t.hue_shift });
            if let Some(seat) = self.seats.get(*path).and_then(|s| s.seat_id.clone()) {
                m["seatId"] = json!(seat);
            }
            meta.insert(t.agent_id.to_string(), m);
            dirs.insert(t.agent_id.to_string(), json!(t.directory));
            external.insert(t.agent_id.to_string(), json!(true));
        }
        let existing = json!({ "type": "existingAgents", "agents": shown.iter().map(|(_, t)| t.agent_id).collect::<Vec<_>>(), "agentMeta": meta, "directoryNames": dirs, "externalAgents": external });
        let mut activity = Vec::new();
        for (_, t) in &shown {
            for (tid, label, tool) in &t.tools {
                match t.session.as_ref().and_then(|s| s.open_tools.iter().find(|o| &o.id == tid)) {
                    Some(o) => activity.push(tool_start(t.agent_id, o)),
                    None => activity.push(json!({ "type": "agentToolStart", "id": t.agent_id, "toolId": tid, "status": label, "toolName": tool })),
                }
            }
            let mut subs: Vec<&Sub> = t.subs.values().filter(|s| s.shown && !s.tools.is_empty()).collect();
            subs.sort_by(|a, b| a.parent_tool_id.cmp(&b.parent_tool_id));
            for sub in subs {
                for (tid, label, tool) in &sub.tools {
                    activity.push(sub_tool_start(t.agent_id, sub, tid, label, tool));
                }
            }
            match t.shown {
                Some(Shown::Done) => activity.push(json!({ "type": "agentStatus", "id": t.agent_id, "status": "waiting" })),
                Some(Shown::Asking) => activity.push(json!({ "type": "agentStatus", "id": t.agent_id, "status": "waiting", "awaitingInput": true })),
                Some(Shown::Permission) => activity.push(json!({ "type": "agentToolPermission", "id": t.agent_id })),
                _ => {}
            }
            if t.context > 0 {
                let max = t.session.as_ref().map(|s| s.max_context_tokens).unwrap_or(200_000);
                activity.push(json!({ "type": "agentContextUsage", "id": t.agent_id, "contextTokens": t.context, "maxContextTokens": max }));
            }
        }
        (existing, activity)
    }

    /// Sessions in the office, by agent id (the side panel and the agent list).
    pub fn agents(&self) -> Vec<(u32, AgentSession)> {
        let mut v: Vec<(u32, AgentSession)> = self.tracked.values().filter(|t| t.shown.is_some()).filter_map(|t| t.session.clone().map(|s| (t.agent_id, s))).collect();
        v.sort_by_key(|(id, _)| *id);
        v
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::providers::claude::{fixtures, ClaudeProvider};
    use serde_json::json;
    use std::io::Write;

    fn types(msgs: &[Value]) -> Vec<String> {
        msgs.iter().map(|m| m["type"].as_str().unwrap().to_string()).collect()
    }

    fn append(path: &Path, line: &str) {
        let mut f = std::fs::OpenOptions::new().append(true).create(true).open(path).unwrap();
        writeln!(f, "{line}").unwrap();
    }

    #[test]
    fn follows_a_session_through_a_turn() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("D--Game");
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("s1.jsonl");
        // Timestamps "now": the transcript was just written.
        let now = modified_ms(tmp.path()).max(1);
        let at = "2026-11-09T06:00:00.000Z";
        append(&file, &fixtures::user("Fix it", at));
        append(&file, &fixtures::tool_use("t1", "Edit", json!({ "file_path": "a.rs" }), at));

        let mut obs = Observer::new(vec![Box::new(ClaudeProvider::new(tmp.path().to_path_buf()))], ObserverConfig { window_ms: u64::MAX / 2, projects: vec![] });
        let now = now.max(modified_ms(&file));
        let first = obs.tick(now);
        assert_eq!(types(&first), ["agentCreated", "agentToolStart", "agentContextUsage"]);
        assert_eq!(first[0]["directoryName"], "Game");
        assert_eq!(first[1]["status"], "Editing a.rs");
        assert!(obs.tick(now).is_empty(), "nothing new, nothing sent");

        append(&file, &fixtures::tool_result("t1", at));
        append(&file, &fixtures::reply("Fixed.", at));
        let end = obs.tick(now + 1);
        assert_eq!(types(&end), ["agentToolDone", "agentToolsClear", "agentStatus"]);
        assert_eq!(end[2]["status"], "waiting");

        let (existing, activity) = obs.snapshot();
        assert_eq!(existing["agents"], json!([1]));
        assert_eq!(types(&activity), ["agentStatus", "agentContextUsage"]);
        assert_eq!(obs.agents()[0].1.last_reply, "Fixed.");

        append(&file, &fixtures::user("Again", at));
        assert_eq!(types(&obs.tick(now + 2)), ["agentStatus"], "new prompt → active");
    }

    #[test]
    fn closes_stale_and_filtered_sessions() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("D--Game");
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("s1.jsonl");
        append(&file, &fixtures::user("hi", "2026-11-09T06:00:00Z"));
        let m = modified_ms(&file);
        let mut obs = Observer::new(vec![Box::new(ClaudeProvider::new(tmp.path().to_path_buf()))], ObserverConfig { window_ms: 60_000, projects: vec![] });
        assert_eq!(types(&obs.tick(m + 1_000))[0], "agentCreated");
        assert_eq!(types(&obs.tick(m + 120_000)), ["agentClosed"]);
        assert!(obs.agents().is_empty());

        // Project filter that does not match → never created.
        let mut obs = Observer::new(vec![Box::new(ClaudeProvider::new(tmp.path().to_path_buf()))], ObserverConfig { window_ms: 60_000, projects: vec![PathBuf::from("E:\\Other")] });
        assert!(obs.tick(m + 1_000).is_empty());
        obs.set_config(ObserverConfig { window_ms: 60_000, projects: vec![PathBuf::from("D:\\Game")] });
        assert_eq!(types(&obs.tick(m + 1_000))[0], "agentCreated");
    }

    #[test]
    fn closed_agents_come_back_when_they_work_again() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("D--Game");
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("s1.jsonl");
        let at = "2026-11-09T06:00:00.000Z";
        append(&file, &fixtures::user("Fix it", at));
        append(&file, &fixtures::tool_use("t1", "Edit", json!({ "file_path": "a.rs" }), at));
        let now = modified_ms(&file);
        let mut obs = Observer::new(vec![Box::new(ClaudeProvider::new(tmp.path().to_path_buf()))], ObserverConfig { window_ms: u64::MAX / 2, projects: vec![] });
        assert_eq!(types(&obs.tick(now))[0], "agentCreated");

        assert!(!obs.dismiss(99), "unknown id");
        assert!(obs.dismiss(1));
        assert_eq!(types(&obs.tick(now)), ["agentClosed"]);
        assert!(obs.tick(now).is_empty(), "stays hidden while nothing happens");
        assert!(obs.agents().is_empty());
        assert_eq!(obs.snapshot().0["agents"], json!([]));

        append(&file, &fixtures::tool_result("t1", at));
        append(&file, &fixtures::tool_use("t2", "Bash", json!({ "command": "cargo test" }), at));
        let back = obs.tick(now + 1);
        assert_eq!(types(&back)[..2], ["agentCreated", "agentToolStart"]);
        assert_eq!(back[0]["id"], 1, "same agent, same id");
        assert_eq!(obs.agents().len(), 1);
    }

    #[test]
    fn remembers_seats_by_transcript() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("D--Game");
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("s1.jsonl");
        append(&file, &fixtures::user("hi", "2026-11-09T06:00:00Z"));
        let now = modified_ms(&file);
        let config = ObserverConfig { window_ms: u64::MAX / 2, projects: vec![] };
        let mut obs = Observer::new(vec![Box::new(ClaudeProvider::new(tmp.path().to_path_buf()))], config.clone());
        obs.tick(now);
        let seat = Seat { palette: 4, hue_shift: 90, seat_id: Some("desk-7".into()) };
        assert!(obs.remember_seats(&HashMap::from([(1, seat.clone()), (42, seat.clone())])));
        assert!(!obs.remember_seats(&HashMap::from([(1, seat.clone())])), "unchanged");
        assert_eq!(obs.seats().get(&file), Some(&seat));
        assert_eq!(obs.snapshot().0["agentMeta"]["1"], json!({ "palette": 4, "hueShift": 90, "seatId": "desk-7" }));

        // Next run (app restart): the seat comes back with the agent.
        let mut next = Observer::new(vec![Box::new(ClaudeProvider::new(tmp.path().to_path_buf()))], config);
        next.set_seats(obs.seats().clone());
        let created = next.tick(now);
        assert_eq!((created[0]["seatId"].as_str(), created[0]["palette"].as_u64(), created[0]["hueShift"].as_u64()), (Some("desk-7"), Some(4), Some(90)));
    }

    fn write_meta(sub_dir: &Path, name: &str, tool_use_id: &str, agent_type: &str, finished: bool) {
        let meta = json!({ "agentType": agent_type, "description": "Build the inventory", "toolUseId": tool_use_id, "finished": finished });
        std::fs::write(sub_dir.join(format!("{name}.meta.json")), meta.to_string()).unwrap();
    }

    #[test]
    fn sub_agents_get_their_own_tools_and_leave_when_done() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("D--Game");
        let subs = dir.join("s1").join("subagents");
        std::fs::create_dir_all(&subs).unwrap();
        let file = dir.join("s1.jsonl");
        let at = "2026-11-09T06:00:00.000Z";
        append(&file, &fixtures::user("/dev-story", at));
        append(&file, &fixtures::tool_use("toolu_spawn", "Agent", json!({ "description": "Build the inventory", "subagent_type": "gameplay-programmer", "run_in_background": true }), at));
        // An older sub-agent of the same session, already finished: never shown.
        write_meta(&subs, "agent-old", "toolu_old", "qa-tester", true);
        append(&subs.join("agent-old.jsonl"), &fixtures::tool_use("o1", "Read", json!({ "file_path": "x.md" }), at));
        // The live one, without its sidecar yet: skipped until the sidecar exists.
        let sub = subs.join("agent-a1.jsonl");
        append(&sub, &fixtures::user("Implement the inventory story", at));
        append(&sub, &fixtures::tool_use("s1", "Edit", json!({ "file_path": "Inventory.cpp" }), at));

        let mut obs = Observer::new(vec![Box::new(ClaudeProvider::new(tmp.path().to_path_buf()))], ObserverConfig { window_ms: u64::MAX / 2, projects: vec![] });
        let now = modified_ms(&sub).max(modified_ms(&file));
        let first = obs.tick(now);
        assert_eq!(types(&first), ["agentCreated", "agentToolStart", "agentContextUsage"]);
        assert_eq!((first[1]["agentType"].as_str(), first[1]["runInBackground"].as_bool()), (Some("gameplay-programmer"), Some(true)));

        write_meta(&subs, "agent-a1", "toolu_spawn", "gameplay-programmer", false);
        let next = obs.tick(now);
        assert_eq!(types(&next), ["subagentToolStart"]);
        assert_eq!((next[0]["parentToolId"].as_str(), next[0]["status"].as_str(), next[0]["agentType"].as_str()), (Some("toolu_spawn"), Some("Editing Inventory.cpp"), Some("gameplay-programmer")));
        assert!(obs.tick(now).is_empty(), "nothing new, nothing sent");

        // A reloaded office gets the sub-agent back with its tool.
        let (_, activity) = obs.snapshot();
        assert_eq!(types(&activity), ["agentToolStart", "subagentToolStart", "agentContextUsage"]);

        append(&sub, &fixtures::tool_result("s1", at));
        append(&sub, &fixtures::tool_use("s2", "Bash", json!({ "command": "build" }), at));
        assert_eq!(types(&obs.tick(now + 1)), ["subagentToolStart", "subagentToolDone"]);

        // The parent's background call returns at once; the sub-agent keeps working.
        append(&file, &fixtures::tool_result("toolu_spawn", at));
        append(&file, &fixtures::reply("Started.", at));
        assert_eq!(types(&obs.tick(now + 2)), ["agentToolDone", "agentToolsClear", "agentStatus"]);

        append(&sub, &fixtures::tool_result("s2", at));
        append(&sub, &fixtures::reply("Inventory done.", at));
        let end = obs.tick(now + 3);
        assert_eq!(types(&end), ["subagentClear"]);
        assert_eq!(end[0]["parentToolId"], "toolu_spawn");
        write_meta(&subs, "agent-a1", "toolu_spawn", "gameplay-programmer", true);
        assert!(obs.tick(now + 4).is_empty(), "cleared once");
        assert_eq!(types(&obs.snapshot().1), ["agentStatus", "agentContextUsage"]);
    }

    #[test]
    fn palettes_are_diverse() {
        assert_eq!(palette_for(1), (0, 0));
        assert_eq!(palette_for(6), (5, 0));
        assert_eq!(palette_for(7), (0, 45));
    }
}
