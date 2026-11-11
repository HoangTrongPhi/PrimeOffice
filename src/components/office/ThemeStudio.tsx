import { Modal } from "@abyss/ui";
import { BookmarkPlus, LayoutGrid, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { inTauri, ipc } from "../../lib/ipc";
import { type Catalog, footprints, type RoomLayout, type RoomTemplate, stampRoom, templateFromArea } from "../../lib/rooms";
import { kindOf, STUDIO_KINDS, type StudioTheme } from "../../lib/studios";
import { errorText, uiLog } from "../../stores/appStore";
import type { Studio } from "../../types/primeoffice";

const FIELD = "h-7 rounded-md border border-edge bg-canvas/70 px-2 text-[12px] text-ink";
const TILE = 16;
const asset = (p: string) => `${import.meta.env.BASE_URL}assets/${p}`;

interface CatalogEntry {
  id: string;
  footprintW: number;
  footprintH: number;
  backgroundTiles?: number;
  category?: string;
  canPlaceOnWalls?: boolean;
  canPlaceOnSurfaces?: boolean;
  furniturePath: string;
}

/** The furniture catalog and the bundled room templates, fetched once. */
let shared: Promise<{ entries: Record<string, CatalogEntry>; catalog: Catalog; bundled: RoomTemplate[] }> | null = null;
function loadShared() {
  shared ??= Promise.all([
    fetch(asset("furniture-catalog.json")).then((r) => r.json() as Promise<CatalogEntry[]>),
    fetch(asset("rooms/room-templates.json")).then((r) => r.json() as Promise<{ rooms: RoomTemplate[] }>),
  ]).then(([list, rooms]) => ({ entries: Object.fromEntries(list.map((e) => [e.id, e])), catalog: footprints(list), bundled: rooms.rooms }));
  shared.catch(() => (shared = null));
  return shared;
}

const sprites = new Map<string, HTMLImageElement>();
function sprite(path: string, onLoad: () => void): HTMLImageElement {
  let img = sprites.get(path);
  if (!img) {
    img = new Image();
    img.src = asset(path);
    sprites.set(path, img);
  }
  if (!img.complete) img.addEventListener("load", onLoad, { once: true });
  return img;
}

/** A room template drawn with the office's own furniture: the wall above, the floor, the pieces. */
function RoomPreview({ tpl, entries }: { tpl: RoomTemplate; entries: Record<string, CatalogEntry> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = "#3b4456";
    ctx.fillRect(0, 0, cv.width, 2 * TILE);
    ctx.fillStyle = tpl.areaColor ? `${tpl.areaColor}55` : "#c8ccd855";
    ctx.fillRect(0, 2 * TILE, cv.width, tpl.h * TILE);
    ctx.strokeStyle = "rgba(0,0,0,.08)";
    for (let c = 1; c < tpl.w; c++) ctx.strokeRect(c * TILE, 2 * TILE, 0, tpl.h * TILE);
    const order = [...tpl.furniture].sort((a, b) => Number(!!entries[a.type.split(":")[0]]?.canPlaceOnSurfaces) - Number(!!entries[b.type.split(":")[0]]?.canPlaceOnSurfaces) || a.row - b.row);
    for (const f of order) {
      const e = entries[f.type.split(":")[0]];
      if (!e) continue;
      const img = sprite(e.furniturePath, () => setTick((t) => t + 1));
      if (!img.complete || !img.naturalWidth) continue;
      const x = f.col * TILE;
      const y = (f.row + 2) * TILE;
      if (f.type.endsWith(":left")) {
        ctx.save();
        ctx.translate(x + img.naturalWidth, y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0);
        ctx.restore();
      } else ctx.drawImage(img, x, y);
    }
  }, [tpl, entries, tick]);
  return <canvas ref={ref} width={tpl.w * TILE} height={(tpl.h + 2) * TILE} className="block h-auto w-full rounded [image-rendering:pixelated]" />;
}

