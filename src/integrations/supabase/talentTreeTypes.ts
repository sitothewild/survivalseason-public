// ─────────────────────────────────────────────────────────────
// Blizzard API Talent Tree Types — Hunter (Tree 774) / Survival (Spec 255)
// Hero Trees: Sentinel (42), Pack Leader (43)
// ─────────────────────────────────────────────────────────────

/** Raw Blizzard API response from:
 *  GET /data/wow/talent-tree/774/playable-specialization/255
 *      ?namespace=static-{version}&locale=en_US
 */
export interface BlizzardTalentTreeResponse {
  _links: { self: { href: string } };
  id: number; // 774 for Hunter
  playable_class: { id: number; name: string }; // 3, "Hunter"
  playable_specialization: { id: number; name: string }; // 255, "Survival"
  class_talent_nodes: BlizzardTalentNode[];
  spec_talent_nodes: BlizzardTalentNode[];
  hero_talent_trees: BlizzardHeroTalentTree[];
  restriction_lines: BlizzardRestrictionLine[];
}

export interface BlizzardHeroTalentTree {
  id: number; // 42 = Sentinel, 43 = Pack Leader
  name: string;
  hero_talent_nodes: BlizzardTalentNode[];
}

export interface BlizzardTalentNode {
  id: number;
  display_row: number;
  display_col: number;
  raw_position_x: number;
  raw_position_y: number;
  node_type: {
    id: number;
    type: "ACTIVE" | "PASSIVE" | "CHOICE" | "SELECTION";
  };
  locked_by: number[]; // node IDs that gate this node
  unlocks: number[]; // node IDs this node unlocks
  ranks: BlizzardTalentRank[];
  default_points?: number; // auto-learned nodes
}

export interface BlizzardTalentRank {
  rank: number;
  tooltip?: BlizzardTalentTooltip;
  choice_of_tooltips?: BlizzardTalentTooltip[]; // CHOICE nodes have 2+ here
}

export interface BlizzardTalentTooltip {
  talent: {
    id: number;
    key: { href: string };
    name: string;
  };
  spell_tooltip: {
    spell: {
      id: number;
      key: { href: string };
      name: string;
    };
    description: string;
    cast_time?: string;
    cooldown?: string;
    range?: string;
    power_cost?: string;
  };
}

export interface BlizzardRestrictionLine {
  required_points: number;
  restricted_row: number;
  is_for_class: boolean;
}

// ─── MAPPED / INTERNAL TYPES ─────────────────────────────────

export type TreeSection = "class" | "spec" | "hero";

export interface MappedTalentNode {
  // Blizzard identifiers
  nodeId: number;
  displayRow: number;
  displayCol: number;

  // Resolved info
  name: string; // Primary talent name
  spellId: number; // Primary spell ID
  talentId: number; // Blizzard talent ID (for talent string encoding)
  nodeType: "active" | "passive" | "choice" | "selection";
  maxRank: number;
  section: TreeSection;

  // For choice nodes — both options
  choiceOptions?: ChoiceOption[];

  // Gate/dependency info
  lockedBy: number[];
  unlocks: number[];
  gateRow?: number; // if this node is behind a gate, which row is it

  // HTML grid mapping
  gridRow: number; // 0-indexed row in our HTML layout
  gridCol: number; // 0-indexed col within that row
}

export interface ChoiceOption {
  talentId: number;
  spellId: number;
  name: string;
  description: string;
  icon?: string; // spell icon slug if we fetch it later
}

// ─── LAYOUT CONFIG ───────────────────────────────────────────

/** The user-specified row node counts for each tree.
 *  Used to validate API mapping against the HTML template. */
export const HUNTER_CLASS_ROW_COUNTS = [3, 3, 4, 3, 5, 7, 3, 7, 6, 3] as const;
export const SURVIVAL_SPEC_ROW_COUNTS = [1, 2, 2, 3, 5, 4, 6, 3, 4, 5] as const;
// Survival also has an apex capstone with 3 tier dots below row 10
export const SENTINEL_HERO_ROW_COUNTS = [1, 4, 4, 4, 1] as const;
export const PACK_LEADER_HERO_ROW_COUNTS = [1, 4, 4, 4, 1] as const;

/** Known IDs — single source of truth */
export const HUNTER_TREE_ID = 774; // NOT 786
export const SURVIVAL_SPEC_ID = 255;
export const SENTINEL_HERO_ID = 42;
export const PACK_LEADER_HERO_ID = 43;
