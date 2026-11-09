# PrimeOffice — Progress

## Status
- Current phase: P0–P3 done, P4 started (generated crew), P5 release waits for the user's go-ahead
- Last session: 2026-11-09 — app built from the template: Rust observer + providers + project check + CLI,
  vendored pixel-agents office in an iframe, Projects / History / Agents modules, generated character crew
- `npm run check`: green (35 Rust tests, typecheck, 19/19 commands mocked); `npm run build` green
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
- [ ] P4 Art — [x] generated crew (8, CC0) [x] docs/ASSETS.md research [ ] generated furniture set [ ] decide on classic chars (Q4)
- [ ] P5 Release 0.1.0 — needs the user's OK: git init, GitHub repo, `npm run release -- -Version 0.1.0 -Publish`,
  catalog `available`
- [ ] P6 Codex / Gemini sessions (formats to verify on a PC that has them)
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

## Known issues / next steps
- CSP needs `frame-src 'self'`, `connect-src 'self'` (asset fetches) and `font-src 'self' data:` — keep them.
- Sub-agents: sidechain records are skipped; the `Agent`/`Task` tool shows as a "Subtask" label only. pixel-agents'
  sub-agent characters need `subagents/` transcripts (P6+).
- Permission prompts are guessed (a non-long tool quiet for 10 s); exact bubbles need hooks (P7).
- Long transcripts are read head 256 KB + tail 4 MB for history; prompt counts are then partial.
- The office's furniture/floor art and classic characters come from pixel-agents (license notes in docs/ASSETS.md).
- `office` chunk is 513 kB (warning only); could lazy-load xterm, which the observe-only office never uses.
