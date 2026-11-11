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
        """Workstation, 3 x 3: desk (3x2) with a PC, a bench below it. One seat at (col+1, row+2).
        A plan with its own `kit` (desk, pc, chair) uses those pieces instead (the DC themes)."""
        kit = getattr(self, "kit", None)
        self.put(kit["desk"] if kit else "DESK_FRONT", col, row)
        self.put(kit["pc"] if kit else pc, col + 1, row)
        self.put(kit["chair"] if kit else "CUSHIONED_BENCH", col + 1, row + 2)

    def pod_fits(self, col, row):
        kit = getattr(self, "kit", None)
        return self.fits(kit["desk"] if kit else "DESK_FRONT", col, row) and self.fits(kit["chair"] if kit else "CUSHIONED_BENCH", col + 1, row + 2)

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


# ---- Special themes: the same floor plans, dressed for an occasion or a style ---------------------
# Each one is Campus or Open Floor room for room (same departments, seats, Pantry, Ban giám đốc), with
# its own floor and wall colours and themed pieces (scripts/gen-theme-furniture.py). A piece is only
# kept where every room and seat stays reachable. The effects over the floor (snow, petals, code
# rain…) are the app's (src/components/office/ThemeFx.tsx), named per theme in src/lib/studios.ts.
FLOOR_KEYS = ["wood", "blue", "tile", "plum", "teal", "rust", "moss", "slate", "cream"]


def col(h, s, b, c):
    return {"h": h, "s": s, "b": b, "c": c}


def palette(*entries):
    """Floor key -> (pattern, colour), the entries given in FLOOR_KEYS order (cycled)."""
    return {k: entries[i % len(entries)] for i, k in enumerate(FLOOR_KEYS)}


def free_tiles(p):
    floor = set()
    for _n, _l, _c, _f, (c0, r0, c1, r1) in p.rooms:
        floor |= {(c, r) for c in range(c0, c1 + 1) for r in range(r0, r1 + 1)}
    return floor | set(p.doors)


def reachable(p, floor):
    """Every room and every seat reachable from the start (the rule `build` checks)."""
    seats = seats_of(p)
    seat_tiles = {xy for v in seats.values() for xy in v}
    if p.start in p.blocked:
        return False
    seen, todo = {p.start}, [p.start]
    while todo:
        c, r = todo.pop()
        if (c, r) in seat_tiles:
            continue
        for dc, dr in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (c + dc, r + dr)
            if n in floor and n not in seen and (n not in p.blocked or n in seat_tiles):
                seen.add(n)
                todo.append(n)
    if not seat_tiles <= seen:
        return False
    return all(any((c, r) in seen for c in range(c0, c1 + 1) for r in range(r0, r1 + 1)) for _n, _l, _c, _f, (c0, r0, c1, r1) in p.rooms)


def scatter(p, room, kind, floor):
    """Put `kind` in the room where it blocks nobody: edges and corners first, never next to a door."""
    c0, r0, c1, r1 = p.rect(room)
    e = entry(kind)
    fw, fh = e["footprintW"], e["footprintH"]
    near_door = {(dc + x, dr + y) for dc, dr in p.doors for x in (-1, 0, 1) for y in (-1, 0, 1)}
    spots = [(c, r) for r in range(r0, r1 - fh + 2) for c in range(c0, c1 - fw + 2)]
    spots.sort(key=lambda cr: (min(cr[0] - c0, c1 - (cr[0] + fw - 1), cr[1] - r0, r1 - (cr[1] + fh - 1)), cr[1], cr[0]))
    for c, r in spots:
        cells = {(c + dc, r + dr) for dc in range(fw) for dr in range(fh)}
        if cells & near_door or not p.fits(kind, c, r):
            continue
        n, occupied, blocked = len(p.furniture), set(p.occupied), dict(p.blocked)
        p._place(kind, c, r)
        if reachable(p, floor):
            return True
        del p.furniture[n:]
        p.occupied, p.blocked = occupied, blocked
    return False


