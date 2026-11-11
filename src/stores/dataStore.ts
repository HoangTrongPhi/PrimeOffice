import { create } from "zustand";
import { persist } from "zustand/middleware";
import { registerDropHandler } from "../lib/dropRouter";
import { inTauri, ipc } from "../lib/ipc";
import { kindOf, newStudioId, studioHasProject } from "../lib/studios";
import type { AgentSession, OfficeAgent, ProjectReport, ProviderStatus, Studio, Studios } from "../types/primeoffice";
import { errorText, uiLog, useAppStore } from "./appStore";

// ---------------------------------------------------------------- office

interface OfficeState {
  /** Project folder the office shows, null = every project. */
  project: string | null;
  /** Sessions changed within this many minutes are in the office. */
  windowMinutes: number;
  /** Character pack (public/assets/characters/<pack>). */
  pack: string;
  agents: OfficeAgent[];
  selectedId: number | null;
  setProject: (project: string | null) => void;
  setWindowMinutes: (m: number) => void;
  setPack: (pack: string) => void;
  select: (id: number | null) => void;
  refreshAgents: () => Promise<void>;
  applyFilter: () => Promise<void>;
}

export const useOfficeStore = create<OfficeState>()(
  persist(
    (set, get) => ({
      project: null,
      windowMinutes: 30,
      pack: "pixel",
      agents: [],
      selectedId: null,
      setProject: (project) => {
        set({ project, selectedId: null });
        void get().applyFilter();
      },
      setWindowMinutes: (windowMinutes) => {
        set({ windowMinutes });
        void get().applyFilter();
      },
      setPack: (pack) => set({ pack }),
      select: (selectedId) => set({ selectedId }),
      refreshAgents: async () => {
        if (!inTauri) return;
        try {
          set({ agents: await ipc.officeAgents() });
        } catch (e) {
          uiLog("error", `Agents: ${errorText(e)}`);
        }
      },
      applyFilter: async () => {
        if (!inTauri) return;
        const { project, windowMinutes } = get();
        // One project when picked, else the folders of the studio on screen (none = every project).
        const projects = project ? [project] : (currentStudio()?.projects ?? []);
        await ipc.officeSetFilter({ projects, windowMinutes }).catch((e) => uiLog("error", `Office filter: ${errorText(e)}`));
      },
    }),
    { name: "primeoffice.office", partialize: (s) => ({ project: s.project, windowMinutes: s.windowMinutes, pack: s.pack }) },
  ),
);

// ---------------------------------------------------------------- studios

interface StudioState extends Studios {
  loaded: boolean;
  load: () => Promise<void>;
  /** Save a new list; false when the backend refused it (the list on screen is kept). */
  save: (next: Studios) => Promise<boolean>;
  setActive: (id: string) => Promise<boolean>;
  /** A new studio of `kind` following the project folder `project`; its id, or null when refused. */
  add: (kind: string, name: string, project: string) => Promise<string | null>;
  update: (id: string, patch: Partial<Pick<Studio, "name" | "projects">>) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
}

/** The studio the office shows, null until the list is loaded. */
export function currentStudio(): Studio | null {
  const { studios, active } = useStudioStore.getState();
  return studios.find((s) => s.id === active) ?? studios[0] ?? null;
}