/** A floor plan as a small map: walls, rooms in their Area colour. */
function PlanThumb({ file }: { file: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    fetch(asset(file))
      .then((r) => r.json() as Promise<RoomLayout>)
      .then((l) => {
        const cv = ref.current;
        if (!alive || !cv) return;
        cv.width = l.cols * 3;
        cv.height = l.rows * 3;
        const ctx = cv.getContext("2d")!;
        const colors = Object.fromEntries((l.areas ?? []).map((a) => [a.label, a.color]));
        l.tiles.forEach((t, i) => {
          if (t === 255) return;
          ctx.fillStyle = t === 0 ? "#3b4456" : colors[l.areaTiles?.[i] ?? ""] ?? "#c8ccd8";
          ctx.fillRect((i % l.cols) * 3, Math.floor(i / l.cols) * 3, 3, 3);
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [file]);
  return <canvas ref={ref} className="h-16 w-24 shrink-0 rounded bg-canvas [image-rendering:pixelated]" />;
}

/** Replace a studio's saved office layout with a floor plan. */
export async function loadFloorPlan(file: string, studio: string) {
  const layout = await fetch(asset(file)).then((r) => {
    if (!r.ok) throw new Error(`${file}: ${r.status}`);
    return r.json() as Promise<unknown>;
  });
  if (inTauri) await ipc.officeSend({ type: "saveLayout", layout, studio });
}

/**
 * Theme Studio: load a floor plan (theme) of any kind, add rooms from templates into the floor, and
 * keep rooms of the floor as templates of your own. Works on the studio on screen; the office frame
 * reloads after each change (`onChanged`).
 */
export function ThemeStudio({ open, studio, onClose, onChanged }: { open: boolean; studio: Studio | null; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<{ entries: Record<string, CatalogEntry>; catalog: Catalog; bundled: RoomTemplate[] } | null>(null);
  const [mine, setMine] = useState<RoomTemplate[]>([]);
  const [layout, setLayout] = useState<RoomLayout | null>(null);
  const [pick, setPick] = useState("dept-m");
  const [name, setName] = useState("");
  const [saveArea, setSaveArea] = useState("");
  const [saveName, setSaveName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !studio) return;
    let alive = true;
    setNote("");
    void (async () => {
      try {
        const [shared, snap] = await Promise.all([loadShared(), inTauri ? ipc.officeSnapshot() : Promise.resolve(null)]);
        const current: RoomLayout = (snap?.layout as RoomLayout | null) ?? (await fetch(asset(kindOf(studio.kind).themes[0].file)).then((r) => r.json() as Promise<RoomLayout>));
        if (!alive) return;
        setData(shared);
        setMine((snap?.roomTemplates ?? []) as RoomTemplate[]);
        setLayout(current);
        setSaveArea((a) => a || current.areas?.[0]?.label || "");
      } catch (e) {
        uiLog("error", `Theme Studio: ${errorText(e)}`);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, studio]);

  if (!studio) return null;
  const templates = [...(data?.bundled ?? []), ...mine.map((t) => ({ ...t, mine: true }))];
  const chosen = templates.find((t) => t.id === pick) ?? templates[0];

  const loadTheme = (theme: StudioTheme) => {
    setBusy(true);
    loadFloorPlan(theme.file, studio.id)
      .then(() => {
        uiLog("info", `${studio.name}: theme ${theme.label}`);
        onClose();
        onChanged();
      })
      .catch((e) => uiLog("error", `Cannot load the theme: ${errorText(e)}`))
      .finally(() => setBusy(false));
  };

  const addRoom = async () => {
    if (!data || !layout || !chosen) return;
    const res = stampRoom(layout, chosen, name.trim() || chosen.label, data.catalog);
    if ("error" in res) {
      setNote(res.error);
      return;
    }
    setBusy(true);
    try {
      if (inTauri) await ipc.officeSend({ type: "saveLayout", layout: res.layout, studio: studio.id });
      setLayout(res.layout);
      setName("");
      const where = res.label ? `“${res.label}”` : chosen.label;
      setNote(`Added ${where}${res.grew ? ", the floor grew to fit it" : ""}. Move furniture or the room's tiles with the office's Layout button.`);
      uiLog("info", `${studio.name}: room ${where} added`);
      onChanged();
    } catch (e) {
      setNote(`Cannot save the floor: ${errorText(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const saveTemplates = async (next: RoomTemplate[]) => {
    const plain = next.map(({ mine: _mine, ...t }) => t);
    if (inTauri) await ipc.officeSend({ type: "saveRoomTemplates", templates: plain });
    setMine(next);
  };

  const keepRoom = async () => {
    if (!data || !layout || !saveArea) return;
    const tpl = templateFromArea(layout, saveArea, saveName || saveArea, data.catalog);
    if (!tpl) return;
    try {
      await saveTemplates([...mine, tpl]);
      setPick(tpl.id);
      setSaveName("");
      setNote(`Saved “${tpl.label}” (${tpl.w}×${tpl.h}, ${tpl.seats} seats) as a template.`);
    } catch (e) {
      setNote(`Cannot save the template: ${errorText(e)}`);
    }
  };

  return (
    <Modal open={open} title={`Theme Studio — ${studio.name}`} onClose={onClose} className="max-h-[calc(100vh-3rem)] max-w-3xl">
      <div className="flex flex-col gap-5 text-[12.5px] text-ink-muted">
        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            <LayoutGrid className="size-3.5" /> Themes
          </h3>
          <p>Loading a theme replaces the whole floor of {studio.name} (rooms, furniture, areas). Rooms added below go into the floor on screen.</p>
          {STUDIO_KINDS.map((k) => (
            <div key={k.id} className="flex flex-col gap-1.5">
              <div className="text-[12px] font-medium text-ink">
                {k.label}
                {k.id === studio.kind && <span className="ml-1.5 text-ink-faint">· this studio</span>}
              </div>
              {k.themes.map((t) => (
                <div key={t.file} className="flex items-center gap-3 rounded-lg border border-edge p-2">
                  <PlanThumb file={t.file} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-medium text-ink">{t.label}</div>
                    <div className="mt-0.5">{t.text}</div>
                  </div>
                  <button type="button" className={k.id === studio.kind ? "btn btn-primary" : "btn"} disabled={busy} onClick={() => loadTheme(t)}>
                    Load
                  </button>
                </div>
              ))}
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-2 border-t border-edge pt-4">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            <Plus className="size-3.5" /> Add a room
          </h3>
          <p>
            Pick a room, name it, add it: it takes the first free spot with a doorway to the floor (or new rows under it). Its name is its area, so name a department room after the department
            (Engineering, Phòng QA, Engine lab 2 …) and its sub-agents sit there. Then arrange desks, chairs and PCs tile by tile with the office's Layout button.
          </p>
          {!data ? (
            <p className="text-ink-faint">Loading the rooms…</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {templates.map((t) => (
                <div key={t.id} className={`relative flex cursor-pointer flex-col gap-1 rounded-lg border p-2 ${t.id === chosen?.id ? "border-accent bg-accent/8" : "border-edge hover:border-edge-strong"}`} onClick={() => setPick(t.id)}>
                  <RoomPreview tpl={t} entries={data.entries} />
                  <div className="flex items-baseline gap-1">
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">{t.label}</span>
                    {t.mine && <span className="text-[10.5px] text-accent">yours</span>}
                  </div>
                  <span className="text-[11px] text-ink-faint">
                    {t.w}×{t.h} · {t.seats} seat{t.seats === 1 ? "" : "s"}
                    {t.areaColor ? "" : " · no area (main sessions)"}
                  </span>
                  {t.mine && (
                    <button
                      type="button"
                      className="icon-btn absolute top-1 right-1 bg-panel/80"
                      title="Delete this template"
                      aria-label={`Delete template ${t.label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void saveTemplates(mine.filter((m) => m.id !== t.id)).catch((err) => setNote(`Cannot delete: ${errorText(err)}`));
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void addRoom();
            }}
          >
            <span className="w-12 shrink-0 text-ink-faint">Name</span>
            <input className={`${FIELD} flex-1`} value={name} maxLength={40} placeholder={chosen?.label ?? "Room"} onChange={(e) => setName(e.target.value)} />
            <button type="submit" className="btn btn-primary" disabled={busy || !data || !layout || !chosen}>
              <Plus className="size-3.5" /> Add room
            </button>
          </form>
        </section>

        <section className="flex flex-col gap-2 border-t border-edge pt-4">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            <BookmarkPlus className="size-3.5" /> Keep a room as a template
          </h3>
          <p>Arrange a room the way you like with the Layout button, save the floor, then keep it here: it joins the rooms above, for this studio and the others.</p>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void keepRoom();
            }}
          >
            <select className={FIELD} value={saveArea} onChange={(e) => setSaveArea(e.target.value)} aria-label="Room to keep">
              {(layout?.areas ?? []).map((a) => (
                <option key={a.label} value={a.label}>
                  {a.label}
                </option>
              ))}
            </select>
            <input className={`${FIELD} min-w-40 flex-1`} value={saveName} maxLength={40} placeholder="Template name" onChange={(e) => setSaveName(e.target.value)} />
            <button type="submit" className="btn" disabled={!saveArea || !data}>
              <BookmarkPlus className="size-3.5" /> Keep
            </button>
          </form>
        </section>

        {note && <p className="rounded-md border border-edge bg-canvas/60 px-3 py-2 text-ink">{note}</p>}
      </div>
    </Modal>
  );
}
