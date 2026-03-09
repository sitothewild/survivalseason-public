// ============================================================
// SURVIVAL HUNTER MIDNIGHT 12.0 — GEAR OPTIMIZER
// ============================================================
// Trinkets, enchants, gems, rings, and BiS analysis.
// All DPS values computed from stat-weight × stat-amount math
// anchored to theorycrafting.ts scale factors.
//
// Methodology:
//  1. computeStatWeights() gives DPS per 1 rating for each stat
//  2. Trinket/enchant/gem DPS = stat_budget × uptime × dps_per_rating
//  3. Burst alignment bonus: on-use trinkets alignable with Takedown/Boomstick
//     get a +12% effective value multiplier (same logic as SimC "scale_factor_plot")
//  4. Hero talent modifiers applied: Sentinel benefits more from Crit (Moonlight
//     Chakram crits + Lethal Calibration + Vulnerability/Stargazer all crit-scale);
//     Pack Leader benefits more from Mastery (0.6% pet damage per mastery% compounds
//     with more pet ability CPM from Lethal Barbs/Dire Summons)
// ============================================================

import type { StatWeights } from './theorycrafting';

// ── Midnight Season 1 Track & Rank System ───────────────────

export interface GearTrack {
  name: string;
  rankMin: number;   // ilvl at Rank 1
  rankMax: number;   // ilvl at Rank 6
  ilvlPerRank: number;
  currency: string;
  source: string;
  color: string;
}

/** Full Season 1 gear track table. Each track has 6 ranks (+3 ilvl each). */
export const GEAR_TRACKS: GearTrack[] = [
  {
    name: 'Adventurer', rankMin: 224, rankMax: 237, ilvlPerRank: 3,
    currency: 'Weathered Dawncrests',
    source: 'World Quests, Normal Dungeons',
    color: '#6b7280',
  },
  {
    name: 'Veteran', rankMin: 237, rankMax: 250, ilvlPerRank: 3,
    currency: 'Carved Dawncrests',
    source: 'Heroic Dungeons, Delves T1-3',
    color: '#22c55e',
  },
  {
    name: 'Champion', rankMin: 250, rankMax: 263, ilvlPerRank: 3,
    currency: 'Runed Dawncrests',
    source: 'Mythic 0, Normal Raid, Delves T4-7',
    color: '#3b82f6',
  },
  {
    name: 'Hero', rankMin: 263, rankMax: 276, ilvlPerRank: 3,
    currency: 'Runed Dawncrests',
    source: 'M+ +2–+6, Heroic Raid, Bountiful Delves',
    color: '#a855f7',
  },
  {
    name: 'Myth', rankMin: 276, rankMax: 289, ilvlPerRank: 3,
    currency: 'Gilded Dawncrests',
    source: 'M+ +7 or higher, Mythic Raid, Great Vault',
    color: '#f59e0b',
  },
];

/** Dawncrest currency tiers and their upgrade scope. */
export const DAWNCREST_TIERS = [
  { name: 'Weathered Dawncrests', tracks: ['Adventurer', 'Veteran'],    weeklyCapNotes: 'No cap — easy content' },
  { name: 'Carved Dawncrests',    tracks: ['Champion'],                  weeklyCapNotes: '~100/week from M0/Normal raid' },
  { name: 'Runed Dawncrests',     tracks: ['Hero'],                      weeklyCapNotes: '~100/week from Heroic Raid / M+ +2–+6' },
  { name: 'Gilded Dawncrests',    tracks: ['Myth'],                      weeklyCapNotes: '~100/week from Mythic Raid / M+ +7+; ~1.2 pieces/week' },
];

/**
 * Upgrade cost constants.
 * 120 Dawncrests to fully upgrade one piece (Rank 1 → Rank 6).
 * Weekly cap: ~100 crests of each tier.
 * Slot discount: if you own a max-rank (Rank 6) item in a slot, upgrading
 * any OTHER item in that same slot to Rank 6 costs 0 crests (Gold only).
 */
export const UPGRADE_COSTS = {
  crestsPerPiece: 120,
  weeklyCrestedCap: 100,
  totalPieces: 15,   // full character gear slots
  weeksToFullyUpgrade: Math.ceil((120 * 15) / 100), // ~18 weeks ignoring discounts
  slotDiscountNote: 'Free upgrade if you already have Rank 6 in the same slot — allows swapping secondary stat combos at no crest cost.',
} as const;

export type HeroTalent = 'sentinel' | 'packLeader';
export type FightType  = 'st' | 'aoe';

// ── Trinkets ─────────────────────────────────────────────────

export type TrinketType = 'on_use' | 'proc' | 'equip' | 'damage_proc';

export interface TrinketDef {
  id: number;
  name: string;
  source: string;
  ilvl: number;
  type: TrinketType;
  // Passive primary stat always on trinket (stam trinkets = 0)
  primaryAgi: number;

  // On-use secondary stat buff
  onUseStat?: 'crit' | 'haste' | 'mastery' | 'vers';
  onUseAmount?: number;   // secondary rating
  onUseAgi?: number;      // agility on-use (separate from secondary)
  onUseDuration?: number; // seconds active
  onUseCD?: number;       // cooldown in seconds

  // Passive proc secondary stat
  procStat?: 'crit' | 'haste' | 'mastery' | 'vers' | 'agi';
  procAmount?: number;    // rating when active
  procUptime?: number;    // fraction 0–1

  // Direct damage proc (AP coefficient × CPM)
  dmgApCoef?: number;
  dmgCPM?: number;

  // Synergy flags
  sentinelRating: 'S' | 'A' | 'B' | 'C';
  packLeaderRating: 'S' | 'A' | 'B' | 'C';
  /** True if activation can be aligned with Takedown / Boomstick burst windows */
  burstAlignable: boolean;
  notes: string;
}

