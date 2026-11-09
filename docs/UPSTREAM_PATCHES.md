# Patches to the vendored pixel-agents UI

Edits to files under `src/office/webview/` and `src/office/core/` (vendored, see `src/office/VENDORED.md`). Keep the
diff small; re-apply after every update.

| File | Change | Why |
|---|---|---|
| `webview/src/runtime.ts` | Adds `isObserveOnly` (true when `window.__PRIME_OFFICE__`, set by `public/office-shim.js`) | One switch for everything PrimeOffice does not do |
| `webview/src/components/BottomToolbar.tsx` | `+ Agent` hidden when `isObserveOnly` | PrimeOffice observes; it never launches agents |
| `webview/src/hooks/useExtensionMessages.ts` | `agentCreated` passes `msg.seatId` to `os.addAgent` (upstream passes `undefined`) | PrimeOffice remembers seats per session; an agent that (re)appears live goes back to its seat |
| `webview/src/components/SettingsModal.tsx` | Sessions folder, layout import/export, asset folders, Watch All, Hooks, Ghosts, Skip Permissions and host directories hidden when `isObserveOnly` | Those need the pixel-agents server; what is left (sound, labels, areas, debug) works locally |
