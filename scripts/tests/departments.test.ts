// node --test scripts/tests/  (Node 22.18+ runs TypeScript directly). Part of `npm run check`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { areaTiersFor, departmentOf, isDirector, isEditorTool, normalizeLabel, subagentLabel, venueAreas } from "../../src/office/webview/src/office/engine/departments.ts";

test("every UEHF / CCGS agent has a department", () => {
  const roster = ["accessibility-specialist", "ai-programmer", "analytics-engineer", "art-director", "audio-director", "community-manager", "creative-director", "devops-engineer", "economy-designer", "engine-programmer", "game-designer", "gameplay-programmer", "lead-programmer", "level-designer", "live-ops-designer", "localization-lead", "narrative-director", "network-programmer", "performance-analyst", "producer", "prototyper", "qa-lead", "qa-tester", "release-manager", "security-engineer", "sound-designer", "systems-designer", "technical-artist", "technical-director", "tools-programmer", "ue-blueprint-specialist", "ue-gas-specialist", "ue-replication-specialist", "ue-umg-specialist", "ui-programmer", "unreal-specialist", "ux-designer", "world-builder", "writer", "godot-gdscript-specialist", "unity-dots-specialist", "unity-specialist"];
  for (const a of roster) assert.ok(departmentOf(a), a);
  assert.equal(departmentOf("general-purpose"), null);
  assert.equal(departmentOf(undefined), null);
  assert.equal(departmentOf("ue-gas-specialist")?.id, "engine");
});

test("area labels match departments loosely", () => {
  assert.equal(normalizeLabel("Ban giám đốc"), "bangiamdoc");
  assert.equal(normalizeLabel("Design · 7"), "design");
  const labels = ["Engineering", "Engine lab", "Phòng QA", "Release & ops", "Ban giám đốc", "writer"];
  assert.deepEqual(areaTiersFor("gameplay-programmer", labels, {}), [["Engineering"]]);
  assert.deepEqual(areaTiersFor("ue-umg-specialist", labels, {}), [["Engine lab"]]);
  assert.deepEqual(areaTiersFor("qa-tester", labels, {}), [["Phòng QA"]]);
  assert.deepEqual(areaTiersFor("devops-engineer", labels, {}), [["Release & ops"]]);
  assert.deepEqual(areaTiersFor("producer", labels, {}), [["Ban giám đốc"]]);
  assert.deepEqual(areaTiersFor("Explore", labels, {}), []);
  // Own desk first, then a hand mapping, then the department.
  assert.deepEqual(areaTiersFor("writer", [...labels, "Narrative"], { "agent:writer": ["Engine lab"] }), [["writer"], ["Engine lab"], ["Narrative"]]);
});

test("the studio floor plan has an area for every department", () => {
  const layout = JSON.parse(readFileSync(new URL("../../public/assets/layouts/game-studio.json", import.meta.url), "utf8"));
  const labels = layout.areas.map((a: { label: string }) => a.label);
  for (const t of ["creative-director", "game-designer", "lead-programmer", "unreal-specialist", "art-director", "audio-director", "writer", "qa-lead", "release-manager", "community-manager"]) {
    assert.equal(areaTiersFor(t, labels, {}).length, 1, t);
  }
});

test("the video studio floor plan has an area for every video department", () => {
  const layout = JSON.parse(readFileSync(new URL("../../public/assets/layouts/video-studio.json", import.meta.url), "utf8"));
  const labels = layout.areas.map((a: { label: string }) => a.label);
  const seats: Record<string, string> = { showrunner: "Ban sản xuất", scriptwriter: "Script room", "video-editor": "Editing bay", "thumbnail-designer": "Motion & graphics", "voice-over-artist": "Audio booth", "seo-specialist": "Publishing & SEO", "retention-analyst": "Analytics" };
  for (const [agent, area] of Object.entries(seats)) assert.deepEqual(areaTiersFor(agent, labels, {}), [[area]], agent);
  assert.equal(venueAreas("meeting", labels).length, 1);
  assert.equal(venueAreas("lounge", labels).length, 1);
  assert.ok(isDirector("showrunner"), "video leadership meets in the meeting room");
  // A game agent has no desk here, a video agent none in the game studio: they stay at Studio head.
  assert.deepEqual(areaTiersFor("gameplay-programmer", labels, {}), []);
  const game = JSON.parse(readFileSync(new URL("../../public/assets/layouts/game-studio.json", import.meta.url), "utf8")).areas.map((a: { label: string }) => a.label);
  assert.deepEqual(areaTiersFor("video-editor", game, {}), []);
  assert.deepEqual(areaTiersFor("sound-designer", game, {}), [["Audio"]], "game audio keeps its room");
});

test("sub-agent labels", () => {
  assert.equal(subagentLabel("qa-lead", "Review"), "qa-lead · Review");
  assert.equal(subagentLabel("general-purpose", "Review"), "Review");
  assert.equal(subagentLabel(undefined, ""), "");
});

test("venues: meeting room and editor desk", () => {
  const labels = ["Phòng họp", "Editor desk", "Engine lab"];
  assert.deepEqual(venueAreas("meeting", labels), ["Phòng họp"]);
  assert.deepEqual(venueAreas("editor", labels), ["Editor desk"]);
  assert.deepEqual(venueAreas("editor", ["Unreal editor"]), ["Unreal editor"]);
  assert.deepEqual(venueAreas("lounge", ["Lounge", "Phòng nghỉ", "QA"]), ["Lounge", "Phòng nghỉ"]);
  assert.ok(isDirector("producer") && isDirector("technical-director"));
  assert.ok(!isDirector("qa-lead") && !isDirector(undefined));
  assert.ok(isEditorTool("mcp__unreal-mcp__call_tool"));
  assert.ok(isEditorTool("mcp__unity_mcp__run_tests"));
  assert.ok(!isEditorTool("mcp__unreal-mcp__list_toolsets"), "listing does not touch the editor");
  assert.ok(!isEditorTool("mcp__unreal-mcp__describe_toolset"));
  assert.ok(!isEditorTool("mcp__plugin_desktop-commander_desktop-commander__read_file"));
  assert.ok(!isEditorTool("Edit") && !isEditorTool(null));
});

test("the studio floor plan has the meeting room and the editor desk", () => {
  const layout = JSON.parse(readFileSync(new URL("../../public/assets/layouts/game-studio.json", import.meta.url), "utf8"));
  const labels = layout.areas.map((a: { label: string }) => a.label);
  assert.equal(venueAreas("meeting", labels).length, 1);
  assert.equal(venueAreas("editor", labels).length, 1);
  assert.equal(venueAreas("lounge", labels).length, 1);
});