export const useStudioStore = create<StudioState>()((set, get) => ({
  active: "",
  studios: [],
  loaded: false,
  load: async () => {
    if (!inTauri) return;
    try {
      const { active, studios } = await ipc.listStudios();
      set({ active, studios, loaded: true });
    } catch (e) {
      uiLog("error", `Studios: ${errorText(e)}`);
    }
  },
  save: async (next) => {
    if (!inTauri) return false;
    try {
      const { active, studios } = await ipc.saveStudios(next);
      set({ active, studios, loaded: true });
      // The office shows this studio's folders: a project picked in another studio no longer applies.
      const office = useOfficeStore.getState();
      if (office.project && !studioHasProject(currentStudio(), office.project)) office.setProject(null);
      else void office.applyFilter();
      return true;
    } catch (e) {
      uiLog("error", `Studios: ${errorText(e)}`);
      return false;
    }
  },
  setActive: async (id) => {
    const { active, studios } = get();
    if (id === active) return true;
    useOfficeStore.getState().select(null);
    return get().save({ active: id, studios });
  },
  add: async (kind, name, project) => {
    const { studios } = get();
    const id = newStudioId(kind, studios);
    const ok = await get().save({ active: id, studios: [...studios, { id, name: name.trim() || kindOf(kind).label, kind, projects: [project] }] });
    return ok ? id : null;
  },
  update: (id, patch) => {
    const { active, studios } = get();
    return get().save({ active, studios: studios.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  },
  remove: (id) => {
    const { active, studios } = get();
    const rest = studios.filter((s) => s.id !== id);
    if (rest.length === 0) return Promise.resolve(false);
    return get().save({ active: active === id ? rest[0].id : active, studios: rest });
  },
}));

// ---------------------------------------------------------------- projects

interface ProjectState {
  projects: ProjectReport[];
  selected: string | null;
  loading: boolean;
  load: () => Promise<void>;
  open: (path: string) => Promise<ProjectReport | null>;
  recheck: (path: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
  select: (path: string | null) => void;
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  projects: [],
  selected: null,
  loading: false,
  load: async () => {
    if (!inTauri) return;
    set({ loading: true });
    try {
      const projects = await ipc.listProjects();
      set((s) => ({ projects, selected: s.selected ?? projects[0]?.path ?? null }));
    } catch (e) {
      uiLog("error", `Projects: ${errorText(e)}`);
    } finally {
      set({ loading: false });
    }
  },
  open: async (path) => {
    if (!inTauri) return null;
    try {
      const report = await ipc.addProject(path);
      set((s) => ({ projects: [report, ...s.projects.filter((p) => p.path.toLowerCase() !== path.toLowerCase())], selected: report.path }));
      return report;
    } catch (e) {
      uiLog("error", `Open project: ${errorText(e)}`);
      return null;
    }
  },
  recheck: async (path) => {
    try {
      const report = await ipc.checkProject(path);
      set((s) => ({ projects: s.projects.map((p) => (p.path === path ? report : p)) }));
    } catch (e) {
      uiLog("error", `Check: ${errorText(e)}`);
    }
  },
  remove: async (path) => {
    await ipc.removeProject(path).catch((e) => uiLog("error", errorText(e)));
    set((s) => ({ projects: s.projects.filter((p) => p.path !== path), selected: s.selected === path ? null : s.selected }));
    if (useOfficeStore.getState().project === path) useOfficeStore.getState().setProject(null);
    if (get().selected === null) set((s) => ({ selected: s.projects[0]?.path ?? null }));
  },
  select: (selected) => set({ selected }),
}));

// ---------------------------------------------------------------- history

interface HistoryState {
  /** Folder filter, null = every project. */
  project: string | null;
  limit: number;
  sessions: AgentSession[];
  selected: string | null;
  loading: boolean;
  setProject: (project: string | null) => void;
  setLimit: (limit: number) => void;
  select: (transcriptPath: string | null) => void;
  load: () => Promise<void>;
}

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  project: null,
  limit: 30,
  sessions: [],
  selected: null,
  loading: false,
  setProject: (project) => {
    set({ project, selected: null });
    void get().load();
  },
  setLimit: (limit) => {
    set({ limit });
    void get().load();
  },
  select: (selected) => set({ selected }),
  load: async () => {
    if (!inTauri) return;
    set({ loading: true });
    try {
      const { project, limit } = get();
      const sessions = await ipc.listSessions({ project, limit, windowMinutes: useOfficeStore.getState().windowMinutes });
      set((s) => ({ sessions, selected: s.selected && sessions.some((x) => x.transcriptPath === s.selected) ? s.selected : (sessions[0]?.transcriptPath ?? null) }));
    } catch (e) {
      uiLog("error", `History: ${errorText(e)}`);
    } finally {
      set({ loading: false });
    }
  },
}));

// ---------------------------------------------------------------- providers

interface ProviderStoreState {
  providers: ProviderStatus[];
  load: () => Promise<void>;
}

export const useProviderStore = create<ProviderStoreState>()((set) => ({
  providers: [],
  load: async () => {
    if (!inTauri) return;
    try {
      set({ providers: await ipc.listProviders() });
    } catch (e) {
      uiLog("error", `Agents: ${errorText(e)}`);
    }
  },
}));

// ---------------------------------------------------------------- drops: a folder opens as a project

async function openFolder(paths: string[], then: (path: string) => void) {
  const path = paths[0];
  if (!path) return;
  const report = await useProjectStore.getState().open(path);
  if (report) then(report.path);
}

registerDropHandler("projects", (p) => void openFolder(p, () => {}));
registerDropHandler("office", (p) =>
  void openFolder(p, (path) => {
    const ready = useProjectStore.getState().projects.find((x) => x.path === path)?.ready;
    if (ready) useOfficeStore.getState().setProject(path);
    else useAppStore.getState().setActiveTab("projects");
  }),
);
registerDropHandler("history", (p) => void openFolder(p, (path) => useHistoryStore.getState().setProject(path)));
// The Agents tab has nothing to filter by folder: show the opened project's report instead.
registerDropHandler("providers", (p) => void openFolder(p, () => useAppStore.getState().setActiveTab("projects")));
