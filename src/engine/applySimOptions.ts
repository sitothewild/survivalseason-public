// ─────────────────────────────────────────────────────────────
// engine/applySimOptions.ts
// Resolves SimOptions → stat injections + damage multipliers.
// Modifies PlayerStats in-place with enchant, gem, consumable,
// weapon enhancement, and augment rune stat values.
// Returns ResolvedBuffMultipliers for raid buff damage modifiers.
// ─────────────────────────────────────────────────────────────

import type { PlayerStats, SimOptions, ResolvedBuffMultipliers, HeroTree } from "./types";
import {
  PHIALS,
  FOOD_BUFFS,
  POTIONS,
  WEAPON_ENHANCEMENTS,
  AUGMENT_RUNES,
  calcGemStats,
} from "./consumables";
import { MIDNIGHT_ENCHANTS, type HeroTalent } from "@/lib/gearOptimizer";

// ── Auto enchant selection ──────────────────────────────────

function getAutoEnchants(hero: HeroTree): Record<string, string> {
  const heroKey: HeroTalent = hero === "sentinel" ? "sentinel" : "packLeader";
  const result: Record<string, string> = {};

  // Group enchants by slot, pick rank 1 for the hero spec
  const bySlot = new Map<string, typeof MIDNIGHT_ENCHANTS[0][]>();
  for (const e of MIDNIGHT_ENCHANTS) {
    const arr = bySlot.get(e.slot) ?? [];
    arr.push(e);
    bySlot.set(e.slot, arr);
  }

  for (const [slot, enchants] of bySlot) {
    // Find the rank-1 enchant for this hero
    const best = enchants.find(e =>
      heroKey === "sentinel" ? e.sentinelRank === 1 : e.packLeaderRank === 1
    );
    if (best) {
      result[slot] = best.name;
    }
  }

  return result;
}

// ── Main apply function ─────────────────────────────────────

export interface ApplyResult {
  stats: PlayerStats;
  buffMults: ResolvedBuffMultipliers;
  /** Weapon enhancement damage proc info, if applicable */
  weaponProc?: {
    dmgApCoef: number;
    dmgCPM: number;
    school: string;
  };
  /** Potion aura to apply at pull */
  potionAura?: {
    stat: string;
    amount: number;
    durationMs: number;
  };
}

/**
 * Apply SimOptions to a copy of PlayerStats.
 * Returns modified stats + resolved buff multipliers.
 * Does NOT mutate the original stats object.
 */
