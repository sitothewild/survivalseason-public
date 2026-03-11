// ─────────────────────────────────────────────────────────────
// engine/consumables.ts
// All consumable, weapon enhancement, and buff definitions
// with real stat values for Midnight 12.0 Season 1.
// ─────────────────────────────────────────────────────────────

// ── Phials (flask slot) ──────────────────────────────────────

export interface PhialDef {
  key: string;
  name: string;
  stat: "crit" | "haste" | "mastery" | "vers" | "agi" | "mixed";
  /** Flat rating added for the duration of the buff */
  ratingAmount: number;
  /** For "mixed" phials: mapping of stat → amount */
  mixedRatings?: Partial<Record<string, number>>;
  /** If the phial has an on-proc mechanic instead of flat stat */
  isProcBased?: boolean;
  /** Proc uptime for proc-based phials (0-1) */
  procUptime?: number;
  notes: string;
}

export const PHIALS: PhialDef[] = [
  {
    key: "fleeting_magisters",
    name: "Fleeting Flask of the Magisters",
    stat: "mixed",
    ratingAmount: 0,
    mixedRatings: { crit: 430, haste: 430, mastery: 430, vers: 0 },
    isProcBased: true,
    procUptime: 0.33,
    notes: "BiS flask. Randomly buffs Crit, Haste, or Mastery by ~430 rating. High total budget.",
  },
  {
    key: "fleeting_alacrity",
    name: "Fleeting Flask of Alacrity",
    stat: "haste",
    ratingAmount: 580,
    notes: "+580 Haste. Use if you need consistent haste.",
  },
  {
    key: "fleeting_determination",
    name: "Fleeting Flask of Determination",
    stat: "agi",
    ratingAmount: 360,
    notes: "Flat +360 Agility. Simpler than Magisters but slightly less total value.",
  },
];

// ── Food Buffs ──────────────────────────────────────────────

export interface FoodDef {
  key: string;
  name: string;
  stat: "crit" | "haste" | "mastery" | "vers";
  ratingAmount: number;
  notes: string;
}

export const FOOD_BUFFS: FoodDef[] = [
  {
    key: "silvermoon_parade",
    name: "Silvermoon Parade",
    stat: "mastery",
    ratingAmount: 90,
    notes: "BiS food. +90 Mastery. Best for both Pack Leader and Sentinel.",
  },
  {
    key: "thalassian_feast",
    name: "Thalassian Feast",
    stat: "crit",
    ratingAmount: 90,
    notes: "+90 Crit. Alternative when crit is your highest weight.",
  },
  {
    key: "amani_feast",
    name: "Amani Feast",
    stat: "haste",
    ratingAmount: 90,
    notes: "+90 Haste. Use if haste is top stat weight (uncommon).",
  },
  {
    key: "farstrider_rations",
    name: "Farstrider's Rations",
    stat: "vers",
    ratingAmount: 90,
    notes: "+90 Versatility. Defensive. Not recommended for DPS.",
  },
];

// ── Potions ─────────────────────────────────────────────────

export interface PotionDef {
  key: string;
  name: string;
  stat: "agi" | "crit" | "haste" | "mastery" | "vers";
  /** Rating added during the potion window */
  ratingAmount: number;
  /** Duration in seconds */
  durationSec: number;
  /** Cooldown — usually once per combat */
  cooldownSec: number;
  notes: string;
}

export const POTIONS: PotionDef[] = [
  {
    key: "lights_potential",
    name: "Light's Potential",
    stat: "agi",
    ratingAmount: 3648,
    durationSec: 30,
    cooldownSec: 300,
    notes: "+3648 Agility for 30s. BiS combat potion. Use on pull aligned with Takedown.",
  },
  {
    key: "silvermoon_health",
    name: "Silvermoon Health Potion",
    stat: "agi",
    ratingAmount: 0,
    durationSec: 0,
    cooldownSec: 300,
    notes: "Health potion — no DPS. Use for emergency healing in progression.",
  },
];

// ── Weapon Enhancements (Oils / Stones) ─────────────────────

export interface WeaponEnhancementDef {
  key: string;
  name: string;
  type: "damage_proc" | "stat_proc" | "flat_stat";
  /** For flat stat: which stat and how much */
  stat?: "crit" | "haste" | "mastery" | "vers";
  ratingAmount?: number;
  /** For damage procs */
  dmgApCoef?: number;
  dmgCPM?: number;
  school?: "fire" | "nature" | "shadow" | "physical";
  /** For stat procs */
  procStat?: "crit" | "haste" | "mastery" | "vers" | "agi";
  procAmount?: number;
  procDurationSec?: number;
  procUptime?: number;
  notes: string;
}

