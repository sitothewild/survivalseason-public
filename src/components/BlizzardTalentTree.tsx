// @ts-nocheck
/**
 * BlizzardTalentTree — Survival Hunter talent tree
 *
 * Node positions come from the NAMED LAYOUT DATA below (SURVIVAL_NODES /
 * SENTINEL_NODES / PACK_LEADER_NODES).  These match the HTML reference files
 * exactly: col 1–7, row 1–N, rendered at x = PAD + (col-1)*CW.
 *
 * Live Blizzard API data enriches icons, descriptions, and prerequisite
 * connections.  If the API is unavailable the fallback spell IDs render
 * with whatever icons the mediaMap has.
 */
import React, {
  useState, useEffect, useMemo, useCallback, useRef,
} from "react";
import { getSurvivalTalentTree } from "@/lib/blizzardApi";
import type { TalentTreeFullResponse, BzTalentNode } from "@/lib/blizzardApi";

// ─────────────────────────────────────────────────────────────────────────────
// Visual constants (match HTML reference: R=17/26, CW=48, RH=52, PAD=30)
// ─────────────────────────────────────────────────────────────────────────────
const NODE_R      = 17;
const APEX_R      = 26;
const NODE_SIZE   = NODE_R * 2;
const COL_STEP    = 48;
const ROW_STEP    = 52;
const TREE_PAD    = 30;

const GOLD        = "#C8A84B";
const GOLD_DIM    = "#7a5a20";
const GOLD_GLOW   = "rgba(200,168,75,.45)";
const NODE_FILL   = "#110a03";
const LINE_DIM    = "#3a2a08";

const FALLBACK_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23110a03'/%3E%3Ctext x='32' y='40' text-anchor='middle' fill='%237a5a20' font-size='26' font-family='serif'%3E%3F%3C/text%3E%3C/svg%3E";

// ─────────────────────────────────────────────────────────────────────────────
// Named layout data  — positions match HTML reference files exactly
// col 1–7 map to x = PAD + (col-1)*CW   row 1–N map to y = PAD + (row-1)*RH
// ─────────────────────────────────────────────────────────────────────────────

interface ChoiceEntry { spellId: number; name: string; key?: string }
interface LayoutNode {
  id: string;
  spellId: number;        // 0 = unknown / will be resolved from live API
  name: string;           // canonical spell name used to match live API node
  type: "active" | "passive" | "choice" | "apex";
  maxPts: number;
  row: number;
  col: number;
  entryA?: ChoiceEntry;   // only for type==="choice"
  entryB?: ChoiceEntry;
  autoSelected?: boolean;
  capstone?: boolean;
  talentKey?: string;     // TalentConfig key override (if name→key not obvious)
}

// ── SURVIVAL SPEC TREE ───────────────────────────────────────────────────────
const SURVIVAL_NODES: LayoutNode[] = [
  // ── ROW 1 ──
  { id: "kill_command",    spellId: 259489,  name: "Kill Command",             type: "active",  maxPts: 1, row: 1, col: 4 },
  // ── ROW 2 ──
  { id: "raptor_strike",   spellId: 186270,  name: "Raptor Strike",            type: "active",  maxPts: 1, row: 2, col: 5 },
  { id: "wildfire_bomb",   spellId: 259495,  name: "Wildfire Bomb",            type: "active",  maxPts: 1, row: 2, col: 3 },
  // ── ROW 3 ──
  { id: "tip_of_spear",    spellId: 260285,  name: "Tip of the Spear",         type: "passive", maxPts: 1, row: 3, col: 5 },
  { id: "volatile_bomb",   spellId: 264332,  name: "Volatile Bomb",            type: "passive", maxPts: 1, row: 3, col: 3 },
  // ── ROW 4 ──
  { id: "harpoon_passive", spellId: 378934,  name: "Harpoon",                  type: "passive", maxPts: 1, row: 4, col: 2, talentKey: "lunge" },
  { id: "boomstick",       spellId: 1261193, name: "Boomstick",                type: "active",  maxPts: 1, row: 4, col: 4 },
  { id: "coord_assault",   spellId: 1251717, name: "Coordinated Assault",      type: "passive", maxPts: 1, row: 4, col: 6, talentKey: "strikeAsOne" },
  // ── ROW 5 ──
  { id: "bomb_choice",     spellId: 0,       name: "Shrapnel Bomb / Flamebreak",   type: "choice",  maxPts: 1, row: 5, col: 1,
    entryA: { spellId: 270335,  name: "Shrapnel Bomb" },
    entryB: { spellId: 0,       name: "Flamebreak",    key: "flamebreak" } },
  { id: "mongoose_fury",   spellId: 260248,  name: "Mongoose Fury",            type: "passive", maxPts: 1, row: 5, col: 3 },
  { id: "grenade_juggler", spellId: 1272136, name: "Grenade Juggler",          type: "passive", maxPts: 1, row: 5, col: 4 },
  { id: "pack_tactics",    spellId: 459964,  name: "Pack Tactics",             type: "passive", maxPts: 1, row: 5, col: 5 },
  { id: "sep_anxiety",     spellId: 1251718, name: "Separation Anxiety",       type: "passive", maxPts: 1, row: 5, col: 7 },
  // ── ROW 6 ──
  { id: "mongoose_fury2",  spellId: 1252708, name: "Mongoose Fury II",         type: "passive", maxPts: 1, row: 6, col: 2, talentKey: "mongooseFury" },
  { id: "ammo_choice",     spellId: 0,       name: "Mongoose Rounds / Wildfire Shells", type: "choice", maxPts: 1, row: 6, col: 3,
    entryA: { spellId: 0,       name: "Mongoose Rounds" },
    entryB: { spellId: 1261229, name: "Wildfire Shells", key: "wildfireShells" } },
  { id: "spearhead_talent",spellId: 1252931, name: "Spearhead Talent",         type: "passive", maxPts: 1, row: 6, col: 5, talentKey: "primalSurge" },
  { id: "lethal_barbs",    spellId: 1253137, name: "Lethal Barbs",             type: "passive", maxPts: 1, row: 6, col: 6, talentKey: "lethalCalibration" },
  // ── ROW 7 ──
  { id: "bloody_claws",    spellId: 0,       name: "Bloody Claws / Wallop",    type: "choice",  maxPts: 1, row: 7, col: 1,
    entryA: { spellId: 385737,  name: "Bloody Claws" },
    entryB: { spellId: 1252738, name: "Wallop",         key: "wallop" } },
  { id: "explosive_expert",spellId: 321290,  name: "Explosive Expert",         type: "passive", maxPts: 2, row: 7, col: 2 },
  { id: "beast_field",     spellId: 1262442, name: "Beast of the Field",       type: "passive", maxPts: 1, row: 7, col: 3, talentKey: "killerCompanion" },
  { id: "tip_stacks",      spellId: 378950,  name: "Tip of Spear Stacks",      type: "passive", maxPts: 2, row: 7, col: 4, talentKey: "tipOfTheSpear" },
  { id: "vuln_choice",     spellId: 0,       name: "Vulnerability / Blackrock Munitions", type: "choice", maxPts: 1, row: 7, col: 5,
    entryA: { spellId: 1257011, name: "Vulnerability" },
    entryB: { spellId: 462036,  name: "Blackrock Munitions", key: "blackrockMunitions" } },
  { id: "ruthless",        spellId: 1253053, name: "Ruthless Marauder",        type: "passive", maxPts: 2, row: 7, col: 6 },
  { id: "potent_venom",    spellId: 459939,  name: "Potent Venom",             type: "passive", maxPts: 1, row: 7, col: 7 },
  // ── ROW 8 ──
  { id: "explosive_force", spellId: 378937,  name: "Explosive Force",          type: "passive", maxPts: 2, row: 8, col: 2 },
  { id: "takedown",        spellId: 1250646, name: "Takedown",                 type: "active",  maxPts: 1, row: 8, col: 4 },
  { id: "flanking_strike", spellId: 378955,  name: "Flanking Strike",          type: "passive", maxPts: 2, row: 8, col: 6, talentKey: "flanked" },
  // ── ROW 9 ──
  { id: "flamefang",       spellId: 1251592, name: "Flamefang Pitch",          type: "active",  maxPts: 1, row: 9, col: 2 },
  { id: "spearhead",       spellId: 1272139, name: "Spearhead",                type: "passive", maxPts: 1, row: 9, col: 3 },
  { id: "pack_mentality",  spellId: 1251790, name: "Pack Mentality",           type: "passive", maxPts: 2, row: 9, col: 5 },
  { id: "wfb_infusion",    spellId: 460198,  name: "Wildfire Infusion",        type: "passive", maxPts: 1, row: 9, col: 6, talentKey: "wildfireInfusion" },
  // ── ROW 10 ──
  { id: "frenzy_strikes",  spellId: 459843,  name: "Frenzy Strikes",           type: "passive", maxPts: 1, row: 10, col: 1 },
  { id: "tip_capstone",    spellId: 1252943, name: "Tip Capstone",             type: "passive", maxPts: 1, row: 10, col: 3, talentKey: "tipOfTheSpear" },
  { id: "invigoration",    spellId: 1256938, name: "Invigoration",             type: "passive", maxPts: 1, row: 10, col: 4 },
  { id: "bomb_burst",      spellId: 1262409, name: "Bomb Burst",               type: "passive", maxPts: 1, row: 10, col: 5 },
  { id: "longevity",       spellId: 1272154, name: "Longevity",                type: "passive", maxPts: 1, row: 10, col: 7 },
  // ── APEX (row 12 — large circle below tree) ──
  { id: "raptor_swipe",    spellId: 1259003, name: "Raptor Swipe",             type: "apex",    maxPts: 4, row: 12, col: 4, talentKey: "raptorSwipe" },
];

