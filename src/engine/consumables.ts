// ─────────────────────────────────────────────────────────────
// engine/consumables.ts
// All consumable, weapon enhancement, and buff definitions
// with real stat values for Midnight 12.0 Season 1.
// ─────────────────────────────────────────────────────────────

// ── Phials (flask slot — TWW renamed flasks to phials) ──────

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
    key: "alchemical_chaos",
    name: "Flask of Alchemical Chaos",
    stat: "mixed",
    ratingAmount: 0,
    mixedRatings: { crit: 430, haste: 430, mastery: 430, vers: 0 },
    isProcBased: true,
    procUptime: 0.33, // randomly buffs one stat at a time
    notes: "Randomly buffs Crit, Haste, or Mastery by ~430 rating. Effective avg: ~143 of each. BiS for most builds due to high total budget.",
  },
  {
    key: "tempering_sanity",
    name: "Flask of Tempering Sanity",
    stat: "agi",
    ratingAmount: 360,
    notes: "Flat +360 Agility. Simpler than Alchemical Chaos but slightly less total value. Use if you prefer consistency.",
  },
  {
    key: "saving_grace",
    name: "Flask of Saving Grace",
    stat: "vers",
    ratingAmount: 580,
    notes: "+580 Versatility. Defensive/hybrid option. Not recommended for pure DPS.",
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
    key: "mastery_food",
    name: "Feast of the Midnight Masquerade (Mastery)",
    stat: "mastery",
    ratingAmount: 90,
    notes: "+90 Mastery. BiS food for Pack Leader and default Sentinel choice.",
  },
  {
    key: "crit_food",
    name: "Feast of the Midnight Masquerade (Crit)",
    stat: "crit",
    ratingAmount: 90,
    notes: "+90 Crit. Alternative for Sentinel when crit is highest weight.",
  },
  {
    key: "haste_food",
    name: "Feast of the Midnight Masquerade (Haste)",
    stat: "haste",
    ratingAmount: 90,
    notes: "+90 Haste. Use if haste is your top stat weight (uncommon).",
  },
  {
    key: "vers_food",
    name: "Feast of the Midnight Masquerade (Vers)",
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
    key: "tempered_potion",
    name: "Tempered Potion",
    stat: "agi",
    ratingAmount: 3648,
    durationSec: 30,
    cooldownSec: 300,
    notes: "+3648 Agility for 30s. Use on pull aligned with Takedown. Standard DPS potion.",
  },
  {
    key: "potion_of_unwavering_focus",
    name: "Potion of Unwavering Focus",
    stat: "agi",
    ratingAmount: 4860,
    durationSec: 25,
    cooldownSec: 300,
    notes: "+4860 Agility for 25s but you cannot move. Use on Patchwerk fights only.",
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
    key: "algari_mana_oil",
    name: "Algari Mana Oil",
    type: "flat_stat",
    stat: "crit",
    ratingAmount: 124,
    notes: "+124 Crit Rating. Cheap, always-on. Good default for melee.",
  },
  {
    key: "oil_of_deep_toxins",
    name: "Oil of Deep Toxins",
    type: "damage_proc",
    dmgApCoef: 0.32,
    dmgCPM: 8.5,
    school: "nature",
    notes: "Nature damage proc, ~8.5 PPM. Bypasses armor. Competitive with flat stat oils on long fights.",
  },
  {
    key: "bubbling_wax",
    name: "Bubbling Wax",
    type: "flat_stat",
    stat: "mastery",
    ratingAmount: 124,
    notes: "+124 Mastery Rating. Best for Pack Leader (Spirit Bond scaling).",
  },
  {
    key: "ironclaw_whetstone",
    name: "Ironclaw Whetstone",
    type: "flat_stat",
    stat: "crit",
    ratingAmount: 168,
    notes: "+168 Crit Rating. Higher budget weapon stone. BiS for Sentinel.",
  },
  {
    key: "howling_rune",
    name: "Howling Rune",
    type: "damage_proc",
    dmgApCoef: 0.28,
    dmgCPM: 10.0,
    school: "nature",
    notes: "Nature damage proc, ~10 PPM. Highest proc frequency weapon enhancement. Bypasses armor.",
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
    key: "crystallized_augment_rune",
    name: "Crystallized Augment Rune",
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

/**
 * Calculate total stats from gem configuration.
 * @param totalSockets Number of gem sockets in gear
 * @param primaryGemStat The stat of non-unique gems (crit/mastery/haste/vers)
 * @param hasBlasphemite Whether Elusive Blasphemite is socketed
 * @param blasphemiteBonusPerSocket +6 all secondaries per socket (default 6)
 */
export function calcGemStats(
  totalSockets: number,
  primaryGemStat: "crit" | "haste" | "mastery" | "vers",
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

  // Remaining sockets filled with primary gem (unique gem doesn't add base stat)
  // Each non-unique gem gives ~88 rating of its stat at Hero track
  const SECONDARY_GEM_RATING = 88;
  const fillGems = hasBlasphemite ? totalSockets - 1 : totalSockets;
  result[primaryGemStat] += fillGems * SECONDARY_GEM_RATING;

  return result;
}
