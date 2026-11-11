import { Crown, Plus, SquareTerminal, X } from "lucide-react";
import type { OfficeAgent, SessionStatus } from "../../types/primeoffice";
import { agentName, isBoss, selectAgent, selectTerm, termOf, useOfficeUi } from "../../stores/officeUiStore";
import { useOfficeStore } from "../../stores/dataStore";
import { termName, useTermStore, type TermTab } from "../../stores/termStore";
import { folderName } from "../session/SessionView";

const DOT: Record<SessionStatus, string> = { active: "bg-accent animate-pulse", waiting: "bg-amber", done: "bg-emerald", stale: "bg-ink-faint" };
const STATE_LABEL: Record<SessionStatus, string> = { active: "Working", waiting: "Needs you", done: "Turn done", stale: "Idle" };
const PROVIDER: Record<string, string> = { claude: "Claude", codex: "Codex", gemini: "Gemini", shell: "Shell" };

/** Terminals opened from the app whose session has no character in the office (yet). */
export function looseTerms(agents: OfficeAgent[], tabs: TermTab[]): TermTab[] {
  return tabs.filter((t) => !t.sessionId || !agents.some((a) => a.session.sessionId === t.sessionId));
}

function Gauge({ used, max }: { used: number; max: number }) {
  const pct = used ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const tone = pct > 85 ? "bg-rose" : pct > 60 ? "bg-amber" : "bg-emerald";
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-tint/8" title={used ? `Context ${pct}% — ${used.toLocaleString()} / ${max.toLocaleString()} tokens` : "Context not read yet"}>
      <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const CARD = "group relative flex h-[84px] w-[188px] shrink-0 flex-col gap-1 rounded-lg border px-3 py-2 text-left transition-colors";

/**
 * The roster under the office: one card per agent (its state, name, folder, what it is doing and how
 * full its context is), the terminals started from the app that have no character yet, and Add agent.
 */
export function AgentStrip() {
  const agents = useOfficeStore((s) => s.agents);
  const selectedId = useOfficeStore((s) => s.selectedId);
  const tabs = useTermStore((s) => s.tabs);
  const { term, names, tasks, bosses, setAddOpen } = useOfficeUi();
  const loose = looseTerms(agents, tabs);

  return (
    <div className="flex h-[104px] shrink-0 items-center gap-2.5 overflow-x-auto border-t border-edge bg-panel/40 px-3">
      {agents.map(({ id, session }) => {
        const linked = termOf(session, tabs);
        const on = id === selectedId;
        return (
          <button
            key={id}
            type="button"
            className={`${CARD} ${on ? "border-accent bg-accent/10" : "border-edge bg-canvas/60 hover:border-edge-strong hover:bg-tint/4"}`}
            onClick={() => selectAgent(on ? null : id)}
            title={`${agentName(session, names, linked)} — ${STATE_LABEL[session.status]}\n${session.cwd}`}
          >
            <div className="flex items-center gap-1.5">
              <span className={`size-2 shrink-0 rounded-full ${DOT[session.status]}`} />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{agentName(session, names, linked)}</span>
              {isBoss(session, bosses) && <Crown className="size-3 shrink-0 text-amber" aria-label="Boss of this folder" />}
              {linked && linked.state !== "ended" && <SquareTerminal className="size-3 shrink-0 text-accent" aria-label="Has a terminal here" />}
            </div>
            <div className="truncate text-[11px] text-ink-muted">{session.openTools[0]?.label ?? session.actions.at(-1)?.label ?? STATE_LABEL[session.status]}</div>
            <div className="flex gap-1.5 text-[10.5px] text-ink-faint">
              <span className="truncate">{tasks[session.sessionId] || folderName(session.cwd)}</span>
              <span>·</span>
              <span className="shrink-0">{PROVIDER[session.provider] ?? session.provider}</span>
            </div>
            <Gauge used={session.contextTokens} max={session.maxContextTokens} />
          </button>
        );
      })}

      {loose.map((t) => {
        const on = t.key === term;
        return (
          <div key={`t${t.key}`} className="relative shrink-0">
            <button
              type="button"
              className={`${CARD} ${on ? "border-accent bg-accent/10" : "border-dashed border-edge-strong bg-canvas/60 hover:bg-tint/4"}`}
              onClick={() => selectTerm(on ? null : t.key)}
              title={`${termName(t)}\n${t.cwd}${t.title ? `\n${t.title}` : ""}`}
            >
              <div className="flex items-center gap-1.5 pr-4">
                <span className={`size-2 shrink-0 rounded-full ${t.state === "running" ? "bg-emerald" : t.state === "starting" ? "bg-amber" : "bg-ink-faint"}`} />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{termName(t)}</span>
              </div>
              <div className="truncate text-[11px] text-ink-muted">{t.state === "ended" ? `Ended${t.code !== null ? ` (code ${t.code})` : ""}` : t.title || (t.sessionId ? "Starting its session…" : "Terminal")}</div>
              <div className="flex gap-1.5 text-[10.5px] text-ink-faint">
                <span className="truncate">{folderName(t.cwd)}</span>
                <span>·</span>
                <span className="shrink-0">{PROVIDER[t.preset] ?? t.label}</span>
              </div>
            </button>
            <button
              type="button"
              className="absolute top-1.5 right-1.5 rounded p-0.5 text-ink-faint opacity-0 group-hover:opacity-100 hover:bg-tint/8 hover:text-ink focus:opacity-100 [div:hover>&]:opacity-100"
              title={t.state === "ended" ? "Remove this card" : "End this terminal"}
              aria-label={`Close ${termName(t)}`}
              onClick={() => {
                if (term === t.key) selectTerm(null);
                useTermStore.getState().close(t.key);
              }}
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}

      <button type="button" className="btn btn-primary h-9 shrink-0 px-4" onClick={() => setAddOpen(true)} title="Start an agent in a project folder: Claude Code, Codex, Gemini or a shell">
        <Plus className="size-4" /> Add agent
      </button>
      {agents.length === 0 && loose.length === 0 && <span className="text-[11.5px] text-ink-faint">No agent at work. Start one here, or run one anywhere — its character walks in.</span>}
    </div>
  );
}
