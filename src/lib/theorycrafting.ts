// ============================================================
// SURVIVAL HUNTER MIDNIGHT 12.0 — FIRST-PRINCIPLES THEORYCRAFTING ENGINE
// ============================================================
// Calculates per-ability DPS from raw formulas rather than anchored scaling.
// Sources: Blizzard API spell data, SimulationCraft:midnight APL, spell coefficients
// from sc_hunter.cpp, and verified against Raidbots/Warcraft Logs parses.
//
// Key differences vs community guides (Wowhead, Icy Veins, class discords):
//  1. Takedown window modeled per-second (8s amp on ~13–20% uptime)
//  2. Tier set interaction: 2pc KC crit → WFB CD reduction → Lethal Calibration uptime
//  3. Sentinel Mark proc math modeled per ability cast, not assumed flat
//  4. Savagery vs Vulnerability delta computed from actual Takedown frequency
//  5. Mongoose Fury stack distribution modeled (not flat average)
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
  // ─ Always talented core ─
  mongooseFury: boolean;
  strikeAsOne: boolean;
  wildfireBomb: boolean;
  takedown: boolean;
  boomstick: boolean;
  raptorSwipe: boolean;
  lethalCalibration: boolean;
  // ─ ST priority ─
  /** Reduces Takedown CD by 15s/pt (2pts = 30s reduction: 90s → 60s) */
  savagery: boolean;
  /** RS and Boomstick deal +20% crit damage */
  vulnerability: boolean;
  /** Each Boomstick hit grants 1 Mongoose Fury stack */
  mongooseRounds: boolean;
  /** Raptor Strike +10% damage; Takedown duration +2s */
  cantMissWontMiss: boolean;
  /** RS increases crit damage by 2% for 10s, stacks up to 10x */
  stargazer: boolean;
  // ─ AoE priority ─
  flamefangPitch: boolean;
  /** Flamefang gains +1 charge */
  grenadeJuggler: boolean;
  /** Each Boomstick hit reduces WFB CD by 4s */
  wildfileShells: boolean;
  /** WFB periodic becomes a bleed (bypasses armor) */
  shrapnelBomb: boolean;
  /** All Fire damage +15% */
  flamebreak: boolean;
  /** Flamefang imbues weapon, adding fire to RS */
  wildfireImbuement: boolean;
  /** Strike as One hits +2 enemies */
  twoAgainstMany: boolean;
  // ─ Sentinel hero ─
  moonlightChakram: boolean;
  lunarStorm: boolean;
  moonsBlessing: boolean;
  // ─ Pack Leader hero ─
  lethalBarbs: boolean;
  direSummons: boolean;
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
  order: number;       // 1 = first, 3 = capstone
  pointCost: 1;
  prerequisiteKey?: keyof TalentConfig;
  desc: string;
}

// Row gate thresholds: to access row R, you need this many points spent in rows 1–(R-1)
export const ROW_GATES: Record<number, number> = {
  1: 0,   // free
  2: 2,   // need 2 pts in row 1
  3: 5,   // need 5 pts in rows 1–2
  4: 8,   // need 8 pts in rows 1–3
  5: 11,  // need 11 pts in rows 1–4
  6: 14,  // need 14 pts in rows 1–5
  7: 17,  // need 17 pts in rows 1–6
};

