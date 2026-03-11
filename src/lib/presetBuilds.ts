// ============================================================
// PRESET TALENT BUILDS — Survival Hunter Midnight 12.0
// Auto-populate talent trees based on fight style + hero tree.
// Sources: WoWHead verified builds, SimulationCraft APL data.
// ============================================================

import type { TalentTreeState } from '@/hooks/useTalentTree';
import type { FightStyle } from '@/utils/simcProfileBuilder';

export type HeroKey = 'sentinel' | 'packLeader';

export interface PresetBuild {
  spec: TalentTreeState;
  hero: TalentTreeState;
  class: TalentTreeState;
}

// ── Spec tree: core nodes taken in ALL builds (30 pts) ───────
// Budget: 30 core + 4 variable = 34 total (incl. 4 apex points)

const SPEC_CORE_POINTS: Record<string, number> = {
  kill_command: 1, wildfire_bomb: 1, raptor_strike: 1,
  guerrilla_tactics: 1, tip_of_spear: 1,
  lunge: 1, boomstick: 1, strike_as_one: 1,
  bomb_choice: 1, quick_reload: 1,
  mongoose_fury: 1, ammo_choice: 1, shellshock: 1,
  bloody_claws: 1, sweeping_spear: 2, vuln_choice: 1,
  takedown: 1, killer_companion: 2,
  twin_fangs: 1, savagery: 2, wfb_infusion: 1,
  flanked: 1, primal_surge: 1,
  // Apex talent + tiers (shares 34-pt spec budget)
  raptor_swipe: 1, apex_tier_1: 1, apex_tier_2: 1, apex_tier_3: 1,
};

const SPEC_CORE_CHOICES: Record<string, 0 | 1> = {
  bomb_choice: 1,     // Flamebreak (over Shrapnel Bomb)
  ammo_choice: 1,     // Wildfire Shells (over Mongoose Rounds)
  bloody_claws: 1,    // Wallop (over Bloody Claws)
  vuln_choice: 1,     // Blackrock Munitions (over Vulnerability)
};

// ── Spec variable nodes per build ────────────────────────────

const SPEC_VARIABLES: Record<string, Record<string, number>> = {
  // Sentinel ST: flankerAdvantage + filler (30 core + 4 var = 34 total)
  sentinel_st: { flankers_advantage: 1, improved_wfb: 2, sic_em: 1 },
  // Sentinel Cleave: same as ST
  sentinel_cleave: { flankers_advantage: 1, improved_wfb: 2, sic_em: 1 },
  // Sentinel AoE: +flanker, +twoAgainstMany, +lethalCalibration
  sentinel_aoe: { flankers_advantage: 1, two_against_many: 1, lethal_calibration: 1, sic_em: 1 },
  // Pack Leader ST: bloodseeker replaces flanker
  packLeader_st: { bloodseeker: 1, two_against_many: 1, lethal_calibration: 1, sic_em: 1 },
  // Pack Leader Cleave: same as ST
  packLeader_cleave: { bloodseeker: 1, two_against_many: 1, lethal_calibration: 1, sic_em: 1 },
  // Pack Leader AoE: flanker + twoAgainst + lethalCal
  packLeader_aoe: { flankers_advantage: 1, two_against_many: 1, lethal_calibration: 1, sic_em: 1 },
};

// ── Hero tree presets (13 pts each) ──────────────────────────

// Sentinel: 14 nodes exist, take 13 (skip cond_choice = utility)
const SENTINEL_HERO: TalentTreeState = {
  points: {
    sentinel_keystone: 1,
    dont_look_back: 1, moons_blessing: 1, sanctified_arms: 1, moonlight_chakram: 1,
    stargazer_choice: 1, cant_miss: 1, invigorating_pulse: 1, twilight_choice: 1,
    arcane_talons: 1, lunar_calling: 1, radiant_edge: 1,
    lunar_storm: 1,
  },
  choiceSelections: {
    stargazer_choice: 0,   // Stargazer (over Open Fire)
    twilight_choice: 0,    // Twilight Requiem (over Stalk and Strike)
  },
};

// Pack Leader: 14 nodes exist, take 13 (skip monster_fang = minor mastery)
const PACK_LEADER_HERO: TalentTreeState = {
  points: {
    vicious_hunt: 1,
    lone_wolf: 1, horn: 1, pathfinding_pl: 1, shoes_choice: 1,
    ursine_choice: 1, cat_charge: 1, boar_head: 1, lethal_barbs: 1,
    go_for_throat: 1, turtle: 1, hoof_choice: 1,
    bestial_discipline: 1,
  },
  choiceSelections: {
    shoes_choice: 0,   // Slicked Shoes (over Masterful Call)
    ursine_choice: 0,  // Ursine Fury (over Sharpened Claws)
    hoof_choice: 0,    // Hoof and Blade (over Wyvern's Gaze)
  },
};

// ── Hunter class tree (34 pts — standard Survival PvE) ──────
// Core DPS + utility. Same across all builds.

const CLASS_PRESET: TalentTreeState = {
  points: {
    // Row 0 — start nodes
    h_rejuvenating_wind: 1, h_sotf: 1, h_posthaste: 1,
    // Row 1
    h_natural_mending: 2, h_padded_armor: 1, h_hunters_avoidance: 1,
    // Row 2
    h_combat_experience: 1, h_improved_cheetah: 1, h_concussive_shot: 1,
    // Row 3
    h_precision_strikes: 1, h_muzzle: 1, h_serrated_tips: 2,
    // Row 4 (gate 8)
    h_pathfinding: 1, h_disruptive_rounds: 1, h_improved_feign: 2, h_misdirection: 1,
    // Row 5
    h_trigger_finger: 2, h_trap_choice: 1, h_touch_of_grass: 2, h_camouflage: 1,
    // Row 6
    h_improved_turtle: 1, h_specialized_arsenal: 1, h_scouts_instincts: 1,
    // Row 7 (gate 23)
    h_lone_survivor: 1, h_binding_shot: 1, h_born_to_be_wild: 2,
    // Row 8
    h_keen_eyesight: 2,
  },
  choiceSelections: {
    h_trap_choice: 0, // Tar Trap (over Scare Beast)
  },
};

// ── Public API ───────────────────────────────────────────────

export function getPresetBuild(
  heroKey: HeroKey,
  fightStyle: FightStyle,
): PresetBuild {
  const varKey = `${heroKey}_${fightStyle}`;
  const varPoints = SPEC_VARIABLES[varKey] ?? SPEC_VARIABLES[`${heroKey}_st`];

  const specPoints: Record<string, number> = { ...SPEC_CORE_POINTS, ...varPoints };
  const specChoices: Record<string, 0 | 1> = { ...SPEC_CORE_CHOICES };

  return {
    spec: { points: specPoints, choiceSelections: specChoices },
    hero: heroKey === 'sentinel' ? SENTINEL_HERO : PACK_LEADER_HERO,
    class: CLASS_PRESET,
  };
}
