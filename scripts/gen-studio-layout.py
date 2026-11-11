#!/usr/bin/env python3
"""Generate the studio floor plans (Theme Studio) and the room templates in public/assets/.

Every plan is a set of rooms. Each department room is an Area whose label names the department, so
sub-agents of that department take a desk there (src/office/webview/src/office/engine/departments.ts).
"Studio head" has no Area: main sessions sit there first (unzoned seats) and rest in the Pantry when
their turn is done. Rooms are furnished by the same room templates the app offers in Theme Studio →
Add a room, so a plan and an added room look alike. Uses only furniture from public/assets/furniture.

Game studio, theme "Campus" — layouts/game-campus.json, one room per department, walls and doors:

    +----------------+------------+------------------+
    | Ban giam doc   | Phong hop  | Release & ops    |
    +----------------+------------+------------------+
    | Design         | Studio head| Engineering      |
    +----------------+------------+------------------+
    | Narrative      | Pantry     | Engine lab       |
    +--------+-------+---+--------+------------------+
    | Loc &  | Art       | Audio  | QA               |
    +--------+-----------+--------+------------------+

Game studio, theme "Open Floor" — layouts/game-open.json, an executive wing with walls on the left,
the departments on one open floor (Areas and floor colours, no walls between them):

    +-------------+--------------------+---------------+
    | Ban giam doc| Engineering        | Design        |
    +-------------+-------+-----+------+---+-----------+
    | Phong hop   | Engine| Art |Audio |Narrative      |
    +-------------+-------+-----+------+---+-----------+
    | Studio head | Pantry       | QA     | Release    |
    +-------------+              |        |            |
    | Loc & comm. |              |        |            |
    +-------------+--------------+--------+------------+

Video studio — layouts/video-studio.json (unchanged since 0.3.0).

Room templates — rooms/room-templates.json: the rooms Theme Studio adds into a studio's floor
(src/lib/rooms.ts stamps them). Each one has its size, floor, Area colour and furniture relative to
its top-left floor tile; wall decor has negative rows (it hangs on the wall above the room).

Run:  python scripts/gen-studio-layout.py      (stdlib only; needs public/assets/furniture-catalog.json,
      so run `npm run assets` first after adding furniture)
A new kind of studio = one more plan here, its departments in departments.ts and an entry in
src/lib/studios.ts. A new room template = one more entry in TEMPLATES.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "assets" / "layouts"
ROOMS_OUT = ROOT / "public" / "assets" / "rooms" / "room-templates.json"

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
    "cream": (9, {"h": 40, "s": 30, "b": -10, "c": -20}),
}

CATALOG = {e["id"]: e for e in json.loads((ROOT / "public" / "assets" / "furniture-catalog.json").read_text(encoding="utf-8"))}


def entry(kind):
    e = CATALOG.get(kind.split(":")[0])
    if e is None:
        sys.exit(f"unknown furniture {kind} (run: python scripts/gen-furniture.py; npm run assets)")
    return e


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
        self.extra_areas = list(extra_areas)
        # Doorways: (col, row) floor tiles cut through walls. Declare them before the furniture.
        self.doors = []
        self.furniture = []
        self.blocked = {}  # floor tile -> furniture type standing on it (characters cannot walk there)
        self.occupied = set()  # every floor tile under a piece, background rows too (nothing else goes there)
        self.walled = set()  # wall tiles holding wall decor

    def rect(self, name):
        return next(r[4] for r in self.rooms if r[0] == name)

    def room_at(self, c, r):
        for name, _, _, _, (c0, r0, c1, r1) in self.rooms:
            if c0 <= c <= c1 and r0 <= r <= r1:
                return name
        return None

    def door_v(self, col, row):  # 2 tall, in a vertical wall
        self.doors.extend([(col, row), (col, row + 1)])

    def door_h(self, col, row):  # 2 wide, in a horizontal wall
        self.doors.extend([(col, row), (col + 1, row)])

    def fits(self, kind, col, row):
        """Can `kind` stand at (col, row)? Floor pieces need free floor (their background rows may be
        any floor), wall decor needs the wall right above a room and nothing between, surface items
        are the caller's business (they go on a desk it just placed)."""
        e = entry(kind)
        fw, fh = e["footprintW"], e["footprintH"]
        if e.get("canPlaceOnSurfaces"):
            return True
        if e.get("category") == "wall":
            cells = [(col + dc, row + dr) for dc in range(fw) for dr in range(fh)]
            if row < 0 or col < 0 or col + fw > self.cols:
                return False
            if any(cell in self.walled or self.room_at(*cell) or cell in self.doors for cell in cells):
                return False
            return all(self.room_at(col + dc, row + fh) for dc in range(fw))
        for dr in range(fh):
            for dc in range(fw):
                cell = (col + dc, row + dr)
                if not self.room_at(*cell) or cell in self.doors:
                    return False
                if cell in self.occupied:
                    return False
        return True

    def put(self, kind, col, row):
        """Place a piece; it must fit (a plan that does not fit is a bug in this script)."""
        if not self.fits(kind, col, row):
            sys.exit(f"{self.file}: {kind} does not fit at {col},{row}")
        self._place(kind, col, row)

    def try_put(self, kind, col, row):
        if self.fits(kind, col, row):
            self._place(kind, col, row)
            return True
        return False

    def _place(self, kind, col, row):
        e = entry(kind)
        self.furniture.append({"uid": f"st-{len(self.furniture) + 1:03d}", "type": kind, "col": col, "row": row})
        if e.get("canPlaceOnSurfaces"):
            return
        if e.get("category") == "wall":
            for dc in range(e["footprintW"]):
                for dr in range(e["footprintH"]):
                    self.walled.add((col + dc, row + dr))
            return
        for dr in range(e["footprintH"]):
            for dc in range(e["footprintW"]):
                self.occupied.add((col + dc, row + dr))
                if dr >= e.get("backgroundTiles", 0):
                    self.blocked[(col + dc, row + dr)] = kind

    # ---- pieces ------------------------------------------------------------------------------
    def pod(self, col, row, pc="PC_FRONT_OFF"):
        """Workstation, 3 x 3: desk (3x2) with a PC, a bench below it. One seat at (col+1, row+2)."""
        self.put("DESK_FRONT", col, row)
        self.put(pc, col + 1, row)
        self.put("CUSHIONED_BENCH", col + 1, row + 2)

    def pod_fits(self, col, row):
        return self.fits("DESK_FRONT", col, row) and self.fits("CUSHIONED_BENCH", col + 1, row + 2)

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


