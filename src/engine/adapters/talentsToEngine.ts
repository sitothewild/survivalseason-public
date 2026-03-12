// ─────────────────────────────────────────────────────────────
// engine/adapters/talentsToEngine.ts
// Converts interactive talent tree state → engine TalentState.
// Also builds the available spell book based on talent selection.
// ─────────────────────────────────────────────────────────────

import type { TalentTreeState } from "@/hooks/useTalentTree";
import type { TalentNodeDef } from "@/lib/talentData";
import type { TalentState, ChoiceSelections, HeroTree } from "../types";

/** Convert display name to camelCase engine key (e.g., "Kill Command" → "killCommand") */
function toCamelCase(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s_-]/g, '') // Strip punctuation (e.g. "Stampede!" → "Stampede")
    .split(/[\s_-]+/)
    .filter(w => w.length > 0)
    .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

/**
 * Map from talent node IDs → additional engine-expected keys.
 * The sim engine checks for specific mechanic keys (from SimC naming)
 * that don't always match the in-game display names from talentData.ts.
 * This mapping ensures the engine receives the keys it needs.
 */
const NODE_ENGINE_KEYS: Record<string, string[]> = {
  // ── Pack Leader ──
  // Keystone: establishes beast system + KC dire beast proc
  "vicious_hunt": ["howlOfThePackLeader", "viciousHunt"],
  // Dire Summons: enables pack coordination counter system
  "horn": ["packCoordination"],
  // Fury of the Wyvern: enables frenzied tear (extra pet attack on RS)
  "cat_charge": ["furiousAssault"],
  // Stampede capstone
  "bestial_discipline": ["stampede"],

  // ── Sentinel ──
  // Keystone enables sentinel counter system + Eyes of the Eagle mechanic
  "sentinel_keystone": ["sentinel", "catchOut"],
};

/**
 * Build engine TalentState from the interactive tree hook state.
 */
export function buildTalentState(
  treeState: TalentTreeState,
  nodes: TalentNodeDef[],
  hero: HeroTree,
): TalentState {
  const activeTalents = new Set<string>();

  for (const [nodeId, pts] of Object.entries(treeState.points)) {
    if (pts <= 0) continue;
    const node = nodes.find(n => n.id === nodeId);
    if (!node) continue;

    if (node.type === "choice") {
      const side = treeState.choiceSelections[nodeId];
      if (side === 0 && node.choiceA) {
        activeTalents.add(toCamelCase(node.choiceA.name));
      } else if (side === 1 && node.choiceB) {
        activeTalents.add(toCamelCase(node.choiceB.name));
      }
    } else {
      activeTalents.add(toCamelCase(node.name));
    }

    // Add engine-expected keys for this node
    const engineKeys = NODE_ENGINE_KEYS[nodeId];
    if (engineKeys) engineKeys.forEach(k => activeTalents.add(k));
  }

  // Detect choice selections for known choice nodes
  const choiceSelections = detectChoiceSelections(activeTalents);

  return {
    hero,
    choiceSelections,
    activeTalents,
  };
}

/**
 * Build TalentState from the theorycrafting TalentConfig (for the analytical path).
 */
