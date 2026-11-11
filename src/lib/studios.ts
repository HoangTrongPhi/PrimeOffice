// Kinds of studio: what a new studio starts from. A studio is one company in the Office tab; its kind
// gives it a floor plan (public/assets/layouts, drawn by scripts/gen-studio-layout.py) whose Areas
// are the departments its sub-agents sit in (office/webview/src/office/engine/departments.ts).
// A new kind = a plan in the script, its departments, and one entry here.
import type { Studio } from "../types/primeoffice";

export interface StudioKind {
  id: string;
  label: string;
  /** Floor plan under public/assets. */
  file: string;
  text: string;
}

export const STUDIO_KINDS: StudioKind[] = [
  {
    id: "game",
    label: "Game studio",
    file: "layouts/game-studio.json",
    text: "Directors, meeting room, Release & ops, Design, Studio head, Engineering, Narrative, Art, Audio, Engine lab, Loc & community, Lounge, QA. Sub-agents of a Claude Code Game Studios project (UEHF) take a desk in their department; main sessions sit at Studio head and rest in the Lounge when their turn is done.",
  },
  {
    id: "video",
    label: "Video studio",
    file: "layouts/video-studio.json",
    text: "A YouTube / video production company: Ban sản xuất, meeting room, Publishing & SEO, Script room, Studio head, Editing bay, Motion & graphics, Lounge, Audio booth, Analytics. Sub-agents such as scriptwriter, video-editor or thumbnail-designer take a desk in their department.",
  },
  { id: "classic", label: "Classic office", file: "default-layout-1.json", text: "The small two-room office, without departments." },
];

/** The kind of a studio; the classic office for a kind this version does not know. */
export function kindOf(kind: string): StudioKind {
  return STUDIO_KINDS.find((k) => k.id === kind) ?? STUDIO_KINDS[STUDIO_KINDS.length - 1];
}

/** A free id for a new studio of `kind`: `video-1`, `video-2`, … */
export function newStudioId(kind: string, studios: Studio[]): string {
  const base = kind.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "studio";
  for (let n = 1; ; n++) {
    const id = `${base}-${n}`;
    if (!studios.some((s) => s.id === id)) return id;
  }
}

const samePath = (a: string, b: string) => a.replace(/[\\/]+$/, "").toLowerCase() === b.replace(/[\\/]+$/, "").toLowerCase();

/** Does `path` belong to the studio? A studio without folders takes every project. */
export function studioHasProject(studio: Studio | null | undefined, path: string): boolean {
  return !studio || studio.projects.length === 0 || studio.projects.some((p) => samePath(p, path));
}
