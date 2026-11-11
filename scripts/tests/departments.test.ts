// node --test scripts/tests/  (Node 22.18+ runs TypeScript directly). Part of `npm run check`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { areaTiersFor, briefer, departmentOf, directorAreas, isDirector, isEditorTool, normalizeLabel, subagentLabel, tierOf, venueAreas } from "../../src/office/webview/src/office/engine/departments.ts";

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

const GAME_THEMES = ["game-campus.json", "game-open.json"];
const areasOf = (file: string): string[] => JSON.parse(readFileSync(new URL(`../../public/assets/layouts/${file}`, import.meta.url), "utf8")).areas.map((a: { label: string }) => a.label);

test("both game studio themes have an area for every department", () => {
  for (const file of GAME_THEMES) {
  const labels = areasOf(file);
  for (const t of ["creative-director", "game-designer", "lead-programmer", "unreal-specialist", "art-director", "audio-director", "writer", "qa-lead", "release-manager", "community-manager"]) {
    assert.equal(areaTiersFor(t, labels, {}).length, 1, `${file} ${t}`);
  }
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
  const game = areasOf("game-campus.json");
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

test("both game themes have the meeting room, the editor desk, a Pantry and the directors' room", () => {
  for (const file of GAME_THEMES) {
    const labels = areasOf(file);
    assert.equal(venueAreas("meeting", labels).length, 1, file);
    assert.equal(venueAreas("editor", labels).length, 1, file);
    assert.deepEqual(venueAreas("lounge", labels), ["Pantry"], file);
    assert.deepEqual(directorAreas(labels), ["Ban giám đốc"], file);
  }
  assert.deepEqual(directorAreas(areasOf("video-studio.json")), ["Ban sản xuất"]);
});

test("ranks and who briefs a new sub-agent", () => {
  assert.equal(tierOf("technical-director"), 1);
  assert.equal(tierOf("lead-programmer"), 2);
  assert.equal(tierOf("qa-lead"), 2);
  assert.equal(tierOf("gameplay-programmer"), 3);
  assert.equal(tierOf("general-purpose"), null);
  const lp = { tier: 2, dept: "engineering" };
  const td = { tier: 1, dept: "directors" };
  const gp = { tier: 3, dept: "engineering" };
  // A specialist: its own lead first, else a director; a lead: a director; nobody briefs a director.
  assert.equal(briefer(gp, [td, lp]), 1);
  assert.equal(briefer(gp, [td, { tier: 2, dept: "qa" }]), 0);
  assert.equal(briefer(lp, [td, lp]), 0);
  assert.equal(briefer(td, [{ tier: 1, dept: null }]), -1);
  assert.equal(briefer({ tier: null, dept: null }, [td]), -1, "general-purpose is not briefed");
  assert.equal(briefer(gp, []), -1);
});

test("themed rooms keep their department after a '·'", () => {
  const labels = ["Robin's Room · Art", "Trophy Hall · Pantry", "Briefing Platform · Phòng họp", "Bat-Family Council · Ban giám đốc", "Armory", "Lucius' Workshop · Engineering"];
  assert.deepEqual(areaTiersFor("technical-artist", labels, {}), [["Robin's Room · Art"]]);
  assert.deepEqual(areaTiersFor("gameplay-programmer", labels, {}), [["Lucius' Workshop · Engineering"]]);
  assert.deepEqual(venueAreas("lounge", labels), ["Trophy Hall · Pantry"]);
  assert.deepEqual(venueAreas("meeting", labels), ["Briefing Platform · Phòng họp"]);
  assert.deepEqual(directorAreas(labels), ["Bat-Family Council · Ban giám đốc"]);
  // A plain label that only contains a department word is not that department.
  assert.deepEqual(areaTiersFor("technical-artist", ["Armory", "Artemis"], {}), []);
});