// ── SENTINEL HERO TREE ───────────────────────────────────────────────────────
const SENTINEL_NODES: LayoutNode[] = [
  // Row 1 — auto-selected keystone
  { id: "lunar_storm",       spellId: 1253599, name: "Lunar Storm",           type: "passive", maxPts: 1, row: 1, col: 4, autoSelected: true },
  // Row 2
  { id: "sanctified_arms",   spellId: 450373,  name: "Sanctified Armaments",  type: "passive", maxPts: 1, row: 2, col: 1 },
  { id: "lunar_inspiration", spellId: 1253825, name: "Lunar Inspiration",     type: "passive", maxPts: 1, row: 2, col: 3 },
  { id: "moonlight_chakram", spellId: 1253831, name: "Moonlight Chakram",     type: "passive", maxPts: 1, row: 2, col: 5 },
  { id: "chakram_passback",  spellId: 1264902, name: "Chakram Passback",      type: "passive", maxPts: 1, row: 2, col: 7 },
  // Row 3
  { id: "stargazer_choice",  spellId: 0,       name: "Stargazer / Open Fire", type: "choice",  maxPts: 1, row: 3, col: 1,
    entryA: { spellId: 1253751, name: "Stargazer",   key: "stargazer" },
    entryB: { spellId: 1253807, name: "Open Fire",   key: "openFire" } },
  { id: "sentinel_mark",     spellId: 1253830, name: "Sentinel's Mark",       type: "passive", maxPts: 1, row: 3, col: 3 },
  { id: "stargazer_buff",    spellId: 450379,  name: "Stargazer",             type: "passive", maxPts: 1, row: 3, col: 5 },
  { id: "twilight_choice",   spellId: 0,       name: "Twilight Requiem / Stalk and Strike", type: "choice", maxPts: 1, row: 3, col: 7,
    entryA: { spellId: 1264904, name: "Twilight Requiem", key: "twilightRequiem" },
    entryB: { spellId: 1266069, name: "Stalk and Strike", key: "stalkAndStrike" } },
  // Row 4
  { id: "ice_claw",          spellId: 1253846, name: "Ice Claw",              type: "passive", maxPts: 1, row: 4, col: 1 },
  { id: "sentinel_owl",      spellId: 1253852, name: "Sentinel Owl",          type: "passive", maxPts: 1, row: 4, col: 3 },
  { id: "cond_choice",       spellId: 0,       name: "Conditioning / Scout's Vigil", type: "choice", maxPts: 1, row: 4, col: 5,
    entryA: { spellId: 1253887, name: "Conditioning",  key: "conditioning" },
    entryB: { spellId: 0,       name: "Scout's Vigil", key: "scoutsVigil" } },
  { id: "glaive_passive",    spellId: 1264903, name: "Glaive passive",        type: "passive", maxPts: 1, row: 4, col: 7 },
  // Row 5 — capstone
  { id: "moon_and_stars",    spellId: 1253732, name: "Moon and Stars",        type: "passive", maxPts: 1, row: 5, col: 4, capstone: true },
];

