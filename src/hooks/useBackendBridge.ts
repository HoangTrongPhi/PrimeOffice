import { useEffect } from "react";
import { routeDrop } from "../lib/dropRouter";
import { inTauri, ipc, on } from "../lib/ipc";
import { errorText, uiLog, useAppStore } from "../stores/appStore";
import { startupUpdateCheck } from "../stores/updateStore";

if (!inTauri) {
  uiLog("warn", "Running outside Tauri — backend commands are unavailable (open with ?mock for sample data).");
}

/** Subscribes to backend log events, loads app info once at startup, then checks for updates. */
export function useBackendBridge() {
  useEffect(() => {
    if (!inTauri) return;
    const { addLogs, setAppInfo } = useAppStore.getState();
    let disposed = false;
    // Listen first, then backfill, so no entry falls between the two.
    const unlisten = on.log((entry) => addLogs([entry]));
    unlisten
      .then(() => ipc.logHistory())
      .then((history) => !disposed && addLogs(history))
      .catch((err) => uiLog("error", `Log bridge failed: ${errorText(err)}`));
    ipc
      .appInfo()
      .then((info) => {
        if (disposed) return;
        setAppInfo(info);
        void startupUpdateCheck(info);
      })
      .catch((err) => uiLog("error", `app_info failed: ${errorText(err)}`));
    // Started with a folder (Explorer's "Open with", `primeoffice.exe D:\Game`): open it as if it
    // were dropped on the Office — the office shows it when it is Ready, Projects otherwise.
    // Not gated on `disposed`: the folder is handed out once, so a cleanup (StrictMode's double
    // effect run) must not drop it.
    ipc
      .takeStartupFolder()
      .then((folder) => {
        if (!folder) return;
        useAppStore.getState().setActiveTab("office");
        routeDrop("office", [folder]);
      })
      .catch((err) => uiLog("error", `Start folder: ${errorText(err)}`));
    return () => {
      disposed = true;
      void unlisten.then((fn) => fn());
    };
  }, []);
}
