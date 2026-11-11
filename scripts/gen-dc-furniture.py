#!/usr/bin/env python3
"""Generate the one-of-a-kind art of the two DC themes — BatCave and Hall of Justice.

Every piece, the desks, chairs and screens agents work at included, is drawn here for these two
floors only (nothing reused from the generic office set, nothing copied or traced). Costumes in suit
tubes and statues come from scripts/gen-avatars.py, so they match the avatars.

    BatCave          BC_*   the cave computer (main screen + feeds), consoles, suit tubes of the Bat-family,
                            the garage (car on its turntable, armoured car, cycle, jet), trophies, rooms
                            of Nightwing, Robin, Oracle, the lab, case files, comms, training, waterfall, bats
    Hall of Justice  HOJ_*  marble desks, statues of the founders, the round table, the alert monitor,
                            heroes' banners and relics (trident, lasso, shield, helmet, lantern, Mother Box,
                            cosmic treadmill, the wizard's throne, Starro), teleporter, fountain
    Floors           floors/floor_9..12.png: cave rock, diamond plate, veined marble, star inlay

    python scripts/gen-dc-furniture.py [preview.png]    then    npm run assets

Fan art of DC characters (docs/ASSETS.md). Needs Pillow. Deterministic.
"""
from __future__ import annotations

import importlib.util
import json
import math
import os
import random
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "public", "assets")
OUT = os.path.join(ASSETS, "furniture")


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, file))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod  # dataclasses look their module up by name
    spec.loader.exec_module(mod)
    return mod


tf = _load("theme_furniture", "gen-theme-furniture.py")
av = _load("avatars", "gen-avatars.py")
C, hexc, OUTLINE, bat = tf.C, tf.hexc, tf.OUTLINE, tf.bat
HEROES = {h.id: h for _g, _l, hs in av.GROUPS for h in hs}

BLUE, CYAN, RED, GOLD = "3fb7f0", "7fdcff", "e23b3b", "e2b33c"
STEEL, DARK, INK = "2a2d36", "17181e", "0c0d12"


def line(c, x0, y0, x1, y1, col):
    n = max(abs(x1 - x0), abs(y1 - y0), 1)
    for i in range(n + 1):
        c.dot(round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n), col)


def glow(c, x0, y0, x1, y1, rgb, a=90):
    """A see-through layer over what is drawn (glass, light)."""
    over = Image.new("RGBA", (x1 - x0 + 1, y1 - y0 + 1), (*hexc(rgb)[:3], a))
    c.im.alpha_composite(over, (x0, y0))
    c.px = c.im.load()


def paste(c, im, x, y):
    c.im.alpha_composite(im, (x, y))
    c.px = c.im.load()


def hero_front(hid, tone=None):
    """The hero standing, facing down (avatar frame 0); tone 'marble' or 'gold' makes it a statue."""
    im = av.frame_down(HEROES[hid], 0)
    if tone:
        px = im.load()
        for y in range(im.height):
            for x in range(im.width):
                r, g, b, a = px[x, y]
                if not a:
                    continue
                L = (0.299 * r + 0.587 * g + 0.114 * b) / 255
                if tone == "marble":
                    v = int(120 + L * 135)
                    tint = (r * 0.18, g * 0.18, b * 0.18)
                    px[x, y] = (min(255, int(v * 0.82 + tint[0])), min(255, int(v * 0.82 + tint[1])), min(255, int(v * 0.8 + tint[2])), a)
                else:
                    v = 0.45 + L * 0.75
                    px[x, y] = (min(255, int(226 * v)), min(255, int(179 * v)), min(255, int(60 * v)), a)
    return im


def shadow(c, x0, x1, y):
    c.shadow(x0, x1, y)


# ================================================================ BatCave
def bc_console():
    c = C(3, 2)
    shadow(c, 1, 46, 31)
    c.rect(0, 8, 47, 26, STEEL)
    c.fill(1, 9, 46, 12, "3a3e4a")
    c.hline(2, 45, 22, BLUE)
    for x in range(4, 44, 6):
        c.fill(x, 15, x + 3, 17, "1f222b")
        c.dot(x + 1, 16, CYAN)
    c.fill(1, 26, 4, 30, INK), c.fill(43, 26, 46, 30, INK)
    return c


def bc_monitor():
    c = C(1, 2)
    c.rect(1, 4, 14, 17, "0a1a2a")
    for y, w in ((7, 9), (9, 6), (11, 10), (13, 4)):
        c.hline(3, 3 + w, y, BLUE)
    c.dot(12, 6, RED)
    c.fill(7, 18, 8, 21, STEEL)
    c.hline(5, 10, 22, STEEL)
    return c


def bc_chair():
    c = C(1, 1)
    shadow(c, 3, 12, 15)
    c.rect(3, 3, 12, 13, "1b1c22")
    c.fill(4, 4, 11, 6, "2a2c36")
    c.hline(4, 11, 12, BLUE)
    return c


