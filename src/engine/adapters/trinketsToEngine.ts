// ─────────────────────────────────────────────────────────────
// engine/adapters/trinketsToEngine.ts
// Converts MIDNIGHT_TRINKETS → EquippedTrinket for the engine.
// ─────────────────────────────────────────────────────────────

import {
  MIDNIGHT_TRINKETS,
  rankTrinkets,
  type TrinketDef,
  type HeroTalent,
} from "@/lib/gearOptimizer";
import { computeStatWeights, HEROIC_MIDNIGHT_276, getOptimalTalentConfig } from "@/lib/theorycrafting";
import type { EquippedTrinket, HeroTree } from "../types";

/** Map engine hero to gearOptimizer hero */
function mapHero(hero: HeroTree): HeroTalent {
  return hero === "sentinel" ? "sentinel" : "packLeader";
}

export function getEquippedTrinkets(hero: HeroTree): [EquippedTrinket, EquippedTrinket] {
  const gearHero = mapHero(hero);
  const talents = getOptimalTalentConfig(gearHero, 1);
  const weights = computeStatWeights(
    HEROIC_MIDNIGHT_276,
    talents,
    { has2pc: true, has4pc: true },
    gearHero,
    1,
  );

  const ranked = rankTrinkets(weights, gearHero);
  return [mapTrinket(ranked[0]), mapTrinket(ranked[1])];
}

function mapTrinket(t: TrinketDef): EquippedTrinket {
  return {
    id: t.id,
    name: t.name,
    ilvl: t.ilvl,
    type: t.type,
    primaryAgi: t.primaryAgi,
    onUseAmount: t.onUseAmount,
    onUseStat: t.onUseStat as EquippedTrinket["onUseStat"],
    onUseAgi: t.onUseAgi,
    onUseDuration: t.onUseDuration,
    onUseCD: t.onUseCD,
    procAmount: t.procAmount,
    procStat: t.procStat as EquippedTrinket["procStat"],
    procUptime: t.procUptime,
    dmgApCoef: t.dmgApCoef,
    dmgCPM: t.dmgCPM,
    burstAlignable: t.burstAlignable,
  };
}

/** Get a specific trinket by ID */
export function getTrinketById(id: number): EquippedTrinket | undefined {
  const t = MIDNIGHT_TRINKETS.find(tr => tr.id === id);
  if (!t) return undefined;
  return mapTrinket(t);
}
