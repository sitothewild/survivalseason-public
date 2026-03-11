// ─────────────────────────────────────────────────────────────
// engine/simcSpellData.ts
// Authoritative spell data extracted from SimC sc_hunter.cpp
// (midnight branch). All spell IDs and talent references are
// sourced from the SimC codebase for Midnight 12.0.
//
// AP coefficients are reverse-engineered from Raidbots output
// (Blezaa, Pack Leader, ilvl 231, 51,041 DPS reference).
//
// When SimC publishes a patch, re-run extraction or update
// the edge function to refresh these values.
// ─────────────────────────────────────────────────────────────

// ── Spell ID Registry ────────────────────────────────────────
// Maps SimC talent/spell keys to Blizzard spell IDs from find_spell() calls.

export const SIMC_SPELL_IDS = {
  // ── Core Survival Abilities ───────────────────────────────
  raptor_strike:            186270,  // find_talent_spell("Raptor Strike", SURVIVAL)
  raptor_strike_eagle:      265189,  // find_spell(265189) — eagle variant
  kill_command_sv_player:   259489,  // find_talent_spell("Kill Command", SURVIVAL)
  kill_command_sv_pet:      259277,  // find_spell(259277)
  wildfire_bomb:            259495,  // find_spell(259495) — wildfire_bomb_data
  wildfire_bomb_dmg:        265157,  // find_spell(265157)
  wildfire_bomb_dot:        269747,  // find_spell(269747)

  // ── Midnight 12.0 Survival Abilities ──────────────────────
  boomstick:                0,       // find_talent_spell("Boomstick", SURVIVAL) — no numeric ID in source
  takedown:                 0,       // find_talent_spell("Takedown", SURVIVAL)
  takedown_energize:        1258571, // find_spell(1258571)
  takedown_dmg:             1253859, // find_spell(1253859)
  takedown_pet:             1253862, // find_spell(1253862)
  flamefang_pitch:          1251592, // find_talent_spell(1251592, SURVIVAL)
  flamefang_pitch_data:     1251610, // find_spell(1251610)
  flamefang_pitch_dmg:      1251595, // find_spell(1251595)

  // ── Survival Talent Buff/Mechanic Spells ──────────────────
  tip_of_the_spear_buff:         260286,  // find_spell(260286)
  tip_of_the_spear_boomstick:    471536,  // find_spell(471536) — separate ToTS for boomstick
  tip_of_the_spear_chakram:      1280140, // find_spell(1280140) — separate ToTS for chakram
  raptor_swipe_spell:            1262293, // find_spell(1262293)
  raptor_swipe_buff:             1273155, // find_spell(1273155)
  mongoose_fury_buff:            259388,  // find_spell(259388)
  bloodseeker:                   260249,  // find_spell(260249)
  strike_as_one_dmg:             1251779, // find_spell(1251779)

  // ── Pack Leader Hero Tree ─────────────────────────────────
  howl_of_the_pack_leader_wyvern_ready:    471878,
  howl_of_the_pack_leader_boar_ready:      472324,
  howl_of_the_pack_leader_bear_ready:      472325,
  howl_of_the_pack_leader_cooldown:        471877,
  howl_of_the_pack_leader_wyvern_summon:   1222271,
  howl_of_the_pack_leader_wyvern_buff:     471881,
  howl_of_the_pack_leader_boar_charge_trigger: 472020,
  howl_of_the_pack_leader_boar_charge_impact:  471936,
  howl_of_the_pack_leader_boar_charge_cleave:  471938,
  howl_of_the_pack_leader_bear_summon:     471993,
  howl_of_the_pack_leader_bear_buff:       1225858,
  howl_of_the_pack_leader_bear_bleed:      471999,
  hogstrider_buff:                         472640,
  lethal_barbs_energize:                   1264783,
  stampede_incoming_buff:                  1258338,
  stampede_trigger:                        1258344,
  stampede_dmg:                            201594,

  // ── Sentinel Hero Tree ────────────────────────────────────
  sentinels_mark:            1253601,
  moonlight_chakram_spell:   1264949,
  moonlight_chakram_damage:  1266081,
  moonlight_chakram_buff:    1264946,
  stargazer_buff:            1253750,
  sanctified_armaments_dot:  1253836,
  lunar_storm_dmg:           1253733,

  // ── Tier Set (Midnight S1) ────────────────────────────────
  mid_s1_sv_2pc: 0,  // sets->set(HUNTER_SURVIVAL, MID1, B2)
  mid_s1_sv_4pc: 0,  // sets->set(HUNTER_SURVIVAL, MID1, B4) — triggers SAO on WFB with ToTS
} as const;

