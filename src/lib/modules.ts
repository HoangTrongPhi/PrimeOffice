import { Building2, FolderCheck, History, PlugZap, type LucideIcon } from "lucide-react";
import type { TabId } from "../types/primeoffice";

export interface ModuleDef {
  id: TabId;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Ctrl+<digit> shortcut. */
  hotkey: string;
  /** What a drop on this module loads (dropRouter / useWindowDragDrop). */
  accepts: "folder" | "files" | "any";
}

/** The app's modules, in navigation order (the rail, Ctrl+1…9, the command palette). */
export const MODULES: ModuleDef[] = [
  { id: "office", label: "Office", description: "Your agents at work in the pixel office", icon: Building2, hotkey: "1", accepts: "folder" },
  { id: "projects", label: "Projects", description: "Open a project folder and see what it is missing", icon: FolderCheck, hotkey: "2", accepts: "folder" },
  { id: "history", label: "History", description: "Recent sessions: last prompt, what was done, last reply", icon: History, hotkey: "3", accepts: "folder" },
  { id: "providers", label: "Agents", description: "Claude Code, Codex, Gemini, DeepSeek on this PC", icon: PlugZap, hotkey: "4", accepts: "folder" },
];

export const moduleById = (id: TabId) => MODULES.find((m) => m.id === id) ?? MODULES[0];