// Midnight 12.0 trinket database — Hero track 276 (Heroic Raid) to Myth track 289 (Mythic Raid / +7 vault).
// Values extrapolated from Blizzard item scaling formulas and SimC coefficient data.
export const MIDNIGHT_TRINKETS: TrinketDef[] = [
  // ─ Raid: Midnight Citadel ─
  {
    id: 225600,
    name: "Moonwarden's Focal Lens",
    source: "Midnight Raid — Kroluk, Midnight Tyrant",
    ilvl: 276,
    type: 'on_use',
    primaryAgi: 0,
    onUseStat: 'crit',
    onUseAmount: 3640,
    onUseDuration: 20,
    onUseCD: 120,
    sentinelRating: 'S',
    packLeaderRating: 'A',
    burstAlignable: true,
    notes: "On-use +3640 Crit for 20s (2min CD). Aligns perfectly with Moonlight Chakram + Takedown burst window. Sentinel BiS #1 for ST — Lethal Calibration + Vulnerability + Stargazer all multiply with crit.",
  },
  {
    id: 225601,
    name: "Abyssal Night Effigy",
    source: "Midnight Raid — Xal'atath, Shard of the Void",
    ilvl: 276,
    type: 'proc',
    primaryAgi: 620,
    procStat: 'agi',
    procAmount: 1280,  // stacking proc, avg stacks 7 of 10
    procUptime: 0.70,
    sentinelRating: 'S',
    packLeaderRating: 'S',
    burstAlignable: false,
    notes: "Passive +620 Agi + proc: stacking +128 Agi per kill/ability (max 10 stacks, ~7 avg). Best sustained Agility trinket. BiS #1 for Pack Leader, BiS #2 for Sentinel.",
  },
  {
    id: 225602,
    name: "Kroluk's Warbanner",
    source: "Midnight Raid — Kroluk, Midnight Tyrant (Guaranteed drop)",
    ilvl: 276,
    type: 'damage_proc',
    primaryAgi: 510,
    dmgApCoef: 2.10,
    dmgCPM: 3.8,
    sentinelRating: 'A',
    packLeaderRating: 'A',
    burstAlignable: false,
    notes: "Periodically slams a spectral warbanner into the ground dealing 210% AP to nearby enemies. Already modeled in DPS breakdown. Consistent mid-tier damage trinket, very strong in AoE.",
  },
  {
    id: 225603,
    name: "Ranger's Precision Stone",
    source: "Midnight Raid — The Eternal Hunt Council",
    ilvl: 276,
    type: 'on_use',
    primaryAgi: 0,
    onUseStat: 'mastery',
    onUseAmount: 3920,
    onUseDuration: 20,
    onUseCD: 120,
    sentinelRating: 'A',
    packLeaderRating: 'S',
    burstAlignable: true,
    notes: "On-use +3920 Mastery (Spirit Bond) for 20s. Pack Leader BiS: extra mastery amplifies pet damage by 0.6%/mastery% — with 39+ base mastery, this is 39+23% × 0.6% ≈ significant pet amplification during burst.",
  },
  {
    id: 225604,
    name: "Sentinel's Echo Prism",
    source: "Midnight Raid — The Faceless Council",
    ilvl: 276,
    type: 'proc',
    primaryAgi: 480,
    procStat: 'mastery',
    procAmount: 2200,
    procUptime: 0.52,
    sentinelRating: 'A',
    packLeaderRating: 'A',
    burstAlignable: false,
    notes: "Passive +480 Agi + proc: +2200 Mastery at ~52% uptime (proc on damaging ability, ICD 15s). Solid sustained passive option. Slightly better for Pack Leader due to mastery pet scaling.",
  },
  {
    id: 225605,
    name: "Midnight Hunter's Lodestone",
    source: "Midnight Raid — Midnight (Final Boss)",
    ilvl: 276,
    type: 'on_use',
    primaryAgi: 0,
    onUseAgi: 980,
    onUseDuration: 20,
    onUseCD: 120,
    sentinelRating: 'A',
    packLeaderRating: 'A',
    burstAlignable: true,
    notes: "On-use +980 Agility for 20s (2min CD). Aligns with Takedown for burst. Strong for both specs — Agility scales all physical damage + AP. ~16% average uptime.",
  },
  {
    id: 225606,
    name: "Shadowbane Relic Shard",
    source: "Midnight Raid — Xal'atath (Heroic-only drop)",
    ilvl: 276,
    type: 'proc',
    primaryAgi: 0,
    procStat: 'crit',
    procAmount: 2600,
    procUptime: 0.45,
    dmgApCoef: 0.80,
    dmgCPM: 5.0,
    sentinelRating: 'A',
    packLeaderRating: 'B',
    burstAlignable: false,
    notes: "Dual-effect: proc +2600 Crit (45% uptime) + on-damage-taken: deals 80% AP to attacker (~5/min). Better for Sentinel due to crit synergies. The defensive proc is active in melee.",
  },
  {
    id: 225607,
    name: "Entropic Skardyn's Grace",
    source: "Midnight Raid — Skardyn the Devourer",
    ilvl: 276,
    type: 'on_use',
    primaryAgi: 0,
    onUseStat: 'haste',
    onUseAmount: 3480,
    onUseDuration: 20,
    onUseCD: 120,
    sentinelRating: 'B',
    packLeaderRating: 'A',
    burstAlignable: true,
    notes: "On-use +3480 Haste for 20s. Strong for Pack Leader (more KC casts → more pet procs). For Sentinel: haste value is lower than crit in ST. Better in AoE where haste scales WFB frequency via 2pc tier.",
  },
  {
    id: 225608,
    name: "Windscale Compass",
    source: "M+ Dungeons — Hero track (+2–+6, fully upgraded to 276) or Myth track (+7+, up to 289)",
    ilvl: 276,
    type: 'proc',
    primaryAgi: 430,
    procStat: 'haste',
    procAmount: 1900,
    procUptime: 0.40,
    sentinelRating: 'B',
    packLeaderRating: 'B',
    burstAlignable: false,
    notes: "M+ trinket. +430 Agi + proc: +1900 Haste (40% uptime). Hero track at 276 (M+ +2–+6 fully upgraded); Myth track at 289 from +7+ or vault. Decent filler if raid trinkets unavailable.",
  },
  {
    id: 225609,
    name: "Treacherous Night Transmitter",
    source: "Midnight Raid — The Eternal Hunt Council (Heroic)",
    ilvl: 276,
    type: 'on_use',
    primaryAgi: 0,
    onUseStat: 'vers',
    onUseAmount: 4200,
    onUseDuration: 20,
    onUseCD: 90,
    sentinelRating: 'B',
    packLeaderRating: 'B',
    burstAlignable: true,
    notes: "On-use +4200 Versatility for 20s (90s CD — shorter than most). Flat damage mult is weakest scaling for SV. Best used as survival/progression trinket or when other slots unavailable.",
  },
  {
    id: 225610,
    name: "Abyssal Predator's Eye",
    source: "Midnight Raid — Kroluk's Harbinger (Heroic-exclusive)",
    ilvl: 276,
    type: 'equip',
    primaryAgi: 820,
    procStat: 'mastery',
    procAmount: 1400,
    procUptime: 0.60,
    sentinelRating: 'B',
    packLeaderRating: 'A',
    burstAlignable: false,
    notes: "Equip: +820 Agi (highest passive primary). Proc: +1400 Mastery (60% uptime). Good default trinket with consistent stats — no burst alignment but reliable for any fight length.",
  },
  {
    id: 225611,
    name: "Mark of the Midnight Hunt",
    source: "Midnight Raid — Opening Event (First boss) — Hero track, upgrades to 276",
    ilvl: 263,
    type: 'damage_proc',
    primaryAgi: 460,
    dmgApCoef: 1.60,
    dmgCPM: 6.5,
    sentinelRating: 'C',
    packLeaderRating: 'C',
    burstAlignable: false,
    notes: "Entry-level raid trinket from first boss (Champion→Hero track, 250–276). Proc: 160% AP physical hit (~6.5/min). Outclassed by mid/late-raid trinkets but excellent for progression gearing in.",
  },
];

