// ─────────────────────────────────────────────────────────────
// engine/SimLoop.ts
// The main simulation loop. Processes events, evaluates APL,
// handles damage calculation, hero talent triggers, and DoT ticks.
// Deterministic: same seed → same result.
//
// FIXES APPLIED (March 2026):
//  1. DoT ticks now properly enqueue into EventQueue
//  2. Pet auto-attacks (Claw + Melee) scheduled on timers
//  3. AP = Agility (no double-count)
//  4. Mongoose Fury tracked (+15%/stack, 5 max)
//  5. Strike as One triggers on ToTS consumption (per SimC)
//  6. Pack Leader hero beasts (Boar/Bear/Wyvern cycle)
//  7. Mastery coefficient fixed to 0.02 (Spirit Bond)
//  8. Off-hand auto attacks for DW specs
//  9. Wyvern's Cry damage buff tracked
// ─────────────────────────────────────────────────────────────

import { EventQueue, EventPriority, type SimEvent } from "./EventQueue";
import { RNG, hash64 } from "./RNG";
import { FocusModel } from "./FocusModel";
import { CombatState } from "./CombatState";
import { createPRDState, rollPRD, type PRDState } from "./PRD";
import {
  computeArmorMitigation,
  ratingToPercent,
  applyDR,
} from "./CombatMath";
import { SPELL_DB, DOT_DB, AOE_RULES, type SpellInfo } from "./SpellDB";
import { parseAPL, evaluateAPL, DEFAULT_APLS, getDefaultAPLKey, type CompiledAPL } from "./APLEngine";
import type {
  SimInput,
  SimResult,
  AbilityBreakdown,
  TimelineEvent,
  HeroTree,
} from "./types";
import {
  PET_AP_COEFFICIENTS,
  MASTERY_SPIRIT_BOND,
  COMBAT_MECHANICS,
  COMBAT_RATINGS,
  AP_COEFFICIENTS as AP,
  BUFF_DURATIONS,
  PROC_CHANCES,
  SENTINEL_COUNTER,
  HOWL_BEAST_CYCLE,
  FOCUS_VALUES,
  WEAPON_NORMS,
  TALENT_EFFECTS,
} from "./simcSpellData";

// ── Constants (sourced from simcSpellData.ts) ─────────────────

const PET_AP_SCALING = PET_AP_COEFFICIENTS.main_pet;
const MASTERY_PLAYER_BONUS = MASTERY_SPIRIT_BOND.bonusPerPoint;
const MASTERY_PET_BONUS = MASTERY_SPIRIT_BOND.bonusPerPoint;
const BASE_GCD_MS = COMBAT_MECHANICS.baseGcdMs;
const BOSS_ARMOR = COMBAT_MECHANICS.bossArmor;
const ARMOR_K = COMBAT_RATINGS.armorK;
const MELEE_SWING_MS_2H = WEAPON_NORMS.twoHandSwingMs;
const MELEE_SWING_MS_1H = WEAPON_NORMS.oneHandSwingMs;
const PET_SWING_MS = WEAPON_NORMS.petSwingMs;
const PET_CLAW_CD_MS = WEAPON_NORMS.petClawCdMs;
const TIP_MAX_STACKS = BUFF_DURATIONS.tip_of_the_spear.maxStacks;
const TIP_DAMAGE_PER_STACK = BUFF_DURATIONS.tip_of_the_spear.dmgPerStack;
const TAKEDOWN_DURATION_MS = BUFF_DURATIONS.takedown_window.durationMs;
const MONGOOSE_FURY_MAX_STACKS = BUFF_DURATIONS.mongoose_fury.maxStacks;
const MONGOOSE_FURY_DAMAGE_PER_STACK = BUFF_DURATIONS.mongoose_fury.dmgPerStack;
const MONGOOSE_FURY_DURATION_MS = BUFF_DURATIONS.mongoose_fury.durationMs;

// Howl of the Pack Leader: beast cycle timing
const HOWL_CD_MS = HOWL_BEAST_CYCLE.cycleCdMs;
// Boar charge uses hunter AP (not pet AP) — confirmed from SimC: hunter_ranged_attack_t
const BOAR_CHARGE_AP_COEF = AP.boar_charge;
const BOAR_CHARGE_CLEAVE_AP_COEF = AP.boar_charge_cleave;
const BOAR_CHARGE_USES_HUNTER_AP = true; // SimC: hunter_ranged_attack_t inherits hunter AP
const BEAR_REND_AP_COEF_PER_TICK = AP.bear_rend_per_tick;
const BEAR_REND_DURATION_MS = HOWL_BEAST_CYCLE.bearRendDurationMs;
const BEAR_REND_TICK_MS = HOWL_BEAST_CYCLE.bearRendTickMs;
const BEAR_MELEE_AP_COEF = AP.bear_melee;
const BEAR_DURATION_MS = HOWL_BEAST_CYCLE.bearDurationMs;
const STAMPEDE_AP_COEF = AP.stampede;
const STAMPEDE_DURATION_MS = HOWL_BEAST_CYCLE.stampedeDurationMs;
const STAMPEDE_TICK_MS = HOWL_BEAST_CYCLE.stampedeTickMs;
const WYVERN_CRY_PET_DAMAGE_BONUS = BUFF_DURATIONS.wyverns_cry.petDmgPerStack;
const BLOODSEEKER_ATTACK_SPEED_PER_TARGET = BUFF_DURATIONS.bloodseeker.attackSpeedPctPerTarget / 100; // 0.10

// ── Welford's online algorithm for mean/variance ──────────────

class WelfordAccumulator {
  count = 0;
  mean = 0;
  m2 = 0;
  min = Infinity;
  max = -Infinity;
  samples: number[] = []; // only stored if needed for percentiles

  push(x: number, storeSample: boolean): void {
    this.count++;
    const delta = x - this.mean;
    this.mean += delta / this.count;
    const delta2 = x - this.mean;
    this.m2 += delta * delta2;
    if (x < this.min) this.min = x;
    if (x > this.max) this.max = x;
    if (storeSample) this.samples.push(x);
  }

  get variance(): number {
    return this.count > 1 ? this.m2 / (this.count - 1) : 0;
  }

  get stdDev(): number {
    return Math.sqrt(this.variance);
  }

  percentile(p: number): number {
    if (this.samples.length === 0) return this.mean;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const idx = Math.floor((p / 100) * sorted.length);
    return sorted[Math.min(idx, sorted.length - 1)];
  }
}

// ── Main simulation function ──────────────────────────────────

