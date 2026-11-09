/**
 * Dev-only fake backend so the UI can be exercised in a plain browser: `npm run dev`, then open
 * `http://localhost:1484/?mock`. Never active in production builds or inside Tauri.
 * It answers every command in `src/lib/ipc.ts` (checked by `npm run check:mock`) and the plugin
 * commands the UI uses. Three agents work in the office: one edits files in a loop, one waits for
 * an answer, one has finished its turn; one project is ready, one is not.
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
  { id: "codex", name: "Codex CLI (ChatGPT)", state: "detected", sessionRoot: "C:\\Users\\me\\.codex\\sessions", sessions: 1, observable: false, note: "Session folder found; reading Codex rollouts comes in a later version" },
  { id: "gemini", name: "Gemini CLI", state: "notFound", sessionRoot: "C:\\Users\\me\\.gemini\\tmp", sessions: 0, observable: false, note: "Install Gemini CLI and run it once" },
  { id: "deepseek", name: "DeepSeek", state: "unsupported", sessionRoot: null, sessions: 0, observable: false, note: "No local session format yet; planned through the tool that runs DeepSeek" },
];

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
    if (open) msgs.push({ type: "agentToolDone", id: 1, toolId: open });
    const [tool, label] = labels[n++ % labels.length];
    open = `t${n}`;
    msgs.push({ type: "agentToolStart", id: 1, toolId: open, status: label, toolName: tool });
    SESSIONS[0].openTools = [{ id: open, tool, label }];
    SESSIONS[0].actions = [...SESSIONS[0].actions.slice(-19), { at: new Date().toISOString(), kind: tool === "Read" ? "read" : tool === "Edit" ? "edit" : tool === "Bash" ? "run" : "search", tool, label }];
    SESSIONS[0].lastActivityAt = new Date().toISOString();
    void emit("office://message", msgs);
  }, 3500);
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
        case "reveal_in_explorer":
          console.info("mockBackend: reveal", a.path);
          return null;
        case "get_settings":
          return JSON.parse(localStorage.getItem("primeoffice.mock-settings") ?? "{}");
        case "set_settings":
          localStorage.setItem("primeoffice.mock-settings", JSON.stringify(a.settings));
          return null;

        case "office_snapshot":
          return {
            settings: { type: "settingsLoaded", soundEnabled: false, lastSeenVersion: "0.1", extensionVersion: "0.1.0", watchAllSessions: true, alwaysShowLabels: true, ghostHeadlessAgents: false, hooksEnabled: false, hooksInfoShown: true, externalAssetDirectories: [], showAreas: false, bypassPermissions: false, showHostDirectories: false },
            existing: { type: "existingAgents", agents: [1, 2, 3], agentMeta: { 1: { palette: 0, hueShift: 0 }, 2: { palette: 1, hueShift: 0 }, 3: { palette: 2, hueShift: 0 } }, directoryNames: { 1: "StarHarbor", 2: "StarHarbor", 3: "BuildTools" }, externalAgents: { 1: true, 2: true, 3: true } },
            layout: null,
            activity: [
              { type: "agentToolStart", id: 1, toolId: "t-run", status: "Running: npm test -- inventory", toolName: "Bash" },
              { type: "agentStatus", id: 2, status: "waiting", awaitingInput: true },
              { type: "agentContextUsage", id: 2, contextTokens: 152_000, maxContextTokens: 200_000 },
              { type: "agentStatus", id: 3, status: "waiting" },
            ],
          };
        case "office_send":
          if (a.message?.type === "saveLayout") await log("info", "office", "Layout saved");
          return null;
        case "office_agents":
          return SESSIONS.map((session, i) => ({ id: i + 1, session }));
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
