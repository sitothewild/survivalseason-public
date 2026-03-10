// ============================================================
// INTERACTIVE TALENT TREE — DATA MODEL
// All node definitions, unlock rules, and types
// Cross-referenced with Wowhead Midnight 12.0.1 talent calculator
// ============================================================

export interface TalentNodeDef {
  id: string;
  spellId: number | null;
  name: string;
  type: 'active' | 'passive' | 'choice' | 'apex';
  maxPts: number;
  row: number;
  col: number;
  parents: string[];
  desc: string;
  /** For choice nodes: two options */
  choiceA?: { name: string; spellId: number; desc: string };
  choiceB?: { name: string; spellId: number; desc: string };
  /** Visual hint: render as small tier dot */
  tier?: boolean;
}

export type NodeState = 'LOCKED' | 'AVAILABLE' | 'SELECTED' | 'PARTIAL';

// ── ROW GATE THRESHOLDS ──────────────────────────────────────

export const SPEC_ROW_GATES: Record<number, number> = {
  1: 0, 2: 1, 3: 2, 4: 4, 5: 6, 6: 8, 7: 10, 8: 14, 9: 20, 10: 26, 12: 30,
};

export const CLASS_ROW_GATES: Record<number, number> = {
  0: 0, 1: 1, 2: 2, 3: 4, 4: 6, 5: 8, 6: 10, 7: 14, 8: 20, 9: 26,
};

export const HERO_UNLOCK_THRESHOLD = 7;

export const SPEC_MAX_PTS = 34;
export const CLASS_MAX_PTS = 34;
export const HERO_MAX_PTS = 13;

// ── SURVIVAL SPEC TREE (Midnight 12.0.1) ─────────────────────