export function runSimulation(input: SimInput): SimResult {
  const { config, stats, talents } = input;
  const apl = compileAPL(config);
  const dpsAccum = new WelfordAccumulator();
  const needSamples = config.iterations >= 10; // for percentiles

  // Aggregate breakdown across iterations
  const totalBreakdown = new Map<string, { damage: number; casts: number; crits: number }>();
  const totalHeroCounters = {
    sentinelOwlProcs: 0,
    lunarStormProcs: 0,
    eyesOfEagleResets: 0,
    viciousHuntProcs: 0,
    packCoordinationProcs: 0,
    frenziedTearProcs: 0,
  };
  const totalPerTarget = new Map<number, number>();
  let capturedTimeline: TimelineEvent[] | undefined;
  let capturedCombatLog: import("./CombatState").CombatLogEntry[] | undefined;

  // Adaptive iteration: check target_error every BATCH_SIZE iterations
  // Like SimC's target_error option — stop early when SE% < threshold
  const targetErrorPct = config.targetError; // e.g., 0.1 = 0.1%
  const BATCH_SIZE = 100; // Check convergence every 100 iterations
  const MIN_ITERS = Math.min(200, config.iterations); // Minimum before checking

  let actualIters = 0;
  for (let iter = 0; iter < config.iterations; iter++) {
    const seed = hash64(config.seed, iter);
    const rng = new RNG(seed);
    const prdState = createPRDState();

    // Apply fight duration variance (like SimC's fight_length_variation)
    // Variance creates uniform distribution: [duration * (1-v), duration * (1+v)]
    const variance = config.durationVariance ?? 0;
    const iterDurationMs = variance > 0
      ? Math.round(config.durationMs * (1 - variance + 2 * variance * rng.roll()))
      : config.durationMs;

    const state = new CombatState(stats, config.hero, config.targets, input.buffMults);

    // Enable combat log for iteration 0 when timeline capture is on
    if (iter === 0 && config.captureTimeline) {
      state.combatLogEnabled = true;
    }

    // Initialize cooldowns
    initializeCooldowns(state, talents);

    // Run single iteration (with per-iteration duration variance if enabled)
    const iterResult = runIteration(
      state, rng, prdState, apl, input,
      iter === 0 && config.captureTimeline,
      iterDurationMs,
    );

    const iterDurationSec = iterDurationMs / 1000;
    const iterDps = state.totalDamage / iterDurationSec;
    dpsAccum.push(iterDps, needSamples);
    actualIters = iter + 1;

    // Accumulate breakdown
    for (const [key, data] of state.breakdown.getAll()) {
      const existing = totalBreakdown.get(key);
      if (existing) {
        existing.damage += data.damage;
        existing.casts += data.casts;
        existing.crits += data.crits;
      } else {
        totalBreakdown.set(key, { ...data });
      }
    }

    // Accumulate hero counters
    totalHeroCounters.sentinelOwlProcs += state.sentinelOwlProcs;
    totalHeroCounters.lunarStormProcs += state.lunarStormProcs;
    totalHeroCounters.eyesOfEagleResets += state.eyesOfEagleResets;
    totalHeroCounters.viciousHuntProcs += state.viciousHuntProcs;
    totalHeroCounters.packCoordinationProcs += state.packCoordinationProcs;
    totalHeroCounters.frenziedTearProcs += state.frenziedTearProcs;

    // Accumulate per-target
    for (const [tid, dmg] of state.perTargetDamage) {
      totalPerTarget.set(tid, (totalPerTarget.get(tid) ?? 0) + dmg);
    }

    if (iterResult.timeline) {
      capturedTimeline = iterResult.timeline;
    }
    if (iter === 0 && state.combatLogEnabled) {
      capturedCombatLog = state.combatLog;
    }

    // Adaptive early-stop: check convergence at batch boundaries
    if (targetErrorPct !== undefined && actualIters >= MIN_ITERS && actualIters % BATCH_SIZE === 0) {
      const se = dpsAccum.stdDev / Math.sqrt(actualIters);
      const sePct = dpsAccum.mean > 0 ? (se / dpsAccum.mean) * 100 : Infinity;
      // 95% confidence: multiply SE by 1.96 (z-score for 95% CI)
      const confidenceErrorPct = sePct * 1.96;
      if (confidenceErrorPct <= targetErrorPct) {
        break; // Converged — stop early
      }
    }
  }

  // Build final breakdown
  const durationSec = config.durationMs / 1000;
  const iters = actualIters;
  const breakdown: AbilityBreakdown[] = [];
  const totalDmg = dpsAccum.mean * durationSec;

  // Build trinket label map for human-readable breakdown names
  const trinketLabels = new Map<string, string>();
  for (const t of input.trinkets) {
    if (t) trinketLabels.set(`trinket_${t.id}`, t.name);
  }

  for (const [key, data] of totalBreakdown) {
    const avgDmg = data.damage / iters;
    const avgCasts = data.casts / iters;
    const dps = avgDmg / durationSec;
    const spell = SPELL_DB[key];
    const isTrinket = trinketLabels.has(key);
    const avgCrits = data.crits / iters;
    breakdown.push({
      key,
      label: trinketLabels.get(key) ?? spell?.label ?? key,
      damage: Math.round(avgDmg),
      dps: Math.round(dps),
      casts: Math.round(avgCasts * 10) / 10,
      avgHit: avgCasts > 0 ? Math.round(avgDmg / avgCasts) : 0,
      pctOfTotal: totalDmg > 0 ? Math.round((avgDmg / totalDmg) * 1000) / 10 : 0,
      category: isTrinket ? "trinket" : spell?.isPet ? "pet" : "player",
      crits: Math.round(avgCrits * 10) / 10,
      critPct: avgCasts > 0 ? Math.round((avgCrits / avgCasts) * 1000) / 10 : 0,
    });
  }
  breakdown.sort((a, b) => b.dps - a.dps);

  // Per-target output
  const perTarget: Record<number, { damage: number; dps: number }> = {};
  for (const [tid, dmg] of totalPerTarget) {
    const avgDmg = dmg / iters;
    perTarget[tid] = { damage: Math.round(avgDmg), dps: Math.round(avgDmg / durationSec) };
  }

  // Average hero counters
  const avgCounters = {
    sentinelOwlProcs: Math.round(totalHeroCounters.sentinelOwlProcs / iters * 10) / 10,
    lunarStormProcs: Math.round(totalHeroCounters.lunarStormProcs / iters * 10) / 10,
    eyesOfEagleResets: Math.round(totalHeroCounters.eyesOfEagleResets / iters * 10) / 10,
    viciousHuntProcs: Math.round(totalHeroCounters.viciousHuntProcs / iters * 10) / 10,
    packCoordinationProcs: Math.round(totalHeroCounters.packCoordinationProcs / iters * 10) / 10,
    frenziedTearProcs: Math.round(totalHeroCounters.frenziedTearProcs / iters * 10) / 10,
  };

  return {
    meanDps: Math.round(dpsAccum.mean),
    medianDps: Math.round(dpsAccum.percentile(50)),
    stdDev: Math.round(dpsAccum.stdDev),
    minDps: Math.round(dpsAccum.min),
    maxDps: Math.round(dpsAccum.max),
    p5Dps: Math.round(dpsAccum.percentile(5)),
    p95Dps: Math.round(dpsAccum.percentile(95)),
    iterations: iters,
    durationMs: config.durationMs,
    breakdown,
    perTarget,
    heroCounters: avgCounters,
    timeline: capturedTimeline,
    combatLog: capturedCombatLog,
  };
}

// ── Helper: get melee swing timer ─────────────────────────────

function getMeleeSwingMs(input: SimInput): number {
  return input.stats.weapon.type === "2h" ? MELEE_SWING_MS_2H : MELEE_SWING_MS_1H;
}

// ── Helper: compute damage with all multipliers ───────────────

function computeDamage(
  state: CombatState,
  ap: number,
  apCoef: number,
  school: string,
  isPet: boolean,
  rng: RNG,
  bonusCritMult: number = 0,
): { damage: number; isCrit: boolean } {
  let baseDmg = apCoef * ap;

  // Mastery: Spirit Bond
  const mastPct = state.currentMasteryPct;
  const mastBonus = isPet
    ? 1 + mastPct * MASTERY_PET_BONUS
    : 1 + mastPct * MASTERY_PLAYER_BONUS;
  baseDmg *= mastBonus;

  // Versatility
  baseDmg *= 1 + state.currentVersPct / 100;

  // Wyvern's Cry damage bonus — applies to ALL hunter abilities (not just pet)
  // SimC: composite_player_multiplier applies wyverns_cry to all hunter damage
  if (state.wyvernsCryStacks > 0) {
    baseDmg *= 1 + state.wyvernsCryStacks * WYVERN_CRY_PET_DAMAGE_BONUS;
  }

  // Takedown universal +20% damage buff — applies to ALL abilities during window
  // SimC: composite_player_multiplier applies takedown universally
  if (state.takedownActive) {
    baseDmg *= 1.20;
  }

  // Crit
  const critChance = Math.min(1, state.currentCritPct / 100);
  const isCrit = rng.roll() < critChance;
  const critMult = 2.0 + bonusCritMult;
  let damage = isCrit ? baseDmg * critMult : baseDmg;

  // Armor mitigation for physical
  if (school === "physical") {
    damage *= (1 - computeArmorMitigation(BOSS_ARMOR, ARMOR_K));
  }

  return { damage, isCrit };
}

// ── Single iteration ──────────────────────────────────────────

