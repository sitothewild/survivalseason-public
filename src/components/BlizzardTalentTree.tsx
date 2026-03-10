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

const FALLBACK_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23110a03'/%3E%3C/svg%3E";

// Wowhead icon fallbacks for hero talent spells (keyed by spell ID)
// These provide icons when the Blizzard media API returns 404
const WOWHEAD_ICON_FALLBACKS: Record<number, string> = {
  // Sentinel
  1253599: "https://wow.zamimg.com/images/wow/icons/large/ability_racial_dvinewardenofthelightofthestar.jpg", // Lunar Storm
  450373:  "https://wow.zamimg.com/images/wow/icons/large/inv_polearm_2h_felfireraid_d_01.jpg", // Sanctified Armaments
  1253825: "https://wow.zamimg.com/images/wow/icons/large/spell_arcane_starfire.jpg", // Lunar Inspiration
  1253831: "https://wow.zamimg.com/images/wow/icons/large/ability_upgrademoonglaive.jpg", // Moonlight Chakram
  1264902: "https://wow.zamimg.com/images/wow/icons/large/ability_upgrademoonglaive.jpg", // Chakram Passback
  1253751: "https://wow.zamimg.com/images/wow/icons/large/spell_frost_stun.jpg", // Stargazer (choice)
  1253807: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_resistanceisfutile.jpg", // Open Fire (choice)
  1253830: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_markedfordeath.jpg", // Sentinel's Mark
  450379:  "https://wow.zamimg.com/images/wow/icons/large/spell_frost_stun.jpg", // Stargazer
  1264904: "https://wow.zamimg.com/images/wow/icons/large/spell_shadow_requiem.jpg", // Twilight Requiem (choice)
  1266069: "https://wow.zamimg.com/images/wow/icons/large/ability_rogue_stalkandstrike.jpg", // Stalk and Strike (choice)
  1253846: "https://wow.zamimg.com/images/wow/icons/large/spell_frost_arcticwinds.jpg", // Ice Claw
  1253852: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_eagleeye.jpg", // Sentinel Owl
  450376:  "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_aspectoftheviper.jpg", // Conditioning (choice)
  450380:  "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_mastermarksman.jpg", // Scout's Vigil (choice)
  1264903: "https://wow.zamimg.com/images/wow/icons/large/inv_glaive_1h_npc_d_01.jpg", // Glaive Passive
  1253732: "https://wow.zamimg.com/images/wow/icons/large/ability_druid_lunarguidance.jpg", // Moon and Stars
  // Pack Leader
  471876:  "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_sickem.jpg", // Vicious Hunt (keystone)
  472358:  "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_lonewolf.jpg", // Lone Wolf
  472352:  "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_beastwithin.jpg", // Horn
  472357:  "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_pathfinding2.jpg", // Pathfinding
  472719:  "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_aspectoftheviper.jpg", // Slicked Shoes (choice)
  472720:  "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_mendpet.jpg", // Masterful Call (choice)
  472476:  "https://wow.zamimg.com/images/wow/icons/large/ability_druid_ferociousbite.jpg", // Ursine Fury (choice)
  472524:  "https://wow.zamimg.com/images/wow/icons/large/ability_druid_rake.jpg", // Sharpened Claws (choice)
  472550:  "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_wildattack.jpg", // Cat Charge
  472639:  "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_corneredprey.jpg", // Boar Head
  1264781: "https://wow.zamimg.com/images/wow/icons/large/ability_druid_mangle.jpg", // Critical Shot
  472660:  "https://wow.zamimg.com/images/wow/icons/large/ability_druid_ferociousbite.jpg", // Go for the Throat
  472707:  "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_rapidregeneration.jpg", // Turtle
  1264797: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_multishot.jpg", // Hoof and Blade (choice)
  1264792: "https://wow.zamimg.com/images/wow/icons/large/ability_creature_poison_06.jpg", // Wyvern's Gaze (choice)
  1264775: "https://wow.zamimg.com/images/wow/icons/large/ability_druid_rake.jpg", // Monster Fang
  472741:  "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_sickem.jpg", // Bestial Discipline (capstone)
};

