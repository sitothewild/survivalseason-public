// ─────────────────────────────────────────────────────────────
// engine/__tests__/simOptions.test.ts
// Tests for the Advanced Options (SimOptions) system.
// Verifies enchant/gem/consumable/buff stat injection,
// damage multipliers, potion auras, weapon procs, and presets.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { applySimOptions, type ApplyResult } from "../applySimOptions";
import {
  FULL_RAID_OPTIONS,
  MPLUS_CASUAL_OPTIONS,
  NAKED_OPTIONS,
  createSimOptions,
} from "../simOptionsPresets";
import {
  PHIALS,
  FOOD_BUFFS,
  POTIONS,
  WEAPON_ENHANCEMENTS,
  AUGMENT_RUNES,
  calcGemStats,
} from "../consumables";
import { buildSimInput } from "../buildSimInput";
import { runSimulation } from "../SimLoop";
import type { PlayerStats, SimOptions } from "../types";

// ── Helpers ────────────────────────────────────────────────

function makeBaseStats(): PlayerStats {
  return {
    agility: 10000,
    stamina: 8000,
    attackPower: 10000,
    critRating: 3000,
    hasteRating: 2000,
    masteryRating: 4000,
    versatilityRating: 1500,
    weapon: { type: "2h", mainHandDps: 420, mainHandSpeed: 3.6 },
    has2pc: true,
    has4pc: true,
  };
}

// ── calcGemStats ──────────────────────────────────────────

describe("calcGemStats", () => {
  it("returns zero stats for 0 sockets", () => {
    const result = calcGemStats(0, "crit", true);
    expect(result.crit).toBe(0);
    expect(result.haste).toBe(0);
    expect(result.mastery).toBe(0);
    expect(result.vers).toBe(0);
  });

  it("calculates Blasphemite bonus correctly", () => {
    const result = calcGemStats(6, "mastery", true);
    // 6 sockets × 6 per stat = 36 each
    expect(result.crit).toBe(36);
    expect(result.haste).toBe(36);
    expect(result.vers).toBe(36);
    // mastery also gets fill gems: 5 × 88 = 440 + 36 = 476
    expect(result.mastery).toBe(36 + 5 * 88);
  });

  it("works without Blasphemite", () => {
    const result = calcGemStats(6, "crit", false);
    // No blasphemite bonus, all 6 sockets are crit gems
    expect(result.crit).toBe(6 * 88);
    expect(result.haste).toBe(0);
    expect(result.mastery).toBe(0);
    expect(result.vers).toBe(0);
  });
});

// ── applySimOptions ─────────────────────────────────────────

