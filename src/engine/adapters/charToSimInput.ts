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
import { getEquippedTrinkets, getTrinketById } from "./trinketsToEngine";
import { DEFAULT_APLS, getDefaultAPLKey } from "../APLEngine";
import { applySimOptions } from "../applySimOptions";
import { DEFAULT_SIM_OPTIONS } from "../simOptionsPresets";
import { COMBAT_RATINGS } from "../simcSpellData";

// ── Midnight S1 Hunter Tier Set (Primal Sentry's Camouflage) ──
// Item IDs for the 5-piece set. Detecting these from equipped gear
// lets us auto-determine has2pc/has4pc instead of a manual toggle.
const TIER_SET_ITEM_IDS = new Set([
  249988, // Head  — Primal Sentry's Maw
  249986, // Shoulders — Primal Sentry's Trophies
  249991, // Chest — Primal Sentry's Scaleplate
  249989, // Hands — Primal Sentry's Talonguards
  249987, // Legs  — Primal Sentry's Legguards
]);

/**
 * Count how many tier set pieces are equipped from parsed gear.
 * Returns { has2pc, has4pc, tierCount }.
 */
export function detectTierSet(gear?: ParsedCharData["gear"]): {
  has2pc: boolean;
  has4pc: boolean;
  tierCount: number;
} {
  if (!gear || gear.length === 0) return { has2pc: false, has4pc: false, tierCount: 0 };

  let count = 0;
  for (const item of gear) {
    if (item.itemId) {
      const id = typeof item.itemId === "string" ? parseInt(item.itemId, 10) : item.itemId;
      if (!isNaN(id) && TIER_SET_ITEM_IDS.has(id)) count++;
    }
  }

  return { has2pc: count >= 2, has4pc: count >= 4, tierCount: count };
}

// Rating constants derived from simcSpellData COMBAT_RATINGS.
// Mastery uses a special conversion: the parser gives Spirit Bond % (e.g. 29.64%),
// but conversion to rating is non-linear due to base points. Use 28.1 as approximate
// rating-per-1%-Spirit-Bond for the parser's percentage → rating reverse conversion.
const RATING_PER_PCT = {
  crit: COMBAT_RATINGS.crit,
  haste: COMBAT_RATINGS.haste,
  mastery: 28.1,   // Approximate: converts mastery% → rating for parser percentages
  versatility: COMBAT_RATINGS.versatility,
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
 * Looks up trinket1/trinket2 itemIds in the MIDNIGHT_TRINKETS database.
 * Falls back to default BiS trinkets for any slot not matched.
 */
function resolveTrinkets(
  hero: HeroTree,
  gear?: ParsedCharData["gear"],
): [EquippedTrinket, EquippedTrinket] {
  const defaults = getEquippedTrinkets(hero);
  if (!gear || gear.length === 0) return defaults;

  // Find trinket slots from gear
  const trinketSlots = gear.filter(g =>
    g.slot === "trinket1" || g.slot === "trinket2" || g.slot === "trinket",
  );

  const resolved: [EquippedTrinket, EquippedTrinket] = [defaults[0], defaults[1]];
  let idx = 0;
  for (const slot of trinketSlots) {
    if (idx >= 2) break;
    if (slot.itemId) {
      const id = typeof slot.itemId === "string" ? parseInt(slot.itemId, 10) : slot.itemId;
      if (!isNaN(id)) {
        const trinket = getTrinketById(id);
        if (trinket) {
          resolved[idx] = trinket;
        }
      }
    }
    idx++;
  }

  return resolved;
}

/**
 * Convert parsedChar + UI options into a complete SimInput.
 *
 * @param char       Parsed character data from Armory/SimC import
 * @param hero       Selected hero talent tree
 * @param targets    Number of targets
 * @param durationS  Fight duration in seconds
 * @param simOptions Advanced sim options (buffs, consumables, gems, enchants)
 * @param opts       Additional config overrides (captureTimeline, iterations)
 */
export function charToSimInput(
  char: ParsedCharData,
  hero: HeroTree,
  targets: number,
  durationS: number,
  simOptions?: SimOptions,
  opts?: { captureTimeline?: boolean; iterations?: number; customAPL?: string },
): SimInput {
  const s = char.stats;

  // Convert parsed percentages back to raw ratings
  const baseStats: PlayerStats = {
    agility: s.agility || 1500,
    stamina: Math.round((s.agility || 1500) * 0.9),
    attackPower: 0, // AP = Agility for hunters; bonus AP from buffs applied later
    critRating: percentToRating(s.crit || 0, "crit"),
    hasteRating: percentToRating(s.haste || 0, "haste"),
    masteryRating: percentToRating(s.mastery || 0, "mastery"),
    versatilityRating: percentToRating(s.versatility || 0, "versatility"),
    weapon: {
      type: "2h",
      mainHandDps: 420,
      mainHandSpeed: 3.6,
    },
    // Tier: use SimOptions toggle (which is auto-synced from gear in the UI)
    has2pc: simOptions?.has2pc ?? detectTierSet(char.gear).has2pc,
    has4pc: simOptions?.has4pc ?? detectTierSet(char.gear).has4pc,
  };

  // Determine fight style from targets
  const fightStyle: FightStyle = targets <= 1
    ? "raid_st"
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
  const apl = opts?.customAPL ?? DEFAULT_APLS[aplKey] ?? "";

  const config: SimConfig = {
    durationMs: durationS * 1000,
    iterations: opts?.iterations ?? 500,
    fightStyle,
    targets,
    bossLevelDelta: 3,
    seed: Date.now(),
    hero,
    apl,
    captureTimeline: opts?.captureTimeline ?? false,
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
