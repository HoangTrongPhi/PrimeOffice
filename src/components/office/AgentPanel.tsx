import { EmptyState, Modal } from "@abyss/ui";
import { Activity, Check, CheckCircle2, Circle, ClipboardCopy, Crown, EyeOff, FolderOpen, Loader2, MessagesSquare, Pencil, SquareTerminal, UserPlus, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { ChatItem } from "../../lib/chatEvents";
import { inTauri, ipc } from "../../lib/ipc";
import { errorText, uiLog, useAppStore } from "../../stores/appStore";
import { useChatStore } from "../../stores/chatStore";
import { allDone, statusText, subAgentOrder, subProgress } from "../../lib/team";
import { agentName, agentTask, isBoss, selectAgent, selectTerm, termOf, useOfficeUi, type AgentTab } from "../../stores/officeUiStore";
import { termName, useTermStore, type TermTab } from "../../stores/termStore";
import type { AgentSession, OfficeAgent } from "../../types/primeoffice";
import { ChatItemView } from "../tabs/ChatTab";
import { folderName, SessionView, StatusPill } from "../session/SessionView";
import { AvatarPicker, AvatarSprite } from "./AvatarPicker";
import { TermComposer, TermView } from "./TermView";

const PROVIDER: Record<string, string> = { claude: "Claude Code", codex: "Codex", gemini: "Gemini", shell: "Shell" };

/** A name that becomes a text field on the pencil. */
function EditableName({ name, onCommit }: { name: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft !== null) {
    return (
      <form
        className="flex min-w-0 flex-1 items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          onCommit(draft);
          setDraft(null);
        }}
      >
        <input
          autoFocus
          className="h-6 min-w-0 flex-1 rounded border border-accent bg-canvas px-1.5 text-[13px] text-ink focus:outline-none"
          value={draft}
          maxLength={40}
          placeholder="Name (empty = automatic)"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setDraft(null)}
        />
        <button type="submit" className="icon-btn size-6" aria-label="Save the name">
          <Check className="size-3.5" />
        </button>
      </form>
    );
  }
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <span className="truncate text-[14px] font-semibold text-ink" title={name}>
        {name}
      </span>
      <button type="button" className="icon-btn size-6 shrink-0" title="Rename (only in PrimeOffice)" aria-label="Rename" onClick={() => setDraft(name)}>
        <Pencil className="size-3" />
      </button>
    </div>
  );
}

