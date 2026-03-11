// ─────────────────────────────────────────────────────────────
// engine/SpellDB.ts
// Spell definitions, DoT rules, and ability metadata for the sim.
// All AP coefficients from sc_hunter.cpp (Midnight 12.0 branch).
// ─────────────────────────────────────────────────────────────

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
    apCoef: 0.85, focusCost: 0, cooldownMs: 0, charges: 0,
    gcdMs: 0, school: "physical", isPet: false, aoeTargetCap: 1,
    hasteScalesCPM: true, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: false, requiresTalent: "", requiresHero: "",
    consumesTots: false, grantsTotsStack: false,
  },
  raptor_strike: {
    id: 186270, key: "raptor_strike", label: "Raptor Strike",
    apCoef: 2.86, focusCost: 30, cooldownMs: 0, charges: 0,
    gcdMs: 1500, school: "physical", isPet: false, aoeTargetCap: 1,
    hasteScalesCPM: true, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: true, requiresTalent: "", requiresHero: "",
    consumesTots: true, grantsTotsStack: false,
  },
  kill_command: {
    id: 259489, key: "kill_command", label: "Kill Command",
    apCoef: 1.50, focusCost: -20, cooldownMs: 6000, charges: 2,
    gcdMs: 1500, school: "physical", isPet: true, aoeTargetCap: 1,
    hasteScalesCPM: true, hasteScalesCD: true, bonusCritMult: 0,
    triggersGcd: true, requiresTalent: "", requiresHero: "",
    consumesTots: false, grantsTotsStack: true,
  },
  wildfire_bomb: {
    id: 259495, key: "wildfire_bomb", label: "Wildfire Bomb",
    apCoef: 0.495, focusCost: 0, cooldownMs: 18000, charges: 1,
    gcdMs: 1500, school: "fire", isPet: false, aoeTargetCap: 8,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: true, requiresTalent: "", requiresHero: "",
    consumesTots: false, grantsTotsStack: false,
  },
  // ─── Midnight 12.0 New Abilities ───────────────────────────
  boomstick: {
    id: 0, key: "boomstick", label: "Boomstick",
    apCoef: 0.90, focusCost: 0, cooldownMs: 60000, charges: 1,
    gcdMs: 1500, school: "physical", isPet: false, aoeTargetCap: 5,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0.40,
    triggersGcd: true, requiresTalent: "boomstick", requiresHero: "",
    consumesTots: false, grantsTotsStack: false,
  },
  takedown: {
    id: 0, key: "takedown", label: "Takedown",
    apCoef: 1.80, focusCost: -50, cooldownMs: 90000, charges: 1,
    gcdMs: 1500, school: "physical", isPet: false, aoeTargetCap: 1,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: true, requiresTalent: "takedown", requiresHero: "",
    consumesTots: false, grantsTotsStack: false,
  },
  serpent_sting: {
    id: 259491, key: "serpent_sting", label: "Serpent Sting",
    apCoef: 0.25, focusCost: 10, cooldownMs: 0, charges: 0,
    gcdMs: 1500, school: "nature", isPet: false, aoeTargetCap: 1,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: true, requiresTalent: "serpentSting", requiresHero: "",
    consumesTots: false, grantsTotsStack: false,
  },
  carve: {
    id: 187708, key: "carve", label: "Carve",
    apCoef: 0.80, focusCost: 35, cooldownMs: 6000, charges: 1,
    gcdMs: 1500, school: "physical", isPet: false, aoeTargetCap: 5,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: true, requiresTalent: "carve", requiresHero: "",
    consumesTots: true, grantsTotsStack: false,
  },
  flamefang_pitch: {
    id: 0, key: "flamefang_pitch", label: "Flamefang Pitch",
    apCoef: 1.20, focusCost: 0, cooldownMs: 15000, charges: 1,
    gcdMs: 1500, school: "fire", isPet: false, aoeTargetCap: 5,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: true, requiresTalent: "flamefangPitch", requiresHero: "",
    consumesTots: false, grantsTotsStack: false,
  },
  moonlight_chakram: {
    id: 0, key: "moonlight_chakram", label: "Moonlight Chakram",
    apCoef: 0.90, focusCost: 0, cooldownMs: 20000, charges: 1,
    gcdMs: 1500, school: "arcane", isPet: false, aoeTargetCap: 5,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: true, requiresTalent: "moonlightChakram", requiresHero: "",
    consumesTots: false, grantsTotsStack: false,
  },
  death_chakram: {
    id: 375891, key: "death_chakram", label: "Death Chakram",
    apCoef: 0.75, focusCost: 0, cooldownMs: 45000, charges: 1,
    gcdMs: 1500, school: "shadow", isPet: false, aoeTargetCap: 5,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: true, requiresTalent: "deathChakram", requiresHero: "",
    consumesTots: false, grantsTotsStack: false,
  },
  raptor_swipe: {
    id: 0, key: "raptor_swipe", label: "Raptor Swipe",
    apCoef: 1.85, focusCost: 0, cooldownMs: 0, charges: 0,
    gcdMs: 0, school: "physical", isPet: false, aoeTargetCap: 5,
    hasteScalesCPM: true, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: false, requiresTalent: "raptorSwipe", requiresHero: "",
    consumesTots: false, grantsTotsStack: false,
  },
  strike_as_one: {
    id: 0, key: "strike_as_one", label: "Strike as One",
    apCoef: 1.10, focusCost: 0, cooldownMs: 0, charges: 0,
    gcdMs: 0, school: "physical", isPet: true, aoeTargetCap: 1,
    hasteScalesCPM: true, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: false, requiresTalent: "strikeAsOne", requiresHero: "",
    consumesTots: false, grantsTotsStack: false,
  },
  // ─── Pet Abilities ─────────────────────────────────────────
  pet_claw: {
    id: 16827, key: "pet_claw", label: "Pet (Claw)",
    apCoef: 0.40, focusCost: 0, cooldownMs: 0, charges: 0,
    gcdMs: 0, school: "physical", isPet: true, aoeTargetCap: 1,
    hasteScalesCPM: true, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: false, requiresTalent: "", requiresHero: "",
    consumesTots: false, grantsTotsStack: false,
  },
  pet_melee: {
    id: 0, key: "pet_melee", label: "Pet Melee",
    apCoef: 0.30, focusCost: 0, cooldownMs: 0, charges: 0,
    gcdMs: 0, school: "physical", isPet: true, aoeTargetCap: 1,
    hasteScalesCPM: true, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: false, requiresTalent: "", requiresHero: "",
    consumesTots: false, grantsTotsStack: false,

  },
  // ─── Sentinel Hero Tree ────────────────────────────────────
  lunar_storm: {
    id: 450384, key: "lunar_storm", label: "Lunar Storm",
    apCoef: 1.20, focusCost: 0, cooldownMs: 0, charges: 0,
    gcdMs: 0, school: "arcane", isPet: false, aoeTargetCap: 5,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: false, requiresTalent: "lunarStorm", requiresHero: "sentinel",
    consumesTots: false, grantsTotsStack: false,
  },
  sentinel_mark: {
    id: 0, key: "sentinel_mark", label: "Sentinel Mark",
    apCoef: 0.60, focusCost: 0, cooldownMs: 0, charges: 0,
    gcdMs: 0, school: "arcane", isPet: false, aoeTargetCap: 8,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: false, requiresTalent: "", requiresHero: "sentinel",
    consumesTots: false, grantsTotsStack: false,

  },
  sentinel_owl: {
    id: 0, key: "sentinel_owl", label: "Sentinel Owl",
    apCoef: 0.80, focusCost: 0, cooldownMs: 0, charges: 0,
    gcdMs: 0, school: "arcane", isPet: false, aoeTargetCap: 8,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: false, requiresTalent: "", requiresHero: "sentinel",
    consumesTots: false, grantsTotsStack: false,
  },
  // ─── Pack Leader Hero Tree ─────────────────────────────────
  pack_leader_beasts: {
    id: 0, key: "pack_leader_beasts", label: "Pack Leader Beasts",
    apCoef: 2.20, focusCost: 0, cooldownMs: 0, charges: 0,
    gcdMs: 0, school: "physical", isPet: true, aoeTargetCap: 3,
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
    apCoef: 0.50, focusCost: 0, cooldownMs: 0, charges: 0,
    gcdMs: 0, school: "physical", isPet: false, aoeTargetCap: 1,
    hasteScalesCPM: false, hasteScalesCD: false, bonusCritMult: 0,
    triggersGcd: false, requiresTalent: "packCoordination", requiresHero: "pack_leader",
    consumesTots: false, grantsTotsStack: false,
  },
  bear_rend: {
    id: 0, key: "bear_rend", label: "Bear (Rend + Melee)",
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
    apCoef: 0.165, snapshots: ["ap"], school: "fire",
    bypassesArmor: true, aoeTargetCap: 8,
  },
  shrapnel_bomb_dot: {
    key: "shrapnel_bomb_dot", spellKey: "wildfire_bomb",
    pandemic: true, durationMs: 6000, tickIntervalMs: 1000,
    apCoef: 0.18, snapshots: ["ap"], school: "physical",
    bypassesArmor: false, aoeTargetCap: 8,
  },
  internal_bleeding: {
    key: "internal_bleeding", spellKey: "raptor_strike",
    pandemic: false, durationMs: 9000, tickIntervalMs: 3000,
    apCoef: 0.15, snapshots: [], school: "physical",
    bypassesArmor: true, aoeTargetCap: 1,
  },
  vicious_wound_dot: {
    key: "vicious_wound_dot", spellKey: "vicious_wound",
    pandemic: false, durationMs: 12000, tickIntervalMs: 3000,
    apCoef: 0.50, snapshots: ["ap"], school: "physical",
    bypassesArmor: true, aoeTargetCap: 1,
  },
  lunar_storm_dot: {
    key: "lunar_storm_dot", spellKey: "lunar_storm",
    pandemic: false, durationMs: 8000, tickIntervalMs: 1000,
    apCoef: 0.30, snapshots: [], school: "arcane",
    bypassesArmor: true, aoeTargetCap: 5,
  },
  flamefang_pitch_dot: {
    key: "flamefang_pitch_dot", spellKey: "flamefang_pitch",
    pandemic: true, durationMs: 8000, tickIntervalMs: 2000,
    apCoef: 0.20, snapshots: ["ap"], school: "fire",
    bypassesArmor: true, aoeTargetCap: 5,
  },
  boomstick_dot: {
    key: "boomstick_dot", spellKey: "boomstick",
    pandemic: false, durationMs: 6000, tickIntervalMs: 1500,
    apCoef: 0.90, snapshots: ["ap"], school: "physical",
    bypassesArmor: false, aoeTargetCap: 5,
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
  wildfire_bomb:        { targetCap: 8, splitDamage: false },
  boomstick:            { targetCap: 5, splitDamage: false },
  takedown:             { targetCap: 1, splitDamage: false },
  carve:                { targetCap: 5, splitDamage: false },
  serpent_sting:        { targetCap: 1, splitDamage: false },
  flamefang_pitch:      { targetCap: 5, splitDamage: false },
  moonlight_chakram:    { targetCap: 5, splitDamage: false },
  death_chakram:        { targetCap: 5, splitDamage: false },
  raptor_swipe:         { targetCap: 5, splitDamage: false },
  strike_as_one:        { targetCap: 1, splitDamage: false },
  sentinel_owl:         { targetCap: 8, splitDamage: false },
  sentinel_mark:        { targetCap: 8, splitDamage: false },
  lunar_storm:          { targetCap: 5, splitDamage: false },
  pack_leader_beasts:   { targetCap: 3, splitDamage: false },
  pack_coordination:    { targetCap: 1, splitDamage: false },
  bear_rend:            { targetCap: 1, splitDamage: false },
  pet_claw:             { targetCap: 1, splitDamage: false },
  pet_melee:            { targetCap: 1, splitDamage: false },
};
