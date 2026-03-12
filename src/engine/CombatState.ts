// ─────────────────────────────────────────────────────────────
// engine/CombatState.ts
// Mutable combat state: auras, cooldowns, DoTs, buffs, counters.
// Pre-allocated for hot-loop performance (no allocations per event).
// ─────────────────────────────────────────────────────────────

import type { HeroTree, PlayerStats, ResolvedBuffMultipliers } from "./types";
import { COMBAT_RATINGS, MASTERY_SPIRIT_BOND, BUFF_DURATIONS, FOCUS_VALUES } from "./simcSpellData";

// ── Combat Log Entry ──────────────────────────────────────────

export interface CombatLogEntry {
  tMs: number;
  type: "cast" | "damage" | "buff_apply" | "buff_expire" | "buff_stack" | "focus_spend" | "focus_gain" | "dot_apply" | "dot_tick" | "dot_expire" | "proc" | "auto" | "cooldown_use";
  ability: string;
  detail?: string;
  damage?: number;
  isCrit?: boolean;
  target?: number;
  focus?: number;
  stacks?: number;
}
// ── Aura (buff/debuff) ────────────────────────────────────────

export interface Aura {
  key: string;
  expiresMs: number;
  stacks: number;
  maxStacks: number;
  /** Stat buffs while active */
  statBuff?: Partial<Record<string, number>>;
  /** Snapshot data for DoTs */
  snapshotAP?: number;
}

// ── Active DoT on a target ────────────────────────────────────

export interface ActiveDot {
  key: string;
  targetId: number;
  expiresMs: number;
  nextTickMs: number;
  tickIntervalMs: number;
  apCoefPerTick: number;
  snapshotAP: number;
  school: string;
  bypassesArmor: boolean;
}

// ── Cooldown tracker ──────────────────────────────────────────

export class CooldownTracker {
  private readyAt: Map<string, number> = new Map();
  private charges: Map<string, number> = new Map();
  private maxCharges: Map<string, number> = new Map();
  private rechargeMs: Map<string, number> = new Map();

  init(key: string, maxCh: number, rechMs: number): void {
    this.charges.set(key, maxCh);
    this.maxCharges.set(key, maxCh);
    this.rechargeMs.set(key, rechMs);
    this.readyAt.set(key, 0);
  }

  isReady(key: string, nowMs: number): boolean {
    const ch = this.charges.get(key);
    if (ch === undefined) return true; // no CD tracked = always ready
    if (ch > 0) return true;
    return nowMs >= (this.readyAt.get(key) ?? 0);
  }

  getCharges(key: string): number {
    return this.charges.get(key) ?? 0;
  }

  use(key: string, nowMs: number): boolean {
    const ch = this.charges.get(key);
    if (ch === undefined) return true;

    // Recover any charges that have finished recharging
    const maxCh = this.maxCharges.get(key) ?? 1;
    const rechMs = this.rechargeMs.get(key) ?? 0;
    const readyAt = this.readyAt.get(key) ?? 0;
    let current = this.charges.get(key)!;

    if (current < maxCh && nowMs >= readyAt) {
      // How many charges recovered since readyAt was set?
      const elapsed = nowMs - readyAt;
      const recovered = 1 + (rechMs > 0 ? Math.floor(elapsed / rechMs) : 0);
      current = Math.min(maxCh, current + recovered);
      this.charges.set(key, current);
    }

    if (current <= 0) return false;

    this.charges.set(key, current - 1);

    // Start/continue recharge if below max
    if (current - 1 < maxCh) {
      // If already recharging (readyAt in the future), don't reset the timer
      if (readyAt <= nowMs || current === maxCh) {
        this.readyAt.set(key, nowMs + rechMs);
      }
      // else: keep existing readyAt (charge was already recovering)
    }
    return true;
  }

  /** Directly reset a CD (e.g., proc resets Wildfire Bomb) */
  resetCharge(key: string): void {
    const maxCh = this.maxCharges.get(key) ?? 1;
    const current = this.charges.get(key) ?? 0;
    if (current < maxCh) {
      this.charges.set(key, current + 1);
    }
  }

  /** Reduce remaining CD by amount in ms */
  reduceCooldown(key: string, amountMs: number, nowMs: number): void {
    const ready = this.readyAt.get(key);
    if (ready !== undefined && ready > nowMs) {
      const newReady = Math.max(nowMs, ready - amountMs);
      this.readyAt.set(key, newReady);
      if (newReady <= nowMs) {
        const ch = this.charges.get(key) ?? 0;
        const maxCh = this.maxCharges.get(key) ?? 1;
        if (ch < maxCh) {
          this.charges.set(key, ch + 1);
        }
      }
    }
  }

  /** Get next recharge time for scheduling */
  getNextReadyTime(key: string): number {
    return this.readyAt.get(key) ?? 0;
  }

