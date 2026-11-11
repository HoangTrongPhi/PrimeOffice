// Mirrors of the Rust structs (serde camelCase). Keep every field in sync with src-tauri/src.
import type { AbyssContext } from "@abyss/ui";

export type { LogEntry, LogLevel } from "@abyss/ui";

export type TabId = "office" | "chat" | "projects" | "history" | "providers" | "terminal";

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
  /** Room templates the user saved in Theme Studio (`lib/rooms.ts` `RoomTemplate`). */
  roomTemplates: unknown[];
}

export interface OfficeAgent {
  id: number;
  session: AgentSession;
}

/** `studio_cmd::Studio`: one company in the Office tab, with its own floor and its project. */
export interface Studio {
  /** `[a-z0-9-]`, unique. */
  id: string;
  name: string;
  /** A `STUDIO_KINDS` id (lib/studios.ts): the floor plans and departments it starts from. */
  kind: string;
  /** The project folder (one, with its own `.claude`) whose agents work here; empty = every project
   *  (studios made before 0.4 only). */
  projects: string[];
}

/** `studio_cmd::Studios`. */
export interface Studios {
  active: string;
  studios: Studio[];
}

// ---------------------------------------------------------------- chat (commands::chat_cmd)

/** `chat_cmd::ChatRequest`: one message to an agent. */
export interface ChatRequest {
  cwd: string;
  prompt: string;
  /** Session to continue; null starts a new one. */
  sessionId: string | null;
  /** Model alias or id; null = the CLI's default. */
  model: string | null;
  /** `manual` | `acceptEdits` | `plan` | `bypassPermissions`; null = the CLI's default. */
  permissionMode: string | null;
}

/** Payload of `chat://event`: a stream-json record of the CLI, or the end of its process. */
export interface ChatEvent {
  chatId: number;
  line?: unknown;
  done?: { code: number | null; stderr: string };
}

/** `providers::claude::Conversation` (`chat_history`): a session's conversation read from its transcript. */
export interface ChatHistory {
  items: import("../lib/chatEvents").ChatItem[];
  /** The transcript is longer than what is shown: `items` is its end. */
  truncated: boolean;
}

// ---------------------------------------------------------------- terminal (commands::term_cmd)

/** `term_cmd::TermPreset`: something a terminal can start, and whether it is installed. */
export interface TermPreset {
  /** `claude` | `codex` | `gemini` | `shell`. */
  id: string;
  label: string;
  found: boolean;
  path: string | null;
  hint: string;
}

/** `term_cmd::TermRequest`. */
export interface TermRequest {
  preset: string;
  cwd: string;
  cols: number;
  rows: number;
  /** Claude Code only: the session to open (`claude --resume <id>`). */
  sessionId?: string | null;
  /** Claude Code only: start a new session with this id (`--session-id`). */
  newSessionId?: string | null;
  /** `--model` for a vendor CLI; null = its default. */
  model?: string | null;
  /** Claude Code only: `--permission-mode`. */
  permissionMode?: string | null;
}

/** Payload of `term://event`: output of a terminal, or its end (`exit`: the code, null when unknown). */
export interface TermEvent {
  termId: number;
  data?: string;
  exit?: number | null;
}

/** `chat_cmd::ChatCli`. */
export interface ChatCli {
  found: boolean;
  path: string | null;
  hint: string;
}

/** `office_cmd::OfficeFilter`. */
export interface OfficeFilter {
  projects: string[];
  windowMinutes?: number | null;
}
