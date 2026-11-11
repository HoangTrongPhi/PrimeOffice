/**
 * Dev-only fake backend so the UI can be exercised in a plain browser: `npm run dev`, then open
 * `http://localhost:1484/?mock`. Never active in production builds or inside Tauri.
 * It answers every command in `src/lib/ipc.ts` (checked by `npm run check:mock`) and the plugin
 * commands the UI uses. Three agents work in the office: one edits files in a loop, one waits for
 * an answer, one has finished its turn; one project is ready, one is not. The office's own settings,
 * seats and folder areas are kept in localStorage (`primeoffice.mock-office`) like office.json;
 * `?mock&open=D:\Projects\StarHarbor` plays a start with an "Open with" folder.
 */
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { AgentSession, OfficeMessage, ProjectCheck, ProjectReport, ProviderStatus } from "../types/primeoffice";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const GAME = "D:\\Projects\\StarHarbor";
const TOOLS = "D:\\Projects\\BuildTools";
const iso = (agoS: number) => new Date(Date.now() - agoS * 1000).toISOString();

function session(over: Partial<AgentSession>): AgentSession {
  return {
    provider: "claude",
    sessionId: crypto.randomUUID(),
    title: "Session",
    cwd: GAME,
    transcriptPath: `C:\\Users\\me\\.claude\\projects\\D--Projects-StarHarbor\\${Math.random().toString(16).slice(2)}.jsonl`,
    entrypoint: "cli",
    model: "claude-opus-5-5",
    startedAt: iso(3600),
    lastActivityAt: iso(5),
    modifiedMs: Date.now() - 5000,
    status: "active",
    lastPrompt: "",
    lastReply: "",
    promptCount: 3,
    contextTokens: 64_000,
    maxContextTokens: 200_000,
    actions: [],
    openTools: [],
    ...over,
  };
}

const SESSIONS: AgentSession[] = [
  session({
    title: "Inventory UI refactor",
    lastPrompt: "Split InventoryPanel into a grid and a detail view, keep drag & drop working, and add tests for stacking.",
    lastReply: "",
    actions: [
      { at: iso(90), kind: "read", tool: "Read", label: "Reading InventoryPanel.tsx" },
      { at: iso(70), kind: "search", tool: "Grep", label: "Searching code" },
      { at: iso(40), kind: "edit", tool: "Edit", label: "Editing InventoryGrid.tsx" },
      { at: iso(10), kind: "run", tool: "Bash", label: "Running: npm test -- inventory" },
    ],
    openTools: [{ id: "t-run", tool: "Bash", label: "Running: npm test -- inventory" }],
  }),
  session({
    title: "Save system migration",
    entrypoint: "claude-desktop",
    status: "waiting",
    lastActivityAt: iso(40),
    modifiedMs: Date.now() - 40_000,
    lastPrompt: "Migrate save files from v3 to v4 without losing player stats.",
    actions: [
      { at: iso(200), kind: "read", tool: "Read", label: "Reading SaveManager.cs" },
      { at: iso(60), kind: "ask", tool: "AskUserQuestion", label: "Waiting for your answer" },
    ],
    openTools: [{ id: "t-ask", tool: "AskUserQuestion", label: "Waiting for your answer" }],
    contextTokens: 152_000,
  }),
  session({
    title: "CI cache for Unreal builds",
    cwd: TOOLS,
    status: "done",
    lastActivityAt: iso(300),
    modifiedMs: Date.now() - 300_000,
    lastPrompt: "/review",
    lastReply: "The DDC cache is now shared between jobs; build time went from 41 to 17 minutes. Two follow-ups are listed in PROGRESS.md.",
    actions: [
      { at: iso(500), kind: "edit", tool: "Edit", label: "Editing build.yml" },
      { at: iso(400), kind: "skill", tool: "Skill", label: "Skill: review" },
    ],
    contextTokens: 31_000,
  }),
];