export const WEAPON_ENHANCEMENTS: WeaponEnhancementDef[] = [
  {
    key: "thalassian_phoenix_oil",
    name: "Thalassian Phoenix Oil",
    type: "damage_proc",
    dmgApCoef: 0.35,
    dmgCPM: 9.0,
    school: "fire",
    notes: "BiS weapon buff. Fire damage proc, ~9 PPM. Bypasses armor. Best overall weapon enhancement for Survival.",
  },
  {
    key: "amani_poison",
    name: "Amani Poison",
    type: "damage_proc",
    dmgApCoef: 0.28,
    dmgCPM: 10.0,
    school: "nature",
    notes: "Nature damage proc, ~10 PPM. Alternative to Phoenix Oil — slightly lower per-proc but higher frequency.",
  },
  {
    key: "silvermoon_whetstone",
    name: "Silvermoon Whetstone",
    type: "flat_stat",
    stat: "crit",
    ratingAmount: 168,
    notes: "+168 Crit Rating. Flat stat alternative to proc-based oils.",
  },
  {
    key: "farstrider_oil",
    name: "Farstrider's Oil",
    type: "flat_stat",
    stat: "mastery",
    ratingAmount: 124,
    notes: "+124 Mastery Rating. Budget weapon enhancement for Pack Leader.",
  },
];

// ── Augment Runes ───────────────────────────────────────────

export interface AugmentRuneDef {
  key: string;
  name: string;
  stat: "agi";
  ratingAmount: number;
  notes: string;
}

export const AUGMENT_RUNES: AugmentRuneDef[] = [
  {
    key: "void_touched_augment_rune",
    name: "Void-Touched Augment Rune",
    stat: "agi",
    ratingAmount: 52,
    notes: "+52 Agility. Always use in raid. Persists through death.",
  },
];

// ── Raid Buffs ──────────────────────────────────────────────

export interface RaidBuffDef {
  key: string;
  name: string;
  /** How this buff is applied in the engine */
  type: "ap_mult" | "damage_mult" | "stat_pct" | "flat_stat";
  /** For multiplier buffs */
  multiplier?: number;
  /** For stat_pct: which stat and how much % */
  stat?: string;
  statPct?: number;
  notes: string;
}

export const RAID_BUFFS: RaidBuffDef[] = [
  {
    key: "battle_shout",
    name: "Battle Shout",
    type: "ap_mult",
    multiplier: 1.05,
    notes: "+5% Attack Power. Warrior/Evoker buff. Near-universal in raids.",
  },
  {
    key: "mark_of_the_wild",
    name: "Mark of the Wild",
    type: "stat_pct",
    stat: "vers",
    statPct: 3.0,
    notes: "+3% Versatility. Druid buff.",
  },
  {
    key: "mystic_touch",
    name: "Mystic Touch",
    type: "damage_mult",
    multiplier: 1.05,
    notes: "+5% physical damage taken by target. Monk debuff.",
  },
  {
    key: "hunters_mark",
    name: "Hunter's Mark",
    type: "damage_mult",
    multiplier: 1.05,
    notes: "+5% damage to marked target. Hunter debuff. Always applied.",
  },
  {
    key: "arcane_intellect",
    name: "Arcane Intellect",
    type: "flat_stat",
    notes: "+5% Intellect. No direct DPS benefit for Survival Hunter. Included for completeness.",
  },
  {
    key: "power_word_fortitude",
    name: "Power Word: Fortitude",
    type: "flat_stat",
    notes: "+5% Stamina. Survivability only. Priest buff.",
  },
];

// ── Enchant stat injection helpers ──────────────────────────

/** Stat rating a BiS enchant set adds to your character at Hero track */
export interface EnchantStatProfile {
  crit: number;
  haste: number;
  mastery: number;
  vers: number;
  agi: number;
}

/**
 * Calculate total stats from a set of active enchant slot selections.
 * Uses the MIDNIGHT_ENCHANTS data from gearOptimizer.ts.
 * This returns the stat rating to ADD to the player's base stats.
 */
export function calcEnchantStats(
  enchantKeys: Record<string, string>,
  enchants: Array<{ id: number; name: string; slot: string; stat: string; primaryRating: number; secondaryRating?: number }>,
): EnchantStatProfile {
  const result: EnchantStatProfile = { crit: 0, haste: 0, mastery: 0, vers: 0, agi: 0 };

  for (const [slot, enchantName] of Object.entries(enchantKeys)) {
    const enchant = enchants.find(e => e.slot === slot && e.name === enchantName);
    if (!enchant) continue;

    const rating = enchant.primaryRating || enchant.secondaryRating || 0;
    switch (enchant.stat) {
      case "crit": result.crit += rating; break;
      case "haste": result.haste += rating; break;
      case "mastery": result.mastery += rating; break;
      case "vers": result.vers += rating; break;
      case "agi": result.agi += rating; break;
      case "mixed":
        // Crystalline Radiance / Stormbound Armor Kit split equally
        const perStat = Math.round(rating / 4);
        result.crit += perStat;
        result.haste += perStat;
        result.mastery += perStat;
        result.vers += perStat;
        break;
    }
  }

  return result;
}