export const SURVIVAL_NODES: TalentNodeDef[] = [
  // ROW 1
  { id:'kill_command', spellId:259489, name:'Kill Command', type:'active', maxPts:1, row:1, col:4,
    parents:[], desc:'Command your pet to savagely deal damage. Generates Focus and Tip of the Spear stacks.' },
  // ROW 2
  { id:'raptor_strike', spellId:186270, name:'Raptor Strike', type:'active', maxPts:1, row:2, col:5,
    parents:['kill_command'], desc:'A vicious slash dealing heavy Physical damage. Primary Focus spender.' },
  { id:'wildfire_bomb', spellId:259495, name:'Wildfire Bomb', type:'active', maxPts:1, row:2, col:3,
    parents:['kill_command'], desc:'Hurl a bomb at the target, dealing Fire damage and a DoT. 2 charges.' },
  // ROW 3
  { id:'tip_of_spear', spellId:260285, name:'Tip of the Spear', type:'passive', maxPts:1, row:3, col:5,
    parents:['raptor_strike'], desc:'Kill Command increases the damage of your next Raptor Strike by 25%.' },
  { id:'guerrilla_tactics', spellId:264332, name:'Guerrilla Tactics', type:'passive', maxPts:1, row:3, col:3,
    parents:['wildfire_bomb'], desc:'Wildfire Bomb initial damage increased by 50%.' },
  // ROW 4
  { id:'lunge', spellId:378934, name:'Lunge', type:'passive', maxPts:1, row:4, col:2,
    parents:['guerrilla_tactics'], desc:'Increases the range of Raptor Strike and melee abilities.' },
  { id:'boomstick', spellId:1261193, name:'Boomstick', type:'active', maxPts:1, row:4, col:4,
    parents:['tip_of_spear','guerrilla_tactics'], desc:'Fire 4 shotgun blasts dealing heavy damage to all targets in front.' },
  { id:'strike_as_one', spellId:1251717, name:'Strike as One', type:'passive', maxPts:1, row:4, col:6,
    parents:['tip_of_spear'], desc:'Your pet leaps to your target when you use Raptor Strike with Tip of the Spear.' },
  // ROW 5
  { id:'bomb_choice', spellId:null, name:'Shrapnel Bomb / Flamebreak', type:'choice', maxPts:1, row:5, col:1,
    parents:['lunge'], desc:'Shrapnel: targets bleed. Flamebreak: knockback + burn.',
    choiceA: { name:'Shrapnel Bomb', spellId:270335, desc:'Wildfire Bomb also causes targets to bleed.' },
    choiceB: { name:'Flamebreak', spellId:1253176, desc:'Knockback + burn damage in an area.' } },
  { id:'bloodseeker', spellId:260248, name:'Bloodseeker', type:'passive', maxPts:1, row:5, col:3,
    parents:['guerrilla_tactics','boomstick'], desc:'Kill Command causes the target to bleed. Attack speed increases per bleeding target.' },
  { id:'quick_reload', spellId:1272136, name:'Quick Reload', type:'passive', maxPts:1, row:5, col:4,
    parents:['boomstick'], desc:'Boomstick reduces Wildfire Bomb recharge time by 2 sec per shot.' },
  { id:'flankers_advantage', spellId:459964, name:"Flanker's Advantage", type:'passive', maxPts:1, row:5, col:5,
    parents:['boomstick','strike_as_one'], desc:'Kill Command has a chance to immediately reset its cooldown.' },
  { id:'two_against_many', spellId:1251718, name:'Two Against Many', type:'passive', maxPts:1, row:5, col:7,
    parents:['strike_as_one'], desc:'Strike as One hits all enemies near the target.' },
  // ROW 6
  { id:'mongoose_fury', spellId:1252708, name:'Mongoose Fury', type:'passive', maxPts:1, row:6, col:2,
    parents:['bloodseeker'], desc:'Raptor Strike increases damage done by 8%, stacking up to 5 times.' },
  { id:'ammo_choice', spellId:null, name:'Mongoose Rounds / Wildfire Shells', type:'choice', maxPts:1, row:6, col:3,
    parents:['bloodseeker','quick_reload'], desc:'Mongoose Rounds: crits grant stacks. Wildfire Shells: WFB applies bleed.',
    choiceA: { name:'Mongoose Rounds', spellId:1253945, desc:'Raptor Strike crits grant a Mongoose Fury stack.' },
    choiceB: { name:'Wildfire Shells', spellId:1253946, desc:'Wildfire Bomb applies a bleed to targets.' } },
  { id:'shellshock', spellId:1252931, name:'Shellshock', type:'passive', maxPts:1, row:6, col:5,
    parents:['flankers_advantage'], desc:'Boomstick knocks back enemies and reduces their movement speed.' },
  { id:'sic_em', spellId:1253137, name:"Sic 'Em", type:'passive', maxPts:1, row:6, col:6,
    parents:['flankers_advantage','two_against_many'], desc:'Kill Command damage increased. Your pet\'s basic attacks deal more damage.' },
  // ROW 7
  { id:'bloody_claws', spellId:null, name:'Bloody Claws / Wallop', type:'choice', maxPts:1, row:7, col:1,
    parents:['mongoose_fury'], desc:'Bloody Claws: Strike as One scales with MF stacks. Wallop: larger AoE.',
    choiceA: { name:'Bloody Claws', spellId:385737, desc:'Strike as One damage scales with Mongoose Fury stacks.' },
    choiceB: { name:'Wallop', spellId:1253139, desc:'Larger AoE on cleave abilities.' } },
  { id:'improved_wfb', spellId:321290, name:'Improved Wildfire Bomb', type:'passive', maxPts:2, row:7, col:2,
    parents:['mongoose_fury','ammo_choice'], desc:'Increases Wildfire Bomb damage.' },
  { id:'bonding', spellId:1262442, name:'Bonding', type:'passive', maxPts:1, row:7, col:3,
    parents:['ammo_choice'], desc:'Pet damage increased while you have Mongoose Fury stacks.' },
  { id:'sweeping_spear', spellId:378950, name:'Sweeping Spear', type:'passive', maxPts:2, row:7, col:4,
    parents:['ammo_choice','shellshock'], desc:'Raptor Strike deals splash damage to nearby enemies.' },
  { id:'vuln_choice', spellId:null, name:'Vulnerability / Blackrock Munitions', type:'choice', maxPts:1, row:7, col:5,
    parents:['shellshock','sic_em'], desc:'Vulnerability: WFB debuffs target. Blackrock: WFB AoE increased.',
    choiceA: { name:'Vulnerability', spellId:1257011, desc:'WFB debuffs target, increasing damage taken.' },
    choiceB: { name:'Blackrock Munitions', spellId:1253141, desc:'WFB deals increased AoE damage.' } },
  { id:'shower_of_blood', spellId:1253053, name:'Shower of Blood', type:'passive', maxPts:2, row:7, col:6,
    parents:['sic_em'], desc:'Kill Command critical strikes cause your pet to lash out at nearby enemies.' },
  { id:'outland_venom', spellId:459939, name:'Outland Venom', type:'passive', maxPts:1, row:7, col:7,
    parents:['sic_em','two_against_many'], desc:'Increases all poison and nature damage dealt.' },
  // ROW 8
  { id:'explosives_expert', spellId:378937, name:'Explosives Expert', type:'passive', maxPts:2, row:8, col:2,
    parents:['improved_wfb','bloody_claws'], desc:'Wildfire Bomb damage increased and cooldown reduced.' },
  { id:'takedown', spellId:1250646, name:'Takedown', type:'active', maxPts:1, row:8, col:4,
    parents:['bonding','sweeping_spear','vuln_choice'], desc:'Leap to your target with your pet. Increases all damage by 20% for 8 sec. Primary cooldown.' },
  { id:'killer_companion', spellId:378955, name:'Killer Companion', type:'passive', maxPts:2, row:8, col:6,
    parents:['shower_of_blood','vuln_choice'], desc:'Kill Command damage increased. Pet flanks on Kill Command.' },
  // ROW 9
  { id:'flamefang', spellId:1251592, name:'Flamefang Pitch', type:'active', maxPts:1, row:9, col:2,
    parents:['explosives_expert'], desc:'Ground-targeted AoE dealing heavy Fire damage and a DoT. 1-min CD.' },
  { id:'twin_fangs', spellId:1272139, name:'Twin Fangs', type:'passive', maxPts:1, row:9, col:3,
    parents:['takedown'], desc:'Kill Command hits a second time for reduced damage.' },
  { id:'savagery', spellId:1251790, name:'Savagery', type:'passive', maxPts:2, row:9, col:5,
    parents:['takedown','killer_companion'], desc:'Strike as One proc chance and pet damage increased.' },
  { id:'wfb_infusion', spellId:460198, name:'Wildfire Infusion', type:'passive', maxPts:1, row:9, col:6,
    parents:['killer_companion'], desc:'Wildfire Bomb applies additional DoT stacks per target hit.' },
  // ROW 10
  { id:'grenade_juggler', spellId:459843, name:'Grenade Juggler', type:'passive', maxPts:1, row:10, col:1,
    parents:['flamefang'], desc:'Wildfire Bomb has a chance to not consume a charge.' },
  { id:'wildfire_imbuement', spellId:1252943, name:'Wildfire Imbuement', type:'passive', maxPts:1, row:10, col:3,
    parents:['twin_fangs'], desc:'Raptor Strike has a chance to throw a free Wildfire Bomb at the target.' },
  { id:'flanked', spellId:1256938, name:'Flanked', type:'passive', maxPts:1, row:10, col:4,
    parents:['twin_fangs','savagery'], desc:'Kill Command Focus cost reduced by 5.' },
  { id:'lethal_calibration', spellId:1262409, name:'Lethal Calibration', type:'passive', maxPts:1, row:10, col:5,
    parents:['savagery'], desc:'Wildfire Bomb detonates for bonus damage when its DoT expires or is refreshed.' },
  { id:'primal_surge', spellId:1272154, name:'Primal Surge', type:'passive', maxPts:1, row:10, col:7,
    parents:['wfb_infusion'], desc:'Takedown cooldown reduced. Kill Command resets generate Focus.' },
];

