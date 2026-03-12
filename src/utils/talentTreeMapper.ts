// ─────────────────────────────────────────────────────────────
// talentTreeMapper.ts
// Maps Blizzard API talent tree data → internal MappedTalentNode[]
// Uses display_row / display_col from the API as the authoritative
// grid positions — no re-indexing or estimation.
// ─────────────────────────────────────────────────────────────

import type {
  BlizzardTalentTreeResponse,
  BlizzardTalentNode,
  MappedTalentNode,
  ChoiceOption,
  TreeSection,
} from "@/types/talentTreeTypes";

import { applySurvivalSubstitutions } from "@/utils/survivalSpellSubstitutions";

import {
  HUNTER_TREE_ID,
  SURVIVAL_SPEC_ID,
  SENTINEL_HERO_ID,
  PACK_LEADER_HERO_ID,
} from "@/types/talentTreeTypes";

// ─── BLIZZARD API CLIENT PATCH ──────────────────────────────

export function getSurvivalTalentTreeUrl(
  region: string = "us",
  namespace: string = "static-us"
): string {
  return `https://${region}.api.blizzard.com/data/wow/talent-tree/${HUNTER_TREE_ID}/playable-specialization/${SURVIVAL_SPEC_ID}?namespace=${namespace}&locale=en_US`;
}

// ─── CORE MAPPER ────────────────────────────────────────────

export function mapTalentTree(response: BlizzardTalentTreeResponse): {
  classNodes: MappedTalentNode[];
  specNodes: MappedTalentNode[];
  sentinelNodes: MappedTalentNode[];
  packLeaderNodes: MappedTalentNode[];
} {
  if (response.id !== HUNTER_TREE_ID) {
    console.warn(
      `[talentTreeMapper] Expected tree ID ${HUNTER_TREE_ID}, got ${response.id}.`
    );
  }

  const classNodes = mapNodeSection(response.class_talent_nodes, "class");
  const specNodes = mapNodeSection(response.spec_talent_nodes, "spec");

  const sentinelTree = response.hero_talent_trees.find(
    (ht) => ht.id === SENTINEL_HERO_ID
  );
  const packLeaderTree = response.hero_talent_trees.find(
    (ht) => ht.id === PACK_LEADER_HERO_ID
  );

  const sentinelNodes = sentinelTree
    ? mapNodeSection(sentinelTree.hero_talent_nodes, "hero")
    : [];
  const packLeaderNodes = packLeaderTree
    ? mapNodeSection(packLeaderTree.hero_talent_nodes, "hero")
    : [];

  return { classNodes, specNodes, sentinelNodes, packLeaderNodes };
}

// ─── SECTION MAPPER ─────────────────────────────────────────

function mapNodeSection(
  apiNodes: BlizzardTalentNode[],
  section: TreeSection
): MappedTalentNode[] {
  if (!apiNodes || apiNodes.length === 0) return [];

  return apiNodes.map((apiNode) => mapSingleNode(apiNode, section));
}

// ─── SINGLE NODE MAPPER ─────────────────────────────────────

function mapSingleNode(
  apiNode: BlizzardTalentNode,
  section: TreeSection
): MappedTalentNode {
  const nodeType = normalizeNodeType(apiNode.node_type.type);
  const maxRank = apiNode.ranks.length;
  const primaryRank = apiNode.ranks[0];

  let name = "Unknown";
  let spellId = 0;
  let talentId = 0;

  if (nodeType === "choice" && primaryRank?.choice_of_tooltips?.length) {
    const first = primaryRank.choice_of_tooltips[0];
    name = first.talent.name;
    spellId = first.spell_tooltip.spell.id;
    talentId = first.talent.id;
  } else if (primaryRank?.tooltip) {
    name = primaryRank.tooltip.talent.name;
    spellId = primaryRank.tooltip.spell_tooltip.spell.id;
    talentId = primaryRank.tooltip.talent.id;
  }

  let choiceOptions: ChoiceOption[] | undefined;
  if (nodeType === "choice" && primaryRank?.choice_of_tooltips) {
    choiceOptions = primaryRank.choice_of_tooltips.map((tt) => ({
      talentId: tt.talent.id,
      spellId: tt.spell_tooltip.spell.id,
      name: tt.talent.name,
      description: applySurvivalSubstitutions(tt.spell_tooltip.description),
    }));
  }

  // Use display_row and display_col directly from the API — no re-indexing
  return {
    nodeId: apiNode.id,
    displayRow: apiNode.display_row,
    displayCol: apiNode.display_col,
    name,
    spellId,
    talentId,
    nodeType,
    maxRank,
    section,
    choiceOptions,
    lockedBy: apiNode.locked_by ?? [],
    unlocks: apiNode.unlocks ?? [],
    gridRow: apiNode.display_row,  // same as displayRow — authoritative API value
    gridCol: apiNode.display_col,  // same as displayCol — authoritative API value
  };
}