// ── PACK LEADER HERO TREE ─────────────────────────────────────────────────────
const PACK_LEADER_NODES: LayoutNode[] = [
  // Row 1 — auto-selected keystone
  { id: "vicious_hunt",        spellId: 471876, name: "Vicious Hunt",              type: "passive", maxPts: 1, row: 1, col: 4, autoSelected: true },
  // Row 2
  { id: "lone_wolf",           spellId: 472358, name: "Lone Wolf",                 type: "passive", maxPts: 1, row: 2, col: 1 },
  { id: "horn",                spellId: 472352, name: "Horn",                      type: "passive", maxPts: 1, row: 2, col: 3 },
  { id: "pathfinding",         spellId: 472357, name: "Pathfinding",               type: "passive", maxPts: 1, row: 2, col: 5 },
  { id: "shoes_choice",        spellId: 0,      name: "Slicked Shoes / Masterful Call", type: "choice", maxPts: 1, row: 2, col: 7,
    entryA: { spellId: 0,       name: "Slicked Shoes",  key: "slickedShoes" },
    entryB: { spellId: 1268705, name: "Masterful Call", key: "masterfulCall" } },
  // Row 3
  { id: "ursine_choice",       spellId: 0,      name: "Ursine Fury / Sharpened Claws", type: "choice", maxPts: 1, row: 3, col: 1,
    entryA: { spellId: 472476,  name: "Ursine Fury",       key: "ursineFury" },
    entryB: { spellId: 472524,  name: "Sharpened Claws",   key: "sharpenedClaws" } },
  { id: "cat_charge",          spellId: 472550, name: "Cat Charge",                type: "passive", maxPts: 1, row: 3, col: 3 },
  { id: "boar_head",           spellId: 472639, name: "Boar Head",                 type: "passive", maxPts: 1, row: 3, col: 5 },
  { id: "critical_shot",       spellId: 1264781,name: "Critical Shot",             type: "passive", maxPts: 1, row: 3, col: 7 },
  // Row 4
  { id: "go_for_throat",       spellId: 472660, name: "Go for the Throat",         type: "passive", maxPts: 1, row: 4, col: 1 },
  { id: "turtle",              spellId: 472707, name: "Turtle",                    type: "passive", maxPts: 1, row: 4, col: 3 },
  { id: "hoof_choice",         spellId: 0,      name: "Hoof and Blade / Wyvern's Gaze", type: "choice", maxPts: 1, row: 4, col: 5,
    entryA: { spellId: 1264797, name: "Hoof and Blade",   key: "hoofAndBlade" },
    entryB: { spellId: 1264792, name: "Wyvern's Gaze",    key: "wyvernGaze" } },
  { id: "monster_fang",        spellId: 1264775,name: "Monster Fang",              type: "passive", maxPts: 1, row: 4, col: 7 },
  // Row 5 — capstone
  { id: "bestial_discipline",  spellId: 472741, name: "Bestial Discipline",        type: "passive", maxPts: 1, row: 5, col: 4, capstone: true },
];

// ─────────────────────────────────────────────────────────────────────────────
// Spell name → TalentConfig key  (used to wire visual selection → DPS sim)
// ─────────────────────────────────────────────────────────────────────────────
const NAME_TO_KEY: Record<string, string> = {
  // Survival spec tree
  "Kill Command":            "killCommand",
  "Raptor Strike":           "raptorStrike",
  "Wildfire Bomb":           "wildfireBomb",
  "Tip of the Spear":        "tipOfTheSpear",
  "Tip of Spear Stacks":     "tipOfTheSpear",
  "Tip Capstone":            "tipOfTheSpear",
  "Harpoon":                 "lunge",
  "Boomstick":               "boomstick",
  "Coordinated Assault":     "strikeAsOne",
  "Strike as One":           "strikeAsOne",
  "Shrapnel Bomb":           "wildfireBomb",
  "Flamebreak":              "flamebreak",
  "Mongoose Fury":           "mongooseFury",
  "Mongoose Fury II":        "mongooseFury",
  "Wildfire Shells":         "wildfireShells",
  "Spearhead Talent":        "primalSurge",
  "Lethal Barbs":            "lethalCalibration",
  "Lethal Calibration":      "lethalCalibration",
  "Wallop":                  "wallop",
  "Beast of the Field":      "killerCompanion",
  "Killer Companion":        "killerCompanion",
  "Blackrock Munitions":     "blackrockMunitions",
  "Takedown":                "takedown",
  "Flanking Strike":         "flanked",
  "Flanked":                 "flanked",
  "Wildfire Infusion":       "wildfireInfusion",
  "Raptor Swipe":            "raptorSwipe",
  "Twin Fangs":              "twinFangs",
  "Savagery":                "savagery",
  "Primal Surge":            "primalSurge",
  "Flanker's Advantage":     "flankerAdvantage",
  "Bloodseeker":             "bloodseeker",
  "Two Against Many":        "twoAgainstMany",
  "Guerrilla Tactics":       "guerrillaTactics",
  "Bonding":                 "bonding",
  "Sweeping Spear":          "sweepingSpear",
  "Quick Reload":            "quickReload",
  "Shellshock":              "shellshock",
  // Sentinel
  "Stargazer":               "stargazer",
  "Open Fire":               "openFire",
  "Lunar Inspiration":       "lunarInspiration",
  "Extrapolation":           "extrapolation",
  "Twilight Requiem":        "twilightRequiem",
  "Stalk and Strike":        "stalkAndStrike",
  "Don't Look Back":         "dontLookBack",
  "Catch Out":               "catchOut",
  "Invigorating Pulse":      "invigoratingPulse",
  "Eyes Closed":             "eyesClosed",
  "Lunar Calling":           "lunarCalling",
  "Release and Reload":      "releaseAndReload",
  "Lunar Storm":             "lunarStorm",
  // Pack Leader
  "Vicious Hunt":            "viciousHunt",
  "Pack Coordination":       "packCoordination",
  "Howl of the Pack":        "howlOfThePack",
  "Den Recovery":            "denRecovery",
  "Ursine Fury":             "ursineFury",
  "Sharpened Claws":         "sharpenedClaws",
  "Wild Attacks":            "wildAttacks",
  "Cornered Prey":           "corneredPrey",
  "Frenzied Tear":           "frenziedTear",
  "Go for the Throat":       "goForTheThroat",
  "Furious Assault":         "furiousAssault",
  "Scattered Prey":          "scatteredPrey",
  "Wyvern's Gaze":           "wyvernGaze",
  "Claw Frenzy":             "clawFrenzy",
  "Pack Assault":            "packAssault",
};