// ── Enchants ─────────────────────────────────────────────────

export interface EnchantDef {
  id: number;
  name: string;
  slot: string;
  stat: 'crit' | 'haste' | 'mastery' | 'vers' | 'agi' | 'mixed' | 'utility';
  /** Primary stat rating added (flat, always-on) */
  primaryRating: number;
  /** Secondary stat type and rating, if applicable */
  secondaryRating?: number;
  sentinelRank: 1 | 2 | 3;  // 1 = BiS
  packLeaderRank: 1 | 2 | 3;
  notes: string;
}

export const MIDNIGHT_ENCHANTS: EnchantDef[] = [
  // ─ Weapon ─
  {
    id: 7462, name: 'Stonebound Artistry', slot: 'Weapon',
    stat: 'mastery', primaryRating: 1018,
    sentinelRank: 2, packLeaderRank: 1,
    notes: 'Highest Mastery weapon enchant. BiS for Pack Leader (Spirit Bond pet scaling). Sentinel prefers Radiant Power for crit synergy but this is a strong second.',
  },
  {
    id: 7466, name: 'Authority of Radiant Power', slot: 'Weapon',
    stat: 'crit', primaryRating: 1018,
    sentinelRank: 1, packLeaderRank: 2,
    notes: "Highest Crit weapon enchant. BiS for Sentinel — Moonlight Chakram crits, Lethal Calibration, Vulnerability, and Stargazer all multiply crit value. Pack Leader prefers Stonebound Artistry.",
  },
  {
    id: 7464, name: 'Authority of Air', slot: 'Weapon',
    stat: 'haste', primaryRating: 1018,
    sentinelRank: 3, packLeaderRank: 3,
    notes: 'Highest Haste weapon enchant. Use only if heavily haste-starved (below 12%). Generally outperformed by Crit or Mastery for Survival.',
  },
  // ─ Chest ─
  {
    id: 7355, name: 'Crystalline Radiance', slot: 'Chest',
    stat: 'mixed', primaryRating: 0, secondaryRating: 180,
    sentinelRank: 1, packLeaderRank: 1,
    notes: 'Splits ~180 of each secondary (Crit/Haste/Mastery/Vers). Net stat value is high due to all-stat distribution. Best chest enchant for both specs.',
  },
  // ─ Cloak ─
  {
    id: 7409, name: 'Winged Grace', slot: 'Cloak',
    stat: 'utility', primaryRating: 0,
    sentinelRank: 1, packLeaderRank: 1,
    notes: 'Movement speed. No DPS impact. Standard cloak enchant for all specs — negligible throughput alternatives exist.',
  },
  // ─ Bracers ─
  {
    id: 7594, name: '+16 Agility', slot: 'Wrist',
    stat: 'agi', primaryRating: 16,
    sentinelRank: 1, packLeaderRank: 1,
    notes: 'Flat Agility is always best-in-slot for bracers. 16 Agility scales with all damage modifiers.',
  },
  // ─ Legs ─
  {
    id: 7529, name: 'Stormbound Armor Kit', slot: 'Legs',
    stat: 'mixed', primaryRating: 0, secondaryRating: 200,
    sentinelRank: 1, packLeaderRank: 1,
    notes: 'Best physical DPS leg armor kit. Mixed Crit+Mastery stats — both valuable for Survival.',
  },
  // ─ Boots ─
  {
    id: 7418, name: "Cavalry's March", slot: 'Boots',
    stat: 'mastery', primaryRating: 480,
    sentinelRank: 2, packLeaderRank: 1,
    notes: '+480 Mastery. BiS boots enchant for Pack Leader. Sentinel can use this or Scout\'s March depending on stat caps.',
  },
  {
    id: 7420, name: "Scout's March", slot: 'Boots',
    stat: 'haste', primaryRating: 480,
    sentinelRank: 3, packLeaderRank: 3,
    notes: '+480 Haste. Third-best boots enchant. Use if heavily haste capped.',
  },
  {
    id: 7419, name: "Defender's March", slot: 'Boots',
    stat: 'vers', primaryRating: 480,
    sentinelRank: 3, packLeaderRank: 3,
    notes: '+480 Versatility. Defensive choice. Not recommended for pure DPS.',
  },
  // ─ Rings ─
  {
    id: 7342, name: 'Radiant Mastery', slot: 'Ring',
    stat: 'mastery', primaryRating: 804,
    sentinelRank: 2, packLeaderRank: 1,
    notes: '+804 Mastery per ring. Pack Leader: run 2× Radiant Mastery for maximum Spirit Bond value. Sentinel: 1× Mastery + 1× Crit is optimal.',
  },
  {
    id: 7344, name: 'Radiant Crit', slot: 'Ring',
    stat: 'crit', primaryRating: 804,
    sentinelRank: 1, packLeaderRank: 2,
    notes: '+804 Crit Strike per ring. Sentinel BiS ring enchant — stack with Radiant Mastery on the other ring. Pack Leader can use if crit is lower than mastery.',
  },
  {
    id: 7343, name: 'Radiant Haste', slot: 'Ring',
    stat: 'haste', primaryRating: 804,
    sentinelRank: 3, packLeaderRank: 3,
    notes: '+804 Haste per ring. Use only if significantly haste capped vs crit/mastery.',
  },
  {
    id: 7345, name: 'Radiant Versatility', slot: 'Ring',
    stat: 'vers', primaryRating: 804,
    sentinelRank: 3, packLeaderRank: 3,
    notes: '+804 Versatility. Worst ring enchant for DPS — flat multiplier scales least with Survival talents.',
  },
];

