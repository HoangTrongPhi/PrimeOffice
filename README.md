# PrimeOffice

Pixel office for your AI coding agents — part of the Phineas suite, installed and updated by [Abyss](https://github.com/HoangTrongPhi/Abyss).
Every Claude Code session on this PC (CLI, Desktop app, IDE) becomes a character that walks to a desk, types while
it edits, reads while it searches and raises a bubble when it needs you. Open any project folder to check it against
the project standard (and see everything it is missing), or browse the history: each session's last prompt, what it
just did and its last reply. Codex (ChatGPT), Gemini and DeepSeek are detected today and join the office later.

Tauri 2 + Rust + React, Studio Dark UI from `@abyss/ui`. The office itself is the canvas engine of
[pixel-agents](https://github.com/pixel-agents-hq/pixel-agents) (MIT), vendored in `src/office/` — see
[src/office/VENDORED.md](src/office/VENDORED.md). What it does and how it is built: [docs/SPEC.md](docs/SPEC.md);
where it stands: [docs/PROGRESS.md](docs/PROGRESS.md); art and licenses: [docs/ASSETS.md](docs/ASSETS.md).

PrimeOffice **only reads** the agents' own session files (`~/.claude/projects/**.jsonl`). It never changes agent
settings, never launches or steers an agent, and sends nothing anywhere.

## Commands

```bash
npm install
npm run check          # typecheck + mock coverage + cargo test: green before every hand-off
npm run dev            # UI only; open http://localhost:1484/?mock for the fake backend
npm run tauri dev      # desktop app with hot reload
npm run guide          # docs/user-guide/PrimeOffice_User_Guide_{vi,en}.pdf from src/help/topics.ts (after Help changes)
npm run assets         # re-index public/assets after adding art
npm run release -- -Version 0.1.0 -Notes "First release" [-Publish]
python scripts/gen-characters.py   # redraw the "PrimeOffice crew" character pack (needs Pillow)
```

`@abyss/ui` is linked from `file:../Abyss/packages/abyss-ui`; keep the Abyss folder next to this one (`npm install` in
Abyss first).

## Modules

| Module | Ctrl+ | What it shows |
|---|---|---|
| Office | 1 | The pixel office, the agent list and, for the clicked agent, its last prompt, recent actions and reply. Filter by project and by how recent ("Active in"); pick the character crew. |
| Projects | 2 | Opened folders with a Ready / Not ready pill and the full checklist: every missing item with its fix. `Ctrl+O` or drop a folder to open one. |
| History | 3 | The latest sessions (all projects or one): title, last prompt, last three actions; the full view on the right. |
| Agents | 4 | Which agents are found on this PC and whether the office can show them. |

Everywhere: **F1** opens the in-app Help / Hướng dẫn (Vietnamese / English, on the current tab's topic; also while
the office has focus), **Ctrl+K** the command palette, **Ctrl+O** opens a project folder, **F5** runs the current tab
again, **Ctrl+`** shows the log, **Ctrl+,** the settings.

## Command line

The same exe runs headless when its first argument is a subcommand (anything else opens the window):

```powershell
primeoffice.exe check D:\Game                         # the project standard, every missing item with its fix
primeoffice.exe check D:\Game --report check.json --fail-on warn --quiet
primeoffice.exe history D:\Game --last 5              # last prompt, recent actions, last reply per session
primeoffice.exe providers                             # Claude Code / Codex / Gemini / DeepSeek on this PC
primeoffice.exe --help
```

| Exit code | Meaning |
|---|---|
| 0 | Done; no issue at the `--fail-on` level (default `error`) |
| 1 | Ran, but found issues at that level (e.g. `check` on a folder that is not ready) |
| 2 | Bad arguments or a missing folder |

In `cmd.exe` use `start /wait primeoffice.exe …` to wait for the exit code; PowerShell and CI call it directly:

```yaml
- name: Agent-ready project
  run: '& "$env:LOCALAPPDATA\PrimeOffice\primeoffice.exe" check . --report primeoffice.json --fail-on warn'
  shell: pwsh
```

## Mock mode

`npm run dev`, then `http://localhost:1484/?mock`: `src/dev/mockBackend.ts` answers every command in
`src/lib/ipc.ts` with sample data — three agents (one working in a loop, one waiting for an answer, one done), a
ready and a not-ready project, every provider state. Only in dev builds with `?mock` in the URL, never inside Tauri.
`npm run check:mock` fails when a command has no mock case.

## How the office works

```
~/.claude/projects/**/<session>.jsonl ──► core/providers/claude.rs (parse, incremental)
                                              │
                         core/observer.rs ── every 1 s: diff → pixel-agents ServerMessages
                                              │  event office://message
src/office/bridge/officeBridge.ts ◄───────────┘  + office_snapshot on (re)load
        │ postMessage
office.html (iframe) = vendored pixel-agents UI in its "VS Code webview" mode (public/office-shim.js)
```

## Project layout

```
office.html, public/office-shim.js   the office page (iframe) and its acquireVsCodeApi stand-in
public/assets/                       office art: floors, walls, carpets, furniture, characters/<pack>/
src/                                 React UI (shell)
  components/tabs/                   OfficeTab, ProjectsTab, HistoryTab, ProvidersTab
  components/session/SessionView     one session: status, prompt, actions, reply, context gauge
  office/bridge/                     asset decoding + message bridge to the office frame
  office/webview/, office/core/      vendored pixel-agents (see VENDORED.md; patches in docs/UPSTREAM_PATCHES.md)
  stores/dataStore.ts                office / projects / history / providers stores
src-tauri/src/
  core/providers/                    AgentProvider trait; claude.rs (full), codex.rs, gemini.rs, deepseek.rs (detect)
  core/activity.rs                   tool call → label + kind ("Editing App.tsx")
  core/project.rs                    project standard checks
  core/observer.rs                   transcripts → office messages
  commands/                          office_cmd, project_cmd, session_cmd (+ contract tests)
  cli.rs                             check / history / providers
docs/                                SPEC, PROGRESS, CHANGELOG, FORMATS, ASSETS, UPSTREAM_PATCHES
```

## Releasing

`npm run release` follows the suite's release standard (Abyss `docs/RELEASE_STANDARD.md`): signed NSIS
installer, `latest.json`, `SHA256SUMS.txt`, GitHub release `v<version>` on `HoangTrongPhi/PrimeOffice`. The signing key is
`%USERPROFILE%\.tauri\primeoffice.key` — back it up. In GitHub Actions, `.github/workflows/release.yml`
does the same with the key in the `TAURI_SIGNING_PRIVATE_KEY` secret.

After the first release, set `"status": "available"` for `primeoffice` in Abyss `catalog/catalog.json` and
bump its `revision`.
