import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Cache OAuth tokens
const tokenCache: Record<string, { token: string; expiry: number }> = {};

async function getAccessToken(region = "us"): Promise<string> {
  const cached = tokenCache[region];
  if (cached && Date.now() < cached.expiry) return cached.token;

  const clientId = Deno.env.get("BLIZZARD_CLIENT_ID");
  const clientSecret = Deno.env.get("BLIZZARD_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("BLIZZARD_CLIENT_ID or BLIZZARD_CLIENT_SECRET not configured");

  const oauthUrl = `https://${region}.battle.net/oauth/token`;
  const resp = await fetch(oauthUrl, {
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

async function blizzardGet(path: string, region: string, namespace: string) {
  const token = await getAccessToken(region);
  const host = `${region}.api.blizzard.com`;
  const url = `https://${host}${path}?namespace=${namespace}-${region}&locale=en_US`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) {
    if (resp.status === 404) return null;
    throw new Error(`Blizzard API ${resp.status}: ${await resp.text()}`);
  }
  return resp.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { region = "us" } = await req.json();

    console.log("[snapshot] Starting Blizzard data snapshot...");

    // 1. Fetch talent tree (Tree 774 = Hunter, Spec 255 = Survival)
    console.log("[snapshot] Fetching talent tree...");
    const talentTree = await blizzardGet("/data/wow/talent-tree/774/hunter-survival", region, "static");

    // 2. Fetch talent tree nodes (detailed node data)
    console.log("[snapshot] Fetching talent tree nodes...");
    const talentNodes = await blizzardGet("/data/wow/talent-tree/774", region, "static");

    // 3. Fetch Survival spec data
    console.log("[snapshot] Fetching spec data...");
    const specData = await blizzardGet("/data/wow/playable-specialization/255", region, "static");

    // 4. Collect spell IDs from talent nodes for batch fetching
    const spellIds = new Set<number>();
    const collectSpells = (nodes: any[]) => {
      for (const node of nodes || []) {
        for (const rank of node.ranks || []) {
          const spellId = rank?.tooltip?.spell_tooltip?.spell?.id || rank?.spell?.id;
          if (spellId) spellIds.add(spellId);
          // Choice nodes
          if (rank?.choice_of_tooltips) {
            for (const choice of rank.choice_of_tooltips) {
              const cId = choice?.spell_tooltip?.spell?.id;
              if (cId) spellIds.add(cId);
            }
          }
        }
        // Also check entries format (normalized)
        for (const entry of node.entries || []) {
          const spellId = entry?.spell_tooltip?.spell?.id;
          if (spellId) spellIds.add(spellId);
        }
      }
    };

    if (talentTree) {
      collectSpells(talentTree.class_talent_nodes || []);
      collectSpells(talentTree.spec_talent_nodes || []);
      // Hero trees
      for (const heroTree of talentTree.hero_talent_trees || []) {
        collectSpells(heroTree.hero_talent_nodes || []);
      }
    }

    // 5. Fetch spell data in batches (max 20 per batch to avoid timeouts)
    console.log(`[snapshot] Fetching ${spellIds.size} spells...`);
    const spellData: Record<number, any> = {};
    const spellIdArray = Array.from(spellIds);
    const BATCH_SIZE = 20;

    for (let i = 0; i < spellIdArray.length; i += BATCH_SIZE) {
      const batch = spellIdArray.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(id => blizzardGet(`/data/wow/spell/${id}`, region, "static"))
      );
      results.forEach((result, idx) => {
        if (result.status === "fulfilled" && result.value) {
          spellData[batch[idx]] = result.value;
        }
      });
    }

    // 6. Fetch spell media (icons) in batches
    console.log(`[snapshot] Fetching spell media...`);
    const spellMedia: Record<number, string> = {};
    for (let i = 0; i < spellIdArray.length; i += BATCH_SIZE) {
      const batch = spellIdArray.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(id => blizzardGet(`/data/wow/media/spell/${id}`, region, "static"))
      );
      results.forEach((result, idx) => {
        if (result.status === "fulfilled" && result.value?.assets?.[0]?.value) {
          spellMedia[batch[idx]] = result.value.assets[0].value;
        }
      });
    }

    // 7. Fetch enchant data from Blizzard API
    console.log("[snapshot] Fetching enchant data (Item Enhancement items)...");
    const enchantData: any[] = [];
    const enchantSearchNames = [
      // Weapon enchants
      "Authority of", "Stonebound", "Oathsworn",
      // Chest enchants
      "Crystalline Radiance", "Council's",
      // Cloak enchants
      "Chant of", "Winged Grace",
      // Wrist enchants
      "Chant of",
      // Leg armor kits
      "Stormbound Armor Kit", "Sunset Spellthread", "Dual Layered Armor Kit",
      // Boot enchants
      "Cavalry", "Scout's March", "Defender's March",
      // Ring enchants
      "Radiant", "Cursed",
    ];
    // De-duplicate search terms
    const uniqueSearches = [...new Set(enchantSearchNames)];
    for (let i = 0; i < uniqueSearches.length; i += 5) {
      const batch = uniqueSearches.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(async (name) => {
          const token = await getAccessToken(region);
          const host = `${region}.api.blizzard.com`;
          const url = `https://${host}/data/wow/search/item?namespace=static-${region}&name.en_US=${encodeURIComponent(name)}&itemSubclass.name.en_US=Item%20Enhancement&orderby=id:desc&_pageSize=25`;
          const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          if (!resp.ok) return null;
          return resp.json();
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value?.results) {
          enchantData.push(...r.value.results);
        }
      }
    }

    // De-duplicate enchant results by item ID
    const enchantMap = new Map<number, any>();
    for (const item of enchantData) {
      const id = item?.data?.id;
      if (id && !enchantMap.has(id)) enchantMap.set(id, item.data);
    }
    const uniqueEnchants = Array.from(enchantMap.values());
    console.log(`[snapshot] Found ${uniqueEnchants.length} unique enchant items`);

    // 8. Fetch Enchanting profession skill tiers for Midnight recipes
    console.log("[snapshot] Fetching Enchanting profession data...");
    let enchantingProfession: any = null;
    let enchantingRecipes: any = null;
    try {
      enchantingProfession = await blizzardGet("/data/wow/profession/333", region, "static");
      // Find the Midnight skill tier (latest one)
      if (enchantingProfession?.skill_tiers?.length) {
        const latestTier = enchantingProfession.skill_tiers[enchantingProfession.skill_tiers.length - 1];
        if (latestTier?.id) {
          enchantingRecipes = await blizzardGet(`/data/wow/profession/333/skill-tier/${latestTier.id}`, region, "static");
        }
      }
    } catch (e) {
      console.warn("[snapshot] Enchanting profession fetch warning:", (e as Error).message);
    }

    // 9. Fetch Survival Hunter class data
    console.log("[snapshot] Fetching Survival Hunter class data...");
    const hunterClass = await blizzardGet("/data/wow/playable-class/3", region, "static");

    // Build the snapshot
    const snapshot = {
      version: "midnight-12.0.1",
      fetchedAt: new Date().toISOString(),
      region,
      talentTree: talentTree ? {
        id: talentTree.id,
        class_talent_nodes: talentTree.class_talent_nodes,
        spec_talent_nodes: talentTree.spec_talent_nodes,
        hero_talent_trees: talentTree.hero_talent_trees,
        restriction_lines: talentTree.restriction_lines,
        playable_specialization: talentTree.playable_specialization,
      } : null,
      talentNodes: talentNodes ? {
        id: talentNodes.id,
        talent_nodes: talentNodes.talent_nodes,
      } : null,
      specData: specData ? {
        id: specData.id,
        name: specData.name,
        playable_class: specData.playable_class,
        role: specData.role,
        power_type: specData.power_type,
      } : null,
      spells: spellData,
      spellMedia,
      enchants: uniqueEnchants,
      enchantingProfession: enchantingProfession ? {
        id: enchantingProfession.id,
        name: enchantingProfession.name,
        skill_tiers: enchantingProfession.skill_tiers,
      } : null,
      enchantingRecipes: enchantingRecipes ? {
        categories: enchantingRecipes.categories,
      } : null,
      hunterClass: hunterClass ? {
        id: hunterClass.id,
        name: hunterClass.name,
        specializations: hunterClass.specializations,
      } : null,
      stats: {
        totalSpells: Object.keys(spellData).length,
        totalIcons: Object.keys(spellMedia).length,
        classTalentNodes: talentTree?.class_talent_nodes?.length || 0,
        specTalentNodes: talentTree?.spec_talent_nodes?.length || 0,
        heroTrees: talentTree?.hero_talent_trees?.length || 0,
        totalEnchants: uniqueEnchants.length,
      },
    };

    // 10. Cache the snapshot in the database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Store enchant data separately for easy access
    const { error: enchantUpsertError } = await supabase
      .from("simc_data_cache")
      .upsert({
        data_key: "blizzard_enchant_data",
        data: {
          enchants: uniqueEnchants,
          enchantingProfession: snapshot.enchantingProfession,
          enchantingRecipes: snapshot.enchantingRecipes,
          fetchedAt: snapshot.fetchedAt,
        },
        github_sha: `enchant-snapshot-${Date.now()}`,
        updated_at: new Date().toISOString(),
      }, { onConflict: "data_key" });

    if (enchantUpsertError) {
      console.warn("[snapshot] Enchant cache upsert warning:", enchantUpsertError.message);
    }

    const { error: upsertError } = await supabase
      .from("simc_data_cache")
      .upsert({
        data_key: "blizzard_data_snapshot",
        data: snapshot,
        github_sha: `snapshot-${Date.now()}`,
        updated_at: new Date().toISOString(),
      }, { onConflict: "data_key" });

    if (upsertError) {
      console.warn("[snapshot] Cache upsert warning:", upsertError.message);
    }

    console.log(`[snapshot] Complete! ${snapshot.stats.totalSpells} spells, ${snapshot.stats.totalIcons} icons, ${snapshot.stats.classTalentNodes} class nodes, ${snapshot.stats.specTalentNodes} spec nodes, ${snapshot.stats.totalEnchants} enchants`);

    return new Response(JSON.stringify({
      success: true,
      stats: snapshot.stats,
      fetchedAt: snapshot.fetchedAt,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("[snapshot] Error:", (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
