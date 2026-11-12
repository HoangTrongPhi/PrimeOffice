import assert from "node:assert/strict";
import { test } from "node:test";
import { BRIEFING_FILE, firstMessage, REPORTS_DIR, resolveBoss } from "../../src/lib/briefing.ts";

test("the Boss keeps the briefing file", () => {
  const m = firstMessage({ role: "boss", name: "Batman", bossName: "", taskName: "task001", task: "Plan the sprint." });
  assert.ok(m.startsWith("You are Batman, the Boss"));
  assert.ok(m.includes(BRIEFING_FILE));
  assert.ok(m.includes("Your task: task001"));
  assert.ok(m.endsWith("Plan the sprint."));
});

test("a member reads it and reports under its own name", () => {
  const m = firstMessage({ role: "member", name: "Wonder Woman", bossName: "Batman", taskName: "", task: "" });
  assert.ok(m.includes("The Boss is Batman."));
  assert.ok(m.includes(`read \`${BRIEFING_FILE}\``));
  assert.ok(m.includes(`${REPORTS_DIR}/wonder-woman.md`));
  assert.ok(!m.includes("Your task"));
});

test("solo is the task as written", () => {
  assert.equal(firstMessage({ role: "solo", name: "Ada", bossName: "", taskName: "", task: " Fix the build. " }), "Fix the build.");
  assert.equal(firstMessage({ role: "solo", name: "", bossName: "", taskName: "task7", task: "Fix it." }), "Task: task7\n\nFix it.");
  assert.equal(firstMessage({ role: "solo", name: "", bossName: "", taskName: "task7", task: "" }), "");
});

test("the role texts start with the marks the observer reads (providers/mod.rs team_role)", () => {
  const boss = firstMessage({ role: "boss", name: "Batman", bossName: "", taskName: "", task: "" }).split("\n")[0];
  const member = firstMessage({ role: "member", name: "Ada", bossName: "Batman", taskName: "", task: "" }).split("\n")[0];
  assert.ok(boss.startsWith("You are ") && boss.includes("the Boss of the agent team working in this folder."));
  assert.ok(member.startsWith("You are ") && member.includes("a member of the agent team working in this folder."));
});

test("resolveBoss: a real pick wins, a gone pick falls back to the transcripts, else none", () => {
  const dir = "P:\\Work\\Game";
  const team = [
    { sessionId: "old-boss", cwd: dir, teamRole: "boss", startedAt: "2026-11-01T10:00:00Z" },
    { sessionId: "new-boss", cwd: "p:/work/game/", teamRole: "boss", startedAt: "2026-11-10T10:00:00Z" },
    { sessionId: "member", cwd: dir, teamRole: "member", startedAt: "2026-11-11T10:00:00Z" },
    { sessionId: "elsewhere", cwd: "P:\\Other", teamRole: "boss", startedAt: "2026-11-12T10:00:00Z" },
  ];
  assert.equal(resolveBoss(dir, "member", team, []), "member");
  assert.equal(resolveBoss(dir, "starting", team, ["starting"]), "starting");
  assert.equal(resolveBoss(dir, "ghost", team, []), "new-boss");
  assert.equal(resolveBoss(dir, undefined, team, []), "new-boss");
  assert.equal(resolveBoss(dir, "ghost", team.filter((s) => s.teamRole !== "boss"), []), undefined);
  assert.equal(resolveBoss("P:\\Empty", undefined, team, []), undefined);
});
