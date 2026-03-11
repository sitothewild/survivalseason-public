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
  const ptrStart = aplSource.indexOf("//survival_ptr_apl_start");
  const ptrEnd   = aplSource.indexOf("//survival_ptr_apl_end");
  const stdStart = aplSource.indexOf("//survival_apl_start");
  const stdEnd   = aplSource.indexOf("//survival_apl_end");

  let start = -1, end = -1;
  if (ptrStart >= 0 && ptrEnd > ptrStart) {
    start = ptrStart; end = ptrEnd;
  } else if (stdStart >= 0 && stdEnd > stdStart) {
    start = stdStart; end = stdEnd;
  }

  if (start < 0 || end < 0) return { error: "Could not find survival APL section" };
  
  const section = aplSource.slice(start, end);
  
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

// ─── Consumable Parser ─────────────────────────────────────

function parseConsumables(aplSource: string) {
  const consumables: Record<string, string> = {};
  
  // Parse survival-specific consumables for level > 80
  const potionMatch = aplSource.match(/potion.*?HUNTER_SURVIVAL\s*\)\s*\?\s*"([^"]+)"/);
  if (potionMatch) consumables.potion = potionMatch[1];
  
  const flaskMatch = aplSource.match(/flask.*?HUNTER_SURVIVAL\s*\)\s*\?\s*"([^"]+)"/);
  if (flaskMatch) consumables.flask = flaskMatch[1];
  
  const foodMatch = aplSource.match(/food.*?true_level\s*>\s*80\s*\)\s*\?\s*"([^"]+)"/);
  if (foodMatch) consumables.food = foodMatch[1];
  
  const runeMatch = aplSource.match(/rune.*?true_level\s*>\s*80\s*\)\s*\?\s*"([^"]+)"/);
  if (runeMatch) consumables.rune = runeMatch[1];

  const tempEnchMatch = aplSource.match(/HUNTER_SURVIVAL\s*\)\s*\?\s*"([^"]+)"\s*:\s*"main_hand/);
  if (tempEnchMatch) consumables.temporary_enchant = tempEnchMatch[1];
  
  return consumables;
}

// ─── Comprehensive Spell Data Parser ───────────────────────

interface SpellEntry {
  name: string;
  simcKey: string;
  spellIds: number[];
  type: "active" | "passive" | "buff" | "debuff" | "dot" | "proc" | "mastery";
  section: "class" | "survival" | "sentinel" | "pack_leader" | "dark_ranger" | "tier_set";
  implemented: boolean;
  utility: boolean;
  cooldown?: string;
  charges?: number;
  focusCost?: number;
  focusGain?: number;
  description?: string;
  modifiers: SpellModifier[];
  affectedBy: string[];
  affectsSpells: string[];
  buffData?: BuffInfo;
  procData?: ProcInfo;
  notes: string[];
}

interface SpellModifier {
  type: "damage_pct" | "damage_flat" | "cooldown_reduction" | "duration_mod" | "crit_chance" | 
        "crit_damage" | "haste" | "mastery_scaling" | "aoe_targets" | "execute_threshold" |
        "proc_chance" | "dot_mod" | "auto_attack_speed" | "focus_regen" | "pet_damage";
  value: number | string;
  effectNum?: number;
  source: string;
  condition?: string;
}

interface BuffInfo {
  duration?: string;
  maxStacks?: number;
  defaultValue?: string;
  refreshBehavior?: string;
  invalidates?: string[];
}

interface ProcInfo {
  chance: number | string;
  rppm?: boolean;
  triggerSpell?: string;
}

