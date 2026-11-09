# PrimeOffice — Changelog

All user-visible changes. Newest first; one section per released version.

## Unreleased

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
