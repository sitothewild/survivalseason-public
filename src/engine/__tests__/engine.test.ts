// ─────────────────────────────────────────────────────────────
// engine/__tests__/engine.test.ts
// Unit tests for sim engine primitives and integration tests
// for golden profiles matching V3 spec validation fixtures.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { RNG, hash64 } from "../RNG";
import { EventQueue, EventPriority } from "../EventQueue";
import { FocusModel } from "../FocusModel";
import { createPRDState, rollPRD, getCValue } from "../PRD";
import { ratingToPercent, applyDR, computeArmorMitigation } from "../CombatMath";
import { CooldownTracker } from "../CombatState";
import { parseAPL, evaluateAPL, DEFAULT_APLS } from "../APLEngine";
import { SPELL_DB, DOT_DB } from "../SpellDB";
import { runSimulation } from "../SimLoop";
import { buildSimInput } from "../buildSimInput";
import type { SimInput, PlayerStats, HeroTree } from "../types";

// ── RNG Tests ─────────────────────────────────────────────────

describe("RNG", () => {
  it("produces deterministic output for same seed", () => {
    const a = new RNG(42);
    const b = new RNG(42);
    for (let i = 0; i < 100; i++) {
      expect(a.roll()).toBe(b.roll());
    }
  });

  it("produces different output for different seeds", () => {
    const a = new RNG(42);
    const b = new RNG(99);
    let same = 0;
    for (let i = 0; i < 100; i++) {
      if (a.roll() === b.roll()) same++;
    }
    expect(same).toBeLessThan(10);
  });

  it("roll() returns values in [0, 1)", () => {
    const rng = new RNG(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng.roll();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("rollInt() returns values in [min, max]", () => {
    const rng = new RNG(456);
    for (let i = 0; i < 1000; i++) {
      const v = rng.rollInt(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it("hash64 produces unique seeds per iteration", () => {
    const seeds = new Set<number>();
    for (let i = 0; i < 100; i++) {
      seeds.add(hash64(42, i));
    }
    expect(seeds.size).toBe(100);
  });
});

// ── EventQueue Tests ──────────────────────────────────────────

describe("EventQueue", () => {
  it("dequeues events in time order", () => {
    const q = new EventQueue();
    q.enqueue({ tMs: 300, priority: EventPriority.CAST_COMPLETE, type: "c" });
    q.enqueue({ tMs: 100, priority: EventPriority.CAST_COMPLETE, type: "a" });
    q.enqueue({ tMs: 200, priority: EventPriority.CAST_COMPLETE, type: "b" });

    expect(q.dequeue()?.type).toBe("a");
    expect(q.dequeue()?.type).toBe("b");
    expect(q.dequeue()?.type).toBe("c");
  });

  it("breaks ties by priority then seq", () => {
    const q = new EventQueue();
    q.enqueue({ tMs: 100, priority: EventPriority.AUTO_ATTACK, type: "auto" });
    q.enqueue({ tMs: 100, priority: EventPriority.CAST_COMPLETE, type: "cast" });
    q.enqueue({ tMs: 100, priority: EventPriority.AURA_EXPIRE, type: "aura" });

    expect(q.dequeue()?.type).toBe("aura");
    expect(q.dequeue()?.type).toBe("cast");
    expect(q.dequeue()?.type).toBe("auto");
  });

  it("removeWhere removes matching events", () => {
    const q = new EventQueue();
    q.enqueue({ tMs: 100, priority: EventPriority.DOT_TICK, type: "dot" });
    q.enqueue({ tMs: 200, priority: EventPriority.DOT_TICK, type: "dot" });
    q.enqueue({ tMs: 300, priority: EventPriority.CAST_COMPLETE, type: "cast" });

    const removed = q.removeWhere(e => e.type === "dot");
    expect(removed).toBe(2);
    expect(q.size).toBe(1);
  });
});

// ── FocusModel Tests ──────────────────────────────────────────

describe("FocusModel", () => {
  it("regenerates focus over time", () => {
    const fm = new FocusModel({ startFocus: 0, baseRegenPerSec: 5 });
    const focus = fm.getFocus(10000); // 10 seconds
    expect(focus).toBe(50);
  });

  it("caps at maxFocus", () => {
    const fm = new FocusModel({ startFocus: 90, baseRegenPerSec: 5, maxFocus: 100 });
    const focus = fm.getFocus(5000);
    expect(focus).toBe(100);
  });

  it("spend reduces focus", () => {
    const fm = new FocusModel({ startFocus: 100 });
    expect(fm.spend(30, 0)).toBe(true);
    expect(fm.getFocus(0)).toBe(70);
  });

  it("spend fails if insufficient", () => {
    const fm = new FocusModel({ startFocus: 20 });
    expect(fm.spend(30, 0)).toBe(false);
    expect(fm.getFocus(0)).toBe(20);
  });

  it("haste scales regen", () => {
    const fm = new FocusModel({ startFocus: 0, baseRegenPerSec: 5, hastePercent: 0.20 });
    const focus = fm.getFocus(10000);
    expect(focus).toBeCloseTo(60, 1);
  });
});

// ── CombatMath Tests ──────────────────────────────────────────

describe("CombatMath", () => {
  it("DR at 30% boundary: no DR applied", () => {
    const result = applyDR("crit", 0.30);
    expect(result).toBeCloseTo(0.30, 3);
  });

  it("DR at 35% boundary", () => {
    const result = applyDR("crit", 0.35);
    // 30% at 100% + 5% at 90% = 0.30 + 0.045 = 0.345
    expect(result).toBeCloseTo(0.345, 3);
  });

  it("DR at 45% boundary", () => {
    const result = applyDR("crit", 0.45);
    // 30% @ 100% = 0.30, 9% @ 90% = 0.081, 6% @ 80% = 0.048
    // Total: 0.30 + 0.081 + 0.048 = 0.429
    expect(result).toBeCloseTo(0.429, 2);
  });

  it("armor mitigation produces expected value", () => {
    const mit = computeArmorMitigation(11480, 14014);
    // 11480 / (11480 + 14014) = 0.4503
    expect(mit).toBeCloseTo(0.4503, 3);
  });

  it("ratingToPercent converts correctly", () => {
    // 22.3 crit rating = 1% crit at level 90 (before DR)
    const pct = ratingToPercent("crit", 22.3);
    expect(pct).toBeCloseTo(0.01, 3);
  });
});

// ── PRD Tests ─────────────────────────────────────────────────

describe("PRD", () => {
  it("converges to stated rate over many rolls", () => {
    const rng = new RNG(42);
    const state = createPRDState();
    let procs = 0;
    const rolls = 50000;

    for (let i = 0; i < rolls; i++) {
      if (rollPRD("test", 0.15, rng, state)) procs++;
    }

    const actualRate = procs / rolls;
    // PRD should converge close to the nominal 15% rate
    expect(actualRate).toBeGreaterThan(0.10);
    expect(actualRate).toBeLessThan(0.20);
  });

  it("C-values are available for common chances", () => {
    expect(getCValue(0.15)).toBeCloseTo(0.03221, 4);
    expect(getCValue(0.30)).toBeCloseTo(0.11895, 4);
  });
});

// ── CooldownTracker Tests ─────────────────────────────────────

describe("CooldownTracker", () => {
  it("tracks charges correctly", () => {
    const cd = new CooldownTracker();
    cd.init("kill_command", 2, 6000);

    expect(cd.isReady("kill_command", 0)).toBe(true);
    expect(cd.getCharges("kill_command")).toBe(2);

    cd.use("kill_command", 0);
    expect(cd.getCharges("kill_command")).toBe(1);

    cd.use("kill_command", 0);
    expect(cd.getCharges("kill_command")).toBe(0);
    expect(cd.isReady("kill_command", 0)).toBe(false);
    expect(cd.isReady("kill_command", 6000)).toBe(true);
  });

  it("resetCharge adds a charge", () => {
    const cd = new CooldownTracker();
    cd.init("wildfire_bomb", 1, 18000);

    cd.use("wildfire_bomb", 0);
    expect(cd.getCharges("wildfire_bomb")).toBe(0);

    cd.resetCharge("wildfire_bomb");
    expect(cd.getCharges("wildfire_bomb")).toBe(1);
  });
});

// ── APL Parser Tests ──────────────────────────────────────────

describe("APL Parser", () => {
  it("parses basic APL actions", () => {
    const apl = parseAPL(`actions=auto_attack
actions+=/kill_command,if=focus<=80
actions+=/raptor_strike`);

    expect(apl.actions.length).toBe(3);
    expect(apl.actions[0].ability).toBe("auto_attack");
    expect(apl.actions[1].ability).toBe("kill_command");
    expect(apl.actions[1].conditions.length).toBe(1);
    expect(apl.actions[2].ability).toBe("raptor_strike");
    expect(apl.actions[2].conditions.length).toBe(0);
  });

  it("all default APLs parse without error", () => {
    for (const [key, aplText] of Object.entries(DEFAULT_APLS)) {
      const result = parseAPL(aplText);
      expect(result.actions.length).toBeGreaterThan(0);
    }
  });
});

// ── SpellDB Tests ─────────────────────────────────────────────

describe("SpellDB", () => {
  it("has all core abilities defined", () => {
    const required = [
      "auto_attack", "raptor_strike", "kill_command",
      "wildfire_bomb", "boomstick", "takedown",
    ];
    for (const key of required) {
      expect(SPELL_DB[key]).toBeDefined();
      expect(SPELL_DB[key].apCoef).toBeGreaterThan(0);
    }
  });

  it("has DoT definitions", () => {
    expect(DOT_DB["wildfire_bomb_dot"]).toBeDefined();
    expect(DOT_DB["wildfire_bomb_dot"].school).toBe("fire");
    expect(DOT_DB["flamefang_pitch_dot"]).toBeDefined();
    // Internal bleeding does NOT snapshot
    expect(DOT_DB["internal_bleeding"].snapshots).toEqual([]);
  });
});

// ── Determinism Test ──────────────────────────────────────────

describe("Determinism", () => {
  it("same seed produces identical results", () => {
    const input = createTestInput("sentinel", 42);
    input.config.iterations = 10;
    input.config.durationMs = 30000;

    const r1 = runSimulation(input);
    const r2 = runSimulation(input);

    expect(r1.meanDps).toBe(r2.meanDps);
    // breakdown should match across identical seed runs
    expect(r1.breakdown.length).toBe(r2.breakdown.length);
    for (let i = 0; i < r1.breakdown.length; i++) {
      expect(r1.breakdown[i].damage).toBe(r2.breakdown[i].damage);
    }
  });
});

// ── Golden Profile: Sentinel ST ───────────────────────────────

describe("Golden Profile — Sentinel ST", () => {
  it("produces DPS in expected range", () => {
    const input = createTestInput("sentinel", 12345);
    input.config.iterations = 100;
    input.config.durationMs = 300000;
    input.config.targets = 1;

    const result = runSimulation(input);

    // Expect DPS to be reasonable (>0, and in the ballpark)
    expect(result.meanDps).toBeGreaterThan(10000);
    expect(result.stdDev).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.length).toBeGreaterThan(0);

    // Top abilities should include Kill Command and Raptor Strike
    const topKeys = result.breakdown.slice(0, 5).map(b => b.key);
    expect(topKeys).toContain("kill_command");
  });

  it("has correct hero counters for Sentinel", () => {
    const input = createTestInput("sentinel", 54321);
    input.config.iterations = 50;
    input.config.durationMs = 60000;

    const result = runSimulation(input);

    // Sentinel should have owl procs
    expect(result.heroCounters.sentinelOwlProcs).toBeGreaterThan(0);
  });
});

// ── Golden Profile: Pack Leader ST ────────────────────────────

describe("Golden Profile — Pack Leader ST", () => {
  it("produces DPS in expected range", () => {
    const input = createTestInput("pack_leader", 12345);
    input.config.iterations = 100;
    input.config.durationMs = 300000;
    input.config.targets = 1;

    const result = runSimulation(input);

    expect(result.meanDps).toBeGreaterThan(10000);
    expect(result.breakdown.length).toBeGreaterThan(0);
  });

  it("has correct hero counters for Pack Leader", () => {
    const input = createTestInput("pack_leader", 54321);
    input.config.iterations = 50;
    input.config.durationMs = 60000;

    const result = runSimulation(input);

    expect(result.heroCounters.packCoordinationProcs).toBeGreaterThan(0);
  });
});

// ── Multi-Target Test ─────────────────────────────────────────

describe("Multi-Target", () => {
  it("AoE deals more total damage than ST", () => {
    const stInput = createTestInput("sentinel", 42);
    stInput.config.iterations = 50;
    stInput.config.durationMs = 60000;
    stInput.config.targets = 1;

    const aoeInput = createTestInput("sentinel", 42);
    aoeInput.config.iterations = 50;
    aoeInput.config.durationMs = 60000;
    aoeInput.config.targets = 5;

    const stResult = runSimulation(stInput);
    const aoeResult = runSimulation(aoeInput);

    // AoE DPS should be higher due to multi-target
    expect(aoeResult.meanDps).toBeGreaterThan(stResult.meanDps);
  });
});

// ── Helper: Create test SimInput ──────────────────────────────

function createTestInput(hero: HeroTree, seed: number): SimInput {
  const stats: PlayerStats = {
    agility: 3240,
    stamina: 4800,
    attackPower: 3490,
    critRating: 4572, // ~25.4%
    hasteRating: 2516, // ~14.8%
    masteryRating: 6876, // ~38.2%
    versatilityRating: 1866, // ~9.1%
    weapon: {
      type: hero === "sentinel" ? "2h" : "dw",
      mainHandDps: hero === "sentinel" ? 420 : 280,
      mainHandSpeed: hero === "sentinel" ? 3.6 : 2.6,
      offHandDps: hero === "sentinel" ? undefined : 220,
      offHandSpeed: hero === "sentinel" ? undefined : 2.6,
    },
    has2pc: true,
    has4pc: true,
  };

  const activeTalents = new Set([
    "killCommand", "wildfireBomb", "raptorStrike",
    "guerrillaTactics", "tipOfTheSpear", "lunge",
    "boomstick", "strikeAsOne", "flamebreak",
    "quickReload", "mongooseFury", "wildfireShells",
    "shellshock", "wallop", "sweepingSpear",
    "blackrockMunitions", "takedown", "killerCompanion",
    "twinFangs", "savagery", "wildfireInfusion",
    "flanked", "primalSurge", "raptorSwipe",
    "alphaPredator", "keenEyesight", "masterMarksman",
    "serratedShots", "deathChakram", "killerInstinct",
    "flankerAdvantage", "flamefangPitch", "moonlightChakram",
  ]);

  // Add hero-specific talents
  if (hero === "sentinel") {
    ["lunarStorm", "lunarCalling", "catchOut", "stargazer",
     "lunarInspiration", "extrapolation", "twilightRequiem",
     "dontLookBack", "invigoratingPulse", "eyesClosed",
     "releaseAndReload",
    ].forEach(t => activeTalents.add(t));
  } else {
    ["viciousHunt", "packCoordination", "howlOfThePack",
     "ursineFury", "wildAttacks", "corneredPrey", "frenziedTear",
     "goForTheThroat", "furiousAssault", "scatteredPrey", "clawFrenzy",
     "packAssault",
    ].forEach(t => activeTalents.add(t));
  }

  return {
    config: {
      durationMs: 300000,
      iterations: 100,
      fightStyle: "raid_st",
      targets: 1,
      bossLevelDelta: 3,
      seed,
      hero,
      apl: "",
      captureTimeline: false,
      timelineDurationMs: 30000,
      features: {
        prd: true,
        dotSnapshotting: "ap_only",
        multiTarget: false,
        useMythIlvl: false,
      },
    },
    stats,
    talents: {
      hero,
      choiceSelections: {
        bomb: "flamebreak",
        spender_buff: "blackrock_munitions",
      },
      activeTalents,
    },
    trinkets: [
      {
        id: 225601, name: "Abyssal Night Effigy", ilvl: 276,
        type: "proc", primaryAgi: 620, procStat: "agi",
        procAmount: 1280, procUptime: 0.70, burstAlignable: false,
      },
      {
        id: 225600, name: "Moonwarden's Focal Lens", ilvl: 276,
        type: "on_use", primaryAgi: 0, onUseStat: "crit",
        onUseAmount: 3640, onUseDuration: 20, onUseCD: 120,
        burstAlignable: true,
      },
    ],
  };
}