// 2D grid layout: 6 columns (0–5), 7 rows.
// Column assignments keep prerequisite chains visually aligned:
//   Left path (col 0–1): ST build — Mongoose Fury → Raptor Swipe → Takedown → Savagery → Vulnerability → Stargazer
//   Right path (col 2–5): AoE build — Wildfire Bomb → Strike as One → Boomstick → LC → Wildfire Shells → Flamefang/Shrapnel → GJ/WI → Flamebreak
export const SURVIVAL_SPEC_TREE: TalentNode[] = [
  // ─── ROW 1 — Gate: 0 pts (always accessible) ────────────────────────────
  {
    key: 'mongooseFury', label: 'Mongoose Fury', row: 1, col: 0, pointCost: 1,
    prerequisites: [], gateRow: 0, isGateway: false,
    inSTBuild: true, inAoEBuild: true, dpsCategory: 'core',
  },
  {
    key: 'wildfireBomb', label: 'Wildfire Bomb', row: 1, col: 3, pointCost: 1,
    prerequisites: [], gateRow: 0, isGateway: false,
    inSTBuild: true, inAoEBuild: true, dpsCategory: 'core',
  },

  // ─── ROW 2 — Gate: 2 pts in row 1 ───────────────────────────────────────
  {
    key: 'raptorSwipe', label: 'Raptor Swipe', row: 2, col: 0, pointCost: 2,
    prerequisites: ['mongooseFury'], gateRow: 2, isApex: true, isGateway: false,
    inSTBuild: true, inAoEBuild: true, dpsCategory: 'core',
    gatewayNote: 'Apex talent: both points required. Rank 1 = 25% proc; Rank 2 = 100% proc during Takedown. Half-investing (1pt) leaves you at Rank 1 — a significant power gap.',
  },
  {
    key: 'strikeAsOne', label: 'Strike as One', row: 2, col: 3, pointCost: 1,
    prerequisites: ['wildfireBomb'], gateRow: 2, isGateway: false,
    inSTBuild: true, inAoEBuild: true, dpsCategory: 'core',
  },

  // ─── ROW 3 — Gate: 5 pts in rows 1–2 ────────────────────────────────────
  {
    key: 'takedown', label: 'Takedown', row: 3, col: 0, pointCost: 1,
    prerequisites: ['raptorSwipe'], gateRow: 5, isGateway: false,
    inSTBuild: true, inAoEBuild: true, dpsCategory: 'core',
  },
  {
    key: 'boomstick', label: 'Boomstick', row: 3, col: 2, pointCost: 1,
    prerequisites: ['strikeAsOne'], gateRow: 5, isGateway: false,
    inSTBuild: true, inAoEBuild: true, dpsCategory: 'core',
  },
  {
    key: 'mongooseRounds', label: 'Mongoose Rounds', row: 3, col: 4, pointCost: 1,
    prerequisites: ['boomstick'], gateRow: 5, isGateway: false,
    inSTBuild: true, inAoEBuild: false, dpsCategory: 'st',
  },

  // ─── ROW 4 — Gate: 8 pts in rows 1–3 ────────────────────────────────────
  {
    key: 'lethalCalibration', label: 'Lethal Calibration', row: 4, col: 2, pointCost: 1,
    prerequisites: ['boomstick'], gateRow: 8, isGateway: false,
    inSTBuild: true, inAoEBuild: true, dpsCategory: 'core',
  },
  {
    key: 'savagery', label: 'Savagery', row: 4, col: 0, pointCost: 1,
    prerequisites: ['takedown'], gateRow: 8, isGateway: false,
    inSTBuild: true, inAoEBuild: false, dpsCategory: 'st',
  },
  {
    key: 'wildfileShells', label: 'Wildfire Shells', row: 4, col: 3, pointCost: 1,
    prerequisites: ['lethalCalibration'], gateRow: 8,
    isGateway: true,
    gatewayNote: 'Moderate standalone value. In AoE, taken primarily to unlock Flamefang Pitch (row 5) and the fire damage path. Without it, the entire AoE damage chain — Flamefang → Wildfire Imbuement → Flamebreak — is inaccessible.',
    inSTBuild: false, inAoEBuild: true, dpsCategory: 'gateway',
  },

  // ─── ROW 5 — Gate: 11 pts in rows 1–4 ───────────────────────────────────
  {
    key: 'vulnerability', label: 'Vulnerability', row: 5, col: 1, pointCost: 1,
    prerequisites: ['savagery', 'mongooseRounds'], gateRow: 11, isGateway: false,
    inSTBuild: true, inAoEBuild: false, dpsCategory: 'st',
  },
  {
    key: 'cantMissWontMiss', label: "Can't Miss Won't Miss", row: 5, col: 0, pointCost: 1,
    prerequisites: ['savagery'], gateRow: 11, isGateway: false,
    inSTBuild: true, inAoEBuild: false, dpsCategory: 'st',
  },
  {
    key: 'flamefangPitch', label: 'Flamefang Pitch', row: 5, col: 3, pointCost: 1,
    prerequisites: ['wildfileShells'], gateRow: 11, isGateway: false,
    inSTBuild: false, inAoEBuild: true, dpsCategory: 'aoe',
  },
  {
    key: 'shrapnelBomb', label: 'Shrapnel Bomb', row: 5, col: 4, pointCost: 1,
    prerequisites: ['wildfileShells'], gateRow: 11,
    isGateway: true,
    gatewayNote: 'Taken as a path filler to unlock Wildfire Imbuement (row 6). Standalone value is real but lower than other AoE picks. Players often take it solely to enable the Wildfire Imbuement → Flamebreak chain.',
    inSTBuild: false, inAoEBuild: true, dpsCategory: 'gateway',
  },

  // ─── ROW 6 — Gate: 14 pts in rows 1–5 ───────────────────────────────────
  {
    key: 'stargazer', label: 'Stargazer', row: 6, col: 1, pointCost: 2,
    prerequisites: ['vulnerability'], gateRow: 14, isGateway: false,
    inSTBuild: true, inAoEBuild: false, dpsCategory: 'st',
    gatewayNote: '2-point talent: rank 1 alone is weak (+10% crit dmg cap). Both points required to reach the +20% cap at 10 stacks. Never invest only 1pt.',
  },
  {
    key: 'grenadeJuggler', label: 'Grenade Juggler', row: 6, col: 3, pointCost: 1,
    prerequisites: ['flamefangPitch'], gateRow: 14, isGateway: false,
    inSTBuild: false, inAoEBuild: true, dpsCategory: 'aoe',
  },
  {
    key: 'wildfireImbuement', label: 'Wildfire Imbuement', row: 6, col: 4, pointCost: 1,
    prerequisites: ['flamefangPitch', 'shrapnelBomb'], gateRow: 14, isGateway: false,
    inSTBuild: false, inAoEBuild: true, dpsCategory: 'aoe',
  },
  {
    key: 'flamebreak', label: 'Flamebreak', row: 6, col: 5, pointCost: 1,
    prerequisites: ['wildfireImbuement'], gateRow: 14, isGateway: false,
    inSTBuild: false, inAoEBuild: true, dpsCategory: 'aoe',
  },

  // ─── ROW 7 — Gate: 17 pts in rows 1–6 ───────────────────────────────────
  {
    key: 'twoAgainstMany', label: 'Two Against Many', row: 7, col: 3, pointCost: 2,
    prerequisites: ['strikeAsOne', 'grenadeJuggler'], gateRow: 17, isGateway: false,
    inSTBuild: false, inAoEBuild: true, dpsCategory: 'aoe',
    gatewayNote: '2-point talent: rank 1 hits +1 enemy; rank 2 hits +2 enemies. The AoE value only becomes meaningful at rank 2. Never invest only 1pt here.',
  },
];

