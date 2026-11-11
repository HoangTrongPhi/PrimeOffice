import { EmptyState } from "@abyss/ui";
import { FolderOpen, Plus, SquareTerminal, X } from "lucide-react";
import { useEffect } from "react";
import { pickPaths } from "../../lib/dialogs";
import { studioHasProject } from "../../lib/studios";
import { currentStudio, useProjectStore, useStudioStore } from "../../stores/dataStore";
import { termName, useTermStore } from "../../stores/termStore";
import { TermView } from "../office/TermView";
import { folderName } from "../session/SessionView";

const FIELD = "h-7 rounded-md border border-edge bg-canvas/70 px-2 text-[12px] text-ink";

const tabTitle = termName;

/**
 * Terminal: real terminals inside PrimeOffice, each running a vendor CLI (Claude Code, Codex, Gemini)
 * or the shell in a project folder — for what needs the CLI's own screen: signing in, /resume, slash
 * commands. A terminal keeps running while another tab is shown.
 */
export function TerminalTab() {
  const { cwd, presets, tabs, active, setCwd, setActive, open, close } = useTermStore();
  const projects = useProjectStore((s) => s.projects);
  // Re-render when the studio on screen changes: its folders come first.
  useStudioStore((s) => s.active);
  const folders = projects.filter((p) => studioHasProject(currentStudio(), p.path));
  const current = tabs.find((t) => t.key === active) ?? null;

  useEffect(() => {
    void useTermStore.getState().loadPresets();
    void useProjectStore.getState().load();
    void useStudioStore.getState().load();
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-edge px-4 py-2">
        <label className="flex items-center gap-1.5 text-[12px] text-ink-faint">
          Folder
          <select className={FIELD} value={cwd ?? ""} onChange={(e) => setCwd(e.target.value || null)}>
            <option value="">Pick a folder…</option>
            {folders.map((p) => (
              <option key={p.path} value={p.path}>
                {p.name}
              </option>
            ))}
            {cwd && !folders.some((p) => p.path === cwd) && <option value={cwd}>{folderName(cwd)}</option>}
          </select>
        </label>
        <button type="button" className="btn" onClick={() => void pickPaths("folder")} title="Open a project folder (or drop one on the window)">
          <FolderOpen className="size-3.5" /> Open folder…
        </button>
        <span className="ml-2 text-[12px] text-ink-faint">New terminal</span>
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            className="btn"
            disabled={!cwd || !p.found}
            onClick={() => cwd && void open({ preset: p.id, cwd })}
            title={!p.found ? `${p.label} is not installed. ${p.hint}` : !cwd ? "Pick a folder first" : `Start ${p.label} in ${folderName(cwd)}${p.path ? ` (${p.path})` : ""}`}
          >
            <Plus className="size-3.5" /> {p.label}
          </button>
        ))}
      </div>

      {tabs.length > 0 && (
        <div className="flex items-stretch gap-1 overflow-x-auto border-b border-edge px-3 pt-1.5" role="tablist">
          {tabs.map((t) => (
            <div key={t.key} className={`flex shrink-0 items-center rounded-t-md border border-b-0 ${t.key === active ? "border-edge bg-canvas text-ink" : "border-transparent text-ink-muted hover:bg-tint/4"}`}>
              <button type="button" role="tab" aria-selected={t.key === active} className="flex max-w-[260px] items-center gap-2 py-1.5 pl-3 pr-1 text-[12px]" onClick={() => setActive(t.key)} title={`${tabTitle(t)}\n${t.cwd}${t.title ? `\n${t.title}` : ""}`}>
                <span className={`size-1.5 shrink-0 rounded-full ${t.state === "running" ? "bg-emerald" : t.state === "starting" ? "bg-amber" : "bg-ink-faint"}`} />
                <span className="truncate">{tabTitle(t)}</span>
                {t.state === "ended" && <span className="shrink-0 text-[10.5px] text-ink-faint">ended</span>}
              </button>
              <button type="button" className="mr-1 rounded p-1 text-ink-faint hover:bg-tint/8 hover:text-ink" onClick={() => close(t.key)} title={t.state === "ended" ? "Close this tab" : "End this terminal and close its tab"} aria-label={`Close ${tabTitle(t)}`}>
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative min-h-0 flex-1 bg-canvas">
        {current ? (
          <TermView key={current.key} termKey={current.key} className="absolute inset-0" />
        ) : (
          <EmptyState icon={<SquareTerminal className="size-5" />} title={cwd ? `No terminal open in ${folderName(cwd)}` : "Pick a folder first"}>
            {cwd
              ? "Start Claude Code, Codex, Gemini or the shell above. It is the CLI itself, as in a terminal window: sign in with /login, pick a session with /resume, use slash commands. Its session shows up in the office like any other."
              : "A terminal starts in a project folder. Pick one above, open one, or drop a folder on the window."}
          </EmptyState>
        )}
      </div>
    </div>
  );
}
