// ─────────────────────────────────────────────────────────────
// engine/buildSimInput.ts
// THE ONE canonical function that constructs SimInput from UI state.
// TalentPanel, stat weight runner, and talent comparison ALL call this.
//
// DATA FLOW: UI State → buildSimInput → SimWorker → SimLoop → SimResult → UI
// Verified: talents, stats, trinkets, SimOptions all sync correctly
// ─────────────────────────────────────────────────────────────

import type { SimInput, SimConfig, SimOptions, FightStyle, HeroTree } from "./types";
import { gearToPlayerStats } from "./adapters/gearToStats";
import { buildTalentStateFromConfig } from "./adapters/talentsToEngine";
import { getEquippedTrinkets } from "./adapters/trinketsToEngine";
import { DEFAULT_APLS, getDefaultAPLKey } from "./APLEngine";
import { applySimOptions } from "./applySimOptions";
import { DEFAULT_SIM_OPTIONS } from "./simOptionsPresets";

export function buildSimInput(
  hero: HeroTree,
  fightStyle: FightStyle,
  options?: Partial<SimConfig>,
  simOptions?: SimOptions,
): SimInput {
  const isAoe = fightStyle !== "raid_st";
  const talents = buildTalentStateFromConfig(hero, isAoe ? "aoe" : "st");
  const useMythIlvl = options?.features?.useMythIlvl ?? false;
  const baseStats = gearToPlayerStats(hero, useMythIlvl);
  const trinkets = getEquippedTrinkets(hero);

  // Apply advanced options (enchants, gems, consumables, buffs)
  const resolvedOptions = simOptions ?? DEFAULT_SIM_OPTIONS;
  const { stats, buffMults, weaponProc, potionAura } = applySimOptions(baseStats, resolvedOptions, hero);

  const aplKey = getDefaultAPLKey(hero, fightStyle);
  const apl = DEFAULT_APLS[aplKey] ?? "";

  const config: SimConfig = {
    durationMs: fightStyle === "raid_st" ? 300_000
              : fightStyle === "mplus_pull" ? 40_000
              : 180_000,
    durationVariance: 0.2, // ±20% variance like SimC default
    iterations: 1000,
    fightStyle,
    targets: fightStyle === "raid_st" ? 1 : 5,
    bossLevelDelta: 3,
    seed: options?.seed ?? Date.now(),
    hero,
    apl,
    captureTimeline: false,
    timelineDurationMs: 30_000,
    features: {
      prd: true,
      dotSnapshotting: "ap_only",
      multiTarget: fightStyle !== "raid_st",
      useMythIlvl,
    },
    ...options,
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

/**
 * Build a modified SimInput with a stat rating increase for stat weight calculation.
 * Uses same seed for common random numbers.
 */
export function addStatRating(
  base: SimInput,
  stat: "crit" | "haste" | "mastery" | "vers",
  amount: number,
): SimInput {
  const stats = { ...base.stats };
  switch (stat) {
    case "crit": stats.critRating += amount; break;
    case "haste": stats.hasteRating += amount; break;
    case "mastery": stats.masteryRating += amount; break;
    case "vers": stats.versatilityRating += amount; break;
  }
  return { ...base, stats };
}

export function addPrimaryStat(
  base: SimInput,
  _stat: "agility",
  amount: number,
): SimInput {
  const stats = { ...base.stats };
  stats.agility += amount;
  // AP = Agility for hunters; no separate attackPower bump
  return { ...base, stats };
}