function runIteration(
  state: CombatState,
  rng: RNG,
  prdState: PRDState,
  apl: CompiledAPL,
  input: SimInput,
  captureTimeline: boolean,
  overrideDurationMs?: number,
): { timeline?: TimelineEvent[] } {
  const queue = new EventQueue();
  const timeline: TimelineEvent[] = [];
  const endMs = overrideDurationMs ?? input.config.durationMs;
  const meleeSwingMs = getMeleeSwingMs(input);

  // Schedule initial events
  queue.enqueue({ tMs: 0, priority: EventPriority.AUTO_ATTACK, type: "auto_attack" });
  queue.enqueue({ tMs: 0, priority: EventPriority.GCD_READY, type: "gcd_ready" });

  // FIX #2: Schedule pet auto-attacks
  queue.enqueue({ tMs: 0, priority: EventPriority.AUTO_ATTACK, type: "pet_melee" });
  queue.enqueue({ tMs: PET_CLAW_CD_MS, priority: EventPriority.AUTO_ATTACK, type: "pet_claw" });

  // FIX #8: Schedule off-hand auto attacks for DW
  if (input.stats.weapon.type === "dw" && input.stats.weapon.offHandSpeed) {
    queue.enqueue({ tMs: 0, priority: EventPriority.AUTO_ATTACK, type: "oh_auto_attack" });
  }

  // Pack Leader: schedule first Howl beast summon
  if (input.config.hero === "pack_leader" && input.talents.activeTalents.has("howlOfThePackLeader")) {
    state.cooldowns.init("howl_cd", 1, HOWL_CD_MS);
    queue.enqueue({ tMs: HOWL_CD_MS, priority: EventPriority.CAST_COMPLETE, type: "howl_beast" });
  }

  // Apply pre-pot at pull (potion aura from SimOptions)
  if (input.potionAura) {
    const { stat, amount, durationMs } = input.potionAura;
    state.applyAura("potion", durationMs, 1, { [stat]: amount });
    state.cooldowns.init("potion", 1, 300_000);
    state.cooldowns.use("potion", 0);
  }

  // Initialize trinket cooldowns and apply equip trinkets
  for (const trinket of input.trinkets) {
    if (!trinket) continue;
    const cdKey = `trinket_${trinket.id}`;
    switch (trinket.type) {
      case "on_use": {
        const cdMs = (trinket.onUseCD ?? 120) * 1000;
        state.cooldowns.init(cdKey, 1, cdMs);
        break;
      }
      case "proc": {
        const icdMs = (trinket.procICD ?? 0) * 1000;
        if (icdMs > 0) {
          state.cooldowns.init(cdKey, 1, icdMs);
        }
        break;
      }
      case "equip": {
        if (trinket.primaryAgi > 0) {
          state.applyAura(cdKey, endMs + 10_000, 1, { agi: trinket.primaryAgi });
        }
        break;
      }
    }
  }

  // Main event loop
  while (queue.size > 0) {
    const event = queue.dequeue()!;
    if (event.tMs > endMs) break;

    state.nowMs = event.tMs;
    state.updateFocus(event.tMs);
    state.tickAuras();

    switch (event.type) {
      case "gcd_ready":
        handleGcdReady(state, rng, prdState, queue, apl, input, timeline, captureTimeline);
        break;

      case "auto_attack":
        handleAutoAttack(state, rng, prdState, queue, input, timeline, captureTimeline, meleeSwingMs);
        break;

      case "oh_auto_attack":
        handleOffHandAutoAttack(state, rng, queue, input, timeline, captureTimeline);
        break;

      case "pet_melee":
        handlePetMelee(state, rng, queue, input, endMs);
        break;

      case "pet_claw":
        handlePetClaw(state, rng, queue, input, endMs);
        break;

      case "dot_tick":
        handleDotTick(state, rng, queue, event, timeline, captureTimeline);
        break;

      case "aura_expire":
        handleAuraExpire(state, event);
        break;

      case "howl_beast":
        handleHowlBeast(state, rng, queue, input, endMs);
        break;

      case "bear_melee":
        handleBearMelee(state, rng, queue, endMs);
        break;

      case "stampede_tick":
        handleStampedeTick(state, rng, queue, endMs);
        break;

      case "cooldown_ready":
        break;
    }

    // Process trinket procs on applicable events
    if (event.type === "gcd_ready" || event.type === "auto_attack") {
      processTrinkets(state, rng, input, event.type);
    }

    // Process weapon enhancement damage procs
    if (input.weaponProc && event.type === "auto_attack") {
      processWeaponProc(state, rng, input, meleeSwingMs);
    }
  }

  return { timeline: captureTimeline ? timeline : undefined };
}

// ── Event handlers ────────────────────────────────────────────

function handleGcdReady(
  state: CombatState,
  rng: RNG,
  prdState: PRDState,
  queue: EventQueue,
  apl: CompiledAPL,
  input: SimInput,
  timeline: TimelineEvent[],
  capture: boolean,
): void {
  const ability = evaluateAPL(apl, state, input.talents.activeTalents);
  if (!ability) {
    queue.enqueue({ tMs: state.nowMs + 100, priority: EventPriority.GCD_READY, type: "gcd_ready" });
    return;
  }

  const spell = SPELL_DB[ability];
  if (!spell) {
    queue.enqueue({ tMs: state.nowMs + 100, priority: EventPriority.GCD_READY, type: "gcd_ready" });
    return;
  }

  // Execute ability
  executeAbility(state, rng, prdState, queue, spell, input, timeline, capture);

  // Schedule next GCD
  const hasteMult = 1 + state.currentHastePct / 100;
  const gcdMs = spell.triggersGcd ? Math.max(COMBAT_MECHANICS.minGcdMs, Math.round(BASE_GCD_MS / hasteMult)) : 0;

  if (gcdMs > 0) {
    state.gcdReadyMs = state.nowMs + gcdMs;
    queue.enqueue({ tMs: state.gcdReadyMs, priority: EventPriority.GCD_READY, type: "gcd_ready" });
  } else {
    queue.enqueue({ tMs: state.nowMs + 50, priority: EventPriority.GCD_READY, type: "gcd_ready" });
  }
}