describe("applySimOptions", () => {
  it("injects enchant stats for auto sentinel", () => {
    const base = makeBaseStats();
    const options: SimOptions = {
      ...NAKED_OPTIONS,
      enchants: "auto",
    };

    const before = { ...base };
    const result = applySimOptions(base, options, "sentinel");

    // Auto enchants should add stats above baseline
    const totalSecondaries =
      result.stats.critRating + result.stats.hasteRating +
      result.stats.masteryRating + result.stats.versatilityRating;
    const baseSecondaries =
      before.critRating + before.hasteRating +
      before.masteryRating + before.versatilityRating;

    expect(totalSecondaries).toBeGreaterThan(baseSecondaries);
  });

  it("injects gem stats", () => {
    const base = makeBaseStats();
    const options: SimOptions = {
      ...NAKED_OPTIONS,
      gems: { totalSockets: 6, primaryStat: "mastery", hasBlasphemite: true },
    };

    const result = applySimOptions(base, options, "sentinel");
    // Mastery should increase by fill gems + blasphemite
    expect(result.stats.masteryRating).toBeGreaterThan(base.masteryRating);
    // Other stats get blasphemite bonus
    expect(result.stats.critRating).toBeGreaterThan(base.critRating);
  });

  it("injects phial stats (Fleeting Magisters)", () => {
    const base = makeBaseStats();
    const options: SimOptions = {
      ...NAKED_OPTIONS,
      phial: "fleeting_magisters",
    };

    const result = applySimOptions(base, options, "sentinel");
    // Proc-based: should add ~143 crit, ~143 haste, ~143 mastery
    expect(result.stats.critRating).toBeGreaterThan(base.critRating);
    expect(result.stats.hasteRating).toBeGreaterThan(base.hasteRating);
    expect(result.stats.masteryRating).toBeGreaterThan(base.masteryRating);
  });

  it("injects phial stats (Fleeting Determination = flat agi)", () => {
    const base = makeBaseStats();
    const noPhial = applySimOptions(base, { ...NAKED_OPTIONS, phial: "none" }, "sentinel");
    const withPhial = applySimOptions(base, { ...NAKED_OPTIONS, phial: "fleeting_determination" }, "sentinel");

    expect(withPhial.stats.agility).toBe(noPhial.stats.agility + 360);
    expect(withPhial.stats.attackPower).toBeGreaterThan(noPhial.stats.attackPower);
  });

  it("injects food stats", () => {
    const base = makeBaseStats();
    const noFood = applySimOptions(base, { ...NAKED_OPTIONS, food: "none" }, "sentinel");
    const withFood = applySimOptions(base, { ...NAKED_OPTIONS, food: "silvermoon_parade" }, "sentinel");

    expect(withFood.stats.masteryRating).toBe(noFood.stats.masteryRating + 90);
  });

  it("injects weapon enhancement flat stat", () => {
    const base = makeBaseStats();
    const noEnh = applySimOptions(base, { ...NAKED_OPTIONS, weaponEnhancement: "none" }, "sentinel");
    const withEnh = applySimOptions(base, { ...NAKED_OPTIONS, weaponEnhancement: "silvermoon_whetstone" }, "sentinel");

    expect(withEnh.stats.critRating).toBe(noEnh.stats.critRating + 168);
  });

  it("returns weapon proc for damage proc enhancement", () => {
    const base = makeBaseStats();
    const options: SimOptions = {
      ...NAKED_OPTIONS,
      weaponEnhancement: "thalassian_phoenix_oil",
    };

    const result = applySimOptions(base, options, "sentinel");
    expect(result.weaponProc).toBeDefined();
    expect(result.weaponProc!.dmgApCoef).toBe(0.35);
    expect(result.weaponProc!.dmgCPM).toBe(9.0);
    expect(result.weaponProc!.school).toBe("fire");
  });

  it("injects augment rune stats", () => {
    const base = makeBaseStats();
    const noRune = applySimOptions(base, { ...NAKED_OPTIONS, augmentRune: false }, "sentinel");
    const withRune = applySimOptions(base, { ...NAKED_OPTIONS, augmentRune: true }, "sentinel");

    expect(withRune.stats.agility).toBe(noRune.stats.agility + 52);
    expect(withRune.stats.attackPower).toBeGreaterThan(noRune.stats.attackPower);
  });

  it("resolves raid buff multipliers", () => {
    const base = makeBaseStats();
    const result = applySimOptions(base, FULL_RAID_OPTIONS, "sentinel");

    // Battle Shout: 1.05 AP mult
    expect(result.buffMults.apMult).toBeCloseTo(1.05);
    // Mystic Touch (1.05) × Hunter's Mark (1.05) = 1.1025
    expect(result.buffMults.dmgMult).toBeCloseTo(1.1025);
    // Mark of the Wild: +3% vers
    expect(result.buffMults.versPctBonus).toBeCloseTo(3.0);
  });

  it("returns potion aura for Light's Potential", () => {
    const base = makeBaseStats();
    const options: SimOptions = {
      ...NAKED_OPTIONS,
      potion: "lights_potential",
    };

    const result = applySimOptions(base, options, "sentinel");
    expect(result.potionAura).toBeDefined();
    expect(result.potionAura!.stat).toBe("agi");
    expect(result.potionAura!.amount).toBe(3648);
    expect(result.potionAura!.durationMs).toBe(30000);
  });

  it("does not mutate original stats", () => {
    const base = makeBaseStats();
    const origAgi = base.agility;
    applySimOptions(base, FULL_RAID_OPTIONS, "sentinel");
    expect(base.agility).toBe(origAgi);
  });

  it("naked options add no buffs or consumable stats", () => {
    const base = makeBaseStats();
    // Naked still has auto enchants and gems, so only check buffs
    const result = applySimOptions(base, NAKED_OPTIONS, "sentinel");
    expect(result.buffMults.apMult).toBe(1.0);
    expect(result.buffMults.dmgMult).toBe(1.0);
    expect(result.buffMults.versPctBonus).toBe(0);
    expect(result.potionAura).toBeUndefined();
    expect(result.weaponProc).toBeUndefined();
  });
});

// ── Presets ─────────────────────────────────────────────────

describe("SimOptions Presets", () => {
  it("FULL_RAID has all buffs enabled", () => {
    expect(FULL_RAID_OPTIONS.raidBuffs.battleShout).toBe(true);
    expect(FULL_RAID_OPTIONS.raidBuffs.markOfTheWild).toBe(true);
    expect(FULL_RAID_OPTIONS.raidBuffs.mysticTouch).toBe(true);
    expect(FULL_RAID_OPTIONS.raidBuffs.huntersMark).toBe(true);
    expect(FULL_RAID_OPTIONS.augmentRune).toBe(true);
  });

  it("MPLUS_CASUAL has no mystic touch", () => {
    expect(MPLUS_CASUAL_OPTIONS.raidBuffs.mysticTouch).toBe(false);
    expect(MPLUS_CASUAL_OPTIONS.potion).toBe("none");
  });

  it("NAKED has everything off", () => {
    expect(NAKED_OPTIONS.raidBuffs.battleShout).toBe(false);
    expect(NAKED_OPTIONS.phial).toBe("none");
    expect(NAKED_OPTIONS.food).toBe("none");
    expect(NAKED_OPTIONS.potion).toBe("none");
    expect(NAKED_OPTIONS.weaponEnhancement).toBe("none");
    expect(NAKED_OPTIONS.augmentRune).toBe(false);
  });

  it("createSimOptions merges overrides", () => {
    const custom = createSimOptions({
      potion: "none",
      raidBuffs: { battleShout: false, markOfTheWild: true, mysticTouch: true, huntersMark: true },
    });
    expect(custom.potion).toBe("none");
    expect(custom.raidBuffs.battleShout).toBe(false);
    // Rest should be from FULL_RAID
    expect(custom.phial).toBe("fleeting_magisters");
  });
});

