// Real terminals (term_cmd.rs) running a vendor CLI or the shell — opened from the Terminal tab, from
// Office's "Add agent" and from Chat. The store keeps the list; what each terminal shows lives in its
// xterm screen (lib/termScreens.ts, loaded on demand).
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { registerDropHandler } from "../lib/dropRouter";
import { inTauri, ipc, on } from "../lib/ipc";
import type { TermEvent, TermPreset } from "../types/primeoffice";
import { errorText, uiLog } from "./appStore";
import { useProjectStore } from "./dataStore";
import { sessionTemplate, useSkillStore } from "./skillStore";

export interface TermTab {
  /** Local id (the tab, its screen); the backend's id comes once the terminal is open. */
  key: number;
  preset: string;
  label: string;
  /** Name the user gave it (Add agent, rename); "" = none. */
  name: string;
  cwd: string;
  /** The Claude Code session it runs, when known (resumed, or started with that id). */
  sessionId: string | null;
  /** Title the program set (most CLIs do), "" until then. */
  title: string;
  state: "starting" | "running" | "ended";
  /** Exit code of an ended terminal; null when unknown or it never started. */
  code: number | null;
}

export interface OpenOptions {
  preset: string;
  cwd: string;
  /** Claude Code: continue this session (`--resume`). */
  resume?: string | null;
  /** Claude Code: start a new session with a known id (`--session-id`), so it can be matched with its
   *  character in the office. */
  newSession?: boolean;
  model?: string | null;
  permissionMode?: string | null;
  /** Claude Code: start with this skill template only. Unset: the template the session was started
   *  with (skillStore), so a resumed Boss keeps its skills. */
  skillTemplate?: string | null;
  name?: string;
  /** Text typed into the program once it has started and gone quiet, then Enter: the agent's
   *  first message. What the user wrote for this agent, after its role's briefing text (lib/briefing.ts)
   *  when it has a role — the Add agent form shows the whole message before it starts. */
  firstTask?: string;
}

interface TermState {
  /** Folder a new terminal starts in. */
  cwd: string | null;
  presets: TermPreset[];
  tabs: TermTab[];
  /** Key of the terminal on screen in the Terminal tab. */
  active: number | null;
  setCwd: (cwd: string | null) => void;
  setActive: (key: number) => void;
  loadPresets: () => Promise<void>;
  /** Start a terminal; answers its key (also when it fails to start: the tab shows why). */
  open: (opts: OpenOptions) => Promise<number | null>;
  rename: (key: number, name: string) => void;
  /** Paste `text` into a running terminal and press Enter (Office's dispatch). False when it is not running. */
  send: (key: number, text: string) => boolean;
  /** End the terminal's program and remove its tab. */
  close: (key: number) => void;
}

let seq = 0;
/** Backend terminal id ↔ tab key. */
const keyOf = new Map<number, number>();
const idOf = new Map<number, number>();
/** Terminals whose `term_open` has not answered yet: their first events may come before the id. */
let opening = 0;
let early: TermEvent[] = [];
/** First tasks waiting for their program to start and go quiet. */
const pendingTask = new Map<number, { text: string; timer: ReturnType<typeof setTimeout> | null }>();
/** Quiet this long after the last output = the program is ready for typing. */
const READY_QUIET_MS = 1500;
const loadScreens = () => import("../lib/termScreens");
let screens: Awaited<ReturnType<typeof loadScreens>> | null = null;

function patch(key: number, change: Partial<TermTab>): void {
  useTermStore.setState((s: TermState) => ({ tabs: s.tabs.map((t) => (t.key === key ? { ...t, ...change } : t)) }));
}

/** xterm's paste (bracketed when the program asked for it), then Enter. */
function typeInto(key: number, text: string): boolean {
  const screen = screens?.getScreen(key);
  if (!screen || !idOf.has(key) || !text.trim()) return false;
  screen.term.paste(text);
  const id = idOf.get(key);
  setTimeout(() => id !== undefined && void ipc.termWrite(id, "\r").catch(() => {}), 120);
  return true;
}

/** Output arrived: (re)start the quiet timer of a pending first task. */
function armTask(key: number) {
  const task = pendingTask.get(key);
  if (!task) return;
  if (task.timer) clearTimeout(task.timer);
  task.timer = setTimeout(() => {
    pendingTask.delete(key);
    typeInto(key, task.text);
  }, READY_QUIET_MS);
}

function apply(key: number, e: TermEvent) {
  const screen = screens?.getScreen(key);
  if (e.data) {
    screen?.term.write(e.data);
    armTask(key);
  }
  if (e.exit !== undefined) {
    screen?.term.write(`\r\n\x1b[2m[ended${typeof e.exit === "number" ? ` with code ${e.exit}` : ""}]\x1b[0m\r\n`);
    patch(key, { state: "ended", code: e.exit ?? null });
    const task = pendingTask.get(key);
    if (task?.timer) clearTimeout(task.timer);
    pendingTask.delete(key);
    idOf.delete(key);
    keyOf.delete(e.termId);
  }
}