  clear(): void {
    this.readyAt.clear();
    this.charges.clear();
    this.maxCharges.clear();
    this.rechargeMs.clear();
  }
}

// ── DamageBreakdown accumulator ───────────────────────────────

export class DamageBreakdown {
  private data: Map<string, { damage: number; casts: number; crits: number }> = new Map();

  add(key: string, damage: number, isCrit: boolean): void {
    let entry = this.data.get(key);
    if (!entry) {
      entry = { damage: 0, casts: 0, crits: 0 };
      this.data.set(key, entry);
    }
    entry.damage += damage;
    entry.casts += 1;
    if (isCrit) entry.crits += 1;
  }

  /** Record damage without incrementing cast count (for sub-components merged into parent key) */
  addDamageOnly(key: string, damage: number, isCrit: boolean): void {
    let entry = this.data.get(key);
    if (!entry) {
      entry = { damage: 0, casts: 0, crits: 0 };
      this.data.set(key, entry);
    }
    entry.damage += damage;
    if (isCrit) entry.crits += 1;
  }

  getAll(): Map<string, { damage: number; casts: number; crits: number }> {
    return this.data;
  }

  clear(): void {
    this.data.clear();
  }
}

// ── Per-target state ──────────────────────────────────────────

export class TargetState {
  dots: Map<string, ActiveDot> = new Map();
  damage: number = 0;

  clear(): void {
    this.dots.clear();
    this.damage = 0;
  }
}

// ── Main CombatState ──────────────────────────────────────────

export class CombatState {
  // Time
  nowMs: number = 0;
  gcdReadyMs: number = 0;

  // Player resources
  focus: number = 100;
  maxFocus: number = 100;
  focusRegenPerSec: number = FOCUS_VALUES.baseRegenPerSec;

  // Player stats (mutable — auras modify these)
  baseStats: PlayerStats;
  currentAP: number = 0;
  currentCritPct: number = 0;
  currentHastePct: number = 0;
  currentMasteryPct: number = 0;
  currentVersPct: number = 0;

  // Auras
  auras: Map<string, Aura> = new Map();

  // Specific buff stacks
  tipOfTheSpearStacks: number = 0;
  tipOfTheSpearMaxStacks: number = 2;
  takedownActive: boolean = false;
  takedownExpiresMs: number = 0;

  // Hero-specific counters
  sentinelCounter: number = 0;
  sentinelWisdomStacks: number = 0;
  packCounter: number = 0;

  // Mongoose Fury: stacks on Raptor Strike, +15% per stack, max 5, 14s duration
  // Refresh behavior: DISABLED (new stacks do NOT extend duration)
  mongooseFuryStacks: number = 0;
  mongooseFuryExpiresMs: number = 0;

  // Bloodseeker: +10% attack speed per bleeding target (multiplicative, NOT haste)
  bloodseekerStacks: number = 0;

  // Pack Leader: Howl of the Pack Leader beast cycle (0=Wyvern, 1=Boar, 2=Bear)
  howlBeastCycle: number = 0;
  // Wyvern's Cry: stacking pet damage buff
  wyvernsCryStacks: number = 0;
  wyvernsCryExpiresMs: number = 0;
  // Stampede: pending flag (KC sets it, next beast consumption fires stampede)
  stampedePending: boolean = false;

  // Hero counters for reporting
  sentinelOwlProcs: number = 0;
  lunarStormProcs: number = 0;
  eyesOfEagleResets: number = 0;
  viciousHuntProcs: number = 0;
  packCoordinationProcs: number = 0;
  frenziedTearProcs: number = 0;

  // Cooldowns
  cooldowns: CooldownTracker = new CooldownTracker();

  // Targets
  targets: TargetState[] = [];

  // Damage tracking
  breakdown: DamageBreakdown = new DamageBreakdown();
  totalDamage: number = 0;

  // Per-target damage
  perTargetDamage: Map<number, number> = new Map();

  // Config
  hero: HeroTree;
  numTargets: number;

  // Combat log (detailed event-by-event log for debugging/output)
  combatLog: CombatLogEntry[] = [];
  combatLogEnabled: boolean = false;

  // External buff multipliers (from SimOptions)
  /** Multiplicative damage modifier from raid debuffs (Mystic Touch, Hunter's Mark) */
  externalDmgMult: number = 1.0;
  /** Additive versatility % bonus from raid buffs (Mark of the Wild) */
  externalVersPctBonus: number = 0;

  constructor(stats: PlayerStats, hero: HeroTree, numTargets: number, buffMults?: ResolvedBuffMultipliers) {
    this.baseStats = stats;
    this.hero = hero;
    this.numTargets = numTargets;

    if (buffMults) {
      this.externalDmgMult = buffMults.dmgMult;
      this.externalVersPctBonus = buffMults.versPctBonus;
    }

    // Initialize targets
    for (let i = 0; i < numTargets; i++) {
      this.targets.push(new TargetState());
      this.perTargetDamage.set(i, 0);
    }

    this.recalcStats();
  }

