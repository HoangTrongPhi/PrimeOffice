# PrimeOffice — Progress

## Status
- Current phase: 0.3.0 built 2026-11-11 on the user's request (Chat, Studios + Video studio, Codex sessions); files
  in `release/0.3.0`; not published. 0.2.0 was released 2026-11-10. The user commits, pushes and publishes GitHub
  releases themself
- Last session: 2026-11-09 — app built from the template: Rust observer + providers + project check + CLI,
  vendored pixel-agents office in an iframe, Projects / History / Agents modules, generated character crew
- `npm run check`: green 2026-11-11 (66 Rust tests, 11 TS tests, typecheck, 30/30 commands mocked); `npm run build` green
- Seen in the Browser pane in `?mock` (office with 3 agents, agent detail, projects checklist, history) — no console errors
- CLI tried on real data: `check P:\…\Coral`, `history P:\…\Gogo_Gadgets`, `providers`
- Real window checked 2026-11-09 (`tauri build --debug --no-bundle`, embedded frontend + real CSP, inspected over
  WebView2's DevTools port): office iframe loads, 8 crew sprites + furniture decoded, the live Claude session walks in
  and its label follows each tool call, History lists real sessions, `check_project` works; no console errors after
  adding `font-src 'self' data:` to the CSP (Vite inlines small fonts).

## Phases
- [x] P0 Scaffold — `new-app`, sample module removed, rail: Office / Projects / History / Agents
- [x] P1 Core — `providers/claude.rs` (incremental JSONL parser, status heuristics), `activity.rs`, `project.rs`,
  `cli.rs` (check / history / providers) + tests
- [x] P2 Office — vendored pixel-agents UI (`src/office/`, VENDORED.md), `office.html` + `office-shim.js`,
  bridge (asset decode + messages), `observer.rs` → `office://message`, layout saved to app data
- [x] P3 UI — Projects (checklist with fixes), History (prompt / actions / reply), Agents, agent detail panel; mock
- [ ] P4 Art — [x] generated crew (8, CC0) [x] docs/ASSETS.md research [x] generated studio furniture (6, 2026-11-10) [ ] more furniture [ ] decide on classic chars (Q4)
- [ ] P5 Release 0.1.0 — approved by the user 2026-11-09. [x] git init + commit [x] signed build in `release/0.1.0`
  (installer 3.47 MB, latest.json, .sig, SHA256SUMS) [x] Abyss catalog set to `available` (revision 5, not pushed)
  [ ] `gh repo create HoangTrongPhi/PrimeOffice --public --source . --push` [ ] `gh release create v0.1.0 release/0.1.0/*`
  [ ] push Abyss (catalog) — the agent's auto mode blocks creating public repos/releases, so the user runs these
- [x] In-app Help / Hướng dẫn (F1, header "?", palette; VI / EN, `src/help/topics.ts` on `@abyss/ui` `HelpPanel`)
  added 2026-11-09 after the 0.1.0 build — not in `release/0.1.0`
- [ ] P6 Codex / Gemini sessions — [x] Codex rollouts (`providers/codex.rs`, 2026-11-11: parser + project match by
  `session_meta.cwd`, 5 tests, tried with `history C:\Users\<me>` on a real Codex 0.167 rollout; not yet seen as a
  character in the office window — no live Codex session at the time) [ ] Gemini CLI (not installed on this PC)
  [ ] Antigravity (`~/.gemini/antigravity/conversations`, protobuf/SQLite, not read)
- [ ] Munder Difflin integration — plan and ToS boundary in `docs/INTEGRATION_PLAN.md` (M1 = P6, M2 usage limits,
  M3 launching agents: approved by the user 2026-11-11, which ends "observe only"; steps M3a–M3f in the plan)
- [x] M3a Chat (2026-11-11, asked by the user: "a chatbox to give work, one session per conversation, like using
  Fork instead of GitHub Desktop") — `chat_cmd.rs` runs `claude -p --output-format stream-json` per message
  (`--resume` to continue), `chat://event` → `src/lib/chatEvents.ts` → `ChatTab` (Ctrl+2; the other tabs moved to
  Ctrl+3…5). Checked: 4 Rust tests + 4 node tests; `?mock` (send, tools, streamed reply, session list); the real
  CLI 2.1.319 through `spawn_turn` (`cargo test real_cli -- --ignored`: second turn resumed the first one's
  session and kept its context). Not yet tried in the real window. Limits: Claude Code only; a turn cannot ask
  for permission (refused calls are reported); one
  conversation at a time; Claude Desktop needs `/resume` to open a Chat session (not in its sidebar).
- [ ] M3c Permission prompts in Chat — started 2026-11-11, paused by the user until their plan's usage resets (the
  5-hour window was at 91%). Found so far on Claude Code 2.1.319: `--permission-mode` now takes `manual` (not
  `default`) — fixed in Chat; `--permission-prompts host|none` says who answers prompts under `--print` ("host" =
  the SDK host or `--permission-prompt-tool`). One probe with `--input-format stream-json` and an auto-allowed
  `echo` showed no request; a second probe (a `Write` in `manual` mode with `--permission-prompt-tool stdio`) was
  interrupted — the file was written, but whether a `control_request` / `can_use_tool` came first is not known.
  Next: rerun that probe (scratch script `perm_probe2.py` is gone with the session; it sends one user record on
  stdin and answers `control_request` with a `control_response` allow), then keep stdin open per turn in
  `spawn_turn`, emit the request as a chat item with Allow / Deny, and write the answer back.
  2026-11-11 (later the same day): the probe could not be rerun. On Claude Code 2.1.322 a turn started with
  `--input-format stream-json --permission-prompt-tool stdio --permission-mode manual` ended at once with "Your
  organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask
  your admin to enable access" (`claude auth status`: logged in). That is the account's policy, so it was left
  alone — and it means Chat itself (M3a) cannot run a turn on this account until that changes. The
  control_request / control_response shapes are still unverified; do not build on them before a probe passes.
  (From a shell started by Claude Desktop the CLI says "Not logged in": the host's `CLAUDE_CODE_*` /
  `ANTHROPIC_BASE_URL` variables are inherited; a clean environment shows the real state.)
- [x] M3d Whole conversation in Chat (2026-11-11) — `chat_history` (`providers::claude::conversation`): prompts,
  replies and tool calls of the main conversation from the transcript, in the shape of the frontend's `ChatItem`;
  the end of the file when it is over 8 MB / 1,000 entries (`truncated`); only `.jsonl` files inside
  `~/.claude/projects` are read. `openSession` shows the last exchange at once, then replaces it. Checked: 3 new
  Rust tests, one real transcript by hand (`real_transcript_conversation`, 1.4 MB → 45 entries), typecheck,
  25/25 commands mocked, `?mock` (open a session: prompts, tools incl. a failed one, the compaction note; no
  console errors). Not yet tried in the real window. Texts are cut at 20,000 characters; sub-agent talk and tool
  output are not shown.
- [x] M3e Terminal (2026-11-11) — tab Terminal (Ctrl+6): `term_cmd.rs` on `portable-pty` 0.9 (ConPTY) with
  `term_presets / term_open / term_write / term_resize / term_close` and `term://event`; presets claude, codex,
  gemini, shell (pwsh, else powershell.exe); an npm `.cmd` launcher runs through `cmd.exe /d /c`; at most 8
  terminals. Frontend: `termStore.ts`, xterm screens in `lib/termScreens.ts` (loaded with the tab, alive while
  the terminal is), `TerminalTab.tsx`; Chat's **Terminal** button opens `claude --resume <session>`. Checked: 6 new
  Rust tests (a real console in `spawn_pty`, a real shell through the IPC commands), typecheck, 30/30 commands
  mocked, `?mock`, and the real window (`tauri build --debug --no-bundle`, driven over WebView2's DevTools port):
  PowerShell ran a typed line, Claude Code 2.1.322's TUI drew at the fitted size (41 rows) through `claude.cmd`,
  `exit` showed "ended with code 0", × closed the tab; no console errors. Notes: ConPTY asks `ESC[6n` at the start
  and waits for the answer — xterm gives it, so a screen must exist before `term_open` (it does); portable-pty's
  Windows `kill()` reports success as an error, so its result is ignored. Not done: Codex / Gemini are not installed
  here (their buttons were only seen disabled); no restore of terminals after an app restart; a terminal opened by
  the Chat button on a session Chat is also using is not prevented (only disabled while a turn runs). The preset
  table is the cut-down "preset provider" of the plan (no model / resume flags beyond Claude's `--resume`, no
  custom command, no Antigravity).
- [x] Studios (2026-11-11, asked by the user: "each tab a company for one field, its own skill set later") — tab
  strip in Office, `studio_cmd.rs` (`studios.json`, `layout-<id>.json`), kinds in `src/lib/studios.ts`, Video
  studio plan (`gen-studio-layout.py` now builds every plan; game-studio.json unchanged byte for byte) and video
  departments in `departments.ts`. Seen in `?mock`: create a Video studio, its floor loads, switch back, Studio…
  dialog; no console errors. Not yet in the real window. Open: per-studio skill sets (the user picks them later;
  the video agent types are placeholders), area mappings and seats are still shared by all studios.
- [ ] P7 Optional Claude hooks via `primeoffice.exe hook` (exact permission bubbles)

## Decisions (answers to the spec's open questions)
- 2026-11-09 — Backend: native Rust, no Node sidecar; observe transcripts only, no hooks in 0.1 (user)
- 2026-11-09 — Project standard = "agent + Abyss" (spec §3.2) (user)
- 2026-11-09 — App in its own folder `PrimeOffice`, pixel-agents kept as the reference fork (user)
- 2026-11-09 — Office embedded as an iframe in pixel-agents' "VS Code webview" mode, so its code stays unchanged
  apart from three small observe-only patches (docs/UPSTREAM_PATCHES.md) (agent)
- 2026-11-09 — Q4: keep the classic characters — JIK-A-4 allows commercial use, credit in docs/ASSETS.md (agent, from the author's own statements)
- Q1 (active window 30 min), Q2 (history summary: mechanical, no LLM), Q3 (DeepSeek route): open;
  current defaults are 30 min / mechanical / "planned"

- 2026-11-09: fixed Close agent (hide until active), persisted office prefs/seats/areas (`office.json`), Agents-tab
  folder open, CLI "open with" folder, Projects missing-count wording; removed `get_settings`/`set_settings`.

## Known issues / next steps
- CSP needs `frame-src 'self'`, `connect-src 'self'` (asset fetches) and `font-src 'self' data:` — keep them.
- Sub-agents (2026-11-09): each `Agent`/`Task` call gets its own character, fed from
  `<session>/subagents/agent-*.jsonl` + `.meta.json` (`toolUseId` ties it to the call, `agentType` is kept).
  Messages carry `agentType` (and `runInBackground`). A transcript without its sidecar is skipped until it exists.
- Departments (2026-11-10): sub-agents walk to a desk in the Area of their department
  (`departments.ts`, agent type → department, matched on Area labels). "Floor plan…" in the Office tab loads
  the **Game studio** plan (`scripts/gen-studio-layout.py` → `public/assets/layouts/game-studio.json`, 46×39,
  13 rooms per the agreed map; main sessions sit at Studio head, which has no Area) or the classic office.
  Checked in `?mock` (writer → Narrative, ue-gas-specialist → Engine lab); not yet with a real UEHF session.
- Venues (2026-11-10): two or more director sub-agents at once meet in the meeting room (back to their desks as
  they finish); an engine MCP call (`mcp__unreal-mcp__call_tool`, unity/godot alike) sends the agent to the single
  "Editor desk" Area in Engine lab, one at a time, the next caller follows; a full department → stand in the room.
  Studio furniture drawn by `scripts/gen-furniture.py` (6 pieces, CC0). Layout script checks footprints don't
  overlap and every seat is reachable. Checked in `?mock` (gate → meeting room; editor hand-over by injected messages).
- Map tuned (2026-11-10, approved by the user): QA moved under Engine lab, Loc & community under Narrative; row 2
  taller (46×42) so Engineering has 10 desks (8 + 2 spare); main sessions whose turn is done rest in the Lounge
  (a question for the user or new work brings them back). Checked in `?mock`.
- Permission prompts are guessed (a non-long tool quiet for 10 s); exact bubbles need hooks (P7).
- Long transcripts are read head 256 KB + tail 4 MB for history; prompt counts are then partial.
- The office's furniture/floor art and classic characters come from pixel-agents (license notes in docs/ASSETS.md).
- `office` chunk is 513 kB (warning only); could lazy-load xterm, which the observe-only office never uses.
