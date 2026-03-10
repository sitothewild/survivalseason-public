import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Cache OAuth tokens per region
const tokenCache: Record<string, { token: string; expiry: number }> = {};

async function getAccessToken(region = "us"): Promise<string> {
  const cached = tokenCache[region];
  if (cached && Date.now() < cached.expiry) return cached.token;

  const clientId = Deno.env.get("BLIZZARD_CLIENT_ID");
  const clientSecret = Deno.env.get("BLIZZARD_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("BLIZZARD_CLIENT_ID or BLIZZARD_CLIENT_SECRET not configured");
  }

  // Use region-specific OAuth endpoint to get a region-appropriate token
  const oauthUrl = region === "cn"
    ? "https://oauth.battlenet.com.cn/token"
    : `https://${region}.battle.net/oauth/token`;

  const resp = await fetch(oauthUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + btoa(`${clientId}:${clientSecret}`),
    },
    body: "grant_type=client_credentials",
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OAuth token request failed (${oauthUrl}): ${resp.status} ${text}`);
  }

  const data = await resp.json();
  tokenCache[region] = {
    token: data.access_token,
    expiry: Date.now() + (data.expires_in - 60) * 1000,
  };
  return data.access_token;
}

async function blizzardGet(path: string, region: string, namespace: string, locale = "en_US") {
  const token = await getAccessToken(region);
  const host = region === "cn" ? "gateway.battlenet.com.cn" : `${region}.api.blizzard.com`;
  const url = `https://${host}${path}?namespace=${namespace}-${region}&locale=${locale}`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    if (resp.status === 404) {
      return null; // Item not found — return null instead of throwing
    }
    const text = await resp.text();
    throw new Error(`Blizzard API ${resp.status}: ${text}`);
  }
  return resp.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, region = "us", ...params } = await req.json();

    let result: unknown;

    switch (action) {
      // Get a single item by ID
      case "item": {
        const { itemId } = params;
        if (!itemId) throw new Error("itemId is required");
        result = await blizzardGet(`/data/wow/item/${itemId}`, region, "static");
        break;
      }

      // Get item media (icon)
      case "item-media": {
        const { itemId } = params;
        if (!itemId) throw new Error("itemId is required");
        result = await blizzardGet(`/data/wow/media/item/${itemId}`, region, "static");
        break;
      }

      // Search items by name
      case "item-search": {
        const { name, page = 1 } = params;
        if (!name) throw new Error("name is required");
        const token = await getAccessToken(region);
        const host = `${region}.api.blizzard.com`;
        const url = `https://${host}/data/wow/search/item?namespace=static-${region}&name.en_US=${encodeURIComponent(name)}&orderby=id&_page=${page}`;
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`Search failed: ${resp.status} ${text}`);
        }
        result = await resp.json();
        break;
      }

      // Get playable specialization (e.g., Survival Hunter = 255)
      case "specialization": {
        const { specId } = params;
        if (!specId) throw new Error("specId is required");
        result = await blizzardGet(`/data/wow/playable-specialization/${specId}`, region, "static");
        break;
      }

      // Get playable class by ID (Hunter = 3)
      case "class": {
        const { classId } = params;
        if (!classId) throw new Error("classId is required");
        result = await blizzardGet(`/data/wow/playable-class/${classId}`, region, "static");
        break;
      }

      // Get item classes index (weapon types, armor types, etc.)
      case "item-classes": {
        result = await blizzardGet("/data/wow/item-class/index", region, "static");
        break;
      }

      // Get item subclass
      case "item-subclass": {
        const { itemClassId, itemSubclassId } = params;
        if (!itemClassId || !itemSubclassId) throw new Error("itemClassId and itemSubclassId required");
        result = await blizzardGet(`/data/wow/item-class/${itemClassId}/item-subclass/${itemSubclassId}`, region, "static");
        break;
      }

      // Get item set by ID
      case "item-set": {
        const { itemSetId } = params;
        if (!itemSetId) throw new Error("itemSetId is required");
        result = await blizzardGet(`/data/wow/item-set/${itemSetId}`, region, "static");
        break;
      }

      // Get playable races index (for character renders fallback)
      case "races": {
        result = await blizzardGet("/data/wow/playable-race/index", region, "static");
        break;
      }

      // Get a single spell by ID
      case "spell": {
        const { spellId } = params;
        if (!spellId) throw new Error("spellId is required");
        result = await blizzardGet(`/data/wow/spell/${spellId}`, region, "static");
        break;
      }

      // Search spells by name
      case "spell-search": {
        const { name, page = 1 } = params;
        if (!name) throw new Error("name is required");
        const token = await getAccessToken(region);
        const host = `${region}.api.blizzard.com`;
        const url = `https://${host}/data/wow/search/spell?namespace=static-${region}&name.en_US=${encodeURIComponent(name)}&orderby=id:desc&_page=${page}`;
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`Spell search failed: ${resp.status} ${text}`);
        }
        result = await resp.json();
        break;
      }

      // Get talent tree index
      case "talent-tree-index": {
        result = await blizzardGet("/data/wow/talent-tree/index", region, "static");
        break;
      }

      // Get talent tree for a spec
      case "talent-tree": {
        const { treeId, specId } = params;
        if (!treeId || !specId) throw new Error("treeId and specId are required");
        result = await blizzardGet(`/data/wow/talent-tree/${treeId}/playable-specialization/${specId}`, region, "static");
        break;
      }

      // Get hero talent tree (sub-tree)
      case "talent-tree-nodes": {
        const { treeId } = params;
        if (!treeId) throw new Error("treeId is required");
        result = await blizzardGet(`/data/wow/talent-tree/${treeId}`, region, "static");
        break;
      }

      // Batch: fetch multiple items at once (up to 20)
      case "items-batch": {
        const { itemIds } = params;
        if (!itemIds || !Array.isArray(itemIds)) throw new Error("itemIds array is required");
        const ids = itemIds.slice(0, 20); // limit to 20
        const token = await getAccessToken(region);
        const host = `${region}.api.blizzard.com`;
        const results = await Promise.all(
          ids.map(async (id: number) => {
            try {
              const url = `https://${host}/data/wow/item/${id}?namespace=static-${region}&locale=en_US`;
              const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
              if (!resp.ok) {
                const text = await resp.text();
                return { id, error: `${resp.status}: ${text}` };
              }
              return await resp.json();
            } catch (e: unknown) {
              return { id, error: (e as Error).message };
            }
          })
        );
        result = results;
        break;
      }

      // Fetch full Survival Hunter talent tree: spec tree + linked hero trees + all spell icons
      // Returns { specTree, heroTrees[], mediaMap{ spellId → iconUrl } }
      case "talent-tree-full": {
        const treeId = (params as any).treeId ?? 774;
        const specId = (params as any).specId ?? 255;
        const specTree = await blizzardGet(
          `/data/wow/talent-tree/${treeId}/playable-specialization/${specId}`,
          region, "static"
        );
        if (!specTree) throw new Error(`Spec talent tree ${treeId}/${specId} not found`);

        // Normalize nodes: Blizzard API uses "ranks" with "tooltip.spell_tooltip",
        // but the frontend expects "entries" with direct "spell_tooltip".
        function normalizeNodes(nodes: any[]): any[] {
          return (nodes ?? []).map((n: any) => {
            // If node already has "entries", pass through
            if (n.entries?.length) return n;
            // Convert "ranks" → "entries"
            if (n.ranks?.length) {
              const entries = n.ranks.map((r: any) => ({
                spell_tooltip: r.tooltip?.spell_tooltip ?? null,
                max_rank: r.rank ?? 1,
                default_points: r.default_points ?? 0,
              }));
              return { ...n, entries };
            }
            return { ...n, entries: [] };
          });
        }

        // Also remap node_type: API uses "CHOICE" but frontend expects "SELECTION"
        function remapNodeType(nodes: any[]): any[] {
          return nodes.map((n: any) => {
            if (n.node_type?.type === "CHOICE") {
              return { ...n, node_type: { ...n.node_type, type: "SELECTION" } };
            }
            return n;
          });
        }

        // Add prerequisite_nodes from "unlocks" (reverse mapping)
        function addPrerequisites(nodes: any[]): any[] {
          const unlockMap = new Map<number, number[]>(); // childId → parentIds
          for (const n of nodes) {
            for (const childId of n.unlocks ?? []) {
              const parents = unlockMap.get(childId) ?? [];
              parents.push(n.id);
              unlockMap.set(childId, parents);
            }
          }
          return nodes.map((n: any) => {
            const parentIds = unlockMap.get(n.id);
            if (parentIds?.length && !n.prerequisite_nodes?.length) {
              return { ...n, prerequisite_nodes: parentIds.map((id) => ({ id })) };
            }
            return n;
          });
        }

        function processNodes(nodes: any[]): any[] {
          return addPrerequisites(remapNodeType(normalizeNodes(nodes)));
        }

        specTree.class_talent_nodes = processNodes(specTree.class_talent_nodes ?? []);
        specTree.spec_talent_nodes = processNodes(specTree.spec_talent_nodes ?? []);

        // Fetch hero trees linked in the spec tree response
        const heroTreeRefs: Array<{ id: number; name: string }> = specTree.hero_talent_trees ?? [];
        
        // If no hero_talent_trees in spec response, try fetching the full tree to find them
        if (!heroTreeRefs.length) {
          try {
            const fullTree = await blizzardGet(`/data/wow/talent-tree/${treeId}`, region, "static");
            if (fullTree?.hero_talent_trees) {
              // Filter to hero trees relevant to this spec
              const relevantHeroTrees = (fullTree.hero_talent_trees ?? []).filter((ht: any) => {
                const specs = ht.playable_specializations ?? [];
                return specs.some((s: any) => s.id === specId);
              });
              heroTreeRefs.push(...relevantHeroTrees.map((ht: any) => ({
                id: ht.id,
                name: ht.name ?? `Hero ${ht.id}`,
              })));
            }
          } catch { /* ignore */ }
        }

        const heroTrees = await Promise.all(
          heroTreeRefs.map(async (ht) => {
            try {
              // Try the hero-talent sub-endpoint first
              const heroData = await blizzardGet(
                `/data/wow/talent-tree/${treeId}/hero-talent/${ht.id}`,
                region, "static"
              );
              if (heroData) {
                // Normalize hero tree nodes
                const nodeKey = heroData.hero_talent_nodes ? "hero_talent_nodes"
                  : heroData.spec_talent_nodes ? "spec_talent_nodes"
                  : "class_talent_nodes";
                if (heroData[nodeKey]) {
                  heroData[nodeKey] = processNodes(heroData[nodeKey]);
                }
                return { ...heroData, id: ht.id, name: ht.name ?? heroData.name };
              }
              return null;
            } catch {
              return null;
            }
          })
        );
        const validHeroTrees = heroTrees.filter(Boolean);

        // Collect all nodes across class, spec, and hero trees
        const allNodes: any[] = [
          ...(specTree.class_talent_nodes ?? []),
          ...(specTree.spec_talent_nodes ?? []),
          ...validHeroTrees.flatMap((ht: any) =>
            ht.hero_talent_nodes ?? ht.spec_talent_nodes ?? ht.class_talent_nodes ?? []
          ),
        ];

        // Gather unique spell IDs from every node entry
        const spellIds = [
          ...new Set(
            allNodes.flatMap((n: any) =>
              (n.entries ?? [])
                .map((e: any) => e.spell_tooltip?.spell?.id)
                .filter(Boolean)
            )
          ),
        ] as number[];

        // Always include Survival Hunter hero talent spell IDs (API hero-talent endpoint is unavailable)
        const heroSpellIds = [
          1253599, 1253825, 1253831, 1264902, 1253751, 1253807, 1253830, 450379,
          1264904, 1266069, 1253846, 1253852, 450376, 450380, 1264903, 1253732,
          450373, 450378, 450384, // Sentinel
          472358, 472357, 472719, 472720, 472476, 472524, 472550, 472639, 1264781,
          472660, 472707, 1264797, 1264792, 1264775, 472741, // Pack Leader
        ];
        for (const hid of heroSpellIds) {
          if (!spellIds.includes(hid)) spellIds.push(hid);
        }

        // Batch-fetch all spell media icons in parallel (limit to 50 to avoid timeout)
        const limitedSpellIds = spellIds.slice(0, 80);
        const mediaResults = await Promise.allSettled(
          limitedSpellIds.map((id) =>
            blizzardGet(`/data/wow/media/spell/${id}`, region, "static")
          )
        );
        const mediaMap: Record<number, string> = {};
        limitedSpellIds.forEach((id, i) => {
          const r = mediaResults[i];
          if (r.status === "fulfilled" && r.value?.assets) {
            const icon = (r.value.assets as any[]).find((a) => a.key === "icon");
            if (icon?.value) mediaMap[id] = icon.value;
          }
        });

        result = { specTree, heroTrees: validHeroTrees, mediaMap };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}. Supported: item, item-media, item-search, spell, spell-search, specialization, class, item-classes, item-subclass, item-set, races, items-batch, talent-tree-index, talent-tree, talent-tree-nodes, talent-tree-full`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
