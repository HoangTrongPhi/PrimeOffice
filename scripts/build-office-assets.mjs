#!/usr/bin/env node
/**
 * Index the office assets in public/assets for the office bridge (src/office/bridge/assets.ts):
 *   asset-index.json        floors, walls, carpets, characters (+ character packs), default layout
 *   furniture-catalog.json  every furniture manifest, groups flattened
 *
 * Same rules as pixel-agents core/src/assets/build.ts (vendored commit in src/office/VENDORED.md).
 * Run after adding or changing assets:  npm run assets
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "public", "assets");

function listSorted(subdir, pattern) {
  const dir = join(assets, subdir);
  if (!existsSync(dir)) return [];
  const num = (f) => parseInt(/(\d+)/.exec(f)?.[1] ?? "0", 10);
  return readdirSync(dir)
    .filter((f) => pattern.test(f))
    .sort((a, b) => num(a) - num(b));
}

function flatten(node, inherited) {
  if (node.type === "asset") {
    const orientation = node.orientation ?? inherited.orientation;
    const state = node.state ?? inherited.state;
    return [
      {
        id: node.id,
        name: inherited.name,
        label: inherited.name,
        category: inherited.category,
        file: node.file,
        width: node.width,
        height: node.height,
        footprintW: node.footprintW,
        footprintH: node.footprintH,
        isDesk: inherited.category === "desks",
        canPlaceOnWalls: inherited.canPlaceOnWalls,
        canPlaceOnSurfaces: inherited.canPlaceOnSurfaces,
        backgroundTiles: inherited.backgroundTiles,
        groupId: inherited.groupId,
        ...(orientation ? { orientation } : {}),
        ...(state ? { state } : {}),
        ...(node.mirrorSide ? { mirrorSide: true } : {}),
        ...(inherited.rotationScheme ? { rotationScheme: inherited.rotationScheme } : {}),
        ...(inherited.animationGroup ? { animationGroup: inherited.animationGroup } : {}),
        ...(node.frame !== undefined ? { frame: node.frame } : {}),
      },
    ];
  }
  const out = [];
  for (const member of node.members ?? []) {
    const child = { ...inherited };
    if (node.groupType === "rotation" && node.rotationScheme) child.rotationScheme = node.rotationScheme;
    if (node.groupType === "state") {
      if (node.orientation) child.orientation = node.orientation;
      if (node.state) child.state = node.state;
    }
    if (node.groupType === "animation") {
      const orient = node.orientation ?? inherited.orientation ?? "";
      const st = node.state ?? inherited.state ?? "";
      child.animationGroup = `${inherited.groupId}_${orient}_${st}`.toUpperCase();
      if (node.state) child.state = node.state;
    }
    if (node.orientation && !child.orientation) child.orientation = node.orientation;
    out.push(...flatten(member, child));
  }
  return out;
}

function furnitureCatalog() {
  const dir = join(assets, "furniture");
  if (!existsSync(dir)) return [];
  const catalog = [];
  for (const folder of readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory()).sort()) {
    const manifestPath = join(dir, folder, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    try {
      const m = JSON.parse(readFileSync(manifestPath, "utf-8"));
      if (m.type === "asset") {
        if ([m.width, m.height, m.footprintW, m.footprintH].some((v) => v === undefined || v === null)) continue;
        const file = m.file ?? `${m.id}.png`;
        catalog.push({
          id: m.id, name: m.name, label: m.name, category: m.category, file, furniturePath: `furniture/${folder}/${file}`,
          width: m.width, height: m.height, footprintW: m.footprintW, footprintH: m.footprintH, isDesk: m.category === "desks",
          canPlaceOnWalls: m.canPlaceOnWalls, canPlaceOnSurfaces: m.canPlaceOnSurfaces, backgroundTiles: m.backgroundTiles, groupId: m.id,
        });
      } else if (m.members) {
        const inherited = {
          groupId: m.id, name: m.name, category: m.category, canPlaceOnWalls: m.canPlaceOnWalls,
          canPlaceOnSurfaces: m.canPlaceOnSurfaces, backgroundTiles: m.backgroundTiles,
          ...(m.rotationScheme ? { rotationScheme: m.rotationScheme } : {}),
        };
        for (const a of flatten({ type: "group", groupType: m.groupType, rotationScheme: m.rotationScheme, members: m.members }, inherited)) {
          catalog.push({ ...a, furniturePath: `furniture/${folder}/${a.file}` });
        }
      }
    } catch (e) {
      console.warn(`skip ${manifestPath}: ${e.message}`);
    }
  }
  return catalog;
}

/** Character packs: public/assets/characters/<pack>/char_N.png; the root folder is pack "classic". */
function characterPacks() {
  const dir = join(assets, "characters");
  const packs = {};
  const rootChars = listSorted("characters", /^char_\d+\.png$/i);
  if (rootChars.length) packs.classic = rootChars;
  if (existsSync(dir)) {
    for (const d of readdirSync(dir).filter((x) => statSync(join(dir, x)).isDirectory()).sort()) {
      const chars = listSorted(`characters/${d}`, /^char_\d+\.png$/i).map((f) => `${d}/${f}`);
      if (chars.length) packs[d] = chars;
    }
  }
  return packs;
}

let defaultLayout = null;
let best = 0;
for (const f of existsSync(assets) ? readdirSync(assets) : []) {
  const m = /^default-layout-(\d+)\.json$/.exec(f);
  if (m && +m[1] > best) {
    best = +m[1];
    defaultLayout = f;
  }
}

const packs = characterPacks();
const index = {
  floors: listSorted("floors", /^floor_\d+\.png$/i),
  walls: listSorted("walls", /^wall_\d+\.png$/i),
  carpets: listSorted("carpets", /^carpet_\d+\.png$/i),
  characters: packs.classic ?? [],
  characterPacks: packs,
  defaultLayout,
};
const catalog = furnitureCatalog();
writeFileSync(join(assets, "asset-index.json"), JSON.stringify(index, null, 2) + "\n");
writeFileSync(join(assets, "furniture-catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
console.log(`assets: ${index.floors.length} floors, ${index.walls.length} walls, ${index.carpets.length} carpets, packs ${Object.entries(packs).map(([k, v]) => `${k}(${v.length})`).join(" ")}, ${catalog.length} furniture`);
