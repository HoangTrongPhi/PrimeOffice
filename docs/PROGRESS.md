# PrimeOffice — Progress

## Status
- Current phase: **0.6.0** released 2026-11-11 on the user's request (avatars by theme, special themes with
  effects, DC BatCave and Hall of Justice with their own maps and art) — signed files in `release/0.6.0`,
  committed, pushed and published by Claude (the user asked for it this time). 0.5.0 was released 2026-11-11.
- 2026-11-12 — **agent-desktop integration, research only** (nothing built or changed in code): the sub-agent
  reports are in `docs/AGENT_DESKTOP_NOTES.md` (four reports + the proposed plan D0–D5 in its section 5; waiting for
  the user's decisions in 5.4, no milestone started).
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
- [x] Office control room (2026-11-11, asked by the user: "Office like cusMunderDifflin — Add agent, Command Center…,
  features only, keep our colours and theme") — layout taken from Munder Difflin's App / AgentStrip / AgentDetailPanel
  / CommandCenterPanel / AddAgentModal, rebuilt on PrimeOffice's own data and theme tokens (no code or art copied):
  `components/office/` (AgentStrip, AgentPanel + TermPanel, CommandCenter, AddAgentModal, TermView + TermComposer),
  `stores/officeUiStore.ts` (terminal-card selection, sidebar width/tabs, names by session id). Backend:
  `term_open` takes `newSessionId` (`claude --session-id`), `model` (`--model`, claude/codex/gemini) and
  `permissionMode` (claude), all checked like Chat's; tests added. A first task / dispatch is pasted through xterm
  (bracketed when the program asks) and Enter once the output has been quiet 1.5 s. Checked: 66 Rust tests, typecheck,
  30/30 mocked, `?mock` (Add agent → card + sidebar terminal with the first task typed; Conversation tab;
  Terminal = resume; Dispatch into a terminal), and the real window (debug build with its own WebView2 folder, since
  the installed copy was running): Shell agent ran its first task (`prime-42-office`), Claude Code started with
  `--session-id` and drew its TUI in the sidebar, End removed its card; no console errors. Left out of Munder
  Difflin's: the orchestrator ("Michael") and its tabs (tasks, ask me, triggers, memory, graph, skills, workers —
  M4/M5 or out of scope), token budgets / breaker, restore team, characters and colours per agent, git isolation
  (M3f), the IDE. Not checked: Codex / Gemini model flags on a real CLI (not installed); a Claude first task
  reaching the model (the account's policy blocks Claude Code turns, see M3c).
- [x] Studios (2026-11-11, asked by the user: "each tab a company for one field, its own skill set later") — tab
  strip in Office, `studio_cmd.rs` (`studios.json`, `layout-<id>.json`), kinds in `src/lib/studios.ts`, Video
  studio plan (`gen-studio-layout.py` now builds every plan; game-studio.json unchanged byte for byte) and video
  departments in `departments.ts`. Seen in `?mock`: create a Video studio, its floor loads, switch back, Studio…
  dialog; no console errors. Not yet in the real window. Open: per-studio skill sets (the user picks them later;
  the video agent types are placeholders), area mappings and seats are still shared by all studios.
- [x] **Theme Studio + room templates + one project per studio + briefings** — built (2026-11-11,
  asked by the user after approving the demo artifact "PrimeOffice Theme Studio",
  https://claude.ai/artifact/Uq4suHPhemnrXtap4Wouh6). What the user asked: (1) a new studio follows exactly one
  project = one folder with its own `.claude`; (2) "Floor plan…" becomes **Theme Studio**: Game studio has 2
  themes, Video studio and Classic office unchanged; (3) departments laid out sensibly + ready-made **room
  templates** the user adds and names, plus arranging furniture tile by tile (= the office's own Layout editor);
  (4) directors (agents tagged director) work only in Ban giám đốc; when a director hands work to a lower agent
  both meet in Phòng họp; other ranks the same; (5) **Pantry** replaces Lounge and is where idle agents go;
  (6) furniture assets: the user adds more later by path, or Claude generates them.
  **Done so far (not yet run in `?mock` or the real window):**
  - `scripts/gen-furniture.py`: + FRIDGE, VENDING_MACHINE (CC0); `npm run assets` rerun (46 furniture).
  - `scripts/gen-studio-layout.py` rewritten: room templates as furnish functions (`t_dept`, `t_directors`,
    `t_meeting`, `t_pantry`, `t_head`, `t_lab`, `t_art`, `t_audio`, `t_qa`, `t_empty`), `Plan.fits/try_put`
    with catalog footprints; plans `layouts/game-campus.json` (46×41, walls) and `layouts/game-open.json`
    (46×37, executive wing + open floor), both with Pantry; `video-studio.json` unchanged byte for byte;
    `rooms/room-templates.json` (12 templates). `layouts/game-studio.json` DELETED (tests still mention it →
    fix `scripts/tests/departments.test.ts` to use game-campus/game-open).
  - `src/lib/rooms.ts` (stampRoom / findSpot / templateFromArea, grows the floor up to 64×64) +
    `scripts/tests/rooms.test.ts` (3 tests pass) — add it to `test:ts` in package.json.
  - `src/lib/studios.ts`: `StudioKind.themes[]`, `planFileOf`, `projectBlocker`.
  - `src/components/office/ThemeStudio.tsx` (themes with map thumbnails, Add a room with sprite previews,
    Keep a room as a template, delete own templates); `OfficeTab.tsx`: Theme Studio… button, New studio needs a
    project with `.claude` (+ kind and theme), Studio… dialog has one Project select.
  - Rust: `studio_cmd.rs` `check_new_projects` (one folder, `.claude` present, not in another studio) and
    `normalized` tidies old files (first folder kept, no folder in two studios); `office_cmd.rs`
    `OfficePrefs.room_templates` + `saveRoomTemplates` message + `OfficeSnapshot.roomTemplates`. `cargo test`
    67 passed. Mock backend: same rules, `NewPrototype` has no `.claude`.
  - Engine: `departments.ts` `tierOf` / `briefer` / `directorAreas`; `officeState.ts` replaces the old
    "≥2 directors meet" rule with `brief()` (8 s in the meeting room when a sub-agent starts: its department lead,
    else a director sub-agent, else the Boss parent), `endBriefings()` in `update`, `setAgentBoss()` (the Boss =
    the folder's director: sits in Ban giám đốc, does not rest in the Pantry); `useExtensionMessages` calls
    `setAgentBoss`; `types.ts` `briefUntil`. `npx tsc -b` clean.
  - Later the same session: departments.test.ts moved to game-campus/game-open + tests for tierOf/briefer/
    directorAreas; rooms.test.ts in `test:ts`; `npm run check` green (typecheck, 30/30 mocked, 18 TS tests,
    67 Rust). `?mock`: Theme Studio opens (themes with map thumbnails, room previews with real sprites), "Add
    room" Gameplay grew the floor to 46×51 with the new Area, no console errors. Fixed: dialogs taller than the
    window did not scroll (`max-h-[calc(100vh-3rem)]` on the Modal).
  - Finished the same day: `?mock` checks — New studio blocks NewPrototype ("no .claude folder") and, once
    StarHarbor has a studio, StarHarbor ("already the project of StarHarbor"); a studio made with the Open Floor
    theme gets `game-open.json` (46×37) and `projects: [StarHarbor]`; Keep a room saved "Ban giám đốc" as a
    template (12×8, 3 seats) shown as "yours". Docs: CHANGELOG (Unreleased), FORMATS (studios.json one project,
    office.json `roomTemplates`, bundled layouts and rooms), UPSTREAM_PATCHES, ASSETS (new furniture, themes,
    templates, how to add furniture), in-app help (VI/EN). `npm run check` green again.
  **Not done / open:** not tried in the real window (a briefing needs a real session spawning sub-agents; the mock
  has none). The mock leaves stale event listeners when the office frame reloads (`plugin:event|unlisten` returns
  0 without removing): "Couldn't find callback id" warnings after switching studios — mock only, older than this
  work. Video studio keeps its Lounge (user: unchanged). Assets are added at build time
  (`public/assets/furniture/<ID>/` + `npm run assets`); runtime asset folders are not supported.
- [ ] P7 Optional Claude hooks via `primeoffice.exe hook` (exact permission bubbles)

- [x] 2026-11-11 (night) **Avatars + special themes** (user's request: avatar templates by theme — all project
  characters first, then DC, Marvel, Dragon Ball, Naruto…; special layout themes as complete as Campus / Open Floor
  — Christmas, Halloween, Tết, Cyberpunk, Matrix, Aquarium — with simple effects; DC: Hall of Justice and BatCave).
  - Art (all generated, nothing downloaded): `scripts/gen-avatars.py` → 48 avatars in 6 groups
    (`characters/themes/`, `themes.json`); `scripts/gen-theme-furniture.py` → 40 pieces; `gen-studio-layout.py`
    `SPECIAL` → 8 plans (`game-christmas|halloween|tet|cyberpunk|matrix|aquarium.json`, `dc-hall-of-justice.json`,
    `dc-batcave.json`), Campus or Open Floor room for room (same areas and seat counts; pieces placed only where
    everything stays reachable). `build-office-assets.mjs` → `avatarGroups` (crew packs first). Old plans unchanged.
  - App: `AvatarPicker.tsx` (Add agent → Identity; avatar button on the agent card), `officeUiStore` `avatars`
    (session → file), `studioThemes` (studio → theme id), `fx`; `studios.ts` theme `group` / `fx`, `themeOf`;
    `ThemeStudio.tsx` groups (Standard / Lễ hội / Phong cách / DC) and marks the theme on; `ThemeFx.tsx` canvas
    effects (snow, spooky, petals, neon, code, bubbles, justice, cave), **Effects** toggle in the Office bar;
    `OfficeTab` resends labels every 2 s (fix). Engine patches in UPSTREAM_PATCHES (avatar by file, crew first).
  - Checked: `npm run check` green (21 TS tests incl. new `themes.test.ts`, 67 Rust, 30/30 mocked), `npm run
    build` green; `?mock`: Add agent avatar tabs, Batman picked fills the name, agent card → Goku SSJ shows in the
    office, BatCave and Christmas load, snow falls, no console errors.
  - **Open:** not tried in the real window. DC / Marvel / Dragon Ball / Naruto avatars and the DC pieces are fan
    art of trademarked characters; the user decided to ship them (personal, non-commercial project, docs/ASSETS.md). The mock makes new session ids on each reload, so avatars set in the mock do not survive a
    reload there (real sessions keep their ids). Help (F1) → Theme Studio topic covers both.

- [x] 2026-11-11 (late) **DC maps rebuilt as one-of-a-kind** (user: BatCave and Hall of Justice must look as close
  as possible to the films / comics / animated series, with their own assets instead of re-dressed office pieces;
  BatCave: one biggest screen + feeds where Batman watches Gotham, suit tubes of the sidekicks too, a proper
  Batmobile garage, rooms like Robin's, Nightwing's, the Lab; Hall of Justice: heroes' legacy pieces — Aquaman,
  Cyborg, Flash, Wonder Woman, Green Lantern, Shazam …). The user checks quality before the 0.6.0 build.
  - `scripts/gen-dc-furniture.py`: 98 pieces (`BC_*`, `HOJ_*`: own desks / chairs / monitors as each plan's `kit`,
    10×5 main screen + 3 feed screens, 8 suit tubes, 4 vehicles, statues 2×5 of 11 heroes, banners, relics) + 4
    floors (`floor_9..12`, tile values 10–13). The old DC pieces left `gen-theme-furniture.py` (folders deleted).
  - `gen-studio-layout.py`: `batcave()` 54×58, 15 rooms; `hall_of_justice()` 54×49, 13 rooms; `Plan.kit`; same
    seat minimums as Campus (`CAMPUS_NEED`), reachability checked; BatCave rocks / stalagmites via `scatter`.
  - Engine: `departments.ts` `labelForms` (rooms "<room> · <department>"); tests in departments / themes tests
    (themes: DC maps cover every Campus department, use only their own furniture).
  - `gen-avatars.py`: + Robin, Nightwing, Batgirl, Batwoman, Red Hood, Martian Manhunter, Shazam, Green Arrow, Hawkman.
  - Checked: `npm run check` green (23 TS tests, 67 Rust, 30/30 mocked), `npm run build` green; `?mock` BatCave loads
    with the new floors, suit tubes, trophies and themed labels; no console errors. **Open:** the real window; the
    user's quality pass; then the 0.6.0 build (version not bumped yet).

- [x] 2026-11-12 **First agent = Boss, in step with Claude Desktop** (user: a new session in a folder with no agent
  yet must come up as the Boss; check that PrimeOffice and Claude Desktop agree).
  - Found: the Boss lived only in PrimeOffice's local settings (`officeUiStore.bosses`); a pick whose session never
    got a transcript (closed / failed before its first message) stayed Boss for good, so the next agent came up as
    a Member of a ghost; a Boss started outside PrimeOffice had no crown; and the parser kept the **last** record's
    `cwd`, so an agent that ran `cd` moved to another folder and lost its crown (seen on a real session).
  - Rust: `AgentSession.team_role` ("boss" | "member" | "") from the first message's marks (`providers::team_role`,
    same text as `briefing.ts`), Claude + Codex; Claude parser keeps the **first** `cwd` (the folder Claude Code
    files the session under — what Claude Desktop shows).
  - TS: `briefing.resolveBoss` (real pick → newest transcript Boss → none), `folderKey` moved to `briefing.ts`;
    Add agent reads the folder's sessions (newest 60, any CLI), heals the stored Boss, defaults the role from it;
    Office adopts a transcript Boss for a folder with none. Help topic "Who is the Boss".
  - Checked: `npm run check` green (25 TS incl. 2 new, 69 Rust incl. 2 new, mock), `npm run build` green; parser run
    on real transcripts: the PrimeOffice-started Boss session (`entrypoint: cli`) → `boss`, folder = start folder;
    Claude Desktop sessions (`entrypoint: claude-desktop`) in the same store → no role. Both clients write the same
    `~/.claude/projects/<folder>/<id>.jsonl`. **Open:** not tried in the real window; Claude Desktop's own UI was
    not inspected (it does not show PrimeOffice roles — the role lives only in the first message).

- [x] 2026-11-12 **Status, Boss for new sessions, person names / Master Task, Add sub-agent with ticks** (user: the
  status only ever read "Idle"; a new Claude Code session in a folder with no other agent must be the Boss; the Boss
  orders sub-agents — there was only Add agent; tick each sub-agent when it is done and the whole job when all are;
  a session's name is a person's name like Batman, and its session title becomes the Master Task, the short title
  Claude Desktop shows).
  - Found: the office label fell back to `Idle` whenever no tool ran (thinking, writing, a finished turn on hover);
    the shell named agents after the session title (often the role text of the first message).
  - Rust: `AgentSession.person` (`providers::person_of`, "You are <name>, …"), `sub_tasks` (`SubTask`: each
    `Agent`/`Task` call, done when a foreground call returns; the observer ticks one whose sub-agent transcript
    ended); the title falls back to `providers::task_of` (first message without the role text: "Your task: X" or the
    task). Claude Desktop writes `custom-title` / `agent-name` records = its thumbnail title; that is the Master
    Task. New command `agent_types(path)` (built-ins + `.claude/agents` of the folder and of the user).
  - TS: `src/lib/team.ts` — `PERSON_NAMES` / `nextPersonName`, `statusText`, `subProgress` / `allDone`, `bossFor`
    (pick at work → transcript Boss → first agent in, members aside), `subAgentOrder`. OfficeTab heals the Boss and
    names every agent; labels carry `status`. `agentName` = names → person → terminal (never the title);
    AgentPanel: Master Task line, status line, Sub-agents checklist ("All done"), **Add sub-agent** (Boss only;
    typed into its terminal, or opened with `--resume`; Copy for a session open in Claude Desktop). Add agent uses
    `bossFor` over the agents at work and fills an empty name with the next free one. Monitor shows "✓ All done · n/n".
    Office patches in UPSTREAM_PATCHES (status text, sub-agent green check before it leaves).
  - Checked: `npm run check` green (30 TS incl. new `team.test.ts`, 72 Rust incl. 3 new, 31/31 mocked), `npm run
    build` green; `?mock`: Batman (person from the transcript), Robin / Nightwing named by the Office, Batman's card
    shows Master Task "Inventory UI refactor", "Reading … · sub-agents 1/2", the checklist (1 ticked), Add sub-agent
    lists general-purpose / Explore / Plan / project agents; a sub-agent's green check shows in the office; no
    console errors. **Open:** not tried in the real window with a real Claude Desktop session; the order sent to a
    session that is open in Claude Desktop must go through Copy (PrimeOffice never writes into a session another
    client holds).

- **Skill library / templates (2026-11-13, user's request)**: a folder of skill templates the Boss starts with,
  so it loads one field's skills only (Game, Video…), plus a guide on cloning third-party skill repos into it.
  - Rust: `core/skills.rs` (fixed structure `templates/<id>/{skills,agents,repos}` + `TEMPLATE.md`,
    `ensure_structure` never overwrites, `list_templates`, `template_args`: template root and plugins →
    `--plugin-dir`, `.claude/skills` projects → `--add-dir`, isolate → `--setting-sources project,local`; paths
    with `" % ! ^ & | < >` refused because npm's `claude.cmd` goes through cmd.exe). `commands/skills_cmd.rs`:
    `skill_library`, `save_skill_library`, settings in `skills.json` (root, isolate=true by default); the default
    root is the bundled `skill-library` resource (installer ships `HUONG_DAN.md` + `README.md` from
    `skill-library/`). `TermRequest` / `ChatRequest` take `skillTemplate` (Claude Code only).
  - TS: `stores/skillStore.ts` (library + session → template, persisted), Settings section
    `SkillLibrarySettings.tsx`, Add agent → Engine → Skill template (Boss: preselect = studio kind; member: its
    Boss's; resume: the session's own), termStore / chatStore pass the session's template on every start. Help
    topic `skills`. Settings modal capped to the window (abyss-ui `Modal`'s `max-h-full` does not resolve inside
    its grid backdrop — worth fixing in Abyss for every app).
  - Checked: `npm run check` green (Rust 78 incl. 5 new skills tests + 1 IPC test; mock covers the 2 new
    commands); `?mock`: Settings lists Game (own skills, UEHF_Studio project, a plugin) and
    Video; Add agent → Boss preselects Game, command preview shows `--plugin-dir …/game --setting-sources
    project,local`; a member shows "The Boss has no template"; no console errors.
  - **Verified with the real CLI (2.1.322, `claude -p … --model haiku`, dummy templates, 2026-11-13):**
    `--plugin-dir` with a manifest → skills as `<manifest name>:<skill>`; without a manifest → `<folder>:<skill>`;
    `--add-dir` loads the folder's `.claude/skills` **and `.claude/agents`** (unprefixed), so the "project agents
    are not loaded" info issue was wrong and is gone: a project repo now counts its agents and is a source even
    with `.claude/agents` alone. Without isolation every user plugin and the claude.ai account's skills (46
    `anthropic-skills:*` here) load too; with `--setting-sources project,local` all of them are gone and only the
    template's skills plus Claude Code's built-in skills (`code-review`, `init`, `simplify`, `artifact-*`…) remain.
    Plugin agents load as `<plugin>:<agent>`.
  - Resume (real CLI): `--resume <id>` with the same template flags keeps only the template's skills. (A resume
    *without* them cannot be judged from the model's answer: the old skill list is in the transcript; PrimeOffice
    always passes the session's template again, so that case does not occur.)
  - User guide PDFs regenerated (`npm run guide`, 11 topics incl. "Thư viện skill"). Found while doing it: the
    shared `Abyss/scripts/user-guide.mjs` reported success with stale PDFs (headless Edge exits without printing
    while Edge is open, and the old file passed the exists-check), then crashed removing the profile lockfile. Fixed
    there: Chrome is tried before Edge, the old PDF is deleted before printing, temp cleanup retries and only warns.
  - **Open:** a full Boss session in the real PrimeOffice window (Settings section, Add agent → terminal) was not
    driven: the dev build started fine (`npm run tauri dev`), but screen control was declined, so it is the user's
    to try.

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
