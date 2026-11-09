import { EmptyState, GlassCard, PathText, PillBadge } from "@abyss/ui";
import { Building2, CheckCircle2, Circle, ClipboardCopy, FolderCheck, FolderOpen, History, Info, RefreshCw, Trash2, XCircle } from "lucide-react";
import { useEffect } from "react";
import { pickPaths } from "../../lib/dialogs";
import { inTauri, ipc } from "../../lib/ipc";
import { useAppStore } from "../../stores/appStore";
import { useHistoryStore, useOfficeStore, useProjectStore } from "../../stores/dataStore";
import type { ProjectCheck, ProjectReport } from "../../types/primeoffice";
import { relTime } from "../session/SessionView";

const LEVELS: [ProjectCheck["severity"], string][] = [
  ["error", "required"],
  ["warn", "recommended"],
  ["info", "optional"],
];

/** What is still missing, by level: "2 recommended, 1 optional missing" (or "nothing missing"). */
function missingSummary(checks: ProjectCheck[]): string {
  const missing = checks.filter((c) => !c.passed);
  const parts = LEVELS.map(([sev, label]) => [missing.filter((c) => c.severity === sev).length, label] as const)
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`);
  return parts.length ? `${parts.join(", ")} missing` : "nothing missing";
}

function CheckRow({ c }: { c: ProjectCheck }) {
  const Icon = c.passed ? CheckCircle2 : c.severity === "error" ? XCircle : c.severity === "warn" ? Circle : Info;
  const tone = c.passed ? "text-emerald" : c.severity === "error" ? "text-rose" : c.severity === "warn" ? "text-amber" : "text-ink-faint";
  return (
    <li className="flex items-start gap-3 px-4 py-2.5">
      <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink">
          {c.title}
          {!c.passed && <PillBadge tone={c.severity === "error" ? "rose" : c.severity === "warn" ? "amber" : "neutral"}>{c.severity === "error" ? "required" : c.severity === "warn" ? "recommended" : "optional"}</PillBadge>}
        </div>
        <div className="text-[11.5px] text-ink-faint">{c.message}</div>
        {!c.passed && c.fix && (
          <div className="mt-1 flex items-start gap-2 text-[11.5px] text-ink-muted">
            <span className="min-w-0 flex-1">Fix: {c.fix}</span>
            <button type="button" className="shrink-0 text-ink-faint hover:text-ink" title="Copy" onClick={() => void navigator.clipboard?.writeText(c.fix)}>
              <ClipboardCopy className="size-3.5" />
            </button>
          </div>
        )}
      </div>
      <code className="shrink-0 font-mono text-[10px] text-ink-faint">{c.code}</code>
    </li>
  );
}

function Report({ r }: { r: ProjectReport }) {
  const { recheck, remove } = useProjectStore.getState();
  const missing = r.checks.filter((c) => !c.passed);
  const required = missing.filter((c) => c.severity === "error");
  const go = (tab: "office" | "history") => {
    if (tab === "office") useOfficeStore.getState().setProject(r.path);
    else useHistoryStore.getState().setProject(r.path);
    useAppStore.getState().setActiveTab(tab);
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-semibold text-ink">{r.name}</h2>
            <PillBadge tone={r.ready ? "emerald" : "rose"}>{r.ready ? "Ready" : `Not ready — ${required.length} required missing`}</PillBadge>
          </div>
          <PathText path={r.path} className="block text-ink-muted" />
          <div className="mt-1 text-[11.5px] text-ink-faint">
            {r.sessions.length ? r.sessions.map((s) => `${s.sessions} ${s.provider} session(s)`).join(" · ") : "No agent session yet"}
            {r.lastSessionMs ? ` · last ${relTime(null, r.lastSessionMs)}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" disabled={!r.ready} onClick={() => go("office")} title={r.ready ? "Show only this project's agents" : "Fix the required items first"}>
            <Building2 className="size-3.5" /> View in office
          </button>
          <button type="button" className="btn" disabled={!r.ready} onClick={() => go("history")}>
            <History className="size-3.5" /> History
          </button>
          <button type="button" className="btn" onClick={() => void recheck(r.path)} title="Check again (F5)">
            <RefreshCw className="size-3.5" />
          </button>
          {inTauri && (
            <button type="button" className="btn" onClick={() => void ipc.revealInExplorer(r.path)} title="Show in Explorer">
              <FolderOpen className="size-3.5" />
            </button>
          )}
          <button type="button" className="btn" onClick={() => void remove(r.path)} title="Remove from the list (the folder is not touched)">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {missing.length > 0 && (
        <div className={`rounded-lg border px-3 py-2 text-[12px] ${r.ready ? "border-amber/30 bg-amber/8 text-amber" : "border-rose/30 bg-rose/8 text-rose"}`}>
          {r.ready ? `Viewable. ${missingSummary(r.checks)}:` : `Cannot be reviewed yet. Missing:`} {missing.map((c) => c.title).join(", ")}.
        </div>
      )}

      <GlassCard title={`Project standard — ${r.checks.length - missing.length}/${r.checks.length} passed`}>
        <ul className="divide-y divide-edge">
          {[...r.checks].sort((a, b) => Number(a.passed) - Number(b.passed)).map((c) => (
            <CheckRow key={c.code} c={c} />
          ))}
        </ul>
      </GlassCard>
    </div>
  );
}

/** Open project folders, check them against the standard, list what is missing. */
export function ProjectsTab() {
  const { projects, selected, loading, load, select } = useProjectStore();
  const dragActive = useAppStore((s) => s.dragActive);
  useEffect(() => {
    void load();
  }, [load]);
  const current = projects.find((p) => p.path === selected) ?? null;

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-edge">
        <div className="flex items-center gap-2 border-b border-edge p-3">
          <button type="button" className="btn btn-primary flex-1" onClick={() => void pickPaths("folder")}>
            <FolderOpen className="size-3.5" /> Open folder…
          </button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {projects.map((p) => (
            <li key={p.path}>
              <button type="button" onClick={() => select(p.path)} className={`flex w-full items-center gap-2 px-3 py-2 text-left ${p.path === selected ? "bg-accent/10" : "hover:bg-tint/4"}`}>
                <span className={`size-2 shrink-0 rounded-full ${p.ready ? "bg-emerald" : "bg-rose"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-ink">{p.name}</span>
                  <span className="block truncate text-[10.5px] text-ink-faint">{p.ready ? missingSummary(p.checks) : "not ready"}</span>
                </span>
              </button>
            </li>
          ))}
          {!projects.length && !loading && <li className="px-3 py-4 text-[12px] text-ink-faint">No project yet. Open or drop a folder.</li>}
        </ul>
      </aside>
      <div className={`min-w-0 flex-1 overflow-y-auto p-6 ${dragActive ? "ring-2 ring-accent/50 ring-inset" : ""}`}>
        {current ? (
          <Report r={current} />
        ) : (
          <EmptyState icon={<FolderCheck className="size-5" />} title="Open a project folder">
            PrimeOffice checks it against the standard — agent sessions, CLAUDE.md, git, docs/SPEC.md, docs/PROGRESS.md… — and lists everything that is missing, with how to fix it. You can also drop a folder on the window.
          </EmptyState>
        )}
      </div>
    </div>
  );
}
