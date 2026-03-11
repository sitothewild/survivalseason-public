// ─────────────────────────────────────────────────────────────
// Talent Point Overflow Benchmark
// Tests which talent removal from spec core has least DPS impact.
// SPEC_CORE_POINTS sums to 31 but budget is 30 (+ 4 apex = 34).
// We need to drop 1 point from the core.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { runSimulation } from "../SimLoop";
import { buildSimInput } from "../buildSimInput";
import type { SimInput, HeroTree, TalentState } from "../types";

const SEED = 42;
const ITERATIONS = 500;
const DURATION_MS = 300_000;

function buildBaseInput(hero: HeroTree): SimInput {
  return buildSimInput(hero, "raid_st", {
    iterations: ITERATIONS,
    durationMs: DURATION_MS,
    seed: SEED,
  });
}

function removeTalent(input: SimInput, talent: string): SimInput {
  const newTalents: TalentState = {
    ...input.talents,
    activeTalents: new Set(input.talents.activeTalents),
  };
  newTalents.activeTalents.delete(talent);
  return { ...input, talents: newTalents };
}

// Candidate talents to drop (1 point each from spec core)
const DROP_CANDIDATES = [
  "primalSurge",       // +1 TotS stack, +5% TotS damage
  "flanked",           // Takedown +50% dmg, +4 targets, +100% AS
  "shellshock",        // Boomstick stun + 5% dmg buff
  "bonding",           // Bonding Ambush: Kill Command from stealth bonus
  "wildfireInfusion",  // Kill Shot reset on low HP / WFB interaction
  "twinFangs",         // Raptor Strike hits twice at reduced damage
];

// 2-point nodes where reducing from 2→1 saves 1 point
const REDUCE_CANDIDATES = [
  "savagery",          // Takedown CDR (30s → 15s at 1 pt)
  "killerCompanion",   // Pet damage bonus (rank 2)
  "sweepingSpear",     // Raptor Strike cleave (rank 2)
];

describe("Talent Drop Benchmark — Pack Leader ST", () => {
  const hero: HeroTree = "pack_leader";
  const baseInput = buildBaseInput(hero);
  const baseResult = runSimulation(baseInput);
  const baseDps = baseResult.meanDps;

  console.log(`\n=== PACK LEADER ST TALENT BENCHMARK ===`);
  console.log(`Baseline DPS: ${baseDps.toFixed(0)} (${ITERATIONS} iterations, ${DURATION_MS / 1000}s fight)\n`);

  for (const talent of DROP_CANDIDATES) {
    it(`dropping ${talent}`, () => {
      const modified = removeTalent(baseInput, talent);
      const result = runSimulation(modified);
      const delta = result.meanDps - baseDps;
      const pct = ((delta / baseDps) * 100).toFixed(2);
      console.log(`  ${talent.padEnd(20)} → ${result.meanDps.toFixed(0)} DPS (${delta > 0 ? '+' : ''}${delta.toFixed(0)}, ${pct}%)`);
      expect(result.meanDps).toBeGreaterThan(0);
    });
  }

  // For 2-point nodes, we can't easily "reduce" via this method since
  // the engine only sees the talent as "present" or "absent" in activeTalents.
  // Removing them entirely simulates the worst case.
  console.log(`\n  --- 2-point nodes (full removal, worst case) ---`);
  for (const talent of REDUCE_CANDIDATES) {
    it(`removing ${talent} entirely`, () => {
      const modified = removeTalent(baseInput, talent);
      const result = runSimulation(modified);
      const delta = result.meanDps - baseDps;
      const pct = ((delta / baseDps) * 100).toFixed(2);
      console.log(`  ${talent.padEnd(20)} → ${result.meanDps.toFixed(0)} DPS (${delta > 0 ? '+' : ''}${delta.toFixed(0)}, ${pct}%)`);
      expect(result.meanDps).toBeGreaterThan(0);
    });
  }
});

describe("Talent Drop Benchmark — Sentinel ST", () => {
  const hero: HeroTree = "sentinel";
  const baseInput = buildBaseInput(hero);
  const baseResult = runSimulation(baseInput);
  const baseDps = baseResult.meanDps;

  console.log(`\n=== SENTINEL ST TALENT BENCHMARK ===`);
  console.log(`Baseline DPS: ${baseDps.toFixed(0)} (${ITERATIONS} iterations, ${DURATION_MS / 1000}s fight)\n`);

  for (const talent of DROP_CANDIDATES) {
    it(`dropping ${talent}`, () => {
      const modified = removeTalent(baseInput, talent);
      const result = runSimulation(modified);
      const delta = result.meanDps - baseDps;
      const pct = ((delta / baseDps) * 100).toFixed(2);
      console.log(`  ${talent.padEnd(20)} → ${result.meanDps.toFixed(0)} DPS (${delta > 0 ? '+' : ''}${delta.toFixed(0)}, ${pct}%)`);
      expect(result.meanDps).toBeGreaterThan(0);
    });
  }

  console.log(`\n  --- 2-point nodes (full removal, worst case) ---`);
  for (const talent of REDUCE_CANDIDATES) {
    it(`removing ${talent} entirely`, () => {
      const modified = removeTalent(baseInput, talent);
      const result = runSimulation(modified);
      const delta = result.meanDps - baseDps;
      const pct = ((delta / baseDps) * 100).toFixed(2);
      console.log(`  ${talent.padEnd(20)} → ${result.meanDps.toFixed(0)} DPS (${delta > 0 ? '+' : ''}${delta.toFixed(0)}, ${pct}%)`);
      expect(result.meanDps).toBeGreaterThan(0);
    });
  }
});