def dress(p, file, floors, wall, rooms=None, everywhere=(), walls=None, walls_everywhere=()):
    """Re-skin plan `p` as `file`: colours, then pieces per room, then pieces in every room."""
    p.file = file
    p.floors = floors
    p.wall_color = wall
    floor = free_tiles(p)
    names = [r[0] for r in p.rooms]
    for room, kinds in (rooms or {}).items():
        for kind in kinds:
            scatter(p, room, kind, floor)
    for room in names:
        for kind in everywhere:
            scatter(p, room, kind, floor)
    for room, kinds in (walls or {}).items():
        wall_decor(p, p.rect(room), kinds)
    for room in names:
        wall_decor(p, p.rect(room), list(walls_everywhere))
    return p


def christmas():
    return dress(
        game_campus(), "game-christmas.json",
        palette((7, col(355, 45, -42, -85)), (1, col(205, 18, 18, -70)), (1, col(205, 8, 30, -80)), (7, col(140, 38, -42, -85)),
                (5, col(200, 10, 22, -60)), (7, col(5, 50, -45, -85)), (1, col(130, 30, -38, -80)), (8, col(0, 45, -10, -30)),
                (9, col(32, 45, 0, -30))),
        col(355, 40, -100, -55),
        rooms={"head": ["XMAS_TREE", "GIFTS", "GIFTS", "SNOWMAN"], "pantry": ["XMAS_TREE", "GIFTS", "SNOWMAN"],
               "directors": ["XMAS_TREE", "GIFTS"], "meeting": ["GIFTS"]},
        everywhere=["GIFTS"],
        walls={"head": ["XMAS_LIGHTS"], "pantry": ["XMAS_LIGHTS"]},
        walls_everywhere=["WREATH", "XMAS_LIGHTS"],
    )


def halloween():
    return dress(
        game_campus(), "game-halloween.json",
        palette((7, col(25, 50, -58, -85)), (1, col(270, 30, -52, -80)), (6, col(110, 15, -55, -60)), (1, col(285, 40, -48, -80)),
                (8, col(260, 15, -50, -40)), (7, col(18, 45, -60, -85))),
        col(275, 35, -115, -55),
        rooms={"head": ["CAULDRON", "PUMPKIN", "PUMPKIN", "GRAVESTONE"], "pantry": ["CAULDRON", "PUMPKIN"],
               "directors": ["GRAVESTONE", "PUMPKIN"], "meeting": ["PUMPKIN"]},
        everywhere=["PUMPKIN", "GRAVESTONE"],
        walls={"head": ["BAT_GARLAND"], "pantry": ["BAT_GARLAND"]},
        walls_everywhere=["COBWEB", "BAT_GARLAND"],
    )


def tet():
    return dress(
        game_open(), "game-tet.json",
        palette((7, col(5, 52, -42, -85)), (4, col(42, 55, -5, -55)), (9, col(30, 30, 5, -65)), (1, col(350, 45, -38, -80)),
                (7, col(20, 45, -45, -85)), (9, col(45, 40, -12, -30))),
        col(0, 55, -95, -55),
        rooms={"head": ["PEACH_TREE", "KUMQUAT", "BANH_CHUNG"], "pantry": ["PEACH_TREE", "KUMQUAT", "BANH_CHUNG", "BANH_CHUNG"],
               "directors": ["PEACH_TREE", "KUMQUAT"], "meeting": ["KUMQUAT"], "community": ["KUMQUAT"]},
        everywhere=["BANH_CHUNG"],
        walls={"directors": ["COUPLET", "RED_LANTERN", "COUPLET"]},
        walls_everywhere=["RED_LANTERN", "COUPLET", "RED_LANTERN"],
    )