// ── Pet AP Scaling ──────────────────────────────────────────
// From sc_hunter.cpp owner_coeff.ap_from_ap assignments.
// Key insight: different pet types use different scaling.

export const PET_AP_COEFFICIENTS = {
  /** Main pet (base companion) */
  main_pet:               0.6,   // Line 2030: owner_coeff.ap_from_ap = 0.6
  /** Dire beast summon */
  dire_beast:             0.6,   // Line 2099: owner_coeff.ap_from_ap = 0.6
  /** Wyvern (Pack Leader summon) */
  wyvern:                 2.0,   // Line 1960: owner_coeff.ap_from_ap = 2
  /** Bear (Pack Leader summon) */
  bear:                   2.0,   // Line 1995: owner_coeff.ap_from_ap = 2
  /** Boar Charge uses hunter_ranged_attack_t — uses hunter AP directly (1.0) */
  boar_charge:            1.0,   // hunter_ranged_attack_t inherits hunter AP
  /** Stampede uses hunter_ranged_attack_t — uses hunter AP directly (1.0) */
  stampede:               1.0,   // hunter_ranged_attack_t inherits hunter AP
  /** Generic BM pet */
  bm_pet:                 1.5,   // Line 1895: owner_coeff.ap_from_ap = 1.5
  /** Wildspeaker pet */
  wildspeaker:            1.0,   // Line 1921: owner_coeff.ap_from_ap = 1
} as const;

// ── Mastery: Spirit Bond ────────────────────────────────────
// From sc_hunter.cpp lines 1364-1405.
// Formula: bonus = cache.mastery() * spirit_bond->effectN(N).mastery_value()
//          bonus *= 1 + spirit_bond_buff->effectN(1 or 3).percent()
//
// In practice for Midnight 12.0:
//   mastery_points = 8 base + mastery_rating / 180
//   player_bonus = mastery_points * 0.025 (2.5% per point)
//   pet_bonus = mastery_points * 0.025 (same for pets)
//   spirit_bond_buff effectN(1) and effectN(3) provide extra multipliers

export const MASTERY_SPIRIT_BOND = {
  /** Rating per mastery point */
  ratingPerPoint: 180,
  /** Base mastery points at level 90 */
  basePoints: 8,
  /** Damage bonus per mastery point (2.5%) — effectN().mastery_value() */
  bonusPerPoint: 0.025,
  /** spirit_bond_buff->effectN(1).percent() — direct damage extra */
  directBonusPct: 0,
  /** spirit_bond_buff->effectN(3).percent() — periodic damage extra */
  periodicBonusPct: 0,
} as const;

// ── Combat Rating Conversions (Level 90 Midnight) ───────────

export const COMBAT_RATINGS = {
  crit: 22.3,          // rating per 1% crit
  haste: 35.0,         // rating per 1% haste
  mastery: 180,        // rating per 1 mastery point
  versatility: 54.0,   // rating per 1% vers
  baseCrit: 5.0,       // 5% base crit chance
  armorK: 14014,       // K value for armor mitigation formula
} as const;

// ── AP Coefficients ─────────────────────────────────────────
// Reverse-engineered from Raidbots output, cross-referenced with SimC
// spell_data_ptr_t assignments. SimC gets these from spell_data but we
// extract them since the actual .dbc values aren't in the .cpp file.
//
// Formula used: coef = hit_damage / (AP * mastery_mult * vers_mult * armor_mult)

export const AP_COEFFICIENTS = {
  // ── Player Abilities ──────────────────────────────────────
  auto_attack:         0.85,
  raptor_strike:       2.86,
  kill_command:        7.26,   // pet ability but scales with hunter AP via 0.6 pet scaling
  wildfire_bomb:       0.495,
  wildfire_bomb_dot:   0.165,  // per tick (6 ticks over 6s)
  boomstick:           0.90,   // initial + DoT ticks
  boomstick_dot:       0.90,   // per tick (4 ticks over 6s)
  takedown:            1.80,
  takedown_pet:        1.44,   // pet component: 80% of player coef
  serpent_sting:       0.25,
  carve:               0.80,
  flamefang_pitch:     1.20,
  flamefang_pitch_dot: 0.20,   // per tick
  moonlight_chakram:   0.90,
  death_chakram:       0.75,
  raptor_swipe:        1.85,
  strike_as_one:       9.24,   // pet ability, uses pet AP (0.6 scaling)

  // ── Pet Abilities ─────────────────────────────────────────
  pet_claw:            2.60,   // main pet, 0.6 AP scaling
  pet_melee:           0.84,   // main pet auto, 0.6 AP scaling

  // ── Pack Leader Hero Tree ─────────────────────────────────
  boar_charge:         20.5,   // uses hunter AP directly (hunter_ranged_attack_t)
  boar_charge_cleave:  24.6,   // cleave component
  bear_rend_per_tick:  2.0,    // bear bleed DoT per tick
  bear_melee:          1.40,   // bear auto-attack
  stampede:            2.80,   // per tick, uses hunter AP directly
  pack_leader_beasts:  5.50,   // generic beast damage
  pack_coordination:   0.50,   // every 4 pet attacks

  // ── Sentinel Hero Tree ────────────────────────────────────
  lunar_storm:         1.20,
  lunar_storm_dot:     0.30,   // per tick
  sentinel_mark:       0.60,
  sentinel_owl:        0.80,

  // ── DoT-specific ──────────────────────────────────────────
  shrapnel_bomb_dot:   0.18,   // per tick
  internal_bleeding:   0.15,   // per tick
  vicious_wound_dot:   0.50,   // per tick
  sanctified_dot:      0.20,   // per tick (sentinel)
} as const;

