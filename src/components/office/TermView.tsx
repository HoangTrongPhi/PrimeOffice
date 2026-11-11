import { CornerDownLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTermStore } from "../../stores/termStore";

/**
 * The xterm screen of one terminal, sized to its box. A screen is drawn in one place at a time:
 * the Terminal tab and Office never show at once, so moving it here and back is enough.
 */
export function TermView({ termKey, className = "" }: { termKey: number; className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  // The screen is made while the terminal starts: look again once the tab list changes.
  const exists = useTermStore((s) => s.tabs.some((t) => t.key === termKey));

  useEffect(() => {
    let undo: (() => void) | null = null;
    let gone = false;
    // xterm is loaded with the first terminal, not with the app: import it here the same way.
    void import("../../lib/termScreens").then(({ attachScreen, fitScreen, getScreen }) => {
      const host = hostRef.current;
      const screen = getScreen(termKey);
      if (gone || !host || !screen) return;
      attachScreen(screen, host);
      const observer = new ResizeObserver(() => fitScreen(screen));
      observer.observe(host);
      undo = () => {
        observer.disconnect();
        screen.el.remove();
      };
    });
    return () => {
      gone = true;
      undo?.();
    };
  }, [termKey, exists]);

  return <div ref={hostRef} className={`min-h-0 overflow-hidden bg-canvas p-2 ${className}`} />;
}

/** A line to type into a running terminal (pasted, then Enter) — the agent's next instruction. */
export function TermComposer({ termKey, disabled }: { termKey: number; disabled?: boolean }) {
  const [text, setText] = useState("");
  const send = () => {
    if (!text.trim() || disabled) return;
    if (useTermStore.getState().send(termKey, text)) setText("");
  };
  return (
    <form
      className="flex shrink-0 items-end gap-2 border-t border-edge p-2"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <textarea
        className="max-h-32 min-h-[34px] flex-1 resize-y rounded-md border border-edge bg-canvas/70 px-2.5 py-1.5 text-[12.5px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        rows={1}
        value={text}
        disabled={disabled}
        placeholder={disabled ? "The terminal has ended" : "Type to the agent…  (Enter to send, Shift+Enter for a new line)"}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
      />
      <button type="submit" className="btn h-[34px]" disabled={disabled || !text.trim()} title="Paste into the terminal and press Enter">
        <CornerDownLeft className="size-3.5" /> Send
      </button>
    </form>
  );
}