export function applySimOptions(
  baseStats: PlayerStats,
  options: SimOptions,
  hero: HeroTree,
): ApplyResult {
  const stats: PlayerStats = {
    ...baseStats,
    weapon: { ...baseStats.weapon },
  };

  // Apply tier set from options
  stats.has2pc = options.has2pc;
  stats.has4pc = options.has4pc;

  // ── 1. Enchants ──────────────────────────────────────────
  const enchantMap = options.enchants === "auto"
    ? getAutoEnchants(hero)
    : options.enchants;

  for (const [slot, enchantName] of Object.entries(enchantMap)) {
    const enchant = MIDNIGHT_ENCHANTS.find(e => e.slot === slot && e.name === enchantName);
    if (!enchant) continue;

    const rating = enchant.primaryRating || enchant.secondaryRating || 0;
    if (rating === 0) continue;

    switch (enchant.stat) {
      case "crit": stats.critRating += rating; break;
      case "haste": stats.hasteRating += rating; break;
      case "mastery": stats.masteryRating += rating; break;
      case "vers": stats.versatilityRating += rating; break;
      case "agi":
        stats.agility += rating;
        // AP = Agility for hunters; no separate attackPower bump needed
        break;
      case "mixed": {
        const perStat = Math.round(rating / 4);
        stats.critRating += perStat;
        stats.hasteRating += perStat;
        stats.masteryRating += perStat;
        stats.versatilityRating += perStat;
        break;
      }
    }
  }

  // ── 2. Gems ──────────────────────────────────────────────
  const gemStats = calcGemStats(
    options.gems.totalSockets,
    options.gems.primaryStat,
    options.gems.hasBlasphemite,
  );
  stats.critRating += gemStats.crit;
  stats.hasteRating += gemStats.haste;
  stats.masteryRating += gemStats.mastery;
  stats.versatilityRating += gemStats.vers;

  // ── 3. Phial ─────────────────────────────────────────────
  if (options.phial !== "none") {
    const phial = PHIALS.find(p => p.key === options.phial);
    if (phial) {
      if (phial.isProcBased && phial.mixedRatings) {
        // Proc-based: apply effective average (uptime × amount)
        const uptime = phial.procUptime ?? 0.33;
        for (const [stat, amount] of Object.entries(phial.mixedRatings)) {
          const effective = Math.round((amount ?? 0) * uptime);
          switch (stat) {
            case "crit": stats.critRating += effective; break;
            case "haste": stats.hasteRating += effective; break;
            case "mastery": stats.masteryRating += effective; break;
            case "vers": stats.versatilityRating += effective; break;
          }
        }
      } else {
        switch (phial.stat) {
          case "agi":
            stats.agility += phial.ratingAmount;
            stats.attackPower += phial.ratingAmount;
            break;
          case "crit": stats.critRating += phial.ratingAmount; break;
          case "haste": stats.hasteRating += phial.ratingAmount; break;
          case "mastery": stats.masteryRating += phial.ratingAmount; break;
          case "vers": stats.versatilityRating += phial.ratingAmount; break;
        }
      }
    }
  }

  // ── 4. Food ──────────────────────────────────────────────
  if (options.food !== "none") {
    const food = FOOD_BUFFS.find(f => f.key === options.food);
    if (food) {
      switch (food.stat) {
        case "crit": stats.critRating += food.ratingAmount; break;
        case "haste": stats.hasteRating += food.ratingAmount; break;
        case "mastery": stats.masteryRating += food.ratingAmount; break;
        case "vers": stats.versatilityRating += food.ratingAmount; break;
      }
    }
  }

  // ── 5. Weapon Enhancement ────────────────────────────────
  let weaponProc: ApplyResult["weaponProc"];
  if (options.weaponEnhancement !== "none") {
    const enh = WEAPON_ENHANCEMENTS.find(w => w.key === options.weaponEnhancement);
    if (enh) {
      if (enh.type === "flat_stat" && enh.stat && enh.ratingAmount) {
        switch (enh.stat) {
          case "crit": stats.critRating += enh.ratingAmount; break;
          case "haste": stats.hasteRating += enh.ratingAmount; break;
          case "mastery": stats.masteryRating += enh.ratingAmount; break;
          case "vers": stats.versatilityRating += enh.ratingAmount; break;
        }
      } else if (enh.type === "damage_proc" && enh.dmgApCoef && enh.dmgCPM) {
        weaponProc = {
          dmgApCoef: enh.dmgApCoef,
          dmgCPM: enh.dmgCPM,
          school: enh.school ?? "nature",
        };
      }
    }
  }

  // ── 6. Augment Rune ──────────────────────────────────────
  if (options.augmentRune) {
    const rune = AUGMENT_RUNES[0]; // Only one exists
    if (rune) {
      stats.agility += rune.ratingAmount;
    }
  }

  // ── 7. Raid Buffs → multipliers ──────────────────────────
  let apMult = 1.0;
  let dmgMult = 1.0;
  let versPctBonus = 0;

  if (options.raidBuffs.battleShout) apMult *= 1.05;
  if (options.raidBuffs.markOfTheWild) versPctBonus += 3.0;
  if (options.raidBuffs.mysticTouch) dmgMult *= 1.05;
  if (options.raidBuffs.huntersMark) dmgMult *= 1.05;

  // Apply AP multiplier (Battle Shout) to agility since AP = Agi for hunters
  stats.agility = Math.round(stats.agility * apMult);

  // ── 8. Potion → timed aura (returned for SimLoop to apply) ──
  let potionAura: ApplyResult["potionAura"];
  if (options.potion !== "none") {
    const pot = POTIONS.find(p => p.key === options.potion);
    if (pot) {
      potionAura = {
        stat: pot.stat,
        amount: pot.ratingAmount,
        durationMs: pot.durationSec * 1000,
      };
    }
  }

  return {
    stats,
    buffMults: { apMult, dmgMult, versPctBonus },
    weaponProc,
    potionAura,
  };
}
