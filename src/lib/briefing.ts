// The team briefing of a project folder: the first agent added there is the Boss and keeps the
// directives in one Markdown file; the agents added after it read that file before they work. The
// text below is typed into the CLI as the start of the agent's first message, exactly as shown in
// the Add agent form.

/** Where the Boss keeps the directives, relative to the project folder. */
export const BRIEFING_FILE = ".primeoffice/briefing.md";
/** Where a member leaves notes for the Boss (one file per member). */
export const REPORTS_DIR = ".primeoffice/reports";

export type Role = "boss" | "member" | "solo";

export const ROLES: { id: Role; label: string; text: string }[] = [
  { id: "boss", label: "Boss", text: `Leads the folder's team: writes and keeps ${BRIEFING_FILE}, which the others follow.` },
  { id: "member", label: "Member", text: `Reads ${BRIEFING_FILE} before it works and follows the Boss's directives.` },
  { id: "solo", label: "Solo", text: "No team text: only the first task you write." },
];

export interface Briefing {
  role: Role;
  /** The agent's name ("" = none given). */
  name: string;
  /** The Boss's name, for a member ("" = unknown). */
  bossName: string;
  /** Short task name, e.g. "task001" ("" = none). */
  taskName: string;
  /** What the user wrote as the first task ("" = none). */
  task: string;
}

const safeFile = (name: string) => name.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "agent";

/** The role's part of the first message ("" for solo). */
export function rolePreamble({ role, name, bossName }: Pick<Briefing, "role" | "name" | "bossName">): string {
  const who = name.trim() ? `You are ${name.trim()}, ` : "You are ";
  if (role === "boss") {
    return [
      `${who}the Boss of the agent team working in this folder.`,
      `Keep the team's directives in \`${BRIEFING_FILE}\` (Markdown). Create it now if it is missing, and update it whenever the plan changes. It holds: the goal, the rules every agent follows (conventions, what not to touch, how to report), and one section per task with its id, its owner, its scope and what done looks like.`,
      `The other agents read that file before they work and follow it, so keep it short, exact and current. They leave their reports in \`${REPORTS_DIR}/\`: read those before you change the plan.`,
    ].join("\n");
  }
  if (role === "member") {
    return [
      `${who}a member of the agent team working in this folder. The Boss is ${bossName.trim() || "another agent"}.`,
      `Before anything else read \`${BRIEFING_FILE}\`: it holds the Boss's directives. Follow it — its rules, and the section of your task. If it is missing, or it does not cover what you were asked, say so and wait instead of guessing.`,
      `Do not edit the briefing. When you finish or get stuck, write a short report in \`${REPORTS_DIR}/${safeFile(name)}.md\` (what you did, what is left, questions for the Boss).`,
    ].join("\n");
  }
  return "";
}

/** The whole first message: the role's part, the task name, then the user's task. */
export function firstMessage(b: Briefing): string {
  const taskName = b.taskName.trim();
  const task = b.task.trim();
  const parts = [rolePreamble(b)];
  if (taskName && b.role !== "solo") parts.push(`Your task: ${taskName}`);
  else if (taskName && task) parts.push(`Task: ${taskName}`);
  if (task) parts.push(task);
  return parts.filter(Boolean).join("\n\n");
}