// ── Hardcoded fallback hero trees ────────────────────────────────────────────
// Sentinel: 1-4-4-4-1 diamond layout — rows 1-5, cols 1,3,5,7 (center=4)
const FALLBACK_SENTINEL_NODES: BzTalentNode[] = [
  // Row 1 — auto-selected keystone
  { id: 95001, display_row: 1, display_col: 4, node_type: { id: 1, type: "SINGLE" }, entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1253599, name: "Lunar Storm" }, description: "Sentinel Mark consumption triggers Lunar Storm AoE." } }] },
  // Row 2 — 4 passives
  { id: 94960, display_row: 2, display_col: 1, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 95001 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 450373, name: "Sanctified Armaments" }, description: "Harpoon applies Sentinel Mark on impact." } }] },
  { id: 94973, display_row: 2, display_col: 3, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 95001 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1253825, name: "Lunar Inspiration" }, description: "Your Sentinel abilities deal increased Arcane damage." } }] },
  { id: 95002, display_row: 2, display_col: 5, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 95001 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1253831, name: "Moonlight Chakram" }, description: "Moonlight-empowered Chakram deals bonus damage." } }] },
  { id: 95003, display_row: 2, display_col: 7, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 95001 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1264902, name: "Chakram Passback" }, description: "Chakram bounces back for additional damage." } }] },
  // Row 3 — choice at cols 1 and 7
  { id: 94958, display_row: 3, display_col: 1, node_type: { id: 2, type: "SELECTION" }, prerequisite_nodes: [{ id: 94960 }], entries: [
    { id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1253751, name: "Stargazer" }, description: "Raptor Strike extends Sentinel Mark by 2 sec." } },
    { id: 2, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1253807, name: "Open Fire" }, description: "Kill Command reduces Sentinel cooldown by 5 sec." } },
  ] },
  { id: 95004, display_row: 3, display_col: 3, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94973 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1253830, name: "Sentinel's Mark" }, description: "Sentinel Mark application improved." } }] },
  { id: 94971, display_row: 3, display_col: 5, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 95002 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 450379, name: "Stargazer" }, description: "Sentinel Marks have near-permanent uptime." } }] },
  { id: 110028, display_row: 3, display_col: 7, node_type: { id: 2, type: "SELECTION" }, prerequisite_nodes: [{ id: 95003 }], entries: [
    { id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1264904, name: "Twilight Requiem" }, description: "When Sentinel expires, deals Arcane damage to all marked targets." } },
    { id: 2, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1266069, name: "Stalk and Strike" }, description: "Mongoose Bite/Raptor Strike damage increased per active Sentinel Mark." } },
  ] },
  // Row 4 — choice at col 5
  { id: 94970, display_row: 4, display_col: 1, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94958 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1253846, name: "Ice Claw" }, description: "Sentinel Mark damage increased by 10%." } }] },
  { id: 95005, display_row: 4, display_col: 3, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 95004 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1253852, name: "Sentinel Owl" }, description: "Sentinel Owl patrols the battlefield." } }] },
  { id: 95006, display_row: 4, display_col: 5, node_type: { id: 2, type: "SELECTION" }, prerequisite_nodes: [{ id: 94971 }], entries: [
    { id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 450376, name: "Conditioning" }, description: "Improves Sentinel defensive benefits." } },
    { id: 2, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 450380, name: "Scout's Vigil" }, description: "Enhanced scouting range and mark duration." } },
  ] },
  { id: 109805, display_row: 4, display_col: 7, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 110028 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1264903, name: "Glaive Passive" }, description: "Sentinel cooldown reduced when you consume Sentinel Marks." } }] },
  // Row 5 — capstone
  { id: 95007, display_row: 5, display_col: 4, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94970 }, { id: 95005 }, { id: 95006 }, { id: 109805 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1253732, name: "Moon and Stars" }, description: "Capstone: Ultimate Sentinel power unleashed." } }] },
];

