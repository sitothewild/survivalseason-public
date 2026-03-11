// ─────────────────────────────────────────────────────────────
// hooks/useBlizzardEnchants.ts
// Fetches enchant data from the Blizzard API cache (simc_data_cache)
// and merges with local fallback data.
// ─────────────────────────────────────────────────────────────

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { EnchantDef, HeroTalent } from "@/lib/gearOptimizer";
import { MIDNIGHT_ENCHANTS } from "@/lib/gearOptimizer";

interface BlizzardEnchantItem {
  id: number;
  name?: { en_US?: string };
  item_subclass?: { name?: { en_US?: string } };
  inventory_type?: { type?: string; name?: { en_US?: string } };
  level?: number;
  required_level?: number;
  quality?: { type?: string };
  description?: { en_US?: string };
}

/**
 * Maps Blizzard API inventory_type to our slot names.
 * Enchant items themselves show the slot they apply to.
 */
function mapSlot(item: BlizzardEnchantItem): string | null {
  const name = (item.name?.en_US ?? "").toLowerCase();
  const desc = (item.description?.en_US ?? "").toLowerCase();

  // Use name/description keywords to determine slot
  if (name.includes("weapon") || desc.includes("weapon")) return "Weapon";
  if (name.includes("chest") || desc.includes("chest")) return "Chest";
  if (name.includes("cloak") || name.includes("back") || desc.includes("cloak")) return "Cloak";
  if (name.includes("wrist") || name.includes("bracer") || desc.includes("wrist")) return "Wrist";
  if (name.includes("leg") || name.includes("armor kit") || desc.includes("leg")) return "Legs";
  if (name.includes("boot") || name.includes("feet") || name.includes("march") || desc.includes("boot")) return "Boots";
  if (name.includes("ring") || name.includes("radiant") || name.includes("cursed") || desc.includes("ring")) return "Ring";

  return null;
}

function mapStat(item: BlizzardEnchantItem): EnchantDef["stat"] {
  const name = (item.name?.en_US ?? "").toLowerCase();
  const desc = (item.description?.en_US ?? "").toLowerCase();
  const combined = name + " " + desc;

  if (combined.includes("critical") || combined.includes("crit")) return "crit";
  if (combined.includes("haste")) return "haste";
  if (combined.includes("mastery")) return "mastery";
  if (combined.includes("versatility") || combined.includes("vers")) return "vers";
  if (combined.includes("agility") || combined.includes("agi")) return "agi";
  if (combined.includes("speed") || combined.includes("movement") || combined.includes("grace")) return "utility";

  // If has multiple stats
  const statCount = [
    combined.includes("crit"), combined.includes("haste"),
    combined.includes("mastery"), combined.includes("vers"),
  ].filter(Boolean).length;
  if (statCount >= 2) return "mixed";

  return "mixed";
}

/**
 * Convert Blizzard API enchant items to our EnchantDef format.
 */
function apiToEnchantDef(item: BlizzardEnchantItem): EnchantDef | null {
  const slot = mapSlot(item);
  if (!slot) return null;

  const name = item.name?.en_US ?? `Enchant ${item.id}`;
  const stat = mapStat(item);

  return {
    id: item.id,
    name,
    slot,
    stat,
    primaryRating: 0, // Will be populated from actual tooltip data
    secondaryRating: 0,
    sentinelRank: 2 as 1 | 2 | 3,
    packLeaderRank: 2 as 1 | 2 | 3,
    notes: `From Blizzard API (item ${item.id})`,
  };
}

export function useBlizzardEnchants() {
  return useQuery({
    queryKey: ["blizzard-enchant-data"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("simc_data_cache")
        .select("data")
        .eq("data_key", "blizzard_enchant_data")
        .maybeSingle();

      if (error || !data?.data) {
        console.warn("[useBlizzardEnchants] No cached enchant data, using hardcoded fallback");
        return { enchants: MIDNIGHT_ENCHANTS, source: "hardcoded" as const };
      }

      const cached = data.data as any;
      const apiEnchants: BlizzardEnchantItem[] = cached.enchants ?? [];

      if (!apiEnchants.length) {
        return { enchants: MIDNIGHT_ENCHANTS, source: "hardcoded" as const };
      }

      // Convert API enchants to our format
      const converted = apiEnchants
        .map(apiToEnchantDef)
        .filter((e): e is EnchantDef => e !== null);

      // Merge: prefer API data where IDs match, keep hardcoded for unmatched
      const apiById = new Map(converted.map(e => [e.id, e]));
      const merged: EnchantDef[] = [];
      const usedApiIds = new Set<number>();

      // Update existing hardcoded enchants with API data (keep our ranking + stat values)
      for (const hardcoded of MIDNIGHT_ENCHANTS) {
        const apiVersion = apiById.get(hardcoded.id);
        if (apiVersion) {
          // Keep our curated rankings and stat values, update name from API
          merged.push({
            ...hardcoded,
            name: apiVersion.name, // Use API name (may be updated for Midnight)
          });
          usedApiIds.add(hardcoded.id);
        } else {
          merged.push(hardcoded);
        }
      }

      // Add any new API enchants not in our hardcoded list
      for (const apiEnchant of converted) {
        if (!usedApiIds.has(apiEnchant.id)) {
          merged.push(apiEnchant);
        }
      }

      return {
        enchants: merged,
        apiEnchants: converted,
        rawApiData: apiEnchants,
        source: "api_cached" as const,
        fetchedAt: cached.fetchedAt,
      };
    },
    staleTime: 1000 * 60 * 30, // 30 min
  });
}

/**
 * Trigger a fresh Blizzard data snapshot (including enchants).
 */
export async function triggerEnchantSnapshot(region = "us") {
  const { data, error } = await supabase.functions.invoke("blizzard-data-snapshot", {
    body: { region },
  });
  if (error) throw error;
  return data;
}
