# Office art: what ships, where it comes from, what to add

## What ships today

| Set | Path | Origin | License | Status |
|---|---|---|---|---|
| **PrimeOffice crew** (8 characters) | `public/assets/characters/pixel/` | Drawn by `scripts/gen-characters.py` (procedural, no third-party pixels) | Ours — CC0 | Default crew |
| **Studio furniture** (8: SERVER_RACK, EASEL, SPEAKER, ARCADE, WATER_COOLER, TEST_RIG, FRIDGE, VENDING_MACHINE) | `public/assets/furniture/<ID>/` | Drawn by `scripts/gen-furniture.py` (procedural, no third-party pixels) | Ours — CC0 | Studio themes, room templates |
| **Studio themes** (Game studio Campus / Open Floor, Video studio) | `public/assets/layouts/game-campus.json`, `game-open.json`, `video-studio.json` | Built by `scripts/gen-studio-layout.py` from the pieces above and the bundled furniture | Layout data — ours | Office → Theme Studio… |
| **Room templates** (12) | `public/assets/rooms/room-templates.json` | Same script, same furnishing as the themes | Layout data — ours | Theme Studio → Add a room |
| Classic characters (6) | `public/assets/characters/char_*.png` | pixel-agents, based on [JIK-A-4 — MetroCity free top-down character pack](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack) | Author: free, "use it as you wish", commercial use allowed, credit appreciated not required (pack page comments + devlog, checked 2026-11-09; no formal license field) | Selectable ("Crew → Classic"); credited here |
| Floors, walls, carpets, furniture (38 items) | `public/assets/{floors,walls,carpets,furniture}/` | pixel-agents commit `add749a` ("replace all previously privately-licensed assets with fully open-source ones") | MIT repo, no separate art license — ask upstream to confirm for commercial use | Used as is |
| FS Pixel Sans Unicode font | `public/fonts/` | pixel-agents (font by NZWStudios, FontStruct) | Listed as SIL OFL, free for commercial use ([1001fonts](https://www.1001fonts.com/fs-pixel-sans-unicode-regular-font.html), [CufonFonts](https://www.cufonfonts.com/font/fs-pixel-sans-unicode)); the FontStruct page has no download to confirm | Used by the office UI; swap for a confirmed OFL pixel font if in doubt |
| Pets (claudio, gitcat) | — | pixel-agents | Unclear; "claudio" is Claude-themed | **Not copied** |

## Adding furniture

Furniture is read at build time from `public/assets/furniture/<ID>/`: one folder per piece with its PNG(s) and a
`manifest.json` in pixel-agents' format (`id`, `name`, `category` — desks / chairs / electronics / decor / wall /
misc, `footprintW` / `footprintH` in tiles, `backgroundTiles`, `canPlaceOnWalls`, `canPlaceOnSurfaces`, `width` /
`height` in pixels; see `SERVER_RACK/manifest.json`). Copy the folder in, run `npm run assets`, and the piece is in the
office's Layout editor. To use it in themes or room templates, place it in `scripts/gen-studio-layout.py` and rerun
it. New pieces can also be drawn by `scripts/gen-furniture.py` (procedural, CC0). PrimeOffice does not read asset
folders while it runs (pixel-agents' "asset folders" setting is hidden).

## Format (so new art just drops in)

- Character: PNG 112×96 = 7 frames × 16 px across, 3 rows × 32 px (down, up, right; left = mirrored). Frames: walk1,
  walk2, walk3, type1, type2, read1, read2 (type/read seated). A pack is a folder `characters/<pack>/char_N.png`;
  run `npm run assets` and add it to `CHARACTER_PACKS` in `src/components/tabs/OfficeTab.tsx`.
- Floor: 16×16 grayscale (colourised at runtime). Wall: 64×128 = 4×4 pieces of 16×32 (auto-tile bitmask). Carpet:
  64×64 = 4×4 pieces of 16×16.
- Furniture: a folder per item with `manifest.json` (single asset or rotation/state/animation groups) — see
  pixel-agents `docs/external-assets.md`.

## Free sources researched (2026-11-09) — **verify each license on the author's own page before importing**

| Source | What | License (as listed) | Fit |
|---|---|---|---|
| Kenney — [Roguelike Indoor pack](https://opengameart.org/content/roguelike-indoor-pack) | 16×16 indoor tiles, furniture | CC0 (OpenGameArt mirror; confirm on kenney.nl) | Good: same grid; style is flatter than the office |
| Kenney — [Roguelike/RPG pack, 1700 tiles](https://opengameart.org/content/roguelikerpg-pack-1700-tiles) | 16×16 floors, walls, beds, chairs, bookcases | CC0 (mirror) | Good for floors/walls variety |
| Kenney — [Furniture Kit](https://opengameart.org/node/80260) | 3D + 2D sprites of furniture | CC0 (mirror) | 2D sprites are isometric — needs redraw |
| InThePixel — "Interior spritesheet 16x16 tiles" on OpenGameArt (search by name) | Zelda-style house interior | CC0 (per search; verify) | Medium |
| Bonsaiheldin — [interior tileset 16x16](https://opengameart.org/content/interior-tileset-16x16) | Furniture | CC-BY-SA 3.0 (attribution + share-alike) | Avoid in the app bundle (share-alike) |
| SunGraphica — [Furniture set pixel art](https://sungraphica.itch.io/furniture-set-pixel-art) | 16×16 furniture | CC-BY 4.0 (credit required) | OK with a credit line in About |
| Paid / restrictive (not usable as is) | [Office Gaming Room 16×16](https://cubebrush.co/maru_98/products/7dvfag/office-gaming-room-16x16-top-down-pixel-art-tileset) ($7), [Post-apocalyptic office furniture](https://0-mem0ry.itch.io/post-apocalyptic-office-furniture) (32×32, no redistribution) | — | Reference only |

## Recommendation

1. Keep generating characters ourselves (`gen-characters.py`): no license risk, and new looks are a few lines in `CREW`.
2. Next art step (spec P4+): a generated **office furniture** set in the same script style — monitors with agent-status
   screens, server rack, coffee machine, whiteboard showing the project name — so the office can drop the unclear
   pixel-agents art entirely before a public release.
3. Only CC0 / CC-BY packs go into `public/assets`, each with a row in the table above.