// ── APEX TALENT (standalone, shares Survival 34-pt budget) ───
export const APEX_NODES: TalentNodeDef[] = [
  { id:'raptor_swipe', spellId:1259019, name:'Raptor Swipe', type:'apex', maxPts:1, row:0, col:2,
    parents:[], desc:'APEX TALENT. Raptor Strike has a chance to become Raptor Swipe, an AoE cleave.' },
  { id:'apex_tier_1', spellId:1259019, name:'Raptor Swipe II', type:'passive', maxPts:1, row:1, col:1,
    parents:['raptor_swipe'], desc:'Increases Raptor Swipe proc chance and damage.' },
  { id:'apex_tier_2', spellId:1259019, name:'Raptor Swipe III', type:'passive', maxPts:1, row:1, col:2,
    parents:['raptor_swipe'], desc:'Further increases Raptor Swipe proc chance and damage.' },
  { id:'apex_tier_3', spellId:1259019, name:'Raptor Swipe IV', type:'passive', maxPts:1, row:1, col:3,
    parents:['raptor_swipe'], desc:'Maximizes Raptor Swipe proc chance and damage.' },
];

// ── SENTINEL HERO TREE (Midnight 12.0.1) ─────────────────────

export const SENTINEL_NODES: TalentNodeDef[] = [
  { id:'sentinel_keystone', spellId:1253599, name:'Sentinel', type:'passive', maxPts:1, row:1, col:4,
    parents:[], desc:'KEYSTONE. Your abilities apply Sentinel stacks. At max stacks, unleash a burst of Arcane damage.' },
  { id:'dont_look_back', spellId:450373, name:"Don't Look Back", type:'passive', maxPts:1, row:2, col:1,
    parents:['sentinel_keystone'], desc:'Disengage grants you increased damage for a short time.' },
  { id:'moons_blessing', spellId:1253825, name:"Moon's Blessing", type:'passive', maxPts:1, row:2, col:3,
    parents:['sentinel_keystone'], desc:'Sentinel stacks are applied faster during the night.' },
  { id:'sanctified_arms', spellId:1253831, name:'Sanctified Armaments', type:'passive', maxPts:1, row:2, col:5,
    parents:['sentinel_keystone'], desc:'Your attacks deal additional Arcane damage.' },
  { id:'moonlight_chakram', spellId:1264902, name:'Moonlight Chakram', type:'passive', maxPts:1, row:2, col:7,
    parents:['sentinel_keystone'], desc:'Hurls a chakram that bounces between enemies dealing Arcane damage.' },
  { id:'stargazer_choice', spellId:null, name:'Stargazer / Open Fire', type:'choice', maxPts:1, row:3, col:1,
    parents:['dont_look_back'], desc:'Stargazer: buff that amplifies damage. Open Fire: ranged AoE.',
    choiceA: { name:'Stargazer', spellId:1253751, desc:'Buff that amplifies your damage.' },
    choiceB: { name:'Open Fire', spellId:1253807, desc:'Ranged AoE damage ability.' } },
  { id:'cant_miss', spellId:1253830, name:"Can't Miss, Won't Miss", type:'passive', maxPts:1, row:3, col:3,
    parents:['moons_blessing'], desc:'Sentinel stacks increase your critical strike chance.' },
  { id:'invigorating_pulse', spellId:450379, name:'Invigorating Pulse', type:'passive', maxPts:1, row:3, col:5,
    parents:['sanctified_arms'], desc:'Sentinel burst heals you and increases haste briefly.' },
  { id:'twilight_choice', spellId:null, name:'Twilight Requiem / Stalk and Strike', type:'choice', maxPts:1, row:3, col:7,
    parents:['moonlight_chakram'], desc:'Twilight Requiem: Chakram silences. Stalk and Strike: bonus after Feign Death.',
    choiceA: { name:'Twilight Requiem', spellId:1264904, desc:'Moonlight Chakram silences targets.' },
    choiceB: { name:'Stalk and Strike', spellId:1266069, desc:'Increased damage after Feign Death.' } },
  { id:'arcane_talons', spellId:1253846, name:'Arcane Talons', type:'passive', maxPts:1, row:4, col:1,
    parents:['stargazer_choice'], desc:'Your next melee attack after Kill Command deals bonus Arcane damage.' },
  { id:'lunar_calling', spellId:1253852, name:'Lunar Calling', type:'passive', maxPts:1, row:4, col:3,
    parents:['cant_miss'], desc:'Sentinel stacks last longer and their burst deals increased damage.' },
  { id:'cond_choice', spellId:null, name:"Conditioning / Scout's Vigil", type:'choice', maxPts:1, row:4, col:5,
    parents:['invigorating_pulse'], desc:"Conditioning: reduces damage taken. Scout's Vigil: resets Feign Death.",
    choiceA: { name:'Conditioning', spellId:1253887, desc:'Reduces damage taken while Sentinel is active.' },
    choiceB: { name:"Scout's Vigil", spellId:450380, desc:'Resets Feign Death cooldown on Sentinel burst.' } },
  { id:'radiant_edge', spellId:1264903, name:'Radiant Edge', type:'passive', maxPts:1, row:4, col:7,
    parents:['twilight_choice'], desc:'Moonlight Chakram deals increased damage to targets with Sentinel stacks.' },
  { id:'lunar_storm', spellId:1253732, name:'Lunar Storm', type:'passive', maxPts:1, row:5, col:4,
    parents:['arcane_talons','lunar_calling','cond_choice','radiant_edge'],
    desc:'CAPSTONE. Periodically calls down a Lunar Storm on your target, dealing massive Arcane damage.' },
];

