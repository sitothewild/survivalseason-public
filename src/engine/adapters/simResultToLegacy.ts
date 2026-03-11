// ─────────────────────────────────────────────────────────────
// engine/adapters/simResultToLegacy.ts
// Converts engine SimResult → legacy UI result shape so the
// existing React components render correctly.
// ─────────────────────────────────────────────────────────────

import type { SimResult, HeroTree, TimelineEvent } from "../types";
import { SPELL_DB } from "../SpellDB";

/** Shape the UI expects from the legacy runSimulation() */
export interface LegacySimResult {
  totalDps: number;
  breakdown: Record<string, number>;
  targets: number;
  duration: number;
  hero: string;
  build: string;
  detailed: LegacyDetailedData;
  liveDataUsed: boolean;
  aplDataUsed: boolean;
  timeline?: TimelineEvent[];
  // Statistical data for convergence display
  stdDev?: number;
  p5Dps?: number;
  p95Dps?: number;
  minDps?: number;
  maxDps?: number;
  medianDps?: number;
  iterations?: number;
  // Engine-derived data for detailed reports
  heroCounters?: HeroCounters;
  perTarget?: Record<number, { damage: number; dps: number }>;
}

export interface HeroCounters {
  sentinelOwlProcs: number;
  lunarStormProcs: number;
  eyesOfEagleResets: number;
  viciousHuntProcs: number;
  packCoordinationProcs: number;
  frenziedTearProcs: number;
}

interface LegacyActionCount {
  damage: number;
  count: number;
  avgHit: number;
  crits: number;
  dps: number;
  percentage: number;
}

interface LegacyDetailedData {
  actionCounts: Record<string, LegacyActionCount>;
  buffUptimes: Record<string, { uptime: number; description: string }>;
  strikeAsOneDetails: {
    description: string;
    triggerAbilities: string[];
    mechanics: string[];
    estimatedFrequency: string;
    avgDamage: number;
    totalTriggers: number;
  };
  resourceData: {
    focusGenerated: number;
    focusSpent: number;
    focusWasted: number;
    spenders: Array<{ label: string; cost: number; casts: number; total: number }>;
    generators: Array<{ label: string; gen: number; casts: number; total: number }>;
  };
  executionLog: Array<{ time: number; ability: string; note?: string }>;
}

/**
 * Convert an engine SimResult into the legacy shape the UI expects.
 */
