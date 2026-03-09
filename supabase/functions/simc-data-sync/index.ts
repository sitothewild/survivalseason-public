import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GITHUB_API = "https://api.github.com";
const SIMC_REPO = "simulationcraft/simc";
const BRANCH = "midnight";

const FILES_TO_FETCH = {
  apl: `engine/class_modules/apl/apl_hunter.cpp`,
  hunter: `engine/class_modules/sc_hunter.cpp`,
};

// ─── GitHub helpers ────────────────────────────────────────

async function getLatestSha(): Promise<string> {
  const res = await fetch(`${GITHUB_API}/repos/${SIMC_REPO}/commits/${BRANCH}`, {
    headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "SurvivalSim" },
  });
  if (!res.ok) throw new Error(`GitHub SHA fetch failed: ${res.status}`);
  const data = await res.json();
  return data.sha;
}

async function fetchRawFile(path: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${SIMC_REPO}/${BRANCH}/${path}`;
  const res = await fetch(url, { headers: { "User-Agent": "SurvivalSim" } });
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.text();
}

// ─── APL Parser ────────────────────────────────────────────

function parseSurvivalAPL(aplSource: string) {
  // Extract just the survival section
  const svStart = aplSource.indexOf("//survival_ptr_apl_start");
  const svEnd = aplSource.indexOf("//survival_ptr_apl_end");
  // Fall back to non-ptr if ptr not found
  const start = svStart >= 0 ? svStart : aplSource.indexOf("//survival_apl_start");
  const end = svEnd >= 0 ? svEnd : aplSource.indexOf("//survival_apl_end");
  
  if (start < 0 || end < 0) return { error: "Could not find survival APL section" };
  
  const section = aplSource.slice(start, end);
  
  // Parse action lists
  const actionLists: Record<string, string[]> = {};
  const actionPattern = /(\w+)->add_action\(\s*"([^"]+)"(?:\s*,\s*"([^"]*)")?\s*\)/g;
  let match;
  
  while ((match = actionPattern.exec(section)) !== null) {
    const listName = match[1];
    const action = match[2];
    const comment = match[3] || "";
    if (!actionLists[listName]) actionLists[listName] = [];
    actionLists[listName].push(comment ? `${action} # ${comment}` : action);
  }
  
  return { actionLists, rawLength: section.length };
}

// ─── Spell Data Parser (from sc_hunter.cpp) ────────────────

