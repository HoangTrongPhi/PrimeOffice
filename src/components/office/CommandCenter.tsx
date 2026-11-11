import { PillBadge } from "@abyss/ui";
import { Activity, Gauge, Send, SquareTerminal, Wrench } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { studioHasProject } from "../../lib/studios";
import { currentStudio, useOfficeStore, useProjectStore, useStudioStore } from "../../stores/dataStore";
import { agentName, selectAgent, selectTerm, termOf, useOfficeUi, type CommandTab } from "../../stores/officeUiStore";
import { termName, useTermStore } from "../../stores/termStore";
import type { SessionStatus } from "../../types/primeoffice";
import { ACTION_ICON, folderName, relTime } from "../session/SessionView";
import { looseTerms } from "./AgentStrip";

const DOT: Record<SessionStatus, string> = { active: "bg-accent animate-pulse", waiting: "bg-amber", done: "bg-emerald", stale: "bg-ink-faint" };
const STATE_LABEL: Record<SessionStatus, string> = { active: "Working", waiting: "Needs you", done: "Turn done", stale: "Idle" };
const PROVIDER: Record<string, string> = { claude: "Claude Code", codex: "Codex", gemini: "Gemini", shell: "Shell" };
const FIELD = "h-7 rounded-md border border-edge bg-canvas/70 px-2 text-[12px] text-ink";

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-ink-faint uppercase">
        <span className="flex-1">{title}</span>
        {aside}
      </h3>
      {children}
    </section>
  );
}