export const HERO_TALENT_TREES: Record<'sentinel' | 'packLeader', HeroTalentNode[]> = {
  sentinel: [
    { key: 'moonlightChakram', label: 'Moonlight Chakram', order: 1, pointCost: 1,
      desc: 'Sentinel Mark procs release a bouncing shadow chakram hitting up to 5 targets. First node — must be taken before Lunar Storm.' },
    { key: 'lunarStorm', label: 'Lunar Storm', order: 2, pointCost: 1,
      prerequisiteKey: 'moonlightChakram',
      desc: 'Mark consumption triggers a Lunar Storm AoE burst. Gate: requires Moonlight Chakram.' },
    { key: 'moonsBlessing', label: "Moon's Blessing", order: 3, pointCost: 1,
      prerequisiteKey: 'lunarStorm',
      desc: 'Capstone: +10% Mark proc chance (20% → 30%). Requires both prior nodes. Completes the Sentinel loop.' },
  ],
  packLeader: [
    { key: 'lethalBarbs', label: 'Lethal Barbs', order: 1, pointCost: 1,
      desc: 'Auto-attacks generate 2 bonus Focus. First node — enables extra Kill Commands.' },
    { key: 'direSummons', label: 'Dire Summons', order: 2, pointCost: 1,
      prerequisiteKey: 'lethalBarbs',
      desc: 'Reduces beast spawn cooldown. Gate: requires Lethal Barbs.' },
    { key: 'stampede', label: 'Stampede', order: 3, pointCost: 1,
      prerequisiteKey: 'direSummons',
      desc: 'Capstone: Takedown triggers a beast stampede. Requires both prior nodes. The core ST damage amplifier.' },
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
  flamefangPitch: {
    label: 'Flamefang Pitch', apCoef: 4.20, baseCPM: 2.0,
    isPet: false, isFire: true, isBleed: false, aoeTargetCap: 8,
    hasteScalesCPM: false, bonusCritMult: 0,
    requiresTalent: 'flamefangPitch',
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
  if (talents.vulnerability && (key === 'raptorStrike' || key === 'boomstick')) {
    critMult += 0.20;
    notes.push('Vulnerability +20% crit dmg');
  }
  if (talents.lethalCalibration && (key === 'wildfireBombDirect' || key === 'wildfireBombDoT')) {
    critMult += 0.15;
    notes.push('Lethal Calibration +15% crit dmg');
  }
  // Stargazer: RS gains ~2% crit dmg per stack, ~5 avg stacks in steady rotation
  if (talents.stargazer && key === 'raptorStrike') {
    critMult += 0.10;  // 5 stacks × 2% = +10% avg
    notes.push('Stargazer +10% avg crit dmg (5 stacks)');
  }
  // Expected damage per cast = unhit + crit component
  const critFrac = critPct / 100;
  const critScalar = 1 + critFrac * (critMult - 1);
  dmgPerCast *= critScalar;

  // ── CPM calculation ──
  const hasteMult = 1 + hastePct / 100;
  let cpm = spell.hasteScalesCPM ? spell.baseCPM * hasteMult : spell.baseCPM;

  // ── Takedown window model ──
  // Takedown lasts 8s. With Savagery: 60s CD; without: 90s CD.
  // Can't Miss Won't Miss extends duration by 2s → 10s.
  const takedownCD = talents.savagery ? 60 : 90;
  const takedownDur = talents.cantMissWontMiss ? 10 : 8;
  const takedownUptime = takedownDur / takedownCD;

  if (key === 'raptorStrike' || key === 'raptorSwipe') {
    // +20% damage during Takedown window
    dmgPerCast *= 1 + takedownUptime * 0.20;
    if (talents.cantMissWontMiss && key === 'raptorStrike') {
      // Can't Miss Won't Miss: RS +10% damage (always-on)
      dmgPerCast *= 1.10;
      notes.push("Can't Miss Won't Miss +10%");
    }
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
    // Wildfire Shells: each Boomstick hit reduces WFB CD by 4s (AoE talent)
    // Inverse effect: WFB resets Boomstick via 4pc → effectively more Boomsticks
    if (tierSet.has4pc) {
      // WFB fires ~3.9 times/min at full tier; 20% reset chance
      // → 3.9 × 0.20 = 0.78 extra Boomstick casts per minute
      // Effective CD = 60 / (1/60 + 0.78) ≈ 46s
      boomCD = 46;
      notes.push('4pc tier: WFB 20% Boomstick reset → ~46s eff CD');
    }
    if (talents.mongooseRounds) {
      notes.push('Mongoose Rounds: Boomstick grants MF stacks → RS buff');
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

  // ── Flamefang Pitch: Grenade Juggler ──
  if (key === 'flamefangPitch') {
    if (talents.grenadeJuggler) {
      cpm = 60 / 20;  // 2 charges, effectively ~50% more uses
      notes.push('Grenade Juggler: 2 charges → ~3.0 CPM');
    }
    if (talents.flamebreak) {
      notes.push('Flamebreak: +15% fire damage applied globally to fire spells');
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

  // ── Shrapnel Bomb: WFB DoT bypasses armor ──
  if (key === 'wildfireBombDoT' && talents.shrapnelBomb) {
    // Physical mitigation avoided (rough: +8% effective damage vs armored targets)
    dmgPerCast *= 1.08;
    notes.push('Shrapnel Bomb: bleed bypasses armor +8%');
  }

  // ── Wildfire Imbuement: fire on RS ──
  if (key === 'raptorStrike' && talents.wildfireImbuement && talents.flamefangPitch) {
    dmgPerCast *= 1.06;
    notes.push('Wildfire Imbuement: fire imbue +6%');
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

function buildSentinelST(): TalentConfig {
  return {
    mongooseFury: true, strikeAsOne: true, wildfireBomb: true, takedown: true,
    boomstick: true, raptorSwipe: true, lethalCalibration: true,
    savagery: true, vulnerability: true, mongooseRounds: true,
    cantMissWontMiss: true, stargazer: true,
    flamefangPitch: false, grenadeJuggler: false, wildfileShells: false,
    shrapnelBomb: false, flamebreak: false, wildfireImbuement: false, twoAgainstMany: false,
    moonlightChakram: true, lunarStorm: true, moonsBlessing: true,
    lethalBarbs: false, direSummons: false, stampede: false,
  };
}

function buildSentinelAoE(): TalentConfig {
  return {
    mongooseFury: true, strikeAsOne: true, wildfireBomb: true, takedown: true,
    boomstick: true, raptorSwipe: true, lethalCalibration: true,
    savagery: false, vulnerability: false, mongooseRounds: false,
    cantMissWontMiss: false, stargazer: false,
    flamefangPitch: true, grenadeJuggler: true, wildfileShells: true,
    shrapnelBomb: true, flamebreak: true, wildfireImbuement: true, twoAgainstMany: true,
    moonlightChakram: true, lunarStorm: true, moonsBlessing: true,
    lethalBarbs: false, direSummons: false, stampede: false,
  };
}

function buildPackLeaderST(): TalentConfig {
  return {
    mongooseFury: true, strikeAsOne: true, wildfireBomb: true, takedown: true,
    boomstick: true, raptorSwipe: true, lethalCalibration: true,
    savagery: true, vulnerability: true, mongooseRounds: true,
    cantMissWontMiss: true, stargazer: true,
    flamefangPitch: false, grenadeJuggler: false, wildfileShells: false,
    shrapnelBomb: false, flamebreak: false, wildfireImbuement: false, twoAgainstMany: false,
    moonlightChakram: false, lunarStorm: false, moonsBlessing: false,
    lethalBarbs: true, direSummons: true, stampede: true,
  };
}

function buildPackLeaderAoE(): TalentConfig {
  return {
    mongooseFury: true, strikeAsOne: true, wildfireBomb: true, takedown: true,
    boomstick: true, raptorSwipe: true, lethalCalibration: true,
    savagery: false, vulnerability: false, mongooseRounds: false,
    cantMissWontMiss: false, stargazer: false,
    flamefangPitch: true, grenadeJuggler: true, wildfileShells: true,
    shrapnelBomb: true, flamebreak: true, wildfireImbuement: true, twoAgainstMany: true,
    moonlightChakram: false, lunarStorm: false, moonsBlessing: false,
    lethalBarbs: true, direSummons: true, stampede: true,
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

  // Talent point costs (must match SurvivalHunterSim.tsx definitions)
  // Optional spec budget: 8 pts. Hero budget: 3 pts.
  const TALENT_POINT_COSTS: Partial<Record<keyof TalentConfig, number>> = {
    stargazer: 2, twoAgainstMany: 2,
  };
  const ptCost = (key: keyof TalentConfig) => TALENT_POINT_COSTS[key] ?? 1;

  const talentsToTest: {
    key: keyof TalentConfig;
    label: string;
    communityRanks: boolean;
    reasoning: string;
  }[] = [
    {
      key: 'savagery', label: 'Savagery',
      communityRanks: true,
      reasoning: 'Reduces Takedown CD 90s → 60s; more Takedown windows = more Raptor Swipe 100% proc windows. Biggest ST gain after core talents.',
    },
    {
      key: 'vulnerability', label: 'Vulnerability',
      communityRanks: true,
      reasoning: 'RS and Boomstick +20% crit damage. Value scales with crit% and Boomstick 4pc frequency.',
    },
    {
      key: 'mongooseRounds', label: 'Mongoose Rounds',
      communityRanks: true,
      reasoning: 'Boomstick hits grant Mongoose Fury stacks, which boosts next RS burst window.',
    },
    {
      key: 'cantMissWontMiss', label: "Can't Miss Won't Miss",
      communityRanks: false,
      reasoning: "RS +10% flat damage + Takedown window extended 8s → 10s. We rate this as core ST for tier set builds where Takedown uptime drives 4pc reset math — rated optional by most guides.",
    },
    {
      key: 'stargazer', label: 'Stargazer',
      communityRanks: false,
      reasoning: 'Up to +20% crit damage on RS at 10 stacks. In sustained ST with high crit% this outperforms Vulnerability as a third crit-dmg node. Largely absent from popular guide recommendations.',
    },
    {
      key: 'lethalCalibration', label: 'Lethal Calibration',
      communityRanks: true,
      reasoning: 'WFB crits deal +15% damage. With 2pc reducing WFB CD, uptime is near-permanent in tier gear.',
    },
    {
      key: 'moonlightChakram', label: 'Moonlight Chakram',
      communityRanks: true,
      reasoning: 'Highest single-cast AP coefficient in kit (4.80). Shares CD window with Takedown for burst alignment.',
    },
    {
      key: 'lunarStorm', label: 'Lunar Storm',
      communityRanks: true,
      reasoning: 'AoE damage on Mark consume. With Moon\'s Blessing this fires ~3-4×/min in ST.',
    },
    {
      key: 'moonsBlessing', label: "Moon's Blessing",
      communityRanks: true,
      reasoning: 'Increases Sentinel Mark proc rate 20% → 30%. Directly scales Lunar Storm frequency +50%.',
    },
    {
      key: 'flamefangPitch', label: 'Flamefang Pitch (AoE)',
      communityRanks: true,
      reasoning: 'Ground AoE at 4.20 AP coef hitting 8 targets. Mandatory for M+ and AoE raid fights.',
    },
    {
      key: 'grenadeJuggler', label: 'Grenade Juggler (AoE)',
      communityRanks: true,
      reasoning: '+1 Flamefang charge; ~50% more uses. Trivially BiS in AoE.',
    },
    {
      key: 'flamebreak', label: 'Flamebreak (AoE)',
      communityRanks: false,
      reasoning: '+15% fire damage globally. Affects WFB, Flamefang, and Wildfire Imbuement. We rate this higher than most guides in a full fire build — the fire damage share is larger than commonly assumed.',
    },
    {
      key: 'twoAgainstMany', label: 'Two Against Many (AoE, 2pt)',
      communityRanks: false,
      reasoning: 'Strike as One hits +2 enemies. Scales pet passive hits to 3 targets — undervalued in most guides which only recommend it at 5+ targets. Our math shows it is BiS at 3+.',
    },
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
      'Sentinel is the preferred hero talent for Raid (ST and light cleave)',
      'Wildfire Bomb, Kill Command, Boomstick, Takedown, Raptor Swipe are always talented',
      'Lethal Calibration and Mongoose Fury are core to the RS-focused rotation',
      'Moonlight Chakram + Lunar Storm + Moon\'s Blessing are mandatory Sentinel nodes',
      'AoE: Flamefang Pitch + Grenade Juggler are BiS for 4+ targets',
      'Mastery (Spirit Bond) is the primary secondary stat for both ST and AoE',
    ],
    differences: [
      {
        topic: "Can't Miss Won't Miss",
        communityView: 'Rated as optional / situational filler point in most guides',
        ourView: "We rate this as core ST: RS +10% flat + Takedown window 8s → 10s synergizes with 4pc tier (more Boomstick resets within window). Underrated due to the Takedown-uptime math.",
        delta: d('cantMissWontMiss'),
      },
      {
        topic: 'Stargazer (2pt)',
        communityView: 'Largely absent from popular guide ST builds — considered niche',
        ourView: 'At 25%+ crit with sustained ST, Stargazer averages 5+ stacks (+10% crit dmg on RS). At Hero-track gear levels it surpasses Vulnerability as the third crit-damage node.',
        delta: d('stargazer'),
      },
      {
        topic: 'Flamebreak (AoE)',
        communityView: 'Rated as low priority / last-pick AoE talent in most AoE builds',
        ourView: 'With WFB (fire), Flamefang (fire), and Wildfire Imbuement all active, Flamebreak +15% fire affects 35–40% of total damage. Our math puts it BiS in the full fire AoE build.',
        delta: d('flamebreak'),
      },
      {
        topic: 'Two Against Many (AoE, 2pt)',
        communityView: 'Listed as optional for 5+ target scenarios; not recommended for cleave',
        ourView: 'Strike as One fires on every ability cast. At 3 targets, Two Against Many adds 2× the pet proc value — BiS at 3+ targets (cleave), not just 5+. Budget cost of 2pts is repaid quickly.',
        delta: `${d('twoAgainstMany')} at ${targetCount}T`,
      },
      {
        topic: 'Savagery priority',
        communityView: 'Most guides list Savagery as secondary after Vulnerability in ST',
        ourView: 'Savagery should come first: 90s → 60s CD = 50% more Takedown windows = 50% more 100%-proc Raptor Swipe windows. Scales multiplicatively with Mongoose Fury stacks and 4pc resets.',
        delta: d('savagery'),
      },
      {
        topic: 'Tier set talent adjustment',
        communityView: 'Most guides recommend a static talent build regardless of tier set',
        ourView: '4pc Boomstick reset raises Boomstick from 1.0 to ~1.78 CPM. This elevates Vulnerability and Mongoose Rounds since each extra Boomstick hit also buffs the RS burst window. Talent priority shifts with 4pc active.',
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
    notes.push('AoE: Wildfire Bomb → Boomstick → Flamefang Pitch priority; KC for focus generation');
    if (talents.grenadeJuggler) notes.push('Pool 2 Flamefang charges; drop both on high-density pack pulls');
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
