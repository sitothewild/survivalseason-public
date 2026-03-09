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

      default:
        throw new Error(`Unknown action: ${action}. Supported: item, item-media, item-search, spell, spell-search, specialization, class, item-classes, item-subclass, item-set, races, items-batch`);
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