const HISTORY: AgentSession[] = [
  ...SESSIONS,
  session({ title: "Fix flaky physics test", status: "stale", lastActivityAt: iso(86_400), modifiedMs: Date.now() - 86_400_000, lastPrompt: "The ragdoll test fails 1 in 20 runs — find out why.", lastReply: "It depended on frame timing; it now steps the physics with a fixed delta.", actions: [{ kind: "run", tool: "Bash", label: "Running: cargo test ragdoll" }] }),
];

function checks(ready: boolean): ProjectCheck[] {
  const c = (code: string, severity: ProjectCheck["severity"], passed: boolean, title: string, fix: string): ProjectCheck => ({ code, severity, passed, title, message: passed ? "Found" : "Missing", fix: passed ? "" : fix });
  return [
    c("folder.exists", "error", true, "Folder exists and can be read", ""),
    c("agent.sessions", "error", ready, "Agent sessions for this folder", "Start an agent in this exact folder once (e.g. `claude` in a terminal opened here)"),
    c("agent.instructions", "warn", ready, "Agent instructions (CLAUDE.md or AGENTS.md)", "Run /init in Claude Code inside this folder, or write CLAUDE.md by hand"),
    c("agent.settings", "info", true, "Project agent settings (.claude/)", ""),
    c("vcs.git", "warn", true, "Git repository", "Run `git init` in this folder"),
    c("abyss.spec", "warn", ready, "Spec (docs/SPEC.md)", "Write docs/SPEC.md"),
    c("abyss.progress", "warn", false, "Progress log (docs/PROGRESS.md)", "Add docs/PROGRESS.md"),
    c("abyss.changelog", "info", false, "Changelog (docs/CHANGELOG.md or CHANGELOG.md)", "Add docs/CHANGELOG.md"),
    c("abyss.readme", "info", true, "README.md", ""),
  ];
}

function report(path: string): ProjectReport {
  const ready = !path.toLowerCase().includes("new");
  const cs = checks(ready);
  const failed = cs.filter((c) => !c.passed);
  return {
    path,
    name: path.split("\\").pop() ?? path,
    ready,
    ok: ready,
    cancelled: false,
    elapsedMs: 3,
    checks: cs,
    issues: failed.map((c) => ({ severity: c.severity, code: c.code, message: `${c.title} — ${c.fix}`, path })),
    sessions: ready ? [{ provider: "claude", sessions: 12 }] : [],
    lastSessionMs: ready ? Date.now() - 60_000 : null,
  };
}

let projects = [GAME, TOOLS, "D:\\Projects\\NewPrototype"];

const PROVIDERS: ProviderStatus[] = [
  { id: "claude", name: "Claude Code", state: "active", sessionRoot: "C:\\Users\\me\\.claude\\projects", sessions: 3, observable: true, note: "CLI, Desktop app and IDE sessions (transcripts)" },
  { id: "codex", name: "Codex CLI (ChatGPT)", state: "detected", sessionRoot: "C:\\Users\\me\\.codex\\sessions", sessions: 0, observable: true, note: "Codex CLI sessions (rollout files)" },
  { id: "gemini", name: "Gemini CLI", state: "notFound", sessionRoot: "C:\\Users\\me\\.gemini\\tmp", sessions: 0, observable: false, note: "Install Gemini CLI and run it once" },
  { id: "deepseek", name: "DeepSeek", state: "unsupported", sessionRoot: null, sessions: 0, observable: false, note: "No local session format yet; planned through the tool that runs DeepSeek" },
];

// ---------------------------------------------------------------- office prefs (office_cmd::OfficePrefs)

interface MockSeat {
  palette: number;
  hueShift: number;
  seatId: string | null;
}
interface MockOfficePrefs {
  soundEnabled: boolean;
  alwaysShowLabels: boolean;
  showAreas: boolean;
  areaMappings: Record<string, string[]>;
  /** By agent id here (ids are fixed in the mock); by transcript path in the real backend. */
  seats: Record<string, MockSeat>;
}
const PREFS_KEY = "primeoffice.mock-office";
const DEFAULT_PREFS: MockOfficePrefs = { soundEnabled: false, alwaysShowLabels: true, showAreas: false, areaMappings: {}, seats: {} };
function loadPrefs(): MockOfficePrefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}
function savePrefs(p: MockOfficePrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // not kept; fine for the mock
  }
}
let prefs = loadPrefs();

