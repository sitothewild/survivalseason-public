// ============================================================
// INTERACTIVE TALENT TREE — DATA MODEL
// All node definitions, unlock rules, and types
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
}

export type NodeState = 'LOCKED' | 'AVAILABLE' | 'SELECTED' | 'PARTIAL';

// ── ROW GATE THRESHOLDS ──────────────────────────────────────

export const SPEC_ROW_GATES: Record<number, number> = {
  1: 0, 2: 1, 3: 2, 4: 4, 5: 6, 6: 8, 7: 10, 8: 14, 9: 20, 10: 26, 12: 30,
};

export const CLASS_ROW_GATES: Record<number, number> = {
  0: 0, 1: 1, 2: 2, 3: 4, 4: 6, 5: 8, 6: 10, 7: 14, 8: 20, 9: 26,
};

export const HERO_UNLOCK_THRESHOLD = 7; // spec pts needed to unlock hero tree

export const SPEC_MAX_PTS = 34;
export const CLASS_MAX_PTS = 34;
export const HERO_MAX_PTS = 13;

// ── SURVIVAL SPEC TREE ───────────────────────────────────────

export const SURVIVAL_NODES: TalentNodeDef[] = [
  // ROW 1
  { id:'kill_command', spellId:259489, name:'Kill Command', type:'active', maxPts:1, row:1, col:4,
    parents:[], desc:'Command your pet to leap. Primary rotational ability.' },
  // ROW 2
  { id:'raptor_strike', spellId:186270, name:'Raptor Strike', type:'active', maxPts:1, row:2, col:5,
    parents:['kill_command'], desc:'Brutal melee strike. Primary focus spender.' },
  { id:'wildfire_bomb', spellId:259495, name:'Wildfire Bomb', type:'active', maxPts:1, row:2, col:3,
    parents:['kill_command'], desc:'Hurled bomb dealing Fire damage + DoT.' },
  // ROW 3
  { id:'tip_of_spear', spellId:260285, name:'Tip of the Spear', type:'passive', maxPts:1, row:3, col:5,
    parents:['raptor_strike'], desc:'Kill Command increases Raptor Strike damage by 25%.' },
  { id:'volatile_bomb', spellId:264332, name:'Volatile Bomb', type:'passive', maxPts:1, row:3, col:3,
    parents:['wildfire_bomb'], desc:'Resets WFB CD when target has its DoT.' },
  // ROW 4
  { id:'harpoon_passive', spellId:378934, name:'Harpoon', type:'passive', maxPts:1, row:4, col:2,
    parents:['volatile_bomb'], desc:'Reduces Harpoon cooldown.' },
  { id:'boomstick', spellId:1261193, name:'Boomstick', type:'active', maxPts:1, row:4, col:4,
    parents:['tip_of_spear','volatile_bomb'], desc:'Fire your blunderbuss. 7.7% ST / 19% AoE.' },
  { id:'coord_assault', spellId:1251717, name:'Coordinated Assault', type:'passive', maxPts:1, row:4, col:6,
    parents:['tip_of_spear'], desc:'Enhances Kill Command and Tip of the Spear synergy.' },
  // ROW 5
  { id:'bomb_choice', spellId:null, name:'Shrapnel Bomb / Flamebreak', type:'choice', maxPts:1, row:5, col:1,
    parents:['harpoon_passive'], desc:'Shrapnel: targets bleed. Flamebreak: knockback + burn.',
    choiceA: { name:'Shrapnel Bomb', spellId:270335, desc:'Targets bleed for additional damage.' },
    choiceB: { name:'Flamebreak', spellId:378937, desc:'Knockback + burn damage.' } },
  { id:'mongoose_fury', spellId:260248, name:'Mongoose Fury', type:'passive', maxPts:1, row:5, col:3,
    parents:['volatile_bomb','boomstick'], desc:'Raptor Strike gives +8% dmg/stack, max 5. KC resets.' },
  { id:'grenade_juggler', spellId:1272136, name:'Grenade Juggler', type:'passive', maxPts:1, row:5, col:4,
    parents:['boomstick'], desc:'Boomstick reduces Wildfire Bomb CD by 2s.' },
  { id:'pack_tactics', spellId:459964, name:'Pack Tactics', type:'passive', maxPts:1, row:5, col:5,
    parents:['boomstick','coord_assault'], desc:'Kill Command has a chance to immediately reset.' },
  { id:'sep_anxiety', spellId:1251718, name:'Separation Anxiety', type:'passive', maxPts:1, row:5, col:7,
    parents:['coord_assault'], desc:'Pet damage increased when far from player.' },
  // ROW 6
  { id:'mongoose_fury2', spellId:1252708, name:'Mongoose Fury II', type:'passive', maxPts:1, row:6, col:2,
    parents:['mongoose_fury'], desc:'Extends Mongoose Fury duration, increases max stacks.' },
  { id:'ammo_choice', spellId:null, name:'Mongoose Rounds / Wildfire Shells', type:'choice', maxPts:1, row:6, col:3,
    parents:['mongoose_fury','grenade_juggler'], desc:'MRounds: RS crits grant MF stack. WShells: WFB applies bleed.',
    choiceA: { name:'Mongoose Rounds', spellId:1252709, desc:'RS crits grant MF stack.' },
    choiceB: { name:'Wildfire Shells', spellId:1252710, desc:'WFB applies bleed.' } },
  { id:'spearhead_talent', spellId:1252931, name:'Spearhead Talent', type:'passive', maxPts:1, row:6, col:5,
    parents:['pack_tactics'], desc:'Kill Command has a chance to proc Spearhead.' },
  { id:'lethal_barbs', spellId:1253137, name:'Lethal Barbs', type:'passive', maxPts:1, row:6, col:6,
    parents:['pack_tactics','sep_anxiety'], desc:'Kill Command generates 10 additional Focus. Pack Leader only.' },
  // ROW 7
  { id:'bloody_claws', spellId:null, name:'Bloody Claws / Wallop', type:'choice', maxPts:1, row:7, col:1,
    parents:['mongoose_fury2'], desc:'Bloody Claws: Strike as One scales with MF stacks. Wallop: larger AoE.',
    choiceA: { name:'Bloody Claws', spellId:1253138, desc:'Strike as One scales with MF stacks.' },
    choiceB: { name:'Wallop', spellId:1253139, desc:'Larger AoE on cleave abilities.' } },
  { id:'explosive_expert', spellId:321290, name:'Explosive Expert', type:'passive', maxPts:2, row:7, col:2,
    parents:['mongoose_fury2','ammo_choice'], desc:'Increases Wildfire Bomb damage.' },
  { id:'beast_field', spellId:1262442, name:'Beast of the Field', type:'passive', maxPts:1, row:7, col:3,
    parents:['ammo_choice'], desc:'Pet damage scales with Mongoose Fury stacks.' },
  { id:'tip_stacks', spellId:378950, name:'Tip of Spear Stacks', type:'passive', maxPts:2, row:7, col:4,
    parents:['ammo_choice','spearhead_talent'], desc:'Increases max Tip of the Spear stacks to 3.' },
  { id:'vuln_choice', spellId:null, name:'Vulnerability / Blackrock Munitions', type:'choice', maxPts:1, row:7, col:5,
    parents:['spearhead_talent','lethal_barbs'], desc:'Vulnerability: WFB debuffs target. Blackrock: WFB AoE.',
    choiceA: { name:'Vulnerability', spellId:1253140, desc:'WFB debuffs target.' },
    choiceB: { name:'Blackrock Munitions', spellId:1253141, desc:'WFB AoE increased.' } },
  { id:'ruthless', spellId:1253053, name:'Ruthless Marauder', type:'passive', maxPts:2, row:7, col:6,
    parents:['lethal_barbs'], desc:'Kill Command can trigger Strike as One (pet leaps).' },
  { id:'potent_venom', spellId:459939, name:'Potent Venom', type:'passive', maxPts:1, row:7, col:7,
    parents:['lethal_barbs','sep_anxiety'], desc:'Increases poison damage dealt.' },
  // ROW 8
  { id:'explosive_force', spellId:378937, name:'Explosive Force', type:'passive', maxPts:2, row:8, col:2,
    parents:['explosive_expert','bloody_claws'], desc:'Further increases Wildfire Bomb direct damage.' },
  { id:'takedown', spellId:1250646, name:'Takedown', type:'active', maxPts:1, row:8, col:4,
    parents:['beast_field','tip_stacks','vuln_choice'], desc:'Leap + pet leap. Both deal damage. Generates 5 MF stacks. 5.9% combined ST.' },
  { id:'flanking_strike', spellId:378955, name:'Flanking Strike', type:'passive', maxPts:2, row:8, col:6,
    parents:['ruthless','vuln_choice'], desc:'Kill Command damage increased. Pet flanks on KC.' },
  // ROW 9
  { id:'flamefang', spellId:1251592, name:'Flamefang Pitch', type:'active', maxPts:1, row:9, col:2,
    parents:['explosive_force'], desc:'Throw a pitch bomb. AoE fire damage.' },
  { id:'spearhead', spellId:1272139, name:'Spearhead', type:'passive', maxPts:1, row:9, col:3,
    parents:['takedown'], desc:'Enables Spearhead cooldown ability.' },
  { id:'pack_mentality', spellId:1251790, name:'Pack Mentality', type:'passive', maxPts:2, row:9, col:5,
    parents:['takedown','flanking_strike'], desc:'Pet damage and Strike as One proc chance increased.' },
  { id:'wfb_infusion', spellId:460198, name:'Wildfire Infusion', type:'passive', maxPts:1, row:9, col:6,
    parents:['flanking_strike'], desc:'WFB applies additional DoT stack per target hit.' },
  // ROW 10
  { id:'frenzy_strikes', spellId:459843, name:'Frenzy Strikes', type:'passive', maxPts:1, row:10, col:1,
    parents:['flamefang'], desc:'Raptor Swipe has a chance to trigger an extra Raptor Strike.' },
  { id:'tip_capstone', spellId:1252943, name:'Tip Capstone', type:'passive', maxPts:1, row:10, col:3,
    parents:['spearhead'], desc:'Tip of the Spear also increases pet damage.' },
  { id:'invigoration', spellId:1256938, name:'Invigoration', type:'passive', maxPts:1, row:10, col:4,
    parents:['spearhead','pack_mentality'], desc:'Kill Command Focus cost reduced by 5.' },
  { id:'bomb_burst', spellId:1262409, name:'Bomb Burst', type:'passive', maxPts:1, row:10, col:5,
    parents:['pack_mentality'], desc:'WFB detonates for AoE damage when DoT expires.' },
  { id:'longevity', spellId:1272154, name:'Longevity', type:'passive', maxPts:1, row:10, col:7,
    parents:['wfb_infusion'], desc:'Kill Command cooldown reduced by 1s.' },
  // APEX
  { id:'raptor_swipe', spellId:null, name:'Raptor Swipe', type:'apex', maxPts:4, row:12, col:4,
    parents:['frenzy_strikes','tip_capstone','invigoration','bomb_burst','longevity'],
    desc:'APEX TALENT. ~50% of Raptor Strikes become Raptor Swipe (AoE cleave). ST: 14.7% | Cleave: 15.2%. Requires 30 pts.' },
];

