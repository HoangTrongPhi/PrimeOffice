import { useAppStore } from "../stores/appStore";
import { useHistoryStore, useOfficeStore, useProjectStore, useProviderStore } from "../stores/dataStore";
import type { TabId } from "../types/primeoffice";

/** F5 / "Run again": what each module re-runs. */
const RERUN: Record<TabId, () => unknown> = {
  office: () => useOfficeStore.getState().refreshAgents(),
  projects: () => {
    const { selected, recheck, load } = useProjectStore.getState();
    return selected ? recheck(selected) : load();
  },
  history: () => useHistoryStore.getState().load(),
  providers: () => useProviderStore.getState().load(),
};

export function runActiveModule() {
  void RERUN[useAppStore.getState().activeTab]?.();
}
