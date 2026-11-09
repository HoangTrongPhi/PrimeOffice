// Every invoke() and event name of the app lives here (and in dev/mockBackend.ts, which answers them in ?mock).
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AgentSession,
  AppInfo,
  AppSettings,
  LogEntry,
  OfficeAgent,
  OfficeFilter,
  OfficeMessage,
  OfficeSnapshot,
  ProjectReport,
  ProviderStatus,
  SessionQuery,
} from "../types/primeoffice";

/** False in a plain browser (`npm run dev` without `?mock`): backend calls are skipped. */
export const inTauri = isTauri();

export const EVENTS = {
  log: "log://entry",
  office: "office://message",
} as const;

export const ipc = {
  appInfo: () => invoke<AppInfo>("app_info"),
  logHistory: () => invoke<LogEntry[]>("log_history"),
  uiLog: (level: string, message: string) => invoke<void>("ui_log", { level, message }),
  cancelJob: (jobId: number) => invoke<boolean>("cancel_job", { jobId }),
  openUrl: (url: string) => invoke<void>("open_url", { url }),
  revealInExplorer: (path: string) => invoke<void>("reveal_in_explorer", { path }),
  getSettings: () => invoke<AppSettings>("get_settings"),
  setSettings: (settings: AppSettings) => invoke<void>("set_settings", { settings }),

  officeSnapshot: () => invoke<OfficeSnapshot>("office_snapshot"),
  officeSend: (message: OfficeMessage) => invoke<void>("office_send", { message }),
  officeAgents: () => invoke<OfficeAgent[]>("office_agents"),
  officeSetFilter: (filter: OfficeFilter) => invoke<void>("office_set_filter", { filter }),

  checkProject: (path: string) => invoke<ProjectReport>("check_project", { path }),
  listProjects: () => invoke<ProjectReport[]>("list_projects"),
  addProject: (path: string) => invoke<ProjectReport>("add_project", { path }),
  removeProject: (path: string) => invoke<boolean>("remove_project", { path }),

  listSessions: (query: SessionQuery) => invoke<AgentSession[]>("list_sessions", { query }),
  getSession: (path: string) => invoke<AgentSession>("get_session", { path }),
  listProviders: () => invoke<ProviderStatus[]>("list_providers"),
};

export const on = {
  log: (cb: (e: LogEntry) => void): Promise<UnlistenFn> => listen<LogEntry>(EVENTS.log, (e) => cb(e.payload)),
  /** Batches of pixel-agents ServerMessages from the observer. */
  office: (cb: (msgs: OfficeMessage[]) => void): Promise<UnlistenFn> => listen<OfficeMessage[]>(EVENTS.office, (e) => cb(e.payload)),
};
