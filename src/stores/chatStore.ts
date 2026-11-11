// The Chat tab: one conversation on screen, sent turn by turn to the Claude Code CLI (chat_cmd.rs).
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { applyChatDone, applyChatLine, emptyChat, type ChatView } from "../lib/chatEvents";
import { registerDropHandler } from "../lib/dropRouter";
import { inTauri, ipc, on } from "../lib/ipc";
import type { AgentSession, ChatCli, ChatEvent } from "../types/primeoffice";
import { errorText, uiLog } from "./appStore";
import { useProjectStore } from "./dataStore";

export const CHAT_MODELS: { id: string; label: string }[] = [
  { id: "", label: "Default model" },
  { id: "opus", label: "Opus" },
  { id: "sonnet", label: "Sonnet" },
  { id: "haiku", label: "Haiku" },
];

/** What the agent may do without asking. A chat turn cannot stop to ask: what is not allowed is refused. */
export const CHAT_MODES: { id: string; label: string; text: string }[] = [
  { id: "acceptEdits", label: "Edit files", text: "Reads and edits files in the folder. Commands run only when the project's Claude Code settings allow them." },
  { id: "plan", label: "Plan only", text: "Reads and proposes a plan; changes nothing." },
  { id: "manual", label: "Ask first", text: "Only what your Claude Code settings already allow; everything else is refused." },
  { id: "bypassPermissions", label: "Full auto", text: "No permission checks at all: any command, any file. Use only in a folder you can afford to lose." },
];

interface ChatState {
  /** Folder the agent works in. */
  cwd: string | null;
  model: string;
  mode: string;
  /** Claude Code sessions of `cwd`, newest first. */
  sessions: AgentSession[];
  loadingSessions: boolean;
  /** The conversation on screen. */
  view: ChatView;
  /** Title of the session on screen ("" for a new one). */
  title: string;
  /** The conversation of the session just opened is still being read. */
  loadingHistory: boolean;
  /** Chat id of the turn that is running, null when idle. */
  running: number | null;
  /** The running turn was stopped by the user. */
  stopping: boolean;
  cli: ChatCli | null;
  setCwd: (cwd: string | null) => void;
  setModel: (model: string) => void;
  setMode: (mode: string) => void;
  checkCli: () => Promise<void>;
  loadSessions: () => Promise<void>;
  newSession: () => void;
  /** Continue an existing session: its conversation is read from the transcript and shown. */
  openSession: (session: AgentSession) => void;
  send: (prompt: string) => Promise<void>;
  stop: () => Promise<void>;
  handle: (e: ChatEvent) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      cwd: null,
      model: "",
      mode: "acceptEdits",
      sessions: [],
      loadingSessions: false,
      view: emptyChat(),
      title: "",
      loadingHistory: false,
      running: null,
      stopping: false,
      cli: null,
      setCwd: (cwd) => {
        if (get().running !== null || cwd === get().cwd) return;
        set({ cwd, sessions: [], view: emptyChat(), title: "", loadingHistory: false });
        void get().loadSessions();
      },
      setModel: (model) => set({ model }),
      setMode: (mode) => set({ mode }),
      checkCli: async () => {
        if (!inTauri) return;
        try {
          set({ cli: await ipc.chatCli() });
        } catch (e) {
          uiLog("error", `Chat: ${errorText(e)}`);
        }
      },
      loadSessions: async () => {
        const { cwd } = get();
        if (!inTauri || !cwd) return;
        set({ loadingSessions: true });
        try {
          const sessions = await ipc.listSessions({ project: cwd, provider: "claude", limit: 40 });
          // The folder may have changed while this was loading.
          if (get().cwd === cwd) set({ sessions });
        } catch (e) {
          uiLog("error", `Chat sessions: ${errorText(e)}`);
        } finally {
          set({ loadingSessions: false });
        }
      },
      newSession: () => {
        if (get().running === null) set({ view: emptyChat(), title: "", loadingHistory: false });
      },
      openSession: (s) => {
        if (get().running !== null) return;
        const view = emptyChat();
        view.sessionId = s.sessionId;
        view.model = s.model;
        // The last exchange right away (the list already has it), then the whole conversation.
        if (s.lastPrompt) view.items.push({ kind: "user", text: s.lastPrompt });
        if (s.lastReply) view.items.push({ kind: "assistant", text: s.lastReply, streaming: false });
        set({ view, title: s.title, loadingHistory: true });
        // Still the session that was opened, and nothing was sent in the meantime.
        const current = () => get().view === view;
        void ipc
          .chatHistory(s.transcriptPath)
          .then((h) => {
            if (!current()) return;
            const items = h.truncated ? [{ kind: "notice" as const, tone: "info" as const, text: "This is the end of a long conversation; the agent has the whole of it." }, ...h.items] : h.items;
            set({ view: { ...view, items }, loadingHistory: false });
          })
          .catch((e) => {
            if (!current()) return;
            const note = { kind: "notice" as const, tone: "warn" as const, text: `Only the last exchange is shown (${errorText(e)}); the agent has the whole conversation.` };
            set({ view: { ...view, items: [note, ...view.items] }, loadingHistory: false });
          });
      },
      send: async (prompt) => {
        const { cwd, model, mode, view, running } = get();
        const text = prompt.trim();
        if (!inTauri || !cwd || !text || running !== null) return;
        set({ view: { ...view, items: [...view.items, { kind: "user", text }] }, title: get().title || text.slice(0, 60), stopping: false, loadingHistory: false });
        try {
          // A mode saved by an older version may no longer exist.
          const permissionMode = CHAT_MODES.some((m) => m.id === mode) ? mode : CHAT_MODES[0].id;
          const chatId = await ipc.chatSend({ cwd, prompt: text, sessionId: view.sessionId, model: model || null, permissionMode });
          set({ running: chatId });
        } catch (e) {
          const v = get().view;
          set({ view: { ...v, items: [...v.items, { kind: "notice", tone: "error", text: errorText(e) }] } });
        }
      },
      stop: async () => {
        const { running } = get();
        if (running === null) return;
        set({ stopping: true });
        await ipc.chatStop(running).catch((e) => uiLog("error", `Chat: ${errorText(e)}`));
      },
      handle: (e) => {
        const { running, view, stopping } = get();
        if (running === null || e.chatId !== running) return;
        if (e.done) {
          set({ view: applyChatDone(view, e.done, stopping), running: null, stopping: false });
          // A new session now has its transcript: show it in the list.
          void get().loadSessions();
        } else if (e.line !== undefined) {
          const next = applyChatLine(view, e.line);
          if (next !== view) set({ view: next });
        }
      },
    }),
    { name: "primeoffice.chat", partialize: (s) => ({ cwd: s.cwd, model: s.model, mode: s.mode }) },
  ),
);

// Turns keep running while another tab is on screen: listen for the whole life of the app.
if (inTauri) void on.chat((e) => useChatStore.getState().handle(e));

// A folder dropped on Chat: open it as a project and work there.
registerDropHandler("chat", (paths) => {
  const path = paths[0];
  if (!path) return;
  void useProjectStore
    .getState()
    .open(path)
    .then((report) => report && useChatStore.getState().setCwd(report.path));
});