/** The layout saved by the office (layout.json in the real backend); null = the bundled default. */
const LAYOUT_KEY = "primeoffice.mock-layout";
function mockLayout(): unknown {
  try {
    return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "null");
  } catch {
    return null;
  }
}

/** Agents closed with ×: hidden until they work again (only agent 1 works in the mock). */
const hidden = new Set<number>();
const DIRS: Record<number, string> = { 1: "StarHarbor", 2: "StarHarbor", 3: "BuildTools" };
const meta = (id: number) => {
  const seat = prefs.seats[id];
  return { palette: seat?.palette ?? id - 1, hueShift: seat?.hueShift ?? 0, ...(seat?.seatId ? { seatId: seat.seatId } : {}) };
};

let startupFolder = new URLSearchParams(location.search).get("open");

const log = (level: string, source: string, message: string) => emit("log://entry", { tsMs: Date.now(), level, source, message });

/** Agent 1 keeps working: a new tool every few seconds. */
function startOfficeLoop() {
  const labels = [
    ["Read", "Reading InventorySlot.tsx"],
    ["Edit", "Editing InventoryGrid.tsx"],
    ["Bash", "Running: npm test -- inventory"],
    ["Grep", "Searching code"],
  ];
  let n = 0;
  let open: string | null = "t-run";
  setInterval(() => {
    const msgs: OfficeMessage[] = [];
    if (hidden.delete(1)) {
      // Closed with the office's x, and now at work again: it walks back in, to its remembered seat.
      msgs.push({ type: "agentCreated", id: 1, directoryName: DIRS[1], isExternal: true, ...meta(1) });
      open = null;
    }
    if (open) msgs.push({ type: "agentToolDone", id: 1, toolId: open });
    const [tool, label] = labels[n++ % labels.length];
    open = `t${n}`;
    msgs.push({ type: "agentToolStart", id: 1, toolId: open, status: label, toolName: tool });
    SESSIONS[0].openTools = [{ id: open, tool, label }];
    SESSIONS[0].actions = [...SESSIONS[0].actions.slice(-19), { at: new Date().toISOString(), kind: tool === "Read" ? "read" : tool === "Edit" ? "edit" : tool === "Bash" ? "run" : "search", tool, label }];
    SESSIONS[0].lastActivityAt = new Date().toISOString();
    void emit("office://message", msgs);
  }, 3500);
  // Agent 2 starts a background sub-agent now and then (like a studio's `/dev-story`): it gets its
  // own character, works through a few tools from its own transcript, then leaves.
  // Step 1 of an engine specialist is an Unreal MCP call: it walks to the editor desk, then back.
  const subSteps: [string, string][] = [["Reading Inventory.h", "Read"], ["Editing Inventory.cpp", "Edit"], ["Running: build", "Bash"]];
  const editorStep: [string, string] = ["Using call_tool", "mcp__unreal-mcp__call_tool"];
  const types = ["gameplay-programmer", "qa-tester", "writer", "ue-gas-specialist", "sound-designer", "producer"];
  let spawn = 0;
  let step = -1;
  setInterval(() => {
    if (hidden.has(2)) return;
    const parentToolId = `t-spawn-${spawn}`;
    const msgs: OfficeMessage[] = [];
    if (step === -1) {
      msgs.push({ type: "agentToolStart", id: 2, toolId: parentToolId, status: "Subtask: Build the inventory", toolName: "Agent", agentType: types[spawn % types.length], runInBackground: true });
      msgs.push({ type: "agentToolDone", id: 2, toolId: parentToolId });
    } else if (step < subSteps.length) {
      if (step > 0) msgs.push({ type: "subagentToolDone", id: 2, parentToolId, toolId: `s${step - 1}` });
      const agentType = types[spawn % types.length];
      const [status, toolName] = step === 1 && agentType.startsWith("ue-") ? editorStep : subSteps[step];
      msgs.push({ type: "subagentToolStart", id: 2, parentToolId, toolId: `s${step}`, status, toolName, agentType });
    } else {
      msgs.push({ type: "subagentClear", id: 2, parentToolId });
      spawn++;
      step = -2;
    }
    step++;
    void emit("office://message", msgs);
  }, 4000);

  // Agent 3 runs a director gate now and then: three directors at once meet in the meeting room,
  // then go back to their desks as they finish one by one.
  const directors = ["creative-director", "technical-director", "producer"];
  let gate = 0;
  let phase = 0;
  setInterval(() => {
    if (hidden.has(3)) return;
    const msgs: OfficeMessage[] = [];
    const tid = (d: string) => `t-gate-${gate}-${d}`;
    if (phase === 0) {
      for (const d of directors) {
        msgs.push({ type: "agentToolStart", id: 3, toolId: tid(d), status: "Subtask: Gate check", toolName: "Agent", agentType: d, runInBackground: true });
        msgs.push({ type: "agentToolDone", id: 3, toolId: tid(d) });
        msgs.push({ type: "subagentToolStart", id: 3, parentToolId: tid(d), toolId: `${tid(d)}-r`, status: "Reading game-brief.md", toolName: "Read", agentType: d });
      }
    } else if (phase <= directors.length) {
      msgs.push({ type: "subagentClear", id: 3, parentToolId: tid(directors[phase - 1]) });
    }
    phase = phase >= directors.length + 2 ? 0 : phase + 1;
    if (phase === 0) gate++;
    void emit("office://message", msgs);
  }, 7000);
}