function executeAbility(
  state: CombatState,
  rng: RNG,
  prdState: PRDState,
  queue: EventQueue,
  spell: SpellInfo,
  input: SimInput,
  timeline: TimelineEvent[],
  capture: boolean,
): void {
  // Spend/gain focus
  if (spell.focusCost > 0) {
    state.focus -= spell.focusCost;
    state.logFocus(spell.key, -spell.focusCost, "spend");
  } else if (spell.focusCost < 0) {
    const gained = -spell.focusCost;
    state.focus = Math.min(state.maxFocus, state.focus + gained);
    state.logFocus(spell.key, gained, "gain");
  }

  // Use cooldown
  if (spell.cooldownMs > 0) {
    state.cooldowns.use(spell.key, state.nowMs);
    if (state.combatLogEnabled) {
      state.combatLog.push({ tMs: state.nowMs, type: "cooldown_use", ability: spell.key, detail: `CD ${(spell.cooldownMs / 1000).toFixed(1)}s` });
    }
  }

  // FIX #3: AP = Agility (not doubled). Pet AP = hunter AP * 0.6
  const isPet = spell.isPet;
  const ap = isPet ? state.currentAP * PET_AP_SCALING : state.currentAP;
  let baseDmg = spell.apCoef * ap;

  // FIX #7: Mastery: Spirit Bond with correct coefficient
  const mastBonus = isPet
    ? 1 + state.currentMasteryPct * MASTERY_PET_BONUS
    : 1 + state.currentMasteryPct * MASTERY_PLAYER_BONUS;
  baseDmg *= mastBonus;

  // Versatility
  baseDmg *= 1 + state.currentVersPct / 100;

  // FIX #4: Mongoose Fury stacks (+15% per stack)
  // Only affects melee abilities: Raptor Strike, Carve, Raptor Swipe (per SimC)
  if (state.mongooseFuryStacks > 0 && isAffectedByMongooseFury(spell.key)) {
    baseDmg *= 1 + state.mongooseFuryStacks * MONGOOSE_FURY_DAMAGE_PER_STACK;
  }

  // Wyvern's Cry damage bonus — applies to ALL hunter abilities (not just pet)
  // SimC: composite_player_multiplier applies wyverns_cry to all hunter damage
  if (state.wyvernsCryStacks > 0) {
    baseDmg *= 1 + state.wyvernsCryStacks * WYVERN_CRY_PET_DAMAGE_BONUS;
  }

  // Tip of the Spear consumption + Strike as One trigger
  // Primal Surge: increases TotS damage per stack from 25% → 30%
  let consumedTip = false;
  let totsMult = 1.0; // Store for Raptor Swipe inheritance
  if (spell.consumesTots && state.tipOfTheSpearStacks > 0) {
    const totsDmgPerStack = input.talents.activeTalents.has("primalSurge")
      ? TALENT_EFFECTS.primal_surge_tots_dmg_per_stack
      : TIP_DAMAGE_PER_STACK;
    totsMult = 1 + state.tipOfTheSpearStacks * totsDmgPerStack;
    baseDmg *= totsMult;
    state.tipOfTheSpearStacks = 0;
    consumedTip = true;
  }

  // Kill Command grants ToTS stacks
  // Primal Surge: KC grants +1 additional TotS stack (2 total per KC)
  if (spell.grantsTotsStack) {
    const extraStacks = input.talents.activeTalents.has("primalSurge")
      ? TALENT_EFFECTS.primal_surge_extra_stacks : 0;
    const stacksToGrant = 1 + extraStacks;
    state.tipOfTheSpearStacks = Math.min(TIP_MAX_STACKS, state.tipOfTheSpearStacks + stacksToGrant);
  }

  // Lethal Barbs (sic_em): Kill Command and Raptor Strike generate bonus focus
  // In SimC, this generates ~2047 focus over 300s = ~6.8 focus/sec via procs
  if (input.talents.activeTalents.has("sicEm") || input.talents.activeTalents.has("lethalBarbs")) {
    if (spell.key === "kill_command" || spell.key === "raptor_strike") {
      state.focus = Math.min(state.maxFocus, state.focus + FOCUS_VALUES.lethal_barbs_bonus);
      state.logFocus("lethal_barbs", FOCUS_VALUES.lethal_barbs_bonus, "gain");
    }
  }

  // Takedown: apply buff when cast + pet component
  if (spell.key === "takedown") {
    state.takedownActive = true;
    state.takedownExpiresMs = state.nowMs + TAKEDOWN_DURATION_MS;
    state.logProc("takedown", `Takedown active — 20% damage amp for ${(TAKEDOWN_DURATION_MS / 1000).toFixed(0)}s`);

    // Pet Takedown component: pet does its own strike — merged under 'takedown' key to match Raidbots
    // Use recordDamageNoCast so pet component doesn't inflate cast count (6.9 → 3.4)
    const petAp = state.currentAP * PET_AP_SCALING;
    const { damage: petTdDmg, isCrit: petTdCrit } = computeDamage(
      state, petAp, AP.takedown_pet, "physical", true, rng,
    );
    state.recordDamageNoCast("takedown", petTdDmg, petTdCrit, 0);

    // Second potion use: align with Takedown
    if (input.potionAura && state.cooldowns.isReady("potion", state.nowMs) && state.nowMs > 0) {
      const { stat, amount, durationMs } = input.potionAura;
      state.applyAura("potion", durationMs, 1, { [stat]: amount });
      state.cooldowns.use("potion", state.nowMs);
    }
  }

  // Twin Fangs: Takedown grants 3 TotS stacks
  if (spell.key === "takedown" && input.talents.activeTalents.has("twinFangs")) {
    state.tipOfTheSpearStacks = Math.min(TIP_MAX_STACKS,
      state.tipOfTheSpearStacks + TALENT_EFFECTS.twin_fangs_takedown_tots);
  }

  // Takedown: +20% damage during window — applies to ALL abilities (universal buff)
  // SimC: composite_player_multiplier applies takedown buff universally
  if (state.takedownActive && spell.key !== "takedown") {
    baseDmg *= 1.20;
  }

  // ── Talent damage modifiers ──────────────────────────────────

  // Sweeping Spear: +10% Raptor Strike damage per rank (2 ranks = +20%)
  // Applies to both Raptor Strike and its Raptor Swipe proc (same action in SimC)
  if (spell.key === "raptor_strike" && input.talents.activeTalents.has("sweepingSpear")) {
    baseDmg *= 1 + TALENT_EFFECTS.sweeping_spear_rs_pct_per_rank * 2;
  }

  // Killer Companion: +10% Kill Command damage per rank (2 ranks = +20%)
  if (spell.key === "kill_command" && input.talents.activeTalents.has("killerCompanion")) {
    baseDmg *= 1 + TALENT_EFFECTS.killer_companion_kc_pct_per_rank * 2;
  }

  // Wildfire Infusion: +15% Kill Command damage
  if (spell.key === "kill_command" && input.talents.activeTalents.has("wildfireInfusion")) {
    baseDmg *= 1 + TALENT_EFFECTS.wildfire_infusion_kc_pct;
  }

  // Shellshock: Boomstick +40% ST damage, -5% per additional target
  if (spell.key === "boomstick" && input.talents.activeTalents.has("shellshock")) {
    const shellshockBonus = Math.max(0,
      BUFF_DURATIONS.shellshock.stBonusPct - (state.numTargets - 1) * BUFF_DURATIONS.shellshock.reductionPerTarget);
    baseDmg *= 1 + shellshockBonus;
  }

  // Flanked: Takedown +50% damage
  if (spell.key === "takedown" && input.talents.activeTalents.has("flanked")) {
    baseDmg *= 1 + TALENT_EFFECTS.flanked_takedown_dmg_pct;
  }

  // Crit calculation
  const critMult = 2.0 + spell.bonusCritMult;
  const critChance = Math.min(1, state.currentCritPct / 100);
  const isCrit = rng.roll() < critChance;
  const damage = isCrit ? baseDmg * critMult : baseDmg;

  // Armor mitigation for physical
  let finalDamage = damage;
  if (spell.school === "physical") {
    finalDamage *= (1 - computeArmorMitigation(BOSS_ARMOR, ARMOR_K));
  }

  // AoE target scaling
  // Flanked: Takedown strikes 4 additional nearby targets
  const aoeRule = AOE_RULES[spell.key];
  let effectiveTargets = aoeRule
    ? Math.min(state.numTargets, aoeRule.targetCap)
    : 1;
  if (spell.key === "takedown" && input.talents.activeTalents.has("flanked")) {
    effectiveTargets = Math.min(state.numTargets, 1 + TALENT_EFFECTS.flanked_extra_targets);
  }

  for (let t = 0; t < effectiveTargets; t++) {
    let targetDmg = aoeRule?.splitDamage ? finalDamage / effectiveTargets : finalDamage;
    // WFB primary target bonus: +60% damage to the main target (target 0)
    // SimC: wildfireBombPrimaryTargetBonus = "effectN(2).percent()" = 60%
    if (spell.key === "wildfire_bomb" && t === 0) {
      targetDmg *= 1 + AP.wildfire_bomb_primary_bonus;
    }
    state.recordDamage(spell.key, targetDmg, isCrit, t);
  }

  // Apply DoTs if applicable
  applySpellDots(state, spell, queue, input);

  // Bloodseeker: +10% attack speed per bleeding target (multiplicative, NOT haste)
  // SimC: s /= 1 + buffs.bloodseeker->check_stack_value() where default_value = 0.10
  if (input.talents.activeTalents.has("bloodseeker")) {
    let bleedingTargets = 0;
    for (const t of state.targets) {
      if (t.dots.size > 0) bleedingTargets++;
    }
    state.bloodseekerStacks = bleedingTargets;
  }

  // Wildfire Infusion: Kill Command reduces Wildfire Bomb cooldown by 1s
  if (spell.key === "kill_command" && input.talents.activeTalents.has("wildfireInfusion")) {
    state.cooldowns.reduceCooldown("wildfire_bomb", TALENT_EFFECTS.wildfire_infusion_wfb_cdr_ms, state.nowMs);
  }

  // FIX #4: Raptor Strike triggers Mongoose Fury stack
  // Refresh behavior: DISABLED — new stacks do NOT extend duration (per SimC set_refresh_behavior)
  if (spell.key === "raptor_strike" && input.talents.activeTalents.has("mongooseFury")) {
    if (state.mongooseFuryStacks === 0) {
      // First stack: start the 14s timer
      state.mongooseFuryExpiresMs = state.nowMs + MONGOOSE_FURY_DURATION_MS;
    }
    const oldStacks = state.mongooseFuryStacks;
    state.mongooseFuryStacks = Math.min(MONGOOSE_FURY_MAX_STACKS, state.mongooseFuryStacks + 1);
    state.logProc("mongoose_fury", `Mongoose Fury ${oldStacks} → ${state.mongooseFuryStacks}`);
  }

  // FIX #5: Strike as One triggers when Tip of the Spear is consumed (per SimC)
  if (consumedTip && input.talents.activeTalents.has("strikeAsOne")) {
    const saoSpell = SPELL_DB["strike_as_one"];
    if (saoSpell) {
      const petAp = state.currentAP * PET_AP_SCALING;
      const { damage: saoDmg, isCrit: saoCrit } = computeDamage(
        state, petAp, saoSpell.apCoef, saoSpell.school, true, rng,
      );
      const saoTargets = Math.min(state.numTargets, 1);
      for (let t = 0; t < saoTargets; t++) {
        state.recordDamage("strike_as_one", saoDmg, saoCrit, t);
      }
      // Strike as One pet attack counts for pack counter
      if (input.config.hero === "pack_leader") {
        incrementPackCounter(state, input, rng);
      }
    }
  }

  // Hero talent triggers
  if (input.config.hero === "sentinel") {
    handleSentinelTriggers(state, rng, prdState, queue, spell, input, timeline, capture);
  } else {
    handlePackLeaderTriggers(state, rng, prdState, queue, spell, input, timeline, capture);
  }

  // Tier set interactions
  handleTierInteractions(state, rng, spell, input);

  // Raptor Swipe proc — in Midnight 12.0, Raptor Swipe is a guaranteed proc from Raptor Strike
  // (SimC data shows ~100% proc rate: 55.8 swipes from 56.4 raptor strikes)
  if (spell.key === "raptor_strike" && input.talents.activeTalents.has("raptorSwipe")) {
    {
      const swipeSpell = SPELL_DB["raptor_swipe"];
      if (swipeSpell) {
        const swipeAp = state.currentAP;
        let swipeDmg = swipeSpell.apCoef * swipeAp;

        // Apply mastery
        swipeDmg *= 1 + state.currentMasteryPct * MASTERY_PLAYER_BONUS;
        // Versatility
        swipeDmg *= 1 + state.currentVersPct / 100;
        // Tip of the Spear: Swipe inherits TotS multiplier from the RS that triggered it
        swipeDmg *= totsMult;
        // NOTE: Sweeping Spear does NOT apply to Swipe proc — only to RS direct hit
        // (SimC: sweeping_spear only modifies raptor_strike damage, not the swipe proc)
        // Mongoose Fury affects Raptor Swipe (melee ability)
        if (state.mongooseFuryStacks > 0) {
          swipeDmg *= 1 + state.mongooseFuryStacks * MONGOOSE_FURY_DAMAGE_PER_STACK;
        }
        // Wyvern's Cry (universal)
        if (state.wyvernsCryStacks > 0) {
          swipeDmg *= 1 + state.wyvernsCryStacks * WYVERN_CRY_PET_DAMAGE_BONUS;
        }
        // Takedown universal buff
        if (state.takedownActive) {
          swipeDmg *= 1.20;
        }

        // Crit
        const critChance = Math.min(1, state.currentCritPct / 100);
        const swipeCrit = rng.roll() < critChance;
        if (swipeCrit) swipeDmg *= 2.0;

        // Armor
        if (swipeSpell.school === "physical") {
          swipeDmg *= (1 - computeArmorMitigation(BOSS_ARMOR, ARMOR_K));
        }

        const swipeTargets = Math.min(state.numTargets, 5);
        for (let t = 0; t < swipeTargets; t++) {
          state.recordDamage("raptor_swipe", swipeDmg, swipeCrit, t);
        }

        // Raptor Swipe does NOT trigger Strike as One separately.
        // SAO only fires from TotS consumption on the base Raptor Strike (line 736).
      }
    }
  }

  // Kill Command: trigger Howl consumption for Pack Leader
  if (spell.key === "kill_command" && input.config.hero === "pack_leader") {
    consumeHowlBeasts(state, rng, queue, input);
  }

  // Timeline capture
  if (capture) {
    timeline.push({
      tMs: state.nowMs,
      type: "cast",
      ability: spell.key,
      damage: Math.round(finalDamage * effectiveTargets),
      target: 0,
    });
  }
  // Cast event in combat log
  if (state.combatLogEnabled) {
    state.combatLog.push({
      tMs: state.nowMs,
      type: "cast",
      ability: spell.key,
      damage: Math.round(finalDamage * effectiveTargets),
      focus: Math.round(state.focus),
      detail: `${spell.label || spell.key}${isCrit ? " (CRIT)" : ""}`,
    });
  }
}

