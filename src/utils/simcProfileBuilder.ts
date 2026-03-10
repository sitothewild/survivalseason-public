// ─────────────────────────────────────────────────────────────
// utils/simcProfileBuilder.ts
// Builds a complete SimC profile string from selected talents,
// BIS gear, enchants, and gems.
// ─────────────────────────────────────────────────────────────

import type { SelectedTalent } from "@/hooks/useTalentTreeData";
import {
  getBiSList,
  rankEnchantsForSlot,
  MIDNIGHT_ENCHANTS,
  MIDNIGHT_GEMS,
  ENCHANT_SLOTS,
  type HeroTalent,
  type BiSSlot,
} from "@/lib/gearOptimizer";
import {
  computeStatWeights,
  getOptimalTalentConfig,
  HEROIC_MIDNIGHT_276,
  type StatWeights,
} from "@/lib/theorycrafting";

// ─── Types ──────────────────────────────────────────────────

export type FightStyle = "st" | "cleave" | "aoe";

export interface SimcProfileOptions {
  heroTree: HeroTalent;
  fightStyle: FightStyle;
  characterName?: string;
  realm?: string;
  region?: string;
}

export interface SimcProfileResult {
  profileString: string;
  summary: {
    heroTree: string;
    fightStyle: string;
    avgIlvl: number;
    gearSlots: number;
    enchants: number;
    gems: number;
    talentCount: number;
  };
}

// ─── Fight style config ─────────────────────────────────────

const FIGHT_CONFIG: Record<FightStyle, { style: string; duration: string; targets: number; label: string }> = {
  st:     { style: "Patchwerk",    duration: "300",  targets: 1, label: "Single Target" },
  cleave: { style: "Patchwerk",    duration: "300",  targets: 2, label: "Cleave (2T)" },
  aoe:    { style: "DungeonSlice", duration: "600",  targets: 5, label: "AoE / M+" },
};

// ─── Slot mapping (BiS slot name → SimC slot key) ───────────

const SLOT_TO_SIMC: Record<string, string> = {
  "Head":       "head",
  "Neck":       "neck",
  "Shoulders":  "shoulder",
  "Back":       "back",
  "Chest":      "chest",
  "Wrist":      "wrist",
  "Hands":      "hands",
  "Waist":      "waist",
  "Legs":       "legs",
  "Boots":      "feet",
  "Ring 1":     "finger1",
  "Ring 2":     "finger2",
  "Trinket 1":  "trinket1",
  "Trinket 2":  "trinket2",
  "Main Hand":  "main_hand",
  "Off Hand":   "off_hand",
};

// ─── Enchant slot mapping ───────────────────────────────────

const BIS_SLOT_TO_ENCHANT_SLOT: Record<string, string> = {
  "Main Hand": "Weapon",
  "Off Hand":  "Weapon",
  "Chest":     "Chest",
  "Back":      "Cloak",
  "Wrist":     "Wrist",
  "Legs":      "Legs",
  "Boots":     "Boots",
  "Ring 1":    "Ring",
  "Ring 2":    "Ring",
};

// ─── Gem selection ──────────────────────────────────────────

function getBestGems(hero: HeroTalent): { unique: string; filler: string } {
  const unique = MIDNIGHT_GEMS.find(g => g.isUnique && g.sentinelRank === 1)?.name ?? "Elusive Blasphemite";
  const filler = MIDNIGHT_GEMS
    .filter(g => !g.isUnique)
    .sort((a, b) => {
      const aRank = hero === "sentinel" ? a.sentinelRank : a.packLeaderRank;
      const bRank = hero === "sentinel" ? b.sentinelRank : b.packLeaderRank;
      return aRank - bRank;
    })[0]?.name ?? "Queen's Ruby";
  return { unique, filler };
}

// ─── Build profile ──────────────────────────────────────────