// ── PACK LEADER HERO TREE ────────────────────────────────────

export const PACK_LEADER_NODES: TalentNodeDef[] = [
  { id:'vicious_hunt', spellId:471876, name:'Vicious Hunt', type:'passive', maxPts:1, row:1, col:4,
    parents:[], desc:'KEYSTONE. Kill Command can trigger beast companion attacks: Rend Flesh, Bear Melee, Boar Charge, or Stampede.' },
  { id:'lone_wolf', spellId:472358, name:'Lone Wolf', type:'passive', maxPts:1, row:2, col:1,
    parents:['vicious_hunt'], desc:'Increases your damage when your pet is active.' },
  { id:'horn', spellId:472352, name:'Horn', type:'passive', maxPts:1, row:2, col:3,
    parents:['vicious_hunt'], desc:'Reduces Howl of the Pack Leader cooldown.' },
  { id:'pathfinding_pl', spellId:472357, name:'Pathfinding', type:'passive', maxPts:1, row:2, col:5,
    parents:['vicious_hunt'], desc:'Increases movement speed.' },
  { id:'shoes_choice', spellId:null, name:'Slicked Shoes / Masterful Call', type:'choice', maxPts:1, row:2, col:7,
    parents:['vicious_hunt'], desc:"Slicked Shoes: roll on kill. Masterful Call: reduces Master's Call CD.",
    choiceA: { name:'Slicked Shoes', spellId:472719, desc:'Roll on kill for movement speed.' },
    choiceB: { name:'Masterful Call', spellId:472720, desc:"Reduces Master's Call CD." } },
  { id:'ursine_choice', spellId:null, name:'Ursine Fury / Sharpened Claws', type:'choice', maxPts:1, row:3, col:1,
    parents:['lone_wolf'], desc:'Ursine Fury: Bear Melee hits extra targets. Sharpened Claws: Bear Melee crits.',
    choiceA: { name:'Ursine Fury', spellId:472476, desc:'Bear Melee hits extra targets.' },
    choiceB: { name:'Sharpened Claws', spellId:472524, desc:'Bear Melee crits deal more damage.' } },
  { id:'cat_charge', spellId:472550, name:'Cat Charge', type:'passive', maxPts:1, row:3, col:3,
    parents:['horn'], desc:'Boar Charge knocks down target.' },
  { id:'boar_head', spellId:472639, name:'Boar Head', type:'passive', maxPts:1, row:3, col:5,
    parents:['pathfinding_pl'], desc:'Boar Charge deals increased damage.' },
  { id:'critical_shot', spellId:1264781, name:'Critical Shot', type:'passive', maxPts:1, row:3, col:7,
    parents:['shoes_choice'], desc:'Kill Command crits trigger an additional beast proc.' },
  { id:'go_for_throat', spellId:472660, name:'Go for the Throat', type:'passive', maxPts:1, row:4, col:1,
    parents:['ursine_choice'], desc:'Rend Flesh generates 5 bonus Focus.' },
  { id:'turtle', spellId:472707, name:'Turtle', type:'passive', maxPts:1, row:4, col:3,
    parents:['cat_charge'], desc:'Your pet takes reduced damage during beast procs.' },
  { id:'hoof_choice', spellId:null, name:"Hoof and Blade / Wyvern's Gaze", type:'choice', maxPts:1, row:4, col:5,
    parents:['boar_head'], desc:"Hoof and Blade: Bear + Boar combo. Wyvern's Gaze: stun on Boar Charge.",
    choiceA: { name:'Hoof and Blade', spellId:1264797, desc:'Bear + Boar combo attack.' },
    choiceB: { name:"Wyvern's Gaze", spellId:1264792, desc:'Stun on Boar Charge.' } },
  { id:'monster_fang', spellId:1264775, name:'Monster Fang', type:'passive', maxPts:1, row:4, col:7,
    parents:['critical_shot'], desc:'Beast procs have a chance to trigger Stampede.' },
  { id:'bestial_discipline', spellId:472741, name:'Bestial Discipline', type:'passive', maxPts:1, row:5, col:4,
    parents:['go_for_throat','turtle','hoof_choice','monster_fang'],
    desc:'CAPSTONE. All beast procs deal 20% increased damage. Reduces beast proc cooldowns.' },
];

// ── HUNTER CLASS TREE (Survival-specific, Midnight 12.0.1) ───

