// ─────────────────────────────────────────────────────────────
// engine/CombatState.ts
// Mutable combat state: auras, cooldowns, DoTs, buffs, counters.
// Pre-allocated for hot-loop performance (no allocations per event).
// ─────────────────────────────────────────────────────────────

import type { HeroTree, PlayerStats, ResolvedBuffMultipliers } from "./types";

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
    if (ch <= 0 && nowMs < (this.readyAt.get(key) ?? Infinity)) return false;

    // If was recharging and time passed, gain the charge back first
    if (ch <= 0 && nowMs >= (this.readyAt.get(key) ?? 0)) {
      this.charges.set(key, 1);
    }

    const current = this.charges.get(key)!;
    if (current <= 0) return false;

    this.charges.set(key, current - 1);
    const maxCh = this.maxCharges.get(key) ?? 1;
    const rechMs = this.rechargeMs.get(key) ?? 0;

    // Start recharge if below max
    if (current - 1 < maxCh) {
      this.readyAt.set(key, nowMs + rechMs);
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
  focusRegenPerSec: number = 5;

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

  // Mongoose Fury: stacks on Raptor Strike, +15% per stack, max 5
  mongooseFuryStacks: number = 0;

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
      bonusCrit += this.sentinelWisdomStacks * 0.03 * 22.3; // +3% crit per stack as rating
    }

    const totalAgi = s.agility + bonusAgi;
    // FIX #3: For hunters, AP = Agility + any bonus AP from buffs/options.
    // attackPower field holds bonus AP beyond agility (e.g., Battle Shout, augment rune).
    // It should NOT duplicate agility.
    this.currentAP = totalAgi + (s.attackPower ?? 0);
    // Level 90 Midnight stat conversions (verified from Raidbots: 389 crit→17.46%, 370 haste→10.58%)
    this.currentCritPct = (s.critRating + bonusCrit) / 22.3 + 5; // base 5% crit
    this.currentHastePct = (s.hasteRating + bonusHaste) / 35.0;
    // Mastery: 8 base points + rating/180 mastery points, each point = 2.5% Spirit Bond bonus
    // Raidbots verification: 8 + 695/180 = 11.86 points * 2.5% = 29.64% ✓
    this.currentMasteryPct = 8 + (s.masteryRating + bonusMastery) / 180;
    this.currentVersPct = (s.versatilityRating + bonusVers) / 54.0 + this.externalVersPctBonus;
  }

  /** Apply an aura to the player */
  applyAura(key: string, durationMs: number, maxStacks: number, statBuff?: Partial<Record<string, number>>): void {
    const existing = this.auras.get(key);
    if (existing) {
      existing.expiresMs = this.nowMs + durationMs;
      existing.stacks = Math.min(existing.stacks + 1, maxStacks);
      if (statBuff) existing.statBuff = statBuff;
    } else {
      this.auras.set(key, {
        key,
        expiresMs: this.nowMs + durationMs,
        stacks: 1,
        maxStacks,
        statBuff,
      });
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
        this.auras.delete(key);
      }
    }
    // Also check specific buffs
    if (this.takedownExpiresMs > 0 && this.nowMs >= this.takedownExpiresMs) {
      this.takedownActive = false;
      this.takedownExpiresMs = 0;
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
    this.recalcStats();
  }
}
