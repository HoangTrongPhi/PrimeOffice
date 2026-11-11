import { EmptyState, Modal } from "@abyss/ui";
import { Activity, Check, Crown, EyeOff, FolderOpen, Loader2, MessagesSquare, Pencil, SquareTerminal, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { ChatItem } from "../../lib/chatEvents";
import { inTauri, ipc } from "../../lib/ipc";
import { errorText, uiLog, useAppStore } from "../../stores/appStore";
import { useChatStore } from "../../stores/chatStore";
import { agentName, isBoss, selectAgent, selectTerm, termOf, useOfficeUi, type AgentTab } from "../../stores/officeUiStore";
import { termName, useTermStore, type TermTab } from "../../stores/termStore";
import type { OfficeAgent } from "../../types/primeoffice";
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

/**
 * The selected office agent: who it is, buttons for what can be done with it, and its terminal (when
 * one was opened from the app), its activity and its conversation.
 */
export function AgentPanel({ agent }: { agent: OfficeAgent }) {
  const { session } = agent;
  const tabs = useTermStore((s) => s.tabs);
  const { names, tasks, bosses, avatars, agentTab, setAgentTab, setName, setTask, setBoss, setAvatar } = useOfficeUi();
  const [avatarOpen, setAvatarOpen] = useState(false);
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
          <StatusPill status={session.status} />
          <button type="button" className="icon-btn size-6 shrink-0" title="Back to the Command Center" aria-label="Close" onClick={() => selectAgent(null)}>
            <X className="size-3.5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-x-2 text-[11px] text-ink-faint">
          <span>{PROVIDER[session.provider] ?? session.provider}</span>
          {session.model && <span className="font-mono">{session.model}</span>}
          <span title={session.cwd}>{folderName(session.cwd)}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-ink-faint">
          <span className="shrink-0">Task</span>
          <input
            key={tasks[session.sessionId] ?? ""}
            className="h-6 min-w-0 flex-1 rounded border border-edge bg-canvas/70 px-1.5 text-[12px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
            defaultValue={tasks[session.sessionId] ?? ""}
            maxLength={60}
            placeholder={session.title || "e.g. task001"}
            title="The task shown under its name in the office (only in PrimeOffice). Empty: the session's title."
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