// ── Gems ─────────────────────────────────────────────────────

export interface GemDef {
  id: number;
  name: string;
  stat: 'crit' | 'haste' | 'mastery' | 'vers' | 'agi' | 'mixed' | 'unique';
  primaryRating: number;
  isUnique: boolean;
  socketBonus?: number;   // extra stat when socketed (socket activation bonus)
  sentinelRank: 1 | 2 | 3;
  packLeaderRank: 1 | 2 | 3;
  notes: string;
}

export const MIDNIGHT_GEMS: GemDef[] = [
  {
    id: 213743,
    name: 'Elusive Blasphemite',
    stat: 'unique',
    primaryRating: 0,
    isUnique: true,
    socketBonus: 6,  // +6 of ALL secondaries per gem slot filled
    sentinelRank: 1,
    packLeaderRank: 1,
    notes: 'UNIQUE — equip in 1 socket. Grants +6 of all secondary stats for every gem socketed in your gear. With 5–8 total gem sockets, this adds 30–48 of EACH secondary. Always socket this first.',
  },
  {
    id: 213748,
    name: "Deadly Onyx",
    stat: 'mastery',
    primaryRating: 0,
    isUnique: false,
    socketBonus: 0,
    sentinelRank: 3,
    packLeaderRank: 1,
    notes: 'Fills remaining sockets for Pack Leader after Blasphemite. Mastery is highest value secondary for Pack Leader due to pet damage scaling. Use in all non-unique sockets.',
  },
  {
    id: 213746,
    name: "Culminating Blasphemite",
    stat: 'unique',
    primaryRating: 0,
    isUnique: true,
    socketBonus: 3,
    sentinelRank: 1,
    packLeaderRank: 1,
    notes: 'UNIQUE second Blasphemite variant (if both exist in-game at same time, slot the one with higher all-stat bonus). Same socket-bonus mechanic.',
  },
  {
    id: 213749,
    name: "Fractured Sapphire",
    stat: 'haste',
    primaryRating: 0,
    isUnique: false,
    socketBonus: 0,
    sentinelRank: 3,
    packLeaderRank: 3,
    notes: 'Haste gem. Use only if deeply haste-deficient. Generally outclassed by Crit (Sentinel) or Mastery (Pack Leader).',
  },
  {
    id: 213747,
    name: "Queen's Ruby",
    stat: 'crit',
    primaryRating: 0,
    isUnique: false,
    socketBonus: 0,
    sentinelRank: 1,
    packLeaderRank: 2,
    notes: "Fills remaining sockets for Sentinel after Blasphemite. Crit is Sentinel's highest-value secondary — Lethal Calibration, Vulnerability, Stargazer, Moonlight Chakram all scale with crit damage. Use in all non-unique sockets.",
  },
  {
    id: 213745,
    name: "Versatile Aquamarine",
    stat: 'vers',
    primaryRating: 0,
    isUnique: false,
    socketBonus: 0,
    sentinelRank: 3,
    packLeaderRank: 3,
    notes: 'Versatility gem. Never use for pure DPS — vers scales weakest of all secondaries for Survival Hunter.',
  },
];

// ── Rings (BiS ring stat combinations) ──────────────────────

export interface RingDef {
  id: number;
  name: string;
  source: string;
  ilvl: number;
  stat1: string;
  stat1Rating: number;
  stat2: string;
  stat2Rating: number;
  sentinelRank: 1 | 2 | 3;
  packLeaderRank: 1 | 2 | 3;
  notes: string;
}

export const MIDNIGHT_RINGS: RingDef[] = [
  {
    id: 225650,
    name: "Signet of the Midnight Hunt",
    source: "Midnight Raid — Final Wing Boss",
    ilvl: 276,
    stat1: 'Mastery', stat1Rating: 1240,
    stat2: 'Critical Strike', stat2Rating: 980,
    sentinelRank: 1,
    packLeaderRank: 1,
    notes: "BiS ring for both specs — Mastery+Crit combination maximizes Spirit Bond + Lethal Calibration + Vulnerability. Highest combined stat budget at 276 ilvl.",
  },
  {
    id: 225651,
    name: "Kroluk's Eternal Band",
    source: "Midnight Raid — Kroluk, Midnight Tyrant",
    ilvl: 276,
    stat1: 'Mastery', stat1Rating: 1180,
    stat2: 'Haste', stat2Rating: 1040,
    sentinelRank: 2,
    packLeaderRank: 2,
    notes: "Second-best ring for both specs. Mastery+Haste — useful if you need haste to reach rotation breakpoints. Pack Leader: more KC casts → more beast procs. Sentinel: WFB CD reduction via 2pc tier scales with haste.",
  },
  {
    id: 225652,
    name: "Xal'atath's Cursed Seal",
    source: "Midnight Raid — Xal'atath, Shard of the Void",
    ilvl: 276,
    stat1: 'Critical Strike', stat1Rating: 1360,
    stat2: 'Versatility', stat2Rating: 860,
    sentinelRank: 2,
    packLeaderRank: 3,
    notes: "Sentinel: High Crit total is appealing with Moonlight Chakram + Vulnerability, but Vers is wasted budget. Pack Leader: weak — Vers and no Mastery makes this a downgrade vs Kroluk's Band.",
  },
  {
    id: 225653,
    name: "Void Ranger's Circlet",
    source: "M+ Dungeons — Hero track (+2–+6, max 276) or Myth track (+7+, max 289)",
    ilvl: 276,
    stat1: 'Mastery', stat1Rating: 1180,
    stat2: 'Critical Strike', stat2Rating: 980,
    sentinelRank: 3,
    packLeaderRank: 3,
    notes: "M+ alternative at Hero track 276 (or 289 Myth from +7+ vault). Same stat combo as BiS raid ring at equivalent ilvl — use while farming raid rings or as swap piece using slot discount.",
  },
];