def cyberpunk():
    return dress(
        game_open(), "game-cyberpunk.json",
        palette((5, col(290, 40, -64, -55)), (1, col(190, 50, -60, -70)), (4, col(250, 30, -64, -55)), (1, col(310, 55, -56, -80)),
                (5, col(200, 40, -62, -55))),
        col(285, 45, -125, -55),
        rooms={"head": ["HOLO_TERMINAL", "NEON_PALM", "DATA_PILLAR"], "pantry": ["NEON_PALM", "NEON_PALM", "HOLO_TERMINAL"],
               "directors": ["HOLO_TERMINAL", "NEON_PALM"], "meeting": ["HOLO_TERMINAL"]},
        everywhere=["DATA_PILLAR", "NEON_PALM"],
        walls={"directors": ["NEON_SIGN"], "head": ["NEON_SIGN"]},
        walls_everywhere=["NEON_SIGN"],
    )


def matrix():
    return dress(
        game_campus(), "game-matrix.json",
        palette((4, col(130, 50, -74, -60)), (1, col(125, 40, -70, -80)), (5, col(140, 40, -76, -60)), (4, col(120, 30, -72, -60))),
        col(130, 40, -135, -55),
        rooms={"head": ["CRT_STACK", "CRT_STACK", "RETRO_PHONE"], "pantry": ["RETRO_PHONE", "CRT_STACK"],
               "directors": ["CRT_STACK"], "meeting": ["RETRO_PHONE"]},
        everywhere=["CRT_STACK"],
        walls={"head": ["CODE_SCREEN"], "meeting": ["CODE_SCREEN"]},
        walls_everywhere=["CODE_SCREEN"],
    )


def aquarium():
    return dress(
        game_open(), "game-aquarium.json",
        palette((1, col(42, 40, 5, -80)), (1, col(200, 55, -30, -80)), (5, col(185, 45, -25, -55)), (1, col(220, 50, -40, -80)),
                (1, col(40, 35, -5, -80)), (4, col(190, 50, -35, -60))),
        col(205, 55, -90, -55),
        rooms={"head": ["FISH_TANK", "CORAL", "SEAWEED"], "pantry": ["FISH_TANK", "TREASURE_CHEST", "CORAL", "SEAWEED"],
               "directors": ["FISH_TANK", "SEAWEED"], "meeting": ["CORAL"]},
        everywhere=["SEAWEED", "CORAL"],
        walls_everywhere=["PORTHOLE", "PORTHOLE"],
    )