# ---- room templates: furnish one room's interior (c0, r0, c1, r1) --------------------------------
def pods(p, rect, n=99, pc="PC_FRONT_OFF", row_step=3, first_row=1, last_col_gap=0):
    """Rows of workstations from the top-left, a free column between them. Returns how many."""
    c0, r0, c1, r1 = rect
    placed = 0
    for r in range(r0 + first_row, r1 - 1, row_step):
        for c in range(c0 + 1, c1 - 1 - last_col_gap, 4):
            if placed >= n:
                return placed
            if p.pod_fits(c, r):
                p.pod(c, r, pc)
                placed += 1
    return placed


def decor(p, rect, kinds, edge="bottom"):
    """Put each piece in the first free spot along an edge, skipping spots that would sit in a
    doorway's way (one tile clear of every door)."""
    c0, r0, c1, r1 = rect
    near_door = {(dc + x, dr + y) for dc, dr in p.doors for x in (-1, 0, 1) for y in (-1, 0, 1)}
    for kind in kinds:
        e = entry(kind)
        fw, fh = e["footprintW"], e["footprintH"]
        if edge == "bottom":
            spots = [(c, r1 - fh + 1) for c in range(c1 - fw + 1, c0 - 1, -1)]
        elif edge == "right":
            spots = [(c1 - fw + 1, r) for r in range(r1 - fh + 1, r0 - 1, -1)]
        elif edge == "left":
            spots = [(c0, r) for r in range(r1 - fh + 1, r0 - 1, -1)]
        else:  # wall: decor on the wall above the room
            spots = [(c, r0 - fh) for c in range(c0, c1 - fw + 2)]
        for c, r in spots:
            cells = {(c + dc, r + dr) for dc in range(fw) for dr in range(fh)}
            if cells & near_door:
                continue
            if p.try_put(kind, c, r):
                break


