#!/usr/bin/env python3
"""Generate the themed avatar templates — public/assets/characters/themes/<group>/<id>.png + themes.json.

Add agent → Identity → Avatar offers these next to the crew packs (classic + pixel). Every pixel is
drawn by this script (nothing downloaded, copied or traced). Costumes follow well-known characters
(DC, Marvel, Dragon Ball, Naruto) as fan art: the drawings are ours, the characters are trademarks of
their owners — see docs/ASSETS.md before shipping them in a public release. The festive and sci-fi
groups are original.

Format is the office's character sheet (pixel-agents): 112×96 PNG = 7 frames × 16 px, 3 rows × 32 px:
down, up, right (left = mirrored right). Frames: walk1, walk2, walk3, type1, type2, read1, read2.

    python scripts/gen-avatars.py [preview.png]
    npm run assets

Needs Pillow. Deterministic.
"""
from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass, field

from PIL import Image

W, H = 16, 32
ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "characters", "themes")
OUTLINE = (24, 18, 30, 255)


def hexc(s, a=255):
    if s is None:
        return None
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)


def shade(c, f):
    return (max(0, min(255, int(c[0] * f))), max(0, min(255, int(c[1] * f))), max(0, min(255, int(c[2] * f))), c[3])


@dataclass
class Hero:
    id: str
    name: str
    skin: str = "#f2c6a0"
    hair: str = "#2a1d16"
    # short long spiky ssj wild bald ponytail bob peak messy slick tilted mohawk none
    hstyle: str = "short"
    eyes: str = "#1d1a26"
    # cowl fullmask helmet turban santa witch elfhat khan pumpkin diver hood
    head: str | None = None
    head_c: str = "#222222"
    head_c2: str | None = None  # faceplate / lens / hat band
    ears: bool = False  # cowl ears
    wings: str | None = None  # little wings on the cowl (Flash)
    mask: str | None = None  # domino lower shades goggles
    mask_c: str = "#1b1b22"
    band: str | None = None  # forehead band colour
    band_plate: str = "#c9d1dc"
    tiara: str | None = None
    top: str = "#3d6fd8"
    top2: str | None = None  # undershirt / lower torso
    sleeves: str | None = None  # None = top colour
    arms: str = "long"  # long | short (skin forearms) | none (bare arms)
    gloves: str | None = None
    pants: str = "#2c3550"
    boots: str = "#2b2233"
    tall_boots: bool = False
    belt: str | None = None
    trunks: str | None = None
    skirt: str | None = None
    cape: str | None = None
    cape_in: str | None = None
    coat: str | None = None  # long coat over the body
    coat2: str | None = None  # coat pattern (clouds)
    dress: bool = False
    shoulder: str | None = None
    collar: str | None = None
    emblem: str | None = None
    emblem_back: str | None = None
    beard: str | None = None
    back_item: str | None = None  # gourd tank
    extra: list = field(default_factory=list)  # web, scales, armor, stars, vest


# Chest emblems: rows of characters, '.' = keep the suit; letters map to colours per emblem.
EMBLEMS = {
    "bat": (["YYYYYY", "YKYYKY", "KKKKKK", "YYKKYY"], {"Y": "#f2c94c", "K": "#15151b"}),
    "bat_black": (["K....K", "KKKKKK", "..KK.."], {"K": "#121217"}),
    "super": (["RYYYYR", "YRRRRY", ".YRRY.", "..YY.."], {"R": "#d42a2a", "Y": "#f5d142"}),
    "bolt": ([".WWWW.", "WWYYWW", "WYYWWW", ".WWYW."], {"W": "#f4f1e6", "Y": "#f5c518"}),
    "lantern": ([".KKKK.", "KWKKWK", "KWWWWK", ".KKKK."], {"K": "#15151b", "W": "#e9f7ea"}),
    "star": (["..WW..", "WWWWWW", ".WWWW.", ".W..W."], {"W": "#f4f4f4"}),
    "spider": (["K.KK.K", ".KKKK.", "K.KK.K"], {"K": "#121217"}),
    "reactor": (["..CC..", ".CWWC.", "..CC.."], {"C": "#7fdcff", "W": "#ffffff"}),
    "eagle": (["Y.YY.Y", "YYYYYY", ".Y..Y."], {"Y": "#f5c542"}),
    "kame": ([".WWW.", "WKKKW", ".WWW."], {"W": "#f4f1e6", "K": "#1d1a26"}),
    "capsule": (["WW", "WW"], {"W": "#f4f1e6"}),
    "swirl": ([".RRR.", "R.R.R", ".RRR."], {"R": "#d0442f"}),
    "uchiha": ([".RR.", "RRRR", "WWWW", ".WW."], {"R": "#c3262d", "W": "#f4f1e6"}),
    "sand": (["RR", "R."], {"R": "#b02a2a"}),
    "cyborg": (["..RR..", ".RRRR.", "..RR.."], {"R": "#ff3b3b"}),
    "panther": (["S....S", ".SSSS.", "..SS.."], {"S": "#b9b5d6"}),
    "tie": (["RR", "RR", "RR", ".R"], {"R": "#b8242a"}),
    "neon": (["C..M", ".CM.", "M..C"], {"C": "#2ff3ff", "M": "#ff2fd1"}),
    "hourglass": (["RRR", ".R.", "RRR"], {"R": "#d42a2a"}),
    "amulet": ([".YY.", "YGGY", ".YY."], {"Y": "#e7b53b", "G": "#3fd27a"}),
    "robin_r": (["YYY", "YRY", "YRY"], {"Y": "#f5d142", "R": "#c3262d"}),
    "nightwing": (["B....B", "BB..BB", ".BBBB.", "..BB.."], {"B": "#2f7bd8"}),
    "red_bat": (["R....R", "RRRRRR", "..RR.."], {"R": "#d42a2a"}),
    "shazam_bolt": (["..YY", ".YY.", "YYYY", ".YY.", "YY.."], {"Y": "#f5d142"}),
    "xstrap": (["R....R", ".R..R.", "..RR..", ".R..R."], {"R": "#c3262d"}),
    "bones": (["W.W", ".W.", "W.W"], {"W": "#e8e8e0"}),
}


