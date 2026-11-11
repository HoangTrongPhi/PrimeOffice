import { EmptyState, Modal, PillBadge } from "@abyss/ui";
import { Building2, ChevronRight, FolderOpen, LayoutGrid, Plus, Settings2, Trash2, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { handleHelpKey } from "../../hooks/useGlobalHotkeys";
import { pickPaths } from "../../lib/dialogs";
import { inTauri, ipc } from "../../lib/ipc";
import { kindOf, STUDIO_KINDS, studioHasProject } from "../../lib/studios";
import { errorText, uiLog } from "../../stores/appStore";
import { connectOfficeFrame } from "../../office/bridge/officeBridge";
import { useOfficeStore, useProjectStore, useStudioStore } from "../../stores/dataStore";
import { folderName, relTime, SessionView, StatusPill } from "../session/SessionView";

const WINDOWS = [15, 30, 60, 240, 1440];
export const CHARACTER_PACKS: { id: string; label: string }[] = [
  { id: "pixel", label: "PrimeOffice crew" },
  { id: "classic", label: "Classic (pixel-agents)" },
];

const FIELD = "h-7 rounded-md border border-edge bg-canvas/70 px-2 text-[12px] text-ink";

/** Replace a studio's saved office layout with a floor plan. */
async function loadFloorPlan(file: string, studio: string) {
  const layout = await fetch(`${import.meta.env.BASE_URL}assets/${file}`).then((r) => {
    if (!r.ok) throw new Error(`${file}: ${r.status}`);
    return r.json() as Promise<unknown>;
  });
  if (inTauri) await ipc.officeSend({ type: "saveLayout", layout, studio });
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

/**
 * The pixel office (an iframe running the vendored pixel-agents UI) with the agent list and detail.
 * The strip on top holds the studios: each one is a company with its own floor and project folders.
 */
export function OfficeTab() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const { project, windowMinutes, pack, agents, selectedId, setProject, setWindowMinutes, setPack, select, refreshAgents, applyFilter } = useOfficeStore();
  const projects = useProjectStore((s) => s.projects);
  const { studios, active, loaded } = useStudioStore();
  const [frameKey, setFrameKey] = useState(0);
  const [listOpen, setListOpen] = useState(true);
  const [floorOpen, setFloorOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newKind, setNewKind] = useState("video");
  const [newName, setNewName] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const studio = studios.find((s) => s.id === active) ?? studios[0] ?? null;
  const studioId = studio?.id ?? null;
  const planFile = studio ? kindOf(studio.kind).file : null;

  useEffect(() => {
    void useProjectStore.getState().load();
    // The office filter needs the studio's folders.
    void useStudioStore
      .getState()
      .load()
      .then(() => applyFilter());
  }, [applyFilter]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !studioId || !planFile) return;
    return connectOfficeFrame(
      frame,
      pack,
      { id: studioId, planFile },
      {
        onFocusAgent: (id) => {
          select(id);
          void refreshAgents();
        },
        onAgentsChanged: () => void refreshAgents(),
      },
    );
  }, [pack, frameKey, studioId, planFile, select, refreshAgents]);

  // F1 from inside the office: wire every document the frame loads (it may already be loaded).
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const wire = () => forwardHelpKey(frame);
    frame.addEventListener("load", wire);
    wire();
    return () => frame.removeEventListener("load", wire);
  }, [pack, frameKey, studioId]);

  // Labels, prompts and actions change every turn: keep the side list fresh.
  useEffect(() => {
    const t = setInterval(() => void refreshAgents(), 2000);
    return () => clearInterval(t);
  }, [refreshAgents]);

  const selected = agents.find((a) => a.id === selectedId) ?? null;
  const readyProjects = projects.filter((p) => p.ready && studioHasProject(studio, p.path));
  const store = useStudioStore.getState();

  const openEdit = () => {
    if (!studio) return;
    setEditName(studio.name);
    setConfirmDelete(false);
    setEditOpen(true);
  };
  const toggleFolder = (path: string) => {
    if (!studio) return;
    const has = studio.projects.some((p) => p.toLowerCase() === path.toLowerCase());
    void store.update(studio.id, { projects: has ? studio.projects.filter((p) => p.toLowerCase() !== path.toLowerCase()) : [...studio.projects, path] });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-end gap-1 border-b border-edge bg-panel/40 px-3 pt-2" role="tablist" aria-label="Studios">
        {studios.map((s) => {
          const on = s.id === studioId;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={on}
              title={`${s.name} — ${kindOf(s.kind).label}${s.projects.length ? `, ${s.projects.length} folder${s.projects.length === 1 ? "" : "s"}` : ", every project"}`}
              className={`-mb-px flex max-w-[200px] items-center gap-1.5 rounded-t-md border px-3 py-1.5 text-[12.5px] ${on ? "border-edge border-b-transparent bg-canvas font-medium text-ink" : "border-transparent text-ink-faint hover:text-ink"}`}
              onClick={() => void store.setActive(s.id)}
            >
              <Building2 className="size-3.5 shrink-0" />
              <span className="truncate">{s.name}</span>
            </button>
          );
        })}
        <button
          type="button"
          className="mb-1 ml-1 flex size-6 items-center justify-center rounded-md text-ink-faint hover:bg-tint/6 hover:text-ink"
          title="New studio: another company with its own floor and folders"
          aria-label="New studio"
          onClick={() => {
            setNewKind("video");
            setNewName("");
            setAddOpen(true);
          }}
        >
          <Plus className="size-4" />
        </button>
        <div className="flex-1" />
        <button type="button" className="btn mb-1" disabled={!studio} onClick={openEdit} title="This studio: name, folders, delete">
          <Settings2 className="size-3.5" /> Studio…
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-edge px-4 py-2">
        <label className="flex items-center gap-1.5 text-[12px] text-ink-faint">
          Project
          <select className={FIELD} value={project ?? ""} onChange={(e) => setProject(e.target.value || null)}>
            <option value="">{studio?.projects.length ? "All of this studio" : "All projects"}</option>
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
          <select className={FIELD} value={windowMinutes} onChange={(e) => setWindowMinutes(Number(e.target.value))}>
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
            className={FIELD}
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
        <button type="button" className="btn" disabled={!studio} onClick={() => setFloorOpen(true)} title="Floor plan: replace this studio's office with a plan">
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

      <Modal open={addOpen} title="New studio" onClose={() => setAddOpen(false)}>
        <form
          className="flex flex-col gap-3 p-4 text-[12.5px] text-ink-muted"
          onSubmit={(e) => {
            e.preventDefault();
            void store.add(newKind, newName).then((ok) => ok && setAddOpen(false));
          }}
        >
          <p>A studio is a company of its own: its floor, its departments and the project folders whose agents work there.</p>
          {STUDIO_KINDS.map((k) => (
            <label key={k.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${newKind === k.id ? "border-accent" : "border-edge"}`}>
              <input type="radio" name="studio-kind" className="mt-1" checked={newKind === k.id} onChange={() => setNewKind(k.id)} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-ink">{k.label}</span>
                <span className="mt-0.5 block">{k.text}</span>
              </span>
            </label>
          ))}
          <label className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-ink-faint">Name</span>
            <input className={`${FIELD} flex-1`} value={newName} maxLength={40} placeholder={kindOf(newKind).label} onChange={(e) => setNewName(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setAddOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create studio
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={editOpen && !!studio} title={studio ? `Studio — ${studio.name}` : "Studio"} onClose={() => setEditOpen(false)}>
        {studio && (
          <div className="flex flex-col gap-4 p-4 text-[12.5px] text-ink-muted">
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (editName.trim()) void store.update(studio.id, { name: editName });
              }}
            >
              <span className="w-12 shrink-0 text-ink-faint">Name</span>
              <input className={`${FIELD} flex-1`} value={editName} maxLength={40} onChange={(e) => setEditName(e.target.value)} />
              <button type="submit" className="btn" disabled={!editName.trim() || editName.trim() === studio.name}>
                Rename
              </button>
            </form>
            <div>
              <div className="text-[13px] font-medium text-ink">Folders</div>
              <p className="mt-0.5">
                Agents working in the ticked folders appear in this studio. {studio.projects.length === 0 ? "None ticked: it shows every project." : ""}
              </p>
              {projects.length === 0 ? (
                <p className="mt-2 text-ink-faint">No project folder opened yet — use Open folder… or the Projects tab first.</p>
              ) : (
                <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto">
                  {projects.map((p) => (
                    <li key={p.path}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 hover:bg-tint/4">
                        <input type="checkbox" checked={studio.projects.some((x) => x.toLowerCase() === p.path.toLowerCase())} onChange={() => toggleFolder(p.path)} />
                        <span className="text-ink">{p.name}</span>
                        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-faint">{p.path}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex items-center gap-2 border-t border-edge pt-3">
              <span className="flex-1">{kindOf(studio.kind).label}. Its floor is edited with the office's Layout button, or replaced with Floor plan….</span>
              {studios.length > 1 &&
                (confirmDelete ? (
                  <button
                    type="button"
                    className="btn text-danger"
                    onClick={() => {
                      setEditOpen(false);
                      void store.remove(studio.id);
                    }}
                  >
                    <Trash2 className="size-3.5" /> Delete it and its floor
                  </button>
                ) : (
                  <button type="button" className="btn" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="size-3.5" /> Delete studio…
                  </button>
                ))}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={floorOpen} title="Floor plan" onClose={() => setFloorOpen(false)}>
        <div className="flex flex-col gap-3 p-4 text-[12.5px] text-ink-muted">
          <p>
            Loading a floor plan replaces the office layout of <b className="text-ink">{studio?.name}</b> (furniture, floors, areas). Edit it afterwards with the office's Layout button.
          </p>
          {STUDIO_KINDS.map((f) => (
            <div key={f.id} className="flex items-start gap-3 rounded-lg border border-edge p-3">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-ink">{f.label}</div>
                <div className="mt-0.5">{f.text}</div>
              </div>
              <button
                type="button"
                className={f.id === studio?.kind ? "btn btn-primary" : "btn"}
                onClick={() => {
                  if (!studio) return;
                  setFloorOpen(false);
                  loadFloorPlan(f.file, studio.id)
                    .then(() => {
                      uiLog("info", `${studio.name} floor plan: ${f.label}`);
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
          {/* Mounted once the studios are known, so the frame boots with the right floor. */}
          {(loaded || !inTauri) && <iframe key={`${pack}-${studioId}-${frameKey}`} ref={frameRef} src="office.html" title="Office" className="absolute inset-0 size-full border-0" />}
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
                {project ? ` in ${folderName(project)}` : studio?.projects.length ? ` in the folders of ${studio.name}` : ""}. Start Claude Code or Codex (CLI, Desktop app or IDE) and its character walks in.
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