def wall_decor(p, rect, kinds):
    decor(p, rect, kinds, edge="wall")


def t_dept(p, rect, pc="PC_FRONT_OFF"):
    pods(p, rect, pc=pc)
    decor(p, rect, ["PLANT", "BIN"], "left")
    wall_decor(p, rect, ["SMALL_PAINTING", "CLOCK"])


def t_head(p, rect):
    pods(p, rect, pc="PC_FRONT_ON_1", row_step=4)
    decor(p, rect, ["WATER_COOLER", "PLANT"], "left")
    wall_decor(p, rect, ["WHITEBOARD", "CLOCK"])


def t_directors(p, rect):
    pods(p, rect, n=3, row_step=4)
    decor(p, rect, ["LARGE_PLANT", "PLANT", "POT"], "bottom")
    wall_decor(p, rect, ["DOUBLE_BOOKSHELF", "LARGE_PAINTING", "DOUBLE_BOOKSHELF"])


def t_meeting(p, rect):
    c0, r0, c1, r1 = rect
    tables = 0
    for c in range(c0 + 1, c1 - 3, 5):
        for r in range(r0 + 1, r1 - 2, 5):
            if all(p.fits(k, c + dc, r + dr) for k, dc, dr in (("TABLE_FRONT", 1, 0), ("WOODEN_CHAIR_SIDE", 0, 0), ("WOODEN_CHAIR_SIDE", 4, 2))):
                p.team_table(c, r)
                tables += 1
    decor(p, rect, ["PLANT_2", "PLANT_2"], "bottom")
    wall_decor(p, rect, ["WHITEBOARD", "CLOCK"])


def t_pantry(p, rect):
    c0, r0, c1, r1 = rect
    for c in range(c0 + 1, c1 - 2, 5):
        if all(p.fits(k, c + dc, r0 + 1 + dr) for k, dc, dr in (("SOFA_SIDE", 0, 1), ("COFFEE_TABLE", 1, 1), ("SOFA_SIDE", 3, 1), ("SOFA_BACK", 1, 3), ("SOFA_FRONT", 1, 0))):
            p.sofa_set(c, r0 + 1)
    # Kitchen strip along the bottom wall: fridge, vending machine, water, coffee, a game.
    decor(p, rect, ["FRIDGE", "VENDING_MACHINE", "WATER_COOLER", "ARCADE", "PLANT"], "bottom")
    c = c0 + 1
    if r1 - r0 >= 6 and p.try_put("SMALL_TABLE_FRONT", c, r1 - 2):
        p.put("COFFEE", c, r1 - 2)
    wall_decor(p, rect, ["LARGE_PAINTING", "CLOCK"])


def t_lab(p, rect):
    pods(p, rect, last_col_gap=1)
    decor(p, rect, ["SERVER_RACK"] * 4, "right")
    wall_decor(p, rect, ["CLOCK"])


def t_art(p, rect):
    pods(p, rect, n=4)
    decor(p, rect, ["EASEL", "EASEL", "CACTUS"], "bottom")
    wall_decor(p, rect, ["LARGE_PAINTING", "SMALL_PAINTING_2"])


def t_audio(p, rect):
    pods(p, rect, n=3, last_col_gap=1)
    decor(p, rect, ["SPEAKER", "SPEAKER"], "right")
    decor(p, rect, ["PLANT_2"], "left")
    wall_decor(p, rect, ["CLOCK"])


def t_qa(p, rect):
    pods(p, rect)
    decor(p, rect, ["TEST_RIG", "TEST_RIG", "BIN"], "bottom")
    wall_decor(p, rect, ["WHITEBOARD"])


def t_empty(p, rect):
    decor(p, rect, ["PLANT"], "left")