export function simResultToLegacy(
  result: SimResult,
  hero: HeroTree,
  targets: number,
  durationS: number,
): LegacySimResult {
  const totalDps = Math.round(result.meanDps);
  const build = targets <= 1 ? "st" : "aoe";

  // Convert AbilityBreakdown[] → Record<string, number>
  const breakdown: Record<string, number> = {};
  for (const ab of result.breakdown) {
    breakdown[ab.label] = Math.round(ab.dps);
  }

  // Build detailed action counts from breakdown data
  const actionCounts: Record<string, LegacyActionCount> = {};
  for (const ab of result.breakdown) {
    actionCounts[ab.label] = {
      damage: Math.round(ab.damage),
      count: ab.casts,
      avgHit: Math.round(ab.avgHit),
      crits: Math.round(ab.casts * 0.3), // Approximate crit rate
      dps: Math.round(ab.dps),
      percentage: ab.pctOfTotal * 100,
    };
  }

  // Derive buff uptimes from engine breakdown data
  const isPL = hero === "pack_leader";
  const hc = result.heroCounters;

  // Takedown uptime: 8s window per cast, estimate from breakdown casts
  const takedownEntry = result.breakdown.find(b => b.key === "takedown");
  const takedownCasts = takedownEntry?.casts ?? Math.floor(durationS / 90);
  const takedownUptime = Math.min(1, (takedownCasts * 8) / durationS);

  // WFB uptime → Lethal Calibration: 12s per WFB cast
  const wfbEntry = result.breakdown.find(b => b.key === "wildfire_bomb");
  const wfbCasts = wfbEntry?.casts ?? Math.floor(durationS / 9);
  const lethalCalUptime = Math.min(1, (wfbCasts * 12) / durationS);

  // Mongoose Fury: estimate from RS cast rate (fury lasts 14s, builds on KC crits)
  const rsEntry = result.breakdown.find(b => b.key === "raptor_strike");
  const rsCasts = rsEntry?.casts ?? 0;
  const rsCPM = rsCasts > 0 ? (rsCasts / durationS) * 60 : 20;
  // ~65-80% uptime depending on cast rate; higher cast rate = higher uptime
  const mongooseUptime = Math.min(0.95, 0.45 + (rsCPM / 60) * 0.3);

  const buffUptimes: Record<string, { uptime: number; description: string }> = {
    "Mongoose Fury": { uptime: Math.round(mongooseUptime * 100) / 100, description: "Stacking damage buff from KC crits" },
    "Takedown": { uptime: Math.round(takedownUptime * 100) / 100, description: `20% damage amp — ${takedownCasts.toFixed(1)} casts × 8s window` },
    "Lethal Calibration": { uptime: Math.round(lethalCalUptime * 100) / 100, description: `15% crit damage — ${wfbCasts.toFixed(1)} WFB casts × 12s duration` },
    "Spirit Bond": { uptime: 1.0, description: "Permanent mastery scaling" },
  };
  if (isPL) {
    // Pack Leader beast uptime derived from pack_coordination procs
    const plbProcs = hc.packCoordinationProcs ?? 0;
    const plbUptime = plbProcs > 0 ? Math.min(0.85, (plbProcs * 6) / durationS) : 0.45;
    buffUptimes["Pack Leader Beasts"] = { uptime: Math.round(plbUptime * 100) / 100, description: `${plbProcs.toFixed(1)} coordination procs per fight` };
  } else {
    const owlProcs = hc.sentinelOwlProcs ?? 0;
    const sentUptime = owlProcs > 0 ? Math.min(0.70, (owlProcs * 8) / durationS) : 0.35;
    buffUptimes["Sentinel Mark"] = { uptime: Math.round(sentUptime * 100) / 100, description: `${owlProcs.toFixed(1)} owl procs per fight` };
  }

  // Compute resource data from breakdown cast counts × SpellDB focus costs
  let focusGenerated = Math.round(durationS * 5); // Base regen: 5/sec
  let focusSpent = 0;
  const spenders: Array<{ label: string; cost: number; casts: number; total: number }> = [];
  const generators: Array<{ label: string; gen: number; casts: number; total: number }> = [];
  for (const ab of result.breakdown) {
    const spell = SPELL_DB[ab.key];
    if (!spell) continue;
    if (spell.focusCost < 0) {
      const gen = Math.abs(spell.focusCost);
      const total = Math.round(ab.casts * gen);
      focusGenerated += total;
      generators.push({ label: ab.label, gen, casts: ab.casts, total });
    } else if (spell.focusCost > 0) {
      const total = Math.round(ab.casts * spell.focusCost);
      focusSpent += total;
      spenders.push({ label: ab.label, cost: spell.focusCost, casts: ab.casts, total });
    }
  }
  spenders.sort((a, b) => b.total - a.total);
  generators.sort((a, b) => b.total - a.total);
  const focusWasted = Math.max(0, focusGenerated - focusSpent);

  const strikeAsOne = result.breakdown.find(b => b.key === "strike_as_one");
  const strikeAsOneDps = strikeAsOne?.dps ?? 0;
  const triggerAbilities = ["Raptor Strike", "Kill Command", "Wildfire Bomb", "Boomstick", "Raptor Swipe"];

  return {
    totalDps,
    breakdown,
    targets,
    duration: durationS,
    hero,
    build,
    detailed: {
      actionCounts,
      buffUptimes,
      strikeAsOneDetails: {
        description: "Passive pet attack that triggers on every damaging ability you cast",
        triggerAbilities,
        mechanics: [
          "Triggers automatically on Raptor Strike, Kill Command, Wildfire Bomb, Boomstick",
          targets > 1 ? `With Two Against Many: Hits ${Math.min(targets, 3)} targets` : "Single target pet attack",
          "During Takedown: Raptor Swipe triggers Strike as One at 300% damage",
          isPL ? "Pack Leader: Benefits from beast synergies" : "Sentinel: Enhanced by Spirit Bond mastery scaling",
        ],
        estimatedFrequency: `~${strikeAsOneDps > 0 ? (strikeAsOneDps / (totalDps * 0.1)).toFixed(1) : "1.5"} triggers/sec`,
        avgDamage: strikeAsOne?.avgHit ?? 0,
        totalTriggers: strikeAsOne?.casts ?? 0,
      },
      resourceData: {
        focusGenerated,
        focusSpent,
        focusWasted,
        spenders,
        generators,
      },
      executionLog: [],
    },
    liveDataUsed: false,
    aplDataUsed: true,
    timeline: result.timeline,
    stdDev: result.stdDev,
    p5Dps: Math.round(result.p5Dps),
    p95Dps: Math.round(result.p95Dps),
    minDps: Math.round(result.minDps),
    maxDps: Math.round(result.maxDps),
    medianDps: Math.round(result.medianDps),
    iterations: result.iterations,
    heroCounters: result.heroCounters,
    perTarget: result.perTarget,
  };
}