function SubTabs({ tabs, current, onChange }: { tabs: { id: AgentTab; label: string; icon: ReactNode; hidden?: boolean }[]; current: AgentTab; onChange: (t: AgentTab) => void }) {
  return (
    <div className="flex shrink-0 gap-1 border-b border-edge px-3" role="tablist">
      {tabs
        .filter((t) => !t.hidden)
        .map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === current}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-[12px] ${t.id === current ? "border-accent text-ink" : "border-transparent text-ink-faint hover:text-ink"}`}
            onClick={() => onChange(t.id)}
          >
            {t.icon} {t.label}
          </button>
        ))}
    </div>
  );
}

/** The conversation of a Claude Code session, read from its transcript (`chat_history`). */
function Conversation({ path, modifiedMs }: { path: string; modifiedMs: number }) {
  const [items, setItems] = useState<ChatItem[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!inTauri) return;
    let gone = false;
    ipc
      .chatHistory(path)
      .then((h) => !gone && (setItems(h.items), setError("")))
      .catch((e) => !gone && setError(errorText(e)));
    return () => {
      gone = true;
    };
    // The transcript grows as the agent works: read it again when it changes.
  }, [path, modifiedMs]);
  if (error) return <p className="p-4 text-[12px] text-rose">{error}</p>;
  if (!items)
    return (
      <div className="flex items-center gap-2 p-4 text-[12px] text-ink-faint">
        <Loader2 className="size-3.5 animate-spin" /> Reading the conversation…
      </div>
    );
  if (!items.length) return <p className="p-4 text-[12px] text-ink-faint">Nothing said yet.</p>;
  return (
    <div className="flex flex-col gap-3 p-4">
      {items.map((item, i) => (
        <ChatItemView key={i} item={item} />
      ))}
    </div>
  );
}

/** A terminal's screen with a line to type into it below. */
function TermBody({ tab }: { tab: TermTab }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TermView key={tab.key} termKey={tab.key} className="flex-1" />
      <TermComposer termKey={tab.key} disabled={tab.state !== "running"} />
    </div>
  );
}

/** The sub-agents a session ordered, ticked as each one finishes; "All done" once the turn is over too. */
function SubAgentList({ session }: { session: AgentSession }) {
  const list = session.subTasks ?? [];
  if (!list.length) return null;
  const { done, total } = subProgress(session);
  const finished = allDone(session);
  return (
    <div className="flex flex-col gap-1 rounded-md border border-edge bg-canvas/40 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-faint">
        {finished ? <CheckCircle2 className="size-3.5 text-emerald" /> : <Loader2 className={`size-3.5 ${session.status === "active" ? "animate-spin" : ""}`} />}
        <span className={finished ? "text-emerald" : ""}>{finished ? "All done" : "Sub-agents"}</span>
        <span className="flex-1" />
        <span className="tabular-nums">
          {done}/{total}
        </span>
      </div>
      <ul className="flex max-h-36 flex-col gap-0.5 overflow-y-auto">
        {list.map((t) => (
          <li key={t.id} className="flex items-center gap-1.5 text-[11.5px]" title={`${t.agentType}${t.background ? " (background)" : ""}`}>
            {t.done ? <CheckCircle2 className="size-3.5 shrink-0 text-emerald" /> : <Circle className="size-3.5 shrink-0 text-ink-faint" />}
            <span className={`min-w-0 flex-1 truncate ${t.done ? "text-ink-faint line-through" : "text-ink"}`}>{t.description || "Subtask"}</span>
            <span className="shrink-0 font-mono text-[10px] text-ink-faint">{t.agentType}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The Boss orders a sub-agent: the order is typed into its session (its terminal here, opened with
 * --resume when it has none), and Claude Code starts the sub-agent with its Agent tool. A session
 * open in Claude Desktop takes the order there: copy it and paste it into that window.
 */
function AddSubAgent({ session, name, open, onClose }: { session: AgentSession; name: string; open: boolean; onClose: () => void }) {
  const tabs = useTermStore((s) => s.tabs);
  const [types, setTypes] = useState<string[]>(["general-purpose"]);
  const [type, setType] = useState("general-purpose");
  const [title, setTitle] = useState("");
  const [task, setTask] = useState("");
  const [note, setNote] = useState("");
  const linked = termOf(session, tabs);
  const running = !!linked && linked.state === "running";
  const desktop = session.entrypoint === "claude-desktop";

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setTask("");
    setNote("");
    ipc
      .agentTypes(session.cwd)
      .then((t) => t.length && setTypes(t))
      .catch(() => {});
  }, [open, session.cwd]);

  const order = subAgentOrder({ type, title, task });
  const send = async () => {
    if (!task.trim()) return;
    if (running && linked && useTermStore.getState().send(linked.key, order)) {
      uiLog("info", `Order sent to ${name}: ${title || task.slice(0, 40)}`);
      return onClose();
    }
    const key = await useTermStore.getState().open({ preset: "claude", cwd: session.cwd, resume: session.sessionId, name, firstTask: order });
    if (key !== null) {
      uiLog("info", `Opened ${name}'s session in a terminal; the order is typed in once it is ready.`);
      onClose();
    }
  };
  const copy = async () => {
    if (!task.trim()) return;
    await navigator.clipboard.writeText(order).catch(() => {});
    setNote("Copied. Paste it into this session in Claude Desktop.");
  };

  const field = "h-7 rounded-md border border-edge bg-canvas/70 px-2 text-[12px] text-ink";
  return (
    <Modal open={open} title={`Add sub-agent — ordered by ${name}`} onClose={onClose} className="max-w-lg">
      <form
        className="flex flex-col gap-3 text-[12.5px] text-ink-muted"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <p>
          The Boss hands this task to a sub-agent of its own (the Agent tool of Claude Code). The sub-agent walks into its department, works, and shows a green tick when it is done; the Boss shows <b className="text-ink">All done</b> once every sub-agent has finished.
        </p>
        <label className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-ink-faint">Type</span>
          <select className={`${field} min-w-0 flex-1`} value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-ink-faint">Title</span>
          <input className={`${field} min-w-0 flex-1`} value={title} maxLength={60} placeholder="e.g. Write stacking tests" onChange={(e) => setTitle(e.target.value)} />
        </label>
        <textarea
          className="min-h-[96px] resize-y rounded-lg border border-edge bg-canvas/70 px-3 py-2 text-[12.5px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          value={task}
          autoFocus
          placeholder="What the sub-agent must do, and what done looks like."
          onChange={(e) => setTask(e.target.value)}
        />
        <details>
          <summary className="cursor-pointer text-[11.5px] text-ink-faint">The order as {name} gets it</summary>
          <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-canvas/60 p-2 text-[11px] whitespace-pre-wrap text-ink">{order}</pre>
        </details>
        {desktop && !running && (
          <p className="text-[11.5px] text-amber">This session was started in Claude Desktop: if it is open there, give the order there (Copy). Two clients writing one session at once would mix their turns.</p>
        )}
        <div className="flex items-center justify-end gap-2">
          {note && <span className="min-w-0 flex-1 text-[11.5px] text-ink-faint">{note}</span>}
          <button type="button" className="btn" disabled={!task.trim()} onClick={() => void copy()} title="Copy the order, to paste it into the session in Claude Desktop">
            <ClipboardCopy className="size-3.5" /> Copy
          </button>
          <button type="submit" className="btn btn-primary" disabled={!task.trim()} title={running ? "Type the order into its terminal" : "Open its session in a terminal (claude --resume) and type the order in"}>
            <UserPlus className="size-3.5" /> {running ? "Send order" : "Open & send"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * The selected office agent: who it is, buttons for what can be done with it, and its terminal (when
 * one was opened from the app), its activity and its conversation.
 */
export function AgentPanel({ agent }: { agent: OfficeAgent }) {
  const { session } = agent;
  const tabs = useTermStore((s) => s.tabs);
  const { names, tasks, bosses, avatars, agentTab, setAgentTab, setName, setTask, setBoss, setAvatar } = useOfficeUi();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const avatar = avatars[session.sessionId] ?? "";
  const boss = isBoss(session, bosses);
  const linked = termOf(session, tabs);
  const claude = session.provider === "claude";
  const name = agentName(session, names, linked);
  // A tab that does not apply to this agent falls back to Activity.
  const tab: AgentTab = (agentTab === "terminal" && !linked) || (agentTab === "conversation" && !claude) ? "activity" : agentTab;

  const openTerminal = async () => {
    if (linked && linked.state !== "ended") return setAgentTab("terminal");
    if (!claude) return;
    await useTermStore.getState().open({ preset: "claude", cwd: session.cwd, resume: session.sessionId, name: names[session.sessionId] ?? "" });
    setAgentTab("terminal");
  };
  const openChat = () => {
    const chat = useChatStore.getState();
    if (chat.running !== null) return uiLog("warn", "Chat is busy with a turn; try again when it ends.");
    chat.setCwd(session.cwd);
    chat.openSession(session);
    useAppStore.getState().setActiveTab("chat");
  };
  const busyTerm = linked && linked.state !== "ended";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-edge px-4 py-3">
        <Modal open={avatarOpen} title={`Avatar — ${name}`} onClose={() => setAvatarOpen(false)} className="max-w-xl">
          <AvatarPicker value={avatar} onChange={(file) => setAvatar(session.sessionId, file || null)} />
        </Modal>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-edge bg-canvas/50 hover:border-accent"
            title="Avatar: how this agent looks in the office"
            aria-label="Change the avatar"
            onClick={() => setAvatarOpen(true)}
          >
            {avatar ? <AvatarSprite file={avatar} scale={1} /> : <Pencil className="size-3 text-ink-faint" />}
          </button>
          <EditableName name={name} onCommit={(n) => (linked && !names[session.sessionId] ? useTermStore.getState().rename(linked.key, n) : setName(session.sessionId, n))} />
          {allDone(session) && (session.subTasks?.length ?? 0) > 0 ? (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald/15 px-2 py-0.5 text-[10.5px] text-emerald" title="Its turn is over and every sub-agent it ordered has finished">
              <CheckCircle2 className="size-3" /> All done
            </span>
          ) : (
            <StatusPill status={session.status} />
          )}
          <button type="button" className="icon-btn size-6 shrink-0" title="Back to the Command Center" aria-label="Close" onClick={() => selectAgent(null)}>
            <X className="size-3.5" />
          </button>
        </div>
        <div className="flex items-baseline gap-1.5 text-[12px]" title="Master Task: the session's short title (the one Claude Desktop shows), or the task name given here">
          <span className="shrink-0 text-[10.5px] font-medium tracking-wide text-ink-faint uppercase">Master Task</span>
          <span className="min-w-0 flex-1 truncate text-ink">{agentTask(session, tasks, name) || "—"}</span>
        </div>
        <div className="text-[11.5px] text-ink-muted">{statusText(session)}</div>
        <div className="flex flex-wrap gap-x-2 text-[11px] text-ink-faint">
          <span>{PROVIDER[session.provider] ?? session.provider}</span>
          {session.model && <span className="font-mono">{session.model}</span>}
          <span title={session.cwd}>{folderName(session.cwd)}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-ink-faint">
          <span className="shrink-0">Task name</span>
          <input
            key={tasks[session.sessionId] ?? ""}
            className="h-6 min-w-0 flex-1 rounded border border-edge bg-canvas/70 px-1.5 text-[12px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
            defaultValue={tasks[session.sessionId] ?? ""}
            maxLength={60}
            placeholder={session.title || "e.g. task001"}
            title="Overrides the Master Task shown under its name in the office (only in PrimeOffice). Empty: the session's title."
            onBlur={(e) => setTask(session.sessionId, e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          <button
            type="button"
            className={boss ? "btn btn-primary" : "btn"}
            aria-pressed={boss}
            title={boss ? "The Boss of this folder: the agents added after it follow its briefing. Click to take the role away." : "Make this agent the Boss of its folder"}
            onClick={() => setBoss(session.cwd, boss ? null : session.sessionId)}
          >
            <Crown className="size-3.5" /> Boss
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className={busyTerm ? "btn btn-primary" : "btn"}
            disabled={!busyTerm && !claude}
            onClick={() => void openTerminal()}
            title={busyTerm ? "Show its terminal" : claude ? "Open this session in a real terminal (claude --resume): permission prompts, /login, slash commands" : "Only a Claude Code session opens in a terminal by id for now"}
          >
            <SquareTerminal className="size-3.5" /> Terminal
          </button>
          <button type="button" className="btn" disabled={!claude} onClick={openChat} title={claude ? "Continue this session in the Chat tab" : "Chat runs Claude Code only for now"}>
            <MessagesSquare className="size-3.5" /> Chat
          </button>
          <button type="button" className="btn" disabled={!session.cwd} onClick={() => void ipc.revealInExplorer(session.cwd).catch((e) => uiLog("error", errorText(e)))} title={`Show ${session.cwd} in Explorer`}>
            <FolderOpen className="size-3.5" /> Folder
          </button>
          {claude && (
            <button
              type="button"
              className="btn"
              disabled={!boss}
              onClick={() => setSubOpen(true)}
              title={boss ? "Order a sub-agent: the Boss hands it a task" : "Only the folder's Boss orders sub-agents (Crown button above)"}
            >
              <UserPlus className="size-3.5" /> Add sub-agent
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => {
              void ipc.officeSend({ type: "closeAgent", id: agent.id }).catch((e) => uiLog("error", errorText(e)));
              selectAgent(null);
            }}
            title="Hide this character until its session works again (the session itself goes on)"
          >
            <EyeOff className="size-3.5" /> Hide
          </button>
        </div>
        <SubAgentList session={session} />
        {claude && <AddSubAgent session={session} name={name} open={subOpen} onClose={() => setSubOpen(false)} />}
      </div>

      <SubTabs
        current={tab}
        onChange={setAgentTab}
        tabs={[
          { id: "terminal", label: "Terminal", icon: <SquareTerminal className="size-3.5" />, hidden: !linked },
          { id: "activity", label: "Activity", icon: <Activity className="size-3.5" /> },
          { id: "conversation", label: "Conversation", icon: <MessagesSquare className="size-3.5" />, hidden: !claude },
        ]}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {tab === "terminal" && linked && <TermBody tab={linked} />}
        {tab === "activity" && (
          <div className="p-4">
            <SessionView session={session} maxActions={25} />
          </div>
        )}
        {tab === "conversation" && <Conversation path={session.transcriptPath} modifiedMs={session.modifiedMs} />}
      </div>
    </div>
  );
}

/** A terminal card's detail: a terminal opened from the app whose session has no character yet. */
export function TermPanel({ tab }: { tab: TermTab }) {
  const rename = useTermStore((s) => s.rename);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-edge px-4 py-3">
        <div className="flex items-center gap-2">
          <EditableName name={termName(tab)} onCommit={(n) => rename(tab.key, n)} />
          <span className={`rounded-full px-2 py-0.5 text-[10.5px] ${tab.state === "running" ? "bg-emerald/15 text-emerald" : tab.state === "starting" ? "bg-amber/15 text-amber" : "bg-tint/8 text-ink-faint"}`}>{tab.state === "running" ? "Running" : tab.state === "starting" ? "Starting" : "Ended"}</span>
          <button type="button" className="icon-btn size-6 shrink-0" title="Back to the Command Center" aria-label="Close" onClick={() => selectTerm(null)}>
            <X className="size-3.5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-x-2 text-[11px] text-ink-faint">
          <span>{tab.label}</span>
          <span title={tab.cwd}>{folderName(tab.cwd)}</span>
          {tab.sessionId && <span className="font-mono" title="Its Claude Code session: the character walks in once the session writes its first record">{tab.sessionId.slice(0, 8)}</span>}
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            className="btn"
            onClick={() => {
              selectTerm(null);
              useTermStore.getState().close(tab.key);
            }}
            title={tab.state === "ended" ? "Remove this card" : "End the program and remove the card"}
          >
            <X className="size-3.5" /> {tab.state === "ended" ? "Remove" : "End"}
          </button>
          <button type="button" className="btn" onClick={() => void ipc.revealInExplorer(tab.cwd).catch((e) => uiLog("error", errorText(e)))}>
            <FolderOpen className="size-3.5" /> Folder
          </button>
        </div>
      </div>
      <TermBody tab={tab} />
    </div>
  );
}

/** Nothing to show for a selection that went away (the agent left the office). */
export function GonePanel() {
  return (
    <EmptyState icon={<EyeOff className="size-5" />} title="It left the office">
      The agent is no longer in the office.
    </EmptyState>
  );
}
