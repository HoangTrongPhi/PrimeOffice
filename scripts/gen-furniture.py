#!/usr/bin/env python3
"""Generate PrimeOffice's own studio furniture — public/assets/furniture/<ID>/ (PNG + manifest.json).

Every pixel comes from this script (CC0, see docs/ASSETS.md); nothing is copied or traced. One tile is
16 px; each piece is 1 tile wide and 2 tall (the top tile is background: characters walk behind it).
Pieces give the Game studio rooms their own look:

    SERVER_RACK   Release & ops      EASEL         Art
    SPEAKER       Audio              ARCADE        Lounge
    WATER_COOLER  Studio head / Lounge
    TEST_RIG      QA (a phone + a handheld on a stand)

    python scripts/gen-furniture.py     # writes the pieces
    npm run assets                      # re-index (furniture-catalog.json)

Needs Pillow. Deterministic.
"""
from __future__ import annotations

import json
import os

from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "furniture")
W, H = 16, 32
OUTLINE = (24, 18, 30, 255)


def hexc(s: str, a: int = 255):
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)


class Canvas:
    def __init__(self):
        self.im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        self.px = self.im.load()

    def dot(self, x, y, c):
        if 0 <= x < W and 0 <= y < H:
            self.px[x, y] = c

    def rect(self, x0, y0, x1, y1, fill, outline=OUTLINE):
        """Inclusive box with a 1 px outline (outline=None: no outline)."""
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                edge = outline is not None and (x in (x0, x1) or y in (y0, y1))
                self.dot(x, y, outline if edge else fill)

    def hline(self, x0, x1, y, c):
        for x in range(x0, x1 + 1):
            self.dot(x, y, c)

    def vline(self, x, y0, y1, c):
        for y in range(y0, y1 + 1):
            self.dot(x, y, c)

    def shadow(self, x0, x1, y):
        for x in range(x0, x1 + 1):
            self.dot(x, y, (0, 0, 0, 70))


def server_rack():
    c = Canvas()
    c.shadow(2, 13, 31)
    body, dark = hexc("2b2f3a"), hexc("1b1e26")
    c.rect(2, 4, 13, 30, body)
    c.hline(3, 12, 5, hexc("3d4352"))
    for i, y in enumerate(range(7, 29, 3)):
        c.rect(4, y, 11, y + 1, dark, None)
        c.dot(5, y, hexc("4ade80") if i % 3 else hexc("facc15"))
        c.dot(7, y, hexc("4ade80"))
        c.dot(10, y + 1, hexc("60a5fa") if i % 2 else hexc("4ade80"))
    return c