// ── SENTINEL HERO TREE ───────────────────────────────────────

export const SENTINEL_NODES: TalentNodeDef[] = [
  { id:'lunar_storm', spellId:1253599, name:'Lunar Storm', type:'passive', maxPts:1, row:1, col:4,
    parents:[], desc:'KEYSTONE. Calls down Lunar Storms on your target. 8.0% ST damage.' },
  { id:'sanctified_arms', spellId:450373, name:'Sanctified Armaments', type:'passive', maxPts:1, row:2, col:1,
    parents:['lunar_storm'], desc:'Increases damage of all your attacks. 3.5% ST.' },
  { id:'lunar_inspiration', spellId:1253825, name:'Lunar Inspiration', type:'passive', maxPts:1, row:2, col:3,
    parents:['lunar_storm'], desc:'Enhances Moonlight Chakram behavior.' },
  { id:'moonlight_chakram', spellId:1253831, name:'Moonlight Chakram', type:'passive', maxPts:1, row:2, col:5,
    parents:['lunar_storm'], desc:'Hurls a chakram that deals Arcane damage. 9.1% ST.' },
  { id:'chakram_passback', spellId:1264902, name:'Chakram Passback', type:'passive', maxPts:1, row:2, col:7,
    parents:['lunar_storm'], desc:'Moonlight Chakram bounces back through the target a second time.' },
  { id:'stargazer_choice', spellId:null, name:'Stargazer / Open Fire', type:'choice', maxPts:1, row:3, col:1,
    parents:['sanctified_arms'], desc:'Stargazer: buff that amplifies Lunar Storm. Open Fire: ranged AoE.',
    choiceA: { name:'Stargazer', spellId:1253751, desc:'Buff that amplifies Lunar Storm.' },
    choiceB: { name:'Open Fire', spellId:1253807, desc:'Ranged AoE damage.' } },
  { id:'sentinel_mark', spellId:1253830, name:"Sentinel's Mark", type:'passive', maxPts:1, row:3, col:3,
    parents:['lunar_inspiration'], desc:"Marks your target for the Sentinel Owl. 31.54% uptime in sim." },
  { id:'stargazer_buff', spellId:450379, name:'Stargazer', type:'passive', maxPts:1, row:3, col:5,
    parents:['moonlight_chakram'], desc:'Provides near-permanent Stargazer buff (99.99% uptime). Amplifies Lunar Storm.' },
  { id:'twilight_choice', spellId:null, name:'Twilight Requiem / Stalk and Strike', type:'choice', maxPts:1, row:3, col:7,
    parents:['chakram_passback'], desc:'Twilight Requiem: Chakram silences. Stalk and Strike: bonus after Feign Death.',
    choiceA: { name:'Twilight Requiem', spellId:1264904, desc:'Chakram silences targets.' },
    choiceB: { name:'Stalk and Strike', spellId:1266069, desc:'Bonus damage after Feign Death.' } },
  { id:'ice_claw', spellId:1253846, name:'Ice Claw', type:'passive', maxPts:1, row:4, col:1,
    parents:['stargazer_choice'], desc:'Increases damage of your next attack after KC.' },
  { id:'sentinel_owl', spellId:1253852, name:'Sentinel Owl', type:'passive', maxPts:1, row:4, col:3,
    parents:['sentinel_mark'], desc:"Summons an owl that applies Sentinel's Mark and deals damage." },
  { id:'cond_choice', spellId:null, name:"Conditioning / Scout's Vigil", type:'choice', maxPts:1, row:4, col:5,
    parents:['stargazer_buff'], desc:"Conditioning: reduces damage taken. Scout's Vigil: resets Feign Death.",
    choiceA: { name:'Conditioning', spellId:450376, desc:'Reduces damage taken.' },
    choiceB: { name:"Scout's Vigil", spellId:450380, desc:'Resets Feign Death CD.' } },
  { id:'glaive_passive', spellId:1264903, name:'Glaive Passive', type:'passive', maxPts:1, row:4, col:7,
    parents:['twilight_choice'], desc:'Chakram deals increased damage to marked targets.' },
  { id:'moon_and_stars', spellId:1253732, name:'Moon and Stars', type:'passive', maxPts:1, row:5, col:4,
    parents:['ice_claw','sentinel_owl','cond_choice','glaive_passive'],
    desc:'CAPSTONE. Lunar Storm and Moonlight Chakram share cooldown resets. Massive damage amplifier.' },
];