function parseSurvivalSpellData(src: string) {
  const db: Record<string, SpellEntry> = {};

  // ─── 1. Extract all talent spell_data_ptr_t declarations ──────
  parseTalentDeclarations(src, db);

  // ─── 2. Extract find_talent_spell / find_spell ID mappings ────
  parseSpellIdMappings(src, db);

  // ─── 3. Extract damage multiplier chains ──────────────────────
  parseDamageMultipliers(src, db);

  // ─── 4. Extract buff definitions from create_buffs() ──────────
  parseBuffDefinitions(src, db);

  // ─── 5. Extract cooldown data ─────────────────────────────────
  parseCooldownData(src, db);

  // ─── 6. Extract affected_by relationships ─────────────────────
  parseAffectedByRelationships(src, db);

  // ─── 7. Extract proc/trigger data ─────────────────────────────
  parseProcData(src, db);

  // ─── 8. Extract Survival spell implementations ────────────────
  const spellImplementations = parseSurvivalSpellImplementations(src);

  // ─── 9. Extract tier set bonuses ──────────────────────────────
  const tierSets = parseTierSets(src);

  // ─── 10. Extract key hardcoded values & special mechanics ─────
  const mechanics = parseSpecialMechanics(src);

  return {
    spellDatabase: db,
    spellImplementations,
    tierSets,
    mechanics,
    totalSpellEntries: Object.keys(db).length,
  };
}

// ─── 1. Talent Declarations ─────────────────────────────────

function parseTalentDeclarations(src: string, db: Record<string, SpellEntry>) {
  // Find the talents_t struct
  const talentsStart = src.indexOf("struct talents_t");
  const talentsEnd = src.indexOf("} talents;");
  if (talentsStart < 0 || talentsEnd < 0) return;
  
  const talentBlock = src.slice(talentsStart, talentsEnd);
  
  // Match spell_data_ptr_t declarations with optional comments
  const declPattern = /spell_data_ptr_t\s+(\w+)\s*;(?:\s*\/\/(.*))?/g;
  let m;
  
  let currentSection: SpellEntry["section"] = "class";
  const sectionMarkers: [string, SpellEntry["section"]][] = [
    ["// Hunter Tree", "class"],
    ["// Beast Mastery Tree", "class"],
    ["// Marksmanship Tree", "class"],
    ["// Survival Tree", "survival"],
    ["// Dark Ranger", "dark_ranger"],
    ["// Pack Leader", "pack_leader"],
    ["// Sentinel", "sentinel"],
  ];
  
  while ((m = declPattern.exec(talentBlock)) !== null) {
    const key = m[1];
    const comment = (m[2] || "").trim();
    
    // Determine section from position
    for (const [marker, sec] of sectionMarkers) {
      const markerIdx = talentBlock.indexOf(marker);
      if (markerIdx >= 0 && markerIdx < m.index) {
        currentSection = sec;
      }
    }
    
    const isUtility = comment.toLowerCase().includes("utility") || comment.toLowerCase().includes("won't implement");
    const isNotImpl = comment.toLowerCase().includes("not implemented");
    
    db[key] = {
      name: formatTalentName(key),
      simcKey: key,
      spellIds: [],
      type: guessSpellType(key),
      section: currentSection,
      implemented: !isUtility && !isNotImpl,
      utility: isUtility,
      modifiers: [],
      affectedBy: [],
      affectsSpells: [],
      notes: comment ? [comment] : [],
    };
  }
}

function formatTalentName(key: string): string {
  return key
    .replace(/_(?:buff|dmg|dot|spell|data|bleed|energize|debuff|damage|pet|player|trigger|summon|ready)$/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bBm\b/i, "BM")
    .replace(/\bSv\b/i, "SV")
    .replace(/\bMm\b/i, "MM");
}

function guessSpellType(key: string): SpellEntry["type"] {
  if (key.includes("_buff")) return "buff";
  if (key.includes("_debuff")) return "debuff";
  if (key.includes("_dot") || key.includes("_bleed")) return "dot";
  if (key.includes("_dmg") || key.includes("_damage")) return "active";
  return "passive";
}

// ─── 2. Spell ID Mappings ───────────────────────────────────

