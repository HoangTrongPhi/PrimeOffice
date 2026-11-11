// The Terminal tab: real terminals (term_cmd.rs) running a vendor CLI or the shell. The store keeps
// the list; what each terminal shows lives in its xterm screen (lib/termScreens.ts, loaded on demand).
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { registerDropHandler } from "../lib/dropRouter";
import { inTauri, ipc, on } from "../lib/ipc";
import type { TermEvent, TermPreset } from "../types/primeoffice";
import { errorText, uiLog } from "./appStore";
import { useProjectStore } from "./dataStore";

export interface TermTab {
  /** Local id (the tab, its screen); the backend's id comes once the terminal is open. */
  key: number;
  preset: string;
  label: string;
  cwd: string;
  /** Title the program set (most CLIs do), "" until then. */
  title: string;
  state: "starting" | "running" | "ended";
  /** Exit code of an ended terminal; null when unknown or it never started. */
  code: number | null;
}

interface TermState {
  /** Folder a new terminal starts in. */
  cwd: string | null;
  presets: TermPreset[];
  tabs: TermTab[];
  /** Key of the terminal on screen. */
  active: number | null;
  setCwd: (cwd: string | null) => void;
  setActive: (key: number) => void;
  loadPresets: () => Promise<void>;
  /** Start `preset` in `cwd`; `sessionId` opens that Claude Code session (`claude --resume`). */
  open: (preset: string, cwd: string, sessionId?: string | null) => Promise<void>;
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
const loadScreens = () => import("../lib/termScreens");
let screens: Awaited<ReturnType<typeof loadScreens>> | null = null;

const patch = (key: number, change: Partial<TermTab>) => useTermStore.setState((s) => ({ tabs: s.tabs.map((t) => (t.key === key ? { ...t, ...change } : t)) }));

function apply(key: number, e: TermEvent) {
  const screen = screens?.getScreen(key);
  if (e.data) screen?.term.write(e.data);
  if (e.exit !== undefined) {
    screen?.term.write(`\r\n\x1b[2m[ended${typeof e.exit === "number" ? ` with code ${e.exit}` : ""}]\x1b[0m\r\n`);
    patch(key, { state: "ended", code: e.exit ?? null });
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
      open: async (preset, cwd, sessionId) => {
        if (!inTauri) return;
        const key = ++seq;
        const label = get().presets.find((p) => p.id === preset)?.label ?? preset;
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
        set((s) => ({ tabs: [...s.tabs, { key, preset, label, cwd, title: "", state: "starting", code: null }], active: key }));
        const { cols, rows } = screen.term;
        opening++;
        try {
          const id = await ipc.termOpen({ preset, cwd, cols, rows, sessionId: sessionId ?? null });
          if (!get().tabs.some((t) => t.key === key)) {
            // Closed while it was starting.
            void ipc.termClose(id).catch(() => {});
            return;
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
        } finally {
          if (--opening === 0) early = [];
        }
      },
      close: (key) => {
        const id = idOf.get(key);
        if (id !== undefined) {
          void ipc.termClose(id).catch((e) => uiLog("error", `Terminal: ${errorText(e)}`));
          idOf.delete(key);
          keyOf.delete(id);
        }
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
