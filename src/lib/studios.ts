// Kinds of studio: what a new studio starts from. A studio is one company in the Office tab; its kind
// gives it floor plans to choose from in Theme Studio (public/assets/layouts, drawn by
// scripts/gen-studio-layout.py) whose Areas
// are the departments its sub-agents sit in (office/webview/src/office/engine/departments.ts).
// A new kind = a plan in the script, its departments, and one entry here.
import type { Studio } from "../types/primeoffice";

/** One floor plan of a kind: Theme Studio loads it into the studio's office. */
export interface StudioTheme {
  id: string;
  label: string;
  /** Floor plan under public/assets. */
  file: string;
  text: string;
  /** Theme Studio heading the theme is listed under (Standard when absent). */
  group?: string;
  /** Effect played over the floor while the theme is on (src/components/office/ThemeFx.tsx). */
  fx?: ThemeFxKind;
}

export type ThemeFxKind = "snow" | "spooky" | "petals" | "neon" | "code" | "bubbles" | "justice" | "cave";

export interface StudioKind {
  id: string;
  label: string;
  text: string;
  /** Floor plans to choose from in Theme Studio; the first one is what a new studio starts with. */
  themes: StudioTheme[];
}

/**
 * Special themes of the Game studio: Campus or Open Floor room for room (same departments, seats, Pantry,
 * Ban giám đốc), dressed for an occasion or a style, with an effect over the floor.
 * Drawn by scripts/gen-studio-layout.py (SPECIAL) with scripts/gen-theme-furniture.py.
 */
const SPECIAL_THEMES: StudioTheme[] = [
  { id: "christmas", group: "Lễ hội", label: "Christmas", file: "layouts/game-christmas.json", fx: "snow", text: "Campus in snow: Christmas trees, gifts, a snowman, wreaths and string lights. Snow falls over the floor." },
  { id: "halloween", group: "Lễ hội", label: "Halloween", file: "layouts/game-halloween.json", fx: "spooky", text: "Campus at night: jack-o'-lanterns, a cauldron, gravestones, cobwebs. Bats and fog drift by." },
  { id: "tet", group: "Lễ hội", label: "Tết", file: "layouts/game-tet.json", fx: "petals", text: "Open Floor in red and gold: hoa đào, cây quất, bánh chưng, câu đối and lanterns. Peach petals fall, fireworks now and then." },
  { id: "cyberpunk", group: "Phong cách", label: "Cyberpunk", file: "layouts/game-cyberpunk.json", fx: "neon", text: "Open Floor in neon: holo terminals, neon palms, data pillars and signs. Neon rain and a flicker." },
  { id: "matrix", group: "Phong cách", label: "Matrix", file: "layouts/game-matrix.json", fx: "code", text: "Campus in the dark green of a terminal: CRT stacks, old phones, code screens. Code rain over the floor." },
  { id: "aquarium", group: "Phong cách", label: "Aquarium", file: "layouts/game-aquarium.json", fx: "bubbles", text: "Open Floor under the sea: fish tanks, coral, seaweed, a treasure chest, portholes. Bubbles and light ripples." },
  { id: "hall-of-justice", group: "DC", label: "Hall of Justice", file: "layouts/dc-hall-of-justice.json", fx: "justice", text: "A map of its own, after the Super Friends' hall and the comics: the Great Hall with the founders in marble around their fountain, the Round Table under the alert monitor, the Teleporter Bay, and a wing per legacy — Themyscira (lasso, shield), Cyborg's Lab (Mother Box), the Speed Lab (cosmic treadmill, winged helmet), the Rock of Eternity, Atlantis (trident), the Lantern Corps (power battery), the Hall of Heroes, the Trophy Room with Starro. Light glints in the halls." },
  { id: "batcave", group: "DC", label: "BatCave", file: "layouts/dc-batcave.json", fx: "cave", text: "A map of its own, after the films, the comics and the animated series: the cave computer with its giant screen over Gotham and the feeds beside it, the Armory of suit tubes (Batman, Robin, Nightwing, Batgirl, Batwoman, Red Hood, Jason's memorial suit, the heavy armour), the Trophy Hall (T-rex, penny, Joker card, Alfred's tea), the garage (car on its turntable, armoured car, cycle, jet), the rooms of Nightwing, Robin and Oracle, the Forensics Lab, Case Files, Comms, the Training Ground and the waterfall. Bats and drips." },
];

export const STUDIO_KINDS: StudioKind[] = [
  {
    id: "game",
    label: "Game studio",
    text: "Ban giám đốc, Phòng họp, Studio head, Pantry and a room per department (Design, Engineering, Engine lab, Art, Audio, Narrative, QA, Release & ops, Loc & community). Sub-agents of a Claude Code Game Studios project take a desk in their department; directors stay in Ban giám đốc.",
    themes: [
      {
        id: "campus",
        label: "Campus",
        file: "layouts/game-campus.json",
        text: "A room per department with walls and doors. Pantry sits under Studio head, Phòng họp next to Ban giám đốc.",
      },
      {
        id: "open",
        label: "Open Floor",
        file: "layouts/game-open.json",
        text: "An executive wing with walls (Ban giám đốc, Phòng họp, Studio head, Loc & community) beside one open floor where departments are areas without walls; Pantry in the middle.",
      },
      ...SPECIAL_THEMES,
    ],
  },
  {
    id: "video",
    label: "Video studio",
    text: "A YouTube / video production company: Ban sản xuất, meeting room, Publishing & SEO, Script room, Studio head, Editing bay, Motion & graphics, Lounge, Audio booth, Analytics. Sub-agents such as scriptwriter, video-editor or thumbnail-designer take a desk in their department.",
    themes: [{ id: "default", label: "Video studio", file: "layouts/video-studio.json", text: "The video studio floor, as it was." }],
  },
  {
    id: "classic",
    label: "Classic office",
    text: "The small two-room office, without departments.",
    themes: [{ id: "default", label: "Classic office", file: "default-layout-1.json", text: "The small two-room office, as it was." }],
  },
];

/** The kind of a studio; the classic office for a kind this version does not know. */
export function kindOf(kind: string): StudioKind {
  return STUDIO_KINDS.find((k) => k.id === kind) ?? STUDIO_KINDS[STUDIO_KINDS.length - 1];
}

/** The floor plan a studio of this kind starts with (its first theme). */
export function planFileOf(kind: string): string {
  return kindOf(kind).themes[0].file;
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

/** Does `path` belong to the studio? A studio without a project (one made before 0.4) takes every project. */
export function studioHasProject(studio: Studio | null | undefined, path: string): boolean {
  return !studio || studio.projects.length === 0 || studio.projects.some((p) => samePath(p, path));
}

/**
 * Why `path` cannot be the project of a new studio, or null when it can: it needs its own `.claude`
 * folder (Claude Code settings, agents, skills) and may belong to one studio only. `hasClaude` comes
 * from the project check (`agent.settings`).
 */
export function projectBlocker(path: string, hasClaude: boolean, studios: Studio[], except?: string): string | null {
  if (!hasClaude) return "no .claude folder";
  const owner = studios.find((s) => s.id !== except && s.projects.some((p) => samePath(p, path)));
  return owner ? `already the project of ${owner.name}` : null;
}

/** The theme a studio has on (Theme Studio's last load), else its kind's first theme. */
export function themeOf(kind: string, themeId: string | undefined): StudioTheme {
  const k = kindOf(kind);
  return k.themes.find((t) => t.id === themeId) ?? k.themes[0];
}