# id, label, zone, (w, h), floor, area colour, furnish, fewest seats
TEMPLATES = [
    ("dept-s", "Phòng ban nhỏ", "dept", (9, 7), "teal", "#5dcaa5", t_dept, 2),
    ("dept-m", "Phòng ban vừa", "dept", (13, 9), "wood", "#5dcaa5", t_dept, 6),
    ("dept-l", "Phòng ban lớn", "dept", (16, 11), "rust", "#d85a30", t_dept, 10),
    ("directors", "Ban giám đốc", "directors", (13, 8), "plum", "#7f77dd", t_directors, 3),
    ("meeting", "Phòng họp", "meeting", (12, 8), "slate", "#afa9ec", t_meeting, 8),
    ("pantry", "Pantry", "pantry", (12, 9), "cream", "#e0a75e", t_pantry, 6),
    ("head", "Studio head", "head", (12, 10), "blue", None, t_head, 6),
    ("lab", "Lab / Server", "dept", (13, 9), "rust", "#f0997b", t_lab, 4),
    ("art", "Xưởng Art", "dept", (10, 8), "wood", "#ed93b1", t_art, 2),
    ("audio", "Phòng thu", "dept", (8, 9), "slate", "#85b7eb", t_audio, 2),
    ("qa", "Phòng test / QA", "dept", (13, 8), "tile", "#97c459", t_qa, 4),
    ("empty", "Phòng trống", "dept", (10, 8), "wood", "#b4b2a9", t_empty, 0),
]


# ---- Game studio, theme Campus -------------------------------------------------------------------
def game_campus():
    p = Plan(
        "game-campus.json", 46, 41,
        rooms=[
            ("directors", "Ban giám đốc", "#7f77dd", "plum", (1, 2, 14, 9)),
            ("meeting", "Phòng họp", "#afa9ec", "slate", (16, 2, 27, 9)),
            ("release", "Release & ops", "#1d9e75", "teal", (29, 2, 44, 9)),
            ("design", "Design", "#5dcaa5", "wood", (1, 11, 14, 20)),
            ("head", None, None, "blue", (16, 11, 27, 20)),
            ("engineering", "Engineering", "#d85a30", "rust", (29, 11, 44, 20)),
            ("narrative", "Narrative", "#9fe1cb", "moss", (1, 22, 14, 30)),
            ("pantry", "Pantry", "#e0a75e", "cream", (16, 22, 27, 30)),
            ("engine", "Engine lab", "#f0997b", "rust", (29, 22, 44, 30)),
            ("community", "Loc & community", "#ef9f27", "teal", (1, 32, 9, 39)),
            ("art", "Art", "#ed93b1", "wood", (11, 32, 20, 39)),
            ("audio", "Audio", "#85b7eb", "slate", (22, 32, 27, 39)),
            ("qa", "QA", "#97c459", "tile", (29, 32, 44, 39)),
        ],
        need={"directors": 3, "meeting": 8, "release": 3, "design": 7, "head": 6, "engineering": 10, "narrative": 3,
              "pantry": 6, "engine": 6, "community": 2, "art": 2, "audio": 2, "qa": 4},
        start=(20, 15),
        # The editor desk (Engine lab's PC-on pod): one agent at a time, while it calls the engine editor.
        extra_areas=[("Editor desk", "#f5c4b3", (42, 27, 44, 29))],
    )
    # Row 1 side by side, and down into row 2.
    p.door_v(15, 5), p.door_v(28, 5)
    p.door_h(7, 10), p.door_h(21, 10), p.door_h(36, 10)
    # Row 2, and down into row 3 (Pantry under Studio head: main sessions rest one door away).
    p.door_v(15, 15), p.door_v(28, 15)
    p.door_h(5, 21), p.door_h(21, 21), p.door_h(36, 21)
    # Row 3, and down into row 4.
    p.door_v(15, 26), p.door_v(28, 26)
    p.door_h(4, 31), p.door_h(12, 31), p.door_h(24, 31), p.door_h(36, 31)
    # Row 4.
    p.door_v(10, 35), p.door_v(21, 35), p.door_v(28, 35)

    t_directors(p, p.rect("directors"))
    t_meeting(p, p.rect("meeting"))
    pods(p, p.rect("release"), n=3, row_step=4)
    decor(p, p.rect("release"), ["SERVER_RACK"] * 4, "right")
    wall_decor(p, p.rect("release"), ["SMALL_PAINTING", "CLOCK", "SMALL_PAINTING_2"])
    t_dept(p, p.rect("design"))
    t_head(p, p.rect("head"))
    t_dept(p, p.rect("engineering"))
    pods(p, p.rect("narrative"), n=6)
    decor(p, p.rect("narrative"), ["LARGE_PLANT", "POT"], "bottom")
    t_pantry(p, p.rect("pantry"))
    # Engine lab: specialist desks and the editor desk (Unreal MCP takes one call at a time).
    p.pod(42, 27, "PC_FRONT_ON_2")
    pods(p, p.rect("engine"), n=6, last_col_gap=1)
    decor(p, p.rect("engine"), ["SERVER_RACK", "PLANT"], "left")
    t_dept(p, p.rect("community"))
    t_art(p, p.rect("art"))
    t_audio(p, p.rect("audio"))
    t_qa(p, p.rect("qa"))
    return p


