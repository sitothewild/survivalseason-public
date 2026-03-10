// ─────────────────────────────────────────────────────────────────────────────
// Talent Tree Types
// Re-exports Blizzard API types and defines local UI types shared across
// talentTreeMapper, useTalentTreeData, TalentNode, TalentTreeGrid, TalentPanel.
// ─────────────────────────────────────────────────────────────────────────────

export type {
  BzSpellTooltip,
  BzEntry,
  BzTalentNode,
  BzSpecTree,
  BzHeroTree,
  TalentTreeFullResponse,
} from "@/lib/blizzardApi";

/** One side of a choice node (left = entryA, right = entryB). */
export interface ChoiceEntry {
  spellId: number;
  name: string;
  /** Maps to TalentConfig key when this side is active. */
  key?: string;
}

/**
 * Named layout node — positions from the HTML reference files.
 * spellId = 0 means "unknown; resolve from live API by name-match".
 */
export interface LayoutNode {
  id: string;
  spellId: number;
  name: string;
  type: "active" | "passive" | "choice" | "apex";
  maxPts: number;
  row: number;
  col: number;
  entryA?: ChoiceEntry;  // only for type === "choice"
  entryB?: ChoiceEntry;
  autoSelected?: boolean;
  capstone?: boolean;
  /** TalentConfig key override when spell name → key derivation isn't obvious. */
  talentKey?: string;
}

/** Data shown in the hover tooltip over a talent node. */
export interface TooltipInfo {
  name: string;
  description: string;
  rank?: number;
  maxRank?: number;
}

/** Hero tree identifier used at runtime. */
export type HeroKey = "sentinel" | "packLeader";