function parseSpellIdMappings(src: string, db: Record<string, SpellEntry>) {
  // Parse: talents.xxx = find_talent_spell( ... "Name" ... );
  const talentSpellPattern = /talents\.(\w+)\s*=\s*find_talent_spell\s*\(\s*talent_tree::\w+\s*,\s*"([^"]+)"/g;
  let m;
  while ((m = talentSpellPattern.exec(src)) !== null) {
    const key = m[1];
    const name = m[2];
    if (db[key]) {
      db[key].name = name;
    }
  }
  
  // Parse: talents.xxx = find_spell( ID );
  // Also: talents.xxx = talents.yyy.ok() ? find_spell( ID ) : ...
  const findSpellPattern = /talents\.(\w+)\s*=\s*(?:\w+\.ok\(\)\s*\?\s*)?find_spell\s*\(\s*(\d+)\s*\)/g;
  while ((m = findSpellPattern.exec(src)) !== null) {
    const key = m[1];
    const spellId = parseInt(m[2]);
    if (db[key]) {
      db[key].spellIds.push(spellId);
    }
  }

  // Parse direct find_talent_spell calls that reference specific spell IDs
  const findTalentPattern = /talents\.(\w+)\s*=\s*find_talent_spell\s*\([^)]+\)/g;
  while ((m = findTalentPattern.exec(src)) !== null) {
    // Already handled above
  }
}

// ─── 3. Damage Multiplier Extraction ────────────────────────

function parseDamageMultipliers(src: string, db: Record<string, SpellEntry>) {
  // Pattern: am *= 1 + p()->talents.xxx->effectN( N ).percent();
  const pctPattern = /(?:am|m|da|ta|bonus)\s*\*=\s*1\s*\+\s*p\(\)->(talents|mastery|buffs)\.(\w+)->(?:effectN\s*\(\s*(\d+)\s*\)\.(?:percent|mastery_value)|check_(?:stack_)?value)\(\)/g;
  let m;
  while ((m = pctPattern.exec(src)) !== null) {
    const category = m[1];
    const key = m[2];
    const effectNum = m[3] ? parseInt(m[3]) : undefined;
    
    // Find what function this is in (the spell being modified)
    const contextStart = src.lastIndexOf("struct ", m.index);
    const contextMatch = src.slice(contextStart, contextStart + 200).match(/struct\s+(\w+)/);
    const context = contextMatch ? contextMatch[1] : "unknown";
    
    if (db[key]) {
      db[key].modifiers.push({
        type: category === "mastery" ? "mastery_scaling" : "damage_pct",
        value: `effectN(${effectNum || "?"}).percent()`,
        effectNum,
        source: `${category}.${key}`,
        condition: context,
      });
    }
  }

  // Pattern: am *= 1.xxxx (hardcoded values)
  const hardcodedPattern = /(?:am|m|da|ta)\s*\*=\s*(1\.\d+)/g;
  while ((m = hardcodedPattern.exec(src)) !== null) {
    const value = parseFloat(m[1]);
    if (value > 1.001 && value < 2.0) {
      // Find surrounding context
      const lineStart = src.lastIndexOf("\n", m.index);
      const lineEnd = src.indexOf("\n", m.index + m[0].length);
      const line = src.slice(lineStart, lineEnd).trim();
      
      // Find containing function/struct
      const contextStart = src.lastIndexOf("struct ", m.index);
      const contextMatch = src.slice(contextStart, contextStart + 200).match(/struct\s+(\w+)/);
      const context = contextMatch ? contextMatch[1] : "";
      
      // Only record survival-related ones
      if (/survival|raptor|wildfire|kill_command|boomstick|takedown|tip_of_the_spear|mongoose|sentinel|pack_leader|wyvern|lunar|chakram|flamefang/i.test(context + line)) {
        // Store in a generic "hardcoded" entry
        const contextKey = context.replace(/_t$/, "");
        if (db[contextKey]) {
          db[contextKey].modifiers.push({
            type: "damage_pct",
            value,
            source: "hardcoded",
            condition: line.slice(0, 120),
          });
        }
      }
    }
  }

  // Extract composite_da_multiplier and composite_ta_multiplier chains for key survival spells
  extractMultiplierChain(src, db, "composite_da_multiplier", "direct");
  extractMultiplierChain(src, db, "composite_ta_multiplier", "periodic");
  extractMultiplierChain(src, db, "composite_crit_damage_bonus_multiplier", "crit_bonus");
  extractMultiplierChain(src, db, "composite_target_da_multiplier", "target_direct");
}