function normalizeNodeType(
  apiType: string
): "active" | "passive" | "choice" | "selection" {
  switch (apiType.toUpperCase()) {
    case "ACTIVE": return "active";
    case "PASSIVE": return "passive";
    case "CHOICE": return "choice";
    case "SELECTION": return "selection";
    default:
      console.warn(`[talentTreeMapper] Unknown node type: ${apiType}`);
      return "passive";
  }
}

// ─── CHOICE NODE UTILITIES ──────────────────────────────────

export function getChoiceNodes(nodes: MappedTalentNode[]): MappedTalentNode[] {
  return nodes.filter((n) => n.nodeType === "choice" && n.choiceOptions?.length);
}

export function buildChoiceNodeMap(
  nodes: MappedTalentNode[]
): Map<number, { nodeId: number; optionA: ChoiceOption; optionB: ChoiceOption }> {
  const map = new Map();
  for (const node of getChoiceNodes(nodes)) {
    if (node.choiceOptions && node.choiceOptions.length >= 2) {
      map.set(node.nodeId, {
        nodeId: node.nodeId,
        optionA: node.choiceOptions[0],
        optionB: node.choiceOptions[1],
      });
    }
  }
  return map;
}

// ─── GATE / RESTRICTION UTILITIES ───────────────────────────

/**
 * Converts restriction_lines into gate objects.
 * restricted_row is the API's display_row value for the first locked row.
 * We return { points, restrictedRow } using the raw API row value.
 */
export function getGateRows(
  restrictionLines: { required_points: number; restricted_row: number; is_for_class: boolean }[]
): { classGates: { points: number; row: number }[]; specGates: { points: number; row: number }[] } {
  const classGates: { points: number; row: number }[] = [];
  const specGates: { points: number; row: number }[] = [];

  for (const line of restrictionLines) {
    const gate = { points: line.required_points, row: line.restricted_row };
    if (line.is_for_class) {
      classGates.push(gate);
    } else {
      specGates.push(gate);
    }
  }

  return {
    classGates: classGates.sort((a, b) => a.row - b.row),
    specGates: specGates.sort((a, b) => a.row - b.row),
  };
}

// ─── REACT STATE INITIALIZER ────────────────────────────────

export function createInitialTalentState(
  nodes: MappedTalentNode[]
): Record<number, number> {
  const state: Record<number, number> = {};
  for (const node of nodes) state[node.nodeId] = 0;
  return state;
}

export function createInitialChoiceState(
  nodes: MappedTalentNode[]
): Record<number, number | null> {
  const state: Record<number, number | null> = {};
  for (const node of getChoiceNodes(nodes)) {
    state[node.nodeId] = null;
  }
  return state;
}

// ─── DEBUG / VALIDATION ─────────────────────────────────────

export function debugPrintTree(
  nodes: MappedTalentNode[],
  label: string
): void {
  console.group(`🌲 ${label} Tree Layout`);

  const byRow = new Map<number, MappedTalentNode[]>();
  for (const n of nodes) {
    if (!byRow.has(n.displayRow)) byRow.set(n.displayRow, []);
    byRow.get(n.displayRow)!.push(n);
  }

  const sortedRows = [...byRow.keys()].sort((a, b) => a - b);
  for (const row of sortedRows) {
    const rowNodes = byRow.get(row)!.sort((a, b) => a.displayCol - b.displayCol);
    const names = rowNodes.map((n) => {
      const suffix =
        n.nodeType === "choice"
          ? ` [${n.choiceOptions?.map((o) => o.name).join(" | ")}]`
          : "";
      return `col${n.displayCol}:${n.name}${suffix}`;
    });
    console.log(`  Row ${row}: ${names.join("  ·  ")}`);
  }

  console.groupEnd();
}
