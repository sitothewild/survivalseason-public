// ─────────────────────────────────────────────────────────────
// engine/types.ts
// Core type definitions for the Survival Hunter simulation engine.
// V3 spec: concrete types mapped to actual codebase modules.
// ─────────────────────────────────────────────────────────────

export type FightStyle = "raid_st" | "mplus_pull" | "dungeon_slice";
export type HeroTree = "sentinel" | "pack_leader";

// ── SimConfig ─────────────────────────────────────────────────

export interface SimConfig {
  durationMs: number;
  iterations: number;
  fightStyle: FightStyle;
  targets: number;
  bossLevelDelta: 0 | 1 | 2 | 3;
  seed: number;
  hero: HeroTree;
  apl: string;
  captureTimeline: boolean;
  timelineDurationMs: number;

  features: {
    prd: boolean;
    dotSnapshotting: "none" | "ap_only";
    multiTarget: boolean;
    useMythIlvl: boolean;
  };
}

// ── PlayerStats ───────────────────────────────────────────────

export interface PlayerStats {
  agility: number;
  stamina: number;
  attackPower: number;
  critRating: number;
  hasteRating: number;
  masteryRating: number;
  versatilityRating: number;

  weapon: {
    type: "2h" | "dw";
    mainHandDps: number;
    mainHandSpeed: number;
    offHandDps?: number;
    offHandSpeed?: number;
  };

  has2pc: boolean;
  has4pc: boolean;
}

// ── EquippedTrinket ───────────────────────────────────────────

export interface EquippedTrinket {
  id: number;
  name: string;
  ilvl: number;
  type: "on_use" | "proc" | "equip" | "damage_proc";
  primaryAgi: number;

  onUseAmount?: number;
  onUseStat?: "crit" | "mastery" | "haste" | "agi";
  onUseAgi?: number;
  onUseDuration?: number;
  onUseCD?: number;

  procAmount?: number;
  procStat?: "agi" | "crit" | "mastery" | "haste" | "vers";
  procUptime?: number;
  procICD?: number;

  dmgApCoef?: number;
  dmgCPM?: number;

  burstAlignable: boolean;
}

// ── TalentState ───────────────────────────────────────────────

export interface ChoiceSelections {
  bomb: "shrapnel_bomb" | "flamebreak";
  spender_buff: "vulnerability" | "blackrock_munitions";
}

export interface TalentState {
  hero: HeroTree;
  choiceSelections: ChoiceSelections;
  // Flat set of talent keys that are active
  activeTalents: Set<string>;
}

// ── SimInput ──────────────────────────────────────────────────

export interface SimInput {
  config: SimConfig;
  stats: PlayerStats;
  talents: TalentState;
  trinkets: [EquippedTrinket, EquippedTrinket];
}

// ── SimResult ─────────────────────────────────────────────────

export interface AbilityBreakdown {
  key: string;
  label: string;
  damage: number;
  dps: number;
  casts: number;
  avgHit: number;
  pctOfTotal: number;
  category: "player" | "pet" | "trinket" | "dot";
}

export interface SimResult {
  meanDps: number;
  medianDps: number;
  stdDev: number;
  minDps: number;
  maxDps: number;
  p5Dps: number;
  p95Dps: number;
  iterations: number;
  durationMs: number;
  breakdown: AbilityBreakdown[];
  perTarget: Record<number, { damage: number; dps: number }>;
  heroCounters: {
    sentinelOwlProcs?: number;
    lunarStormProcs?: number;
    eyesOfEagleResets?: number;
    viciousHuntProcs?: number;
    packCoordinationProcs?: number;
    frenziedTearProcs?: number;
  };
  timeline?: TimelineEvent[];
}

export interface TimelineEvent {
  tMs: number;
  type: string;
  ability?: string;
  damage?: number;
  target?: number;
}

// ── DamageEvent (internal) ────────────────────────────────────

export interface DamageInstance {
  sourceAbility: string;
  damage: number;
  isCrit: boolean;
  target: number;
  tMs: number;
}

// ── Stat Weight Result ────────────────────────────────────────

export interface StatWeightResult {
  baseDps: number;
  weights: {
    agility: number;
    crit: number;
    haste: number;
    mastery: number;
    vers: number;
  };
  normalized: {
    agility: 1.0;
    crit: number;
    haste: number;
    mastery: number;
    vers: number;
  };
}