/** Every agent at a glance: state, what it does, context; the terminals with no character yet. */
function Monitor() {
  const agents = useOfficeStore((s) => s.agents);
  const tabs = useTermStore((s) => s.tabs);
  const names = useOfficeUi((s) => s.names);
  const loose = looseTerms(agents, tabs);
  const count = (st: SessionStatus) => agents.filter((a) => a.session.status === st).length;
  // Who needs the user comes first, then who works.
  const order: Record<SessionStatus, number> = { waiting: 0, active: 1, done: 2, stale: 3 };
  const sorted = [...agents].sort((a, b) => order[a.session.status] - order[b.session.status] || b.session.modifiedMs - a.session.modifiedMs);

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-wrap gap-1.5">
        <PillBadge tone="amber">{count("waiting")} need you</PillBadge>
        <PillBadge tone="accent">{count("active")} working</PillBadge>
        <PillBadge tone="emerald">{count("done")} turn done</PillBadge>
        <PillBadge tone="neutral">{tabs.filter((t) => t.state === "running").length} terminals</PillBadge>
      </div>

      <Section title={`Agents (${agents.length})`}>
        {sorted.length === 0 && <p className="text-[12px] text-ink-faint">No agent in the office. Add one below the floor, or start one anywhere.</p>}
        <ul className="flex flex-col gap-1.5">
          {sorted.map(({ id, session }) => {
            const linked = termOf(session, tabs);
            const pct = session.contextTokens ? Math.min(100, Math.round((session.contextTokens / session.maxContextTokens) * 100)) : 0;
            const tone = pct > 85 ? "bg-rose" : pct > 60 ? "bg-amber" : "bg-emerald";
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => selectAgent(id)}
                  className={`flex w-full flex-col gap-1 rounded-lg border px-3 py-2 text-left hover:bg-tint/4 ${session.status === "waiting" ? "border-amber/40 bg-amber/5" : "border-edge"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`size-2 shrink-0 rounded-full ${DOT[session.status]}`} />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{agentName(session, names, linked)}</span>
                    {linked && linked.state !== "ended" && <SquareTerminal className="size-3 text-accent" />}
                    <span className="shrink-0 text-[10.5px] text-ink-faint">{STATE_LABEL[session.status]}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-ink-muted">
                    <Wrench className="size-3 shrink-0 text-ink-faint" />
                    <span className="min-w-0 flex-1 truncate">{session.openTools[0]?.label ?? session.actions.at(-1)?.label ?? "—"}</span>
                    <span className="shrink-0 text-ink-faint">{session.actions.length} actions</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10.5px] text-ink-faint">
                    <span className="truncate">{PROVIDER[session.provider] ?? session.provider}{session.model ? ` · ${session.model}` : ""} · {folderName(session.cwd)}</span>
                    <span className="flex-1" />
                    <span className="shrink-0 tabular-nums" title={session.contextTokens ? `${session.contextTokens.toLocaleString()} / ${session.maxContextTokens.toLocaleString()} tokens` : "Context not read yet"}>
                      ctx {session.contextTokens ? `${pct}%` : "—"}
                    </span>
                    <div className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-tint/8">
                      <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      {loose.length > 0 && (
        <Section title={`Terminals without a character (${loose.length})`}>
          <ul className="flex flex-col gap-1">
            {loose.map((t) => (
              <li key={t.key}>
                <button type="button" onClick={() => selectTerm(t.key)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-tint/4">
                  <span className={`size-1.5 shrink-0 rounded-full ${t.state === "running" ? "bg-emerald" : t.state === "starting" ? "bg-amber" : "bg-ink-faint"}`} />
                  <span className="min-w-0 flex-1 truncate text-ink">{termName(t)}</span>
                  <span className="shrink-0 text-[10.5px] text-ink-faint">{t.state}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

/** Give work: type it into a running agent's terminal, or start a new agent with it as its first task. */
function Dispatch() {
  const tabs = useTermStore((s) => s.tabs);
  const presets = useTermStore((s) => s.presets);
  const agents = useOfficeStore((s) => s.agents);
  const names = useOfficeUi((s) => s.names);
  const projects = useProjectStore((s) => s.projects);
  useStudioStore((s) => s.active);
  const folders = projects.filter((p) => studioHasProject(currentStudio(), p.path));
  const running = tabs.filter((t) => t.state === "running");
  const [target, setTarget] = useState("new");
  const [preset, setPreset] = useState("claude");
  const [cwd, setCwd] = useState("");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!cwd && folders[0]) setCwd(folders[0].path);
  }, [cwd, folders]);
  // A terminal that ended is no longer a target.
  useEffect(() => {
    if (target !== "new" && !running.some((t) => String(t.key) === target)) setTarget("new");
  }, [target, running]);

  const label = (key: number) => {
    const t = tabs.find((x) => x.key === key)!;
    const a = agents.find((x) => x.session.sessionId && x.session.sessionId === t.sessionId);
    return a ? agentName(a.session, names, t) : termName(t);
  };
  const usable = presets.filter((p) => p.found && p.id !== "shell");

  const dispatch = async () => {
    const task = text.trim();
    if (!task) return;
    if (target === "new") {
      if (!cwd) return setNote("Pick a folder first.");
      const key = await useTermStore.getState().open({ preset, cwd, newSession: preset === "claude", firstTask: task });
      if (key !== null) {
        setNote(`Started ${presets.find((p) => p.id === preset)?.label ?? preset} in ${folderName(cwd)}; the task is typed in once it is ready.`);
        selectTerm(key);
      }
    } else {
      const key = Number(target);
      setNote(useTermStore.getState().send(key, task) ? `Typed into ${label(key)}.` : "That terminal is not running any more.");
    }
    setText("");
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <Section title="Dispatch a task">
        <label className="flex items-center gap-2 text-[12px] text-ink-faint">
          <span className="w-12 shrink-0">To</span>
          <select className={`${FIELD} min-w-0 flex-1`} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="new">A new agent…</option>
            {running.map((t) => (
              <option key={t.key} value={t.key}>
                {label(t.key)} (its terminal)
              </option>
            ))}
          </select>
        </label>
        {target === "new" && (
          <>
            <label className="flex items-center gap-2 text-[12px] text-ink-faint">
              <span className="w-12 shrink-0">Engine</span>
              <select className={`${FIELD} min-w-0 flex-1`} value={preset} onChange={(e) => setPreset(e.target.value)}>
                {(usable.length ? usable : [{ id: "claude", label: "Claude Code" }]).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-[12px] text-ink-faint">
              <span className="w-12 shrink-0">Folder</span>
              <select className={`${FIELD} min-w-0 flex-1`} value={cwd} onChange={(e) => setCwd(e.target.value)}>
                {!folders.length && <option value="">Open a project folder first</option>}
                {folders.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <textarea
          className="min-h-[88px] resize-y rounded-lg border border-edge bg-canvas/70 px-3 py-2 text-[12.5px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          value={text}
          placeholder={target === "new" ? "Describe the task. A new agent starts in the folder and gets it as its first message." : "What to tell this agent. It is typed into its terminal, then Enter."}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void dispatch();
            }
          }}
        />
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-primary" disabled={!text.trim() || (target === "new" && !cwd)} onClick={() => void dispatch()} title="Ctrl+Enter">
            <Send className="size-3.5" /> Dispatch
          </button>
          {note && <span className="min-w-0 flex-1 text-[11.5px] text-ink-faint">{note}</span>}
        </div>
      </Section>
      <p className="text-[11px] leading-relaxed text-ink-faint">
        A task goes to an agent through its own terminal — what you would type yourself. An agent started outside PrimeOffice has no terminal here: open its session in one from its card (Claude Code), or continue it in Chat.
      </p>
    </div>
  );
}

/** What every agent did lately, newest first. */
function ActivityFeed() {
  const agents = useOfficeStore((s) => s.agents);
  const tabs = useTermStore((s) => s.tabs);
  const names = useOfficeUi((s) => s.names);
  const rows = useMemo(
    () =>
      agents
        .flatMap(({ id, session }) => session.actions.map((a) => ({ id, who: agentName(session, names, termOf(session, tabs)), a, t: a.at ? Date.parse(a.at) : 0 })))
        .sort((x, y) => y.t - x.t)
        .slice(0, 80),
    [agents, names, tabs],
  );
  if (!rows.length) return <p className="p-4 text-[12px] text-ink-faint">No tool call yet in the office.</p>;
  return (
    <ol className="flex flex-col p-3">
      {rows.map(({ id, who, a }, i) => {
        const Icon = ACTION_ICON[a.kind] ?? Wrench;
        return (
          <li key={i}>
            <button type="button" onClick={() => selectAgent(id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] hover:bg-tint/4">
              <Icon className="size-3.5 shrink-0 text-ink-faint" />
              <span className="w-24 shrink-0 truncate text-ink">{who}</span>
              <span className="min-w-0 flex-1 truncate text-ink-muted" title={a.label}>
                {a.label}
              </span>
              <span className="shrink-0 text-[10.5px] text-ink-faint tabular-nums">{a.at ? relTime(a.at) : ""}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

const TABS: { id: CommandTab; label: string; icon: ReactNode }[] = [
  { id: "monitor", label: "Monitor", icon: <Gauge className="size-3.5" /> },
  { id: "dispatch", label: "Dispatch", icon: <Send className="size-3.5" /> },
  { id: "activity", label: "Activity", icon: <Activity className="size-3.5" /> },
];

/** The sidebar when no agent is selected: the whole floor — who needs you, giving work, what happened. */
export function CommandCenter() {
  const { commandTab, setCommandTab } = useOfficeUi();
  useEffect(() => void useTermStore.getState().loadPresets(), []);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-edge px-4 py-3">
        <span className="text-[13px] font-semibold tracking-wide text-ink">Command Center</span>
        <span className="text-[11px] text-ink-faint">{currentStudio()?.name ?? ""}</span>
      </div>
      <div className="flex shrink-0 gap-1 border-b border-edge px-3" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === commandTab}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-[12px] ${t.id === commandTab ? "border-accent text-ink" : "border-transparent text-ink-faint hover:text-ink"}`}
            onClick={() => setCommandTab(t.id)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {commandTab === "monitor" && <Monitor />}
        {commandTab === "dispatch" && <Dispatch />}
        {commandTab === "activity" && <ActivityFeed />}
      </div>
    </div>
  );
}
