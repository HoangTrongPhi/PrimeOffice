# PrimeOffice — Changelog

All user-visible changes. Newest first; one section per released version.

## Unreleased

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
