// Every invoke() and event name of the app lives here (and in dev/mockBackend.ts, which answers them in ?mock).
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AgentSession,
  AppInfo,
  ChatCli,
  ChatEvent,
  ChatHistory,
  ChatRequest,
  LogEntry,
  OfficeAgent,
  OfficeFilter,
  OfficeMessage,
  OfficeSnapshot,
  ProjectReport,
  ProviderStatus,
  SessionQuery,
  SkillLibrary,
  Studios,
  TermEvent,
  TermPreset,
  TermRequest,
} from "../types/primeoffice";

/** False in a plain browser (`npm run dev` without `?mock`): backend calls are skipped. */
export const inTauri = isTauri();

export const EVENTS = {
  log: "log://entry",
  office: "office://message",
  chat: "chat://event",
  term: "term://event",
} as const;

export const ipc = {
  appInfo: () => invoke<AppInfo>("app_info"),
  logHistory: () => invoke<LogEntry[]>("log_history"),
  uiLog: (level: string, message: string) => invoke<void>("ui_log", { level, message }),
  cancelJob: (jobId: number) => invoke<boolean>("cancel_job", { jobId }),
  openUrl: (url: string) => invoke<void>("open_url", { url }),
  revealInExplorer: (path: string) => invoke<void>("reveal_in_explorer", { path }),
  openUserGuide: (lang: string) => invoke<void>("open_user_guide", { lang }),
  /** The folder the window was started with ("Open with"), once; null afterwards. */
  takeStartupFolder: () => invoke<string | null>("take_startup_folder"),

  officeSnapshot: () => invoke<OfficeSnapshot>("office_snapshot"),
  officeSend: (message: OfficeMessage) => invoke<void>("office_send", { message }),
  officeAgents: () => invoke<OfficeAgent[]>("office_agents"),
  officeSetFilter: (filter: OfficeFilter) => invoke<void>("office_set_filter", { filter }),

  checkProject: (path: string) => invoke<ProjectReport>("check_project", { path }),
  listProjects: () => invoke<ProjectReport[]>("list_projects"),
  addProject: (path: string) => invoke<ProjectReport>("add_project", { path }),
  removeProject: (path: string) => invoke<boolean>("remove_project", { path }),
  agentTypes: (path: string) => invoke<string[]>("agent_types", { path }),

  listSessions: (query: SessionQuery) => invoke<AgentSession[]>("list_sessions", { query }),
  getSession: (path: string) => invoke<AgentSession>("get_session", { path }),
  listProviders: () => invoke<ProviderStatus[]>("list_providers"),

  listStudios: () => invoke<Studios>("list_studios"),
  /** Replace the studio list (add, rename, remove, folders, switch); answers the list as saved. */
  saveStudios: (studios: Studios) => invoke<Studios>("save_studios", { studios }),

  /** Is the Claude Code CLI installed. */
  chatCli: () => invoke<ChatCli>("chat_cli"),
  /** One message to an agent; answers the chat id its `chat://event`s carry. */
  chatSend: (request: ChatRequest) => invoke<number>("chat_send", { request }),
  chatStop: (chatId: number) => invoke<boolean>("chat_stop", { chatId }),
  /** The whole conversation of a Claude Code session, by transcript path. */
  chatHistory: (path: string) => invoke<ChatHistory>("chat_history", { path }),

  /** What a terminal can start on this PC (vendor CLIs, the shell). */
  termPresets: () => invoke<TermPreset[]>("term_presets"),
  /** Open a terminal; answers the id its `term://event`s carry. */
  termOpen: (request: TermRequest) => invoke<number>("term_open", { request }),
  termWrite: (termId: number, data: string) => invoke<boolean>("term_write", { termId, data }),
  termResize: (termId: number, cols: number, rows: number) => invoke<boolean>("term_resize", { termId, cols, rows }),
  termClose: (termId: number) => invoke<boolean>("term_close", { termId }),

  /** The skill library (structure created where missing) and its templates. */
  skillLibrary: () => invoke<SkillLibrary>("skill_library"),
  /** Use another library folder (null = the default one) and/or switch "only the template's skills". */
  saveSkillLibrary: (root: string | null, isolate: boolean) => invoke<SkillLibrary>("save_skill_library", { root, isolate }),
};

export const on = {
  log: (cb: (e: LogEntry) => void): Promise<UnlistenFn> => listen<LogEntry>(EVENTS.log, (e) => cb(e.payload)),
  /** Batches of pixel-agents ServerMessages from the observer. */
  office: (cb: (msgs: OfficeMessage[]) => void): Promise<UnlistenFn> => listen<OfficeMessage[]>(EVENTS.office, (e) => cb(e.payload)),
  /** Records of a running chat turn, then its end. */
  chat: (cb: (e: ChatEvent) => void): Promise<UnlistenFn> => listen<ChatEvent>(EVENTS.chat, (e) => cb(e.payload)),
  /** Output of the open terminals, and their ends. */
  term: (cb: (e: TermEvent) => void): Promise<UnlistenFn> => listen<TermEvent>(EVENTS.term, (e) => cb(e.payload)),
};
