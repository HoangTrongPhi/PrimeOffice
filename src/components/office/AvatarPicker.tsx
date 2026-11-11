import { Shuffle } from "lucide-react";
import { useEffect, useState } from "react";
import type { AvatarGroup } from "../../office/bridge/assets";

const asset = (p: string) => `${import.meta.env.BASE_URL}assets/${p}`;

let groupsPromise: Promise<AvatarGroup[]> | null = null;
/** Avatar groups from asset-index.json (crew packs, then DC, Marvel, Dragon Ball, Naruto, …). */
export function loadAvatarGroups(): Promise<AvatarGroup[]> {
  groupsPromise ??= fetch(asset("asset-index.json"))
    .then((r) => r.json() as Promise<{ avatarGroups?: AvatarGroup[] }>)
    .then((i) => i.avatarGroups ?? [])
    .catch(() => {
      groupsPromise = null;
      return [];
    });
  return groupsPromise;
}

/** The character facing down (first walk frame) of a sheet, `scale`× and cut at the waist when `bust`. */
export function AvatarSprite({ file, scale = 3, bust = true, className = "" }: { file: string; scale?: number; bust?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 ${className}`}
      style={{
        width: 16 * scale,
        height: (bust ? 24 : 32) * scale,
        backgroundImage: `url("${asset(`characters/${file}`)}")`,
        backgroundSize: `${112 * scale}px ${96 * scale}px`,
        backgroundPosition: "0 0",
        backgroundRepeat: "no-repeat",
        imageRendering: "pixelated",
      }}
    />
  );
}

/**
 * Pick the agent's look: Auto (the office gives it one of the crew, as before) or any avatar of the
 * project — every crew character, then the themed groups (DC, Marvel, Dragon Ball, Naruto, festive, …).
 */
export function AvatarPicker({ value, onChange }: { value: string; onChange: (file: string, name?: string) => void }) {
  const [groups, setGroups] = useState<AvatarGroup[]>([]);
  const [tab, setTab] = useState<string>("");

  useEffect(() => {
    let gone = false;
    void loadAvatarGroups().then((g) => {
      if (gone) return;
      setGroups(g);
      setTab((t) => t || g.find((x) => x.items.some((it) => it.file === value))?.id || g.find((x) => !x.crew)?.id || g[0]?.id || "");
    });
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const group = groups.find((g) => g.id === tab) ?? groups[0];
  const chosen = groups.flatMap((g) => g.items).find((it) => it.file === value);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="flex size-[60px] items-center justify-center rounded-lg border border-edge bg-canvas/50">
          {value ? <AvatarSprite file={value} scale={2} /> : <Shuffle className="size-5 text-ink-faint" />}
        </span>
        <div className="min-w-0 flex-1 text-[12px]">
          <div className="font-medium text-ink">{chosen ? chosen.name : "Auto"}</div>
          <div className="text-ink-faint">{chosen ? groups.find((g) => g.items.includes(chosen))?.label : "The office gives it one of the crew."}</div>
        </div>
        {value && (
          <button type="button" className="btn" onClick={() => onChange("")}>
            <Shuffle className="size-3.5" /> Auto
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Avatar themes">
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={g.id === group?.id}
            onClick={() => setTab(g.id)}
            className={`rounded-md border px-2 py-1 text-[11.5px] ${g.id === group?.id ? "border-accent bg-accent/12 text-ink" : "border-edge text-ink-muted hover:bg-tint/4"}`}
          >
            {g.label}
          </button>
        ))}
      </div>
      {!groups.length && <span className="text-[12px] text-ink-faint">Loading the avatars…</span>}
      {group && (
        <div className="grid max-h-[220px] grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5 overflow-auto pr-1">
          {group.items.map((it) => (
            <button
              key={it.file}
              type="button"
              title={it.name}
              onClick={() => onChange(it.file, it.name)}
              className={`flex flex-col items-center gap-0.5 rounded-lg border p-1 ${it.file === value ? "border-accent bg-accent/12" : "border-edge hover:bg-tint/4"}`}
            >
              <AvatarSprite file={it.file} scale={2} />
              <span className="w-full truncate text-center text-[10.5px] text-ink-muted">{it.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
