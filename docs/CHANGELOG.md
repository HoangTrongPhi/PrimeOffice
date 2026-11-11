# PrimeOffice — Changelog

All user-visible changes. Newest first; one section per released version.

## 0.6.0 — 2026-11-11

- **Avatars**: Add agent → Identity → **Avatar** picks how the agent looks in the office — Auto (one of the crew,
  as before), any character of the project (Classic crew, PrimeOffice crew) or a themed one: **DC**, **Marvel**,
  **Dragon Ball**, **Naruto** (8 each), **Lễ hội** (Santa, elf, witch, vampire, pumpkin, skeleton, Ông Đồ, áo dài)
  and **Cyber & Sea** (netrunner, operator, agent, diver, mermaid, robot…). Picking a themed avatar fills an empty
  name. Change it later with the avatar button on the agent's card. Sub-agents keep the crew look of their parent.
- **Special themes** in Theme Studio, each one Campus or Open Floor room for room (same departments, seats,
  Pantry, Ban giám đốc), with themed furniture and an effect over the floor: **Lễ hội** — Christmas (snow),
  Halloween (bats and fog), Tết (peach petals, fireworks); **Phong cách** — Cyberpunk (neon rain), Matrix (code
  rain), Aquarium (bubbles, light ripples).
- **DC themes with maps and art of their own** (every department still there, rooms named "<room> · <department>"):
  **BatCave** — the cave computer with its giant screen over Gotham and six feeds, the Armory of suit tubes (Batman,
  Robin, Nightwing, Batgirl, Batwoman, Red Hood, Jason's memorial suit, the heavy armour), the Trophy Hall (T-rex,
  penny, Joker card, Alfred's tea), the Batmobile Garage (car on its turntable, armoured car, Batcycle, Batwing),
  Nightwing's and Robin's rooms, Oracle's Nest, the Forensics Lab, Case Files, Comms, the Training Ground and the
  Waterfall Cavern; bats and drips. **Hall of Justice** — the Great Hall with the founders in marble around their
  fountain, the Round Table under the alert monitor, the Teleporter Bay, Themyscira Hall, Cyborg's Lab, the Speed
  Lab (cosmic treadmill), the Rock of Eternity, the Atlantis Grotto, the Lantern Corps, the Hall of Heroes and the
  Trophy Room with Starro; glints of light. Their desks, chairs and screens are their own too.
- Nine more DC avatars: Robin, Nightwing, Batgirl, Batwoman, Red Hood, Martian Manhunter, Shazam, Green Arrow, Hawkman. **Effects** (top bar) turns the effect
  off or on; it is off by itself when the system asks for reduced motion. Theme Studio marks the theme that is on.
- Fixed: an agent's name, task and Boss label set before the office had drawn its characters (after a reload or a
  new studio) did not show until something else changed.

## 0.5.0 — 2026-11-11

