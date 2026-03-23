// ─────────────────────────────────────────────────────────────
// engine/APLEngine.ts
// Action Priority List parser and evaluator.
// Parses SimC-style APL syntax and evaluates conditions against
// the current CombatState to determine the next ability to cast.
// APLs match SimC midnight branch (apl_hunter.cpp) — March 2026.
// ─────────────────────────────────────────────────────────────

import type { CombatState } from "./CombatState";
import { SPELL_DB, type SpellInfo } from "./SpellDB";
import type { HeroTree } from "./types";

// ── APL Types ─────────────────────────────────────────────────

export interface APLAction {
  ability: string;
  conditions: APLCondition[];
}

export interface APLCondition {
  raw: string;
  evaluate: (state: CombatState, activeTalents?: Set<string>) => boolean;
}

export interface CompiledAPL {
  actions: APLAction[];
}

// ── Default APLs (SimC midnight branch, March 2026) ──────────
// Flattened from apl_hunter.cpp survival() sub-lists:
//   plst, plcleave, sentst, sentcleave
// CDs sub-list (harpoon, racials, potions) handled by SimLoop
// directly; only rotational actions are in these APLs.
//
// Key SimC conditions mapped:
//   fury_of_the_wyvern_extendable → always true (stub)
//   buff.howl_of_the_pack_leader_*.remains → howl beast buff up
//   buff.raptor_swipe.up → raptor swipe proc buff active
//   !talent.X / talent.X → talent checks
//   cooldown.X.remains<gcd → CD finishes within next GCD
//   cooldown.X.remains → boolean: ability is on cooldown
//   debuff.sentinels_mark.remains → sentinel mark debuff active
//   full_recharge_time<N → charge check (approximated)

