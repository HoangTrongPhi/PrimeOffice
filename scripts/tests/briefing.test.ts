import assert from "node:assert/strict";
import { test } from "node:test";
import { BRIEFING_FILE, firstMessage, REPORTS_DIR } from "../../src/lib/briefing.ts";

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