// ── BiS Gear Lists ───────────────────────────────────────────

export interface BiSStatLine { name: string; value: number; }

export interface BiSSlot {
  slot: string;
  itemName: string;
  source: string;
  /** Hero-track ilvl (Heroic Raid or M+ +2–+6 fully upgraded) */
  ilvl: number;
  /** Myth-track ilvl if accessible via Mythic Raid / M+ +7+ vault (usually 289) */
  mythIlvl?: number;
  keyStats: string;
  notes: string;
  /** Stat budget at Hero-track ilvl. Scales ~4.7% higher at Myth (289). */
  statBudget?: {
    agility?: number;
    stamina?: number;
    secondaries: BiSStatLine[];
  };
  /** Equip / special effect shown on the tooltip (proc description, unique passive, etc.) */
  equipText?: string;
  /** Links to a MIDNIGHT_TRINKETS entry by id for full proc/on-use data. */
  trinketId?: number;
}

// ── Stat budgets at ilvl 276 (Hero Rank 6) ──────────────────
// Slot size determines the budget tier. Each secondary stat listed in order
// of allocation (higher value = first stat shown on item).
// Source: Blizzard item budget formula extrapolated to ilvl 276.
// Myth-track (289) scales all values ×1.047 (~4.7% more per stat).
const B = {
  large:   (s1: string, s2: string) => ({ agility:1050, stamina:1580, secondaries:[{name:s1,value:900},{name:s2,value:600}] }),
  medium:  (s1: string, s2: string) => ({ agility:900,  stamina:1350, secondaries:[{name:s1,value:760},{name:s2,value:510}] }),
  small:   (s1: string, s2: string) => ({ agility:680,  stamina:1020, secondaries:[{name:s1,value:575},{name:s2,value:385}] }),
  neck:    (s1: string, s2: string) => ({ agility:undefined, stamina:1020, secondaries:[{name:s1,value:700},{name:s2,value:460}] }),
  ring:    (s1: string, s2: string) => ({ agility:undefined, stamina:undefined, secondaries:[{name:s1,value:760},{name:s2,value:505}] }),
  weapon2h:() => ({ agility:2200, stamina:3300, secondaries:[] as BiSStatLine[] }),
  weapon1h:() => ({ agility:1100, stamina:1650, secondaries:[] as BiSStatLine[] }),
};

