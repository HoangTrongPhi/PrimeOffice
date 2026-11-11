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
  addOpen: boolean;
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
      addOpen: false,
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
    { name: "primeoffice.office-ui", partialize: (s) => ({ sidebarOpen: s.sidebarOpen, sidebarWidth: s.sidebarWidth, agentTab: s.agentTab, commandTab: s.commandTab, names: s.names }) },
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

export { termName };