export const HUNTER_NODES: TalentNodeDef[] = [
  // ROW 0 (3 start nodes)
  { id:'h_posthaste', spellId:109215, name:'Posthaste', type:'passive', maxPts:1, row:0, col:2,
    parents:[], desc:'Disengage frees you from movement effects and increases speed by 50% for 4 sec.' },
  { id:'h_combat_experience', spellId:1268871, name:'Combat Experience', type:'passive', maxPts:1, row:0, col:4,
    parents:[], desc:'Increases your damage and healing done. Core passive.' },
  { id:'h_muzzle', spellId:187707, name:'Muzzle', type:'active', maxPts:1, row:0, col:6,
    parents:[], desc:'Interrupt a spellcast, preventing that school for 3 sec. 15-sec CD.' },

  // ROW 1
  { id:'h_natural_mending', spellId:270581, name:'Natural Mending', type:'passive', maxPts:2, row:1, col:1,
    parents:['h_posthaste'], desc:'Focus spending reduces Exhilaration cooldown.' },
  { id:'h_padded_armor', spellId:459450, name:'Padded Armor', type:'passive', maxPts:1, row:1, col:3,
    parents:['h_posthaste','h_combat_experience'], desc:'Survival of the Fittest gains an additional charge.' },
  { id:'h_precision_strikes', spellId:1267003, name:'Precision Strikes', type:'passive', maxPts:1, row:1, col:5,
    parents:['h_combat_experience','h_muzzle'], desc:'Critical strike damage of your abilities increased.' },
  { id:'h_serrated_tips', spellId:459502, name:'Serrated Tips', type:'passive', maxPts:2, row:1, col:7,
    parents:['h_muzzle'], desc:'Bleed and poison damage increased per point.' },

  // ROW 2
  { id:'h_rejuvenating_wind', spellId:385539, name:'Rejuvenating Wind', type:'passive', maxPts:1, row:2, col:1,
    parents:['h_natural_mending'], desc:'Maximum HP increased by 4%. Exhilaration heals 12% more.' },
  { id:'h_hunters_avoidance', spellId:384799, name:"Hunter's Avoidance", type:'passive', maxPts:1, row:2, col:3,
    parents:['h_padded_armor'], desc:'Reduces AoE damage taken.' },
  { id:'h_concussive_shot', spellId:5116, name:'Concussive Shot', type:'active', maxPts:1, row:2, col:4,
    parents:['h_padded_armor','h_precision_strikes'], desc:'Dazes the target, slowing movement speed by 50% for 6 sec.' },
  { id:'h_improved_cheetah', spellId:1258407, name:'Improved Aspect of the Cheetah', type:'passive', maxPts:1, row:2, col:5,
    parents:['h_precision_strikes'], desc:'Aspect of the Cheetah cooldown reduced.' },
  { id:'h_wilderness_medicine', spellId:343242, name:'Wilderness Medicine', type:'passive', maxPts:1, row:2, col:7,
    parents:['h_serrated_tips'], desc:'Exhilaration heals for 20% more.' },

  // ROW 3
  { id:'h_pathfinding', spellId:378002, name:'Pathfinding', type:'passive', maxPts:1, row:3, col:2,
    parents:['h_rejuvenating_wind','h_hunters_avoidance'], desc:'Movement speed increased by 4%.' },
  { id:'h_tranq_shot', spellId:19801, name:'Tranquilizing Shot', type:'active', maxPts:1, row:3, col:4,
    parents:['h_concussive_shot'], desc:'Remove 1 Enrage and 1 Magic effect from an enemy. 10-sec CD.' },
  { id:'h_disruptive_rounds', spellId:343244, name:'Disruptive Rounds', type:'passive', maxPts:1, row:3, col:5,
    parents:['h_concussive_shot','h_improved_cheetah'], desc:'Muzzle cooldown reduced and interrupts grant Focus.' },
  { id:'h_improved_feign', spellId:1258486, name:'Improved Feign Death', type:'passive', maxPts:2, row:3, col:7,
    parents:['h_wilderness_medicine'], desc:'Feign Death removes harmful effects and reduces damage taken.' },

  // ROW 4 (GATE at 6 pts)
  { id:'h_misdirection', spellId:34477, name:'Misdirection', type:'active', maxPts:1, row:4, col:1,
    parents:['h_pathfinding'], desc:'Redirect your threat to your pet or an ally for 8 sec. 30-sec CD.' },
  { id:'h_tranq_choice', spellId:null, name:'Kodo Tranquilizer / Devilsaur Tranquilizer', type:'choice', maxPts:1, row:4, col:3,
    parents:['h_pathfinding','h_tranq_shot'], desc:'Kodo: Tranq Shot removes 2 Enrages. Devilsaur: Tranq Shot removes 2 Magic effects.',
    choiceA: { name:'Kodo Tranquilizer', spellId:459549, desc:'Tranquilizing Shot removes 2 Enrage effects.' },
    choiceB: { name:'Devilsaur Tranquilizer', spellId:459548, desc:'Tranquilizing Shot removes 2 Magic effects.' } },
  { id:'h_kindling_flare', spellId:459506, name:'Kindling Flare', type:'active', maxPts:1, row:4, col:4,
    parents:['h_tranq_shot','h_disruptive_rounds'], desc:'Toss a flare that reveals and slows enemies in the area.' },
  { id:'h_trigger_finger', spellId:459534, name:'Trigger Finger', type:'passive', maxPts:2, row:4, col:5,
    parents:['h_disruptive_rounds'], desc:'Reduces the cooldown of Kill Command and Wildfire Bomb.' },
  { id:'h_trap_choice', spellId:null, name:'Tar Trap / Scare Beast', type:'choice', maxPts:1, row:4, col:7,
    parents:['h_improved_feign'], desc:'Tar Trap: AoE slow pool. Scare Beast: fears a beast target.',
    choiceA: { name:'Tar Trap', spellId:187698, desc:'Place a trap that creates a tar pool, slowing enemies by 50%.' },
    choiceB: { name:'Scare Beast', spellId:1513, desc:'Fear a Beast target for 20 sec. Damage breaks effect.' } },

  // ROW 5 (GATE at 8 pts)
  { id:'h_touch_of_grass', spellId:1258402, name:'Touch of Grass', type:'passive', maxPts:2, row:5, col:1,
    parents:['h_misdirection'], desc:'Increases healing received and Exhilaration healing per point.' },
  { id:'h_camouflage', spellId:199483, name:'Camouflage', type:'active', maxPts:1, row:5, col:2,
    parents:['h_misdirection','h_tranq_choice'], desc:'Stealth for 1 min. Heals 2% HP every 1 sec while active.' },
  { id:'h_no_hard_feelings', spellId:459546, name:'No Hard Feelings', type:'passive', maxPts:1, row:5, col:3,
    parents:['h_tranq_choice','h_kindling_flare'], desc:'Misdirection cooldown reduced. When Misdirection ends, threat is permanently transferred.' },
  { id:'h_improved_turtle', spellId:1258485, name:'Improved Aspect of the Turtle', type:'passive', maxPts:1, row:5, col:4,
    parents:['h_kindling_flare'], desc:'Aspect of the Turtle also reduces damage taken by 30%.' },
  { id:'h_specialized_arsenal', spellId:459542, name:'Specialized Arsenal', type:'passive', maxPts:1, row:5, col:5,
    parents:['h_trigger_finger'], desc:'Increases damage of all abilities based on your weapon type.' },
  { id:'h_scouts_instincts', spellId:459455, name:"Scout's Instincts", type:'passive', maxPts:1, row:5, col:6,
    parents:['h_trigger_finger','h_trap_choice'], desc:'Damage increased against targets above 80% health.' },
  { id:'h_shell_wall', spellId:1267218, name:'Shell Wall', type:'passive', maxPts:1, row:5, col:7,
    parents:['h_trap_choice'], desc:'Aspect of the Turtle gains an additional charge.' },

  // ROW 6 (GATE at 10 pts)
  { id:'h_intimidation', spellId:19577, name:'Intimidation', type:'active', maxPts:1, row:6, col:2,
    parents:['h_camouflage','h_no_hard_feelings'], desc:'Your pet stuns the target for 5 sec. 1-min CD.' },
  { id:'h_lone_survivor', spellId:388039, name:'Lone Survivor', type:'passive', maxPts:1, row:6, col:3,
    parents:['h_no_hard_feelings','h_improved_turtle'], desc:'Disengage and Feign Death cooldowns reduced.' },
  { id:'h_catlike_reflexes', spellId:1258404, name:'Catlike Reflexes', type:'passive', maxPts:1, row:6, col:5,
    parents:['h_specialized_arsenal','h_scouts_instincts'], desc:'Survival of the Fittest cooldown reduced.' },
  { id:'h_improved_snaring', spellId:1268868, name:'Improved Snaring', type:'passive', maxPts:1, row:6, col:6,
    parents:['h_scouts_instincts','h_shell_wall'], desc:'Wing Clip and Concussive Shot slow increased.' },

  // ROW 7 (GATE at 14 pts)
  { id:'h_binding_shot', spellId:109248, name:'Binding Shot', type:'active', maxPts:1, row:7, col:1,
    parents:['h_intimidation'], desc:'Fire a shot that tethers enemies. Moving 5 yards away stuns for 3 sec.' },
  { id:'h_trailblazer_choice', spellId:null, name:'Trailblazer / Moment of Opportunity', type:'choice', maxPts:1, row:7, col:2,
    parents:['h_intimidation','h_lone_survivor'], desc:'Trailblazer: speed while not attacking. Moment: bonus proc chance.',
    choiceA: { name:'Trailblazer', spellId:199921, desc:'Movement speed increased by 30% after not attacking for 3 sec.' },
    choiceB: { name:'Moment of Opportunity', spellId:459551, desc:'Your abilities have a chance to make your next attack free.' } },
  { id:'h_cold_feet', spellId:1268671, name:'Cold Feet', type:'passive', maxPts:1, row:7, col:3,
    parents:['h_lone_survivor'], desc:'Freezing Trap cooldown reduced.' },
  { id:'h_territorial_choice', spellId:null, name:'Territorial Instincts / Guttural Roar', type:'choice', maxPts:1, row:7, col:4,
    parents:['h_lone_survivor','h_catlike_reflexes'], desc:'Territorial: SotF triggers on Exhil. Guttural: pet AoE fear.',
    choiceA: { name:'Territorial Instincts', spellId:459507, desc:'Exhilaration triggers a shorter Survival of the Fittest.' },
    choiceB: { name:'Guttural Roar', spellId:459555, desc:'Your pet lets out a roar, fearing nearby enemies.' } },
  { id:'h_born_to_be_wild', spellId:266921, name:'Born To Be Wild', type:'passive', maxPts:2, row:7, col:5,
    parents:['h_catlike_reflexes'], desc:'Reduces the cooldowns of Aspect abilities by 7% per point.' },
  { id:'h_keen_eyesight', spellId:378004, name:'Keen Eyesight', type:'passive', maxPts:2, row:7, col:6,
    parents:['h_catlike_reflexes','h_improved_snaring'], desc:'Critical strike chance increased by 2% per point.' },
  { id:'h_tether_choice', spellId:null, name:'Tar-Coated Bindings / Horsehair Tether', type:'choice', maxPts:1, row:7, col:7,
    parents:['h_improved_snaring'], desc:'Tar-Coated: Binding Shot root. Horsehair: Steel Trap root lasts longer.',
    choiceA: { name:'Tar-Coated Bindings', spellId:459553, desc:'Binding Shot roots instead of stunning.' },
    choiceB: { name:'Horsehair Tether', spellId:459554, desc:'Steel Trap root duration increased.' } },

  // ROW 8 (GATE at 20 pts)
  { id:'h_improved_traps', spellId:343247, name:'Improved Traps', type:'passive', maxPts:1, row:8, col:2,
    parents:['h_binding_shot','h_trailblazer_choice','h_cold_feet'], desc:'Trap cooldowns reduced by 5 sec.' },
  { id:'h_emergency_salve', spellId:459517, name:'Emergency Salve', type:'passive', maxPts:1, row:8, col:4,
    parents:['h_cold_feet','h_territorial_choice','h_born_to_be_wild'], desc:'Exhilaration heals for more when you are below 50% HP.' },
  { id:'h_guardian_choice', spellId:null, name:'Roar of Sacrifice / Guardian\'s Hide', type:'choice', maxPts:1, row:8, col:5,
    parents:['h_born_to_be_wild','h_keen_eyesight'], desc:'Roar: pet absorbs 20% damage. Guardian: damage reduction aura.',
    choiceA: { name:'Roar of Sacrifice', spellId:53480, desc:'Your pet absorbs 20% of damage dealt to a party member.' },
    choiceB: { name:"Guardian's Hide", spellId:1272094, desc:'Damage reduction for your party while SotF is active.' } },
  { id:'h_unnatural_causes', spellId:459527, name:'Unnatural Causes', type:'passive', maxPts:1, row:8, col:7,
    parents:['h_keen_eyesight','h_tether_choice'], desc:'Your bleeds and poisons deal increased damage. Targets with your bleeds take increased damage from all sources.' },

  // ROW 9 (GATE at 26 pts)  — no apex, just final nodes
  // Empty intentionally — Survival class tree ends at row 8 with 43 nodes
];


