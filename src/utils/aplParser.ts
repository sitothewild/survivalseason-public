// ─── SimC APL Parser ───────────────────────────────────────
// Parses raw SimC APL text into structured rotation weights
// for the Survival Hunter simulation engine.

const SIMC_TO_ENGINE: Record<string, string> = {
  // Midnight 12.0 abilities
  kill_command: "killCommand",
  wildfire_bomb: "wildfireBomb",
  raptor_strike: "raptorStrike",
  raptor_swipe: "raptorSwipe",
  takedown: "takedown",
  flamefang_pitch: "flamefangPitch",
  boomstick: "boomstick",
  moonlight_chakram: "moonlightChakram",
  hatchet_toss: "hatchetToss",
};

export interface RotationData {
  ordered: string[];
  weights: Record<string, number>;
}

export interface ParsedAPL {
  sentinel: { st: RotationData; aoe: RotationData };
  packLeader: { st: RotationData; aoe: RotationData };
}

const FALLBACK_WEIGHTS: ParsedAPL = {
  sentinel: {
    st: {
      ordered: ["killCommand", "boomstick", "wildfireBomb", "takedown", "moonlightChakram", "flamefangPitch", "raptorStrike"],
      weights: { killCommand: 0.220, boomstick: 0.160, wildfireBomb: 0.140, takedown: 0.120, moonlightChakram: 0.100, flamefangPitch: 0.080, raptorStrike: 0.180 },
    },
    aoe: {
      ordered: ["killCommand", "wildfireBomb", "boomstick", "takedown", "moonlightChakram", "flamefangPitch", "raptorStrike"],
      weights: { killCommand: 0.180, wildfireBomb: 0.200, boomstick: 0.190, takedown: 0.080, moonlightChakram: 0.100, flamefangPitch: 0.120, raptorStrike: 0.130 },
    },
  },
  packLeader: {
    st: {
      ordered: ["killCommand", "takedown", "flamefangPitch", "boomstick", "wildfireBomb", "raptorStrike"],
      weights: { killCommand: 0.230, takedown: 0.130, flamefangPitch: 0.100, boomstick: 0.150, wildfireBomb: 0.140, raptorStrike: 0.250 },
    },
    aoe: {
      ordered: ["killCommand", "takedown", "flamefangPitch", "wildfireBomb", "boomstick", "raptorStrike"],
      weights: { killCommand: 0.180, takedown: 0.080, flamefangPitch: 0.140, wildfireBomb: 0.200, boomstick: 0.190, raptorStrike: 0.210 },
    },
  },
};

// ─── Section header detection ──────────────────────────────

const SECTION_PATTERNS: { key: string; hero: "sentinel" | "packLeader"; mode: "st" | "aoe" }[] = [
  { key: "SENTINEL", hero: "sentinel", mode: "st" },
  { key: "SENTINEL", hero: "sentinel", mode: "aoe" },
  { key: "PACK LEADER", hero: "packLeader", mode: "st" },
  { key: "PACK LEADER", hero: "packLeader", mode: "aoe" },
];

function detectSection(line: string): { hero: "sentinel" | "packLeader"; mode: "st" | "aoe" } | null {
  const upper = line.toUpperCase();
  if (!upper.includes("//")) return null;

  const isSentinel = upper.includes("SENTINEL");
  const isPackLeader = upper.includes("PACK LEADER");
  if (!isSentinel && !isPackLeader) return null;

  const isAoe = upper.includes("AOE") || upper.includes("CLEAVE");
  const hero = isSentinel ? "sentinel" : "packLeader";
  const mode = isAoe ? "aoe" : "st";
  return { hero, mode };
}

// ─── Line parsing ──────────────────────────────────────────

function parseActionLine(line: string): string | null {
  const trimmed = line.trim();
  // Match: actions=ability or actions+=/ability
  const match = trimmed.match(/^actions(?:\+)?=\/?([a-z_]+)/i);
  if (!match) return null;
  return match[1].toLowerCase();
}