function handle(e: TermEvent) {
  const key = keyOf.get(e.termId);
  if (key !== undefined) apply(key, e);
  else if (opening > 0) early.push(e);
}

export const useTermStore = create<TermState>()(
  persist(
    (set, get) => ({
      cwd: null,
      presets: [],
      tabs: [],
      active: null,
      setCwd: (cwd) => set({ cwd }),
      setActive: (active) => set({ active }),
      loadPresets: async () => {
        if (!inTauri) return;
        try {
          set({ presets: await ipc.termPresets() });
        } catch (e) {
          uiLog("error", `Terminal: ${errorText(e)}`);
        }
      },
      open: async (opts) => {
        if (!inTauri) return null;
        const key = ++seq;
        const { preset, cwd } = opts;
        const label = get().presets.find((p) => p.id === preset)?.label ?? preset;
        const newSessionId = preset === "claude" && opts.newSession && !opts.resume ? crypto.randomUUID() : null;
        const sessionId = preset === "claude" ? opts.resume || newSessionId : null;
        screens ??= await loadScreens();
        const screen = screens.createScreen(key, {
          onInput: (data) => {
            const id = idOf.get(key);
            if (id !== undefined) void ipc.termWrite(id, data).catch(() => {});
          },
          onResize: (cols, rows) => {
            const id = idOf.get(key);
            if (id !== undefined) void ipc.termResize(id, cols, rows).catch(() => {});
          },
          onTitle: (title) => patch(key, { title }),
        });
        set((s) => ({ tabs: [...s.tabs, { key, preset, label, name: opts.name?.trim() ?? "", cwd, sessionId, title: "", state: "starting", code: null }], active: key }));
        if (opts.firstTask?.trim()) pendingTask.set(key, { text: opts.firstTask.trim(), timer: null });
        const { cols, rows } = screen.term;
        opening++;
        try {
          const skillTemplate = preset !== "claude" ? null : opts.skillTemplate !== undefined ? opts.skillTemplate || null : sessionTemplate(opts.resume);
          const id = await ipc.termOpen({ preset, cwd, cols, rows, sessionId: opts.resume || null, newSessionId, model: opts.model || null, permissionMode: opts.permissionMode || null, skillTemplate });
          if (sessionId) useSkillStore.getState().setSessionTemplate(sessionId, skillTemplate);
          if (!get().tabs.some((t) => t.key === key)) {
            // Closed while it was starting.
            void ipc.termClose(id).catch(() => {});
            return key;
          }
          keyOf.set(id, key);
          idOf.set(key, id);
          patch(key, { state: "running" });
          // The tab was laid out while the terminal was starting: it has its real size now.
          if (screen.term.cols !== cols || screen.term.rows !== rows) void ipc.termResize(id, screen.term.cols, screen.term.rows).catch(() => {});
          const mine = early.filter((e) => e.termId === id);
          early = early.filter((e) => e.termId !== id);
          mine.forEach((e) => apply(key, e));
        } catch (e) {
          screen.term.write(`\x1b[31m${errorText(e)}\x1b[0m\r\n`);
          patch(key, { state: "ended" });
          pendingTask.delete(key);
        } finally {
          if (--opening === 0) early = [];
        }
        return key;
      },
      rename: (key, name) => patch(key, { name: name.trim().slice(0, 40) }),
      send: (key, text) => typeInto(key, text),
      close: (key) => {
        const id = idOf.get(key);
        if (id !== undefined) {
          void ipc.termClose(id).catch((e) => uiLog("error", `Terminal: ${errorText(e)}`));
          idOf.delete(key);
          keyOf.delete(id);
        }
        const task = pendingTask.get(key);
        if (task?.timer) clearTimeout(task.timer);
        pendingTask.delete(key);
        screens?.disposeScreen(key);
        set((s) => {
          const at = s.tabs.findIndex((t) => t.key === key);
          const tabs = s.tabs.filter((t) => t.key !== key);
          const next = s.active === key ? (tabs[Math.min(at, tabs.length - 1)]?.key ?? null) : s.active;
          return { tabs, active: next };
        });
      },
    }),
    { name: "primeoffice.terminal", partialize: (s) => ({ cwd: s.cwd }) },
  ),
);

/** A terminal's name on screen: the one it was given, else "<CLI> · <folder>". */
export function termName(t: TermTab): string {
  return t.name || `${t.label} · ${t.cwd.split(/[\\/]/).filter(Boolean).pop() ?? t.cwd}`;
}

// Terminals keep running while another tab is on screen: listen for the whole life of the app.
if (inTauri) void on.term(handle);

// A folder dropped on Terminal: open it as a project; new terminals start there.
registerDropHandler("terminal", (paths) => {
  const path = paths[0];
  if (!path) return;
  void useProjectStore
    .getState()
    .open(path)
    .then((report) => report && useTermStore.getState().setCwd(report.path));
});
