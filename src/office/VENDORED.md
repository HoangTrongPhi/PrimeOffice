# Vendored: pixel-agents office UI

| | |
|---|---|
| Source | https://github.com/pixel-agents-hq/pixel-agents (local fork: `P:\Phineas_LIB\Gogo_Gadgets\pixel-agents`) |
| Commit | `b1bafd0` — v1.5.0 (2026-11-09) |
| License | MIT (code). Art: see `docs/ASSETS.md` |
| Copied | `webview-ui/src/` → `src/office/webview/src/`; from `core/src/`: `messages.ts`, `constants.ts`, `paletteUtils.ts`, `terminalFrames.ts`, `transport.ts`, `assets/{colorUtils,constants,types}.ts` → `src/office/core/src/` (same relative layout, so imports are untouched) |
| Art | `webview-ui/public/assets/` (minus `pets/`) and `public/fonts/` → `public/` |

The office runs unchanged in its "VS Code webview" runtime inside `office.html`; `public/office-shim.js` provides
`acquireVsCodeApi()`, and `src/office/bridge/` plays the extension host. Every edit to a vendored file is listed in
`docs/UPSTREAM_PATCHES.md` — keep them few and marked `PrimeOffice patch`.

## Updating

1. `git pull` in the pixel-agents fork, note the new commit here.
2. Copy the folders above again, then re-apply `docs/UPSTREAM_PATCHES.md`.
3. If `core/asyncapi.yaml` changed, check `src-tauri/src/core/observer.rs` still emits valid messages.
4. `npm run check`, then walk the office in `?mock`.