function mapName(simcName: string): string {
  return SIMC_TO_ENGINE[simcName] ?? simcName.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// ─── Weight calculation ────────────────────────────────────

function buildRotationData(abilities: string[]): RotationData {
  const ordered = abilities.map(mapName);
  const rawWeights = abilities.map((_, i) => 1 / (i + 1));
  const sum = rawWeights.reduce((a, b) => a + b, 0);
  const weights: Record<string, number> = {};
  ordered.forEach((name, i) => {
    weights[name] = Math.round((rawWeights[i] / sum) * 1000) / 1000;
  });
  return { ordered, weights };
}

// ─── Main parser ───────────────────────────────────────────

const DEPRECATED_ABILITIES = ["spearhead", "flanking_strike", "mongoose_bite", "coordinated_assault", "fury_of_the_eagle", "butchery", "raptor_bite"];

export function parseSimcAPL(rawAPLText: string): ParsedAPL {
  try {
    // If fetched APL contains deprecated War Within abilities, reject and use Midnight fallback
    const lowerText = rawAPLText.toLowerCase();
    if (DEPRECATED_ABILITIES.some(a => lowerText.includes(a))) {
      console.warn("SimC APL contains deprecated War Within abilities — using Midnight fallback");
      return FALLBACK_WEIGHTS;
    }

    const lines = rawAPLText.split("\n");
    const sections: Record<string, string[]> = {};
    let currentKey: string | null = null;

    for (const line of lines) {
      const section = detectSection(line);
      if (section) {
        currentKey = `${section.hero}.${section.mode}`;
        if (!sections[currentKey]) sections[currentKey] = [];
        continue;
      }

      if (currentKey) {
        const ability = parseActionLine(line);
        if (ability) {
          sections[currentKey].push(ability);
        }
        // Empty line or new comment block ends current section
        if (line.trim() === "" && sections[currentKey]?.length > 0) {
          currentKey = null;
        }
      }
    }

    // If no sections detected, try parsing as a flat list into sentinel.st
    if (Object.keys(sections).length === 0) {
      const allAbilities: string[] = [];
      for (const line of lines) {
        const ability = parseActionLine(line);
        if (ability) allAbilities.push(ability);
      }
      if (allAbilities.length > 0) {
        const data = buildRotationData(allAbilities);
        return {
          sentinel: { st: data, aoe: data },
          packLeader: { st: data, aoe: data },
        };
      }
    }

    // Build result, falling back per-section
    const hasAny = Object.values(sections).some((s) => s.length > 0);
    if (!hasAny) {
      console.warn("SimC APL parse failed — using fallback rotation weights");
      return FALLBACK_WEIGHTS;
    }

    const result: ParsedAPL = {
      sentinel: {
        st: sections["sentinel.st"]?.length ? buildRotationData(sections["sentinel.st"]) : FALLBACK_WEIGHTS.sentinel.st,
        aoe: sections["sentinel.aoe"]?.length ? buildRotationData(sections["sentinel.aoe"]) : FALLBACK_WEIGHTS.sentinel.aoe,
      },
      packLeader: {
        st: sections["packLeader.st"]?.length ? buildRotationData(sections["packLeader.st"]) : FALLBACK_WEIGHTS.packLeader.st,
        aoe: sections["packLeader.aoe"]?.length ? buildRotationData(sections["packLeader.aoe"]) : FALLBACK_WEIGHTS.packLeader.aoe,
      },
    };

    return result;
  } catch (e) {
    console.warn("SimC APL parse failed — using fallback rotation weights", e);
    return FALLBACK_WEIGHTS;
  }
}

// ─── Helper: get weights for a specific hero/mode combo ────

export function getRotationWeights(
  parsedAPL: ParsedAPL,
  hero: "sentinel" | "packLeader",
  mode: "st" | "aoe"
): Record<string, number> {
  return parsedAPL?.[hero]?.[mode]?.weights ?? FALLBACK_WEIGHTS[hero][mode].weights;
}
