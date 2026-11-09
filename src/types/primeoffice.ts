// Mirrors of the Rust structs (serde camelCase). Keep every field in sync with src-tauri/src.
import type { AbyssContext } from "@abyss/ui";

export type { LogEntry, LogLevel } from "@abyss/ui";

export type TabId = "office" | "projects" | "history" | "providers";

export interface AppInfo {
  version: string;
  debug: boolean;
  /** Started from the Abyss launcher (which then installs this app's updates). */
  abyss: AbyssContext;
}

export type Severity = "info" | "warn" | "error";

/** `core::Issue`: something to look at; the job carried on past it. */
export interface Issue {
  severity: Severity;
  code: string;
  message: string;
  path?: string;
}

/** `{ jobId, done, total, message }` on every `<module>://progress` event. */
export interface JobProgressEvent {
  jobId: number;
  done: number;
  total: number;
  message: string;
}

// ---------------------------------------------------------------- sessions (core::providers)

export type ActionKind = "read" | "edit" | "run" | "search" | "web" | "subagent" | "ask" | "plan" | "skill" | "other";

export interface SessionAction {
  at?: string;
  kind: ActionKind;
  tool: string;
  label: string;
}

export interface OpenTool {
  id: string;
  tool: string;
  label: string;
  /** `Agent`/`Task` calls: the sub-agent type asked for (e.g. `gameplay-programmer`). */
  agentType?: string;
  /** `Agent`/`Task` calls started in the background. */
  background?: boolean;
}

export type SessionStatus = "active" | "waiting" | "done" | "stale";

export interface AgentSession {
  provider: string;
  sessionId: string;
  title: string;
  cwd: string;
  transcriptPath: string;
  entrypoint: string;
  model: string;
  startedAt: string | null;
  lastActivityAt: string | null;
  modifiedMs: number;
  status: SessionStatus;
  lastPrompt: string;
  lastReply: string;
  promptCount: number;
  contextTokens: number;
  maxContextTokens: number;
  actions: SessionAction[];
  openTools: OpenTool[];
}

/** `session_cmd::SessionQuery`. */
export interface SessionQuery {
  project?: string | null;
  provider?: string | null;
  limit?: number | null;
  windowMinutes?: number | null;
}

export type ProviderState = "active" | "detected" | "notFound" | "unsupported";

export interface ProviderStatus {
  id: string;
  name: string;
  state: ProviderState;
  sessionRoot: string | null;
  sessions: number;
  observable: boolean;
  note: string;
}

// ---------------------------------------------------------------- projects (core::project)

export interface ProjectCheck {
  code: string;
  severity: Severity;
  passed: boolean;
  title: string;
  message: string;
  fix: string;
}

export interface ProjectReport {
  path: string;
  name: string;
  ready: boolean;
  ok: boolean;
  cancelled: boolean;
  elapsedMs: number;
  checks: ProjectCheck[];
  issues: Issue[];
  sessions: { provider: string; sessions: number }[];
  lastSessionMs: number | null;
}

// ---------------------------------------------------------------- office (commands::office_cmd)

/** A pixel-agents ServerMessage, passed through to the office frame untouched. */
export type OfficeMessage = { type: string } & Record<string, unknown>;

export interface OfficeSnapshot {
  /** `settingsLoaded`, with the saved Sound / Always Show Labels / Show Areas. */
  settings: OfficeMessage;
  /** `areaMappingsLoaded`: the saved folder ↔ area mapping. */
  areaMappings: OfficeMessage;
  /** `existingAgents`; `agentMeta` carries remembered seats. */
  existing: OfficeMessage;
  layout: Record<string, unknown> | null;
  activity: OfficeMessage[];
}

export interface OfficeAgent {
  id: number;
  session: AgentSession;
}

/** `office_cmd::OfficeFilter`. */
export interface OfficeFilter {
  projects: string[];
  windowMinutes?: number | null;
}
