// ─────────────────────────────────────────────────────────────
// engine/SpellDB.ts
// Spell definitions, DoT rules, and ability metadata for the sim.
// All values sourced from simcSpellData.ts (extracted from SimC
// sc_hunter.cpp, Midnight 12.0 branch).
// ─────────────────────────────────────────────────────────────

import {
  AP_COEFFICIENTS as AP,
  SIMC_SPELL_IDS as IDS,
  COOLDOWNS as CD,
  AOE_CAPS,
  FOCUS_VALUES,
  COMBAT_MECHANICS,
} from "./simcSpellData";

export type DamageSchool = "physical" | "nature" | "fire" | "shadow" | "arcane";

export interface SpellInfo {
  id: number;
  key: string;
  label: string;
  apCoef: number;
  focusCost: number;         // positive = costs focus, negative = generates focus
  cooldownMs: number;        // 0 = no CD (GCD only)
  charges: number;           // charge-based CDs
  gcdMs: number;             // 0 = off-GCD
  school: DamageSchool;
  isPet: boolean;
  aoeTargetCap: number;      // 1 = single target
  hasteScalesCPM: boolean;
  hasteScalesCD: boolean;
  /** Bonus crit damage multiplier (e.g. Shellshock on Boomstick) */
  bonusCritMult: number;
  /** If true, this spell triggers the GCD */
  triggersGcd: boolean;
  /** Required talent key (empty string = always available) */
  requiresTalent: string;
  /** Required hero tree (empty string = either) */
  requiresHero: string;
  /** Tip of the Spear: does this ability consume ToTS stacks? */
  consumesTots: boolean;
  /** Does Kill Command grant ToTS stacks? */
  grantsTotsStack: boolean;
}

export interface DotInfo {
  key: string;
  spellKey: string;
  pandemic: boolean;
  durationMs: number;
  tickIntervalMs: number;
  apCoef: number;           // per tick
  snapshots: ("ap" | "crit" | "vers" | "mastery")[];
  school: DamageSchool;
  bypassesArmor: boolean;
  aoeTargetCap: number;
}

// ── Spell Registry (Midnight 12.0) ───────────────────────────