def hall_of_justice():
    """DC — Hall of Justice, after the Super Friends' hall and the comics: a marble Great Hall with the
    founders' statues and their fountain, the Round Table under the alert monitor, and a wing per hero's
    legacy. Its own map and art (scripts/gen-dc-furniture.py); every department of Campus is here, named
    "<room> · <department>" so its agents still find it.

        +---------------+------------------------+---------------+
        | Founders'     | Round Table            | Teleporter    |
        | Chamber       | (Phong hop)            | Bay (Release) |
        +---------------+------------------------+---------------+
        | Themyscira    | GREAT HALL             | Cyborg's Lab  |
        | (Design)      | statues, fountain,     | (Engineering) |
        +---------------+ consoles (Studio head) |               |
        | Hall of       |                        +---------------+
        | History       +------------------------+ Speed Lab     |
        +---------------+ Trophy Room (Pantry)   | (Engine lab)  |
        | Hall of       | Starro                 |               |
        | Heroes (Loc)  +----------+------+------+---------------+
        |               | Rock of  |Atlan-| Lantern Corps (QA)   |
        |               | Eternity |tis   |                      |
        +---------------+----------+------+----------------------+
    """
    p = Plan(
        "dc-hall-of-justice.json", 54, 49,
        rooms=[
            ("directors", "Founders' Chamber · Ban giám đốc", "#7f77dd", "marble_blue", (1, 2, 13, 10)),
            ("meeting", "Round Table · Phòng họp", "#afa9ec", "marble_blue", (15, 2, 38, 10)),
            ("release", "Teleporter Bay · Release & ops", "#1d9e75", "tech", (40, 2, 52, 10)),
            ("design", "Themyscira Hall · Design", "#5dcaa5", "marble", (1, 12, 13, 22)),
            ("head", None, None, "star", (15, 12, 38, 27)),
            ("engineering", "Cyborg's Lab · Engineering", "#d85a30", "tech", (40, 12, 52, 25)),
            ("narrative", "Hall of History · Narrative", "#9fe1cb", "history", (1, 24, 13, 31)),
            ("engine", "Speed Lab · Engine lab", "#f0997b", "speed", (40, 27, 52, 37)),
            ("pantry", "Trophy Room · Pantry", "#e0a75e", "marble", (15, 29, 38, 37)),
            ("community", "Hall of Heroes · Loc & community", "#ef9f27", "marble_blue", (1, 33, 13, 47)),
            ("art", "Rock of Eternity · Art", "#ed93b1", "rock", (15, 39, 24, 47)),
            ("audio", "Atlantis Grotto · Audio", "#85b7eb", "sea", (26, 39, 32, 47)),
            ("qa", "Lantern Corps · QA", "#97c459", "lantern", (34, 39, 52, 47)),
        ],
        need=CAMPUS_NEED, start=(26, 22),
        extra_areas=[("Editor desk", "#f5c4b3", (49, 34, 51, 36))],
    )
    p.kit = {"desk": "HOJ_DESK", "pc": "HOJ_MONITOR", "chair": "HOJ_CHAIR"}
    p.floors = {
        "marble": (12, col(40, 10, 18, -55)), "marble_blue": (12, col(220, 28, -22, -55)), "star": (13, col(42, 45, -8, -40)),
        "tech": (11, col(200, 14, -22, -50)), "history": (7, col(30, 40, -40, -85)), "speed": (1, col(0, 45, -36, -80)),
        "rock": (10, col(30, 8, -38, -40)), "sea": (10, col(195, 40, -36, -45)), "lantern": (12, col(130, 32, -36, -55)),
    }
    p.floors["blue"] = p.floors["marble_blue"]
    p.floors["wood"] = p.floors["marble"]
    p.wall_color = col(42, 18, -35, -55)
    put, pod = p.put, p.pod
    p.door_v(14, 5), p.door_v(39, 5)
    p.door_h(6, 11), p.door_h(25, 11), p.door_h(29, 11), p.door_h(45, 11)
    p.door_v(14, 16), p.door_v(39, 16)
    p.door_h(6, 23), p.door_v(14, 26), p.door_h(45, 26), p.door_h(26, 28)
    p.door_v(39, 33), p.door_h(6, 32), p.door_v(14, 34), p.door_v(14, 43)
    p.door_h(19, 38), p.door_h(28, 38), p.door_h(35, 38), p.door_h(45, 38)
    p.door_v(25, 43), p.door_v(33, 43)

    # Round Table: the founders' seats around it, the alert monitor above.
    put("HOJ_ROUND_TABLE", 24, 4)
    for c in range(25, 29):
        put("HOJ_THRONE", c, 3), put("HOJ_THRONE", c, 7)
    put("HOJ_THRONE", 23, 5), put("HOJ_THRONE", 30, 5)
    put("HOJ_TROUBALERT", 24, 0), put("HOJ_EMBLEM", 17, 0), put("HOJ_EMBLEM", 34, 0)
    for c in (15, 38):
        put("HOJ_PILLAR", c, 2), put("HOJ_PILLAR", c, 9)
    # Founders' Chamber.
    for c in (2, 6, 10):
        pod(c, 3)
    put("HOJ_CRYSTAL", 1, 8), put("HOJ_GLOBE", 11, 8)
    put("HOJ_EMBLEM", 6, 0)
    for c, h in ((2, "SUPERMAN"), (3, "BATMAN"), (10, "WONDER_WOMAN"), (11, "FLASH")):
        put(f"HOJ_BANNER_{h}", c, 1)
    # Teleporter Bay.
    for c in (41, 45, 49):
        pod(c, 3)
    put("HOJ_TELEPORTER", 42, 8), put("HOJ_TELEPORTER", 48, 8)
    put("HOJ_BANNER_MARTIAN_MANHUNTER", 41, 1), put("HOJ_BANNER_GREEN_ARROW", 51, 1)
    # Great Hall: consoles for the main sessions, the founders in marble, their fountain.
    pod(23, 13), pod(27, 13)
    for c in (19, 23, 27, 31):
        pod(c, 23)
    put("HOJ_FOUNTAIN", 25, 18)
    put("HOJ_STATUE_SUPERMAN", 20, 16), put("HOJ_STATUE_WONDER_WOMAN", 32, 16)
    for r, (left, right) in zip((12, 17, 22), (("BATMAN", "AQUAMAN"), ("FLASH", "MARTIAN_MANHUNTER"), ("GREEN_LANTERN", "CYBORG"))):
        put(f"HOJ_STATUE_{left}", 16, r), put(f"HOJ_STATUE_{right}", 36, r)
    for c in (19, 34):
        put("HOJ_PILLAR", c, 12), put("HOJ_PILLAR", c, 26)
    # Themyscira Hall (Wonder Woman).
    pods(p, p.rect("design"), n=7)
    put("HOJ_LASSO", 7, 20), put("HOJ_SHIELD", 11, 20)
    put("HOJ_BANNER_WONDER_WOMAN", 2, 11), put("HOJ_BANNER_WONDER_WOMAN", 10, 11)
    # Hall of History.
    for c in (2, 6, 10):
        pod(c, 25)
    put("HOJ_ARCHIVE", 2, 29), put("HOJ_ARCHIVE", 10, 29)
    # Cyborg's Lab.
    pods(p, p.rect("engineering"), n=10)
    put("HOJ_MOTHERBOX", 46, 23), put("HOJ_CRYSTAL", 50, 23)
    put("HOJ_BANNER_CYBORG", 42, 11), put("HOJ_BANNER_CYBORG", 50, 11)
    # Speed Lab (Flash): the editor desk, the cosmic treadmill, the winged helmet.
    pod(49, 34)
    pods(p, p.rect("engine"), n=6)
    put("HOJ_TREADMILL", 41, 35), put("HOJ_FLASH_HELMET", 46, 35)
    put("HOJ_BANNER_FLASH", 42, 26), put("HOJ_BANNER_FLASH", 50, 26)
    # Trophy Room (Pantry): tables, Starro, relics.
    for c in (21, 29):
        put("HOJ_TABLE", c, 32)
        for r in (32, 33):
            put("HOJ_STOOL", c - 1, r), put("HOJ_STOOL", c + 2, r)
    put("HOJ_STARRO", 34, 29), put("HOJ_PILLAR", 15, 29), put("HOJ_CRYSTAL", 17, 36), put("HOJ_GLOBE", 36, 35)
    # Hall of Heroes: more of the league in marble, everyone's banner.
    for c in (2, 6):
        pod(c, 34)
    put("HOJ_STATUE_GREEN_ARROW", 2, 41), put("HOJ_STATUE_HAWKMAN", 6, 41), put("HOJ_PILLAR", 11, 44)
    for c, h in ((2, "GREEN_ARROW"), (4, "HAWKMAN"), (9, "SHAZAM"), (11, "AQUAMAN")):
        put(f"HOJ_BANNER_{h}", c, 32)
    # Rock of Eternity (Shazam).
    for c in (16, 20):
        pod(c, 40)
    put("HOJ_SHAZAM_THRONE", 20, 44), put("HOJ_STATUE_SHAZAM", 15, 43)
    # Atlantis Grotto (Aquaman).
    pod(27, 40), pod(27, 43)
    put("HOJ_TRIDENT", 31, 40), put("HOJ_BANNER_AQUAMAN", 31, 38)
    # Lantern Corps (Green Lantern).
    for r in (40, 43):
        pod(35, r), pod(39, r)
    put("HOJ_LANTERN", 47, 40)
    for c in (38, 41, 50):
        put("HOJ_BANNER_GREEN_LANTERN", c, 38)
    return p


