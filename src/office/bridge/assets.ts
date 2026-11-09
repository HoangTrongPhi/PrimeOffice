// Office assets for the vendored pixel-agents UI: PNGs in public/assets decoded into the sprite
// messages it expects (characterSpritesLoaded, floorTilesLoaded, …). Indexed by
// scripts/build-office-assets.mjs. Same pixel rules as pixel-agents' browserMock (alpha < 2 = clear).

import { rgbaToHex } from "../core/src/assets/colorUtils.ts";
import {
  CARPET_GRID_COLS,
  CARPET_MARCHING_SQUARES_COUNT,
  CARPET_TILE_SIZE,
  CHAR_FRAME_H,
  CHAR_FRAME_W,
  CHAR_FRAMES_PER_ROW,
  CHARACTER_DIRECTIONS,
  FLOOR_TILE_SIZE,
  WALL_BITMASK_COUNT,
  WALL_GRID_COLS,
  WALL_PIECE_HEIGHT,
  WALL_PIECE_WIDTH,
} from "../core/src/assets/constants.ts";
import type { CatalogEntry, CharacterDirectionSprites } from "../core/src/assets/types.ts";

export interface OfficeAssetIndex {
  floors: string[];
  walls: string[];
  carpets: string[];
  characters: string[];
  /** Pack name → files relative to assets/characters (spec P4). */
  characterPacks: Record<string, string[]>;
  defaultLayout: string | null;
}

export interface OfficeAssets {
  index: OfficeAssetIndex;
  /** Messages in pixel-agents' load order, layout excluded. */
  messages: Record<string, unknown>[];
  defaultLayout: unknown;
}

interface Png {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const base = import.meta.env.BASE_URL;

async function decodePng(url: string): Promise<Png> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob(), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("No 2D context");
  ctx.drawImage(bitmap, 0, 0);
  return { width: bitmap.width, height: bitmap.height, data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data };
}

function readSprite(png: Png, w: number, h: number, ox = 0, oy = 0): string[][] {
  const rows: string[][] = [];
  for (let y = 0; y < h; y++) {
    const row: string[] = [];
    for (let x = 0; x < w; x++) {
      const i = ((oy + y) * png.width + (ox + x)) * 4;
      row.push(rgbaToHex(png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]));
    }
    rows.push(row);
  }
  return rows;
}

function grid(png: Png, count: number, cols: number, w: number, h: number): string[][][] {
  const out: string[][][] = [];
  for (let n = 0; n < count; n++) out.push(readSprite(png, w, h, (n % cols) * w, Math.floor(n / cols) * h));
  return out;
}

export async function decodeCharacter(file: string): Promise<CharacterDirectionSprites> {
  const png = await decodePng(`${base}assets/characters/${file}`);
  const byDir: CharacterDirectionSprites = { down: [], up: [], right: [] };
  CHARACTER_DIRECTIONS.forEach((dir, d) => {
    for (let f = 0; f < CHAR_FRAMES_PER_ROW; f++) byDir[dir].push(readSprite(png, CHAR_FRAME_W, CHAR_FRAME_H, f * CHAR_FRAME_W, d * CHAR_FRAME_H));
  });
  return byDir;
}

/** Load and decode every office asset; `pack` picks the character pack (falls back to "classic"). */
export async function loadOfficeAssets(pack = "classic"): Promise<OfficeAssets> {
  const [index, catalog] = await Promise.all([
    fetch(`${base}assets/asset-index.json`).then((r) => r.json() as Promise<OfficeAssetIndex>),
    fetch(`${base}assets/furniture-catalog.json`).then((r) => r.json() as Promise<CatalogEntry[]>),
  ]);
  const chars = index.characterPacks?.[pack] ?? index.characterPacks?.classic ?? index.characters;
  const [characters, floors, walls, carpets, furniture, defaultLayout] = await Promise.all([
    Promise.all(chars.map(decodeCharacter)),
    Promise.all(index.floors.map(async (f) => readSprite(await decodePng(`${base}assets/floors/${f}`), FLOOR_TILE_SIZE, FLOOR_TILE_SIZE))),
    Promise.all(index.walls.map(async (f) => grid(await decodePng(`${base}assets/walls/${f}`), WALL_BITMASK_COUNT, WALL_GRID_COLS, WALL_PIECE_WIDTH, WALL_PIECE_HEIGHT))),
    Promise.all((index.carpets ?? []).map(async (f) => grid(await decodePng(`${base}assets/carpets/${f}`), CARPET_MARCHING_SQUARES_COUNT, CARPET_GRID_COLS, CARPET_TILE_SIZE, CARPET_TILE_SIZE))),
    Promise.all(catalog.map(async (e) => [e.id, readSprite(await decodePng(`${base}assets/${e.furniturePath}`), e.width, e.height)] as const)),
    index.defaultLayout ? fetch(`${base}assets/${index.defaultLayout}`).then((r) => r.json()) : Promise.resolve(null),
  ]);
  return {
    index,
    defaultLayout,
    // Load order matters: characters → floors → walls → carpets → furniture (then the layout).
    messages: [
      { type: "characterSpritesLoaded", characters },
      { type: "floorTilesLoaded", sprites: floors },
      { type: "wallTilesLoaded", sets: walls },
      { type: "carpetTilesLoaded", sets: carpets },
      { type: "furnitureAssetsLoaded", catalog, sprites: Object.fromEntries(furniture) },
    ],
  };
}