export const DEFAULT_APLS: Record<string, string> = {
  // ── Pack Leader Single Target (plst) ──────────────────────
  // Source: apl_hunter.cpp lines 416-425 / 496-505
  pack_leader_raid_st: `actions=auto_attack
actions+=/kill_command,if=buff.tip_of_the_spear.stack<2&buff.howl_beast.up
actions+=/kill_command,if=cooldown.takedown.remains_lt_gcd&buff.tip_of_the_spear.stack<2&!talent.twin_fangs
actions+=/takedown,if=buff.tip_of_the_spear.stack>0&!talent.twin_fangs
actions+=/takedown,if=buff.tip_of_the_spear.stack==0&talent.twin_fangs
actions+=/flamefang_pitch
actions+=/boomstick,if=buff.tip_of_the_spear.up
actions+=/wildfire_bomb,if=buff.tip_of_the_spear.up
actions+=/raptor_strike,if=buff.tip_of_the_spear.up
actions+=/kill_command,if=cooldown.takedown.on_cooldown
actions+=/wildfire_bomb
actions+=/takedown`,

  // ── Pack Leader AoE/Cleave (plcleave) ─────────────────────
  // Source: apl_hunter.cpp lines 439-449 / 519-529
  pack_leader_mplus_aoe: `actions=auto_attack
actions+=/kill_command,if=buff.tip_of_the_spear.stack<2&buff.howl_beast.up
actions+=/kill_command,if=cooldown.takedown.remains_lt_gcd&buff.tip_of_the_spear.stack<2&!talent.twin_fangs
actions+=/takedown,if=buff.tip_of_the_spear.stack>0&!talent.twin_fangs
actions+=/takedown,if=buff.tip_of_the_spear.stack==0&talent.twin_fangs
actions+=/flamefang_pitch
actions+=/wildfire_bomb,if=cooldown.wildfire_bomb.charges>=1
actions+=/boomstick,if=buff.tip_of_the_spear.up
actions+=/wildfire_bomb,if=buff.tip_of_the_spear.up
actions+=/raptor_strike,if=buff.tip_of_the_spear.up
actions+=/kill_command,if=cooldown.takedown.on_cooldown
actions+=/wildfire_bomb
actions+=/takedown`,

  // ── Sentinel Single Target (sentst) ───────────────────────
  // Source: apl_hunter.cpp lines 427-437 / 507-517
  sentinel_raid_st: `actions=auto_attack
actions+=/kill_command,if=buff.tip_of_the_spear.stack==0&cooldown.takedown.on_cooldown
actions+=/kill_command,if=buff.tip_of_the_spear.stack==0&!talent.twin_fangs
actions+=/boomstick,if=buff.tip_of_the_spear.up&!cooldown.takedown.ready
actions+=/wildfire_bomb,if=buff.tip_of_the_spear.up
actions+=/kill_command,if=cooldown.takedown.remains_lt_gcd&buff.tip_of_the_spear.stack<2&!talent.twin_fangs
actions+=/takedown,if=buff.tip_of_the_spear.stack>0&!talent.twin_fangs
actions+=/takedown,if=buff.tip_of_the_spear.stack==0&talent.twin_fangs
actions+=/boomstick,if=buff.tip_of_the_spear.up
actions+=/moonlight_chakram,if=buff.tip_of_the_spear.up
actions+=/flamefang_pitch
actions+=/raptor_strike,if=buff.tip_of_the_spear.up
actions+=/kill_command,if=cooldown.takedown.on_cooldown
actions+=/takedown`,

  // ── Sentinel AoE/Cleave (sentcleave) ──────────────────────
  // Source: apl_hunter.cpp lines 451-461 / 531-541
  sentinel_mplus_aoe: `actions=auto_attack
actions+=/kill_command,if=buff.tip_of_the_spear.stack==0
actions+=/boomstick,if=buff.tip_of_the_spear.up
actions+=/wildfire_bomb,if=buff.tip_of_the_spear.up
actions+=/kill_command,if=cooldown.takedown.remains_lt_gcd&buff.tip_of_the_spear.stack<2&!talent.twin_fangs
actions+=/takedown,if=buff.tip_of_the_spear.up
actions+=/moonlight_chakram,if=buff.tip_of_the_spear.up
actions+=/flamefang_pitch,if=buff.tip_of_the_spear.up
actions+=/raptor_strike,if=buff.tip_of_the_spear.up
actions+=/kill_command`,
};

// ── APL Parser ────────────────────────────────────────────────

export function parseAPL(aplText: string): CompiledAPL {
  const lines = aplText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  const actions: APLAction[] = [];

  for (const line of lines) {
    // Skip comment lines
    if (line.startsWith("#") || line.startsWith("//")) continue;

    // Match: actions=ability or actions+=/ability,if=conditions
    const match = line.match(/^actions(?:\+)?=\/?([a-z_]+)(?:,if=(.+))?$/i);
    if (!match) continue;

    const ability = match[1].toLowerCase();
    const condStr = match[2] ?? "";

    const conditions: APLCondition[] = [];
    if (condStr) {
      // Split on & for AND conditions
      const parts = condStr.split("&");
      for (const part of parts) {
        const trimmed = part.trim();
        // Check for OR groups (pipe-separated)
        if (trimmed.includes("|")) {
          const orParts = trimmed.split("|").map(p => p.trim());
          const orFns = orParts.map(p => compileCondition(p));
          conditions.push({
            raw: trimmed,
            evaluate: (s, t) => orFns.some(fn => fn(s, t)),
          });
        } else {
          conditions.push({
            raw: trimmed,
            evaluate: compileCondition(trimmed),
          });
        }
      }
    }

    actions.push({ ability, conditions });
  }

  return { actions };
}

