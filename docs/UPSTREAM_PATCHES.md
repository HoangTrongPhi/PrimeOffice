# Patches to the vendored pixel-agents UI

Edits to files under `src/office/webview/` and `src/office/core/` (vendored, see `src/office/VENDORED.md`). Keep the
diff small; re-apply after every update.

| File | Change | Why |
|---|---|---|
| `webview/src/runtime.ts` | Adds `isObserveOnly` (true when `window.__PRIME_OFFICE__`, set by `public/office-shim.js`) | One switch for everything PrimeOffice does not do |
| `webview/src/components/BottomToolbar.tsx` | `+ Agent` hidden when `isObserveOnly` | PrimeOffice observes; it never launches agents |
| `webview/src/hooks/useExtensionMessages.ts` | `agentCreated` passes `msg.seatId` to `os.addAgent` (upstream passes `undefined`) | PrimeOffice remembers seats per session; an agent that (re)appears live goes back to its seat |
| `webview/src/components/SettingsModal.tsx` | Sessions folder, layout import/export, asset folders, Watch All, Hooks, Ghosts, Skip Permissions and host directories hidden when `isObserveOnly` | Those need the pixel-agents server; what is left (sound, labels, areas, debug) works locally |
| `webview/src/office/engine/departments.ts` (new) | Department table (agent type → department), Area-label matching, sub-agent label | Sub-agents of a Claude Code Game Studios project sit in their department |
| `webview/src/office/engine/officeState.ts` | `addSubagent(…, agentType)`: the sub-agent walks to a seat from `findDepartmentSeat` (Areas named after its department / itself / `areaMappings['agent:<type>']`); on a layout rebuild sub-agents only take such seats | Same |
| `webview/src/office/types.ts` | `Character.agentType?` | Same |
| `webview/src/hooks/useExtensionMessages.ts` | `agentToolStart` / `subagentToolStart` pass `msg.agentType` to `addSubagent`; label = `subagentLabel(type, task)` | Same |
| `webview/src/office/engine/officeState.ts` | Venues: `startVisit` / `endVisit` (the left seat is remembered as `homeSeatId` and persisted instead of the venue seat); `syncMeeting` (2+ director sub-agents → meeting room seats) on `addSubagent` / `removeSubagent`; `syncEditor` from `setAgentTool` (engine MCP call → the one editor desk, next caller follows); a full department → stand in its room; a layout rebuild ends visits | Director gates and the one-call-at-a-time engine editor are visible |
| `webview/src/hooks/useExtensionMessages.ts` | `subagentToolStart` uses `msg.toolName` when sent (upstream derives it from the label) | The real MCP tool name reaches `setAgentTool` |
| `webview/src/office/engine/officeState.ts` | `setAgentResting(id, resting)`: a main session whose turn is done visits the lounge; `setAgentActive(true)` brings it back | Who is free shows at a glance |
| `webview/src/hooks/useExtensionMessages.ts` | `agentStatus` calls `os.setAgentResting(id, waiting && !awaitingInput)` | Same |
