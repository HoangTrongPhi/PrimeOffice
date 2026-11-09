#!/usr/bin/env python3
"""Generate PrimeOffice's own character pack ("PrimeOffice crew") — public/assets/characters/pixel/.

Every pixel comes from this script, so the pack is ours to release (CC0, see docs/ASSETS.md); no
third-party art is copied or traced. Format is the office's character sheet (pixel-agents):
112×96 PNG = 7 frames × 16 px across, 3 rows × 32 px: down, up, right (left = mirrored right).
Frame order: walk1, walk2, walk3, type1, type2, read1, read2. Type/read frames are drawn seated
(the office shifts seated characters by itself, see CLAUDE.md "Sitting offset").

    python scripts/gen-characters.py            # writes the pack + a preview sheet
    npm run assets                              # re-index (asset-index.json)

Needs Pillow. Deterministic: the same script always draws the same crew.
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass

from PIL import Image

W, H = 16, 32
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "characters", "pixel")
OUTLINE = (24, 18, 30, 255)


def hexc(s: str, a: int = 255):
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)


def shade(c, f: float):
    return (max(0, min(255, int(c[0] * f))), max(0, min(255, int(c[1] * f))), max(0, min(255, int(c[2] * f))), c[3])


@dataclass
class Look:
    skin: str
    hair: str
    style: str  # short | long | bun | spiky | bob | cap
    top: str  # main outfit colour
    outfit: str  # hoodie | tie | sweater | labcoat | overalls | tee
    pants: str
    accent: str = "#ffffff"
    shoes: str = "#2b2233"
    glasses: bool = False
    headphones: bool = False


CREW = [
    Look(skin="#f2c6a0", hair="#3a2a20", style="short", top="#3d6fd8", outfit="hoodie", pants="#2c3550", accent="#e8ecff", headphones=True),
    Look(skin="#c98d63", hair="#141018", style="bun", top="#e5e2da", outfit="labcoat", pants="#3b3f4c", accent="#2fa38a", glasses=True),
    Look(skin="#8d5a3b", hair="#1b1412", style="spiky", top="#e07a2e", outfit="tee", pants="#30405e", accent="#ffd36b"),
    Look(skin="#f7d7bd", hair="#d9a441", style="long", top="#7a4fc9", outfit="sweater", pants="#2a2a38", accent="#f0c7ff"),
    Look(skin="#e8b48d", hair="#b5482c", style="bob", top="#2e9c6a", outfit="overalls", pants="#2e9c6a", accent="#f4efe1"),
    Look(skin="#5e3a26", hair="#0f0c10", style="cap", top="#d64561", outfit="tee", pants="#26262e", accent="#1f6fd1"),
    Look(skin="#f2c6a0", hair="#a8b0c0", style="short", top="#ffffff", outfit="tie", pants="#2a3142", accent="#c43d3d", glasses=True),
    Look(skin="#c98d63", hair="#5a2e7a", style="long", top="#1f8fb0", outfit="hoodie", pants="#3a2e4f", accent="#bff2ff", headphones=True),
]


class Canvas:
    def __init__(self):
        self.px: dict[tuple[int, int], tuple] = {}

    def set(self, x, y, c):
        if 0 <= x < W and 0 <= y < H and c is not None:
            self.px[(x, y)] = c

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.set(x, y, c)

    def image(self) -> Image.Image:
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        for (x, y), c in self.px.items():
            img.putpixel((x, y), c)
        # 1 px outline around the silhouette.
        out = img.copy()
        for y in range(H):
            for x in range(W):
                if img.getpixel((x, y))[3]:
                    continue
                if any(0 <= x + dx < W and 0 <= y + dy < H and img.getpixel((x + dx, y + dy))[3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    out.putpixel((x, y), OUTLINE)
        return out


# ------------------------------------------------------------------ parts


def legs_front(cv: Canvas, L: Look, dy: int, lift: int):
    """Standing legs seen from the front/back. lift: -1 left leg up, 1 right leg up, 0 none."""
    pants, shoes = hexc(L.pants), hexc(L.shoes)
    for i, (x0, x1) in enumerate(((5, 7), (8, 10))):
        up = 1 if (lift == -1 and i == 0) or (lift == 1 and i == 1) else 0
        cv.rect(x0, 24 + dy, x1, 27 + dy - up, pants)
        cv.rect(x0, 28 + dy - up, x1, 29 + dy - up, shoes)
    cv.set(10, 25 + dy, shade(pants, 0.8))


def legs_seated_front(cv: Canvas, L: Look, dy: int):
    pants, shoes = hexc(L.pants), hexc(L.shoes)
    cv.rect(5, 24 + dy, 10, 25 + dy, pants)
    cv.rect(5, 26 + dy, 7, 27 + dy, shoes)
    cv.rect(8, 26 + dy, 10, 27 + dy, shoes)


def torso(cv: Canvas, L: Look, dy: int, back: bool, x0=4, x1=11):
    top, acc = hexc(L.top), hexc(L.accent)
    cv.rect(x0, 16 + dy, x1, 23 + dy, top)
    cv.rect(x1, 17 + dy, x1, 23 + dy, shade(top, 0.82))
    if back:
        if L.outfit == "hoodie":
            cv.rect(x0 + 1, 16 + dy, x1 - 1, 17 + dy, shade(top, 0.75))
        if L.outfit == "overalls":
            cv.rect(x0 + 1, 16 + dy, x0 + 1, 19 + dy, shade(top, 0.7))
            cv.rect(x1 - 1, 16 + dy, x1 - 1, 19 + dy, shade(top, 0.7))
        return
    if L.outfit == "hoodie":
        cv.set(6, 17 + dy, acc)
        cv.set(9, 17 + dy, acc)
        cv.set(6, 18 + dy, acc)
        cv.set(9, 18 + dy, acc)
        cv.rect(5, 21 + dy, 10, 22 + dy, shade(top, 0.85))  # pocket
    elif L.outfit == "tie":
        cv.rect(7, 16 + dy, 8, 21 + dy, acc)
        cv.set(7, 22 + dy, acc)
        cv.set(6, 16 + dy, shade(top, 0.85))
        cv.set(9, 16 + dy, shade(top, 0.85))
    elif L.outfit == "sweater":
        cv.rect(x0, 19 + dy, x1, 19 + dy, acc)
        cv.rect(6, 16 + dy, 9, 16 + dy, shade(top, 0.7))
    elif L.outfit == "labcoat":
        cv.rect(6, 16 + dy, 9, 23 + dy, acc)
        cv.rect(7, 16 + dy, 8, 17 + dy, hexc("#ffffff"))
        cv.set(5, 20 + dy, hexc("#7aa7d9"))  # pen
    elif L.outfit == "overalls":
        cv.rect(5, 19 + dy, 10, 23 + dy, shade(top, 0.75))
        cv.set(5, 17 + dy, shade(top, 0.75))
        cv.set(10, 17 + dy, shade(top, 0.75))
        cv.rect(4, 16 + dy, 11, 18 + dy, acc) if False else None
        cv.rect(6, 16 + dy, 9, 18 + dy, acc)
        cv.set(5, 18 + dy, shade(top, 0.75))
        cv.set(10, 18 + dy, shade(top, 0.75))
    elif L.outfit == "tee":
        cv.rect(6, 16 + dy, 9, 16 + dy, shade(top, 0.75))
        cv.rect(6, 19 + dy, 9, 20 + dy, acc)  # logo


def arms_front(cv: Canvas, L: Look, dy: int, swing: int):
    """Arms hanging at the sides; swing moves the hands ±1 (walk)."""
    top, skin = hexc(L.top), hexc(L.skin)
    sleeve = hexc(L.accent) if L.outfit == "labcoat" else top
    for x, s in ((3, swing), (12, -swing)):
        cv.rect(x, 17 + dy, x, 21 + dy + s, shade(sleeve, 0.9))
        cv.set(x, 22 + dy + s, skin)


def head_front(cv: Canvas, L: Look, dy: int, back: bool):
    skin, hair = hexc(L.skin), hexc(L.hair)
    hl = shade(hair, 1.35)
    # Long hair falls behind the body.
    if L.style == "long":
        cv.rect(3, 9 + dy, 12, 18 + dy, shade(hair, 0.85))
    # Face / back of the head.
    cv.rect(3, 5 + dy, 12, 15 + dy, skin)
    for x, y in ((3, 5), (12, 5), (3, 15), (12, 15)):
        cv.px.pop((x, y + dy), None)
    if back:
        cv.rect(2, 3 + dy, 13, 14 + dy, hair)
        cv.rect(4, 4 + dy, 9, 4 + dy, hl)
        if L.style in ("long", "bob"):
            cv.rect(2, 14 + dy, 13, 16 + dy if L.style == "bob" else 18 + dy, hair)
        if L.style == "bun":
            cv.rect(6, 1 + dy, 9, 3 + dy, hair)
            cv.rect(7, 1 + dy, 8, 1 + dy, hl)
        if L.style == "cap":
            cv.rect(2, 3 + dy, 13, 7 + dy, hexc(L.accent))
            cv.rect(6, 7 + dy, 9, 8 + dy, shade(hexc(L.accent), 0.7))
        if L.headphones:
            cv.rect(3, 3 + dy, 12, 3 + dy, hexc("#3a3a46"))
            cv.rect(1, 9 + dy, 2, 12 + dy, hexc("#3a3a46"))
            cv.rect(13, 9 + dy, 14, 12 + dy, hexc("#3a3a46"))
        return
    # Eyes, blush, mouth.
    eye = hexc("#1d1a26")
    for ex in (5, 10):
        cv.rect(ex, 10 + dy, ex, 11 + dy, eye)
    cv.set(4, 13 + dy, shade(skin, 0.86) if not L.glasses else None)
    cv.set(11, 13 + dy, shade(skin, 0.86) if not L.glasses else None)
    cv.rect(7, 13 + dy, 8, 13 + dy, shade(skin, 0.72))
    if L.glasses:
        g = hexc("#22202c")
        for gx0 in (4, 9):
            cv.rect(gx0, 9 + dy, gx0 + 2, 9 + dy, g)
            cv.rect(gx0, 12 + dy, gx0 + 2, 12 + dy, g)
            cv.rect(gx0, 10 + dy, gx0, 11 + dy, g)
            cv.rect(gx0 + 2, 10 + dy, gx0 + 2, 11 + dy, g)
        cv.set(7, 10 + dy, g)
        cv.set(8, 10 + dy, g)
    # Hair.
    s = L.style
    if s == "cap":
        c = hexc(L.accent)
        cv.rect(2, 3 + dy, 13, 6 + dy, c)
        cv.rect(1, 7 + dy, 14, 7 + dy, shade(c, 0.7))
        cv.rect(4, 4 + dy, 7, 4 + dy, shade(c, 1.3))
        cv.rect(2, 8 + dy, 3, 10 + dy, hair)
        cv.rect(12, 8 + dy, 13, 10 + dy, hair)
    else:
        cv.rect(2, 3 + dy, 13, 7 + dy, hair)
        cv.rect(2, 8 + dy, 3, 11 + dy, hair)
        cv.rect(12, 8 + dy, 13, 11 + dy, hair)
        cv.rect(4, 8 + dy, 6, 8 + dy, hair)  # fringe
        cv.rect(9, 8 + dy, 10, 8 + dy, hair)
        cv.rect(4, 4 + dy, 8, 4 + dy, hl)
        if s == "spiky":
            for x in (3, 6, 9, 12):
                cv.set(x, 2 + dy, hair)
                cv.set(x + 1, 1 + dy, hair)
        if s == "bun":
            cv.rect(6, 0 + dy, 9, 2 + dy, hair)
            cv.rect(7, 0 + dy, 8, 0 + dy, hl)
        if s in ("long", "bob"):
            cv.rect(2, 12 + dy, 3, 16 + dy if s == "bob" else 17 + dy, hair)
            cv.rect(12, 12 + dy, 13, 16 + dy if s == "bob" else 17 + dy, hair)
    if L.headphones:
        hp = hexc("#3a3a46")
        cv.rect(3, 2 + dy, 12, 2 + dy, hp)
        cv.rect(1, 9 + dy, 2, 12 + dy, hp)
        cv.rect(13, 9 + dy, 14, 12 + dy, hp)
        cv.set(1, 10 + dy, hexc(L.accent))
        cv.set(14, 10 + dy, hexc(L.accent))


def paper(cv: Canvas, x0, y0, x1, y1):
    cv.rect(x0, y0, x1, y1, hexc("#f4f1e6"))
    for y in range(y0 + 1, y1, 2):
        cv.rect(x0 + 1, y, x1 - 1, y, hexc("#9aa3b8"))


# ------------------------------------------------------------------ frames per direction


def frame_down(L: Look, f: int, back: bool = False) -> Image.Image:
    cv = Canvas()
    if f <= 2:  # walk1..3
        lift = (-1, 0, 1)[f]
        dy = 1 if f == 1 else 0
        legs_front(cv, L, dy, lift)
        torso(cv, L, dy, back)
        arms_front(cv, L, dy, (1, 0, -1)[f])
        head_front(cv, L, dy, back)
    else:  # seated: type1, type2, read1, read2
        dy = 4
        legs_seated_front(cv, L, dy)
        torso(cv, L, dy, back)
        head_front(cv, L, dy, back)
        skin, sleeve = hexc(L.skin), shade(hexc(L.accent if L.outfit == "labcoat" else L.top), 0.9)
        if back:
            cv.rect(3, 17 + dy, 3, 20 + dy, sleeve)
            cv.rect(12, 17 + dy, 12, 20 + dy, sleeve)
        elif f in (3, 4):  # typing: forearms forward, hands bob
            up = (0, 1) if f == 3 else (1, 0)
            cv.rect(3, 17 + dy, 3, 19 + dy, sleeve)
            cv.rect(12, 17 + dy, 12, 19 + dy, sleeve)
            cv.rect(4, 20 + dy, 5, 20 + dy, sleeve)
            cv.rect(10, 20 + dy, 11, 20 + dy, sleeve)
            cv.set(6, 21 + dy - up[0], skin)
            cv.set(9, 21 + dy - up[1], skin)
        else:  # reading: paper held in front
            off = 0 if f == 5 else 1
            cv.rect(3, 17 + dy, 3, 20 + dy, sleeve)
            cv.rect(12, 17 + dy, 12, 20 + dy, sleeve)
            paper(cv, 4, 18 + dy + off, 11, 23 + dy + off)
            cv.set(3, 21 + dy + off, skin)
            cv.set(12, 21 + dy + off, skin)
    return cv.image()


def frame_right(L: Look, f: int) -> Image.Image:
    cv = Canvas()
    skin, hair, top = hexc(L.skin), hexc(L.hair), hexc(L.top)
    pants, shoes = hexc(L.pants), hexc(L.shoes)
    sleeve = shade(hexc(L.accent if L.outfit == "labcoat" else L.top), 0.9)
    seated = f >= 3
    dy = 4 if seated else (1 if f == 1 else 0)
    # Legs.
    if seated:
        cv.rect(6, 24 + dy, 11, 25 + dy, pants)
        cv.rect(10, 26 + dy, 11, 27 + dy, pants)
        cv.rect(10, 27 + dy, 12, 27 + dy, shoes)
    else:
        stride = (2, 0, -2)[f]
        cv.rect(6, 24 + dy, 9, 25 + dy, pants)
        for lx, s in ((6, -stride), (8, stride)):
            x = lx + (s // 2)
            cv.rect(x, 26 + dy, x + 1, 27 + dy, pants)
            cv.rect(x, 28 + dy, x + 2, 29 + dy, shoes)
    # Body.
    if L.style == "long":
        cv.rect(3, 9 + dy, 6, 19 + dy, shade(hair, 0.85))
    cv.rect(5, 16 + dy, 10, 23 + dy, top)
    cv.rect(5, 16 + dy, 5, 23 + dy, shade(top, 0.82))
    if L.outfit == "labcoat":
        cv.rect(9, 16 + dy, 10, 23 + dy, hexc(L.accent))
    elif L.outfit == "tie":
        cv.rect(10, 16 + dy, 10, 21 + dy, hexc(L.accent))
    elif L.outfit == "sweater":
        cv.rect(5, 19 + dy, 10, 19 + dy, hexc(L.accent))
    elif L.outfit == "overalls":
        cv.rect(6, 19 + dy, 10, 23 + dy, shade(top, 0.75))
        cv.rect(7, 16 + dy, 10, 18 + dy, hexc(L.accent))
    elif L.outfit == "hoodie":
        cv.rect(5, 16 + dy, 6, 18 + dy, shade(top, 0.72))
    # Head (profile, facing right).
    cv.rect(4, 5 + dy, 12, 15 + dy, skin)
    for x, y in ((4, 5), (12, 5), (4, 15), (12, 15)):
        cv.px.pop((x, y + dy), None)
    cv.set(13, 11 + dy, skin)  # nose
    cv.rect(10, 10 + dy, 10, 11 + dy, hexc("#1d1a26"))
    cv.set(11, 13 + dy, shade(skin, 0.72))
    if L.glasses:
        g = hexc("#22202c")
        cv.rect(9, 9 + dy, 11, 9 + dy, g)
        cv.rect(9, 12 + dy, 11, 12 + dy, g)
        cv.rect(9, 10 + dy, 9, 11 + dy, g)
        cv.rect(11, 10 + dy, 11, 11 + dy, g)
        cv.rect(5, 10 + dy, 8, 10 + dy, g)
    hl = shade(hair, 1.35)
    if L.style == "cap":
        c = hexc(L.accent)
        cv.rect(3, 3 + dy, 12, 6 + dy, c)
        cv.rect(10, 7 + dy, 14, 7 + dy, shade(c, 0.7))
        cv.rect(3, 7 + dy, 6, 12 + dy, hair)
    else:
        cv.rect(3, 3 + dy, 12, 7 + dy, hair)
        cv.rect(3, 8 + dy, 7, 12 + dy, hair)
        cv.rect(11, 8 + dy, 12, 8 + dy, hair)
        cv.rect(5, 4 + dy, 10, 4 + dy, hl)
        if L.style == "spiky":
            for x in (4, 7, 10):
                cv.set(x, 2 + dy, hair)
                cv.set(x - 1, 1 + dy, hair)
        if L.style == "bun":
            cv.rect(2, 2 + dy, 4, 5 + dy, hair)
        if L.style in ("long", "bob"):
            cv.rect(3, 12 + dy, 6, 16 + dy if L.style == "bob" else 19 + dy, hair)
    cv.set(7, 11 + dy, shade(skin, 0.8))  # ear
    if L.headphones:
        hp = hexc("#3a3a46")
        cv.rect(6, 2 + dy, 9, 2 + dy, hp)
        cv.rect(6, 9 + dy, 8, 12 + dy, hp)
        cv.set(7, 10 + dy, hexc(L.accent))
    # Arm.
    if not seated:
        swing = (1, 0, -1)[f]
        cv.rect(7, 17 + dy, 8, 21 + dy, sleeve)
        cv.set(8 + swing, 22 + dy, skin)
    elif f in (3, 4):
        cv.rect(7, 17 + dy, 8, 19 + dy, sleeve)
        cv.rect(9, 20 + dy, 11, 20 + dy, sleeve)
        cv.set(12, 21 + dy - (0 if f == 3 else 1), skin)
    else:
        off = 0 if f == 5 else 1
        cv.rect(7, 17 + dy, 8, 20 + dy, sleeve)
        cv.rect(11, 16 + dy + off, 13, 22 + dy + off, hexc("#f4f1e6"))
        cv.rect(11, 17 + dy + off, 11, 21 + dy + off, hexc("#9aa3b8"))
        cv.set(10, 20 + dy + off, skin)
    return cv.image()


def sheet(L: Look) -> Image.Image:
    img = Image.new("RGBA", (W * 7, H * 3), (0, 0, 0, 0))
    for f in range(7):
        img.alpha_composite(frame_down(L, f), (f * W, 0))
        img.alpha_composite(frame_down(L, f, back=True), (f * W, H))
        img.alpha_composite(frame_right(L, f), (f * W, 2 * H))
    return img


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    sheets = []
    for i, look in enumerate(CREW):
        s = sheet(look)
        s.save(os.path.join(OUT, f"char_{i}.png"))
        sheets.append(s)
    # Preview (not shipped as an asset): all sheets ×4 on a dark floor.
    scale = 4
    prev = Image.new("RGBA", (W * 7 * scale, H * 3 * scale * len(sheets)), (46, 44, 62, 255))
    for i, s in enumerate(sheets):
        prev.alpha_composite(s.resize((s.width * scale, s.height * scale), Image.NEAREST), (0, i * H * 3 * scale))
    if len(sys.argv) > 1:
        prev.save(sys.argv[1])
    print(f"wrote {len(sheets)} characters to {os.path.normpath(OUT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