  /** Recalculate effective stats from base + aura buffs */
  recalcStats(): void {
    const s = this.baseStats;
    let bonusCrit = 0;
    let bonusHaste = 0;
    let bonusMastery = 0;
    let bonusVers = 0;
    let bonusAgi = 0;

    for (const aura of this.auras.values()) {
      if (!aura.statBuff) continue;
      bonusCrit += (aura.statBuff["crit"] ?? 0) * aura.stacks;
      bonusHaste += (aura.statBuff["haste"] ?? 0) * aura.stacks;
      bonusMastery += (aura.statBuff["mastery"] ?? 0) * aura.stacks;
      bonusVers += (aura.statBuff["vers"] ?? 0) * aura.stacks;
      bonusAgi += (aura.statBuff["agi"] ?? 0) * aura.stacks;
    }

    // Sentinel's Wisdom: +3% crit per stack (up to 5)
    if (this.hero === "sentinel") {
      bonusCrit += this.sentinelWisdomStacks * (BUFF_DURATIONS.sentinels_wisdom.critPctPerStack / 100) * COMBAT_RATINGS.crit;
    }

    const totalAgi = s.agility + bonusAgi;
    this.currentAP = totalAgi + (s.attackPower ?? 0);
    // Level 90 Midnight stat conversions (from simcSpellData COMBAT_RATINGS)
    this.currentCritPct = (s.critRating + bonusCrit) / COMBAT_RATINGS.crit + COMBAT_RATINGS.baseCrit;
    this.currentHastePct = (s.hasteRating + bonusHaste) / COMBAT_RATINGS.haste;
    // Mastery: base points + rating/ratingPerPoint mastery points, each point = bonusPerPoint Spirit Bond bonus
    this.currentMasteryPct = MASTERY_SPIRIT_BOND.basePoints + (s.masteryRating + bonusMastery) / MASTERY_SPIRIT_BOND.ratingPerPoint;
    this.currentVersPct = (s.versatilityRating + bonusVers) / COMBAT_RATINGS.versatility + this.externalVersPctBonus;
  }

  /** Apply an aura to the player */
  applyAura(key: string, durationMs: number, maxStacks: number, statBuff?: Partial<Record<string, number>>): void {
    const existing = this.auras.get(key);
    if (existing) {
      const oldStacks = existing.stacks;
      existing.expiresMs = this.nowMs + durationMs;
      existing.stacks = Math.min(existing.stacks + 1, maxStacks);
      if (statBuff) existing.statBuff = statBuff;
      if (this.combatLogEnabled && existing.stacks !== oldStacks) {
        this.combatLog.push({ tMs: this.nowMs, type: "buff_stack", ability: key, stacks: existing.stacks, detail: `${oldStacks} → ${existing.stacks}` });
      } else if (this.combatLogEnabled) {
        this.combatLog.push({ tMs: this.nowMs, type: "buff_apply", ability: key, stacks: existing.stacks, detail: "refreshed" });
      }
    } else {
      this.auras.set(key, {
        key,
        expiresMs: this.nowMs + durationMs,
        stacks: 1,
        maxStacks,
        statBuff,
      });
      if (this.combatLogEnabled) {
        this.combatLog.push({ tMs: this.nowMs, type: "buff_apply", ability: key, stacks: 1, detail: `${(durationMs / 1000).toFixed(1)}s` });
      }
    }
    this.recalcStats();
  }

  /** Remove an aura */
  removeAura(key: string): void {
    this.auras.delete(key);
    this.recalcStats();
  }

  /** Check if an aura is active */
  hasAura(key: string): boolean {
    const aura = this.auras.get(key);
    if (!aura) return false;
    return aura.expiresMs > this.nowMs;
  }

  /** Get aura stacks (0 if not active) */
  getAuraStacks(key: string): number {
    const aura = this.auras.get(key);
    if (!aura || aura.expiresMs <= this.nowMs) return 0;
    return aura.stacks;
  }