export const SPELL_DB: Record<string, SpellInfo> = {
  // ─── Core Abilities ────────────────────────────────────────
  auto_attack: {
    id: 0, key: "auto_attack", label: "Auto Attack",
    apCoef: AP.auto_attack, focusCost: 0, cooldownMs: 0, charges: 0,
    gcdMs: 0, school: "physical", isPet: false, aoeTargetCap: 1,
    hasteScalesCPM: true, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: false, requiresTalent: "", requiresHero: "",
    consumesTots: false, grantsTotsStack: false,
  },
  raptor_strike: {
    id: IDS.raptor_strike, key: "raptor_strike", label: "Raptor Strike",
    apCoef: AP.raptor_strike, focusCost: FOCUS_VALUES.raptor_strike_cost, cooldownMs: 0, charges: 0,
    gcdMs: COMBAT_MECHANICS.baseGcdMs, school: "physical", isPet: false, aoeTargetCap: 1,
    hasteScalesCPM: true, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: true, requiresTalent: "", requiresHero: "",
    consumesTots: true, grantsTotsStack: false,
  },
  kill_command: {
    id: IDS.kill_command_sv_player, key: "kill_command", label: "Kill Command",
    apCoef: AP.kill_command, focusCost: -FOCUS_VALUES.kill_command_gen, cooldownMs: CD.kill_command.baseMs, charges: CD.kill_command.charges,
    gcdMs: COMBAT_MECHANICS.baseGcdMs, school: "physical", isPet: true, aoeTargetCap: 1,
    hasteScalesCPM: true, hasteScalesCD: CD.kill_command.hasteScales, bonusCritMult: 0,
    triggersGcd: true, requiresTalent: "", requiresHero: "",
    consumesTots: false, grantsTotsStack: true,
  },
  wildfire_bomb: {
    id: IDS.wildfire_bomb, key: "wildfire_bomb", label: "Wildfire Bomb",
    apCoef: AP.wildfire_bomb, focusCost: 0, cooldownMs: CD.wildfire_bomb.baseMs, charges: CD.wildfire_bomb.charges,
    gcdMs: COMBAT_MECHANICS.baseGcdMs, school: "fire", isPet: false, aoeTargetCap: AOE_CAPS.wildfire_bomb,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: true, requiresTalent: "", requiresHero: "",
    consumesTots: false, grantsTotsStack: false,
  },
  // ─── Midnight 12.0 New Abilities ───────────────────────────
  boomstick: {
    id: 0, key: "boomstick", label: "Boomstick",
    apCoef: 0, focusCost: 0, cooldownMs: CD.boomstick.baseMs, charges: CD.boomstick.charges,
    gcdMs: COMBAT_MECHANICS.baseGcdMs, school: "physical", isPet: false, aoeTargetCap: AOE_CAPS.boomstick,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0.40,
    triggersGcd: true, requiresTalent: "boomstick", requiresHero: "",
    consumesTots: false, grantsTotsStack: false,
  },
  takedown: {
    id: 0, key: "takedown", label: "Takedown",
    apCoef: AP.takedown, focusCost: -FOCUS_VALUES.takedown_gen, cooldownMs: CD.takedown.baseMs, charges: CD.takedown.charges,
    gcdMs: COMBAT_MECHANICS.baseGcdMs, school: "physical", isPet: false, aoeTargetCap: 1,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: true, requiresTalent: "takedown", requiresHero: "",
    consumesTots: false, grantsTotsStack: false,
  },
  serpent_sting: {
    id: 259491, key: "serpent_sting", label: "Serpent Sting",
    apCoef: AP.serpent_sting, focusCost: 10, cooldownMs: 0, charges: 0,
    gcdMs: COMBAT_MECHANICS.baseGcdMs, school: "nature", isPet: false, aoeTargetCap: 1,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: true, requiresTalent: "serpentSting", requiresHero: "",
    consumesTots: false, grantsTotsStack: false,
  },
  carve: {
    id: 187708, key: "carve", label: "Carve",
    apCoef: AP.carve, focusCost: 35, cooldownMs: CD.carve.baseMs, charges: CD.carve.charges,
    gcdMs: COMBAT_MECHANICS.baseGcdMs, school: "physical", isPet: false, aoeTargetCap: AOE_CAPS.carve,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: true, requiresTalent: "carve", requiresHero: "",
    consumesTots: true, grantsTotsStack: false,
  },
  flamefang_pitch: {
    id: IDS.flamefang_pitch, key: "flamefang_pitch", label: "Flamefang Pitch",
    apCoef: AP.flamefang_pitch, focusCost: 0, cooldownMs: CD.flamefang_pitch.baseMs, charges: CD.flamefang_pitch.charges,
    gcdMs: COMBAT_MECHANICS.baseGcdMs, school: "fire", isPet: false, aoeTargetCap: AOE_CAPS.flamefang_pitch,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: true, requiresTalent: "flamefangPitch", requiresHero: "",
    consumesTots: false, grantsTotsStack: false,
  },
  moonlight_chakram: {
    id: IDS.moonlight_chakram_spell, key: "moonlight_chakram", label: "Moonlight Chakram",
    apCoef: AP.moonlight_chakram, focusCost: 0, cooldownMs: CD.moonlight_chakram.baseMs, charges: CD.moonlight_chakram.charges,
    gcdMs: COMBAT_MECHANICS.baseGcdMs, school: "arcane", isPet: false, aoeTargetCap: AOE_CAPS.moonlight_chakram,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: true, requiresTalent: "moonlightChakram", requiresHero: "",
    consumesTots: false, grantsTotsStack: false,
  },
  death_chakram: {
    id: 375891, key: "death_chakram", label: "Death Chakram",
    apCoef: AP.death_chakram, focusCost: 0, cooldownMs: CD.death_chakram.baseMs, charges: CD.death_chakram.charges,
    gcdMs: COMBAT_MECHANICS.baseGcdMs, school: "shadow", isPet: false, aoeTargetCap: AOE_CAPS.death_chakram,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: true, requiresTalent: "deathChakram", requiresHero: "",
    consumesTots: false, grantsTotsStack: false,
  },
  raptor_swipe: {
    id: IDS.raptor_swipe_spell, key: "raptor_swipe", label: "Raptor Swipe",
    apCoef: AP.raptor_swipe, focusCost: 0, cooldownMs: 0, charges: 0,
    gcdMs: 0, school: "physical", isPet: false, aoeTargetCap: AOE_CAPS.raptor_swipe,
    hasteScalesCPM: true, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: false, requiresTalent: "raptorSwipe", requiresHero: "",
    consumesTots: false, grantsTotsStack: false,
  },
  strike_as_one: {
    id: IDS.strike_as_one_dmg, key: "strike_as_one", label: "Strike as One",
    apCoef: AP.strike_as_one, focusCost: 0, cooldownMs: 0, charges: 0,
    gcdMs: 0, school: "physical", isPet: true, aoeTargetCap: 1,
    hasteScalesCPM: true, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: false, requiresTalent: "strikeAsOne", requiresHero: "",
    consumesTots: false, grantsTotsStack: false,
  },
  // ─── Pet Abilities ─────────────────────────────────────────
  pet_claw: {
    id: 16827, key: "pet_claw", label: "Pet (Claw)",
    apCoef: AP.pet_claw, focusCost: 0, cooldownMs: 0, charges: 0,
    gcdMs: 0, school: "physical", isPet: true, aoeTargetCap: 1,
    hasteScalesCPM: true, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: false, requiresTalent: "", requiresHero: "",
    consumesTots: false, grantsTotsStack: false,
  },
  pet_melee: {
    id: 0, key: "pet_melee", label: "Pet Melee",
    apCoef: AP.pet_melee, focusCost: 0, cooldownMs: 0, charges: 0,
    gcdMs: 0, school: "physical", isPet: true, aoeTargetCap: 1,
    hasteScalesCPM: true, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: false, requiresTalent: "", requiresHero: "",
    consumesTots: false, grantsTotsStack: false,
  },
  // ─── Sentinel Hero Tree ────────────────────────────────────
  lunar_storm: {
    id: IDS.lunar_storm_dmg, key: "lunar_storm", label: "Lunar Storm",
    apCoef: AP.lunar_storm, focusCost: 0, cooldownMs: 0, charges: 0,
    gcdMs: 0, school: "arcane", isPet: false, aoeTargetCap: AOE_CAPS.lunar_storm,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: false, requiresTalent: "lunarStorm", requiresHero: "sentinel",
    consumesTots: false, grantsTotsStack: false,
  },
  sentinel_mark: {
    id: IDS.sentinels_mark, key: "sentinel_mark", label: "Sentinel Mark",
    apCoef: AP.sentinel_mark, focusCost: 0, cooldownMs: 0, charges: 0,
    gcdMs: 0, school: "arcane", isPet: false, aoeTargetCap: AOE_CAPS.sentinel_mark,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: false, requiresTalent: "", requiresHero: "sentinel",
    consumesTots: false, grantsTotsStack: false,
  },
  sentinel_owl: {
    id: 0, key: "sentinel_owl", label: "Sentinel Owl",
    apCoef: AP.sentinel_owl, focusCost: 0, cooldownMs: 0, charges: 0,
    gcdMs: 0, school: "arcane", isPet: false, aoeTargetCap: AOE_CAPS.sentinel_owl,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: false, requiresTalent: "", requiresHero: "sentinel",
    consumesTots: false, grantsTotsStack: false,
  },
  // ─── Pack Leader Hero Tree ─────────────────────────────────
  pack_leader_beasts: {
    id: 0, key: "pack_leader_beasts", label: "Pack Leader Beasts",
    apCoef: AP.pack_leader_beasts, focusCost: 0, cooldownMs: 0, charges: 0,
    gcdMs: 0, school: "physical", isPet: true, aoeTargetCap: AOE_CAPS.pack_leader_beasts,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: false, requiresTalent: "", requiresHero: "pack_leader",
    consumesTots: false, grantsTotsStack: false,
  },
  vicious_wound: {
    id: 0, key: "vicious_wound", label: "Vicious Wound",
    apCoef: 0, focusCost: 0, cooldownMs: 0, charges: 0,
    gcdMs: 0, school: "physical", isPet: true, aoeTargetCap: 1,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: false, requiresTalent: "viciousHunt", requiresHero: "pack_leader",
    consumesTots: false, grantsTotsStack: false,
  },
  pack_coordination: {
    id: 0, key: "pack_coordination", label: "Pack Coordination",
    apCoef: AP.pack_coordination, focusCost: 0, cooldownMs: 0, charges: 0,
    gcdMs: 0, school: "physical", isPet: false, aoeTargetCap: 1,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: false, requiresTalent: "packCoordination", requiresHero: "pack_leader",
    consumesTots: false, grantsTotsStack: false,
  },
  bear_rend: {
    id: IDS.howl_of_the_pack_leader_bear_bleed, key: "bear_rend", label: "Bear (Rend + Melee)",
    apCoef: 0.45, focusCost: 0, cooldownMs: 0, charges: 0,
    gcdMs: 0, school: "physical", isPet: true, aoeTargetCap: 1,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: false, requiresTalent: "", requiresHero: "pack_leader",
    consumesTots: false, grantsTotsStack: false,
  },
};

