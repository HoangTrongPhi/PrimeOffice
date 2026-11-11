// What a chat turn shows, built from the stream-json records of `claude -p` (verified on Claude Code
// 2.1.319, see docs/FORMATS.md). Pure functions, no imports beyond types: tested with node
// (scripts/tests/chatEvents.test.ts). Unknown records are ignored — a new record type must never
// break the chat.

export type ChatItem =
  | { kind: "user"; text: string }
  /** `streaming`: text is still arriving. */
  | { kind: "assistant"; text: string; streaming: boolean }
  | { kind: "tool"; id: string; name: string; label: string; done: boolean; error: boolean }
  | { kind: "notice"; tone: "info" | "warn" | "error"; text: string };

export interface ChatView {
  /** Set by the CLI's first record; a new session gets its id here. */
  sessionId: string | null;
  model: string;
  items: ChatItem[];
  /** Cost of the turns run from PrimeOffice in this view, USD at API prices (the CLI's estimate). */
  costUsd: number;
  /** Usage window the plan is in when it is not simply "allowed" (e.g. "five_hour: rejected"). */
  limit: string;
}

export const emptyChat = (): ChatView => ({ sessionId: null, model: "", items: [], costUsd: 0, limit: "" });

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
const oneLine = (s: string, max: number) => {
  const t = s.split(/\s+/).filter(Boolean).join(" ");
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

/** "Editing App.tsx", "Running: npm test" — same wording as the office (core/activity.rs). */
export function toolLabel(name: string, input: unknown): string {
  const i = obj(input);
  switch (name) {
    case "Read":
      return `Reading ${baseName(str(i.file_path))}`;
    case "Edit":
    case "MultiEdit":
      return `Editing ${baseName(str(i.file_path))}`;
    case "Write":
      return `Writing ${baseName(str(i.file_path))}`;
    case "Bash":
    case "PowerShell":
      return `Running: ${oneLine(str(i.description) || str(i.command), 80)}`;
    case "Glob":
      return "Searching files";
    case "Grep":
      return "Searching code";
    case "WebFetch":
      return "Fetching web content";
    case "WebSearch":
      return "Searching the web";
    case "Task":
    case "Agent":
      return str(i.description) ? `Subtask: ${oneLine(str(i.description), 60)}` : "Running subtask";
    default:
      return `Using ${name.split("__").pop() ?? name}`;
  }
}

/** The assistant item text is streaming into, if any. */
function streamingIndex(items: ChatItem[]): number {
  const last = items.length - 1;
  const it = items[last];
  return it && it.kind === "assistant" && it.streaming ? last : -1;
}

/** One stream-json record → the next view (a new object; `view` is not changed). */
export function applyChatLine(view: ChatView, line: unknown): ChatView {
  const rec = obj(line);
  const type = str(rec.type);
  const sessionId = str(rec.session_id) || view.sessionId;
  // Records of a sub-agent carry the tool call that started it: the office shows those.
  if (rec.parent_tool_use_id) return sessionId === view.sessionId ? view : { ...view, sessionId };
  const items = view.items.slice();

  if (type === "system" && str(rec.subtype) === "init") {
    return { ...view, sessionId, model: str(rec.model) || view.model };
  }

  if (type === "stream_event") {
    const ev = obj(rec.event);
    const delta = obj(ev.delta);
    if (str(ev.type) === "content_block_delta" && str(delta.type) === "text_delta" && str(delta.text)) {
      const at = streamingIndex(items);
      if (at >= 0) items[at] = { kind: "assistant", text: (items[at] as { text: string }).text + str(delta.text), streaming: true };
      else items.push({ kind: "assistant", text: str(delta.text), streaming: true });
      return { ...view, sessionId, items };
    }
    return sessionId === view.sessionId ? view : { ...view, sessionId };
  }

  if (type === "assistant") {
    for (const part of arr(obj(rec.message).content)) {
      const p = obj(part);
      if (str(p.type) === "text" && str(p.text).trim()) {
        // The whole block: it replaces what streamed in, or stands alone without partial messages.
        const at = streamingIndex(items);
        if (at >= 0) items[at] = { kind: "assistant", text: str(p.text), streaming: false };
        else items.push({ kind: "assistant", text: str(p.text), streaming: false });
      } else if (str(p.type) === "tool_use" && str(p.id) && !items.some((it) => it.kind === "tool" && it.id === str(p.id))) {
        const at = streamingIndex(items);
        if (at >= 0) items[at] = { ...(items[at] as Extract<ChatItem, { kind: "assistant" }>), streaming: false };
        items.push({ kind: "tool", id: str(p.id), name: str(p.name), label: toolLabel(str(p.name), p.input), done: false, error: false });
      }
    }
    return { ...view, sessionId, items };
  }

  if (type === "user") {
    for (const part of arr(obj(rec.message).content)) {
      const p = obj(part);
      if (str(p.type) !== "tool_result") continue;
      const at = items.findIndex((it) => it.kind === "tool" && it.id === str(p.tool_use_id));
      if (at >= 0) items[at] = { ...(items[at] as Extract<ChatItem, { kind: "tool" }>), done: true, error: p.is_error === true };
    }
    return { ...view, sessionId, items };
  }

  if (type === "rate_limit_event") {
    const info = obj(rec.rate_limit_info);
    const status = str(info.status);
    return { ...view, sessionId, limit: status && status !== "allowed" ? `${str(info.rateLimitType) || "limit"}: ${status}` : "" };
  }

  if (type === "result") {
    const denied = arr(rec.permission_denials).length;
    if (denied) items.push({ kind: "notice", tone: "warn", text: `${denied} tool call${denied === 1 ? " was" : "s were"} refused by the permission mode. Pick another mode, or allow the command in the project's Claude Code settings.` });
    if (rec.is_error === true || (str(rec.subtype) && str(rec.subtype) !== "success")) {
      const errors = arr(rec.errors).map(str).filter(Boolean).join("; ");
      items.push({ kind: "notice", tone: "error", text: str(rec.result) || errors || `The turn ended with ${str(rec.subtype) || "an error"}` });
    }
    const cost = typeof rec.total_cost_usd === "number" ? rec.total_cost_usd : 0;
    return { ...view, sessionId, items: closeOpen(items), costUsd: view.costUsd + cost };
  }

  return sessionId === view.sessionId ? view : { ...view, sessionId };
}

/** Nothing is streaming or running any more. */
function closeOpen(items: ChatItem[]): ChatItem[] {
  return items.map((it) => (it.kind === "assistant" && it.streaming ? { ...it, streaming: false } : it.kind === "tool" && !it.done ? { ...it, done: true } : it));
}

/** The CLI process ended: close what is open and say why when it did not end well. */
export function applyChatDone(view: ChatView, done: { code: number | null; stderr: string }, stopped: boolean): ChatView {
  const items = closeOpen(view.items);
  if (stopped) items.push({ kind: "notice", tone: "info", text: "Stopped." });
  else if (done.code !== 0 && !items.some((it) => it.kind === "notice" && it.tone === "error")) {
    const why = done.stderr.trim().split(/\r?\n/).slice(-3).join(" ").trim();
    items.push({ kind: "notice", tone: "error", text: why || `Claude Code ended with code ${done.code ?? "?"}` });
  }
  return { ...view, items };
}