# ---- Game studio, theme Open Floor ---------------------------------------------------------------
def game_open():
    p = Plan(
        "game-open.json", 46, 37,
        rooms=[
            # Executive wing (walls).
            ("directors", "Ban giám đốc", "#7f77dd", "plum", (1, 2, 12, 9)),
            ("meeting", "Phòng họp", "#afa9ec", "slate", (1, 11, 12, 18)),
            ("head", None, None, "blue", (1, 20, 12, 27)),
            ("community", "Loc & community", "#ef9f27", "teal", (1, 29, 12, 35)),
            # Open floor: rooms touch, so there is no wall between them.
            ("engineering", "Engineering", "#d85a30", "rust", (14, 2, 29, 12)),
            ("design", "Design", "#5dcaa5", "wood", (30, 2, 44, 12)),
            ("engine", "Engine lab", "#f0997b", "slate", (14, 13, 23, 23)),
            ("art", "Art", "#ed93b1", "wood", (24, 13, 31, 23)),
            ("audio", "Audio", "#85b7eb", "tile", (32, 13, 37, 23)),
            ("narrative", "Narrative", "#9fe1cb", "moss", (38, 13, 44, 23)),
            ("pantry", "Pantry", "#e0a75e", "cream", (14, 24, 27, 35)),
            ("qa", "QA", "#97c459", "tile", (28, 24, 36, 35)),
            ("release", "Release & ops", "#1d9e75", "teal", (37, 24, 44, 35)),
        ],
        need={"directors": 3, "meeting": 8, "head": 6, "community": 2, "engineering": 10, "design": 7, "engine": 6,
              "art": 2, "audio": 2, "narrative": 3, "pantry": 6, "qa": 4, "release": 3},
        start=(5, 26),
        extra_areas=[("Editor desk", "#f5c4b3", (19, 20, 21, 22))],
    )
    # Wing: down the corridor of doors, and each room out to the open floor.
    p.door_h(6, 10), p.door_h(6, 19), p.door_h(6, 28)
    p.door_v(13, 5), p.door_v(13, 15), p.door_v(13, 25), p.door_v(13, 31)

    t_directors(p, p.rect("directors"))
    t_meeting(p, p.rect("meeting"))
    t_head(p, p.rect("head"))
    pods(p, p.rect("community"), n=3, row_step=4)
    decor(p, p.rect("community"), ["PLANT_2", "BIN"], "bottom")
    # Open floor: desks start one tile in from each edge, so the aisles join up.
    pods(p, p.rect("engineering"))
    wall_decor(p, p.rect("engineering"), ["WHITEBOARD", "CLOCK", "SMALL_PAINTING"])
    pods(p, p.rect("design"))
    wall_decor(p, p.rect("design"), ["LARGE_PAINTING", "SMALL_PAINTING_2"])
    p.pod(19, 20, "PC_FRONT_ON_2")  # the editor desk
    pods(p, p.rect("engine"), n=5)
    t_art(p, p.rect("art"))
    pods(p, p.rect("audio"), n=2)
    decor(p, p.rect("audio"), ["SPEAKER", "SPEAKER"], "bottom")
    pods(p, p.rect("narrative"), n=3)
    t_pantry(p, p.rect("pantry"))
    pods(p, p.rect("qa"), n=4)
    decor(p, p.rect("qa"), ["TEST_RIG", "TEST_RIG"], "bottom")
    pods(p, p.rect("release"), n=4)
    decor(p, p.rect("release"), ["SERVER_RACK", "SERVER_RACK"], "bottom")
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
def seats_of(p):
    """Seat tiles per room: a bench, each tile of a sofa, the seat tile of a wooden chair."""
    seats = {}
    for f in p.furniture:
        t = f["type"]
        e = entry(t)
        if e.get("category") != "chairs":
            continue
        bg = e.get("backgroundTiles", 0)
        for dr in range(bg, e["footprintH"]):
            for dc in range(e["footprintW"]):
                xy = (f["col"] + dc, f["row"] + dr)
                seats.setdefault(p.room_at(*xy), []).append(xy)
    return seats