function extractMultiplierChain(src: string, db: Record<string, SpellEntry>, funcName: string, label: string) {
  // Find all overrides of this function
  const funcPattern = new RegExp(`${funcName}\\s*\\([^)]*\\)\\s*(?:const\\s*)?override\\s*\\{`, "g");
  let m;
  while ((m = funcPattern.exec(src)) !== null) {
    // Determine which struct this belongs to
    let searchBack = m.index;
    let structName = "";
    for (let i = 0; i < 20; i++) {
      searchBack = src.lastIndexOf("struct ", searchBack - 1);
      if (searchBack < 0) break;
      const sm = src.slice(searchBack, searchBack + 200).match(/struct\s+(\w+)/);
      if (sm) { structName = sm[1]; break; }
    }
    
    // Extract body until closing brace at same depth
    const bodyStart = m.index + m[0].length;
    let depth = 1;
    let bodyEnd = bodyStart;
    for (let i = bodyStart; i < src.length && i < bodyStart + 2000; i++) {
      if (src[i] === "{") depth++;
      if (src[i] === "}") { depth--; if (depth === 0) { bodyEnd = i; break; } }
    }
    
    const body = src.slice(bodyStart, bodyEnd);
    
    // Find all multiplier applications in this body
    const multPattern = /p\(\)->(talents|buffs|mastery)\.(\w+)/g;
    let mm;
    const references: string[] = [];
    while ((mm = multPattern.exec(body)) !== null) {
      references.push(`${mm[1]}.${mm[2]}`);
    }
    
    if (references.length > 0) {
      const cleanName = structName.replace(/_t$/, "");
      if (!db[`__${label}_${cleanName}`]) {
        // Store as metadata note
        for (const ref of references) {
          const parts = ref.split(".");
          const talentKey = parts[1];
          if (db[talentKey]) {
            db[talentKey].affectsSpells.push(`${cleanName} (${label})`);
          }
        }
      }
    }
  }
}

// ─── 4. Buff Definitions ────────────────────────────────────

function parseBuffDefinitions(src: string, db: Record<string, SpellEntry>) {
  const createBuffsIdx = src.indexOf("void hunter_t::create_buffs()");
  if (createBuffsIdx < 0) return;
  
  // Find end of create_buffs
  let depth = 0;
  let endIdx = createBuffsIdx;
  const startBrace = src.indexOf("{", createBuffsIdx);
  for (let i = startBrace; i < src.length && i < startBrace + 10000; i++) {
    if (src[i] === "{") depth++;
    if (src[i] === "}") { depth--; if (depth === 0) { endIdx = i; break; } }
  }
  
  const buffsSection = src.slice(createBuffsIdx, endIdx);
  
  // Parse make_buff patterns
  const buffPattern = /buffs\.(\w+)\s*=\s*\n?\s*make_buff\s*\(\s*this\s*,\s*"([^"]+)"/g;
  let m;
  while ((m = buffPattern.exec(buffsSection)) !== null) {
    const key = m[1];
    const buffName = m[2];
    
    // Extract the full chain until the semicolon
    const chainStart = m.index;
    const chainEnd = buffsSection.indexOf(";", chainStart);
    const chain = buffsSection.slice(chainStart, chainEnd);
    
    const buffInfo: BuffInfo = {};
    
    // default_value_from_effect
    const dvMatch = chain.match(/set_default_value_from_effect\s*\(\s*(\d+)\s*\)/);
    if (dvMatch) buffInfo.defaultValue = `effectN(${dvMatch[1]})`;
    
    // set_default_value
    const dvRaw = chain.match(/set_default_value\s*\(\s*([^)]+)\s*\)/);
    if (dvRaw) buffInfo.defaultValue = dvRaw[1].trim();
    
    // max_stacks or stack behavior
    if (chain.includes("ASYNCHRONOUS")) buffInfo.refreshBehavior = "asynchronous";
    if (chain.includes("DISABLED")) buffInfo.refreshBehavior = "disabled";
    if (chain.includes("DURATION")) buffInfo.refreshBehavior = "duration";
    if (chain.includes("EXTEND")) buffInfo.refreshBehavior = "extend";
    
    // invalidate cache
    const invalidates: string[] = [];
    const invPattern = /add_invalidate\s*\(\s*(\w+)\s*\)/g;
    let im;
    while ((im = invPattern.exec(chain)) !== null) {
      invalidates.push(im[1]);
    }
    if (invalidates.length) buffInfo.invalidates = invalidates;
    
    const dbKey = key;
    if (db[dbKey]) {
      db[dbKey].buffData = buffInfo;
      db[dbKey].type = "buff";
    } else {
      db[dbKey] = {
        name: buffName,
        simcKey: dbKey,
        spellIds: [],
        type: "buff",
        section: guessSectionFromKey(dbKey),
        implemented: true,
        utility: false,
        modifiers: [],
        affectedBy: [],
        affectsSpells: [],
        buffData: buffInfo,
        notes: [],
      };
    }
  }
}

