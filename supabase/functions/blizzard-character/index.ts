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
      return null;
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
    const { action, region = "us", realmSlug, characterName, ...params } = await req.json();

    // Validate common params for character endpoints
    const needsChar = ["profile", "equipment", "stats", "specializations", "media", "hunter-pets", "mythic-keystone", "achievements", "full"];
    if (needsChar.includes(action)) {
      if (!realmSlug || !characterName) {
        throw new Error("realmSlug and characterName are required");
      }
    }

    const charBase = `/profile/wow/character/${encodeURIComponent(realmSlug?.toLowerCase())}/${encodeURIComponent(characterName?.toLowerCase())}`;
    let result: unknown;

    switch (action) {
      // Debug action — returns diagnostic info
      case "debug": {
        const clientId = Deno.env.get("BLIZZARD_CLIENT_ID");
        const clientSecret = Deno.env.get("BLIZZARD_CLIENT_SECRET");
        let tokenDebug = "not attempted";
        let profileTest = "not attempted";
        let gameDataTest = "not attempted";
        try {
          // Get raw token response using region-specific endpoint
          const oauthUrl = `https://${region}.battle.net/oauth/token`;
          const tokenResp = await fetch(oauthUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: "Basic " + btoa(`${clientId}:${clientSecret}`),
            },
            body: "grant_type=client_credentials",
          });
          const tokenBody = await tokenResp.text();
          tokenDebug = `status=${tokenResp.status} body=${tokenBody.substring(0, 300)}`;
          
          const tokenData = JSON.parse(tokenBody);
          const token = tokenData.access_token;
          
          const host = `${region}.api.blizzard.com`;
          
          // Test profile API with Bearer header
          const profileUrl = `https://${host}/profile/wow/character/turalyon/blezaa?namespace=profile-${region}&locale=en_US`;
          const profileResp = await fetch(profileUrl, { headers: { Authorization: `Bearer ${token}` } });
          profileTest = `status=${profileResp.status} body=${(await profileResp.text()).substring(0, 200)}`;
          
          // Test game data API with Bearer header
          const itemUrl = `https://${host}/data/wow/item/19019?namespace=static-${region}&locale=en_US`;
          const itemResp = await fetch(itemUrl, { headers: { Authorization: `Bearer ${token}` } });
          gameDataTest = `status=${itemResp.status} body=${(await itemResp.text()).substring(0, 200)}`;
        } catch (e: unknown) {
          tokenDebug += ` error: ${(e as Error).message}`;
        }
        result = {
          clientId: clientId ? `${clientId.substring(0, 8)}...` : "MISSING",
          clientIdLength: clientId?.length,
          secretLength: clientSecret?.length,
          tokenDebug,
          profileTest,
          gameDataTest,
        };
        break;
      }

      // Character profile summary
      case "profile": {
        result = await blizzardGet(charBase, region, "profile");
        break;
      }

      // Character equipment (all equipped items with details)
      case "equipment": {
        result = await blizzardGet(`${charBase}/equipment`, region, "profile");
        break;
      }

      // Character stats (agility, stamina, crit, haste, mastery, vers, etc.)
      case "stats": {
        result = await blizzardGet(`${charBase}/statistics`, region, "profile");
        break;
      }

      // Character active specializations
      case "specializations": {
        result = await blizzardGet(`${charBase}/specializations`, region, "profile");
        break;
      }

      // Character media (avatar, render images)
      case "media": {
        result = await blizzardGet(`${charBase}/character-media`, region, "profile");
        break;
      }

      // Hunter pets (only for hunter characters)
      case "hunter-pets": {
        result = await blizzardGet(`${charBase}/hunter-pets`, region, "profile");
        break;
      }

      // Mythic Keystone profile
      case "mythic-keystone": {
        result = await blizzardGet(`${charBase}/mythic-keystone-profile`, region, "profile");
        break;
      }

      // Character achievements summary
      case "achievements": {
        result = await blizzardGet(`${charBase}/achievements`, region, "profile");
        break;
      }

      // Full character data — fetches profile, equipment, stats, media, hunter-pets, and specializations in parallel
      case "full": {
        const [profile, equipment, stats, media, hunterPets, specializations] = await Promise.allSettled([
          blizzardGet(charBase, region, "profile"),
          blizzardGet(`${charBase}/equipment`, region, "profile"),
          blizzardGet(`${charBase}/statistics`, region, "profile"),
          blizzardGet(`${charBase}/character-media`, region, "profile"),
          blizzardGet(`${charBase}/hunter-pets`, region, "profile"),
          blizzardGet(`${charBase}/specializations`, region, "profile"),
        ]);

        result = {
          profile: profile.status === "fulfilled" ? profile.value : { error: (profile as PromiseRejectedResult).reason?.message },
          equipment: equipment.status === "fulfilled" ? equipment.value : { error: (equipment as PromiseRejectedResult).reason?.message },
          stats: stats.status === "fulfilled" ? stats.value : { error: (stats as PromiseRejectedResult).reason?.message },
          media: media.status === "fulfilled" ? media.value : { error: (media as PromiseRejectedResult).reason?.message },
          hunterPets: hunterPets.status === "fulfilled" ? hunterPets.value : { error: (hunterPets as PromiseRejectedResult).reason?.message },
          specializations: specializations.status === "fulfilled" ? specializations.value : { error: (specializations as PromiseRejectedResult).reason?.message },
        };
        break;
      }

      // Realm search (find realm slug from name)
      case "realm-search": {
        const { name } = params;
        if (!name) throw new Error("name is required for realm search");
        const token = await getAccessToken(region);
        const host = `${region}.api.blizzard.com`;
        const url = `https://${host}/data/wow/search/realm?namespace=dynamic-${region}&name.en_US=${encodeURIComponent(name)}&orderby=id`;
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`Realm search failed: ${resp.status} ${text}`);
        }
        result = await resp.json();
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}. Supported: profile, equipment, stats, specializations, media, hunter-pets, mythic-keystone, achievements, full, realm-search`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
