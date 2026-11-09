import type { HelpLang } from "@abyss/ui";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

/**
 * PrimeOffice's own UI preferences, kept in the webview's localStorage like the office filter
 * (`primeoffice.office`, dataStore.ts) and the appearance (`primeoffice.appearance`). Every storage
 * call is guarded: a blocked or full localStorage falls back to the defaults instead of throwing.
 */
interface SettingsState {
  /** Language of the Help panel (F1); Vietnamese by default. */
  helpLang: HelpLang;
  setHelpLang: (lang: HelpLang) => void;
}

const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      // Not saved; the choice still applies until the app closes.
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      helpLang: "vi",
      setHelpLang: (helpLang) => set({ helpLang }),
    }),
    { name: "primeoffice.settings", version: 1, storage: createJSONStorage(() => safeLocalStorage), partialize: (s) => ({ helpLang: s.helpLang }) },
  ),
);