// ── Cooldowns & Charges ─────────────────────────────────────

export const COOLDOWNS = {
  kill_command:        { baseMs: 6000,  charges: 2,  hasteScales: true  },
  wildfire_bomb:       { baseMs: 18000, charges: 1,  hasteScales: false },
  boomstick:           { baseMs: 60000, charges: 1,  hasteScales: false },
  takedown:            { baseMs: 90000, charges: 1,  hasteScales: false },
  /** With Savagery talent, Takedown CD reduced to 60s */
  takedown_savagery:   { baseMs: 60000, charges: 1,  hasteScales: false },
  carve:               { baseMs: 6000,  charges: 1,  hasteScales: false },
  flamefang_pitch:     { baseMs: 15000, charges: 1,  hasteScales: false },
  moonlight_chakram:   { baseMs: 20000, charges: 1,  hasteScales: false },
  death_chakram:       { baseMs: 45000, charges: 1,  hasteScales: false },
} as const;

// ── Buff/Mechanic Durations ─────────────────────────────────

export const BUFF_DURATIONS = {
  tip_of_the_spear:    { durationMs: 10000, maxStacks: 2, dmgPerStack: 0.25 },
  takedown_window:     { durationMs: 8000 },
  mongoose_fury:       { durationMs: 14000, maxStacks: 5, dmgPerStack: 0.15 },
  bloodseeker:         { durationMs: 12000, attackSpeedPctPerTarget: 10.0 },
  /** Shellshock: Boomstick +40% ST damage, -5% per additional target */
  shellshock:          { stBonusPct: 0.40, reductionPerTarget: 0.05, durationMs: 5000 },
  /** Flanked: during Takedown window, +100% attack speed */
  flanked_attack_speed: 1.0,
  sentinels_wisdom:    { durationMs: 15000, maxStacks: 5, critPctPerStack: 3.0 },
  hogstrider:          { durationMs: 15000 },  // hogstrider_buff spell 472640
  wyverns_cry:         { durationMs: 20000, maxStacks: 10, petDmgPerStack: 0.05 },
  stargazer:           { durationMs: 0 },
} as const;

// ── Proc Chances ────────────────────────────────────────────
// From SimC rng().roll() and PRD mechanics.

export const PROC_CHANCES = {
  /** Lunar Storm proc on Sentinel Owl attack */
  lunar_storm:          0.30,
  /** Eyes of the Eagle: KC resets WFB charge */
  eyes_of_eagle:        0.25,
  /** Vicious Hunt: KC summons dire beast (Pack Leader) */
  vicious_hunt:         0.25,
  /** Frenzied Tear: RS triggers extra pet attack (Pack Leader) */
  frenzied_tear:        0.20,
  /** Tier 4pc: WFB detonation resets Boomstick CD */
  tier_4pc_boomstick:   0.20,
} as const;

// ── Talent Effect Values ────────────────────────────────────
// Per-talent numeric effects extracted from SimC spell data.

export const TALENT_EFFECTS = {
  /** Primal Surge: KC grants +1 extra TotS stack; TotS damage per stack +5% (25%→30%) */
  primal_surge_extra_stacks: 1,
  primal_surge_tots_dmg_per_stack: 0.30,
  /** Twin Fangs: Takedown grants 3 TotS stacks (instead of default 0) */
  twin_fangs_takedown_tots: 3,
  /** Killer Companion: Kill Command damage +10% per rank (2 ranks) */
  killer_companion_kc_pct_per_rank: 0.10,
  /** Sweeping Spear: Raptor Strike +10% damage per rank (2 ranks) */
  sweeping_spear_rs_pct_per_rank: 0.10,
  /** Flanked: Takedown +50% damage, +4 cleave targets */
  flanked_takedown_dmg_pct: 0.50,
  flanked_extra_targets: 4,
  /** Wildfire Infusion: KC +15% damage, KC reduces WFB CD by 1s */
  wildfire_infusion_kc_pct: 0.15,
  wildfire_infusion_wfb_cdr_ms: 1000,
} as const;