// Keys that are always on (core spec abilities — never need to be toggled)
const CORE_SPEC_KEYS = new Set([
  "killCommand","wildfireBomb","raptorStrike","guerrillaTactics",
  "tipOfTheSpear","lunge","boomstick","strikeAsOne","flamebreak",
  "quickReload","mongooseFury","wildfireShells","shellshock","wallop",
  "bonding","sweepingSpear","blackrockMunitions","takedown",
  "killerCompanion","twinFangs","savagery","wildfireInfusion",
  "flanked","primalSurge","raptorSwipe",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — convert LayoutNode[] to BzTalentNode[]
// Enriches from live API node map (name→BzTalentNode) when possible.
// ─────────────────────────────────────────────────────────────────────────────

type LiveNodeMap = Map<string, BzTalentNode>; // spell name → live node

function buildLiveMap(nodes: BzTalentNode[]): LiveNodeMap {
  const m = new Map<string, BzTalentNode>();
  for (const n of nodes) {
    for (const e of (n.entries ?? [])) {
      const name = e.spell_tooltip?.spell?.name;
      if (name) m.set(name, n);
    }
  }
  return m;
}

let _nodeIdSeq = 1;
function nextId() { return _nodeIdSeq++; }

function layoutToBzNode(
  ln: LayoutNode,
  liveMap: LiveNodeMap,
  mediaMap: Record<number, string>,
): BzTalentNode {
  const numId = nextId();

  if (ln.type === "choice") {
    // Try to find the live node by matching either entry name
    const liveA = ln.entryA ? liveMap.get(ln.entryA.name) : undefined;
    const liveB = ln.entryB ? liveMap.get(ln.entryB.name) : undefined;
    const liveNode = liveA ?? liveB;

    let entries;
    if (liveNode?.entries?.length >= 2) {
      // Use live entries directly (they have correct spell IDs + descriptions)
      entries = liveNode.entries;
    } else {
      // Build from hardcoded data
      entries = [
        {
          id: 1, type: "PASSIVE", max_rank: 1,
          spell_tooltip: {
            spell: { id: ln.entryA?.spellId ?? 0, name: ln.entryA?.name ?? "Option A" },
            description: "",
          },
        },
        {
          id: 2, type: "PASSIVE", max_rank: 1,
          spell_tooltip: {
            spell: { id: ln.entryB?.spellId ?? 0, name: ln.entryB?.name ?? "Option B" },
            description: "",
          },
        },
      ];
    }

    return {
      id: liveNode?.id ?? numId,
      display_row: ln.row,
      display_col: ln.col,
      node_type: { id: 2, type: "SELECTION" },
      prerequisite_nodes: liveNode?.prerequisite_nodes ?? [],
      entries,
      _layoutId: ln.id,
      _talentKey: ln.talentKey,
      _autoSelected: ln.autoSelected,
      _capstone: ln.capstone,
      _apex: ln.type === "apex",
    } as any;
  }

  // Non-choice nodes
  const liveNode = liveMap.get(ln.name);
  const spellId  = liveNode?.entries?.[0]?.spell_tooltip?.spell?.id ?? ln.spellId ?? 0;
  const spellName = liveNode?.entries?.[0]?.spell_tooltip?.spell?.name ?? ln.name;
  const description = liveNode?.entries?.[0]?.spell_tooltip?.description ?? "";
  const maxRank = liveNode?.entries?.[0]?.max_rank ?? ln.maxPts;

  return {
    id: liveNode?.id ?? numId,
    display_row: ln.row,
    display_col: ln.col,
    node_type: { id: 1, type: "SINGLE" },
    prerequisite_nodes: liveNode?.prerequisite_nodes ?? [],
    entries: [{
      id: 1,
      type: ln.type === "active" ? "ACTIVE" : "PASSIVE",
      max_rank: maxRank,
      spell_tooltip: { spell: { id: spellId, name: spellName }, description },
    }],
    _layoutId: ln.id,
    _talentKey: ln.talentKey,
    _autoSelected: ln.autoSelected,
    _capstone: ln.capstone,
    _apex: ln.type === "apex",
  } as any;
}

function convertLayoutNodes(
  layoutNodes: LayoutNode[],
  allLiveNodes: BzTalentNode[],
  mediaMap: Record<number, string>,
): BzTalentNode[] {
  _nodeIdSeq = Date.now(); // unique IDs per call
  const liveMap = buildLiveMap(allLiveNodes);
  return layoutNodes.map((ln) => layoutToBzNode(ln, liveMap, mediaMap));
}

// ─────────────────────────────────────────────────────────────────────────────
// Grid layout helpers — direct col/row positioning (matches HTML)
// ─────────────────────────────────────────────────────────────────────────────

function gridLayout(nodes: BzTalentNode[]) {
  if (!nodes.length) return { minRow: 1, maxRow: 1, minCol: 1, maxCol: 1, w: 0, h: 0 };
  const rows = nodes.map((n) => n.display_row);
  const cols = nodes.map((n) => n.display_col);
  const minRow = Math.min(...rows), maxRow = Math.max(...rows);
  const minCol = Math.min(...cols), maxCol = Math.max(...cols);
  // Use NODE_SIZE (but apex uses APEX_R*2 — add a little extra at bottom)
  const hasApex = nodes.some((n) => (n as any)._apex);
  const w = (maxCol - minCol) * COL_STEP + NODE_SIZE + TREE_PAD * 2;
  const h = (maxRow - minRow) * ROW_STEP + NODE_SIZE + TREE_PAD * 2 + (hasApex ? ROW_STEP : 0);
  return { minRow, maxRow, minCol, maxCol, w, h };
}

function nodeCenter(node: BzTalentNode, minRow: number, minCol: number) {
  const r = (node as any)._apex ? APEX_R : NODE_R;
  return {
    x: TREE_PAD + (node.display_col - minCol) * COL_STEP + NODE_R,
    y: TREE_PAD + (node.display_row - minRow) * ROW_STEP + NODE_R,
  };
}

// Resolve TalentConfig key for a node
function resolveKey(node: BzTalentNode, entryIdx = 0): string | null {
  const ext = node as any;
  if (ext._talentKey) return ext._talentKey;
  // Check entry's choice key if present
  const entries = node.entries ?? [];
  const entry = entries[entryIdx];
  const name = entry?.spell_tooltip?.spell?.name ?? "";
  return NAME_TO_KEY[name] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip
// ─────────────────────────────────────────────────────────────────────────────
interface TooltipInfo { name: string; description: string; rank?: number; maxRank?: number }

function NodeTooltip({ info, x, y }: { info: TooltipInfo; x: number; y: number }) {
  const left = Math.min(x + 16, window.innerWidth - 300);
  const top  = Math.min(y - 8,  window.innerHeight - 180);
  return (
    <div style={{
      position: "fixed", left, top, zIndex: 10000,
      background: "linear-gradient(160deg,#1c1005 0%,#0d0a02 100%)",
      border: `1px solid ${GOLD_DIM}`, borderTop: `2px solid ${GOLD}`,
      borderRadius: 4, padding: "10px 14px", maxWidth: 280,
      pointerEvents: "none",
      boxShadow: `0 0 24px rgba(0,0,0,.85),inset 0 1px 0 ${GOLD_DIM}60`,
    }}>
      <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, fontWeight: 700,
        color: GOLD, marginBottom: 4, letterSpacing: 0.5 }}>
        {info.name}
      </div>
      {info.maxRank && info.maxRank > 1 && (
        <div style={{ fontSize: 10, color: GOLD_DIM, marginBottom: 4, fontFamily: "monospace" }}>
          Rank {info.rank ?? 0} / {info.maxRank}
        </div>
      )}
      <div style={{ fontSize: 12, color: "#b8a878", lineHeight: 1.55, fontFamily: "'Rajdhani',sans-serif" }}>
        {info.description || "No description available."}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection lines
// ─────────────────────────────────────────────────────────────────────────────
function ConnectionLines({
  nodes, nodeMap, minRow, minCol, w, h, selectedKeys, coreKeys,
}: {
  nodes: BzTalentNode[];
  nodeMap: Map<number, BzTalentNode>;
  minRow: number; minCol: number; w: number; h: number;
  selectedKeys: Set<string>; coreKeys: Set<string>;
}) {
  const lines = useMemo(() => {
    const result: React.ReactNode[] = [];
    nodes.forEach((node) => {
      if (!node.prerequisite_nodes?.length) return;
      const to = nodeCenter(node, minRow, minCol);
      const nk = resolveKey(node);
      const nodeOn = nk ? (selectedKeys.has(nk) || coreKeys.has(nk)) : (node as any)._autoSelected;
      node.prerequisite_nodes.forEach((pr) => {
        const pNode = nodeMap.get(pr.id);
        if (!pNode) return;
        const from = nodeCenter(pNode, minRow, minCol);
        const pk = resolveKey(pNode);
        const parentOn = pk ? (selectedKeys.has(pk) || coreKeys.has(pk)) : (pNode as any)._autoSelected;
        const active = parentOn && nodeOn;
        result.push(
          <line key={`${pNode.id}-${node.id}`}
            x1={from.x} y1={from.y} x2={to.x} y2={to.y}
            stroke={active ? GOLD : GOLD_DIM}
            strokeWidth={active ? 2 : 1.5} opacity={active ? 0.9 : 0.35}
          />
        );
      });
    });
    return result;
  }, [nodes, nodeMap, minRow, minCol, selectedKeys, coreKeys]);

  return (
    <svg width={w} height={h}
      style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
      {lines}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TalentNode component
// ─────────────────────────────────────────────────────────────────────────────
function TalentNode({
  node, mediaMap, selectedKeys, selectedChoices, canSelect, isCore,
  onClick, onChoiceClick, onHover,
}: {
  node: BzTalentNode;
  mediaMap: Record<number, string>;
  selectedKeys: Set<string>;
  selectedChoices: Record<number, number>;
  canSelect: boolean; isCore: boolean;
  onClick: () => void;
  onChoiceClick: (idx: number) => void;
  onHover: (info: TooltipInfo | null, x: number, y: number) => void;
}) {
  if (!node.entries?.length) return null;

  const ext = node as any;
  const isChoice = node.node_type?.type === "SELECTION" && node.entries.length >= 2;
  const isApex = !!ext._apex;
  const isCapstone = !!ext._capstone;
  const chosenIdx = selectedChoices[node.id] ?? 0;

  // Determine selection state
  const key = isChoice ? resolveKey(node, chosenIdx) : resolveKey(node);
  const isSelected = key ? (selectedKeys.has(key) || isCore || ext._autoSelected) : (isCore || ext._autoSelected);
  const isLocked = !isCore && !ext._autoSelected && !isSelected && !canSelect;

  const r = isApex ? APEX_R : NODE_R;
  const sz = r * 2;
  const borderColor = isSelected ? GOLD : isLocked ? "#1c1408" : GOLD_DIM;
  const glow = isSelected ? `0 0 0 2px ${GOLD_GLOW},0 0 14px 3px ${GOLD_GLOW}` : undefined;
  const brightness = isSelected ? 1 : isLocked ? 0.2 : 0.5;
  const cursor = (isCore || ext._autoSelected) ? "default" : isLocked ? "not-allowed" : "pointer";

  const handleEnter = (e: React.MouseEvent, entryIdx = 0) => {
    const entry = node.entries[entryIdx];
    onHover({
      name: entry?.spell_tooltip?.spell?.name ?? "?",
      description: entry?.spell_tooltip?.description ?? "",
      rank: isSelected ? (entry?.max_rank ?? 1) : 0,
      maxRank: entry?.max_rank ?? 1,
    }, e.clientX, e.clientY);
  };

  // ── CHOICE node ────────────────────────────────────────────────────────────
  if (isChoice) {
    const idA = node.entries[0]?.spell_tooltip?.spell?.id ?? 0;
    const idB = node.entries[1]?.spell_tooltip?.spell?.id ?? 0;
    const iconA = idA && mediaMap[idA] ? mediaMap[idA] : FALLBACK_ICON;
    const iconB = idB && mediaMap[idB] ? mediaMap[idB] : FALLBACK_ICON;
    const brightA = isSelected && chosenIdx === 0 ? 1 : brightness * 0.6;
    const brightB = isSelected && chosenIdx === 1 ? 1 : brightness * 0.6;

    return (
      <div style={{
        width: sz, height: sz, borderRadius: "50%",
        border: `1.5px solid ${borderColor}`, boxShadow: glow,
        overflow: "hidden", cursor, position: "relative",
        background: NODE_FILL, display: "flex",
        transition: "border-color .15s,box-shadow .15s",
      }}
        onMouseEnter={(e) => handleEnter(e, chosenIdx)}
        onMouseLeave={() => onHover(null, 0, 0)}
      >
        {/* Left half — entry A */}
        <div onClick={() => { if (!isLocked) onChoiceClick(0); }}
          style={{ width: "50%", height: "100%", overflow: "hidden", position: "relative", flexShrink: 0 }}>
          <img src={iconA} alt="" loading="lazy" draggable={false}
            onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_ICON; }}
            style={{ width: sz, height: sz, objectFit: "cover",
              position: "absolute", left: 0, top: 0,
              filter: `brightness(${brightA})`, transition: "filter .15s" }} />
        </div>
        {/* Right half — entry B */}
        <div onClick={() => { if (!isLocked) onChoiceClick(1); }}
          style={{ width: "50%", height: "100%", overflow: "hidden", position: "relative", flexShrink: 0 }}>
          <img src={iconB} alt="" loading="lazy" draggable={false}
            onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_ICON; }}
            style={{ width: sz, height: sz, objectFit: "cover",
              position: "absolute", left: -(sz / 2), top: 0,
              filter: `brightness(${brightB})`, transition: "filter .15s" }} />
        </div>
        {/* Dashed vertical divider (matches HTML choice node) */}
        <div style={{
          position: "absolute", left: "50%", top: 4, bottom: 4, width: 1,
          transform: "translateX(-50%)",
          background: `repeating-linear-gradient(to bottom,${GOLD_DIM} 0,${GOLD_DIM} 3px,transparent 3px,transparent 5px)`,
          pointerEvents: "none",
        }} />
        {/* Inner ring */}
        <div style={{ position: "absolute", inset: 4, borderRadius: "50%",
          border: `1px solid ${LINE_DIM}`, pointerEvents: "none" }} />
      </div>
    );
  }

  // ── Standard / apex / capstone node ───────────────────────────────────────
  const entry  = node.entries[0];
  const spellId = entry?.spell_tooltip?.spell?.id ?? 0;
  const iconUrl = spellId && mediaMap[spellId] ? mediaMap[spellId] : FALLBACK_ICON;
  const maxRank = entry?.max_rank ?? 1;

  const outerStroke = (isCapstone || isApex)
    ? (isSelected ? GOLD : GOLD_DIM)
    : (isSelected ? GOLD : isLocked ? "#1c1408" : GOLD_DIM);
  const outerStrokeW = (isCapstone || isApex) ? (isSelected ? "3" : "2") : "1.5";

  return (
    <div
      onClick={() => { if (!isCore && !ext._autoSelected && canSelect) onClick(); }}
      onMouseEnter={handleEnter}
      onMouseLeave={() => onHover(null, 0, 0)}
      style={{
        width: sz, height: sz, borderRadius: "50%",
        border: `${outerStrokeW}px solid ${outerStroke}`,
        boxShadow: glow ?? ((isCapstone || isApex) && isSelected
          ? `0 0 18px 4px ${GOLD_GLOW}` : undefined),
        cursor, position: "relative", overflow: "hidden",
        background: NODE_FILL, transition: "border-color .15s,box-shadow .15s",
      }}
    >
      <img src={iconUrl} alt="" loading="lazy" draggable={false}
        onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_ICON; }}
        style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%",
          filter: `brightness(${brightness})`, transition: "filter .15s" }} />
      {/* Inner decorative ring (matches HTML double-circle) */}
      <div style={{ position: "absolute", inset: isApex ? 6 : 4, borderRadius: "50%",
        border: `1px solid ${LINE_DIM}`, pointerEvents: "none" }} />
      {/* Rank badge for multi-rank nodes */}
      {maxRank > 1 && (
        <div style={{
          position: "absolute", bottom: -2, right: -2,
          background: isSelected ? "#1c1005" : "#0d0a02",
          border: `1px solid ${isSelected ? GOLD : GOLD_DIM}`,
          borderRadius: 3, padding: "0 3px",
          fontSize: 8, fontWeight: 700, lineHeight: "13px",
          color: isSelected ? GOLD : GOLD_DIM,
          fontFamily: "'Rajdhani',sans-serif", pointerEvents: "none",
        }}>
          {isSelected ? maxRank : 0}/{maxRank}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TalentSection — one tree column (class or spec)
// ─────────────────────────────────────────────────────────────────────────────
function TalentSection({
  label, pointBudget, nodes, mediaMap,
  selectedKeys, selectedChoices, coreKeys,
  onToggle, onChoiceSelect, onHover, showPointCounter = true,
}: {
  label: string; pointBudget: number;
  nodes: BzTalentNode[]; mediaMap: Record<number, string>;
  selectedKeys: Set<string>; selectedChoices: Record<number, number>;
  coreKeys: Set<string>;
  onToggle: (n: BzTalentNode) => void;
  onChoiceSelect: (n: BzTalentNode, idx: number) => void;
  onHover: (info: TooltipInfo | null, x: number, y: number) => void;
  showPointCounter?: boolean;
}) {
  const layout = useMemo(() => gridLayout(nodes), [nodes]);
  const { minRow, minCol, w, h } = layout;
  const nodeMap = useMemo(() => {
    const m = new Map<number, BzTalentNode>();
    nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [nodes]);

  const usedPts = useMemo(() => nodes.reduce((sum, n) => {
    const ext = n as any;
    if (ext._autoSelected) return sum;
    const k = resolveKey(n);
    if (!k || coreKeys.has(k)) return sum;
    return sum + (selectedKeys.has(k) ? (n.entries?.[0]?.max_rank ?? 1) : 0);
  }, 0), [nodes, selectedKeys, coreKeys]);

  if (!nodes.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      flex: "1 1 0", minWidth: w }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
        <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, fontWeight: 700,
          letterSpacing: 3, color: GOLD, textTransform: "uppercase" }}>{label}</span>
        {showPointCounter && (
          <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 15, fontWeight: 700,
            color: usedPts >= pointBudget ? GOLD : GOLD_DIM }}>{usedPts}</span>
        )}
      </div>

      {/* Tree panel — matches HTML .talent-window */}
      <div style={{
        position: "relative", width: w, height: h,
        background: "linear-gradient(180deg,rgba(22,12,4,.95) 0%,rgba(10,5,2,.98) 100%)",
        border: `1px solid ${GOLD_DIM}50`,
        borderTop: `2px solid ${GOLD}40`,
        borderRadius: 6,
        boxShadow: `0 0 40px rgba(200,168,75,.05),inset 0 1px 0 ${GOLD_DIM}20`,
      }}>
        <ConnectionLines
          nodes={nodes} nodeMap={nodeMap}
          minRow={minRow} minCol={minCol}
          w={w} h={h}
          selectedKeys={selectedKeys} coreKeys={coreKeys}
        />

        {nodes.map((node) => {
          const ext = node as any;
          const isCore = (() => {
            const k = resolveKey(node);
            return !!(k && coreKeys.has(k));
          })();
          const prereqsMet = (node.prerequisite_nodes ?? []).every((pr) => {
            const pn = nodeMap.get(pr.id);
            if (!pn) return true;
            const pk = resolveKey(pn);
            return pk ? (coreKeys.has(pk) || selectedKeys.has(pk)) : !!(pn as any)._autoSelected;
          });
          const selKey = resolveKey(node, selectedChoices[node.id] ?? 0);
          const alreadyOn = selKey ? selectedKeys.has(selKey) : false;
          const canSelect = prereqsMet && (isCore || ext._autoSelected || alreadyOn || usedPts < pointBudget);

          const r = ext._apex ? APEX_R : NODE_R;
          const left = TREE_PAD + (node.display_col - minCol) * COL_STEP + (NODE_R - r);
          const top  = TREE_PAD + (node.display_row - minRow) * ROW_STEP + (NODE_R - r);

          return (
            <div key={node.id} style={{ position: "absolute", left, top }}>
              <TalentNode
                node={node} mediaMap={mediaMap}
                selectedKeys={selectedKeys} selectedChoices={selectedChoices}
                canSelect={canSelect} isCore={isCore}
                onClick={() => onToggle(node)}
                onChoiceClick={(idx) => onChoiceSelect(node, idx)}
                onHover={onHover}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HeroSection — portrait + hero talent nodes (matches sentinel-tree.html)
// ─────────────────────────────────────────────────────────────────────────────
function HeroSection({
  heroTrees, activeHeroTreeId, activeHeroKey, heroNodes,
  mediaMap, selectedKeys, selectedChoices,
  onHeroToggle, onHeroChoiceSelect, onHeroSwitch, onHover,
}: {
  heroTrees: Array<{ id: number; name: string }>;
  activeHeroTreeId: number; activeHeroKey: "sentinel" | "packLeader";
  heroNodes: BzTalentNode[];
  mediaMap: Record<number, string>;
  selectedKeys: Set<string>; selectedChoices: Record<number, number>;
  onHeroToggle: (n: BzTalentNode) => void;
  onHeroChoiceSelect: (n: BzTalentNode, idx: number) => void;
  onHeroSwitch: (id: number) => void;
  onHover: (info: TooltipInfo | null, x: number, y: number) => void;
}) {
  const isSentinel = activeHeroKey === "sentinel";
  const heroName   = heroTrees.find((h) => h.id === activeHeroTreeId)?.name
    ?? (isSentinel ? "Sentinel" : "Pack Leader");
  const keystoneNode = heroNodes.find((n) => (n as any)._autoSelected);
  const portraitSpellId = keystoneNode?.entries?.[0]?.spell_tooltip?.spell?.id ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "0 0 auto" }}>
      <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, fontWeight: 700,
        letterSpacing: 3, color: GOLD, textTransform: "uppercase", marginBottom: 6 }}>
        {heroName.toUpperCase()}
      </div>

      {/* Hero portrait — matches sentinel-tree.html hero node (R=30, gold glow) */}
      <div
        onClick={() => {
          if (heroTrees.length >= 2) {
            const other = heroTrees.find((h) => h.id !== activeHeroTreeId);
            if (other) onHeroSwitch(other.id);
          }
        }}
        title={heroTrees.length >= 2 ? "Click to switch hero talent" : undefined}
        style={{
          width: 60, height: 60, borderRadius: "50%",
          border: `2px solid ${GOLD}`,
          boxShadow: `0 0 16px ${GOLD_GLOW},0 0 32px rgba(200,168,75,.12)`,
          overflow: "hidden", marginBottom: 6,
          background: NODE_FILL,
          cursor: heroTrees.length >= 2 ? "pointer" : "default",
        }}>
        {portraitSpellId && mediaMap[portraitSpellId] ? (
          <img src={mediaMap[portraitSpellId]} alt={heroName}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_ICON; }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: 26 }}>
            {isSentinel ? "🌙" : "🐺"}
          </div>
        )}
      </div>

      {/* Mini gate connector dot (matches sentinel-tree.html sn_gate node) */}
      <div style={{ width: 8, height: 8, borderRadius: "50%",
        background: GOLD_DIM, marginBottom: 4, opacity: 0.7 }} />

      {/* Hero tree switcher dots */}
      {heroTrees.length >= 2 && (
        <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
          {heroTrees.map((ht) => {
            const isActive = ht.id === activeHeroTreeId;
            const clr = ht.name.toLowerCase().includes("sentinel") ? "#7dd3fc" : "#d8b4fe";
            return (
              <button key={ht.id} onClick={() => onHeroSwitch(ht.id)} title={ht.name}
                style={{ width: 8, height: 8, borderRadius: "50%", padding: 0, border: "none",
                  background: isActive ? clr : GOLD_DIM, cursor: "pointer",
                  opacity: isActive ? 1 : 0.45, transition: "all .15s" }} />
            );
          })}
        </div>
      )}

      {/* Hero talent nodes */}
      <div style={{
        background: "linear-gradient(180deg,rgba(22,12,4,.95) 0%,rgba(10,5,2,.98) 100%)",
        border: `1px solid ${GOLD_DIM}50`,
        borderTop: `2px solid ${GOLD}40`,
        borderRadius: 6, padding: "4px 2px",
        boxShadow: `inset 0 1px 0 ${GOLD_DIM}20`,
      }}>
        <TalentSection
          label="" pointBudget={10}
          nodes={heroNodes} mediaMap={mediaMap}
          selectedKeys={selectedKeys} selectedChoices={selectedChoices}
          coreKeys={new Set()}
          onToggle={onHeroToggle} onChoiceSelect={onHeroChoiceSelect}
          onHover={onHover} showPointCounter={false}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────────────────────────