// ── Consumable Data ─────────────────────────────────────────

describe("Consumable Data", () => {
  it("has phial definitions", () => {
    expect(PHIALS.length).toBeGreaterThanOrEqual(2);
    const magisters = PHIALS.find(p => p.key === "fleeting_magisters");
    expect(magisters).toBeDefined();
    expect(magisters!.isProcBased).toBe(true);
  });

  it("has food definitions", () => {
    expect(FOOD_BUFFS.length).toBeGreaterThanOrEqual(3);
    const mastery = FOOD_BUFFS.find(f => f.key === "silvermoon_parade");
    expect(mastery).toBeDefined();
    expect(mastery!.ratingAmount).toBe(90);
  });

  it("has potion definitions", () => {
    expect(POTIONS.length).toBeGreaterThanOrEqual(1);
    const pot = POTIONS.find(p => p.key === "lights_potential");
    expect(pot).toBeDefined();
    expect(pot!.ratingAmount).toBe(3648);
    expect(pot!.durationSec).toBe(30);
  });

  it("has weapon enhancement definitions", () => {
    expect(WEAPON_ENHANCEMENTS.length).toBeGreaterThanOrEqual(3);
    const phoenix = WEAPON_ENHANCEMENTS.find(w => w.key === "thalassian_phoenix_oil");
    expect(phoenix).toBeDefined();
    expect(phoenix!.type).toBe("damage_proc");
  });

  it("has augment rune definitions", () => {
    expect(AUGMENT_RUNES.length).toBeGreaterThanOrEqual(1);
    expect(AUGMENT_RUNES[0].ratingAmount).toBe(52);
  });
});

// ── Integration: Full sim with options ──────────────────────

describe("SimOptions Integration", () => {
  it("full raid options produce higher DPS than naked", () => {
    const seed = 42;
    const nakedInput = buildSimInput("sentinel", "raid_st", { seed, iterations: 100 }, NAKED_OPTIONS);
    const raidInput = buildSimInput("sentinel", "raid_st", { seed, iterations: 100 }, FULL_RAID_OPTIONS);

    const nakedResult = runSimulation(nakedInput);
    const raidResult = runSimulation(raidInput);

    // Full raid should be significantly higher
    expect(raidResult.meanDps).toBeGreaterThan(nakedResult.meanDps);
    // Expect at least 10% difference from all the buffs/consumables
    const pctIncrease = (raidResult.meanDps - nakedResult.meanDps) / nakedResult.meanDps;
    expect(pctIncrease).toBeGreaterThan(0.10);
  });

  it("weapon proc enhancement shows weapon_enhancement in breakdown", () => {
    const input = buildSimInput(
      "sentinel",
      "raid_st",
      { seed: 42, iterations: 200 },
      createSimOptions({ weaponEnhancement: "amani_poison" }),
    );

    const result = runSimulation(input);
    const weaponEntry = result.breakdown.find(b => b.key === "weapon_enhancement");
    expect(weaponEntry).toBeDefined();
    expect(weaponEntry!.dps).toBeGreaterThan(0);
  });

  it("potion shows stat increase in early fight DPS", () => {
    // With potion: sim should have slightly higher DPS than without
    const seed = 123;
    const withPot = buildSimInput(
      "sentinel",
      "raid_st",
      { seed, iterations: 200 },
      createSimOptions({ potion: "lights_potential" }),
    );
    const noPot = buildSimInput(
      "sentinel",
      "raid_st",
      { seed, iterations: 200 },
      createSimOptions({ potion: "none" }),
    );

    const withPotResult = runSimulation(withPot);
    const noPotResult = runSimulation(noPot);

    expect(withPotResult.meanDps).toBeGreaterThan(noPotResult.meanDps);
  });

  it("buildSimInput passes simOptions through", () => {
    const input = buildSimInput("sentinel", "raid_st", {}, FULL_RAID_OPTIONS);
    expect(input.simOptions).toBeDefined();
    expect(input.buffMults).toBeDefined();
    expect(input.buffMults!.dmgMult).toBeGreaterThan(1.0);
  });
});