const FALLBACK_PACK_LEADER_NODES: BzTalentNode[] = [
  // Row 1 — auto-selected keystone (center col 4)
  { id: 96001, display_row: 1, display_col: 4, node_type: { id: 1, type: "SINGLE" }, entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 471876, name: "Vicious Hunt" }, description: "Your pet gains Vicious Hunt, savagely attacking your target." } }] },
  // Row 2 — 4 nodes (cols 1,3,5,7)
  { id: 96002, display_row: 2, display_col: 1, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 96001 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472358, name: "Lone Wolf" }, description: "Increases damage dealt when your pet is active." } }] },
  { id: 96003, display_row: 2, display_col: 3, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 96001 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472352, name: "Horn" }, description: "Your pet's attacks have a chance to gore the target." } }] },
  { id: 96004, display_row: 2, display_col: 5, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 96001 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472357, name: "Pathfinding" }, description: "Increases movement speed while your pet is nearby." } }] },
  { id: 96005, display_row: 2, display_col: 7, node_type: { id: 2, type: "SELECTION" }, prerequisite_nodes: [{ id: 96001 }], entries: [
    { id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472719, name: "Slicked Shoes" }, description: "Harpoon's cooldown is reduced and grants brief movement speed." } },
    { id: 2, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472720, name: "Masterful Call" }, description: "Master's Call also grants damage reduction for a short time." } },
  ] },
  // Row 3 — 4 nodes (cols 1,3,5,7)
  { id: 96006, display_row: 3, display_col: 1, node_type: { id: 2, type: "SELECTION" }, prerequisite_nodes: [{ id: 96002 }], entries: [
    { id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472476, name: "Ursine Fury" }, description: "Kill Command deals increased damage, can reset cooldown." } },
    { id: 2, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472524, name: "Sharpened Claws" }, description: "Pet critical strikes deal increased damage." } },
  ] },
  { id: 96007, display_row: 3, display_col: 3, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 96003 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472550, name: "Cat Charge" }, description: "Your pet charges to the target, stunning briefly." } }] },
  { id: 96008, display_row: 3, display_col: 5, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 96004 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472639, name: "Boar Head" }, description: "Kill Command damage increased on targets below 20% health." } }] },
  { id: 96009, display_row: 3, display_col: 7, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 96005 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1264781, name: "Critical Shot" }, description: "Pet enters frenzy after Kill Command crits." } }] },
  // Row 4 — 4 nodes (cols 1,3,5,7)
  { id: 96010, display_row: 4, display_col: 1, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 96006 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472660, name: "Go for the Throat" }, description: "Kill Command generates additional Focus." } }] },
  { id: 96011, display_row: 4, display_col: 3, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 96007 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472707, name: "Turtle" }, description: "Melee attacks can trigger additional pet attack." } }] },
  { id: 96012, display_row: 4, display_col: 5, node_type: { id: 2, type: "SELECTION" }, prerequisite_nodes: [{ id: 96008 }], entries: [
    { id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1264797, name: "Hoof and Blade" }, description: "Kill Command hits additional nearby targets." } },
    { id: 2, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1264792, name: "Wyvern's Gaze" }, description: "Pet stuns targets periodically." } },
  ] },
  { id: 96013, display_row: 4, display_col: 7, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 96009 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1264775, name: "Monster Fang" }, description: "Pet attack speed increased per active bleed." } }] },
  // Row 5 — capstone (center col 4)
  { id: 96014, display_row: 5, display_col: 4, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 96010 }, { id: 96011 }, { id: 96012 }, { id: 96013 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472741, name: "Bestial Discipline" }, description: "Capstone: Ultimate Pack Leader power unleashed." } }] },
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
    entryA: { spellId: 472719,  name: "Slicked Shoes",  key: "slickedShoes" },
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
  "Kill Command": "killCommand", "Wildfire Bomb": "wildfireBomb", "Raptor Strike": "raptorStrike",
  "Guerrilla Tactics": "guerrillaTactics", "Tip of the Spear": "tipOfTheSpear", "Lunge": "lunge",
  "Boomstick": "boomstick", "Strike as One": "strikeAsOne", "Flamebreak": "flamebreak",
  "Quick Reload": "quickReload", "Mongoose Fury": "mongooseFury", "Wildfire Shells": "wildfireShells",
  "Shellshock": "shellshock", "Wallop": "wallop", "Bonding": "bonding", "Sweeping Spear": "sweepingSpear",
  "Blackrock Munitions": "blackrockMunitions", "Takedown": "takedown", "Killer Companion": "killerCompanion",
  "Twin Fangs": "twinFangs", "Savagery": "savagery", "Wildfire Infusion": "wildfireInfusion",
  "Flanked": "flanked", "Primal Surge": "primalSurge", "Raptor Swipe": "raptorSwipe",
  "Flanker's Advantage": "flankerAdvantage", "Bloodseeker": "bloodseeker",
  "Two Against Many": "twoAgainstMany", "Lethal Calibration": "lethalCalibration",
  "Stargazer": "stargazer", "Open Fire": "openFire", "Lunar Inspiration": "lunarInspiration",
  "Extrapolation": "extrapolation", "Twilight Requiem": "twilightRequiem",
  "Stalk and Strike": "stalkAndStrike", "Sanctified Armaments": "sanctifiedArmaments",
  "Moonlight Chakram": "moonlightChakram", "Chakram Passback": "chakramPassback",
  "Sentinel's Mark": "sentinelsMark", "Ice Claw": "iceClaw",
  "Sentinel Owl": "sentinelOwl", "Conditioning": "conditioning",
  "Scout's Vigil": "scoutsVigil", "Glaive Passive": "glaivePassive",
  "Moon and Stars": "moonAndStars", "Lunar Storm": "lunarStorm",
  "Don't Look Back": "dontLookBack", "Catch Out": "catchOut",
  "Invigorating Pulse": "invigoratingPulse", "Eyes Closed": "eyesClosed",
  "Lunar Calling": "lunarCalling", "Release and Reload": "releaseAndReload",
  "Vicious Hunt": "viciousHunt", "Lone Wolf": "loneWolf",
  "Horn": "horn", "Pathfinding": "pathfinding",
  "Slicked Shoes": "slickedShoes", "Masterful Call": "masterfulCall",
  "Ursine Fury": "ursineFury", "Sharpened Claws": "sharpenedClaws",
  "Cat Charge": "catCharge", "Boar Head": "boarHead",
  "Critical Shot": "criticalShot", "Go for the Throat": "goForTheThroat",
  "Turtle": "turtle", "Hoof and Blade": "hoofAndBlade",
  "Wyvern's Gaze": "wyvernGaze", "Monster Fang": "monsterFang",
  "Bestial Discipline": "bestialDiscipline",
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

