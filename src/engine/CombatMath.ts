// ─────────────────────────────────────────────────────────────
// engine/CombatMath.ts
// Combat math: rating conversions, diminishing returns, armor
// mitigation, and combined combat multipliers.
// All constants come from src/data/combatRatings.json.
// ─────────────────────────────────────────────────────────────

import combatRatings from "../data/combatRatings.json";

export type StatName = "crit" | "haste" | "mastery" | "versatility";

// ── Rating → Percent ────────────────────────────────────────

/**
 * Convert a stat rating to a percentage (before DR).
 * @param stat   The stat name.
 * @param rating Raw rating value from gear/buffs.
 * @returns Percentage as a decimal (e.g. 0.25 for 25%).
 */
export function ratingToPercent(stat: StatName, rating: number): number {
  const perPercent = combatRatings.ratingPerPercent[stat];
  if (!perPercent || perPercent === 0) return 0;
  return rating / perPercent / 100;
}

// ── Diminishing Returns ─────────────────────────────────────

/**
 * DR band definition from combatRatings.json.
 */
interface DRBand {
  threshold: number;
  efficiency: number;
}

const drBands: DRBand[] = combatRatings.drBands;

/**
 * Apply piecewise-linear diminishing returns to a stat percentage.
 *
 * Bands (from config):
 *   0%→30%  @ 100% efficiency
 *   30%→39% @ 90%  efficiency
 *   39%→47% @ 80%  efficiency
 *   47%→54% @ 70%  efficiency
 *   54%→66% @ 60%  efficiency
 *   66%→126% @ 50% efficiency
 *
 * @param stat         Stat name (for future per-stat band overrides).
 * @param totalPercent Total percentage as decimal before DR (e.g. 0.35).
 * @returns Percentage after DR as a decimal.
 */
export function applyDR(_stat: StatName, totalPercent: number): number {
  if (totalPercent <= 0) return 0;

  let remaining = totalPercent;
  let result = 0;
  let prevThreshold = 0;

  for (const band of drBands) {
    const bandWidth = band.threshold - prevThreshold;
    if (remaining <= 0) break;

    const consumed = Math.min(remaining, bandWidth);
    result += consumed * band.efficiency;
    remaining -= consumed;
    prevThreshold = band.threshold;
  }

  // Anything beyond the last band threshold uses the last band's efficiency
  if (remaining > 0) {
    const lastBand = drBands[drBands.length - 1];
    result += remaining * lastBand.efficiency;
  }

  return result;
}

// ── Armor Mitigation ────────────────────────────────────────

/**
 * Compute physical damage reduction from armor.
 * Formula: mitigation = armor / (armor + kValue)
 *
 * @param targetArmor The target's armor value.
 * @param kValue      K-constant for boss level. Defaults to config value.
 * @returns Damage reduction as a decimal (e.g. 0.30 for 30% reduction).
 */
export function computeArmorMitigation(
  targetArmor: number,
  kValue: number = combatRatings.armorKValue,
): number {
  if (targetArmor <= 0) return 0;
  return targetArmor / (targetArmor + kValue);
}

// ── Combined Combat Multipliers ─────────────────────────────

/**
 * Player stat snapshot used for multiplier computation.
 */
export interface CombatStats {
  critRating: number;
  hasteRating: number;
  masteryRating: number;
  versRating: number;
  /** Flat crit chance bonus beyond gear (e.g. from talents). */
  critBonusFlat?: number;
  /** Flat haste bonus beyond gear. */
  hasteBonusFlat?: number;
  /** Flat mastery bonus beyond gear. */
  masteryBonusFlat?: number;
  /** Flat versatility bonus beyond gear. */
  versBonusFlat?: number;
}

/**
 * Aura state that modifies combat multipliers.
 */
export interface AuraState {
  /** Multiplicative damage modifiers from active auras (e.g. [1.10, 1.05]). */
  damageMultipliers?: number[];
  /** Flat crit chance bonus from auras. */
  auraCritBonus?: number;
  /** Flat haste bonus from auras. */
  auraHasteBonus?: number;
}

/**
 * Computed combat multipliers — the single canonical source of truth.
 */
export interface CombatMultipliers {
  /** Effective crit chance as decimal (after DR + base + bonuses). */
  critChance: number;
  /** Effective haste multiplier (1 + hastePercent). */
  hasteMult: number;
  /** Effective mastery percentage after DR. */
  masteryPercent: number;
  /** Effective versatility damage multiplier (1 + versPercent). */
  versDamageMult: number;
  /** Effective versatility damage reduction (half of vers%). */
  versDR: number;
  /** Combined multiplicative damage modifier from all auras. */
  auraDamageMult: number;
}

/**
 * Compute all combat multipliers from stats + aura state.
 * This is the SINGLE canonical function for all combat math.
 */
export function computeCombatMultipliers(
  stats: CombatStats,
  auraState: AuraState = {},
): CombatMultipliers {
  // Crit
  const critFromRating = ratingToPercent("crit", stats.critRating);
  const critRaw = combatRatings.baseStats.critBase
    + critFromRating
    + (stats.critBonusFlat ?? 0)
    + (auraState.auraCritBonus ?? 0);
  const critChance = Math.min(1, applyDR("crit", critRaw));

  // Haste
  const hasteFromRating = ratingToPercent("haste", stats.hasteRating);
  const hasteRaw = hasteFromRating
    + (stats.hasteBonusFlat ?? 0)
    + (auraState.auraHasteBonus ?? 0);
  const hastePercent = applyDR("haste", hasteRaw);
  const hasteMult = 1 + hastePercent;

  // Mastery
  const masteryFromRating = ratingToPercent("mastery", stats.masteryRating);
  const masteryRaw = masteryFromRating + (stats.masteryBonusFlat ?? 0);
  const masteryPercent = applyDR("mastery", masteryRaw);

  // Versatility
  const versFromRating = ratingToPercent("versatility", stats.versRating);
  const versRaw = versFromRating + (stats.versBonusFlat ?? 0);
  const versPercent = applyDR("versatility", versRaw);
  const versDamageMult = 1 + versPercent;
  const versDR = versPercent / 2;

  // Aura damage multipliers
  const auraDamageMult = (auraState.damageMultipliers ?? []).reduce(
    (acc, m) => acc * m, 1,
  );

  return {
    critChance,
    hasteMult,
    masteryPercent,
    versDamageMult,
    versDR,
    auraDamageMult,
  };
}
