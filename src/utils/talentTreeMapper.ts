// ─────────────────────────────────────────────────────────────
// talentTreeMapper.ts
// Maps Blizzard API talent tree data → internal MappedTalentNode[]
// Handles: tree ID fix (774), display_row/col → grid mapping,
//          choice node wiring, gate detection
// ─────────────────────────────────────────────────────────────

import type {
  BlizzardTalentTreeResponse,
  BlizzardTalentNode,
  BlizzardTalentRank,
  MappedTalentNode,
  ChoiceOption,
  TreeSection,
} from "../types/talentTreeTypes";

import {
  HUNTER_TREE_ID,
  SURVIVAL_SPEC_ID,
  SENTINEL_HERO_ID,
  PACK_LEADER_HERO_ID,
  HUNTER_CLASS_ROW_COUNTS,
  SURVIVAL_SPEC_ROW_COUNTS,
  SENTINEL_HERO_ROW_COUNTS,
  PACK_LEADER_HERO_ROW_COUNTS,
} from "../types/talentTreeTypes";

// ─── BLIZZARD API CLIENT PATCH ──────────────────────────────

/** Returns the CORRECT talent tree URL for Survival Hunter.
 *  Drop-in replacement for any call currently using tree 786. */
export function getSurvivalTalentTreeUrl(
  region: string = "us",
  namespace: string = "static-us"
): string {
  return `https://${region}.api.blizzard.com/data/wow/talent-tree/${HUNTER_TREE_ID}/playable-specialization/${SURVIVAL_SPEC_ID}?namespace=${namespace}&locale=en_US`;
}

// ─── CORE MAPPER ────────────────────────────────────────────

/**
 * Takes the raw Blizzard talent tree response and returns
 * three arrays of MappedTalentNode (class, spec, hero).
 */
export function mapTalentTree(response: BlizzardTalentTreeResponse): {
  classNodes: MappedTalentNode[];
  specNodes: MappedTalentNode[];
  sentinelNodes: MappedTalentNode[];
  packLeaderNodes: MappedTalentNode[];
} {
  // Validate tree ID
  if (response.id !== HUNTER_TREE_ID) {
    console.warn(
      `[talentTreeMapper] Expected tree ID ${HUNTER_TREE_ID}, got ${response.id}. ` +
      `Make sure blizzardApiClient.ts uses tree 774, not 786.`
    );
  }

  const classNodes = mapNodeSection(
    response.class_talent_nodes,
    "class",
    HUNTER_CLASS_ROW_COUNTS
  );

  const specNodes = mapNodeSection(
    response.spec_talent_nodes,
    "spec",
    SURVIVAL_SPEC_ROW_COUNTS
  );

  const sentinelTree = response.hero_talent_trees.find(
    (ht) => ht.id === SENTINEL_HERO_ID
  );
  const packLeaderTree = response.hero_talent_trees.find(
    (ht) => ht.id === PACK_LEADER_HERO_ID
  );

  const sentinelNodes = sentinelTree
    ? mapNodeSection(sentinelTree.hero_talent_nodes, "hero", SENTINEL_HERO_ROW_COUNTS)
    : [];

  const packLeaderNodes = packLeaderTree
    ? mapNodeSection(packLeaderTree.hero_talent_nodes, "hero", PACK_LEADER_HERO_ROW_COUNTS)
    : [];

  return { classNodes, specNodes, sentinelNodes, packLeaderNodes };
}

// ─── SECTION MAPPER ─────────────────────────────────────────

function mapNodeSection(
  apiNodes: BlizzardTalentNode[],
  section: TreeSection,
  expectedRowCounts: readonly number[]
): MappedTalentNode[] {
  if (!apiNodes || apiNodes.length === 0) return [];

  // Step 1: Group nodes by display_row
  const rowMap = new Map<number, BlizzardTalentNode[]>();
  for (const node of apiNodes) {
    const row = node.display_row;
    if (!rowMap.has(row)) rowMap.set(row, []);
    rowMap.get(row)!.push(node);
  }

  // Step 2: Sort row keys and establish mapping from API rows → grid rows
  const sortedApiRows = [...rowMap.keys()].sort((a, b) => a - b);

  // Build the row index map: API display_row → 0-indexed grid row
  const apiRowToGridRow = new Map<number, number>();
  sortedApiRows.forEach((apiRow, idx) => {
    apiRowToGridRow.set(apiRow, idx);
  });

  // Step 3: Validate row counts match our HTML template
  if (sortedApiRows.length !== expectedRowCounts.length) {
    console.warn(
      `[talentTreeMapper] ${section} tree: API has ${sortedApiRows.length} rows, ` +
      `HTML template expects ${expectedRowCounts.length} rows. ` +
      `Rows from API: [${sortedApiRows.map((r) => rowMap.get(r)!.length).join(",")}] ` +
      `Expected: [${expectedRowCounts.join(",")}]`
    );
  }

  // Step 4: Map each node
  const mapped: MappedTalentNode[] = [];

  for (const [apiRow, nodesInRow] of rowMap) {
    // Sort nodes within a row by display_col (left to right)
    nodesInRow.sort((a, b) => a.display_col - b.display_col);

    const gridRow = apiRowToGridRow.get(apiRow)!;

    nodesInRow.forEach((apiNode, colIdx) => {
      mapped.push(mapSingleNode(apiNode, section, gridRow, colIdx));
    });
  }

  return mapped;
}

