// ─────────────────────────────────────────────────────────────
// engine/adapters/gearToStats.ts
// Converts getBiSList() output → PlayerStats for the engine.
// ─────────────────────────────────────────────────────────────

import { getBiSList, type HeroTalent } from "@/lib/gearOptimizer";
import type { PlayerStats, HeroTree } from "../types";

/** Map gearOptimizer hero type to engine hero type */
function mapHero(hero: HeroTree): HeroTalent {
  return hero === "sentinel" ? "sentinel" : "packLeader";
}

export function gearToPlayerStats(
  hero: HeroTree,
  useMythIlvl: boolean
): PlayerStats {
  const bisList = getBiSList(mapHero(hero));

  let totalAgi = 0;
  let totalStam = 0;
  let totalCrit = 0;
  let totalHaste = 0;
  let totalMast = 0;
  let totalVers = 0;

  for (const item of bisList) {
    if (!item.statBudget) continue;
    const mythScale = useMythIlvl ? 1.047 : 1.0;

    totalAgi += (item.statBudget.agility ?? 0) * mythScale;
    totalStam += (item.statBudget.stamina ?? 0) * mythScale;

    for (const sec of item.statBudget.secondaries ?? []) {
      const val = sec.value * mythScale;
      if (sec.name === "Critical Strike") totalCrit += val;
      else if (sec.name === "Haste") totalHaste += val;
      else if (sec.name.includes("Mastery")) totalMast += val;
      else if (sec.name === "Versatility") totalVers += val;
    }
  }

  // Weapon data
  const mainHand = bisList.find(i => i.slot === "Main Hand");
  const offHand = bisList.find(i => i.slot === "Off Hand");
  const is2H = hero === "sentinel";

  return {
    agility: Math.round(totalAgi),
    stamina: Math.round(totalStam),
    attackPower: Math.round(totalAgi), // AP ≈ Agi for hunters
    critRating: Math.round(totalCrit),
    hasteRating: Math.round(totalHaste),
    masteryRating: Math.round(totalMast),
    versatilityRating: Math.round(totalVers),
    weapon: {
      type: is2H ? "2h" : "dw",
      mainHandDps: mainHand?.statBudget?.agility ? 420 : (is2H ? 420 : 280),
      mainHandSpeed: is2H ? 3.6 : 2.6,
      offHandDps: is2H ? undefined : 220,
      offHandSpeed: is2H ? undefined : 2.6,
    },
    has2pc: true,
    has4pc: true,
  };
}
