// ─────────────────────────────────────────────────────────────
// engine/PRD.ts
// Pseudo-Random Distribution (PRD) for proc effects.
// Smooths out RNG variance: the longer since a proc, the higher
// the actual roll chance becomes, converging to the stated rate.
// ─────────────────────────────────────────────────────────────

import { RNG } from "./RNG";

/**
 * PRD C-values for common proc chances.
 * C is chosen so that the average proc rate equals the nominal chance.
 * Precomputed via iterative solving of:
 *   sum_{n=1}^{ceil(1/C)} n*C * product_{k=1}^{n-1}(1 - k*C) = P
 */
const C_TABLE: Record<number, number> = {
  0.05: 0.00380,
  0.10: 0.01475,
  0.15: 0.03221,
  0.20: 0.05570,
  0.25: 0.08474,
  0.30: 0.11895,
  0.35: 0.15798,
  0.40: 0.20155,
  0.45: 0.24931,
  0.50: 0.30200,
};

/**
 * Get the C-value for a given base proc chance.
 * Interpolates linearly between known table entries.
 */
export function getCValue(baseChance: number): number {
  if (baseChance <= 0) return 0;
  if (baseChance >= 1) return 1;

  // Exact table lookup
  const rounded = Math.round(baseChance * 100) / 100;
  if (C_TABLE[rounded] !== undefined) return C_TABLE[rounded];

  // Linear interpolation between nearest entries
  const keys = Object.keys(C_TABLE).map(Number).sort((a, b) => a - b);
  let lo = keys[0], hi = keys[keys.length - 1];
  for (const k of keys) {
    if (k <= baseChance) lo = k;
    if (k >= baseChance) { hi = k; break; }
  }
  if (lo === hi) return C_TABLE[lo];
  const t = (baseChance - lo) / (hi - lo);
  return C_TABLE[lo] + t * (C_TABLE[hi] - C_TABLE[lo]);
}

/** Per-proc tracking state. */
export interface PRDState {
  /** Map of procId → number of attempts since last proc. */
  counters: Map<string, number>;
}

/** Create a fresh PRD state. */
export function createPRDState(): PRDState {
  return { counters: new Map() };
}

/**
 * Roll a PRD proc.
 * @param procId   Unique identifier for this proc source.
 * @param baseChance Nominal proc chance (e.g. 0.15 for 15%).
 * @param rng      The seeded RNG instance.
 * @param state    PRD state to track attempts.
 * @returns true if the proc fires.
 */
export function rollPRD(
  procId: string,
  baseChance: number,
  rng: RNG,
  state: PRDState,
): boolean {
  if (baseChance <= 0) return false;
  if (baseChance >= 1) { state.counters.set(procId, 0); return true; }

  const C = getCValue(baseChance);
  const sinceLastProc = (state.counters.get(procId) ?? 0) + 1;
  const effectiveChance = Math.min(1, C * sinceLastProc);

  if (rng.rollProc(effectiveChance)) {
    state.counters.set(procId, 0);
    return true;
  }

  state.counters.set(procId, sinceLastProc);
  return false;
}

/** Reset a specific proc counter (e.g. on aura refresh). */
export function resetPRDCounter(procId: string, state: PRDState): void {
  state.counters.delete(procId);
}

/** Reset all PRD counters. */
export function resetAllPRD(state: PRDState): void {
  state.counters.clear();
}
