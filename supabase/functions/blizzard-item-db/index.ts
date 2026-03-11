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

async function searchItems(region: string, params: string): Promise<any[]> {
  const token = await getAccessToken(region);
  const url = `https://${region}.api.blizzard.com/data/wow/search/item?namespace=static-${region}&${params}&_pageSize=100`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) return [];
  const data = await resp.json();
  return data.results?.map((r: any) => r.data) ?? [];
}

async function getItem(region: string, itemId: number): Promise<any> {
  const token = await getAccessToken(region);
  const resp = await fetch(
    `https://${region}.api.blizzard.com/data/wow/item/${itemId}?namespace=static-${region}&locale=en_US`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) return null;
  return resp.json();
}

async function getItemMedia(region: string, itemId: number): Promise<string | null> {
  const token = await getAccessToken(region);
  const resp = await fetch(
    `https://${region}.api.blizzard.com/data/wow/media/item/${itemId}?namespace=static-${region}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.assets?.[0]?.value ?? null;
}

// Batch fetch items with rate limiting
async function batchFetch<T>(ids: number[], fn: (id: number) => Promise<T>, batchSize = 15): Promise<Map<number, T>> {
  const results = new Map<number, T>();
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(id => fn(id)));
    settled.forEach((r, idx) => {
      if (r.status === "fulfilled" && r.value) results.set(batch[idx], r.value);
    });
  }
  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const region = body.region ?? "us";
    const categories = body.categories ?? ["all"];
    const doAll = categories.includes("all");

    console.log(`[item-db] Starting item DB build for region=${region}, categories=${JSON.stringify(categories)}`);

    const db: Record<string, any> = {
      version: "midnight-12.0.1",
      fetchedAt: new Date().toISOString(),
      region,
    };

    // ══════════════════════════════════════════════════════════
    // 1. MAIL ARMOR (Hunter/Shaman/Evoker armor type)
    // ══════════════════════════════════════════════════════════
    if (doAll || categories.includes("mail_armor")) {
      console.log("[item-db] Fetching Mail Armor...");
      const mailSlots = [
        { type: "HEAD", name: "head" },
        { type: "SHOULDER", name: "shoulders" },
        { type: "CHEST", name: "chest" },
        { type: "WRIST", name: "wrist" },
        { type: "HANDS", name: "hands" },
        { type: "WAIST", name: "waist" },
        { type: "LEGS", name: "legs" },
        { type: "FEET", name: "boots" },
      ];

      const mailArmor: Record<string, any[]> = {};
      for (const slot of mailSlots) {
        // Midnight ilvl range: 224-289 (Adventurer to Myth track)
        const items = await searchItems(region,
          `inventory_type.type=${slot.type}&item_class.id=4&item_subclass.id=3&level=224,289&orderby=level:desc`
        );
        mailArmor[slot.name] = items.map(i => ({
          id: i.id,
          name: i.name?.en_US,
          ilvl: i.level,
          quality: i.quality?.type,
          requiredLevel: i.required_level,
          inventoryType: slot.type,
        }));
        console.log(`[item-db]   ${slot.name}: ${mailArmor[slot.name].length} items`);
      }
      db.mailArmor = mailArmor;
    }

    // ══════════════════════════════════════════════════════════
    // 2. RINGS (Fingers - all armor types can use)
    // ══════════════════════════════════════════════════════════
    if (doAll || categories.includes("rings")) {
      console.log("[item-db] Fetching Rings...");
      const rings = await searchItems(region,
        `inventory_type.type=FINGER&level=224,289&orderby=level:desc`
      );
      db.rings = rings.map(i => ({
        id: i.id,
        name: i.name?.en_US,
        ilvl: i.level,
        quality: i.quality?.type,
        requiredLevel: i.required_level,
      }));
      console.log(`[item-db]   Rings: ${db.rings.length}`);
    }

    // ══════════════════════════════════════════════════════════
    // 3. TRINKETS
    // ══════════════════════════════════════════════════════════
    if (doAll || categories.includes("trinkets")) {
      console.log("[item-db] Fetching Trinkets...");
      const trinkets = await searchItems(region,
        `inventory_type.type=TRINKET&level=224,289&orderby=level:desc`
      );
      db.trinkets = trinkets.map(i => ({
        id: i.id,
        name: i.name?.en_US,
        ilvl: i.level,
        quality: i.quality?.type,
        requiredLevel: i.required_level,
      }));
      console.log(`[item-db]   Trinkets: ${db.trinkets.length}`);
    }

    // ══════════════════════════════════════════════════════════
    // 4. WEAPONS - 2H Polearms, 2H Staves, 1H Swords/Axes/Fists
    // ══════════════════════════════════════════════════════════
    if (doAll || categories.includes("weapons")) {
      console.log("[item-db] Fetching Weapons...");
      // item_class=2 (Weapon), subclass IDs:
      // 0=1H Axe, 4=1H Mace, 7=1H Sword, 13=Fist Weapon
      // 6=Polearm(2H), 10=Staff(2H)
      const weaponTypes = [
        { subclass: 6, label: "polearm_2h" },
        { subclass: 10, label: "staff_2h" },
        { subclass: 0, label: "axe_1h" },
        { subclass: 7, label: "sword_1h" },
        { subclass: 13, label: "fist_1h" },
        { subclass: 4, label: "mace_1h" },
        { subclass: 15, label: "dagger" },
      ];

      const weapons: Record<string, any[]> = {};
      for (const wt of weaponTypes) {
        const items = await searchItems(region,
          `item_class.id=2&item_subclass.id=${wt.subclass}&level=224,289&orderby=level:desc`
        );
        weapons[wt.label] = items.map(i => ({
          id: i.id,
          name: i.name?.en_US,
          ilvl: i.level,
          quality: i.quality?.type,
          requiredLevel: i.required_level,
        }));
        console.log(`[item-db]   ${wt.label}: ${weapons[wt.label].length}`);
      }
      db.weapons = weapons;
    }

    // ══════════════════════════════════════════════════════════
    // 5. ENCHANTS (from Enchanting profession recipes - Midnight tier)
    // ══════════════════════════════════════════════════════════
    if (doAll || categories.includes("enchants")) {
      console.log("[item-db] Fetching Enchanting recipes...");
      const token = await getAccessToken(region);
      
      // Enchanting = profession 333, get Midnight skill tier
      let enchantRecipes: any[] = [];
      try {
        const profResp = await fetch(
          `https://${region}.api.blizzard.com/data/wow/profession/333?namespace=static-${region}&locale=en_US`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (profResp.ok) {
          const prof = await profResp.json();
          const midnightTier = prof.skill_tiers?.[prof.skill_tiers.length - 1];
          if (midnightTier?.id) {
            const tierResp = await fetch(
              `https://${region}.api.blizzard.com/data/wow/profession/333/skill-tier/${midnightTier.id}?namespace=static-${region}&locale=en_US`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (tierResp.ok) {
              const tierData = await tierResp.json();
              // Filter to gear enchant categories only
              const gearCategories = ["Weapon Enchants", "Chest Enchants", "Helm Enchants",
                "Boot Enchants", "Rings Enchants", "Shoulder Enchants"];
              for (const cat of tierData.categories ?? []) {
                if (gearCategories.includes(cat.name)) {
                  for (const recipe of cat.recipes ?? []) {
                    enchantRecipes.push({
                      recipeId: recipe.id,
                      name: recipe.name,
                      category: cat.name,
                    });
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn("[item-db] Enchanting fetch error:", (e as Error).message);
      }

      // Also fetch Leatherworking for leg armor kits (profession 165)
      try {
        const lwResp = await fetch(
          `https://${region}.api.blizzard.com/data/wow/profession/165?namespace=static-${region}&locale=en_US`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (lwResp.ok) {
          const lw = await lwResp.json();
          const lwTier = lw.skill_tiers?.[lw.skill_tiers.length - 1];
          if (lwTier?.id) {
            const tierResp = await fetch(
              `https://${region}.api.blizzard.com/data/wow/profession/165/skill-tier/${lwTier.id}?namespace=static-${region}&locale=en_US`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (tierResp.ok) {
              const tierData = await tierResp.json();
              for (const cat of tierData.categories ?? []) {
                if (cat.name?.toLowerCase().includes("armor kit") || cat.name?.toLowerCase().includes("leg")) {
                  for (const recipe of cat.recipes ?? []) {
                    enchantRecipes.push({
                      recipeId: recipe.id,
                      name: recipe.name,
                      category: "Leg Armor Kits (LW)",
                    });
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn("[item-db] LW fetch error:", (e as Error).message);
      }

      db.enchants = enchantRecipes;
      console.log(`[item-db]   Enchant recipes: ${enchantRecipes.length}`);
    }

    // ══════════════════════════════════════════════════════════
    // 6. GEMS (Jewelcrafting - profession 755)
    // ══════════════════════════════════════════════════════════
    if (doAll || categories.includes("gems")) {
      console.log("[item-db] Fetching Gems...");
      // Search for gems: item_class=3 (Gem)
      const gems = await searchItems(region,
        `item_class.id=3&level=1,300&orderby=level:desc&_pageSize=100`
      );
      
      // Also get JC profession recipes for Midnight gems
      const token = await getAccessToken(region);
      let jcRecipes: any[] = [];
      try {
        const jcResp = await fetch(
          `https://${region}.api.blizzard.com/data/wow/profession/755?namespace=static-${region}&locale=en_US`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (jcResp.ok) {
          const jc = await jcResp.json();
          const jcTier = jc.skill_tiers?.[jc.skill_tiers.length - 1];
          if (jcTier?.id) {
            const tierResp = await fetch(
              `https://${region}.api.blizzard.com/data/wow/profession/755/skill-tier/${jcTier.id}?namespace=static-${region}&locale=en_US`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (tierResp.ok) {
              const tierData = await tierResp.json();
              for (const cat of tierData.categories ?? []) {
                if (cat.name?.toLowerCase().includes("gem") || cat.name?.toLowerCase().includes("cut")) {
                  for (const recipe of cat.recipes ?? []) {
                    jcRecipes.push({
                      recipeId: recipe.id,
                      name: recipe.name,
                      category: cat.name,
                    });
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn("[item-db] JC fetch error:", (e as Error).message);
      }

      db.gems = {
        searchResults: gems.map(i => ({
          id: i.id,
          name: i.name?.en_US,
          ilvl: i.level,
          quality: i.quality?.type,
        })),
        jcRecipes,
      };
      console.log(`[item-db]   Gems: ${gems.length} items, ${jcRecipes.length} JC recipes`);
    }

    // ══════════════════════════════════════════════════════════
    // 7. CONSUMABLES (Alchemy profession 171)
    // ══════════════════════════════════════════════════════════
    if (doAll || categories.includes("consumables")) {
      console.log("[item-db] Fetching Consumables...");
      const token = await getAccessToken(region);
      
      // Consumable item_class=0
      // Subclass: 1=Potion, 2=Elixir, 3=Flask/Phial, 5=Food/Drink
      const consumableTypes = [
        { subclass: 1, label: "potions" },
        { subclass: 2, label: "elixirs" },
        { subclass: 3, label: "flasks_phials" },
        { subclass: 5, label: "food_drink" },
      ];

      const consumables: Record<string, any[]> = {};
      for (const ct of consumableTypes) {
        const items = await searchItems(region,
          `item_class.id=0&item_subclass.id=${ct.subclass}&required_level=68,90&orderby=level:desc`
        );
        consumables[ct.label] = items.map(i => ({
          id: i.id,
          name: i.name?.en_US,
          ilvl: i.level,
          quality: i.quality?.type,
          requiredLevel: i.required_level,
        }));
        console.log(`[item-db]   ${ct.label}: ${consumables[ct.label].length}`);
      }

      // Alchemy profession recipes for Midnight
      let alchRecipes: any[] = [];
      try {
        const alchResp = await fetch(
          `https://${region}.api.blizzard.com/data/wow/profession/171?namespace=static-${region}&locale=en_US`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (alchResp.ok) {
          const alch = await alchResp.json();
          const alchTier = alch.skill_tiers?.[alch.skill_tiers.length - 1];
          if (alchTier?.id) {
            const tierResp = await fetch(
              `https://${region}.api.blizzard.com/data/wow/profession/171/skill-tier/${alchTier.id}?namespace=static-${region}&locale=en_US`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (tierResp.ok) {
              const tierData = await tierResp.json();
              for (const cat of tierData.categories ?? []) {
                for (const recipe of cat.recipes ?? []) {
                  alchRecipes.push({
                    recipeId: recipe.id,
                    name: recipe.name,
                    category: cat.name,
                  });
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn("[item-db] Alchemy fetch error:", (e as Error).message);
      }

      consumables.alchemyRecipes = alchRecipes;
      db.consumables = consumables;
    }

    // ══════════════════════════════════════════════════════════
    // 8. WEAPON ENHANCEMENTS (oils, stones, weight stones)
    // ══════════════════════════════════════════════════════════
    if (doAll || categories.includes("weapon_enhancements")) {
      console.log("[item-db] Fetching Weapon Enhancements...");
      // Item Enhancement subclass under consumables
      const enhancements = await searchItems(region,
        `item_subclass.name.en_US=Item%20Enhancement&required_level=68,90&orderby=level:desc`
      );
      db.weaponEnhancements = enhancements.map(i => ({
        id: i.id,
        name: i.name?.en_US,
        ilvl: i.level,
        quality: i.quality?.type,
        requiredLevel: i.required_level,
        description: i.description?.en_US,
      }));
      console.log(`[item-db]   Weapon Enhancements: ${db.weaponEnhancements?.length ?? 0}`);
    }

    // ══════════════════════════════════════════════════════════
    // 9. AUGMENT RUNES
    // ══════════════════════════════════════════════════════════
    if (doAll || categories.includes("augment_runes")) {
      console.log("[item-db] Fetching Augment Runes...");
      const runes = await searchItems(region,
        `name.en_US=Augment%20Rune&orderby=level:desc`
      );
      db.augmentRunes = runes.map(i => ({
        id: i.id,
        name: i.name?.en_US,
        ilvl: i.level,
        quality: i.quality?.type,
      }));
      console.log(`[item-db]   Augment Runes: ${db.augmentRunes?.length ?? 0}`);
    }

    // ══════════════════════════════════════════════════════════
    // 10. COOKING RECIPES (profession 185)
    // ══════════════════════════════════════════════════════════
    if (doAll || categories.includes("cooking")) {
      console.log("[item-db] Fetching Cooking recipes...");
      const token = await getAccessToken(region);
      let cookingRecipes: any[] = [];
      try {
        const cookResp = await fetch(
          `https://${region}.api.blizzard.com/data/wow/profession/185?namespace=static-${region}&locale=en_US`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (cookResp.ok) {
          const cook = await cookResp.json();
          const cookTier = cook.skill_tiers?.[cook.skill_tiers.length - 1];
          if (cookTier?.id) {
            const tierResp = await fetch(
              `https://${region}.api.blizzard.com/data/wow/profession/185/skill-tier/${cookTier.id}?namespace=static-${region}&locale=en_US`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (tierResp.ok) {
              const tierData = await tierResp.json();
              for (const cat of tierData.categories ?? []) {
                for (const recipe of cat.recipes ?? []) {
                  cookingRecipes.push({
                    recipeId: recipe.id,
                    name: recipe.name,
                    category: cat.name,
                  });
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn("[item-db] Cooking fetch error:", (e as Error).message);
      }
      db.cooking = cookingRecipes;
      console.log(`[item-db]   Cooking recipes: ${cookingRecipes.length}`);
    }

    // ══════════════════════════════════════════════════════════
    // SAVE TO DATABASE
    // ══════════════════════════════════════════════════════════
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Save full DB
    const { error: upsertError } = await supabase
      .from("simc_data_cache")
      .upsert({
        data_key: "blizzard_item_db",
        data: db,
        github_sha: `item-db-${Date.now()}`,
        updated_at: new Date().toISOString(),
      }, { onConflict: "data_key" });

    if (upsertError) {
      console.warn("[item-db] DB upsert error:", upsertError.message);
    }

    // Also save individual category caches for faster partial reads
    const categoryKeys = Object.keys(db).filter(k => !["version", "fetchedAt", "region"].includes(k));
    for (const key of categoryKeys) {
      await supabase.from("simc_data_cache").upsert({
        data_key: `item_db_${key}`,
        data: { [key]: db[key], fetchedAt: db.fetchedAt, version: db.version },
        github_sha: `item-db-${key}-${Date.now()}`,
        updated_at: new Date().toISOString(),
      }, { onConflict: "data_key" });
    }

    // Build stats summary
    const stats: Record<string, number> = {};
    if (db.mailArmor) stats.mailArmorSlots = Object.keys(db.mailArmor).length;
    if (db.mailArmor) stats.mailArmorTotal = Object.values(db.mailArmor).reduce((s: number, arr: any) => s + arr.length, 0);
    if (db.rings) stats.rings = db.rings.length;
    if (db.trinkets) stats.trinkets = db.trinkets.length;
    if (db.weapons) stats.weaponTypes = Object.keys(db.weapons).length;
    if (db.weapons) stats.weaponsTotal = Object.values(db.weapons).reduce((s: number, arr: any) => s + arr.length, 0);
    if (db.enchants) stats.enchantRecipes = db.enchants.length;
    if (db.gems) stats.gems = db.gems.searchResults?.length ?? 0;
    if (db.gems) stats.jcRecipes = db.gems.jcRecipes?.length ?? 0;
    if (db.consumables) stats.consumableCategories = Object.keys(db.consumables).length;
    if (db.weaponEnhancements) stats.weaponEnhancements = db.weaponEnhancements.length;
    if (db.augmentRunes) stats.augmentRunes = db.augmentRunes.length;
    if (db.cooking) stats.cookingRecipes = db.cooking.length;

    console.log(`[item-db] Complete!`, JSON.stringify(stats));

    return new Response(JSON.stringify({
      success: true,
      stats,
      fetchedAt: db.fetchedAt,
      categoriesSaved: categoryKeys,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("[item-db] Error:", (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