  /** Expire all auras that have passed their duration */
  tickAuras(): void {
    for (const [key, aura] of this.auras) {
      if (aura.expiresMs <= this.nowMs) {
        if (this.combatLogEnabled) {
          this.combatLog.push({ tMs: this.nowMs, type: "buff_expire", ability: key, stacks: aura.stacks });
        }
        this.auras.delete(key);
      }
    }
    // Also check specific buffs
    if (this.takedownExpiresMs > 0 && this.nowMs >= this.takedownExpiresMs) {
      if (this.combatLogEnabled) {
        this.combatLog.push({ tMs: this.nowMs, type: "buff_expire", ability: "takedown", detail: "damage amp ended" });
      }
      this.takedownActive = false;
      this.takedownExpiresMs = 0;
    }
    // Mongoose Fury: 14s duration, refresh DISABLED
    if (this.mongooseFuryExpiresMs > 0 && this.nowMs >= this.mongooseFuryExpiresMs) {
      if (this.combatLogEnabled) {
        this.combatLog.push({ tMs: this.nowMs, type: "buff_expire", ability: "mongoose_fury", stacks: this.mongooseFuryStacks, detail: "expired" });
      }
      this.mongooseFuryStacks = 0;
      this.mongooseFuryExpiresMs = 0;
    }
    this.recalcStats();
  }

  /** Update focus via lazy regen */
  updateFocus(nowMs: number): void {
    if (nowMs <= this.nowMs) return;
    const elapsedSec = (nowMs - this.nowMs) / 1000;
    const hasteRegen = this.focusRegenPerSec * (1 + this.currentHastePct / 100);
    this.focus = Math.min(this.maxFocus, this.focus + elapsedSec * hasteRegen);
  }

  /** Record damage dealt (applies external damage multipliers from raid buffs) */
  recordDamage(abilityKey: string, damage: number, isCrit: boolean, targetId: number): void {
    const finalDmg = damage * this.externalDmgMult;
    this.totalDamage += finalDmg;
    this.breakdown.add(abilityKey, finalDmg, isCrit);
    if (targetId >= 0 && targetId < this.targets.length) {
      this.targets[targetId].damage += finalDmg;
      this.perTargetDamage.set(targetId, (this.perTargetDamage.get(targetId) ?? 0) + finalDmg);
    }
    if (this.combatLogEnabled) {
      this.combatLog.push({ tMs: this.nowMs, type: "damage", ability: abilityKey, damage: Math.round(finalDmg), isCrit, target: targetId });
    }
  }

  /** Record damage without incrementing cast count (for sub-components merged into parent key) */
  recordDamageNoCast(abilityKey: string, damage: number, isCrit: boolean, targetId: number): void {
    const finalDmg = damage * this.externalDmgMult;
    this.totalDamage += finalDmg;
    this.breakdown.addDamageOnly(abilityKey, finalDmg, isCrit);
    if (targetId >= 0 && targetId < this.targets.length) {
      this.targets[targetId].damage += finalDmg;
      this.perTargetDamage.set(targetId, (this.perTargetDamage.get(targetId) ?? 0) + finalDmg);
    }
    if (this.combatLogEnabled) {
      this.combatLog.push({ tMs: this.nowMs, type: "damage", ability: abilityKey, damage: Math.round(finalDmg), isCrit, target: targetId, detail: "pet component" });
    }
  }

  /** Full reset for new iteration */
  reset(): void {
    this.nowMs = 0;
    this.gcdReadyMs = 0;
    this.focus = this.maxFocus;
    this.auras.clear();
    this.tipOfTheSpearStacks = 0;
    this.takedownActive = false;
    this.takedownExpiresMs = 0;
    this.sentinelCounter = 0;
    this.sentinelWisdomStacks = 0;
    this.packCounter = 0;
    this.mongooseFuryStacks = 0;
    this.bloodseekerStacks = 0;
    this.howlBeastCycle = 0;
    this.wyvernsCryStacks = 0;
    this.wyvernsCryExpiresMs = 0;
    this.stampedePending = false;
    this.sentinelOwlProcs = 0;
    this.lunarStormProcs = 0;
    this.eyesOfEagleResets = 0;
    this.viciousHuntProcs = 0;
    this.packCoordinationProcs = 0;
    this.frenziedTearProcs = 0;
    this.cooldowns.clear();
    this.totalDamage = 0;
    this.breakdown.clear();
    this.perTargetDamage.clear();
    for (let i = 0; i < this.numTargets; i++) {
      this.targets[i].clear();
      this.perTargetDamage.set(i, 0);
    }
    this.combatLog = [];
    this.recalcStats();
  }

  /** Log a focus change event */
  logFocus(ability: string, amount: number, type: "spend" | "gain"): void {
    if (!this.combatLogEnabled) return;
    this.combatLog.push({
      tMs: this.nowMs,
      type: type === "spend" ? "focus_spend" : "focus_gain",
      ability,
      focus: Math.round(this.focus),
      detail: `${type === "spend" ? "-" : "+"}${Math.round(Math.abs(amount))} → ${Math.round(this.focus)}`,
    });
  }

  /** Log a proc event */
  logProc(ability: string, detail?: string): void {
    if (!this.combatLogEnabled) return;
    this.combatLog.push({ tMs: this.nowMs, type: "proc", ability, detail });
  }
}
