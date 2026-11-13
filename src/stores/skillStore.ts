// The skill library (skills_cmd): its folder, the "only the template's skills" switch, its templates,
// and which template each session was started with. A session keeps its template: every later start
// of it (a terminal with --resume, a chat turn) passes the same one, so its skills do not change.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { inTauri, ipc } from "../lib/ipc";
import type { SkillLibrary, SkillTemplate } from "../types/primeoffice";
import { errorText, uiLog } from "./appStore";

interface SkillState {
  library: SkillLibrary | null;
  loading: boolean;
  /** Last error of a load or save, shown in Settings. */
  error: string | null;
  /** Session id → skill template id it was started with. */
  bySession: Record<string, string>;
  load: () => Promise<SkillLibrary | null>;
  save: (root: string | null, isolate: boolean) => Promise<boolean>;
  setSessionTemplate: (sessionId: string, templateId: string | null) => void;
}

export const useSkillStore = create<SkillState>()(
  persist(
    (set, get) => ({
      library: null,
      loading: false,
      error: null,
      bySession: {},
      load: async () => {
        if (!inTauri) return null;
        set({ loading: true });
        try {
          const library = await ipc.skillLibrary();
          set({ library, loading: false, error: null });
          return library;
        } catch (e) {
          set({ loading: false, error: errorText(e) });
          uiLog("error", `Skill library: ${errorText(e)}`);
          return null;
        }
      },
      save: async (root, isolate) => {
        if (!inTauri) return false;
        set({ loading: true });
        try {
          set({ library: await ipc.saveSkillLibrary(root, isolate), loading: false, error: null });
          return true;
        } catch (e) {
          set({ loading: false, error: errorText(e) });
          return false;
        }
      },
      setSessionTemplate: (sessionId, templateId) =>
        set(() => {
          const bySession = { ...get().bySession };
          if (templateId) bySession[sessionId] = templateId;
          else delete bySession[sessionId];
          return { bySession };
        }),
    }),
    { name: "primeoffice.skills", partialize: (s) => ({ bySession: s.bySession }) },
  ),
);

/** The template a session was started with, if any. */
export function sessionTemplate(sessionId: string | null | undefined): string | null {
  return (sessionId && useSkillStore.getState().bySession[sessionId]) || null;
}

/** The template preselected for a studio kind: the one with the same id (`game`, `video`), else none. */
export function templateForKind(templates: SkillTemplate[], kind: string | undefined): string {
  return templates.find((t) => t.id === kind)?.id ?? "";
}

/** "12 skills · 3 sources" for a template. */
export function templateSummary(t: SkillTemplate): string {
  const skills = t.sources.reduce((n, s) => n + s.skills.length, 0);
  const agents = t.sources.reduce((n, s) => n + s.agents, 0);
  const parts = [`${skills} skill${skills === 1 ? "" : "s"}`];
  if (agents) parts.push(`${agents} agent${agents === 1 ? "" : "s"}`);
  const repos = t.sources.filter((s) => s.kind !== "own").length;
  if (repos) parts.push(`${repos} repo${repos === 1 ? "" : "s"}`);
  return parts.join(" · ");
}