def gotham_skyline(c, x0, x1, base, rnd, col):
    x = x0
    while x <= x1:
        w, h = rnd.randint(3, 7), rnd.randint(5, 18)
        c.fill(x, base - h, min(x1, x + w - 1), base, col)
        if h > 12:
            c.vline(x + w // 2, base - h - 3, base - h, col)
        for wy in range(base - h + 2, base - 1, 3):
            for wx in range(x + 1, min(x1, x + w - 1), 2):
                if rnd.random() < 0.3:
                    c.dot(wx, wy, "f5d76e")
        x += w + 1


def bc_main_screen():
    """The cave computer's main screen: Gotham under watch — skyline, the city grid, crimes as red blips."""
    c = C(10, 5)
    W, H = c.w, c.h
    rnd = random.Random(42)
    shadow(c, 2, W - 3, H - 1)
    for x in (6, W - 10):  # pylons
        c.rect(x, 8, x + 3, H - 2, STEEL)
    c.rect(0, 2, W - 1, 64, "1f222b")
    c.fill(3, 5, W - 4, 61, "03101c")
    # Grid of the city and its river.
    for x in range(6, W - 4, 8):
        c.vline(x, 6, 60, (40, 110, 160, 110))
    for y in range(8, 60, 6):
        c.hline(4, W - 5, y, (40, 110, 160, 110))
    for y in range(6, 61):
        c.dot(80 + round(7 * math.sin(y / 6)), y, (60, 150, 220, 200))
        c.dot(81 + round(7 * math.sin(y / 6)), y, (60, 150, 220, 200))
    gotham_skyline(c, 4, W - 5, 60, rnd, (14, 34, 52, 255))
    for _ in range(22):
        x, y = rnd.randint(8, W - 10), rnd.randint(11, 52)
        c.fill(x, y, x + 1, y + 1, RED)
        c.dot(x - 1, y, (226, 59, 59, 120)), c.dot(x + 2, y + 1, (226, 59, 59, 120))
    # Target box and the header with the bat.
    c.rect(108, 18, 126, 30, None, hexc("f5d142"))
    line(c, 117, 30, 117, 36, "f5d142"), c.fill(112, 37, 140, 41, "0b2234"), c.hline(114, 138, 39, "f5d142")
    c.fill(3, 5, W - 4, 10, "0b2234")
    bat(c, 6, 6, "f5d142")
    for x in range(16, 76, 5):
        c.hline(x, x + 3, 8, CYAN)
    c.fill(W - 30, 6, W - 6, 9, RED)
    # Console strip at its foot (the blocked row).
    c.rect(0, 64, W - 1, 76, STEEL)
    for x in range(6, W - 6, 5):
        c.fill(x, 67, x + 2, 68, BLUE if (x // 5) % 3 else RED)
    c.hline(2, W - 3, 72, CYAN)
    return c


def bc_side_screen(kind):
    c = C(2, 4)
    shadow(c, 2, 29, 63)
    c.rect(13, 40, 18, 60, STEEL)
    c.rect(8, 56, 23, 62, STEEL)
    for i, y0 in enumerate((2, 22)):
        c.rect(0, y0, 31, y0 + 18, "1f222b")
        c.fill(2, y0 + 2, 29, y0 + 16, "03101c")
        what = kind[i]
        if what == "asylum":
            c.fill(5, y0 + 9, 26, y0 + 15, "1d3a4a")
            c.fill(13, y0 + 5, 18, y0 + 9, "1d3a4a")
            c.vline(15, y0 + 3, y0 + 5, "1d3a4a")
            for x in range(7, 26, 3):
                c.dot(x, y0 + 11, "f5d76e")
            c.hline(3, 10, y0 + 3, RED)
        elif what == "joker":
            c.fill(11, y0 + 5, 20, y0 + 15, "e8e8e0")
            c.fill(10, y0 + 3, 21, y0 + 6, "3e9b45")
            c.dot(13, y0 + 9, "1d1a26"), c.dot(18, y0 + 9, "1d1a26")
            c.hline(12, 19, y0 + 12, RED)
            c.hline(3, 8, y0 + 3, RED)
        elif what == "wave":
            for x in range(3, 29):
                c.dot(x, y0 + 9 + round(4 * math.sin(x / 2) * math.sin(x / 7)), "3cff6a")
        elif what == "radar":
            c.disc(15, y0 + 9, 6, "06243a")
            line(c, 15, y0 + 9, 20, y0 + 5, "3cff6a")
            c.dot(12, y0 + 7, RED), c.dot(18, y0 + 12, RED)
        elif what == "gcpd":
            for y in range(y0 + 4, y0 + 15, 2):
                c.hline(4, 4 + (y * 7) % 18 + 4, y, BLUE)
            c.fill(22, y0 + 4, 27, y0 + 9, "f5d142")
        elif what == "map":
            for x in range(4, 28, 4):
                c.vline(x, y0 + 3, y0 + 15, (40, 110, 160, 160))
            c.fill(17, y0 + 8, 18, y0 + 9, RED)
            c.rect(14, y0 + 6, 21, y0 + 11, None, hexc("f5d142"))
    return c


def bc_wall_monitor():
    c = C(2, 1)
    c.rect(1, 1, 30, 14, "1f222b")
    c.fill(3, 3, 14, 12, "03101c"), c.fill(17, 3, 28, 12, "03101c")
    for y in (5, 7, 9):
        c.hline(4, 4 + (y * 3) % 8 + 2, y, BLUE)
    c.disc(22, 8, 3, "06243a")
    c.dot(23, 7, RED)
    return c


def bc_server():
    c = C(1, 2)
    shadow(c, 1, 14, 31)
    c.rect(1, 4, 14, 30, "15161c")
    for i, y in enumerate(range(7, 28, 3)):
        c.fill(3, y, 12, y + 1, "22242c")
        c.dot(4, y, BLUE), c.dot(6, y, CYAN if i % 2 else BLUE), c.dot(11, y + 1, RED if i == 3 else BLUE)
    return c


def bc_suit(hid, memorial=False, armor=False):
    """A glass tube with a suit inside, lit from its base."""
    c = C(1, 3)
    shadow(c, 0, 15, 47)
    c.rect(0, 40, 15, 46, "1f222b")
    c.hline(1, 14, 42, CYAN)
    c.rect(0, 0, 15, 4, "1f222b")
    c.hline(2, 13, 3, CYAN)
    if armor:
        h = av.Hero("armor", "Armor", head="helmet", head_c="#2a2d36", head_c2="#15161c", top="#3a3d48", top2="#2a2d36",
                    pants="#2a2d36", boots="#15161c", tall_boots=True, gloves="#15161c", sleeves="#2a2d36",
                    emblem="bat", shoulder="#4a4d58")
        fig = av.frame_down(h, 0)
    else:
        fig = hero_front(hid)
    paste(c, fig, 0, 8)
    # Glass over it.
    glow(c, 0, 5, 1, 39, "b4e6ff", 150), glow(c, 14, 5, 15, 39, "b4e6ff", 150)
    glow(c, 2, 5, 13, 39, "7fdcff", 34)
    for y in range(6, 38, 7):
        glow(c, 3, y, 3, y + 2, "ffffff", 110)
    if memorial:
        for x, y in ((3, 25), (5, 24), (7, 25), (9, 24), (11, 25), (4, 32), (6, 31), (8, 32), (10, 31)):
            c.fill(x, y, x + 1, y, "f5d142")
        c.hline(2, 13, 41, GOLD)
    return c


def turntable(c, cx, cy, rx, ry):
    for y in range(cy - ry - 1, cy + ry + 2):
        for x in range(cx - rx - 1, cx + rx + 2):
            d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
            if d <= 1:
                c.dot(x, y, "3a3d48" if d > 0.7 else "2c2f38")
                if 0.86 < d < 0.95 and (x + y) % 3 == 0:
                    c.dot(x, y, "f5d142")


def bc_batmobile():
    c = C(6, 3)
    turntable(c, 48, 36, 46, 10)
    body = "17171d"
    c.rect(6, 22, 90, 36, body)
    c.fill(7, 23, 89, 25, "26262e")
    c.rect(34, 13, 60, 23, body)
    c.fill(38, 15, 57, 21, "2a4a6a")
    c.fill(39, 15, 45, 16, "6aa0c8")
    for i in range(10):  # tail fins
        c.vline(6 + i, 10 + i, 22, body)
        c.vline(24 + i // 2, 18 - i // 3, 22, body)
    c.rect(84, 26, 94, 33, body)
    c.hline(62, 90, 28, "3a3d48")
    c.fill(4, 28, 6, 31, "ef7d2a")  # jet exhaust
    c.fill(91, 28, 94, 29, "f5f0c0")
    for x in (22, 74):
        c.disc(x, 37, 6, INK)
        c.disc(x, 37, 2, "4a4d58", outline=False)
        bat(c, x - 3, 36, "f5d142")
    bat(c, 46, 29, "3a3d48")
    return c


def bc_tumbler():
    c = C(4, 3)
    shadow(c, 2, 61, 47)
    cam = "2a2b26"
    c.rect(6, 18, 58, 38, cam)
    c.rect(18, 10, 46, 20, cam)
    c.fill(22, 12, 42, 17, "1a2a3a")
    for x in (8, 30, 50):
        c.fill(x, 22, x + 6, 24, "3a3b34")
    c.rect(52, 14, 62, 24, cam)  # front flaps
    for x, r in ((14, 8), (50, 7)):
        c.disc(x, 39, r, INK)
        for a in range(0, 360, 45):
            c.dot(x + round((r - 2) * math.cos(math.radians(a))), 39 + round((r - 2) * math.sin(math.radians(a))), "3a3b34")
    c.fill(2, 26, 6, 30, "ef7d2a")
    return c


def bc_batcycle():
    c = C(3, 2)
    shadow(c, 2, 45, 31)
    body = "17171d"
    for x in (9, 38):
        c.disc(x, 24, 6, INK)
        c.disc(x, 24, 2, "4a4d58", outline=False)
    c.rect(10, 14, 38, 22, body)
    c.rect(22, 8, 34, 15, body)
    c.fill(26, 9, 32, 12, "2a4a6a")
    c.rect(36, 12, 44, 18, body)
    c.fill(43, 14, 45, 15, "f5f0c0")
    c.fill(4, 16, 9, 18, "ef7d2a")
    bat(c, 18, 16, "3a3d48")
    return c


def bc_batwing():
    c = C(6, 4)
    shadow(c, 4, 91, 63)
    body = "15151b"
    # Bat-shaped wings seen from the front-top, the cockpit in the middle.
    pts = [(2, 34), (14, 22), (22, 30), (30, 18), (40, 26), (48, 12), (56, 26), (66, 18), (74, 30), (82, 22), (94, 34), (48, 46)]
    for y in range(10, 48):
        for x in range(0, 96):
            inside = False
            for i in range(len(pts)):
                (x1, y1), (x2, y2) = pts[i], pts[(i + 1) % len(pts)]
                if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
                    inside = not inside
            if inside:
                c.dot(x, y, body)
    c.fill(42, 24, 54, 34, "2a4a6a")
    c.fill(44, 25, 48, 27, "6aa0c8")
    c.rect(38, 34, 58, 50, "1f2028")
    for x in (40, 54):
        c.rect(x, 50, x + 2, 60, STEEL)
        c.disc(x + 1, 60, 2, INK)
    c.fill(20, 32, 22, 33, RED), c.fill(74, 32, 76, 33, "3cff6a")
    return c


def bc_tool_wall():
    c = C(2, 1)
    c.rect(0, 1, 31, 15, "3a3d48")
    for x in range(2, 30, 2):
        for y in range(3, 14, 3):
            c.dot(x, y, "2a2d36")
    line(c, 4, 4, 8, 12, "9aa0ab"), c.fill(3, 3, 5, 4, "9aa0ab")
    c.vline(12, 3, 12, "c9962a"), c.fill(11, 3, 13, 5, "5a5d68")
    line(c, 17, 4, 21, 12, "9aa0ab")
    bat(c, 23, 6, "15151b")
    return c


def bc_charger():
    c = C(1, 2)
    shadow(c, 2, 13, 31)
    c.rect(3, 6, 12, 30, "2a2d36")
    c.fill(5, 9, 10, 13, "06243a")
    c.dot(7, 11, "3cff6a"), c.dot(8, 11, "3cff6a")
    line(c, 12, 18, 15, 26, INK), line(c, 15, 26, 13, 30, INK)
    c.hline(4, 11, 28, "f5d142")
    return c


def bc_tires():
    c = C(1, 1)
    shadow(c, 1, 14, 15)
    for y in (12, 8, 4):
        c.rect(2, y, 13, y + 3, INK)
        c.hline(4, 11, y + 1, "3a3b34")
    return c


def bc_trex():
    c = C(4, 4)
    shadow(c, 6, 60, 63)
    g = "4a5a46"
    c.rect(34, 6, 58, 20, g)  # head
    c.fill(36, 8, 56, 9, "5a6a56")
    c.fill(48, 16, 58, 20, "e8e4da")
    c.hline(48, 58, 18, OUTLINE)
    c.fill(40, 10, 41, 11, RED)
    c.rect(18, 18, 44, 42, g)  # body
    c.rect(36, 16, 42, 22, g)
    for i in range(20):  # tail
        c.fill(18 - i, 24 + i // 2, 18 - i, 30 + i // 3, g)
    c.rect(22, 42, 28, 60, g), c.rect(34, 42, 40, 60, g)
    c.fill(20, 58, 29, 61, "3a4a36"), c.fill(32, 58, 41, 61, "3a4a36")
    c.rect(42, 26, 48, 29, g), c.dot(49, 30, g)
    c.rect(14, 60, 50, 63, "3a3d48")  # stand
    return c


def bc_penny():
    c = C(2, 3)
    shadow(c, 3, 28, 47)
    c.rect(10, 38, 21, 46, "3a3d48")
    c.disc(16, 19, 14, "a8642a")
    c.disc(16, 19, 11, "c9894a")
    c.fill(12, 12, 19, 26, "a8642a")  # profile
    c.fill(13, 9, 18, 12, "a8642a")
    c.fill(19, 16, 21, 18, "a8642a")
    c.hline(8, 24, 28, "8a5a28")
    return c


def bc_joker_card():
    c = C(2, 3)
    shadow(c, 2, 29, 47)
    c.rect(3, 1, 28, 44, "f4f4f0")
    c.rect(5, 3, 26, 42, "f4f4f0", hexc("c3262d"))
    c.fill(11, 13, 20, 22, "e8e8e0")
    c.fill(9, 9, 22, 13, "3e9b45")
    c.dot(9, 8, "6a3d9a"), c.dot(22, 8, "6a3d9a"), c.dot(15, 7, "6a3d9a")
    c.dot(13, 16, INK), c.dot(18, 16, INK)
    c.hline(12, 19, 19, "c3262d")
    c.fill(10, 24, 21, 34, "6a3d9a")
    c.fill(7, 5, 8, 6, "c3262d"), c.fill(23, 39, 24, 40, "c3262d")
    return c


def bc_tea_table():
    c = C(2, 2)
    shadow(c, 3, 28, 31)
    c.disc(16, 13, 12, "5a3a26")
    c.disc(16, 13, 10, "6b4423", outline=False)
    c.vline(16, 24, 30, "3a2a1a")
    c.fill(10, 9, 13, 12, "f4f1e6"), c.dot(14, 10, "f4f1e6")  # teapot
    c.fill(19, 12, 20, 13, "f4f1e6"), c.fill(16, 15, 17, 16, "f4f1e6")
    return c


def bc_stool():
    c = C(1, 1)
    shadow(c, 3, 12, 15)
    c.disc(8, 8, 5, "5a2a1e")
    c.disc(8, 8, 3, "6b3424", outline=False)
    return c


def bc_tea_cart():
    c = C(1, 1)
    shadow(c, 1, 14, 15)
    c.rect(1, 5, 14, 8, "c9c4b6"), c.rect(1, 11, 14, 13, "c9c4b6")
    c.vline(2, 8, 13, "9aa0ab"), c.vline(13, 8, 13, "9aa0ab")
    c.fill(4, 2, 7, 4, "f4f1e6"), c.fill(9, 3, 10, 4, "f4f1e6")
    return c


def bc_brief_table():
    c = C(4, 2)
    shadow(c, 2, 61, 31)
    c.rect(1, 4, 62, 26, "1f222b")
    c.fill(4, 7, 59, 23, "06243a")
    rnd = random.Random(9)
    gotham_skyline(c, 6, 57, 22, rnd, (30, 120, 180, 200))
    for x in range(6, 58, 6):
        c.vline(x, 8, 22, (60, 160, 230, 90))
    c.fill(40, 12, 41, 13, RED), c.fill(20, 15, 21, 16, RED)
    c.hline(3, 60, 25, CYAN)
    return c


def bc_stalagmite():
    c = C(1, 2)
    shadow(c, 1, 14, 31)
    c.tri(5, 12, 30, 4, "3e3a44")
    c.tri(10, 3, 30, 5, "4a4652")
    c.vline(10, 8, 28, "5a5662")
    c.dot(9, 20, "6a6672")
    return c


def bc_rocks():
    c = C(1, 1)
    shadow(c, 1, 14, 15)
    c.disc(5, 11, 4, "3e3a44")
    c.disc(11, 12, 3, "4a4652")
    c.dot(4, 9, "5a5662")
    return c


def bc_stalactites():
    c = C(2, 1)
    for x0, h in ((1, 12), (7, 8), (12, 14), (19, 9), (25, 13)):
        for y in range(0, h):
            w = max(0, (h - y) * 3 // h)
            c.hline(x0 + 2 - w, x0 + 2 + w, y, "3e3a44" if y < h - 2 else "5a5662")
    return c


def bc_bat_colony():
    c = C(2, 1)
    c.hline(0, 31, 1, "2a2630")
    for x in (2, 8, 14, 20, 26):
        c.vline(x + 2, 1, 3, "2a2630")
        c.fill(x + 1, 4, x + 3, 9, "0c0b10")
        c.dot(x, 5, "0c0b10"), c.dot(x + 4, 5, "0c0b10")
        c.dot(x + 1, 6, (226, 59, 59, 160))
    return c


def bc_waterfall():
    c = C(4, 4)
    rnd = random.Random(4)
    c.rect(0, 0, 63, 12, "3e3a44")
    for x in range(10, 54):
        for y in range(10, 54):
            v = rnd.random()
            c.dot(x, y, (150, 200, 235, 255) if v < 0.3 else (90, 150, 200, 255) if v < 0.8 else (220, 240, 255, 255))
    for x in range(2, 62):  # pool
        for y in range(52, 63):
            if ((x - 32) / 30) ** 2 + ((y - 57) / 6) ** 2 <= 1:
                c.dot(x, y, (60, 120, 170, 255) if (x + y) % 5 else (200, 235, 255, 255))
    for y in range(12, 56):
        c.dot(9, y, OUTLINE), c.dot(54, y, OUTLINE)
    for x, y in ((14, 50), (30, 49), (46, 51), (22, 52)):
        c.disc(x, y, 2, (235, 245, 255, 200), outline=False)
    return c


def bc_rings():
    c = C(1, 3)
    shadow(c, 0, 15, 47)
    c.vline(1, 2, 46, "3a3d48"), c.vline(14, 2, 46, "3a3d48")
    c.hline(1, 14, 2, "3a3d48")
    c.vline(5, 3, 20, "9aa0ab"), c.vline(10, 3, 20, "9aa0ab")
    c.disc(5, 23, 2, "2f7bd8"), c.disc(10, 23, 2, "2f7bd8")
    c.fill(2, 44, 13, 46, "15151b")
    return c


def bc_escrima():
    c = C(1, 1)
    line(c, 2, 13, 13, 2, "2f7bd8"), line(c, 2, 2, 13, 13, "2f7bd8")
    line(c, 3, 13, 14, 2, "1f5ab0"), line(c, 3, 2, 14, 13, "1f5ab0")
    return c


def bc_nw_emblem():
    c = C(2, 1)
    c.rect(1, 1, 30, 14, "15151b")
    for i in range(10):
        c.dot(4 + i, 4 + i // 2, "2f7bd8"), c.dot(27 - i, 4 + i // 2, "2f7bd8")
        c.dot(4 + i, 5 + i // 2, "2f7bd8"), c.dot(27 - i, 5 + i // 2, "2f7bd8")
    c.fill(14, 8, 17, 12, "2f7bd8")
    return c


def bc_robin_emblem():
    c = C(1, 1)
    c.disc(8, 8, 6, "f5d142")
    c.disc(8, 8, 4, INK, outline=False)
    c.vline(6, 5, 11, "c3262d"), c.fill(7, 5, 9, 5, "c3262d"), c.fill(9, 6, 9, 7, "c3262d")
    c.fill(7, 8, 8, 8, "c3262d"), line(c, 8, 9, 10, 11, "c3262d")
    return c


def bc_dummy():
    c = C(1, 2)
    shadow(c, 3, 12, 31)
    c.rect(6, 26, 9, 30, "3a3d48")
    c.rect(4, 12, 11, 26, "a8743a")
    c.disc(8, 8, 3, "a8743a")
    c.hline(2, 13, 15, "8a5a28")
    c.fill(6, 18, 9, 21, "c3262d")
    return c


def bc_bunk():
    c = C(2, 2)
    shadow(c, 1, 30, 31)
    c.rect(1, 6, 30, 28, "3a2a20")
    c.fill(3, 8, 28, 26, "c3262d")
    c.fill(3, 8, 10, 14, "f4f1e6")
    c.hline(3, 28, 18, "a81e24")
    return c


def bc_centrifuge():
    c = C(1, 2)
    shadow(c, 1, 14, 31)
    c.rect(1, 10, 14, 30, "c9ced8")
    c.disc(8, 16, 4, "8b919c")
    c.dot(8, 16, CYAN)
    c.fill(3, 24, 12, 27, "06243a"), c.hline(4, 9, 25, "3cff6a")
    return c


def bc_evidence():
    c = C(1, 2)
    shadow(c, 1, 14, 31)
    c.rect(1, 2, 14, 30, "3a3d48")
    for y in (4, 11, 18, 25):
        c.rect(2, y, 13, y + 5, "2a2d36")
        c.fill(6, y + 2, 9, y + 2, "c9ced8")
    c.dot(11, 13, "3e9b45"), c.dot(11, 20, "c3262d")
    return c


def bc_chem_shelf():
    c = C(2, 1)
    c.hline(0, 31, 13, "5a5d68"), c.hline(0, 31, 6, "5a5d68")
    for x, col in ((2, "3cff6a"), (7, "c3262d"), (12, CYAN), (18, "f5d142"), (24, "a05ad8"), (28, "3cff6a")):
        c.fill(x, 9, x + 2, 12, col)
        c.dot(x + 1, 8, "c9ced8")
    for x in (4, 10, 20, 26):
        c.fill(x, 2, x + 1, 5, "c9ced8")
    return c


def bc_case_board():
    c = C(2, 1)
    c.rect(0, 0, 31, 15, "a8743a")
    for x, y, col in ((3, 3, "f4f1e6"), (12, 2, "3e9b45"), (22, 3, "f4f1e6"), (6, 9, "f4f1e6"), (18, 9, "6a3d9a"), (26, 9, "f4f1e6")):
        c.fill(x, y, x + 3, y + 3, col)
    for (x0, y0), (x1, y1) in (((5, 5), (14, 4)), ((14, 4), (23, 5)), ((14, 4), (19, 10)), ((8, 11), (19, 10)), ((23, 5), (27, 10))):
        line(c, x0, y0, x1, y1, "c3262d")
    return c


def bc_radio():
    c = C(1, 2)
    shadow(c, 1, 14, 31)
    c.rect(1, 3, 14, 30, "2a2d36")
    for y in (6, 14, 22):
        c.rect(2, y, 13, y + 6, "1b1c22")
        c.disc(5, y + 3, 1, "9aa0ab")
        c.hline(8, 12, y + 2, "3cff6a"), c.hline(8, 10, y + 4, "f5d142")
    c.vline(13, 0, 3, "9aa0ab")
    return c


def bc_salmon_ladder():
    c = C(1, 3)
    shadow(c, 0, 15, 47)
    c.vline(1, 1, 46, "3a3d48"), c.vline(14, 1, 46, "3a3d48")
    for y in range(4, 44, 5):
        c.dot(2, y, "9aa0ab"), c.dot(13, y, "9aa0ab")
    c.hline(1, 14, 14, "c9ced8")
    return c


def bc_oracle():
    c = C(2, 3)
    shadow(c, 1, 30, 47)
    c.rect(13, 30, 18, 46, STEEL)
    for i, (x, y) in enumerate(((0, 2), (16, 2), (8, 16))):
        c.rect(x, y, x + 15, y + 12, "1f222b")
        c.fill(x + 2, y + 2, x + 13, y + 10, "03101c")
        for yy in range(y + 3, y + 10, 2):
            c.hline(x + 3, x + 3 + (yy * (i + 2)) % 9, yy, "3cff6a")
    c.disc(16, 37, 4, "3cff6a")
    c.disc(16, 37, 2, INK, outline=False)
    return c


def bc_workbench():
    c = C(2, 2)
    shadow(c, 1, 30, 31)
    c.rect(0, 8, 31, 18, "5a5d68")
    c.vline(2, 18, 30, "3a3d48"), c.vline(29, 18, 30, "3a3d48")
    c.fill(3, 4, 8, 8, "3a3d48")  # vise
    for x in (12, 18):
        bat(c, x, 9, INK)
    line(c, 23, 11, 29, 9, "9aa0ab"), c.dot(29, 8, "9aa0ab")
    c.fill(4, 24, 27, 26, "3a3d48")
    return c


def bc_batarangs():
    c = C(1, 1)
    c.rect(1, 1, 14, 14, "3a3d48")
    for y in (3, 8):
        bat(c, 2, y, INK), bat(c, 8, y, INK)
    return c


def bc_cowl_bust():
    c = C(1, 2)
    shadow(c, 2, 13, 31)
    c.rect(4, 22, 11, 30, "3a3d48")
    c.rect(3, 8, 12, 21, "2b2b33")
    for x in (3, 4, 11, 12):
        c.dot(x, 7, "2b2b33")
    c.dot(3, 5, "2b2b33"), c.dot(12, 5, "2b2b33"), c.dot(3, 6, "2b2b33"), c.dot(12, 6, "2b2b33")
    c.hline(5, 6, 14, "f4f4f4"), c.hline(9, 10, 14, "f4f4f4")
    c.fill(5, 17, 10, 21, "c9a088")
    return c


# ================================================================ Hall of Justice
MARBLE, MARBLE2, ROYAL = "ece8de", "d6d0c2", "21409a"


def hoj_desk():
    c = C(3, 2)
    shadow(c, 1, 46, 31)
    c.rect(0, 8, 47, 26, MARBLE)
    c.fill(1, 9, 46, 12, "f6f3ec")
    c.hline(1, 46, 13, GOLD), c.hline(1, 46, 25, GOLD)
    c.fill(18, 16, 29, 22, ROYAL)
    for dx, dy in ((23, 17), (22, 18), (24, 18), (23, 19), (23, 20), (21, 19), (25, 19)):
        c.dot(dx, dy, GOLD)
    c.fill(1, 26, 4, 30, MARBLE2), c.fill(43, 26, 46, 30, MARBLE2)
    return c


def hoj_monitor():
    c = C(1, 2)
    c.rect(1, 4, 14, 17, "c9a24a")
    c.fill(2, 5, 13, 16, "0d1f44")
    c.disc(7, 10, 3, "1f3f8a")
    c.dot(7, 10, GOLD), c.dot(6, 9, GOLD), c.dot(8, 9, GOLD)
    c.hline(3, 12, 14, CYAN)
    c.fill(7, 18, 8, 21, GOLD)
    c.hline(5, 10, 22, GOLD)
    return c


def hoj_chair():
    c = C(1, 1)
    shadow(c, 3, 12, 15)
    c.rect(3, 3, 12, 13, "c9962a")
    c.fill(4, 4, 11, 12, ROYAL)
    c.hline(5, 10, 5, "3a5ad8")
    return c


def hoj_statue(hid):
    """A founder in marble, twice life (of an agent) size, on a pedestal with a gold plate."""
    c = C(2, 5)
    shadow(c, 0, 31, 79)
    c.rect(0, 64, 31, 78, MARBLE2)
    c.rect(2, 62, 29, 66, MARBLE)
    c.hline(1, 30, 67, GOLD)
    c.fill(9, 71, 22, 74, GOLD)
    fig = hero_front(hid, "marble")
    paste(c, fig.resize((32, 64), Image.NEAREST), 0, 0)
    return c


def hoj_pillar():
    c = C(1, 2)
    shadow(c, 0, 15, 31)
    c.rect(0, 0, 15, 3, MARBLE)
    c.hline(1, 14, 3, GOLD)
    c.rect(2, 4, 13, 27, MARBLE)
    for x in (4, 7, 10):
        c.vline(x, 5, 26, MARBLE2)
    c.hline(1, 14, 27, GOLD)
    c.rect(0, 27, 15, 30, MARBLE)
    return c


def hoj_fountain():
    c = C(4, 3)
    shadow(c, 2, 61, 47)
    for y in range(8, 46):
        for x in range(0, 64):
            d = ((x - 32) / 30) ** 2 + ((y - 30) / 14) ** 2
            if d <= 1:
                c.dot(x, y, MARBLE if d > 0.75 else (90, 160, 220, 255) if (x * 3 + y) % 7 else (210, 235, 255, 255))
            elif d <= 1.08:
                c.dot(x, y, OUTLINE)
    c.rect(28, 6, 35, 28, MARBLE)
    c.fill(29, 7, 34, 9, GOLD)
    for dx in (-1, 0, 1):
        for y in range(0, 6):
            c.dot(31 + dx * (6 - y) // 2, y, (200, 235, 255, 220))
    star = [(31, 10), (30, 11), (31, 11), (32, 11), (29, 12), (33, 12), (31, 12)]
    for x, y in star:
        c.dot(x, y + 6, ROYAL)
    return c


def hoj_round_table():
    c = C(6, 3)
    shadow(c, 2, 93, 47)
    for y in range(0, 46):
        for x in range(0, 96):
            d = ((x - 48) / 46) ** 2 + ((y - 22) / 20) ** 2
            if d <= 1:
                c.dot(x, y, GOLD if d > 0.9 else ROYAL if d > 0.35 else "1a2f70")
            elif d <= 1.06:
                c.dot(x, y, OUTLINE)
    # The league's star in the middle.
    pts = [(48 + (11 if k % 2 == 0 else 4.5) * math.cos(math.radians(-90 + 36 * k)), 22 + (9 if k % 2 == 0 else 3.7) * math.sin(math.radians(-90 + 36 * k))) for k in range(10)]
    for y in range(10, 34):
        for x in range(34, 62):
            inside = False
            for i in range(10):
                (x1, y1), (x2, y2) = pts[i], pts[(i + 1) % 10]
                if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
                    inside = not inside
            if inside:
                c.dot(x, y, GOLD)
    # The seven founders' emblems around the rim.
    for k, col in enumerate(("c8202a", "15151b", "c3262d", "f5c518", "2aa84a", "ef7d2a", "4f9a4a")):
        a = math.radians(-160 + k * 23.3)
        c.fill(48 + round(36 * math.cos(a)) - 1, 22 + round(15 * math.sin(a)) - 1, 48 + round(36 * math.cos(a)) + 1, 22 + round(15 * math.sin(a)) + 1, col)
    return c


def hoj_throne():
    c = C(1, 1)
    shadow(c, 2, 13, 15)
    c.rect(2, 2, 13, 13, GOLD)
    c.fill(3, 3, 12, 12, ROYAL)
    c.fill(6, 6, 9, 9, GOLD)
    return c


def hoj_troubalert():
    c = C(6, 2)
    c.rect(0, 0, 95, 31, "c9962a")
    c.fill(2, 2, 93, 29, "06122e")
    rnd = random.Random(21)
    for blob in ((12, 10, 9, 6), (30, 18, 5, 7), (48, 9, 10, 6), (56, 20, 6, 5), (76, 12, 9, 6), (82, 24, 4, 3)):
        x0, y0, rx, ry = blob
        for y in range(y0 - ry, y0 + ry + 1):
            for x in range(x0 - rx, x0 + rx + 1):
                if ((x - x0) / rx) ** 2 + ((y - y0) / ry) ** 2 <= 1 and rnd.random() < 0.85:
                    c.dot(x, y, "2f8a46")
    for x, y in ((50, 10), (31, 19), (78, 13)):
        c.fill(x, y, x + 1, y + 1, RED)
        c.rect(x - 2, y - 2, x + 3, y + 3, None, hexc(RED))
    c.fill(2, 2, 93, 5, "8a1a1a")
    for x in range(36, 60, 4):
        c.fill(x, 3, x + 2, 4, "f5d142")
    return c


EMBLEM_BANNERS = {
    "superman": ("2456c9", ["RYYYR", "YRRRY", ".YRY.", "..Y.."], {"R": "c8202a", "Y": "f5d142"}),
    "batman": ("4a4d58", ["YYYYY", "YKYKY", "KKKKK", "YYKYY"], {"Y": "f2c94c", "K": "15151b"}),
    "wonder-woman": ("c3262d", ["Y.Y.Y", "YYYYY", ".Y.Y."], {"Y": "f5c542"}),
    "flash": ("c8202a", [".WWW.", "WYWWW", "WWYWW", ".WWY."], {"W": "f4f1e6", "Y": "f5c518"}),
    "green-lantern": ("15151b", [".GGG.", "GKKKG", "GGGGG", ".G.G."], {"G": "2aa84a", "K": "15151b"}),
    "aquaman": ("ef7d2a", ["Y...Y", "YY.YY", "Y.Y.Y", "Y...Y"], {"Y": "f5c542"}),
    "martian-manhunter": ("2456c9", ["R...R", ".R.R.", "..R..", ".R.R."], {"R": "c3262d"}),
    "cyborg": ("8b919c", [".RRR.", "RRWRR", ".RRR."], {"R": "e23b3b", "W": "ffffff"}),
    "shazam": ("c3262d", ["..YY", ".YY.", "YYYY", ".YY."], {"Y": "f5d142"}),
    "green-arrow": ("2f7a3a", ["....Y", "...Y.", "YYY..", "..Y.."], {"Y": "f5d142"}),
    "hawkman": ("c9962a", ["R...R", "RR.RR", ".RRR.", "..R.."], {"R": "8a1a1a"}),
}


def hoj_banner(hid):
    bg, rows, cmap = EMBLEM_BANNERS[hid]
    c = C(1, 1)
    c.hline(1, 14, 0, GOLD)
    c.rect(2, 1, 13, 13, bg)
    c.dot(2, 13, None), c.dot(13, 13, None)
    c.dot(7, 14, hexc(bg)), c.dot(8, 14, hexc(bg))
    for dy, row in enumerate(rows):
        for dx, ch in enumerate(row):
            if ch != ".":
                c.dot(5 + dx, 4 + dy, cmap[ch])
    return c


def hoj_emblem():
    c = C(2, 2)
    c.rect(1, 1, 30, 30, ROYAL, hexc(GOLD))
    pts = [(15.5 + (11 if k % 2 == 0 else 4.6) * math.cos(math.radians(-90 + 36 * k)), 16 + (11 if k % 2 == 0 else 4.6) * math.sin(math.radians(-90 + 36 * k))) for k in range(10)]
    for y in range(3, 29):
        for x in range(3, 29):
            inside = False
            for i in range(10):
                (x1, y1), (x2, y2) = pts[i], pts[(i + 1) % 10]
                if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
                    inside = not inside
            if inside:
                c.dot(x, y, GOLD)
    return c


def pedestal(c, glass=True):
    shadow(c, 1, 14, c.h - 1)
    c.rect(2, c.h - 12, 13, c.h - 2, MARBLE)
    c.hline(2, 13, c.h - 12, GOLD)
    if glass:
        for y in range(2, c.h - 12):
            c.dot(2, y, (200, 230, 255, 110)), c.dot(13, y, (200, 230, 255, 110))
        c.hline(2, 13, 2, (200, 230, 255, 140))
        glow(c, 3, 3, 12, c.h - 13, "bfe3ff", 24)


def hoj_trident():
    c = C(1, 2)
    pedestal(c)
    c.vline(8, 4, 19, GOLD)
    for x in (5, 8, 11):
        c.vline(x, 3, 7, GOLD)
    c.hline(5, 11, 7, GOLD)
    c.dot(5, 2, GOLD), c.dot(8, 1, GOLD), c.dot(11, 2, GOLD)
    return c


def hoj_lasso():
    c = C(1, 2)
    pedestal(c)
    for r in (4, 3):
        for a in range(0, 360, 20):
            c.dot(8 + round(r * math.cos(math.radians(a))), 12 + round(r * 0.6 * math.sin(math.radians(a))), "f5c542")
    c.hline(4, 11, 6, GOLD), c.dot(7, 5, RED), c.dot(8, 5, RED)  # tiara
    return c


def hoj_shield():
    c = C(1, 2)
    pedestal(c, glass=False)
    c.disc(8, 10, 6, "c9ced8")
    c.disc(8, 10, 3, "b8202a", outline=False)
    c.dot(8, 10, "f5c542")
    c.vline(13, 1, 18, "e8e8f0"), c.hline(12, 14, 14, GOLD)
    return c


def hoj_flash_helmet():
    c = C(1, 2)
    pedestal(c)
    c.fill(4, 10, 11, 14, "c9ced8")
    c.hline(3, 12, 15, "c9ced8")
    c.fill(5, 9, 10, 9, "c9ced8")
    c.fill(2, 9, 3, 11, "e8e8f0"), c.fill(12, 9, 13, 11, "e8e8f0")
    c.dot(1, 8, "e8e8f0"), c.dot(14, 8, "e8e8f0")
    return c


def hoj_lantern():
    c = C(2, 3)
    shadow(c, 2, 29, 47)
    c.rect(4, 38, 27, 46, MARBLE)
    c.hline(4, 27, 38, GOLD)
    g = "2aa84a"
    glow(c, 2, 2, 29, 37, "6cff8a", 40)
    c.rect(8, 30, 23, 37, "1f6a2a")
    c.rect(10, 12, 21, 30, g)
    for y in range(13, 30, 3):
        c.hline(11, 20, y, "8cffa0")
    c.rect(8, 8, 23, 12, "1f6a2a")
    c.rect(13, 3, 18, 8, "1f6a2a")
    c.disc(15, 21, 3, "eaffe8", outline=False)
    return c


def hoj_motherbox():
    c = C(1, 2)
    pedestal(c)
    c.rect(3, 7, 12, 17, "8b919c")
    for (x0, y0), (x1, y1) in (((4, 9), (8, 9)), ((8, 9), (8, 13)), ((8, 13), (11, 13)), ((5, 15), (10, 15))):
        line(c, x0, y0, x1, y1, CYAN)
    c.dot(6, 12, "ffffff")
    return c


def hoj_treadmill():
    c = C(3, 2)
    shadow(c, 1, 46, 31)
    c.rect(2, 14, 45, 28, "8b919c")
    c.fill(4, 16, 43, 26, "2a2d36")
    for x in range(6, 42, 4):
        c.vline(x, 17, 25, "4a4d58")
    c.rect(4, 2, 7, 14, "8b919c"), c.rect(40, 2, 43, 14, "8b919c")
    c.hline(4, 43, 3, "c9ced8")
    for i, x in enumerate(range(10, 38, 6)):  # speed trail
        c.fill(x, 20, x + 3, 21, ("f5c518", "c8202a")[i % 2])
    return c


def hoj_shazam_throne():
    c = C(2, 3)
    shadow(c, 1, 30, 47)
    rock = "6a6672"
    c.rect(2, 14, 29, 46, rock)
    c.rect(8, 22, 23, 38, "5a5662")
    c.fill(9, 30, 22, 33, "c3262d")
    c.rect(6, 6, 25, 22, rock)
    for x, y in ((4, 16), (26, 20), (10, 42), (20, 44)):
        c.dot(x, y, "4a4652")
    pts = [(18, 0), (12, 6), (16, 6), (11, 13), (19, 5), (15, 5)]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        line(c, x0, y0, x1, y1, "f5d142")
    for x in (2, 29):
        c.fill(x, 8, x, 12, "ff9a3c")
        c.dot(x, 7, "f5d142")
    return c


def hoj_starro():
    c = C(3, 3)
    shadow(c, 3, 44, 47)
    c.rect(8, 38, 39, 46, MARBLE)
    c.hline(8, 39, 38, GOLD)
    p = "7a4ab8"
    for k in range(5):
        a = math.radians(-90 + 72 * k)
        for r in range(0, 18):
            w = max(1, 5 - r // 4)
            x, y = 24 + round(r * math.cos(a)), 20 + round(r * math.sin(a))
            c.fill(x - w // 2, y - w // 2, x + w // 2, y + w // 2, p)
    c.disc(24, 20, 6, p)
    c.disc(24, 20, 3, "f5d142", outline=False)
    c.dot(24, 20, INK)
    for x, y in ((18, 12), (30, 14), (20, 28), (29, 27)):
        c.dot(x, y, "a07ad8")
    return c


def hoj_teleporter():
    c = C(2, 2)
    shadow(c, 1, 30, 31)
    for y in range(14, 31):
        for x in range(0, 32):
            d = ((x - 16) / 15) ** 2 + ((y - 23) / 7) ** 2
            if d <= 1:
                c.dot(x, y, "c9ced8" if d > 0.6 else "6ad8ff")
    for x in range(4, 29, 3):
        for y in range(1, 22):
            if (x + y) % 4 == 0:
                c.dot(x, y, (180, 240, 255, 150))
    return c


def hoj_crystal():
    c = C(1, 2)
    pedestal(c)
    for y in range(3, 18):
        w = 3 - abs(y - 10) // 3
        c.hline(8 - w, 8 + w, y, (190, 240, 255, 230))
    c.vline(8, 3, 17, "ffffff")
    return c


def hoj_archive():
    c = C(2, 2)
    shadow(c, 0, 31, 31)
    c.rect(0, 0, 31, 30, "6b4423")
    for y in (2, 11, 20):
        c.fill(2, y, 29, y + 7, "3a2a1a")
        x = 3
        rnd = random.Random(y)
        while x < 28:
            w = rnd.randint(1, 3)
            c.fill(x, y + 1 + rnd.randint(0, 1), x + w - 1, y + 7, rnd.choice([GOLD, ROYAL, "8a1a1a", "2f6a3a"]))
            x += w + 1
    return c


def hoj_table():
    c = C(2, 2)
    shadow(c, 3, 28, 31)
    c.disc(16, 13, 12, MARBLE)
    c.disc(16, 13, 9, "f6f3ec", outline=False)
    c.disc(16, 13, 3, GOLD, outline=False)
    c.vline(16, 25, 30, MARBLE2)
    return c


def hoj_stool():
    c = C(1, 1)
    shadow(c, 3, 12, 15)
    c.disc(8, 8, 5, GOLD)
    c.disc(8, 8, 3, ROYAL, outline=False)
    return c


def hoj_globe():
    c = C(2, 2)
    shadow(c, 4, 27, 31)
    c.rect(12, 24, 19, 30, GOLD)
    c.disc(16, 12, 10, "2456c9")
    for x, y, rx, ry in ((12, 9, 4, 3), (20, 14, 3, 4), (14, 16, 2, 2)):
        for yy in range(y - ry, y + ry + 1):
            for xx in range(x - rx, x + rx + 1):
                if ((xx - x) / rx) ** 2 + ((yy - y) / ry) ** 2 <= 1:
                    c.dot(xx, yy, "3fae5a")
    for a in range(200, 341, 8):
        c.dot(16 + round(12 * math.cos(math.radians(a))), 12 + round(12 * math.sin(math.radians(a))), GOLD)
    return c


# ================================================================ floors (grayscale, coloured by the layout)
def floors():
    rnd = random.Random(77)
    out = {}
    # 9: cave rock — irregular flagstones.
    im = Image.new("RGBA", (16, 16))
    px = im.load()
    seeds = [(rnd.randint(0, 15), rnd.randint(0, 15), rnd.randint(110, 170)) for _ in range(6)]
    for y in range(16):
        for x in range(16):
            ds = sorted(((min(abs(x - sx), 16 - abs(x - sx)) ** 2 + min(abs(y - sy), 16 - abs(y - sy)) ** 2, v) for sx, sy, v in seeds))
            v = 70 if ds[1][0] - ds[0][0] < 6 else ds[0][1] + rnd.randint(-8, 8)
            px[x, y] = (v, v, v, 255)
    out["floor_9.png"] = im
    # 10: diamond plate.
    im = Image.new("RGBA", (16, 16), (150, 150, 150, 255))
    px = im.load()
    for y in range(16):
        for x in range(16):
            if (x + y) % 8 in (0, 1) and (x // 4 + y // 4) % 2 == 0:
                px[x, y] = (200, 200, 200, 255)
            elif (x - y) % 8 in (0, 1) and (x // 4 + y // 4) % 2 == 1:
                px[x, y] = (200, 200, 200, 255)
        px[0, y] = (110, 110, 110, 255)
    for x in range(16):
        px[x, 0] = (110, 110, 110, 255)
    out["floor_10.png"] = im
    # 11: veined marble, large slabs.
    im = Image.new("RGBA", (16, 16), (210, 210, 210, 255))
    px = im.load()
    for x in range(16):
        y = int(4 + 3 * math.sin(x / 2.5))
        px[x, y] = (170, 170, 170, 255)
        if x % 3 == 0:
            px[x, min(15, y + 1)] = (185, 185, 185, 255)
    for i in range(16):
        px[i, 15] = (150, 150, 150, 255)
        px[15, i] = (150, 150, 150, 255)
    out["floor_11.png"] = im
    # 12: inlaid star tile (the star lighter than the slab).
    im = Image.new("RGBA", (16, 16), (150, 150, 150, 255))
    px = im.load()
    pts = [(7.5 + (6.5 if k % 2 == 0 else 2.7) * math.cos(math.radians(-90 + 36 * k)), 8 + (6.5 if k % 2 == 0 else 2.7) * math.sin(math.radians(-90 + 36 * k))) for k in range(10)]
    for y in range(16):
        for x in range(16):
            inside = False
            for i in range(10):
                (x1, y1), (x2, y2) = pts[i], pts[(i + 1) % 10]
                if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
                    inside = not inside
            if inside:
                px[x, y] = (225, 225, 225, 255)
            if x in (0, 15) or y in (0, 15):
                px[x, y] = (120, 120, 120, 255)
    out["floor_12.png"] = im
    return out


# id, name, category, draw, background rows, on surfaces
P = []


def add(pid, name, cat, draw, bg, surface=False):
    P.append((pid, name, cat, draw, bg, surface))


add("BC_CONSOLE", "Cave Console", "desks", bc_console, 1)
add("BC_MONITOR", "Cave Monitor", "electronics", bc_monitor, 1, True)
add("BC_CHAIR", "Cave Chair", "chairs", bc_chair, 0)
add("BC_MAIN_SCREEN", "Cave Computer — Main Screen", "decor", bc_main_screen, 4)
add("BC_SIDE_SCREEN_A", "Cave Computer — Feeds (Asylum, Joker)", "decor", lambda: bc_side_screen(("asylum", "joker")), 3)
add("BC_SIDE_SCREEN_B", "Cave Computer — Feeds (Radar, Wave)", "decor", lambda: bc_side_screen(("radar", "wave")), 3)
add("BC_SIDE_SCREEN_C", "Cave Computer — Feeds (GCPD, Map)", "decor", lambda: bc_side_screen(("gcpd", "map")), 3)
add("BC_WALL_MONITOR", "Wall Monitors", "wall", bc_wall_monitor, 0)
add("BC_SERVER", "Cave Server", "decor", bc_server, 1)
for hid, name in (("batman", "Batsuit"), ("robin", "Robin Suit"), ("nightwing", "Nightwing Suit"), ("batgirl", "Batgirl Suit"),
                  ("batwoman", "Batwoman Suit"), ("red-hood", "Red Hood Suit")):
    add(f"BC_SUIT_{hid.upper().replace('-', '_')}", f"Suit Tube — {name}", "decor", (lambda h: lambda: bc_suit(h))(hid), 2)
add("BC_SUIT_MEMORIAL", "Suit Tube — Robin Memorial", "decor", lambda: bc_suit("robin", memorial=True), 2)
add("BC_SUIT_ARMOR", "Suit Tube — Heavy Armor", "decor", lambda: bc_suit("batman", armor=True), 2)
add("BC_BATMOBILE", "Batmobile on its Turntable", "decor", bc_batmobile, 1)
add("BC_TUMBLER", "Armoured Car", "decor", bc_tumbler, 1)
add("BC_BATCYCLE", "Batcycle", "decor", bc_batcycle, 1)
add("BC_BATWING", "Batwing", "decor", bc_batwing, 2)
add("BC_TOOL_WALL", "Tool Wall", "wall", bc_tool_wall, 0)
add("BC_CHARGER", "Charging Station", "decor", bc_charger, 1)
add("BC_TIRES", "Tyre Stack", "decor", bc_tires, 0)
add("BC_TREX", "Animatronic T-Rex", "decor", bc_trex, 3)
add("BC_PENNY", "Giant Penny", "decor", bc_penny, 2)
add("BC_JOKER_CARD", "Giant Joker Card", "decor", bc_joker_card, 2)
add("BC_TEA_TABLE", "Alfred's Tea Table", "desks", bc_tea_table, 0)
add("BC_STOOL", "Leather Stool", "chairs", bc_stool, 0)
add("BC_TEA_CART", "Tea Cart", "decor", bc_tea_cart, 0)
add("BC_BRIEF_TABLE", "Holo Briefing Table", "desks", bc_brief_table, 0)
add("BC_STALAGMITE", "Stalagmite", "decor", bc_stalagmite, 1)
add("BC_ROCKS", "Rocks", "decor", bc_rocks, 0)
add("BC_STALACTITES", "Stalactites", "wall", bc_stalactites, 0)
add("BC_BAT_COLONY", "Bat Colony", "wall", bc_bat_colony, 0)
add("BC_WATERFALL", "Cave Waterfall", "decor", bc_waterfall, 3)
add("BC_RINGS", "Gymnastic Rings", "decor", bc_rings, 2)
add("BC_ESCRIMA", "Escrima Sticks", "wall", bc_escrima, 0)
add("BC_NW_EMBLEM", "Nightwing Emblem", "wall", bc_nw_emblem, 0)
add("BC_ROBIN_EMBLEM", "Robin Emblem", "wall", bc_robin_emblem, 0)
add("BC_DUMMY", "Training Dummy", "decor", bc_dummy, 1)
add("BC_BUNK", "Robin's Bunk", "decor", bc_bunk, 1)
add("BC_CENTRIFUGE", "Centrifuge", "decor", bc_centrifuge, 1)
add("BC_EVIDENCE", "Evidence Locker", "decor", bc_evidence, 1)
add("BC_CHEM_SHELF", "Chemistry Shelf", "wall", bc_chem_shelf, 0)
add("BC_CASE_BOARD", "Case Board", "wall", bc_case_board, 0)
add("BC_RADIO", "Comms Rack", "decor", bc_radio, 1)
add("BC_SALMON_LADDER", "Salmon Ladder", "decor", bc_salmon_ladder, 2)
add("BC_ORACLE", "Oracle's Screens", "decor", bc_oracle, 2)
add("BC_WORKBENCH", "Gadget Workbench", "decor", bc_workbench, 1)
add("BC_BATARANGS", "Batarang Rack", "wall", bc_batarangs, 0)
add("BC_COWL_BUST", "Cowl on a Stand", "decor", bc_cowl_bust, 1)

add("HOJ_DESK", "Marble Desk", "desks", hoj_desk, 1)
add("HOJ_MONITOR", "League Monitor", "electronics", hoj_monitor, 1, True)
add("HOJ_CHAIR", "League Chair", "chairs", hoj_chair, 0)
for hid in ("superman", "batman", "wonder-woman", "flash", "green-lantern", "aquaman", "martian-manhunter", "cyborg", "shazam", "green-arrow", "hawkman"):
    nm = HEROES[hid].name
    add(f"HOJ_STATUE_{hid.upper().replace('-', '_')}", f"Statue — {nm}", "decor", (lambda h: lambda: hoj_statue(h))(hid), 4)
    add(f"HOJ_BANNER_{hid.upper().replace('-', '_')}", f"Banner — {nm}", "wall", (lambda h: lambda: hoj_banner(h))(hid), 0)
add("HOJ_PILLAR", "Marble Pillar", "decor", hoj_pillar, 1)
add("HOJ_FOUNTAIN", "Founders' Fountain", "decor", hoj_fountain, 1)
add("HOJ_ROUND_TABLE", "The Round Table", "desks", hoj_round_table, 0)
add("HOJ_THRONE", "Founder's Seat", "chairs", hoj_throne, 0)
add("HOJ_TROUBALERT", "Alert Monitor", "wall", hoj_troubalert, 0)
add("HOJ_EMBLEM", "League Emblem", "wall", hoj_emblem, 0)
add("HOJ_TRIDENT", "Relic — Trident", "decor", hoj_trident, 1)
add("HOJ_LASSO", "Relic — Golden Lasso & Tiara", "decor", hoj_lasso, 1)
add("HOJ_SHIELD", "Relic — Amazon Shield & Sword", "decor", hoj_shield, 1)
add("HOJ_FLASH_HELMET", "Relic — Winged Helmet", "decor", hoj_flash_helmet, 1)
add("HOJ_LANTERN", "Relic — Power Battery", "decor", hoj_lantern, 2)
add("HOJ_MOTHERBOX", "Relic — Mother Box", "decor", hoj_motherbox, 1)
add("HOJ_TREADMILL", "Cosmic Treadmill", "decor", hoj_treadmill, 1)
add("HOJ_SHAZAM_THRONE", "Throne of the Rock of Eternity", "decor", hoj_shazam_throne, 2)
add("HOJ_STARRO", "Trophy — Starro", "decor", hoj_starro, 2)
add("HOJ_TELEPORTER", "Teleporter Pad", "decor", hoj_teleporter, 1)
add("HOJ_CRYSTAL", "Relic — Kryptonian Crystal", "decor", hoj_crystal, 1)
add("HOJ_ARCHIVE", "Archive Shelves", "decor", hoj_archive, 1)
add("HOJ_TABLE", "Marble Table", "desks", hoj_table, 0)
add("HOJ_STOOL", "League Stool", "chairs", hoj_stool, 0)
add("HOJ_GLOBE", "Golden Globe", "decor", hoj_globe, 1)


def main():
    for pid, name, cat, draw, bg, surface in P:
        cv = draw()
        d = os.path.join(OUT, pid)
        os.makedirs(d, exist_ok=True)
        cv.im.save(os.path.join(d, f"{pid}.png"))
        m = {"id": pid, "name": name, "category": cat, "type": "asset", "canPlaceOnWalls": cat == "wall",
             "canPlaceOnSurfaces": surface, "backgroundTiles": bg, "width": cv.w, "height": cv.h,
             "footprintW": cv.w // 16, "footprintH": cv.h // 16}
        with open(os.path.join(d, "manifest.json"), "w", encoding="utf-8") as f:
            json.dump(m, f, indent=2, ensure_ascii=False)
            f.write("\n")
    for name, im in floors().items():
        im.save(os.path.join(ASSETS, "floors", name))
    if len(sys.argv) > 1:
        scale, x, y, rowh = 3, 4, 4, 0
        prev = Image.new("RGBA", (1900, 1500), (46, 44, 62, 255))
        for pid, *_ in P:
            im = Image.open(os.path.join(OUT, pid, f"{pid}.png"))
            big = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
            if x + big.width > prev.width:
                x, y, rowh = 4, y + rowh + 6, 0
            prev.alpha_composite(big, (x, y))
            x += big.width + 6
            rowh = max(rowh, big.height)
        prev.crop((0, 0, prev.width, min(prev.height, y + rowh + 4))).save(sys.argv[1])
    print(f"dc furniture: {len(P)} pieces, 4 floors")


if __name__ == "__main__":
    main()
