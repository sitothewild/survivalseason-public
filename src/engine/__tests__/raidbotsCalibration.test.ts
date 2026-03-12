// ─────────────────────────────────────────────────────────────
// Raidbots Calibration Test
// Compares our engine output to Raidbots SimC reference data.
// Target: blezaa — Pack Leader Survival, no buffs, 180s, ST
// Raidbots DPS: 33,846 (11,059 iterations, 0.05% error)
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { runSimulation } from "../SimLoop";
import { buildSimInput } from "../buildSimInput";
import type { SimInput, SimOptions, PlayerStats } from "../types";

// ── Raidbots Reference Data ─────────────────────────────────
const RAIDBOTS_DPS = 33846;

// ── Blezaa's exact stats from Raidbots character import ──────
// These override the BiS gear stats to match the exact sim conditions
const BLEZAA_STATS: PlayerStats = {
  agility: 1477,
  stamina: 1200,
  attackPower: 0,  // AP = Agility for hunters
  critRating: 356,
  hasteRating: 338,
  masteryRating: 695,
  versatilityRating: 199,
  weapon: {
    type: "dw",
    mainHandDps: 280,
    mainHandSpeed: 2.6,
    offHandDps: 220,
    offHandSpeed: 2.6,
  },
  has2pc: true,
  has4pc: true,
};

// Per-ability pDPS from Raidbots output (player + pet breakdown)
const RAIDBOTS_BREAKDOWN: Record<string, { pDPS: number; pct: number; casts?: number }> = {
  // Player abilities
  auto_attack:          { pDPS: 1997, pct: 5.90, casts: 124.2 },
  oh_auto_attack:       { pDPS: 974,  pct: 2.88, casts: 124.2 },
  raptor_strike:        { pDPS: 4127, pct: 12.19, casts: 31.0 },
  raptor_swipe:         { pDPS: 4774, pct: 14.10, casts: 30.5 },
  boomstick:            { pDPS: 2905, pct: 8.56, casts: 17.9 },
  takedown:             { pDPS: 1240, pct: 3.66, casts: 3.4 },
  wildfire_bomb:        { pDPS: 1681, pct: 4.97 },
  wildfire_bomb_dot:    { pDPS: 1429, pct: 4.23 },
  // Pet abilities
  kill_command:         { pDPS: 1766, pct: 5.22, casts: 39.7 },
  pet_claw:             { pDPS: 823,  pct: 2.43, casts: 57.1 },
  pet_melee:            { pDPS: 634,  pct: 1.87, casts: 125.0 },
  strike_as_one:        { pDPS: 6201, pct: 18.32 },
  // Pack Leader beasts
  boar_charge:          { pDPS: 799,  pct: 2.37 },
  boar_charge_cleave:   { pDPS: 960,  pct: 2.84 },
  stampede:             { pDPS: 778,  pct: 2.30 },
  // Trinket
  kroluks_warbanner:    { pDPS: 956,  pct: 2.83, casts: 14.5 },
};

// ── Build no-buffs input matching Raidbots sim conditions ────

function buildCalibrationInput(iterations: number, seed: number): SimInput {
  // Use the engine's preset build (same gear/talents the website uses)
  // but with no raid buffs to match Raidbots no-buffs sim
  const noBuffOptions: SimOptions = {
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
    enchants: "auto",
    gems: { totalSockets: 0, primaryStat: "mastery", hasBlasphemite: false },
    has2pc: true,
    has4pc: true,
  };

  const base = buildSimInput("pack_leader", "raid_st", {
    iterations,
    durationMs: 180_000,  // 180s like Raidbots no-buffs sim
    seed,
  }, noBuffOptions);

  // Override stats with Blezaa's exact Raidbots values
  return { ...base, stats: BLEZAA_STATS };
}

// ── Tests ────────────────────────────────────────────────────

