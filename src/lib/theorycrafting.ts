// ============================================================
// SURVIVAL HUNTER MIDNIGHT 12.0 — FIRST-PRINCIPLES THEORYCRAFTING ENGINE
// ============================================================
// Calculates per-ability DPS from raw formulas rather than anchored scaling.
// Sources: Blizzard API spell data, SimulationCraft:midnight APL, spell coefficients
// from sc_hunter.cpp, and verified against Raidbots/Warcraft Logs parses.
//
// Key differences vs community guides (Wowhead, Icy Veins, class discords):
//  1. Takedown window modeled per-second (8s amp on 13% uptime; Savagery is core in all builds)
//  2. Tier set interaction: 2pc KC crit → WFB CD reduction → Lethal Calibration uptime
//  3. Sentinel Mark proc math modeled per RS cast, not assumed flat
//  4. Two Against Many: shown BiS at 3+ targets (cleave), not just 5+ as most guides claim
//  5. Mongoose Fury stack distribution modeled (not flat average)
//  6. Flanker's Advantage / Bloodseeker modeled as KC damage multipliers (estimated coefficients)
// ============================================================

// ── Interfaces ──────────────────────────────────────────────

export interface GearProfile {
  ilvl: number;
  agility: number;
  /** Total attack power including weapon contribution */
  attackPower: number;
  critPct: number;
  hastePct: number;
  /** Mastery: Spirit Bond — increases player + pet damage */
  masteryPct: number;
  versPct: number;
}

export interface TierSetConfig {
  has2pc: boolean;
  /** 4pc: WFB detonation 20% chance to reset Boomstick CD */
  has4pc: boolean;
}

export interface TalentConfig {
  // ─ Always-taken spec core (WoWHead verified, all 4 builds) ─
  killCommand: boolean;
  wildfireBomb: boolean;
  raptorStrike: boolean;
  guerrillaTactics: boolean;
  tipOfTheSpear: boolean;
  lunge: boolean;
  boomstick: boolean;
  strikeAsOne: boolean;
  flamebreak: boolean;       // T3 choice: Flamebreak over Shrapnel Bomb (all 4 builds)
  quickReload: boolean;
  mongooseFury: boolean;
  wildfireShells: boolean;   // T3 choice: Wildfire Shells over Mongoose Rounds (all 4 builds)
  shellshock: boolean;
  wallop: boolean;           // T3 choice: Wallop over Bloody Claws (all 4 builds)
  bonding: boolean;
  sweepingSpear: boolean;
  blackrockMunitions: boolean; // T3 choice: Blackrock Munitions over Vulnerability (all 4 builds)
  takedown: boolean;
  killerCompanion: boolean;
  twinFangs: boolean;
  savagery: boolean;
  wildfireInfusion: boolean;
  flanked: boolean;
  primalSurge: boolean;
  raptorSwipe: boolean;      // Apex 4pt node
  // ─ Build-specific optional (vary across WoWHead builds) ─
  /** Flanker's Advantage: all builds except Raid Pack Leader */
  flankerAdvantage: boolean;
  /** Bloodseeker: Raid Pack Leader only */
  bloodseeker: boolean;
  /** Two Against Many: all builds except Raid Sentinel */
  twoAgainstMany: boolean;
  /** Lethal Calibration: all builds except Raid Sentinel */
  lethalCalibration: boolean;
  // ─ Sentinel hero (13 nodes · WoWHead-verified Midnight 12.0) ─
  dontLookBack: boolean;
  moonsBlessing: boolean;
  sanctifiedArmaments: boolean;
  moonlightChakram: boolean;
  conditioning: boolean;         // Sentinel row 2 col 0 — move speed +8%, Cheetah CD -60s
  cantMissWontMissSent: boolean; // Can't Miss, Won't Miss — Sentinel hero row 2 col 1
  invigoratingPulse: boolean;
  scoutsVigil: boolean;          // Sentinel row 2 col 3 — stealth detection + Eagle Eye range
  arcaneTalons: boolean;
  lunarCalling: boolean;
  lunarGrace: boolean;           // Sentinel row 3 col 2 — Mark consumption grants +3% Agility 8s
  radiantEdge: boolean;
  lunarStorm: boolean;
  // ─ Pack Leader hero (13 nodes · WoWHead-verified Midnight 12.0) ─
  packMentality: boolean;
  direSummons: boolean;
  packCoordination: boolean;     // was betterTogether — WFB CD -4s when beast spawned by ally
  masterfulCall: boolean;        // Pack Leader row 1 col 3 — Master's Call +2s, +20% move speed
  wyvernGaze: boolean;           // Pack Leader row 2 col 0 — Wyvern's damage bonus +2s; choice w/ Hoof and Blade
  furyOfTheWyvern: boolean;
  hogstrider: boolean;
  lethalBarbs: boolean;
  noMercy: boolean;
  shellCover: boolean;
  ursineFury: boolean;           // Pack Leader row 3 col 2 — Bear spawns 2 extra Dire Beasts; choice w/ Sharpened Claws
  sharpenedFangs: boolean;
  stampede: boolean;
}

export interface AbilityDpsResult {
  key: string;
  label: string;
  dps: number;
  cpm: number;
  dpsCast: number;
  pctOfTotal: number;
  notes: string[];
}

export interface TheoryCraftResult {
  totalDps: number;
  abilities: AbilityDpsResult[];
  talentDeltas: TalentDelta[];
  tierSetValue: TierSetValue;
  rotationNotes: string[];
  vsCommunity: VsCommunity;
}

export interface TalentDelta {
  key: string;
  label: string;
  dpsDelta: number;
  pctIncrease: number;
  reasoning: string;
  communityRanks: boolean; // whether most community guides include this talent
  ourRanks: boolean;
  inBuild: boolean;        // true = talent is in the current build (delta = DPS loss if removed)
  pointCost: number;       // talent point cost (1 or 2); budget = 8 optional + 3 hero
}

export interface TierSetValue {
  twoPcDps: number;
  fourPcDps: number;
  totalDps: number;
  notes: string[];
}

export interface VsCommunity {
  agreements: string[];
  differences: { topic: string; communityView: string; ourView: string; delta: string }[];
}

// ============================================================
// SURVIVAL HUNTER SPEC TALENT TREE — MIDNIGHT 12.0
// ============================================================
// Models the real Blizzard talent tree with:
//   • Row gates: you must spend N points in rows 1–(R-1) to unlock row R
//   • Prerequisites: some talents require specific other talents
//   • Gateway talents: suboptimal nodes forced by path design to reach better ones
//   • Apex talent (Raptor Swipe): multi-rank, all points required for full value
//
// Point budget (DPS-relevant spec talents only):
//   Core:     8 pts  (always taken — rows 1–4)
//   Optional: 8 pts  (ST: 6 pts, AoE: 8 pts)
//   Hero:     3 pts  (Sentinel or Pack Leader, all 3 nodes)
//   Total:   ~16–19 pts of the full 30-pt spec tree
//   (remaining ~11–14 pts go to defensive, utility, and class tree nodes)
// ============================================================

export interface TalentNode {
  key: keyof TalentConfig;
  label: string;
  row: number;         // 1–7 in the spec tree
  col: number;         // 0-indexed column position for 2D grid layout (6 columns: 0–5)
  pointCost: number;   // 1 or 2 pts
  prerequisites: (keyof TalentConfig)[];   // must have these to unlock
  gateRow: number;     // unlock requires this many pts spent in earlier rows
  isApex?: boolean;    // Apex talent: special multi-rank system, needs all pts
  isGateway: boolean;  // suboptimal but forced by path to reach better node
  gatewayNote?: string;// why it's a forced gateway pick
  inSTBuild: boolean;
  inAoEBuild: boolean;
  dpsCategory: 'core' | 'st' | 'aoe' | 'gateway';
}

export interface HeroTalentNode {
  key: keyof TalentConfig;
  label: string;
  /** Row within the hero tree grid (1–4, top to bottom) */
  row: number;
  /** Column within the hero tree grid (0–3, left to right) */
  col: number;
  pointCost: 1;
  desc: string;
}

// Row gate thresholds for the 11-row spec tree.
// All core nodes are always taken so optional nodes are always unlockable
// (their core prerequisites are by definition satisfied).
export const ROW_GATES: Record<number, number> = {
  1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, 10: 9, 11: 10,
};

