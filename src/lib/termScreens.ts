// The xterm screens of the Terminal tab. A screen lives as long as its terminal, on screen or not: it
// keeps taking output while another tab is shown, and is put back into the page when its tab comes
// back. Loaded on demand (termStore) so xterm is not part of the app's start.
import { FitAddon } from "@xterm/addon-fit";
import { Terminal, type ITheme } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

export interface Screen {
  term: Terminal;
  fit: FitAddon;
  /** The element xterm draws in; moved in and out of the tab's host. */
  el: HTMLDivElement;
  opened: boolean;
}

export interface ScreenHooks {
  /** Keys typed, and xterm's own answers to the program (cursor position, …). */
  onInput: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  onTitle: (title: string) => void;
}

const screens = new Map<number, Screen>();

const cssVar = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/** Colours of the app's theme (dark or light) at this moment. */
function theme(): ITheme {
  const foreground = cssVar("--color-ink", "#e6e8ee");
  return { background: cssVar("--color-canvas", "#0f1115"), foreground, cursor: foreground, selectionBackground: "rgba(120, 140, 255, 0.35)" };
}

export function createScreen(key: number, hooks: ScreenHooks): Screen {
  const term = new Terminal({
    cols: 100,
    rows: 30,
    fontFamily: cssVar("--font-mono", "Consolas, monospace"),
    fontSize: 13,
    cursorBlink: true,
    scrollback: 5000,
    allowProposedApi: false,
    theme: theme(),
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.onData(hooks.onInput);
  term.onResize(({ cols, rows }) => hooks.onResize(cols, rows));
  term.onTitleChange(hooks.onTitle);
  // Ctrl+C copies when text is selected (otherwise it goes to the program); Ctrl+V pastes through
  // the browser's paste event, which xterm handles.
  term.attachCustomKeyEventHandler((e) => {
    // Ctrl+K, Ctrl+O… belong to the program here, not to the app's shortcuts; Ctrl+1…9 still
    // switch tabs.
    if (e.ctrlKey && !/^[0-9]$/.test(e.key)) e.stopPropagation();
    if (e.type === "keydown" && e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "c" && term.hasSelection()) {
      void navigator.clipboard?.writeText(term.getSelection()).catch(() => {});
      term.clearSelection();
      return false;
    }
    return true;
  });
  const el = document.createElement("div");
  el.className = "h-full w-full";
  const screen: Screen = { term, fit, el, opened: false };
  screens.set(key, screen);
  return screen;
}

export const getScreen = (key: number) => screens.get(key);

/** Size the screen to its host; no-op while it is not laid out. */
export function fitScreen(screen: Screen) {
  if (!screen.el.isConnected || !screen.el.clientWidth || !screen.el.clientHeight) return;
  try {
    screen.fit.fit();
  } catch {
    // xterm has not measured its font yet; the next resize fits it
  }
}

/** Show the screen in `host` (the first time, xterm starts drawing there). */
export function attachScreen(screen: Screen, host: HTMLElement) {
  host.replaceChildren(screen.el);
  if (!screen.opened) {
    screen.term.open(screen.el);
    screen.opened = true;
  }
  screen.term.options.theme = theme();
  fitScreen(screen);
  screen.term.focus();
}

export function disposeScreen(key: number) {
  const screen = screens.get(key);
  if (!screen) return;
  screens.delete(key);
  screen.term.dispose();
  screen.el.remove();
}