function TreeSkeleton() {
  return (
    <div style={{ display: "flex", gap: 20, justifyContent: "center", padding: 20, opacity: 0.5 }}>
      {[7, 4, 7].map((cols, si) => (
        <div key={si} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ height: 12, width: 70, background: GOLD_DIM, borderRadius: 3, opacity: 0.4 }} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", maxWidth: cols * COL_STEP }}>
            {Array.from({ length: cols * 5 }).map((_, i) => (
              <div key={i} style={{
                width: NODE_SIZE, height: NODE_SIZE, borderRadius: "50%",
                background: NODE_FILL, border: `1.5px solid ${GOLD_DIM}40`,
                animation: "pulse 1.8s ease-in-out infinite",
                animationDelay: `${(i % 7) * 120}ms`,
              }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export interface BlizzardTalentTreeProps {
  specSelectedKeys?: string[];
  onSpecToggle?: (key: string, selected: boolean) => void;
  heroKey?: "sentinel" | "packLeader";
  onHeroChange?: (hero: "sentinel" | "packLeader") => void;
  heroSelectedKeys?: string[];
  onHeroToggle?: (key: string, selected: boolean) => void;
}

export function BlizzardTalentTree({
  specSelectedKeys, onSpecToggle,
  heroKey: heroKeyProp, onHeroChange,
  heroSelectedKeys: heroSelectedKeysProp, onHeroToggle,
}: BlizzardTalentTreeProps) {
  // ── Live API (used for mediaMap + node enrichment) ─────────────────────────
  const [apiData, setApiData] = useState<TalentTreeFullResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getSurvivalTalentTree()
      .then((d) => { if (mounted) { setApiData(d); setIsLoading(false); } })
      .catch((e) => { if (mounted) { setLoadError(e?.message ?? "Failed"); setIsLoading(false); } });
    return () => { mounted = false; };
  }, []);

  // ── Convert named layout nodes, enriched with live API data ───────────────
  const mediaMap: Record<number, string> = apiData?.mediaMap ?? {};

  const allLiveNodes = useMemo(() => [
    ...(apiData?.specTree?.class_talent_nodes ?? []),
    ...(apiData?.specTree?.spec_talent_nodes ?? []),
    ...((apiData?.heroTrees ?? []).flatMap((ht) =>
      ht.hero_talent_nodes ?? ht.spec_talent_nodes ?? ht.class_talent_nodes ?? []
    )),
  ], [apiData]);

  const specNodes    = useMemo(() => convertLayoutNodes(SURVIVAL_NODES,     allLiveNodes, mediaMap), [allLiveNodes]);
  const sentinelNodes = useMemo(() => convertLayoutNodes(SENTINEL_NODES,    allLiveNodes, mediaMap), [allLiveNodes]);
  const packLeaderNodes = useMemo(() => convertLayoutNodes(PACK_LEADER_NODES, allLiveNodes, mediaMap), [allLiveNodes]);

  // Class tree still comes from live API (Hunter class tree not in prompt)
  const classNodes = useMemo(() => apiData?.specTree?.class_talent_nodes ?? [], [apiData]);

  // ── Selection state ────────────────────────────────────────────────────────
  const [internalSpecKeys, setInternalSpecKeys]   = useState<string[]>([]);
  const [internalHeroKey, setInternalHeroKey]     = useState<"sentinel" | "packLeader">("sentinel");
  const [internalHeroKeys, setInternalHeroKeys]   = useState<string[]>([]);
  const [selectedChoices, setSelectedChoices]     = useState<Record<number, number>>({});

  const activeSpecKeys = specSelectedKeys ?? internalSpecKeys;
  const activeHeroKey  = heroKeyProp ?? internalHeroKey;
  const activeHeroKeys = heroSelectedKeysProp ?? internalHeroKeys;

  const selectedKeys = useMemo<Set<string>>(
    () => new Set([...CORE_SPEC_KEYS, ...activeSpecKeys, ...activeHeroKeys]),
    [activeSpecKeys, activeHeroKeys],
  );

  // ── Hero tree resolution ───────────────────────────────────────────────────
  const heroTreeRefs = useMemo(() => {
    const apiRefs = (apiData?.heroTrees ?? []).map((ht) => ({ id: ht.id, name: ht.name }));
    return apiRefs.length > 0 ? apiRefs : [
      { id: 42, name: "Sentinel" },
      { id: 43, name: "Pack Leader" },
    ];
  }, [apiData]);

  const activeHeroTreeId = useMemo(() => {
    const match = heroTreeRefs.find((h) =>
      h.name.toLowerCase().includes(activeHeroKey === "sentinel" ? "sentinel" : "pack")
    );
    return match?.id ?? heroTreeRefs[0]?.id ?? 42;
  }, [heroTreeRefs, activeHeroKey]);

  const heroNodes = activeHeroKey === "sentinel" ? sentinelNodes : packLeaderNodes;

  // ── Tooltip ────────────────────────────────────────────────────────────────
  const [tooltip, setTooltip] = useState<{ info: TooltipInfo; x: number; y: number } | null>(null);
  const tipTimer = useRef<number>();
  const handleHover = useCallback((info: TooltipInfo | null, x: number, y: number) => {
    clearTimeout(tipTimer.current);
    if (!info) { tipTimer.current = window.setTimeout(() => setTooltip(null), 80); }
    else setTooltip({ info, x, y });
  }, []);

  // ── Toggle handlers ────────────────────────────────────────────────────────
  const handleSpecToggle = useCallback((node: BzTalentNode) => {
    const k = resolveKey(node);
    if (!k || CORE_SPEC_KEYS.has(k)) return;
    const isOn = selectedKeys.has(k);
    if (onSpecToggle) onSpecToggle(k, !isOn);
    else setInternalSpecKeys((p) => isOn ? p.filter((x) => x !== k) : [...p, k]);
  }, [selectedKeys, onSpecToggle]);

  const handleChoiceSelect = useCallback((node: BzTalentNode, idx: number) => {
    const oldIdx = selectedChoices[node.id] ?? 0;
    const oldKey = resolveKey(node, oldIdx);
    const newKey = resolveKey(node, idx);
    setSelectedChoices((p) => ({ ...p, [node.id]: idx }));
    if (oldKey && onSpecToggle) onSpecToggle(oldKey, false);
    if (newKey && onSpecToggle) onSpecToggle(newKey, true);
    else if (!onSpecToggle) {
      setInternalSpecKeys((p) => {
        let next = oldKey ? p.filter((x) => x !== oldKey) : [...p];
        if (newKey && !next.includes(newKey)) next = [...next, newKey];
        return next;
      });
    }
  }, [selectedChoices, onSpecToggle]);

  const handleHeroToggle = useCallback((node: BzTalentNode) => {
    const k = resolveKey(node);
    if (!k) return;
    const isOn = selectedKeys.has(k);
    if (onHeroToggle) onHeroToggle(k, !isOn);
    else setInternalHeroKeys((p) => isOn ? p.filter((x) => x !== k) : [...p, k]);
  }, [selectedKeys, onHeroToggle]);

  const handleHeroChoiceSelect = useCallback((node: BzTalentNode, idx: number) => {
    const oldIdx = selectedChoices[node.id] ?? 0;
    const oldKey = resolveKey(node, oldIdx);
    const newKey = resolveKey(node, idx);
    setSelectedChoices((p) => ({ ...p, [node.id]: idx }));
    if (onHeroToggle) {
      if (oldKey) onHeroToggle(oldKey, false);
      if (newKey) onHeroToggle(newKey, true);
    } else {
      setInternalHeroKeys((p) => {
        let next = oldKey ? p.filter((x) => x !== oldKey) : [...p];
        if (newKey && !next.includes(newKey)) next = [...next, newKey];
        return next;
      });
    }
  }, [selectedChoices, onHeroToggle]);

  const handleHeroSwitch = useCallback((id: number) => {
    const ht = heroTreeRefs.find((h) => h.id === id);
    if (!ht) return;
    const k = ht.name.toLowerCase().includes("pack") ? "packLeader" : "sentinel";
    if (onHeroChange) onHeroChange(k);
    else { setInternalHeroKey(k); setInternalHeroKeys([]); }
  }, [heroTreeRefs, onHeroChange]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (isLoading) return <TreeSkeleton />;

  if (loadError) {
    return (
      <div style={{ padding: 24, textAlign: "center",
        fontFamily: "'Rajdhani',sans-serif", color: "#f87171", fontSize: 13 }}>
        <div style={{ marginBottom: 8, color: GOLD }}>⚠ Could not load talent tree</div>
        <div style={{ fontSize: 11, color: GOLD_DIM }}>{loadError}</div>
      </div>
    );
  }

  const classBudget = apiData?.specTree?.talent_point_budget?.class_points ?? 31;
  const specBudget  = apiData?.specTree?.talent_point_budget?.spec_points  ?? 31;
  const classCoreKeys = new Set<string>();

  return (
    <div style={{ userSelect: "none" }}>
      <div style={{ overflowX: "auto", overflowY: "visible" }}>
        <div style={{
          display: "flex", gap: 16, alignItems: "flex-start",
          justifyContent: "center",
          minWidth: "fit-content", padding: "8px 8px 16px",
        }}>
          {/* CLASS TREE — live API data (Hunter class tree) */}
          {classNodes.length > 0 && (
            <TalentSection
              label="HUNTER" pointBudget={classBudget}
              nodes={classNodes} mediaMap={mediaMap}
              selectedKeys={selectedKeys} selectedChoices={selectedChoices}
              coreKeys={classCoreKeys}
              onToggle={handleSpecToggle} onChoiceSelect={handleChoiceSelect}
              onHover={handleHover}
            />
          )}

          {/* HERO TREE */}
          <HeroSection
            heroTrees={heroTreeRefs}
            activeHeroTreeId={activeHeroTreeId}
            activeHeroKey={activeHeroKey}
            heroNodes={heroNodes}
            mediaMap={mediaMap}
            selectedKeys={selectedKeys} selectedChoices={selectedChoices}
            onHeroToggle={handleHeroToggle}
            onHeroChoiceSelect={handleHeroChoiceSelect}
            onHeroSwitch={handleHeroSwitch}
            onHover={handleHover}
          />

          {/* SPEC TREE — named layout data from prompt */}
          <TalentSection
            label="SURVIVAL" pointBudget={specBudget}
            nodes={specNodes} mediaMap={mediaMap}
            selectedKeys={selectedKeys} selectedChoices={selectedChoices}
            coreKeys={CORE_SPEC_KEYS}
            onToggle={handleSpecToggle} onChoiceSelect={handleChoiceSelect}
            onHover={handleHover}
          />
        </div>
      </div>

      {tooltip && <NodeTooltip info={tooltip.info} x={tooltip.x} y={tooltip.y} />}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:.35} 50%{opacity:.7} }
      `}</style>
    </div>
  );
}

export default BlizzardTalentTree;