function guessSectionFromKey(key: string): SpellEntry["section"] {
  if (/howl|pack|wyvern|boar|bear|hogstrider|stampede|ursine|sharpened_claws|fury_of_the_wyvern|lethal_barbs|no_mercy|hoof_and_blade|wyverns_gaze|sharpened_fangs/.test(key)) return "pack_leader";
  if (/sentinel|stargazer|moonlight|lunar|twilight|stalk_and_strike|open_fire|cant_miss|invigorating|arcane_talons|radiant_edge|moons_blessing|sanctified/.test(key)) return "sentinel";
  if (/black_arrow|bleak|corpsecaller|dark_|ebon|shadow_|wailing|blighted|banshees|the_bell|umbral|pact_of|withering_fire/.test(key)) return "dark_ranger";
  if (/raptor|wildfire|kill_command_sv|boomstick|takedown|flamefang|mongoose|tip_of_the_spear|bloodseeker|wallop|sweeping|bonding|vulnerability|blackrock|outland|explosives_expert|twin_fangs|savagery_sv|wildfire_infusion|grenade|flanked|lethal_calibration|primal_surge|raptor_swipe|shellshock|sic_em|quick_reload|flankers|two_against|shrapnel|flamebreak|strike_as_one|shower_of_blood|lunge|guerrilla/.test(key)) return "survival";
  return "class";
}

// ─── 5. Cooldown Data ───────────────────────────────────────

function parseCooldownData(src: string, db: Record<string, SpellEntry>) {
  // Extract cooldown references from the cooldowns struct
  const cdPattern = /cooldowns\.(\w+)\s*=\s*get_cooldown\s*\(\s*"([^"]+)"\s*\)/g;
  let m;
  const cooldownKeys = new Set<string>();
  while ((m = cdPattern.exec(src)) !== null) {
    cooldownKeys.add(m[1]);
  }
  
  // Parse cooldown adjustments: cooldowns.xxx->adjust( -talents.yyy->effectN(N).time_value() )
  const adjustPattern = /cooldowns\.(\w+)->adjust\s*\(\s*-p\(\)->talents\.(\w+)->effectN\s*\(\s*(\d+)\s*\)\.time_value/g;
  while ((m = adjustPattern.exec(src)) !== null) {
    const cdTarget = m[1];
    const talentSource = m[2];
    const effectNum = parseInt(m[3]);
    
    if (db[talentSource]) {
      db[talentSource].modifiers.push({
        type: "cooldown_reduction",
        value: `effectN(${effectNum}).time_value()`,
        effectNum,
        source: `cooldown:${cdTarget}`,
      });
    }
  }
}

// ─── 6. Affected-By Relationships ───────────────────────────