export function buildSimcProfile(
  selectedTalents: SelectedTalent[],
  options: SimcProfileOptions,
): SimcProfileResult {
  const {
    heroTree,
    fightStyle,
    characterName = "SurvivalSim",
    realm = "Tichondrius",
    region = "us",
  } = options;

  const fight = FIGHT_CONFIG[fightStyle];
  const bis = getBiSList(heroTree);

  // Compute stat weights for enchant ranking
  const talentConfig = getOptimalTalentConfig(heroTree, fight.targets);
  const tierSet = { has2pc: true, has4pc: true };
  const weights: StatWeights = computeStatWeights(
    HEROIC_MIDNIGHT_276,
    talentConfig,
    tierSet,
    heroTree,
    fight.targets,
  );

  // Get best enchants per slot
  const enchantMap = new Map<string, string>();
  for (const slot of ENCHANT_SLOTS) {
    const ranked = rankEnchantsForSlot(slot, weights, heroTree);
    if (ranked.length > 0) {
      enchantMap.set(slot, ranked[0].name);
    }
  }

  const gems = getBestGems(heroTree);

  // ── Build talent string (spell IDs)
  const talentSpellIds = selectedTalents.map(t => t.spellId).filter(Boolean);

  // ── Build gear lines
  const gearLines: string[] = [];
  let totalIlvl = 0;
  let enchantCount = 0;
  let gemCount = 0;
  const socketableSlots = new Set(["Head", "Waist", "Wrist", "Ring 1", "Ring 2"]);

  for (const item of bis) {
    const simcSlot = SLOT_TO_SIMC[item.slot];
    if (!simcSlot) continue;

    let line = `${simcSlot}=,id=${item.trinketId ?? 0},ilevel=${item.ilvl}`;
    const parts: string[] = [];

    // Enchant
    const enchantSlot = BIS_SLOT_TO_ENCHANT_SLOT[item.slot];
    if (enchantSlot && enchantMap.has(enchantSlot)) {
      const enchantName = enchantMap.get(enchantSlot)!;
      parts.push(`enchant=${formatSimcName(enchantName)}`);
      enchantCount++;
    }

    // Gem
    if (socketableSlots.has(item.slot)) {
      const gemName = gemCount === 0 ? gems.unique : gems.filler;
      parts.push(`gem_id=0/${formatSimcName(gemName)}`);
      gemCount++;
    }

    if (parts.length > 0) {
      line += "," + parts.join(",");
    }

    // Add comment with item name
    gearLines.push(`# ${item.itemName} (${item.source.split(" — ")[0]})`);
    gearLines.push(line);
    totalIlvl += item.ilvl;
  }

  const avgIlvl = bis.length > 0 ? Math.round(totalIlvl / bis.length) : 276;

  // ── Assemble profile
  const lines: string[] = [
    `# ═══════════════════════════════════════════════════════`,
    `# Survival Hunter — ${heroTree === "sentinel" ? "Sentinel" : "Pack Leader"}`,
    `# Fight: ${fight.label} (${fight.style}, ${fight.duration}s)`,
    `# Generated by Survival Season Talent Optimizer`,
    `# ═══════════════════════════════════════════════════════`,
    ``,
    `hunter="${characterName}"`,
    `level=80`,
    `race=dark_iron_dwarf`,
    `region=${region}`,
    `server=${formatSimcName(realm)}`,
    `role=attack`,
    `professions=engineering=100/leatherworking=100`,
    `spec=survival`,
    ``,
    `# ── Talents ──`,
    `# Spell IDs: ${talentSpellIds.join("/")}`,
    `talents=${talentSpellIds.join("/")}`,
    ``,
    `# ── Gear ──`,
    ...gearLines,
    ``,
    `# ── Fight Configuration ──`,
    `fight_style="${fight.style}"`,
    `max_time=${fight.duration}`,
    `desired_targets=${fight.targets}`,
    `iterations=10000`,
  ];

  const profileString = lines.join("\n");

  return {
    profileString,
    summary: {
      heroTree: heroTree === "sentinel" ? "Sentinel" : "Pack Leader",
      fightStyle: fight.label,
      avgIlvl,
      gearSlots: bis.length,
      enchants: enchantCount,
      gems: gemCount,
      talentCount: selectedTalents.length,
    },
  };
}

// ─── Quick export shorthand ─────────────────────────────────

export function quickExportSimc(
  talents: SelectedTalent[],
  heroTree: HeroTalent,
  fightStyle: FightStyle,
): string {
  return buildSimcProfile(talents, { heroTree, fightStyle }).profileString;
}

// ─── Helpers ────────────────────────────────────────────────

function formatSimcName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}