class Canvas:
    def __init__(self):
        self.px = {}

    def set(self, x, y, c):
        if c is not None and 0 <= x < W and 0 <= y < H:
            self.px[(x, y)] = c

    def rect(self, x0, y0, x1, y1, c):
        if c is None:
            return
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.set(x, y, c)

    def clear(self, x, y):
        self.px.pop((x, y), None)

    def image(self):
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        for (x, y), c in self.px.items():
            img.putpixel((x, y), c)
        out = img.copy()
        for y in range(H):
            for x in range(W):
                if img.getpixel((x, y))[3]:
                    continue
                if any(0 <= x + dx < W and 0 <= y + dy < H and img.getpixel((x + dx, y + dy))[3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    out.putpixel((x, y), OUTLINE)
        return out


def emblem(cv, name, cx, y, mirror=False):
    if not name:
        return
    rows, cmap = EMBLEMS[name]
    w = len(rows[0])
    x0 = cx - w // 2
    for dy, row in enumerate(rows):
        for dx, ch in enumerate(row[::-1] if mirror else row):
            if ch != ".":
                cv.set(x0 + dx, y + dy, hexc(cmap[ch]))


# ------------------------------------------------------------------ front / back
def cape_front(cv, h, dy, back):
    if not h.cape:
        return
    c = hexc(h.cape)
    if back:
        cv.rect(3, 15 + dy, 12, 27 + dy, c)
        cv.rect(4, 27 + dy, 11, 28 + dy, c)
        for x in (5, 8, 11):
            cv.rect(x, 18 + dy, x, 27 + dy, shade(c, 0.8))
    else:
        inner = hexc(h.cape_in) if h.cape_in else shade(c, 0.7)
        cv.rect(2, 16 + dy, 13, 27 + dy, inner)
        cv.rect(2, 16 + dy, 2, 27 + dy, c)
        cv.rect(13, 16 + dy, 13, 27 + dy, c)


def hair_behind(cv, h, dy):
    hair = hexc(h.hair)
    if h.hstyle in ("long", "wild") and h.head not in ("fullmask", "helmet"):
        cv.rect(2, 8 + dy, 13, 19 + dy if h.hstyle == "long" else 21 + dy, shade(hair, 0.85))
    if h.hstyle == "ponytail":
        cv.rect(6, 15 + dy, 9, 19 + dy, shade(hair, 0.85))


def legs_front(cv, h, dy, lift):
    pants, boots = hexc(h.pants), hexc(h.boots)
    for i, (x0, x1) in enumerate(((5, 7), (8, 10))):
        up = 1 if (lift == -1 and i == 0) or (lift == 1 and i == 1) else 0
        cv.rect(x0, 24 + dy, x1, 27 + dy - up, pants)
        top = 26 if h.tall_boots else 28
        cv.rect(x0, top + dy - up, x1, 29 + dy - up, boots)
    cv.set(10, 25 + dy, shade(pants, 0.8))


def legs_seated(cv, h, dy):
    pants, boots = hexc(h.pants), hexc(h.boots)
    cv.rect(5, 24 + dy, 10, 25 + dy, pants)
    cv.rect(5, 26 + dy, 7, 27 + dy, boots)
    cv.rect(8, 26 + dy, 10, 27 + dy, boots)


def torso_front(cv, h, dy, back, seated):
    top = hexc(h.top)
    cv.rect(4, 16 + dy, 11, 23 + dy, top)
    cv.rect(11, 17 + dy, 11, 23 + dy, shade(top, 0.82))
    if h.top2:
        t2 = hexc(h.top2)
        if back:
            pass
        elif "vest" in h.extra:
            cv.rect(4, 16 + dy, 11, 23 + dy, t2)
            cv.rect(4, 16 + dy, 5, 23 + dy, top)
            cv.rect(10, 16 + dy, 11, 23 + dy, top)
        elif "gi" in h.extra:
            cv.rect(7, 16 + dy, 8, 18 + dy, t2)
            cv.set(6, 16 + dy, t2)
            cv.set(9, 16 + dy, t2)
        else:
            cv.rect(4, 20 + dy, 11, 23 + dy, t2)
    if "armor" in h.extra:
        a = hexc("#f1efe6")
        cv.rect(4, 16 + dy, 11, 20 + dy, a)
        cv.rect(4, 20 + dy, 11, 20 + dy, hexc("#e2b33c"))
    if "scales" in h.extra and not back:
        for y in range(17, 23, 2):
            for x in range(5 + (y // 2) % 2, 11, 2):
                cv.set(x, y + dy, shade(top, 0.8))
    if "web" in h.extra:
        dk = shade(top, 0.55)
        for y in (18, 21):
            cv.rect(4, y + dy, 11, y + dy, dk)
        cv.rect(7, 16 + dy, 8, 23 + dy, dk) if back else None
    if "stars" in h.extra and not back:
        pass
    if h.dress:
        cv.rect(4, 22 + dy, 11, (25 if seated else 26) + dy, top)
        cv.rect(3, 24 + dy, 12, (25 if seated else 26) + dy, shade(top, 0.9))
    if h.shoulder:
        s = hexc(h.shoulder)
        cv.rect(3, 16 + dy, 5, 17 + dy, s)
        cv.rect(10, 16 + dy, 12, 17 + dy, s)
    if h.collar:
        cv.rect(5, 15 + dy, 10, 16 + dy, hexc(h.collar))
    if h.belt:
        cv.rect(4, 22 + dy, 11, 22 + dy, hexc(h.belt))
    if h.trunks:
        cv.rect(4, 23 + dy, 11, 24 + dy, hexc(h.trunks))
    if h.skirt:
        sk = hexc(h.skirt)
        cv.rect(4, 23 + dy, 11, 25 + dy, sk)
        if "stars" in h.extra:
            cv.set(5, 24 + dy, hexc("#f4f4f4"))
            cv.set(9, 23 + dy, hexc("#f4f4f4"))
    if not back:
        emblem(cv, h.emblem, 8, 17 + dy)
    else:
        emblem(cv, h.emblem_back, 8, 18 + dy)


def coat_front(cv, h, dy, back, seated):
    if not h.coat:
        return
    c = hexc(h.coat)
    bottom = (25 if seated else 28) + dy
    if back:
        cv.rect(4, 16 + dy, 11, bottom, c)
        cv.rect(7, 22 + dy, 8, bottom, shade(c, 0.8))
    else:
        cv.rect(4, 16 + dy, 6, bottom, c)
        cv.rect(9, 16 + dy, 11, bottom, c)
        cv.rect(4, 16 + dy, 11, 16 + dy, c)
    if h.coat2:
        p = hexc(h.coat2)
        for x, y in ((5, 19), (10, 23), (5, 25), (6, 25), (10, 18), (11, 18)):
            if y + dy <= bottom:
                cv.set(x, y + dy, p)
        if back:
            cv.rect(6, 19 + dy, 8, 20 + dy, p)
            cv.rect(8, 24 + dy, 10, 25 + dy, p) if bottom >= 25 + dy else None


def arm_colors(h):
    top = hexc(h.coat or h.top)
    sleeve = hexc(h.sleeves) if h.sleeves else top
    skin = hexc(h.skin)
    hand = hexc(h.gloves) if h.gloves else skin
    return sleeve, skin, hand


def arms_front(cv, h, dy, swing):
    sleeve, skin, hand = arm_colors(h)
    for x, s in ((3, swing), (12, -swing)):
        if h.arms == "none":
            cv.rect(x, 17 + dy, x, 21 + dy + s, skin)
        elif h.arms == "short":
            cv.rect(x, 17 + dy, x, 18 + dy, shade(sleeve, 0.9))
            cv.rect(x, 19 + dy, x, 21 + dy + s, skin)
        else:
            cv.rect(x, 17 + dy, x, 21 + dy + s, shade(sleeve, 0.9))
        if h.gloves:
            cv.set(x, 21 + dy + s, hand)
        cv.set(x, 22 + dy + s, hand)


def face_front(cv, h, dy):
    skin = hexc(h.skin)
    cv.rect(3, 5 + dy, 12, 15 + dy, skin)
    for x, y in ((3, 5), (12, 5), (3, 15), (12, 15)):
        cv.clear(x, y + dy)
    eye = hexc(h.eyes)
    for ex in (5, 10):
        cv.rect(ex, 10 + dy, ex, 11 + dy, eye)
    cv.rect(7, 13 + dy, 8, 13 + dy, shade(skin, 0.72))


def hair_front(cv, h, dy, back):
    hair = hexc(h.hair)
    hl = shade(hair, 1.3)
    s = h.hstyle
    if s in ("none", "bald"):
        if s == "bald":
            cv.set(6, 4 + dy, shade(hexc(h.skin), 0.75)), cv.set(9, 4 + dy, shade(hexc(h.skin), 0.75))
        return
    if back:
        cv.rect(2, 3 + dy, 13, 14 + dy, hair)
        cv.rect(4, 4 + dy, 9, 4 + dy, hl)
    else:
        cv.rect(2, 3 + dy, 13, 7 + dy, hair)
        cv.rect(2, 8 + dy, 3, 11 + dy, hair)
        cv.rect(12, 8 + dy, 13, 11 + dy, hair)
        cv.rect(4, 8 + dy, 6, 8 + dy, hair)
        cv.rect(9, 8 + dy, 10, 8 + dy, hair)
        cv.rect(4, 4 + dy, 8, 4 + dy, hl)
    if s in ("spiky", "ssj", "wild", "tilted", "peak", "mohawk", "messy"):
        if s == "mohawk":
            cv.rect(6, 0 + dy, 9, 3 + dy, hair)
            cv.rect(2, 3 + dy, 5, 6 + dy, shade(hexc(h.skin), 0.9)) if not back else None
            cv.rect(10, 3 + dy, 13, 6 + dy, shade(hexc(h.skin), 0.9)) if not back else None
        elif s == "peak":
            cv.rect(4, 0 + dy, 11, 3 + dy, hair)
            cv.rect(6, -0 + dy, 9, 1 + dy, hair)
            cv.set(5, 0 + dy, None)
            if not back:
                cv.set(7, 8 + dy, hair), cv.set(8, 8 + dy, hair)
                cv.rect(4, 8 + dy, 6, 8 + dy, hexc(h.skin)), cv.rect(9, 8 + dy, 10, 8 + dy, hexc(h.skin))
        elif s == "tilted":
            for x, y in ((2, 2), (4, 1), (6, 0), (8, 0), (10, 0), (12, 1), (13, 1), (14, 2)):
                cv.rect(x, y + dy, x + 1, 3 + dy, hair)
        else:
            tall = 2 if s in ("ssj", "wild") else 1
            for x in (2, 5, 8, 11):
                cv.rect(x, 2 + dy - tall, x + 1, 3 + dy, hair)
                cv.set(x + 1, 1 + dy - tall, hair)
            if s in ("ssj", "wild"):
                cv.rect(1, 4 + dy, 1, 9 + dy, hair)
                cv.rect(14, 4 + dy, 14, 9 + dy, hair)
            if s == "messy" and not back:
                cv.set(6, 9 + dy, hair), cv.set(9, 9 + dy, hair)
    if s in ("long", "bob", "wild") and not back:
        low = {"bob": 15, "long": 17, "wild": 18}[s]
        cv.rect(2, 12 + dy, 3, low + dy, hair)
        cv.rect(12, 12 + dy, 13, low + dy, hair)
    if s in ("long", "bob", "wild") and back:
        cv.rect(2, 14 + dy, 13, (15 if s == "bob" else 18) + dy, hair)
    if s == "ponytail" and back:
        cv.rect(6, 14 + dy, 9, 18 + dy, hair)
    if s == "slick" and not back:
        cv.rect(4, 8 + dy, 10, 8 + dy, hexc(h.skin))
        cv.rect(2, 8 + dy, 3, 9 + dy, hair)


def headgear_front(cv, h, dy, back):
    c = hexc(h.head_c)
    c2 = hexc(h.head_c2) if h.head_c2 else None
    skin = hexc(h.skin)
    hd = h.head
    if hd == "cowl":
        cv.rect(2, 3 + dy, 13, 11 + dy, c)
        cv.rect(2, 12 + dy, 3, 15 + dy, c)
        cv.rect(12, 12 + dy, 13, 15 + dy, c)
        if back:
            cv.rect(2, 3 + dy, 13, 15 + dy, c)
        else:
            cv.rect(4, 12 + dy, 11, 15 + dy, skin)
            cv.rect(7, 14 + dy, 8, 14 + dy, shade(skin, 0.7))
            cv.rect(4, 10 + dy, 6, 10 + dy, hexc("#f4f4f4") if h.eyes == "#ffffff" else shade(c, 0.6))
            cv.rect(9, 10 + dy, 11, 10 + dy, hexc("#f4f4f4") if h.eyes == "#ffffff" else shade(c, 0.6))
            if h.eyes != "#ffffff":
                cv.set(5, 10 + dy, hexc(h.eyes)), cv.set(10, 10 + dy, hexc(h.eyes))
            if c2:  # forehead letter / mark
                cv.rect(7, 5 + dy, 8, 7 + dy, c2)
        if h.ears:
            for x in (3, 4, 11, 12):
                cv.set(x, 2 + dy, c)
            cv.set(3, 1 + dy, c), cv.set(12, 1 + dy, c), cv.set(3, 0 + dy, c), cv.set(12, 0 + dy, c)
        if h.wings:
            w = hexc(h.wings)
            for side in (1, 14):
                cv.rect(side, 6 + dy, side, 9 + dy, w)
            cv.set(0, 5 + dy, w), cv.set(15, 5 + dy, w)
    elif hd == "fullmask":
        cv.rect(2, 4 + dy, 13, 15 + dy, c)
        cv.rect(3, 3 + dy, 12, 3 + dy, c)
        for x, y in ((2, 4), (13, 4), (2, 15), (13, 15)):
            cv.clear(x, y + dy)
        if not back:
            lens = c2 or hexc("#f4f4f4")
            cv.rect(4, 8 + dy, 6, 11 + dy, lens)
            cv.rect(9, 8 + dy, 11, 11 + dy, lens)
            cv.set(4, 8 + dy, c), cv.set(11, 8 + dy, c)
            if "web" in h.extra:
                dk = shade(c, 0.55)
                cv.rect(3, 13 + dy, 12, 13 + dy, dk)
                cv.set(7, 5 + dy, dk), cv.set(8, 5 + dy, dk), cv.set(7, 6 + dy, dk), cv.set(8, 6 + dy, dk)
        if h.ears:
            cv.set(3, 2 + dy, c), cv.set(12, 2 + dy, c)
    elif hd == "helmet":
        cv.rect(2, 3 + dy, 13, 15 + dy, c)
        for x, y in ((2, 3), (13, 3), (2, 15), (13, 15)):
            cv.clear(x, y + dy)
        if not back and c2:
            cv.rect(4, 7 + dy, 11, 14 + dy, c2)
            cv.rect(4, 10 + dy, 6, 10 + dy, hexc("#bff6ff"))
            cv.rect(9, 10 + dy, 11, 10 + dy, hexc("#bff6ff"))
            cv.rect(6, 13 + dy, 9, 13 + dy, shade(c2, 0.7))
    elif hd == "diver":
        cv.rect(1, 3 + dy, 14, 15 + dy, c)
        if not back:
            cv.rect(4, 6 + dy, 11, 12 + dy, hexc("#9fe3f5"))
            cv.rect(5, 9 + dy, 5, 10 + dy, hexc(h.eyes)), cv.rect(10, 9 + dy, 10, 10 + dy, hexc(h.eyes))
            cv.rect(4, 6 + dy, 6, 6 + dy, hexc("#e9fbff"))
    elif hd == "pumpkin":
        cv.rect(1, 4 + dy, 14, 15 + dy, c)
        cv.rect(3, 3 + dy, 12, 3 + dy, c)
        for x in (4, 8, 11):
            cv.rect(x, 4 + dy, x, 15 + dy, shade(c, 0.8))
        cv.rect(7, 1 + dy, 8, 2 + dy, hexc("#3f6b2a"))
        if not back:
            g = hexc("#ffe066")
            cv.rect(4, 8 + dy, 5, 9 + dy, g), cv.rect(10, 8 + dy, 11, 9 + dy, g)
            cv.rect(4, 12 + dy, 11, 13 + dy, g)
            cv.set(5, 12 + dy, c), cv.set(8, 13 + dy, c), cv.set(10, 12 + dy, c)
    elif hd == "turban":
        cv.rect(2, 2 + dy, 13, 7 + dy, c)
        cv.rect(6, 0 + dy, 9, 2 + dy, c2 or c)
        if h.ears:  # antennae
            cv.set(5, 0 + dy, hexc(h.skin)), cv.set(10, 0 + dy, hexc(h.skin)), cv.set(4, 1 + dy, hexc(h.skin))
            cv.set(11, 1 + dy, hexc(h.skin))
    elif hd in ("santa", "elfhat", "witch"):
        if hd == "witch":
            cv.rect(0, 5 + dy, 15, 6 + dy, c)
            cv.rect(4, 2 + dy, 11, 4 + dy, c)
            cv.rect(6, 0 + dy, 9, 1 + dy, c)
            cv.rect(10, -1 + dy, 11, 0 + dy, c)
            if c2:
                cv.rect(4, 4 + dy, 11, 4 + dy, c2)
        else:
            cv.rect(2, 2 + dy, 13, 5 + dy, c)
            cv.rect(4, 0 + dy, 11, 1 + dy, c)
            cv.rect(11, 0 + dy, 13, 0 + dy, c)
            trim = c2 or hexc("#f4f4f4")
            cv.rect(2, 5 + dy, 13, 6 + dy, trim)
            cv.rect(13, 0 + dy, 14, 1 + dy, trim)
            if hd == "elfhat" and not back:
                cv.set(1, 9 + dy, hexc(h.skin)), cv.set(14, 9 + dy, hexc(h.skin))
    elif hd == "khan":
        cv.rect(2, 3 + dy, 13, 7 + dy, c)
        for y in (4, 6):
            cv.rect(2, y + dy, 13, y + dy, shade(c, 0.75))
    elif hd == "hood":
        cv.rect(1, 2 + dy, 14, 9 + dy, c)
        cv.rect(1, 10 + dy, 2, 16 + dy, c)
        cv.rect(13, 10 + dy, 14, 16 + dy, c)
        if back:
            cv.rect(1, 2 + dy, 14, 16 + dy, c)


def mask_front(cv, h, dy):
    m = h.mask
    if not m:
        return
    c = hexc(h.mask_c)
    if m == "domino":
        cv.rect(4, 9 + dy, 11, 11 + dy, c)
        cv.rect(5, 10 + dy, 5, 10 + dy, hexc("#f4f4f4")), cv.rect(10, 10 + dy, 10, 10 + dy, hexc("#f4f4f4"))
    elif m == "lower":
        cv.rect(3, 12 + dy, 12, 15 + dy, c)
        cv.rect(3, 15 + dy, 12, 15 + dy, c)
    elif m == "shades":
        cv.rect(4, 10 + dy, 6, 11 + dy, c), cv.rect(9, 10 + dy, 11, 11 + dy, c)
        cv.rect(7, 10 + dy, 8, 10 + dy, c)
    elif m == "goggles":
        cv.rect(3, 9 + dy, 12, 9 + dy, hexc("#22222c"))
        cv.rect(4, 9 + dy, 6, 11 + dy, c), cv.rect(9, 9 + dy, 11, 11 + dy, c)


def bands_front(cv, h, dy, back):
    if h.band:
        cv.rect(2, 6 + dy, 13, 7 + dy, hexc(h.band))
        if not back:
            cv.rect(5, 6 + dy, 10, 7 + dy, hexc(h.band_plate))
            if "over_eye" in h.extra:
                cv.rect(3, 8 + dy, 6, 11 + dy, hexc(h.band))
    if h.tiara and not back:
        t = hexc(h.tiara)
        cv.rect(3, 7 + dy, 12, 7 + dy, t)
        cv.set(7, 6 + dy, hexc("#d42a2a")), cv.set(8, 6 + dy, hexc("#d42a2a"))
    if h.beard and not back:
        b = hexc(h.beard)
        cv.rect(3, 12 + dy, 12, 16 + dy, b)
        cv.rect(5, 17 + dy, 10, 17 + dy, b)
        cv.rect(6, 13 + dy, 9, 13 + dy, shade(hexc(h.skin), 0.75))


def back_item(cv, h, dy):
    if h.back_item == "gourd":
        g = hexc("#c9a46a")
        cv.rect(5, 15 + dy, 10, 19 + dy, g)
        cv.rect(4, 19 + dy, 11, 25 + dy, g)
        cv.rect(4, 19 + dy, 11, 19 + dy, hexc("#8a5a33"))
    elif h.back_item == "tank":
        t = hexc("#e8b52a")
        cv.rect(5, 16 + dy, 10, 24 + dy, t)
        cv.rect(7, 15 + dy, 8, 15 + dy, hexc("#6b6b74"))


def head_front(cv, h, dy, back):
    if h.head in ("fullmask", "helmet", "diver", "pumpkin"):
        headgear_front(cv, h, dy, back)
        return
    if back:
        cv.rect(3, 5 + dy, 12, 15 + dy, hexc(h.skin))
    else:
        face_front(cv, h, dy)
    if h.head != "cowl":
        hair_front(cv, h, dy, back)
    if not back:
        mask_front(cv, h, dy)
    bands_front(cv, h, dy, back)
    if h.head:
        headgear_front(cv, h, dy, back)


def paper(cv, x0, y0, x1, y1):
    cv.rect(x0, y0, x1, y1, hexc("#f4f1e6"))
    for y in range(y0 + 1, y1, 2):
        cv.rect(x0 + 1, y, x1 - 1, y, hexc("#9aa3b8"))


def frame_down(h, f, back=False):
    cv = Canvas()
    seated = f >= 3
    dy = 4 if seated else (1 if f == 1 else 0)
    if not back:
        cape_front(cv, h, dy, False)
    hair_behind(cv, h, dy) if not back else None
    if seated:
        legs_seated(cv, h, dy)
    else:
        legs_front(cv, h, dy, (-1, 0, 1)[f])
    torso_front(cv, h, dy, back, seated)
    coat_front(cv, h, dy, back, seated)
    if back:
        back_item(cv, h, dy)
        cape_front(cv, h, dy, True)
    sleeve, skin, hand = arm_colors(h)
    if h.arms == "none":
        sleeve = skin
    if not seated:
        arms_front(cv, h, dy, (1, 0, -1)[f])
    elif back:
        cv.rect(3, 17 + dy, 3, 20 + dy, sleeve)
        cv.rect(12, 17 + dy, 12, 20 + dy, sleeve)
    elif f in (3, 4):
        up = (0, 1) if f == 3 else (1, 0)
        cv.rect(3, 17 + dy, 3, 19 + dy, sleeve)
        cv.rect(12, 17 + dy, 12, 19 + dy, sleeve)
        cv.rect(4, 20 + dy, 5, 20 + dy, sleeve)
        cv.rect(10, 20 + dy, 11, 20 + dy, sleeve)
        cv.set(6, 21 + dy - up[0], hand)
        cv.set(9, 21 + dy - up[1], hand)
    else:
        off = 0 if f == 5 else 1
        cv.rect(3, 17 + dy, 3, 20 + dy, sleeve)
        cv.rect(12, 17 + dy, 12, 20 + dy, sleeve)
        paper(cv, 4, 18 + dy + off, 11, 23 + dy + off)
        cv.set(3, 21 + dy + off, hand)
        cv.set(12, 21 + dy + off, hand)
    head_front(cv, h, dy, back)
    return cv.image()


# ------------------------------------------------------------------ right (profile)
def frame_right(h, f):
    cv = Canvas()
    skin, hair = hexc(h.skin), hexc(h.hair)
    top = hexc(h.top)
    pants, boots = hexc(h.pants), hexc(h.boots)
    sleeve, _, hand = arm_colors(h)
    if h.arms == "none":
        sleeve = skin
    seated = f >= 3
    dy = 4 if seated else (1 if f == 1 else 0)
    # Cape and long hair behind.
    if h.cape:
        c = hexc(h.cape)
        bottom = (25 if seated else 27) + dy
        cv.rect(2, 15 + dy, 5, bottom, c)
        cv.rect(1, 20 + dy, 2, bottom, shade(c, 0.85)) if not seated else None
    if h.hstyle in ("long", "wild", "ponytail") and h.head not in ("fullmask", "helmet", "diver", "pumpkin"):
        cv.rect(3, 9 + dy, 6, (19 if h.hstyle != "ponytail" else 17) + dy, shade(hair, 0.85))
    if h.back_item == "gourd":
        cv.rect(2, 15 + dy, 5, 24 + dy, hexc("#c9a46a"))
    if h.back_item == "tank":
        cv.rect(3, 16 + dy, 5, 23 + dy, hexc("#e8b52a"))
    # Legs.
    if seated:
        cv.rect(6, 24 + dy, 11, 25 + dy, pants)
        cv.rect(10, 26 + dy, 11, 27 + dy, boots if h.tall_boots else pants)
        cv.rect(10, 27 + dy, 12, 27 + dy, boots)
    else:
        stride = (2, 0, -2)[f]
        cv.rect(6, 24 + dy, 9, 25 + dy, pants)
        for lx, s in ((6, -stride), (8, stride)):
            x = lx + (s // 2)
            cv.rect(x, 26 + dy, x + 1, 27 + dy, boots if h.tall_boots else pants)
            cv.rect(x, 28 + dy, x + 2, 29 + dy, boots)
    # Body.
    cv.rect(5, 16 + dy, 10, 23 + dy, top)
    cv.rect(5, 16 + dy, 5, 23 + dy, shade(top, 0.82))
    if h.top2 and "vest" in h.extra:
        cv.rect(9, 16 + dy, 10, 23 + dy, hexc(h.top2))
    if "armor" in h.extra:
        cv.rect(5, 16 + dy, 10, 20 + dy, hexc("#f1efe6"))
    if h.dress:
        cv.rect(5, 22 + dy, 11, (25 if seated else 26) + dy, top)
    if h.coat:
        c = hexc(h.coat)
        cv.rect(4, 16 + dy, 10, (25 if seated else 28) + dy, c)
        if h.coat2:
            cv.rect(6, 19 + dy, 7, 20 + dy, hexc(h.coat2))
    if h.belt:
        cv.rect(5, 22 + dy, 10, 22 + dy, hexc(h.belt))
    if h.trunks:
        cv.rect(5, 23 + dy, 10, 24 + dy, hexc(h.trunks))
    if h.skirt:
        cv.rect(5, 23 + dy, 10, 25 + dy, hexc(h.skirt))
    if h.shoulder:
        cv.rect(6, 15 + dy, 9, 17 + dy, hexc(h.shoulder))
    if h.collar:
        cv.rect(6, 15 + dy, 9, 16 + dy, hexc(h.collar))
    if h.emblem in ("reactor", "lantern", "bolt"):
        cv.set(10, 18 + dy, hexc(EMBLEMS[h.emblem][1][list(EMBLEMS[h.emblem][1])[0]]))
    # Head (profile).
    full = h.head in ("fullmask", "helmet", "diver", "pumpkin")
    if full:
        c = hexc(h.head_c)
        x0 = 1 if h.head in ("diver", "pumpkin") else 3
        cv.rect(x0, 3 + dy, 13, 15 + dy, c)
        cv.clear(x0, 3 + dy), cv.clear(13, 3 + dy)
        if h.head == "fullmask":
            cv.rect(9, 8 + dy, 12, 11 + dy, hexc(h.head_c2) if h.head_c2 else hexc("#f4f4f4"))
            if h.ears:
                cv.set(5, 2 + dy, c), cv.set(9, 2 + dy, c)
        elif h.head == "helmet" and h.head_c2:
            cv.rect(9, 7 + dy, 13, 14 + dy, hexc(h.head_c2))
            cv.rect(10, 10 + dy, 12, 10 + dy, hexc("#bff6ff"))
        elif h.head == "diver":
            cv.rect(9, 6 + dy, 13, 12 + dy, hexc("#9fe3f5"))
            cv.rect(11, 9 + dy, 11, 10 + dy, hexc(h.eyes))
        elif h.head == "pumpkin":
            cv.rect(7, 1 + dy, 8, 2 + dy, hexc("#3f6b2a"))
            cv.rect(11, 8 + dy, 12, 9 + dy, hexc("#ffe066"))
            cv.rect(10, 12 + dy, 13, 13 + dy, hexc("#ffe066"))
    else:
        cv.rect(4, 5 + dy, 12, 15 + dy, skin)
        for x, y in ((4, 5), (12, 5), (4, 15), (12, 15)):
            cv.clear(x, y + dy)
        cv.set(13, 11 + dy, skin)
        cv.rect(10, 10 + dy, 10, 11 + dy, hexc(h.eyes))
        cv.set(11, 13 + dy, shade(skin, 0.72))
        hl = shade(hair, 1.3)
        s = h.hstyle
        if h.head == "cowl":
            c = hexc(h.head_c)
            cv.rect(3, 3 + dy, 12, 11 + dy, c)
            cv.rect(3, 12 + dy, 8, 15 + dy, c)
            cv.rect(9, 10 + dy, 11, 10 + dy, hexc("#f4f4f4") if h.eyes == "#ffffff" else shade(c, 0.6))
            cv.set(13, 11 + dy, skin)
            if h.ears:
                cv.set(8, 2 + dy, c), cv.set(8, 1 + dy, c), cv.set(8, 0 + dy, c), cv.set(9, 2 + dy, c)
            if h.wings:
                cv.rect(6, 6 + dy, 7, 9 + dy, hexc(h.wings))
        elif s not in ("none", "bald"):
            cv.rect(3, 3 + dy, 12, 7 + dy, hair)
            cv.rect(3, 8 + dy, 7, 12 + dy, hair)
            cv.rect(11, 8 + dy, 12, 8 + dy, hair)
            cv.rect(5, 4 + dy, 10, 4 + dy, hl)
            if s in ("spiky", "ssj", "wild", "tilted", "peak", "messy"):
                tall = 2 if s in ("ssj", "wild", "peak", "tilted") else 1
                for x in (3, 6, 9):
                    cv.rect(x, 2 + dy - tall, x + 1, 2 + dy, hair)
                cv.rect(1, 4 + dy, 2, 6 + dy, hair) if s in ("ssj", "wild", "tilted") else None
            if s == "mohawk":
                cv.rect(4, 0 + dy, 11, 2 + dy, hair)
                cv.rect(3, 8 + dy, 7, 12 + dy, shade(skin, 0.9))
            if s in ("long", "bob", "wild"):
                cv.rect(3, 12 + dy, 6, (16 if s == "bob" else 19) + dy, hair)
            if s == "ponytail":
                cv.rect(1, 9 + dy, 3, 15 + dy, hair)
        cv.set(7, 11 + dy, shade(skin, 0.8)) if h.head != "cowl" else None
        if h.mask == "domino":
            cv.rect(8, 9 + dy, 12, 11 + dy, hexc(h.mask_c))
            cv.set(10, 10 + dy, hexc("#f4f4f4"))
        elif h.mask == "lower":
            cv.rect(8, 12 + dy, 13, 15 + dy, hexc(h.mask_c))
        elif h.mask in ("shades", "goggles"):
            cv.rect(9, 10 + dy, 12, 11 + dy, hexc(h.mask_c))
            cv.rect(5, 10 + dy, 8, 10 + dy, hexc("#22222c"))
        if h.band:
            cv.rect(3, 6 + dy, 12, 7 + dy, hexc(h.band))
            cv.rect(10, 6 + dy, 12, 7 + dy, hexc(h.band_plate))
            if "over_eye" in h.extra:
                pass
        if h.tiara:
            cv.rect(6, 7 + dy, 12, 7 + dy, hexc(h.tiara))
        if h.beard:
            cv.rect(7, 12 + dy, 12, 16 + dy, hexc(h.beard))
        if h.head in ("santa", "elfhat"):
            c = hexc(h.head_c)
            cv.rect(3, 2 + dy, 12, 5 + dy, c)
            cv.rect(2, 0 + dy, 7, 1 + dy, c)
            cv.rect(3, 5 + dy, 12, 6 + dy, hexc(h.head_c2) if h.head_c2 else hexc("#f4f4f4"))
            cv.rect(0, 1 + dy, 1, 2 + dy, hexc("#f4f4f4"))
        elif h.head == "witch":
            c = hexc(h.head_c)
            cv.rect(1, 5 + dy, 14, 6 + dy, c)
            cv.rect(4, 2 + dy, 10, 4 + dy, c)
            cv.rect(5, 0 + dy, 8, 1 + dy, c)
            cv.rect(3, -1 + dy, 5, 0 + dy, c)
        elif h.head == "khan":
            cv.rect(3, 3 + dy, 12, 7 + dy, hexc(h.head_c))
        elif h.head == "turban":
            cv.rect(3, 2 + dy, 12, 7 + dy, hexc(h.head_c))
            cv.rect(6, 0 + dy, 9, 2 + dy, hexc(h.head_c2) if h.head_c2 else hexc(h.head_c))
        elif h.head == "hood":
            c = hexc(h.head_c)
            cv.rect(2, 2 + dy, 12, 8 + dy, c)
            cv.rect(2, 9 + dy, 7, 16 + dy, c)
    # Arm.
    if not seated:
        swing = (1, 0, -1)[f]
        cv.rect(7, 17 + dy, 8, 21 + dy, sleeve)
        if h.arms == "short":
            cv.rect(7, 19 + dy, 8, 21 + dy, skin)
        cv.set(8 + swing, 22 + dy, hand)
    elif f in (3, 4):
        cv.rect(7, 17 + dy, 8, 19 + dy, sleeve)
        cv.rect(9, 20 + dy, 11, 20 + dy, sleeve)
        cv.set(12, 21 + dy - (0 if f == 3 else 1), hand)
    else:
        off = 0 if f == 5 else 1
        cv.rect(7, 17 + dy, 8, 20 + dy, sleeve)
        cv.rect(11, 16 + dy + off, 13, 22 + dy + off, hexc("#f4f1e6"))
        cv.rect(11, 17 + dy + off, 11, 21 + dy + off, hexc("#9aa3b8"))
        cv.set(10, 20 + dy + off, hand)
    return cv.image()


def sheet(h):
    img = Image.new("RGBA", (W * 7, H * 3), (0, 0, 0, 0))
    for f in range(7):
        img.alpha_composite(frame_down(h, f), (f * W, 0))
        img.alpha_composite(frame_down(h, f, back=True), (f * W, H))
        img.alpha_composite(frame_right(h, f), (f * W, 2 * H))
    return img


# ------------------------------------------------------------------ the roster
TAN = "#f2c6a0"
GROUPS = [
    ("dc", "DC", [
        Hero("batman", "Batman", skin=TAN, head="cowl", head_c="#2b2b33", ears=True, eyes="#ffffff", top="#7d7f88",
             sleeves="#7d7f88", gloves="#1e1e24", pants="#7d7f88", boots="#1e1e24", tall_boots=True, belt="#e2b33c",
             trunks="#2b2b33", cape="#24242b", cape_in="#17171c", emblem="bat_black"),
        Hero("superman", "Superman", skin=TAN, hair="#141420", hstyle="short", top="#2456c9", pants="#2456c9",
             boots="#c8202a", tall_boots=True, belt="#f5d142", trunks="#c8202a", cape="#c8202a", emblem="super", emblem_back="super"),
        Hero("wonder-woman", "Wonder Woman", skin="#e3ab83", hair="#141018", hstyle="long", tiara="#f5c542", top="#c3262d",
             arms="none", gloves="#c9ced8", pants="#e3ab83", boots="#c3262d", tall_boots=True, skirt="#21409a", belt="#f5c542",
             emblem="eagle", extra=["stars"]),
        Hero("flash", "The Flash", skin=TAN, head="cowl", head_c="#c8202a", wings="#f5c518", top="#c8202a", pants="#c8202a",
             boots="#f5c518", belt="#f5c518", emblem="bolt"),
        Hero("aquaman", "Aquaman", skin="#d8a27c", hair="#c9a24a", hstyle="wild", beard="#b48a3c", top="#e8862c",
             pants="#2f8a57", boots="#2f8a57", gloves="#2f8a57", belt="#f5c542", extra=["scales"]),
        Hero("green-lantern", "Green Lantern", skin=TAN, hair="#3a2a20", mask="domino", mask_c="#2aa84a", top="#2aa84a",
             top2="#15151b", pants="#15151b", boots="#2aa84a", gloves="#ffffff", emblem="lantern"),
        Hero("cyborg", "Cyborg", skin="#6b4430", hstyle="bald", hair="#6b4430", top="#b8bec9", pants="#b8bec9",
             boots="#8b919c", gloves="#8b919c", sleeves="#8b919c", emblem="cyborg", eyes="#ff3b3b"),
        Hero("robin", "Robin", skin=TAN, hair="#141018", hstyle="short", mask="domino", mask_c="#141018", top="#c3262d",
             sleeves="#2f8a46", arms="short", gloves="#2f8a46", pants="#2f8a46", boots="#1b1b20", belt="#f5c542",
             cape="#1b1b20", cape_in="#f5c542", emblem="robin_r"),
        Hero("nightwing", "Nightwing", skin=TAN, hair="#141018", hstyle="messy", mask="domino", mask_c="#141018",
             top="#15151b", pants="#15151b", boots="#15151b", gloves="#15151b", emblem="nightwing"),
        Hero("batgirl", "Batgirl", skin="#f7d7bd", hair="#c3412a", hstyle="long", head="cowl", head_c="#2a2438", ears=True,
             eyes="#ffffff", top="#4a4458", pants="#4a4458", boots="#f5c542", tall_boots=True, gloves="#f5c542",
             belt="#f5c542", cape="#2a2438", cape_in="#2a2438", emblem="bat"),
        Hero("batwoman", "Batwoman", skin="#f2e6e0", hair="#d42a2a", hstyle="long", head="cowl", head_c="#15151b", ears=True,
             eyes="#ffffff", top="#15151b", pants="#15151b", boots="#d42a2a", tall_boots=True, gloves="#d42a2a",
             cape="#15151b", cape_in="#a01f2a", emblem="red_bat"),
        Hero("red-hood", "Red Hood", head="fullmask", head_c="#b8202a", head_c2="#f4f4f4", top="#2a2a32", coat="#5a3a26",
             pants="#2a2a32", boots="#1b1b20", gloves="#1b1b20", emblem="red_bat"),
        Hero("martian-manhunter", "Martian Manhunter", skin="#4f9a4a", hstyle="bald", hair="#4f9a4a", eyes="#d42a2a",
             top="#4f9a4a", arms="none", pants="#4f9a4a", boots="#2456c9", tall_boots=True, cape="#2456c9",
             cape_in="#1f3f8a", emblem="xstrap"),
        Hero("shazam", "Shazam", skin=TAN, hair="#141018", hstyle="short", top="#c3262d", pants="#c3262d",
             boots="#f5c542", tall_boots=True, gloves="#f5c542", belt="#f5c542", cape="#f4f1e6", cape_in="#e8d9a8",
             emblem="shazam_bolt"),
        Hero("green-arrow", "Green Arrow", skin=TAN, hair="#d9b24a", head="hood", head_c="#2f7a3a", mask="domino",
             mask_c="#2f7a3a", beard="#d9b24a", top="#2f7a3a", pants="#2f7a3a", boots="#5a3a26", gloves="#5a3a26",
             belt="#5a3a26"),
        Hero("hawkman", "Hawkman", skin="#e3ab83", head="cowl", head_c="#c9962a", eyes="#ffffff", top="#e3ab83",
             arms="none", pants="#2f7a3a", boots="#c9962a", tall_boots=True, belt="#c9962a", cape="#8b919c",
             cape_in="#5a5d68", emblem="xstrap"),
        Hero("joker", "Joker", skin="#f2f2ec", hair="#3e9b45", hstyle="slick", top="#6a3d9a", top2="#3e9b45",
             pants="#6a3d9a", boots="#2b2233", coat="#6a3d9a", eyes="#3e9b45"),
    ]),
    ("marvel", "Marvel", [
        Hero("iron-man", "Iron Man", head="helmet", head_c="#b8202a", head_c2="#e7b53b", top="#b8202a", top2="#e7b53b",
             pants="#e7b53b", boots="#b8202a", tall_boots=True, gloves="#b8202a", emblem="reactor"),
        Hero("captain-america", "Captain America", skin=TAN, head="cowl", head_c="#21409a", head_c2="#f4f4f4",
             eyes="#3a6fd8", top="#21409a", top2="#c3262d", pants="#21409a", boots="#c3262d", tall_boots=True,
             gloves="#c3262d", emblem="star", belt="#5a3a26"),
        Hero("spider-man", "Spider-Man", head="fullmask", head_c="#d42a2a", top="#d42a2a", top2="#2350b8",
             pants="#2350b8", boots="#d42a2a", tall_boots=True, gloves="#d42a2a", sleeves="#2350b8", emblem="spider",
             extra=["web"]),
        Hero("thor", "Thor", skin=TAN, hair="#e6c15a", hstyle="long", beard="#c9a24a", top="#3a3d48", pants="#2b2d36",
             boots="#5a5d68", cape="#c3262d", arms="none", gloves="#5a5d68", belt="#9aa0ab"),
        Hero("hulk", "Hulk", skin="#6fae45", hair="#1b1b20", hstyle="messy", top="#6fae45", arms="none",
             pants="#6a3d9a", boots="#6fae45", eyes="#1d1a26"),
        Hero("black-widow", "Black Widow", skin="#f2c6a0", hair="#b5482c", hstyle="bob", top="#1f1f27", pants="#1f1f27",
             boots="#1f1f27", belt="#9aa0ab", gloves="#1f1f27", emblem="hourglass"),
        Hero("black-panther", "Black Panther", head="fullmask", head_c="#22222c", head_c2="#d9d6ee", ears=True,
             top="#22222c", pants="#22222c", boots="#22222c", gloves="#22222c", emblem="panther"),
        Hero("doctor-strange", "Doctor Strange", skin=TAN, hair="#2a1d16", hstyle="short", beard="#3a2a20",
             top="#1f3f8a", pants="#1f2a52", boots="#3a2a20", belt="#a8743a", cape="#c3262d", collar="#c3262d",
             emblem="amulet"),
    ]),
    ("dragonball", "Dragon Ball", [
        Hero("goku", "Goku", skin=TAN, hair="#141018", hstyle="wild", top="#ef7d2a", top2="#2350b8", sleeves="#2350b8",
             arms="none", gloves="#2350b8", pants="#ef7d2a", boots="#2350b8", belt="#2350b8", emblem="kame", extra=["gi"]),
        Hero("goku-ssj", "Goku SSJ", skin=TAN, hair="#f7d64a", hstyle="ssj", eyes="#2bb3a3", top="#ef7d2a", top2="#2350b8",
             arms="none", gloves="#2350b8", pants="#ef7d2a", boots="#2350b8", belt="#2350b8", emblem="kame", extra=["gi"]),
        Hero("vegeta", "Vegeta", skin=TAN, hair="#141018", hstyle="peak", top="#1f3f9a", pants="#1f3f9a",
             boots="#f1efe6", gloves="#f1efe6", extra=["armor"]),
        Hero("gohan", "Gohan", skin=TAN, hair="#141018", hstyle="spiky", top="#5b3d9a", top2="#2350b8", arms="none",
             pants="#5b3d9a", boots="#7a4a2a", belt="#c3262d", gloves=None, extra=["gi"]),
        Hero("piccolo", "Piccolo", skin="#5fae4a", head="turban", head_c="#f4f4f4", head_c2="#6a3d9a", ears=True,
             top="#4a2f7a", pants="#4a2f7a", boots="#7a4a2a", belt="#5aa8d8", cape="#f4f4f4", shoulder="#f4f4f4",
             arms="none", eyes="#1d1a26"),
        Hero("krillin", "Krillin", skin=TAN, hstyle="bald", hair="#141018", top="#ef7d2a", top2="#2350b8", arms="none",
             pants="#ef7d2a", boots="#2350b8", belt="#2350b8", emblem="kame", extra=["gi"]),
        Hero("bulma", "Bulma", skin="#f7d7bd", hair="#3fb7b0", hstyle="bob", top="#e05a8a", dress=True, arms="short",
             pants="#f7d7bd", boots="#7a4a2a", emblem="capsule"),
        Hero("trunks", "Trunks", skin=TAN, hair="#b9a5e0", hstyle="bob", top="#2f4f9a", top2="#1b1b20", arms="long",
             pants="#7d8290", boots="#e7b53b", belt="#e7b53b", extra=["vest"]),
    ]),
    ("naruto", "Naruto", [
        Hero("naruto", "Naruto", skin=TAN, hair="#f2c335", hstyle="spiky", eyes="#2f7bd8", band="#1f3f8a",
             top="#ef7d2a", shoulder="#1b1b20", pants="#ef7d2a", boots="#1f3f8a", emblem="swirl", emblem_back="swirl"),
        Hero("sasuke", "Sasuke", skin="#f7d7bd", hair="#1b1d30", hstyle="spiky", top="#ecebef", top2="#1b1b20",
             pants="#1f2340", boots="#3a3a46", belt="#6a3d9a", emblem_back="uchiha", extra=["vest"]),
        Hero("sakura", "Sakura", skin="#f7d7bd", hair="#f29ac0", hstyle="bob", eyes="#2bb36a", band="#c3262d",
             top="#c3262d", arms="none", pants="#2a2a38", skirt="#e8a0c0", boots="#3a3a46"),
        Hero("kakashi", "Kakashi", skin=TAN, hair="#d4d8de", hstyle="tilted", mask="lower", mask_c="#1f2a4a",
             band="#1f2a4a", top="#1f2a4a", top2="#5d7a4a", pants="#1f2a4a", boots="#3a3a46", extra=["vest", "over_eye"]),
        Hero("itachi", "Itachi", skin="#f2d3bb", hair="#141018", hstyle="ponytail", eyes="#c3262d", band="#1f2a4a",
             top="#1b1b20", coat="#1b1b20", coat2="#c3262d", pants="#1b1b20", boots="#3a3a46"),
        Hero("hinata", "Hinata", skin="#f7d7bd", hair="#2b2d5a", hstyle="long", eyes="#d7d2f0", top="#c9c3e6",
             pants="#2b2d5a", boots="#3a3a46"),
        Hero("gaara", "Gaara", skin="#f2d3bb", hair="#b8322a", hstyle="messy", eyes="#3fb7a0", top="#7a2a2a",
             belt="#c9a46a", pants="#7a2a2a", boots="#3a3a46", back_item="gourd", emblem="sand"),
        Hero("jiraiya", "Jiraiya", skin=TAN, hair="#eceae4", hstyle="wild", band="#7a7d88", top="#3f6b4a",
             top2="#c3262d", pants="#3f6b4a", boots="#7a4a2a", extra=["vest"]),
    ]),
    ("festive", "Lễ hội", [
        Hero("santa", "Santa", skin=TAN, hair="#f4f4f4", head="santa", head_c="#c8202a", beard="#f4f4f4", top="#c8202a",
             pants="#c8202a", boots="#1b1b20", tall_boots=True, belt="#1b1b20", gloves="#1b1b20", collar="#f4f4f4"),
        Hero("elf", "Elf", skin="#f7d7bd", hair="#b5482c", head="elfhat", head_c="#2a9a4a", head_c2="#c8202a",
             top="#2a9a4a", pants="#c8202a", boots="#2a9a4a", belt="#1b1b20", collar="#c8202a"),
        Hero("witch", "Witch", skin="#cfe8c4", hair="#5a2e7a", hstyle="long", head="witch", head_c="#2a1f3a",
             head_c2="#ef7d2a", top="#4a2f6a", dress=True, pants="#2a1f3a", boots="#1b1b20"),
        Hero("vampire", "Vampire", skin="#e6e2ea", hair="#141018", hstyle="slick", eyes="#c3262d", top="#1b1b20",
             top2="#f4f4f4", pants="#1b1b20", boots="#1b1b20", cape="#1b1b20", cape_in="#a01f2a", collar="#a01f2a",
             extra=["vest"]),
        Hero("pumpkin", "Pumpkin Jack", head="pumpkin", head_c="#ef7d2a", top="#3a2a4a", pants="#2a2a38",
             boots="#3a2a20", cape="#2a1f3a", gloves="#2a2a38"),
        Hero("skeleton", "Skeleton", skin="#ecebe2", hstyle="bald", hair="#ecebe2", eyes="#141018", top="#1b1b20",
             pants="#1b1b20", boots="#1b1b20", emblem="bones", gloves="#ecebe2"),
        Hero("ong-do", "Ông Đồ", skin=TAN, hair="#d8d6d0", head="khan", head_c="#1b1b20", beard="#e8e6e0",
             top="#5a3a26", coat="#5a3a26", pants="#f1efe6", boots="#1b1b20"),
        Hero("ao-dai", "Áo dài", skin="#f7d7bd", hair="#141018", hstyle="long", top="#c8202a", coat="#c8202a",
             coat2="#f5c542", pants="#f4f4f4", boots="#c8202a"),
    ]),
    ("scifi", "Cyber & Sea", [
        Hero("netrunner", "Netrunner", skin="#f2c6a0", hair="#ff2fd1", hstyle="mohawk", mask="goggles", mask_c="#2ff3ff",
             top="#15151b", top2="#2ff3ff", pants="#2a2a38", boots="#15151b", gloves="#ff2fd1", emblem="neon", coat="#15151b"),
        Hero("cyber-samurai", "Cyber Samurai", skin="#e8b48d", hair="#141018", hstyle="ponytail", mask="lower",
             mask_c="#2ff3ff", top="#3a1f5a", pants="#1b1b20", boots="#15151b", shoulder="#ff2fd1", belt="#2ff3ff"),
        Hero("operator", "Operator", skin="#e8b48d", hair="#141018", hstyle="slick", mask="shades", mask_c="#0c0c10",
             top="#0c0c10", coat="#121216", pants="#121216", boots="#0c0c10"),
        Hero("agent", "Agent", skin=TAN, hair="#2a1d16", hstyle="slick", mask="shades", mask_c="#0c0c10", top="#1b1d22",
             top2="#f4f4f4", pants="#1b1d22", boots="#0c0c10", emblem="tie", extra=["vest"]),
        Hero("diver", "Diver", head="diver", head_c="#c9a24a", eyes="#1d1a26", top="#1f2a3a", pants="#1f2a3a",
             boots="#e8b52a", gloves="#e8b52a", back_item="tank", belt="#e8b52a"),
        Hero("marine", "Marine biologist", skin="#c98d63", hair="#141018", hstyle="ponytail", mask="goggles",
             mask_c="#7fdcff", top="#2bb3a3", top2="#f4f4f4", pants="#1f3f5a", boots="#e8b52a", back_item="tank"),
        Hero("mermaid", "Mermaid", skin="#f7d7bd", hair="#ef5a3a", hstyle="long", top="#9a5ad8", arms="none",
             pants="#2bb3a3", boots="#2bb3a3", tall_boots=True, extra=["scales"], skirt="#2bb3a3"),
        Hero("robot", "Robot", head="helmet", head_c="#8b919c", head_c2="#2a2f3a", top="#b8bec9", pants="#8b919c",
             boots="#5a5d68", gloves="#5a5d68", emblem="reactor"),
    ]),
]


def main():
    index = []
    sheets = []
    for gid, label, heroes in GROUPS:
        d = os.path.join(ROOT, gid)
        os.makedirs(d, exist_ok=True)
        items = []
        for h in heroes:
            s = sheet(h)
            s.save(os.path.join(d, f"{h.id}.png"))
            sheets.append(s)
            items.append({"id": h.id, "name": h.name, "file": f"themes/{gid}/{h.id}.png"})
        index.append({"id": gid, "label": label, "items": items})
    with open(os.path.join(ROOT, "themes.json"), "w", encoding="utf-8") as f:
        json.dump({"version": 1, "groups": index}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    if len(sys.argv) > 1:
        # Preview: the front walk frame + back + side of every avatar, x4, eight per row.
        scale, per = 4, 8
        cell = (W * 3 * scale + 8, H * scale + 8)
        rows = (len(sheets) + per - 1) // per
        prev = Image.new("RGBA", (cell[0] * per, cell[1] * rows), (46, 44, 62, 255))
        for i, s in enumerate(sheets):
            x, y = (i % per) * cell[0], (i // per) * cell[1]
            for k, (sx, sy) in enumerate(((0, 0), (0, H), (0, 2 * H))):
                fr = s.crop((sx, sy, sx + W, sy + H)).resize((W * scale, H * scale), Image.NEAREST)
                prev.alpha_composite(fr, (x + k * W * scale, y))
        prev.save(sys.argv[1])
    print(f"avatars: {sum(len(g[2]) for g in GROUPS)} in {len(GROUPS)} groups -> {os.path.normpath(ROOT)}")


if __name__ == "__main__":
    main()