// ── DoT Registry (Midnight 12.0) ─────────────────────────────

export const DOT_DB: Record<string, DotInfo> = {
  wildfire_bomb_dot: {
    key: "wildfire_bomb_dot", spellKey: "wildfire_bomb",
    pandemic: true, durationMs: 6000, tickIntervalMs: 1000,
    apCoef: AP.wildfire_bomb_dot, snapshots: ["ap"], school: "fire",
    bypassesArmor: true, aoeTargetCap: AOE_CAPS.wildfire_bomb,
  },
  shrapnel_bomb_dot: {
    key: "shrapnel_bomb_dot", spellKey: "wildfire_bomb",
    pandemic: true, durationMs: 6000, tickIntervalMs: 1000,
    apCoef: AP.shrapnel_bomb_dot, snapshots: ["ap"], school: "physical",
    bypassesArmor: false, aoeTargetCap: AOE_CAPS.wildfire_bomb,
  },
  internal_bleeding: {
    key: "internal_bleeding", spellKey: "raptor_strike",
    pandemic: false, durationMs: 9000, tickIntervalMs: 3000,
    apCoef: AP.internal_bleeding, snapshots: [], school: "physical",
    bypassesArmor: true, aoeTargetCap: 1,
  },
  vicious_wound_dot: {
    key: "vicious_wound_dot", spellKey: "vicious_wound",
    pandemic: false, durationMs: 12000, tickIntervalMs: 3000,
    apCoef: AP.vicious_wound_dot, snapshots: ["ap"], school: "physical",
    bypassesArmor: true, aoeTargetCap: 1,
  },
  lunar_storm_dot: {
    key: "lunar_storm_dot", spellKey: "lunar_storm",
    pandemic: false, durationMs: 8000, tickIntervalMs: 1000,
    apCoef: AP.lunar_storm_dot, snapshots: [], school: "arcane",
    bypassesArmor: true, aoeTargetCap: AOE_CAPS.lunar_storm,
  },
  flamefang_pitch_dot: {
    key: "flamefang_pitch_dot", spellKey: "flamefang_pitch",
    pandemic: true, durationMs: 8000, tickIntervalMs: 2000,
    apCoef: AP.flamefang_pitch_dot, snapshots: ["ap"], school: "fire",
    bypassesArmor: true, aoeTargetCap: AOE_CAPS.flamefang_pitch,
  },
  boomstick_dot: {
    key: "boomstick_dot", spellKey: "boomstick",
    pandemic: false, durationMs: 3000, tickIntervalMs: 750,
    apCoef: AP.boomstick_tick, snapshots: ["ap"], school: "physical",
    bypassesArmor: false, aoeTargetCap: AOE_CAPS.boomstick,
  },
};

