// Bridge between the PrimeOffice shell and the vendored pixel-agents office, which runs in an
// <iframe> (office.html) in its "VS Code webview" mode: office.html defines acquireVsCodeApi() so the
// office's PostMessageTransport talks to this window, and everything we post to the frame arrives
// as a pixel-agents ServerMessage. The office code itself is unchanged (src/office/VENDORED.md).

import { inTauri, ipc, on } from "../../lib/ipc";
import { errorText, uiLog } from "../../stores/appStore";
import type { OfficeMessage } from "../../types/primeoffice";
import { loadOfficeAssets, type OfficeAssets } from "./assets";

/** Envelope office.html wraps around the office's ClientMessages. */
export const CLIENT_TAG = "primeoffice-client";

const READING_TOOLS = ["Read", "Grep", "Glob", "WebFetch", "WebSearch"];
const SUBAGENT_TOOLS = ["Task", "Agent"];

const assetCache = new Map<string, Promise<OfficeAssets>>();
function assetsFor(pack: string) {
  let p = assetCache.get(pack);
  if (!p) {
    p = loadOfficeAssets(pack);
    p.catch(() => assetCache.delete(pack));
    assetCache.set(pack, p);
  }
  return p;
}

/** A studio kind's floor plan (public/assets), used until the studio has a saved layout. */
const planCache = new Map<string, Promise<unknown>>();
function floorPlan(file: string): Promise<unknown> {
  let p = planCache.get(file);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}assets/${file}`).then((r) => {
      if (!r.ok) throw new Error(`${file}: ${r.status}`);
      return r.json() as Promise<unknown>;
    });
    p.catch(() => planCache.delete(file));
    planCache.set(file, p);
  }
  return p;
}

/** The studio a frame shows: its id (layouts are saved per studio) and its kind's floor plan. */
export interface OfficeStudio {
  id: string;
  planFile: string;
}

export interface OfficeBridgeEvents {
  /** A character was clicked (pixel-agents' focusAgent). */
  onFocusAgent: (id: number) => void;
  /** Agents came or went: refresh the list. */
  onAgentsChanged: () => void;
}

/** Wire one office frame; returns the disconnect function. */
export function connectOfficeFrame(frame: HTMLIFrameElement, pack: string, studio: OfficeStudio, events: OfficeBridgeEvents): () => void {
  let booted = false;
  let disposed = false;
  const post = (m: unknown) => frame.contentWindow?.postMessage(m, "*");

  const unlisten = inTauri
    ? on.office((msgs) => {
        // Before the snapshot, live messages are covered by it (the office ignores repeats).
        if (!booted) return;
        msgs.forEach(post);
        if (msgs.some((m) => m.type === "agentCreated" || m.type === "agentClosed" || m.type === "agentStatus")) events.onAgentsChanged();
      })
    : null;

  async function boot() {
    booted = false;
    try {
      const [assets, snap] = await Promise.all([assetsFor(pack), inTauri ? ipc.officeSnapshot() : Promise.resolve(null)]);
      // No saved layout yet: the studio starts from its kind's floor plan.
      const layout = snap?.layout ?? (await floorPlan(studio.planFile).catch(() => assets.defaultLayout));
      if (disposed) return;
      post({ type: "providerCapabilities", readingTools: READING_TOOLS, subagentToolNames: SUBAGENT_TOOLS });
      if (snap) {
        post(snap.settings);
        post(snap.areaMappings);
      }
      assets.messages.forEach(post);
      post(snap?.existing ?? { type: "existingAgents", agents: [], agentMeta: {}, directoryNames: {}, externalAgents: {} });
      post({ type: "layoutLoaded", layout });
      snap?.activity.forEach(post);
      booted = true;
      events.onAgentsChanged();
    } catch (e) {
      uiLog("error", `Office failed to load: ${errorText(e)}`);
    }
  }

  const onMessage = (e: MessageEvent) => {
    if (e.source !== frame.contentWindow) return;
    const data = e.data as { tag?: string; message?: OfficeMessage } | null;
    if (!data || data.tag !== CLIENT_TAG || !data.message) return;
    const m = data.message;
    switch (m.type) {
      case "webviewReady":
        void boot();
        break;
      case "focusAgent":
        events.onFocusAgent(m.id as number);
        break;
      // Saved by the backend (office_cmd::office_send): the layout, the office's own settings,
      // seats and folder areas come back on the next load; × hides an agent until it works again.
      case "saveLayout":
        // Saved for the studio this frame shows, even if another one was opened meanwhile.
        if (inTauri) ipc.officeSend({ ...m, studio: studio.id }).catch((err) => uiLog("error", `Office: ${errorText(err)}`));
        break;
      case "exportLayout":
      case "importLayout":
      case "closeAgent":
      case "setSoundEnabled":
      case "setAlwaysShowLabels":
      case "setShowAreas":
      case "saveAreaMappings":
      case "saveAgentSeats":
        if (inTauri) ipc.officeSend(m).catch((err) => uiLog("error", `Office: ${errorText(err)}`));
        break;
      default:
        // Launching, terminals, hooks: PrimeOffice only observes.
        break;
    }
  };
  window.addEventListener("message", onMessage);

  return () => {
    disposed = true;
    window.removeEventListener("message", onMessage);
    void unlisten?.then((fn) => fn());
  };
}
