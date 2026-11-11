# PrimeOffice — File formats

Every JSON file PrimeOffice reads or writes. PrimeOffice itself never writes into a project folder or into an agent's
own files; everything it keeps is in `%LOCALAPPDATA%\com.phineas.primeoffice\`. (An agent started from the Chat tab
does change the project, as any Claude Code session does.)

## Read: agent sessions

| Agent | Where | Notes |
|---|---|---|
| Claude Code | `~/.claude/projects/<normalized cwd>/<session>.jsonl` | One JSON record per line. Used: `user` (prompt or `tool_result`), `assistant` (`text`, `tool_use`, `usage`, `model`, `stop_reason`), `system` `turn_duration`, `last-prompt`, `custom-title`, `agent-name`, `summary`; common fields `sessionId`, `cwd`, `entrypoint`, `timestamp`, `isSidechain`, `isMeta`. Unknown records are skipped. Normalized cwd = every char outside `[A-Za-z0-9-]` → `-` per UTF-16 unit. |
| Codex CLI | `~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<id>.jsonl` | One `{ timestamp, ordinal, type, payload }` record per line (verified on Codex CLI 0.167, 2026-11-11). Used: `session_meta` (`id`, `cwd`, `originator`), `turn_context` (`model`), `response_item` with `payload.type` = `message` (`role` user / assistant, text parts; user text starting with `<` is injected context), `custom_tool_call` / `function_call` / `local_shell_call` (`call_id`, `name`, `input` or `arguments`) and their `*_output`, `event_msg` with `payload.type` = `task_started`, `task_complete` (`last_agent_message`), `turn_aborted`, `token_count` (`info.last_token_usage.input_tokens`, `info.model_context_window`). Unknown records are skipped. A rollout belongs to a project when `session_meta.cwd` is that folder. `auth.json` and the SQLite files beside the sessions are never opened. |
| Gemini | `~/.gemini/tmp` | Only checked for existence |

## Read: a chat turn (Claude Code CLI, stdout)

The Chat tab runs `claude -p --output-format stream-json --verbose --include-partial-messages [--resume <session>]
[--model <m>] [--permission-mode <mode>]` in the project folder, the message on stdin (verified on Claude Code
2.1.319, 2026-11-11). One JSON record per line; `src/lib/chatEvents.ts` uses:

| Record | Used |
|---|---|
| `system` / `init` | `session_id` (the id of a new session), `model` |
| `stream_event` | `event.type = content_block_delta` with `delta.type = text_delta`: reply text as it arrives |
| `assistant` | `message.content[]`: `text` (the whole block) and `tool_use` (`id`, `name`, `input`) |
| `user` | `message.content[]` of `tool_result` (`tool_use_id`, `is_error`): the tool finished |
| `rate_limit_event` | `rate_limit_info.status`, `.rateLimitType` (`five_hour`, `seven_day`): shown when not `allowed` |
| `result` | `is_error`, `subtype`, `result`, `errors[]`, `permission_denials[]`, `total_cost_usd` |

Records with a `parent_tool_use_id` belong to a sub-agent and are left to the office. Everything else
(`system` `status` / `thinking_tokens` / `post_turn_summary`, other `stream_event`s) is ignored. The frontend gets
them as `chat://event` `{ chatId, line }`, then `{ chatId, done: { code, stderr } }` when the process ends.
PrimeOffice writes nothing itself: the CLI saves the session in `~/.claude/projects` as it always does.

## Written by the app (`%LOCALAPPDATA%\com.phineas.primeoffice\`)

- `projects.json` — opened project folders, newest first: `["D:\\Game", "P:\\Tools"]`
- `studios.json` — the studios of the Office tab and the one on screen (since 0.4 a studio follows one project:
  `projects` holds at most one folder, which had its own `.claude` when it was given, and no folder is in two
  studios; older files are tidied on load — first folder kept, a folder already taken by an earlier studio dropped):
  `{ "active": "video-1", "studios": [{ "id": "main", "name": "Game studio", "kind": "game", "projects": [] },
  { "id": "video-1", "name": "YouTube", "kind": "video", "projects": ["D:\\Vlog"] }] }`. `id`: `a-z0-9-`, unique;
  `kind`: `game` | `video` | `classic` (an unknown kind shows the classic office); `projects`: folders whose agents
  appear in the studio, empty = every project. Missing → one Game studio `main`. At most 12 studios.
- `layout-<id>.json` — the layout of studio `<id>`, same structure as `layout.json` (the layout of studio `main`).
  Missing → the first theme of the studio's kind (`src/lib/studios.ts`: `layouts/game-campus.json`,
  `layouts/video-studio.json`, `default-layout-1.json`). Deleted with its studio.