/** Resolve icon URL: mediaMap (Blizzard API) → Wowhead fallback → blank fallback */
function resolveIcon(spellId: number | undefined, mediaMap: Record<number, string>): string {
  if (!spellId) return FALLBACK_ICON;
  return mediaMap[spellId] ?? WOWHEAD_ICON_FALLBACKS[spellId] ?? FALLBACK_ICON;
}

function nodeSpellName(node: BzTalentNode): string | null {
  return node.entries?.[0]?.spell_tooltip?.spell?.name ?? null;
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
      <div style={{ fontSize: 12, color: "#b8a878", lineHeight: 1.55, fontFamily: "'Rajdhani',sans-serif", whiteSpace: "pre-line" }}>
        {info.description}
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

  const handleEnter = (e: React.MouseEvent) => {
    if (isChoice) {
      const e0 = node.entries[0];
      const e1 = node.entries[1];
      const name0 = e0?.spell_tooltip?.spell?.name ?? "?";
      const name1 = e1?.spell_tooltip?.spell?.name ?? "?";
      const chosen = node.entries[chosenIdx];
      onHover({
        name: `${name0} / ${name1}`,
        description: chosenIdx === 0
          ? `► ${name0}: ${e0?.spell_tooltip?.description ?? ""}\n\n${name1}: ${e1?.spell_tooltip?.description ?? ""}`
          : `${name0}: ${e0?.spell_tooltip?.description ?? ""}\n\n► ${name1}: ${e1?.spell_tooltip?.description ?? ""}`,
        rank: isSelected ? 1 : 0,
        maxRank: 1,
      }, e.clientX, e.clientY);
    } else {
      const entry = node.entries[0];
      onHover({
        name: entry?.spell_tooltip?.spell?.name ?? "?",
        description: entry?.spell_tooltip?.description ?? "",
        rank: isSelected ? (entry?.max_rank ?? 1) : 0,
        maxRank: entry?.max_rank ?? 1,
      }, e.clientX, e.clientY);
    }
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
        {/* Left icon half (entry 0) */}
        <div
          onClick={() => { if (!isLocked) onChoiceClick(0); }}
          style={{ width: "50%", height: "100%", overflow: "hidden", position: "relative", flexShrink: 0 }}
        >
          <img
            src={resolveIcon(node.entries[0]?.spell_tooltip?.spell?.id, mediaMap)}
            alt="" loading="lazy" draggable={false}
            onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_ICON; }}
            style={{ width: sz, height: sz, objectFit: "cover",
              position: "absolute", left: 0, top: 0,
              filter: `brightness(${brightA})`, transition: "filter .15s" }} />
        </div>
        {/* Right icon half (entry 1) */}
        <div
          onClick={() => { if (!isLocked) onChoiceClick(1); }}
          style={{ width: "50%", height: "100%", overflow: "hidden", position: "relative", flexShrink: 0 }}
        >
          <img
            src={resolveIcon(node.entries[1]?.spell_tooltip?.spell?.id, mediaMap)}
            alt="" loading="lazy" draggable={false}
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

  // ── Standard node: icon + double-ring (matches HTML) ────────────────────
  const entry = node.entries[0];
  const spellId = entry?.spell_tooltip?.spell?.id;
  const iconUrl = resolveIcon(spellId, mediaMap);
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
// normalizeHeroLayout — remap hero nodes to canonical 1-4-4-4-1 diamond
// Fallback data already uses cols 1,3,5,7 (center=4). API data uses cols 1-4.
// We detect which scheme is in use and remap API cols → 1,3,5,7 if needed.
// ─────────────────────────────────────────────────────────────────────────────

