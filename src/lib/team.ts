// The team in the office: every session has a person's name (Batman, Robin…), its session title is
// its Master Task (the short title Claude Desktop shows for the session), a folder's first agent is
// its Boss, and the Boss orders sub-agents whose work is ticked off when they finish.

import { folderKey, type TeamSession } from "./briefing.ts";
import type { AgentSession, SubTask } from "../types/primeoffice";

/** Names given to agents that have none, in this order (skipping names already in use). */
export const PERSON_NAMES = [
  "Batman", "Robin", "Nightwing", "Batgirl", "Alfred", "Superman", "Wonder Woman", "Flash", "Aquaman", "Cyborg",
  "Green Lantern", "Martian Manhunter", "Shazam", "Green Arrow", "Hawkman", "Zatanna", "Constantine", "Raven",
  "Starfire", "Beast Boy", "Supergirl", "Oracle", "Huntress", "Blue Beetle", "Booster Gold", "Firestorm",
];

/** The next free person's name (case does not matter); after the list, "Agent 2", "Agent 3"… */
export function nextPersonName(used: Iterable<string>): string {
  const taken = new Set([...used].map((n) => n.trim().toLowerCase()));
  const free = PERSON_NAMES.find((n) => !taken.has(n.toLowerCase()));
  if (free) return free;
  for (let i = 2; ; i++) if (!taken.has(`agent ${i}`)) return `Agent ${i}`;
}

/** Sub-agents done / ordered. */
export function subProgress(s: Pick<AgentSession, "subTasks">): { done: number; total: number } {
  const list: SubTask[] = s.subTasks ?? [];
  return { done: list.filter((t) => t.done).length, total: list.length };
}

/** The whole job is done: the turn is over and every sub-agent it ordered has finished. */
export function allDone(s: Pick<AgentSession, "status" | "subTasks">): boolean {
  const { done, total } = subProgress(s);
  return s.status === "done" && done === total;
}

/**
 * What the agent is doing, in a few words, for the label over its character and the lists. The
 * office shows a running tool's own words; this covers the rest (thinking, a finished turn, waiting
 * on sub-agents), which used to read "Idle".
 */
export function statusText(s: Pick<AgentSession, "status" | "openTools" | "subTasks">): string {
  const { done, total } = subProgress(s);
  const subs = total ? ` · sub-agents ${done}/${total}` : "";
  const open = s.openTools.at(-1);
  switch (s.status) {
    case "waiting":
      if (s.openTools.some((t) => t.tool === "AskUserQuestion")) return "Waiting for your answer";
      if (s.openTools.some((t) => t.tool === "ExitPlanMode")) return "Waiting for plan approval";
      return "Needs approval";
    case "active":
      return `${open?.label ?? "Thinking…"}${subs}`;
    case "done":
      if (total && done < total) return `Waiting on sub-agents ${done}/${total}`;
      return total ? `✓ All done · ${done}/${total} sub-agents` : "✓ Done";
    default:
      return "Idle";
  }
}

/**
 * The Boss a folder should have. The pick stands while that session is still in the office (or its
 * terminal is starting); otherwise the folder has no Boss at work, so: the newest session whose first
 * message made it Boss, else the first agent that came into the folder (members excluded) — a new
 * session in a folder with no other agent becomes its Boss, whichever client started it.
 */
export function bossFor(cwd: string, picked: string | undefined, sessions: TeamSession[], live: Iterable<string>): string | undefined {
  const key = folderKey(cwd);
  const mine = sessions.filter((s) => folderKey(s.cwd) === key);
  if (picked && (mine.some((s) => s.sessionId === picked) || [...live].includes(picked))) return picked;
  const when = (s: TeamSession) => (s.startedAt ? Date.parse(s.startedAt) : NaN) || s.modifiedMs || 0;
  const transcriptBoss = mine.filter((s) => s.teamRole === "boss").sort((a, b) => when(b) - when(a))[0];
  if (transcriptBoss) return transcriptBoss.sessionId;
  return mine.filter((s) => s.teamRole !== "member").sort((a, b) => when(a) - when(b))[0]?.sessionId;
}

/** The order typed into the Boss's session for "Add sub-agent": it delegates through the Agent tool. */
export function subAgentOrder({ type, title, task }: { type: string; title: string; task: string }): string {
  const name = title.trim() || task.trim().split(/\s+/).slice(0, 5).join(" ");
  return [
    `[PrimeOffice] Order for you as the Boss: delegate this to a sub-agent now.`,
    `Use the Agent tool with subagent_type "${type.trim() || "general-purpose"}" and description "${name.replace(/"/g, "'")}". Its prompt:`,
    task.trim(),
    `When it finishes, check its result and tell me in one line whether the task is done.`,
  ].join("\n");
}
