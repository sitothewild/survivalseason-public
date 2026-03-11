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
    .split(/[\s_-]+/)
    .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

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
    // Sentinel hero nodes
    ["stargazer", "lunarInspiration", "extrapolation", "twilightRequiem",
     "dontLookBack", "catchOut", "invigoratingPulse",
     "eyesClosed", "lunarCalling", "releaseAndReload", "lunarStorm",
    ].forEach(t => activeTalents.add(t));
  } else {
    activeTalents.add("twoAgainstMany");
    activeTalents.add("lethalCalibration");
    if (fightStyle === "st") {
      activeTalents.add("bloodseeker");
    } else {
      activeTalents.add("flankerAdvantage");
    }
    // Pack Leader hero nodes
    ["viciousHunt", "packCoordination", "howlOfThePack",
     "ursineFury", "wildAttacks", "corneredPrey", "frenziedTear",
     "goForTheThroat", "furiousAssault", "scatteredPrey", "clawFrenzy",
     "packAssault",
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