function normalizeHeroLayout(nodes: BzTalentNode[]): BzTalentNode[] {
  if (nodes.length < 3) return nodes;

  // Detect if nodes already use the wide col scheme (cols > 4 present = fallback data)
  const maxCol = Math.max(...nodes.map((n) => n.display_col));
  if (maxCol >= 5) return nodes; // Already in correct layout

  // API cols 1,2,3,4 → display cols 1,3,5,7 (diamond with center gap at 4)
  const COL_REMAP: Record<number, number> = { 1: 1, 2: 3, 3: 5, 4: 7 };

  // Group by original display_row to detect single-node (capstone) rows
  const rowMap = new Map<number, BzTalentNode[]>();
  nodes.forEach((n) => {
    const r = n.display_row;
    if (!rowMap.has(r)) rowMap.set(r, []);
    rowMap.get(r)!.push(n);
  });

  return nodes.map((n) => {
    const rowNodes = rowMap.get(n.display_row)!;
    const isSingleNodeRow = rowNodes.length === 1;
    const newCol = isSingleNodeRow ? 4 : (COL_REMAP[n.display_col] ?? n.display_col);
    return { ...n, display_col: newCol };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HeroSection — portrait + toggle + hero talent tree
// Matches sentinel-tree.html: large portrait circle (R=30) + talent nodes
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

  const activeHeroTree = useMemo(
    () => heroTrees.find((ht) => ht.id === activeHeroTreeId),
    [heroTrees, activeHeroTreeId],
  );

  const heroNodes: BzTalentNode[] = useMemo(() => {
    if (!activeHeroTree) return [];
    const raw = activeHeroTree.spec_talent_nodes ?? activeHeroTree.hero_talent_nodes ?? activeHeroTree.class_talent_nodes ?? [];
    return normalizeHeroLayout(raw);
  }, [activeHeroTree]);

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

  if (!treeData) return null;

  const { specTree, mediaMap } = treeData;
  const classNodes = specTree.class_talent_nodes ?? [];

  // Filter hero node IDs out of spec nodes — check ALL node list keys on each hero tree
  const heroNodeIdSet = new Set<number>();
  for (const ht of heroTrees) {
    for (const n of [
      ...(ht.hero_talent_nodes ?? []),
      ...(ht.spec_talent_nodes ?? []),
      ...(ht.class_talent_nodes ?? []),
    ]) {
      heroNodeIdSet.add(n.id);
    }
  }
  const rawSpecNodes = (specTree.spec_talent_nodes ?? []).filter((n: BzTalentNode) => !heroNodeIdSet.has(n.id));

  // Keep only the largest connected component to remove stray hero nodes that leaked into spec list
  let specNodes = rawSpecNodes;
  if (rawSpecNodes.length >= 3) {
    const idSet = new Set(rawSpecNodes.map((n) => n.id));
    const adj = new Map<number, Set<number>>();
    rawSpecNodes.forEach((n) => {
      if (!adj.has(n.id)) adj.set(n.id, new Set());
      (n.prerequisite_nodes ?? []).forEach((p) => {
        if (idSet.has(p.id)) {
          adj.get(n.id)!.add(p.id);
          if (!adj.has(p.id)) adj.set(p.id, new Set());
          adj.get(p.id)!.add(n.id);
        }
      });
    });
    const visited = new Set<number>();
    const components: number[][] = [];
    rawSpecNodes.forEach((n) => {
      if (visited.has(n.id)) return;
      const comp: number[] = [];
      const queue = [n.id];
      while (queue.length) {
        const cur = queue.pop()!;
        if (visited.has(cur)) continue;
        visited.add(cur);
        comp.push(cur);
        adj.get(cur)?.forEach((nb) => { if (!visited.has(nb)) queue.push(nb); });
      }
      components.push(comp);
    });
    const largest = components.reduce((a, b) => a.length >= b.length ? a : b, []);
    const largestSet = new Set(largest);
    specNodes = rawSpecNodes.filter((n) => largestSet.has(n.id));
  }

  // Same connectivity filter for class nodes
  let classNodesFinal = classNodes;
  if (classNodes.length >= 3) {
    const idSet = new Set(classNodes.map((n: BzTalentNode) => n.id));
    const adj = new Map<number, Set<number>>();
    classNodes.forEach((n: BzTalentNode) => {
      if (!adj.has(n.id)) adj.set(n.id, new Set());
      (n.prerequisite_nodes ?? []).forEach((p: any) => {
        if (idSet.has(p.id)) {
          adj.get(n.id)!.add(p.id);
          if (!adj.has(p.id)) adj.set(p.id, new Set());
          adj.get(p.id)!.add(n.id);
        }
      });
    });
    const visited = new Set<number>();
    const components: number[][] = [];
    classNodes.forEach((n: BzTalentNode) => {
      if (visited.has(n.id)) return;
      const comp: number[] = [];
      const queue = [n.id];
      while (queue.length) {
        const cur = queue.pop()!;
        if (visited.has(cur)) continue;
        visited.add(cur);
        comp.push(cur);
        adj.get(cur)?.forEach((nb) => { if (!visited.has(nb)) queue.push(nb); });
      }
      components.push(comp);
    });
    const largest = components.reduce((a, b) => a.length >= b.length ? a : b, []);
    const largestSet = new Set(largest);
    classNodesFinal = classNodes.filter((n: BzTalentNode) => largestSet.has(n.id));
  }

  const classBudget = specTree.talent_point_budget?.class_points ?? 31;
  const specBudget  = specTree.talent_point_budget?.spec_points  ?? 31;

  const classCoreKeys = new Set(
    classNodes
      .filter((n) => CORE_CLASS.has(nodeSpellName(n) ?? ""))
      .map((n) => nodeTalentKey(n))
      .filter(Boolean) as string[]
  );

  return (
    <div style={{ userSelect: "none" }}>
      <div style={{ overflowX: "auto", overflowY: "visible" }}>
        <div style={{
          display: "flex", gap: 16, alignItems: "flex-start",
          justifyContent: "center",
          minWidth: "fit-content", padding: "8px 8px 16px",
        }}>
          {/* CLASS TREE */}
          <TalentSection
            label="HUNTER"
            nodes={classNodesFinal} mediaMap={mediaMap}
            pointBudget={classBudget}
            selectedKeys={selectedKeys} selectedChoices={selectedChoices}
            coreKeys={classCoreKeys}
            onToggle={handleSpecToggle} onChoiceSelect={handleChoiceSelect}
            onHover={handleHover}
          />

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
