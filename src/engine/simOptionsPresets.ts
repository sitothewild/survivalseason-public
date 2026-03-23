// ─────────────────────────────────────────────────────────────
// engine/simOptionsPresets.ts
// Default SimOptions presets for common scenarios.
// ─────────────────────────────────────────────────────────────

import type { SimOptions } from "./types";

/** Full raid: all buffs, BiS consumables, BiS enchants/gems, augment rune */
export const FULL_RAID_OPTIONS: SimOptions = {
  raidBuffs: {
    battleShout: true,
    markOfTheWild: true,
    mysticTouch: true,
    huntersMark: true,
  },
  phial: "fleeting_magisters",
  food: "silvermoon_parade",
  potion: "lights_potential",
  weaponEnhancement: "thalassian_phoenix_oil",
  augmentRune: true,
  enchants: "auto",
  gems: {
    totalSockets: 6,
    primaryStat: "mastery",
    hasBlasphemite: true,
  },
};

/** M+ casual: most buffs, basic consumables, enchants/gems */
export const MPLUS_CASUAL_OPTIONS: SimOptions = {
  raidBuffs: {
    battleShout: true,
    markOfTheWild: true,
    mysticTouch: false,   // no monk in many groups
    huntersMark: true,
  },
  phial: "fleeting_magisters",
  food: "silvermoon_parade",
  potion: "none",
  weaponEnhancement: "farstrider_oil",
  augmentRune: false,
  enchants: "auto",
  gems: {
    totalSockets: 6,
    primaryStat: "mastery",
    hasBlasphemite: true,
  },
  has2pc: true,
  has4pc: true,
};

/** Naked: no external buffs, no consumables, no enhancements, no tier, no gems/enchants */
export const NAKED_OPTIONS: SimOptions = {
  raidBuffs: {
    battleShout: false,
    markOfTheWild: false,
    mysticTouch: false,
    huntersMark: false,
  },
  phial: "none",
  food: "none",
  potion: "none",
  weaponEnhancement: "none",
  augmentRune: false,
  enchants: {},
  gems: {
    totalSockets: 0,
    primaryStat: "mastery",
    hasBlasphemite: false,
  },
  has2pc: false,
  has4pc: false,
};

/** Default = full raid */
export const DEFAULT_SIM_OPTIONS: SimOptions = FULL_RAID_OPTIONS;

/** Create a copy with specific overrides */
export function createSimOptions(overrides: Partial<SimOptions>): SimOptions {
  return {
    ...FULL_RAID_OPTIONS,
    ...overrides,
    raidBuffs: {
      ...FULL_RAID_OPTIONS.raidBuffs,
      ...(overrides.raidBuffs ?? {}),
    },
    gems: {
      ...FULL_RAID_OPTIONS.gems,
      ...(overrides.gems ?? {}),
    },
  };
}