function parseSurvivalSpellData(hunterSource: string) {
  const spellData: Record<string, any> = {};
  
  // Extract survival-relevant spell references and multipliers
  // Look for patterns like: p()->talents.raptor_strike, effectN(X).percent()
  
  // Parse Tip of the Spear values
  const totsMatch = hunterSource.match(/tip_of_the_spear.*?effectN\s*\(\s*(\d+)\s*\).*?percent/g);
  if (totsMatch) spellData.tip_of_the_spear_refs = totsMatch.length;
  
  // Parse Coordinated Assault damage amp
  const caMatch = hunterSource.match(/coordinated_assault.*?effectN\s*\(\s*(\d+)\s*\)/g);
  if (caMatch) spellData.coordinated_assault_refs = caMatch.length;
  
  // Parse Spirit Bond mastery scaling
  const sbMatch = hunterSource.match(/spirit_bond.*?mastery_value/g);
  if (sbMatch) spellData.spirit_bond_mastery_refs = sbMatch.length;
  
  // Parse Mongoose Fury stacking
  const mfMatch = hunterSource.match(/mongoose_fury/g);
  spellData.mongoose_fury_refs = mfMatch ? mfMatch.length : 0;
  
  // Extract hardcoded multiplier values (e.g., *= 1.xxx patterns near survival spells)
  const multiplierPattern = /\/\/.*?(?:survival|sv|raptor|mongoose|wildfire|kill_command|coordinated).*?\n.*?\*=\s*([0-9.]+)/gi;
  const multipliers: { context: string; value: number }[] = [];
  let mMatch;
  while ((mMatch = multiplierPattern.exec(hunterSource)) !== null) {
    multipliers.push({ context: mMatch[0].trim().slice(0, 120), value: parseFloat(mMatch[1]) });
  }
  spellData.hardcoded_multipliers = multipliers;
  
  // Extract key spell implementations for Survival
  const survivalSpells: Record<string, any> = {};
  
  // Raptor Strike / Mongoose Bite
  const rsSection = extractSpellSection(hunterSource, "raptor_strike");
  if (rsSection) survivalSpells.raptor_strike = { found: true, length: rsSection.length };
  
  const mbSection = extractSpellSection(hunterSource, "mongoose_bite");
  if (mbSection) survivalSpells.mongoose_bite = { found: true, length: mbSection.length };
  
  const kcSection = extractSpellSection(hunterSource, "kill_command_sv");
  if (kcSection) survivalSpells.kill_command = { found: true, length: kcSection.length };
  
  const wfbSection = extractSpellSection(hunterSource, "wildfire_bomb");
  if (wfbSection) survivalSpells.wildfire_bomb = { found: true, length: wfbSection.length };
  
  const foteSection = extractSpellSection(hunterSource, "fury_of_the_eagle");
  if (foteSection) survivalSpells.fury_of_the_eagle = { found: true, length: foteSection.length };
  
  const caSection = extractSpellSection(hunterSource, "coordinated_assault");
  if (caSection) survivalSpells.coordinated_assault = { found: true, length: caSection.length };
  
  const fsSection = extractSpellSection(hunterSource, "flanking_strike");
  if (fsSection) survivalSpells.flanking_strike = { found: true, length: fsSection.length };
  
  spellData.survival_spells = survivalSpells;
  
  // Extract buff durations and values from create_buffs section
  const buffsSection = hunterSource.slice(
    hunterSource.indexOf("void hunter_t::create_buffs()"),
    hunterSource.indexOf("void hunter_t::init_gains()")
  );
  
  const buffData: Record<string, any> = {};
  
  // Mongoose Fury buff
  const mfBuff = buffsSection.match(/mongoose_fury.*?default_value\s*\(\s*([0-9.]+)/);
  if (mfBuff) buffData.mongoose_fury_default_value = parseFloat(mfBuff[1]);
  
  // Coordinated Assault buff  
  const caBuff = buffsSection.match(/coordinated_assault.*?default_value\s*\(\s*([0-9.]+)/);
  if (caBuff) buffData.coordinated_assault_default_value = parseFloat(caBuff[1]);
  
  spellData.buff_data = buffData;
  
  // Extract tier set bonus info
  const tierPatterns = [
    /tww_s\d+_sv_\dpc/g,
    /winning_streak/g,
    /strike_it_rich/g,
  ];
  spellData.tier_set_refs = {};
  tierPatterns.forEach(pattern => {
    const matches = hunterSource.match(pattern);
    if (matches) {
      spellData.tier_set_refs[pattern.source] = matches.length;
    }
  });
  
  return spellData;
}

function extractSpellSection(source: string, spellName: string): string | null {
  // Find struct definition for the spell
  const pattern = new RegExp(`struct\\s+${spellName}_t[^{]*\\{`, "i");
  const match = source.match(pattern);
  if (!match || match.index === undefined) return null;
  
  // Find matching closing brace (simplified — count braces)
  let depth = 0;
  let start = match.index;
  for (let i = start; i < source.length && i < start + 5000; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return source.slice(start, Math.min(start + 2000, source.length));
}

// ─── Build the processed sim data ──────────────────────────

function buildSimcData(aplData: any, spellData: any, sha: string) {
  return {
    version: "simc-thewarwithin",
    branch: BRANCH,
    sha,
    fetchedAt: new Date().toISOString(),
    
    // Parsed APL rotation priorities
    apl: aplData,
    
    // Spell implementation data
    spells: spellData,
    
    // Extracted rotation summary for quick reference
    rotationSummary: {
      packLeader: {
        st: extractActionNames(aplData.actionLists?.plst || []),
        cleave: extractActionNames(aplData.actionLists?.plcleave || []),
      },
      sentinel: {
        st: extractActionNames(aplData.actionLists?.sentst || []),
        cleave: extractActionNames(aplData.actionLists?.sentcleave || []),
      },
      cooldowns: extractActionNames(aplData.actionLists?.cds || []),
    },
  };
}

function extractActionNames(actions: string[]): string[] {
  return actions.map(a => {
    const base = a.split(",")[0].split("#")[0].trim();
    return base;
  }).filter(Boolean);
}

// ─── Main handler ──────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const forceRefresh = body.force === true;
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);
    
    // Check current cached SHA
    const { data: cached } = await supabase
      .from("simc_data_cache")
      .select("*")
      .eq("data_key", "survival_hunter_data")
      .single();
    
    // Get latest SHA from GitHub
    const latestSha = await getLatestSha();
    
    // If cached and SHA matches, return cached data (unless force refresh)
    if (cached && cached.github_sha === latestSha && !forceRefresh) {
      return new Response(JSON.stringify({
        status: "cached",
        sha: latestSha,
        data: cached.data,
        updatedAt: cached.updated_at,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Fetch fresh data from GitHub
    console.log(`Fetching SimC data (SHA: ${latestSha.slice(0, 8)})...`);
    
    const [aplSource, hunterSource] = await Promise.all([
      fetchRawFile(FILES_TO_FETCH.apl),
      fetchRawFile(FILES_TO_FETCH.hunter),
    ]);
    
    // Parse
    const aplData = parseSurvivalAPL(aplSource);
    const spellData = parseSurvivalSpellData(hunterSource);
    const simcData = buildSimcData(aplData, spellData, latestSha);
    
    // Upsert into cache
    const upsertPayload = {
      data_key: "survival_hunter_data",
      data: simcData,
      github_sha: latestSha,
      updated_at: new Date().toISOString(),
    };
    
    if (cached) {
      await supabase
        .from("simc_data_cache")
        .update(upsertPayload)
        .eq("data_key", "survival_hunter_data");
    } else {
      await supabase
        .from("simc_data_cache")
        .insert(upsertPayload);
    }
    
    return new Response(JSON.stringify({
      status: "updated",
      sha: latestSha,
      previousSha: cached?.github_sha || null,
      data: simcData,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    
  } catch (error) {
    console.error("SimC sync error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
