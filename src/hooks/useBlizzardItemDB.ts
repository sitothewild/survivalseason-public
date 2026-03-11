// ─────────────────────────────────────────────────────────────
// hooks/useBlizzardItemDB.ts
// Access the cached Blizzard Item DB from simc_data_cache.
// Provides categorized gear, consumables, enchants, gems data.
// ─────────────────────────────────────────────────────────────

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ItemEntry {
  id: number;
  name: string;
  ilvl: number;
  quality: string;
  requiredLevel?: number;
  description?: string;
  inventoryType?: string;
}

export interface RecipeEntry {
  recipeId: number;
  name: string;
  category: string;
}

export interface BlizzardItemDB {
  version: string;
  fetchedAt: string;
  region: string;
  mailArmor?: Record<string, ItemEntry[]>;
  rings?: ItemEntry[];
  trinkets?: ItemEntry[];
  weapons?: Record<string, ItemEntry[]>;
  enchants?: RecipeEntry[];
  gems?: { searchResults: ItemEntry[]; jcRecipes: RecipeEntry[] };
  consumables?: Record<string, ItemEntry[] | RecipeEntry[]>;
  weaponEnhancements?: ItemEntry[];
  augmentRunes?: ItemEntry[];
  cooking?: RecipeEntry[];
}

/**
 * Fetch the full item DB snapshot.
 */
export function useBlizzardItemDB() {
  return useQuery({
    queryKey: ["blizzard-item-db"],
    queryFn: async (): Promise<BlizzardItemDB | null> => {
      const { data, error } = await supabase
        .from("simc_data_cache")
        .select("data")
        .eq("data_key", "blizzard_item_db")
        .maybeSingle();

      if (error || !data?.data) return null;
      return data.data as unknown as BlizzardItemDB;
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

/**
 * Fetch a single category from the item DB (faster partial read).
 */
export function useBlizzardItemCategory(category: string) {
  return useQuery({
    queryKey: ["blizzard-item-db", category],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("simc_data_cache")
        .select("data")
        .eq("data_key", `item_db_${category}`)
        .maybeSingle();

      if (error || !data?.data) return null;
      return data.data as any;
    },
    staleTime: 1000 * 60 * 60,
  });
}

/**
 * Trigger a full item DB sync from the Blizzard API.
 */
export async function triggerItemDBSync(region = "us", categories = ["all"]) {
  const { data, error } = await supabase.functions.invoke("blizzard-item-db", {
    body: { region, categories },
  });
  if (error) throw error;
  return data;
}
