// node --test scripts/tests/  (Node 22.18+ runs TypeScript directly). Part of `npm run check`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { areaBoxes, footprints, MAX_SIZE, type RoomLayout, type RoomTemplate, stampRoom, templateFromArea, VOID, WALL } from "../../src/lib/rooms.ts";

const read = (p: string) => JSON.parse(readFileSync(new URL(`../../public/assets/${p}`, import.meta.url), "utf8"));
const catalog = footprints(read("furniture-catalog.json"));
const templates: RoomTemplate[] = read("rooms/room-templates.json").rooms;
const campus = (): RoomLayout => read("layouts/game-campus.json");

/** Seats of the stamped room that a character can reach from outside its doorway. */
function reachableSeats(layout: RoomLayout, label: string): { seats: number; reached: number } {
  const { cols, rows, tiles } = layout;
  const blocked = new Set<string>();
  const seats = new Set<string>();
  for (const f of layout.furniture) {
    const fp = catalog[f.type.split(":")[0]];
    if (!fp || fp.wall || fp.surface) continue;
    for (let dr = fp.bg; dr < fp.h; dr++) {
      for (let dc = 0; dc < fp.w; dc++) {
        const k = `${f.col + dc},${f.row + dr}`;
        blocked.add(k);
        if (fp.chair) seats.add(k);
      }
    }
  }
  const inRoom = (c: number, r: number) => layout.areaTiles?.[r * cols + c] === label;
  const box = areaBoxes(layout).find((b) => b.label === label)!;
  // Start from any free floor tile outside the room that touches it (the doorway's far side).
  const free = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows && tiles[r * cols + c] !== WALL && tiles[r * cols + c] !== VOID;
  let start: [number, number] | null = null;
  for (let r = box.row - 2; r <= box.row + box.h + 1 && !start; r++) {
    for (let c = box.col - 2; c <= box.col + box.w + 1 && !start; c++) {
      if (free(c, r) && !inRoom(c, r) && !blocked.has(`${c},${r}`) && layout.areaTiles?.[r * cols + c] == null) start = [c, r];
    }
  }
  assert.ok(start, "a doorway");
  const seen = new Set([`${start[0]},${start[1]}`]);
  const todo = [start];
  while (todo.length) {
    const [c, r] = todo.pop()!;
    if (seats.has(`${c},${r}`)) continue;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const [cc, rr] = [c + dc, r + dr];
      const k = `${cc},${rr}`;
      if (seen.has(k) || !free(cc, rr) || (blocked.has(k) && !seats.has(k))) continue;
      seen.add(k);
      todo.push([cc, rr]);
    }
  }
  const mine = [...seats].filter((k) => {
    const [c, r] = k.split(",").map(Number);
    return inRoom(c, r);
  });
  return { seats: mine.length, reached: mine.filter((k) => seen.has(k)).length };
}

test("every bundled template stamps into the Campus floor, walled, with a doorway and its seats reachable", () => {
  for (const tpl of templates) {
    const res = stampRoom(campus(), tpl, `${tpl.label} X`, catalog, "t");
    assert.ok(!("error" in res), `${tpl.id}: ${"error" in res ? res.error : ""}`);
    const { layout, label } = res;
    assert.ok(layout.cols <= MAX_SIZE && layout.rows <= MAX_SIZE, tpl.id);
    assert.equal(layout.tiles.length, layout.cols * layout.rows);
    if (tpl.areaColor) {
      assert.equal(label, `${tpl.label} X`);
      assert.ok(layout.areas!.some((a) => a.label === label), tpl.id);
      const box = areaBoxes(layout).find((b) => b.label === label)!;
      assert.deepEqual([box.w, box.h], [tpl.w, tpl.h], tpl.id);
      const { seats, reached } = reachableSeats(layout, label!);
      assert.equal(seats, tpl.seats, `${tpl.id} seats`);
      assert.equal(reached, seats, `${tpl.id}: every seat reachable`);
    } else {
      assert.equal(label, null, "Studio head has no Area");
    }
    assert.ok(layout.furniture.length > campus().furniture.length, tpl.id);
  }
});

test("a room name already in use gets a number; the office stops growing at 64 x 64", () => {
  const meeting = templates.find((t) => t.id === "meeting")!;
  const once = stampRoom(campus(), meeting, "Phòng họp", catalog, "a");
  assert.ok(!("error" in once));
  assert.equal(once.label, "Phòng họp 2");
  let layout = campus();
  const big = templates.find((t) => t.id === "dept-l")!;
  let added = 0;
  for (;;) {
    const res = stampRoom(layout, big, "Engineering", catalog, `b${added}`);
    if ("error" in res) {
      assert.match(res.error, /64/);
      break;
    }
    layout = res.layout;
    added++;
    assert.ok(added < 20, "stops");
  }
  assert.ok(added >= 2, `added ${added}`);
});

test("a room of the layout saved as a template comes back the same", () => {
  const tpl = templateFromArea(campus(), "Engineering", "Phòng code", catalog)!;
  assert.equal(tpl.label, "Phòng code");
  assert.deepEqual([tpl.w, tpl.h], [16, 10]);
  assert.equal(tpl.seats, 12);
  assert.ok(tpl.furniture.every((f) => f.col >= 0 && f.col < tpl.w && f.row < tpl.h));
  const res = stampRoom(campus(), tpl, "Phòng code", catalog, "c");
  assert.ok(!("error" in res));
  assert.equal(reachableSeats(res.layout, "Phòng code").reached, 12);
  assert.equal(templateFromArea(campus(), "Nowhere", "x", catalog), null);
});
