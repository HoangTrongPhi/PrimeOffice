# PrimeOffice — File formats

Every JSON file PrimeOffice reads or writes. PrimeOffice never writes into a project folder or into an agent's own
files; everything it keeps is in `%LOCALAPPDATA%\com.phineas.primeoffice\`.

## Read: agent sessions

| Agent | Where | Notes |
|---|---|---|
| Claude Code | `~/.claude/projects/<normalized cwd>/<session>.jsonl` | One JSON record per line. Used: `user` (prompt or `tool_result`), `assistant` (`text`, `tool_use`, `usage`, `model`, `stop_reason`), `system` `turn_duration`, `last-prompt`, `custom-title`, `agent-name`, `summary`; common fields `sessionId`, `cwd`, `entrypoint`, `timestamp`, `isSidechain`, `isMeta`. Unknown records are skipped. Normalized cwd = every char outside `[A-Za-z0-9-]` → `-` per UTF-16 unit. |
| Codex, Gemini | `~/.codex/sessions`, `~/.gemini/tmp` | Only checked for existence (0.1) |

## Written by the app (`%LOCALAPPDATA%\com.phineas.primeoffice\`)

- `projects.json` — opened project folders, newest first: `["D:\\Game", "P:\\Tools"]`
- `layout.json` — the office layout saved by the editor (pixel-agents `OfficeLayout`: `{ version: 1, cols, rows,
  tiles[], furniture[], tileColors? }`). Missing → the bundled `public/assets/default-layout-1.json`.
- `settings.json` — app settings (template; nothing app-specific yet).

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