if (import.meta.env.DEV && new URLSearchParams(location.search).has("mock")) {
  console.info("mockBackend: active (?mock)");
  // `isTauri()` reads this flag; set it before lib/ipc.ts evaluates `inTauri`.
  (globalThis as { isTauri?: boolean }).isTauri = true;
  mockWindows("main");
  startOfficeLoop();
  mockIPC(
    async (cmd, args) => {
      const a = (args ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      switch (cmd) {
        case "app_info":
          return { version: "0.1.0-mock", debug: true, abyss: { managed: true, launcherVersion: "0.1.0" } };
        case "log_history":
          return [{ tsMs: Date.now() - 2000, level: "info", source: "app", message: "PrimeOffice started (mock backend)" }];
        case "ui_log":
          return null;
        case "cancel_job":
          return true;
        case "open_url":
          window.open(a.url, "_blank", "noopener");
          return null;
        case "open_user_guide":
          console.info("mockBackend: open user guide", a.lang);
          return null;
        case "reveal_in_explorer":
          console.info("mockBackend: reveal", a.path);
          return null;
        case "take_startup_folder": {
          const folder = startupFolder;
          startupFolder = null;
          return folder;
        }

        case "office_snapshot": {
          const shown = [1, 2, 3].filter((id) => !hidden.has(id));
          const byId = (f: (id: number) => unknown) => Object.fromEntries(shown.map((id) => [id, f(id)]));
          const activity: OfficeMessage[] = [
            { type: "agentToolStart", id: 1, toolId: "t-run", status: "Running: npm test -- inventory", toolName: "Bash" },
            { type: "agentStatus", id: 2, status: "waiting", awaitingInput: true },
            { type: "agentContextUsage", id: 2, contextTokens: 152_000, maxContextTokens: 200_000 },
            { type: "agentStatus", id: 3, status: "waiting" },
          ];
          return {
            settings: { type: "settingsLoaded", soundEnabled: prefs.soundEnabled, lastSeenVersion: "0.1", extensionVersion: "0.1.0", watchAllSessions: true, alwaysShowLabels: prefs.alwaysShowLabels, ghostHeadlessAgents: false, hooksEnabled: false, hooksInfoShown: true, externalAssetDirectories: [], showAreas: prefs.showAreas, bypassPermissions: false, showHostDirectories: false },
            areaMappings: { type: "areaMappingsLoaded", mappings: prefs.areaMappings },
            existing: { type: "existingAgents", agents: shown, agentMeta: byId(meta), directoryNames: byId((id) => DIRS[id]), externalAgents: byId(() => true) },
            layout: mockLayout(),
            activity: activity.filter((m) => !hidden.has(m.id as number)),
          };
        }
        case "office_send": {
          const m = (a.message ?? {}) as OfficeMessage;
          switch (m.type) {
            case "saveLayout":
              try {
                localStorage.setItem(LAYOUT_KEY, JSON.stringify(m.layout));
              } catch {
                // not kept; fine for the mock
              }
              await log("info", "office", "Layout saved");
              return null;
            case "closeAgent": {
              const id = m.id as number;
              if (!DIRS[id] || hidden.has(id)) return null;
              hidden.add(id);
              await log("info", "office", `Agent ${id} hidden until it works again`);
              // The real observer closes it on its next tick.
              setTimeout(() => void emit("office://message", [{ type: "agentClosed", id }]), 300);
              return null;
            }
            case "setSoundEnabled":
              prefs = { ...prefs, soundEnabled: !!m.enabled };
              break;
            case "setAlwaysShowLabels":
              prefs = { ...prefs, alwaysShowLabels: !!m.enabled };
              break;
            case "setShowAreas":
              prefs = { ...prefs, showAreas: !!m.enabled };
              break;
            case "saveAreaMappings":
              prefs = { ...prefs, areaMappings: (m.mappings ?? {}) as Record<string, string[]> };
              break;
            case "saveAgentSeats":
              prefs = { ...prefs, seats: { ...prefs.seats, ...(m.seats as Record<string, MockSeat>) } };
              break;
            default:
              return null;
          }
          savePrefs(prefs);
          return null;
        }
        case "office_agents":
          return SESSIONS.map((session, i) => ({ id: i + 1, session })).filter(({ id }) => !hidden.has(id));
        case "office_set_filter":
          return null;

        case "check_project":
          await sleep(150);
          if (String(a.path).includes("missing")) return { ...report(a.path), ready: false, checks: [{ code: "folder.exists", severity: "error", passed: false, title: "Folder exists and can be read", message: `${a.path} cannot be read`, fix: "Pick the folder again" }] };
          return report(a.path);
        case "list_projects":
          return projects.map(report);
        case "add_project":
          projects = [a.path, ...projects.filter((p) => p !== a.path)];
          await log("info", "project", `${a.path}: checked`);
          return report(a.path);
        case "remove_project": {
          const before = projects.length;
          projects = projects.filter((p) => p !== a.path);
          return projects.length !== before;
        }

        case "list_sessions": {
          await sleep(200);
          const q = a.query ?? {};
          return HISTORY.filter((s) => !q.project || s.cwd.toLowerCase() === String(q.project).toLowerCase()).slice(0, q.limit ?? 30);
        }
        case "get_session": {
          const s = HISTORY.find((x) => x.transcriptPath === a.path);
          if (!s) throw `No provider can read ${a.path}`;
          return s;
        }
        case "list_providers":
          return PROVIDERS;

        case "plugin:dialog|open":
          return a.options?.directory ? "D:\\Projects\\NewPrototype" : null;
        case "plugin:dialog|save":
          return "D:\\Projects\\saved.json";
        case "plugin:updater|check":
          return { rid: 1, currentVersion: "0.1.0-mock", version: "0.2.0", date: "2026-11-01T00:00:00Z", body: "- Codex sessions in the office", rawJson: {} };
        case "plugin:updater|download_and_install":
          await sleep(1500);
          return null;
        case "plugin:window|set_theme":
        case "plugin:webview|set_webview_zoom":
          return null;
        case "plugin:process|restart":
          location.reload();
          return null;
        default:
          if (cmd.startsWith("plugin:event|")) return 0;
          console.warn("mockBackend: unhandled", cmd, args);
          return null;
      }
    },
    { shouldMockEvents: true },
  );
}