// ── Mongoose Fury: which abilities are affected ───────────────

function isAffectedByMongooseFury(key: string): boolean {
  // Mongoose Fury only affects melee abilities (per SimC: composite_melee_auto_attack)
  // Does NOT affect ranged abilities like WFB, Boomstick, KC, Flamefang Pitch
  return key === "raptor_strike" || key === "raptor_swipe" || key === "carve";
}

// ── Pack Counter helper ───────────────────────────────────────

function incrementPackCounter(state: CombatState, input: SimInput, rng: RNG): void {
  state.packCounter++;
  if (state.packCounter >= 4 && input.talents.activeTalents.has("packCoordination")) {
    state.packCounter = 0;
    state.packCoordinationProcs++;
    state.logProc("pack_coordination", "Pack Coordination triggered");

    const pcSpell = SPELL_DB["pack_coordination"];
    if (pcSpell) {
      const { damage: pcDmg, isCrit: pcCrit } = computeDamage(
        state, state.currentAP, pcSpell.apCoef, pcSpell.school, false, rng,
      );
      state.recordDamage("pack_coordination", pcDmg, pcCrit, 0);
    }
  }
}

// ── Auto attack handlers ─────────────────────────────────────

function handleAutoAttack(
  state: CombatState,
  rng: RNG,
  prdState: PRDState,
  queue: EventQueue,
  input: SimInput,
  timeline: TimelineEvent[],
  capture: boolean,
  meleeSwingMs: number,
): void {
  const ap = state.currentAP;

  // Miss check: Raidbots shows ~19% miss rate on player melee autos
  // (dodge 3% + parry 3% + miss 3% + glancing ~10%)
  const MELEE_MISS_RATE = 0.19;
  if (rng.roll() < MELEE_MISS_RATE) {
    // Miss — schedule next swing and return
    const hasteMult = 1 + state.currentHastePct / 100;
    const bloodseekerMult = 1 + state.bloodseekerStacks * BLOODSEEKER_ATTACK_SPEED_PER_TARGET;
    const flankedAsMult = state.takedownActive && input.talents.activeTalents.has("flanked") ? 2.0 : 1.0;
    const swingMs = Math.round(meleeSwingMs / (hasteMult * bloodseekerMult * flankedAsMult));
    queue.enqueue({ tMs: state.nowMs + swingMs, priority: EventPriority.AUTO_ATTACK, type: "auto_attack" });
    return;
  }

  // Auto attack damage = weapon_DPS * weapon_speed * modifiers
  const weaponSpeed = input.stats.weapon.mainHandSpeed;
  const weaponDps = input.stats.weapon.mainHandDps;
  let dmg = (weaponDps * weaponSpeed + ap * weaponSpeed / WEAPON_NORMS.twoHand)
    * (1 + state.currentMasteryPct * MASTERY_PLAYER_BONUS)
    * (1 + state.currentVersPct / 100);

  // Wyvern's Cry applies to all hunter damage including autos
  if (state.wyvernsCryStacks > 0) {
    dmg *= 1 + state.wyvernsCryStacks * WYVERN_CRY_PET_DAMAGE_BONUS;
  }

  // Takedown universal damage buff applies to autos
  if (state.takedownActive) {
    dmg *= 1.20;
  }

  const critChance = Math.min(1, state.currentCritPct / 100);
  const isCrit = rng.roll() < critChance;
  if (isCrit) dmg *= 2.0;

  // Armor
  dmg *= (1 - computeArmorMitigation(BOSS_ARMOR, ARMOR_K));

  state.recordDamage("auto_attack", dmg, isCrit, 0);

  // Schedule next auto (Bloodseeker: multiplicative attack speed bonus)
  const hasteMult = 1 + state.currentHastePct / 100;
  const bloodseekerMult = 1 + state.bloodseekerStacks * BLOODSEEKER_ATTACK_SPEED_PER_TARGET;
  const flankedAsMult = state.takedownActive && input.talents.activeTalents.has("flanked") ? 2.0 : 1.0;
  const swingMs = Math.round(meleeSwingMs / (hasteMult * bloodseekerMult * flankedAsMult));
  queue.enqueue({ tMs: state.nowMs + swingMs, priority: EventPriority.AUTO_ATTACK, type: "auto_attack" });

  if (capture) {
    timeline.push({ tMs: state.nowMs, type: "auto", ability: "auto_attack", damage: Math.round(dmg) });
  }
}