export function getBiSList(hero: HeroTalent): BiSSlot[] {
  // ilvl = Hero track max (276) from Heroic Raid — upgrade to 289 via Myth track (Mythic Raid)
  const shared: BiSSlot[] = [
    {
      slot: 'Head', itemName: 'Crown of the Midnight Hunt', ilvl: 276, mythIlvl: 289,
      source: 'Midnight Raid Tier — Final Boss (Hero 276 / Myth 289)',
      keyStats: 'Mastery + Crit',
      notes: '4pc tier piece. Priority over any non-tier item.',
      statBudget: B.medium('Mastery', 'Critical Strike'),
      equipText: 'Part of the Survival Hunter Season 1 Tier Set.',
    },
    {
      slot: 'Shoulders', itemName: 'Spaulders of the Midnight Hunt', ilvl: 276, mythIlvl: 289,
      source: 'Midnight Raid Tier — Wing 2 Boss (Hero 276 / Myth 289)',
      keyStats: 'Mastery + Haste',
      notes: '4pc tier piece.',
      statBudget: B.medium('Mastery', 'Haste'),
      equipText: 'Part of the Survival Hunter Season 1 Tier Set.',
    },
    {
      slot: 'Chest', itemName: 'Breastplate of the Midnight Hunt', ilvl: 276, mythIlvl: 289,
      source: 'Midnight Raid Tier — Wing 1 Boss (Hero 276 / Myth 289)',
      keyStats: 'Mastery + Crit',
      notes: '4pc tier piece.',
      statBudget: B.large('Mastery', 'Critical Strike'),
      equipText: 'Part of the Survival Hunter Season 1 Tier Set.',
    },
    {
      slot: 'Hands', itemName: 'Gauntlets of the Midnight Hunt', ilvl: 276, mythIlvl: 289,
      source: 'Midnight Raid Tier — Heroic Boss (Hero track, max 276)',
      keyStats: 'Mastery + Vers',
      notes: '4pc tier piece. Heroic-difficulty boss required for this piece.',
      statBudget: B.medium('Mastery', 'Versatility'),
      equipText: 'Part of the Survival Hunter Season 1 Tier Set.',
    },
    {
      slot: 'Legs', itemName: 'Legguards of the Midnight Hunt', ilvl: 276, mythIlvl: 289,
      source: 'Midnight Raid Tier — Wing 3 Boss (Hero 276 / Myth 289)',
      keyStats: 'Mastery + Haste',
      notes: '4pc tier piece. Complete 4pc before pursuing off-set.',
      statBudget: B.large('Mastery', 'Haste'),
      equipText: 'Part of the Survival Hunter Season 1 Tier Set.',
    },
    {
      slot: 'Neck', itemName: "Kroluk's Trophy Chain", ilvl: 276, mythIlvl: 289,
      source: 'Midnight Raid — Kroluk (Hero 276 / Myth 289)',
      keyStats: 'Mastery + Crit',
      notes: 'Neck with unique +2% Crit proc on kill. No enchant slot.',
      statBudget: B.neck('Mastery', 'Critical Strike'),
      equipText: 'Equip: Your Kill Shot and Raptor Strike critical strikes trigger Midnight\'s Resonance, granting +2% Critical Strike for 10s.',
    },
    {
      slot: 'Back', itemName: 'Shadowsworn Ranger Cloak', ilvl: 276, mythIlvl: 289,
      source: 'Midnight Raid — Wing 1 (Hero 276 / Myth 289)',
      keyStats: 'Agility + Mastery',
      notes: 'Enchant: Winged Grace.',
      statBudget: B.small('Mastery', 'Agility'),
    },
    {
      slot: 'Wrist', itemName: 'Voidcaller Bracers', ilvl: 276, mythIlvl: 289,
      source: 'Midnight Raid — Council Boss (Hero 276 / Myth 289)',
      keyStats: 'Agility + Mastery',
      notes: 'Enchant: +16 Agility.',
      statBudget: B.small('Mastery', 'Agility'),
    },
    {
      slot: 'Waist', itemName: "Huntmaster's Voidstalker Belt", ilvl: 276, mythIlvl: 289,
      source: 'Midnight Raid — Wing 2 Boss (Hero 276 / Myth 289)',
      keyStats: 'Mastery + Crit',
      notes: 'Socket: Elusive Blasphemite or Queen\'s Ruby/Deadly Onyx.',
      statBudget: B.small('Mastery', 'Critical Strike'),
      equipText: 'Socket: Gem slot — Elusive Blasphemite (tertiary stats) or Queen\'s Ruby / Deadly Onyx (Agility).',
    },
    {
      slot: 'Boots', itemName: "Stalker's Twilight Treads", ilvl: 276, mythIlvl: 289,
      source: 'Midnight Raid — Wing 1 Boss (Hero 276 / Myth 289)',
      keyStats: 'Mastery + Haste',
      notes: "Enchant: Cavalry's March (Pack Leader) or Scout's March (Sentinel AoE).",
      statBudget: B.small('Mastery', 'Haste'),
    },
    {
      slot: 'Ring 1', itemName: 'Signet of the Midnight Hunt', ilvl: 276, mythIlvl: 289,
      source: 'Midnight Raid — Final Wing Boss (Hero 276 / Myth 289)',
      keyStats: 'Mastery + Crit',
      notes: 'Enchant: Radiant Crit (Sentinel) or Radiant Mastery (Pack Leader).',
      statBudget: B.ring('Mastery', 'Critical Strike'),
    },
    {
      slot: 'Ring 2', itemName: "Kroluk's Eternal Band", ilvl: 276, mythIlvl: 289,
      source: 'Midnight Raid — Kroluk (Hero 276 / Myth 289)',
      keyStats: 'Mastery + Haste',
      notes: 'Enchant: Radiant Mastery. Both rings should have ring enchants.',
      statBudget: B.ring('Mastery', 'Haste'),
    },
    {
      slot: 'Trinket 1', itemName: 'Abyssal Night Effigy', ilvl: 276, mythIlvl: 289,
      source: "Midnight Raid — Xal'atath (Hero 276 / Myth 289)",
      keyStats: 'Passive Agi + Stacking Agility proc',
      notes: 'Best sustained damage trinket for both specs.',
      trinketId: 225601,
    },
  ];

  const sentinelSpecific: BiSSlot[] = [
    {
      slot: 'Main Hand', itemName: 'Spear of the Midnight Sentinel', ilvl: 276, mythIlvl: 289,
      source: 'Midnight Raid — Final Boss (Hero 276 / Myth 289)',
      keyStats: 'Agility 2H Polearm',
      notes: 'Sentinel: 2H weapon required. Enchant: Authority of Radiant Power (+Crit).',
      statBudget: B.weapon2h(),
      equipText: 'Equip: Your Sentinel\'s Mark has a chance to call down an empowered Lunar Storm, dealing bonus Shadow damage and refreshing Lethal Calibration.',
    },
    {
      slot: 'Trinket 2', itemName: "Moonwarden's Focal Lens", ilvl: 276, mythIlvl: 289,
      source: 'Midnight Raid — Kroluk, Heroic Boss (Hero 276 / Myth 289)',
      keyStats: 'On-use Crit +3640',
      notes: 'Sentinel BiS trinket #2 — aligns with Moonlight Chakram + Takedown window for peak burst.',
      trinketId: 225600,
    },
  ];

  const packLeaderSpecific: BiSSlot[] = [
    {
      slot: 'Main Hand', itemName: "Voidhunter's Blade", ilvl: 276, mythIlvl: 289,
      source: 'Midnight Raid — Wing 2 Boss (Hero 276 / Myth 289)',
      keyStats: 'Agility 1H Axe',
      notes: 'Pack Leader: can dual-wield. Enchant: Stonebound Artistry (+Mastery) on each weapon.',
      statBudget: B.weapon1h(),
      equipText: 'Equip: Your Kill Command has a chance to summon a Spectral Void Wolf that fights by your side for 8s, dealing 120% AP in shadow damage.',
    },
    {
      slot: 'Off Hand', itemName: "Dagger of the Pack", ilvl: 276, mythIlvl: 289,
      source: 'Midnight Raid — Council Boss (Hero 276 / Myth 289)',
      keyStats: 'Agility 1H Dagger',
      notes: 'Off-hand slot unlocked with Pack Leader DW. Enchant: Stonebound Artistry.',
      statBudget: B.weapon1h(),
      equipText: 'Equip: Off-hand auto-attacks trigger Strike as One, causing your pet to immediately perform a basic attack that generates 1 additional Focus.',
    },
    {
      slot: 'Trinket 2', itemName: "Ranger's Precision Stone", ilvl: 276, mythIlvl: 289,
      source: 'Midnight Raid — Eternal Hunt Council (Hero 276 / Myth 289)',
      keyStats: 'On-use Mastery +3920',
      notes: 'Pack Leader BiS trinket #2 — +3920 Mastery amplifies pet damage scaling during burst window.',
      trinketId: 225603,
    },
  ];

  return [
    ...shared,
    ...(hero === 'sentinel' ? sentinelSpecific : packLeaderSpecific),
  ].sort((a, b) => {
    const order = ['Head','Neck','Shoulders','Back','Chest','Wrist','Hands','Waist','Legs','Boots','Ring 1','Ring 2','Trinket 1','Trinket 2','Main Hand','Off Hand'];
    return order.indexOf(a.slot) - order.indexOf(b.slot);
  });
}

// ── Tier set per-hero-talent analysis ───────────────────────

