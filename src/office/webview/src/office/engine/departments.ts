// PrimeOffice addition (not upstream pixel-agents, see docs/UPSTREAM_PATCHES.md).
//
// Studio departments for sub-agents. A Claude Code Game Studios project (UEHF_Studio, its games,
// CustomClaudeCodeStudio) spawns sub-agents by type (`gameplay-programmer`, `qa-lead`, …). The office
// seats each one in an Area whose label names its department ("Engineering", "QA", "Phòng QA" …),
// so the floor shows which department is at work. Pure functions: no imports, testable with node.

export interface Department {
  id: string;
  /** Area labels that mean this department, compared with `normalizeLabel`. */
  aliases: string[];
  /** Agent types in this department. */
  agents: string[];
}

export const DEPARTMENTS: Department[] = [
  {
    id: 'directors',
    aliases: ['directors', 'director', 'leadership', 'ban giam doc', 'giam doc'],
    agents: ['creative-director', 'technical-director', 'producer'],
  },
  {
    id: 'design',
    aliases: ['design', 'game design', 'thiet ke'],
    agents: [
      'game-designer',
      'systems-designer',
      'level-designer',
      'economy-designer',
      'ux-designer',
      'prototyper',
      'live-ops-designer',
    ],
  },
  {
    id: 'engineering',
    aliases: ['engineering', 'programming', 'lap trinh', 'ky thuat'],
    agents: [
      'lead-programmer',
      'gameplay-programmer',
      'engine-programmer',
      'ai-programmer',
      'network-programmer',
      'tools-programmer',
      'ui-programmer',
      'security-engineer',
    ],
  },
  {
    id: 'engine',
    aliases: ['engine', 'engine lab', 'unreal', 'unreal lab', 'unity', 'unity lab', 'godot', 'godot lab'],
    // Plus every `ue-*`, `unity-*` and `godot-*` specialist (see `departmentOf`).
    agents: ['unreal-specialist', 'unity-specialist', 'godot-specialist'],
  },
  {
    id: 'art',
    aliases: ['art', 'art studio', 'tech art', 'my thuat'],
    agents: ['art-director', 'technical-artist'],
  },
  {
    id: 'audio',
    aliases: ['audio', 'sound', 'sound booth', 'am thanh'],
    agents: ['audio-director', 'sound-designer'],
  },
  {
    id: 'narrative',
    aliases: ['narrative', 'writers room', 'writing', 'cot truyen'],
    agents: ['narrative-director', 'writer', 'world-builder'],
  },
  {
    id: 'qa',
    aliases: ['qa', 'quality', 'test', 'testing', 'kiem thu'],
    agents: ['qa-lead', 'qa-tester', 'accessibility-specialist', 'performance-analyst'],
  },
  {
    id: 'release',
    aliases: ['release', 'release ops', 'release and ops', 'ops', 'devops', 'build room', 'phat hanh'],
    agents: ['release-manager', 'devops-engineer', 'analytics-engineer'],
  },
  {
    id: 'community',
    aliases: [
      'community',
      'localization',
      'loc community',
      'loc and community',
      'localization community',
      'cong dong',
    ],
    agents: ['localization-lead', 'community-manager'],
  },
];

const ENGINE_PREFIXES = ['ue-', 'unity-', 'godot-'];

/**
 * Compare form of an Area label: lower case, no accents (đ → d), only letters and digits, a trailing
 * count dropped ("Design · 7" → "design", "Release & ops" → "releaseops", "Phòng QA" stays "phongqa").
 */
export function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '')
    .replace(/\d+$/, '');
}

/** The department of an agent type, or null (built-in agents such as `general-purpose`, `Explore`). */
export function departmentOf(agentType: string | undefined): Department | null {
  if (!agentType) return null;
  const t = agentType.toLowerCase();
  const direct = DEPARTMENTS.find((d) => d.agents.includes(t));
  if (direct) return direct;
  if (ENGINE_PREFIXES.some((p) => t.startsWith(p))) {
    return DEPARTMENTS.find((d) => d.id === 'engine') ?? null;
  }
  return null;
}

/**
 * Area labels a sub-agent of `agentType` should sit in, best first:
 *   1. an Area named after the agent itself ("gameplay-programmer": its own desk),
 *   2. Areas mapped to it by hand (`areaMappings['agent:<type>']`),
 *   3. Areas whose label names its department, with or without a "Phòng" / "Room" / "Dept" word.
 * Each tier is a list; empty tiers are dropped. Empty result = no department Area in this layout.
 */
export function areaTiersFor(
  agentType: string | undefined,
  areaLabels: string[],
  areaMappings: Record<string, string[]>,
): string[][] {
  if (!agentType) return [];
  const t = agentType.toLowerCase();
  const own = areaLabels.filter((l) => normalizeLabel(l) === normalizeLabel(t));
  const mapped = (areaMappings[`agent:${t}`] ?? []).filter((l) => areaLabels.includes(l));
  const dept = departmentOf(t);
  const wanted = new Set(dept ? dept.aliases.map(normalizeLabel) : []);
  const strip = (n: string) => n.replace(/^(phong|room|dept|department|khu)/, '').replace(/(room|dept|department)$/, '');
  const inDept = dept
    ? areaLabels.filter((l) => {
        const n = normalizeLabel(l);
        return wanted.has(n) || wanted.has(strip(n));
      })
    : [];
  return [own, mapped, inDept].filter((tier) => tier.length > 0);
}

/**
 * Shared rooms an agent visits for a while, then leaves for its own desk again:
 *   meeting — directors meet there when two or more of them work at the same time (director gates);
 *   editor  — the engine editor desk: an engine MCP call (Unreal MCP takes one call at a time);
 *   lounge  — a main session whose turn is done rests there until it works again.
 */
export type Venue = 'meeting' | 'editor' | 'lounge';

const VENUE_ALIASES: Record<Venue, string[]> = {
  meeting: ['meeting', 'meeting room', 'phong hop', 'hop', 'gate room'],
  editor: ['editor', 'editor desk', 'unreal editor', 'unity editor', 'godot editor', 'ban editor'],
  lounge: ['lounge', 'break room', 'pantry', 'phong nghi', 'nghi ngoi'],
};

/** Area labels of a venue in this layout. */
export function venueAreas(venue: Venue, areaLabels: string[]): string[] {
  const wanted = new Set(VENUE_ALIASES[venue].map(normalizeLabel));
  return areaLabels.filter((l) => wanted.has(normalizeLabel(l)));
}

/** Directors (tier 1): they gather in the meeting room. */
export function isDirector(agentType: string | undefined): boolean {
  return departmentOf(agentType)?.id === 'directors';
}

/**
 * A call into an engine editor through its MCP server (`mcp__unreal-mcp__call_tool`, …). Listing and
 * describing toolsets does not touch the editor, so it does not count.
 */
export function isEditorTool(tool: string | null | undefined): boolean {
  if (!tool) return false;
  const m = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/i.exec(tool);
  if (!m) return false;
  return /unreal|unity|godot/i.test(m[1]) && !/^(list|describe)_toolsets?$/i.test(m[2]);
}

/** Text over a sub-agent: its type and what it was asked to do. */
export function subagentLabel(agentType: string | undefined, description: string): string {
  const type = agentType && agentType !== 'general-purpose' ? agentType : '';
  if (type && description) return `${type} · ${description}`;
  return type || description;
}