def build(p, write=True):
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
    seats = seats_of(p)
    errors = [f"{k}: {len(seats.get(k, []))} seats < {n}" for k, n in p.need.items() if len(seats.get(k, [])) < n]
    if None in seats:
        errors.append(f"seats outside every room: {seats[None]}")
    seat_tiles = {xy for v in seats.values() for xy in v}

    # Flood fill over floor tiles (walls, void, furniture block) from the start: every room and
    # every seat is reachable. A seat is a place to sit, not a way through.
    start = idx(*p.start)
    if p.start in p.blocked or tiles[start] in (WALL, VOID):
        errors.append(f"start {p.start} is not free floor")
    seen, todo = {start}, [start]
    while todo:
        i = todo.pop()
        c, r = i % cols, i // cols
        if (c, r) in seat_tiles:
            continue
        for dc, dr in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            cc, rr = c + dc, r + dr
            j = idx(cc, rr)
            if 0 <= cc < cols and 0 <= rr < rows and j not in seen and tiles[j] not in (WALL, VOID) and ((cc, rr) not in p.blocked or (cc, rr) in seat_tiles):
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
        "furniture": p.furniture,
        "areas": areas,
        "areaTiles": area_tiles,
    }
    if write:
        out = OUT_DIR / p.file
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(layout, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        print(f"{out.relative_to(ROOT)}: {cols}x{rows}, {len(p.furniture)} furniture, "
              + ", ".join(f"{k} {len(v)}" for k, v in sorted(seats.items(), key=lambda kv: str(kv[0]))))
    return layout, seats


def build_templates():
    """Each template furnished in a room of its own (a wall ring and a void row for wall decor), then
    saved relative to its top-left floor tile."""
    out = []
    for tid, label, zone, (w, h), floor, color, furnish, need in TEMPLATES:
        # Interior from (1, 2); a door in the left wall so the reachability check has a way in.
        p = Plan(f"room {tid}", w + 2, h + 3, rooms=[(tid, label, color, floor, (1, 2, w, h + 1))],
                 need={tid: need}, start=(0, h + 1))
        p.rooms.append(("door", None, None, floor, (0, h, 0, h + 1)))
        p.doors.extend([(0, h), (0, h + 1)])
        furnish(p, (1, 2, w, h + 1))
        build(p, write=False)
        tile, tile_color = FLOORS[floor]
        seats = seats_of(p).get(tid, [])
        out.append({
            "id": tid, "label": label, "zone": zone, "w": w, "h": h,
            "floor": tile, "floorColor": tile_color, "areaColor": color, "seats": len(seats),
            "furniture": [{"type": f["type"], "col": f["col"] - 1, "row": f["row"] - 2} for f in p.furniture],
        })
        print(f"room template {tid}: {w}x{h}, {len(p.furniture)} furniture, {len(seats)} seats")
    ROOMS_OUT.parent.mkdir(parents=True, exist_ok=True)
    ROOMS_OUT.write_text(json.dumps({"version": 1, "rooms": out}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    for plan in (game_campus(), game_open(), video_studio()):
        build(plan)
    build_templates()
