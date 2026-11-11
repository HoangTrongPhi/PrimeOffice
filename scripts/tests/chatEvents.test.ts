// node --test scripts/tests/  (Node 22.18+ runs TypeScript directly). Part of `npm run check`.
// The records are cut-down copies of what Claude Code 2.1.319 printed for `claude -p --output-format
// stream-json --verbose --include-partial-messages`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyChatDone, applyChatLine, emptyChat, toolLabel, type ChatView } from "../../src/lib/chatEvents.ts";

const SID = "b522fcf1-505a-44f1-a1ca-e857b386b71c";
const delta = (text: string) => ({ type: "stream_event", event: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text } }, session_id: SID, parent_tool_use_id: null });
const assistant = (content: unknown[], parent: string | null = null) => ({ type: "assistant", message: { model: "claude-haiku-5-5", role: "assistant", content }, parent_tool_use_id: parent, session_id: SID });
const run = (lines: unknown[], from: ChatView = emptyChat()) => lines.reduce<ChatView>(applyChatLine, from);

test("a turn: init, streamed text, a tool, the result", () => {
  let v = run([
    { type: "system", subtype: "init", cwd: "D:\\Game", session_id: SID, model: "claude-haiku-5-5", permissionMode: "default" },
    { type: "system", subtype: "status", status: "requesting", session_id: SID },
    { type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "" } }, session_id: SID, parent_tool_use_id: null },
    delta("I'll fix "),
    delta("the build."),
  ]);
  assert.equal(v.sessionId, SID);
  assert.equal(v.model, "claude-haiku-5-5");
  assert.deepEqual(v.items, [{ kind: "assistant", text: "I'll fix the build.", streaming: true }]);

  v = run([assistant([{ type: "text", text: "I'll fix the build." }]), assistant([{ type: "tool_use", id: "toolu_1", name: "Edit", input: { file_path: "D:\\Game\\src\\main.rs" } }])], v);
  assert.deepEqual(v.items, [
    { kind: "assistant", text: "I'll fix the build.", streaming: false },
    { kind: "tool", id: "toolu_1", name: "Edit", label: "Editing main.rs", done: false, error: false },
  ]);
  // The same tool call again (the CLI repeats a message as it grows) is not added twice.
  v = run([assistant([{ type: "tool_use", id: "toolu_1", name: "Edit", input: {} }])], v);
  assert.equal(v.items.length, 2);

  v = run([{ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "ok" }] }, session_id: SID }, delta("Done."), assistant([{ type: "text", text: "Done." }]), { type: "result", subtype: "success", is_error: false, result: "Done.", session_id: SID, total_cost_usd: 0.0042, permission_denials: [] }], v);
  assert.equal(v.items.length, 3);
  assert.deepEqual(v.items[1], { kind: "tool", id: "toolu_1", name: "Edit", label: "Editing main.rs", done: true, error: false });
  assert.deepEqual(v.items[2], { kind: "assistant", text: "Done.", streaming: false });
  assert.equal(v.costUsd, 0.0042);
});

test("sub-agent records, refusals, errors and limits", () => {
  let v = run([assistant([{ type: "text", text: "sub-agent thinking aloud" }], "toolu_9"), { ...delta("x"), parent_tool_use_id: "toolu_9" }]);
  assert.deepEqual(v.items, [], "a sub-agent's records are the office's business");
  assert.equal(v.sessionId, SID);

  v = run([assistant([{ type: "tool_use", id: "t2", name: "Bash", input: { command: "rm -rf build" } }]), { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t2", is_error: true, content: "denied" }] }, session_id: SID }, { type: "result", subtype: "success", is_error: false, session_id: SID, total_cost_usd: 0.01, permission_denials: [{ tool_name: "Bash" }] }]);
  assert.equal(v.items[0].kind === "tool" && v.items[0].error, true);
  assert.equal(v.items[1].kind === "notice" && v.items[1].tone, "warn");

  v = run([{ type: "result", subtype: "error_during_execution", is_error: true, errors: ["No conversation found with session ID"], session_id: SID }]);
  assert.deepEqual(v.items, [{ kind: "notice", tone: "error", text: "No conversation found with session ID" }]);

  v = run([{ type: "rate_limit_event", rate_limit_info: { status: "rejected", rateLimitType: "five_hour" }, session_id: SID }]);
  assert.equal(v.limit, "five_hour: rejected");
  assert.equal(run([{ type: "rate_limit_event", rate_limit_info: { status: "allowed", rateLimitType: "five_hour" }, session_id: SID }], v).limit, "");

  const same = emptyChat();
  assert.equal(applyChatLine(same, { type: "brand-new-record" }), same, "unknown records change nothing");
  assert.equal(applyChatLine(same, "not an object"), same);
});

test("the process ending closes what is open", () => {
  const open = run([delta("Working"), assistant([{ type: "tool_use", id: "t", name: "Read", input: { file_path: "a.md" } }])]);
  const stopped = applyChatDone(open, { code: null, stderr: "" }, true);
  assert.deepEqual(stopped.items.map((i) => i.kind), ["assistant", "tool", "notice"]);
  assert.ok(stopped.items[0].kind === "assistant" && !stopped.items[0].streaming);
  assert.ok(stopped.items[1].kind === "tool" && stopped.items[1].done);
  const failed = applyChatDone(emptyChat(), { code: 1, stderr: "warning\nInvalid API key · Please run /login\n" }, false);
  assert.deepEqual(failed.items, [{ kind: "notice", tone: "error", text: "warning Invalid API key · Please run /login" }]);
  assert.deepEqual(applyChatDone(emptyChat(), { code: 0, stderr: "noise" }, false).items, []);
});

test("tool labels", () => {
  assert.equal(toolLabel("Bash", { command: "npm\n  test", description: "" }), "Running: npm test");
  assert.equal(toolLabel("Write", { file_path: "/x/y.rs" }), "Writing y.rs");
  assert.equal(toolLabel("mcp__server__do_thing", null), "Using do_thing");
  assert.equal(toolLabel("Agent", { description: "Find files" }), "Subtask: Find files");
});