- `layout.json` — the office layout saved by the editor (pixel-agents `OfficeLayout`: `{ version: 1, cols, rows,
  tiles[], furniture[], tileColors? }`). Missing → the bundled `public/assets/default-layout-1.json`.
- `office.json` — what the office UI changes itself (`OfficePrefs`): `soundEnabled`, `alwaysShowLabels`,
  `showAreas`, `areaMappings` (folder → area labels), `seats` (transcript path → seat), and since 0.4
  `roomTemplates`: rooms kept in Theme Studio, at most 50, each a `RoomTemplate` of `src/lib/rooms.ts`
  `{ id, label, zone, w, h, floor, floorColor, areaColor, seats, furniture: [{ type, col, row }] }` (furniture
  relative to the room's top-left floor tile; wall decor has negative rows). Written by the `saveRoomTemplates`
  office message, read back in `office_snapshot.roomTemplates`.
- `settings.json` — app settings (template; nothing app-specific yet).

## Bundled with the app (`public/assets/`)

- `layouts/game-campus.json`, `layouts/game-open.json`, `layouts/video-studio.json` — studio themes (pixel-agents
  `OfficeLayout` with `areas` / `areaTiles`), drawn by `scripts/gen-studio-layout.py`.
- `rooms/room-templates.json` — `{ version: 1, rooms: RoomTemplate[] }`, the rooms of Theme Studio → Add a room,
  drawn by the same script.

## Reports (`--report`)

The command line writes the same structure the app shows.

### `primeoffice check <folder> --report r.json` — `ProjectReport`

```json
{
  "path": "D:\\Game",
  "name": "Game",
  "ready": false,
  "ok": false,
  "cancelled": false,
  "elapsedMs": 2,
  "checks": [
    { "code": "folder.exists", "severity": "error", "passed": true, "title": "Folder exists and can be read", "message": "Found", "fix": "" },
    { "code": "agent.sessions", "severity": "error", "passed": false, "title": "Agent sessions for this folder", "message": "No agent has run in this folder yet", "fix": "Start an agent in this exact folder once (e.g. `claude` in a terminal opened here)" },
    { "code": "agent.instructions", "severity": "warn", "passed": true, "title": "Agent instructions (CLAUDE.md or AGENTS.md)", "message": "Found CLAUDE.md", "fix": "" }
  ],
  "issues": [
    { "severity": "error", "code": "agent.sessions", "message": "Agent sessions for this folder — Start an agent in this exact folder once (e.g. `claude` in a terminal opened here)", "path": "D:\\Game" }
  ],
  "sessions": [],
  "lastSessionMs": null
}
```

Check codes: `folder.exists` (error), `agent.sessions` (error), `agent.instructions` (warn), `agent.settings` (info),
`vcs.git` (warn), `abyss.spec` (warn), `abyss.progress` (warn), `abyss.changelog` (info), `abyss.readme` (info).
Ready = no failed check at the error level.

### `primeoffice history <folder> --report r.json` — `AgentSession[]`

```json
[
  {
    "provider": "claude",
    "sessionId": "98ed76b8-23cc-4afa-a915-1db45dc90fe0",
    "title": "PrimeOffice app setup",
    "cwd": "P:\\Phineas_LIB\\Gogo_Gadgets",
    "transcriptPath": "C:\\Users\\me\\.claude\\projects\\P--Phineas-LIB-Gogo-Gadgets\\98ed76b8-….jsonl",
    "entrypoint": "claude-desktop",
    "model": "claude-opus-5-5",
    "startedAt": "2026-11-09T06:14:49.313Z",
    "lastActivityAt": "2026-11-09T06:40:43.592Z",
    "modifiedMs": 1794206443592,
    "status": "active",
    "lastPrompt": "…",
    "lastReply": "…",
    "promptCount": 1,
    "contextTokens": 77194,
    "maxContextTokens": 200000,
    "actions": [{ "at": "2026-11-09T06:40:40.000Z", "kind": "edit", "tool": "Write", "label": "Writing cli.rs" }],
    "openTools": []
  }
]
```

`status`: `active` (working), `waiting` (asked the user, or a quiet non-long tool — likely a permission prompt),
`done` (turn finished), `stale` (outside the active window). `actions[].kind`: `read`, `edit`, `run`, `search`,
`web`, `subagent`, `ask`, `plan`, `skill`, `other`. At most 50 actions; texts cut to 500 characters.
