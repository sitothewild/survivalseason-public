// ─────────────────────────────────────────────────────────────
// survivalSpellSubstitutions.ts
// The Blizzard API returns hero talent descriptions using the
// "primary" spec's ability names (BM for Pack Leader, MM for
// Sentinel). This module substitutes them with Survival equivalents.
// ─────────────────────────────────────────────────────────────

/**
 * Map of BM/MM ability names → Survival equivalents.
 * Order matters: longer phrases first to avoid partial matches.
 */
const SURVIVAL_SUBSTITUTIONS: [RegExp, string][] = [
  // ── Pack Leader (BM → Survival) ──
  [/\bBestial Wrath\b/g, "Coordinated Assault"],
  [/\bCobra Shot\b/g, "Raptor Strike"],
  [/\bBarbed Shot\b/g, "Kill Command"],
  [/\bBeast Cleave\b/g, "Bomb Toss"],
  [/\bKill Cleave\b/g, "Bomb Toss"],
  [/\bMulti-Shot\b/g, "Butchery"],
  [/\bBasilisk Collar\b/g, "Basilisk Collar"],

  // ── Sentinel (MM → Survival) ──
  [/\bAimed Shot\b/g, "Raptor Strike"],
  [/\bRapid Fire\b/g, "Wildfire Bomb"],
  [/\bTrueshot\b/g, "Coordinated Assault"],
  [/\bSteady Shot\b/g, "Raptor Strike"],
  [/\bArcane Shot\b/g, "Raptor Strike"],
  [/\bChimaera Shot\b/g, "Raptor Strike"],
];

/**
 * Replace BM/MM ability references with Survival equivalents
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
