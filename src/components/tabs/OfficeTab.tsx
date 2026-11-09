import { EmptyState, Modal, PillBadge } from "@abyss/ui";
import { Building2, ChevronRight, FolderOpen, LayoutGrid, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { handleHelpKey } from "../../hooks/useGlobalHotkeys";
import { pickPaths } from "../../lib/dialogs";
import { inTauri, ipc } from "../../lib/ipc";
import { errorText, uiLog } from "../../stores/appStore";
import { connectOfficeFrame } from "../../office/bridge/officeBridge";
import { useOfficeStore, useProjectStore } from "../../stores/dataStore";
import { folderName, relTime, SessionView, StatusPill } from "../session/SessionView";

const WINDOWS = [15, 30, 60, 240, 1440];
export const CHARACTER_PACKS: { id: string; label: string }[] = [
  { id: "pixel", label: "PrimeOffice crew" },
  { id: "classic", label: "Classic (pixel-agents)" },
];

/** Floor plans that replace the office layout (public/assets). */
export const FLOOR_PLANS: { id: string; label: string; file: string; text: string }[] = [
  {
    id: "studio",
    label: "Game studio",
    file: "layouts/game-studio.json",
    text: "Directors, meeting room, Release & ops, Design, Studio head, Engineering, Narrative, Art, Audio, Engine lab, Loc & community, Lounge, QA. Sub-agents of a Claude Code Game Studios project (UEHF) take a desk in their department; main sessions sit at Studio head and rest in the Lounge when their turn is done.",
  },
  { id: "classic", label: "Classic office", file: "default-layout-1.json", text: "The small two-room office PrimeOffice starts with." },
];

/** Replace the saved office layout with a floor plan. */
async function loadFloorPlan(file: string) {
  const layout = await fetch(`${import.meta.env.BASE_URL}assets/${file}`).then((r) => {
    if (!r.ok) throw new Error(`${file}: ${r.status}`);
    return r.json() as Promise<unknown>;
  });
  if (inTauri) await ipc.officeSend({ type: "saveLayout", layout });
}

/** Office documents that already pass F1 on (each reload of the frame is a new document). */
const helpKeyDocs = new WeakSet<Document>();

/**
 * While the office frame has focus its own document gets the keys, so F1 would never reach the
 * shell's hotkey handler: listen in the frame too (same origin). Skips the frame's initial
 * about:blank and documents already wired.
 */
function forwardHelpKey(frame: HTMLIFrameElement) {
  try {
    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!win || !doc || doc.URL === "about:blank" || helpKeyDocs.has(doc)) return;
    helpKeyDocs.add(doc);
    win.addEventListener("keydown", (e) => void handleHelpKey(e));
  } catch {
    // Not reachable: F1 works again once focus is back in the shell.
  }
}

