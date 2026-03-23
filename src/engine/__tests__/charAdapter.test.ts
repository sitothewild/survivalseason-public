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
    haste: 10.0,    // display percentage
    crit: 19.0,     // display percentage (includes 5% base)
    mastery: 25.0,  // display percentage
    versatility: 5.0,
    attackPower: 1717,
  },
  rawRatings: {
    hasteRating: 350,      // 10% * 35.0
    critRating: 312,       // (19% - 5%) * 22.3
    masteryRating: 4500,   // realistic mastery rating
    versatilityRating: 270, // 5% * 54.0
  },
  gear: [],
  talents: null,
};

describe("charToSimInput", () => {
  it("converts parsedChar stats to raw ratings (enchants/gems may add on top)", () => {
    const input = charToSimInput(SAMPLE_CHAR, "sentinel", 1, 300, FULL_RAID_OPTIONS);
    // Level 90 conversions: haste 10.0% * 35.0 = 350, plus enchants/gems
    expect(input.stats.hasteRating).toBeGreaterThan(300);
    // crit 19.0% * 22.3 = 424, plus enchants/gems
    expect(input.stats.critRating).toBeGreaterThan(400);
    // mastery 25.0% * 28.1 = 703, plus enchants/gems
    expect(input.stats.masteryRating).toBeGreaterThan(600);
    // vers 5.0% * 54.0 / 100 = 2.7, plus enchants
    expect(input.stats.versatilityRating).toBeGreaterThanOrEqual(2);
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
    const input = charToSimInput(SAMPLE_CHAR, "pack_leader", 5, 180);
    expect(input.config.durationMs).toBe(180_000);
    expect(input.config.targets).toBe(5);
    expect(input.config.fightStyle).toBe("mplus_pull");
    expect(input.talents.hero).toBe("pack_leader");
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

  it("resolves trinkets from gear itemIds when available", () => {
    const charWithTrinkets: ParsedCharData = {
      ...SAMPLE_CHAR,
      gear: [
        { slot: "trinket1", ilvl: 276, itemId: "225600", name: "Moonwarden's Focal Lens" },
        { slot: "trinket2", ilvl: 276, itemId: "225601", name: "Abyssal Night Effigy" },
      ],
    };
    const input = charToSimInput(charWithTrinkets, "sentinel", 1, 300, FULL_RAID_OPTIONS);
    expect(input.trinkets[0].id).toBe(225600);
    expect(input.trinkets[1].id).toBe(225601);
  });

  it("falls back to BiS trinkets for unknown itemIds", () => {
    const charWithUnknown: ParsedCharData = {
      ...SAMPLE_CHAR,
      gear: [
        { slot: "trinket1", ilvl: 276, itemId: "999999", name: "Unknown Trinket" },
      ],
    };
    const input = charToSimInput(charWithUnknown, "sentinel", 1, 300, FULL_RAID_OPTIONS);
    // Should still have 2 trinkets (unknown falls back to default)
    expect(input.trinkets[0]).toBeDefined();
    expect(input.trinkets[1]).toBeDefined();
    expect(input.trinkets[0].id).toBeDefined();
  });

  it("falls back to BiS when no gear provided", () => {
    const charNoGear: ParsedCharData = {
      ...SAMPLE_CHAR,
      gear: [],
    };
    const input = charToSimInput(charNoGear, "sentinel", 1, 300, FULL_RAID_OPTIONS);
    expect(input.trinkets[0]).toBeDefined();
    expect(input.trinkets[1]).toBeDefined();
  });
});

describe("simResultToLegacy", () => {
  it("converts engine SimResult to legacy shape with statistical data", { timeout: 15000 }, () => {
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
    // Statistical convergence data should be passed through
    expect(legacy.stdDev).toBeDefined();
    expect(legacy.stdDev).toBeGreaterThan(0);
    expect(legacy.p5Dps).toBeDefined();
    expect(legacy.p95Dps).toBeDefined();
    expect(legacy.p5Dps!).toBeLessThanOrEqual(legacy.totalDps);
    expect(legacy.p95Dps!).toBeGreaterThanOrEqual(legacy.totalDps);
    expect(legacy.iterations).toBeDefined();
    expect(legacy.iterations!).toBeGreaterThan(0);
    expect(legacy.medianDps).toBeDefined();
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
    const input = charToSimInput(SAMPLE_CHAR, "pack_leader", 1, 300, FULL_RAID_OPTIONS);
    const engineResult = runSimulation(input);
    const legacy = simResultToLegacy(engineResult, "pack_leader", 1, 300);

    expect(legacy.detailed.buffUptimes["Pack Leader Beasts"]).toBeDefined();
    expect(legacy.detailed.buffUptimes["Sentinel Mark"]).toBeUndefined();
  });
});

describe("Timeline capture", () => {
  it("captures timeline events when captureTimeline is true", () => {
    const input = charToSimInput(SAMPLE_CHAR, "sentinel", 1, 120, FULL_RAID_OPTIONS, { captureTimeline: true, iterations: 10 });
    expect(input.config.captureTimeline).toBe(true);

    const result = runSimulation(input);
    expect(result.timeline).toBeDefined();
    expect(result.timeline!.length).toBeGreaterThan(0);

    // Should have cast events in the first 30s
    const casts = result.timeline!.filter(e => e.type === "cast" && e.tMs <= 30_000);
    expect(casts.length).toBeGreaterThan(5);

    // Each event has required fields
    for (const e of casts.slice(0, 5)) {
      expect(e.tMs).toBeGreaterThanOrEqual(0);
      expect(e.ability).toBeDefined();
    }
  });

  it("passes timeline through simResultToLegacy", () => {
    const input = charToSimInput(SAMPLE_CHAR, "sentinel", 1, 120, FULL_RAID_OPTIONS, { captureTimeline: true, iterations: 10 });
    const result = runSimulation(input);
    const legacy = simResultToLegacy(result, "sentinel", 1, 120);

    expect(legacy.timeline).toBeDefined();
    expect(legacy.timeline!.length).toBeGreaterThan(0);
  });

  it("does not capture timeline when captureTimeline is false", () => {
    const input = charToSimInput(SAMPLE_CHAR, "sentinel", 1, 120, FULL_RAID_OPTIONS);
    expect(input.config.captureTimeline).toBe(false);

    const result = runSimulation(input);
    expect(result.timeline).toBeUndefined();
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

  it("naked options produce less DPS than full raid", { timeout: 15000 }, () => {
    const fullInput = charToSimInput(SAMPLE_CHAR, "sentinel", 1, 300, FULL_RAID_OPTIONS);
    const nakedInput = charToSimInput(SAMPLE_CHAR, "sentinel", 1, 300, NAKED_OPTIONS);

    const fullResult = runSimulation(fullInput);
    const nakedResult = runSimulation(nakedInput);

    expect(fullResult.meanDps).toBeGreaterThan(nakedResult.meanDps);
  });
});
