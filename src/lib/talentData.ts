// ============================================================
// INTERACTIVE TALENT TREE — DATA MODEL
// All node definitions, unlock rules, and types
// Cross-referenced with Blizzard API Midnight 12.0.1 (static-12.0.1_65617-us)
// Tree ID 774, Spec ID 255 (Survival Hunter)
// ============================================================

export interface TalentNodeDef {
  id: string;
  /** Blizzard API talent-tree node ID (e.g. 102381). Required for export string generation. */
  apiNodeId?: number;
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

// ── ROW GATE THRESHOLDS (from API restriction_lines) ─────────
// Class: gate at restricted_row 5.5 (8 pts) and 8.5 (23 pts)
// Spec:  gate at restricted_row 5.5 (8 pts) and 8.5 (20 pts)

export const CLASS_ROW_GATES: Record<number, number> = {
  0: 0, 1: 0, 2: 0, 3: 0, 4: 8, 5: 8, 6: 8, 7: 23, 8: 23, 9: 23,
};

export const SPEC_ROW_GATES: Record<number, number> = {
  1: 0, 2: 0, 3: 0, 4: 0, 5: 8, 6: 8, 7: 8, 8: 20, 9: 20, 10: 20, 11: 20,
};

export const HERO_UNLOCK_THRESHOLD = 7;

export const SPEC_MAX_PTS = 34;
export const CLASS_MAX_PTS = 34;
export const HERO_MAX_PTS = 13;

// ── HUNTER CLASS TREE (Survival-specific, Midnight 12.0.1) ───
// Mapped from API class_talent_nodes display_row/col
// API row 2 → our row 0, API col used directly (1-7)

export const HUNTER_NODES: TalentNodeDef[] = [
  // ROW 0 (API row 2) — 3 start nodes
  { id:'h_rejuvenating_wind', apiNodeId:102381, spellId:385539, name:'Rejuvenating Wind', type:'passive', maxPts:1, row:0, col:2,
    parents:[], desc:'Exhilaration now also heals you for an additional 12.0% of your maximum health over 8 sec.' },
  { id:'h_sotf', apiNodeId:102422, spellId:264735, name:'Survival of the Fittest', type:'active', maxPts:1, row:0, col:4,
    parents:[], desc:'Reduces all damage you and your pet take by 30% for 6 sec.' },
  { id:'h_posthaste', apiNodeId:102411, spellId:109215, name:'Posthaste', type:'passive', maxPts:1, row:0, col:6,
    parents:[], desc:'Disengage also frees you from all movement impairing effects and increases your movement speed by 50% for 4 sec.' },

  // ROW 1 (API row 3)
  { id:'h_natural_mending', apiNodeId:102401, spellId:270581, name:'Natural Mending', type:'passive', maxPts:2, row:1, col:2,
    parents:['h_rejuvenating_wind'], desc:"Exhilaration's cooldown is reduced by 30 sec." },
  { id:'h_padded_armor', apiNodeId:102406, spellId:459450, name:'Padded Armor', type:'passive', maxPts:1, row:1, col:4,
    parents:['h_sotf'], desc:'Survival of the Fittest gains an additional charge.' },
  { id:'h_hunters_avoidance', apiNodeId:102423, spellId:384799, name:"Hunter's Avoidance", type:'passive', maxPts:1, row:1, col:6,
    parents:['h_posthaste'], desc:'Damage taken from area of effect attacks reduced by 5%.' },

  // ROW 2 (API row 4)
  { id:'h_wilderness_medicine', apiNodeId:102383, spellId:343242, name:'Wilderness Medicine', type:'passive', maxPts:1, row:2, col:1,
    parents:['h_natural_mending'], desc:'Mend Pet heals for an additional 25% of your pet\'s health over its duration, and has a 25% chance to dispel a magic effect each time it heals your pet.' },
  { id:'h_combat_experience', apiNodeId:110157, spellId:1268871, name:'Combat Experience', type:'passive', maxPts:1, row:2, col:3,
    parents:['h_natural_mending','h_padded_armor'], desc:'Your Agility is increased by 3%.' },
  { id:'h_improved_cheetah', apiNodeId:109485, spellId:1258407, name:'Improved Aspect of the Cheetah', type:'passive', maxPts:1, row:2, col:5,
    parents:['h_padded_armor','h_hunters_avoidance'], desc:'The cooldown of Aspect of the Cheetah is reduced by 30 sec.' },
  { id:'h_concussive_shot', apiNodeId:102407, spellId:5116, name:'Concussive Shot', type:'active', maxPts:1, row:2, col:7,
    parents:['h_hunters_avoidance'], desc:'Dazes the target, slowing movement speed by 50% for 6 sec.' },

  // ROW 3 (API row 5)
  { id:'h_precision_strikes', apiNodeId:102380, spellId:1267003, name:'Precision Strikes', type:'passive', maxPts:1, row:3, col:2,
    parents:['h_wilderness_medicine','h_combat_experience'], desc:'Your auto shot damage is increased by 25%.' },
  { id:'h_muzzle', apiNodeId:79837, spellId:187707, name:'Muzzle', type:'active', maxPts:1, row:3, col:4,
    parents:['h_combat_experience','h_improved_cheetah'], desc:'Interrupts spellcasting, preventing any spell in that school from being cast for 5 sec.' },
  { id:'h_serrated_tips', apiNodeId:102384, spellId:459502, name:'Serrated Tips', type:'passive', maxPts:2, row:3, col:6,
    parents:['h_improved_cheetah','h_concussive_shot'], desc:'You gain 2% more critical strike from critical strike sources.' },

  // ROW 4 (API row 6) — GATE: 8 pts
  { id:'h_tranq_shot', apiNodeId:109489, spellId:19801, name:'Tranquilizing Shot', type:'active', maxPts:1, row:4, col:1,
    parents:['h_precision_strikes'], desc:'Removes 1 Enrage and 1 Magic effect from an enemy target.' },
  { id:'h_pathfinding', apiNodeId:102404, spellId:378002, name:'Pathfinding', type:'passive', maxPts:1, row:4, col:3,
    parents:['h_precision_strikes','h_muzzle'], desc:'Movement speed increased by 4%.' },
  { id:'h_disruptive_rounds', apiNodeId:102395, spellId:343244, name:'Disruptive Rounds', type:'passive', maxPts:1, row:4, col:4,
    parents:['h_muzzle'], desc:'When Counter Shot interrupts a cast, gain 30 Focus.' },
  { id:'h_improved_feign', apiNodeId:109484, spellId:1258486, name:'Improved Feign Death', type:'passive', maxPts:2, row:4, col:5,
    parents:['h_muzzle','h_serrated_tips'], desc:'The cooldown of Feign Death is reduced by 5 sec.' },
  { id:'h_misdirection', apiNodeId:102419, spellId:34477, name:'Misdirection', type:'active', maxPts:1, row:4, col:7,
    parents:['h_serrated_tips'], desc:'Misdirects all threat you cause to the targeted party or raid member, beginning with your next attack within 30 sec and lasting for 8 sec.' },

  // ROW 5 (API row 7)
  { id:'h_tranq_choice', apiNodeId:102415, spellId:null, name:'Kodo Tranquilizer / Devilsaur Tranquilizer', type:'choice', maxPts:1, row:5, col:1,
    parents:['h_tranq_shot'], desc:'Kodo: Tranq removes additional Magic effects. Devilsaur: Tranq CD reduced on Enrage-only dispel.',
    choiceA: { name:'Kodo Tranquilizer', spellId:459983, desc:'Tranquilizing Shot removes 1 additional Magic effect from up to 2 nearby targets.' },
    choiceB: { name:'Devilsaur Tranquilizer', spellId:459991, desc:'If Tranquilizing Shot removes only an Enrage effect, its cooldown is reduced by 5 sec.' } },
  { id:'h_kindling_flare', apiNodeId:102425, spellId:459506, name:'Kindling Flare', type:'passive', maxPts:1, row:5, col:2,
    parents:['h_tranq_shot','h_pathfinding'], desc:"Flare's radius is increased by 50%." },
  { id:'h_trigger_finger', apiNodeId:102396, spellId:459534, name:'Trigger Finger', type:'passive', maxPts:2, row:5, col:3,
    parents:['h_pathfinding','h_disruptive_rounds'], desc:'Haste increased by 1%.' },
  { id:'h_trap_choice', apiNodeId:102393, spellId:null, name:'Tar Trap / Scare Beast', type:'choice', maxPts:1, row:5, col:4,
    parents:['h_disruptive_rounds','h_improved_feign'], desc:'Tar Trap: AoE slow pool. Scare Beast: fears a beast target.',
    choiceA: { name:'Tar Trap', spellId:187698, desc:'Place a trap that creates a tar pool, slowing enemies by 50%.' },
    choiceB: { name:'Scare Beast', spellId:1513, desc:'Fear a Beast target for 20 sec. Damage breaks effect.' } },
  { id:'h_touch_of_grass', apiNodeId:109487, spellId:1258402, name:'Touch of Grass', type:'passive', maxPts:2, row:5, col:5,
    parents:['h_disruptive_rounds','h_improved_feign'], desc:'Your maximum health is increased by 5%.' },
  { id:'h_camouflage', apiNodeId:110156, spellId:199483, name:'Camouflage', type:'active', maxPts:1, row:5, col:6,
    parents:['h_misdirection','h_improved_feign'], desc:'You and your pet blend into the surroundings and gain stealth for 1 min. While camouflaged, you will heal for 2% of maximum health every 1 sec.' },
  { id:'h_no_hard_feelings', apiNodeId:102412, spellId:459546, name:'No Hard Feelings', type:'passive', maxPts:1, row:5, col:7,
    parents:['h_misdirection'], desc:'When Misdirection targets your pet, it reduces the damage they take by 50% for 5 sec. The cooldown of Misdirection is reduced by 5 sec.' },

  // ROW 6 (API row 8)
  { id:'h_improved_turtle', apiNodeId:102424, spellId:1258485, name:'Improved Aspect of the Turtle', type:'passive', maxPts:1, row:6, col:2,
    parents:['h_tranq_choice','h_kindling_flare','h_trigger_finger'], desc:'The cooldown of Aspect of the Turtle is reduced by 30 sec.' },
  { id:'h_specialized_arsenal', apiNodeId:102390, spellId:459542, name:'Specialized Arsenal', type:'passive', maxPts:1, row:6, col:4,
    parents:['h_trigger_finger','h_trap_choice','h_touch_of_grass'], desc:'Kill Command deals 10% increased damage.' },
  { id:'h_scouts_instincts', apiNodeId:109483, spellId:459455, name:"Scout's Instincts", type:'passive', maxPts:1, row:6, col:6,
    parents:['h_touch_of_grass','h_camouflage','h_no_hard_feelings'], desc:'You cannot be slowed below 80% of your normal movement speed while Aspect of the Cheetah is active.' },

  // ROW 7 (API row 9) — GATE: 23 pts
  { id:'h_shell_wall', apiNodeId:110154, spellId:1267218, name:'Shell Wall', type:'passive', maxPts:1, row:7, col:1,
    parents:['h_improved_turtle'], desc:'Damage taken during Aspect of the Turtle is reduced by an additional 20%.' },
  { id:'h_intimidation', apiNodeId:103989, spellId:19577, name:'Intimidation', type:'active', maxPts:1, row:7, col:2,
    parents:['h_improved_turtle'], desc:'Commands your pet to intimidate the target, stunning for 5 sec.' },
  { id:'h_improved_snaring', apiNodeId:102414, spellId:1268868, name:'Improved Snaring', type:'passive', maxPts:1, row:7, col:3,
    parents:['h_improved_turtle','h_specialized_arsenal'], desc:'Wing Clip slows an additional 25%. Concussive Shot slows an additional 10%.' },
  { id:'h_lone_survivor', apiNodeId:102391, spellId:388039, name:'Lone Survivor', type:'passive', maxPts:1, row:7, col:4,
    parents:['h_specialized_arsenal'], desc:'The duration of Survival of the Fittest is increased by 2.0 sec.' },
  { id:'h_catlike_reflexes', apiNodeId:109486, spellId:1258404, name:'Catlike Reflexes', type:'passive', maxPts:1, row:7, col:5,
    parents:['h_specialized_arsenal','h_scouts_instincts'], desc:"Aspect of the Cheetah's initial burst of speed is increased by 2.0 sec." },
  { id:'h_binding_shot', apiNodeId:109488, spellId:109248, name:'Binding Shot', type:'active', maxPts:1, row:7, col:6,
    parents:['h_scouts_instincts'], desc:'Fires a magical projectile, tethering enemies within 5 yds for 10 sec, stunning them for 3 sec if they move more than 5 yds from the arrow.' },
  { id:'h_trailblazer_choice', apiNodeId:110155, spellId:null, name:'Trailblazer / Moment of Opportunity', type:'choice', maxPts:1, row:7, col:7,
    parents:['h_scouts_instincts'], desc:'Trailblazer: speed while not attacking. Moment: speed on trap trigger.',
    choiceA: { name:'Trailblazer', spellId:199921, desc:'Movement speed increased by 30% after not attacking for 3 sec.' },
    choiceB: { name:'Moment of Opportunity', spellId:459488, desc:'When a trap triggers, gain 30% increased movement speed for 3 sec.' } },

  // ROW 8 (API row 10)
  { id:'h_cold_feet', apiNodeId:110153, spellId:1268671, name:'Cold Feet', type:'passive', maxPts:1, row:8, col:1,
    parents:['h_shell_wall'], desc:"When your Freezing Trap breaks, the victim's movement speed is reduced by 70% for 4 sec." },
  { id:'h_territorial_choice', apiNodeId:102394, spellId:null, name:'Territorial Instincts / Guttural Roar', type:'choice', maxPts:1, row:8, col:2,
    parents:['h_intimidation'], desc:'Territorial: Intimidation CD reduced. Guttural: Intimidation also stuns nearby.',
    choiceA: { name:'Territorial Instincts', spellId:459507, desc:'The cooldown of Intimidation is reduced by 20 sec.' },
    choiceB: { name:'Guttural Roar', spellId:1258509, desc:'Intimidation now also stuns nearby enemies for 1.0 sec.' } },
  { id:'h_born_to_be_wild', apiNodeId:102416, spellId:266921, name:'Born To Be Wild', type:'passive', maxPts:2, row:8, col:3,
    parents:['h_intimidation','h_improved_snaring','h_lone_survivor'], desc:'The cooldown of Aspect of the Cheetah, and Aspect of the Turtle are reduced by 15 sec.' },
  { id:'h_keen_eyesight', apiNodeId:102409, spellId:378004, name:'Keen Eyesight', type:'passive', maxPts:2, row:8, col:5,
    parents:['h_lone_survivor','h_catlike_reflexes','h_binding_shot'], desc:'Critical strike chance increased by 2%.' },
  { id:'h_tether_choice', apiNodeId:110152, spellId:null, name:'Tar-Coated Bindings / Horsehair Tether', type:'choice', maxPts:1, row:8, col:6,
    parents:['h_binding_shot'], desc:'Tar-Coated: Binding Shot stun +1 sec. Horsehair: stunned enemies dragged to center.',
    choiceA: { name:'Tar-Coated Bindings', spellId:459460, desc:"Binding Shot's stun duration is increased by 1 sec." },
    choiceB: { name:'Horsehair Tether', spellId:472729, desc:'When an enemy is stunned by Binding Shot, it is dragged to Binding Shot\'s center.' } },
  { id:'h_improved_traps', apiNodeId:102418, spellId:343247, name:'Improved Traps', type:'passive', maxPts:1, row:8, col:7,
    parents:['h_binding_shot','h_trailblazer_choice'], desc:'The cooldown of Tar Trap and Freezing Trap is reduced by 5.0 sec.' },

  // ROW 9 (API row 11)
  { id:'h_emergency_salve', apiNodeId:102389, spellId:459517, name:'Emergency Salve', type:'passive', maxPts:1, row:9, col:2,
    parents:['h_cold_feet','h_born_to_be_wild'], desc:'Feign Death and Aspect of the Turtle removes poison and disease effects from you.' },
  { id:'h_guardian_choice', apiNodeId:110164, spellId:null, name:'Roar of Sacrifice / Guardian\'s Hide', type:'choice', maxPts:1, row:9, col:4,
    parents:['h_born_to_be_wild','h_keen_eyesight'], desc:'Roar: pet absorbs 15% damage. Guardian: 3% passive DR.',
    choiceA: { name:'Roar of Sacrifice', spellId:53480, desc:'Instructs your pet to protect a friendly target, reducing their damage taken by 15%, but 50% of damage is transferred to your pet.' },
    choiceB: { name:"Guardian's Hide", spellId:1272094, desc:'Your pet protects you at all times, reducing the damage you take by 3%. Your pet receives 100% of the damage it mitigates.' } },
  { id:'h_unnatural_causes', apiNodeId:102387, spellId:459527, name:'Unnatural Causes', type:'passive', maxPts:1, row:9, col:6,
    parents:['h_keen_eyesight','h_improved_traps'], desc:'Your damage over time effects deal 10% increased damage. This effect is increased by 50% on targets below 20% health.' },
];


// ── SURVIVAL SPEC TREE (Midnight 12.0.1) ─────────────────────
// API spec_talent_nodes: display_col 15-21 → normalized col 1-7 (subtract 14)
// API display_row 2 → our row 1

export const SURVIVAL_NODES: TalentNodeDef[] = [
  // ROW 1 (API row 2, col 18→4)
  { id:'kill_command', spellId:259489, name:'Kill Command', type:'active', maxPts:1, row:1, col:4,
    parents:[], desc:'Give the command to kill, causing your pet to savagely deal Physical damage to the enemy. Generates 15 Focus.' },
  // ROW 2 (API row 3)
  { id:'wildfire_bomb', spellId:259495, name:'Wildfire Bomb', type:'active', maxPts:1, row:2, col:3,
    parents:['kill_command'], desc:'Hurl a bomb at the target, exploding for Fire damage in a cone and coating enemies in wildfire. Deals 60% increased damage to primary target.' },
  { id:'raptor_strike', spellId:186270, name:'Raptor Strike', type:'active', maxPts:1, row:2, col:5,
    parents:['kill_command'], desc:'A vicious slash dealing Physical damage.' },
  // ROW 3 (API row 4)
  { id:'guerrilla_tactics', spellId:264332, name:'Guerrilla Tactics', type:'passive', maxPts:1, row:3, col:3,
    parents:['wildfire_bomb'], desc:'Wildfire Bomb now has 2 charges, and the initial explosion deals 15% increased damage.' },
  { id:'tip_of_spear', spellId:260285, name:'Tip of the Spear', type:'passive', maxPts:1, row:3, col:5,
    parents:['raptor_strike'], desc:'Kill Command increases the direct damage of your other abilities by 15%, stacking up to 3 times.' },
  // ROW 4 (API row 5)
  { id:'lunge', spellId:378934, name:'Lunge', type:'passive', maxPts:1, row:4, col:2,
    parents:['guerrilla_tactics'], desc:'The damage of your auto-attacks is increased by 25%. The cooldown of Wildfire Bomb is reduced by 1.0 sec.' },
  { id:'boomstick', spellId:1261193, name:'Boomstick', type:'active', maxPts:1, row:4, col:4,
    parents:['tip_of_spear','guerrilla_tactics'], desc:'Unload a series of 4 shotgun blasts 20 yds in front of you, dealing Physical damage over 2.7 sec. Deals reduced damage beyond 8 targets.' },
  { id:'strike_as_one', spellId:1251717, name:'Strike as One', type:'passive', maxPts:1, row:4, col:6,
    parents:['tip_of_spear'], desc:'Consuming Tip of the Spear provokes your pet to attack your target. All damage dealt by your pet is increased by 30%.' },
  // ROW 5 (API row 6) — GATE: 8 spec pts
  { id:'bomb_choice', spellId:null, name:'Shrapnel Bomb / Flamebreak', type:'choice', maxPts:1, row:5, col:1,
    parents:['lunge'], desc:'Shrapnel: WFB periodic becomes Bleed. Flamebreak: Fire damage +8%.',
    choiceA: { name:'Shrapnel Bomb', spellId:1253172, desc:"Wildfire Bomb's periodic effect is now a Bleed." },
    choiceB: { name:'Flamebreak', spellId:1253176, desc:'All Fire damage dealt is increased by 8%.' } },
  { id:'bloodseeker', spellId:260248, name:'Bloodseeker', type:'passive', maxPts:1, row:5, col:3,
    parents:['boomstick','lunge'], desc:'You and your pet gain 10% attack speed for every bleeding enemy within 12 yds.' },
  { id:'quick_reload', spellId:1272136, name:'Quick Reload', type:'passive', maxPts:1, row:5, col:4,
    parents:['boomstick'], desc:"Boomstick's cooldown is reduced by 15 sec." },
  { id:'flankers_advantage', spellId:459964, name:"Flanker's Advantage", type:'passive', maxPts:1, row:5, col:5,
    parents:['boomstick','strike_as_one'], desc:'Kill Command grants an additional 5 Focus and its critical strike chance is increased by 10%.' },
  { id:'two_against_many', spellId:1251718, name:'Two Against Many', type:'passive', maxPts:1, row:5, col:7,
    parents:['strike_as_one'], desc:'Strike as One damages 2 additional enemies and its damage is increased by 10% for each enemy it strikes beyond the first.' },
  // ROW 6 (API row 7)
  { id:'mongoose_fury', spellId:1252708, name:'Mongoose Fury', type:'passive', maxPts:1, row:6, col:2,
    parents:['bloodseeker','bomb_choice'], desc:'Raptor Strike increases the damage of Raptor Strike by 10% for 8 sec. Multiple applications may overlap.' },
  { id:'ammo_choice', spellId:null, name:'Mongoose Rounds / Wildfire Shells', type:'choice', maxPts:1, row:6, col:3,
    parents:['quick_reload'], desc:'Mongoose Rounds: Boomstick grants MF stack. Wildfire Shells: Boomstick reduces WFB CD.',
    choiceA: { name:'Mongoose Rounds', spellId:1253945, desc:'Damaging one or more enemies with your Boomstick grants you 1 stack of Mongoose Fury.' },
    choiceB: { name:'Wildfire Shells', spellId:1261229, desc:'Damaging one or more enemies with your Boomstick reduces the cooldown of Wildfire Bomb by 2.0 sec.' } },
  { id:'shellshock', spellId:1252931, name:'Shellshock', type:'passive', maxPts:1, row:6, col:5,
    parents:['quick_reload'], desc:"Your Boomstick's damage is increased by 40% when striking a single target. Each additional target reduces this bonus by 5%." },
  { id:'sic_em', spellId:1253137, name:"Sic 'Em", type:'passive', maxPts:1, row:6, col:6,
    parents:['flankers_advantage','two_against_many'], desc:'When Kill Command critically strikes, it bleeds its target for additional damage over 5 sec.' },
  // ROW 7 (API row 8)
  { id:'bloody_claws', spellId:null, name:'Bloody Claws / Wallop', type:'choice', maxPts:1, row:7, col:1,
    parents:['mongoose_fury'], desc:'Bloody Claws: MF stacks increase Strike as One. Wallop: MF chance for big RS.',
    choiceA: { name:'Bloody Claws', spellId:385737, desc:'Each stack of Mongoose Fury also increases the damage of Strike as One by 10%.' },
    choiceB: { name:'Wallop', spellId:1252738, desc:'Gaining a stack of Mongoose Fury has a 20% chance to increase the damage of your next Raptor Strike by 50%.' } },
  { id:'improved_wfb', spellId:321290, name:'Improved Wildfire Bomb', type:'passive', maxPts:2, row:7, col:2,
    parents:['mongoose_fury'], desc:'Wildfire Bomb deals 6% additional damage.' },
  { id:'bonding', spellId:1262442, name:'Bonding', type:'passive', maxPts:1, row:7, col:3,
    parents:['mongoose_fury','ammo_choice'], desc:'Mastery increased by 3%. You gain 5% increased Mastery from all Mastery sources.' },
  { id:'sweeping_spear', spellId:378950, name:'Sweeping Spear', type:'passive', maxPts:2, row:7, col:4,
    parents:['ammo_choice','shellshock'], desc:'Raptor Strike damage increased by 10%.' },
  { id:'vuln_choice', spellId:null, name:'Vulnerability / Blackrock Munitions', type:'choice', maxPts:1, row:7, col:5,
    parents:['shellshock','sic_em'], desc:'Vulnerability: RS/Boomstick crit +20%. Blackrock: WFB/FFP crit +20%.',
    choiceA: { name:'Vulnerability', spellId:1257011, desc:'Raptor Strike and Boomstick deal 20% increased critical strike damage.' },
    choiceB: { name:'Blackrock Munitions', spellId:462036, desc:'Wildfire Bomb and Flamefang Pitch deal 20% increased critical strike damage.' } },
  { id:'shower_of_blood', spellId:1253053, name:'Shower of Blood', type:'passive', maxPts:2, row:7, col:6,
    parents:['sic_em'], desc:'Your Bleed effects deal 8% increased damage.' },
  { id:'outland_venom', spellId:459939, name:'Outland Venom', type:'passive', maxPts:1, row:7, col:7,
    parents:['sic_em'], desc:'Each damage over time effect on a target increases the critical strike damage they receive from you by 4%.' },
  // ROW 8 (API row 9) — GATE: 20 spec pts
  { id:'explosives_expert', spellId:378937, name:'Explosives Expert', type:'passive', maxPts:2, row:8, col:2,
    parents:['improved_wfb','bloody_claws'], desc:'Wildfire Bomb damage increased and cooldown reduced.' },
  { id:'takedown', spellId:1250646, name:'Takedown', type:'active', maxPts:1, row:8, col:4,
    parents:['bonding','sweeping_spear','vuln_choice'], desc:'Leap to your target with your pet. Increases all damage for 8 sec. Primary cooldown.' },
  { id:'killer_companion', spellId:378955, name:'Killer Companion', type:'passive', maxPts:2, row:8, col:6,
    parents:['shower_of_blood','vuln_choice'], desc:'Kill Command damage increased. Pet flanks on Kill Command.' },
  // ROW 9 (API row 10)
  { id:'flamefang', spellId:1251592, name:'Flamefang Pitch', type:'active', maxPts:1, row:9, col:2,
    parents:['explosives_expert'], desc:'Toss a fiery concoction that explodes violently upon reaching its destination, dealing Fire damage to enemies in its area. Ignites nearby terrain for additional Fire damage over 8 sec.' },
  { id:'twin_fangs', spellId:1272139, name:'Twin Fangs', type:'passive', maxPts:1, row:9, col:3,
    parents:['takedown'], desc:'Takedown grants 3 stacks of Tip of the Spear.' },
  { id:'savagery', spellId:1251790, name:'Savagery', type:'passive', maxPts:2, row:9, col:5,
    parents:['takedown'], desc:'Takedown cooldown reduced by 15 sec.' },
  { id:'wfb_infusion', spellId:460198, name:'Wildfire Infusion', type:'passive', maxPts:1, row:9, col:6,
    parents:['killer_companion'], desc:'Kill Command damage increased by 15%. Kill Command reduces the cooldown of Wildfire Bomb by 1.0 sec.' },
  // ROW 10 (API row 11)
  { id:'grenade_juggler', spellId:459843, name:'Grenade Juggler', type:'passive', maxPts:1, row:10, col:1,
    parents:['flamefang'], desc:'Flamefang Pitch gains 1 additional charge. Throwing your Flamefang Pitch grants 1 charge of Wildfire Bomb.' },
  { id:'wildfire_imbuement', spellId:1252943, name:'Wildfire Imbuement', type:'passive', maxPts:1, row:10, col:3,
    parents:['flamefang'], desc:"Throwing your Flamefang Pitch imbues your weapon with flame, causing you and your pet's auto-attacks to deal additional Fire damage for 10 sec." },
  { id:'flanked', spellId:1256938, name:'Flanked', type:'passive', maxPts:1, row:10, col:4,
    parents:['twin_fangs','savagery'], desc:'Takedown damage increased by 50% and it now strikes 4 additional nearby targets. During Takedown, your attack speed is increased by 100%.' },
  { id:'lethal_calibration', spellId:1262409, name:'Lethal Calibration', type:'passive', maxPts:1, row:10, col:5,
    parents:['wfb_infusion'], desc:'Wildfire Bomb reduces the cooldown of Boomstick by 2.0 sec for each enemy hit, up to 10 sec.' },
  { id:'primal_surge', spellId:1272154, name:'Primal Surge', type:'passive', maxPts:1, row:10, col:7,
    parents:['wfb_infusion'], desc:'Kill Command grants 1 additional stack of Tip of the Spear. Tip of the Spear\'s damage bonus is increased by 5%.' },
];

// ── APEX TALENT (standalone, shares Survival 34-pt budget) ───
export const APEX_NODES: TalentNodeDef[] = [
  { id:'raptor_swipe', spellId:1259003, name:'Raptor Swipe', type:'apex', maxPts:1, row:0, col:2,
    parents:[], desc:'APEX TALENT. Raptor Strike has a 25% chance to upgrade itself to a Raptor Swipe, dealing Physical damage to all enemies within 15 yds in front of you. Damage reduced beyond 5 targets.' },
  { id:'apex_tier_1', spellId:1259003, name:'Raptor Swipe II', type:'passive', maxPts:1, row:1, col:1,
    parents:['raptor_swipe'], desc:'Increases Raptor Swipe proc chance and damage.' },
  { id:'apex_tier_2', spellId:1259003, name:'Raptor Swipe III', type:'passive', maxPts:1, row:1, col:2,
    parents:['raptor_swipe'], desc:'Further increases Raptor Swipe proc chance and damage.' },
  { id:'apex_tier_3', spellId:1259003, name:'Raptor Swipe IV', type:'passive', maxPts:1, row:1, col:3,
    parents:['raptor_swipe'], desc:'Maximizes Raptor Swipe proc chance and damage.' },
];

// ── SENTINEL HERO TREE (Midnight 12.0.1, Hero ID 42) ─────────

export const SENTINEL_NODES: TalentNodeDef[] = [
  { id:'sentinel_keystone', spellId:1253599, name:'Sentinel', type:'passive', maxPts:1, row:1, col:4,
    parents:[], desc:'KEYSTONE. Your Eagle is replaced with a Sentinel Owl that applies an enhanced Sentinel\'s Mark. Your next Wildfire Bomb deals 40% increased direct damage to the marked target.' },
  { id:'dont_look_back', spellId:450373, name:"Don't Look Back", type:'passive', maxPts:1, row:2, col:1,
    parents:['sentinel_keystone'], desc:"Consuming Sentinel's Mark grants you an absorb shield equal to 10.0% of your maximum health." },
  { id:'moons_blessing', spellId:1253825, name:"Moon's Blessing", type:'passive', maxPts:1, row:2, col:3,
    parents:['sentinel_keystone'], desc:'Consuming Tip of the Spear has a 10% increased chance to summon your Sentinel Owl. When your Sentinel Owl applies Sentinel\'s Mark, reduce the cooldown of Wildfire Bomb by 4.0 sec.' },
  { id:'sanctified_arms', spellId:1253831, name:'Sanctified Armaments', type:'passive', maxPts:1, row:2, col:5,
    parents:['sentinel_keystone'], desc:"An additional 15% of Raptor Strike's damage is dealt as Arcane damage over 6 sec." },
  { id:'moonlight_chakram', spellId:1264902, name:'Moonlight Chakram', type:'passive', maxPts:1, row:2, col:7,
    parents:['sentinel_keystone'], desc:'For 15 sec after casting Takedown, Takedown is replaced with Moonlight Chakram. Throw a chakram blessed with moonlight that bounces between enemies.' },
  { id:'stargazer_choice', spellId:null, name:'Stargazer / Open Fire', type:'choice', maxPts:1, row:3, col:1,
    parents:['dont_look_back'], desc:'Stargazer: crit dmg buff on TotS. Open Fire: Flamefang Pitch +15% dmg.',
    choiceA: { name:'Stargazer', spellId:1253751, desc:'Consuming Tip of the Spear grants 2% increased critical strike damage for 10 sec. Multiple applications may overlap.' },
    choiceB: { name:'Open Fire', spellId:1253807, desc:'Flamefang Pitch damage increased by 15%.' } },
  { id:'cant_miss', spellId:1253830, name:"Can't Miss, Won't Miss", type:'passive', maxPts:1, row:3, col:3,
    parents:['moons_blessing'], desc:'Tip of the Spear damage bonus increased by 4%. Takedown duration increased by 2 sec.' },
  { id:'invigorating_pulse', spellId:450379, name:'Invigorating Pulse', type:'passive', maxPts:1, row:3, col:5,
    parents:['sanctified_arms'], desc:'Kill Command grants an additional 5 Focus and its damage is increased by 20%. Maximum Focus increased by 25.' },
  { id:'twilight_choice', spellId:null, name:'Twilight Requiem / Stalk and Strike', type:'choice', maxPts:1, row:3, col:7,
    parents:['moonlight_chakram'], desc:'Twilight Requiem: Chakram explosion on expiry. Stalk and Strike: WFB CD reduction on throw.',
    choiceA: { name:'Twilight Requiem', spellId:1264904, desc:'When your Moonlight Chakram expires, it summons an explosion of moonlight, dealing Arcane damage to nearby enemies.' },
    choiceB: { name:'Stalk and Strike', spellId:1266069, desc:'Throwing your Moonlight Chakram reduces the cooldown of Wildfire Bomb by 10 sec.' } },
  { id:'arcane_talons', spellId:1253846, name:'Arcane Talons', type:'passive', maxPts:1, row:4, col:1,
    parents:['stargazer_choice'], desc:"Sentinel's Mark further increases the damage of Wildfire Bomb by 50%." },
  { id:'lunar_calling', spellId:1253852, name:'Lunar Calling', type:'passive', maxPts:1, row:4, col:3,
    parents:['cant_miss'], desc:'Takedown summons your Sentinel Owl and your chance to summon your Sentinel Owl is increased by an additional 10% during Takedown.' },
  { id:'cond_choice', spellId:null, name:"Conditioning / Scout's Vigil", type:'choice', maxPts:1, row:4, col:5,
    parents:['invigorating_pulse'], desc:"Conditioning: move speed +8%, Cheetah CD -30s. Scout's Vigil: stealth detection.",
    choiceA: { name:'Conditioning', spellId:1253887, desc:'Your movement speed is increased by 8%. Aspect of the Cheetah\'s cooldown is reduced by 30 sec.' },
    choiceB: { name:"Scout's Vigil", spellId:1253892, desc:'Enemy detection radius reduced by 10 yds. While in Camouflage, your stealth detection radius is increased by 25 yds.' } },
  { id:'radiant_edge', spellId:1264903, name:'Radiant Edge', type:'passive', maxPts:1, row:4, col:7,
    parents:['twilight_choice'], desc:'Your Moonlight Chakram deals 25% increased damage each time it bounces.' },
  { id:'lunar_storm', spellId:1253732, name:'Lunar Storm', type:'passive', maxPts:1, row:5, col:4,
    parents:['arcane_talons','lunar_calling','cond_choice','radiant_edge'],
    desc:"CAPSTONE. When Sentinel's Mark is consumed, it summons a barrage of 4 lunar missiles, each dealing Arcane damage to enemies within 10 yds." },
];

// ── PACK LEADER HERO TREE (Midnight 12.0.1, Hero ID 43) ──────

export const PACK_LEADER_NODES: TalentNodeDef[] = [
  { id:'vicious_hunt', spellId:471876, name:'Howl of the Pack Leader', type:'passive', maxPts:1, row:1, col:4,
    parents:[], desc:'KEYSTONE. While in combat, every 30 sec your next Kill Command summons the aid of a Beast: Wyvern (damage buff), Boar (charge damage), or Bear (rend AoE).' },
  { id:'lone_wolf', spellId:472358, name:'Pack Mentality', type:'passive', maxPts:1, row:2, col:1,
    parents:['vicious_hunt'], desc:'Howl of the Pack Leader increases the damage of your Kill Command by 50%. Summoning a Beast reduces the cooldown of Barbed Shot by 4.0 sec.' },
  { id:'horn', spellId:472352, name:'Dire Summons', type:'passive', maxPts:1, row:2, col:3,
    parents:['vicious_hunt'], desc:'Kill Command reduces the cooldown of Howl of the Pack Leader by 1.0 sec. Cobra Shot reduces the cooldown of Howl of the Pack Leader by 1.0 sec.' },
  { id:'pathfinding_pl', spellId:472357, name:'Better Together', type:'passive', maxPts:1, row:2, col:5,
    parents:['vicious_hunt'], desc:'Damage dealt by your pets is increased by 2%. Barbed Shot damage increased by 10%.' },
  { id:'shoes_choice', spellId:null, name:'Slicked Shoes / Masterful Call', type:'choice', maxPts:1, row:2, col:7,
    parents:['vicious_hunt'], desc:'Slicked Shoes: Disengage CD reduction. Masterful Call: Master\'s Call duration +2s.',
    choiceA: { name:'Slicked Shoes', spellId:472719, desc:'When Disengage removes a movement impairing effect, its cooldown is reduced by 4 sec.' },
    choiceB: { name:'Masterful Call', spellId:1268705, desc:"The duration of Master's Call is increased by 2 sec and it increases the movement speed of its target by 20%." } },
  { id:'ursine_choice', spellId:null, name:'Ursine Fury / Sharpened Claws', type:'choice', maxPts:1, row:3, col:1,
    parents:['lone_wolf'], desc:'Ursine Fury: Bear summons Dire Beasts. Sharpened Claws: Bear Rend +15% dmg.',
    choiceA: { name:'Ursine Fury', spellId:472476, desc:'When your Bear is summoned, it is joined by 2 Dire Beasts.' },
    choiceB: { name:'Sharpened Claws', spellId:472524, desc:"The damage of your Bear's Rend Flesh is increased by 15%." } },
  { id:'cat_charge', spellId:472550, name:'Fury of the Wyvern', type:'passive', maxPts:1, row:3, col:3,
    parents:['horn'], desc:"Your pet's attacks increase your Wyvern's damage bonus by 1%, up to 10%. Casting Kill Command extends the duration of your Wyvern by 0.5 sec, up to 5 additional sec." },
  { id:'boar_head', spellId:472639, name:'Hogstrider', type:'passive', maxPts:1, row:3, col:5,
    parents:['pathfinding_pl'], desc:'When your Boar deals damage, the damage of your next Cobra Shot is increased by 200%. Each target damaged by your Boar causes Cobra Shot to strike 1 additional target, up to 4.' },
  { id:'critical_shot', spellId:1264781, name:'Lethal Barbs', type:'passive', maxPts:1, row:3, col:7,
    parents:['shoes_choice'], desc:'Your auto shot grants 2 Focus to you and your pet. Auto shot damage increased by 25%.' },
  { id:'go_for_throat', spellId:472660, name:'No Mercy', type:'passive', maxPts:1, row:4, col:1,
    parents:['ursine_choice'], desc:'Your Bleed effects deal 10% increased damage.' },
  { id:'turtle', spellId:472707, name:'Shell Cover', type:'passive', maxPts:1, row:4, col:3,
    parents:['cat_charge'], desc:'Survival of the Fittest now summons a Turtle to aid you, further increasing its damage reduction effect by 10%.' },
  { id:'hoof_choice', spellId:null, name:"Hoof and Blade / Wyvern's Gaze", type:'choice', maxPts:1, row:4, col:5,
    parents:['boar_head'], desc:"Hoof and Blade: Hogstrider Cobra Shot +50% dmg & +3 targets. Wyvern's Gaze: Wyvern buff +2s.",
    choiceA: { name:'Hoof and Blade', spellId:1264797, desc:'Hogstrider further increases the damage of Cobra Shot by 50% and it now strikes up to 3 additional targets.' },
    choiceB: { name:"Wyvern's Gaze", spellId:1264792, desc:'The damage bonus from your Wyvern now lasts an additional 2.0 sec.' } },
  { id:'monster_fang', spellId:1264775, name:'Sharpened Fangs', type:'passive', maxPts:1, row:4, col:7,
    parents:['critical_shot'], desc:'Your mastery is increased by 3%.' },
  { id:'bestial_discipline', spellId:472741, name:'Stampede!', type:'passive', maxPts:1, row:5, col:4,
    parents:['go_for_throat','turtle','hoof_choice','monster_fang'],
    desc:'CAPSTONE. Casting Bestial Wrath grants Howl of the Pack Leader and causes your next Kill Command to rouse the nearby wildlife into a Stampede, charging your target and dealing Physical damage over 7 sec.' },
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
  1259003: "https://wow.zamimg.com/images/wow/icons/large/inv12_apextalent_hunter_raptorswipe.jpg",
  // Choice sub-spells (spec)
  1253172: "https://wow.zamimg.com/images/wow/icons/large/inv_wildfirebomb.jpg",
  1253176: "https://wow.zamimg.com/images/wow/icons/large/spell_fire_flamebolt.jpg",
  385737: "https://wow.zamimg.com/images/wow/icons/large/ability_druid_rake.jpg",
  1252738: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_raptorstrike.jpg",
  1253945: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_mongoosebite.jpg",
  1261229: "https://wow.zamimg.com/images/wow/icons/large/inv_wildfirebomb.jpg",
  1257011: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_raptorstrike.jpg",
  462036: "https://wow.zamimg.com/images/wow/icons/large/inv_wildfirebomb.jpg",

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
  1253892: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_mastermarksman.jpg",
  1264903: "https://wow.zamimg.com/images/wow/icons/large/inv_glaive_1h_npc_d_01.jpg",
  1253732: "https://wow.zamimg.com/images/wow/icons/large/ability_druid_lunarguidance.jpg",

  // ── Pack Leader ──
  471876: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_sickem.jpg",
  472358: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_lonewolf.jpg",
  472352: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_beastwithin.jpg",
  472357: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_pathfinding2.jpg",
  472719: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_aspectoftheviper.jpg",
  1268705: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_mendpet.jpg",
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
  264735: "https://wow.zamimg.com/images/wow/icons/large/spell_nature_spiritarmor.jpg",
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
  459983: "https://wow.zamimg.com/images/wow/icons/large/spell_nature_drowsy.jpg",
  459991: "https://wow.zamimg.com/images/wow/icons/large/spell_nature_drowsy.jpg",
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
  459488: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_rapidkill.jpg",
  1268671: "https://wow.zamimg.com/images/wow/icons/large/spell_frost_chainsofice.jpg",
  459507: "https://wow.zamimg.com/images/wow/icons/large/spell_nature_spiritarmor.jpg",
  1258509: "https://wow.zamimg.com/images/wow/icons/large/ability_druid_ferociousbite.jpg",
  266921: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_aspectoftheviper.jpg",
  378004: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_eagleeye.jpg",
  459460: "https://wow.zamimg.com/images/wow/icons/large/spell_shaman_bindelemental.jpg",
  472729: "https://wow.zamimg.com/images/wow/icons/large/inv_trap_01.jpg",
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
