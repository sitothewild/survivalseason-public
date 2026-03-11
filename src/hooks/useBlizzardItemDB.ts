// ─────────────────────────────────────────────────────────────
// hooks/useBlizzardItemDB.ts
// Access the cached Blizzard Item DB from simc_data_cache.
// Provides enriched gear with source info (dungeon/raid/crafted),
// stats, effects, icons, and difficulty mapping.
// ─────────────────────────────────────────────────────────────

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EnrichedItem {
  id: number;
  name: string;
  ilvl: number;
  quality: string;
  requiredLevel: number;
  inventoryType: string;
  slot: string;
  // Source
  source: "dungeon" | "raid" | "crafted" | "world" | "pvp" | "reputation" | "unknown";
  sourceName: string;
  sourceEncounter: string;
  sourceDifficulties: string[];
  track: string;
  // Stats
  primaryStat: number;
  stamina: number;
  secondaryStats: Record<string, number>;
  // Effects
  effects: string[];
  setName: string | null;
  iconUrl: string | null;
}

export interface LootDrop {
  itemId: number;
  itemName: string;
  encounterName: string;
  instanceName: string;
  instanceType: "dungeon" | "raid";
  difficulties: string[];
}

export interface InstanceInfo {
  id: number;
  name: string;
  type: "dungeon" | "raid";
}

export interface RecipeEntry {
  recipeId: number;
  name: string;
  category: string;
  profession?: string;
}

export interface BlizzardItemDB {
  version: string;
  fetchedAt: string;
  region: string;
  instances?: InstanceInfo[];
  lootTable?: LootDrop[];
  enrichedItems?: EnrichedItem[];
  itemsBySlot?: Record<string, EnrichedItem[]>;
  itemsBySource?: Record<string, EnrichedItem[]>;
  basicItems?: Array<{ id: number; source: string; sourceName: string; sourceEncounter: string }>;
  enchantRecipes?: RecipeEntry[];
  gems?: { items: Array<{ id: number; name: string; quality: string }>; jcRecipes: RecipeEntry[] };
  consumables?: Record<string, any[]>;
  weaponEnhancements?: Array<{ id: number; name: string; quality: string; description: string }>;
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
 * Fetch enriched items only (gear with stats + source info).
 */
export function useBlizzardEnrichedItems() {
  return useQuery({
    queryKey: ["blizzard-item-db", "enriched"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("simc_data_cache")
        .select("data")
        .eq("data_key", "item_db_enriched_items")
        .maybeSingle();

      if (error || !data?.data) return null;
      return data.data as unknown as {
        enrichedItems: EnrichedItem[];
        itemsBySlot: Record<string, EnrichedItem[]>;
        itemsBySource: Record<string, EnrichedItem[]>;
        fetchedAt: string;
      };
    },
    staleTime: 1000 * 60 * 60,
  });
}

/**
 * Fetch instance/loot data (dungeon and raid drop tables).
 */
export function useBlizzardLootTable() {
  return useQuery({
    queryKey: ["blizzard-item-db", "instances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("simc_data_cache")
        .select("data")
        .eq("data_key", "item_db_instances")
        .maybeSingle();

      if (error || !data?.data) return null;
      return data.data as unknown as {
        instances: InstanceInfo[];
        lootTable: LootDrop[];
        fetchedAt: string;
      };
    },
    staleTime: 1000 * 60 * 60,
  });
}

/**
 * Fetch a single category from the item DB.
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