// ─── SINGLE NODE MAPPER ─────────────────────────────────────

function mapSingleNode(
  apiNode: BlizzardTalentNode,
  section: TreeSection,
  gridRow: number,
  gridCol: number
): MappedTalentNode {
  const nodeType = normalizeNodeType(apiNode.node_type.type);
  const maxRank = apiNode.ranks.length;
  const primaryRank = apiNode.ranks[0];

  // Extract primary talent info
  let name = "Unknown";
  let spellId = 0;
  let talentId = 0;

  if (nodeType === "choice" && primaryRank?.choice_of_tooltips?.length) {
    // For choice nodes, primary = first choice option
    const first = primaryRank.choice_of_tooltips[0];
    name = first.talent.name;
    spellId = first.spell_tooltip.spell.id;
    talentId = first.talent.id;
  } else if (primaryRank?.tooltip) {
    name = primaryRank.tooltip.talent.name;
    spellId = primaryRank.tooltip.spell_tooltip.spell.id;
    talentId = primaryRank.tooltip.talent.id;
  }

  // Extract choice options if applicable
  let choiceOptions: ChoiceOption[] | undefined;
  if (nodeType === "choice" && primaryRank?.choice_of_tooltips) {
    choiceOptions = primaryRank.choice_of_tooltips.map((tt) => ({
      talentId: tt.talent.id,
      spellId: tt.spell_tooltip.spell.id,
      name: tt.talent.name,
      description: tt.spell_tooltip.description,
    }));
  }

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
    gridRow,
    gridCol,
  };
}

function normalizeNodeType(
  apiType: string
): "active" | "passive" | "choice" | "selection" {
  switch (apiType.toUpperCase()) {
    case "ACTIVE":
      return "active";
    case "PASSIVE":
      return "passive";
    case "CHOICE":
      return "choice";
    case "SELECTION":
      return "selection"; // hero tree selection nodes
    default:
      console.warn(`[talentTreeMapper] Unknown node type: ${apiType}`);
      return "passive";
  }
}

// ─── CHOICE NODE UTILITIES ──────────────────────────────────

/** Returns only choice nodes from a mapped array */
export function getChoiceNodes(nodes: MappedTalentNode[]): MappedTalentNode[] {
  return nodes.filter((n) => n.nodeType === "choice" && n.choiceOptions?.length);
}

/** Builds a lookup: nodeId → { optionA, optionB } for React state */
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

/** Given restriction_lines from the API, returns which grid rows are gated */
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

/** Creates the initial talent state object: { [nodeId]: 0 } for every node */
export function createInitialTalentState(
  nodes: MappedTalentNode[]
): Record<number, number> {
  const state: Record<number, number> = {};
  for (const node of nodes) {
    state[node.nodeId] = node.nodeType === "selection" ? 0 : 0;
  }
  return state;
}

/** Creates initial choice state: { [nodeId]: null } — null means no choice made */
export function createInitialChoiceState(
  nodes: MappedTalentNode[]
): Record<number, number | null> {
  const state: Record<number, number | null> = {};
  for (const node of getChoiceNodes(nodes)) {
    state[node.nodeId] = null; // no option selected yet
  }
  return state;
}

// ─── DEBUG / VALIDATION ─────────────────────────────────────

/** Prints a readable grid of the mapped tree for verification */
export function debugPrintTree(
  nodes: MappedTalentNode[],
  label: string
): void {
  console.group(`🌲 ${label} Tree Layout`);

  const byRow = new Map<number, MappedTalentNode[]>();
  for (const n of nodes) {
    if (!byRow.has(n.gridRow)) byRow.set(n.gridRow, []);
    byRow.get(n.gridRow)!.push(n);
  }

  const sortedRows = [...byRow.keys()].sort((a, b) => a - b);
  for (const row of sortedRows) {
    const rowNodes = byRow.get(row)!.sort((a, b) => a.gridCol - b.gridCol);
    const names = rowNodes.map((n) => {
      const suffix =
        n.nodeType === "choice"
          ? ` [${n.choiceOptions?.map((o) => o.name).join(" | ")}]`
          : "";
      return `${n.name}${suffix}`;
    });
    console.log(`  Row ${row}: ${names.join("  ·  ")}`);
  }

  console.groupEnd();
}