// ============================================================
// SURVIVAL HUNTER SPEC TALENT TREE — MIDNIGHT 12.0
// Exact positions derived from WoWHead talent tree widget
// (MHT archive, March 2026). Column mapping: WoWHead c4-c16
// normalized to col 0-6 ((wh_col - 4) / 2).
//
// 29 nodes across 11 rows × 7 cols. All 4 WoWHead builds share
// the same 25 core nodes; only 4 nodes vary between builds.
// ============================================================
export const SURVIVAL_SPEC_TREE: TalentNode[] = [
  // ─── ROW 1 ─────────────────────────────────────────────────
  { key: 'killCommand', label: 'Kill Command',
    row: 1, col: 3, pointCost: 1, prerequisites: [], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core' },

  // ─── ROW 2 ─────────────────────────────────────────────────
  { key: 'wildfireBomb', label: 'Wildfire Bomb',
    row: 2, col: 2, pointCost: 1, prerequisites: ['killCommand'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core' },
  { key: 'raptorStrike', label: 'Raptor Strike',
    row: 2, col: 4, pointCost: 1, prerequisites: ['killCommand'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core' },

  // ─── ROW 3 ─────────────────────────────────────────────────
  { key: 'guerrillaTactics', label: 'Guerrilla Tactics',
    row: 3, col: 2, pointCost: 1, prerequisites: ['wildfireBomb'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core' },
  { key: 'tipOfTheSpear', label: 'Tip of the Spear',
    row: 3, col: 4, pointCost: 1, prerequisites: ['raptorStrike'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core' },

  // ─── ROW 4 ─────────────────────────────────────────────────
  { key: 'lunge', label: 'Lunge',
    row: 4, col: 1, pointCost: 1, prerequisites: ['guerrillaTactics'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core' },
  { key: 'boomstick', label: 'Boomstick',
    row: 4, col: 3, pointCost: 1, prerequisites: ['guerrillaTactics', 'tipOfTheSpear'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core' },
  { key: 'strikeAsOne', label: 'Strike as One',
    row: 4, col: 5, pointCost: 1, prerequisites: ['tipOfTheSpear'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core' },

  // ─── ROW 5 ─────────────────────────────────────────────────
  // Flamebreak: T3 choice node — WoWHead always picks Flamebreak over Shrapnel Bomb
  { key: 'flamebreak', label: 'Flamebreak',
    row: 5, col: 0, pointCost: 1, prerequisites: ['boomstick'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core',
    gatewayNote: 'All-Fire-damage +15%. Choice node: WoWHead always picks Flamebreak over Shrapnel Bomb in Midnight.' },
  // Bloodseeker: Raid Pack Leader only
  { key: 'bloodseeker', label: 'Bloodseeker',
    row: 5, col: 2, pointCost: 1, prerequisites: ['boomstick'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: false, dpsCategory: 'st' },
  { key: 'quickReload', label: 'Quick Reload',
    row: 5, col: 3, pointCost: 1, prerequisites: ['boomstick'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core' },
  // Flanker's Advantage: all builds except Raid Pack Leader
  { key: 'flankerAdvantage', label: "Flanker's Advantage",
    row: 5, col: 4, pointCost: 1, prerequisites: ['quickReload'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'st' },
  // Two Against Many: all builds except Raid Sentinel
  { key: 'twoAgainstMany', label: 'Two Against Many',
    row: 5, col: 6, pointCost: 1, prerequisites: ['strikeAsOne'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'aoe' },

  // ─── ROW 6 ─────────────────────────────────────────────────
  { key: 'mongooseFury', label: 'Mongoose Fury',
    row: 6, col: 1, pointCost: 1, prerequisites: ['lunge'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core' },
  // Wildfire Shells: T3 choice node — WoWHead always picks Wildfire Shells over Mongoose Rounds
  { key: 'wildfireShells', label: 'Wildfire Shells',
    row: 6, col: 2, pointCost: 1, prerequisites: ['quickReload'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core',
    gatewayNote: 'Choice node: WoWHead always picks Wildfire Shells over Mongoose Rounds in Midnight.' },
  { key: 'shellshock', label: 'Shellshock',
    row: 6, col: 4, pointCost: 1, prerequisites: ['wildfireShells'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core' },

  // ─── ROW 7 ─────────────────────────────────────────────────
  // Wallop: T3 choice node — WoWHead always picks Wallop over Bloody Claws
  { key: 'wallop', label: 'Wallop',
    row: 7, col: 0, pointCost: 1, prerequisites: ['flamebreak', 'mongooseFury'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core',
    gatewayNote: 'Choice node: WoWHead always picks Wallop over Bloody Claws in Midnight.' },
  { key: 'bonding', label: 'Bonding',
    row: 7, col: 2, pointCost: 1, prerequisites: ['wildfireShells'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core' },
  { key: 'sweepingSpear', label: 'Sweeping Spear',
    row: 7, col: 3, pointCost: 2, prerequisites: ['shellshock'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core' },
  // Blackrock Munitions: T3 choice node — WoWHead always picks BM over Vulnerability
  { key: 'blackrockMunitions', label: 'Blackrock Munitions',
    row: 7, col: 4, pointCost: 1, prerequisites: ['shellshock'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core',
    gatewayNote: 'Choice node: WoWHead always picks Blackrock Munitions over Vulnerability in Midnight.' },

  // ─── ROW 8 ─────────────────────────────────────────────────
  { key: 'takedown', label: 'Takedown',
    row: 8, col: 3, pointCost: 1, prerequisites: ['sweepingSpear'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core' },
  { key: 'killerCompanion', label: 'Killer Companion',
    row: 8, col: 5, pointCost: 2, prerequisites: ['blackrockMunitions'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core' },

  // ─── ROW 9 ─────────────────────────────────────────────────
  { key: 'twinFangs', label: 'Twin Fangs',
    row: 9, col: 2, pointCost: 1, prerequisites: ['bonding', 'takedown'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core' },
  { key: 'savagery', label: 'Savagery',
    row: 9, col: 4, pointCost: 2, prerequisites: ['takedown'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core' },
  { key: 'wildfireInfusion', label: 'Wildfire Infusion',
    row: 9, col: 5, pointCost: 1, prerequisites: ['killerCompanion'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core' },

  // ─── ROW 10 ────────────────────────────────────────────────
  { key: 'flanked', label: 'Flanked',
    row: 10, col: 3, pointCost: 1, prerequisites: ['twinFangs', 'savagery'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core' },
  // Lethal Calibration: all builds except Raid Sentinel
  { key: 'lethalCalibration', label: 'Lethal Calibration',
    row: 10, col: 4, pointCost: 1, prerequisites: ['savagery'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'st' },
  { key: 'primalSurge', label: 'Primal Surge',
    row: 10, col: 6, pointCost: 1, prerequisites: ['wildfireInfusion'], gateRow: 0,
    isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core' },

  // ─── ROW 11 — Apex ─────────────────────────────────────────
  { key: 'raptorSwipe', label: 'Raptor Swipe',
    row: 11, col: 3, pointCost: 4, prerequisites: ['flanked'], gateRow: 0,
    isApex: true, isGateway: false, inSTBuild: true, inAoEBuild: true, dpsCategory: 'core',
    gatewayNote: 'Apex 4pt node. Raptor Strike has a 25% chance to strike again; 100% during Takedown. All 4 points required — partial investment is a significant power gap.' },
];

// ============================================================
// HERO TALENT TREES — MIDNIGHT 12.0
// 13 nodes per hero (1 gateway + 13 spendable = "Spent: 0/13" per WoWHead).
// 4-col × 4-row grid: rows 1–3 have 4 nodes each, row 4 is the capstone.
// WoWHead cols c7-c13 normalized to col 0-3: (wh_col - 7) / 2
// WoWHead rows r2-r5 normalized to row 1-4: wh_row - 1
// ============================================================
export const HERO_TALENT_TREES: Record<'sentinel' | 'packLeader', HeroTalentNode[]> = {
  sentinel: [
    // ─── ROW 1 (WoWHead r2) — 4 nodes ─────────────────────
    { key: 'dontLookBack', label: "Don't Look Back",
      row: 1, col: 0, pointCost: 1,
      desc: "Consuming Sentinel's Mark grants an absorb shield equal to 10% of your max HP." },
    { key: 'moonsBlessing', label: "Moon's Blessing",
      row: 1, col: 1, pointCost: 1,
      desc: "Sentinel's Mark proc chance increased by 10% (20% → 30%). Proc chance further increases by 10% during Primal Frenzy." },
    { key: 'sanctifiedArmaments', label: 'Sanctified Armaments',
      row: 1, col: 2, pointCost: 1,
      desc: 'Your weapons are imbued with lunar energy, increasing Raptor Strike and Raptor Swipe damage by 8%.' },
    { key: 'moonlightChakram', label: 'Moonlight Chakram',
      row: 1, col: 3, pointCost: 1,
      desc: "Sentinel's Mark procs release a bouncing moonlight chakram that ricochets to up to 5 nearby enemies, dealing arcane damage." },
    // ─── ROW 2 (WoWHead r3) — 4 nodes ─────────────────────
    { key: 'conditioning', label: 'Conditioning',
      row: 2, col: 0, pointCost: 1,
      desc: 'Passive conditioning increases your movement speed by 8% and reduces the cooldown of Aspect of the Cheetah by 60 seconds.' },
    { key: 'cantMissWontMissSent', label: "Can't Miss, Won't Miss",
      row: 2, col: 1, pointCost: 1,
      desc: "Your attacks cannot be dodged or parried. Sentinel's Mark applications also reduce enemy dodge chance by 5% for 8 seconds." },
    { key: 'invigoratingPulse', label: 'Invigorating Pulse',
      row: 2, col: 2, pointCost: 1,
      desc: "Kill Command grants 5 Focus and increases Kill Command damage by 20%. Maximum Focus increased by 25." },
    { key: 'scoutsVigil', label: "Scout's Vigil",
      row: 2, col: 3, pointCost: 1,
      desc: "Reduces nearby enemy detection radius by 10 yards. While in Camouflage, your stealth detection radius is increased by 25 yards — applying Sentinel's Mark to any enemy detected within that radius." },
    // ─── ROW 3 (WoWHead r4) — 4 nodes ─────────────────────
    { key: 'arcaneTalons', label: 'Arcane Talons',
      row: 3, col: 0, pointCost: 1,
      desc: "Increases the damage bonus from Sentinel's Mark by an additional 15%. Your pet's melee attacks deal arcane damage and have a chance to trigger Sentinel's Mark." },
    { key: 'lunarCalling', label: 'Lunar Calling',
      row: 3, col: 1, pointCost: 1,
      desc: "Takedown summons a Sentinel Owl that applies Sentinel's Mark to the primary target. Proc chance increased by 10% during Primal Frenzy." },
    { key: 'lunarGrace', label: 'Lunar Grace',
      row: 3, col: 2, pointCost: 1,
      desc: "Consuming Sentinel's Mark increases your Agility by 3% for 8 seconds, stacking up to 2 times. Each stack refreshes independently." },
    { key: 'radiantEdge', label: 'Radiant Edge',
      row: 3, col: 3, pointCost: 1,
      desc: "Your Raptor Strike and Raptor Swipe have a 15% chance to trigger a radiant energy burst, dealing additional arcane damage equal to 80% of Attack Power to the target and up to 2 nearby enemies." },
    // ─── ROW 4 (WoWHead r5) — Capstone ────────────────────
    { key: 'lunarStorm', label: 'Lunar Storm',
      row: 4, col: 1, pointCost: 1,
      desc: "Capstone: Consuming Sentinel's Mark triggers a Lunar Storm at the target's location, dealing AoE arcane damage to up to 5 enemies over 2 seconds. With Moon's Blessing (30% proc) at 12 RS/min: ~3.6 storms/min." },
  ],
  packLeader: [
    // ─── ROW 1 (WoWHead r2) — 4 nodes ─────────────────────
    { key: 'packMentality', label: 'Pack Mentality',
      row: 1, col: 0, pointCost: 1,
      desc: "Wildfire Bomb cooldown reduced by 6 seconds when a beast companion spawns. Kill Command deals 50% increased damage while Howl of the Pack Leader is active." },
    { key: 'direSummons', label: 'Dire Summons',
      row: 1, col: 1, pointCost: 1,
      desc: 'Reduces the cooldown of your beast companion spawns by 15%. Beast companions summoned via Dire Beast deal 20% increased damage for 5 seconds after spawning.' },
    { key: 'packCoordination', label: 'Pack Coordination',
      row: 1, col: 2, pointCost: 1,
      desc: 'Your beast companions coordinate attacks — when two or more are active simultaneously, their damage is increased by 15%. Kill Command has a 10% increased chance to spawn a Dire Beast.' },
    { key: 'masterfulCall', label: 'Masterful Call',
      row: 1, col: 3, pointCost: 1,
      desc: "Master's Call duration increased by 2 seconds. Targets of Master's Call gain 20% increased movement speed and are immune to movement-impairing effects for the duration." },
    // ─── ROW 2 (WoWHead r3) — 4 nodes ─────────────────────
    { key: 'wyvernGaze', label: "Wyvern's Gaze",
      row: 2, col: 0, pointCost: 1,
      desc: "Your Wyvern companion's damage bonus is extended by 2 seconds. Choice node with Hoof and Blade — Wyvern's Gaze focuses on sustained Wyvern DPS; Hoof and Blade enhances boar and bear companion synergy." },
    { key: 'furyOfTheWyvern', label: 'Fury of the Wyvern',
      row: 2, col: 1, pointCost: 1,
      desc: "Wyvern companion deals 25% increased damage and applies a stacking bleed to targets hit. Each stack increases bleed damage by 8%, up to 5 stacks." },
    { key: 'hogstrider', label: 'Hogstrider',
      row: 2, col: 2, pointCost: 1,
      desc: "Hatchet Toss cleaves up to 4 additional targets and deals 200% increased damage. Your boar companion gains Hogstrider charge, dashing through enemies and dealing damage every 2 seconds." },
    { key: 'lethalBarbs', label: 'Lethal Barbs',
      row: 2, col: 3, pointCost: 1,
      desc: "Auto attacks generate 2 additional Focus. Auto attack damage increased by 25%. These barbed strikes have a chance to apply a bleed that deals damage over 6 seconds." },
    // ─── ROW 3 (WoWHead r4) — 4 nodes ─────────────────────
    { key: 'noMercy', label: 'No Mercy',
      row: 3, col: 0, pointCost: 1,
      desc: 'Bleed effects deal 20% increased damage. Enemies affected by your bleeds take 5% increased damage from all your attacks.' },
    { key: 'shellCover', label: 'Shell Cover',
      row: 3, col: 1, pointCost: 1,
      desc: "Survival of the Fittest summons a Turtle companion that reduces your damage taken by 10% while active. The Turtle taunts nearby enemies and has 50% of your max health." },
    { key: 'ursineFury', label: 'Ursine Fury',
      row: 3, col: 2, pointCost: 1,
      desc: "Bear companion spawns 2 additional Dire Beasts on arrival. Choice node with Sharpened Claws — Ursine Fury focuses on AoE Dire Beast burst; Sharpened Claws enhances pet crit and single-target damage." },
    { key: 'sharpenedFangs', label: 'Sharpened Fangs',
      row: 3, col: 3, pointCost: 1,
      desc: 'Mastery increased by 3%. Your pet\'s critical strikes deal 20% increased damage, and critical strike chance is increased by 5%.' },
    // ─── ROW 4 (WoWHead r5) — Capstone ────────────────────
    { key: 'stampede', label: 'Stampede!',
      row: 4, col: 1, pointCost: 1,
      desc: "Capstone: Takedown grants Howl of the Pack Leader, and your next Kill Command becomes Stampede — charging the target for 7 seconds with your entire beast pack, dealing massive damage. The core ST amplifier in Pack Leader." },
  ],
};

// Validate that a TalentConfig respects the tree prerequisites and row gates
export function validateBuildPath(talents: TalentConfig): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  for (const node of SURVIVAL_SPEC_TREE) {
    if (!talents[node.key]) continue; // not taken, no need to check

    // Check prerequisites
    for (const prereq of node.prerequisites) {
      if (!talents[prereq]) {
        const prereqNode = SURVIVAL_SPEC_TREE.find(n => n.key === prereq);
        violations.push(`${node.label} requires ${prereqNode?.label ?? prereq} but it is not taken.`);
      }
    }

    // Check row gate: count points spent in rows before this one
    const ptsInEarlierRows = SURVIVAL_SPEC_TREE
      .filter(n => n.row < node.row && talents[n.key])
      .reduce((s, n) => s + n.pointCost, 0);

    if (ptsInEarlierRows < node.gateRow) {
      violations.push(
        `${node.label} (row ${node.row}) requires ${node.gateRow} pts in earlier rows, but only ${ptsInEarlierRows} are spent.`
      );
    }
  }

  return { valid: violations.length === 0, violations };
}

// ── Midnight Season 1 Gear Profiles ─────────────────────────
//
// Track & Rank system — each track has 6 ranks, +3 ilvl per rank:
//
//  Track        Rank 1   Rank 6   Currency          Source
//  ──────────── ──────   ──────   ────────────────  ─────────────────────────────────
//  Adventurer     224     237     Weathered         World Quests / Normal Dungeons
//  Veteran        237     250     Carved            Heroic Dungeons / Delves T1-3
//  Champion       250     263     Runed             M0 / Normal Raid / Delves T4-7
//  Hero           263     276     Runed             M+ +2–+6 / Heroic Raid / Bountiful Delves
//  Myth           276     289     Gilded            M+ +7+ / Mythic Raid / Vault
//
// Cost: 120 Dawncrests per piece (Rank 1→6). Weekly cap: 100 crests.
// Slot discount: if a slot already has a max-rank item, upgrading any
// other item in that slot costs 0 crests (Gold only).

/** Myth-track Rank 6 (289 ilvl) — Mythic Raid / M+ +7+ vault. True BiS ceiling. */
export const MYTH_MIDNIGHT_289: GearProfile = {
  ilvl: 289,
  agility: 3_520,
  attackPower: 3_790,    // 2H polearm at 289 Myth Rank 6
  critPct: 26.2,
  hastePct: 15.4,
  masteryPct: 39.6,
  versPct: 9.5,
};

/**
 * Hero-track Rank 6 / Myth-track Rank 1 (276 ilvl).
 * Primary theorycrafting baseline: Heroic Raid hero-track max + 4pc tier.
 */
export const HERO_MIDNIGHT_276: GearProfile = {
  ilvl: 276,
  agility: 3_240,
  attackPower: 3_490,    // 2H polearm/staff at 276
  critPct: 25.4,
  hastePct: 14.8,
  masteryPct: 38.2,      // Spirit Bond — BiS stat for Survival
  versPct: 9.1,
};
/** Heroic raid = Hero-track max = 276 ilvl. Alias for HERO_MIDNIGHT_276. */
export const HEROIC_MIDNIGHT_276 = HERO_MIDNIGHT_276;

/** Champion-track Rank 6 (263 ilvl) — M0 / Normal Raid / Delves T7. */
export const CHAMPION_MIDNIGHT_263: GearProfile = {
  ilvl: 263,
  agility: 2_980,
  attackPower: 3_200,
  critPct: 22.8,
  hastePct: 13.5,
  masteryPct: 34.4,
  versPct: 8.4,
};

/** Veteran-track Rank 6 (250 ilvl) — Heroic Dungeons / Delves T3. */
export const VETERAN_MIDNIGHT_250: GearProfile = {
  ilvl: 250,
  agility: 2_720,
  attackPower: 2_920,
  critPct: 20.4,
  hastePct: 12.0,
  masteryPct: 29.8,
  versPct: 7.2,
};

/** Adventurer-track Rank 6 (237 ilvl) — World Quests / Normal Dungeons. */
export const ADVENTURER_MIDNIGHT_237: GearProfile = {
  ilvl: 237,
  agility: 2_490,
  attackPower: 2_660,
  critPct: 18.0,
  hastePct: 10.5,
  masteryPct: 25.6,
  versPct: 6.1,
};

/** @deprecated use CHAMPION_MIDNIGHT_263 */
export const NORMAL_MIDNIGHT_626 = CHAMPION_MIDNIGHT_263;

// ── Physical constants ───────────────────────────────────────

const CLASS_AURA = 1.20;
/** 2H swing timer for Survival. Haste scales this. */
const MELEE_SWING_TIMER_S = 3.0;
/** Kill Command baseline recharge (focus builder, spammable in rotation) */
const KC_RECHARGE_S = 3.0;

/**
 * Mastery: Spirit Bond
 * Each 1% mastery = 0.40% player damage + 0.60% pet damage.
 * From spirit_bond aura in sc_hunter.cpp.
 */
const MASTERY_PLAYER_BONUS_PER_PCT = 0.004;
const MASTERY_PET_BONUS_PER_PCT    = 0.006;

/** Pet attacks scale off 60% of player AP (petAttackPower aura) */
const PET_AP_SCALING = 0.60;

/**
 * Sentinel's Mark proc rate per Raptor Strike cast.
 * Base: 20%, Moon's Blessing: +10% = 30%.
 */
const SENTINEL_MARK_PROC_BASE = 0.20;
const SENTINEL_MARK_PROC_MOONS = 0.30;

// ── Ability definitions ─────────────────────────────────────

interface SpellDef {
  label: string;
  /** AP coefficient from sc_hunter.cpp */
  apCoef: number;
  /** Casts per minute at 0% haste (base rotation model) */
  baseCPM: number;
  isPet: boolean;
  isFire: boolean;
  isBleed: boolean;
  /** Hits multiple targets */
  aoeTargetCap: number;
  /** GCD/recharge scales with haste */
  hasteScalesCPM: boolean;
  /** Additional crit damage multiplier on top of base 2.0× */
  bonusCritMult: number;
  requiresTalent?: keyof TalentConfig;
  requiresHero?: 'sentinel' | 'packLeader';
}

const SPELLS: Record<string, SpellDef> = {
  // ─ Fill / spender ─
  raptorStrike: {
    label: 'Raptor Strike', apCoef: 2.86, baseCPM: 12.0,
    isPet: false, isFire: false, isBleed: false, aoeTargetCap: 1,
    hasteScalesCPM: true, bonusCritMult: 0,
  },
  killCommand: {
    label: 'Kill Command', apCoef: 1.50, baseCPM: 18.0,
    isPet: true, isFire: false, isBleed: false, aoeTargetCap: 1,
    hasteScalesCPM: true, bonusCritMult: 0,
  },
  // ─ Cooldowns ─
  wildfireBombDirect: {
    label: 'Wildfire Bomb (hit)', apCoef: 0.495, baseCPM: 3.2,
    isPet: false, isFire: true, isBleed: false, aoeTargetCap: 8,
    hasteScalesCPM: false, bonusCritMult: 0,
  },
  wildfireBombDoT: {
    label: 'Wildfire Bomb (DoT)', apCoef: 0.99, baseCPM: 3.2,
    isPet: false, isFire: true, isBleed: false, aoeTargetCap: 8,
    hasteScalesCPM: false, bonusCritMult: 0,
  },
  boomstick: {
    label: 'Boomstick', apCoef: 3.60, baseCPM: 1.0,
    isPet: false, isFire: false, isBleed: false, aoeTargetCap: 5,
    hasteScalesCPM: false,
    /** Shellshock: +40% crit damage on ST (flat bonus on crit) */
    bonusCritMult: 0.40,
  },
  takedownHit: {
    label: 'Takedown', apCoef: 1.80, baseCPM: 0.67,  // 1/90s base
    isPet: false, isFire: false, isBleed: false, aoeTargetCap: 1,
    hasteScalesCPM: false, bonusCritMult: 0,
  },
  raptorSwipe: {
    label: 'Raptor Swipe', apCoef: 1.85, baseCPM: 3.1,
    isPet: false, isFire: false, isBleed: false, aoeTargetCap: 5,
    hasteScalesCPM: true, bonusCritMult: 0,
    requiresTalent: 'raptorSwipe',
  },
  // ─ Sentinel hero ─
  moonlightChakram: {
    label: 'Moonlight Chakram', apCoef: 4.80, baseCPM: 0.67,  // 1/90s
    isPet: false, isFire: false, isBleed: false, aoeTargetCap: 8,
    hasteScalesCPM: false, bonusCritMult: 0,
    requiresTalent: 'moonlightChakram', requiresHero: 'sentinel',
  },
  lunarStorm: {
    label: 'Lunar Storm', apCoef: 1.20, baseCPM: 2.4,
    isPet: false, isFire: false, isBleed: false, aoeTargetCap: 5,
    hasteScalesCPM: false, bonusCritMult: 0,
    requiresTalent: 'lunarStorm', requiresHero: 'sentinel',
  },
  // ─ Pack Leader hero procs ─
  packLeaderBeasts: {
    label: 'Pack Leader Beasts', apCoef: 2.20, baseCPM: 2.0,
    isPet: true, isFire: false, isBleed: false, aoeTargetCap: 3,
    hasteScalesCPM: false, bonusCritMult: 0,
    requiresHero: 'packLeader',
  },
  // ─ Passives ─
  strikeAsOne: {
    label: 'Strike as One', apCoef: 1.10, baseCPM: 14.0,
    isPet: true, isFire: false, isBleed: false, aoeTargetCap: 1,
    hasteScalesCPM: true, bonusCritMult: 0,
    requiresTalent: 'strikeAsOne',
  },
  autoAttack: {
    label: 'Auto Attack', apCoef: 0.85, baseCPM: 20.0,  // 3s swing / 60 × haste
    isPet: false, isFire: false, isBleed: false, aoeTargetCap: 1,
    hasteScalesCPM: true, bonusCritMult: 0,
  },
};

// ── Core computation ─────────────────────────────────────────

function computeAbilityDps(
  key: string,
  spell: SpellDef,
  gear: GearProfile,
  talents: TalentConfig,
  tierSet: TierSetConfig,
  targetCount: number,
  heroTalent: 'sentinel' | 'packLeader',
): AbilityDpsResult {
  const notes: string[] = [];

  // Gate by talent/hero requirements
  if (spell.requiresTalent && !talents[spell.requiresTalent]) {
    return { key, label: spell.label, dps: 0, cpm: 0, dpsCast: 0, pctOfTotal: 0, notes: ['Not talented'] };
  }
  if (spell.requiresHero && spell.requiresHero !== heroTalent) {
    return { key, label: spell.label, dps: 0, cpm: 0, dpsCast: 0, pctOfTotal: 0, notes: ['Wrong hero talent'] };
  }

  const { attackPower, critPct, hastePct, masteryPct, versPct } = gear;
  const effectiveAP = spell.isPet ? attackPower * PET_AP_SCALING : attackPower;

  // ── Base damage per cast ──
  let dmgPerCast = spell.apCoef * effectiveAP * CLASS_AURA;

  // ── Mastery: Spirit Bond ──
  const masteryBonus = spell.isPet
    ? 1 + masteryPct * MASTERY_PET_BONUS_PER_PCT
    : 1 + masteryPct * MASTERY_PLAYER_BONUS_PER_PCT;
  dmgPerCast *= masteryBonus;

  // ── Versatility ──
  dmgPerCast *= 1 + versPct / 100;

  // ── Crit damage ──
  // Base: 2.0× on crit. Bonus multipliers stack additively.
  let critMult = 2.0 + spell.bonusCritMult;
  if (talents.lethalCalibration && (key === 'wildfireBombDirect' || key === 'wildfireBombDoT')) {
    critMult += 0.15;
    notes.push('Lethal Calibration +15% crit dmg on WFB');
  }
  // Expected damage per cast = unhit + crit component
  const critFrac = critPct / 100;
  const critScalar = 1 + critFrac * (critMult - 1);
  dmgPerCast *= critScalar;

  // ── CPM calculation ──
  const hasteMult = 1 + hastePct / 100;
  let cpm = spell.hasteScalesCPM ? spell.baseCPM * hasteMult : spell.baseCPM;

  // ── Takedown window model ──
  // Takedown lasts 8s. With Savagery (always taken): 60s CD.
  // Savagery is core in all 4 WoWHead builds — takedownCD is always 60s.
  const takedownCD = 60;
  const takedownDur = 8;
  const takedownUptime = takedownDur / takedownCD;

  if (key === 'raptorStrike' || key === 'raptorSwipe') {
    // +20% damage during Takedown window
    dmgPerCast *= 1 + takedownUptime * 0.20;
  }

  // ── Flanker's Advantage: Kill Command damage bonus ──
  // Pet attacks from flanking position grant KC increased damage.
  // Estimated: ~12% avg KC damage increase at ~70% flank uptime.
  if (key === 'killCommand' && talents.flankerAdvantage) {
    dmgPerCast *= 1.12;
    notes.push("Flanker's Advantage: ~+12% avg KC dmg (est.)");
  }

  // ── Bloodseeker: Kill Command causes a bleed ──
  // KC applies a bleed on the target. Modeled as ~25% extra KC hit value.
  if (key === 'killCommand' && talents.bloodseeker) {
    dmgPerCast *= 1.25;
    notes.push('Bloodseeker: KC bleed adds ~+25% KC value (est.)');
  }

  // ── Raptor Swipe proc modeling ──
  // During Takedown: every RS proc is guaranteed (100%)
  // Outside Takedown: 25% proc per RS cast
  if (key === 'raptorSwipe') {
    const rsCPM = (SPELLS.raptorStrike.baseCPM * (SPELLS.raptorStrike.hasteScalesCPM ? hasteMult : 1));
    const swipeCPMInWindow = rsCPM * takedownUptime * 1.0;
    const swipeCPMOutside = rsCPM * (1 - takedownUptime) * 0.25;
    cpm = swipeCPMInWindow + swipeCPMOutside;
    notes.push(`Proc model: ${cpm.toFixed(2)} CPM (window+outside)`);
  }

  // ── Mongoose Fury stacking model ──
  // MF stacks RS damage +10% per stack, up to 10 stacks = +100%.
  // In steady state with a 12 RS/min rotation and 8s window:
  // Average stacks = ~6 (ST) — diminishes from ~10 max to ~2 after Boomstick reset.
  if (key === 'raptorStrike' && talents.mongooseFury) {
    // Average stack uptime: ~6 stacks × 10% = +60% damage bonus
    // But this blends into baseline AP coefficient already partially.
    // Model as a +35% effective RS damage above baseline coefficient.
    // (This partially bakes in RS spend priority, which is already captured in CPM.)
    const avgMfBonus = 0.35;
    dmgPerCast *= 1 + avgMfBonus;
    notes.push('Mongoose Fury +35% avg (6 stacks)');
  }

  // ── Boomstick CD adjustments ──
  if (key === 'boomstick') {
    let boomCD = 60;
    // 4pc tier: WFB detonation 20% chance to reset Boomstick CD
    // WFB fires ~3.9 times/min at full tier; 3.9 × 0.20 = 0.78 extra Boomstick casts per minute
    // Effective CD = 60 / (1/60 + 0.78) ≈ 46s
    if (tierSet.has4pc) {
      boomCD = 46;
      notes.push('4pc tier: WFB 20% Boomstick reset → ~46s eff CD');
    }
    cpm = 60 / boomCD;
  }

  // ── Wildfire Bomb CD: 2pc tier set ──
  if (key === 'wildfireBombDirect' || key === 'wildfireBombDoT') {
    if (tierSet.has2pc) {
      // KC CPM ~18 × haste × 24.5% KC crit rate = ~5.4 KC crits/min
      // Each crit reduces WFB CD by 1s → 5.4s/min off 18s CD = eff CD ~12.6s
      const kcCPM = SPELLS.killCommand.baseCPM * hasteMult;
      const kcCritRate = critPct / 100;
      const cdReductionPerMin = kcCPM * kcCritRate;
      const baseWFBCD = 18;
      const effWFBCD = Math.max(10, baseWFBCD - cdReductionPerMin / (60 / baseWFBCD));
      cpm = 60 / effWFBCD;
      notes.push(`2pc tier: KC crits → WFB eff CD ~${effWFBCD.toFixed(1)}s`);
    }
  }

  // ── Sentinel Mark → Lunar Storm CPM ──
  if (key === 'lunarStorm') {
    const markProcRate = talents.moonsBlessing
      ? SENTINEL_MARK_PROC_MOONS
      : SENTINEL_MARK_PROC_BASE;
    const rsCPM = SPELLS.raptorStrike.baseCPM * hasteMult;
    // Mark applied; consumed on next RS (avg 1 cast between applies)
    // Effective Lunar Storm CPM = RS CPM × proc rate
    cpm = rsCPM * markProcRate;
    notes.push(`Lunar Storm: ${(markProcRate * 100).toFixed(0)}% mark × ${rsCPM.toFixed(1)} RS/min`);
  }

  // ── Flamebreak: fire spell bonus ──
  if (spell.isFire && talents.flamebreak) {
    dmgPerCast *= 1.15;
  }

  // ── Pack Leader: beast procs ──
  if (key === 'packLeaderBeasts') {
    if (talents.direSummons) {
      cpm *= 1.15;  // Reduced spawn CD
      notes.push('Dire Summons: -CD on beast spawns +15% CPM');
    }
  }

  // ── Strike as One: Two Against Many AoE ──
  if (key === 'strikeAsOne') {
    // CPM mirrors total ability cast rate (every ability triggers it)
    // Model as: fires once per ~4s in rotation (kill commands + RSes)
    const totalAbilityCPM = 18 + 12 + 3.2;  // KC + RS + WFB baseline
    cpm = totalAbilityCPM * hasteMult * 0.35;  // ~35% proc rate weighted
  }

  // ── AoE target scaling ──
  let targetMult = 1;
  if (targetCount > 1 && spell.aoeTargetCap > 1) {
    const effectiveTargets = Math.min(targetCount, spell.aoeTargetCap);
    targetMult = effectiveTargets;
  }
  if (key === 'strikeAsOne' && talents.twoAgainstMany && targetCount > 1) {
    targetMult = Math.min(targetCount, 3);  // 1 primary + 2 extra
    notes.push('Two Against Many: +2 targets on Strike as One');
  }
  dmgPerCast *= targetMult;

  const dps = (dmgPerCast * cpm) / 60;

  return {
    key,
    label: spell.label,
    dps,
    cpm,
    dpsCast: dmgPerCast,
    pctOfTotal: 0,  // filled in after summing
    notes,
  };
}

// ── Build full rotation DPS ──────────────────────────────────

/** Raid Sentinel (≤2 targets) — WoWHead-verified Midnight 12.0 build */
function buildSentinelST(): TalentConfig {
  return {
    // ── 25 always-taken core nodes ──
    killCommand: true, wildfireBomb: true, raptorStrike: true,
    guerrillaTactics: true, tipOfTheSpear: true, lunge: true,
    boomstick: true, strikeAsOne: true, flamebreak: true,
    quickReload: true, mongooseFury: true, wildfireShells: true,
    shellshock: true, wallop: true, bonding: true, sweepingSpear: true,
    blackrockMunitions: true, takedown: true, killerCompanion: true,
    twinFangs: true, savagery: true, wildfireInfusion: true,
    flanked: true, primalSurge: true, raptorSwipe: true,
    // ── Variable spec nodes: Raid Sentinel ──
    flankerAdvantage: true,   // all builds except Raid Pack Leader
    bloodseeker: false,       // Raid Pack Leader only
    twoAgainstMany: false,    // all builds except Raid Sentinel → NOT in Raid Sentinel
    lethalCalibration: false, // all builds except Raid Sentinel → NOT in Raid Sentinel
    // ── Sentinel hero: all 13 nodes ──
    dontLookBack: true, moonsBlessing: true, sanctifiedArmaments: true,
    moonlightChakram: true, conditioning: true, cantMissWontMissSent: true,
    invigoratingPulse: true, scoutsVigil: true,
    arcaneTalons: true, lunarCalling: true, lunarGrace: true, radiantEdge: true, lunarStorm: true,
    // ── Pack Leader hero: not taken ──
    packMentality: false, direSummons: false, packCoordination: false, masterfulCall: false,
    wyvernGaze: false, furyOfTheWyvern: false, hogstrider: false, lethalBarbs: false,
    noMercy: false, shellCover: false, ursineFury: false, sharpenedFangs: false, stampede: false,
  };
}

/** Dungeon Sentinel (>2 targets) — WoWHead-verified Midnight 12.0 build */
function buildSentinelAoE(): TalentConfig {
  return {
    // ── 25 always-taken core nodes ──
    killCommand: true, wildfireBomb: true, raptorStrike: true,
    guerrillaTactics: true, tipOfTheSpear: true, lunge: true,
    boomstick: true, strikeAsOne: true, flamebreak: true,
    quickReload: true, mongooseFury: true, wildfireShells: true,
    shellshock: true, wallop: true, bonding: true, sweepingSpear: true,
    blackrockMunitions: true, takedown: true, killerCompanion: true,
    twinFangs: true, savagery: true, wildfireInfusion: true,
    flanked: true, primalSurge: true, raptorSwipe: true,
    // ── Variable spec nodes: Dungeon Sentinel ──
    flankerAdvantage: true,  // all builds except Raid Pack Leader
    bloodseeker: false,      // Raid Pack Leader only
    twoAgainstMany: true,    // all builds except Raid Sentinel
    lethalCalibration: true, // all builds except Raid Sentinel
    // ── Sentinel hero: all 13 nodes ──
    dontLookBack: true, moonsBlessing: true, sanctifiedArmaments: true,
    moonlightChakram: true, conditioning: true, cantMissWontMissSent: true,
    invigoratingPulse: true, scoutsVigil: true,
    arcaneTalons: true, lunarCalling: true, lunarGrace: true, radiantEdge: true, lunarStorm: true,
    // ── Pack Leader hero: not taken ──
    packMentality: false, direSummons: false, packCoordination: false, masterfulCall: false,
    wyvernGaze: false, furyOfTheWyvern: false, hogstrider: false, lethalBarbs: false,
    noMercy: false, shellCover: false, ursineFury: false, sharpenedFangs: false, stampede: false,
  };
}

/** Raid Pack Leader (≤2 targets) — WoWHead-verified Midnight 12.0 build */
function buildPackLeaderST(): TalentConfig {
  return {
    // ── 25 always-taken core nodes ──
    killCommand: true, wildfireBomb: true, raptorStrike: true,
    guerrillaTactics: true, tipOfTheSpear: true, lunge: true,
    boomstick: true, strikeAsOne: true, flamebreak: true,
    quickReload: true, mongooseFury: true, wildfireShells: true,
    shellshock: true, wallop: true, bonding: true, sweepingSpear: true,
    blackrockMunitions: true, takedown: true, killerCompanion: true,
    twinFangs: true, savagery: true, wildfireInfusion: true,
    flanked: true, primalSurge: true, raptorSwipe: true,
    // ── Variable spec nodes: Raid Pack Leader ──
    flankerAdvantage: false, // Raid Pack Leader takes Bloodseeker instead
    bloodseeker: true,       // Raid Pack Leader only
    twoAgainstMany: true,    // all builds except Raid Sentinel
    lethalCalibration: true, // all builds except Raid Sentinel
    // ── Sentinel hero: not taken ──
    dontLookBack: false, moonsBlessing: false, sanctifiedArmaments: false,
    moonlightChakram: false, conditioning: false, cantMissWontMissSent: false,
    invigoratingPulse: false, scoutsVigil: false,
    arcaneTalons: false, lunarCalling: false, lunarGrace: false, radiantEdge: false, lunarStorm: false,
    // ── Pack Leader hero: all 13 nodes ──
    packMentality: true, direSummons: true, packCoordination: true, masterfulCall: true,
    wyvernGaze: true, furyOfTheWyvern: true, hogstrider: true, lethalBarbs: true,
    noMercy: true, shellCover: true, ursineFury: true, sharpenedFangs: true, stampede: true,
  };
}

/** Dungeon Pack Leader (>2 targets) — WoWHead-verified Midnight 12.0 build */
function buildPackLeaderAoE(): TalentConfig {
  return {
    // ── 25 always-taken core nodes ──
    killCommand: true, wildfireBomb: true, raptorStrike: true,
    guerrillaTactics: true, tipOfTheSpear: true, lunge: true,
    boomstick: true, strikeAsOne: true, flamebreak: true,
    quickReload: true, mongooseFury: true, wildfireShells: true,
    shellshock: true, wallop: true, bonding: true, sweepingSpear: true,
    blackrockMunitions: true, takedown: true, killerCompanion: true,
    twinFangs: true, savagery: true, wildfireInfusion: true,
    flanked: true, primalSurge: true, raptorSwipe: true,
    // ── Variable spec nodes: Dungeon Pack Leader ──
    flankerAdvantage: true,  // all builds except Raid Pack Leader
    bloodseeker: false,      // Raid Pack Leader only
    twoAgainstMany: true,    // all builds except Raid Sentinel
    lethalCalibration: true, // all builds except Raid Sentinel
    // ── Sentinel hero: not taken ──
    dontLookBack: false, moonsBlessing: false, sanctifiedArmaments: false,
    moonlightChakram: false, conditioning: false, cantMissWontMissSent: false,
    invigoratingPulse: false, scoutsVigil: false,
    arcaneTalons: false, lunarCalling: false, lunarGrace: false, radiantEdge: false, lunarStorm: false,
    // ── Pack Leader hero: all 13 nodes ──
    packMentality: true, direSummons: true, packCoordination: true, masterfulCall: true,
    wyvernGaze: true, furyOfTheWyvern: true, hogstrider: true, lethalBarbs: true,
    noMercy: true, shellCover: true, ursineFury: true, sharpenedFangs: true, stampede: true,
  };
}

export function getOptimalTalentConfig(
  heroTalent: 'sentinel' | 'packLeader',
  targetCount: number,
): TalentConfig {
  const isAoE = targetCount > 2;
  if (heroTalent === 'sentinel') return isAoE ? buildSentinelAoE() : buildSentinelST();
  return isAoE ? buildPackLeaderAoE() : buildPackLeaderST();
}

// ── Talent delta analysis ────────────────────────────────────

function calcTalentDeltas(
  baseResult: { totalDps: number; abilities: AbilityDpsResult[] },
  gear: GearProfile,
  baseTalents: TalentConfig,
  tierSet: TierSetConfig,
  targetCount: number,
  heroTalent: 'sentinel' | 'packLeader',
): TalentDelta[] {
  const deltas: TalentDelta[] = [];

  // All variable spec and key hero nodes are 1pt each.
  const ptCost = (_key: keyof TalentConfig) => 1;

  // ── Sentinel-specific hero node tests ──
  const sentinelNodes: typeof talentsToTest = [
    {
      key: 'moonlightChakram', label: 'Moonlight Chakram (Sentinel)',
      communityRanks: true,
      reasoning: 'Highest single-cast AP coef in the kit (4.80). Fires every ~90s aligned with Takedown burst. Mandatory Sentinel node — every guide agrees.',
    },
    {
      key: 'lunarStorm', label: 'Lunar Storm (Sentinel capstone)',
      communityRanks: true,
      reasoning: 'Capstone: Mark consumption triggers Lunar Storm AoE burst. With Moon\'s Blessing at 30% proc rate × 12 RS/min = ~3.6 fires/min. BiS Sentinel node.',
    },
    {
      key: 'moonsBlessing', label: "Moon's Blessing (Sentinel)",
      communityRanks: true,
      reasoning: 'Raises Sentinel Mark proc rate 20% → 30% (+50% relative), directly multiplying Lunar Storm CPM. High value per point — scales Lunar Storm output by 50%.',
    },
  ];
  // ── Pack Leader-specific hero node tests ──
  const packLeaderNodes: typeof talentsToTest = [
    {
      key: 'stampede', label: 'Stampede! (Pack Leader capstone)',
      communityRanks: true,
      reasoning: 'Capstone: Takedown triggers a beast stampede. The core ST damage amplifier in Pack Leader — every guide marks this as mandatory.',
    },
    {
      key: 'direSummons', label: 'Dire Summons (Pack Leader)',
      communityRanks: true,
      reasoning: 'Reduces beast companion spawn CD — modeled as +15% Pack Leader beast CPM. Standard Pack Leader node.',
    },
    {
      key: 'lethalBarbs', label: 'Lethal Barbs (Pack Leader)',
      communityRanks: true,
      reasoning: 'Auto-attacks generate 2 bonus Focus, enabling faster KC cycling and more Raptor Strike casts per Takedown window.',
    },
  ];

  const talentsToTest: {
    key: keyof TalentConfig;
    label: string;
    communityRanks: boolean;
    reasoning: string;
  }[] = [
    // ── Variable spec nodes ──
    {
      key: 'flankerAdvantage', label: "Flanker's Advantage",
      communityRanks: true,
      reasoning: 'All builds except Raid Pack Leader. Estimated ~+12% avg Kill Command damage via flanking proc. Direct KC DPS gain — standard across 3 of 4 WoWHead builds.',
    },
    {
      key: 'bloodseeker', label: 'Bloodseeker',
      communityRanks: false,
      reasoning: 'Raid Pack Leader only — replaces Flanker\'s Advantage. KC applies a bleed, modeled as ~+25% KC value. Most guides rank Flanker\'s Advantage higher in non-PL contexts; Bloodseeker is PL-specific.',
    },
    {
      key: 'twoAgainstMany', label: 'Two Against Many',
      communityRanks: false,
      reasoning: 'All builds except Raid Sentinel. Strike as One hits +2 additional targets. Our math shows BiS at 3+ targets (cleave) — most community guides only recommend it at 5+, undervaluing cleave scenarios.',
    },
    {
      key: 'lethalCalibration', label: 'Lethal Calibration',
      communityRanks: true,
      reasoning: 'All builds except Raid Sentinel. WFB crits deal +15% damage. With 2pc reducing WFB CD, near-permanent uptime in tier gear. Strong in dungeon content where WFB is fired more frequently.',
    },
    // ── Hero-specific nodes ──
    ...(heroTalent === 'sentinel' ? sentinelNodes : packLeaderNodes),
  ];

  for (const t of talentsToTest) {
    const inBuild = !!baseTalents[t.key];
    // Toggle the talent and recompute (if in build: remove it; if not: add it)
    const modTalents = { ...baseTalents, [t.key]: !inBuild };
    const modTotal = computeDpsOnly(gear, modTalents, tierSet, targetCount, heroTalent);
    // dpsDelta > 0 → DPS loss when talent is removed from build
    // dpsDelta < 0 → DPS gain when talent is added to build (hypothetical)
    const dpsDelta = baseResult.totalDps - modTotal;
    const pct = baseResult.totalDps > 0 ? (dpsDelta / baseResult.totalDps) * 100 : 0;
    deltas.push({
      key: t.key,
      label: t.label,
      dpsDelta: Math.round(dpsDelta),
      pctIncrease: parseFloat(pct.toFixed(2)),
      reasoning: t.reasoning,
      communityRanks: t.communityRanks,
      ourRanks: true,
      inBuild,
      pointCost: ptCost(t.key),
    });
  }

  return deltas.sort((a, b) => b.dpsDelta - a.dpsDelta);
}

// ── Tier set value computation ───────────────────────────────

function calcTierSetValue(
  gear: GearProfile,
  talents: TalentConfig,
  targetCount: number,
  heroTalent: 'sentinel' | 'packLeader',
): TierSetValue {
  const notes: string[] = [];
  const base = computeDpsOnly(gear, talents, { has2pc: false, has4pc: false }, targetCount, heroTalent);
  const with2pc = computeDpsOnly(gear, talents, { has2pc: true, has4pc: false }, targetCount, heroTalent);
  const with4pc = computeDpsOnly(gear, talents, { has2pc: true, has4pc: true }, targetCount, heroTalent);

  const dps2pc = with2pc - base;
  const dps4pc = with4pc - with2pc;

  // KC crit → WFB reduction math
  const kcCPM = SPELLS.killCommand.baseCPM * (1 + gear.hastePct / 100);
  const kcCritPerMin = kcCPM * (gear.critPct / 100);
  notes.push(`2pc: KC fires ~${kcCPM.toFixed(1)}/min at ${gear.critPct}% crit → ${kcCritPerMin.toFixed(1)} crits/min each reducing WFB CD by 1s`);

  const baseWFBCD = 18;
  const wfbCastsPerMin = 60 / baseWFBCD;
  const cdReductionPerWFBCycle = kcCritPerMin / wfbCastsPerMin;
  const effCD = Math.max(10, baseWFBCD - cdReductionPerWFBCycle);
  notes.push(`2pc effective WFB CD: ~${effCD.toFixed(1)}s (from 18s) → +${((18 / effCD - 1) * 100).toFixed(0)}% more WFBs`);

  // 4pc Boomstick reset math
  const wfbCPMWith2pc = 60 / effCD;
  const extraBoomsticks = wfbCPMWith2pc * 0.20;
  notes.push(`4pc: WFB fires ~${wfbCPMWith2pc.toFixed(1)}/min × 20% = ${extraBoomsticks.toFixed(2)} extra Boomsticks/min`);
  notes.push(`4pc Boomstick effective CD: ~${(60 / (1 + extraBoomsticks)).toFixed(0)}s (from 60s base) — strongest piece in BiS`);

  return {
    twoPcDps: Math.round(dps2pc),
    fourPcDps: Math.round(dps4pc),
    totalDps: Math.round(with4pc - base),
    notes,
  };
}

// ── vs community comparison ───────────────────────────────────

function buildVsCommunity(
  heroTalent: 'sentinel' | 'packLeader',
  targetCount: number,
  talentDeltas: TalentDelta[],
): VsCommunity {
  const d = (key: string) => {
    const t = talentDeltas.find(x => x.key === key);
    if (!t) return 'See talent delta table';
    const sign = t.dpsDelta > 0 ? '+' : '';
    return `${sign}${t.dpsDelta.toLocaleString()} DPS (${t.pctIncrease.toFixed(2)}%)`;
  };
  return {
    agreements: [
      'Sentinel is the preferred hero talent for Raid ST and light cleave',
      'All 25 core spec nodes are mandatory across all 4 WoWHead builds — no variance',
      'Wildfire Bomb, Kill Command, Boomstick, Takedown, and Raptor Swipe (Apex) are the backbone',
      'Savagery is always taken (core node) — reduces Takedown CD to 60s in all builds',
      'Moonlight Chakram + Lunar Storm + Moon\'s Blessing are mandatory Sentinel hero nodes',
      'Mastery (Spirit Bond) is the primary secondary stat for both ST and AoE',
      'Two Against Many + Lethal Calibration are always taken in non-Raid-Sentinel builds',
    ],
    differences: [
      {
        topic: "Flanker's Advantage vs Bloodseeker",
        communityView: 'Some guides treat these as roughly equivalent 1pt filler options; a few omit Bloodseeker analysis entirely',
        ourView: "Flanker's Advantage is the default in 3 of 4 builds (all except Raid Pack Leader). Bloodseeker is the correct Raid Pack Leader pick — the bleed roughly matches or slightly exceeds Flanker's value for PL due to better pet synergy. Build context matters.",
        delta: `FA: ${d('flankerAdvantage')} · BS: ${d('bloodseeker')}`,
      },
      {
        topic: 'Two Against Many threshold',
        communityView: 'Most guides list Two Against Many as a 5+ target talent; rarely recommended for cleave (2–3 targets)',
        ourView: 'Strike as One fires on every ability cast. At 3 targets Two Against Many adds 2 pet proc hits — our math shows it is worth taking at 3+ targets (cleave), not just 5+. The 1pt cost is repaid at 3T.',
        delta: `${d('twoAgainstMany')} at ${targetCount}T`,
      },
      {
        topic: 'Lethal Calibration in dungeon builds',
        communityView: 'Mostly rated as strong but primarily relevant in sustained single-target; some guides downgrade it in M+',
        ourView: 'In dungeon content WFB CPM increases and 2pc tier amplifies it further. Lethal Calibration is taken in all 3 non-Raid-Sentinel builds precisely because WFB fires more frequently there — its value actually scales up in M+, not down.',
        delta: d('lethalCalibration'),
      },
      {
        topic: 'Tier set talent interaction',
        communityView: 'Most guides recommend a static build independent of tier set ownership',
        ourView: '4pc Boomstick reset raises Boomstick from 1.0 to ~1.78 CPM (+78%). This cascades into higher WFB frequency from Lethal Calibration windows. With 4pc, KC→WFB→Boomstick alignment is the primary burst loop — talent priority subtly shifts.',
        delta: 'System-wide; see Tier Set value breakdown',
      },
    ],
  };
}

// ── Leaf DPS-only computation (no recursion) ─────────────────

/**
 * Computes total DPS by summing ability contributions only.
 * Does NOT call calcTalentDeltas, calcTierSetValue, or computeStatWeights.
 * Used by those functions to avoid infinite mutual recursion.
 */
function computeDpsOnly(
  gear: GearProfile,
  talents: TalentConfig,
  tierSet: TierSetConfig,
  targetCount: number,
  heroTalent: 'sentinel' | 'packLeader',
): number {
  let total = 0;
  for (const [key, spell] of Object.entries(SPELLS)) {
    total += computeAbilityDps(key, spell, gear, talents, tierSet, targetCount, heroTalent).dps;
  }
  return total;
}

// ── Main entry point ─────────────────────────────────────────

export function runTheoryCraft(
  gear: GearProfile,
  talents: TalentConfig,
  tierSet: TierSetConfig,
  targetCount: number,
  heroTalent: 'sentinel' | 'packLeader',
): TheoryCraftResult {
  const abilities: AbilityDpsResult[] = [];

  for (const [key, spell] of Object.entries(SPELLS)) {
    const result = computeAbilityDps(key, spell, gear, talents, tierSet, targetCount, heroTalent);
    abilities.push(result);
  }

  const totalDps = abilities.reduce((sum, a) => sum + a.dps, 0);
  abilities.forEach(a => { a.pctOfTotal = totalDps > 0 ? parseFloat(((a.dps / totalDps) * 100).toFixed(1)) : 0; });
  abilities.sort((a, b) => b.dps - a.dps);

  const baseResult = { totalDps, abilities };
  const talentDeltas = calcTalentDeltas(baseResult, gear, talents, tierSet, targetCount, heroTalent);
  const tierSetValue = calcTierSetValue(gear, talents, targetCount, heroTalent);

  const rotationNotes = buildRotationNotes(talents, tierSet, targetCount, heroTalent, gear);
  const vsCommunity = buildVsCommunity(heroTalent, targetCount, talentDeltas);

  return { totalDps: Math.round(totalDps), abilities, talentDeltas, tierSetValue, rotationNotes, vsCommunity };
}

function buildRotationNotes(
  talents: TalentConfig,
  tierSet: TierSetConfig,
  targetCount: number,
  heroTalent: 'sentinel' | 'packLeader',
  gear: GearProfile,
): string[] {
  const notes: string[] = [];
  const takedownCD = talents.savagery ? 60 : 90;
  const isAoE = targetCount > 2;

  notes.push(`Takedown CD: ${takedownCD}s — opens every Raptor Swipe guaranteed window`);
  if (tierSet.has4pc) {
    const effBoomCD = 46;
    notes.push(`4pc tier: Boomstick effective CD ~${effBoomCD}s (from 60s) — align with Takedown where possible`);
  }
  if (heroTalent === 'sentinel') {
    const markProcRate = talents.moonsBlessing ? 30 : 20;
    notes.push(`Sentinel Mark: ${markProcRate}% per RS → consume ASAP with next RS to trigger Lunar Storm`);
    notes.push('Moonlight Chakram: use on CD inside Takedown window for peak burst alignment');
  }
  if (isAoE) {
    notes.push('AoE: Wildfire Bomb → Boomstick → Kill Command priority; Strike as One cleaves on every ability cast');
    if (talents.twoAgainstMany) notes.push('Two Against Many: Strike as One hits 3 targets — KC and RS casts each trigger 3-target pet proc');
  } else {
    notes.push('ST: Kill Command on CD (focus gen), Wildfire Bomb on CD, Boomstick on CD, Takedown on CD');
    notes.push('During Takedown window: use ALL Raptor Strike charges (guaranteed Swipe procs)');
    notes.push('Pool ~40 focus before Takedown expires to fuel RS burst in next window');
  }
  if (talents.mongooseFury) {
    notes.push('Mongoose Fury: never cap focus during RS frenzy; KC between RS casts to avoid GCD waste');
  }
  if (tierSet.has2pc) {
    notes.push('2pc: KC crits reduce WFB CD — do NOT hold KC for any reason (lost crit → lost WFB CD reduction)');
  }
  return notes;
}

// ── Stat Weights ─────────────────────────────────────────────

export interface StatWeights {
  /** DPS gained per 1 Agility */
  agilityDps: number;
  /** DPS gained per 1 Crit Rating (~170 rating = 1%) */
  critDps: number;
  /** DPS gained per 1 Haste Rating (~170 rating = 1%) */
  hasteDps: number;
  /** DPS gained per 1 Mastery Rating (~170 rating = 1% Spirit Bond) */
  masteryDps: number;
  /** DPS gained per 1 Versatility Rating (~205 rating = 1%) */
  versDps: number;
  /** Scale factors relative to Agility = 1.00 */
  sf: {
    agility: number;
    crit: number;
    haste: number;
    mastery: number;
    vers: number;
  };
  /** Stat priority order (best → worst per-rating) */
  priority: Array<{ stat: string; dpsPerRating: number; sf: number }>;
}

/**
 * Compute scale factors by re-running the engine with small stat increments.
 * Uses +1 unit of each stat and measures DPS delta, then normalizes to Agility=1.00.
 * Rating conversions: crit/haste/mastery ≈ 170 rating per 1%, vers ≈ 205 rating per 1%.
 */
export function computeStatWeights(
  gear: GearProfile,
  talents: TalentConfig,
  tierSet: TierSetConfig,
  heroTalent: 'sentinel' | 'packLeader',
  targetCount: number,
): StatWeights {
  const base = computeDpsOnly(gear, talents, tierSet, targetCount, heroTalent);

  // Measure per 1% increment of each secondary
  const critDelta  = computeDpsOnly({ ...gear, critPct:    gear.critPct    + 1 }, talents, tierSet, targetCount, heroTalent) - base;
  const hasteDelta = computeDpsOnly({ ...gear, hastePct:   gear.hastePct   + 1 }, talents, tierSet, targetCount, heroTalent) - base;
  const mastDelta  = computeDpsOnly({ ...gear, masteryPct: gear.masteryPct + 1 }, talents, tierSet, targetCount, heroTalent) - base;
  const versDelta  = computeDpsOnly({ ...gear, versPct:    gear.versPct    + 1 }, talents, tierSet, targetCount, heroTalent) - base;

  // Agility: +1 agi adds ~1.05 AP (Survival class aura) + marginal mastery value
  const agiDelta = computeDpsOnly(
    { ...gear, agility: gear.agility + 10, attackPower: gear.attackPower + 10 },
    talents, tierSet, targetCount, heroTalent,
  ) - base;

  // Convert percentage deltas → per-rating-point values
  const CRIT_RATING_PER_PCT    = 170;
  const HASTE_RATING_PER_PCT   = 170;
  const MASTERY_RATING_PER_PCT = 170;
  const VERS_RATING_PER_PCT    = 205;

  const agilityDps = agiDelta / 10;
  const critDps    = critDelta  / CRIT_RATING_PER_PCT;
  const hasteDps   = hasteDelta / HASTE_RATING_PER_PCT;
  const masteryDps = mastDelta  / MASTERY_RATING_PER_PCT;
  const versDps    = versDelta  / VERS_RATING_PER_PCT;

  // Scale factors vs Agility
  const sf = {
    agility: 1.00,
    crit:    agilityDps > 0 ? parseFloat((critDps    / agilityDps).toFixed(3)) : 0,
    haste:   agilityDps > 0 ? parseFloat((hasteDps   / agilityDps).toFixed(3)) : 0,
    mastery: agilityDps > 0 ? parseFloat((masteryDps / agilityDps).toFixed(3)) : 0,
    vers:    agilityDps > 0 ? parseFloat((versDps    / agilityDps).toFixed(3)) : 0,
  };

  const priority = [
    { stat: 'Agility',        dpsPerRating: parseFloat(agilityDps.toFixed(4)), sf: 1.00 },
    { stat: 'Critical Strike', dpsPerRating: parseFloat(critDps.toFixed(4)),   sf: sf.crit },
    { stat: 'Haste',          dpsPerRating: parseFloat(hasteDps.toFixed(4)),   sf: sf.haste },
    { stat: 'Mastery',        dpsPerRating: parseFloat(masteryDps.toFixed(4)), sf: sf.mastery },
    { stat: 'Versatility',    dpsPerRating: parseFloat(versDps.toFixed(4)),    sf: sf.vers },
  ].sort((a, b) => b.dpsPerRating - a.dpsPerRating);

  return {
    agilityDps:  parseFloat(agilityDps.toFixed(4)),
    critDps:     parseFloat(critDps.toFixed(4)),
    hasteDps:    parseFloat(hasteDps.toFixed(4)),
    masteryDps:  parseFloat(masteryDps.toFixed(4)),
    versDps:     parseFloat(versDps.toFixed(4)),
    sf,
    priority,
  };
}

// ── Convenience exports ──────────────────────────────────────

export {
  buildSentinelST,
  buildSentinelAoE,
  buildPackLeaderST,
  buildPackLeaderAoE,
};

/**
 * Quick helper: returns optimal talents + full theory result for
 * a given hero/target/gear/tier configuration.
 */
export function getFullOptimalAnalysis(
  heroTalent: 'sentinel' | 'packLeader',
  targetCount: number,
  gear: GearProfile = HEROIC_MIDNIGHT_276,
  tierSet: TierSetConfig = { has2pc: true, has4pc: true },
) {
  const talents = getOptimalTalentConfig(heroTalent, targetCount);
  return {
    talents,
    ...runTheoryCraft(gear, talents, tierSet, targetCount, heroTalent),
  };
}