/** The pixel office (an iframe running the vendored pixel-agents UI) with the agent list and detail. */
export function OfficeTab() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const { project, windowMinutes, pack, agents, selectedId, setProject, setWindowMinutes, setPack, select, refreshAgents, applyFilter } = useOfficeStore();
  const projects = useProjectStore((s) => s.projects);
  const [frameKey, setFrameKey] = useState(0);
  const [listOpen, setListOpen] = useState(true);
  const [floorOpen, setFloorOpen] = useState(false);

  useEffect(() => {
    void useProjectStore.getState().load();
    void applyFilter();
  }, [applyFilter]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    return connectOfficeFrame(frame, pack, {
      onFocusAgent: (id) => {
        select(id);
        void refreshAgents();
      },
      onAgentsChanged: () => void refreshAgents(),
    });
  }, [pack, frameKey, select, refreshAgents]);

  // F1 from inside the office: wire every document the frame loads (it may already be loaded).
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const wire = () => forwardHelpKey(frame);
    frame.addEventListener("load", wire);
    wire();
    return () => frame.removeEventListener("load", wire);
  }, [pack, frameKey]);

  // Labels, prompts and actions change every turn: keep the side list fresh.
  useEffect(() => {
    const t = setInterval(() => void refreshAgents(), 2000);
    return () => clearInterval(t);
  }, [refreshAgents]);

  const selected = agents.find((a) => a.id === selectedId) ?? null;
  const readyProjects = projects.filter((p) => p.ready);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-edge px-4 py-2">
        <label className="flex items-center gap-1.5 text-[12px] text-ink-faint">
          Project
          <select className="h-7 rounded-md border border-edge bg-canvas/70 px-2 text-[12px] text-ink" value={project ?? ""} onChange={(e) => setProject(e.target.value || null)}>
            <option value="">All projects</option>
            {readyProjects.map((p) => (
              <option key={p.path} value={p.path}>
                {p.name}
              </option>
            ))}
            {project && !readyProjects.some((p) => p.path === project) && <option value={project}>{folderName(project)}</option>}
          </select>
        </label>
        <button type="button" className="btn" onClick={() => void pickPaths("folder")} title="Open a project folder (or drop one on the window)">
          <FolderOpen className="size-3.5" /> Open folder…
        </button>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-faint">
          Active in
          <select className="h-7 rounded-md border border-edge bg-canvas/70 px-2 text-[12px] text-ink" value={windowMinutes} onChange={(e) => setWindowMinutes(Number(e.target.value))}>
            {WINDOWS.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : m < 1440 ? `${m / 60} h` : "24 h"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-faint">
          Crew
          <select
            className="h-7 rounded-md border border-edge bg-canvas/70 px-2 text-[12px] text-ink"
            value={pack}
            onChange={(e) => {
              setPack(e.target.value);
              setFrameKey((k) => k + 1);
            }}
          >
            {CHARACTER_PACKS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" onClick={() => setFloorOpen(true)} title="Floor plan: load the game studio (departments) or the classic office">
          <LayoutGrid className="size-3.5" /> Floor plan…
        </button>
        <div className="flex-1" />
        <PillBadge tone={agents.length ? "accent" : "neutral"}>
          <Users className="size-3" /> {agents.length} agent{agents.length === 1 ? "" : "s"}
        </PillBadge>
        <button type="button" className="btn" onClick={() => setListOpen((o) => !o)} title="Agent list">
          <ChevronRight className={`size-3.5 transition-transform ${listOpen ? "" : "rotate-180"}`} />
        </button>
      </div>

      <Modal open={floorOpen} title="Floor plan" onClose={() => setFloorOpen(false)}>
        <div className="flex flex-col gap-3 p-4 text-[12.5px] text-ink-muted">
          <p>Loading a floor plan replaces the current office layout (furniture, floors, areas). Edit it afterwards with the office's Layout button.</p>
          {FLOOR_PLANS.map((f) => (
            <div key={f.id} className="flex items-start gap-3 rounded-lg border border-edge p-3">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-ink">{f.label}</div>
                <div className="mt-0.5">{f.text}</div>
              </div>
              <button
                type="button"
                className={f.id === "studio" ? "btn btn-primary" : "btn"}
                onClick={() => {
                  setFloorOpen(false);
                  loadFloorPlan(f.file)
                    .then(() => {
                      uiLog("info", `Office floor plan: ${f.label}`);
                      setFrameKey((k) => k + 1);
                    })
                    .catch((e) => uiLog("error", `Cannot load the floor plan: ${errorText(e)}`));
                }}
              >
                Load
              </button>
            </div>
          ))}
        </div>
      </Modal>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 bg-[#1e1e2e]">
          <iframe key={`${pack}-${frameKey}`} ref={frameRef} src="office.html" title="Office" className="absolute inset-0 size-full border-0" />
        </div>

        {listOpen && (
          <aside className="flex w-[340px] shrink-0 flex-col border-l border-edge bg-panel/60">
            {selected ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <button type="button" className="mb-3 flex items-center gap-1 text-[11.5px] text-ink-faint hover:text-ink" onClick={() => select(null)}>
                  <X className="size-3.5" /> Back to the list
                </button>
                <SessionView session={selected.session} maxActions={15} />
              </div>
            ) : agents.length === 0 ? (
              <EmptyState icon={<Building2 className="size-5" />} title="The office is quiet">
                No agent session changed in the last {windowMinutes < 60 ? `${windowMinutes} minutes` : `${windowMinutes / 60} hours`}
                {project ? ` in ${folderName(project)}` : ""}. Start Claude Code (CLI, Desktop app or IDE) and its character walks in.
              </EmptyState>
            ) : (
              <ul className="min-h-0 flex-1 divide-y divide-edge overflow-y-auto">
                {agents.map(({ id, session }) => (
                  <li key={id}>
                    <button type="button" className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-tint/4" onClick={() => select(id)}>
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{session.title || folderName(session.cwd)}</span>
                        <StatusPill status={session.status} />
                      </div>
                      <div className="truncate text-[11.5px] text-ink-muted">{session.openTools[0]?.label ?? session.actions.at(-1)?.label ?? "—"}</div>
                      <div className="flex gap-2 text-[10.5px] text-ink-faint">
                        <span>{folderName(session.cwd)}</span>
                        <span>·</span>
                        <span>{relTime(session.lastActivityAt, session.modifiedMs)}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
