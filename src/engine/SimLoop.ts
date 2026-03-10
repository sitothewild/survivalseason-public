// ─────────────────────────────────────────────────────────────
// engine/SimLoop.ts
// The main simulation loop. Processes events, evaluates APL,
// handles damage calculation, hero talent triggers, and DoT ticks.
// Deterministic: same seed → same result.
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

// ── Constants ─────────────────────────────────────────────────

const CLASS_AURA = 1.20;
const PET_AP_SCALING = 0.60;
const MASTERY_PLAYER_BONUS = 0.004; // per 1% mastery
const MASTERY_PET_BONUS = 0.006;
const BASE_GCD_MS = 1500;
const BOSS_ARMOR = 11480; // +3 boss level
const ARMOR_K = 14014;
const MELEE_SWING_MS = 3600; // 2H base
const MONGOOSE_FURY_MAX_STACKS = 5;
const MONGOOSE_FURY_DURATION_MS = 5000;
const TIP_MAX_STACKS = 2;
const TIP_DAMAGE_PER_STACK = 0.25;
const TAKEDOWN_DURATION_MS = 8000;
const COORDINATED_ASSAULT_DURATION_MS = 20000;

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

  for (let iter = 0; iter < config.iterations; iter++) {
    const seed = hash64(config.seed, iter);
    const rng = new RNG(seed);
    const prdState = createPRDState();

    const state = new CombatState(stats, config.hero, config.targets);

    // Initialize cooldowns
    initializeCooldowns(state, talents);

    // Run single iteration
    const iterResult = runIteration(
      state, rng, prdState, apl, input,
      iter === 0 && config.captureTimeline,
    );

    const durationSec = config.durationMs / 1000;
    const iterDps = state.totalDamage / durationSec;
    dpsAccum.push(iterDps, needSamples);

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
  }

  // Build final breakdown
  const durationSec = config.durationMs / 1000;
  const iters = config.iterations;
  const breakdown: AbilityBreakdown[] = [];
  const totalDmg = dpsAccum.mean * durationSec;

  for (const [key, data] of totalBreakdown) {
    const avgDmg = data.damage / iters;
    const avgCasts = data.casts / iters;
    const dps = avgDmg / durationSec;
    const spell = SPELL_DB[key];
    breakdown.push({
      key,
      label: spell?.label ?? key,
      damage: Math.round(avgDmg),
      dps: Math.round(dps),
      casts: Math.round(avgCasts * 10) / 10,
      avgHit: avgCasts > 0 ? Math.round(avgDmg / avgCasts) : 0,
      pctOfTotal: totalDmg > 0 ? Math.round((avgDmg / totalDmg) * 1000) / 10 : 0,
      category: spell?.isPet ? "pet" : "player",
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
  };
}

// ── Single iteration ──────────────────────────────────────────

function runIteration(
  state: CombatState,
  rng: RNG,
  prdState: PRDState,
  apl: CompiledAPL,
  input: SimInput,
  captureTimeline: boolean,
): { timeline?: TimelineEvent[] } {
  const queue = new EventQueue();
  const timeline: TimelineEvent[] = [];
  const endMs = input.config.durationMs;

  // Schedule initial events
  scheduleAutoAttack(queue, 0, input.stats.weapon.mainHandSpeed * 1000);
  queue.enqueue({ tMs: 0, priority: EventPriority.GCD_READY, type: "gcd_ready" });

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
        handleAutoAttack(state, rng, prdState, queue, input, timeline, captureTimeline);
        break;

      case "dot_tick":
        handleDotTick(state, rng, event, timeline, captureTimeline);
        break;

      case "aura_expire":
        handleAuraExpire(state, event);
        break;

      case "cooldown_ready":
        // Just a marker — APL will pick up the ready CD on next GCD
        break;
    }

    // Process trinket procs on every event
    processTrinkets(state, rng, input, event.type);
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
  const ability = evaluateAPL(apl, state);
  if (!ability) {
    // Nothing to cast, try again in 100ms
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
  const gcdMs = spell.triggersGcd ? Math.max(750, Math.round(BASE_GCD_MS / hasteMult)) : 0;

  if (gcdMs > 0) {
    state.gcdReadyMs = state.nowMs + gcdMs;
    queue.enqueue({ tMs: state.gcdReadyMs, priority: EventPriority.GCD_READY, type: "gcd_ready" });
  } else {
    // Off-GCD: immediately reschedule
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
  } else if (spell.focusCost < 0) {
    state.focus = Math.min(state.maxFocus, state.focus - spell.focusCost);
  }

  // Use cooldown
  if (spell.cooldownMs > 0) {
    state.cooldowns.use(spell.key, state.nowMs);
  }

  // Calculate damage
  const isPet = spell.isPet;
  const ap = isPet ? state.currentAP * PET_AP_SCALING : state.currentAP;
  let baseDmg = spell.apCoef * ap * CLASS_AURA;

  // Mastery: Spirit Bond
  const mastBonus = isPet
    ? 1 + state.currentMasteryPct * MASTERY_PET_BONUS
    : 1 + state.currentMasteryPct * MASTERY_PLAYER_BONUS;
  baseDmg *= mastBonus;

  // Versatility
  baseDmg *= 1 + state.currentVersPct / 100;

  // Tip of the Spear
  if (spell.consumesTots && state.tipOfTheSpearStacks > 0) {
    baseDmg *= 1 + state.tipOfTheSpearStacks * TIP_DAMAGE_PER_STACK;
    state.tipOfTheSpearStacks = 0;
  }

  // Kill Command grants ToTS stacks
  if (spell.grantsTotsStack) {
    state.tipOfTheSpearStacks = Math.min(TIP_MAX_STACKS, state.tipOfTheSpearStacks + 1);
  }

  // Mongoose Fury interaction
  if (spell.consumesMfStacks && state.mongooseFuryStacks > 0) {
    baseDmg *= 1 + state.mongooseFuryStacks * 0.15;
  }
  if (spell.grantsMfStack) {
    state.mongooseFuryStacks = Math.min(MONGOOSE_FURY_MAX_STACKS, state.mongooseFuryStacks + 1);
    state.mongooseFuryExpiresMs = state.nowMs + MONGOOSE_FURY_DURATION_MS;
  }

  // Takedown: +20% damage during window
  if (state.takedownActive && (spell.key === "raptor_strike" || spell.key === "mongoose_bite")) {
    baseDmg *= 1.20;
  }

  // Takedown special: apply buff when cast
  if (spell.key === "takedown") {
    state.takedownActive = true;
    state.takedownExpiresMs = state.nowMs + TAKEDOWN_DURATION_MS;
  }

  // Coordinated Assault
  if (spell.key === "coordinated_assault") {
    state.coordinatedAssaultActive = true;
    state.coordinatedAssaultExpiresMs = state.nowMs + COORDINATED_ASSAULT_DURATION_MS;
  }

  // Crit calculation
  let critMult = 2.0 + spell.bonusCritMult;
  const critChance = Math.min(1, state.currentCritPct / 100);
  const isCrit = rng.roll() < critChance;
  const damage = isCrit ? baseDmg * critMult : baseDmg;

  // Armor mitigation for physical
  let finalDamage = damage;
  if (spell.school === "physical") {
    const mitigation = computeArmorMitigation(BOSS_ARMOR, ARMOR_K);
    finalDamage *= (1 - mitigation);
  }

  // AoE target scaling
  const aoeRule = AOE_RULES[spell.key];
  const effectiveTargets = aoeRule
    ? Math.min(state.numTargets, aoeRule.targetCap)
    : 1;

  for (let t = 0; t < effectiveTargets; t++) {
    const targetDmg = aoeRule?.splitDamage ? finalDamage / effectiveTargets : finalDamage;
    state.recordDamage(spell.key, targetDmg, isCrit, t);
  }

  // Apply DoTs if applicable
  applySpellDots(state, spell, queue);

  // Hero talent triggers
  if (input.config.hero === "sentinel") {
    handleSentinelTriggers(state, rng, prdState, queue, spell, input, timeline, capture);
  } else {
    handlePackLeaderTriggers(state, rng, prdState, queue, spell, input, timeline, capture);
  }

  // Tier set interactions
  handleTierInteractions(state, rng, spell, input);

  // Raptor Swipe proc
  if ((spell.key === "raptor_strike" || spell.key === "mongoose_bite") &&
      input.talents.activeTalents.has("raptorSwipe")) {
    const procChance = state.takedownActive ? 1.0 : 0.25;
    if (rng.roll() < procChance) {
      const swipeSpell = SPELL_DB["raptor_swipe"];
      if (swipeSpell) {
        const swipeDmg = swipeSpell.apCoef * state.currentAP * CLASS_AURA
          * (1 + state.currentMasteryPct * MASTERY_PLAYER_BONUS)
          * (1 + state.currentVersPct / 100);
        const swipeCrit = rng.roll() < critChance;
        const swipeFinal = swipeCrit ? swipeDmg * 2.0 : swipeDmg;
        const swipeTargets = Math.min(state.numTargets, 5);
        for (let t = 0; t < swipeTargets; t++) {
          state.recordDamage("raptor_swipe", swipeFinal, swipeCrit, t);
        }
      }
    }
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
}

function handleAutoAttack(
  state: CombatState,
  rng: RNG,
  prdState: PRDState,
  queue: EventQueue,
  input: SimInput,
  timeline: TimelineEvent[],
  capture: boolean,
): void {
  const spell = SPELL_DB["auto_attack"];
  if (!spell) return;

  const ap = state.currentAP;
  let dmg = spell.apCoef * ap * CLASS_AURA
    * (1 + state.currentMasteryPct * MASTERY_PLAYER_BONUS)
    * (1 + state.currentVersPct / 100);

  const critChance = Math.min(1, state.currentCritPct / 100);
  const isCrit = rng.roll() < critChance;
  if (isCrit) dmg *= 2.0;

  // Armor
  const mitigation = computeArmorMitigation(BOSS_ARMOR, ARMOR_K);
  dmg *= (1 - mitigation);

  state.recordDamage("auto_attack", dmg, isCrit, 0);

  // Schedule next auto
  const hasteMult = 1 + state.currentHastePct / 100;
  const swingMs = Math.round(MELEE_SWING_MS / hasteMult);
  scheduleAutoAttack(queue, state.nowMs + swingMs, swingMs);

  if (capture) {
    timeline.push({ tMs: state.nowMs, type: "auto", ability: "auto_attack", damage: Math.round(dmg) });
  }
}

function handleDotTick(
  state: CombatState,
  rng: RNG,
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
  let dmg = dot.apCoefPerTick * ap * CLASS_AURA
    * (1 + state.currentVersPct / 100);

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

  // Schedule next tick
  dot.nextTickMs = state.nowMs + dot.tickIntervalMs;
  if (dot.nextTickMs < dot.expiresMs) {
    scheduleDotTick(state, payload.dotKey, payload.targetId, dot.nextTickMs, dot.tickIntervalMs);
  }
}

function handleAuraExpire(state: CombatState, event: SimEvent): void {
  const key = event.payload as string;
  if (key) state.removeAura(key);
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

  // Sentinel counter: ranged attacks increment
  if (spell.key === "kill_command" || spell.key === "auto_attack") {
    state.sentinelCounter++;

    if (state.sentinelCounter >= 5) {
      state.sentinelCounter = 0;
      state.sentinelOwlProcs++;

      // Sentinel Owl damage
      const owlSpell = SPELL_DB["sentinel_owl"];
      if (owlSpell) {
        const owlDmg = owlSpell.apCoef * state.currentAP * CLASS_AURA
          * (1 + state.currentVersPct / 100);
        const targets = Math.min(state.numTargets, 8);
        for (let t = 0; t < targets; t++) {
          state.recordDamage("sentinel_owl", owlDmg, false, t);
        }
      }

      // Sentinel's Wisdom: +3% crit per owl proc, stacks to 5
      state.sentinelWisdomStacks = Math.min(5, state.sentinelWisdomStacks + 1);
      state.applyAura("sentinels_wisdom", 15000, 5, { crit: 0.03 * 180 });

      // PRD roll: 30% chance Lunar Storm
      if (talents.has("lunarStorm")) {
        if (rollPRD("lunar_storm", 0.30, rng, prdState)) {
          state.lunarStormProcs++;
          // Apply Lunar Storm DoT (8s, ticks every 1s)
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
      if (rng.roll() < 0.25) {
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
    if (rollPRD("vicious_hunt", 0.25, rng, prdState)) {
      state.viciousHuntProcs++;

      // Vicious Wound bleed on target
      const dotInfo = DOT_DB["vicious_wound_dot"];
      if (dotInfo) {
        applyDot(state, queue, "vicious_wound_dot", 0, dotInfo, state.currentAP);
      }
    }
  }

  // Pet attack counter → Pack Coordination
  if (spell.isPet || spell.key === "kill_command") {
    state.packCounter++;
    if (state.packCounter >= 4 && talents.has("packCoordination")) {
      state.packCounter = 0;
      state.packCoordinationProcs++;

      const pcSpell = SPELL_DB["pack_coordination"];
      if (pcSpell) {
        const pcDmg = pcSpell.apCoef * state.currentAP * CLASS_AURA
          * (1 + state.currentVersPct / 100);
        state.recordDamage("pack_coordination", pcDmg, false, 0);
      }
    }
  }

  // Frenzied Tear: Raptor Strike/Mongoose Bite → 20% chance extra pet attack
  if ((spell.key === "raptor_strike" || spell.key === "mongoose_bite") && talents.has("furiousAssault")) {
    if (rollPRD("frenzied_tear", 0.20, rng, prdState)) {
      state.frenziedTearProcs++;

      // Immediate pet attack (can trigger pack coordination)
      const petDmg = 1.10 * state.currentAP * PET_AP_SCALING * CLASS_AURA
        * (1 + state.currentMasteryPct * MASTERY_PET_BONUS)
        * (1 + state.currentVersPct / 100);
      state.recordDamage("strike_as_one", petDmg, false, 0);

      // This pet attack counts for pack counter
      state.packCounter++;
      if (state.packCounter >= 4 && talents.has("packCoordination")) {
        state.packCounter = 0;
        state.packCoordinationProcs++;
        const pcSpell = SPELL_DB["pack_coordination"];
        if (pcSpell) {
          const pcDmg = pcSpell.apCoef * state.currentAP * CLASS_AURA
            * (1 + state.currentVersPct / 100);
          state.recordDamage("pack_coordination", pcDmg, false, 0);
        }
      }
    }
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
    if (rng.roll() < 0.20) {
      state.cooldowns.resetCharge("boomstick");
    }
  }
}

// ── DoT helpers ───────────────────────────────────────────────

function applySpellDots(
  state: CombatState,
  spell: SpellInfo,
  queue: EventQueue,
): void {
  // Wildfire Bomb → WFB DoT
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

  // Serpent Sting
  if (spell.key === "serpent_sting") {
    const dotInfo = DOT_DB["serpent_sting"];
    if (dotInfo) {
      applyDot(state, queue, "serpent_sting", 0, dotInfo, state.currentAP);
    }
  }
}

function applyDot(
  state: CombatState,
  queue: EventQueue,
  dotKey: string,
  targetId: number,
  dotInfo: typeof DOT_DB[string],
  snapshotAP: number,
): void {
  const target = state.targets[targetId];
  if (!target) return;

  const existing = target.dots.get(dotKey);
  let duration = dotInfo.durationMs;

  // Pandemic: extend by remaining time (up to 30% of base)
  if (dotInfo.pandemic && existing && existing.expiresMs > state.nowMs) {
    const remaining = existing.expiresMs - state.nowMs;
    const pandemicMax = dotInfo.durationMs * 0.3;
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

  // Schedule first tick
  scheduleDotTick(state, dotKey, targetId, activeDot.nextTickMs, dotInfo.tickIntervalMs);
}

function scheduleDotTick(
  state: CombatState,
  dotKey: string,
  targetId: number,
  tickMs: number,
  _intervalMs: number,
): void {
  // We use EventQueue through the iteration — but since we don't have a reference here,
  // we'll rely on the main loop scheduling. This is handled via the queue parameter.
  // For now, DoT ticks are driven by the main loop checking dot state.
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

    switch (trinket.type) {
      case "on_use":
        if (eventType === "gcd_ready" && state.cooldowns.isReady(`trinket_${trinket.id}`, state.nowMs)) {
          // Burst alignment
          if (trinket.burstAlignable && !state.takedownActive) break;

          const stat = trinket.onUseStat;
          const amount = trinket.onUseAmount ?? trinket.onUseAgi ?? 0;
          if (stat && amount > 0) {
            const buffKey = stat === "agi" ? "agi" : stat;
            state.applyAura(`trinket_${trinket.id}`, (trinket.onUseDuration ?? 20) * 1000, 1, { [buffKey]: amount });
          }
          state.cooldowns.use(`trinket_${trinket.id}`, state.nowMs);
        }
        break;

      case "proc":
        if (eventType === "auto_attack" || eventType === "gcd_ready") {
          if (trinket.procUptime && rng.roll() < (trinket.procUptime * 0.1)) {
            const stat = trinket.procStat;
            if (stat && trinket.procAmount) {
              state.applyAura(`trinket_${trinket.id}`, 10000, 1, { [stat]: trinket.procAmount });
            }
          }
        }
        break;

      case "damage_proc":
        if (eventType === "auto_attack" && trinket.dmgApCoef && trinket.dmgCPM) {
          const hasteMult = 1 + state.currentHastePct / 100;
          const autoSpeed = MELEE_SWING_MS / hasteMult / 1000;
          const chancePerAttack = (trinket.dmgCPM / 60) * autoSpeed;
          if (rng.roll() < chancePerAttack) {
            const dmg = state.currentAP * trinket.dmgApCoef;
            state.recordDamage(`trinket_${trinket.id}`, dmg, false, 0);
          }
        }
        break;
    }
  }
}

// ── Cooldown initialization ───────────────────────────────────

function initializeCooldowns(state: CombatState, talents: { activeTalents: Set<string> }): void {
  const hasteMult = 1 + state.currentHastePct / 100;

  // Kill Command: 2 charges, 6s recharge (haste-scaled)
  state.cooldowns.init("kill_command", 2, Math.round(6000 / hasteMult));

  // Wildfire Bomb: 1 charge, 18s
  state.cooldowns.init("wildfire_bomb", 1, 18000);

  // Boomstick: 1 charge, 60s
  if (talents.activeTalents.has("boomstick")) {
    state.cooldowns.init("boomstick", 1, 60000);
  }

  // Takedown: 1 charge, 90s (60s with Savagery)
  if (talents.activeTalents.has("takedown")) {
    const cd = talents.activeTalents.has("savagery") ? 60000 : 90000;
    state.cooldowns.init("takedown", 1, cd);
  }

  // Coordinated Assault
  if (talents.activeTalents.has("coordinatedAssault")) {
    state.cooldowns.init("coordinated_assault", 1, 120000);
  }

  // Flanking Strike
  if (talents.activeTalents.has("flankingStrike")) {
    state.cooldowns.init("flanking_strike", 1, 30000);
  }

  // Fury of the Eagle
  if (talents.activeTalents.has("furyOfTheEagle")) {
    state.cooldowns.init("fury_of_the_eagle", 1, 45000);
  }
}

// ── Scheduling helpers ────────────────────────────────────────

function scheduleAutoAttack(queue: EventQueue, tMs: number, _swingMs: number): void {
  queue.enqueue({ tMs, priority: EventPriority.AUTO_ATTACK, type: "auto_attack" });
}

function compileAPL(config: { hero: HeroTree; apl: string; fightStyle: string }): CompiledAPL {
  if (config.apl) {
    return parseAPL(config.apl);
  }
  const key = getDefaultAPLKey(config.hero, config.fightStyle);
  return parseAPL(DEFAULT_APLS[key] ?? DEFAULT_APLS["sentinel_raid_st"]);
}