// ── Multi-Target Rules ────────────────────────────────────────

export interface AoeRule {
  targetCap: number;  // 99 = uncapped
  /** If true, damage splits among targets. If false, full damage to each. */
  splitDamage: boolean;
}

export const AOE_RULES: Record<string, AoeRule> = {
  raptor_strike:        { targetCap: 1, splitDamage: false },
  kill_command:         { targetCap: 1, splitDamage: false },
  wildfire_bomb:        { targetCap: AOE_CAPS.wildfire_bomb, splitDamage: false },
  boomstick:            { targetCap: AOE_CAPS.boomstick, splitDamage: false },
  takedown:             { targetCap: 1, splitDamage: false },
  carve:                { targetCap: AOE_CAPS.carve, splitDamage: false },
  serpent_sting:        { targetCap: 1, splitDamage: false },
  flamefang_pitch:      { targetCap: AOE_CAPS.flamefang_pitch, splitDamage: false },
  moonlight_chakram:    { targetCap: AOE_CAPS.moonlight_chakram, splitDamage: false },
  death_chakram:        { targetCap: AOE_CAPS.death_chakram, splitDamage: false },
  raptor_swipe:         { targetCap: AOE_CAPS.raptor_swipe, splitDamage: false },
  strike_as_one:        { targetCap: 1, splitDamage: false },
  sentinel_owl:         { targetCap: AOE_CAPS.sentinel_owl, splitDamage: false },
  sentinel_mark:        { targetCap: AOE_CAPS.sentinel_mark, splitDamage: false },
  lunar_storm:          { targetCap: AOE_CAPS.lunar_storm, splitDamage: false },
  pack_leader_beasts:   { targetCap: AOE_CAPS.pack_leader_beasts, splitDamage: false },
  pack_coordination:    { targetCap: 1, splitDamage: false },
  bear_rend:            { targetCap: 1, splitDamage: false },
  pet_claw:             { targetCap: 1, splitDamage: false },
  pet_melee:            { targetCap: 1, splitDamage: false },
};