// FIX #8: Off-hand auto attack for DW
function handleOffHandAutoAttack(
  state: CombatState,
  rng: RNG,
  queue: EventQueue,
  input: SimInput,
  timeline: TimelineEvent[],
  capture: boolean,
): void {
  if (!input.stats.weapon.offHandDps || !input.stats.weapon.offHandSpeed) return;

  const ap = state.currentAP;
  const ohSpeed = input.stats.weapon.offHandSpeed;
  const ohDps = input.stats.weapon.offHandDps;

  // Miss check: ~19% miss rate on OH autos (same as MH)
  const MELEE_MISS_RATE = 0.19;
  if (rng.roll() < MELEE_MISS_RATE) {
    const hasteMult = 1 + state.currentHastePct / 100;
    const bloodseekerMult = 1 + state.bloodseekerStacks * BLOODSEEKER_ATTACK_SPEED_PER_TARGET;
    const flankedAsMult = state.takedownActive && input.talents.activeTalents.has("flanked") ? 2.0 : 1.0;
    const swingMs = Math.round((ohSpeed * 1000) / (hasteMult * bloodseekerMult * flankedAsMult));
    queue.enqueue({ tMs: state.nowMs + swingMs, priority: EventPriority.AUTO_ATTACK, type: "oh_auto_attack" });
    return;
  }

  // Off-hand deals 50% of main-hand damage
  let dmg = (ohDps * ohSpeed + ap * ohSpeed / WEAPON_NORMS.twoHand) * COMBAT_MECHANICS.offHandPenalty
    * (1 + state.currentMasteryPct * MASTERY_PLAYER_BONUS)
    * (1 + state.currentVersPct / 100);

  // Wyvern's Cry applies to all hunter damage
  if (state.wyvernsCryStacks > 0) {
    dmg *= 1 + state.wyvernsCryStacks * WYVERN_CRY_PET_DAMAGE_BONUS;
  }
  // Takedown universal damage buff
  if (state.takedownActive) {
    dmg *= 1.20;
  }

  const critChance = Math.min(1, state.currentCritPct / 100);
  const isCrit = rng.roll() < critChance;
  if (isCrit) dmg *= 2.0;

  dmg *= (1 - computeArmorMitigation(BOSS_ARMOR, ARMOR_K));

  state.recordDamage("oh_auto_attack", dmg, isCrit, 0);

  const hasteMult = 1 + state.currentHastePct / 100;
  const bloodseekerMult = 1 + state.bloodseekerStacks * BLOODSEEKER_ATTACK_SPEED_PER_TARGET;
  const flankedAsMult = state.takedownActive && input.talents.activeTalents.has("flanked") ? 2.0 : 1.0;
  const swingMs = Math.round((ohSpeed * 1000) / (hasteMult * bloodseekerMult * flankedAsMult));
  queue.enqueue({ tMs: state.nowMs + swingMs, priority: EventPriority.AUTO_ATTACK, type: "oh_auto_attack" });

  if (capture) {
    timeline.push({ tMs: state.nowMs, type: "auto", ability: "oh_auto_attack", damage: Math.round(dmg) });
  }
}

// FIX #2: Pet auto-attacks

function handlePetMelee(
  state: CombatState,
  rng: RNG,
  queue: EventQueue,
  input: SimInput,
  endMs: number,
): void {
  const petAp = state.currentAP * PET_AP_SCALING;
  const spell = SPELL_DB["pet_melee"];
  if (!spell) return;

  const { damage: dmg, isCrit } = computeDamage(
    state, petAp, spell.apCoef, spell.school, true, rng,
  );
  // Pet melee is physical, armor already applied by computeDamage
  state.recordDamage("pet_melee", dmg, isCrit, 0);

  // Schedule next pet melee (Bloodseeker affects pet attack speed too)
  const hasteMult = 1 + state.currentHastePct / 100;
  const bloodseekerMult = 1 + state.bloodseekerStacks * BLOODSEEKER_ATTACK_SPEED_PER_TARGET;
  const nextMs = state.nowMs + Math.round(PET_SWING_MS / (hasteMult * bloodseekerMult));
  if (nextMs <= endMs) {
    queue.enqueue({ tMs: nextMs, priority: EventPriority.AUTO_ATTACK, type: "pet_melee" });
  }
}

function handlePetClaw(
  state: CombatState,
  rng: RNG,
  queue: EventQueue,
  input: SimInput,
  endMs: number,
): void {
  const petAp = state.currentAP * PET_AP_SCALING;
  const spell = SPELL_DB["pet_claw"];
  if (!spell) return;

  const { damage: dmg, isCrit } = computeDamage(
    state, petAp, spell.apCoef, spell.school, true, rng,
  );
  state.recordDamage("pet_claw", dmg, isCrit, 0);

  // Pet Claw counts for pack counter
  if (input.config.hero === "pack_leader") {
    incrementPackCounter(state, input, rng);
  }

  // Schedule next claw (Bloodseeker affects pet too)
  const hasteMult = 1 + state.currentHastePct / 100;
  const bloodseekerMult = 1 + state.bloodseekerStacks * BLOODSEEKER_ATTACK_SPEED_PER_TARGET;
  const nextMs = state.nowMs + Math.round(PET_CLAW_CD_MS / (hasteMult * bloodseekerMult));
  if (nextMs <= endMs) {
    queue.enqueue({ tMs: nextMs, priority: EventPriority.AUTO_ATTACK, type: "pet_claw" });
  }
}

// FIX #1: DoT tick handler (now properly uses queue)

function handleDotTick(
  state: CombatState,
  rng: RNG,
  queue: EventQueue,
  event: SimEvent,
  timeline: TimelineEvent[],
  capture: boolean,
): void {
  const payload = event.payload as { dotKey: string; targetId: number } | undefined;
  if (!payload) return;

  const target = state.targets[payload.targetId];
  if (!target) return;

  const dot = target.dots.get(payload.dotKey);
  if (!dot || state.nowMs >= dot.expiresMs) {
    target.dots.delete(payload.dotKey);
    return;
  }

  // Calculate tick damage
  const ap = dot.snapshotAP > 0 ? dot.snapshotAP : state.currentAP;
  let dmg = dot.apCoefPerTick * ap
    * (1 + state.currentMasteryPct * MASTERY_PLAYER_BONUS)
    * (1 + state.currentVersPct / 100);

  // Wyvern's Cry universal damage bonus applies to DoT ticks too
  if (state.wyvernsCryStacks > 0) {
    dmg *= 1 + state.wyvernsCryStacks * WYVERN_CRY_PET_DAMAGE_BONUS;
  }

  // Takedown universal +20% applies to DoT ticks
  if (state.takedownActive) {
    dmg *= 1.20;
  }

  if (!dot.bypassesArmor && dot.school === "physical") {
    dmg *= (1 - computeArmorMitigation(BOSS_ARMOR, ARMOR_K));
  }

  const critChance = Math.min(1, state.currentCritPct / 100);
  const isCrit = rng.roll() < critChance;
  if (isCrit) dmg *= 2.0;

  state.recordDamage(payload.dotKey, dmg, isCrit, payload.targetId);

  if (capture) {
    timeline.push({ tMs: state.nowMs, type: "dot_tick", ability: payload.dotKey, damage: Math.round(dmg), target: payload.targetId });
  }

  // FIX #1: Schedule next tick via queue
  dot.nextTickMs = state.nowMs + dot.tickIntervalMs;
  if (dot.nextTickMs < dot.expiresMs) {
    queue.enqueue({
      tMs: dot.nextTickMs,
      priority: EventPriority.DOT_TICK,
      type: "dot_tick",
      payload: { dotKey: payload.dotKey, targetId: payload.targetId },
    });
  }
}

function handleAuraExpire(state: CombatState, event: SimEvent): void {
  const key = event.payload as string;
  if (key) state.removeAura(key);
}

// ── FIX #6: Pack Leader hero beast handlers ──────────────────

function handleHowlBeast(
  state: CombatState,
  rng: RNG,
  queue: EventQueue,
  input: SimInput,
  endMs: number,
): void {
  // Cycle: Wyvern → Boar → Bear
  const cycle = state.howlBeastCycle % 3;
  state.howlBeastCycle++;

  if (cycle === 0) {
    // Wyvern: grants Wyvern's Cry stacking buff
    state.wyvernsCryStacks = Math.min(10, state.wyvernsCryStacks + 3);
    // Wyvern's Cry expires after ~20s
    state.wyvernsCryExpiresMs = state.nowMs + 20000;
  } else if (cycle === 1) {
    // Boar: Boar Charge direct + cleave damage
    // Boar charge uses hunter AP (hunter_ranged_attack_t in SimC)
    const boarAp = BOAR_CHARGE_USES_HUNTER_AP ? state.currentAP : state.currentAP * PET_AP_SCALING;
    const { damage: chargeDmg, isCrit: chargeCrit } = computeDamage(
      state, boarAp, BOAR_CHARGE_AP_COEF, "physical", false, rng,
    );
    state.recordDamage("boar_charge", chargeDmg, chargeCrit, 0);

    // Cleave on additional targets
    if (state.numTargets > 1) {
      const { damage: cleaveDmg, isCrit: cleaveCrit } = computeDamage(
        state, boarAp, BOAR_CHARGE_CLEAVE_AP_COEF, "physical", false, rng,
      );
      for (let t = 1; t < Math.min(state.numTargets, 5); t++) {
        state.recordDamage("boar_charge", cleaveDmg, cleaveCrit, t);
      }
    }
  } else {
    // Bear: Summon bear that melees and applies Rend
    // Apply bear rend DoT
    const bearRendDot = {
      key: "bear_rend",
      spellKey: "bear_rend",
      pandemic: false,
      durationMs: BEAR_REND_DURATION_MS,
      tickIntervalMs: BEAR_REND_TICK_MS,
      apCoef: BEAR_REND_AP_COEF_PER_TICK,
      snapshots: ["ap" as const],
      school: "physical" as const,
      bypassesArmor: true,
      aoeTargetCap: 1,
    };
    applyDot(state, queue, "bear_rend", 0, bearRendDot, state.currentAP * PET_AP_SCALING);

    // Schedule bear melee attacks for duration
    const bearEndMs = Math.min(state.nowMs + BEAR_DURATION_MS, endMs);
    let nextBearMs = state.nowMs + PET_SWING_MS;
    while (nextBearMs <= bearEndMs) {
      queue.enqueue({ tMs: nextBearMs, priority: EventPriority.AUTO_ATTACK, type: "bear_melee" });
      nextBearMs += PET_SWING_MS;
    }
  }

  // Stampede: triggers when any beast is consumed during KC
  // (handled in consumeHowlBeasts)

  // Schedule next howl beast
  const nextMs = state.nowMs + HOWL_CD_MS;
  if (nextMs <= endMs) {
    queue.enqueue({ tMs: nextMs, priority: EventPriority.CAST_COMPLETE, type: "howl_beast" });
  }
}