// ── PACK LEADER HERO TREE ────────────────────────────────────

export const PACK_LEADER_NODES: TalentNodeDef[] = [
  { id:'vicious_hunt', spellId:471876, name:'Vicious Hunt', type:'passive', maxPts:1, row:1, col:4,
    parents:[], desc:'KEYSTONE. Kill Command can trigger Rend Flesh (bear), Bear Melee, Boar Charge, or Stampede.' },
  { id:'lone_wolf', spellId:472358, name:'Lone Wolf', type:'passive', maxPts:1, row:2, col:1,
    parents:['vicious_hunt'], desc:'Increases your damage when your pet is active.' },
  { id:'horn', spellId:472352, name:'Horn', type:'passive', maxPts:1, row:2, col:3,
    parents:['vicious_hunt'], desc:'Reduces Howl of the Pack Leader cooldown.' },
  { id:'pathfinding', spellId:472357, name:'Pathfinding', type:'passive', maxPts:1, row:2, col:5,
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
    parents:['pathfinding'], desc:'Boar Charge deals increased damage.' },
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

// ── HUNTER CLASS TREE ────────────────────────────────────────

export const HUNTER_NODES: TalentNodeDef[] = [
  // ROW 0 (3 nodes: cols 2,4,6)
  { id:'h_kill_shot', spellId:53351, name:'Kill Shot', type:'active', maxPts:1, row:0, col:2,
    parents:[], desc:'Fire a shot at a wounded target, dealing massive damage. Usable on targets below 20% HP.' },
  { id:'h_arcane_shot', spellId:185358, name:'Arcane Shot', type:'active', maxPts:1, row:0, col:4,
    parents:[], desc:'A quick shot that deals Arcane damage.' },
  { id:'h_steady_shot', spellId:56641, name:'Steady Shot', type:'active', maxPts:1, row:0, col:6,
    parents:[], desc:'A steady, focused shot that generates Focus.' },

  // ROW 1 (3 nodes: cols 2,4,6)
  { id:'h_disengage', spellId:781, name:'Disengage', type:'active', maxPts:1, row:1, col:2,
    parents:['h_kill_shot'], desc:'Leap backwards, clearing movement impairing effects.' },
  { id:'h_hunters_mark', spellId:257284, name:"Hunter's Mark", type:'active', maxPts:1, row:1, col:4,
    parents:['h_arcane_shot'], desc:'Mark a target, increasing all damage dealt to them by 5%.' },
  { id:'h_tar_trap', spellId:187698, name:'Tar Trap', type:'active', maxPts:1, row:1, col:6,
    parents:['h_steady_shot'], desc:'Place a trap that creates a tar pool, slowing enemies.' },

  // ROW 2 (4 nodes: cols 1,3,5,7)
  { id:'h_survival_tactics', spellId:378994, name:'Survival Tactics', type:'passive', maxPts:1, row:2, col:1,
    parents:['h_disengage'], desc:'Feign Death removes harmful effects and reduces damage taken briefly.' },
  { id:'h_explosive_shot', spellId:212431, name:'Explosive Shot', type:'active', maxPts:1, row:2, col:3,
    parents:['h_disengage','h_hunters_mark'], desc:'Fire an explosive shot that deals AoE Fire damage.' },
  { id:'h_scatter_shot', spellId:213691, name:'Scatter Shot', type:'active', maxPts:1, row:2, col:5,
    parents:['h_hunters_mark','h_tar_trap'], desc:'Disorient a target for 4 sec. Damage breaks the effect.' },
  { id:'h_counter_shot', spellId:147362, name:'Counter Shot', type:'active', maxPts:1, row:2, col:7,
    parents:['h_tar_trap'], desc:'Interrupt spellcasting, preventing any spell in that school for 3 sec.' },

  // ROW 3 (3 nodes: cols 2,4,6)
  { id:'h_posthaste', spellId:109215, name:'Posthaste', type:'passive', maxPts:1, row:3, col:2,
    parents:['h_survival_tactics','h_explosive_shot'], desc:'Disengage also frees you from movement effects and increases speed by 50%.' },
  { id:'h_trueshot_aura', spellId:264735, name:'Trueshot Aura', type:'passive', maxPts:1, row:3, col:4,
    parents:['h_explosive_shot','h_scatter_shot'], desc:'Increases critical strike chance for you and your pet.' },
  { id:'h_binding_shot', spellId:109248, name:'Binding Shot', type:'active', maxPts:1, row:3, col:6,
    parents:['h_scatter_shot','h_counter_shot'], desc:'Fire a magical shot that tethers enemies to the landing location.' },

  // ROW 4 (5 nodes: cols 1,3,4,5,7)
  { id:'h_born_to_be_wild', spellId:266921, name:'Born To Be Wild', type:'passive', maxPts:2, row:4, col:1,
    parents:['h_posthaste'], desc:'Reduces the cooldowns of Aspect abilities by 7% per point.' },
  { id:'h_alpha_predator', spellId:269737, name:'Alpha Predator', type:'passive', maxPts:1, row:4, col:3,
    parents:['h_posthaste','h_trueshot_aura'], desc:'Kill Command deals 15% increased damage.' },
  { id:'h_beast_master', spellId:267116, name:'Beast Master', type:'passive', maxPts:1, row:4, col:4,
    parents:['h_trueshot_aura'], desc:'Pet damage increased by 10%. Pet attacks have a chance to reset Kill Command.' },
  { id:'h_keen_eyesight', spellId:378004, name:'Keen Eyesight', type:'passive', maxPts:1, row:4, col:5,
    parents:['h_trueshot_aura','h_binding_shot'], desc:'Critical strike chance increased by 2%.' },
  { id:'h_improved_traps', spellId:343247, name:'Improved Traps', type:'passive', maxPts:2, row:4, col:7,
    parents:['h_binding_shot'], desc:'Trap cooldowns reduced by 5 sec per point.' },

  // ROW 5 GATE 1 — (7 nodes: cols 1,2,3,4,5,6,7) — choice at cols 1,4
  { id:'h_aspect_choice', spellId:null, name:'Aspect of the Eagle / Aspect of the Chameleon', type:'choice', maxPts:1, row:5, col:1,
    parents:['h_born_to_be_wild'], desc:'Eagle: increases melee range. Chameleon: random Aspect buffs.',
    choiceA: { name:'Aspect of the Eagle', spellId:186289, desc:'Increases melee range by 40% for 15 sec.' },
    choiceB: { name:'Aspect of the Chameleon', spellId:61648, desc:'Grants random Aspect buffs periodically.' } },
  { id:'h_natural_mending', spellId:270581, name:'Natural Mending', type:'passive', maxPts:1, row:5, col:2,
    parents:['h_born_to_be_wild','h_alpha_predator'], desc:'Focus spending reduces Exhilaration cooldown.' },
  { id:'h_pathfinding', spellId:378002, name:'Pathfinding', type:'passive', maxPts:1, row:5, col:3,
    parents:['h_alpha_predator'], desc:'Movement speed increased by 4%.' },
  { id:'h_stamina_choice', spellId:null, name:'Thick Hide / Wilderness Medicine', type:'choice', maxPts:1, row:5, col:4,
    parents:['h_beast_master'], desc:'Thick Hide: damage reduction. Wilderness Medicine: heal on Exhilaration.',
    choiceA: { name:'Thick Hide', spellId:378436, desc:'Damage taken reduced by 6%.' },
    choiceB: { name:'Wilderness Medicine', spellId:343242, desc:'Exhilaration heals for 20% more.' } },
  { id:'h_serrated_shots', spellId:389882, name:'Serrated Shots', type:'passive', maxPts:1, row:5, col:5,
    parents:['h_keen_eyesight'], desc:'Serpent Sting and bleed effects deal 10% increased damage.' },
  { id:'h_steel_trap', spellId:162488, name:'Steel Trap', type:'active', maxPts:1, row:5, col:6,
    parents:['h_keen_eyesight','h_improved_traps'], desc:'Place a Steel Trap that immobilizes and bleeds the first enemy.' },
  { id:'h_camouflage', spellId:199483, name:'Camouflage', type:'active', maxPts:1, row:5, col:7,
    parents:['h_improved_traps'], desc:'Become invisible for 1 min. Heals 2% HP every 1 sec while active.' },

  // ROW 6 (3 nodes: cols 2,4,6)
  { id:'h_misdirection', spellId:34477, name:'Misdirection', type:'active', maxPts:1, row:6, col:2,
    parents:['h_natural_mending','h_pathfinding'], desc:'Redirect threat to your pet or an ally for 8 sec.' },
  { id:'h_aspect_of_beast', spellId:191384, name:'Aspect of the Beast', type:'passive', maxPts:1, row:6, col:4,
    parents:['h_stamina_choice','h_serrated_shots'], desc:'Kill Command deals increased damage and has additional effects.' },
  { id:'h_tranq_shot', spellId:19801, name:'Tranquilizing Shot', type:'active', maxPts:1, row:6, col:6,
    parents:['h_serrated_shots','h_steel_trap'], desc:'Remove 1 Enrage and 1 Magic effect from an enemy.' },

  // ROW 7 (7 nodes: cols 1,2,3,4,5,6,7) — choice at col 7
  { id:'h_sentinel', spellId:389866, name:'Sentinel', type:'passive', maxPts:1, row:7, col:1,
    parents:['h_misdirection'], desc:'Your abilities apply Sentinel stacks. At 5 stacks, deal bonus damage.' },
  { id:'h_lone_survivor', spellId:388039, name:'Lone Survivor', type:'passive', maxPts:1, row:7, col:2,
    parents:['h_misdirection'], desc:'Disengage and Feign Death cooldowns reduced.' },
  { id:'h_improved_kc', spellId:378010, name:'Improved Kill Command', type:'passive', maxPts:1, row:7, col:3,
    parents:['h_misdirection','h_aspect_of_beast'], desc:'Kill Command damage increased by 5%.' },
  { id:'h_master_marksman', spellId:260309, name:'Master Marksman', type:'passive', maxPts:2, row:7, col:4,
    parents:['h_aspect_of_beast'], desc:'Critical hits with special shots deal 7% increased damage per point.' },
  { id:'h_rejuvenating_wind', spellId:385539, name:'Rejuvenating Wind', type:'passive', maxPts:1, row:7, col:5,
    parents:['h_aspect_of_beast','h_tranq_shot'], desc:'Max HP increased by 4%. Exhilaration heals 12% more.' },
  { id:'h_death_chakram', spellId:375891, name:'Death Chakram', type:'active', maxPts:1, row:7, col:6,
    parents:['h_tranq_shot'], desc:'Throw a chakram that bounces between targets, dealing damage and generating Focus.' },
  { id:'h_utility_choice', spellId:null, name:'Roar of Sacrifice / Fortitude of the Bear', type:'choice', maxPts:1, row:7, col:7,
    parents:['h_tranq_shot','h_camouflage'], desc:'Roar: pet absorbs 20% damage. Fortitude: party HP buff.',
    choiceA: { name:'Roar of Sacrifice', spellId:53480, desc:'Your pet absorbs 20% of damage dealt to a party member.' },
    choiceB: { name:'Fortitude of the Bear', spellId:388035, desc:'Increase max HP of party members by 5%.' } },

  // ROW 8 (6 nodes: cols 1,2,3,5,6,7) — choice at cols 2,6
  { id:'h_killer_instinct', spellId:273887, name:'Killer Instinct', type:'passive', maxPts:1, row:8, col:1,
    parents:['h_sentinel','h_lone_survivor'], desc:'Kill Command deals 50% increased damage against targets below 35% HP.' },
  { id:'h_row8_choice_l', spellId:null, name:'Barrage / Volley', type:'choice', maxPts:1, row:8, col:2,
    parents:['h_lone_survivor','h_improved_kc'], desc:'Barrage: rapid fire AoE. Volley: raining arrows AoE.',
    choiceA: { name:'Barrage', spellId:120360, desc:'Rapidly fire a barrage of shots at all enemies in front.' },
    choiceB: { name:'Volley', spellId:260243, desc:'Rain a volley of arrows on an area for sustained AoE damage.' } },
  { id:'h_hydras_bite', spellId:260241, name:"Hydra's Bite", type:'passive', maxPts:1, row:8, col:3,
    parents:['h_improved_kc','h_master_marksman'], desc:'Serpent Sting spreads to 2 additional nearby enemies.' },
  { id:'h_spitting_cobra', spellId:194407, name:'Spitting Cobra', type:'active', maxPts:1, row:8, col:5,
    parents:['h_master_marksman','h_rejuvenating_wind'], desc:'Summon a Spitting Cobra for 20 sec that attacks your target.' },
  { id:'h_row8_choice_r', spellId:null, name:'Bloodshed / A Murder of Crows', type:'choice', maxPts:1, row:8, col:6,
    parents:['h_rejuvenating_wind','h_death_chakram'], desc:'Bloodshed: pet bleeds target. Crows: bird swarm DoT.',
    choiceA: { name:'Bloodshed', spellId:321530, desc:'Your pet tears into the target, causing a heavy bleed.' },
    choiceB: { name:'A Murder of Crows', spellId:131894, desc:'Summon a flock of crows to attack the target for 15 sec.' } },
  { id:'h_wailing_arrow', spellId:392060, name:'Wailing Arrow', type:'active', maxPts:1, row:8, col:7,
    parents:['h_death_chakram','h_utility_choice'], desc:'Fire a devastating arrow that silences enemies in an area.' },

  // ROW 9 (3 nodes: cols 2,4,6)
  { id:'h_killer_accuracy', spellId:378765, name:'Killer Accuracy', type:'passive', maxPts:1, row:9, col:2,
    parents:['h_killer_instinct','h_row8_choice_l','h_hydras_bite'], desc:'Kill Shot critical strike chance increased by 20%.' },
  { id:'h_omega_training', spellId:390220, name:'Omega Training', type:'passive', maxPts:1, row:9, col:4,
    parents:['h_hydras_bite','h_spitting_cobra','h_row8_choice_r'], desc:'Pet damage increased by 10%. Focus generation improved.' },
  { id:'h_legacy_of_hunt', spellId:392060, name:'Legacy of the Windrunners', type:'passive', maxPts:1, row:9, col:6,
    parents:['h_row8_choice_r','h_wailing_arrow'], desc:'Wailing Arrow and Death Chakram deal 15% increased damage.' },
];



export const WOWHEAD_ICON_FALLBACKS: Record<number, string> = {
  // Survival spec
  259489: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_killcommand.jpg",
  186270: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_raptorstrike.jpg",
  259495: "https://wow.zamimg.com/images/wow/icons/large/inv_wildfirebomb.jpg",
  260285: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_tipofthespear.jpg",
  264332: "https://wow.zamimg.com/images/wow/icons/large/inv_wildfirebomb.jpg",
  378934: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_harpoon.jpg",
  1261193: "https://wow.zamimg.com/images/wow/icons/large/inv_firearm_2h_rifle_d_02_green.jpg",
  1251717: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_coordinatedassault.jpg",
  260248: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_mongoosebite.jpg",
  1272136: "https://wow.zamimg.com/images/wow/icons/large/inv_misc_bomb_02.jpg",
  459964: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_separationanxiety.jpg",
  1251718: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_separationanxiety.jpg",
  1252708: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_mongoosebite.jpg",
  1252931: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_raptorstrike.jpg",
  1253137: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_raptorstrike.jpg",
  321290: "https://wow.zamimg.com/images/wow/icons/large/inv_wildfirebomb.jpg",
  1262442: "https://wow.zamimg.com/images/wow/icons/large/ability_druid_ferociousbite.jpg",
  378950: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_tipofthespear.jpg",
  1253053: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_raptorstrike.jpg",
  459939: "https://wow.zamimg.com/images/wow/icons/large/ability_creature_poison_06.jpg",
  1250646: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_coordinatedassault.jpg",
  378955: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_flankingtrike.jpg",
  1251592: "https://wow.zamimg.com/images/wow/icons/large/spell_fire_flamebolt.jpg",
  1272139: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_raptorstrike.jpg",
  1251790: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_separationanxiety.jpg",
  460198: "https://wow.zamimg.com/images/wow/icons/large/inv_wildfirebomb.jpg",
  459843: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_raptorstrike.jpg",
  1252943: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_tipofthespear.jpg",
  1256938: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_killcommand.jpg",
  1262409: "https://wow.zamimg.com/images/wow/icons/large/inv_wildfirebomb.jpg",
  1272154: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_killcommand.jpg",
  // Choice node sub-spells
  270335: "https://wow.zamimg.com/images/wow/icons/large/inv_wildfirebomb.jpg",
  1253138: "https://wow.zamimg.com/images/wow/icons/large/ability_druid_rake.jpg",
  1253139: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_raptorstrike.jpg",
  1252709: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_mongoosebite.jpg",
  1252710: "https://wow.zamimg.com/images/wow/icons/large/inv_wildfirebomb.jpg",
  1253140: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_raptorstrike.jpg",
  1253141: "https://wow.zamimg.com/images/wow/icons/large/inv_wildfirebomb.jpg",
  // Sentinel
  1253599: "https://wow.zamimg.com/images/wow/icons/large/ability_racial_dvinewardenofthelightofthestar.jpg",
  450373: "https://wow.zamimg.com/images/wow/icons/large/inv_polearm_2h_felfireraid_d_01.jpg",
  1253825: "https://wow.zamimg.com/images/wow/icons/large/spell_arcane_starfire.jpg",
  1253831: "https://wow.zamimg.com/images/wow/icons/large/ability_upgrademoonglaive.jpg",
  1264902: "https://wow.zamimg.com/images/wow/icons/large/ability_upgrademoonglaive.jpg",
  1253751: "https://wow.zamimg.com/images/wow/icons/large/spell_frost_stun.jpg",
  1253807: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_resistanceisfutile.jpg",
  1253830: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_markedfordeath.jpg",
  450379: "https://wow.zamimg.com/images/wow/icons/large/spell_frost_stun.jpg",
  1264904: "https://wow.zamimg.com/images/wow/icons/large/spell_shadow_requiem.jpg",
  1266069: "https://wow.zamimg.com/images/wow/icons/large/ability_rogue_stalkandstrike.jpg",
  1253846: "https://wow.zamimg.com/images/wow/icons/large/spell_frost_arcticwinds.jpg",
  1253852: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_eagleeye.jpg",
  450376: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_aspectoftheviper.jpg",
  450380: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_mastermarksman.jpg",
  1264903: "https://wow.zamimg.com/images/wow/icons/large/inv_glaive_1h_npc_d_01.jpg",
  1253732: "https://wow.zamimg.com/images/wow/icons/large/ability_druid_lunarguidance.jpg",
  // Pack Leader
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
};

// ── SIM SYNC KEYS ────────────────────────────────────────────
// Maps node IDs to the simulation engine's talent flags
export const SIM_TALENT_MAP: Record<string, string> = {
  'lethal_barbs': 'lethal_barbs',
  'grenade_juggler': 'grenade_juggler',
  'mongoose_fury': 'mongoose_fury',
  'takedown': 'takedown',
  'lunar_storm': 'hero_sentinel',
  'vicious_hunt': 'hero_pack_leader',
};
