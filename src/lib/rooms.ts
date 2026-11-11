// Room templates: rooms Theme Studio adds into a studio's office layout, and rooms of a layout saved
// as templates of the user's own. The bundled ones are drawn by scripts/gen-studio-layout.py
// (public/assets/rooms/room-templates.json); the user's are kept in the office prefs
// (`roomTemplates`, docs/FORMATS.md). Pure functions over the pixel-agents layout JSON, no imports,
// testable with node (scripts/tests/rooms.test.ts).

/** Tile values of the layout grid (pixel-agents `TileType`). */
export const WALL = 0;
export const VOID = 255;
/** The office grid's limit (pixel-agents `MAX_COLS` / `MAX_ROWS`). */
export const MAX_SIZE = 64;
const WALL_COLOR = { h: 214, s: 30, b: -100, c: -55 };

export type TileColor = Record<string, number> | null;

export interface LayoutFurniture {
  uid: string;
  type: string;
  col: number;
  row: number;
  [key: string]: unknown;
}

/** The parts of a pixel-agents `OfficeLayout` a room touches; everything else is kept as it is. */
export interface RoomLayout {
  cols: number;
  rows: number;
  tiles: number[];
  tileColors?: TileColor[];
  furniture: LayoutFurniture[];
  areas?: { label: string; color: string }[];
  areaTiles?: (string | null)[];
  [key: string]: unknown;
}

export interface RoomTemplate {
  id: string;
  label: string;
  /** dept | directors | meeting | pantry | head | custom — what the room is for (shown, not enforced). */
  zone: string;
  /** Floor size in tiles (the walls around it come on top). */
  w: number;
  h: number;
  /** Floor tile (pattern) and its colour. */
  floor: number;
  floorColor: TileColor;
  /** Colour of the room's Area; null = no Area (Studio head: seats for main sessions). */
  areaColor: string | null;
  seats: number;
  /** Relative to the top-left floor tile; wall decor has negative rows (it hangs on the wall above). */
  furniture: { type: string; col: number; row: number }[];
  /** A template the user saved (not bundled). */
  mine?: boolean;
}

/** What a room needs to know about a furniture type (from furniture-catalog.json). */
export interface Footprint {
  w: number;
  h: number;
  /** Top rows a character can walk behind. */
  bg: number;
  wall: boolean;
  surface: boolean;
  chair: boolean;
}

export type Catalog = Record<string, Footprint>;

/** The catalog's entries as footprints, by id. */
export function footprints(entries: { id: string; footprintW: number; footprintH: number; backgroundTiles?: number; category?: string; canPlaceOnWalls?: boolean; canPlaceOnSurfaces?: boolean }[]): Catalog {
  const out: Catalog = {};
  for (const e of entries) {
    out[e.id] = {
      w: e.footprintW,
      h: e.footprintH,
      bg: e.backgroundTiles ?? 0,
      wall: e.category === "wall" || (e.canPlaceOnWalls === true && e.category !== "decor"),
      surface: e.canPlaceOnSurfaces === true && e.category !== "wall",
      chair: e.category === "chairs",
    };
  }
  return out;
}

const fpOf = (catalog: Catalog, type: string): Footprint | undefined => catalog[type.split(":")[0]];
const isFloor = (t: number | undefined) => t !== undefined && t !== WALL && t !== VOID;

/** A grown copy of the layout (new tiles are void), the old content at the same place. */
export function resized(layout: RoomLayout, cols: number, rows: number): RoomLayout {
  const n = cols * rows;
  const tiles = new Array<number>(n).fill(VOID);
  const colors = new Array<TileColor>(n).fill(null);
  const area = new Array<string | null>(n).fill(null);
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      const from = r * layout.cols + c;
      const to = r * cols + c;
      tiles[to] = layout.tiles[from];
      colors[to] = layout.tileColors?.[from] ?? null;
      area[to] = layout.areaTiles?.[from] ?? null;
    }
  }
  return { ...layout, cols, rows, tiles, tileColors: colors, areaTiles: area, furniture: [...layout.furniture], areas: [...(layout.areas ?? [])] };
}

/** Every tile a piece covers (its background rows too). */
function cellsOf(f: { type: string; col: number; row: number }, catalog: Catalog): [number, number][] {
  const fp = fpOf(catalog, f.type) ?? { w: 1, h: 1 };
  const out: [number, number][] = [];
  for (let dr = 0; dr < fp.h; dr++) for (let dc = 0; dc < fp.w; dc++) out.push([f.col + dc, f.row + dr]);
  return out;
}

interface Spot {
  col: number;
  row: number;
  /** Doorway tiles in the room's wall. */
  door: [number, number][];
}

/**
 * Where a room of w × h floor tiles fits: the room and its wall ring cover only wall or void and no
 * furniture, and one side of the ring has a wall tile with floor right behind it (the doorway; two
 * tiles wide when it can be). Top-left first. (col, row) is the wall ring's top-left corner.
 */