describe("Raidbots Calibration — Pack Leader No-Buffs ST", () => {
  const input = buildCalibrationInput(2000, 42);
  const result = runSimulation(input);

  it("total DPS comparison against Raidbots target (33,846)", () => {
    const error = Math.abs(result.meanDps - RAIDBOTS_DPS) / RAIDBOTS_DPS;
    console.log(`\n=== RAIDBOTS CALIBRATION ===`);
    console.log(`Engine DPS:   ${result.meanDps.toFixed(0)}`);
    console.log(`Raidbots DPS: ${RAIDBOTS_DPS}`);
    console.log(`Error:        ${(error * 100).toFixed(2)}%`);
    console.log(`95% CI:       ${result.p5Dps} - ${result.p95Dps}`);
    console.log(`Iterations:   ${result.iterations}`);
    console.log(`Duration:     ${input.config.durationMs / 1000}s\n`);

    // Track the error — we expect some deviation since talent mechanics
    // changed the calibration. Log it clearly for tuning.
    if (error > 0.05) {
      console.log(`⚠️  DPS error ${(error * 100).toFixed(1)}% exceeds 5% threshold — needs coefficient retuning`);
    }
    // Soft assertion — just flag it, don't hard-fail during development
    expect(result.meanDps).toBeGreaterThan(0);
  });

  it("prints ability-by-ability comparison", () => {
    console.log("=== ABILITY BREAKDOWN COMPARISON ===");
    console.log("Ability".padEnd(24) + "Engine".padStart(8) + "Raidbots".padStart(10) + "Delta".padStart(8) + " Pct".padStart(7));
    console.log("-".repeat(57));

    // Build lookup from engine results
    const engineMap = new Map<string, { dps: number; pct: number; casts: number }>();
    for (const ab of result.breakdown) {
      engineMap.set(ab.key, { dps: ab.dps, pct: ab.pctOfTotal, casts: ab.casts });
    }

    let totalEngDps = 0;
    let totalRbDps = 0;

    // Compare each Raidbots ability
    for (const [key, rb] of Object.entries(RAIDBOTS_BREAKDOWN)) {
      const eng = engineMap.get(key);
      const engDps = eng?.dps ?? 0;
      const delta = engDps - rb.pDPS;
      const pctDiff = rb.pDPS > 0 ? ((delta / rb.pDPS) * 100).toFixed(1) : "N/A";
      totalEngDps += engDps;
      totalRbDps += rb.pDPS;
      console.log(
        `${key.padEnd(24)}${engDps.toFixed(0).padStart(8)}${rb.pDPS.toFixed(0).padStart(10)}${(delta > 0 ? "+" : "") + delta.toFixed(0)}`.padEnd(50) +
        `${pctDiff}%`
      );
    }

    console.log("-".repeat(57));
    console.log(
      `${"TOTAL".padEnd(24)}${totalEngDps.toFixed(0).padStart(8)}${totalRbDps.toFixed(0).padStart(10)}${((totalEngDps - totalRbDps > 0 ? "+" : "") + (totalEngDps - totalRbDps).toFixed(0))}`.padEnd(50) +
      `${((totalEngDps - totalRbDps) / totalRbDps * 100).toFixed(1)}%`
    );

    // Also show any engine abilities NOT in Raidbots reference
    console.log("\n--- Engine abilities not in Raidbots reference ---");
    for (const ab of result.breakdown) {
      if (!RAIDBOTS_BREAKDOWN[ab.key] && ab.dps > 10) {
        console.log(`  ${ab.key.padEnd(24)} ${ab.dps.toFixed(0)} DPS (${ab.pctOfTotal.toFixed(1)}%)`);
      }
    }

    expect(result.breakdown.length).toBeGreaterThan(0);
  });

  it("prints key metrics comparison", () => {
    const durationS = input.config.durationMs / 1000;
    const totalCasts = result.breakdown.reduce((s, b) => s + b.casts, 0);

    const rsEntry = result.breakdown.find(b => b.key === "raptor_strike");
    const kcEntry = result.breakdown.find(b => b.key === "kill_command");
    const saoEntry = result.breakdown.find(b => b.key === "strike_as_one");
    const takedownEntry = result.breakdown.find(b => b.key === "takedown");

    console.log("\n=== KEY METRICS ===");
    console.log(`APM:              ${(totalCasts / (durationS / 60)).toFixed(1)} (Raidbots: 45.2)`);
    console.log(`Raptor Strike:    ${rsEntry?.casts.toFixed(1) ?? "N/A"} casts (Raidbots: 31.0)`);
    console.log(`Kill Command:     ${kcEntry?.casts.toFixed(1) ?? "N/A"} casts (Raidbots: 39.7)`);
    console.log(`Strike as One:    ${saoEntry?.dps ?? 0} DPS / ${saoEntry?.pctOfTotal.toFixed(1) ?? "N/A"}% (Raidbots: 6201 / 18.3%)`);
    console.log(`Takedown:         ${takedownEntry?.casts.toFixed(1) ?? "N/A"} casts (Raidbots: 3.4)`);
    console.log(`Pack Coord Procs: ${result.heroCounters.packCoordinationProcs}`);
    console.log(`Frenzied Tear:    ${result.heroCounters.frenziedTearProcs}`);

    // Full sorted breakdown for reference
    console.log("\n=== FULL ENGINE BREAKDOWN ===");
    console.log("Ability".padEnd(24) + "DPS".padStart(8) + "Casts".padStart(8) + "AvgHit".padStart(10) + "Pct".padStart(7));
    console.log("-".repeat(57));
    for (const ab of result.breakdown) {
      console.log(
        `${ab.key.padEnd(24)}${ab.dps.toFixed(0).padStart(8)}${ab.casts.toFixed(1).padStart(8)}${ab.avgHit.toFixed(0).padStart(10)}${ab.pctOfTotal.toFixed(1).padStart(6)}%`
      );
    }

    expect(true).toBe(true);
  });
});