export function buildTalentStateFromConfig(
  hero: HeroTree,
  fightStyle: "st" | "aoe",
): TalentState {
  // Import the build configs dynamically to avoid circular deps
  const activeTalents = new Set<string>();

  // All core talents are always active
  const coreTalents = [
    "killCommand", "wildfireBomb", "raptorStrike",
    "guerrillaTactics", "tipOfTheSpear", "lunge",
    "boomstick", "strikeAsOne", "flamebreak",
    "quickReload", "mongooseFury", "wildfireShells",
    "shellshock", "wallop", "sweepingSpear",
    "blackrockMunitions", "takedown", "killerCompanion",
    "twinFangs", "savagery", "wildfireInfusion",
    "flanked", "primalSurge", "raptorSwipe",
    // Class tree
    "alphaPredator", "keenEyesight", "masterMarksman",
    "serratedShots", "deathChakram", "killerInstinct",
  ];
  coreTalents.forEach(t => activeTalents.add(t));

  // Variable nodes based on build
  if (hero === "sentinel") {
    activeTalents.add("flankerAdvantage");
    if (fightStyle === "aoe") {
      activeTalents.add("twoAgainstMany");
      activeTalents.add("lethalCalibration");
    }
    // Sentinel hero nodes (camelCase must match toCamelCase(node.name) from talentData.ts)
    [
      "sentinel",              // Keystone (free)
      "dontLookBack",          // dont_look_back → "Don't Look Back"
      "moonsBlessing",         // moons_blessing → "Moon's Blessing"
      "sanctifiedArmaments",   // sanctified_arms → "Sanctified Armaments"
      "moonlightChakram",      // moonlight_chakram → "Moonlight Chakram"
      "cantMissWontMiss",      // cant_miss → "Can't Miss, Won't Miss"
      "invigoratingPulse",     // invigorating_pulse → "Invigorating Pulse"
      "arcaneTalons",          // arcane_talons → "Arcane Talons"
      "lunarCalling",          // lunar_calling → "Lunar Calling"
      "radiantEdge",           // radiant_edge → "Radiant Edge"
      "lunarStorm",            // lunar_storm capstone
      // Engine mechanic keys
      "catchOut",              // Eyes of the Eagle reset mechanic
      // Choice node defaults
      "stargazer",             // stargazer_choice → "Stargazer" (default)
      "twilightRequiem",       // twilight_choice → "Twilight Requiem" (default)
      "conditioning",          // cond_choice → "Conditioning" (default)
    ].forEach(t => activeTalents.add(t));
  } else {
    activeTalents.add("twoAgainstMany");
    activeTalents.add("lethalCalibration");
    if (fightStyle === "st") {
      activeTalents.add("bloodseeker");
    } else {
      activeTalents.add("flankerAdvantage");
    }
    // Pack Leader hero nodes (camelCase must match toCamelCase(node.name) from talentData.ts)
    [
      "howlOfThePackLeader",  // Keystone (free)
      "packMentality",        // lone_wolf → "Pack Mentality"
      "direSummons",          // horn → "Dire Summons"
      "betterTogether",       // pathfinding_pl → "Better Together"
      "furyOfTheWyvern",      // cat_charge → "Fury of the Wyvern"
      "hogstrider",           // boar_head → "Hogstrider"
      "lethalBarbs",          // lethal_barbs → "Lethal Barbs"
      "noMercy",              // go_for_throat → "No Mercy"
      "shellCover",           // turtle → "Shell Cover"
      "sharpenedFangs",       // monster_fang → "Sharpened Fangs"
      "stampede",             // bestial_discipline → "Stampede!" (punctuation stripped)
      // Choice node defaults (one of each pair)
      "ursineFury",           // ursine_choice → "Ursine Fury" (default over "Sharpened Claws")
      "hoofAndBlade",         // hoof_choice → "Hoof and Blade" (default over "Wyvern's Gaze")
      "slickedShoes",         // shoes_choice → "Slicked Shoes" (default over "Masterful Call")
      // Legacy aliases for engine checks
      "viciousHunt",          // engine uses this for KC proc
      "furiousAssault",       // engine uses this for Frenzied Tear proc
      "packCoordination",     // engine uses this for pack counter
    ].forEach(t => activeTalents.add(t));
  }

  return {
    hero,
    choiceSelections: {
      bomb: "flamebreak",
      spender_buff: "blackrock_munitions",
    },
    activeTalents,
  };
}

function detectChoiceSelections(talents: Set<string>): ChoiceSelections {
  return {
    bomb: talents.has("shrapnelBomb")
      ? "shrapnel_bomb"
      : "flamebreak",
    spender_buff: talents.has("vulnerability")
      ? "vulnerability"
      : "blackrock_munitions",
  };
}