function handleBearMelee(
  state: CombatState,
  rng: RNG,
  queue: EventQueue,
  endMs: number,
): void {
  const petAp = state.currentAP * PET_AP_SCALING;
  const { damage: dmg, isCrit } = computeDamage(
    state, petAp, BEAR_MELEE_AP_COEF, "physical", true, rng,
  );
  state.recordDamage("bear_melee", dmg, isCrit, 0);
}

function consumeHowlBeasts(
  state: CombatState,
  rng: RNG,
  queue: EventQueue,
  input: SimInput,
): void {
  // When Kill Command fires, check if a beast buff is ready to consume
  // In SimC this cycles through ready beast buffs
  if (!input.talents.activeTalents.has("howlOfThePackLeader")) return;

  // Stampede: triggers when Takedown is active (aligned with CD, ~5.3 procs per fight)
  // In SimC: stampede fires during Takedown window when a beast is consumed
  if (state.takedownActive && !state.stampedePending) {
    state.stampedePending = true;
    // Schedule stampede ticks
    const endMs = input.config.durationMs;
    let tickMs = state.nowMs + STAMPEDE_TICK_MS;
    const stampEndMs = Math.min(state.nowMs + STAMPEDE_DURATION_MS, endMs);
    while (tickMs <= stampEndMs) {
      queue.enqueue({ tMs: tickMs, priority: EventPriority.DOT_TICK, type: "stampede_tick" });
      tickMs += STAMPEDE_TICK_MS;
    }
  }

  // Reset stampede flag when takedown expires
  if (!state.takedownActive) {
    state.stampedePending = false;
  }

  // Pack Mentality: beast consumption reduces WFB CD
  state.cooldowns.reduceCooldown("wildfire_bomb", 1000, state.nowMs);
}

function handleStampedeTick(
  state: CombatState,
  rng: RNG,
  queue: EventQueue,
  endMs: number,
): void {
  // Stampede uses hunter AP directly (hunter_ranged_attack_t in SimC), NOT pet AP
  const hunterAp = state.currentAP;
  const { damage: dmg, isCrit } = computeDamage(
    state, hunterAp, STAMPEDE_AP_COEF, "physical", false, rng,
  );
  state.recordDamage("stampede", dmg, isCrit, 0);
}

// ── Hero talent triggers ──────────────────────────────────────

function handleSentinelTriggers(
  state: CombatState,
  rng: RNG,
  prdState: PRDState,
  queue: EventQueue,
  spell: SpellInfo,
  input: SimInput,
  timeline: TimelineEvent[],
  capture: boolean,
): void {
  const talents = input.talents.activeTalents;

  // Sentinel counter: KC and auto attacks increment
  if (spell.key === "kill_command" || spell.key === "auto_attack") {
    state.sentinelCounter++;

    if (state.sentinelCounter >= SENTINEL_COUNTER.threshold) {
      state.sentinelCounter = 0;
      state.sentinelOwlProcs++;
      state.logProc("sentinel_owl", "Sentinel Owl summoned");

      // Sentinel Owl damage
      const owlSpell = SPELL_DB["sentinel_owl"];
      if (owlSpell) {
        const petAp = state.currentAP; // Owl uses full AP
        const { damage: owlDmg, isCrit: owlCrit } = computeDamage(
          state, petAp, owlSpell.apCoef, owlSpell.school, false, rng,
        );
        const targets = Math.min(state.numTargets, 8);
        for (let t = 0; t < targets; t++) {
          state.recordDamage("sentinel_owl", owlDmg, owlCrit, t);
        }
      }

      // Sentinel's Wisdom: +3% crit per owl proc, stacks to 5
      state.sentinelWisdomStacks = Math.min(BUFF_DURATIONS.sentinels_wisdom.maxStacks, state.sentinelWisdomStacks + 1);
      state.applyAura("sentinels_wisdom", BUFF_DURATIONS.sentinels_wisdom.durationMs, BUFF_DURATIONS.sentinels_wisdom.maxStacks, { crit: (BUFF_DURATIONS.sentinels_wisdom.critPctPerStack / 100) * COMBAT_RATINGS.crit });

      // PRD roll: 30% chance Lunar Storm
      if (talents.has("lunarStorm")) {
        if (rollPRD("lunar_storm", PROC_CHANCES.lunar_storm, rng, prdState)) {
          state.lunarStormProcs++;
          state.logProc("lunar_storm", "Lunar Storm proc");
          const dotInfo = DOT_DB["lunar_storm_dot"];
          if (dotInfo) {
            for (let t = 0; t < Math.min(state.numTargets, 5); t++) {
              applyDot(state, queue, "lunar_storm_dot", t, dotInfo, state.currentAP);
            }
          }
        }
      }
    }

    // Eyes of the Eagle: KC has chance to reset WFB charge
    if (spell.key === "kill_command" && talents.has("catchOut")) {
      if (rng.roll() < PROC_CHANCES.eyes_of_eagle) {
        state.cooldowns.resetCharge("wildfire_bomb");
        state.eyesOfEagleResets++;
      }
    }
  }
}

function handlePackLeaderTriggers(
  state: CombatState,
  rng: RNG,
  prdState: PRDState,
  queue: EventQueue,
  spell: SpellInfo,
  input: SimInput,
  timeline: TimelineEvent[],
  capture: boolean,
): void {
  const talents = input.talents.activeTalents;

  // Kill Command → Vicious Hunt: summon dire beast
  if (spell.key === "kill_command" && talents.has("viciousHunt")) {
    if (rollPRD("vicious_hunt", PROC_CHANCES.vicious_hunt, rng, prdState)) {
      state.viciousHuntProcs++;
      state.logProc("vicious_hunt", "Vicious Hunt proc → dire beast");
      const dotInfo = DOT_DB["vicious_wound_dot"];
      if (dotInfo) {
        applyDot(state, queue, "vicious_wound_dot", 0, dotInfo, state.currentAP);
      }
    }
  }

  // Pet attack counter → Pack Coordination
  if (spell.isPet || spell.key === "kill_command") {
    incrementPackCounter(state, input, rng);
  }

  // Frenzied Tear: Raptor Strike → 20% chance extra pet attack
  if (spell.key === "raptor_strike" && talents.has("furiousAssault")) {
    if (rollPRD("frenzied_tear", PROC_CHANCES.frenzied_tear, rng, prdState)) {
      state.frenziedTearProcs++;
      state.logProc("frenzied_tear", "Frenzied Tear proc → extra SaO");

      const petAp = state.currentAP * PET_AP_SCALING;
      const { damage: petDmg, isCrit: petCrit } = computeDamage(
        state, petAp, 1.10, "physical", true, rng,
      );
      state.recordDamage("strike_as_one", petDmg, petCrit, 0);

      // Pet attack counts for pack counter
      incrementPackCounter(state, input, rng);
    }
  }

  // Expire Wyvern's Cry stacks
  if (state.wyvernsCryExpiresMs > 0 && state.nowMs >= state.wyvernsCryExpiresMs) {
    state.wyvernsCryStacks = 0;
    state.wyvernsCryExpiresMs = 0;
  }

}

// ── Tier Set Interactions ─────────────────────────────────────

function handleTierInteractions(
  state: CombatState,
  rng: RNG,
  spell: SpellInfo,
  input: SimInput,
): void {
  // 2pc: Kill Command crits reduce Wildfire Bomb CD by 1s
  if (spell.key === "kill_command" && input.stats.has2pc) {
    const critChance = Math.min(1, state.currentCritPct / 100);
    if (rng.roll() < critChance) {
      state.cooldowns.reduceCooldown("wildfire_bomb", 1000, state.nowMs);
    }
  }

  // 4pc: WFB detonation has 20% chance to reset Boomstick CD
  if (spell.key === "wildfire_bomb" && input.stats.has4pc) {
    if (rng.roll() < PROC_CHANCES.tier_4pc_boomstick) {
      state.cooldowns.resetCharge("boomstick");
    }
  }
}