def batcave():
    """DC — the BatCave, after the films, the comics and the animated series: the cave computer with its
    giant main screen and the feeds where Batman watches all of Gotham, the suit tubes of the whole
    Bat-family (Jason's memorial suit among them), the trophy hall (T-rex, penny, Joker card), a full
    garage, and a room for each of the family. Its own map and art (scripts/gen-dc-furniture.py); every
    department of Campus is here as "<room> · <department>".

        +-----------+---------------------------------+-----------+
        | Bat-Family| THE CAVE COMPUTER               | Briefing  |
        | Council   | main screen + feeds, consoles   | Platform  |
        +-----------+ (Studio head)                   +-----------+
        | Nightwing +---------------------------------+ Lucius'   |
        | (Design)  | Armory: suit tubes              | Workshop  |
        |           +---------------------------------+ (Eng.)    |
        +-----------+ Trophy Hall (Pantry)            |           |
        | Case Files| T-rex, penny, Joker card, tea   +-----------+
        +----+------+--+------+------------+---------+ Forensics |
        |Ora-| Robin's  |Comms | Training   |          Lab        |
        |cle | Room(Art)|      | Ground (QA)+---------------------+
        |    |          |      |            | Waterfall Cavern     |
        +----+----------+------+------------+---------------------+
        | Batmobile Garage (Release & ops): car on its turntable, armoured car, cycle, jet   |
        +--------------------------------------------------------------------------------------+
    """
    p = Plan(
        "dc-batcave.json", 54, 58,
        rooms=[
            ("directors", "Bat-Family Council · Ban giám đốc", "#7f77dd", "rock", (1, 2, 13, 9)),
            ("head", None, None, "platform", (15, 2, 38, 13)),
            ("meeting", "Briefing Platform · Phòng họp", "#afa9ec", "platform", (40, 2, 52, 9)),
            ("design", "Nightwing's Room · Design", "#5dcaa5", "nightwing", (1, 11, 13, 22)),
            ("armory", "Armory", "#6b7280", "plate", (15, 14, 38, 18)),
            ("engineering", "Lucius' Workshop · Engineering", "#d85a30", "plate", (40, 11, 52, 24)),
            ("pantry", "Trophy Hall · Pantry", "#e0a75e", "trophy", (15, 19, 38, 30)),
            ("narrative", "Case Files · Narrative", "#9fe1cb", "rock", (1, 24, 13, 30)),
            ("engine", "Forensics Lab · Engine lab", "#f0997b", "lab", (40, 26, 52, 36)),
            ("community", "Oracle's Nest · Loc & community", "#ef9f27", "oracle", (1, 32, 9, 43)),
            ("art", "Robin's Room · Art", "#ed93b1", "robin", (11, 32, 19, 43)),
            ("audio", "Comms Room · Audio", "#85b7eb", "platform", (21, 32, 27, 43)),
            ("qa", "Training Ground · QA", "#97c459", "mats", (29, 32, 38, 43)),
            ("cavern", "Waterfall Cavern", "#4b6b8a", "wet", (40, 38, 52, 43)),
            ("release", "Batmobile Garage · Release & ops", "#1d9e75", "garage", (1, 45, 52, 56)),
        ],
        need=CAMPUS_NEED, start=(26, 13),
        extra_areas=[("Editor desk", "#f5c4b3", (49, 33, 51, 35))],
    )
    p.kit = {"desk": "BC_CONSOLE", "pc": "BC_MONITOR", "chair": "BC_CHAIR"}
    p.floors = {
        "rock": (10, col(25, 10, -52, -35)), "platform": (11, col(208, 30, -50, -40)), "plate": (11, col(215, 8, -46, -40)),
        "nightwing": (10, col(215, 38, -50, -40)), "trophy": (10, col(30, 16, -46, -35)), "lab": (4, col(190, 12, -18, -60)),
        "oracle": (4, col(140, 28, -55, -60)), "robin": (1, col(355, 45, -45, -80)), "mats": (5, col(30, 28, -45, -60)),
        "wet": (10, col(200, 22, -54, -35)), "garage": (11, col(40, 10, -48, -40)),
    }
    p.floors["blue"] = p.floors["platform"]
    p.floors["wood"] = p.floors["rock"]
    p.wall_color = col(220, 10, -128, -55)
    put, pod = p.put, p.pod
    p.door_v(14, 5), p.door_v(39, 5)
    p.door_h(6, 10), p.door_h(45, 10)
    p.door_v(14, 16), p.door_v(39, 16)
    p.door_h(6, 23), p.door_v(14, 27), p.door_h(45, 25), p.door_v(39, 28)
    p.door_h(4, 31), p.door_h(15, 31), p.door_h(24, 31), p.door_h(33, 31)
    p.door_v(10, 36), p.door_v(20, 36), p.door_v(28, 36), p.door_v(39, 40), p.door_h(45, 37)
    p.door_h(4, 44), p.door_h(15, 44), p.door_h(33, 44), p.door_h(45, 44)

    # The cave computer: the main screen over all of Gotham, the feeds beside it, servers, consoles.
    put("BC_MAIN_SCREEN", 22, 2)
    for c, kind in ((17, "C"), (19, "A"), (32, "B"), (34, "C")):
        put(f"BC_SIDE_SCREEN_{kind}", c, 2)
    put("BC_SERVER", 15, 2), put("BC_SERVER", 38, 2)
    for c in (19, 23, 27, 31):
        pod(c, 7)
    pod(23, 10), pod(27, 10)
    put("BC_WALL_MONITOR", 15, 1), put("BC_BAT_COLONY", 36, 1)
    # Armory: the suits of the family, Jason's memorial suit, the heavy armour.
    for c, suit in zip((16, 18, 20, 22, 31, 33, 35, 37), ("BATMAN", "ROBIN", "NIGHTWING", "BATGIRL", "BATWOMAN", "RED_HOOD", "MEMORIAL", "ARMOR")):
        put(f"BC_SUIT_{suit}", c, 14)
    # Bat-Family Council.
    for c in (2, 6, 10):
        pod(c, 3)
    put("BC_COWL_BUST", 1, 8), put("BC_SERVER", 13, 8)
    put("BC_WALL_MONITOR", 2, 1), put("BC_STALACTITES", 9, 1)
    # Briefing Platform: the holo table of Gotham.
    put("BC_BRIEF_TABLE", 44, 5)
    for c in range(44, 48):
        put("BC_STOOL", c, 4), put("BC_STOOL", c, 7)
    put("BC_WALL_MONITOR", 41, 1), put("BC_WALL_MONITOR", 49, 1), put("BC_SERVER", 52, 2)
    # Nightwing's Room.
    pods(p, p.rect("design"), n=7)
    put("BC_RINGS", 8, 19), put("BC_STALAGMITE", 12, 21)
    put("BC_NW_EMBLEM", 2, 10), put("BC_ESCRIMA", 10, 10), put("BC_ESCRIMA", 12, 10)
    # Lucius' Workshop.
    pods(p, p.rect("engineering"), n=10)
    put("BC_WORKBENCH", 46, 22)
    put("BC_TOOL_WALL", 41, 10), put("BC_BATARANGS", 49, 10), put("BC_BATARANGS", 51, 10)
    # Trophy Hall (Pantry): the T-rex, the penny, the card; Alfred's tea.
    put("BC_TREX", 16, 19), put("BC_JOKER_CARD", 32, 19), put("BC_PENNY", 35, 19)
    for c in (22, 29):
        put("BC_TEA_TABLE", c, 24)
        for r in (24, 25):
            put("BC_STOOL", c - 1, r), put("BC_STOOL", c + 2, r)
    put("BC_TEA_CART", 19, 29), put("BC_STALAGMITE", 37, 28), put("BC_ROCKS", 38, 30)
    # Case Files.
    for c in (2, 6, 10):
        pod(c, 25)
    put("BC_EVIDENCE", 1, 29), put("BC_EVIDENCE", 12, 29)
    put("BC_CASE_BOARD", 2, 23), put("BC_CASE_BOARD", 9, 23)
    # Forensics Lab: the editor desk first.
    pod(49, 33)
    pods(p, p.rect("engine"), n=6)
    put("BC_CENTRIFUGE", 52, 27), put("BC_EVIDENCE", 52, 30)
    put("BC_CHEM_SHELF", 41, 25), put("BC_CHEM_SHELF", 49, 25)
    # Oracle's Nest.
    pod(2, 33), pod(6, 33)
    put("BC_ORACLE", 2, 38), put("BC_STALAGMITE", 8, 41)
    # Robin's Room.
    pod(12, 33), pod(16, 33)
    put("BC_BUNK", 12, 40), put("BC_DUMMY", 18, 40)
    put("BC_ROBIN_EMBLEM", 12, 31), put("BC_ROBIN_EMBLEM", 18, 31)
    # Comms Room.
    pod(22, 33), pod(22, 36)
    put("BC_RADIO", 26, 33), put("BC_RADIO", 26, 40)
    # Training Ground.
    for r in (33, 36):
        pod(30, r), pod(34, r)
    put("BC_SALMON_LADDER", 38, 33)
    for c in (30, 32, 36):
        put("BC_DUMMY", c, 41)
    # Waterfall Cavern: the falls, the bats.
    put("BC_WATERFALL", 47, 38), put("BC_STALAGMITE", 41, 41), put("BC_ROCKS", 43, 43), put("BC_STALAGMITE", 52, 42)
    put("BC_BAT_COLONY", 48, 37)
    # Batmobile Garage: the car on its turntable, the armoured car, the cycle, the jet, the bench.
    put("BC_TUMBLER", 8, 47), put("BC_BATMOBILE", 19, 48), put("BC_BATCYCLE", 28, 50), put("BC_BATWING", 36, 46)
    put("BC_CHARGER", 2, 46), put("BC_CHARGER", 14, 47), put("BC_CHARGER", 33, 47)
    put("BC_TIRES", 2, 55), put("BC_TIRES", 3, 55), put("BC_STALAGMITE", 52, 46), put("BC_ROCKS", 1, 52)
    for c in (40, 44, 48):
        pod(c, 53)
    put("BC_WORKBENCH", 8, 53)
    for c in (7, 10, 24, 28):
        put("BC_TOOL_WALL", c, 44)
    put("BC_BATARANGS", 38, 44)
    put("BC_WORKBENCH", 12, 53), put("BC_TIRES", 4, 55), put("BC_TIRES", 16, 55), put("BC_CHARGER", 46, 46)
    # The cave itself: rock and stalagmites along the edges of every room, where nobody walks.
    floor = free_tiles(p)
    for room in [r[0] for r in p.rooms]:
        for kind in ("BC_STALAGMITE", "BC_ROCKS", "BC_STALAGMITE", "BC_ROCKS"):
            scatter(p, room, kind, floor)
    for rect in [r[4] for r in p.rooms]:
        wall_decor(p, rect, ["BC_STALACTITES", "BC_BAT_COLONY"])
    return p


CAMPUS_NEED = {"directors": 3, "meeting": 8, "release": 3, "design": 7, "head": 6, "engineering": 10, "narrative": 3,
               "pantry": 6, "engine": 6, "community": 2, "art": 2, "audio": 2, "qa": 4}


SPECIAL = [christmas, halloween, tet, cyberpunk, matrix, aquarium, hall_of_justice, batcave]


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

    floors = getattr(p, "floors", FLOORS)
    wall_color = getattr(p, "wall_color", WALL_COLOR)
    # Walls everywhere from row 1, then rooms carve floors.
    for r in range(1, rows):
        for c in range(cols):
            tiles[idx(c, r)] = WALL
            colors[idx(c, r)] = wall_color
    areas = []
    for _name, label, color, floor, (c0, r0, c1, r1) in p.rooms:
        tile, col = floors[floor]
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
        colors[idx(c, r)] = floors["blue"][1] if below == 1 else floors["wood"][1]

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
    for make in SPECIAL:
        build(make())
    build_templates()
