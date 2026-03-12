// ─────────────────────────────────────────────────────────────
// survivalSpellSubstitutions.ts
// The Blizzard API returns hero talent descriptions using the
// "primary" spec's ability names (BM for Pack Leader, MM for
// Sentinel). This module substitutes them with Survival
// equivalents for Midnight 12.0.1.
// ─────────────────────────────────────────────────────────────

/**
 * BM/MM ability names → Survival (Midnight 12.0.1) equivalents.
 * Longer phrases listed first to prevent partial-match clobbering.
 */
const SURVIVAL_SUBSTITUTIONS: [RegExp, string][] = [
  // ── Pack Leader (BM → Survival Midnight) ──
  [/\bBestial Wrath\b/g, "Takedown"],
  [/\bCobra Shot\b/g, "Raptor Strike"],
  [/\bBarbed Shot\b/g, "Kill Command"],
  [/\bBeast Cleave\b/g, "Bomb Toss"],
  [/\bKill Cleave\b/g, "Bomb Toss"],
  [/\bMulti-Shot\b/g, "Butchery"],
  [/\bDire Beast\b/g, "Flanking Strike"],
  [/\bCall of the Wild\b/g, "Takedown"],

  // ── Sentinel (MM → Survival Midnight) ──
  [/\bAimed Shot\b/g, "Raptor Strike"],
  [/\bRapid Fire\b/g, "Wildfire Bomb"],
  [/\bTrueshot\b/g, "Takedown"],
  [/\bSteady Shot\b/g, "Raptor Strike"],
  [/\bArcane Shot\b/g, "Raptor Strike"],
  [/\bChimaera Shot\b/g, "Raptor Strike"],
  [/\bWinding Shot\b/g, "Harpoon"],
  [/\bVolley\b/g, "Wildfire Bomb"],

  // ── Deprecated War Within / old Survival references ──
  [/\bCoordinated Assault\b/g, "Takedown"],
  [/\bMongoose Bite\b/g, "Raptor Strike"],
  [/\bFlanking Strike\b/g, "Flanking Strike"], // identity — keep Midnight name
];

/**
 * Replace BM/MM ability references with Survival Midnight equivalents
 * in a hero talent tooltip description.
 */
export function applySurvivalSubstitutions(description: string): string {
  if (!description) return description;
  let result = description;
  for (const [pattern, replacement] of SURVIVAL_SUBSTITUTIONS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