// ── DoT helpers ───────────────────────────────────────────────

function applySpellDots(
  state: CombatState,
  spell: SpellInfo,
  queue: EventQueue,
  input: SimInput,
): void {
  if (spell.key === "wildfire_bomb") {
    const dotKey = "wildfire_bomb_dot";
    const dotInfo = DOT_DB[dotKey];
    if (dotInfo) {
      const targets = Math.min(state.numTargets, dotInfo.aoeTargetCap);
      for (let t = 0; t < targets; t++) {
        applyDot(state, queue, dotKey, t, dotInfo, state.currentAP);
      }
    }
  }

  if (spell.key === "flamefang_pitch") {
    const dotInfo = DOT_DB["flamefang_pitch_dot"];
    if (dotInfo) {
      const targets = Math.min(state.numTargets, dotInfo.aoeTargetCap);
      for (let t = 0; t < targets; t++) {
        applyDot(state, queue, "flamefang_pitch_dot", t, dotInfo, state.currentAP);
      }
    }
  }

  // Boomstick: channeled 4-tick ability — snapshot Shellshock and Takedown into DoT
  if (spell.key === "boomstick") {
    const dotInfo = DOT_DB["boomstick_dot"];
    if (dotInfo) {
      // Snapshot multipliers into the per-tick AP coef
      let snapshotCoef = dotInfo.apCoef;
      // Shellshock: +40% ST, -5% per extra target (snapshot at cast time)
      if (input.talents.activeTalents.has("shellshock")) {
        const shellshockBonus = Math.max(0,
          BUFF_DURATIONS.shellshock.stBonusPct - (state.numTargets - 1) * BUFF_DURATIONS.shellshock.reductionPerTarget);
        snapshotCoef *= 1 + shellshockBonus;
      }
      // Takedown universal buff
      if (state.takedownActive) {
        snapshotCoef *= 1.20;
      }
      const targets = Math.min(state.numTargets, dotInfo.aoeTargetCap);
      for (let t = 0; t < targets; t++) {
        applyDot(state, queue, "boomstick_dot", t, { ...dotInfo, apCoef: snapshotCoef }, state.currentAP);
      }
    }
  }
}

function applyDot(
  state: CombatState,
  queue: EventQueue,
  dotKey: string,
  targetId: number,
  dotInfo: { pandemic: boolean; durationMs: number; tickIntervalMs: number; apCoef: number; snapshots: readonly string[]; school: string; bypassesArmor: boolean },
  snapshotAP: number,
): void {
  const target = state.targets[targetId];
  if (!target) return;

  const existing = target.dots.get(dotKey);
  let duration = dotInfo.durationMs;

  // Pandemic: extend by remaining time (up to 30% of base)
  if (dotInfo.pandemic && existing && existing.expiresMs > state.nowMs) {
    const remaining = existing.expiresMs - state.nowMs;
    const pandemicMax = dotInfo.durationMs * COMBAT_MECHANICS.pandemicMaxPct;
    duration += Math.min(remaining, pandemicMax);
  }

  const activeDot = {
    key: dotKey,
    targetId,
    expiresMs: state.nowMs + duration,
    nextTickMs: state.nowMs + dotInfo.tickIntervalMs,
    tickIntervalMs: dotInfo.tickIntervalMs,
    apCoefPerTick: dotInfo.apCoef,
    snapshotAP: dotInfo.snapshots.includes("ap") ? snapshotAP : 0,
    school: dotInfo.school,
    bypassesArmor: dotInfo.bypassesArmor,
  };

  target.dots.set(dotKey, activeDot);

  // FIX #1: Actually enqueue the first tick event
  queue.enqueue({
    tMs: activeDot.nextTickMs,
    priority: EventPriority.DOT_TICK,
    type: "dot_tick",
    payload: { dotKey, targetId },
  });
}

// ── Trinket processing ────────────────────────────────────────

function processTrinkets(
  state: CombatState,
  rng: RNG,
  input: SimInput,
  eventType: string,
): void {
  for (const trinket of input.trinkets) {
    if (!trinket) continue;
    const cdKey = `trinket_${trinket.id}`;

    switch (trinket.type) {
      case "on_use": {
        if (eventType !== "gcd_ready") break;
        if (!state.cooldowns.isReady(cdKey, state.nowMs)) break;

        if (trinket.burstAlignable) {
          if (!state.takedownActive) break;
        }

        const stat = trinket.onUseStat;
        const amount = trinket.onUseAmount ?? trinket.onUseAgi ?? 0;
        if (stat && amount > 0) {
          const buffKey = stat === "agi" ? "agi" : stat;
          state.applyAura(cdKey, (trinket.onUseDuration ?? 20) * 1000, 1, { [buffKey]: amount });
        }
        state.cooldowns.use(cdKey, state.nowMs);
        break;
      }

      case "proc": {
        if (eventType !== "auto_attack" && eventType !== "gcd_ready") break;

        const hasICD = trinket.procICD && trinket.procICD > 0;
        if (hasICD && !state.cooldowns.isReady(cdKey, state.nowMs)) break;

        const uptime = trinket.procUptime ?? 0;
        const procChance = Math.min(0.95, uptime * 0.18);

        if (rng.roll() < procChance) {
          const stat = trinket.procStat;
          if (stat && trinket.procAmount) {
            const buffKey = stat === "agi" ? "agi" : stat;
            state.applyAura(cdKey, 10_000, 1, { [buffKey]: trinket.procAmount });
          }
          if (hasICD) {
            state.cooldowns.use(cdKey, state.nowMs);
          }
        }
        break;
      }

      case "damage_proc": {
        if (eventType !== "auto_attack" && eventType !== "gcd_ready") break;
        if (!trinket.dmgApCoef || !trinket.dmgCPM) break;

        const meleeSwingMs = getMeleeSwingMs(input);
        const hasteMult = 1 + state.currentHastePct / 100;
        const eventsPerSec = eventType === "auto_attack"
          ? 1000 / (meleeSwingMs / hasteMult)
          : 0.7 * hasteMult;
        const chancePerEvent = (trinket.dmgCPM / 60) / eventsPerSec;

        if (rng.roll() < chancePerEvent) {
          const dmg = state.currentAP * trinket.dmgApCoef;
          const isCrit = rng.roll() < (state.currentCritPct / 100);
          const finalDmg = isCrit ? dmg * 2 : dmg;
          state.recordDamage(cdKey, finalDmg, isCrit, 0);
        }
        break;
      }
    }
  }
}

// ── Weapon enhancement proc ──────────────────────────────────

function processWeaponProc(
  state: CombatState,
  rng: RNG,
  input: SimInput,
  meleeSwingMs: number,
): void {
  const wp = input.weaponProc;
  if (!wp) return;

  const hasteMult = 1 + state.currentHastePct / 100;
  const autoSpeed = meleeSwingMs / hasteMult / 1000;
  const chancePerAttack = (wp.dmgCPM / 60) * autoSpeed;

  if (rng.roll() < chancePerAttack) {
    let dmg = state.currentAP * wp.dmgApCoef;
    if (wp.school === "physical") {
      dmg *= (1 - computeArmorMitigation(BOSS_ARMOR, ARMOR_K));
    }
    state.recordDamage("weapon_enhancement", dmg, false, 0);
  }
}

// ── Cooldown initialization ───────────────────────────────────

function initializeCooldowns(state: CombatState, talents: { activeTalents: Set<string> }): void {
  const hasteMult = 1 + state.currentHastePct / 100;

  for (const spell of Object.values(SPELL_DB)) {
    if (spell.cooldownMs <= 0) continue;
    if (spell.key === "auto_attack") continue;

    let cdMs = spell.cooldownMs;

    if (spell.hasteScalesCD) {
      cdMs = Math.round(cdMs / hasteMult);
    }

    if (spell.key === "takedown" && talents.activeTalents.has("savagery")) {
      cdMs = 60000;
    }

    const charges = spell.charges > 0 ? spell.charges : 1;
    state.cooldowns.init(spell.key, charges, cdMs);
  }
}

// ── Scheduling helpers ────────────────────────────────────────

function compileAPL(config: { hero: HeroTree; apl: string; fightStyle: string }): CompiledAPL {
  if (config.apl) {
    return parseAPL(config.apl);
  }
  const key = getDefaultAPLKey(config.hero, config.fightStyle);
  return parseAPL(DEFAULT_APLS[key] ?? DEFAULT_APLS["sentinel_raid_st"]);
}
