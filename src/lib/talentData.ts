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

// ── WOWHEAD ICON FALLBACKS ───────────────────────────────────

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
