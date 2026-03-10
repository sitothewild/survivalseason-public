// ─────────────────────────────────────────────────────────────
// Tests for charToSimInput adapter and simResultToLegacy adapter
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { charToSimInput, type ParsedCharData } from "../adapters/charToSimInput";
import { simResultToLegacy } from "../adapters/simResultToLegacy";
import { runSimulation } from "../SimLoop";
import { FULL_RAID_OPTIONS, NAKED_OPTIONS } from "../simOptionsPresets";

const SAMPLE_CHAR: ParsedCharData = {
  character: { name: "TestHunter", level: 90, spec: "survival" },
  stats: {
    agility: 1635,
    haste: 10.0,    // 10% = 1700 rating
    crit: 19.0,     // 19% = 3230 rating
    mastery: 25.0,  // 25% = 4250 rating
    versatility: 5.0, // 5% = rating / 205 * 100, so rating = 1025
    attackPower: 1717,
  },
  gear: [],
  talents: null,
};

describe("charToSimInput", () => {
  it("converts parsedChar stats to raw ratings (enchants/gems may add on top)", () => {
    const input = charToSimInput(SAMPLE_CHAR, "sentinel", 1, 300, FULL_RAID_OPTIONS);
    // Base hasteRating = 10.0 * 170 = 1700, plus enchants/gems
    expect(input.stats.hasteRating).toBeGreaterThan(1600);
    // Base critRating = 19.0 * 170 = 3230, plus enchants/gems
    expect(input.stats.critRating).toBeGreaterThan(3000);
    // Base masteryRating = 25.0 * 170 = 4250, plus enchants/gems
    expect(input.stats.masteryRating).toBeGreaterThan(4000);
    // Base versatilityRating = 5.0 * 205 / 100 ≈ 10, plus enchants
    expect(input.stats.versatilityRating).toBeGreaterThanOrEqual(10);
    // Agility from parsed char
    expect(input.stats.agility).toBeGreaterThanOrEqual(1635);
  });

  it("sets config from parameters", () => {
    const input = charToSimInput(SAMPLE_CHAR, "sentinel", 1, 300);
    expect(input.config.durationMs).toBe(300_000);
    expect(input.config.targets).toBe(1);
    expect(input.config.hero).toBe("sentinel");
    expect(input.config.fightStyle).toBe("raid_st");
  });

  it("sets multi-target config", () => {
    const input = charToSimInput(SAMPLE_CHAR, "packLeader", 5, 180);
    expect(input.config.durationMs).toBe(180_000);
    expect(input.config.targets).toBe(5);
    expect(input.config.fightStyle).toBe("mplus_pull");
    expect(input.talents.hero).toBe("packLeader");
  });

  it("applies SimOptions", () => {
    const input = charToSimInput(SAMPLE_CHAR, "sentinel", 1, 300, FULL_RAID_OPTIONS);
    // Full raid should have buffMults
    expect(input.buffMults).toBeDefined();
    expect(input.buffMults!.dmgMult).toBeGreaterThan(1);
  });

  it("propagates has2pc/has4pc from SimOptions", () => {
    const noTier = charToSimInput(SAMPLE_CHAR, "sentinel", 1, 300, {
      ...FULL_RAID_OPTIONS,
      has2pc: false,
      has4pc: false,
    });
    expect(noTier.stats.has2pc).toBe(false);
    expect(noTier.stats.has4pc).toBe(false);
  });
});

describe("simResultToLegacy", () => {
  it("converts engine SimResult to legacy shape", () => {
    const input = charToSimInput(SAMPLE_CHAR, "sentinel", 1, 300, FULL_RAID_OPTIONS);
    const engineResult = runSimulation(input);

    const legacy = simResultToLegacy(engineResult, "sentinel", 1, 300);

    expect(legacy.totalDps).toBeGreaterThan(0);
    expect(legacy.targets).toBe(1);
    expect(legacy.duration).toBe(300);
    expect(legacy.hero).toBe("sentinel");
    expect(legacy.build).toBe("st");
    expect(typeof legacy.breakdown).toBe("object");
    expect(Object.keys(legacy.breakdown).length).toBeGreaterThan(0);
    // breakdown values should be DPS numbers
    for (const val of Object.values(legacy.breakdown)) {
      expect(typeof val).toBe("number");
      expect(val).toBeGreaterThanOrEqual(0);
    }
  });

  it("has detailed actionCounts matching breakdown", () => {
    const input = charToSimInput(SAMPLE_CHAR, "sentinel", 1, 300, FULL_RAID_OPTIONS);
    const engineResult = runSimulation(input);
    const legacy = simResultToLegacy(engineResult, "sentinel", 1, 300);

    const breakdownKeys = Object.keys(legacy.breakdown);
    const actionKeys = Object.keys(legacy.detailed.actionCounts);
    expect(actionKeys.length).toBe(breakdownKeys.length);

    for (const key of breakdownKeys) {
      expect(legacy.detailed.actionCounts[key]).toBeDefined();
      expect(legacy.detailed.actionCounts[key].dps).toBe(legacy.breakdown[key]);
    }
  });

  it("has correct buffUptimes for hero tree", () => {
    const input = charToSimInput(SAMPLE_CHAR, "packLeader", 1, 300, FULL_RAID_OPTIONS);
    const engineResult = runSimulation(input);
    const legacy = simResultToLegacy(engineResult, "packLeader", 1, 300);

    expect(legacy.detailed.buffUptimes["Pack Leader Beasts"]).toBeDefined();
    expect(legacy.detailed.buffUptimes["Sentinel Mark"]).toBeUndefined();
  });
});

describe("End-to-end: charToSimInput → SimLoop → simResultToLegacy", () => {
  it("produces reasonable DPS from sample character", () => {
    const input = charToSimInput(SAMPLE_CHAR, "sentinel", 1, 300, FULL_RAID_OPTIONS);
    const engineResult = runSimulation(input);
    const legacy = simResultToLegacy(engineResult, "sentinel", 1, 300);

    // DPS should be in a reasonable range for the stats given
    expect(legacy.totalDps).toBeGreaterThan(5_000);
    expect(legacy.totalDps).toBeLessThan(200_000);
  });

  it("naked options produce less DPS than full raid", () => {
    const fullInput = charToSimInput(SAMPLE_CHAR, "sentinel", 1, 300, FULL_RAID_OPTIONS);
    const nakedInput = charToSimInput(SAMPLE_CHAR, "sentinel", 1, 300, NAKED_OPTIONS);

    const fullResult = runSimulation(fullInput);
    const nakedResult = runSimulation(nakedInput);

    expect(fullResult.meanDps).toBeGreaterThan(nakedResult.meanDps);
  });
});