- **One project per studio**: a new studio follows exactly one Claude Code project — a folder with its own
  `.claude` — and a folder can be the project of one studio only. New studio lists the opened folders and says why
  one cannot be picked (no `.claude`, already another studio's project). Studio… shows the studio's project; a
  studio made before keeps showing every project until you choose its project.
- **Theme Studio** (replaces Floor plan…): load a theme of any kind — **Game studio** now has two: **Campus** (a
  room per department with walls and doors, Pantry under Studio head) and **Open Floor** (an executive wing with
  walls beside one open floor where departments are areas); Video studio and Classic office as before. New studio
  lets you pick the theme too.
- **Rooms from templates**: Theme Studio → Add a room: 12 ready rooms (small / medium / large department, Ban giám
  đốc, Phòng họp, Pantry, Studio head, Lab / Server, Art, Audio, QA, empty) with a preview; name it and it is built
  into the floor — walls, a doorway, furniture, and an area with that name (name a room after a department and its
  sub-agents sit there). The floor grows when it is full (up to 64 × 64). Arrange desks, chairs and PCs tile by tile
  with the office's Layout button, then **Keep a room as a template** to reuse it in any studio.
- **Pantry** replaces the Lounge in the Game studio: agents with nothing to do rest there (new furniture: fridge,
  vending machine).
- **Directors stay in Ban giám đốc**: the Boss of a folder works in the directors' room and waits there between
  turns. When work is handed down, the one handing it and the sub-agent meet in Phòng họp for a few seconds, then
  each goes back to its own room: a department lead briefs the specialists of its department, else a director (a
  director sub-agent or the Boss) does. Two directors at work no longer gather in the meeting room by themselves.

- **Office labels name the agent**: the label over a character shows the agent's own name (the one on its card),
  then what it is doing, then its **task** instead of the project folder. The task name is set in Add agent →
  Briefing or in the agent's details (Task field); empty = the session's title.
- **Boss and team briefing** (Add agent → Briefing → Role): the first agent added in a folder is its **Boss**
  (crown on its card, `BOSS · name` in the office) and keeps the team's directives in `.primeoffice/briefing.md`;
  agents added after it are **Members** that read that file before they work and report in
  `.primeoffice/reports/`. **Solo** types only your first task. The whole first message is shown before it starts;
  the Boss button in the agent's details gives or takes the role.

## 0.4.0 — 2026-11-11

- **Office, laid out as a control room**: the floor on the left, a sidebar on the right (drag to size it) and an
  **agent strip** under the floor — one card per agent with its state, name, what it does, folder, CLI and context.
  - **Add agent** (end of the strip): a four-part form — **Identity** (name), **Workspace** (folder; continue a
    Claude Code session or start a new one), **Engine** (Claude Code / Codex / Gemini / Shell, model, Claude's
    permission mode, with the command shown) and **Briefing** (templates, first task). The agent starts in a real
    terminal shown in the sidebar; its first task is typed in once the CLI is ready. A new Claude Code session gets its
    id up front, so the terminal joins its character's card when it walks in.
  - **Agent details** in the sidebar: rename, **Terminal** (opens a Claude Code session with `--resume`), **Chat**,
    **Folder**, **Hide**; tabs **Terminal** (with a line to type into it), **Activity** and **Conversation** (the
    whole Claude Code conversation).
  - **Command Center** (sidebar, nothing selected): **Monitor** (every agent, who needs you first), **Dispatch**
    (give a task to an agent's terminal or to a new agent) and **Activity** (latest tool calls of every agent).

- **Terminal** (new tab, Ctrl+6): real terminals inside PrimeOffice. Pick a folder and start **Claude Code**, **Codex**,
  **Gemini** or the **Shell** there — the CLI itself, as in a terminal window, for signing in (`/login`), `/resume`,
  slash commands and permission prompts. Up to 8 terminals as tabs; they keep running while another tab is shown.
  Chat has a **Terminal** button that opens the session on screen in one (`claude --resume`).
- Chat: warning and error notices now have their colours (amber / red).

- **Chat**: continuing a session now shows its whole conversation — prompts, replies and tool calls, read from the
  session's transcript — instead of only the last exchange. A very long conversation shows its end (the last 1,000
  entries of the last 8 MB).

## 0.3.0 — 2026-11-11

- **Chat** (new tab, Ctrl+2): give an agent work from PrimeOffice. Each conversation is an ordinary Claude Code
  session, run by the `claude` CLI on your PC with your own sign-in: pick a folder, write the task, watch the reply
  and the tools; continue any session of the folder (also ones from a terminal or Claude Desktop), or open a Chat
  session elsewhere with `claude --resume` / Desktop's `/resume`. Projects, History and Agents are now Ctrl+3…5.

- **Studios**: the Office tab has a tab strip of studios. Each studio is a company of its own — its floor, its
  departments and its project folders. **+** creates one from a kind (Game studio, Video studio, Classic office);
  **Studio…** renames it, picks its folders or deletes it. The office you had is the first studio.
- **Video studio**: a floor plan for YouTube / video production (Ban sản xuất, meeting room, Publishing & SEO, Script
  room, Studio head, Editing bay, Motion & graphics, Lounge, Audio booth, Analytics) with its departments.
- **Codex CLI sessions** join the office and History (read from `~/.codex/sessions`).
- A new install starts with the Game studio floor instead of the classic two-room office.

## 0.2.0 — 2026-11-10

- **Sub-agents in the office**: every `Agent` / `Task` call gets its own character, fed from its own transcript
  (`<session>/subagents/agent-*.jsonl` + `.meta.json`). It appears beside the session that started it, shows its
  type and task ("gameplay-programmer · Build the inventory"), works through its own tools and leaves when it is done;
  background sub-agents stay after the parent's turn ends.
- **Departments**: a sub-agent walks to a desk in its department's Area, found by the Area's name (case and accents
  ignored: `Engineering`, `QA`, `Phòng QA`, `Engine lab`, `Unreal lab` …). Covers all agents of Claude Code Game
  Studios projects (UEHF_Studio, its games, CustomClaudeCodeStudio). An Area named after one agent is its own desk.
  A full department → the agent stands in the room.
- **Floor plan… → Game studio**: a 13-room studio (Ban giám đốc, Phòng họp, Release & ops, Design, Studio head,
  Engineering, Narrative, Art, Audio, Engine lab with an Editor desk, Loc & community, Lounge, QA). **Classic office**
  brings the starting office back. Loading a floor plan replaces the current layout.
- **Meeting room**: two or more directors at work at once (a director gate) meet there, then go back to their desks.
- **Editor desk**: an agent calling the engine editor through MCP (`mcp__unreal-mcp__call_tool`, Unity / Godot alike)
  sits there, one at a time like Unreal MCP; the next caller takes the desk when it is free.
- **Lounge**: a session whose turn is done rests on the sofas and comes back to its desk for new work or a question.
- **Studio furniture** drawn for PrimeOffice (CC0): server rack, easel, studio speaker, arcade cabinet, water cooler,
  test devices.
- Help / Hướng dẫn: new section "Studio floor plan and departments".

## 0.1.1 — 2026-11-09

- **Help / Hướng dẫn** (`F1`, the **?** button in the header, or `Ctrl+K` → "Help / Hướng dẫn"): an in-app
  usage guide in Vietnamese and English — Getting started (how sessions are found, what is read and written,
  layout, dropping folders, shortcuts, appearance, updates), one topic per tab (Office, Projects, History, Agents)
  plus the office layout editor, the agent details panel and the command line. Opens on the current tab (`F1` also
  works while the office has focus); topic filter that ignores diacritics ("huong dan" finds "Hướng dẫn"); VI / EN
  switch, remembered (default Vietnamese). The panel is the shared `HelpPanel` of `@abyss/ui`; PrimeOffice's
  content is in `src/help/topics.ts`.
- **User guide (PDF)**: `docs/user-guide/PrimeOffice_User_Guide_vi.pdf` and `_en.pdf`, built from the same
  content as the Help panel by `npm run guide` (Abyss `scripts/user-guide.mjs`, prints with Edge / Chrome) and
  bundled with the app. Open it with the **PDF** button in the Help panel header (in the panel's language) or
  `Ctrl+K` → "User guide (PDF) / Tài liệu hướng dẫn"; it opens in the default PDF viewer.
- **Close agent (×) works**: the character leaves the office and walks back in, to the same seat, as soon as its
  session does something new (PrimeOffice still never stops an agent).
- **Office settings are kept**: Sound Notifications, Always Show Labels, Show Areas, agents' seats and the folder ↔
  area mapping survive crew switches and app restarts (saved in `office.json`).
- Opening a folder on the **Agents** tab (drop, `Ctrl+O`, "Open project folder…") opens it as a project and shows
  it in **Projects** (it did nothing before).
- `primeoffice.exe <folder>` / Explorer's **Open with** now opens that folder (as if dropped on the Office).
- Projects list: the line under each project counts missing items by level ("2 recommended, 1 optional missing").
- Removed the unused `get_settings` / `set_settings` commands.

## 0.1.0 — 2026-11-09
- Pixel office: every Claude Code session (CLI, Desktop app, IDE) active in the last 30 min is a character that types,
  reads and raises a bubble when it needs you; filter by project and time window; layout editor kept from pixel-agents.
- Agent panel: click a character for its last prompt, what it is doing now, recent actions, last reply and context use.
- Projects: open or drop any folder; the project standard checklist lists every missing item with its fix.
- History: latest sessions of all or one project with last prompt, last actions and last reply.
- Agents: Claude Code, Codex (ChatGPT), Gemini and DeepSeek detection.
- "PrimeOffice crew": 8 new characters drawn by the app's own generator; the classic set stays selectable.
- Command line: `primeoffice check`, `history`, `providers`.
