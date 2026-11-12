# agent-desktop integration — research notes (session memory)

Session of 2026-11-12. The user asked for a plan to integrate agent-desktop
(`P:\Phineas_LIB\Gogo_Gadgets\agent-desktop`, the user's fork of vercel-labs/agent-desktop v1.2.0, Apache-2.0)
into PrimeOffice. Four read-only sub-agents surveyed the two projects. Nothing was built, run or changed.
These are their reports, kept so the work can resume after a reset.

Status of this file:
- [x] Robin — frontend / office UI
- [x] Nightwing — backend seams
- [x] Lucius Fox — packaging, probes, security
- [x] Oracle — agent-desktop audit (embedding surfaces, Windows limits, sessions/traces)
- [x] The plan — section 5, **proposed, waiting for the user's decisions in 5.4**; no milestone started

What agent-desktop is: a Rust CLI + `agent-desktop mcp` stdio MCP server + C library. It reads an app's
accessibility tree (UI Automation on Windows) as JSON with a ref per element; the agent clicks or types on a ref.
61 command names. No model inside. State under `~/.agent-desktop` (`AGENT_DESKTOP_HOME` moves it).

---

## 1. Robin — frontend map

Verified in code unless marked "docs claim".

### 1.1 How a tool call reaches the screen
- Rust `core/observer.rs` turns transcript changes into pixel-agents messages: `agentToolStart {id, toolId,
  status(label), toolName}` (observer.rs:105), `subagentToolStart` (:116), `agentToolDone`, `agentToolsClear`,
  `agentStatus`, `agentToolPermission` (:340-359), emitted on `office://message`.
- `src/office/bridge/officeBridge.ts:62-68` forwards each to the iframe with `postMessage`. Boot sends
  `providerCapabilities { readingTools: [Read, Grep, Glob, WebFetch, WebSearch] }` (:14, :78). Iframe to host goes
  through `public/office-shim.js`; the bridge whitelists a few types and drops the rest (:99-124).
- The shell also posts its own message to the frame: `agentLabels` (OfficeTab.tsx:155, :170), handled in
  `useExtensionMessages.ts:318`. This is the precedent for a shell-to-office custom message.
- In the iframe, `useExtensionMessages.ts:466-484` calls `os.setAgentTool(id, toolName)`. `characters.ts:320-326`:
  seated state uses `sprites.reading` if the tool is in `readingTools`, otherwise `sprites.typing`. Only three
  animations exist (walk / type / read).
- Labels: `src-tauri/src/core/activity.rs:56-86`. An unknown `mcp__agent-desktop__desktop_click` falls into `_`:
  kind `Other`, label "Using desktop_click", typing animation, no room change.
- Precedent for a tool-driven venue: `isEditorTool` (departments.ts:280-285, regex on the MCP server name
  unreal/unity/godot) → `syncEditor` (officeState.ts:595-603) walks the agent to the "Editor desk" Area, one at a
  time. Venues are `meeting | editor | lounge`, matched by Area-label aliases (departments.ts:205-211).
- Risk: the permission bubble is a guess — any tool not in `LONG_OR_EXEMPT` that is quiet for 10 s
  (providers/claude.rs:19-21, :261). `desktop_wait` or a slow `desktop_launch` would show a false "Needs approval".

### 1.2 Settings and per-studio / per-agent options
- App Settings dialog is appearance only (`components/layout/SettingsDialog.tsx`); `settingsStore.ts` holds only
  `helpLang`.
- Office bar toggles: the `Effects` button backed by `officeUiStore.fx` (OfficeTab.tsx:290; officeUiStore.ts:34,
  persisted via `partialize` :103). Pattern for a toggle = state + setter + partialize entry + a button with
  `aria-pressed`.
- Per studio: `Studio { id, name, kind, projects }` (types/primeoffice.ts:145) saved by `studio_cmd.rs` in
  `studios.json`; edited in the "Studio…" modal (OfficeTab.tsx:384). Shell-only per-studio state is in
  `officeUiStore.studioThemes`.
- Per agent: maps keyed by session id in `officeUiStore`; UI in `AddAgentModal.tsx` (builds the CLI command preview
  :125-131, passes `permissionMode` :150) and `AgentPanel.tsx`. Launch flags are validated in `term_cmd.rs:137-142`
  and `chat_cmd.rs:128-132`; no MCP-config flag exists today.
- The vendored office's own SettingsModal is mostly hidden (UPSTREAM_PATCHES row 4) — do not add settings there.

### 1.3 UI proposals, by value/effort
- **A. Recognise desktop tools (label + kind)** — smallest. `activity.rs` `describe`: match
  `mcp__*agent-desktop*__desktop_*` → new `ActionKind::Desktop`, labels like "Desktop: click", "Desktop: launch
  <app>", "Desktop: typing" (never echo typed text). Frontend: `ActionKind` (types/primeoffice.ts:35),
  `ACTION_ICON` (SessionView.tsx:12). Add observe tools (`desktop_snapshot`, `desktop_screenshot`, find/get) to
  `READING_TOOLS` in officeBridge.ts:14 so they reuse the reading sprite; act tools keep typing. Add desktop tools
  to `LONG_OR_EXEMPT`. No upstream patch. Mock: a desktop step in `startOfficeLoop` (mockBackend.ts:241-265).
- **B. "Phòng máy / Control Room" venue** — copy the editor-desk mechanism. Patch `departments.ts` (`Venue` + alias
  `control room / phong may`, `isDesktopTool`) and `officeState.ts` (`syncEditor` generalised; one-at-a-time fits a
  single real desktop). Add an Area in `scripts/gen-studio-layout.py` (see "Editor desk" extra_areas :359, :419)
  plus a room template in `rooms/room-templates.json`. Art: reuse `PC_FRONT_ON_*` / SERVER_RACK, or
  script-generate. Needs rows in `docs/UPSTREAM_PATCHES.md`. Mock: mirror `editorStep` (mockBackend.ts:271).
  Layouts already saved per studio will not get the room automatically.
- **C. "Controlling your desktop" indicator + Stop** — shell only. A banner/chip in the OfficeTab bar and on the
  AgentStrip card when any session's `openTools` holds a desktop tool; Stop = close the app-launched terminal
  (`term_close`) or abort the chat turn. For externally started sessions PrimeOffice can only observe — say so.
- **D. Desktop activity feed** — filter in CommandCenter `ActivityFeed` (CommandCenter.tsx:231) and the AgentPanel
  Activity tab on kind `desktop`, columns app / action / target. Needs A to carry app and ref name (label or new
  `SessionAction` fields: Rust + type + mock).
- **E. "Computer use" toggle per agent/studio + consent** — AddAgentModal section and Studio… modal; default off;
  first enable shows a consent modal. Needs a backend launch flag (MCP config). Highest effort.

### 1.4 Constraints
- Art: only CC0/CC-BY or script-generated in `public/assets`, each with a row in `docs/ASSETS.md`.
- Vendored code: every edit listed in `docs/UPSTREAM_PATCHES.md`, kept small. Stale note there: the patch table
  still says PrimeOffice "never launches agents".
- Not yet seen in the real window (docs claim): Chat M3a, M3d, Studios, Theme Studio / room templates / briefings,
  avatars and special themes, DC maps; Codex never seen as a character. The editor-desk venue was checked only in
  `?mock`, never with a real MCP session — proposal B builds directly on it.
- Chat cannot run a turn on this account (org policy), and in-chat permission prompts (M3c) are paused — a consent
  prompt per desktop action cannot rely on them; exact permission bubbles need hooks (P7, not done).
- Known mock defect: stale listeners after the office frame reloads (PROGRESS.md:151-152).

---

## 2. Nightwing — backend seams

Verified in code unless marked "docs".

### 2.1 How agents are launched today
- **Chat (Claude only)**, `chat_cmd.rs:105-135` `turn_args`: `claude -p --output-format stream-json --verbose
  --include-partial-messages [--resume <uuid>] [--model <m>] [--permission-mode …]`. Prompt on stdin, cwd = project
  folder, spawned by `spawn_turn` (`chat_cmd.rs:147`).
- **Terminal / "Add agent" (PTY)**, `term_cmd.rs:99-145` `term_argv`: `claude [--resume <id> | --session-id <uuid>]
  [--model] [--permission-mode]`; `codex [--model]`; `gemini [--model]`; shell = pwsh or powershell.exe. An npm
  `.cmd` launcher is wrapped as `cmd.exe /d /c` (:111), so every argument is strictly validated.
- **No MCP plumbing exists.** No `--mcp-config`, no `.mcp.json` handling, no writing to `.claude/settings*`, no env
  injection beyond `TERM` / `COLORTERM` (`term_cmd.rs:208-209`).
- **Studio/project**: `Studio { id, name, kind, projects: Vec<String> }` with at most one folder
  (`studio_cmd.rs:26-37`), saved in `studios.json` in app-local-data (`office_cmd.rs:114`). A new folder must
  contain a `.claude` directory (`studio_cmd.rs:128`); only its existence is checked.

### 2.2 How activity is observed
- **Polling, not watching**: a 1 s tick thread (`office_cmd.rs:20, 99-108`) runs `Observer::tick`
  (`core/observer.rs:247`), reading new JSONL lines per transcript. `utils/watch.rs` exists but is unused.
- `ActionKind` = Read, Edit, Run, Search, Web, Subagent, Ask, Plan, Skill, Other (`activity.rs:10-21`).
  `SessionStatus` = Active, Waiting, Done, Stale (`providers/mod.rs:49`). Observer `Shown` = Active, Done, Asking,
  Permission (`observer.rs:15`).
- What `mcp__agent-desktop__desktop_click` does today: `describe` returns `(ActionKind::Other, "Using
  desktop_click")` (`activity.rs:81-85`; Codex has the same fallback, `codex.rs:133`); it becomes an `OpenTool`
  (`claude.rs:215-226`) and is emitted as `agentToolStart` with the full `toolName`; the character "types"; a call
  open for more than 10 s flips to Waiting with a false permission bubble (`claude.rs:19-21, 260-262`;
  `observer.rs:184-189`).
- Not verified: how Codex names MCP calls in its rollouts.

### 2.3 Patterns to reuse
- Binary discovery: `find_program` / `installed(name)` (`chat_cmd.rs:85-97`) — PATH, then `~/.local/bin`, then
  `%APPDATA%\npm`, `.exe` then `.cmd`. No bundled sidecar today (`tauri.conf.json` has `bundle.resources` for PDFs
  only, no `externalBin`).
- Storage: `data_file(app, name)` + `utils/paths::write_atomic` (`studios.json`, `office.json`, `layout-<id>.json`).
  No settings command.
- `utils/jobs.rs` (`JobRegistry`), `logbus::emit`, the `PRESETS` + `term_presets` table (model for a "tool
  installed?" status), `cli.rs` subcommands, `ipc_tests.rs` `Harness`.
- `scripts/check-mock.mjs` fails `npm run check` if a command in `src/lib/ipc.ts` has no case in
  `src/dev/mockBackend.ts` — every new command needs a mock.
- `capabilities/default.json`: fs read-only on `**`, no shell plugin; all spawning is Rust-side.

### 2.4 Status and rules (docs)
- 0.6.0 released 2026-11-11. M1: Codex parser done, Gemini detection only. M2 not started. M3 a, d, e done; M3b
  blocked on a ToS check of OpenAI/Google; M3c paused; M3f not done. M4/M5 not approved. P7 (hooks) open.
- The account's org policy currently blocks Claude Code subscription turns, so Chat cannot be tried live
  (PROGRESS.md:54-58).
- Per-studio skill sets are "later, user picks" (PROGRESS:105, INTEGRATION_PLAN:88-91) — the natural slot for
  per-studio MCP.
- Hard rules (INTEGRATION_PLAN §2): vendor CLI binaries only; never read or copy OAuth tokens; no proxy between
  CLI and vendor; one account per vendor; transcripts read-only; documented non-interactive modes only; no
  auto-typing into the TUI (`term_cmd.rs:5-7`); do not modify `~/.claude/settings.json` (SPEC:24-25); never write
  Claude Desktop data.

### 2.5 Backend files to change or add
| File | Change | Size |
|---|---|---|
| NEW `src-tauri/src/core/desktop.rs` | Locate agent-desktop, version probe, read-only reader of its sessions/traces | M |
| NEW `src-tauri/src/commands/desktop_cmd.rs` | `desktop_status`, per-studio enable/disable, optional `desktop://event` | M |
| `commands/chat_cmd.rs` | `ChatRequest.mcp` → validated `--mcp-config <file>` in `turn_args`, tests | S |
| `commands/term_cmd.rs` | Same flag for the claude preset; Codex/Gemini need their own mechanism (unverified) | S-M |
| `commands/studio_cmd.rs` | `Studio.desktop` with `#[serde(default)]` and `normalized` | S |
| `core/activity.rs` | `ActionKind::Desktop` + labels for `desktop_*` | S |
| `core/providers/claude.rs` | Exempt `mcp__agent-desktop__*` from the 10 s permission guess | S |
| `core/providers/codex.rs` | Same mapping once Codex's MCP naming is verified | S |
| `core/observer.rs` | Optional `kind` on `agentToolStart`; merge trace events if used | S-M |
| `lib.rs`, `commands/mod.rs`, `core/mod.rs` | Register state and commands | S |
| `ipc_tests.rs` | Tests for the new commands | S |
| `tauri.conf.json` | `externalBin`, only if shipping the binary | S + release change |
| `cli.rs` | Optional `desktop` status subcommand | S |
| Docs: FORMATS, PROGRESS, INTEGRATION_PLAN, UPSTREAM_PATCHES | Formats, status, patches | S |

### 2.6 Risks
- Writing `.mcp.json` or `.claude/settings` into the user's project collides with "observe, don't modify" and
  dirties their git. Prefer a generated config in app-data passed via `--mcp-config`.
- `--mcp-config` with inline JSON is unsafe through the `cmd.exe /d /c` wrapper — use a file path with a restricted
  character set.
- Sessions started outside PrimeOffice will not get the server: two populations.
- Real permission prompts for MCP tools in `-p` mode are refused (M3c unresolved), so Chat + agent-desktop needs an
  `--allowedTools` or permission-mode decision.
- Codex/Gemini keep MCP config in their own config files, next to the auth files — sensitive; CLI flags or
  overrides only, verify first.
- An agent with desktop control could operate PrimeOffice's own window or its terminals — exclude them.
- `~/.agent-desktop` is a second private format to track; record it in FORMATS.md with a verified version.

---

## 3. Lucius Fox — probes, packaging, security

### 3.1 Probes on this machine (verified)
- `agent-desktop` is **not on PATH**; `target\release` and `target\debug` do not exist (never built here), so
  `version` / `status` were not run.
- `rustc 1.99.1`, `cargo 1.99.1`, `node v22.18.0`.
- agent-desktop pins Rust **1.89.0** (edition 2024). PrimeOffice: edition 2021, rust-version 1.82, no
  rust-toolchain file. Building inside agent-desktop would make rustup fetch 1.89.0 (inferred).
- `claude` 2.1.322 at `C:\Users\trong\.local\bin\claude.exe` (not on this shell's PATH); `codex` on PATH; `gemini`
  not found.
- `claude mcp add`: `-s/--scope local|user|project`, `-e`, stdio/sse/http; `.mcp.json` servers need approval.
  Runtime flags: `--mcp-config <file>`, `--strict-mcp-config`, `--allowedTools`, `--disallowedTools`.
- agent-desktop MCP: `{"command":"agent-desktop","args":["mcp"]}`; one tool per command (`desktop_snapshot`,
  `desktop_click`, …); global flags (`--session`, `--agent-id`, `--headed`, `--trace`) are **fixed when the server
  starts**.

### 3.2 Packaging — recommendation: build from the fork at a pinned commit, bundle as `externalBin`
Verified facts:
- Windows needs **no helper exe** (`docs/install.md`; `crates/windows` has no `bin/`). One `agent-desktop.exe`.
- PrimeOffice has no `externalBin` and no `tauri-plugin-shell`; it spawns with `std::process::Command`, so no shell
  capability is needed — only resolving the sidecar path beside the exe.
- `Abyss\scripts\release.ps1` signs with minisign for the updater only; no Authenticode step was found.
- Upstream binaries are **unsigned**; the docs say Smart App Control on a clean Windows 11 blocks them and
  antivirus may quarantine them.
- The fork has only `origin` (HoangTrongPhi), no `upstream` remote, no tags; HEAD `54855b6` (#642). Inferred: no
  commits of its own yet; not established whether HEAD equals the v1.2.0 tag.

| Option | Assessment |
|---|---|
| 1. `externalBin` sidecar | Updates with the NSIS updater, version always matches, works offline. Size: CI caps the exe at 15 MB; installer is 4.54 MB today, so it at least doubles (inferred, not built) |
| 2. User's `npm i -g` | No size cost, but versions drift and PrimeOffice cannot control flags; only as a "detect" fallback |
| 3. Download on demand | `checksums.txt` does not prove origin (the docs say so), needs `gh attestation`; supply-chain and SmartScreen risk |
| 4. Build from the fork | Controlled source, pinned commit; a few minutes more per build + toolchain 1.89.0 |

Apache-2.0: ship the LICENSE text and credit in About / third-party; the repo has **no NOTICE file**; if the fork
changes code, the changed files must say so (§4b). Add an `upstream` remote to follow security fixes.

### 3.3 Risks and guardrails
`SECURITY.md` is only a reporting policy. `command_policy` checks OS permission and argument validity only —
**no app allowlist, no read-only mode**. `sandbox` has a macOS VM provider only; nothing on Windows.

| Risk | agent-desktop provides | PrimeOffice must build |
|---|---|---|
| Prompt injection from on-screen text leading to actions | Nothing | Off by default, opt-in per studio, confirm write actions |
| Agent drives a terminal / logged-in browser / PrimeOffice itself | Nothing | App allowlist (MCP wrapper or proxy filtering `--app`); ban PrimeOffice, terminals, browsers, Claude Desktop |
| Clipboard, screenshot, snapshot content leaks into transcripts | `--stdin` keeps text out of argv and results; secure fields masked; trace masks `text/value/name/title/url`. `clipboard-get`, notifications and `--screenshots` are **not** masked | `--disallowedTools` for clipboard / screenshot / notification by default |
| Elevated / UAC windows | UIPI: admin windows readable, writes give `PERM_DENIED`; secure desktop out of reach | Never run PrimeOffice elevated |
| Physical input, dangerous keys | Needs `--headed`; blocks alt+f4, win+r, win+l… (`--force` overrides); held input fails closed; `close-app` refuses system processes; a lease stops two agents colliding | Never pass `--headed`; block `--force` |
| Cannot be stopped | No kill switch | Hotkey / Stop button (kill the MCP process), visible indicator |
| Audit | `session` + `trace` | Turn on `--session` / `--trace`, a separate `AGENT_DESKTOP_HOME` per studio, show the log |

Note: headless mode still allows `click`, `set-value`, `launch`, `close-app` and clipboard on any app at the same
integrity level — leaving out `--headed` is not a guardrail by itself.

**ToS (`INTEGRATION_PLAN.md` §2):** MCP through `--mcp-config` is a documented CLI feature, no proxy, no token
read — no direct conflict. **Indirect** conflict: an agent with desktop control could type into the `claude` TUI,
Claude Desktop or claude.ai (the banned `hiddenClaude.ts` pattern), or open credential files through Notepad or
Explorer. Those apps must be banned in the allowlist.

### 3.4 Open questions for the user
1. Accept a larger installer and a sidecar without Authenticode (Smart App Control may block it)?
2. Will the fork change code, or only pin upstream? Pin tag v1.2.0 or HEAD?
3. Claude first, or Codex/Gemini too (how they take MCP and their terms are unchecked)?
4. Start observe-only (snapshot/find) and open write actions later?
5. Allowlist chosen by the user per studio, or preset by PrimeOffice?

Not verified: real exe size, runtime behaviour on this machine, whether `press` works headless on Windows, the
fork's diff against upstream.

---

## 4. Oracle — agent-desktop audit

Read-only; nothing built or run. "Code" = read in source. "Docs" = only stated in docs/skills.

### 4.1 Embedding surfaces
- **CLI child process** (code): one JSON envelope per call; exit codes 0/1/2. On Windows a single exe, no helper
  (`npm/lib/platform.js`, `docs/install.md`). Cost: one process spawn per command.
- **`agent-desktop mcp`** (code, `src/mcp/`): stdio server in the same exe. Each tool call re-spawns
  `current_exe()` as a child. Max 8 concurrent calls, 4 MiB per message.
- **FFI cdylib** (`crates/ffi`): `agent_desktop_ffi.dll` + `include/agent_desktop.h`. Must be built with
  `--profile release-ffi`. Narrower than the CLI (no window targeting, skeleton mode or `--root`; docs). Forces
  process-wide MTA and per-monitor-v2 DPI on the host (`crates/windows/src/system/runtime/com_runtime.rs`). Cannot
  start the cursor overlay.
- **Direct Rust crates**: `agent-desktop-core` and `agent-desktop-windows` are `publish = false` (path/git only);
  edition 2024, rust 1.89. `dispatch`, `command_policy`, batch and CLI args live in the binary crate, not core, so
  that glue would be re-implemented. AGENTS.md says only the binary and FFI crates may wire a platform to core.

### 4.2 Windows specifics (mostly `skills/agent-desktop-windows/`, docs)
- **Headless**: snapshot/find/get/is/screenshot, click, set-value, clear, select, toggle, check, expand, scroll,
  window operations, clipboard, wait.
- **Needs `--headed`** (else `POLICY_DENIED`): `type`, `right-click`, `double-click`, `triple-click`, `focus`,
  cursor-moving mouse input, `open-system-surface`, notifications when the Action Center is closed.
- **Refused**: `key-down`, `key-up`, `mouse-down`, `mouse-up`; `quick-settings`; sandboxes.
- No permission grant needed. UIPI: elevated apps can be read, not driven. Unsupported: Session 0, locked desktop,
  UAC secure desktop.
- Binary is unsigned; Smart App Control on a clean Windows 11 blocks it (`docs/install.md`).
- Electron/WebView2/Chromium (`references/chromium-and-electron.md`): first snapshot is thin, cold settle takes
  10–25 s (pass `--timeout-ms`); deep unnamed groups need `--max-depth` or `--root`; covered windows stay thin,
  minimized windows are not drivable; unnamed or duplicate web elements give `AMBIGUOUS_TARGET`.

### 4.3 Sessions, traces, state (code)
- Root: `~/.agent-desktop` or `AGENT_DESKTOP_HOME` (`crates/core/src/storage/state_root.rs`).
- Layout: `sessions/<id>/session.json`; `sessions/<id>/trace/<pid>-<startMs>.jsonl`;
  `sessions/<id>/snapshots/<snapshot_id>/refmap.json`; `sessions/<id>/latest_snapshot_id`; with
  `session start --screenshots`: `trace/screens/*.png`, `trace/refmaps/`.
- Selection: `--session`, then `AGENT_DESKTOP_SESSION`, then global. `session start` activates nothing.
- **Tracing is on only if the manifest exists with `trace: on`**; a bare `--session` id writes nothing.
- What to watch: the `trace/` directory. Each CLI process (so each MCP tool call) creates a new append-only JSONL
  segment. Line: `event`, `ts_ms`, `seq`, `writer_pid`, `writer_proc_start_ms`, `session_id` + fields; first line
  `trace.meta` (schema 1).
- Events: `command.start {command}`, `snapshot.saved {snapshot_id, ref_count, app}`,
  `ref.resolve.start|ok|error|entry`, `actionability.check.*`, `action.dispatch.start|ok {ref, action, result}`,
  `input.focus_window`, `action.artifacts`, `command.end {command, ok, duration_ms, code}`.
- Redaction: keys containing name, title, text, value, url, label, description… become `{"redacted":true}`
  (`trace/trace_sanitize.rs`). The element behind a `ref` is in `refmap.json`, which is **unredacted**.
- Limits: 64 MiB per file, ~32 MiB / 100k events per session, snapshots pruned 128 → 96.
- Writers lock per line; a tailing reader on Windows should retry on a lock violation (inferred).
- Alternative: `trace show --limit N --event PREFIX` returns the merged timeline as JSON.

### 4.4 Policy and safety
- `src/command_policy/mod.rs` is an OS-permission preflight plus ref/argument validation. **No allow/deny list, no
  host-configurable policy** (code).
- Built-in: blocked shortcuts (alt+f4, win+l, alt+tab, win+r…) unless `--force`; `close-app` refuses critical
  processes; a cross-process interaction lease serialises mutations per OS user.
- The host's levers today: omit `--headed`, and filter MCP tools at the agent-CLI level.
- Sandbox: only the `macos` provider (`crates/core/src/sandbox/provider_table.rs`).

### 4.5 MCP
- Tool names `desktop_<command path>`: `desktop_snapshot`, `desktop_click`, `desktop_session_start`,
  `desktop_trace_show`, `desktop_batch`, `desktop_skills_get` (`src/mcp/catalog.rs`). Result = envelope as text +
  `structuredContent`; screenshots as an image block.
- **Global flags are fixed at server start**: `agent-desktop --session <id> --headed mcp` (`forwarded_globals` in
  `src/mcp/mod.rs`). Environment variables reach children by inheritance. So: one MCP server per agent/session,
  `--headed` all-or-nothing per server.
- Registration (inferred): command `agent-desktop.exe`, args `["--session","<id>","mcp"]`, env
  `AGENT_DESKTOP_HOME`. PrimeOffice must run `session start` first and inject the id.

### 4.6 Surprises
- **The cursor overlay needs the exe named exactly `agent-desktop.exe`**
  (`crates/windows/src/system/cursor_overlay/image_identity.rs`); a renamed sidecar or FFI/crate host gets
  `rendered: false`.
- npm `postinstall` and release archives point at upstream vercel-labs, not the fork.
- An agent can call `desktop_session_start` / `desktop_session_end` itself; ending the session makes later
  commands refuse. `desktop_batch` runs any command, so it bypasses a per-tool filter.
- `refmap.json` and `--screenshots` artifacts hold unredacted screen content.
- MCP cancel on Windows hard-kills the child.

---

## 5. The plan (Batman's synthesis — proposed, not yet approved by the user)

### 5.1 Architecture decisions
1. **Out of process, over MCP.** PrimeOffice never links agent-desktop (no FFI, no crate dependency): the toolchains
   differ (edition 2024 / 1.89 vs 2021 / 1.82), the glue lives in the binary crate, and in-process UIA would touch
   PrimeOffice's own WebView2 window.
2. **Config in app-data, passed by flag.** PrimeOffice writes `mcp-desktop-<studio>.json` in its app-data and adds
   `--mcp-config <file>` to the launch. Nothing is written into the project, `~/.claude`, or vendor config files.
3. **One MCP server per launched agent**, with its own agent-desktop session (`session start`, trace on) and
   `AGENT_DESKTOP_HOME` under PrimeOffice's app-data.
4. **Ship one sidecar named exactly `agent-desktop.exe`**, built from the fork at a pinned commit; fall back to
   one found on PATH.
5. **Claude first.** Codex/Gemini wait for the ToS check that already blocks M3b.
6. **Off by default, opt-in per studio, observe-only first.** Write actions open only after the guardrails of D3
   exist. Never `--headed`, never `--force`.
7. **Two observation channels.** Transcripts (already there) give the office animation; the trace directory gives
   the detailed feed. Never show or store refmap/screenshot content outside the user's machine.

### 5.2 Milestones
| # | Milestone | What lands | Proves |
|---|---|---|---|
| D0 | Spike | Build the fork exe (size, `status`, `version`); try `claude --mcp-config <file>` through the PTY path with a hand-written config; record the real tool names in the transcript and one trace file; check Smart App Control | Every "inferred / not verified" item in sections 1–4 |
| D1 | Recognise and show | `ActionKind::Desktop`, labels, reading sprite for observe tools, no false "Needs approval", icon, activity-feed filter, mock step | Desktop use is visible, even for sessions started outside PrimeOffice |
| D2 | Ship and wire (observe-only) | Sidecar + discovery, `core/desktop.rs`, `desktop_cmd.rs`, `Studio.desktop` toggle (default off) + consent modal, generated MCP config, `--mcp-config` in `term_cmd` for Claude, session + trace started per agent, tool filter limited to snapshot / find / get / is / list-* / wait / skills | A PrimeOffice-launched Claude can read the desktop and nothing else |
| D3 | Guardrails, then write actions | In the fork: host policy by environment (app allowlist + read-only mode), enforced in `command_policy`. In PrimeOffice: per-studio allowlist UI, fixed deny list (PrimeOffice, terminals, browsers, Claude Desktop), "Controlling your desktop" indicator, Stop button + hotkey that kills the MCP process; `desktop_batch`, `desktop_session_*`, clipboard, screenshot, notifications stay filtered | Write actions are confined, visible and stoppable |
| D4 | Office | "Phòng máy / Control Room" venue + room template, trace-driven feed (app / action / result), optional cursor overlay | The office shows it |
| D5 | Other vendors | Codex / Gemini wiring | Only after the M3b ToS check |

D1 needs nothing from D0 and can start at once. D2 depends on D0. D3 depends on D2. D4 depends on D1 (venue) and
D2 (trace).

### 5.3 Who does what (one owner per set of files)
| Agent | Owns | D0 | D1 | D2 | D3 | D4 |
|---|---|---|---|---|---|---|
| **Oracle** | the `agent-desktop` fork | Build + run `status`, capture a real trace | — | Answers on flags and formats | Host policy (allowlist, read-only) + tests + skill text | Overlay naming check |
| **Nightwing** | `PrimeOffice/src-tauri/**` | `--mcp-config` trial through the PTY | `activity.rs`, `claude.rs`, `observer.rs` | `desktop.rs`, `desktop_cmd.rs`, `term_cmd.rs`, `studio_cmd.rs`, `ipc_tests.rs` | Kill switch, deny list, policy env | Trace reader → `desktop://event` |
| **Robin** | `PrimeOffice/src/**`, `public/**`, art scripts | — | types, icon, `READING_TOOLS`, feed filter, mock | Studio toggle, consent modal, AddAgent preview, `ipc.ts` + mock | Indicator, Stop, allowlist editor | Venue patch, room template, `UPSTREAM_PATCHES.md` |
| **Lucius Fox** | `tauri.conf.json`, release scripts, licence docs | Size, Smart App Control, toolchain | — | `externalBin`, build step from the pinned commit, LICENSE + credits | Security review of D3 before write actions open | Release checklist |
| **Batman** | docs, contracts between agents, review | Go / no-go after D0 | Contract: kind string `desktop`, tool-name pattern | Contract: command names, config file shape | Sign-off | PROGRESS.md |

Not hired: a fifth and sixth agent. The work splits into four file sets; more writers would only overlap.

### 5.4 Decisions the user has to make
1. May the fork be changed (host policy in `command_policy`)? Without it there is no app allowlist, and write
   actions should stay closed. Recommended: yes.
2. Bundle the unsigned sidecar in the installer (bigger download, Smart App Control may block it), or only detect a
   user-installed one? Recommended: bundle, with detect as fallback.
3. Observe-only first (D2), write actions only after D3? Recommended: yes.
4. Claude only until the Codex/Gemini ToS check is done? Recommended: yes.
