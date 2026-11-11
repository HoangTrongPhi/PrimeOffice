import { Modal } from "@abyss/ui";
import { Briefcase, Cpu, Crown, FolderOpen, IdCard, Play, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { BRIEFING_FILE, firstMessage, ROLES, type Role } from "../../lib/briefing";
import { pickPaths } from "../../lib/dialogs";
import { inTauri, ipc } from "../../lib/ipc";
import { studioHasProject } from "../../lib/studios";
import { CHAT_MODELS, CHAT_MODES } from "../../stores/chatStore";
import { currentStudio, useOfficeStore, useProjectStore, useStudioStore } from "../../stores/dataStore";
import { agentName, folderKey, selectTerm, useOfficeUi } from "../../stores/officeUiStore";
import { useTermStore } from "../../stores/termStore";
import type { AgentSession } from "../../types/primeoffice";
import { folderName, relTime } from "../session/SessionView";
import { AvatarPicker } from "./AvatarPicker";

type Section = "identity" | "workspace" | "engine" | "briefing";
const SECTIONS: { id: Section; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "identity", label: "Identity", hint: "name · avatar", icon: IdCard },
  { id: "workspace", label: "Workspace", hint: "folder · resume", icon: FolderOpen },
  { id: "engine", label: "Engine", hint: "CLI · model · permissions", icon: Cpu },
  { id: "briefing", label: "Briefing", hint: "role · task", icon: Briefcase },
];

/** Starting points for the first task. */
const TEMPLATES: { label: string; text: string }[] = [
  { label: "Repo janitor", text: "Look through this repository for dead code, stale TODOs and warnings from the build. List what you find with file and line, then fix the safe ones and leave the rest as a list for me." },
  { label: "Docs writer", text: "Read the code and the existing docs. Find what is missing or out of date in the README and docs/, and update them so a new contributor can build, run and test the project." },
  { label: "Bug triager", text: "Run the tests and the build. For each failure, find the cause, say how sure you are, and propose the smallest fix. Do not change code before I agree." },
  { label: "Research", text: "Study how this project is put together (entry points, main modules, data flow) and write me a short map of it with the files to read first." },
  { label: "Release check", text: "Prepare a release: check the version numbers, the changelog against the commits since the last tag, and that the build and tests pass. Report what is missing." },
];

const FIELD = "h-8 rounded-md border border-edge bg-canvas/70 px-2 text-[12.5px] text-ink focus:border-accent focus:outline-none";
const MODEL_RE = /^[A-Za-z0-9._\-[\]]{1,64}$/;

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-relaxed text-ink-faint">{hint}</span>}
    </label>
  );
}

/**
 * Add agent: start a vendor CLI (or a shell) in a project folder as a real terminal, the way the
 * user would in a terminal window. Four sections, like a hire form: who, where, which engine, and
 * the first task.
 */
