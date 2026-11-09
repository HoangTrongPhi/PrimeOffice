import type { PaletteItem } from "@abyss/ui";
import { createElement } from "react";
import { FolderOpen, PanelBottom, RefreshCw, Settings2, Trash2, UserRound, type LucideIcon } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { useUpdateStore } from "../stores/updateStore";
import { pickPaths } from "./dialogs";
import { MODULES } from "./modules";
import { runActiveModule } from "./rerun";

const icon = (I: LucideIcon) => createElement(I, { strokeWidth: 1.75 });

/** Everything reachable from the command palette (Ctrl+K). Modules append their actions here. */
export function buildCommands(): PaletteItem[] {
  const s = useAppStore.getState();
  return [
    ...MODULES.map<PaletteItem>((m) => ({
      id: `nav.${m.id}`,
      label: `Go to ${m.label}`,
      group: "Navigate",
      icon: icon(m.icon),
      hint: `Ctrl+${m.hotkey}`,
      keywords: m.description,
      run: () => s.setActiveTab(m.id),
    })),
    { id: "act.openFolder", label: "Open project folder…", group: "Actions", icon: icon(FolderOpen), hint: "Ctrl+O", keywords: "browse directory project check", run: () => pickPaths("folder") },
    { id: "act.rerun", label: "Run the current module again", group: "Actions", icon: icon(RefreshCw), hint: "F5", keywords: "refresh rerun", run: runActiveModule },
    { id: "app.checkUpdates", label: "Check for updates…", group: "Actions", icon: icon(RefreshCw), keywords: "update upgrade version", run: () => useUpdateStore.getState().check() },
    { id: "view.toggleLog", label: "Toggle log drawer", group: "View", icon: icon(PanelBottom), hint: "Ctrl+`", keywords: "console terminal output", run: () => s.toggleLogDrawer() },
    { id: "view.settings", label: "Settings…", group: "View", icon: icon(Settings2), hint: "Ctrl+,", keywords: "theme dark light font size appearance preferences", run: () => s.setSettingsOpen(true) },
    { id: "view.about", label: "About & contact", group: "View", icon: icon(UserRound), keywords: "author contact version help", run: () => s.setAboutOpen(true) },
    { id: "view.clearLog", label: "Clear log", group: "View", icon: icon(Trash2), keywords: "console reset", run: () => s.clearLogs() },
  ];
}