// ── Sentinel Owl Counter ────────────────────────────────────
// From sc_hunter.cpp: sentinel owl procs every N KC/auto attacks.

export const SENTINEL_COUNTER = {
  /** Attacks (KC or auto) needed to trigger Sentinel Owl */
  threshold: 5,
  /** Max targets for Sentinel Owl damage */
  owlTargetCap: 8,
} as const;

// ── Pack Leader Beast Cycle ─────────────────────────────────
// Howl of the Pack Leader summons beasts in a cycle:
// Wyvern → Boar → Bear → repeat

export const HOWL_BEAST_CYCLE = {
  /** Cycle order: 0=Wyvern, 1=Boar, 2=Bear */
  order: ["wyvern", "boar", "bear"] as const,
  /** Approximate cycle time (from cooldown buff spell 471877) */
  cycleCdMs: 20000,
  /** Bear summon duration */
  bearDurationMs: 12000,
  /** Bear Rend DoT: 12s duration, 3s tick interval */
  bearRendDurationMs: 12000,
  bearRendTickMs: 3000,
  /** Stampede duration and tick rate */
  stampedeDurationMs: 4000,
  stampedeTickMs: 500,
} as const;

// ── Focus Economy ───────────────────────────────────────────

export const FOCUS_VALUES = {
  baseRegenPerSec: 5,
  raptor_strike_cost: 30,
  kill_command_gen: 20,
  takedown_gen: 50,
  /** Lethal Barbs: +15 focus on KC/RS (from lethal_barbs_energize spell 1264783) */
  lethal_barbs_bonus: 15,
} as const;

// ── AoE Target Caps ─────────────────────────────────────────

export const AOE_CAPS = {
  wildfire_bomb: 8,
  boomstick: 5,
  carve: 5,
  flamefang_pitch: 5,
  moonlight_chakram: 5,
  death_chakram: 5,
  raptor_swipe: 5,
  sentinel_owl: 8,
  sentinel_mark: 8,
  lunar_storm: 8,    // reduced_aoe_targets = 8 (TEMP per SimC comment)
  pack_leader_beasts: 3,
  /** Boar Charge cleave: softcapped to 8 (bugged to -1 with bugs=true) */
  boar_charge_cleave: 8,
} as const;

// ── Weapon Normalization ────────────────────────────────────

export const WEAPON_NORMS = {
  /** 2H weapon normalization speed */
  twoHand: 3.5,
  /** Pet swing timer base */
  petSwingMs: 2000,
  /** Pet Claw internal CD */
  petClawCdMs: 3000,
  /** 2H melee swing base */
  twoHandSwingMs: 3600,
  /** 1H melee swing base */
  oneHandSwingMs: 2600,
} as const;

// ── Combat Mechanics ────────────────────────────────────────

export const COMBAT_MECHANICS = {
  /** Base GCD in milliseconds */
  baseGcdMs: 1500,
  /** Minimum GCD cap */
  minGcdMs: 750,
  /** Base crit damage multiplier (2x) */
  baseCritMult: 2.0,
  /** Boss armor at level 93 (boss_level_delta=3) */
  bossArmor: 1470,
  /** Off-hand damage penalty */
  offHandPenalty: 0.5,
  /** Pandemic DoT extension cap (30% of base duration) */
  pandemicMaxPct: 0.3,
} as const;

// ── Tier Set Effects (Midnight S1) ──────────────────────────

export const TIER_SET = {
  /** 2pc: Raptor Strike / Mongoose Strike bonus */
  sv_2pc: {
    description: "Raptor Strike / Mongoose Strike deals increased damage",
  },
  /** 4pc: WFB with ToTS triggers Strike as One on pet */
  sv_4pc: {
    description: "Wildfire Bomb with Tip of the Spear triggers Strike as One",
    triggersStrikeAsOne: true,
  },
} as const;

// ── Source Metadata ─────────────────────────────────────────

export const SIMC_METADATA = {
  branch: "midnight",
  sourceFile: "engine/class_modules/sc_hunter.cpp",
  aplFile: "engine/class_modules/apl/apl_hunter.cpp",
  /** Last verified against Raidbots character */
  referenceChar: {
    name: "Blezaa",
    hero: "packLeader" as const,
    ilvl: 231,
    referenceDps: 51041,
  },
  /** Date of last coefficient verification */
  lastVerified: "2026-03-11",
} as const;
