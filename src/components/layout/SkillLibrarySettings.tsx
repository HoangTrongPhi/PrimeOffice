import { Checkbox } from "@abyss/ui";
import { AlertTriangle, BookOpen, FolderOpen, Info, RefreshCw, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { pickOne } from "../../lib/dialogs";
import { inTauri, ipc } from "../../lib/ipc";
import { errorText, uiLog } from "../../stores/appStore";
import { templateSummary, useSkillStore } from "../../stores/skillStore";

const reveal = (path: string) => void ipc.revealInExplorer(path).catch((e) => uiLog("error", errorText(e)));
const sep = (root: string) => (root.includes("/") && !root.includes("\\") ? "/" : "\\");

/**
 * Settings → Skill library: the folder of skill templates (skills_cmd), where to clone third-party
 * repos, and whether a template session loads only that template's skills. The structure under the
 * folder is fixed (HUONG_DAN.md); the folder itself can be moved here.
 */
export function SkillLibrarySettings() {
  const { library, loading, error, load, save } = useSkillStore();
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    void load();
  }, [load]);

  if (!inTauri) return null;
  const root = library?.root ?? "";
  const s = sep(root);

  return (
    <section className="flex flex-col gap-3 border-t border-edge pt-4">
      <div className="flex items-center gap-2">
        <BookOpen className="size-4 text-accent" />
        <h3 className="text-[13px] font-semibold text-ink">Thư viện skill</h3>
        <button type="button" className="btn ml-auto" disabled={loading} onClick={() => void load()} title="Đọc lại thư mục">
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      <p className="text-[11.5px] leading-relaxed text-ink-faint">
        Mỗi template (Game, Video…) là một bộ skill. Boss được thêm với một template chỉ nạp bộ skill đó, và sub-agent của Boss dùng chung bộ này. Cấu trúc thư mục là cố định, xem
        <code className="mx-1 font-mono">HUONG_DAN.md</code>trong thư mục.
      </p>

      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-ink">Thư mục</span>
        <div className="flex gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border border-edge bg-canvas/70 px-2 py-1.5 font-mono text-[11.5px] text-ink" title={root}>
            {root || "…"}
          </code>
          <button
            type="button"
            className="btn"
            disabled={loading}
            onClick={() =>
              void pickOne("folder").then((p) => {
                if (p) void save(p, library?.isolate ?? true);
              })
            }
          >
            <FolderOpen className="size-3.5" /> Đổi thư mục…
          </button>
          {library?.custom && (
            <button type="button" className="btn" disabled={loading} onClick={() => void save(null, library.isolate)} title={`Về thư mục mặc định: ${library.defaultRoot}`}>
              <RotateCcw className="size-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-3 text-[11.5px]">
          {root && (
            <button type="button" className="text-accent hover:underline" onClick={() => reveal(`${root}${s}HUONG_DAN.md`)}>
              Mở thư mục / hướng dẫn
            </button>
          )}
          {!library?.custom && library && <span className="text-ink-faint">Mặc định: nằm cạnh PrimeOffice đã cài.</span>}
        </div>
      </div>

      {(error || library?.error) && (
        <p className="flex items-start gap-1.5 rounded-md border border-rose/40 bg-rose/10 px-2.5 py-1.5 text-[11.5px] text-rose">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {library?.error || error}
        </p>
      )}

      {library && (
        <Checkbox
          checked={library.isolate}
          disabled={loading}
          onChange={(v) => void save(library.custom ? library.root : null, v)}
          label="Chỉ dùng skill của template"
          hint="Thêm --setting-sources project,local: không nạp skill và plugin cá nhân (~/.claude), bỏ qua cả thiết lập cá nhân trong ~/.claude/settings.json cho phiên đó. Skill trong .claude của project vẫn được nạp."
        />
      )}

      {library && !library.error && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink">Template ({library.templates.length})</span>
          {library.templates.map((t) => {
            const warn = t.issues.some((i) => i.severity !== "info");
            const expanded = open === t.id;
            return (
              <div key={t.id} className="rounded-lg border border-edge">
                <button type="button" className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-tint/4" onClick={() => setOpen(expanded ? null : t.id)}>
                  <span className="text-[12.5px] font-medium text-ink">{t.name}</span>
                  <code className="font-mono text-[10.5px] text-ink-faint">{t.id}</code>
                  {warn && <AlertTriangle className="size-3.5 text-amber" />}
                  <span className="ml-auto text-[11px] text-ink-muted">{templateSummary(t)}</span>
                </button>
                {expanded && (
                  <div className="flex flex-col gap-2 border-t border-edge px-2.5 py-2 text-[11.5px]">
                    {t.description && <p className="text-ink-muted">{t.description}</p>}
                    {t.sources.map((src) => (
                      <div key={src.path}>
                        <div className="flex items-center gap-1.5 text-ink">
                          <span className="rounded bg-tint/8 px-1 text-[10px] uppercase text-ink-faint">{src.kind === "own" ? "riêng" : src.kind === "plugin" ? "plugin" : "project"}</span>
                          {src.kind === "own" ? "skills/ + agents/" : `repos/${src.name}`}
                          <span className="text-ink-faint">· {src.skills.length} skill{src.agents ? ` · ${src.agents} agent` : ""}</span>
                        </div>
                        {src.skills.length > 0 && <p className="mt-0.5 truncate text-ink-faint" title={src.skills.map((k) => k.name).join(", ")}>{src.skills.map((k) => k.name).join(", ")}</p>}
                      </div>
                    ))}
                    {t.issues.map((i) => (
                      <p key={i.code + i.message} className={`flex items-start gap-1.5 ${i.severity === "info" ? "text-ink-faint" : "text-amber"}`}>
                        {i.severity === "info" ? <Info className="mt-0.5 size-3 shrink-0" /> : <AlertTriangle className="mt-0.5 size-3 shrink-0" />}
                        {i.message}
                      </p>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <button type="button" className="btn" onClick={() => reveal(`${t.path}${s}repos`)} title="Clone repo skill bên thứ 3 vào đây">
                        <FolderOpen className="size-3.5" /> repos/
                      </button>
                      <button type="button" className="btn" onClick={() => reveal(`${t.path}${s}skills`)}>
                        <FolderOpen className="size-3.5" /> skills/
                      </button>
                    </div>
                    <code className="select-all rounded-md border border-edge bg-canvas/50 px-2 py-1 font-mono text-[10.5px] text-ink-muted">
                      cd "{t.path}{s}repos"; git clone https://github.com/&lt;owner&gt;/&lt;repo&gt;.git
                    </code>
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-[11px] text-ink-faint">Template mới: tạo thư mục mới trong templates/ (chữ thường a-z, số, dấu -), rồi bấm làm mới.</p>
        </div>
      )}
    </section>
  );
}
