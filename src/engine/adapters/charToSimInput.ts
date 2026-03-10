// ─────────────────────────────────────────────────────────────
// engine/adapters/charToSimInput.ts
// Converts parsedChar (from Armory / SimC import) + SimOptions
// into a complete SimInput for the event-driven SimLoop.
// ─────────────────────────────────────────────────────────────

import type {
  SimInput, SimConfig, SimOptions, PlayerStats,
  HeroTree, FightStyle, EquippedTrinket,
} from "../types";
import { buildTalentStateFromConfig } from "./talentsToEngine";
import { getEquippedTrinkets } from "./trinketsToEngine";
import { DEFAULT_APLS, getDefaultAPLKey } from "../APLEngine";
import { applySimOptions } from "../applySimOptions";
import { DEFAULT_SIM_OPTIONS } from "../simOptionsPresets";

// Rating constants matching combatRatings.json & parseSimcString()
const RATING_PER_PCT = {
  crit: 170,      // parseSimcString uses 170 (simpler than 180 in combatRatings)
  haste: 170,
  mastery: 170,
  versatility: 205,
};

/**
 * Parsed character shape from the UI (Armory or SimC import).
 * This matches the object produced by parseSimcString() / handleArmoryLookup().
 */
export interface ParsedCharData {
  character?: {
    name?: string;
    level?: number;
    race?: string;
    spec?: string;
    avgIlvl?: number;
  };
  stats: {
    agility: number;
    haste: number;        // percentage (e.g. 10.58 = 10.58%)
    crit: number;         // percentage
    mastery: number;      // percentage
    versatility: number;  // percentage
    attackPower: number;
  };
  gear?: Array<{
    slot: string;
    ilvl: number;
    itemId?: string | null;
    name: string;
    enchant?: string | null;
    gemId?: string | null;
  }>;
  talents?: string | null;
  valid?: boolean;
}

/**
 * Convert parsedChar stat percentages back to raw rating values.
 * parseSimcString divides by RATING_PER_PCT; we reverse that here.
 */
function percentToRating(pct: number, stat: keyof typeof RATING_PER_PCT): number {
  if (stat === "versatility") {
    // parseSimcString: vers = rating / 205 * 100, so rating = vers * 205 / 100
    return Math.round(pct * RATING_PER_PCT.versatility / 100);
  }
  // Other stats: rating = pct * ratingPerPct
  return Math.round(pct * RATING_PER_PCT[stat]);
}

/**
 * Extract trinket data from parsed gear if available.
 * Falls back to default BiS trinkets.
 */
function resolveTrinkets(
  hero: HeroTree,
  _gear?: ParsedCharData["gear"],
): [EquippedTrinket, EquippedTrinket] {
  // TODO: Parse trinket IDs from gear and look up proc data.
  // For now, use the default BiS trinkets from the engine.
  return getEquippedTrinkets(hero);
}

/**
 * Convert parsedChar + UI options into a complete SimInput.
 *
 * @param char       Parsed character data from Armory/SimC import
 * @param hero       Selected hero talent tree
 * @param targets    Number of targets
 * @param durationS  Fight duration in seconds
 * @param simOptions Advanced sim options (buffs, consumables, gems, enchants)
 */
export function charToSimInput(
  char: ParsedCharData,
  hero: HeroTree,
  targets: number,
  durationS: number,
  simOptions?: SimOptions,
): SimInput {
  const s = char.stats;

  // Convert parsed percentages back to raw ratings
  const baseStats: PlayerStats = {
    agility: s.agility || 1500,
    stamina: Math.round((s.agility || 1500) * 0.9),
    attackPower: s.attackPower || Math.round((s.agility || 1500) * 1.05),
    critRating: percentToRating(s.crit || 0, "crit"),
    hasteRating: percentToRating(s.haste || 0, "haste"),
    masteryRating: percentToRating(s.mastery || 0, "mastery"),
    versatilityRating: percentToRating(s.versatility || 0, "versatility"),
    weapon: {
      type: "2h",
      mainHandDps: 420,
      mainHandSpeed: 3.6,
    },
    has2pc: simOptions?.has2pc ?? true,
    has4pc: simOptions?.has4pc ?? true,
  };

  // Determine fight style from targets
  const fightStyle: FightStyle = targets <= 1
    ? "raid_st"
    : targets <= 3
      ? "raid_cleave"
      : "mplus_pull";

  const isAoe = targets > 1;
  const talents = buildTalentStateFromConfig(hero, isAoe ? "aoe" : "st");
  const trinkets = resolveTrinkets(hero, char.gear);

  // Apply advanced options (enchants, gems, consumables, buffs)
  const resolvedOptions = simOptions ?? DEFAULT_SIM_OPTIONS;
  const { stats, buffMults, weaponProc, potionAura } = applySimOptions(
    baseStats,
    resolvedOptions,
    hero,
  );

  const aplKey = getDefaultAPLKey(hero, fightStyle);
  const apl = DEFAULT_APLS[aplKey] ?? "";

  const config: SimConfig = {
    durationMs: durationS * 1000,
    iterations: 500,   // Balance speed vs accuracy for UI
    fightStyle,
    targets,
    bossLevelDelta: 3,
    seed: Date.now(),
    hero,
    apl,
    captureTimeline: false,
    timelineDurationMs: 30_000,
    features: {
      prd: true,
      dotSnapshotting: "ap_only",
      multiTarget: targets > 1,
      useMythIlvl: false,
    },
  };

  return {
    config,
    stats,
    talents,
    trinkets,
    simOptions: resolvedOptions,
    buffMults,
    weaponProc,
    potionAura,
  };
}
