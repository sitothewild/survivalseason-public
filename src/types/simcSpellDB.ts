// ─────────────────────────────────────────────────────────────
// SimC Spell Database Types
// Comprehensive spell data extracted from sc_hunter.cpp + Blizzard API
// ─────────────────────────────────────────────────────────────

/** A single spell/talent entry parsed from SimC source */
export interface SimcSpellEntry {
  name: string;
  simcKey: string;
  spellIds: number[];
  type: "active" | "passive" | "buff" | "debuff" | "dot" | "proc" | "mastery";
  section: "class" | "survival" | "sentinel" | "pack_leader" | "dark_ranger" | "tier_set";
  implemented: boolean;
  utility: boolean;
  cooldown?: string;
  charges?: number;
  focusCost?: number;
  focusGain?: number;
  description?: string;
  modifiers: SimcSpellModifier[];
  affectedBy: string[];
  affectsSpells: string[];
  buffData?: SimcBuffInfo;
  procData?: SimcProcInfo;
  notes: string[];
}

/** A damage/stat modifier attached to a spell */
export interface SimcSpellModifier {
  type:
    | "damage_pct"
    | "damage_flat"
    | "cooldown_reduction"
    | "duration_mod"
    | "crit_chance"
    | "crit_damage"
    | "haste"
    | "mastery_scaling"
    | "aoe_targets"
    | "execute_threshold"
    | "proc_chance"
    | "dot_mod"
    | "auto_attack_speed"
    | "focus_regen"
    | "pet_damage";
  /** Numeric value or spell data reference like "effectN(2).percent()" */
  value: number | string;
  effectNum?: number;
  /** Where this modifier comes from (e.g., "talents.tip_of_the_spear_buff") */
  source: string;
  /** Under what condition this modifier applies */
  condition?: string;
}

/** Buff metadata */
export interface SimcBuffInfo {
  duration?: string;
  maxStacks?: number;
  defaultValue?: string;
  refreshBehavior?: "asynchronous" | "disabled" | "duration" | "extend";
  invalidates?: string[];
}

/** Proc metadata */
export interface SimcProcInfo {
  chance: number | string;
  rppm?: boolean;
  triggerSpell?: string;
}

/** Spell implementation details (from struct parsing) */
export interface SimcSpellImpl {
  found: boolean;
  length: number;
  aoeTargets?: number;
  reducedAoeTargets?: number | string;
  focusGain?: number | string;
  tipOfTheSpearInteraction?: boolean;
  tipStacks?: number;
  tipConsumes?: boolean;
  sentinelsMarkInteraction?: boolean;
  consumesSentinelsMark?: boolean;
  triggersLunarStorm?: boolean;
  moonlightChakramInteraction?: boolean;
  bounceEffectNum?: number;
  howlInteraction?: boolean;
  consumesHowl?: boolean;
  triggersHowl?: boolean;
  triggersMongooseFury?: boolean;
  reducesWildfireBombCd?: boolean;
  triggersStrikeAsOne?: boolean;
}

/** Special game mechanics and hardcoded values */
export interface SimcMechanics {
  spiritBondMasteryRefs: number;
  unnaturalCausesExecuteMultiplier?: number;
  unnaturalCausesExecuteThreshold?: string;
  outlandVenomBug?: string;
  apPerAgility: number;
  baseGcd: string;
  baseDistance: { survival: number; ranged: number };
  petApCoefficients?: number[];
  bloodseekerUsesMaxStack: boolean;
  wildfireBombPrimaryTargetBonus: string;
  radiantEdgeStacking?: string;
  furyOfTheWyvernCapEffect?: number;
}

/** Tier set bonus info */
export interface SimcTierSet {
  spec: string;
  tier: string;
  piece: string;
  associatedSpellId?: number;
}

/** The full spell database response from simc-data-sync */
export interface SimcSpellDatabase {
  spellDatabase: Record<string, SimcSpellEntry>;
  spellImplementations: Record<string, SimcSpellImpl>;
  tierSets: Record<string, SimcTierSet>;
  mechanics: SimcMechanics;
  totalSpellEntries: number;
}

/** Full cached response from the edge function */
export interface SimcDataResponse {
  version: string;
  branch: string;
  sha: string;
  fetchedAt: string;
  apl: {
    actionLists?: Record<string, string[]>;
    rawLength?: number;
    error?: string;
  };
  spells: SimcSpellDatabase;
  consumables: Record<string, string>;
  rotationSummary: {
    packLeader: { st: string[]; cleave: string[] };
    sentinel: { st: string[]; cleave: string[] };
    cooldowns: string[];
  };
}

// ─── Helper functions ───────────────────────────────────────

/** Get all survival-only spells from the database */
export function getSurvivalSpells(db: Record<string, SimcSpellEntry>): SimcSpellEntry[] {
  return Object.values(db).filter(s => s.section === "survival" && s.implemented);
}

/** Get all hero talent spells */
export function getHeroTalentSpells(
  db: Record<string, SimcSpellEntry>,
  hero: "sentinel" | "pack_leader"
): SimcSpellEntry[] {
  return Object.values(db).filter(s => s.section === hero && s.implemented);
}

/** Get all spells that modify a given ability */
export function getModifiersFor(
  db: Record<string, SimcSpellEntry>,
  abilityKey: string
): SimcSpellEntry[] {
  return Object.values(db).filter(s =>
    s.affectsSpells.some(a => a.toLowerCase().includes(abilityKey.toLowerCase()))
  );
}

/** Get all spells with proc data */
export function getProcSpells(db: Record<string, SimcSpellEntry>): SimcSpellEntry[] {
  return Object.values(db).filter(s => s.procData != null);
}
