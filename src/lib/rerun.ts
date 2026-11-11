import { useAppStore } from "../stores/appStore";
import { useChatStore } from "../stores/chatStore";
import { useHistoryStore, useOfficeStore, useProjectStore, useProviderStore } from "../stores/dataStore";
import { useTermStore } from "../stores/termStore";
import type { TabId } from "../types/primeoffice";

/** F5 / "Run again": what each module re-runs. */
const RERUN: Record<TabId, () => unknown> = {
  office: () => useOfficeStore.getState().refreshAgents(),
  chat: () => useChatStore.getState().loadSessions(),
  projects: () => {
    const { selected, recheck, load } = useProjectStore.getState();
    return selected ? recheck(selected) : load();
  },
  history: () => useHistoryStore.getState().load(),
  providers: () => useProviderStore.getState().load(),
  terminal: () => useTermStore.getState().loadPresets(),
};

export function runActiveModule() {
  void RERUN[useAppStore.getState().activeTab]?.();
}
