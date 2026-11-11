import { EmptyState } from "@abyss/ui";
import { AlertTriangle, Check, FolderOpen, Loader2, MessageSquarePlus, MessagesSquare, Send, Square, Wrench, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { pickPaths } from "../../lib/dialogs";
import type { ChatItem } from "../../lib/chatEvents";
import { studioHasProject } from "../../lib/studios";
import { CHAT_MODELS, CHAT_MODES, useChatStore } from "../../stores/chatStore";
import { currentStudio, useProjectStore, useStudioStore } from "../../stores/dataStore";
import { folderName, relTime, StatusPill } from "../session/SessionView";

const FIELD = "h-7 rounded-md border border-edge bg-canvas/70 px-2 text-[12px] text-ink";

function Item({ item }: { item: ChatItem }) {
  switch (item.kind) {
    case "user":
      return (
        <div className="flex justify-end">
          <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-accent/15 px-3.5 py-2 text-[13px] text-ink">{item.text}</div>
        </div>
      );
    case "assistant":
      return (
        <div className="max-w-[92%] whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink">
          {item.text}
          {item.streaming && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-ink-faint align-middle" />}
        </div>
      );
    case "tool":
      return (
        <div className="flex items-center gap-2 text-[11.5px] text-ink-faint">
          {!item.done ? <Loader2 className="size-3.5 shrink-0 animate-spin" /> : item.error ? <X className="size-3.5 shrink-0 text-danger" /> : <Check className="size-3.5 shrink-0" />}
          <Wrench className="size-3 shrink-0" />
          <span className="truncate">{item.label}</span>
        </div>
      );
    case "notice":
      return (
        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] ${item.tone === "error" ? "border-danger/40 text-danger" : item.tone === "warn" ? "border-warn/40 text-warn" : "border-edge text-ink-muted"}`}>
          {item.tone !== "info" && <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />}
          <span className="whitespace-pre-wrap break-words">{item.text}</span>
        </div>
      );
  }
}

/**
 * Chat: give an agent work from here. Sessions on the left are the folder's ordinary Claude Code
 * sessions — the ones started here, in a terminal or in Claude Desktop — and a message continues the
 * one that is open or starts a new one.
 */
export function ChatTab() {
  const { cwd, model, mode, sessions, loadingSessions, view, title, running, stopping, cli, setCwd, setModel, setMode, newSession, openSession, send, stop } = useChatStore();
  const projects = useProjectStore((s) => s.projects);
  // Re-render when the studio on screen changes: its folders come first.
  useStudioStore((s) => s.active);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const studio = currentStudio();
  const folders = projects.filter((p) => studioHasProject(studio, p.path));
  const busy = running !== null;
  const modeInfo = CHAT_MODES.find((m) => m.id === mode) ?? CHAT_MODES[0];

  useEffect(() => {
    const chat = useChatStore.getState();
    void chat.checkCli();
    void chat.loadSessions();
    void useProjectStore.getState().load();
    void useStudioStore.getState().load();
  }, []);

  // Keep the newest text in view while it streams in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [view.items]);

  const submit = () => {
    if (!draft.trim() || busy || !cwd) return;
    void send(draft);
    setDraft("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-edge px-4 py-2">
        <label className="flex items-center gap-1.5 text-[12px] text-ink-faint">
          Folder
          <select className={FIELD} value={cwd ?? ""} disabled={busy} onChange={(e) => setCwd(e.target.value || null)}>
            <option value="">Pick a folder…</option>
            {folders.map((p) => (
              <option key={p.path} value={p.path}>
                {p.name}
              </option>
            ))}
            {cwd && !folders.some((p) => p.path === cwd) && <option value={cwd}>{folderName(cwd)}</option>}
          </select>
        </label>
        <button type="button" className="btn" disabled={busy} onClick={() => void pickPaths("folder")} title="Open a project folder (or drop one on the window)">
          <FolderOpen className="size-3.5" /> Open folder…
        </button>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-faint">
          Model
          <select className={FIELD} value={model} onChange={(e) => setModel(e.target.value)}>
            {CHAT_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-faint" title={modeInfo.text}>
          May
          <select className={FIELD} value={mode} onChange={(e) => setMode(e.target.value)}>
            {CHAT_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex-1" />
        {view.limit && <span className="text-[11.5px] text-warn">Plan limit — {view.limit}</span>}
        <span className="text-[11.5px] text-ink-faint">Claude Code{view.model ? ` · ${view.model}` : ""}</span>
      </div>

      {cli && !cli.found && (
        <div className="flex items-start gap-2 border-b border-warn/40 bg-warn/5 px-4 py-2 text-[12px] text-warn">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>Claude Code CLI not found. {cli.hint}</span>
        </div>
      )}
      {mode === "bypassPermissions" && (
        <div className="flex items-start gap-2 border-b border-danger/40 bg-danger/5 px-4 py-2 text-[12px] text-danger">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>Full auto: the agent runs any command and changes any file without asking.</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[280px] shrink-0 flex-col border-r border-edge">
          <button type="button" className="btn m-3 justify-center" disabled={busy || !cwd} onClick={newSession}>
            <MessageSquarePlus className="size-3.5" /> New session
          </button>
          <ul className="min-h-0 flex-1 divide-y divide-edge overflow-y-auto border-t border-edge">
            {sessions.map((s) => (
              <li key={s.transcriptPath}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => openSession(s)}
                  className={`flex w-full flex-col gap-1 px-4 py-2.5 text-left disabled:opacity-60 ${s.sessionId === view.sessionId ? "bg-accent/10" : "hover:bg-tint/4"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{s.title || "Untitled session"}</span>
                    <StatusPill status={s.status} />
                  </div>
                  <div className="flex gap-2 text-[10.5px] text-ink-faint">
                    <span>{s.entrypoint || "claude"}</span>
                    <span>·</span>
                    <span>{relTime(s.lastActivityAt, s.modifiedMs)}</span>
                  </div>
                </button>
              </li>
            ))}
            {!sessions.length && (
              <li className="px-4 py-3 text-[11.5px] text-ink-faint">{!cwd ? "Pick a folder to see its sessions." : loadingSessions ? "Loading…" : "No Claude Code session in this folder yet."}</li>
            )}
          </ul>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {view.items.length === 0 ? (
              <EmptyState icon={<MessagesSquare className="size-5" />} title={cwd ? `New session in ${folderName(cwd)}` : "Pick a folder first"}>
                {cwd
                  ? "Write what you want done. It runs as an ordinary Claude Code session: its character walks into the office, and you can continue it from a terminal (claude --resume) or from Claude Desktop (/resume)."
                  : "An agent works in a project folder. Pick one above, open one, or drop a folder on the window."}
              </EmptyState>
            ) : (
              <div className="mx-auto flex max-w-[860px] flex-col gap-3 px-6 py-5">
                {title && <div className="truncate text-[11.5px] text-ink-faint">{title}</div>}
                {view.items.map((item, i) => (
                  <Item key={i} item={item} />
                ))}
                {busy && view.items.at(-1)?.kind === "user" && (
                  <div className="flex items-center gap-2 text-[11.5px] text-ink-faint">
                    <Loader2 className="size-3.5 animate-spin" /> Starting Claude Code…
                  </div>
                )}
                <div ref={endRef} />
              </div>
            )}
          </div>

          <form
            className="border-t border-edge p-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="mx-auto flex max-w-[860px] items-end gap-2">
              <textarea
                className="max-h-48 min-h-[44px] flex-1 resize-y rounded-lg border border-edge bg-canvas/70 px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
                rows={2}
                value={draft}
                disabled={!cwd}
                placeholder={!cwd ? "Pick a folder first" : view.sessionId ? "Reply to continue this session…  (Enter to send, Shift+Enter for a new line)" : "Give the agent a task…  (Enter to send, Shift+Enter for a new line)"}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              {busy ? (
                <button type="button" className="btn h-[44px]" disabled={stopping} onClick={() => void stop()} title="Stop this turn">
                  <Square className="size-3.5" /> Stop
                </button>
              ) : (
                <button type="submit" className="btn btn-primary h-[44px]" disabled={!draft.trim() || !cwd || (cli !== null && !cli.found)}>
                  <Send className="size-3.5" /> Send
                </button>
              )}
            </div>
            <div className="mx-auto mt-1.5 flex max-w-[860px] gap-3 text-[10.5px] text-ink-faint">
              <span className="min-w-0 flex-1 truncate">{modeInfo.label}: {modeInfo.text}</span>
              {view.sessionId && <span className="shrink-0 font-mono" title="Session id: claude --resume <id>">{view.sessionId.slice(0, 8)}</span>}
              {view.costUsd > 0 && <span className="shrink-0" title="The CLI's estimate at API prices; on a plan it counts against your usage limits instead">≈ ${view.costUsd.toFixed(3)}</span>}
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