def easel():
    c = Canvas()
    c.shadow(3, 12, 31)
    wood, wood_d = hexc("a0703c"), hexc("6e4a26")
    # legs
    for i in range(12):
        c.dot(4 + i // 4, 19 + i, wood_d)
        c.dot(11 - i // 4, 19 + i, wood_d)
    c.vline(8, 18, 30, wood)
    # canvas with a little landscape
    c.rect(2, 4, 13, 18, hexc("f4efe4"))
    for x in range(3, 13):
        c.dot(x, 6, hexc("93c5fd"))
        c.dot(x, 7, hexc("93c5fd"))
    for x, h in zip(range(3, 13), (3, 4, 5, 6, 5, 4, 5, 6, 7, 6)):
        c.vline(x, 17 - h, 17, hexc("4d7c0f") if x % 2 else hexc("65a30d"))
    c.dot(10, 9, hexc("fbbf24"))
    c.dot(11, 9, hexc("fbbf24"))
    c.hline(1, 14, 18, wood)
    return c


def speaker():
    c = Canvas()
    c.shadow(3, 12, 31)
    c.rect(3, 6, 12, 30, hexc("22202a"))
    grey, light = hexc("4b4757"), hexc("6d687c")
    # tweeter
    for x, y in ((7, 10), (8, 10), (7, 11), (8, 11)):
        c.dot(x, y, light)
    c.dot(7, 9, grey), c.dot(8, 9, grey), c.dot(7, 12, grey), c.dot(8, 12, grey)
    c.dot(6, 10, grey), c.dot(6, 11, grey), c.dot(9, 10, grey), c.dot(9, 11, grey)
    # woofer
    for y in range(16, 27):
        for x in range(4, 12):
            d = (x - 7.5) ** 2 + (y - 21) ** 2
            if d <= 13:
                c.dot(x, y, light if d <= 2 else grey if d <= 8 else hexc("38354a"))
    c.dot(11, 28, hexc("4ade80"))
    return c


def arcade():
    c = Canvas()
    c.shadow(2, 13, 31)
    body, side = hexc("7c3aed"), hexc("5b21b6")
    c.rect(2, 2, 13, 30, body)
    c.vline(3, 3, 29, side)
    c.vline(12, 3, 29, side)
    # marquee
    c.rect(3, 3, 12, 6, hexc("f472b6"), None)
    c.hline(5, 10, 4, hexc("fde68a"))
    # screen
    c.rect(4, 8, 11, 15, hexc("0b1020"))
    c.dot(6, 11, hexc("4ade80")), c.dot(9, 10, hexc("f87171")), c.dot(8, 13, hexc("60a5fa"))
    c.hline(5, 10, 14, hexc("1e293b"))
    # control panel
    c.rect(3, 17, 12, 19, hexc("312e81"))
    c.dot(5, 18, hexc("f87171")), c.dot(9, 18, hexc("facc15")), c.dot(10, 18, hexc("4ade80"))
    c.hline(5, 10, 24, hexc("a78bfa"))
    return c


def water_cooler():
    c = Canvas()
    c.shadow(4, 11, 31)
    # bottle
    c.rect(5, 3, 10, 12, hexc("93c5fd", 220))
    c.vline(6, 4, 11, hexc("dbeafe", 230))
    c.hline(6, 9, 3, hexc("60a5fa"))
    # body
    c.rect(4, 13, 11, 30, hexc("e5e7eb"))
    c.vline(10, 14, 29, hexc("cbd5e1"))
    c.dot(6, 16, hexc("3b82f6")), c.dot(9, 16, hexc("ef4444"))
    c.hline(5, 10, 19, hexc("9ca3af"))
    return c


def test_rig():
    c = Canvas()
    c.shadow(2, 13, 31)
    wood, wood_d = hexc("8b6a4a"), hexc("5c4330")
    # little stand
    c.rect(2, 20, 13, 23, wood)
    c.vline(3, 24, 30, wood_d), c.vline(12, 24, 30, wood_d)
    # phone (portrait) and a handheld console
    c.rect(3, 9, 7, 19, hexc("1f2937"))
    c.rect(4, 10, 6, 17, hexc("38bdf8"), None)
    c.dot(5, 18, hexc("9ca3af"))
    c.rect(8, 13, 14, 19, hexc("e11d48"))
    c.rect(10, 14, 12, 17, hexc("0f172a"), None)
    c.dot(9, 16, hexc("fde68a")), c.dot(13, 15, hexc("fde68a"))
    # a bug sticker
    c.dot(5, 13, hexc("4ade80")), c.dot(6, 12, hexc("4ade80"))
    return c


PIECES = [
    ("SERVER_RACK", "Server Rack", server_rack),
    ("EASEL", "Easel", easel),
    ("SPEAKER", "Studio Speaker", speaker),
    ("ARCADE", "Arcade Cabinet", arcade),
    ("WATER_COOLER", "Water Cooler", water_cooler),
    ("TEST_RIG", "Test Devices", test_rig),
]


def main():
    for pid, name, draw in PIECES:
        d = os.path.join(OUT, pid)
        os.makedirs(d, exist_ok=True)
        draw().im.save(os.path.join(d, f"{pid}.png"))
        manifest = {
            "id": pid,
            "name": name,
            "category": "decor",
            "type": "asset",
            "canPlaceOnWalls": False,
            "canPlaceOnSurfaces": False,
            "backgroundTiles": 1,
            "width": W,
            "height": H,
            "footprintW": 1,
            "footprintH": 2,
        }
        with open(os.path.join(d, "manifest.json"), "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)
            f.write("\n")
    print(f"furniture: {len(PIECES)} pieces -> {os.path.normpath(OUT)}")


if __name__ == "__main__":
    main()
