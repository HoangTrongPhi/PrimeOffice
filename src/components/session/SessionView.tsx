import { PathText, PillBadge, type PillTone } from "@abyss/ui";
import { BookOpen, Bot, Globe, HelpCircle, ListChecks, MessageSquareText, Pencil, Search, Sparkles, Terminal, Wrench, type LucideIcon } from "lucide-react";
import type { ActionKind, AgentSession, SessionStatus } from "../../types/primeoffice";

const STATUS: Record<SessionStatus, { label: string; tone: PillTone }> = {
  active: { label: "Working", tone: "accent" },
  waiting: { label: "Needs you", tone: "amber" },
  done: { label: "Turn done", tone: "emerald" },
  stale: { label: "Idle", tone: "neutral" },
};

export const ACTION_ICON: Record<ActionKind, LucideIcon> = {
  read: BookOpen,
  edit: Pencil,
  run: Terminal,
  search: Search,
  web: Globe,
  subagent: Bot,
  ask: HelpCircle,
  plan: ListChecks,
  skill: Sparkles,
  other: Wrench,
};

const PROVIDER_LABEL: Record<string, string> = { claude: "Claude Code", codex: "Codex", gemini: "Gemini", deepseek: "DeepSeek" };

export function StatusPill({ status }: { status: SessionStatus }) {
  const s = STATUS[status];
  return <PillBadge tone={s.tone}>{s.label}</PillBadge>;
}

export function relTime(iso: string | null | undefined, ms?: number): string {
  const t = iso ? Date.parse(iso) : ms;
  if (!t || Number.isNaN(t)) return "—";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

export function folderName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function ContextGauge({ used, max }: { used: number; max: number }) {
  if (!used) return null;
  const pct = Math.min(100, Math.round((used / max) * 100));
  const tone = pct > 85 ? "bg-rose" : pct > 60 ? "bg-amber" : "bg-emerald";
  return (
    <div className="flex items-center gap-2 text-[11px] text-ink-faint" title={`${used.toLocaleString()} / ${max.toLocaleString()} tokens`}>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-tint/8">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      Context {pct}%
    </div>
  );
}

/** One session: title, status, last prompt, recent actions, last reply. */
export function SessionView({ session, maxActions = 20 }: { session: AgentSession; maxActions?: number }) {
  const actions = session.actions.slice(-maxActions).reverse();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-semibold text-ink">{session.title || "Untitled session"}</h2>
          <StatusPill status={session.status} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-faint">
          <span>{PROVIDER_LABEL[session.provider] ?? session.provider}</span>
          {session.entrypoint && <span>{session.entrypoint === "claude-desktop" ? "Desktop app" : session.entrypoint}</span>}
          {session.model && <span className="font-mono">{session.model}</span>}
          <span>{relTime(session.lastActivityAt, session.modifiedMs)}</span>
          <span>{session.promptCount} prompt(s)</span>
        </div>
        {session.cwd && <PathText path={session.cwd} className="text-ink-muted" />}
        <ContextGauge used={session.contextTokens} max={session.maxContextTokens} />
      </div>

      <section>
        <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-ink-faint uppercase">
          <MessageSquareText className="size-3.5" /> Last prompt
        </h3>
        <p className="max-h-40 overflow-y-auto rounded-lg border border-edge bg-canvas/60 px-3 py-2 text-[12.5px] whitespace-pre-wrap text-ink select-text">
          {session.lastPrompt || <span className="text-ink-faint">No prompt read yet</span>}
        </p>
      </section>

      {session.openTools.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-[11px] font-medium tracking-wide text-ink-faint uppercase">Running now</h3>
          <ul className="flex flex-col gap-1">
            {session.openTools.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-[12px] text-accent">
                <span className="size-1.5 animate-pulse rounded-full bg-accent" /> {t.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-1.5 text-[11px] font-medium tracking-wide text-ink-faint uppercase">Recent actions</h3>
        {actions.length === 0 ? (
          <p className="text-[12px] text-ink-faint">No tool calls yet.</p>
        ) : (
          <ol className="flex flex-col">
            {actions.map((a, i) => {
              const Icon = ACTION_ICON[a.kind] ?? Wrench;
              return (
                <li key={i} className="flex items-center gap-2 border-l border-edge py-1 pl-3 text-[12px] text-ink-muted">
                  <Icon className="size-3.5 shrink-0 text-ink-faint" />
                  <span className="min-w-0 flex-1 truncate" title={a.label}>
                    {a.label}
                  </span>
                  {a.at && <span className="shrink-0 text-[10.5px] text-ink-faint tabular-nums">{new Date(a.at).toLocaleTimeString()}</span>}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {session.lastReply && (
        <section>
          <h3 className="mb-1.5 text-[11px] font-medium tracking-wide text-ink-faint uppercase">Last reply</h3>
          <p className="max-h-48 overflow-y-auto rounded-lg border border-edge bg-canvas/60 px-3 py-2 text-[12.5px] whitespace-pre-wrap text-ink-muted select-text">{session.lastReply}</p>
        </section>
      )}
    </div>
  );
}