export function AddAgentModal() {
  const { addOpen, setAddOpen, names, bosses } = useOfficeUi();
  const presets = useTermStore((s) => s.presets);
  const projects = useProjectStore((s) => s.projects);
  useStudioStore((s) => s.active);
  const folders = projects.filter((p) => studioHasProject(currentStudio(), p.path));
  const [section, setSection] = useState<Section>("identity");
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [cwd, setCwd] = useState("");
  const [preset, setPreset] = useState("claude");
  const [model, setModel] = useState("");
  const [mode, setMode] = useState("");
  const [resume, setResume] = useState("");
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [task, setTask] = useState("");
  const [taskName, setTaskName] = useState("");
  const [role, setRole] = useState<Role>("boss");
  const [rolePicked, setRolePicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const bossId = cwd ? bosses[folderKey(cwd)] : undefined;
  const bossSession = useOfficeStore((s) => s.agents.find((a) => a.session.sessionId === bossId)?.session);
  const bossTerm = useTermStore((s) => s.tabs.find((t) => t.sessionId === bossId));
  const bossName = !bossId ? "" : bossSession ? agentName(bossSession, names, bossTerm) : names[bossId] || bossTerm?.name || "";

  // The first agent of a folder is its Boss; the ones after it are members (until the user picks).
  useEffect(() => {
    if (addOpen && !rolePicked) setRole(bossId ? "member" : "boss");
  }, [addOpen, rolePicked, bossId]);

  // A fresh form each time it opens; the first folder of the studio, the first installed CLI.
  useEffect(() => {
    if (!addOpen) return;
    void useTermStore.getState().loadPresets();
    setSection("identity");
    setName("");
    setAvatar("");
    setResume("");
    setTask("");
    setTaskName("");
    setRolePicked(false);
    setModel("");
    setMode("");
    setBusy(false);
    setCwd((c) => c || useTermStore.getState().cwd || folders[0]?.path || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addOpen]);
  useEffect(() => {
    const first = presets.find((p) => p.found);
    if (first && !presets.find((p) => p.id === preset)?.found) setPreset(first.id);
  }, [presets, preset]);

  // Claude Code sessions of the folder, to continue one.
  useEffect(() => {
    setSessions([]);
    setResume("");
    if (!addOpen || !inTauri || !cwd || preset !== "claude") return;
    let gone = false;
    ipc
      .listSessions({ project: cwd, provider: "claude", limit: 20 })
      .then((s) => !gone && setSessions(s))
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [addOpen, cwd, preset]);

  const info = presets.find((p) => p.id === preset);
  const claude = preset === "claude";
  const shell = preset === "shell";
  const modelOk = !model || MODEL_RE.test(model);
  const ready = !!cwd && !!info?.found && modelOk && !busy;

  // What will run, as the user would type it (the new session id is made when it starts).
  const command = [
    info?.path ? folderName(info.path).replace(/\.(exe|cmd)$/i, "") : preset,
    claude && resume ? `--resume ${resume.slice(0, 8)}…` : claude ? "--session-id <new>" : "",
    model && !shell ? `--model ${model}` : "",
    claude && mode ? `--permission-mode ${mode}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  // A shell is not an agent: it gets the task as written.
  const briefing = { role: shell ? ("solo" as Role) : role, name, bossName, taskName, task };
  const message = firstMessage(briefing);

  const start = async () => {
    if (!ready) return;
    setBusy(true);
    useTermStore.getState().setCwd(cwd);
    const terms = useTermStore.getState();
    const key = await terms.open({
      preset,
      cwd,
      name,
      resume: claude ? resume || null : null,
      newSession: claude && !resume,
      model: shell ? null : model || null,
      permissionMode: claude ? mode || null : null,
      firstTask: message,
    });
    // Kept by session, so the name, the task and the Boss role outlive the terminal tab.
    const sessionId = key !== null ? useTermStore.getState().tabs.find((t) => t.key === key)?.sessionId : null;
    if (sessionId) {
      const ui = useOfficeUi.getState();
      if (name.trim()) ui.setName(sessionId, name);
      if (avatar) ui.setAvatar(sessionId, avatar);
      if (taskName.trim()) ui.setTask(sessionId, taskName);
      if (briefing.role === "boss") ui.setBoss(cwd, sessionId);
    }
    setAddOpen(false);
    if (key !== null) selectTerm(key);
  };

  const at = SECTIONS.findIndex((s) => s.id === section);

  return (
    <Modal
      open={addOpen}
      title="Add agent"
      onClose={() => setAddOpen(false)}
      className="max-w-3xl"
      footer={
        <>
          <code className="mr-auto min-w-0 truncate self-center font-mono text-[11px] text-ink-faint" title="What runs in the terminal">
            {command}
          </code>
          {at < SECTIONS.length - 1 && (
            <button type="button" className="btn" onClick={() => setSection(SECTIONS[at + 1].id)}>
              Next
            </button>
          )}
          <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => void start()} title={!cwd ? "Pick a folder (Workspace)" : !info?.found ? `${info?.label ?? preset} is not installed` : !modelOk ? "The model name is not valid" : "Start it"}>
            <Play className="size-3.5" /> Start agent
          </button>
        </>
      }
    >
      <div className="flex min-h-[340px] gap-4">
        <nav className="flex w-44 shrink-0 flex-col gap-1">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const missing = (s.id === "workspace" && !cwd) || (s.id === "engine" && (!info?.found || !modelOk));
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className={`flex items-start gap-2 rounded-lg px-2.5 py-2 text-left ${s.id === section ? "bg-accent/12 text-ink" : "text-ink-muted hover:bg-tint/4"}`}
              >
                <Icon className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[12.5px] font-medium">
                    {s.label}
                    {missing && <span className="size-1.5 rounded-full bg-amber" title="Needs an answer" />}
                  </span>
                  <span className="block text-[11px] text-ink-faint">{s.hint}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-4 border-l border-edge pl-4">
          {section === "identity" && (
            <>
              <Row label="Name" hint="Shown on its card, in the Command Center and on its terminal tab. Empty: the session's own title, else the CLI and folder.">
                <input className={FIELD} value={name} maxLength={40} placeholder="e.g. Ada, Build fixer" autoFocus onChange={(e) => setName(e.target.value)} />
              </Row>
              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-ink">Avatar</span>
                <AvatarPicker
                  value={avatar}
                  onChange={(file, label) => {
                    setAvatar(file);
                    if (!name.trim() && label && file.startsWith("themes/")) setName(label);
                  }}
                />
                <span className="text-[11px] leading-relaxed text-ink-faint">How it looks in the office. Change it later from the agent's card. Its sub-agents keep the crew look.</span>
              </div>
            </>
          )}

          {section === "workspace" && (
            <>
              <Row label="Folder" hint="The agent works in this folder. Folders of the studio on screen come first.">
                <div className="flex gap-2">
                  <select className={`${FIELD} min-w-0 flex-1`} value={cwd} onChange={(e) => setCwd(e.target.value)}>
                    <option value="">Pick a folder…</option>
                    {folders.map((p) => (
                      <option key={p.path} value={p.path}>
                        {p.name} — {p.path}
                      </option>
                    ))}
                    {cwd && !folders.some((p) => p.path === cwd) && <option value={cwd}>{cwd}</option>}
                  </select>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      void pickPaths("folder").then((paths) => {
                        if (paths[0]) void useProjectStore.getState().open(paths[0]).then((r) => setCwd(r?.path ?? paths[0]));
                      })
                    }
                  >
                    <FolderOpen className="size-3.5" /> Open…
                  </button>
                </div>
              </Row>
              <Row label="Session" hint={claude ? "Continue one of the folder's Claude Code sessions (also ones from a terminal or Claude Desktop), or start a new one." : "Continuing a session by id is for Claude Code only."}>
                <select className={FIELD} value={resume} disabled={!claude} onChange={(e) => setResume(e.target.value)}>
                  <option value="">New session</option>
                  {sessions.map((s) => (
                    <option key={s.sessionId} value={s.sessionId}>
                      {s.title || "Untitled"} · {relTime(s.lastActivityAt, s.modifiedMs)}
                    </option>
                  ))}
                </select>
              </Row>
              <p className="text-[11px] text-ink-faint">Git isolation (its own worktree) is not there yet: the agent works in the folder itself.</p>
            </>
          )}

          {section === "engine" && (
            <>
              <Row label="CLI">
                <div className="grid grid-cols-2 gap-2">
                  {presets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={!p.found}
                      onClick={() => setPreset(p.id)}
                      title={p.found ? (p.path ?? "") : p.hint}
                      className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left disabled:opacity-50 ${p.id === preset ? "border-accent bg-accent/10" : "border-edge hover:bg-tint/4"}`}
                    >
                      <span className="text-[12.5px] font-medium text-ink">{p.label}</span>
                      <span className="truncate text-[10.5px] text-ink-faint">{p.found ? "Installed" : "Not installed"}</span>
                    </button>
                  ))}
                  {!presets.length && <span className="text-[12px] text-ink-faint">Looking for the CLIs…</span>}
                </div>
              </Row>
              {!shell &&
                (claude ? (
                  <Row label="Model">
                    <select className={FIELD} value={model} onChange={(e) => setModel(e.target.value)}>
                      {CHAT_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </Row>
                ) : (
                  <Row label="Model" hint={modelOk ? "Empty: the CLI's default model." : "Letters, digits and . _ - [ ] only."}>
                    <input className={`${FIELD} ${modelOk ? "" : "border-rose"}`} value={model} placeholder="CLI default" onChange={(e) => setModel(e.target.value.trim())} />
                  </Row>
                ))}
              {claude && (
                <Row label="Permissions" hint={mode === "bypassPermissions" ? "Full auto: any command, any file, no question. Only in a folder you can afford to lose." : "In a terminal the agent can ask you: Ask first shows each prompt there."}>
                  <select className={FIELD} value={mode} onChange={(e) => setMode(e.target.value)}>
                    <option value="">Claude Code's own setting</option>
                    {CHAT_MODES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </Row>
              )}
            </>
          )}

          {section === "briefing" && (
            <>
              {!shell && (
                <Row
                  label="Role"
                  hint={
                    role === "member" && !bossId
                      ? `This folder has no Boss yet: nobody keeps ${BRIEFING_FILE}. Add a Boss first, or pick Boss here.`
                      : role === "boss" && bossId
                        ? `This replaces ${bossName || "the current Boss"} as the Boss of the folder.`
                        : role === "boss" && !claude
                          ? "Only a Claude Code agent keeps the Boss label in the office; the briefing text is typed in all the same."
                          : (ROLES.find((r) => r.id === role)?.text ?? "")
                  }
                >
                  <div className="flex gap-1.5">
                    {ROLES.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        title={r.text}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] ${r.id === role ? "border-accent bg-accent/10 text-ink" : "border-edge text-ink-muted hover:bg-tint/4"}`}
                        onClick={() => {
                          setRole(r.id);
                          setRolePicked(true);
                        }}
                      >
                        {r.id === "boss" && <Crown className="size-3.5" />}
                        {r.label}
                      </button>
                    ))}
                  </div>
                </Row>
              )}
              <Row label="Task name (optional)" hint="Shown under the agent's name in the office, instead of the folder. Empty: the session's title.">
                <input className={FIELD} value={taskName} maxLength={60} placeholder="e.g. task001, Inventory UI" onChange={(e) => setTaskName(e.target.value)} />
              </Row>
              <Row label="Templates">
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATES.map((t) => (
                    <button key={t.label} type="button" className="btn" onClick={() => setTask(t.text)}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </Row>
              <Row label="First task (optional)" hint="Typed into the CLI once it has started, then Enter — as if you typed it. Empty: the agent waits for you in its terminal.">
                <textarea
                  className="min-h-[140px] resize-y rounded-md border border-edge bg-canvas/70 px-2.5 py-2 text-[12.5px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
                  value={task}
                  placeholder="What should it do first?"
                  onChange={(e) => setTask(e.target.value)}
                />
              </Row>
              {message && message !== task.trim() && (
                <Row label="What is typed in" hint="The role's text, the task name, then your first task — sent as one message.">
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-edge bg-canvas/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink-muted">{message}</pre>
                </Row>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
