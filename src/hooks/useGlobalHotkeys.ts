import { useEffect } from "react";
import { pickPaths } from "../lib/dialogs";
import { MODULES } from "../lib/modules";
import { runActiveModule } from "../lib/rerun";
import { useAppStore } from "../stores/appStore";

/**
 * F1 (no modifier) toggles the Help panel on the current tab's topic and closes the palette.
 * Returns true when it handled the key. Also used for the office iframe (OfficeTab), whose own
 * document gets the keys while it has focus.
 */
export function handleHelpKey(e: KeyboardEvent): boolean {
  if (e.key !== "F1" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
  e.preventDefault();
  const s = useAppStore.getState();
  s.setPaletteOpen(false);
  s.setHelpOpen(!s.helpOpen);
  return true;
}

/** F1 help, Ctrl+O open project, Ctrl+K palette, Ctrl+` log drawer, Ctrl+, settings, Ctrl+1…9 module switch, F5 run again. */
export function useGlobalHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useAppStore.getState();
      if (handleHelpKey(e)) return;
      if (e.key === "F5" && !e.ctrlKey && !e.altKey) {
        // Also stops the webview from reloading the page.
        e.preventDefault();
        runActiveModule();
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "k") {
        e.preventDefault();
        s.setPaletteOpen(!s.paletteOpen);
      } else if (key === "o") {
        e.preventDefault();
        void pickPaths("folder");
      } else if (key === ",") {
        e.preventDefault();
        s.setSettingsOpen(!s.settingsOpen);
      } else if (e.code === "Backquote") {
        e.preventDefault();
        s.toggleLogDrawer();
      } else {
        const mod = MODULES.find((m) => m.hotkey === e.key);
        if (mod) {
          e.preventDefault();
          s.setPaletteOpen(false);
          s.setActiveTab(mod.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
