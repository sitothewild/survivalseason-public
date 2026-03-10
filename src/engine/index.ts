// ─────────────────────────────────────────────────────────────
// engine/index.ts — Public API barrel export
// ─────────────────────────────────────────────────────────────

// Core types
export type {
  SimInput,
  SimResult,
  SimConfig,
  SimOptions,
  ResolvedBuffMultipliers,
  PlayerStats,
  TalentState,
  EquippedTrinket,
  FightStyle,
  HeroTree,
  AbilityBreakdown,
  TimelineEvent,
  StatWeightResult,
  ChoiceSelections,
} from "./types";

// Engine primitives
export { RNG, hash64 } from "./RNG";
export { EventQueue, EventPriority } from "./EventQueue";
export { FocusModel } from "./FocusModel";
export { createPRDState, rollPRD, getCValue } from "./PRD";
export {
  ratingToPercent,
  applyDR,
  computeArmorMitigation,
  computeCombatMultipliers,
} from "./CombatMath";

// Spell & DoT data
export { SPELL_DB, DOT_DB, AOE_RULES } from "./SpellDB";

// Combat state
export { CombatState, CooldownTracker, DamageBreakdown } from "./CombatState";

// APL
export { parseAPL, evaluateAPL, DEFAULT_APLS, getDefaultAPLKey } from "./APLEngine";

// Sim loop
export { runSimulation } from "./SimLoop";

// Builder
export { buildSimInput, addStatRating, addPrimaryStat } from "./buildSimInput";

// Advanced Options
export { applySimOptions } from "./applySimOptions";
export {
  DEFAULT_SIM_OPTIONS,
  FULL_RAID_OPTIONS,
  MPLUS_CASUAL_OPTIONS,
  NAKED_OPTIONS,
  createSimOptions,
} from "./simOptionsPresets";

// Consumable data
export {
  PHIALS,
  FOOD_BUFFS,
  POTIONS,
  WEAPON_ENHANCEMENTS,
  AUGMENT_RUNES,
  RAID_BUFFS,
  calcEnchantStats,
  calcGemStats,
} from "./consumables";

// Worker pool
export { WorkerPool, getWorkerPool } from "./WorkerPool";

// Adapters
export { gearToPlayerStats } from "./adapters/gearToStats";
export { buildTalentState, buildTalentStateFromConfig } from "./adapters/talentsToEngine";
export { getEquippedTrinkets, getTrinketById } from "./adapters/trinketsToEngine";
