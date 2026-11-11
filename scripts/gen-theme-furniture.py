#!/usr/bin/env python3
"""Generate the themed furniture for the special Theme Studio themes — public/assets/furniture/<ID>/.

Every pixel comes from this script (nothing copied or traced). Pieces are drawn on a W×H canvas of
16 px tiles; floor pieces have `backgroundTiles` top rows characters walk behind, wall pieces hang on
the wall above a room (category "wall").

    Christmas   XMAS_TREE GIFTS SNOWMAN WREATH XMAS_LIGHTS
    Halloween   PUMPKIN CAULDRON GRAVESTONE COBWEB BAT_GARLAND
    Tết         PEACH_TREE KUMQUAT RED_LANTERN COUPLET BANH_CHUNG
    Cyberpunk   NEON_SIGN HOLO_TERMINAL NEON_PALM DATA_PILLAR
    Matrix      CODE_SCREEN CRT_STACK RETRO_PHONE
    Aquarium    FISH_TANK CORAL SEAWEED TREASURE_CHEST PORTHOLE
    (the two DC themes have their own art: scripts/gen-dc-furniture.py)

    python scripts/gen-theme-furniture.py   then   npm run assets

Needs Pillow. Deterministic.
"""
from __future__ import annotations

import json
import math
import os
import random

from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "furniture")
OUTLINE = (24, 18, 30, 255)
T = 16


def hexc(s, a=255):
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)


