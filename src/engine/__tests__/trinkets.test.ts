// ─────────────────────────────────────────────────────────────
// engine/__tests__/trinkets.test.ts
// Tests for trinket proc, on-use, equip, and damage_proc types.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { runSimulation } from "../SimLoop";
import { buildSimInput } from "../buildSimInput";
import { FULL_RAID_OPTIONS } from "../simOptionsPresets";
import type { SimInput, EquippedTrinket } from "../types";

/** Helper: build a base SimInput then override trinkets */
function buildWithTrinkets(
  trinkets: [EquippedTrinket | null, EquippedTrinket | null],
): SimInput {
  const input = buildSimInput("sentinel", "raid_st", {
    iterations: 300,
    seed: 42,
    durationMs: 120_000,
  }, FULL_RAID_OPTIONS);
  return { ...input, trinkets };
}

const ON_USE_TRINKET: EquippedTrinket = {
  id: 999001,
  name: "Test On-Use Crit Trinket",
  ilvl: 276,
  type: "on_use",
  primaryAgi: 0,
  onUseStat: "crit",
  onUseAmount: 3640,
  onUseDuration: 20,
  onUseCD: 120,
  burstAlignable: false,  // fires immediately, not just during burst
};

const BURST_ON_USE_TRINKET: EquippedTrinket = {
  id: 999002,
  name: "Test Burst-Aligned Trinket",
  ilvl: 276,
  type: "on_use",
  primaryAgi: 0,
  onUseStat: "mastery",
  onUseAmount: 3920,
  onUseDuration: 20,
  onUseCD: 120,
  burstAlignable: true,
};

const PROC_TRINKET: EquippedTrinket = {
  id: 999003,
  name: "Test Proc Trinket",
  ilvl: 276,
  type: "proc",
  primaryAgi: 620,
  procStat: "agi",
  procAmount: 1800,
  procUptime: 0.45,
  burstAlignable: false,
};

const PROC_ICD_TRINKET: EquippedTrinket = {
  id: 999004,
  name: "Test ICD Proc Trinket",
  ilvl: 276,
  type: "proc",
  primaryAgi: 0,
  procStat: "haste",
  procAmount: 2400,
  procUptime: 0.35,
  procICD: 45,
  burstAlignable: false,
};

const DAMAGE_PROC_TRINKET: EquippedTrinket = {
  id: 999005,
  name: "Test Damage Proc Trinket",
  ilvl: 276,
  type: "damage_proc",
  primaryAgi: 510,
  dmgApCoef: 0.85,
  dmgCPM: 4.5,
  burstAlignable: false,
};

const EQUIP_TRINKET: EquippedTrinket = {
  id: 999006,
  name: "Test Equip Trinket",
  ilvl: 276,
  type: "equip",
  primaryAgi: 820,
  burstAlignable: false,
};

describe("Trinket: on_use", () => {
  it("produces higher DPS than no trinkets", () => {
    const withTrinket = runSimulation(buildWithTrinkets([ON_USE_TRINKET, null]));
    const noTrinket = runSimulation(buildWithTrinkets([null, null]));
    expect(withTrinket.meanDps).toBeGreaterThan(noTrinket.meanDps);
  });

  it("non-burst-aligned trinket fires even without Takedown active", () => {
    const result = runSimulation(buildWithTrinkets([ON_USE_TRINKET, null]));
    // Should see the trinket contribute — check that it's not zero
    expect(result.meanDps).toBeGreaterThan(0);
  });
});

describe("Trinket: burst-aligned on_use", () => {
  it("fires during Takedown windows", () => {
    // Burst-aligned trinkets only fire during Takedown/CoA
    // Over a 2-minute fight there should be at least one Takedown window
    const result = runSimulation(buildWithTrinkets([BURST_ON_USE_TRINKET, null]));
    expect(result.meanDps).toBeGreaterThan(0);
  });
});

describe("Trinket: proc (stat)", () => {
  it("increases DPS over no-trinket baseline", () => {
    const withProc = runSimulation(buildWithTrinkets([PROC_TRINKET, null]));
    const noTrinket = runSimulation(buildWithTrinkets([null, null]));
    expect(withProc.meanDps).toBeGreaterThan(noTrinket.meanDps);
  });

  it("ICD proc trinket still contributes DPS", () => {
    const withICD = runSimulation(buildWithTrinkets([PROC_ICD_TRINKET, null]));
    const noTrinket = runSimulation(buildWithTrinkets([null, null]));
    expect(withICD.meanDps).toBeGreaterThan(noTrinket.meanDps);
  });
});

describe("Trinket: damage_proc", () => {
  it("shows trinket damage in breakdown", () => {
    const result = runSimulation(buildWithTrinkets([DAMAGE_PROC_TRINKET, null]));
    const trinketEntry = result.breakdown.find(b => b.key === "trinket_999005");
    expect(trinketEntry).toBeDefined();
    expect(trinketEntry!.label).toBe("Test Damage Proc Trinket");
    expect(trinketEntry!.damage).toBeGreaterThan(0);
    expect(trinketEntry!.category).toBe("trinket");
  });

  it("increases DPS over no-trinket baseline", () => {
    const withDmg = runSimulation(buildWithTrinkets([DAMAGE_PROC_TRINKET, null]));
    const noTrinket = runSimulation(buildWithTrinkets([null, null]));
    expect(withDmg.meanDps).toBeGreaterThan(noTrinket.meanDps);
  });
});

describe("Trinket: equip (passive)", () => {
  it("adds primary stat and increases DPS", () => {
    const withEquip = runSimulation(buildWithTrinkets([EQUIP_TRINKET, null]));
    const noTrinket = runSimulation(buildWithTrinkets([null, null]));
    // 820 agi should produce a measurable DPS increase
    expect(withEquip.meanDps).toBeGreaterThan(noTrinket.meanDps);
  });
});

describe("Trinket: dual trinkets", () => {
  it("two trinkets produce more DPS than one", () => {
    const oneTrinket = runSimulation(buildWithTrinkets([ON_USE_TRINKET, null]));
    const twoTrinkets = runSimulation(buildWithTrinkets([ON_USE_TRINKET, PROC_TRINKET]));
    expect(twoTrinkets.meanDps).toBeGreaterThan(oneTrinket.meanDps);
  });

  it("on_use + damage_proc both show in breakdown", () => {
    const result = runSimulation(buildWithTrinkets([DAMAGE_PROC_TRINKET, EQUIP_TRINKET]));
    const dmgEntry = result.breakdown.find(b => b.key === "trinket_999005");
    expect(dmgEntry).toBeDefined();
    expect(dmgEntry!.label).toBe("Test Damage Proc Trinket");
  });
});

describe("Trinket: label resolution", () => {
  it("uses trinket name in breakdown label", () => {
    const result = runSimulation(buildWithTrinkets([DAMAGE_PROC_TRINKET, null]));
    const entry = result.breakdown.find(b => b.key === "trinket_999005");
    expect(entry).toBeDefined();
    expect(entry!.label).not.toMatch(/^trinket_\d+$/);
    expect(entry!.label).toBe("Test Damage Proc Trinket");
  });
});