function compileCondition(expr: string): (state: CombatState, activeTalents?: Set<string>) => boolean {
  // ── Talent checks ──────────────────────────────────────────
  // !talent.X
  const notTalent = expr.match(/^!talent\.([a-z_]+)$/i);
  if (notTalent) {
    const talent = camelCase(notTalent[1]);
    return (_s, t) => !(t?.has(talent) ?? false);
  }
  // talent.X
  const hasTalent = expr.match(/^talent\.([a-z_]+)$/i);
  if (hasTalent) {
    const talent = camelCase(hasTalent[1]);
    return (_s, t) => t?.has(talent) ?? false;
  }

  // ── Focus ──────────────────────────────────────────────────
  const focusMatch = expr.match(/^focus([<>=!]+)(\d+)$/);
  if (focusMatch) {
    const op = focusMatch[1];
    const val = parseInt(focusMatch[2]);
    return (s) => compare(s.focus, op, val);
  }

  // ── Cooldown conditions ────────────────────────────────────
  // cooldown.X.ready
  const cdReady = expr.match(/^cooldown\.([a-z_]+)\.ready$/);
  if (cdReady) {
    const ability = cdReady[1];
    return (s) => s.cooldowns.isReady(ability, s.nowMs);
  }
  // !cooldown.X.ready
  const notCdReady = expr.match(/^!cooldown\.([a-z_]+)\.ready$/);
  if (notCdReady) {
    const ability = notCdReady[1];
    return (s) => !s.cooldowns.isReady(ability, s.nowMs);
  }
  // cooldown.X.on_cooldown — ability is on CD (remains > 0)
  const cdOnCd = expr.match(/^cooldown\.([a-z_]+)\.on_cooldown$/);
  if (cdOnCd) {
    const ability = cdOnCd[1];
    return (s) => !s.cooldowns.isReady(ability, s.nowMs);
  }
  // cooldown.X.remains_lt_gcd — CD remaining < GCD (about to come off CD)
  const cdRemainsLtGcd = expr.match(/^cooldown\.([a-z_]+)\.remains_lt_gcd$/);
  if (cdRemainsLtGcd) {
    const ability = cdRemainsLtGcd[1];
    return (s) => {
      const readyAt = s.cooldowns.getNextReadyTime(ability);
      const remaining = Math.max(0, readyAt - s.nowMs);
      const hasteMult = 1 + s.currentHastePct / 100;
      const gcdMs = Math.max(750, Math.round(1500 / hasteMult));
      return remaining < gcdMs;
    };
  }
  // cooldown.X.remains<N (seconds)
  const cdRemainsLt = expr.match(/^cooldown\.([a-z_]+)\.remains([<>=!]+)(\d+)$/);
  if (cdRemainsLt) {
    const ability = cdRemainsLt[1];
    const op = cdRemainsLt[2];
    const valMs = parseInt(cdRemainsLt[3]) * 1000;
    return (s) => {
      const readyAt = s.cooldowns.getNextReadyTime(ability);
      const remaining = Math.max(0, readyAt - s.nowMs);
      return compare(remaining, op, valMs);
    };
  }
  // cooldown.X.charges>=N
  const cdCharges = expr.match(/^cooldown\.([a-z_]+)\.charges([<>=!]+)(\d+)$/);
  if (cdCharges) {
    const ability = cdCharges[1];
    const op = cdCharges[2];
    const val = parseInt(cdCharges[3]);
    return (s) => compare(s.cooldowns.getCharges(ability), op, val);
  }

  // ── Buff conditions ────────────────────────────────────────
  // buff.tip_of_the_spear.stack>=N or ==N
  const buffStack = expr.match(/^buff\.([a-z_]+)\.stack([<>=!]+)(\d+)$/);
  if (buffStack) {
    const buff = buffStack[1];
    const op = buffStack[2];
    const val = parseInt(buffStack[3]);
    return (s) => {
      if (buff === "tip_of_the_spear") return compare(s.tipOfTheSpearStacks, op, val);
      if (buff === "mongoose_fury") return compare(s.mongooseFuryStacks, op, val);
      if (buff === "wyverns_cry") return compare(s.wyvernsCryStacks, op, val);
      return compare(s.getAuraStacks(buff), op, val);
    };
  }
  // buff.X.remains<N
  const buffRemains = expr.match(/^buff\.([a-z_]+)\.remains([<>=!]+)(\d+)$/);
  if (buffRemains) {
    const buff = buffRemains[1];
    const op = buffRemains[2];
    const val = parseInt(buffRemains[3]);
    return (s) => {
      const aura = s.auras.get(buff);
      const remains = aura ? Math.max(0, (aura.expiresMs - s.nowMs) / 1000) : 0;
      return compare(remains, op, val);
    };
  }
  // buff.X.up
  const buffUp = expr.match(/^buff\.([a-z_]+)\.up$/);
  if (buffUp) {
    const buff = buffUp[1];
    return (s) => {
      if (buff === "takedown") return s.takedownActive;
      if (buff === "tip_of_the_spear") return s.tipOfTheSpearStacks > 0;
      if (buff === "mongoose_fury") return s.mongooseFuryStacks > 0;
      if (buff === "raptor_swipe") return true; // Raptor Swipe is a guaranteed proc in Midnight
      if (buff === "howl_beast") return true; // Howl beast buffs cycle continuously
      return s.hasAura(buff);
    };
  }
  // !buff.X.up
  const notBuffUp = expr.match(/^!buff\.([a-z_]+)\.up$/);
  if (notBuffUp) {
    const buff = notBuffUp[1];
    return (s) => {
      if (buff === "takedown") return !s.takedownActive;
      if (buff === "tip_of_the_spear") return s.tipOfTheSpearStacks === 0;
      if (buff === "raptor_swipe") return false; // Always up in Midnight
      return !s.hasAura(buff);
    };
  }
  // buff.howl_of_the_pack_leader_*.remains — howl beast buff active
  if (expr.match(/^buff\.howl_of_the_pack_leader_/)) {
    return () => true; // Simplified: howl beasts cycle continuously
  }

  // ── Debuff conditions ──────────────────────────────────────
  // debuff.sentinels_mark.remains — sentinel mark debuff on target
  if (expr === "debuff.sentinels_mark.remains") {
    return (s) => s.sentinelCounter > 0; // Approximate: mark is up when counter has been used
  }
  // !debuff.sentinels_mark.remains
  if (expr === "!debuff.sentinels_mark.remains") {
    return (s) => s.sentinelCounter === 0;
  }

  // ── DoT conditions ─────────────────────────────────────────
  // !dot.X.ticking
  const dotNotTicking = expr.match(/^!dot\.([a-z_]+)\.ticking$/);
  if (dotNotTicking) {
    const dot = dotNotTicking[1];
    return (s) => !s.targets[0]?.dots.has(dot);
  }
  // dot.X.refreshable
  const dotRefresh = expr.match(/^dot\.([a-z_]+)\.refreshable$/);
  if (dotRefresh) {
    const dot = dotRefresh[1];
    return (s) => {
      const activeDot = s.targets[0]?.dots.get(dot);
      if (!activeDot) return true;
      const remaining = activeDot.expiresMs - s.nowMs;
      const totalDuration = activeDot.expiresMs - (activeDot.expiresMs - activeDot.tickIntervalMs * 4);
      return remaining < totalDuration * 0.3;
    };
  }

  // ── Target count ───────────────────────────────────────────
  const targetsMatch = expr.match(/^spell_targets([<>=!]+)(\d+)$/);
  if (targetsMatch) {
    const op = targetsMatch[1];
    const val = parseInt(targetsMatch[2]);
    return (s) => compare(s.numTargets, op, val);
  }

  // ── SimC custom conditions (stubs) ─────────────────────────
  // fury_of_the_wyvern_extendable — WFB extends Fury of the Wyvern
  if (expr === "fury_of_the_wyvern_extendable") {
    return () => true; // Stub: always allow
  }
  // full_recharge_time<N+gcd — approximate as "has a charge"
  if (expr.includes("full_recharge_time")) {
    return () => true;
  }
  // prev.X — previous action was X (not tracked, always true)
  if (expr.startsWith("prev.")) {
    return () => true;
  }

  // Default: always true (unknown condition)
  return () => true;
}

