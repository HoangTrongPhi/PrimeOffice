import { AppearanceSettings, Modal } from "@abyss/ui";
import { useAppStore } from "../../stores/appStore";
import { useAppearance } from "../../stores/appearance";
import { SkillLibrarySettings } from "./SkillLibrarySettings";

/** Appearance (shared) plus the app's own settings, which go below it. */
export function SettingsDialog() {
  const open = useAppStore((s) => s.settingsOpen);
  const setOpen = useAppStore((s) => s.setSettingsOpen);
  return (
    // Taller than a small window with the skill library: cap it to the window so its body scrolls
    // (the shared Modal's max-h-full does not resolve inside its grid backdrop).
    <Modal open={open} title="Settings" onClose={() => setOpen(false)} className="max-h-[calc(100vh-3rem)]">
      <AppearanceSettings useAppearance={useAppearance} />
      {open && <SkillLibrarySettings />}
    </Modal>
  );
}