export function findSpot(layout: RoomLayout, w: number, h: number, catalog: Catalog): Spot | null {
  const { cols, rows, tiles } = layout;
  const taken = new Set<string>();
  for (const f of layout.furniture) for (const [c, r] of cellsOf(f, catalog)) taken.add(`${c},${r}`);
  const W = w + 2;
  const H = h + 2;
  const tile = (c: number, r: number) => (c < 0 || r < 0 || c >= cols || r >= rows ? undefined : tiles[r * cols + c]);
  for (let y = 0; y + H <= rows; y++) {
    for (let x = 0; x + W <= cols; x++) {
      let ok = true;
      for (let r = y; r < y + H && ok; r++) {
        for (let c = x; c < x + W; c++) {
          if (isFloor(tile(c, r)) || taken.has(`${c},${r}`)) {
            ok = false;
            break;
          }
        }
      }
      if (!ok) continue;
      // Doorway candidates: ring tiles (no corners) with floor outside and free of furniture.
      const sides: [number, number, number, number][][] = [[], [], [], []];
      for (let c = x + 1; c < x + W - 1; c++) {
        sides[0].push([c, y, c, y - 1]);
        sides[1].push([c, y + H - 1, c, y + H]);
      }
      for (let r = y + 1; r < y + H - 1; r++) {
        sides[2].push([x, r, x - 1, r]);
        sides[3].push([x + W - 1, r, x + W, r]);
      }
      let door: [number, number][] | null = null;
      for (const side of sides) {
        const good = side.filter(([, , oc, or]) => isFloor(tile(oc, or)) && !taken.has(`${oc},${or}`));
        for (let i = 0; i + 1 < good.length && !door; i++) {
          const [a, b] = [good[i], good[i + 1]];
          if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1) door = [[a[0], a[1]], [b[0], b[1]]];
        }
        if (door) break;
      }
      if (!door) {
        const single = sides.flat().find(([, , oc, or]) => isFloor(tile(oc, or)) && !taken.has(`${oc},${or}`));
        if (single) door = [[single[0], single[1]]];
      }
      if (door) return { col: x, row: y, door };
    }
  }
  return null;
}

