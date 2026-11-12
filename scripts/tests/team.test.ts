import assert from "node:assert/strict";
import { test } from "node:test";
import { allDone, bossFor, nextPersonName, statusText, subAgentOrder } from "../../src/lib/team.ts";

const tool = (name: string, label = name) => ({ id: name, tool: name, label });
const s = (over: object) => ({ status: "active" as const, openTools: [] as ReturnType<typeof tool>[], subTasks: [], ...over });

test("every agent gets a free person's name", () => {
  assert.equal(nextPersonName([]), "Batman");
  assert.equal(nextPersonName(["batman", "Robin"]), "Nightwing");
});

test("the status says more than Idle", () => {
  assert.equal(statusText(s({})), "Thinking…");
  assert.equal(statusText(s({ openTools: [tool("Edit", "Editing a.rs")] })), "Editing a.rs");
  assert.equal(statusText(s({ status: "waiting", openTools: [tool("AskUserQuestion")] })), "Waiting for your answer");
  assert.equal(statusText(s({ status: "waiting", openTools: [tool("Edit")] })), "Needs approval");
  assert.equal(statusText(s({ status: "done" })), "✓ Done");
  assert.equal(statusText(s({ status: "stale" })), "Idle");
});

test("the Boss is all done only when every sub-agent is", () => {
  const subs = [
    { id: "a", agentType: "Explore", description: "x", done: true },
    { id: "b", agentType: "Plan", description: "y", done: false },
  ];
  assert.equal(statusText(s({ status: "done", subTasks: subs })), "Waiting on sub-agents 1/2");
  assert.equal(allDone(s({ status: "done", subTasks: subs })), false);
  const all = subs.map((t) => ({ ...t, done: true }));
  assert.equal(allDone(s({ status: "done", subTasks: all })), true);
  assert.equal(statusText(s({ status: "done", subTasks: all })), "✓ All done · 2/2 sub-agents");
});

test("a new session in a folder with no agent at work is its Boss", () => {
  const a = { sessionId: "a", cwd: "D:\\Game", startedAt: "2026-11-12T10:00:00Z" };
  const b = { sessionId: "b", cwd: "d:/game/", startedAt: "2026-11-12T11:00:00Z" };
  const m = { sessionId: "m", cwd: "D:\\Game", startedAt: "2026-11-12T09:00:00Z", teamRole: "member" };
  assert.equal(bossFor("D:\\Game", undefined, [b, a, m], []), "a", "the first agent in, members aside");
  assert.equal(bossFor("D:\\Game", "b", [a, b], []), "b", "a pick at work stands");
  assert.equal(bossFor("D:\\Game", "gone", [b], []), "b", "a pick that left: the one at work takes over");
  assert.equal(bossFor("D:\\Game", "starting", [b], ["starting"]), "starting", "a terminal still starting keeps it");
  assert.equal(bossFor("D:\\Game", undefined, [a, { ...b, teamRole: "boss" }], []), "b", "the transcript's Boss first");
  assert.equal(bossFor("D:\\Other", undefined, [a, b], []), undefined);
});

test("the sub-agent order names the type and the task", () => {
  const o = subAgentOrder({ type: "qa-tester", title: "Stacking tests", task: "Write tests for stacking." });
  assert.ok(o.includes('subagent_type "qa-tester"') && o.includes('description "Stacking tests"') && o.includes("Write tests for stacking."));
});
