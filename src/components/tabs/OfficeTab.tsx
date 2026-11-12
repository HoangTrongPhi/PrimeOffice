import { Modal, PillBadge } from "@abyss/ui";
import { Building2, FolderOpen, LayoutGrid, PanelRightClose, PanelRightOpen, Plus, Settings2, Sparkles, Trash2, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { handleHelpKey } from "../../hooks/useGlobalHotkeys";
import { bossFor, nextPersonName, statusText } from "../../lib/team";
import { pickPaths } from "../../lib/dialogs";
import { inTauri } from "../../lib/ipc";
import { kindOf, planFileOf, projectBlocker, STUDIO_KINDS, studioHasProject, themeOf } from "../../lib/studios";
import { errorText, uiLog } from "../../stores/appStore";
import { connectOfficeFrame } from "../../office/bridge/officeBridge";
import { useOfficeStore, useProjectStore, useStudioStore } from "../../stores/dataStore";
import { agentName, agentTask, folderKey, isBoss, selectAgent, termOf, useOfficeUi } from "../../stores/officeUiStore";
import { useTermStore } from "../../stores/termStore";
import { AddAgentModal } from "../office/AddAgentModal";
import { AgentPanel, TermPanel } from "../office/AgentPanel";
import { AgentStrip } from "../office/AgentStrip";
import { CommandCenter } from "../office/CommandCenter";
import { loadFloorPlan, ThemeStudio } from "../office/ThemeStudio";
import { ThemeFx } from "../office/ThemeFx";
import { folderName } from "../session/SessionView";

const WINDOWS = [15, 30, 60, 240, 1440];
export const CHARACTER_PACKS: { id: string; label: string }[] = [
  { id: "pixel", label: "PrimeOffice crew" },
  { id: "classic", label: "Classic (pixel-agents)" },
];

const FIELD = "h-7 rounded-md border border-edge bg-canvas/70 px-2 text-[12px] text-ink";

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

/** The line between the office and the sidebar: drag it to size the sidebar. */
function Splitter() {
  const [dragging, setDragging] = useState(false);
  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Sidebar width"
        title="Drag to resize the sidebar; double-click for the default width"
        className={`w-1 shrink-0 cursor-col-resize transition-colors ${dragging ? "bg-accent" : "bg-edge hover:bg-accent/60"}`}
        onDoubleClick={() => useOfficeUi.getState().setSidebarWidth(420)}
        onPointerDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startW = useOfficeUi.getState().sidebarWidth;
          setDragging(true);
          const move = (ev: PointerEvent) => useOfficeUi.getState().setSidebarWidth(startW + (startX - ev.clientX));
          const up = () => {
            setDragging(false);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
      />
      {/* The office frame would swallow the pointer while dragging over it. */}
      {dragging && <div className="fixed inset-0 z-40 cursor-col-resize" />}
    </>
  );
}

/**
 * The pixel office (an iframe running the vendored pixel-agents UI), laid out as a control room: the
 * floor, a sidebar on the right (the selected agent, or the Command Center when none is) and the
 * roster under the floor with Add agent. The strip on top holds the studios: each one is a company
 * with its own floor and project folders.
 */
export function OfficeTab() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const labelsRef = useRef<Record<number, unknown> | null>(null);
  const { project, windowMinutes, pack, agents, selectedId, setProject, setWindowMinutes, setPack, select, refreshAgents, applyFilter } = useOfficeStore();
  const projects = useProjectStore((s) => s.projects);
  const { studios, active, loaded } = useStudioStore();
  const [frameKey, setFrameKey] = useState(0);
  const { sidebarOpen, sidebarWidth, term, setSidebarOpen, studioThemes, fx, setFx } = useOfficeUi();
  const tabs = useTermStore((s) => s.tabs);
  const [floorOpen, setFloorOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newKind, setNewKind] = useState("game");
  const [newTheme, setNewTheme] = useState(0);
  const [newName, setNewName] = useState("");
  const [newProject, setNewProject] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const studio = studios.find((s) => s.id === active) ?? studios[0] ?? null;
  const studioId = studio?.id ?? null;
  const planFile = studio ? planFileOf(studio.kind) : null;
  // The theme on screen (Theme Studio's last load) and its effect over the floor.
  const theme = studio ? themeOf(studio.kind, studioThemes[studio.id]) : null;

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
          selectAgent(id);
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
    const t = setInterval(() => {
      void refreshAgents();
      // Again on every tick: labels sent before the frame had its characters (a reload, a new
      // studio) were dropped, and the agent list may not change to send them again.
      if (labelsRef.current) frameRef.current?.contentWindow?.postMessage({ type: "agentLabels", labels: labelsRef.current }, "*");
    }, 2000);
    return () => clearInterval(t);
  }, [refreshAgents]);

  // The office labels its characters with what the shell knows: the agent's name, its task, the Boss.
  // Sent on every refresh (the frame ignores ids it has no character for yet).
  const { names, tasks, bosses, avatars } = useOfficeUi();
  // Every folder at work has a Boss: the pick while it is in the office, else the session its
  // transcript names Boss (started in a terminal, in Claude Desktop…), else the first agent that came
  // in — a new session in a folder with no other agent is its Boss, whichever client started it.
  // And every agent has a person's name: one with none gets the next free one (kept, editable).
  useEffect(() => {
    const sessions = agents.map((a) => a.session);
    const live = useTermStore
      .getState()
      .tabs.filter((t) => t.state !== "ended" && t.sessionId)
      .map((t) => t.sessionId as string);
    for (const { session } of agents) {
      if (!session.cwd) continue;
      const ui = useOfficeUi.getState();
      const picked = ui.bosses[folderKey(session.cwd)];
      const boss = bossFor(session.cwd, picked, sessions, live);
      if (boss && boss !== picked) ui.setBoss(session.cwd, boss);
    }
    for (const { session } of [...agents].sort((a, b) => a.id - b.id)) {
      const ui = useOfficeUi.getState();
      if (!session.sessionId || ui.names[session.sessionId] || session.person) continue;
      const used = agents.map((a) => ui.names[a.session.sessionId] || a.session.person || "").filter(Boolean);
      ui.setName(session.sessionId, nextPersonName(used));
    }
  }, [agents]);
  useEffect(() => {
    const labels: Record<number, { name: string; task: string; boss: boolean; avatar?: string; status: string }> = {};
    for (const { id, session } of agents) {
      const name = agentName(session, names, termOf(session, tabs));
      labels[id] = { name, task: agentTask(session, tasks, name), boss: isBoss(session, bosses), avatar: avatars[session.sessionId], status: statusText(session) };
    }
    labelsRef.current = labels;
    frameRef.current?.contentWindow?.postMessage({ type: "agentLabels", labels }, "*");
  }, [agents, names, tasks, bosses, avatars, tabs, frameKey, studioId, pack]);

  const selected = agents.find((a) => a.id === selectedId) ?? null;
  // A terminal card turns into its agent's card once its session has a character.
  const termTab = term !== null ? tabs.find((t) => t.key === term) : undefined;
  const termAgent = termTab?.sessionId ? agents.find((a) => a.session.sessionId === termTab.sessionId) : undefined;
  const shown = selected ?? termAgent ?? null;
  const readyProjects = projects.filter((p) => p.ready && studioHasProject(studio, p.path));
  const store = useStudioStore.getState();

  const openEdit = () => {
    if (!studio) return;
    setEditName(studio.name);
    setConfirmDelete(false);
    setEditOpen(true);
  };
  const hasClaude = (p: { checks: { code: string; passed: boolean }[] }) => p.checks.some((c) => c.code === "agent.settings" && c.passed);
  /** Opened projects with why each one cannot be this studio's project (null = it can). */
  const projectChoices = (except?: string) => projects.map((p) => ({ p, why: projectBlocker(p.path, hasClaude(p), studios, except) }));
  const createStudio = async () => {
    const id = await store.add(newKind, newName || folderName(newProject), newProject);
    if (!id) return;
    setAddOpen(false);
    const theme = kindOf(newKind).themes[newTheme];
    if (theme) useOfficeUi.getState().setStudioTheme(id, theme.id);
    if (newTheme > 0 && theme) {
      await loadFloorPlan(theme.file, id).catch((e) => uiLog("error", `Cannot load the theme: ${errorText(e)}`));
      setFrameKey((k) => k + 1);
    }
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
              title={`${s.name} — ${kindOf(s.kind).label}, ${s.projects[0] ? `project ${s.projects[0]}` : "no project chosen (every project)"}`}
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
          title="New studio: another company with its own floor, following one project"
          aria-label="New studio"
          onClick={() => {
            setNewKind("game");
            setNewTheme(0);
            setNewName("");
            setNewProject(projectChoices().find((c) => !c.why)?.p.path ?? "");
            setAddOpen(true);
          }}
        >
          <Plus className="size-4" />
        </button>
        <div className="flex-1" />
        <button type="button" className="btn mb-1" disabled={!studio} onClick={openEdit} title="This studio: name, project, delete">
          <Settings2 className="size-3.5" /> Studio…
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-edge px-4 py-2">
        <label className="flex items-center gap-1.5 text-[12px] text-ink-faint">
          Project
          <select className={FIELD} value={project ?? ""} onChange={(e) => setProject(e.target.value || null)}>
            <option value="">{studio?.projects.length ? `${folderName(studio.projects[0])} (this studio)` : "All projects"}</option>
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
        <button type="button" className="btn" disabled={!studio} onClick={() => setFloorOpen(true)} title="Theme Studio: change this studio's floor, add rooms from templates, keep rooms as templates">
          <LayoutGrid className="size-3.5" /> Theme Studio…
        </button>
        {theme?.fx && (
          <button type="button" className={fx ? "btn btn-primary" : "btn"} onClick={() => setFx(!fx)} title={`${theme.label} effects over the floor: ${fx ? "on" : "off"}`} aria-pressed={fx}>
            <Sparkles className="size-3.5" /> Effects
          </button>
        )}
        <div className="flex-1" />
        <PillBadge tone={agents.length ? "accent" : "neutral"}>
          <Users className="size-3" /> {agents.length} agent{agents.length === 1 ? "" : "s"}
        </PillBadge>
        <button type="button" className="btn" onClick={() => setSidebarOpen(!sidebarOpen)} title={sidebarOpen ? "Hide the sidebar" : "Show the sidebar (agent detail, Command Center)"}>
          {sidebarOpen ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
        </button>
      </div>

      <Modal open={addOpen} title="New studio" onClose={() => setAddOpen(false)} className="max-h-[calc(100vh-3rem)] max-w-xl">
        <form
          className="flex flex-col gap-3 text-[12.5px] text-ink-muted"
          onSubmit={(e) => {
            e.preventDefault();
            if (newProject) void createStudio();
          }}
        >
          <p>
            A studio is a company of its own: its floor and departments, following one Claude Code project — a folder with its own <code>.claude</code>. A folder can be the project of one studio only.
          </p>
          <div>
            <div className="text-[13px] font-medium text-ink">Project</div>
            {projects.length === 0 ? (
              <p className="mt-1 text-ink-faint">No project folder opened yet: open one first.</p>
            ) : (
              <ul className="mt-1.5 flex max-h-44 flex-col gap-1 overflow-y-auto">
                {projectChoices().map(({ p, why }) => (
                  <li key={p.path}>
                    <label className={`flex items-center gap-2 rounded-md border px-2 py-1 ${why ? "cursor-not-allowed border-transparent opacity-55" : newProject === p.path ? "cursor-pointer border-accent" : "cursor-pointer border-transparent hover:bg-tint/4"}`}>
                      <input type="radio" name="studio-project" disabled={!!why} checked={newProject === p.path} onChange={() => setNewProject(p.path)} />
                      <span className="text-ink">{p.name}</span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-ink-faint">{p.path}</span>
                      <span className={`shrink-0 text-[11px] ${why ? "text-danger" : "text-ink-faint"}`}>{why ?? ".claude ✓"}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="btn mt-1.5" onClick={() => void pickPaths("folder")} title="Open a project folder (or drop one on the window)">
              <FolderOpen className="size-3.5" /> Open folder…
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-[13px] font-medium text-ink">Kind and theme</div>
            {STUDIO_KINDS.map((k) => (
              <div key={k.id} className={`rounded-lg border p-3 ${newKind === k.id ? "border-accent" : "border-edge"}`}>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="radio"
                    name="studio-kind"
                    className="mt-1"
                    checked={newKind === k.id}
                    onChange={() => {
                      setNewKind(k.id);
                      setNewTheme(0);
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-ink">{k.label}</span>
                    <span className="mt-0.5 block">{k.text}</span>
                  </span>
                </label>
                {newKind === k.id && k.themes.length > 1 && (
                  <div className="mt-2 ml-7 flex flex-wrap gap-3">
                    {k.themes.map((t, i) => (
                      <label key={t.id} className="flex cursor-pointer items-center gap-1.5" title={t.text}>
                        <input type="radio" name="studio-theme" checked={newTheme === i} onChange={() => setNewTheme(i)} />
                        <span className="text-ink">{t.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <label className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-ink-faint">Name</span>
            <input className={`${FIELD} flex-1`} value={newName} maxLength={40} placeholder={newProject ? folderName(newProject) : kindOf(newKind).label} onChange={(e) => setNewName(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setAddOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!newProject} title={newProject ? "" : "Choose the studio's project first"}>
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
              <div className="text-[13px] font-medium text-ink">Project</div>
              <p className="mt-0.5">
                {studio.projects[0] ? (
                  <>
                    Agents of <b className="text-ink">{studio.projects[0]}</b> work in this studio.
                  </>
                ) : (
                  "No project chosen: this studio (made before 0.4) shows every project. Choose its project:"
                )}
              </p>
              <select
                className={`${FIELD} mt-2 w-full`}
                value={studio.projects[0] ?? ""}
                onChange={(e) => e.target.value && void store.update(studio.id, { projects: [e.target.value] })}
                aria-label="Project of this studio"
              >
                {!studio.projects[0] && <option value="">Choose a project…</option>}
                {projectChoices(studio.id).map(({ p, why }) => (
                  <option key={p.path} value={p.path} disabled={!!why}>
                    {p.name} — {p.path}
                    {why ? ` (${why})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 border-t border-edge pt-3">
              <span className="flex-1">{kindOf(studio.kind).label}. Arrange its floor with the office's Layout button; change the theme or add rooms with Theme Studio….</span>
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

      <ThemeStudio open={floorOpen} studio={studio} onClose={() => setFloorOpen(false)} onChanged={() => setFrameKey((k) => k + 1)} />

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 bg-[#1e1e2e]">
          {/* Mounted once the studios are known, so the frame boots with the right floor. */}
          {(loaded || !inTauri) && <iframe key={`${pack}-${studioId}-${frameKey}`} ref={frameRef} src="office.html" title="Office" className="absolute inset-0 size-full border-0" />}
          <ThemeFx kind={fx ? theme?.fx : null} />
        </div>

        {sidebarOpen && (
          <>
            <Splitter />
            <aside className="flex shrink-0 flex-col bg-panel/60" style={{ width: sidebarWidth }}>
              {shown ? <AgentPanel key={shown.id} agent={shown} /> : termTab ? <TermPanel key={termTab.key} tab={termTab} /> : <CommandCenter />}
            </aside>
          </>
        )}
      </div>

      <AgentStrip />
      <AddAgentModal />
    </div>
  );
}