class C:
    def __init__(self, tw, th):
        self.w, self.h = tw * T, th * T
        self.im = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        self.px = self.im.load()

    def dot(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h and c is not None:
            self.px[x, y] = hexc(c) if isinstance(c, str) else c

    def rect(self, x0, y0, x1, y1, fill, outline=OUTLINE):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                edge = outline is not None and (x in (x0, x1) or y in (y0, y1))
                self.dot(x, y, outline if edge else fill)

    def fill(self, x0, y0, x1, y1, c):
        self.rect(x0, y0, x1, y1, c, None)

    def hline(self, x0, x1, y, c):
        for x in range(x0, x1 + 1):
            self.dot(x, y, c)

    def vline(self, x, y0, y1, c):
        for y in range(y0, y1 + 1):
            self.dot(x, y, c)

    def disc(self, cx, cy, r, c, outline=True):
        for y in range(cy - r - 1, cy + r + 2):
            for x in range(cx - r - 1, cx + r + 2):
                d = math.hypot(x - cx, y - cy)
                if d <= r - 0.5 or (not outline and d <= r + 0.3):
                    self.dot(x, y, c)
                elif outline and d <= r + 0.5:
                    self.dot(x, y, OUTLINE)

    def tri(self, cx, top, bottom, half, c):
        """Filled triangle pointing up, outlined."""
        for y in range(top, bottom + 1):
            w = int(half * (y - top) / max(1, bottom - top))
            for x in range(cx - w, cx + w + 1):
                self.dot(x, y, OUTLINE if x in (cx - w, cx + w) or y == bottom else c)

    def shadow(self, x0, x1, y):
        for x in range(x0, x1 + 1):
            self.dot(x, y, (0, 0, 0, 70))


# ---------------------------------------------------------------- Christmas
def xmas_tree():
    c = C(2, 3)
    c.shadow(6, 25, 47)
    c.rect(14, 40, 17, 46, "6b4423")
    for top, bottom, half in ((4, 18, 8), (12, 28, 11), (20, 40, 14)):
        c.tri(16, top, bottom, half, "2f8a46")
    rnd = random.Random(7)
    for _ in range(26):
        y = rnd.randint(10, 38)
        w = int(14 * (y - 4) / 36)
        c.dot(16 + rnd.randint(-w + 1, max(-w + 1, w - 1)), y, rnd.choice(["e23b3b", "f5d142", "5ab0f0", "f4f4f4"]))
    c.fill(15, 1, 16, 4, "f5d142")
    c.dot(14, 2, "f5d142"), c.dot(17, 2, "f5d142")
    return c


def gifts():
    c = C(1, 1)
    c.shadow(1, 14, 15)
    c.rect(1, 6, 8, 14, "d42a2a")
    c.vline(4, 6, 14, "f5d142"), c.vline(5, 6, 14, "f5d142")
    c.rect(8, 9, 14, 14, "2f6fd8")
    c.vline(11, 9, 14, "f4f4f4")
    c.dot(3, 5, "f5d142"), c.dot(6, 5, "f5d142"), c.dot(10, 8, "f4f4f4"), c.dot(12, 8, "f4f4f4")
    return c


def snowman():
    c = C(1, 2)
    c.shadow(2, 13, 31)
    c.disc(8, 24, 6, "f4f7fb")
    c.disc(8, 13, 4, "f4f7fb")
    c.fill(5, 4, 11, 8, "22202c"), c.hline(3, 13, 9, "22202c")
    c.dot(7, 12, "1d1a26"), c.dot(9, 12, "1d1a26")
    c.hline(9, 11, 14, "ef7d2a")
    c.hline(4, 12, 17, "d42a2a")
    c.dot(8, 22, "1d1a26"), c.dot(8, 25, "1d1a26")
    return c


def wreath():
    c = C(1, 2)
    for a in range(0, 360, 12):
        x, y = 8 + round(5.5 * math.cos(math.radians(a))), 16 + round(5.5 * math.sin(math.radians(a)))
        c.fill(x - 1, y - 1, x, y, "2f8a46")
    for a in range(0, 360, 60):
        c.dot(8 + round(5 * math.cos(math.radians(a))), 16 + round(5 * math.sin(math.radians(a))), "e23b3b")
    c.fill(7, 21, 9, 23, "d42a2a")
    return c


def xmas_lights():
    c = C(2, 2)
    for x in range(0, 32):
        y = 10 + round(3 * math.sin(x / 32 * math.pi * 2))
        c.dot(x, y, "2b3a2b")
        if x % 4 == 2:
            c.fill(x, y + 1, x + 1, y + 2, ["e23b3b", "f5d142", "5ab0f0", "4ade80"][(x // 4) % 4])
    return c


# ---------------------------------------------------------------- Halloween
def pumpkin():
    c = C(1, 1)
    c.shadow(1, 14, 15)
    c.rect(1, 5, 14, 14, "ef7d2a")
    for x in (5, 10):
        c.vline(x, 6, 13, "c95f1a")
    c.fill(7, 2, 8, 4, "3f6b2a")
    c.fill(4, 8, 5, 9, "ffe066"), c.fill(10, 8, 11, 9, "ffe066"), c.hline(5, 10, 12, "ffe066")
    return c


def cauldron():
    c = C(1, 2)
    c.shadow(1, 14, 31)
    c.rect(1, 18, 14, 29, "2a2a32")
    c.hline(0, 15, 18, "3d3d48")
    c.fill(2, 19, 13, 20, "7be04a")
    for x, y in ((4, 15), (9, 12), (6, 9), (11, 16)):
        c.disc(x, y, 1, "9ff07a", outline=False)
    c.fill(4, 29, 5, 31, "1b1b20"), c.fill(10, 29, 11, 31, "1b1b20")
    return c


def gravestone():
    c = C(1, 2)
    c.shadow(1, 14, 31)
    c.rect(2, 14, 13, 30, "8b8f9a")
    c.fill(3, 12, 12, 14, "8b8f9a"), c.hline(4, 11, 11, OUTLINE), c.dot(3, 12, OUTLINE), c.dot(12, 12, OUTLINE)
    c.hline(5, 10, 18, "5a5d68"), c.vline(7, 16, 24, "5a5d68"), c.vline(8, 16, 24, "5a5d68")
    c.fill(1, 29, 14, 31, "3f6b2a")
    return c


def cobweb():
    c = C(1, 2)
    w = (230, 230, 236, 200)
    for i in range(0, 16):
        c.dot(i, i // 1, w) if i < 16 else None
        c.dot(i, 4, w)
        c.dot(4, i, w)
    for r in (5, 9, 13):
        for t in range(0, 91, 6):
            c.dot(round(r * math.cos(math.radians(t))), round(r * math.sin(math.radians(t))), w)
    c.fill(9, 14, 10, 15, "1b1b20"), c.vline(9, 9, 13, w)
    return c


def bat_garland():
    c = C(2, 2)
    c.hline(0, 31, 6, "3a2a4a")
    for x in (4, 14, 24):
        c.vline(x + 3, 6, 9, "3a2a4a")
        bat(c, x, 10, "1b1b20")
    return c


def bat(c, x, y, col):
    for dx, dy in ((0, 0), (1, 1), (2, 1), (3, 2), (4, 1), (5, 1), (6, 0), (2, 2), (3, 3), (4, 2), (3, 1)):
        c.dot(x + dx, y + dy, col)


# ---------------------------------------------------------------- Tết
def peach_tree():
    c = C(2, 3)
    c.shadow(6, 25, 47)
    c.rect(10, 38, 21, 46, "c3262d")
    c.hline(10, 21, 41, "f5d142")
    for x0, y0, x1, y1 in ((16, 38, 16, 22), (16, 26, 8, 14), (16, 24, 24, 12), (12, 18, 6, 8), (21, 17, 27, 9), (16, 22, 17, 6)):
        n = max(abs(x1 - x0), abs(y1 - y0))
        for i in range(n + 1):
            c.fill(round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n), round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n) + (1 if i < n / 2 else 0), "5a3a26")
    rnd = random.Random(3)
    for _ in range(190):
        x, y = rnd.randint(3, 29), rnd.randint(3, 26)
        if math.hypot((x - 16) / 14, (y - 15) / 12) < 1:
            c.dot(x, y, rnd.choice(["f7a3c0", "f28ab0", "ffd0e0", "f7a3c0"]))
    return c


def kumquat():
    c = C(1, 2)
    c.shadow(2, 13, 31)
    c.rect(3, 24, 12, 30, "c9a46a")
    c.hline(3, 12, 26, "c3262d")
    c.disc(8, 13, 7, "2f7a3a")
    rnd = random.Random(5)
    for _ in range(14):
        a, r = rnd.uniform(0, 6.28), rnd.uniform(0, 6)
        c.dot(8 + round(r * math.cos(a)), 13 + round(r * math.sin(a)), "f5a524")
    c.vline(8, 20, 24, "5a3a26")
    return c


def red_lantern():
    c = C(1, 2)
    c.vline(8, 0, 8, "5a3a26")
    c.fill(6, 8, 10, 9, "f5c542")
    c.rect(3, 10, 13, 22, "d42a2a")
    for x in (6, 10):
        c.vline(x, 11, 21, "a81e24")
    c.fill(6, 23, 10, 23, "f5c542")
    for x in (7, 8, 9):
        c.vline(x, 24, 28, "f5c542")
    return c


def couplet():
    c = C(1, 2)
    c.rect(4, 1, 11, 31, "c8202a")
    for y in range(4, 30, 5):
        c.fill(6, y, 9, y + 2, "f5c542")
        c.dot(7, y + 1, "c8202a")
    return c


def banh_chung():
    c = C(1, 1)
    c.shadow(1, 14, 15)
    c.rect(2, 5, 13, 14, "3f8a3a")
    c.hline(2, 13, 9, "e8d9a8"), c.vline(7, 5, 14, "e8d9a8")
    c.hline(3, 12, 6, "56a84a")
    return c


# ---------------------------------------------------------------- Cyberpunk
def neon_sign():
    c = C(2, 2)
    c.rect(1, 6, 30, 25, "120c1e")
    for x0, col in ((4, "2ff3ff"), (17, "ff2fd1")):
        c.rect(x0, 10, x0 + 10, 21, "120c1e", hexc(col))
        c.hline(x0 + 2, x0 + 8, 15, col)
        c.vline(x0 + 5, 12, 19, col)
    return c


def holo_terminal():
    c = C(1, 2)
    c.shadow(2, 13, 31)
    c.rect(4, 22, 11, 30, "22202c")
    c.hline(5, 10, 24, "2ff3ff")
    for y in range(4, 21):
        a = 120 if y % 2 else 70
        for x in range(2 + (20 - y) // 6, 14 - (20 - y) // 6):
            c.dot(x, y, (47, 243, 255, a))
    c.hline(4, 11, 9, "ff2fd1"), c.hline(5, 10, 14, (255, 47, 209, 200))
    return c


def neon_palm():
    c = C(1, 2)
    c.shadow(2, 13, 31)
    c.rect(4, 26, 11, 30, "22202c")
    c.vline(8, 8, 26, "ff2fd1"), c.vline(7, 8, 26, (255, 47, 209, 120))
    for dx, dy in ((-6, 2), (-4, -1), (4, -1), (6, 2), (0, -3)):
        n = 6
        for i in range(n + 1):
            c.dot(8 + round(dx * i / n), 8 + round(dy * i / n) + (i * i) // 12, "2ff3ff")
    return c


def data_pillar():
    c = C(1, 2)
    c.shadow(2, 13, 31)
    c.rect(3, 2, 12, 30, "1b1830")
    for y in range(5, 29, 3):
        c.hline(5, 10, y, "2ff3ff" if y % 2 else "7a5aff")
    c.vline(3, 3, 29, "ff2fd1")
    return c


# ---------------------------------------------------------------- Matrix
def code_screen():
    c = C(2, 2)
    c.rect(1, 3, 30, 27, "030a05")
    rnd = random.Random(11)
    for x in range(3, 29, 2):
        top = rnd.randint(4, 20)
        for y in range(top, min(26, top + rnd.randint(3, 10))):
            c.dot(x, y, "3cff6a" if y == top + 0 else rnd.choice(["1f9e3a", "0f6a25", "2bd24f"]))
    c.fill(13, 28, 18, 30, "2a2a32")
    return c


def crt_stack():
    c = C(1, 2)
    c.shadow(1, 14, 31)
    for y0 in (4, 17):
        c.rect(1, y0, 14, y0 + 12, "5a5d68")
        c.rect(3, y0 + 2, 12, y0 + 9, "041208")
        for y in range(y0 + 3, y0 + 9, 2):
            c.hline(4, 4 + (y * 7) % 7 + 2, y, "2bd24f")
    return c


def retro_phone():
    c = C(1, 2)
    c.shadow(3, 12, 31)
    c.rect(6, 18, 9, 30, "3a3a46")
    c.rect(3, 12, 12, 18, "1b1b20")
    c.fill(4, 11, 11, 11, "1b1b20")
    c.rect(2, 9, 13, 11, "1b1b20")
    c.dot(7, 15, "3cff6a")
    return c


# ---------------------------------------------------------------- Aquarium
def fish_tank():
    c = C(2, 2)
    c.shadow(1, 30, 31)
    c.rect(0, 22, 31, 30, "3a2a20")
    c.rect(0, 2, 31, 22, (90, 190, 230, 255))
    c.fill(1, 3, 30, 5, (150, 220, 245, 255))
    c.fill(1, 19, 30, 21, "d9c48a")
    for x, h, col in ((4, 8, "2f8a46"), (6, 5, "3fae5a"), (25, 9, "2f8a46"), (27, 6, "e8708a")):
        c.vline(x, 21 - h, 20, col), c.vline(x + 1, 22 - h, 20, col)
    for x, y, col in ((10, 9, "f5a524"), (19, 13, "ff6b6b"), (14, 15, "f5d142")):
        c.fill(x, y, x + 3, y + 1, col), c.dot(x - 1, y, col), c.dot(x - 1, y + 1, col), c.dot(x + 3, y, "1d1a26")
    for x, y in ((22, 8), (23, 6), (21, 4)):
        c.dot(x, y, "e9fbff")
    return c


def coral():
    c = C(1, 1)
    c.shadow(2, 13, 15)
    c.fill(2, 13, 13, 14, "d9c48a")
    for x0, x1, col in ((4, 1, "ff6b8a"), (8, 4, "ff8a5a"), (11, 14, "ff6b8a")):
        for i in range(0, 10):
            c.dot(round(x0 + (x1 - x0) * i / 9), 12 - i, col)
    c.dot(6, 6, "ff6b8a"), c.dot(10, 7, "ff8a5a")
    return c


def seaweed():
    c = C(1, 2)
    for x0, col in ((5, "2f8a46"), (9, "3fae5a")):
        for y in range(4, 31):
            c.fill(x0 + round(1.5 * math.sin(y / 3 + x0)), y, x0 + round(1.5 * math.sin(y / 3 + x0)) + 1, y, col)
    c.fill(3, 30, 12, 31, "d9c48a")
    return c


def treasure_chest():
    c = C(1, 1)
    c.shadow(1, 14, 15)
    c.rect(1, 7, 14, 14, "8a5a33")
    c.rect(1, 3, 14, 7, "a8743a")
    c.hline(2, 13, 5, "f5c542")
    c.fill(7, 7, 8, 9, "f5c542")
    c.dot(4, 2, "f5d142"), c.dot(10, 2, "f5d142"), c.dot(12, 3, "f4f4f4")
    return c


def porthole():
    c = C(1, 2)
    c.disc(8, 14, 6, "b8892a")
    c.disc(8, 14, 4, (90, 190, 230, 255), outline=False)
    c.dot(6, 12, "e9fbff"), c.dot(9, 15, "f5a524"), c.dot(10, 15, "f5a524")
    return c


# id, name, category, draw, footprint (w, h) in tiles, background rows
PIECES = [
    ("XMAS_TREE", "Christmas Tree", "decor", xmas_tree, 2),
    ("GIFTS", "Gifts", "decor", gifts, 0),
    ("SNOWMAN", "Snowman", "decor", snowman, 1),
    ("WREATH", "Wreath", "wall", wreath, 0),
    ("XMAS_LIGHTS", "String Lights", "wall", xmas_lights, 0),
    ("PUMPKIN", "Jack-o'-lantern", "decor", pumpkin, 0),
    ("CAULDRON", "Cauldron", "decor", cauldron, 1),
    ("GRAVESTONE", "Gravestone", "decor", gravestone, 1),
    ("COBWEB", "Cobweb", "wall", cobweb, 0),
    ("BAT_GARLAND", "Bat Garland", "wall", bat_garland, 0),
    ("PEACH_TREE", "Peach Blossom (Hoa đào)", "decor", peach_tree, 2),
    ("KUMQUAT", "Kumquat Tree (Cây quất)", "decor", kumquat, 1),
    ("RED_LANTERN", "Red Lantern", "wall", red_lantern, 0),
    ("COUPLET", "Couplet (Câu đối)", "wall", couplet, 0),
    ("BANH_CHUNG", "Bánh chưng", "decor", banh_chung, 0),
    ("NEON_SIGN", "Neon Sign", "wall", neon_sign, 0),
    ("HOLO_TERMINAL", "Holo Terminal", "decor", holo_terminal, 1),
    ("NEON_PALM", "Neon Palm", "decor", neon_palm, 1),
    ("DATA_PILLAR", "Data Pillar", "decor", data_pillar, 1),
    ("CODE_SCREEN", "Code Rain Screen", "wall", code_screen, 0),
    ("CRT_STACK", "CRT Stack", "decor", crt_stack, 1),
    ("RETRO_PHONE", "Retro Phone", "decor", retro_phone, 1),
    ("FISH_TANK", "Fish Tank", "decor", fish_tank, 1),
    ("CORAL", "Coral", "decor", coral, 0),
    ("SEAWEED", "Seaweed", "decor", seaweed, 1),
    ("TREASURE_CHEST", "Treasure Chest", "decor", treasure_chest, 0),
    ("PORTHOLE", "Porthole", "wall", porthole, 0),
]


def main():
    for pid, name, cat, draw, bg in PIECES:
        cv = draw()
        fw, fh = cv.w // T, cv.h // T
        d = os.path.join(OUT, pid)
        os.makedirs(d, exist_ok=True)
        cv.im.save(os.path.join(d, f"{pid}.png"))
        manifest = {
            "id": pid, "name": name, "category": cat, "type": "asset",
            "canPlaceOnWalls": cat == "wall", "canPlaceOnSurfaces": False, "backgroundTiles": bg,
            "width": cv.w, "height": cv.h, "footprintW": fw, "footprintH": fh,
        }
        with open(os.path.join(d, "manifest.json"), "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)
            f.write("\n")
    if len(os.sys.argv) > 1:
        scale = 3
        cells = [(pid, Image.open(os.path.join(OUT, pid, f"{pid}.png"))) for pid, *_ in PIECES]
        W = sum(im.width for _, im in cells) * scale + len(cells) * 6
        prev = Image.new("RGBA", (min(W, 2000), 700), (46, 44, 62, 255))
        x = y = 4
        rowh = 0
        for _, im in cells:
            big = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
            if x + big.width > prev.width:
                x, y = 4, y + rowh + 6
                rowh = 0
            prev.alpha_composite(big, (x, y))
            x += big.width + 6
            rowh = max(rowh, big.height)
        prev.save(os.sys.argv[1])
    print(f"theme furniture: {len(PIECES)} pieces -> {os.path.normpath(OUT)}")


if __name__ == "__main__":
    main()