// ── Gem stat injection helpers ──────────────────────────────

export interface GemStatProfile {
  crit: number;
  haste: number;
  mastery: number;
  vers: number;
}

/** Midnight gem fill options with display names and stat ratings. */
export const GEM_FILL_OPTIONS = [
  // Single-stat gems (88 rating each) — "Flawless" cuts
  { key: "mastery",       label: "Masterful Garnet",       stat1: "mastery", stat2: null,     r1: 88, r2: 0  },
  { key: "crit",          label: "Deadly Onyx",            stat1: "crit",    stat2: null,     r1: 88, r2: 0  },
  { key: "haste",         label: "Quick Topaz",            stat1: "haste",   stat2: null,     r1: 88, r2: 0  },
  { key: "vers",          label: "Versatile Aquamarine",   stat1: "vers",    stat2: null,     r1: 88, r2: 0  },
  // Dual-stat gems (44+44 split) — "Algari" combo cuts
  { key: "mastery_crit",  label: "Masterful Ruby",         stat1: "mastery", stat2: "crit",   r1: 44, r2: 44 },
  { key: "mastery_haste", label: "Masterful Amethyst",     stat1: "mastery", stat2: "haste",  r1: 44, r2: 44 },
  { key: "mastery_vers",  label: "Masterful Sapphire",     stat1: "mastery", stat2: "vers",   r1: 44, r2: 44 },
  { key: "crit_mastery",  label: "Deadly Emerald",         stat1: "crit",    stat2: "mastery",r1: 44, r2: 44 },
  { key: "crit_haste",    label: "Deadly Amethyst",        stat1: "crit",    stat2: "haste",  r1: 44, r2: 44 },
  { key: "crit_vers",     label: "Deadly Sapphire",        stat1: "crit",    stat2: "vers",   r1: 44, r2: 44 },
  { key: "haste_mastery", label: "Quick Ruby",             stat1: "haste",   stat2: "mastery",r1: 44, r2: 44 },
  { key: "haste_crit",    label: "Quick Emerald",          stat1: "haste",   stat2: "crit",   r1: 44, r2: 44 },
  { key: "haste_vers",    label: "Quick Sapphire",         stat1: "haste",   stat2: "vers",   r1: 44, r2: 44 },
  { key: "vers_mastery",  label: "Versatile Ruby",         stat1: "vers",    stat2: "mastery",r1: 44, r2: 44 },
  { key: "vers_crit",     label: "Versatile Emerald",      stat1: "vers",    stat2: "crit",   r1: 44, r2: 44 },
  { key: "vers_haste",    label: "Versatile Sapphire",     stat1: "vers",    stat2: "haste",  r1: 44, r2: 44 },
] as const;

/**
 * Calculate total stats from gem configuration.
 * Supports single-stat (88 rating) and dual-stat (44+44 split) gems.
 * @param totalSockets Number of gem sockets in gear
 * @param primaryGemStat The stat key (e.g., "mastery" or "mastery_crit")
 * @param hasBlasphemite Whether Elusive Blasphemite is socketed
 * @param blasphemiteBonusPerSocket +6 all secondaries per socket (default 6)
 */
export function calcGemStats(
  totalSockets: number,
  primaryGemStat: string,
  hasBlasphemite: boolean = true,
  blasphemiteBonusPerSocket: number = 6,
): GemStatProfile {
  const result: GemStatProfile = { crit: 0, haste: 0, mastery: 0, vers: 0 };

  if (totalSockets <= 0) return result;

  // Blasphemite: +6 of each secondary per socket filled
  if (hasBlasphemite) {
    const bonusPerStat = totalSockets * blasphemiteBonusPerSocket;
    result.crit += bonusPerStat;
    result.haste += bonusPerStat;
    result.mastery += bonusPerStat;
    result.vers += bonusPerStat;
  }

  // Find the gem definition
  const gem = GEM_FILL_OPTIONS.find(g => g.key === primaryGemStat);
  const fillGems = hasBlasphemite ? totalSockets - 1 : totalSockets;

  if (gem) {
    result[gem.stat1 as keyof GemStatProfile] += fillGems * gem.r1;
    if (gem.stat2) {
      result[gem.stat2 as keyof GemStatProfile] += fillGems * gem.r2;
    }
  } else {
    // Fallback: treat as single mastery gem
    result.mastery += fillGems * 88;
  }

  return result;
}