// ── ICON FALLBACKS ───────────────────────────────────────────

export const WOWHEAD_ICON_FALLBACKS: Record<number, string> = {
  // ── Survival Spec ──
  259489: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_killcommand.jpg",
  186270: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_raptorstrike.jpg",
  259495: "https://wow.zamimg.com/images/wow/icons/large/inv_wildfirebomb.jpg",
  260285: "https://wow.zamimg.com/images/wow/icons/large/ability_bossmannoroth_glaivethrust.jpg",
  264332: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_guerrillatactics.jpg",
  378934: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_harpoon.jpg",
  1261193: "https://wow.zamimg.com/images/wow/icons/large/inv_musket_04.jpg",
  1251717: "https://wow.zamimg.com/images/wow/icons/large/inv_coordinatedassault.jpg",
  260248: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_mongoosebite.jpg",
  1272136: "https://wow.zamimg.com/images/wow/icons/large/inv_misc_bomb_02.jpg",
  459964: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_flankingtrike.jpg",
  1251718: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_separationanxiety.jpg",
  1252708: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_mongoosebite.jpg",
  1252931: "https://wow.zamimg.com/images/wow/icons/large/inv_firearm_2h_rifle_d_02_green.jpg",
  1253137: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_sickem.jpg",
  321290: "https://wow.zamimg.com/images/wow/icons/large/inv_wildfirebomb.jpg",
  1262442: "https://wow.zamimg.com/images/wow/icons/large/ability_druid_ferociousbite.jpg",
  378950: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_raptorstrike.jpg",
  1253053: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_raptorstrike.jpg",
  459939: "https://wow.zamimg.com/images/wow/icons/large/ability_creature_poison_06.jpg",
  378937: "https://wow.zamimg.com/images/wow/icons/large/inv_wildfirebomb.jpg",
  1250646: "https://wow.zamimg.com/images/wow/icons/large/inv12_ability_hunter_takedown.jpg",
  378955: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_killcommand.jpg",
  1251592: "https://wow.zamimg.com/images/wow/icons/large/inv_10_blacksmithing_craftedoptional_blacksmithdye_fire.jpg",
  1272139: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_killcommand.jpg",
  1251790: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_separationanxiety.jpg",
  460198: "https://wow.zamimg.com/images/wow/icons/large/inv_wildfirebomb.jpg",
  459843: "https://wow.zamimg.com/images/wow/icons/large/inv_misc_bomb_02.jpg",
  1252943: "https://wow.zamimg.com/images/wow/icons/large/inv_wildfirebomb.jpg",
  1256938: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_flankingtrike.jpg",
  1262409: "https://wow.zamimg.com/images/wow/icons/large/inv_wildfirebomb.jpg",
  1272154: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_killcommand.jpg",
  1259019: "https://wow.zamimg.com/images/wow/icons/large/inv12_apextalent_hunter_raptorswipe.jpg",
  // Choice sub-spells (spec)
  270335: "https://wow.zamimg.com/images/wow/icons/large/inv_wildfirebomb.jpg",
  1253176: "https://wow.zamimg.com/images/wow/icons/large/spell_fire_flamebolt.jpg",
  385737: "https://wow.zamimg.com/images/wow/icons/large/ability_druid_rake.jpg",
  1253139: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_raptorstrike.jpg",
  1253945: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_mongoosebite.jpg",
  1253946: "https://wow.zamimg.com/images/wow/icons/large/inv_wildfirebomb.jpg",
  1257011: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_raptorstrike.jpg",
  1253141: "https://wow.zamimg.com/images/wow/icons/large/inv_wildfirebomb.jpg",

  // ── Sentinel ──
  1253599: "https://wow.zamimg.com/images/wow/icons/large/ability_racial_dvinewardenofthelightofthestar.jpg",
  450373: "https://wow.zamimg.com/images/wow/icons/large/ability_rogue_feint.jpg",
  1253825: "https://wow.zamimg.com/images/wow/icons/large/spell_arcane_starfire.jpg",
  1253831: "https://wow.zamimg.com/images/wow/icons/large/inv_polearm_2h_felfireraid_d_01.jpg",
  1264902: "https://wow.zamimg.com/images/wow/icons/large/ability_upgrademoonglaive.jpg",
  1253751: "https://wow.zamimg.com/images/wow/icons/large/spell_frost_stun.jpg",
  1253807: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_resistanceisfutile.jpg",
  1253830: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_markedfordeath.jpg",
  450379: "https://wow.zamimg.com/images/wow/icons/large/spell_holy_divineillumination.jpg",
  1264904: "https://wow.zamimg.com/images/wow/icons/large/spell_shadow_requiem.jpg",
  1266069: "https://wow.zamimg.com/images/wow/icons/large/ability_rogue_stalkandstrike.jpg",
  1253846: "https://wow.zamimg.com/images/wow/icons/large/spell_frost_arcticwinds.jpg",
  1253852: "https://wow.zamimg.com/images/wow/icons/large/ability_druid_lunarguidance.jpg",
  1253887: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_aspectoftheviper.jpg",
  450380: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_mastermarksman.jpg",
  1264903: "https://wow.zamimg.com/images/wow/icons/large/inv_glaive_1h_npc_d_01.jpg",
  1253732: "https://wow.zamimg.com/images/wow/icons/large/ability_druid_lunarguidance.jpg",

  // ── Pack Leader ──
  471876: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_sickem.jpg",
  472358: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_lonewolf.jpg",
  472352: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_beastwithin.jpg",
  472357: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_pathfinding2.jpg",
  472719: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_aspectoftheviper.jpg",
  472720: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_mendpet.jpg",
  472476: "https://wow.zamimg.com/images/wow/icons/large/ability_druid_ferociousbite.jpg",
  472524: "https://wow.zamimg.com/images/wow/icons/large/ability_druid_rake.jpg",
  472550: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_wildattack.jpg",
  472639: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_corneredprey.jpg",
  1264781: "https://wow.zamimg.com/images/wow/icons/large/ability_druid_mangle.jpg",
  472660: "https://wow.zamimg.com/images/wow/icons/large/ability_druid_ferociousbite.jpg",
  472707: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_rapidregeneration.jpg",
  1264797: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_multishot.jpg",
  1264792: "https://wow.zamimg.com/images/wow/icons/large/ability_creature_poison_06.jpg",
  1264775: "https://wow.zamimg.com/images/wow/icons/large/ability_druid_rake.jpg",
  472741: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_sickem.jpg",

  // ── Hunter Class Tree ──
  109215: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_posthaste.jpg",
  1268871: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_combatexperience.jpg",
  187707: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_negate.jpg",
  270581: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_mendpet.jpg",
  459450: "https://wow.zamimg.com/images/wow/icons/large/spell_nature_spiritarmor.jpg",
  1267003: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_mastermarksman.jpg",
  459502: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_serpentsting.jpg",
  385539: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_mendpet.jpg",
  384799: "https://wow.zamimg.com/images/wow/icons/large/ability_rogue_feigndeath.jpg",
  5116: "https://wow.zamimg.com/images/wow/icons/large/spell_frost_stun.jpg",
  1258407: "https://wow.zamimg.com/images/wow/icons/large/ability_mount_jungletiger.jpg",
  343242: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_mendpet.jpg",
  378002: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_pathfinding2.jpg",
  19801: "https://wow.zamimg.com/images/wow/icons/large/spell_nature_drowsy.jpg",
  343244: "https://wow.zamimg.com/images/wow/icons/large/inv_ammo_arrow_03.jpg",
  1258486: "https://wow.zamimg.com/images/wow/icons/large/ability_rogue_feigndeath.jpg",
  34477: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_misdirection.jpg",
  459549: "https://wow.zamimg.com/images/wow/icons/large/spell_nature_drowsy.jpg",
  459548: "https://wow.zamimg.com/images/wow/icons/large/spell_nature_drowsy.jpg",
  459506: "https://wow.zamimg.com/images/wow/icons/large/spell_fire_flare.jpg",
  459534: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_rapidkill.jpg",
  187698: "https://wow.zamimg.com/images/wow/icons/large/spell_yorsahj_bloodboil_black.jpg",
  1513: "https://wow.zamimg.com/images/wow/icons/large/ability_druid_cower.jpg",
  1258402: "https://wow.zamimg.com/images/wow/icons/large/inv_misc_herb_07.jpg",
  199483: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_camouflage.jpg",
  459546: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_misdirection.jpg",
  1258485: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_pet_turtle.jpg",
  459542: "https://wow.zamimg.com/images/wow/icons/large/inv_polearm_2h_felfireraid_d_01.jpg",
  459455: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_eagleeye.jpg",
  1267218: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_pet_turtle.jpg",
  19577: "https://wow.zamimg.com/images/wow/icons/large/ability_devour.jpg",
  388039: "https://wow.zamimg.com/images/wow/icons/large/ability_rogue_feigndeath.jpg",
  1258404: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_aspectoftheviper.jpg",
  1268868: "https://wow.zamimg.com/images/wow/icons/large/ability_rogue_trip.jpg",
  109248: "https://wow.zamimg.com/images/wow/icons/large/spell_shaman_bindelemental.jpg",
  199921: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_pathfinding2.jpg",
  459551: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_rapidkill.jpg",
  1268671: "https://wow.zamimg.com/images/wow/icons/large/spell_frost_chainsofice.jpg",
  459507: "https://wow.zamimg.com/images/wow/icons/large/spell_nature_spiritarmor.jpg",
  459555: "https://wow.zamimg.com/images/wow/icons/large/ability_druid_ferociousbite.jpg",
  266921: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_aspectoftheviper.jpg",
  378004: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_eagleeye.jpg",
  459553: "https://wow.zamimg.com/images/wow/icons/large/spell_shaman_bindelemental.jpg",
  459554: "https://wow.zamimg.com/images/wow/icons/large/inv_trap_01.jpg",
  343247: "https://wow.zamimg.com/images/wow/icons/large/ability_ensnare.jpg",
  459517: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_mendpet.jpg",
  53480: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_ferociousinspiration.jpg",
  1272094: "https://wow.zamimg.com/images/wow/icons/large/spell_nature_spiritarmor.jpg",
  459527: "https://wow.zamimg.com/images/wow/icons/large/ability_creature_poison_06.jpg",
};

// ── SIM SYNC KEYS ────────────────────────────────────────────
export const SIM_TALENT_MAP: Record<string, string> = {
  // Spec tree
  'sic_em': 'lethal_barbs',
  'quick_reload': 'grenade_juggler',
  'mongoose_fury': 'mongoose_fury',
  'takedown': 'takedown',
  'bloody_claws': 'bloody_claws',
  'raptor_swipe': 'apex_pts',
  // Hero tree
  'sentinel_keystone': 'hero_sentinel',
  'vicious_hunt': 'hero_pack_leader',
  // Class tree
  'h_precision_strikes': 'precisionStrikes',
  'h_keen_eyesight': 'keenEyesight',
  'h_serrated_tips': 'serratedTips',
  'h_specialized_arsenal': 'specializedArsenal',
  'h_trigger_finger': 'triggerFinger',
  'h_unnatural_causes': 'unnaturalCauses',
  'h_born_to_be_wild': 'bornToBeWild',
};
