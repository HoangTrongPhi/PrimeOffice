import { EmptyState } from "@abyss/ui";
import { History, Loader2, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useHistoryStore, useProjectStore } from "../../stores/dataStore";
import { ACTION_ICON, folderName, relTime, SessionView, StatusPill } from "../session/SessionView";

/** Recent sessions: title, last prompt and the last few actions at a glance; the full view on the right. */
export function HistoryTab() {
  const { project, limit, sessions, selected, loading, setProject, setLimit, select, load } = useHistoryStore();
  const projects = useProjectStore((s) => s.projects);
  useEffect(() => {
    void load();
    void useProjectStore.getState().load();
  }, [load]);
  const current = sessions.find((s) => s.transcriptPath === selected) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-edge px-4 py-2">
        <label className="flex items-center gap-1.5 text-[12px] text-ink-faint">
          Project
          <select className="h-7 rounded-md border border-edge bg-canvas/70 px-2 text-[12px] text-ink" value={project ?? ""} onChange={(e) => setProject(e.target.value || null)}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.path} value={p.path}>
                {p.name}
              </option>
            ))}
            {project && !projects.some((p) => p.path === project) && <option value={project}>{folderName(project)}</option>}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-faint">
          Show
          <select className="h-7 rounded-md border border-edge bg-canvas/70 px-2 text-[12px] text-ink" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {[10, 30, 60, 120].map((n) => (
              <option key={n} value={n}>
                {n} latest
              </option>
            ))}
          </select>
        </label>
        <div className="flex-1" />
        <button type="button" className="btn" onClick={() => void load()} title="Refresh (F5)">
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Refresh
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <ul className="w-[420px] shrink-0 divide-y divide-edge overflow-y-auto border-r border-edge">
          {sessions.map((s) => (
            <li key={s.transcriptPath}>
              <button type="button" onClick={() => select(s.transcriptPath)} className={`flex w-full flex-col gap-1 px-4 py-3 text-left ${s.transcriptPath === selected ? "bg-accent/10" : "hover:bg-tint/4"}`}>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{s.title || "Untitled session"}</span>
                  <StatusPill status={s.status} />
                </div>
                <div className="line-clamp-2 text-[11.5px] text-ink-muted">{s.lastPrompt || "—"}</div>
                <div className="flex flex-col gap-0.5">
                  {s.actions
                    .slice(-3)
                    .reverse()
                    .map((a, i) => {
                      const Icon = ACTION_ICON[a.kind];
                      return (
                        <span key={i} className="flex items-center gap-1.5 truncate text-[11px] text-ink-faint">
                          <Icon className="size-3 shrink-0" /> <span className="truncate">{a.label}</span>
                        </span>
                      );
                    })}
                </div>
                <div className="flex gap-2 text-[10.5px] text-ink-faint">
                  <span>{folderName(s.cwd)}</span>
                  <span>·</span>
                  <span>{relTime(s.lastActivityAt, s.modifiedMs)}</span>
                </div>
              </button>
            </li>
          ))}
          {!sessions.length && !loading && (
            <li>
              <EmptyState icon={<History className="size-5" />} title="No sessions">
                {project ? `No agent has run in ${folderName(project)} yet.` : "No agent session found on this PC yet."}
              </EmptyState>
            </li>
          )}
        </ul>
        <div className="min-w-0 flex-1 overflow-y-auto p-6">{current ? <SessionView session={current} maxActions={50} /> : null}</div>
      </div>
    </div>
  );
}