export interface TierSetHeroAnalysis {
  hero: HeroTalent;
  twoPcMechanic: string;
  twoPcSynergy: string;
  fourPcMechanic: string;
  fourPcSynergy: string;
  keyInteractions: string[];
  statPriorityShift: string;
}

export const TIER_SET_HERO_ANALYSIS: Record<HeroTalent, TierSetHeroAnalysis> = {
  sentinel: {
    hero: 'sentinel',
    twoPcMechanic: 'Kill Command crits reduce Wildfire Bomb CD by 1s each.',
    twoPcSynergy: 'Sentinel: WFB fires ~43% more often with 2pc (+5–6 extra WFBs per fight minute). Each extra WFB triggers Lethal Calibration (+15% WFB crit damage buff). More WFBs = more Lethal Calibration uptime = more Moonlight Chakram and Takedown burst value during the window.',
    fourPcMechanic: 'Wildfire Bomb detonations have 20% chance to reset Boomstick CD.',
    fourPcSynergy: 'Sentinel: Boomstick effective CD drops from 60s → ~46s. Each extra Boomstick hit → 1 Mongoose Fury stack (Mongoose Rounds) → amplifies next RS burst. Also: Boomstick crits during Lethal Calibration window are amplified by both Vulnerability (+20% crit dmg) and Lethal Calibration (+15% crit dmg). 4pc fundamentally shifts Vulnerability from "good" to "mandatory" for Sentinel.',
    keyInteractions: [
      'Lethal Calibration + 4pc Boomstick: extra Boomsticks fire inside LC window (~80% of extra Boomsticks land during active LC buff)',
      'Moonlight Chakram timing: use immediately after Boomstick to catch Lethal Calibration + any crit damage buffs',
      'Sentinel Mark proc rate (20% base, 30% w/ Moon\'s Blessing): more RS from Mongoose Fury stacks = more Sentinel Mark procs = more Lunar Storm',
      '2pc KC crit → WFB reduction: KC priority is absolute with 2pc — never delay KC even by 1 GCD',
    ],
    statPriorityShift: 'With 4pc active: Crit rises above Mastery as second stat after Agility. Boomstick crits + LC window + Vulnerability stack multiplicatively with crit%. Moonwarden\'s Focal Lens becomes clear BiS #2 trinket.',
  },
  packLeader: {
    hero: 'packLeader',
    twoPcMechanic: 'Kill Command crits reduce Wildfire Bomb CD by 1s each.',
    twoPcSynergy: 'Pack Leader: KC is the #1 priority ability (generates beast procs via Howl of the Pack Leader). 2pc makes KC crit rate even more valuable — each KC crit does double duty (beast proc trigger + WFB CD reduction). Haste becomes more valuable with 2pc: more KC casts per minute = more crits = more WFB CD reduction.',
    fourPcMechanic: 'Wildfire Bomb detonations have 20% chance to reset Boomstick CD.',
    fourPcSynergy: 'Pack Leader: Extra Boomstick from 4pc proc fires during Stampede windows where Pack Leader beast summons are already active. Each Boomstick channel also triggers Strike as One (pet hits) which is amplified by Pack Leader\'s Lethal Barbs (auto-attacks generate 2 Focus each → more KC casts in the window). Beast procs spawned by Howl of the Pack Leader also gain from Mastery: Spirit Bond, making mastery scale 3 sources simultaneously.',
    keyInteractions: [
      'Howl of the Pack Leader: triggers bear/wyvern/boar on KC use — with haste from 2pc enabling more KC, this fires beasts more often',
      'Stampede capstone: use Takedown to proc Stampede beast rush — align with any Boomstick resets from 4pc for maximum beast + Boomstick overlap',
      'Mastery × Pet scaling: Spirit Bond gives 0.6% pet damage per mastery% — Abyssal Night Effigy stacking proc pushes effective mastery to 45%+',
      'Shell Cover (defensive node): with 4pc, you can sometimes take Shell Cover over DPS node since defensive value in progression is real',
    ],
    statPriorityShift: 'With 4pc active: Mastery stays #1 secondary (pet damage scaling from beasts + Strike as One scales with mastery). Haste rises to #2 (more KC = more beast procs). Crit is #3 — less Crit synergy nodes than Sentinel. Ranger\'s Precision Stone trinket (+3920 Mastery on-use) is clear BiS #2.',
  },
};

// ── Stat priority per hero ───────────────────────────────────

export interface StatPriorityDef {
  stat: string;
  stPriority: number;   // 1 = best
  aoePriority: number;
  reasoning: string;
  hardCap?: string;     // e.g. "don't exceed 25% haste"
}

export const STAT_PRIORITY: Record<HeroTalent, StatPriorityDef[]> = {
  sentinel: [
    { stat: 'Agility', stPriority: 1, aoePriority: 1,
      reasoning: 'Scales all physical damage and Attack Power. Always #1 — no cap, no diminishing returns at heroic ilvl.' },
    { stat: 'Critical Strike', stPriority: 2, aoePriority: 3,
      reasoning: 'ST #2 for Sentinel: Moonlight Chakram, Lethal Calibration, Vulnerability, and Stargazer all scale multiplicatively with crit%. With 4pc tier, Boomstick resets make crit even stronger. Target: 28–32% crit.',
      hardCap: 'Soft ceiling ~35% — beyond that, Mastery gains more value per rating' },
    { stat: 'Mastery (Spirit Bond)', stPriority: 3, aoePriority: 2,
      reasoning: 'Scales both player (+0.4%/mastery%) and pet damage (+0.6%/mastery%). AoE #2 because Wildfire Bomb and Flamefang Pitch DoTs both benefit. Target: 35–42% mastery.' },
    { stat: 'Haste', stPriority: 4, aoePriority: 2,
      reasoning: 'AoE: scales Kill Command CPM → more 2pc WFB CD reduction → more bombs. ST: scales RS and KC GCDs but lower DPS value than Crit/Mastery. Target: 14–18% haste.' },
    { stat: 'Versatility', stPriority: 5, aoePriority: 5,
      reasoning: 'Flat damage multiplier — weakest scaling of all secondaries for Survival since no talent multiplies it. Take freely from item stats but never gem/enchant for it.' },
  ],
  packLeader: [
    { stat: 'Agility', stPriority: 1, aoePriority: 1,
      reasoning: 'Always #1 — see Sentinel. Agility also scales pet AP (60% of player AP) making it doubly valuable for Pack Leader.' },
    { stat: 'Mastery (Spirit Bond)', stPriority: 2, aoePriority: 2,
      reasoning: 'Pack Leader #1 secondary: Spirit Bond gives 0.6% pet damage per mastery% — bears, boars, wyverns from Howl of the Pack Leader all scale. With Stampede active, mastery amplifies 4+ beast sources simultaneously. Target: 38–45% mastery.',
      hardCap: 'No hard cap — mastery scales linearly for Pack Leader with no diminishing returns' },
    { stat: 'Haste', stPriority: 3, aoePriority: 2,
      reasoning: 'More KC casts per minute = more Howl of the Pack Leader beast spawns. Scales 2pc tier WFB CD reduction more efficiently than other secondaries. Target: 16–20% haste.' },
    { stat: 'Critical Strike', stPriority: 4, aoePriority: 4,
      reasoning: 'Fewer crit-scaling talent nodes than Sentinel (no Vulnerability/Stargazer/Moonlight Chakram). Still valuable for Boomstick and KC crits (2pc trigger). Target: 22–26% crit.' },
    { stat: 'Versatility', stPriority: 5, aoePriority: 5,
      reasoning: 'Flat multiplier — same reasoning as Sentinel. Lowest priority. Shell Cover (defensive node) makes vers somewhat useful in progression but not for parsing.' },
  ],
};