/** Convert snake_case to camelCase for talent lookups */
function camelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function compare(a: number, op: string, b: number): boolean {
  switch (op) {
    case "<=": return a <= b;
    case ">=": return a >= b;
    case "<": return a < b;
    case ">": return a > b;
    case "=": case "==": return a === b;
    case "!=": return a !== b;
    default: return true;
  }
}

// ── APL Evaluator ─────────────────────────────────────────────

export function evaluateAPL(
  apl: CompiledAPL,
  state: CombatState,
  activeTalents?: Set<string>,
): string | null {
  for (const action of apl.actions) {
    if (action.ability === "auto_attack") continue;

    const spell = SPELL_DB[action.ability];
    if (!spell) continue;

    // Check hero requirement
    if (spell.requiresHero && spell.requiresHero !== state.hero) continue;

    // Check talent requirement — skip abilities the character doesn't have
    if (spell.requiresTalent && activeTalents && !activeTalents.has(spell.requiresTalent)) continue;

    // Check GCD
    if (spell.triggersGcd && state.nowMs < state.gcdReadyMs) continue;

    // Check cooldown
    if (spell.cooldownMs > 0 && !state.cooldowns.isReady(action.ability, state.nowMs)) continue;

    // Check focus cost
    if (spell.focusCost > 0 && state.focus < spell.focusCost) continue;

    // Evaluate conditions (pass activeTalents for talent checks)
    let allConditionsMet = true;
    for (const cond of action.conditions) {
      if (!cond.evaluate(state, activeTalents)) {
        allConditionsMet = false;
        break;
      }
    }
    if (!allConditionsMet) continue;

    return action.ability;
  }

  return null;
}