function parseAffectedByRelationships(src: string, db: Record<string, SpellEntry>) {
  // The hunter_action_t constructor sets up affected_by relationships
  const abStart = src.indexOf("affected_by.unnatural_causes = parse_damage_affecting_aura");
  if (abStart < 0) return;
  
  const abEnd = src.indexOf("}", abStart);
  const abBlock = src.slice(abStart, abEnd);
  
  // parse_damage_affecting_aura patterns  
  const pdaPattern = /affected_by\.(\w+)\s*=\s*parse_damage_affecting_aura\s*\(\s*this\s*,\s*p->(talents|mastery)\.(\w+)\s*\)/g;
  let m;
  while ((m = pdaPattern.exec(abBlock)) !== null) {
    const affectedName = m[1];
    const talentKey = m[3];
    if (db[talentKey]) {
      db[talentKey].notes.push(`Affects via parse_damage_affecting_aura: ${affectedName}`);
      db[talentKey].type = db[talentKey].type === "passive" ? "buff" : db[talentKey].type;
    }
  }
  
  // check_affected_by patterns
  const cabPattern = /affected_by\.(\w+)\s*=\s*check_affected_by\s*\(\s*this\s*,\s*p->(talents|mastery)\.(\w+)/g;
  while ((m = cabPattern.exec(abBlock)) !== null) {
    const affectedName = m[1];
    const talentKey = m[3];
    if (db[talentKey]) {
      db[talentKey].notes.push(`Affects via check_affected_by: ${affectedName}`);
    }
  }
}

// ─── 7. Proc Data ───────────────────────────────────────────

function parseProcData(src: string, db: Record<string, SpellEntry>) {
  // rng().roll patterns
  const rollPattern = /rng\(\)\.roll\s*\(\s*(?:p\(\)->)?(?:talents|deathblow)\.(\w+)(?:->effectN\s*\(\s*(\d+)\s*\)\.percent\(\))?/g;
  let m;
  while ((m = rollPattern.exec(src)) !== null) {
    const key = m[1];
    if (db[key]) {
      db[key].procData = {
        chance: m[2] ? `effectN(${m[2]}).percent()` : "variable",
      };
    }
  }
  
  // rppm patterns
  const rppmPattern = /rppm\.(\w+)->trigger\(\)/g;
  while ((m = rppmPattern.exec(src)) !== null) {
    const key = m[1];
    if (db[key]) {
      db[key].procData = { chance: "RPPM", rppm: true };
    }
  }
}

// ─── 8. Survival Spell Implementations ──────────────────────

function parseSurvivalSpellImplementations(src: string) {
  const spells: Record<string, any> = {};
  
  const survivalSpellNames = [
    "raptor_strike", "raptor_strike_base", "melee_focus_spender",
    "wildfire_bomb", "wildfire_bomb_base",
    "kill_command", "takedown", "flamefang_pitch",
    "boomstick", "harpoon", "hatchet_toss", "melee",
    "moonlight_chakram", "lunar_storm", "sanctified_armaments",
    "boar_charge", "stampede",
  ];
  
  for (const name of survivalSpellNames) {
    const section = extractSpellSection(src, name);
    if (section) {
      const info: any = {
        found: true,
        length: section.length,
      };
      
      // Extract key values from implementation
      
      // AOE targets
      const aoeMatch = section.match(/aoe\s*=\s*(-?\d+)/);
      if (aoeMatch) info.aoeTargets = parseInt(aoeMatch[1]);
      
      const reducedAoe = section.match(/reduced_aoe_targets\s*=\s*(?:p->talents\.\w+->effectN\s*\(\s*\d+\s*\)\.base_value\(\)|(\d+))/);
      if (reducedAoe) info.reducedAoeTargets = reducedAoe[1] ? parseInt(reducedAoe[1]) : "from_spell_data";
      
      // Focus interactions
      const focusGain = section.match(/energize_amount\s*=\s*(?:p->talents\.(\w+)->effectN\s*\(\s*\d+\s*\)\.base_value\(\)|(\d+))/);
      if (focusGain) info.focusGain = focusGain[2] ? parseInt(focusGain[2]) : focusGain[1];
      
      // Tip of the Spear interactions
      if (section.includes("tip_of_the_spear")) {
        info.tipOfTheSpearInteraction = true;
        const tipTrigger = section.match(/tip_of_the_spear->trigger\s*\(\s*(\d+)?\s*\)/);
        if (tipTrigger) info.tipStacks = tipTrigger[1] ? parseInt(tipTrigger[1]) : 1;
        if (section.includes("decrement")) info.tipConsumes = true;
        if (section.includes("decrements_tip_of_the_spear = false")) info.tipConsumes = false;
      }
      
      // Sentinel's Mark interactions
      if (section.includes("sentinels_mark")) {
        info.sentinelsMarkInteraction = true;
        if (section.includes("sentinels_mark->expire")) info.consumesSentinelsMark = true;
        if (section.includes("trigger_lunar_storm")) info.triggersLunarStorm = true;
      }
      
      // Moonlight Chakram interactions
      if (section.includes("moonlight_chakram")) {
        info.moonlightChakramInteraction = true;
        const bounceLimit = section.match(/bounce_limit\s*=.*?effectN\s*\(\s*(\d+)\s*\)\.base_value/);
        if (bounceLimit) info.bounceEffectNum = parseInt(bounceLimit[1]);
      }
      
      // Howl of the Pack Leader
      if (section.includes("howl_of_the_pack_leader")) {
        info.howlInteraction = true;
        if (section.includes("consume_howl")) info.consumesHowl = true;
        if (section.includes("trigger_howl")) info.triggersHowl = true;
      }
      
      // Mongoose Fury
      if (section.includes("mongoose_fury->trigger")) {
        info.triggersMongooseFury = true;
      }
      
      // Wildfire bomb cooldown reduction
      if (section.includes("wildfire_bomb->adjust") || section.includes("wildfire_infusion")) {
        info.reducesWildfireBombCd = true;
      }
      
      // Strike as One
      if (section.includes("strike_as_one")) {
        info.triggersStrikeAsOne = true;
      }
      
      spells[name] = info;
    }
  }
  
  return spells;
}

// ─── 9. Tier Set Bonuses ────────────────────────────────────

function parseTierSets(src: string) {
  const tierSets: Record<string, any> = {};
  
  // Match: tier_set.mid_s1_sv_2pc = sets->set( HUNTER_SURVIVAL, MID1, B2 );
  const tierPattern = /tier_set\.(\w+)\s*=\s*sets->set\s*\(\s*HUNTER_(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)/g;
  let m;
  while ((m = tierPattern.exec(src)) !== null) {
    tierSets[m[1]] = {
      spec: m[2],
      tier: m[3],
      piece: m[4],
    };
  }
  
  // Find associated spell IDs
  const tierSpellPattern = /tier_set\.(\w+)\.ok\(\)\s*\?\s*find_spell\s*\(\s*(\d+)\s*\)/g;
  while ((m = tierSpellPattern.exec(src)) !== null) {
    if (tierSets[m[1]]) {
      tierSets[m[1]].associatedSpellId = parseInt(m[2]);
    }
  }
  
  return tierSets;
}

// ─── 10. Special Mechanics ──────────────────────────────────

function parseSpecialMechanics(src: string) {
  const mechanics: Record<string, any> = {};
  
  // Mastery: Spirit Bond scaling
  const spiritBondSection = src.match(/spirit_bond.*?mastery_value\(\)/g);
  mechanics.spiritBondMasteryRefs = spiritBondSection ? spiritBondSection.length : 0;
  
  // Unnatural Causes hardcoded execute multiplier
  if (src.includes("1.0476")) {
    mechanics.unnaturalCausesExecuteMultiplier = 1.0476;
    // Find the threshold
    const threshMatch = src.match(/unnatural_causes->effectN\s*\(\s*3\s*\)\.base_value\(\)/);
    mechanics.unnaturalCausesExecuteThreshold = threshMatch ? "effectN(3).base_value()" : "unknown";
  }
  
  // Outland Venom bug
  if (src.includes("Outland Venom is only giving half")) {
    mechanics.outlandVenomBug = "Value halved when bugs=true";
  }
  
  // AP coefficient source
  mechanics.apPerAgility = 1; // base.attack_power_per_agility = 1
  mechanics.baseGcd = "1.5s";
  mechanics.baseDistance = { survival: 5, ranged: 40 };
  
  // Pet AP scaling
  const petApMatch = src.match(/owner_coeff\.ap_from_ap\s*=\s*([0-9.]+)/g);
  if (petApMatch) {
    mechanics.petApCoefficients = petApMatch.map(s => {
      const v = s.match(/=\s*([0-9.]+)/);
      return v ? parseFloat(v[1]) : 0;
    });
  }
  
  // Bloodseeker max stacks
  const bsMax = src.match(/bloodseeker.*?max_stack/);
  mechanics.bloodseekerUsesMaxStack = !!bsMax;
  
  // Wildfire Bomb primary target bonus
  const wfbBonus = src.match(/wildfire_bomb->effectN\s*\(\s*3\s*\)\.percent\(\)/);
  mechanics.wildfireBombPrimaryTargetBonus = wfbBonus ? "effectN(3).percent()" : "not found";
  
  // Radiant Edge stacking multiplier
  if (src.includes("pow( 1 + p()->talents.radiant_edge")) {
    mechanics.radiantEdgeStacking = "Exponential: pow(1 + effectN(1).percent(), bounces + 1)";
  }
  
  // Fury of the Wyvern extension cap
  const fotwCap = src.match(/fury_of_the_wyvern\.cap\s*=\s*timespan_t::from_seconds\s*\(\s*p->talents\.fury_of_the_wyvern->effectN\s*\(\s*(\d+)\s*\)/);
  if (fotwCap) mechanics.furyOfTheWyvernCapEffect = parseInt(fotwCap[1]);
  
  return mechanics;
}

function extractSpellSection(source: string, spellName: string): string | null {
  const pattern = new RegExp(`struct\\s+${spellName}_t[^{]*\\{`, "i");
  const match = source.match(pattern);
  if (!match || match.index === undefined) return null;
  
  let depth = 0;
  let start = match.index;
  for (let i = start; i < source.length && i < start + 8000; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return source.slice(start, Math.min(start + 3000, source.length));
}

// ─── Build the processed sim data ──────────────────────────

function buildSimcData(aplData: any, spellData: any, consumables: any, sha: string) {
  return {
    version: "simc-midnight-v2",
    branch: BRANCH,
    sha,
    fetchedAt: new Date().toISOString(),
    
    // Parsed APL rotation priorities
    apl: aplData,
    
    // Comprehensive spell database
    spells: spellData,
    
    // Consumable recommendations
    consumables,
    
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
    const consumables = parseConsumables(aplSource);
    const simcData = buildSimcData(aplData, spellData, consumables, latestSha);
    
    // Upload raw source files to storage bucket
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const uploadResults: Record<string, string> = {};
    
    try {
      // Upload current versions (overwrite)
      const [aplUpload, hunterUpload] = await Promise.all([
        supabase.storage.from("simc-source-files").upload(
          `latest/apl_hunter.cpp`,
          new Blob([aplSource], { type: "text/plain" }),
          { upsert: true, contentType: "text/plain" }
        ),
        supabase.storage.from("simc-source-files").upload(
          `latest/sc_hunter.cpp`,
          new Blob([hunterSource], { type: "text/plain" }),
          { upsert: true, contentType: "text/plain" }
        ),
      ]);
      
      if (aplUpload.error) console.error("APL upload error:", aplUpload.error.message);
      else uploadResults["apl_hunter.cpp"] = `latest/apl_hunter.cpp`;
      
      if (hunterUpload.error) console.error("Hunter upload error:", hunterUpload.error.message);
      else uploadResults["sc_hunter.cpp"] = `latest/sc_hunter.cpp`;
      
      // Also save versioned snapshots
      await Promise.all([
        supabase.storage.from("simc-source-files").upload(
          `snapshots/${latestSha.slice(0, 8)}/apl_hunter.cpp`,
          new Blob([aplSource], { type: "text/plain" }),
          { upsert: true, contentType: "text/plain" }
        ),
        supabase.storage.from("simc-source-files").upload(
          `snapshots/${latestSha.slice(0, 8)}/sc_hunter.cpp`,
          new Blob([hunterSource], { type: "text/plain" }),
          { upsert: true, contentType: "text/plain" }
        ),
      ]);
      
      console.log(`Uploaded raw SimC files to storage (SHA: ${latestSha.slice(0, 8)})`);
    } catch (uploadErr) {
      console.error("Storage upload failed (non-fatal):", (uploadErr as Error).message);
    }
    
    // Upsert into cache
    const upsertPayload = {
      data_key: "survival_hunter_data",
      data: { ...simcData, storageFiles: uploadResults },
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
    
  } catch (error: unknown) {
    console.error("SimC sync error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
