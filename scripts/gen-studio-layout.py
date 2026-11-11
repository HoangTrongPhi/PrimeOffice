#!/usr/bin/env python3
"""Generate the studio floor plans in public/assets/layouts/: one office per kind of company.

Every plan is a grid of rooms. Each department room is an Area whose label names the department, so
sub-agents of that department take a desk there (src/office/webview/src/office/engine/departments.ts).
"Studio head" has no Area: main sessions sit there first (unzoned seats) and rest in the Lounge when
their turn is done. Uses only furniture from public/assets/furniture.

game-studio.json — the map agreed for Claude Code Game Studios projects (UEHF_Studio, its games,
CustomClaudeCodeStudio):

    +----------------+------------+------------------+
    | Ban giam doc   | Phong hop  | Release & ops    |
    +----------------+------------+------------------+
    | Design         | Studio head| Engineering      |
    +---------+------+-----+------+------------------+
    |Narrative| Art  |Audio       | Engine lab       |
    +---------+------+-----+------+------------------+
    | Loc & community| Lounge     | QA               |
    +----------------+------------+------------------+

video-studio.json — a YouTube / video production company:

    +----------------+------------+------------------+
    | Ban san xuat   | Phong hop  | Publishing & SEO |
    +----------------+------------+------------------+
    | Script room    | Studio head| Editing bay      |
    +----------------+------------+---------+--------+
    | Motion &       | Lounge     | Audio   |Analytics|
    | graphics       |            | booth   |        |
    +----------------+------------+---------+--------+

Run:  python scripts/gen-studio-layout.py      (stdlib only; prints the seat count per room)
A new kind of studio = one more `Plan` here, its departments in departments.ts, and an entry in
src/lib/studios.ts.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "assets" / "layouts"

WALL, VOID = 0, 255

# Floor patterns (FLOOR_1..9) and colours, from the bundled default layout's palette.
WALL_COLOR = {"h": 214, "s": 30, "b": -100, "c": -55}
FLOORS = {
    "wood": (7, {"h": 25, "s": 48, "b": -43, "c": -88}),
    "blue": (1, {"h": 209, "s": 39, "b": -25, "c": -80}),
    "tile": (9, {"h": 209, "s": 0, "b": -16, "c": -8}),
    "plum": (1, {"h": 270, "s": 30, "b": -30, "c": -80}),
    "teal": (1, {"h": 170, "s": 35, "b": -30, "c": -80}),
    "rust": (7, {"h": 10, "s": 45, "b": -40, "c": -85}),
    "moss": (7, {"h": 80, "s": 30, "b": -40, "c": -85}),
    "slate": (9, {"h": 220, "s": 10, "b": -30, "c": -20}),
}


class Plan:
    """One floor plan: rooms, doorways and furniture, checked and written by `build`."""

    def __init__(self, file, cols, rows, rooms, need, start, extra_areas=()):
        self.file = file
        self.cols, self.rows = cols, rows
        # name, area label (None = no Area), area colour, floor, (col0, row0, col1, row1) inclusive interior
        self.rooms = rooms
        # Fewest seats each room must have.
        self.need = need
        # A floor tile of Studio head: every room and seat must be reachable from it.
        self.start = start
        # (label, colour, rect): an Area laid over part of a room (the editor desk).
        self.extra_areas = extra_areas
        # Doorways: (col, row) floor tiles cut through walls.
        self.doors = []
        self.furniture = []

    def door_v(self, col, row):  # 2 tall, in a vertical wall
        self.doors.extend([(col, row), (col, row + 1)])

    def door_h(self, col, row):  # 2 wide, in a horizontal wall
        self.doors.extend([(col, row), (col + 1, row)])

    def put(self, kind, col, row):
        self.furniture.append({"uid": f"st-{len(self.furniture) + 1:03d}", "type": kind, "col": col, "row": row})

    def pod(self, col, row, pc="PC_FRONT_OFF"):
        """Workstation, 3 x 3: desk (3x2) with a PC, a bench below it. One seat at (col+1, row+2)."""
        self.put("DESK_FRONT", col, row)
        self.put(pc, col + 1, row)
        self.put("CUSHIONED_BENCH", col + 1, row + 2)

    def team_table(self, col, row):
        """Table (3x4) with two chairs on each side, 5 x 4. Four seats."""
        self.put("TABLE_FRONT", col + 1, row)
        self.put("PC_SIDE", col + 1, row)
        self.put("PC_SIDE", col + 1, row + 2)
        self.put("PC_SIDE:left", col + 3, row)
        self.put("PC_SIDE:left", col + 3, row + 2)
        self.put("WOODEN_CHAIR_SIDE", col, row)
        self.put("WOODEN_CHAIR_SIDE", col, row + 2)
        self.put("WOODEN_CHAIR_SIDE:left", col + 4, row)
        self.put("WOODEN_CHAIR_SIDE:left", col + 4, row + 2)

    def sofa_set(self, col, row):
        """Coffee table with sofas around it (the default layout's lounge), 4 x 4 from (col, row)."""
        self.put("SOFA_FRONT", col + 1, row)
        self.put("SOFA_SIDE", col, row + 1)
        self.put("COFFEE_TABLE", col + 1, row + 1)
        self.put("COFFEE", col + 1, row + 2)
        self.put("SOFA_SIDE:left", col + 3, row + 1)
        self.put("SOFA_BACK", col + 1, row + 3)


# ---- Game studio ---------------------------------------------------------------------------------
def game_studio():
    p = Plan(
        "game-studio.json", 46, 42,
        rooms=[
            ("directors", "Ban giám đốc", "#7f77dd", "plum", (1, 2, 14, 9)),
            ("meeting", "Phòng họp", "#afa9ec", "slate", (16, 2, 27, 9)),
            ("release", "Release & ops", "#1d9e75", "teal", (29, 2, 44, 9)),
            ("design", "Design", "#5dcaa5", "wood", (1, 11, 14, 22)),
            ("head", None, None, "blue", (16, 11, 27, 22)),
            ("engineering", "Engineering", "#d85a30", "rust", (29, 11, 44, 22)),
            ("narrative", "Narrative", "#9fe1cb", "moss", (1, 24, 10, 31)),
            ("art", "Art", "#ed93b1", "wood", (12, 24, 18, 31)),
            ("audio", "Audio", "#85b7eb", "slate", (20, 24, 27, 31)),
            ("engine", "Engine lab", "#f0997b", "rust", (29, 24, 44, 31)),
            # Loc & community under Narrative (strings, lore, patch notes); QA under Engine lab (builds, bugs, perf).
            ("community", "Loc & community", "#ef9f27", "teal", (1, 33, 14, 40)),
            ("lounge", "Lounge", "#b4b2a9", "wood", (16, 33, 27, 40)),
            ("qa", "QA", "#97c459", "tile", (29, 33, 44, 40)),
        ],
        need={"directors": 3, "design": 7, "engineering": 10, "engine": 6, "meeting": 3, "art": 2, "audio": 2,
              "narrative": 3, "qa": 4, "release": 3, "community": 2, "head": 1, "lounge": 6},
        start=(20, 15),
        # The editor desk (Engine lab's PC-on pod): one agent at a time, while it calls the engine editor.
        extra_areas=[("Editor desk", "#f5c4b3", (36, 29, 38, 31))],
    )
    put, pod = p.put, p.pod
    # Row 1 rooms, side by side; and down into row 2.
    p.door_v(15, 5), p.door_v(28, 5)
    p.door_h(7, 10), p.door_h(21, 10), p.door_h(36, 10)
    # Row 2.
    p.door_v(15, 14), p.door_v(28, 14), p.door_v(15, 19), p.door_v(28, 19)
    p.door_h(5, 23), p.door_h(13, 23), p.door_h(23, 23), p.door_h(36, 23)
    # Row 3 (split walls at 11 and 19; 28 as above).
    p.door_v(11, 27), p.door_v(19, 27), p.door_v(28, 27)
    p.door_h(5, 32), p.door_h(23, 32), p.door_h(36, 32)
    # Row 4.
    p.door_v(15, 36), p.door_v(28, 36)

    # Wall decor goes on the outer top wall (row 1) only, at row 0.
    # Ban giam doc (3): three desks, a plant, bookshelves on the wall.
    for c in (2, 6, 10):
        pod(c, 3)
    put("DOUBLE_BOOKSHELF", 2, 0), put("LARGE_PAINTING", 7, 0), put("DOUBLE_BOOKSHELF", 11, 0)
    put("LARGE_PLANT", 12, 7), put("PLANT", 1, 7)
    # Phong hop: one team table (director gates), whiteboard.
    p.team_table(19, 4)
    put("WHITEBOARD", 20, 0), put("CLOCK", 25, 0), put("PLANT_2", 16, 8), put("PLANT_2", 27, 8)
    # Release & ops (3 + 1 spare).
    for c in (30, 34, 38, 42):
        pod(c, 3)
    put("SMALL_PAINTING", 31, 0), put("CLOCK", 37, 0), put("SMALL_PAINTING_2", 43, 0), put("BIN", 29, 8)
    for c in (40, 41, 42, 43):
        put("SERVER_RACK", c, 7)
    # Design (7): three desks + a team table.
    for c in (2, 6, 10):
        pod(c, 12)
    p.team_table(3, 16)
    put("PLANT", 11, 17), put("CACTUS", 13, 17), put("LARGE_PLANT", 12, 20), put("PLANT_2", 2, 21)
    # Studio head: main sessions (6 desks, PCs on).
    for r in (12, 16):
        for c in (17, 21, 25):
            pod(c, r, "PC_FRONT_ON_1")
    put("WATER_COOLER", 16, 18), put("PLANT", 27, 20), put("POT", 16, 21)
    # Engineering (8 + 2 spare: `/dev-story` runs several programmers at once): two rows of four + two.
    for r in (12, 16):
        for c in (30, 34, 38, 42):
            pod(c, r)
    pod(30, 20), pod(34, 20)
    put("SERVER_RACK", 39, 20), put("PLANT", 42, 20), put("BIN", 44, 21)
    # Narrative (3).
    pod(2, 25), pod(6, 25), pod(2, 29)
    put("PLANT", 7, 29), put("POT", 9, 30)
    # Art (2).
    pod(12, 25), pod(16, 25)
    put("LARGE_PLANT", 12, 29), put("CACTUS", 17, 29), put("EASEL", 14, 29), put("EASEL", 16, 29)
    # Audio (2).
    pod(20, 25), pod(24, 25)
    put("PLANT_2", 21, 29), put("POT", 26, 30), put("SPEAKER", 23, 29), put("SPEAKER", 25, 29)
    # Engine lab (5): four specialist desks + one, and the editor desk (Unreal MCP takes one call at a time).
    for c in (30, 34, 38, 42):
        pod(c, 25)
    pod(32, 29)
    pod(36, 29, "PC_FRONT_ON_2")  # the editor desk: its own Area, "Editor desk"
    put("PLANT", 30, 29), put("BIN", 44, 30), put("SERVER_RACK", 41, 29)
    # Loc & community (2 + 1 spare), under Narrative.
    pod(2, 34), pod(6, 34), pod(10, 34)
    put("PLANT_2", 13, 38), put("BIN", 2, 39), put("SMALL_TABLE_FRONT", 6, 38), put("COFFEE", 6, 38)
    # Lounge: two sofa sets, plants, coffee corner, arcade. Main sessions rest here when their turn is done.
    p.sofa_set(17, 34), p.sofa_set(22, 34)
    put("SMALL_TABLE_FRONT", 25, 39), put("COFFEE", 25, 39), put("LARGE_PLANT", 16, 38), put("PLANT", 27, 38)
    put("ARCADE", 16, 34), put("ARCADE", 27, 34), put("WATER_COOLER", 21, 39)
    # QA (4), under Engine lab: three desks + one, test devices.
    for c in (30, 34, 38):
        pod(c, 34)
    pod(30, 38)
    put("TEST_RIG", 42, 34), put("TEST_RIG", 36, 38), put("SMALL_TABLE_FRONT", 39, 38), put("COFFEE", 39, 38)
    return p


# ---- Video studio --------------------------------------------------------------------------------
def video_studio():
    p = Plan(
        "video-studio.json", 46, 32,
        rooms=[
            ("producers", "Ban sản xuất", "#7f77dd", "plum", (1, 2, 14, 9)),
            ("meeting", "Phòng họp", "#afa9ec", "slate", (16, 2, 27, 9)),
            ("publishing", "Publishing & SEO", "#1d9e75", "teal", (29, 2, 44, 9)),
            ("script", "Script room", "#9fe1cb", "moss", (1, 11, 14, 20)),
            ("head", None, None, "blue", (16, 11, 27, 20)),
            ("editing", "Editing bay", "#d85a30", "rust", (29, 11, 44, 20)),
            ("motion", "Motion & graphics", "#ed93b1", "wood", (1, 22, 14, 30)),
            ("lounge", "Lounge", "#b4b2a9", "wood", (16, 22, 27, 30)),
            ("audio", "Audio booth", "#85b7eb", "slate", (29, 22, 36, 30)),
            ("analytics", "Analytics", "#97c459", "tile", (38, 22, 44, 30)),
        ],
        need={"producers": 3, "meeting": 3, "publishing": 4, "script": 7, "head": 1, "editing": 8, "motion": 5,
              "lounge": 6, "audio": 2, "analytics": 2},
        start=(20, 15),
    )
    put, pod = p.put, p.pod
    # Row 1 rooms, side by side; and down into row 2.
    p.door_v(15, 5), p.door_v(28, 5)
    p.door_h(7, 10), p.door_h(21, 10), p.door_h(36, 10)
    # Row 2, and down into row 3.
    p.door_v(15, 14), p.door_v(28, 14)
    p.door_h(7, 21), p.door_h(21, 21), p.door_h(32, 21), p.door_h(40, 21)
    # Row 3 (Audio booth | Analytics split at 37).
    p.door_v(15, 25), p.door_v(28, 25), p.door_v(37, 25)

    # Ban san xuat (3): showrunner, strategist, producer.
    for c in (2, 6, 10):
        pod(c, 3)
    put("DOUBLE_BOOKSHELF", 2, 0), put("LARGE_PAINTING", 7, 0), put("DOUBLE_BOOKSHELF", 11, 0)
    put("LARGE_PLANT", 12, 7), put("PLANT", 1, 7)
    # Phong hop: content reviews.
    p.team_table(19, 4)
    put("WHITEBOARD", 20, 0), put("CLOCK", 25, 0), put("PLANT_2", 16, 8), put("PLANT_2", 27, 8)
    # Publishing & SEO (4): titles, descriptions, schedule, community.
    for c in (30, 34, 38, 42):
        pod(c, 3)
    put("SMALL_PAINTING", 31, 0), put("CLOCK", 37, 0), put("SMALL_PAINTING_2", 43, 0), put("BIN", 29, 8)
    put("PLANT", 44, 7)
    # Script room (7): three desks + a writers' table.
    for c in (2, 6, 10):
        pod(c, 12)
    p.team_table(3, 16)
    put("PLANT", 11, 17), put("LARGE_PLANT", 12, 18), put("POT", 1, 20)
    # Studio head: main sessions (6 desks, PCs on).
    for r in (12, 16):
        for c in (17, 21, 25):
            pod(c, r, "PC_FRONT_ON_1")
    put("PLANT", 27, 19), put("POT", 16, 20)
    # Editing bay (8): two rows of four.
    for r in (12, 16):
        for c in (30, 34, 38, 42):
            pod(c, r, "PC_FRONT_ON_3" if r == 12 else "PC_FRONT_OFF")
    put("BIN", 44, 20), put("SERVER_RACK", 29, 19)
    # Motion & graphics (5): thumbnails, titles, animation.
    for c in (2, 6, 10):
        pod(c, 23)
    pod(2, 27), pod(6, 27)
    put("EASEL", 10, 27), put("EASEL", 12, 27), put("CACTUS", 14, 28)
    # Lounge: main sessions rest here when their turn is done.
    p.sofa_set(17, 23), p.sofa_set(22, 23)
    put("ARCADE", 16, 23), put("ARCADE", 27, 23)
    put("SMALL_TABLE_FRONT", 25, 28), put("COFFEE", 25, 28), put("LARGE_PLANT", 16, 27), put("WATER_COOLER", 21, 28)
    # Audio booth (2): voice-over, music, mix.
    pod(29, 23), pod(33, 23)
    put("SPEAKER", 30, 27), put("SPEAKER", 34, 27), put("PLANT_2", 36, 28)
    # Analytics (2): retention, A/B tests.
    pod(38, 23), pod(42, 23)
    put("SERVER_RACK", 40, 27), put("PLANT", 44, 27)
    return p


# ---- Tiles, colours, areas, checks ----------------------------------------------------------------
def build(p):
    cols, rows = p.cols, p.rows
    tiles = [VOID] * (cols * rows)
    colors = [None] * (cols * rows)
    area_tiles = [None] * (cols * rows)
    idx = lambda c, r: r * cols + c  # noqa: E731

    # Walls everywhere from row 1, then rooms carve floors.
    for r in range(1, rows):
        for c in range(cols):
            tiles[idx(c, r)] = WALL
            colors[idx(c, r)] = WALL_COLOR
    areas = []
    for _name, label, color, floor, (c0, r0, c1, r1) in p.rooms:
        tile, col = FLOORS[floor]
        for r in range(r0, r1 + 1):
            for c in range(c0, c1 + 1):
                tiles[idx(c, r)] = tile
                colors[idx(c, r)] = col
                area_tiles[idx(c, r)] = label
        if label:
            areas.append({"label": label, "color": color})
    for label, color, (c0, r0, c1, r1) in p.extra_areas:
        for r in range(r0, r1 + 1):
            for c in range(c0, c1 + 1):
                area_tiles[idx(c, r)] = label
        areas.append({"label": label, "color": color})
    # Doorways take the floor of the room below / to the right, and no Area (a corridor tile).
    for c, r in p.doors:
        below = tiles[idx(c, r + 1)] if tiles[idx(c, r + 1)] != WALL else tiles[idx(c + 1, r)]
        tiles[idx(c, r)] = below
        colors[idx(c, r)] = FLOORS["blue"][1] if below == 1 else FLOORS["wood"][1]

    # Checks: every seat inside its room, departments big enough, every room reachable.
    def room_of(c, r):
        for name, _, _, _, (c0, r0, c1, r1) in p.rooms:
            if c0 <= c <= c1 and r0 <= r <= r1:
                return name
        return None

    furniture = p.furniture
    seats = {}
    for f in furniture:
        if f["type"] == "CUSHIONED_BENCH":
            seats.setdefault(room_of(f["col"], f["row"]), []).append((f["col"], f["row"]))
        elif f["type"].startswith("WOODEN_CHAIR_SIDE"):
            seats.setdefault(room_of(f["col"], f["row"] + 1), []).append((f["col"], f["row"] + 1))
        elif f["type"].startswith("SOFA"):
            seats.setdefault(room_of(f["col"], f["row"]), []).append((f["col"], f["row"]))
    errors = [f"{k}: {len(seats.get(k, []))} seats < {n}" for k, n in p.need.items() if len(seats.get(k, [])) < n]
    if None in seats:
        errors.append(f"seats outside every room: {seats[None]}")
    for f in furniture:
        if f["row"] > 0 and tiles[idx(f["col"], f["row"])] in (WALL, VOID):
            errors.append(f"{f['type']} at {f['col']},{f['row']} is not on a floor")

    # Furniture footprints from the catalog: no two floor pieces overlap (surface items sit on desks),
    # none sticks out of the floor, and the walk test below treats them as blocked (the top
    # `backgroundTiles` rows stay walkable).
    catalog = {e["id"]: e for e in json.loads((ROOT / "public" / "assets" / "furniture-catalog.json").read_text(encoding="utf-8"))}
    blocked = {}
    for f in furniture:
        e = catalog.get(f["type"].split(":")[0])
        if e is None:
            errors.append(f"unknown furniture {f['type']} (run: python scripts/gen-furniture.py; npm run assets)")
            continue
        if e.get("canPlaceOnSurfaces") or e.get("category") == "wall":
            continue
        for dr in range(e.get("backgroundTiles", 0), e["footprintH"]):
            for dc in range(e["footprintW"]):
                key = (f["col"] + dc, f["row"] + dr)
                if key in blocked:
                    errors.append(f"{f['type']} at {f['col']},{f['row']} overlaps {blocked[key]}")
                if tiles[idx(*key)] in (WALL, VOID):
                    errors.append(f"{f['type']} at {f['col']},{f['row']} sticks into a wall at {key}")
                if key in p.doors:
                    errors.append(f"{f['type']} at {f['col']},{f['row']} blocks the doorway {key}")
                blocked[key] = f["type"]
    # Seats are where characters sit, so they count as reachable targets, not as walls.
    seat_tiles = {xy for v in seats.values() for xy in v}

    # Flood fill over floor tiles (walls, void, furniture block) from Studio head: every room and
    # every seat is reachable.
    start = idx(*p.start)
    seen, todo = {start}, [start]
    while todo:
        i = todo.pop()
        c, r = i % cols, i // cols
        if (c, r) in seat_tiles:
            continue  # a seat is a place to sit, not a way through
        for dc, dr in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            cc, rr = c + dc, r + dr
            j = idx(cc, rr)
            if 0 <= cc < cols and 0 <= rr < rows and j not in seen and tiles[j] not in (WALL, VOID) and ((cc, rr) not in blocked or (cc, rr) in seat_tiles):
                seen.add(j)
                todo.append(j)
    for name, _, _, _, (c0, r0, c1, r1) in p.rooms:
        if not any(idx(c, r) in seen for c in range(c0, c1 + 1) for r in range(r0, r1 + 1)):
            errors.append(f"room {name} is not reachable")
    for room, xy in ((k, xy) for k, v in seats.items() for xy in v):
        if idx(*xy) not in seen:
            errors.append(f"seat {xy} in {room} is not reachable")
    if errors:
        sys.exit(f"gen-studio-layout ({p.file}): " + "; ".join(errors))

    layout = {
        "version": 1,
        "cols": cols,
        "rows": rows,
        "layoutRevision": 1,
        "tiles": tiles,
        "tileColors": colors,
        "furniture": furniture,
        "areas": areas,
        "areaTiles": area_tiles,
    }
    out = OUT_DIR / p.file
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(layout, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{out.relative_to(ROOT)}: {cols}x{rows}, {len(furniture)} furniture, "
          + ", ".join(f"{k} {len(v)}" for k, v in sorted(seats.items(), key=lambda kv: str(kv[0]))))


if __name__ == "__main__":
    for plan in (game_studio(), video_studio()):
        build(plan)