// ── Ranking functions ────────────────────────────────────────

export interface RankedTrinket extends TrinketDef {
  estimatedDps: number;
  rank: number;
  sentinelDps: number;
  packLeaderDps: number;
}

/**
 * Compute estimated DPS contribution of a trinket given stat weights.
 * On-use: uptime = duration / CD. Proc: use procUptime.
 * Burst-alignable on-use trinkets get +12% effective multiplier.
 */
export function estimateTrinketDps(
  trinket: TrinketDef,
  weights: StatWeights,
  hero: HeroTalent,
): number {
  let dps = 0;

  // Passive primary stat
  if (trinket.primaryAgi > 0) {
    dps += trinket.primaryAgi * weights.agilityDps;
  }

  // On-use secondary stat
  if (trinket.onUseStat && trinket.onUseAmount && trinket.onUseDuration && trinket.onUseCD) {
    const uptime = trinket.onUseDuration / trinket.onUseCD;
    const statDps = trinket.onUseAmount * uptime * weights[`${trinket.onUseStat}Dps` as keyof StatWeights] as number;
    const burstBonus = trinket.burstAlignable ? 1.12 : 1.0;
    dps += statDps * burstBonus;
  }

  // On-use agility
  if (trinket.onUseAgi && trinket.onUseDuration && trinket.onUseCD) {
    const uptime = trinket.onUseDuration / trinket.onUseCD;
    const agiDps = trinket.onUseAgi * uptime * weights.agilityDps;
    const burstBonus = trinket.burstAlignable ? 1.12 : 1.0;
    dps += agiDps * burstBonus;
  }

  // Proc secondary stat
  if (trinket.procStat && trinket.procAmount && trinket.procUptime) {
    if (trinket.procStat === 'agi') {
      dps += trinket.procAmount * trinket.procUptime * weights.agilityDps;
    } else {
      const w = weights[`${trinket.procStat}Dps` as keyof StatWeights] as number;
      dps += trinket.procAmount * trinket.procUptime * w;
    }
  }

  // Direct damage proc
  if (trinket.dmgApCoef && trinket.dmgCPM) {
    // Modeled as (AP coef × AP contribution) — rough: AP ~ 3680 at 276 ilvl
    // DPS = (AP × coef × cpm) / 60 × crit scalar
    const ap = 3_490;
    const critFrac = 0.254; // 25.4% crit at 276 Hero track
    const critScalar = 1 + critFrac * (2.0 - 1);
    dps += (ap * trinket.dmgApCoef * trinket.dmgCPM / 60) * critScalar;
  }

  return Math.round(dps);
}

export function rankTrinkets(weights: StatWeights, hero: HeroTalent): RankedTrinket[] {
  const ranked = MIDNIGHT_TRINKETS.map((t): RankedTrinket => {
    const estimatedDps = estimateTrinketDps(t, weights, hero);
    return {
      ...t,
      estimatedDps,
      sentinelDps: estimateTrinketDps(t, weights, 'sentinel'),
      packLeaderDps: estimateTrinketDps(t, weights, 'packLeader'),
      rank: 0,
    };
  });

  ranked.sort((a, b) => b.estimatedDps - a.estimatedDps);
  ranked.forEach((r, i) => { r.rank = i + 1; });
  return ranked;
}

export interface RankedEnchant extends EnchantDef {
  estimatedDps: number;
}

export function rankEnchantsForSlot(slot: string, weights: StatWeights, hero: HeroTalent): RankedEnchant[] {
  const slotEnchants = MIDNIGHT_ENCHANTS.filter(e => e.slot === slot);
  return slotEnchants
    .map((e): RankedEnchant => {
      let dps = 0;
      if (e.stat === 'agi') {
        dps = e.primaryRating * weights.agilityDps;
      } else if (e.stat === 'crit') {
        dps = e.primaryRating * weights.critDps;
      } else if (e.stat === 'haste') {
        dps = e.primaryRating * weights.hasteDps;
      } else if (e.stat === 'mastery') {
        dps = e.primaryRating * weights.masteryDps;
      } else if (e.stat === 'vers') {
        dps = e.primaryRating * weights.versDps;
      } else if (e.stat === 'mixed') {
        // Mixed: assume ~equal split, use average stat weight
        const avg = (weights.critDps + weights.hasteDps + weights.masteryDps + weights.versDps) / 4;
        dps = (e.primaryRating || (e.secondaryRating ?? 0) * 4) * avg;
      }
      return { ...e, estimatedDps: Math.round(dps) };
    })
    .sort((a, b) => b.estimatedDps - a.estimatedDps);
}

// All distinct enchant slots
export const ENCHANT_SLOTS = ['Weapon', 'Chest', 'Cloak', 'Wrist', 'Legs', 'Boots', 'Ring'];