/**
 * Get the default APL key for a hero + fight style combination.
 */
export function getDefaultAPLKey(hero: HeroTree, fightStyle: string): string {
  const heroKey = hero === "sentinel" ? "sentinel" : "pack_leader";
  if (fightStyle === "raid_st") return `${heroKey}_raid_st`;
  return `${heroKey}_mplus_aoe`;
}

// ── APL Validation ──────────────────────────────────────────

export interface APLValidationResult {
  valid: boolean;
  actionCount: number;
  warnings: string[];
  errors: string[];
}

export function validateAPL(aplText: string): APLValidationResult {
  const lines = aplText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  const warnings: string[] = [];
  const errors: string[] = [];
  let actionCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("#") || line.startsWith("//")) continue;

    const match = line.match(/^actions(?:\+)?=\/?([a-z_]+)(?:,if=(.+))?$/i);
    if (!match) {
      errors.push(`Line ${i + 1}: malformed — "${line.slice(0, 50)}"`);
      continue;
    }

    const ability = match[1].toLowerCase();
    actionCount++;

    if (ability !== "auto_attack" && !SPELL_DB[ability]) {
      warnings.push(`Line ${i + 1}: unknown ability "${ability}"`);
    }

    const condStr = match[2] ?? "";
    if (condStr) {
      const parts = condStr.split("&");
      for (const part of parts) {
        const orParts = part.trim().split("|");
        for (const orPart of orParts) {
          const p = orPart.trim();
          const knownPattern = /^(!?)(focus|cooldown\.|buff\.|dot\.|spell_targets|talent\.|!talent\.|debuff\.|fury_of_the_wyvern|full_recharge|prev\.)/;
          if (!knownPattern.test(p)) {
            warnings.push(`Line ${i + 1}: condition "${p}" may not be recognized`);
          }
        }
      }
    }
  }

  if (actionCount === 0) {
    errors.push("APL has no valid action lines");
  }

  return {
    valid: errors.length === 0,
    actionCount,
    warnings,
    errors,
  };
}