/** An Area label not used yet: `name`, else `name 2`, `name 3`, … */
export function freeLabel(layout: RoomLayout, name: string): string {
  const used = new Set((layout.areas ?? []).map((a) => a.label.toLowerCase()));
  const base = name.trim() || "Room";
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!used.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

export type StampResult = { layout: RoomLayout; col: number; row: number; label: string | null; grew: boolean } | { error: string };

/**
 * Add a room from a template, named `name` (its Area label), into a copy of the layout: in the first
 * spot that fits, else on new rows under the floor, else on new columns to its right (up to 64 × 64).
 * The room gets walls, its floor, a doorway to the floor next to it and the template's furniture;
 * wall decor is left out where the wall above is not free.
 */
export function stampRoom(layout: RoomLayout, tpl: RoomTemplate, name: string, catalog: Catalog, uidPrefix = `room-${Date.now().toString(36)}`): StampResult {
  let base = resized(layout, layout.cols, layout.rows);
  let spot = findSpot(base, tpl.w, tpl.h, catalog);
  let grew = false;
  // Below the floor: the room shares the bottom wall row; then to the right, sharing the last column.
  if (!spot && layout.rows + tpl.h + 1 <= MAX_SIZE) {
    const grown = resized(layout, layout.cols, layout.rows + tpl.h + 1);
    spot = findSpot(grown, tpl.w, tpl.h, catalog);
    if (spot) [base, grew] = [grown, true];
  }
  if (!spot && layout.cols + tpl.w + 1 <= MAX_SIZE) {
    const grown = resized(layout, layout.cols + tpl.w + 1, layout.rows);
    spot = findSpot(grown, tpl.w, tpl.h, catalog);
    if (spot) [base, grew] = [grown, true];
  }
  if (!spot) return { error: `No room left for ${tpl.w}×${tpl.h} (the office is at most ${MAX_SIZE}×${MAX_SIZE} tiles). Make space with the Layout editor or pick a smaller room.` };

  const out = base;
  const { cols } = out;
  const tiles = out.tiles;
  const colors = out.tileColors!;
  const areaTiles = out.areaTiles!;
  const label = tpl.areaColor ? freeLabel(out, name || tpl.label) : null;
  const at = (c: number, r: number) => r * cols + c;
  // Wall ring (void becomes wall; existing walls stay), floor, doorway.
  for (let r = spot.row; r < spot.row + tpl.h + 2; r++) {
    for (let c = spot.col; c < spot.col + tpl.w + 2; c++) {
      const i = at(c, r);
      const inside = r > spot.row && r < spot.row + tpl.h + 1 && c > spot.col && c < spot.col + tpl.w + 1;
      if (inside) {
        tiles[i] = tpl.floor;
        colors[i] = tpl.floorColor;
        areaTiles[i] = label;
      } else if (tiles[i] === VOID) {
        tiles[i] = WALL;
        colors[i] = WALL_COLOR;
      }
    }
  }
  for (const [c, r] of spot.door) {
    tiles[at(c, r)] = tpl.floor;
    colors[at(c, r)] = tpl.floorColor;
    areaTiles[at(c, r)] = null;
  }
  if (label) out.areas = [...(out.areas ?? []), { label, color: tpl.areaColor! }];

  // Furniture: floor pieces inside the room; wall decor only where the wall above is free.
  const taken = new Set<string>();
  for (const f of out.furniture) for (const [c, r] of cellsOf(f, catalog)) taken.add(`${c},${r}`);
  const doorSet = new Set(spot.door.map(([c, r]) => `${c},${r}`));
  const x0 = spot.col + 1;
  const y0 = spot.row + 1;
  let n = 0;
  for (const f of tpl.furniture) {
    const fp = fpOf(catalog, f.type);
    if (!fp) continue;
    const placed = { uid: `${uidPrefix}-${++n}`, type: f.type, col: x0 + f.col, row: y0 + f.row };
    const cells = cellsOf(placed, catalog);
    if (fp.wall) {
      const fits = cells.every(([c, r]) => r >= 0 && c >= 0 && c < cols && !isFloor(tiles[at(c, r)]) && !taken.has(`${c},${r}`) && !doorSet.has(`${c},${r}`));
      if (!fits) continue;
    } else if (!fp.surface && cells.some(([c, r]) => taken.has(`${c},${r}`))) {
      continue;
    }
    if (!fp.surface) for (const [c, r] of cells) taken.add(`${c},${r}`);
    out.furniture.push(placed);
  }
  return { layout: out, col: spot.col, row: spot.row, label, grew };
}

/** Areas of a layout with the size of the box around each one (for "save as template"). */
export function areaBoxes(layout: RoomLayout): { label: string; col: number; row: number; w: number; h: number }[] {
  const boxes = new Map<string, { c0: number; r0: number; c1: number; r1: number }>();
  (layout.areaTiles ?? []).forEach((label, i) => {
    if (!label) return;
    const c = i % layout.cols;
    const r = Math.floor(i / layout.cols);
    const b = boxes.get(label);
    if (!b) boxes.set(label, { c0: c, r0: r, c1: c, r1: r });
    else Object.assign(b, { c0: Math.min(b.c0, c), r0: Math.min(b.r0, r), c1: Math.max(b.c1, c), r1: Math.max(b.r1, r) });
  });
  return [...boxes].map(([label, b]) => ({ label, col: b.c0, row: b.r0, w: b.c1 - b.c0 + 1, h: b.r1 - b.r0 + 1 }));
}

/**
 * A template from one Area of a layout: the box around it, its most common floor, every piece standing
 * in the box and the wall decor hanging right above it. Null when the layout has no such Area.
 */
export function templateFromArea(layout: RoomLayout, label: string, name: string, catalog: Catalog): RoomTemplate | null {
  const box = areaBoxes(layout).find((b) => b.label === label);
  if (!box) return null;
  const count = new Map<number, number>();
  let floorColor: TileColor = null;
  for (let r = box.row; r < box.row + box.h; r++) {
    for (let c = box.col; c < box.col + box.w; c++) {
      const i = r * layout.cols + c;
      const t = layout.tiles[i];
      if (!isFloor(t)) continue;
      count.set(t, (count.get(t) ?? 0) + 1);
    }
  }
  const floor = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 1;
  for (let i = 0; i < layout.tiles.length && !floorColor; i++) {
    if (layout.areaTiles?.[i] === label && layout.tiles[i] === floor) floorColor = layout.tileColors?.[i] ?? null;
  }
  const inBox = (c: number, r: number) => c >= box.col && c < box.col + box.w && r >= box.row && r < box.row + box.h;
  const furniture = layout.furniture
    .filter((f) => {
      const fp = fpOf(catalog, f.type);
      if (!fp) return false;
      if (fp.wall) return f.col >= box.col && f.col + fp.w <= box.col + box.w && f.row + fp.h === box.row;
      return cellsOf(f, catalog).every(([c, r]) => inBox(c, r));
    })
    .map((f) => ({ type: f.type, col: f.col - box.col, row: f.row - box.row }));
  let seats = 0;
  for (const f of furniture) {
    const fp = fpOf(catalog, f.type);
    if (fp?.chair) seats += fp.w * (fp.h - fp.bg);
  }
  const color = layout.areas?.find((a) => a.label === label)?.color ?? "#b4b2a9";
  return { id: `mine-${Date.now().toString(36)}`, label: name.trim() || label, zone: "custom", w: box.w, h: box.h, floor, floorColor, areaColor: color, seats, furniture, mine: true };
}
