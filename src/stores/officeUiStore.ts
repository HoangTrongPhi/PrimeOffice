// The Office tab's layout: the sidebar (agent detail or Command Center), the agent strip and the
// Add agent dialog. Which office agent is selected stays in useOfficeStore (the office frame sets
// it when a character is clicked); a terminal that has no character yet is selected here.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AgentSession } from "../types/primeoffice";
import { useOfficeStore } from "./dataStore";
import { termName, type TermTab } from "./termStore";

export type AgentTab = "terminal" | "activity" | "conversation";
export type CommandTab = "monitor" | "dispatch" | "activity";

export const SIDEBAR_MIN = 320;
export const SIDEBAR_MAX = 760;

interface OfficeUiState {
  /** Key of the selected terminal card (a terminal whose session has no character in the office). */
  term: number | null;
  sidebarOpen: boolean;
  sidebarWidth: number;
  agentTab: AgentTab;
  commandTab: CommandTab;
  /** Names the user gave office agents, by session id. */
  names: Record<string, string>;
  /** Task names the user gave office agents (e.g. "task001"), by session id. */
  tasks: Record<string, string>;
  /** The Boss of each project folder: folder (lower case) → session id. */
  bosses: Record<string, string>;
  /** Avatars the user picked (Add agent → Avatar): session id → file relative to assets/characters. */
  avatars: Record<string, string>;
  /** Theme Studio theme loaded last per studio (its effects play over the floor): studio id → theme id. */
  studioThemes: Record<string, string>;
  /** Theme effects (snow, petals, code rain…) on or off. */
  fx: boolean;
  setAvatar: (sessionId: string, file: string | null) => void;
  setStudioTheme: (studioId: string, themeId: string) => void;
  setFx: (on: boolean) => void;
  addOpen: boolean;
  setTask: (sessionId: string, task: string) => void;
  /** Make a session the Boss of a folder (null: the folder has no Boss). */
  setBoss: (cwd: string, sessionId: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setAgentTab: (tab: AgentTab) => void;
  setCommandTab: (tab: CommandTab) => void;
  setName: (sessionId: string, name: string) => void;
  setAddOpen: (open: boolean) => void;
}

export const useOfficeUi = create<OfficeUiState>()(
  persist(
    (set) => ({
      term: null,
      sidebarOpen: true,
      sidebarWidth: 420,
      agentTab: "activity",
      commandTab: "monitor",
      names: {},
      tasks: {},
      bosses: {},
      avatars: {},
      studioThemes: {},
      fx: true,
      setAvatar: (sessionId, file) =>
        set((s) => {
          const avatars = { ...s.avatars };
          if (file) avatars[sessionId] = file;
          else delete avatars[sessionId];
          return { avatars };
        }),
      setStudioTheme: (studioId, themeId) => set((s) => ({ studioThemes: { ...s.studioThemes, [studioId]: themeId } })),
      setFx: (fx) => set({ fx }),
      addOpen: false,
      setTask: (sessionId, task) =>
        set((s) => {
          const tasks = { ...s.tasks };
          const t = task.trim().slice(0, 60);
          if (t) tasks[sessionId] = t;
          else delete tasks[sessionId];
          return { tasks };
        }),
      setBoss: (cwd, sessionId) =>
        set((s) => {
          const bosses = { ...s.bosses };
          if (sessionId) bosses[folderKey(cwd)] = sessionId;
          else delete bosses[folderKey(cwd)];
          return { bosses };
        }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setSidebarWidth: (w) => set({ sidebarWidth: Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w))) }),
      setAgentTab: (agentTab) => set({ agentTab }),
      setCommandTab: (commandTab) => set({ commandTab }),
      setName: (sessionId, name) =>
        set((s) => {
          const names = { ...s.names };
          const n = name.trim().slice(0, 40);
          if (n) names[sessionId] = n;
          else delete names[sessionId];
          return { names };
        }),
      setAddOpen: (addOpen) => set({ addOpen }),
    }),
    { name: "primeoffice.office-ui", partialize: (s) => ({ sidebarOpen: s.sidebarOpen, sidebarWidth: s.sidebarWidth, agentTab: s.agentTab, commandTab: s.commandTab, names: s.names, tasks: s.tasks, bosses: s.bosses, avatars: s.avatars, studioThemes: s.studioThemes, fx: s.fx }) },
  ),
);

/** Select an office agent (null = none: the sidebar shows the Command Center). */
export function selectAgent(id: number | null) {
  useOfficeStore.getState().select(id);
  useOfficeUi.setState({ term: null, sidebarOpen: true });
}

/** Select a terminal card. */
export function selectTerm(key: number | null) {
  useOfficeStore.getState().select(null);
  useOfficeUi.setState(key === null ? { term: null } : { term: key, sidebarOpen: true, agentTab: "terminal" });
}

/** The terminal running this session, if one was opened from the app. The running one wins. */
export function termOf(session: AgentSession, tabs: TermTab[]): TermTab | undefined {
  const mine = tabs.filter((t) => t.sessionId && t.sessionId === session.sessionId);
  return mine.find((t) => t.state !== "ended") ?? mine.at(-1);
}

const folderOf = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

/** An office agent's name on screen: the one the user gave it, its terminal's, its title, its folder. */
export function agentName(session: AgentSession, names: Record<string, string>, term?: TermTab): string {
  return names[session.sessionId] || term?.name || session.title || folderOf(session.cwd) || "Agent";
}

/** A folder as a key: no trailing separator, one kind of slash, lower case (Windows paths). */
export function folderKey(cwd: string): string {
  return cwd.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** The task an office agent is on: the one the user gave it, else its session's title (unless that
 *  is already its name), else "" (the office then shows the folder). */
export function agentTask(session: AgentSession, tasks: Record<string, string>, name: string): string {
  return tasks[session.sessionId] || (session.title && session.title !== name ? session.title : "");
}

/** True when this session is the Boss of its folder. */
export function isBoss(session: AgentSession, bosses: Record<string, string>): boolean {
  return !!session.sessionId && bosses[folderKey(session.cwd)] === session.sessionId;
}

export { termName };
