// ─────────────────────────────────────────────────────────────
// engine/APLEngine.ts
// Action Priority List parser and evaluator.
// Parses SimC-style APL syntax and evaluates conditions against
// the current CombatState to determine the next ability to cast.
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
  evaluate: (state: CombatState) => boolean;
}

export interface CompiledAPL {
  actions: APLAction[];
}

// ── Default APLs ──────────────────────────────────────────────

export const DEFAULT_APLS: Record<string, string> = {
  sentinel_raid_st: `actions=auto_attack
actions+=/takedown,if=cooldown.takedown.ready
actions+=/boomstick,if=cooldown.boomstick.ready
actions+=/wildfire_bomb,if=cooldown.wildfire_bomb.charges>=1
actions+=/kill_command,if=focus<=80
actions+=/raptor_strike,if=buff.tip_of_the_spear.stack>=2&focus>=30
actions+=/serpent_sting,if=!dot.serpent_sting.ticking
actions+=/raptor_strike,if=focus>=60
actions+=/kill_command
actions+=/raptor_strike`,

  sentinel_mplus_aoe: `actions=auto_attack
actions+=/takedown
actions+=/wildfire_bomb,if=spell_targets>=3|cooldown.wildfire_bomb.charges>=1
actions+=/boomstick
actions+=/carve,if=spell_targets>=3&focus>=35
actions+=/kill_command,if=focus<=70
actions+=/serpent_sting,if=!dot.serpent_sting.ticking&spell_targets<=5
actions+=/wildfire_bomb
actions+=/carve,if=focus>=50
actions+=/raptor_strike`,

  pack_leader_raid_st: `actions=auto_attack
actions+=/takedown,if=cooldown.kill_command.ready
actions+=/kill_command,if=focus<=80
actions+=/boomstick,if=cooldown.boomstick.ready
actions+=/wildfire_bomb,if=cooldown.wildfire_bomb.charges>=1
actions+=/raptor_strike,if=buff.tip_of_the_spear.stack>=2&focus>=30
actions+=/serpent_sting,if=!dot.serpent_sting.ticking
actions+=/kill_command
actions+=/raptor_strike,if=focus>=50
actions+=/raptor_strike`,

  pack_leader_mplus_aoe: `actions=auto_attack
actions+=/takedown
actions+=/wildfire_bomb,if=spell_targets>=3|cooldown.wildfire_bomb.charges>=1
actions+=/boomstick
actions+=/kill_command,if=focus<=70
actions+=/carve,if=spell_targets>=3&focus>=35
actions+=/serpent_sting,if=!dot.serpent_sting.ticking&spell_targets<=5
actions+=/wildfire_bomb
actions+=/carve,if=focus>=50
actions+=/raptor_strike`,
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
      // Split on & for AND conditions, but each part may contain | for OR
      const parts = condStr.split("&");
      for (const part of parts) {
        const trimmed = part.trim();
        // Check for OR groups (pipe-separated)
        if (trimmed.includes("|")) {
          const orParts = trimmed.split("|").map(p => p.trim());
          const orFns = orParts.map(p => compileCondition(p));
          conditions.push({
            raw: trimmed,
            evaluate: (s) => orFns.some(fn => fn(s)),
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

function compileCondition(expr: string): (state: CombatState) => boolean {
  // focus<=N
  const focusMatch = expr.match(/^focus([<>=!]+)(\d+)$/);
  if (focusMatch) {
    const op = focusMatch[1];
    const val = parseInt(focusMatch[2]);
    return (s) => compare(s.focus, op, val);
  }

  // cooldown.X.ready
  const cdReady = expr.match(/^cooldown\.([a-z_]+)\.ready$/);
  if (cdReady) {
    const ability = cdReady[1];
    return (s) => s.cooldowns.isReady(ability, s.nowMs);
  }

  // cooldown.X.charges>=N
  const cdCharges = expr.match(/^cooldown\.([a-z_]+)\.charges([<>=!]+)(\d+)$/);
  if (cdCharges) {
    const ability = cdCharges[1];
    const op = cdCharges[2];
    const val = parseInt(cdCharges[3]);
    return (s) => compare(s.cooldowns.getCharges(ability), op, val);
  }

  // buff.X.stack>=N
  const buffStack = expr.match(/^buff\.([a-z_]+)\.stack([<>=!]+)(\d+)$/);
  if (buffStack) {
    const buff = buffStack[1];
    const op = buffStack[2];
    const val = parseInt(buffStack[3]);
    return (s) => {
      if (buff === "tip_of_the_spear") return compare(s.tipOfTheSpearStacks, op, val);
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
      return s.hasAura(buff);
    };
  }

  // !dot.X.ticking
  const dotNotTicking = expr.match(/^!dot\.([a-z_]+)\.ticking$/);
  if (dotNotTicking) {
    const dot = dotNotTicking[1];
    return (s) => {
      // Check primary target (target 0)
      return !s.targets[0]?.dots.has(dot);
    };
  }

  // dot.X.refreshable
  const dotRefresh = expr.match(/^dot\.([a-z_]+)\.refreshable$/);
  if (dotRefresh) {
    const dot = dotRefresh[1];
    return (s) => {
      const activeDot = s.targets[0]?.dots.get(dot);
      if (!activeDot) return true;
      // Pandemic: refreshable when <30% remaining
      const remaining = activeDot.expiresMs - s.nowMs;
      const totalDuration = activeDot.expiresMs - (activeDot.expiresMs - activeDot.tickIntervalMs * 4); // rough
      return remaining < totalDuration * 0.3;
    };
  }

  // spell_targets>=N
  const targetsMatch = expr.match(/^spell_targets([<>=!]+)(\d+)$/);
  if (targetsMatch) {
    const op = targetsMatch[1];
    const val = parseInt(targetsMatch[2]);
    return (s) => compare(s.numTargets, op, val);
  }

  // cooldown.X.full_recharge_time>gcd
  if (expr.includes("full_recharge_time")) {
    return () => true; // simplified: always true
  }

  // Default: always true (unknown condition)
  return () => true;
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

/**
 * Evaluate the APL against current state.
 * Returns the first ability whose conditions are all met,
 * or null if nothing can be cast.
 */
export function evaluateAPL(
  apl: CompiledAPL,
  state: CombatState,
): string | null {
  for (const action of apl.actions) {
    // Skip auto_attack — handled separately
    if (action.ability === "auto_attack") continue;

    // Check if ability is known
    const spell = SPELL_DB[action.ability];
    if (!spell) continue;

    // Check talent requirement
    if (spell.requiresTalent && !state.auras.has("talent_" + spell.requiresTalent)) {
      // Use the talent set from combat state — simplified check
    }

    // Check hero requirement
    if (spell.requiresHero && spell.requiresHero !== state.hero) continue;

    // Check GCD
    if (spell.triggersGcd && state.nowMs < state.gcdReadyMs) continue;

    // Check cooldown
    if (spell.cooldownMs > 0 && !state.cooldowns.isReady(action.ability, state.nowMs)) continue;

    // Check focus cost
    if (spell.focusCost > 0 && state.focus < spell.focusCost) continue;

    // Evaluate conditions
    let allConditionsMet = true;
    for (const cond of action.conditions) {
      if (!cond.evaluate(state)) {
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

/**
 * Validate an APL string without running a sim.
 * Returns action count, warnings for unknown abilities, and errors for malformed lines.
 */
export function validateAPL(aplText: string): APLValidationResult {
  const lines = aplText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  const warnings: string[] = [];
  const errors: string[] = [];
  let actionCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comment lines
    if (line.startsWith("#") || line.startsWith("//")) continue;

    const match = line.match(/^actions(?:\+)?=\/?([a-z_]+)(?:,if=(.+))?$/i);
    if (!match) {
      errors.push(`Line ${i + 1}: malformed — "${line.slice(0, 50)}"`);
      continue;
    }

    const ability = match[1].toLowerCase();
    actionCount++;

    // Check if ability exists in SpellDB
    if (ability !== "auto_attack" && !SPELL_DB[ability]) {
      warnings.push(`Line ${i + 1}: unknown ability "${ability}"`);
    }

    // Validate conditions syntax
    const condStr = match[2] ?? "";
    if (condStr) {
      const parts = condStr.split("&");
      for (const part of parts) {
        // Split OR groups and validate each sub-condition
        const orParts = part.trim().split("|");
        for (const orPart of orParts) {
          const p = orPart.trim();
          // Basic syntax check: should match known condition patterns
          const knownPattern = /^(!?)(focus|cooldown\.|buff\.|dot\.|spell_targets)/;
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
