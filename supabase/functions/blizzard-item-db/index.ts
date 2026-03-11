import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const tokenCache: Record<string, { token: string; expiry: number }> = {};

async function getAccessToken(region = "us"): Promise<string> {
  const cached = tokenCache[region];
  if (cached && Date.now() < cached.expiry) return cached.token;
  const clientId = Deno.env.get("BLIZZARD_CLIENT_ID");
  const clientSecret = Deno.env.get("BLIZZARD_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Missing Blizzard credentials");
  const resp = await fetch(`https://${region}.battle.net/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + btoa(`${clientId}:${clientSecret}`),
    },
    body: "grant_type=client_credentials",
  });
  if (!resp.ok) throw new Error(`OAuth failed: ${resp.status}`);
  const data = await resp.json();
  tokenCache[region] = { token: data.access_token, expiry: Date.now() + (data.expires_in - 60) * 1000 };
  return data.access_token;
}

async function blizzGet(path: string, region: string, namespace = "static"): Promise<any> {
  const token = await getAccessToken(region);
  const url = `https://${region}.api.blizzard.com${path}${path.includes("?") ? "&" : "?"}namespace=${namespace}-${region}&locale=en_US`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) return null;
  return resp.json();
}

async function searchItems(region: string, params: string): Promise<any[]> {
  const token = await getAccessToken(region);
  const url = `https://${region}.api.blizzard.com/data/wow/search/item?namespace=static-${region}&${params}&_pageSize=100`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) return [];
  const data = await resp.json();
  // Handle pagination — fetch additional pages if available
  const results = data.results?.map((r: any) => r.data) ?? [];
  // Only fetch one extra page to avoid timeout
  if (data.pageCount > 1 && data.page === 1) {
    const page2 = await fetch(url + "&_page=2", { headers: { Authorization: `Bearer ${token}` } });
    if (page2.ok) {
      const p2 = await page2.json();
      results.push(...(p2.results?.map((r: any) => r.data) ?? []));
    }
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════
// Midnight instance IDs — Dungeons and Raid
// These are the Journal instance IDs for WoW Midnight (12.0)
// ═══════════════════════════════════════════════════════════════
// We'll discover these dynamically from the journal-expansion endpoint

async function getMidnightInstances(region: string): Promise<any[]> {
  // Get journal expansion index to find Midnight expansion ID
  const expansionIndex = await blizzGet("/data/wow/journal-expansion/index", region);
  if (!expansionIndex?.tiers) return [];

  // Find the latest expansion (Midnight)
  const latestExpansion = expansionIndex.tiers[expansionIndex.tiers.length - 1];
  if (!latestExpansion?.id) return [];

  console.log(`[item-db] Found expansion: ${latestExpansion.name?.en_US ?? latestExpansion.id}`);

  // Get expansion details with instances
  const expansion = await blizzGet(`/data/wow/journal-expansion/${latestExpansion.id}`, region);
  if (!expansion) return [];

  const instances: any[] = [];

  // Dungeons
  for (const dungeon of expansion.dungeons ?? []) {
    instances.push({ id: dungeon.id, name: dungeon.name?.en_US ?? dungeon.name, type: "dungeon" });
  }
  // Raids
  for (const raid of expansion.raids ?? []) {
    instances.push({ id: raid.id, name: raid.name?.en_US ?? raid.name, type: "raid" });
  }

  console.log(`[item-db] Found ${instances.length} Midnight instances`);
  return instances;
}

// ═══════════════════════════════════════════════════════════════
// Fetch encounter loot from journal
// ═══════════════════════════════════════════════════════════════

interface LootDrop {
  itemId: number;
  itemName: string;
  encounterName: string;
  instanceName: string;
  instanceType: "dungeon" | "raid";
  difficulties: string[];
}

async function getInstanceLoot(region: string, instanceId: number, instanceName: string, instanceType: string): Promise<LootDrop[]> {
  const instance = await blizzGet(`/data/wow/journal-instance/${instanceId}`, region);
  if (!instance?.encounters) return [];

  const loot: LootDrop[] = [];

  for (const enc of instance.encounters) {
    const encounter = await blizzGet(`/data/wow/journal-encounter/${enc.id}`, region);
    if (!encounter) continue;

    const encounterName = encounter.name?.en_US ?? encounter.name ?? `Encounter ${enc.id}`;

    // Get items from encounter
    for (const item of encounter.items ?? []) {
      const itemId = item.item?.id;
      const itemName = item.item?.name?.en_US ?? item.item?.name ?? `Item ${itemId}`;
      if (!itemId) continue;

      // Difficulty info
      const difficulties: string[] = [];
      if (instanceType === "dungeon") {
        difficulties.push("Normal", "Heroic", "Mythic", "Mythic+");
      } else {
        // Raid difficulties from encounter modes
        for (const mode of encounter.modes ?? []) {
          const modeName = mode.name?.en_US ?? mode.name ?? mode.type;
          if (modeName) difficulties.push(modeName);
        }
        if (!difficulties.length) difficulties.push("Normal", "Heroic", "Mythic");
      }

      loot.push({
        itemId,
        itemName,
        encounterName,
        instanceName,
        instanceType: instanceType as "dungeon" | "raid",
        difficulties,
      });
    }
  }

  return loot;
}

// ═══════════════════════════════════════════════════════════════
// Map ilvl to difficulty/track
// ═══════════════════════════════════════════════════════════════

function ilvlToTrack(ilvl: number): { track: string; difficulty: string } {
  if (ilvl >= 276) return { track: "Myth", difficulty: "Mythic Raid / M+ +7+" };
  if (ilvl >= 263) return { track: "Hero", difficulty: "Heroic Raid / M+ +2-6" };
  if (ilvl >= 250) return { track: "Champion", difficulty: "Normal Raid / M0" };
  if (ilvl >= 237) return { track: "Veteran", difficulty: "Heroic Dungeons" };
  return { track: "Adventurer", difficulty: "Normal Dungeons / World" };
}

// ═══════════════════════════════════════════════════════════════
// Fetch detailed item info (stats, effects)
// ═══════════════════════════════════════════════════════════════

interface EnrichedItem {
  id: number;
  name: string;
  ilvl: number;
  quality: string;
  requiredLevel: number;
  inventoryType: string;
  slot: string;
  // Source info
  source: "dungeon" | "raid" | "crafted" | "world" | "pvp" | "reputation" | "unknown";
  sourceName: string;          // e.g., "Den of Nalorakk"
  sourceEncounter: string;     // e.g., "Nalorakk"
  sourceDifficulties: string[];
  track: string;               // Adventurer/Veteran/Champion/Hero/Myth
  // Stats
  primaryStat: number;
  stamina: number;
  secondaryStats: Record<string, number>;  // { crit: 180, haste: 120 }
  // Effects
  effects: string[];           // spell/proc descriptions
  setName: string | null;      // tier set name
  iconUrl: string | null;
}

function normalizeSlot(invType: string): string {
  const map: Record<string, string> = {
    HEAD: "head", SHOULDER: "shoulders", CHEST: "chest", WRIST: "wrist",
    HANDS: "hands", WAIST: "waist", LEGS: "legs", FEET: "boots",
    FINGER: "ring", TRINKET: "trinket", CLOAK: "cloak", BACK: "cloak",
    WEAPONMAINHAND: "weapon", WEAPON: "weapon", TWOHWEAPON: "weapon_2h",
    HOLDABLE: "offhand", SHIELD: "offhand", RANGEDRIGHT: "ranged",
  };
  return map[invType] ?? invType.toLowerCase();
}

async function enrichItem(region: string, itemId: number, lootMap: Map<number, LootDrop>): Promise<EnrichedItem | null> {
  const item = await blizzGet(`/data/wow/item/${itemId}`, region);
  if (!item) return null;

  const loot = lootMap.get(itemId);
  const invType = item.inventory_type?.type ?? "";
  const { track } = ilvlToTrack(item.level ?? 0);

  // Parse stats from item data
  const secondaryStats: Record<string, number> = {};
  let primaryStat = 0;
  let stamina = 0;

  for (const stat of item.preview_item?.stats ?? []) {
    const statType = stat.type?.type ?? "";
    const value = stat.value ?? 0;
    switch (statType) {
      case "AGILITY": case "INTELLECT": case "STRENGTH": primaryStat = value; break;
      case "STAMINA": stamina = value; break;
      case "CRIT_RATING": secondaryStats.crit = value; break;
      case "HASTE_RATING": secondaryStats.haste = value; break;
      case "MASTERY_RATING": secondaryStats.mastery = value; break;
      case "VERSATILITY": secondaryStats.vers = value; break;
    }
  }

  // Effects / spells on the item
  const effects: string[] = [];
  for (const spell of item.preview_item?.spells ?? []) {
    const desc = spell.description?.en_US ?? spell.description;
    if (desc) effects.push(desc);
  }

  // Set info
  const setName = item.preview_item?.set?.display_string?.en_US ?? item.set?.name?.en_US ?? null;

  // Get icon
  let iconUrl: string | null = null;
  try {
    const media = await blizzGet(`/data/wow/media/item/${itemId}`, region);
    iconUrl = media?.assets?.[0]?.value ?? null;
  } catch { /* ignore */ }

  // Determine source
  let source: EnrichedItem["source"] = "unknown";
  let sourceName = "";
  let sourceEncounter = "";
  let sourceDifficulties: string[] = [];

  if (loot) {
    source = loot.instanceType;
    sourceName = loot.instanceName;
    sourceEncounter = loot.encounterName;
    sourceDifficulties = loot.difficulties;
  } else {
    // Infer from item properties
    const name = (item.name?.en_US ?? "").toLowerCase();
    if (item.preview_item?.recipe) {
      source = "crafted";
      sourceName = "Crafted";
    } else if (name.includes("crafted") || name.includes("crafters")) {
      source = "crafted";
      sourceName = "Crafted";
    }
  }

  return {
    id: itemId,
    name: item.name?.en_US ?? `Item ${itemId}`,
    ilvl: item.level ?? 0,
    quality: item.quality?.type ?? "COMMON",
    requiredLevel: item.required_level ?? 0,
    inventoryType: invType,
    slot: normalizeSlot(invType),
    source,
    sourceName,
    sourceEncounter,
    sourceDifficulties,
    track,
    primaryStat,
    stamina,
    secondaryStats,
    effects,
    setName,
    iconUrl,
  };
}

// ═══════════════════════════════════════════════════════════════
// Main serve handler
// ═══════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const region = body.region ?? "us";
    const categories = body.categories ?? ["all"];
    const doAll = categories.includes("all");

    console.log(`[item-db] Starting enriched item DB build for region=${region}`);

    const db: Record<string, any> = {
      version: "midnight-12.0.1",
      fetchedAt: new Date().toISOString(),
      region,
    };

    // ══════════════════════════════════════════════════════════
    // STEP 1: Build loot source map from Journal API
    // ══════════════════════════════════════════════════════════
    console.log("[item-db] STEP 1: Building loot source map from Journal...");
    const instances = await getMidnightInstances(region);
    const allLoot: LootDrop[] = [];

    for (const inst of instances) {
      console.log(`[item-db]   Scanning ${inst.type}: ${inst.name} (ID ${inst.id})...`);
      const loot = await getInstanceLoot(region, inst.id, inst.name, inst.type);
      allLoot.push(...loot);
      console.log(`[item-db]     → ${loot.length} items from ${inst.name}`);
    }

    // Build lookup map
    const lootMap = new Map<number, LootDrop>();
    for (const drop of allLoot) {
      lootMap.set(drop.itemId, drop);
    }

    db.instances = instances;
    db.lootTable = allLoot;
    console.log(`[item-db]   Total loot entries: ${allLoot.length} from ${instances.length} instances`);

    // ══════════════════════════════════════════════════════════
    // STEP 2: Search for SV Hunter-relevant items & enrich
    // ══════════════════════════════════════════════════════════

    // Collect all item IDs we want to enrich with full details
    const itemIdsToEnrich = new Set<number>();

    // 2a. Mail Armor (all slots, ilvl 250+)
    if (doAll || categories.includes("mail_armor")) {
      console.log("[item-db] STEP 2a: Fetching Mail Armor...");
      const mailSlots = ["HEAD", "SHOULDER", "CHEST", "WRIST", "HANDS", "WAIST", "LEGS", "FEET"];
      for (const slotType of mailSlots) {
        const items = await searchItems(region,
          `inventory_type.type=${slotType}&item_class.id=4&item_subclass.id=3&level=250,289&orderby=level:desc`
        );
        for (const i of items) if (i.id) itemIdsToEnrich.add(i.id);
        console.log(`[item-db]   ${slotType}: ${items.length} items found`);
      }
    }

    // 2b. Rings (ilvl 250+)
    if (doAll || categories.includes("rings")) {
      console.log("[item-db] STEP 2b: Fetching Rings...");
      const items = await searchItems(region, `inventory_type.type=FINGER&level=250,289&orderby=level:desc`);
      for (const i of items) if (i.id) itemIdsToEnrich.add(i.id);
      console.log(`[item-db]   Rings: ${items.length}`);
    }

    // 2c. Trinkets (ilvl 250+)
    if (doAll || categories.includes("trinkets")) {
      console.log("[item-db] STEP 2c: Fetching Trinkets...");
      const items = await searchItems(region, `inventory_type.type=TRINKET&level=250,289&orderby=level:desc`);
      for (const i of items) if (i.id) itemIdsToEnrich.add(i.id);
      console.log(`[item-db]   Trinkets: ${items.length}`);
    }

    // 2d. Weapons — Polearms(2H), Staves(2H), 1H Axes/Swords/Fists/Daggers
    if (doAll || categories.includes("weapons")) {
      console.log("[item-db] STEP 2d: Fetching Weapons...");
      const weaponSubclasses = [6, 10, 0, 7, 13, 4, 15]; // polearm, staff, axe, sword, fist, mace, dagger
      for (const sc of weaponSubclasses) {
        const items = await searchItems(region,
          `item_class.id=2&item_subclass.id=${sc}&level=250,289&orderby=level:desc`
        );
        for (const i of items) if (i.id) itemIdsToEnrich.add(i.id);
        console.log(`[item-db]   Weapon subclass ${sc}: ${items.length}`);
      }
    }

    // 2e. Cloaks
    if (doAll || categories.includes("cloaks")) {
      console.log("[item-db] STEP 2e: Fetching Cloaks...");
      const items = await searchItems(region, `inventory_type.type=CLOAK&level=250,289&orderby=level:desc`);
      for (const i of items) if (i.id) itemIdsToEnrich.add(i.id);
      console.log(`[item-db]   Cloaks: ${items.length}`);
    }

    // ══════════════════════════════════════════════════════════
    // STEP 3: Enrich top items with full details (limit to avoid timeout)
    // ══════════════════════════════════════════════════════════
    console.log(`[item-db] STEP 3: Enriching ${itemIdsToEnrich.size} items with full details...`);
    
    // Prioritize: items that drop from journal encounters first, then by ID (newest)
    const sortedIds = Array.from(itemIdsToEnrich).sort((a, b) => {
      const aInJournal = lootMap.has(a) ? 1 : 0;
      const bInJournal = lootMap.has(b) ? 1 : 0;
      if (aInJournal !== bInJournal) return bInJournal - aInJournal;
      return b - a; // Newest first
    });

    // Limit to avoid edge function timeout (enriching each item = 2 API calls)
    const MAX_ENRICH = 80;
    const idsToEnrich = sortedIds.slice(0, MAX_ENRICH);
    console.log(`[item-db]   Enriching top ${idsToEnrich.length} of ${sortedIds.length} items`);

    const enrichedItems: EnrichedItem[] = [];
    const BATCH_SIZE = 10;
    for (let i = 0; i < idsToEnrich.length; i += BATCH_SIZE) {
      const batch = idsToEnrich.slice(i, i + BATCH_SIZE);
      const settled = await Promise.allSettled(
        batch.map(id => enrichItem(region, id, lootMap))
      );
      for (const r of settled) {
        if (r.status === "fulfilled" && r.value) enrichedItems.push(r.value);
      }
      console.log(`[item-db]   Enriched ${Math.min(i + BATCH_SIZE, idsToEnrich.length)}/${idsToEnrich.length}`);
    }

    // Categorize enriched items by slot
    const bySlot: Record<string, EnrichedItem[]> = {};
    const bySource: Record<string, EnrichedItem[]> = {};
    for (const item of enrichedItems) {
      (bySlot[item.slot] ??= []).push(item);
      const srcKey = item.sourceName || item.source;
      (bySource[srcKey] ??= []).push(item);
    }

    db.enrichedItems = enrichedItems;
    db.itemsBySlot = bySlot;
    db.itemsBySource = bySource;

    // Also store non-enriched basic info for remaining items
    const remainingIds = sortedIds.slice(MAX_ENRICH);
    db.basicItems = remainingIds.map(id => {
      const loot = lootMap.get(id);
      return {
        id,
        source: loot?.instanceType ?? "unknown",
        sourceName: loot?.instanceName ?? "",
        sourceEncounter: loot?.encounterName ?? "",
      };
    });

    // ══════════════════════════════════════════════════════════
    // STEP 4: Enchants from profession recipes
    // ══════════════════════════════════════════════════════════
    if (doAll || categories.includes("enchants")) {
      console.log("[item-db] STEP 4: Fetching Enchanting recipes...");
      const enchantRecipes: any[] = [];
      
      // Enchanting (333)
      try {
        const prof = await blizzGet("/data/wow/profession/333", region);
        if (prof?.skill_tiers?.length) {
          const tier = prof.skill_tiers[prof.skill_tiers.length - 1];
          const tierData = await blizzGet(`/data/wow/profession/333/skill-tier/${tier.id}`, region);
          const gearCats = ["Weapon Enchants", "Chest Enchants", "Helm Enchants",
            "Boot Enchants", "Rings Enchants", "Shoulder Enchants"];
          for (const cat of tierData?.categories ?? []) {
            if (gearCats.includes(cat.name)) {
              for (const r of cat.recipes ?? []) {
                enchantRecipes.push({ recipeId: r.id, name: r.name, category: cat.name, profession: "Enchanting" });
              }
            }
          }
        }
      } catch (e) { console.warn("[item-db] Enchanting error:", (e as Error).message); }

      // Leatherworking (165) - armor kits
      try {
        const prof = await blizzGet("/data/wow/profession/165", region);
        if (prof?.skill_tiers?.length) {
          const tier = prof.skill_tiers[prof.skill_tiers.length - 1];
          const tierData = await blizzGet(`/data/wow/profession/165/skill-tier/${tier.id}`, region);
          for (const cat of tierData?.categories ?? []) {
            if (cat.name?.toLowerCase().includes("armor kit") || cat.name?.toLowerCase().includes("leg")) {
              for (const r of cat.recipes ?? []) {
                enchantRecipes.push({ recipeId: r.id, name: r.name, category: cat.name, profession: "Leatherworking" });
              }
            }
          }
        }
      } catch (e) { console.warn("[item-db] LW error:", (e as Error).message); }

      db.enchantRecipes = enchantRecipes;
      console.log(`[item-db]   Enchant recipes: ${enchantRecipes.length}`);
    }

    // ══════════════════════════════════════════════════════════
    // STEP 5: Gems (JC 755)
    // ══════════════════════════════════════════════════════════
    if (doAll || categories.includes("gems")) {
      console.log("[item-db] STEP 5: Fetching Gems...");
      const jcRecipes: any[] = [];
      try {
        const prof = await blizzGet("/data/wow/profession/755", region);
        if (prof?.skill_tiers?.length) {
          const tier = prof.skill_tiers[prof.skill_tiers.length - 1];
          const tierData = await blizzGet(`/data/wow/profession/755/skill-tier/${tier.id}`, region);
          for (const cat of tierData?.categories ?? []) {
            if (cat.name?.toLowerCase().includes("gem") || cat.name?.toLowerCase().includes("cut") || cat.name?.toLowerCase().includes("blasph")) {
              for (const r of cat.recipes ?? []) {
                jcRecipes.push({ recipeId: r.id, name: r.name, category: cat.name, profession: "Jewelcrafting" });
              }
            }
          }
        }
      } catch (e) { console.warn("[item-db] JC error:", (e as Error).message); }

      // Also search for gem items
      const gemItems = await searchItems(region, `item_class.id=3&required_level=68,90&orderby=level:desc`);
      db.gems = {
        items: gemItems.map(i => ({ id: i.id, name: i.name?.en_US, quality: i.quality?.type })),
        jcRecipes,
      };
      console.log(`[item-db]   Gems: ${gemItems.length} items, ${jcRecipes.length} JC recipes`);
    }

    // ══════════════════════════════════════════════════════════
    // STEP 6: Consumables (Alchemy 171, Cooking 185)
    // ══════════════════════════════════════════════════════════
    if (doAll || categories.includes("consumables")) {
      console.log("[item-db] STEP 6: Fetching Consumables...");
      const consumables: Record<string, any[]> = {};

      // Potions, Flasks, Food
      const cTypes = [
        { subclass: 1, label: "potions" },
        { subclass: 3, label: "flasks_phials" },
        { subclass: 5, label: "food_drink" },
      ];
      for (const ct of cTypes) {
        const items = await searchItems(region, `item_class.id=0&item_subclass.id=${ct.subclass}&required_level=68,90&orderby=level:desc`);
        consumables[ct.label] = items.map(i => ({
          id: i.id, name: i.name?.en_US, quality: i.quality?.type, requiredLevel: i.required_level,
        }));
        console.log(`[item-db]   ${ct.label}: ${consumables[ct.label].length}`);
      }

      // Alchemy recipes
      try {
        const prof = await blizzGet("/data/wow/profession/171", region);
        if (prof?.skill_tiers?.length) {
          const tier = prof.skill_tiers[prof.skill_tiers.length - 1];
          const tierData = await blizzGet(`/data/wow/profession/171/skill-tier/${tier.id}`, region);
          const alchRecipes: any[] = [];
          for (const cat of tierData?.categories ?? []) {
            for (const r of cat.recipes ?? []) {
              alchRecipes.push({ recipeId: r.id, name: r.name, category: cat.name });
            }
          }
          consumables.alchemyRecipes = alchRecipes;
        }
      } catch (e) { console.warn("[item-db] Alchemy error:", (e as Error).message); }

      // Cooking recipes
      try {
        const prof = await blizzGet("/data/wow/profession/185", region);
        if (prof?.skill_tiers?.length) {
          const tier = prof.skill_tiers[prof.skill_tiers.length - 1];
          const tierData = await blizzGet(`/data/wow/profession/185/skill-tier/${tier.id}`, region);
          const cookRecipes: any[] = [];
          for (const cat of tierData?.categories ?? []) {
            for (const r of cat.recipes ?? []) {
              cookRecipes.push({ recipeId: r.id, name: r.name, category: cat.name });
            }
          }
          consumables.cookingRecipes = cookRecipes;
        }
      } catch (e) { console.warn("[item-db] Cooking error:", (e as Error).message); }

      db.consumables = consumables;
    }

    // ══════════════════════════════════════════════════════════
    // STEP 7: Weapon Enhancements (oils/stones)
    // ══════════════════════════════════════════════════════════
    if (doAll || categories.includes("weapon_enhancements")) {
      console.log("[item-db] STEP 7: Fetching Weapon Enhancements...");
      const items = await searchItems(region,
        `item_subclass.name.en_US=Item%20Enhancement&required_level=68,90&orderby=level:desc`
      );
      db.weaponEnhancements = items.map(i => ({
        id: i.id, name: i.name?.en_US, quality: i.quality?.type, description: i.description?.en_US,
      }));
      console.log(`[item-db]   Weapon Enhancements: ${db.weaponEnhancements.length}`);
    }

    // ══════════════════════════════════════════════════════════
    // SAVE TO DATABASE
    // ══════════════════════════════════════════════════════════
    console.log("[item-db] Saving to database...");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Save full DB
    await supabase.from("simc_data_cache").upsert({
      data_key: "blizzard_item_db",
      data: db,
      github_sha: `item-db-${Date.now()}`,
      updated_at: new Date().toISOString(),
    }, { onConflict: "data_key" });

    // Save individual category caches
    const saveCats: [string, any][] = [
      ["item_db_instances", { instances: db.instances, lootTable: db.lootTable }],
      ["item_db_enriched_items", { enrichedItems: db.enrichedItems, itemsBySlot: db.itemsBySlot, itemsBySource: db.itemsBySource }],
      ["item_db_enchants", { enchantRecipes: db.enchantRecipes }],
      ["item_db_gems", db.gems],
      ["item_db_consumables", db.consumables],
      ["item_db_weapon_enhancements", { weaponEnhancements: db.weaponEnhancements }],
    ];
    for (const [key, data] of saveCats) {
      if (data) {
        await supabase.from("simc_data_cache").upsert({
          data_key: key,
          data: { ...data, fetchedAt: db.fetchedAt, version: db.version },
          github_sha: `${key}-${Date.now()}`,
          updated_at: new Date().toISOString(),
        }, { onConflict: "data_key" });
      }
    }

    // Build stats
    const stats = {
      instances: instances.length,
      lootEntries: allLoot.length,
      enrichedItems: enrichedItems.length,
      totalItemIds: itemIdsToEnrich.size,
      slotCategories: Object.keys(bySlot).length,
      sourceCategories: Object.keys(bySource).length,
      enchantRecipes: db.enchantRecipes?.length ?? 0,
      gems: db.gems?.items?.length ?? 0,
      consumableCategories: db.consumables ? Object.keys(db.consumables).length : 0,
      weaponEnhancements: db.weaponEnhancements?.length ?? 0,
    };

    console.log(`[item-db] Complete!`, JSON.stringify(stats));

    return new Response(JSON.stringify({
      success: true,
      stats,
      fetchedAt: db.fetchedAt,
      sampleSources: Object.keys(bySource).slice(0, 10),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("[item-db] Error:", (error as Error).message, (error as Error).stack);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
