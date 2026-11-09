import { GlassCard, PathText, PillBadge, type PillTone } from "@abyss/ui";
import { RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useProviderStore } from "../../stores/dataStore";
import type { ProviderState } from "../../types/primeoffice";

const STATE: Record<ProviderState, { label: string; tone: PillTone }> = {
  active: { label: "Active", tone: "emerald" },
  detected: { label: "Found", tone: "accent" },
  notFound: { label: "Not found", tone: "neutral" },
  unsupported: { label: "Planned", tone: "amber" },
};

/** Every agent PrimeOffice knows about, and whether it can show it today. */
export function ProvidersTab() {
  const { providers, load } = useProviderStore();
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-[12.5px] text-ink-muted">
          PrimeOffice reads each agent&apos;s own session files on this PC — nothing is sent anywhere. Claude Code is fully supported; Codex (ChatGPT), Gemini and DeepSeek are detected now and join the office in a later version.
        </p>
        <button type="button" className="btn" onClick={() => void load()}>
          <RefreshCw className="size-3.5" /> Refresh
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {providers.map((p) => (
          <GlassCard key={p.id} title={p.name} actions={<PillBadge tone={STATE[p.state].tone}>{STATE[p.state].label}</PillBadge>}>
            <div className="flex flex-col gap-2 p-4 text-[12px]">
              <div className="text-ink-muted">{p.note}</div>
              {p.sessionRoot && <PathText path={p.sessionRoot} className="text-ink-faint" />}
              <div className="flex gap-3 text-ink-faint">
                <span>{p.sessions} recent session(s)</span>
                <span>{p.observable ? "Shown in the office" : "Not in the office yet"}</span>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
