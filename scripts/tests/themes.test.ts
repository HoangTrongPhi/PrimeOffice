// node --test scripts/tests/  (Node 22.18+ runs TypeScript directly). Part of `npm run check`.
// Special themes keep Campus / Open Floor's departments; avatars in the index exist on disk.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { kindOf, themeOf } from "../../src/lib/studios.ts";
import { labelForms } from "../../src/office/webview/src/office/engine/departments.ts";

const url = (p: string) => new URL(`../../public/assets/${p}`, import.meta.url);
const read = (p: string) => JSON.parse(readFileSync(url(p), "utf8"));
const labels = (file: string) => (read(file).areas as { label: string }[]).map((a) => a.label).sort();

test("every Game studio theme has the departments of Campus", () => {
  const campus = labels("layouts/game-campus.json");
  const game = kindOf("game");
  assert.ok(game.themes.length >= 10);
  for (const t of game.themes) {
    assert.ok(existsSync(url(t.file)), `${t.id}: ${t.file} missing`);
    if (t.group === "DC") {
      // Their own maps: rooms are "<room> · <department>", so each department is one part of a label.
      const forms = new Set(labels(t.file).flatMap(labelForms));
      for (const l of campus) assert.ok(labelForms(l).some((f) => forms.has(f)), `${t.id}: no room for ${l}`);
    } else {
      assert.deepEqual(labels(t.file), campus, `${t.id}: areas differ from Campus`);
    }
  }
});

test("the DC maps use their own furniture only", () => {
  for (const [file, prefix] of [["layouts/dc-batcave.json", "BC_"], ["layouts/dc-hall-of-justice.json", "HOJ_"]]) {
    const types = (read(file).furniture as { type: string }[]).map((f) => f.type.split(":")[0]);
    assert.deepEqual([...new Set(types.filter((t) => !t.startsWith(prefix)))], [], file);
  }
});

test("special themes have an effect; DC has Hall of Justice and BatCave", () => {
  const game = kindOf("game");
  for (const t of game.themes.filter((x) => x.group)) assert.ok(t.fx, `${t.id} has no fx`);
  const dc = game.themes.filter((t) => t.group === "DC").map((t) => t.id);
  assert.deepEqual(dc, ["hall-of-justice", "batcave"]);
  assert.equal(themeOf("game", "nope").id, "campus");
  assert.equal(themeOf("game", "batcave").fx, "cave");
});

test("avatar groups: every crew character first, then the themed groups, files on disk", () => {
  const index = read("asset-index.json");
  const groups: { id: string; crew?: boolean; items: { file: string }[] }[] = index.avatarGroups;
  const crew = Object.values(index.characterPacks as Record<string, string[]>).flat();
  const crewFiles = groups.filter((g) => g.crew).flatMap((g) => g.items.map((i) => i.file));
  assert.deepEqual(crewFiles.sort(), [...crew].sort());
  for (const id of ["dc", "marvel", "dragonball", "naruto"]) assert.ok(groups.some((g) => g.id === id && g.items.length >= 8), id);
  for (const g of groups) for (const it of g.items) assert.ok(existsSync(url(`characters/${it.file}`)), it.file);
});
