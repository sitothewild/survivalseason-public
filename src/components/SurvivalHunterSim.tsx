// @ts-nocheck
import { useState, useCallback, useEffect, Fragment, useRef, useMemo } from "react";
import { getFullCharacter, equipmentToSimData, getItemsBatch, getItem, getItemMedia } from "@/lib/blizzardApi";
import { NavLink } from "@/components/NavLink";
import { supabase } from "@/integrations/supabase/client";
import WowModelViewer from "@/components/WowModelViewer";
import survivalIconImg from "@/assets/survival-icon.png";
import { parseSimcAPL, getRotationWeights, buildAPLFromActionLists, type ParsedAPL } from "@/utils/aplParser";
import {
  runTheoryCraft, getOptimalTalentConfig, getFullOptimalAnalysis,
  HEROIC_MIDNIGHT_276, CHAMPION_MIDNIGHT_263,
  SURVIVAL_SPEC_TREE, HERO_TALENT_TREES,
  type GearProfile, type TierSetConfig, type TalentNode,
} from "@/lib/theorycrafting";
import { BlizzardTalentTree } from "@/components/BlizzardTalentTree";

// ============================================================
// MIDNIGHT 12.0.1 SURVIVAL HUNTER SIMULATION ENGINE
// Sources: Azortharion (Trueshot Lodge), Method.gg (Symex), Maxroll (heleni),
//          Wowhead, Icy Veins, Mythicstats, Raidbots/SimC APL
// ============================================================

const SURVIVAL_ICON = survivalIconImg;

const MIDNIGHT_DATA = {
  classAura: 1.20,
  petApScaling: 0.60,
  spells: {
    raptorStrike: { apCoef: 2.86, cd: 0, focus: 30, aoeTargets: 1, note: 'Primary spender. 286% AP Physical damage.' },
    killCommand: { apCoef: 1.50, cd: 0, focus: -20, aoeTargets: 1, note: 'Pet attacks target for 150% AP. Spammable focus builder.' },
    wildfireBomb: { apCoef: 2.48, cd: 18, focus: 0, aoeTargets: 8, note: 'No focus cost. 49.5% AP initial + 99% AP DoT over 6s.' },
    boomstick: { apCoef: 3.60, cd: 60, focus: 0, aoeTargets: 5, note: 'Replaces FotE. Shellshock: +40% ST (-5% per extra target).' },
    flamefangPitch: { apCoef: 4.20, cd: 30, focus: 0, aoeTargets: 8, note: 'Ground AoE + puddle. Grenade Juggler: +1 charge.' },
    takedown: { damageAmp: 0.20, apCoef: 1.80, cd: 90, duration: 8, focus: -50, note: 'Deals 180% AP + 20% amp for 8s. Generates 50 focus.' },
    raptorSwipe: { apCoef: 1.85, cd: 0, focus: -15, aoeTargets: 5, note: 'Apex talent. 25% from RS (100% during Takedown).' },
    hatchetToss: { apCoef: 0.95, cd: 0, focus: 0, aoeTargets: 1, note: 'Ranged poke. Hogstrider: cleaves 4 targets +200% dmg.' },
    strikeAsOne: { apCoef: 1.10, cd: 0, focus: 0, aoeTargets: 1, note: 'Passive pet attack. Two Against Many: +2 targets, +15% per target.' },
    moonlightChakram: { apCoef: 4.80, cd: 90, focus: 0, aoeTargets: 8, note: 'Sentinel only. Bounces between targets.' },
    autoAttack: { apCoef: 0.85, cd: 0, focus: 0, aoeTargets: 1, note: 'Melee auto attacks.' },
  },
  statPriority: {
    st: ['Agility', 'Mastery', 'Critical Strike = Haste', 'Versatility'],
    aoe: ['Agility', 'Mastery', 'Haste', 'Critical Strike', 'Versatility'],
    note: 'Mastery (Spirit Bond) increases you and pet damage.'
  },
  talents: {
    class: {
      keenEyesight: { dps: 0.03, type: "passive", desc: "2% Crit chance." },
      unnaturalCauses: { dps: 0.04, type: "passive", desc: "Increases DoT damage by 10%." },
      triggerFinger: { dps: 0.04, type: "passive", desc: "2-point node: 1/2% Haste." },
      serratedTips: { dps: 0.03, type: "passive", desc: "2-point node: 4% more crit from all sources." },
      agilityBonus: { dps: 0.03, type: "passive", desc: "3% Agility increase." },
      autoAttackBonus: { dps: 0.025, type: "passive", desc: "25% increased auto attack damage." },
    },
    spec: {
      mongooseFury: { dps: 0.10, stTarget: 0.14, aoe: 0.06, desc: "Raptor Strike increases RS damage by 10% for 8s. Multiple overlaps stack.", always: true },
      strikeAsOne: { dps: 0.08, stTarget: 0.10, aoe: 0.06, desc: "All damaging abilities cause pet to attack.", always: true },
      wildfireBomb: { dps: 0.14, stTarget: 0.11, aoe: 0.22, desc: "No focus cost. Lethal Calibration: +15% crit dmg for 12s.", always: true },
      takedown: { dps: 0.08, stTarget: 0.12, aoe: 0.06, desc: "Replaces Coordinated Assault. 20% amp for 8s. 1:30 base CD.", always: true },
      boomstick: { dps: 0.10, stTarget: 0.09, aoe: 0.14, desc: "Replaces FotE. Frontal AoE, 1m CD. Shellshock: +40% ST.", always: true },
      raptorSwipe: { dps: 0.09, stTarget: 0.04, aoe: 0.16, desc: "Apex talent (4 points). 25% proc → 100% during Takedown.", always: true },
      savagery: { dps: 0.06, stTarget: 0.09, aoe: 0.03, desc: "Reduces Takedown CD by 15/30s.", stPriority: true },
      vulnerability: { dps: 0.05, stTarget: 0.07, aoe: 0.02, desc: "RS and Boomstick deal 20% increased crit damage.", stPriority: true },
      mongooseRounds: { dps: 0.05, stTarget: 0.07, aoe: 0.03, desc: "Each Boomstick hit grants 1 MF stack.", stPriority: true },
      flamefangPitch: { dps: 0.10, stTarget: 0.04, aoe: 0.18, desc: "30s CD ground AoE + fire puddle.", aoePriority: true },
      grenadeJuggler: { dps: 0.04, stTarget: 0.01, aoe: 0.08, desc: "Flamefang Pitch gains 1 extra charge.", aoePriority: true },
      wildfileShells: { dps: 0.04, stTarget: 0.02, aoe: 0.07, desc: "Each Boomstick hit reduces WFB CD by 4s.", aoePriority: true },
      shrapnelBomb: { dps: 0.03, stTarget: 0.01, aoe: 0.06, desc: "WFB periodic is now a bleed.", aoePriority: true },
      flamebreak: { dps: 0.04, stTarget: 0.03, aoe: 0.07, desc: "All Fire damage +15%.", aoePriority: true },
      lethalCalibration: { dps: 0.06, stTarget: 0.07, aoe: 0.05, desc: "WFB increases crit damage by 15% for 12s.", always: true },
      wildfireImbuement: { dps: 0.05, stTarget: 0.04, aoe: 0.07, desc: "Flamefang Pitch imbues weapon with fire.", aoePriority: true },
      twoAgainstMany: { dps: 0.04, stTarget: 0.02, aoe: 0.08, desc: "Strike as One hits +2 enemies.", aoePriority: true },
    },
    hero: {
      packLeader: {
        name: "Pack Leader", icon: "🐾",
        desc: "Focused on Kill Command and pet damage. Howl of the Pack Leader spawns Bear/Wyvern/Boar every 30s on Kill Command.",
        stBonus: 0.05, aoeBonus: 0.07, mechanic: "killCommandProcs",
        defensiveBenefit: "Shell Cover: +10% DR on Survival of the Fittest",
        weaponPref: "Dual Wield (1H Axes/Swords/Daggers)", recommended: false,
        subTalents: {
          lethalBarbs: { dps: 0.03, stTarget: 0.04, aoe: 0.02, desc: "Auto attacks generate 2 Focus each." },
          hogstrider: { dps: 0.01, stTarget: 0.01, aoe: 0.01, desc: "Hatchet Toss cleaves 4 targets +200% damage." },
          direSummons: { dps: 0.02, stTarget: 0.03, aoe: 0.02, desc: "Reduces beast spawn cooldown." },
          shellCover: { dps: 0, stTarget: 0, aoe: 0, desc: "+10% DR on SotF. Defensive only." },
          stampede: { dps: 0.03, stTarget: 0.02, aoe: 0.04, desc: "Capstone: Takedown grants extra beast spawn → Stampede." },
        }
      },
      sentinel: {
        name: "Sentinel", icon: "🦉",
        desc: "Empowers WFB via Sentinel's Mark (20% proc from RS). When consumed, triggers Lunar Storm. Currently preferred for both Raid and M+.",
        stBonus: 0.07, aoeBonus: 0.12, mechanic: "sentinelMark",
        defensiveBenefit: "Don't Look Back: 10% max HP absorb",
        weaponPref: "2H Weapon (Polearm/Staff)", recommended: true,
        subTalents: {
          dontLookBack: { dps: 0, stTarget: 0, aoe: 0, desc: "10% max HP absorb shield." },
          moonlightChakram: { dps: 0.05, stTarget: 0.06, aoe: 0.08, desc: "Bounces between targets dealing heavy damage." },
          lunarStorm: { dps: 0.04, stTarget: 0.04, aoe: 0.07, desc: "AoE damage when Sentinel's Mark consumed." },
          moonsBlessing: { dps: 0.03, stTarget: 0.03, aoe: 0.04, desc: "+10% Sentinel's Mark proc chance." },
          stargazer: { dps: 0.03, stTarget: 0.04, aoe: 0.02, desc: "RS increases crit damage by 2% for 10s, stacking." },
          cantMissWontMiss: { dps: 0.03, stTarget: 0.04, aoe: 0.02, desc: "RS +10% damage. Takedown +2s." },
          conditioning: { dps: 0, stTarget: 0, aoe: 0, desc: "+8% movement speed, -30s Cheetah CD." },
        }
      }
    }
  }
};

// ============================================================
// SIMULATIONCRAFT PARSER
// ============================================================
function parseSimcString(simcText) {
  const result = {
    character: {}, stats: { agility: 0, haste: 0, crit: 0, mastery: 0, versatility: 0, attackPower: 0 },
    gear: [], talents: null, valid: false, errors: []
  };
  if (!simcText || simcText.trim().length < 20) { result.errors.push("Input appears empty or too short."); return result; }
  const lines = simcText.trim().split('\n').map(l => l.trim());
  const charLine = lines.find(l => /^(hunter|survival_hunter)/i.test(l));
  if (charLine) {
    const nameMatch = charLine.match(/^(?:hunter|survival_hunter)="([^"]+)"/i) || charLine.match(/name="([^"]+)"/);
    if (nameMatch) result.character.name = nameMatch[1];
  }
  lines.forEach(line => {
    const kv = line.match(/^(\w+)=(.+)$/); if (!kv) return;
    const [, key, val] = kv;
    if (key === 'level') result.character.level = parseInt(val);
    if (key === 'race') result.character.race = val;
    if (key === 'server' || key === 'realm') result.character.realm = val;
    if (key === 'region') result.character.region = val;
  });
  lines.forEach(line => {
    const statMatch = line.match(/^(\w+)=([0-9.]+)$/); if (!statMatch) return;
    const [, key, val] = statMatch; const v = parseFloat(val);
    if (key === 'agility') result.stats.agility = v;
    if (key === 'haste_rating') result.stats.haste = +(v / 170).toFixed(2);
    if (key === 'crit_rating') result.stats.crit = +(v / 170).toFixed(2);
    if (key === 'mastery_rating') result.stats.mastery = +(v / 170).toFixed(2);
    if (key === 'versatility_rating') result.stats.versatility = +(v / 205 * 100).toFixed(2);
    if (key === 'attack_power') result.stats.attackPower = v;
  });

  // Known enchant IDs → display names (Midnight / TWW)
  const ENCHANT_NAMES: Record<string, string> = {
    '7460': 'Arcane Mastery', '7461': 'Stormrider\'s Fury',
    '7462': 'Stonebound Artistry', '7463': 'Oathsworn\'s Tenacity',
    '7464': 'Authority of Air', '7465': 'Authority of Fiery Resolve',
    '7466': 'Authority of Radiant Power', '7467': 'Authority of Storms',
    '7468': 'Authority of the Depths', '7469': 'Council\'s Intellect',
    '7470': 'Acuity of the Ren\'dorei',
    '7334': 'Amani Mastery', '7335': 'Amani Haste',
    '7336': 'Amani Crit', '7337': 'Amani Versatility',
    '7338': 'Cursed Mastery', '7339': 'Cursed Haste',
    '7340': 'Cursed Crit', '7341': 'Cursed Versatility',
    '7342': 'Radiant Mastery', '7343': 'Radiant Haste',
    '7344': 'Radiant Crit', '7345': 'Radiant Versatility',
    '7529': 'Stormbound Armor Kit', '7531': 'Defender\'s Armor Kit',
    '7532': 'Dual Layered Armor Kit', '7534': 'Sunset Spellthread',
    '7535': 'Daybreak Spellthread', '7536': 'Weavercloth Spellthread',
    '7355': 'Crystalline Radiance', '7356': 'Council\'s Intellect',
    '7409': 'Winged Grace', '7410': 'Leeching Fangs', '7411': 'Burrowing Raptor',
    '7385': 'Armored Avoidance', '7386': 'Armored Leech', '7387': 'Armored Speed',
    '7418': 'Cavalry\'s March', '7419': 'Defender\'s March', '7420': 'Scout\'s March',
    '7594': '+16 Agility/Strength', '7595': '+16 Agility/Strength',
    '7965': 'Amani Mastery', '8160': 'Thalassian Scout Armor Kit',
    '8039': 'Acuity of the Ren\'dorei', '8041': 'Arcane Mastery',
  };

  const slotLabels: Record<string, string> = {
    head:'Head',neck:'Neck',shoulders:'Shoulders',shoulder:'Shoulders',back:'Back',chest:'Chest',wrist:'Wrist',wrists:'Wrist',hands:'Hands',waist:'Waist',legs:'Legs',feet:'Feet',
    finger1:'Ring 1',finger2:'Ring 2',trinket1:'Trinket 1',trinket2:'Trinket 2',main_hand:'Main Hand',off_hand:'Off Hand',tabard:'Tabard',shirt:'Shirt'
  };
  // Canonical slot keys used for display grid mapping
  const SLOT_ALIASES: Record<string, string> = { shoulder: 'shoulders', wrists: 'wrist' };
  const gearSlotNames = Object.keys(slotLabels).join('|');
  const gearSlotPattern = new RegExp(`^(${gearSlotNames})=`);
  const bagSectionIdx = lines.findIndex(l => /gear from bags/i.test(l));
  const equipLines = bagSectionIdx >= 0 ? lines.slice(0, bagSectionIdx) : lines;
  const commentItemPattern = /^#\s+(.+?)\s+\((\d+)\)\s*$/;
  equipLines.forEach((line, idx) => {
    if (!gearSlotPattern.test(line)) return;
    const slotMatch = line.match(/^(\w+)=/); if (!slotMatch) return;
    const rawSlot = slotMatch[1];
    const slotKey = SLOT_ALIASES[rawSlot] || rawSlot;
    if (slotKey === 'tabard' || slotKey === 'shirt') return;
    const idMatch = line.match(/,id=(\d+)/);
    let itemName = slotLabels[slotKey] || slotKey; let ilvl = 0;
    if (idx > 0) { const cm = equipLines[idx - 1].match(commentItemPattern); if (cm) { itemName = cm[1]; ilvl = parseInt(cm[2]) || 0; } }
    const iLvlInline = line.match(/item_level=(\d+)/); if (iLvlInline) ilvl = parseInt(iLvlInline[1]);

    // Parse enchant_id or enchant= from gear line
    const enchantIdMatch = line.match(/enchant_id=(\d+)/);
    const enchantStrMatch = line.match(/,enchant=([^,]+)/);
    let enchant: string | null = null;
    if (enchantIdMatch) {
      enchant = ENCHANT_NAMES[enchantIdMatch[1]] || `Enchant #${enchantIdMatch[1]}`;
    } else if (enchantStrMatch) {
      enchant = enchantStrMatch[1].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    // Parse gem_id
    const gemMatch = line.match(/gem_id=(\d+)/);
    const gemId = gemMatch ? gemMatch[1] : null;

    result.gear.push({
      slot: slotKey, slotLabel: slotLabels[slotKey] || slotKey,
      ilvl, itemId: idMatch ? idMatch[1] : null,
      name: itemName, enchant, gemId
    });
  });
  if (result.gear.length > 0) { result.character.avgIlvl = Math.round(result.gear.reduce((sum, g) => sum + (g.ilvl || 0), 0) / result.gear.filter(g => g.ilvl > 0).length) || 0; }
  const talentLine = lines.find(l => /^talents=/.test(l)); if (talentLine) result.talents = talentLine.replace('talents=', '').trim();
  if (result.character.name || result.stats.agility > 0 || result.gear.length > 0) result.valid = true;
  else result.errors.push("Could not parse character data.");

  // Stat estimation — Midnight expansion: ilvl ~200-260 at level 90
  // Calibrated to Blezaa armory: ilvl 231 → Agi 1477, Crit 19%, Haste 10%, Mastery 25%, Vers 5%
  const avgIlvl = result.character.avgIlvl || 0;
  if (result.stats.agility === 0 && avgIlvl > 0) {
    const s = Math.max(0, avgIlvl - 200) / 60;
    result.stats.agility = Math.round(800 + s * 900);
  }
  if (result.stats.agility === 0) result.stats.agility = 1500;
  if (result.stats.attackPower === 0) result.stats.attackPower = Math.round(result.stats.agility * 1.05);
  if (result.stats.haste === 0 && avgIlvl > 0) {
    const s = Math.max(0, avgIlvl - 200) / 60;
    result.stats.haste = +(5 + s * 8).toFixed(2);
    result.stats.crit = +(10 + s * 14).toFixed(2);
    result.stats.mastery = +(15 + s * 16).toFixed(2);
    result.stats.versatility = +(3 + s * 5).toFixed(2);
  }
  return result;
}

// ============================================================
// SIMULATION ENGINE — Live SimC APL → DPS Breakdown
// ============================================================

// Fallback hardcoded breakdowns (used when live data unavailable)
const SIMC_BREAKDOWN_PL_ST_DEFAULT = { 'Strike as One':0.1883,'Raptor Swipe':0.1471,'Raptor Strike':0.1271,'Boomstick':0.0772,'Auto Attack (MH)':0.0711,'Kill Command':0.0499,'Wildfire Bomb':0.0821,'Auto Attack (OH)':0.0339,'Takedown':0.0331,'Pack Leader Beasts':0.0716,'Pet (Claw)':0.0246,"Kroluk's Warbanner":0.0220,'Pet Melee':0.0200,'Bear (Rend + Melee)':0.0261 };
const SIMC_BREAKDOWN_SENT_ST_DEFAULT = { 'Raptor Strike':0.1400,'Raptor Swipe':0.1350,'Strike as One':0.1200,'Wildfire Bomb':0.1050,'Boomstick':0.0800,'Auto Attack (MH)':0.0650,'Kill Command':0.0500,'Moonlight Chakram':0.0450,'Sentinel Mark + Lunar Storm':0.0700,'Takedown':0.0380,'Auto Attack (OH)':0.0300,'Pet (Claw)':0.0250,'Pet Melee':0.0220,"Kroluk's Warbanner":0.0200 };

// Map SimC APL action names → display names used in breakdowns (Midnight 12.0)
const APL_TO_DISPLAY: Record<string, string> = {
  // Core Midnight 12.0 abilities
  'kill_command': 'Kill Command',
  'wildfire_bomb': 'Wildfire Bomb',
  'raptor_strike': 'Raptor Strike',
  'raptor_swipe': 'Raptor Swipe',
  'takedown': 'Takedown',
  'flamefang_pitch': 'Flamefang Pitch',
  'boomstick': 'Boomstick',
  'moonlight_chakram': 'Moonlight Chakram',
  'hatchet_toss': 'Hatchet Toss',
  // Legacy aliases (for cached data compatibility)
  'kill_command_sv': 'Kill Command',
  'raptor_strike_melee': 'Raptor Strike',
  'harpoon': 'Takedown',
  'moonfire': 'Sentinel Mark + Lunar Storm',
  'stampede': 'Pack Leader Beasts',
};

// Passive/auto sources not in APL but always present
const PASSIVE_SOURCES_PL: Record<string, number> = {
  'Strike as One': 0.16, 'Auto Attack (MH)': 0.07, 'Auto Attack (OH)': 0.035,
  'Pet (Claw)': 0.025, 'Pet Melee': 0.02, "Kroluk's Warbanner": 0.022,
  'Pack Leader Beasts': 0.07, 'Bear (Rend + Melee)': 0.026,
};
const PASSIVE_SOURCES_SENT: Record<string, number> = {
  'Strike as One': 0.12, 'Auto Attack (MH)': 0.065, 'Auto Attack (OH)': 0.03,
  'Pet (Claw)': 0.025, 'Pet Melee': 0.022, "Kroluk's Warbanner": 0.02,
  'Sentinel Mark + Lunar Storm': 0.07,
};

// Spell coefficients for weighting APL actions by damage per cast
const SPELL_WEIGHT: Record<string, number> = {
  'Raptor Strike': 2.86, 'Kill Command': 1.50, 'Wildfire Bomb': 2.48,
  'Boomstick': 3.60, 'Takedown': 1.80, 'Raptor Swipe': 1.85,
  'Flamefang Pitch': 4.20, 'Moonlight Chakram': 4.80,
  'Sentinel Mark + Lunar Storm': 2.00, 'Pack Leader Beasts': 1.50,
};

/**
 * Convert SimC APL action list into DPS breakdown percentages.
 * Higher-priority actions (earlier in APL) are cast more often.
 * Raptor Swipe: ~50% of Raptor Strike casts become Swipe (buff-based).
 * Boomstick: channeled AoE (~4 ticks over 2.5s), own tip_of_the_spear_boomstick buff.
 */
function aplToBreakdown(actionList: string[], isPL: boolean, targetCount: number = 1): Record<string, number> {
  const abilityWeight: Record<string, number> = {};
  const totalActions = actionList.length || 1;

  actionList.forEach((action, idx) => {
    const baseName = action.split(',')[0].split('#')[0].trim().toLowerCase().replace(/\s+/g, '_');
    const displayName = APL_TO_DISPLAY[baseName];
    if (!displayName) return;

    const priorityWeight = 1.0 / (1 + idx * 0.15);
    const spellCoef = SPELL_WEIGHT[displayName] || 1.0;
    const dpsWeight = priorityWeight * spellCoef;

    abilityWeight[displayName] = (abilityWeight[displayName] || 0) + dpsWeight;
  });

  // Model Raptor Swipe: ~50% of Raptor Strike casts become Swipe
  const RAPTOR_SWIPE_UPTIME = 0.50;
  if (abilityWeight['Raptor Strike']) {
    const totalRsWeight = abilityWeight['Raptor Strike'];
    abilityWeight['Raptor Strike'] = totalRsWeight * (1 - RAPTOR_SWIPE_UPTIME);
    // Raptor Swipe does 1.25x RS damage and hits all targets in AoE
    const swipeTargetMult = Math.min(targetCount, 5);
    abilityWeight['Raptor Swipe'] = (abilityWeight['Raptor Swipe'] || 0) + totalRsWeight * RAPTOR_SWIPE_UPTIME * 1.25 * swipeTargetMult;
  }

  // Model Boomstick: channeled AoE (~4 ticks, hits all nearby targets)
  if (abilityWeight['Boomstick'] && targetCount > 1) {
    // Shellshock: +40% ST, -5% per extra target
    const shellshockMult = 1.40 - (targetCount - 1) * 0.05;
    const boomstickTargetMult = Math.min(targetCount, 5) * Math.max(shellshockMult, 0.80);
    abilityWeight['Boomstick'] *= boomstickTargetMult;
  }

  // Merge with passive sources
  const passives = isPL ? PASSIVE_SOURCES_PL : PASSIVE_SOURCES_SENT;
  const passiveTotal = Object.values(passives).reduce((s, v) => s + v, 0);
  const activeBudget = 1.0 - passiveTotal;

  const activeSum = Object.values(abilityWeight).reduce((s, v) => s + v, 0) || 1;
  const breakdown: Record<string, number> = {};

  Object.entries(abilityWeight).forEach(([name, w]) => {
    breakdown[name] = (w / activeSum) * activeBudget;
  });

  Object.entries(passives).forEach(([name, pct]) => {
    breakdown[name] = (breakdown[name] || 0) + pct;
  });

  const total = Object.values(breakdown).reduce((s, v) => s + v, 0) || 1;
  Object.keys(breakdown).forEach(k => { breakdown[k] /= total; });

  return breakdown;
}

/**
 * Build dynamic breakdowns from live SimC data, or fall back to hardcoded defaults.
 */
function getBreakdowns(simcLiveData: any, targetCount: number = 1): { pl: Record<string, number>; sent: Record<string, number> } {
  const apl = simcLiveData?.apl?.actionLists;
  if (!apl) return { pl: SIMC_BREAKDOWN_PL_ST_DEFAULT, sent: SIMC_BREAKDOWN_SENT_ST_DEFAULT };

  // Pack Leader: prefer plst/plcleave based on targets
  const plActions = targetCount > 2
    ? (apl.plcleave || apl.plst || apl.default || [])
    : (apl.plst || apl.default || []);
  // Sentinel: prefer sentst/sentcleave based on targets
  const sentActions = targetCount > 2
    ? (apl.sentcleave || apl.sentst || apl.default || [])
    : (apl.sentst || apl.default || []);

  const plBreakdown = plActions.length > 2 ? aplToBreakdown(plActions, true, targetCount) : SIMC_BREAKDOWN_PL_ST_DEFAULT;
  const sentBreakdown = sentActions.length > 2 ? aplToBreakdown(sentActions, false, targetCount) : SIMC_BREAKDOWN_SENT_ST_DEFAULT;

  // Quality check: if any single active ability dominates >35%, the APL data is likely stale/incompatible — fall back
  const isValidBreakdown = (bd: Record<string, number>) => {
    const passiveKeys = ['Strike as One','Auto Attack (MH)','Auto Attack (OH)','Pet (Claw)','Pet Melee',"Kroluk's Warbanner",'Pack Leader Beasts','Bear (Rend + Melee)','Sentinel Mark + Lunar Storm'];
    const activeEntries = Object.entries(bd).filter(([k]) => !passiveKeys.includes(k));
    return activeEntries.length >= 3 && !activeEntries.some(([, v]) => v > 0.35);
  };

  return {
    pl: isValidBreakdown(plBreakdown) ? plBreakdown : SIMC_BREAKDOWN_PL_ST_DEFAULT,
    sent: isValidBreakdown(sentBreakdown) ? sentBreakdown : SIMC_BREAKDOWN_SENT_ST_DEFAULT,
  };
}

function generateDetailedSimData(breakdown, fightDuration, heroTalent, targetCount, ap) {
  const isPL = heroTalent === 'packLeader';
  const strikeAsOneDps = breakdown['Strike as One'] || 0;
  const avgStrikeAsOneDamage = Math.round(ap * 1.10);
  const triggerAbilities = ['Raptor Strike','Kill Command','Wildfire Bomb','Boomstick','Raptor Swipe'];
  const totalTriggerDps = triggerAbilities.reduce((sum, a) => sum + (breakdown[a] || 0), 0);
  const estimatedTriggersPerSecond = Math.max(0.8, Math.min(2.5, totalTriggerDps / (ap * 0.8)));
  const totalTriggers = Math.round(estimatedTriggersPerSecond * fightDuration);
  const strikeAsOneExplanation = {
    description: "Passive pet attack that triggers on every damaging ability you cast",
    triggerAbilities, mechanics: [
      "Triggers automatically on Raptor Strike, Kill Command, Wildfire Bomb, Boomstick",
      targetCount > 1 ? `With Two Against Many: Hits ${Math.min(targetCount, 3)} targets` : "Single target pet attack",
      "During Takedown: Raptor Swipe triggers Strike as One at 300% damage",
      isPL ? "Pack Leader: Benefits from beast synergies" : "Sentinel: Enhanced by Spirit Bond mastery scaling"
    ],
    estimatedFrequency: `~${estimatedTriggersPerSecond.toFixed(1)} triggers/sec`,
    avgDamage: avgStrikeAsOneDamage, totalTriggers
  };
  const actionCounts = {}; const totalDps = Object.values(breakdown).reduce((sum, dps) => sum + dps, 0);
  Object.entries(breakdown).forEach(([ability, dps]) => {
    const baseCoef = getAbilityCoefficient(ability); const avgHit = Math.round(ap * baseCoef);
    const hitsPerSec = dps > 0 ? Math.max(0.1, dps / avgHit) : 0; const totalHits = Math.round(hitsPerSec * fightDuration);
    const critRate = ability.includes('Strike as One') ? 0.25 : 0.30; const crits = Math.round(totalHits * critRate);
    actionCounts[ability] = { damage: Math.round(dps * fightDuration), count: totalHits, avgHit, crits, dps, percentage: totalDps > 0 ? ((dps / totalDps) * 100) : 0 };
  });
  const buffUptimes = { 'Mongoose Fury': { uptime: 0.65, description: 'Stacking damage buff' }, 'Takedown': { uptime: 0.18, description: '20% damage amplification window' }, 'Lethal Calibration': { uptime: 0.80, description: '15% crit damage from WFB' }, 'Spirit Bond': { uptime: 1.0, description: 'Permanent mastery scaling' } };
  if (isPL) buffUptimes['Pack Leader Beasts'] = { uptime: 0.45, description: 'Summoned beasts from KC procs' };
  else buffUptimes['Sentinel Mark'] = { uptime: 0.35, description: 'Mark applied by Lunar Storm procs' };
  return { actionCounts, buffUptimes, strikeAsOneDetails: strikeAsOneExplanation, resourceData: { focusGenerated: Math.round(fightDuration * 12), focusSpent: Math.round(fightDuration * 11), focusWasted: Math.round(fightDuration * 1) }, executionLog: generateSampleExecutionLog(fightDuration, heroTalent) };
}

const QUALITY_COLORS: Record<string, string> = {
  LEGENDARY: '#ff8000', EPIC: '#a335ee', RARE: '#0070dd',
  UNCOMMON: '#1eff00', COMMON: '#ffffff', POOR: '#9d9d9d',
  ARTIFACT: '#e6cc80', HEIRLOOM: '#00ccff',
};

/** WoW item quality color — uses actual quality type from API when available,
 *  falls back to ilvl-relative estimation. */
function getItemQualityColor(quality?: string, ilvl?: number, avgIlvl?: number): string {
  if (quality && QUALITY_COLORS[quality]) return QUALITY_COLORS[quality];
  if (!ilvl || ilvl <= 0) return '#9d9d9d';
  const avg = avgIlvl && avgIlvl > 0 ? avgIlvl : ilvl;
  const pct = avg > 0 ? (ilvl - avg) / avg : 0;
  if (pct >= 0.15) return '#ff8000';
  if (pct >= 0.03) return '#a335ee';
  if (pct >= -0.05) return '#0070dd';
  if (pct >= -0.12) return '#1eff00';
  return '#ffffff';
}

function formatEnchantLabel(enchant: any): string {
  const raw = String(enchant?.name || enchant?.display || '').trim();
  if (!raw) return '';
  return raw
    .replace(/^Enchanted:\s*/i, '')
    .replace(/^Enchant\s+(Ring|Weapon|Cloak|Chest|Bracer|Boots|Legs)\s*-\s*/i, '')
    .replace(/\s*\|A:.*\|a\s*$/i, '')
    .trim();
}

function getAbilityCoefficient(ability) {
  const c = { 'Strike as One':1.10,'Raptor Strike':1.40,'Kill Command':1.55,'Wildfire Bomb':1.20,'Boomstick':2.50,'Raptor Swipe':1.85,'Flamefang Pitch':1.80,'Hatchet Toss':0.95,'Moonlight Chakram':2.40,'Takedown':1.80 };
  return c[ability] || 1.0;
}

function generateSampleExecutionLog(duration, heroTalent) {
  const isPL = heroTalent === 'packLeader';
  return [
    { time: 0.0, ability: 'Takedown', note: 'Damage amp window starts' },
    { time: 0.5, ability: 'Strike as One', trigger: 'Takedown' },
    { time: 1.2, ability: 'Wildfire Bomb', note: 'Applies Lethal Calibration' },
    { time: 1.7, ability: 'Strike as One', trigger: 'Wildfire Bomb' },
    { time: 3.0, ability: 'Raptor Strike', note: 'Focus builder' },
    { time: 3.5, ability: 'Strike as One', trigger: 'Raptor Strike' },
    { time: 4.8, ability: 'Kill Command', note: isPL ? 'May spawn Pack Leader beast' : 'Pet focus dump' },
    { time: 5.3, ability: 'Strike as One', trigger: 'Kill Command' },
    { time: 6.5, ability: 'Raptor Strike' },
    { time: 7.0, ability: 'Strike as One', trigger: 'Raptor Strike' },
  ];
}

function runSimulation(charData, targetCount, fightDuration, heroTalent, build, externalMult = 1.0, simcLiveData = null, aplData = null) {
  const stats = charData.stats; const ap = stats.attackPower || Math.round((stats.agility || 1500) * 1.05);
  const hastePct = stats.haste || 10.58, critPct = stats.crit || 20.13, masteryPct = stats.mastery || 30.16, versPct = stats.versatility || 8.28;
  const ANCHOR_AP = 1635, ANCHOR_DPS = 51024, ANCHOR_CRIT = 20.13, ANCHOR_HASTE = 10.58, ANCHOR_MASTERY = 30.16, ANCHOR_VERS = 8.28;
  const calcStatMult = (c, h, m, v) => (1 + c / 100 * 1.0) * (1 + h / 100 * 0.80) * (1 + m / 100 * 1.0) * (1 + v / 100);
  const anchorStatMult = calcStatMult(ANCHOR_CRIT, ANCHOR_HASTE, ANCHOR_MASTERY, ANCHOR_VERS);
  const currentStatMult = calcStatMult(critPct, hastePct, masteryPct, versPct);
  const baseCoef = ANCHOR_DPS / (ANCHOR_AP * anchorStatMult);
  let totalDps = baseCoef * ap * currentStatMult;
  const isPL = heroTalent === 'packLeader'; if (!isPL) totalDps *= 1.06;
  totalDps *= Math.min(1.05, 1 + (fightDuration - 180) / 1200 * 0.05);
  const T = targetCount;
  if (T > 1) { const cf = T <= 3 ? 1 + (T - 1) * 0.55 : T <= 5 ? 2.1 + (T - 3) * 0.35 : T <= 8 ? 2.8 + (T - 5) * 0.20 : 3.4 + (T - 8) * 0.12; totalDps *= cf; }
  totalDps *= externalMult;

  // Determine rotation weights from APL parser if available
  let aplWeights: Record<string, number> | null = null;
  if (aplData) {
    const heroKey = heroTalent === 'packLeader' ? 'packLeader' : 'sentinel';
    const mode = (build === 'aoe' || T > 2) ? 'aoe' : 'st';
    aplWeights = getRotationWeights(aplData, heroKey, mode);
    if (aplWeights && Object.keys(aplWeights).length > 0) {
      console.log("Using SimC APL weights:", aplWeights);
    } else {
      aplWeights = null;
      console.log("Using fallback rotation weights");
    }
  } else {
    console.log("Using fallback rotation weights");
  }

  // Use live SimC APL-derived breakdowns when available, otherwise fall back to defaults
  const { pl: SIMC_BREAKDOWN_PL_ST, sent: SIMC_BREAKDOWN_SENT_ST } = getBreakdowns(simcLiveData, T);
  const breakdown = {}; const breakdownTemplate = isPL ? SIMC_BREAKDOWN_PL_ST : SIMC_BREAKDOWN_SENT_ST;
  if (build === 'aoe' || T > 2) {
    const aoeTemplate = {}; Object.entries(breakdownTemplate).forEach(([key, pct]) => {
      if (key.includes('Wildfire') || key.includes('Boomstick') || key.includes('Swipe') || key.includes('Flamefang') || key.includes('Beasts') || key.includes('Lunar')) aoeTemplate[key] = pct * 1.4;
      else if (key.includes('Strike as One')) aoeTemplate[key] = pct * 1.3; else aoeTemplate[key] = pct * 0.7;
    });
    if (!aoeTemplate['Flamefang Pitch']) aoeTemplate['Flamefang Pitch'] = 0.08;
    const aoeSum = Object.values(aoeTemplate).reduce((s, v) => s + v, 0);
    Object.keys(aoeTemplate).forEach(k => { aoeTemplate[k] /= aoeSum; });
    Object.entries(aoeTemplate).forEach(([key, pct]) => { breakdown[key] = Math.round(totalDps * pct); });
  } else { Object.entries(breakdownTemplate).forEach(([key, pct]) => { breakdown[key] = Math.round(totalDps * pct); }); }
  const detailed = generateDetailedSimData(breakdown, fightDuration, heroTalent, T, ap);
  return { totalDps: Math.round(totalDps), breakdown, targets: T, duration: fightDuration, hero: heroTalent, build, detailed, liveDataUsed: !!simcLiveData?.apl?.actionLists, aplDataUsed: !!aplData };
}

function calcStatWeights(charData, targetCount, fightDuration, heroTalent, build, externalMult = 1.0, simcLiveData = null, aplData = null) {
  const baseDps = runSimulation(charData, targetCount, fightDuration, heroTalent, build, externalMult, simcLiveData, aplData).totalDps;
  const DELTA = { agility: 200, haste: 1.5, crit: 1.5, mastery: 1.5, versatility: 1.5 };
  const RATING_PER_PERCENT = { haste: 170, crit: 170, mastery: 170, versatility: 205 };
  const weights = {};
  const agiChar = JSON.parse(JSON.stringify(charData)); agiChar.stats.agility += DELTA.agility; agiChar.stats.attackPower = Math.round(agiChar.stats.agility * 1.05);
  const agiDps = runSimulation(agiChar, targetCount, fightDuration, heroTalent, build, externalMult, simcLiveData, aplData).totalDps;
  const agiDelta = (agiDps - baseDps) / DELTA.agility;
  weights['Agility'] = { perPoint: agiDelta, perRating: agiDelta, delta: agiDps - baseDps, bump: `+${DELTA.agility}` };
  ['haste', 'crit', 'mastery', 'versatility'].forEach(stat => {
    const bumpChar = JSON.parse(JSON.stringify(charData)); bumpChar.stats[stat] = (bumpChar.stats[stat] || 0) + DELTA[stat];
    const bumpDps = runSimulation(bumpChar, targetCount, fightDuration, heroTalent, build, externalMult, simcLiveData, aplData).totalDps;
    const dpsDelta = bumpDps - baseDps; const ratingBump = DELTA[stat] * RATING_PER_PERCENT[stat];
    const perRating = dpsDelta / ratingBump; const label = stat.charAt(0).toUpperCase() + stat.slice(1);
    weights[label] = { perPoint: perRating, perRating, delta: dpsDelta, bump: `+${DELTA[stat]}%`, ratingBump: Math.round(ratingBump) };
  });
  const agiWeight = weights['Agility'].perPoint;
  Object.keys(weights).forEach(k => { weights[k].normalized = agiWeight > 0 ? +(weights[k].perPoint / agiWeight).toFixed(3) : 0; });
  return { weights, baseDps };
}

function getOptimalTalents(targetCount, heroTalent) {
  const isAoe = targetCount > 2; const spec = MIDNIGHT_DATA.talents.spec; const selected = [];
  Object.entries(spec).forEach(([key, t]) => { if (t.always || (isAoe && t.aoePriority) || (!isAoe && t.stPriority)) selected.push({ key, ...t }); });
  return {
    selected, hero: MIDNIGHT_DATA.talents.hero[heroTalent], heroKey: heroTalent, mode: isAoe ? 'AoE' : 'Single Target',
    exportString: isAoe
      ? (heroTalent === 'sentinel' ? 'C8PAAAAAAAAAAAAAAAAAAAAAAMWgBmxoxyAYmgNzMzMmxyAAAAAAgZmZmZYGjZMwYyAAAAAGAALbzMziZmZmZGDAMDbMLGjZmNG' : 'C8PAAAAAAAAAAAAAAAAAAAAAAMgxMG2ILwMM0gFzMzMz4BWGAAAAAAMzMzMDzYMjBGTGAAAAwAAYZZmZ2MzMjZGDgZ2AgxYmZhB')
      : (heroTalent === 'sentinel' ? 'C8PAAAAAAAAAAAAAAAAAAAAAAMWgBmxoxyAYmgNjZmxMPwy8AAAAAAAMzMzMDzYMjBGTGAAAAwAAYZbmZWMzMzMzYAgZYjZxYMjNG' : 'C8PAAAAAAAAAAAAAAAAAAAAAAMgxMGWILwMM0gFjZmZmxyAAAAAAgZmZmZYGjZMwYyAAAAAGAwYZbmZWMzMzMzYAMzGgZxYMjNG')
  };
}

// ── Talent Loadout Definitions ────────────────────────────────
// 3 named builds per hero talent. Each loadout drives heroTalent + simMode
// and makes visible exactly which spec/hero talents are active.
//
// Talent pill types:
//   core  — always talented (no choice)
//   st    — single-target / raid-only picks
//   aoe   — AoE / Mythic+ picks
//   hero  — hero-talent-specific nodes
//   hybrid— included in the cleave build but not pure ST or pure AoE

interface TalentPill {
  name: string;
  type: 'core' | 'st' | 'aoe' | 'hero' | 'hybrid';
  desc: string;
  points: number; // talent point cost (1 or 2)
}
interface TalentLoadout {
  id: string;
  heroKey: 'sentinel' | 'packLeader';
  name: string;
  scenario: string;
  icon: string;
  simMode: 'single' | 'cleave' | 'multi';
  stDelta: number;    // relative DPS vs no talents
  aoeDelta: number;
  exportString: string;
  talents: TalentPill[];
  /** Keys of optional spec nodes selected in this build (the 4 variable nodes) */
  enabledSpecKeys: string[];
}
interface CustomLoadout {
  name: string;
  heroKey: 'sentinel' | 'packLeader';
  simMode: 'single' | 'cleave' | 'multi';
  enabledTalents: string[];     // keys of toggled-on optional spec talents (from TalentNode.key)
  enabledHeroTalents: string[]; // keys of toggled-on hero sub-talents
  enabledClassTalents: string[]; // keys of toggled-on class tree talents
}

// Spec tree optional budget: 4 variable nodes across the 4 WoWHead builds.
// Hero tree: 10 nodes, each 1pt (all 10 are always taken).
const MAX_OPTIONAL_POINTS = 4;
const MAX_HERO_POINTS = 10;

const CORE_TALENTS: TalentPill[] = [
  { name: 'Mongoose Fury',      type: 'core', points: 2, desc: 'Raptor Strike stacking damage buff, up to 5×. Always talented — backbone of the entire rotation. Each consecutive RS extends the buff duration.' },
  { name: 'Strike as One',      type: 'core', points: 1, desc: 'All your damaging abilities trigger a coordinated pet attack. Core pet-scaling node — affects Kill Command, Claw, and all beast procs.' },
  { name: 'Wildfire Bomb',      type: 'core', points: 2, desc: 'No-focus bomb nuke that ignites the area. Highest single-cast ability value. Enables Lethal Calibration on detonation and benefits from all fire amplifiers.' },
  { name: 'Takedown',           type: 'core', points: 1, desc: '+20% damage amplifier for 8s. 90s base CD (reduced by Savagery to 60s). Replaces Coordinated Assault. Line up RS stacks + cooldowns inside this window.' },
  { name: 'Boomstick',          type: 'core', points: 1, desc: 'Frontal cone attack with Shellshock (+40% Boomstick ST damage). 60s CD. Replaces Focus Fire. Triggers Mongoose Rounds and reduces WFB CD via Wildfire Shells.' },
  { name: 'Raptor Swipe',       type: 'core', points: 2, desc: 'Apex 2-point talent. Raptor Strike has a 25% proc chance to strike again for free. During Takedown the proc rate becomes 100% — massive burst synergy.' },
  { name: 'Lethal Calibration', type: 'core', points: 1, desc: 'Wildfire Bomb detonation applies a +15% critical damage buff for 12s. Multiplicative with Vulnerability. Keep WFB on CD to maintain near-100% uptime.' },
];

const ST_TALENTS: TalentPill[] = [
  { name: 'Savagery',              type: 'st', points: 1, desc: 'Reduces Takedown cooldown by 30s (90s → 60s). In a 5-minute fight this adds ~2 extra Takedown windows — one of the highest ST value optional talents.' },
  { name: 'Vulnerability',         type: 'st', points: 1, desc: 'Raptor Strike and Boomstick deal +20% critical strike damage. Stacks multiplicatively with Lethal Calibration and Stargazer. Core of the Sentinel crit-amp build.' },
  { name: 'Mongoose Rounds',       type: 'st', points: 1, desc: 'Each Boomstick hit grants 1 Mongoose Fury stack immediately. Burst-window: fire Boomstick first → hit max MF stacks instantly, then Takedown for maximum overlap.' },
  { name: "Can't Miss Won't Miss", type: 'st', points: 1, desc: 'Raptor Strike deals +10% damage; Takedown duration extended by 2s (8s → 10s). More RS hits land inside the amp window, compounding with Mongoose Fury stacks.' },
  { name: 'Stargazer',             type: 'st', points: 2, desc: '2-point talent. RS grants +2% critical damage for 10s, stacking up to ×10 (+20% total). Sentinel synergy: Stargazer stacks multiply with Lethal Calibration + Vulnerability for massive crit damage.' },
];

const AOE_TALENTS: TalentPill[] = [
  { name: 'Flamefang Pitch',    type: 'aoe', points: 1, desc: '30s CD ground AoE that leaves a fire puddle. Highest AoE damage per cast. Positions matter — drop on clustered enemies. Synergises with Flamebreak and Wildfire Imbuement.' },
  { name: 'Grenade Juggler',    type: 'aoe', points: 1, desc: 'Flamefang Pitch gains 1 additional charge. Effectively doubles Flamefang usage: you can pool 2 charges and dump both during a burn window on large pulls.' },
  { name: 'Wildfire Shells',    type: 'aoe', points: 1, desc: 'Each Boomstick hit reduces Wildfire Bomb cooldown by 4s. In a 5+ target scenario Boomstick hits all enemies: WFB cooldown effectively reduces to ~18s per use.' },
  { name: 'Shrapnel Bomb',      type: 'aoe', points: 1, desc: 'Wildfire Bomb\'s periodic damage becomes a physical bleed — bypasses armor reduction on beasts/constructs. Adds ~8% total AoE DPS on armored target types.' },
  { name: 'Flamebreak',         type: 'aoe', points: 1, desc: 'All Fire damage you deal is increased by 15%. Amplifies Wildfire Bomb, Flamefang Pitch, and all fire DoTs. Stacks with Wildfire Imbuement\'s fire conversion on Raptor Strike.' },
  { name: 'Wildfire Imbuement', type: 'aoe', points: 1, desc: 'Flamefang Pitch imbues your weapon with fire. Raptor Strike gains a fire damage component that scales with Flamebreak (+15%). Converts a core ST filler into an AoE contributor.' },
  { name: 'Two Against Many',   type: 'aoe', points: 2, desc: '2-point talent. Strike as One hits 2 additional enemies beyond the primary target. Scales all pet-proc damage (Claw, beast rushes, Pack Leader beasts) across the entire pack — top AoE node.' },
];

const HYBRID_TALENTS: TalentPill[] = [
  { name: 'Vulnerability',         type: 'hybrid', points: 1, desc: 'Kept for ST damage on priority target. RS/Boomstick +20% crit — still strong even in cleave.' },
  { name: "Can't Miss Won't Miss", type: 'hybrid', points: 1, desc: 'RS boost helps maintain priority-target pressure in multi-target situations.' },
  { name: 'Flamefang Pitch',       type: 'hybrid', points: 1, desc: 'Core AoE cooldown. Even 2-target cleave benefits significantly from the ground AoE.' },
  { name: 'Wildfire Shells',       type: 'hybrid', points: 1, desc: 'Boomstick-to-WFB reduction works on any target — valuable at 2+ targets.' },
  { name: 'Flamebreak',            type: 'hybrid', points: 1, desc: '+15% Fire damage amplifies WFB and Flamefang on all targets.' },
];

const SENTINEL_HERO: TalentPill[] = [
  { name: 'Moonlight Chakram', type: 'hero', points: 1, desc: 'Sentinel\'s Mark procs now release a bouncing shadow chakram that ricochets between up to 5 enemies. Sentinel\'s top AoE damage source. At 5+ targets this overwhelms Pack Leader in sustained AoE.' },
  { name: 'Lunar Storm',       type: 'hero', points: 1, desc: 'When Sentinel\'s Mark is consumed, it triggers a Lunar Storm that strikes all nearby enemies. Scales massively in packs — each consumption is a mini AoE burst. Key reason Sentinel is competitive on M+.' },
  { name: "Moon's Blessing",   type: 'hero', points: 1, desc: 'Increases Sentinel\'s Mark proc chance by +10% (20% → 30%). More Lunar Storm procs per minute in sustained fights. Synergises with any ability that generates procs (RS, pet attacks).' },
];

const PACK_LEADER_HERO: TalentPill[] = [
  { name: 'Lethal Barbs',   type: 'hero', points: 1, desc: 'Your auto-attacks generate 2 bonus Focus each. Enables significantly more Kill Command casts → more beast proc opportunities per minute. Strong in all scenarios.' },
  { name: 'Dire Summons',   type: 'hero', points: 1, desc: 'Reduces beast companion spawn cooldown. More frequent Howl of the Pack Leader procs. Stacks with Lethal Barbs\' extra Kill Commands for maximum beast uptime.' },
  { name: 'Stampede',       type: 'hero', points: 1, desc: 'Capstone node. Takedown now triggers a full beast stampede — maximum beast damage overlap during your burst window. The primary reason Pack Leader leads ST DPS at Mythic track gear.' },
];

export const TALENT_LOADOUTS: TalentLoadout[] = [
  // ── Sentinel ──────────────────────────────────────────────
  {
    id: 'sentinel-st', heroKey: 'sentinel', simMode: 'single',
    name: 'Raid Single Target', scenario: 'Boss Progress / ST Patchwerk', icon: '🎯',
    stDelta: 0.07, aoeDelta: 0.03,
    exportString: 'C8PAAAAAAAAAAAAAAAAAAAAAAMWgBmxoxyAYmgNjZmxMPwy8AAAAAAAMzMzMDzYMjBGTGAAAAwAAYZbmZWMzMzMzYAgZYjZxYMjNG',
    talents: [...CORE_TALENTS, ...ST_TALENTS, ...SENTINEL_HERO],
    // WoWHead Raid Sentinel: Flanker's Advantage only (no Lethal Calibration, no Two Against Many)
    enabledSpecKeys: ['flankerAdvantage'],
  },
  {
    id: 'sentinel-aoe', heroKey: 'sentinel', simMode: 'multi',
    name: 'Mythic+ AoE', scenario: 'M+ Packs / 4+ Targets', icon: '💥',
    stDelta: 0.02, aoeDelta: 0.12,
    exportString: 'C8PAAAAAAAAAAAAAAAAAAAAAAMWgBmxoxyAYmgNzMzMmxyAAAAAAgZmZmZYGjZMwYyAAAAAGAALbzMziZmZmZGDAMDbMLGjZmNG',
    talents: [...CORE_TALENTS, ...AOE_TALENTS, ...SENTINEL_HERO],
    // WoWHead Mythic+ Sentinel: Flanker's Advantage + Two Against Many + Lethal Calibration
    enabledSpecKeys: ['flankerAdvantage', 'twoAgainstMany', 'lethalCalibration'],
  },
  {
    id: 'sentinel-cleave', heroKey: 'sentinel', simMode: 'cleave',
    name: 'Cleave / Hybrid', scenario: 'Raid with Priority Adds / 2–3 Targets', icon: '⚔',
    stDelta: 0.05, aoeDelta: 0.07,
    exportString: 'C8PAAAAAAAAAAAAAAAAAAAAAAMWgBmxoxyAYmgNjZmxMPwy8AAAAAAAMzMzMDzYMjBGTGAAAAwAAYZbmZWMzMzMzYAgZYjZxYMjNG',
    talents: [...CORE_TALENTS, ...HYBRID_TALENTS, ...SENTINEL_HERO],
    // Cleave hybrid: Flanker's Advantage + Lethal Calibration
    enabledSpecKeys: ['flankerAdvantage', 'lethalCalibration'],
  },
  // ── Pack Leader ───────────────────────────────────────────
  {
    id: 'packLeader-st', heroKey: 'packLeader', simMode: 'single',
    name: 'Raid Single Target', scenario: 'Boss Progress / ST Patchwerk', icon: '🎯',
    stDelta: 0.05, aoeDelta: 0.02,
    exportString: 'C8PAAAAAAAAAAAAAAAAAAAAAAMgxMGWILwMM0gFjZmZmxyAAAAAAgZmZmZYGjZMwYyAAAAAGAwYZbmZWMzMzMzYAMzGgZxYMjNG',
    talents: [...CORE_TALENTS, ...ST_TALENTS, ...PACK_LEADER_HERO],
    // WoWHead Raid Pack Leader: Bloodseeker + Two Against Many + Lethal Calibration (no Flanker's Advantage)
    enabledSpecKeys: ['bloodseeker', 'twoAgainstMany', 'lethalCalibration'],
  },
  {
    id: 'packLeader-aoe', heroKey: 'packLeader', simMode: 'multi',
    name: 'Mythic+ AoE', scenario: 'M+ Packs / 4+ Targets', icon: '💥',
    stDelta: 0.01, aoeDelta: 0.07,
    exportString: 'C8PAAAAAAAAAAAAAAAAAAAAAAMgxMG2ILwMM0gFzMzMz4BWGAAAAAAMzMzMDzYMjBGTGAAAAwAAYZZmZ2MzMjZGDgZ2AgxYmZhB',
    talents: [...CORE_TALENTS, ...AOE_TALENTS, ...PACK_LEADER_HERO],
    // WoWHead Mythic+ Pack Leader: Flanker's Advantage + Two Against Many + Lethal Calibration
    enabledSpecKeys: ['flankerAdvantage', 'twoAgainstMany', 'lethalCalibration'],
  },
  {
    id: 'packLeader-cleave', heroKey: 'packLeader', simMode: 'cleave',
    name: 'Cleave / Hybrid', scenario: 'Raid with Priority Adds / 2–3 Targets', icon: '⚔',
    stDelta: 0.04, aoeDelta: 0.05,
    exportString: 'C8PAAAAAAAAAAAAAAAAAAAAAAMgxMGWILwMM0gFjZmZmxyAAAAAAgZmZmZYGjZMwYyAAAAAGAwYZbmZWMzMzMzYAMzGgZxYMjNG',
    talents: [...CORE_TALENTS, ...HYBRID_TALENTS, ...PACK_LEADER_HERO],
    // Cleave hybrid: Two Against Many + Lethal Calibration
    enabledSpecKeys: ['twoAgainstMany', 'lethalCalibration'],
  },
];

// ============================================================
// V8 COLOUR SYSTEM — Off-White Page + Charcoal Navy Cards
// ============================================================
const C = {
  pageBg:    "#d4dae2",
  surface:   "#1c2333",
  surface2:  "#242d3f",
  surface3:  "#2c3750",
  border:    "#2e3a50",
  borderSub: "#1a2236",
  textPri:   "#f1f5f9",
  textSec:   "#cbd5e1",
  textMid:   "#c8d1de",
  textDim:   "#9aa8bc",
  gold:      "#d97706",
  goldLight: "#fbbf24",
  goldBg:    "#2a1f08",
  sentBg:    "#0c1e35",
  sentBdr:   "#1a3a5c",
  sentClr:   "#38bdf8",
  packBg:    "#1a0e2e",
  packBdr:   "#3b1a5c",
  packClr:   "#c084fc",
  green:     "#4ade80",
  greenBg:   "#0f2a1a",
  greenBdr:  "rgba(74,222,128,.3)",
  red:       "#f87171",
};

const BAR_COLORS = {
  "Kill Command":"#60a5fa","Wildfire Bomb":"#f59e0b",
  "Boomstick":"#fb923c","Raptor Swipe":"#34d399","Flamefang Pitch":"#22d3ee",
  "Raptor Strike":"#ef4444","Strike as One":"#22c55e","Hatchet Toss":"#a78bfa",
  "Takedown":"#93c5fd","Takedown (CD)":"#93c5fd",
  "Sentinel Mark + Lunar Storm":"#38bdf8","Moonlight Chakram":"#818cf8",
  "Pack Leader Beasts":"#a78bfa","Auto Attack (MH)":"#94a3b8","Auto Attack (OH)":"#64748b",
  "Pet (Claw)":"#a3e635","Pet Melee":"#86efac","Bear (Rend + Melee)":"#fb923c",
  "Kroluk's Warbanner":"#fbbf24",
};
const bClr = k => BAR_COLORS[k] || "#64748b";
const fmt = n => n >= 1000000 ? `${(n / 1000000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
const dL = d => `${Math.floor(d / 60)}:${String(d % 60).padStart(2, "0")}`;

// Realm data
const REALM_DATA: Record<string, string[]> = {
  us: ["Aegwynn","Aerie Peak","Agamaggan","Aggramar","Akama","Alexstrasza","Alleria","Altar of Storms","Alterac Mountains","Aman'Thul","Andorhal","Anetheron","Antonidas","Anub'arak","Anvilmar","Arathor","Archimonde","Area 52","Argent Dawn","Arthas","Arygos","Auchindoun","Azgalor","Azjol-Nerub","Azralon","Azshara","Azuremyst","Baelgun","Balnazzar","Barthilas","Black Dragonflight","Blackhand","Blackrock","Blackwater Raiders","Blackwing Lair","Blade's Edge","Bladefist","Bleeding Hollow","Blood Furnace","Bloodhoof","Bloodscalp","Bonechewer","Borean Tundra","Boulderfist","Bronzebeard","Burning Blade","Burning Legion","Caelestrasz","Cairne","Cenarion Circle","Cenarius","Cho'gall","Chromaggus","Coilfang","Crushridge","Daggerspine","Dalaran","Dalvengyr","Dark Iron","Darkspear","Darrowmere","Dath'Remar","Dawnbringer","Deathwing","Demon Soul","Dentarg","Destromath","Dethecus","Detheroc","Doomhammer","Draenor","Dragonblight","Dragonmaw","Drak'Tharon","Drak'thul","Draka","Drakkari","Dreadmaul","Drenden","Dunemaul","Durotan","Duskwood","Earthen Ring","Echo Isles","Eitrigg","Eldre'Thalas","Elune","Emerald Dream","Eonar","Eredar","Executus","Exodar","Farstriders","Feathermoon","Fenris","Firetree","Fizzcrank","Frostmane","Frostmourne","Frostwolf","Galakrond","Gallywix","Garithos","Garona","Garrosh","Ghostlands","Gilneas","Gnomeregan","Goldrinn","Gorefiend","Gorgonnash","Greymane","Grizzly Hills","Gul'dan","Gundrak","Gurubashi","Hakkar","Haomarush","Hellscream","Hydraxis","Hyjal","Icecrown","Illidan","Jaedenar","Jubei'Thos","Kael'thas","Kalecgos","Kargath","Kel'Thuzad","Khadgar","Khaz Modan","Khaz'goroth","Kil'jaeden","Kilrogg","Kirin Tor","Korgath","Korialstrasz","Kul Tiras","Laughing Skull","Lethon","Lightbringer","Lightning's Blade","Lightninghoof","Llane","Lothar","Madoran","Maelstrom","Magtheridon","Maiev","Mal'Ganis","Malfurion","Malorne","Malygos","Mannoroth","Medivh","Misha","Mok'Nathal","Moon Guard","Moonrunner","Mug'thol","Muradin","Nagrand","Nathrezim","Nazgrel","Nazjatar","Nemesis","Ner'zhul","Nesingwary","Nordrassil","Norgannon","Onyxia","Perenolde","Proudmoore","Quel'dorei","Quel'Thalas","Ragnaros","Ravencrest","Ravenholdt","Rexxar","Rivendare","Runetotem","Sargeras","Saurfang","Scarlet Crusade","Scilla","Sen'jin","Sentinels","Shadow Council","Shadowmoon","Shadowsong","Shandris","Shattered Halls","Shattered Hand","Shu'halo","Silver Hand","Silvermoon","Sisters of Elune","Skullcrusher","Skywall","Smolderthorn","Spinebreaker","Spirestone","Staghelm","Steamwheedle Cartel","Stonemaul","Stormrage","Stormreaver","Stormscale","Suramar","Tanaris","Terenas","Terokkar","Thaurissan","The Forgotten Coast","The Scryers","The Underbog","The Venture Co","Thorium Brotherhood","Thrall","Thunderhorn","Thunderlord","Tichondrius","Tol Barad","Tortheldrin","Trollbane","Turalyon","Twisting Nether","Uldaman","Uldum","Undermine","Ursin","Uther","Vashj","Vek'nilash","Velen","Warsong","Whisperwind","Wildhammer","Windrunner","Winterhoof","Wyrmrest Accord","Ysera","Ysondre","Zangarmarsh","Zul'jin","Zuluhed"],
  eu: ["Aegwynn","Aerie Peak","Agamaggan","Aggra","Aggramar","Ahn'Qiraj","Al'Akir","Alexstrasza","Alleria","Alonsus","Aman'Thul","Ambossar","Anachronos","Anetheron","Antonidas","Anub'arak","Arak-arahm","Arathi","Archimonde","Area 52","Argent Dawn","Arthas","Arygos","Aszune","Auchindoun","Azjol-Nerub","Azshara","Azuremyst","Baelgun","Balnazzar","Blackhand","Blackmoore","Blackrock","Blackscar","Blade's Edge","Bladefist","Bloodfeather","Bloodhoof","Bloodscalp","Blutkessel","Boulderfist","Bronze Dragonflight","Bronzebeard","Burning Blade","Burning Legion","Burning Steppes","C'Thun","Chamber of Aspects","Cho'gall","Chromaggus","Crushridge","Daggerspine","Dalaran","Dalvengyr","Darkmoon Faire","Darksorrow","Darkspear","Deathguard","Deathwing","Defias Brotherhood","Dentarg","Destromath","Dethecus","Doomhammer","Draenor","Dragonblight","Dragonmaw","Drak'thul","Dunemaul","Durotan","Earthen Ring","Eitrigg","Eldre'Thalas","Elune","Emerald Dream","Eonar","Eredar","Executus","Exodar","Frostmane","Frostmourne","Frostwolf","Garona","Garrosh","Ghostlands","Gilneas","Gorgonnash","Greymane","Grim Batol","Gul'dan","Hakkar","Haomarush","Hellfire","Hellscream","Hyjal","Illidan","Kael'thas","Kel'Thuzad","Khadgar","Khaz Modan","Kilrogg","Kirin Tor","Laughing Skull","Lightbringer","Lordaeron","Lothar","Magtheridon","Mal'Ganis","Malfurion","Mannoroth","Medivh","Moon Guard","Muradin","Nagrand","Nathrezim","Nazjatar","Ner'zhul","Nordrassil","Norgannon","Onyxia","Outland","Perenolde","Proudmoore","Quel'Thalas","Ragnaros","Ravencrest","Ravenholdt","Rexxar","Runetotem","Sargeras","Sen'jin","Shadowsong","Shattered Halls","Shattered Hand","Silvermoon","Spinebreaker","Stormrage","Stormreaver","Stormscale","Sunstrider","Suramar","Sylvanas","Tarren Mill","Terenas","Terokkar","The Maelstrom","The Sha'tar","The Venture Co","Thrall","Thunderhorn","Tichondrius","Tirion","Trollbane","Turalyon","Twilight's Hammer","Twisting Nether","Uldaman","Vashj","Vek'nilash","Wildhammer","Windrunner","Xavius","Ysera","Ysondre","Zenedar","Zuluhed"],
  kr: ["Aegwynn","Alexstrasza","Azshara","Burning Legion","Cenarius","Dalaran","Deathwing","Durotan","Garona","Gul'dan","Hellscream","Hyjal","Malfurion","Norgannon","Rexxar","Stormrage","Wildhammer","Windrunner","Zul'jin"],
  tw: ["Arthas","Bleeding Hollow","Chillwind Point","Crystalpine Stinger","Demon Fall Canyon","Dragonmaw","Frostmane","Hellscream","Icecrown","Light's Hope","Nightsong","Onyxia","Order of the Cloud Serpent","Quel'dorei","Shadowmoon","Silverwing Hold","Skywall","Spirestone","Stormscale","Sundown Marsh","Whisperwind","World Tree","Wrathbringer","Zealot Blade"],
};

const SAMPLE_SIMC = `hunter="blezaa"
level=90
race=tauren
region=us
server=turalyon
spec=survival
talents=C8PAo4YcvOcqUdzB9zV+NhSAcMgxMG2ILwMM0gFzMzMzwyAAAAAAgZMjZYGjZMDGTzAAAAAGAALLzMziZmZmZGzMgZ2AgxYmZhB
agility=1477
attack_power=1551
haste_rating=1700
crit_rating=3230
mastery_rating=4250
versatility_rating=1025
# Vortex Visage (240)
head=,id=221080,item_level=240
# Farstrider's Pendant (220)
neck=,id=221088,item_level=220
# Rootspeaker's Canopy (230)
shoulders=,id=221074,item_level=230
# Preyseeker's Rugged Stole (233)
back=,id=221085,item_level=233
# Manipulator's Vest (227)
chest=,id=221092,item_level=227
# Elder Mossbands (227)
wrist=,id=221094,item_level=227
# Grips of Forgotten Honor (224)
hands=,id=221073,item_level=224
# Scout's Polished Wrap (207)
waist=,id=221096,item_level=207
# Rootspeaker's Leggings (230)
legs=,id=221075,item_level=230,enchant_id=7594
# Forgotten Tribe Footguards (240)
feet=,id=221090,item_level=240
# Preyseeker's Signet (237)
finger1=,id=221082,item_level=237,enchant_id=7334
# Circlet of Encroaching Shadow (220)
finger2=,id=221095,item_level=220,enchant_id=7334
# Kroluk's Warbanner (240)
trinket1=,id=219315,item_level=240
# Darkmoon Deck: Hunt (220)
trinket2=,id=198478,item_level=220
# Farstrider's Mercy (259)
main_hand=,id=221083,item_level=259,enchant_id=7460
# Bladesorrow (243)
off_hand=,id=221086,item_level=243,enchant_id=7470`;

const FIGHT_STYLES = {
  patchwerk: { label: '🎯 Patchwerk', desc: 'Pure single-target', mult: 1.0 },
  hecticAddCleave: { label: '⚔ Hectic Adds', desc: 'Primary + sporadic adds', mult: 1.08 },
  lightMovement: { label: '🏃 Light Movement', desc: 'Occasional repositioning', mult: 0.96 },
  heavyMovement: { label: '🌀 Heavy Movement', desc: 'Constant movement', mult: 0.88 },
};

const RAID_BUFFS = {
  battleShout: { label: 'Battle Shout', icon: '⚔', stat: '+5% AP', mult: 1.05 },
  markOfTheWild: { label: 'Mark of the Wild', icon: '🍃', stat: '+3% Vers', mult: 1.025 },
  mysticTouch: { label: 'Mystic Touch', icon: '👊', stat: '+5% Phys dmg taken', mult: 1.04 },
  huntersMark: { label: "Hunter's Mark", icon: '🏹', stat: '+5% dmg', mult: 1.035 },
};

const CONSUMABLES = {
  flask: { label: 'Flask', options: [{ key: 'none', label: 'None', mult: 1.0 },{ key: 'flaskOfAlchemicalChaos', label: 'Alchemical Chaos', mult: 1.035 },{ key: 'flaskOfTemperingSanity', label: 'Tempering Sanity', mult: 1.03 }] },
  food: { label: 'Food', options: [{ key: 'none', label: 'None', mult: 1.0 },{ key: 'mastery', label: 'Mastery (+90)', mult: 1.025 },{ key: 'crit', label: 'Crit (+90)', mult: 1.02 },{ key: 'haste', label: 'Haste (+90)', mult: 1.018 }] },
  potion: { label: 'Potion', options: [{ key: 'none', label: 'None', mult: 1.0 },{ key: 'tempered', label: 'Tempered Potion', mult: 1.02 },{ key: 'frontLoaded', label: 'Unwavering Focus', mult: 1.025 }] },
};

// (TalentTreeGrid and its constants removed — replaced by BlizzardTalentTree component)

// Cascade-deselect: when removing key, also remove any nodes that depended on it
function cascadeRemove(keyToRemove: string, currentSelected: string[]): string[] {
  const toRemove = new Set([keyToRemove]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of SURVIVAL_SPEC_TREE) {
      if (toRemove.has(node.key) || !currentSelected.includes(node.key)) continue;
      if (node.prerequisites.some(p => toRemove.has(p))) {
        toRemove.add(node.key);
        changed = true;
      }
    }
  }
  return currentSelected.filter(k => !toRemove.has(k));
}

// TalentTreeGrid removed — see BlizzardTalentTree component

// ============================================================
// MINI TALENT TREE — compact dot-tree for loadout card previews
// Pure SVG circles + lines, no text labels, tooltip on hover.
// ============================================================
const MINI_CW = 20;  // px per column (7 cols × 20 = 140)
const MINI_CH = 14;  // px per row (11 rows × 14 = 154)
const MINI_R  = 4;   // dot radius
const MINI_PAD = 6;
const MINI_W = MINI_PAD * 2 + 7 * MINI_CW; // 152px spec tree
const MINI_H = MINI_PAD * 2 + 11 * MINI_CH; // 166px

// Hero tree grid: 4 rows × 4 cols below the spec tree
const MINI_CW_HERO = (MINI_W - 2 * MINI_PAD) / 4; // ~35px per hero col
const MINI_CH_HERO = MINI_CH; // same row height

function miniCX(col: number) { return MINI_PAD + col * MINI_CW + MINI_CW / 2; }
function miniCY(row: number) { return MINI_PAD + (row - 1) * MINI_CH + MINI_CH / 2; }
function heroCX(col: number) { return MINI_PAD + col * MINI_CW_HERO + MINI_CW_HERO / 2; }
function heroCY(row: number) { return MINI_H + 8 + (row - 1) * MINI_CH_HERO + MINI_CH_HERO / 2; }

interface MiniTalentTreeProps {
  selectedKeys: string[];
  heroKey: 'sentinel' | 'packLeader';
  heroSelectedKeys: string[];
  onDot: (node: TalentNode, e: React.MouseEvent) => void;
  offDot: () => void;
}

// Convert a preset TalentLoadout to selectedKeys for MiniTalentTree
function loadoutToSpecKeys(loadout: TalentLoadout): string[] {
  return loadout.enabledSpecKeys;
}
function loadoutToHeroNodeKeys(heroKey: 'sentinel' | 'packLeader'): string[] {
  // All 10 hero nodes are always taken in every WoWHead build
  return HERO_TALENT_TREES[heroKey].map(n => n.key);
}

function talentPillDesc(label: string): string {
  const all = [...CORE_TALENTS, ...ST_TALENTS, ...AOE_TALENTS, ...SENTINEL_HERO, ...PACK_LEADER_HERO];
  return all.find(t => t.name === label)?.desc || label;
}
function nodeToPill(node: TalentNode): TalentPill {
  return {
    name: node.label,
    type: (node.dpsCategory === 'gateway' ? 'aoe' : node.dpsCategory) as TalentPill['type'],
    points: node.pointCost,
    desc: talentPillDesc(node.label),
  };
}

function MiniTalentTree({ selectedKeys, heroKey, heroSelectedKeys, onDot, offDot }: MiniTalentTreeProps) {
  const heroTree = HERO_TALENT_TREES[heroKey];
  const heroClr  = heroKey === 'sentinel' ? '#818cf8' : '#fb923c';
  // Hero tree occupies up to 4 rows below spec tree
  const heroRows = Math.max(...heroTree.map(n => n.row));
  const totalH   = MINI_H + 8 + heroRows * MINI_CH_HERO + 4;

  return (
    <svg width={MINI_W} height={totalH} style={{ display: 'block', overflow: 'visible' }}>
      {/* Spec tree connection lines */}
      {SURVIVAL_SPEC_TREE.flatMap(node =>
        node.prerequisites.map(prereqKey => {
          const pn = SURVIVAL_SPEC_TREE.find(n => n.key === prereqKey);
          if (!pn) return null;
          const prereqOn = pn.dpsCategory === 'core' || selectedKeys.includes(prereqKey);
          const nodeOn   = node.dpsCategory === 'core' || selectedKeys.includes(node.key);
          return (
            <line key={`${prereqKey}→${node.key}`}
              x1={miniCX(pn.col)} y1={miniCY(pn.row)}
              x2={miniCX(node.col)} y2={miniCY(node.row)}
              stroke={prereqOn && nodeOn ? '#fbbf2455' : '#1a2535'}
              strokeWidth={prereqOn && nodeOn ? 1.5 : 1}
            />
          );
        })
      )}

      {/* Spec tree dots */}
      {SURVIVAL_SPEC_TREE.map(node => {
        const isCore = node.dpsCategory === 'core';
        const isOn   = isCore || selectedKeys.includes(node.key);
        const fill   = isOn
          ? (isCore ? '#60a5fa'
           : node.dpsCategory === 'st'  ? '#4ade80'
           : node.dpsCategory === 'aoe' ? '#f97316'
           : '#c084fc')
          : '#0d1520';
        const stroke = isOn ? (isCore ? '#60a5fa66' : fill + '88') : '#1e2d3d';
        const r = node.pointCost >= 2 ? MINI_R + 1.5 : node.pointCost >= 4 ? MINI_R + 3 : MINI_R;
        return (
          <circle key={node.key}
            cx={miniCX(node.col)} cy={miniCY(node.row)} r={r}
            fill={fill} stroke={stroke} strokeWidth={isOn ? 0 : 1}
            style={{ cursor: 'help', transition: 'fill .1s' }}
            onMouseEnter={e => onDot(node, e)}
            onMouseLeave={offDot}
          />
        );
      })}

      {/* Hero talent tree — 4-row × 4-col grid below spec tree */}
      {heroTree.map(hn => {
        const isOn = heroSelectedKeys.includes(hn.key);
        const cx   = heroCX(hn.col);
        const cy   = heroCY(hn.row);
        return (
          <circle key={hn.key}
            cx={cx} cy={cy} r={MINI_R + 0.5}
            fill={isOn ? heroClr : '#0d1520'}
            stroke={isOn ? heroClr + '88' : '#1e2d3d'} strokeWidth={isOn ? 0 : 1}
            style={{ cursor: 'help' }}
            onMouseEnter={e => onDot({
              key: hn.key as any, label: hn.label, row: hn.row, col: hn.col,
              pointCost: 1, prerequisites: [], gateRow: 0,
              isGateway: false, inSTBuild: true, inAoEBuild: true,
              dpsCategory: 'core' as any,
              gatewayNote: hn.desc,
            }, e)}
            onMouseLeave={offDot}
          />
        );
      })}
    </svg>
  );
}

// ============================================================
// MAIN COMPONENT — V8 Off-White + Charcoal Navy Design
// ============================================================
export default function SurvivalHunterSim() {
  const [simcInput, setSimcInput] = useState('');
  const [parsedChar, setParsedChar] = useState(null);
  const [parseError, setParseError] = useState('');
  const [heroTalent, setHeroTalent] = useState('sentinel');
  const [selectedLoadoutId, setSelectedLoadoutId] = useState('sentinel-st');
  const [fightDuration, setFightDuration] = useState(300);
  const [simResults, setSimResults] = useState(null);
  const [statWeights, setStatWeights] = useState(null);
  const [optimalTalents, setOptimalTalents] = useState(null);
  const [isSimming, setIsSimming] = useState(false);
  const [activeTab, setActiveTab] = useState('sim');
  const [simMode, setSimMode] = useState('single');
  const [fightStyle, setFightStyle] = useState('patchwerk');
  const [raidBuffs, setRaidBuffs] = useState<Record<string, boolean>>({ battleShout: true, markOfTheWild: true, mysticTouch: true, huntersMark: true });
  const [consumables, setConsumables] = useState<Record<string, string>>({ flask: 'flaskOfAlchemicalChaos', food: 'mastery', potion: 'tempered' });
  const [showAdv, setShowAdv] = useState(true);
  const [copied, setCopied] = useState('');
  const [copiedLoadoutId, setCopiedLoadoutId] = useState<string|null>(null);
  // Custom talent loadout slots
  const [customSlots, setCustomSlots] = useState<(CustomLoadout | null)[]>([null, null]);
  const [editingSlot, setEditingSlot] = useState<0 | 1 | null>(null);
  const [editDraft, setEditDraft] = useState<CustomLoadout | null>(null);
  // Modal talent tree scaling
  const modalTreeContainerRef = useRef<HTMLDivElement>(null);
  const modalTreeInnerRef = useRef<HTMLDivElement>(null);
  const [modalTreeScale, setModalTreeScale] = useState(1);
  // Armory
  const [armoryRealm, setArmoryRealm] = useState('');
  const [armoryRealmSearch, setArmoryRealmSearch] = useState('');
  const [inputTab, setInputTab] = useState<'armory' | 'simc'>('armory');
  const [showRealmDropdown, setShowRealmDropdown] = useState(false);
  const [realmHighlightIdx, setRealmHighlightIdx] = useState(-1);
  const [armoryName, setArmoryName] = useState('');
  const [armoryRegion, setArmoryRegion] = useState('us');
  const [armoryLoading, setArmoryLoading] = useState(false);
  const [armoryError, setArmoryError] = useState('');
  const [armoryAvatar, setArmoryAvatar] = useState('');
  const [itemEnrichLoading, setItemEnrichLoading] = useState(false);

  // Talent pill tooltip
  const [hoveredTalent, setHoveredTalent] = useState<TalentPill | null>(null);
  const [talentTooltipPos, setTalentTooltipPos] = useState({ x: 0, y: 0 });
  const talentHideTimer = useRef<number | null>(null);

  const realmDropdownRef = useRef<HTMLDivElement | null>(null);
  const realmInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (realmDropdownRef.current && !realmDropdownRef.current.contains(e.target as Node)) {
        setShowRealmDropdown(false);
        setRealmHighlightIdx(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Modal tree auto-scale effect
  useEffect(() => {
    if (editingSlot === null) { setModalTreeScale(1); return; }
    const container = modalTreeContainerRef.current;
    const inner = modalTreeInnerRef.current;
    if (!container || !inner) return;

    const measure = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const iw = inner.scrollWidth;
      const ih = inner.scrollHeight;
      if (iw > 0 && ih > 0) {
        setModalTreeScale(Math.max(0.35, Math.min(cw / iw, ch / ih, 1)));
      }
    };
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    requestAnimationFrame(measure);
    return () => ro.disconnect();
  }, [editingSlot, editDraft?.heroKey]);

  const handleTalentHover = useCallback((talent: TalentPill, e: React.MouseEvent) => {
    if (talentHideTimer.current) { window.clearTimeout(talentHideTimer.current); talentHideTimer.current = null; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(rect.right + 10, window.innerWidth - 310);
    const y = Math.max(8, Math.min(rect.top, window.innerHeight - 260));
    setTalentTooltipPos({ x, y });
    setHoveredTalent(talent);
  }, []);

  const handleTalentLeave = useCallback(() => {
    talentHideTimer.current = window.setTimeout(() => setHoveredTalent(null), 160);
  }, []);

  const normalizeRealmSlug = useCallback((name: string) => {
    return name.trim().toLowerCase().replace(/[' ]/g, "-");
  }, []);

  const realmSuggestions = useMemo(() => {
    const realms = REALM_DATA[armoryRegion] || [];
    const q = armoryRealmSearch.trim().toLowerCase();
    if (!q) return realms.slice(0, 8);
    return realms.filter((r) => r.toLowerCase().includes(q)).slice(0, 8);
  }, [armoryRegion, armoryRealmSearch]);

  const resolvedRealmSlug = useMemo(() => {
    const qRaw = armoryRealmSearch.trim();
    if (!qRaw) return "";

    const realms = REALM_DATA[armoryRegion] || [];

    // Exact match by display name
    const exactByName = realms.find((r) => r.toLowerCase() === qRaw.toLowerCase());
    if (exactByName) return normalizeRealmSlug(exactByName);

    // Exact match by slug (lets users paste a realm slug too)
    const qSlug = normalizeRealmSlug(qRaw);
    const exactBySlug = realms.find((r) => normalizeRealmSlug(r) === qSlug);
    return exactBySlug ? normalizeRealmSlug(exactBySlug) : "";
  }, [armoryRegion, armoryRealmSearch, normalizeRealmSlug]);

  // Keep armoryRealm in sync once the user fully types a valid realm name/slug (debounced)
  useEffect(() => {
    const t = window.setTimeout(() => {
      const hasText = armoryRealmSearch.trim().length > 0;

      if (!hasText) {
        if (armoryRealm) setArmoryRealm("");
        return;
      }

      if (resolvedRealmSlug) {
        if (armoryRealm !== resolvedRealmSlug) setArmoryRealm(resolvedRealmSlug);
      } else {
        if (armoryRealm) setArmoryRealm("");
      }
    }, 150);

    return () => window.clearTimeout(t);
  }, [armoryRealmSearch, armoryRegion, resolvedRealmSlug, armoryRealm]);

  // Item tooltips
  const [itemCache, setItemCache] = useState<Record<string, any>>({});
  const itemCacheRef = useRef<Record<string, any>>({});
  const pendingItemFetchesRef = useRef<Set<string>>(new Set());
  const hoverHideTimeoutRef = useRef<number | null>(null);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  useEffect(() => { itemCacheRef.current = itemCache; }, [itemCache]);
  useEffect(() => () => { if (hoverHideTimeoutRef.current) window.clearTimeout(hoverHideTimeoutRef.current); }, []);
  // Report tab state
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [upgradeFrom, setUpgradeFrom] = useState(636);
  const [upgradeTo, setUpgradeTo] = useState(645);
  // SimC GitHub data
  const [simcLiveData, setSimcLiveData] = useState<any>(null);
  const [simcSyncStatus, setSimcSyncStatus] = useState<'idle' | 'loading' | 'synced' | 'error'>('idle');
  const [simcSyncInfo, setSimcSyncInfo] = useState<string>('');
  const [importedTalentSource, setImportedTalentSource] = useState<'simc' | 'armory' | null>(null);
  const [importedTalentString, setImportedTalentString] = useState<string>('');
  const [userSimResult, setUserSimResult] = useState<any>(null);
  const [optimalSimResult, setOptimalSimResult] = useState<any>(null);
  // APL parser state
  const [aplData, setAplData] = useState<ParsedAPL | null>(null);
  const [aplSortMode, setAplSortMode] = useState<'dps' | 'apl'>('dps');
  // Patch notes state
  const [patchNotes, setPatchNotes] = useState<any[]>([]);
  const [patchLoading, setPatchLoading] = useState(false);
  const [patchError, setPatchError] = useState('');
  const [patchLastUpdated, setPatchLastUpdated] = useState('');
  const [patchSourceFilter, setPatchSourceFilter] = useState('All');

  const fetchPatchNotes = useCallback(async (force = false) => {
    setPatchLoading(true);
    setPatchError('');
    try {
      const { data, error } = await supabase.functions.invoke('fetch-patch-notes', { body: { force } });
      if (error) throw error;
      if (data?.notes) {
        setPatchNotes(data.notes);
        setPatchLastUpdated(data.lastUpdated || new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }));
      } else {
        setPatchNotes([]);
      }
    } catch (e) {
      console.warn('Patch notes fetch failed:', e);
      setPatchError('Could not load patch notes.');
    } finally {
      setPatchLoading(false);
    }
  }, []);

  useEffect(() => { fetchPatchNotes(); }, []);

  // Auto-load SimC data on mount
  // Deprecated War Within abilities — if found in cached data, it's stale
  const DEPRECATED_ABILITIES = ['spearhead', 'flanking_strike', 'mongoose_bite', 'coordinated_assault', 'fury_of_the_eagle', 'butchery', 'raptor_bite'];
  const isStaleSimcData = (data: any): boolean => {
    const actionLists = data?.apl?.actionLists;
    if (!actionLists) return false;
    const allActions = Object.values(actionLists).flat().join(' ').toLowerCase();
    return DEPRECATED_ABILITIES.some(a => allActions.includes(a));
  };

  useEffect(() => {
    (async () => {
      setSimcSyncStatus('loading');
      setSimcSyncInfo('Loading cached SimC data...');
      try {
        // First try reading from cache
        const { data: cached } = await supabase
          .from('simc_data_cache')
          .select('*')
          .eq('data_key', 'survival_hunter_data')
          .single();
        if (cached?.data && !isStaleSimcData(cached.data)) {
          setSimcLiveData(cached.data);
          const sha = (cached.data as any)?.sha || cached.github_sha || '';
          setSimcSyncInfo(`SimC data loaded (${sha.slice(0, 7)}) · ${new Date(cached.updated_at).toLocaleDateString()}`);
          setSimcSyncStatus('synced');
          // Build APL weights from pre-parsed actionLists
          try {
            const actionLists = (cached.data as any)?.apl?.actionLists;
            if (actionLists) {
              setAplData(buildAPLFromActionLists(actionLists));
            }
          } catch (e) { console.warn('APL build from cache failed:', e); }
        } else {
          // Stale or no cached data, trigger a sync
          if (cached?.data) console.warn('Cached SimC data contains deprecated War Within abilities — forcing re-sync');
          await handleSimcSync(true);
        }
      } catch (e) {
        console.warn('SimC cache load failed, trying sync:', e);
        try { await handleSimcSync(true); } catch (e2) {
          setSimcSyncStatus('error');
          setSimcSyncInfo('Using hardcoded data (sync failed)');
        }
      }
    })();
  }, []);

  const handleSimcSync = useCallback(async (force = false) => {
    setSimcSyncStatus('loading');
    setSimcSyncInfo('Syncing from SimC GitHub...');
    try {
      const { data, error } = await supabase.functions.invoke('simc-data-sync', {
        body: { force },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setSimcLiveData(data.data);
      const status = data.status === 'cached' ? 'Up to date' : 'Updated';
      setSimcSyncInfo(`${status} (${data.sha?.slice(0, 7)}) · ${new Date().toLocaleDateString()}`);
      setSimcSyncStatus('synced');
      // Build APL weights from pre-parsed actionLists
      try {
        const actionLists = data.data?.apl?.actionLists;
        if (actionLists) {
          setAplData(buildAPLFromActionLists(actionLists));
        }
      } catch (e) { console.warn('APL build from sync failed:', e); }
    } catch (e) {
      setSimcSyncStatus('error');
      setSimcSyncInfo(`Sync failed: ${e?.message || String(e)}`);
    }
  }, []);

  const handleParse = useCallback(() => {
    setParseError(''); const result = parseSimcString(simcInput);
    if (result.valid) {
      setParsedChar(result);
      setImportedTalentSource('simc');
      setImportedTalentString(result.talents || '');
      // Auto-scroll to sim config after successful parse
      setTimeout(() => {
        document.getElementById("sim-config")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } else {
      setParseError(result.errors.join(' '));
      setParsedChar(null);
      setImportedTalentSource(null);
      setImportedTalentString('');
    }
    setSimResults(null);
  }, [simcInput]);

  const handleLoadSample = () => { setSimcInput(SAMPLE_SIMC); setParsedChar(null); setSimResults(null); setParseError(''); setImportedTalentSource(null); setImportedTalentString(''); };

  const handleArmoryLookup = useCallback(async () => {
    const realmSlug = armoryRealm || resolvedRealmSlug;

    if (!realmSlug) {
      setArmoryError("Select a realm from the dropdown (or type the full realm name). ");
      return;
    }

    if (!armoryName.trim()) {
      setArmoryError('Enter a character name.');
      return;
    }

    setArmoryLoading(true);
    setArmoryError('');
    setArmoryAvatar('');

    try {
      const fullData = await getFullCharacter(
        realmSlug,
        armoryName.trim().toLowerCase(),
        armoryRegion,
      );
      if (fullData.profile?.error) throw new Error(fullData.profile.error);
      const simData = equipmentToSimData(fullData, armoryRegion);
      if (simData.character.spec && simData.character.spec.toLowerCase() !== 'survival') {
        setArmoryError(`Warning: ${simData.character.name} is specced as ${simData.character.spec}, not Survival.`);
      }
      setParsedChar(simData);
      setImportedTalentSource('armory');
      setImportedTalentString(simData?.talents || '');
      setSimResults(null);
      // Auto-scroll to sim config after successful armory load
      setTimeout(() => {
        document.getElementById("sim-config")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
      if (fullData.media?.assets) {
        const avatar = fullData.media.assets.find((a: any) => a.key === 'avatar');
        if (avatar?.value) setArmoryAvatar(avatar.value);
      }
      const itemIds = simData.gear.filter((g: any) => g.itemId).map((g: any) => parseInt(g.itemId));
      if (itemIds.length > 0) {
        setItemEnrichLoading(true);
        try {
          const items = await getItemsBatch(itemIds, armoryRegion);
          if (Array.isArray(items)) {
            const itemMap = {};
            items.forEach((item: any) => {
              if (item.id) itemMap[item.id] = item;
            });
            const enrichedGear = simData.gear.map((g: any) =>
              g.itemId && itemMap[g.itemId] ? { ...g, name: itemMap[g.itemId].name || g.name } : g,
            );
            setParsedChar((prev) => (prev ? { ...prev, gear: enrichedGear } : prev));
          }
        } catch (e) {
          console.warn('Item enrichment failed:', e);
        } finally {
          setItemEnrichLoading(false);
        }
      }
    } catch (err) {
      setArmoryError(err.message || 'Failed to look up character.');
      setParsedChar(null);
      setImportedTalentSource(null);
      setImportedTalentString('');
    } finally {
      setArmoryLoading(false);
    }
  }, [armoryRealm, resolvedRealmSlug, armoryName, armoryRegion]);

  const displayedTalentString = useMemo(() => {
    const raw = (importedTalentString || '').trim();
    if (!raw) return '';
    return raw.length > 24 ? `${raw.slice(0, 24)}...` : raw;
  }, [importedTalentString]);

  const detectedHeroTalent = useMemo(() => {
    const raw = (importedTalentString || '').trim();
    if (!raw) return 'Unknown';

    // WoW talent loadout codes encode hero talent choice
    // Pack Leader markers: 'Mgx', 'cMgx', 'MG' patterns in the encoded string
    // Sentinel markers: 'MWg', 'cMWg', 'MW' patterns
    // Also check for keyword patterns from SimC talent comments
    const lowerRaw = raw.toLowerCase();
    
    // Check for Pack Leader indicators
    if (raw.includes('Mgx') || raw.includes('cMgx') || raw.includes('mgx')) return 'Pack Leader';
    if (lowerRaw.includes('pack_leader') || lowerRaw.includes('packleader')) return 'Pack Leader';
    
    // Check for Sentinel indicators  
    if (raw.includes('MWg') || raw.includes('cMWg') || raw.includes('mwg')) return 'Sentinel';
    if (lowerRaw.includes('sentinel')) return 'Sentinel';

    // Fallback: if talent string exists but we can't detect, return Unknown
    return 'Unknown';
  }, [importedTalentString]);

  const userHeroKey = useMemo(() => {
    if (detectedHeroTalent === 'Sentinel') return 'sentinel';
    if (detectedHeroTalent === 'Pack Leader') return 'packLeader';
    return heroTalent;
  }, [detectedHeroTalent, heroTalent]);

  const getTargets = () => simMode === 'single' ? [1] : simMode === 'cleave' ? [2, 3] : [5, 8, 10];

  const primaryTargetCount = useMemo(() => {
    const targets = getTargets();
    return targets[0] || 1;
  }, [simMode]);

  const userBuildInfo = useMemo(() => getOptimalTalents(primaryTargetCount, userHeroKey), [primaryTargetCount, userHeroKey]);
  const optimalBuildInfo = useMemo(() => getOptimalTalents(primaryTargetCount, 'sentinel'), [primaryTargetCount]);

  // First-principles theorycrafting analysis (Heroic Midnight 276 Hero-track, 4pc tier)
  const theoryAnalysis = useMemo(() => {
    const heroKey = (userHeroKey === 'packLeader' ? 'packLeader' : 'sentinel') as 'sentinel' | 'packLeader';
    const tierSet: TierSetConfig = { has2pc: true, has4pc: true };
    return getFullOptimalAnalysis(heroKey, primaryTargetCount, HEROIC_MIDNIGHT_276, tierSet);
  }, [userHeroKey, primaryTargetCount]);

  const talentDiffRows = useMemo(() => {
    const left = userBuildInfo?.selected || [];
    const right = optimalBuildInfo?.selected || [];
    const leftKeys = new Set(left.map((t: any) => t.key));
    const rightOnly = right.filter((t: any) => !leftKeys.has(t.key));
    const leftOnly = left.filter((t: any) => !right.some((rt: any) => rt.key === t.key));

    const explain = (from: any, to: any) => {
      if (to?.aoePriority) return `${to.key.replace(/([A-Z])/g, ' $1')} scales better in cleave/AoE windows.`;
      if (to?.stPriority) return `${to.key.replace(/([A-Z])/g, ' $1')} provides stronger single-target pressure.`;
      if (to?.always) return `${to.key.replace(/([A-Z])/g, ' $1')} is a core throughput pick across fights.`;
      return `${to?.key?.replace(/([A-Z])/g, ' $1') || 'This swap'} provides better current performance.`;
    };

    const rows = [];
    const maxRows = Math.max(leftOnly.length, rightOnly.length);
    for (let i = 0; i < maxRows; i++) {
      const from = leftOnly[i];
      const to = rightOnly[i];
      if (!from || !to) continue;
      rows.push({ from, to, note: explain(from, to) });
    }
    return rows;
  }, [userBuildInfo, optimalBuildInfo]);

  const handleItemHover = useCallback((itemId: string, event: any) => {
    if (!itemId) return;

    // Cancel pending hide to avoid flicker when moving between rows
    if (hoverHideTimeoutRef.current) {
      window.clearTimeout(hoverHideTimeoutRef.current);
      hoverHideTimeoutRef.current = null;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const newX = rect.right + 8;
    const newY = rect.top;

    // Only update when changed (prevents unnecessary renders)
    setTooltipPos(prev => (prev.x === newX && prev.y === newY) ? prev : { x: newX, y: newY });
    setHoveredItem(prev => prev === itemId ? prev : itemId);

    // Skip if cached or already being fetched
    if (itemCacheRef.current[itemId] || pendingItemFetchesRef.current.has(itemId)) return;

    pendingItemFetchesRef.current.add(itemId);

    Promise.all([
      getItem(parseInt(itemId), armoryRegion || 'us'),
      getItemMedia(parseInt(itemId), armoryRegion || 'us').catch(() => null)
    ]).then(([itemData, mediaData]) => {
      const icon = mediaData?.assets?.find((a: any) => a.key === 'icon')?.value || null;
      setItemCache(prev => ({ ...prev, [itemId]: { ...itemData, _icon: icon } }));
    }).catch((e) => {
      setItemCache(prev => ({ ...prev, [itemId]: { _error: e.message } }));
    }).finally(() => {
      pendingItemFetchesRef.current.delete(itemId);
    });
  }, [armoryRegion]);

  const handleItemLeave = useCallback(() => {
    // Delay hide so cursor can move between rows without toggle flashing
    hoverHideTimeoutRef.current = window.setTimeout(() => {
      setHoveredItem(null);
    }, 160);
  }, []);


  // Prefetch item tooltip data in batch so hover doesn't trigger expensive fetches
  useEffect(() => {
    const itemIds = (parsedChar?.gear || [])
      .map((g: any) => g.itemId)
      .filter((id: string | null) => !!id && !itemCacheRef.current[id]);
    if (!itemIds.length) return;

    (async () => {
      try {
        const items = await getItemsBatch(itemIds, armoryRegion || 'us');
        if (!Array.isArray(items)) return;
        setItemCache(prev => {
          const next = { ...prev };
          items.forEach((item: any) => {
            if (item?.id) next[String(item.id)] = { ...(next[String(item.id)] || {}), ...item };
          });
          return next;
        });
      } catch {
        // Non-blocking: hover fetch will still work as fallback
      }
    })();
  }, [parsedChar?.gear, armoryRegion]);


  const handleSim = useCallback(() => {
    if (!parsedChar) return; setIsSimming(true); setSimResults(null); setUserSimResult(null); setOptimalSimResult(null);
    let externalMult = 1.0; externalMult *= FIGHT_STYLES[fightStyle]?.mult || 1.0;
    Object.entries(raidBuffs).forEach(([buff, enabled]) => { if (enabled && RAID_BUFFS[buff]) externalMult *= RAID_BUFFS[buff].mult; });
    Object.entries(consumables).forEach(([cat, sel]) => { const opt = CONSUMABLES[cat]?.options?.find(o => o.key === sel); if (opt) externalMult *= opt.mult; });
    setTimeout(() => {
      const targets = getTargets();
      const primaryTarget = targets[0];
      const primaryBuild = primaryTarget === 1 ? 'st' : 'aoe';

      // Run main results (all targets, user's selected hero)
      const results = targets.map(t => runSimulation(parsedChar, t, fightDuration, heroTalent, t === 1 ? 'st' : 'aoe', externalMult, simcLiveData, aplData));
      const sw = calcStatWeights(parsedChar, primaryTarget, fightDuration, heroTalent, primaryBuild, externalMult, simcLiveData, aplData);

      // Run user vs optimal single-target comparison
      const uHeroKey = detectedHeroTalent === 'Sentinel' ? 'sentinel' : detectedHeroTalent === 'Pack Leader' ? 'packLeader' : heroTalent;
      const userResult = runSimulation(parsedChar, primaryTarget, fightDuration, uHeroKey, primaryBuild, externalMult, simcLiveData, aplData);
      const optResult = runSimulation(parsedChar, primaryTarget, fightDuration, 'sentinel', primaryBuild, externalMult, simcLiveData, aplData);

      setStatWeights(sw);
      setSimResults(results);
      setOptimalTalents(getOptimalTalents(targets[targets.length - 1], heroTalent));
      setUserSimResult(userResult);
      setOptimalSimResult(optResult);
      setIsSimming(false);
    }, 1200);
  }, [parsedChar, heroTalent, fightDuration, simMode, fightStyle, raidBuffs, consumables, simcLiveData, detectedHeroTalent, aplData]);

  const copy = (str, key) => { navigator.clipboard.writeText(str).then(() => { setCopied(key); setTimeout(() => setCopied(''), 2000); }); };

  // Helper components (memoized so inputs don't lose focus on state updates)
   const LBL = useCallback(({ children }) => (
    <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 14, letterSpacing: 3, color: '#1c2333', textTransform: "uppercase", marginBottom: 12, display: "flex", alignItems: "center", gap: 10, fontWeight: 900 }}>
      {children}
      <div style={{ flex: 1, height: 1, background: C.borderSub }} />
    </div>
  ), []);

  const CARD = useCallback(({ children, style = {} }) => (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, ...style }}>
      {children}
    </div>
  ), []);

  return (
    <div style={{ minHeight: "100vh", background: C.pageBg, color: C.textPri, fontFamily: "'Rajdhani','Segoe UI',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;600;700;900&family=IBM+Plex+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;}
        .tab-btn{background:transparent;border:none;border-bottom:3px solid transparent;padding:12px 24px;color:#38bdf8;font-family:"Orbitron",sans-serif;font-size:17px;font-weight:700;letter-spacing:2px;cursor:pointer;transition:all .2s;text-transform:uppercase;}
        .tab-btn.active{color:#fbbf24;border-bottom-color:#d97706;}
        .site-nav-link{font-family:"Rajdhani",sans-serif;font-size:14px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;color:#64748b;padding:10px 18px;border-bottom:3px solid transparent;transition:color .2s,border-color .2s;display:inline-block;}
        .site-nav-link:hover{color:#94a3b8;}
        .site-nav-link.active{color:#fbbf24;border-bottom-color:#d97706;}
        .tab-btn:hover{color:#94a3b8;}
        .hero-sent{background:#0c1e35;border:2px solid #1a3a5c;border-radius:10px;padding:15px;cursor:pointer;transition:all .2s;text-align:left;width:100%;}
        .hero-sent:hover{border-color:#38bdf8;box-shadow:0 0 0 3px rgba(56,189,248,.12);}
        .hero-sent.sel{border-color:#38bdf8;box-shadow:0 0 0 3px rgba(56,189,248,.2),inset 0 0 24px rgba(56,189,248,.06);}
        .hero-pack{background:#1a0e2e;border:2px solid #3b1a5c;border-radius:10px;padding:15px;cursor:pointer;transition:all .2s;text-align:left;width:100%;}
        .hero-pack:hover{border-color:#c084fc;box-shadow:0 0 0 3px rgba(192,132,252,.12);}
        .hero-pack.sel{border-color:#c084fc;box-shadow:0 0 0 3px rgba(192,132,252,.2),inset 0 0 24px rgba(192,132,252,.06);}
        .mode-btn{background:${C.surface2};border:1px solid ${C.border};border-radius:8px;padding:10px 12px;color:#94a3b8;font-family:"Orbitron",sans-serif;font-size:9px;letter-spacing:1px;cursor:pointer;transition:all .2s;text-transform:uppercase;}
        .mode-btn.sel{background:${C.surface3};border-color:#d97706;color:#fbbf24;}
        .mode-btn:hover{border-color:#3d4f6a;color:#cbd5e1;}
        .sim-btn{background:linear-gradient(135deg,#d97706,#b45309);border:none;border-radius:10px;padding:15px 28px;color:#fffbeb;font-family:"Orbitron",sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;cursor:pointer;transition:all .2s;width:100%;text-transform:uppercase;animation:goldPulse 2.5s ease-in-out infinite;}
        .sim-btn:hover:not(:disabled){background:linear-gradient(135deg,#f59e0b,#d97706);transform:translateY(-1px);}
        .sim-btn:disabled{opacity:.4;cursor:not-allowed;animation:none;}
        .parse-btn{background:${C.surface2};border:1px solid ${C.border};border-radius:8px;padding:10px;color:#94a3b8;font-family:"Orbitron",sans-serif;font-size:9px;letter-spacing:2px;cursor:pointer;transition:all .2s;width:100%;text-transform:uppercase;}
        .parse-btn:hover{border-color:#3d4f6a;color:#cbd5e1;}
        .ifield{background:#141c2a;border:1px solid #2e3a50;border-radius:8px;color:#cbd5e1;font-family:"IBM Plex Mono",monospace;font-size:12px;padding:10px 14px;transition:border-color .2s,box-shadow .2s;outline:none;width:100%;}
        .ifield:focus{border-color:#d97706;box-shadow:0 0 0 2px rgba(217,119,6,.15);}
        .ifield::placeholder{color:#2e3a50;}
        select.ifield{cursor:pointer;}
        .tag{display:inline-block;padding:4px 10px;border-radius:6px;margin:2px;font-family:"Rajdhani",sans-serif;font-size:13px;font-weight:600;transition:transform .15s;cursor:default;}
        .tag:hover{transform:scale(1.05);}
        .tag-core{background:#1e2d45;border:1px solid #2e4a6a;color:#bfdbfe;}
        .tag-aoe{background:#0f2a1a;border:1px solid #1a4a2a;color:#6ee7b7;}
        .tag-st{background:#1e1040;border:1px solid #3b1a5c;color:#d8b4fe;}
        .badge{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;font-family:"Orbitron",sans-serif;font-size:8px;letter-spacing:1px;font-weight:600;white-space:nowrap;}
        .copy-btn{background:${C.surface2};border:1px solid ${C.border};border-radius:6px;color:#94a3b8;font-size:13px;padding:5px 12px;cursor:pointer;font-family:"Rajdhani",sans-serif;font-weight:600;transition:all .2s;white-space:nowrap;}
        .copy-btn:hover{border-color:#d97706;color:#fbbf24;}
        .copy-btn.done{border-color:#22c55e;color:#4ade80;background:#0f2a1a;}
        .stat-chip{background:#141c2a;border:1px solid #2e3a50;border-radius:8px;padding:10px 12px;text-align:center;}
        .result-anim{animation:fadeUp .35s ease forwards;}
        .dps-anim{animation:counterUp .5s ease forwards;}
        .loading-ring{width:42px;height:42px;border:3px solid #2e3a50;border-top-color:#d97706;border-radius:50%;animation:spin .8s linear infinite;}
        .adv-toggle{background:none;border:none;color:#94a3b8;font-family:"Orbitron",sans-serif;font-size:8px;letter-spacing:2px;cursor:pointer;padding:4px 0;display:flex;align-items:center;gap:6px;text-transform:uppercase;transition:color .2s;font-weight:700;}
        .adv-toggle:hover{color:#fbbf24;}
        .divider{height:1px;background:#1a2236;margin:14px 0;}
        .item-tooltip{position:fixed;z-index:9999;background:linear-gradient(180deg,#141c2a,#0c1220);border:1px solid #2e4a6a;border-radius:10px;padding:14px 16px;min-width:260px;max-width:320px;box-shadow:0 8px 32px rgba(0,0,0,.6);pointer-events:none;animation:fadeIn .15s ease;font-family:"Rajdhani",sans-serif;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}
        @keyframes barGrow{from{width:0;}}
        @keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
        @keyframes goldPulse{0%,100%{box-shadow:0 4px 16px rgba(217,119,6,.4);}50%{box-shadow:0 4px 28px rgba(251,191,36,.65);}}
        @keyframes iconGlow{0%,100%{box-shadow:0 0 16px rgba(74,222,128,.2),0 0 40px rgba(34,197,94,.08);}50%{box-shadow:0 0 28px rgba(74,222,128,.38),0 0 60px rgba(34,197,94,.16);}}
        @keyframes counterUp{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
        @keyframes waitPulse{0%,100%{border-color:#2e3a50;}50%{border-color:#3a4a60;}}
        @keyframes staggerFadeUp{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
        @media(max-width:1024px){.sim-3col{grid-template-columns:1fr !important;}.sim-right-col{position:static !important;max-height:none !important;overflow-y:visible !important;}}
        @media(max-width:900px){.responsive-grid{grid-template-columns:1fr !important;}.tab-btn{flex:1 1 calc(50% - 2px);min-width:0;text-align:center;padding:10px 8px;font-size:13px;}}
        @media(max-width:768px){
          .sim-3col{grid-template-columns:1fr !important;}
          .sim-left-col,.sim-right-col{grid-column:1 !important;}
          .sim-right-col{position:static !important;max-height:none !important;overflow-y:visible !important;width:100% !important;height:auto !important;}
          .site-header{padding:12px 16px !important;}
          .site-main{padding:14px 12px 32px !important;}
          .item-tooltip{display:none !important;}
          .ifield{font-size:16px !important;}
          .header-badges .badge{display:none !important;}
          .sim-3col{gap:12px !important;}
        }
        @media(max-width:480px){
          .tab-btn{padding:8px 4px !important;font-size:11px !important;letter-spacing:0 !important;}
          .site-main{padding:10px 8px 24px !important;}
          .site-header-inner{flex-direction:column !important;align-items:flex-start !important;gap:8px !important;}
        }
      `}</style>

      {/* HEADER */}
      <header className="site-header" style={{ background: "linear-gradient(135deg,#0d1117,#1c2333,#0f1a2e)", borderBottom: `1px solid ${C.border}`, padding: "16px 28px" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          <div className="site-header-inner" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, overflow: "hidden", border: `2px solid ${C.sentBdr}`, flexShrink: 0 }}>
                <img src={SURVIVAL_ICON} alt="Survival Hunter" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </div>
              <div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 16, fontWeight: 700, color: C.textPri, letterSpacing: 2 }}>SURVIVAL HUNTER</div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 3, color: C.textDim, marginTop: 3 }}>MIDNIGHT 12.0 · PRE-SEASON 1 · TALENT OPTIMIZER & SIMULATOR</div>
              </div>
            </div>
            <div className="header-badges" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span className="badge" style={{ background: C.goldBg, color: C.goldLight, border: `1px solid rgba(217,119,6,.4)` }}>★ PRE-SEASON 1</span>
              <span className="badge" style={{ background: C.surface2, color: C.textMid, border: `1px solid ${C.border}` }}>PATCH 12.0.1</span>
              <span className="badge" style={{ background: C.greenBg, color: C.green, border: C.greenBdr }}>🦉 SENTINEL META</span>
              <button onClick={() => handleSimcSync(true)} disabled={simcSyncStatus === 'loading'}
                title={simcSyncInfo}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20,
                  fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 1, fontWeight: 600, cursor: simcSyncStatus === 'loading' ? 'not-allowed' : 'pointer',
                  border: `1px solid ${simcSyncStatus === 'synced' ? 'rgba(56,189,248,.4)' : simcSyncStatus === 'error' ? 'rgba(248,113,113,.4)' : C.border}`,
                  background: simcSyncStatus === 'synced' ? '#0c1e35' : simcSyncStatus === 'error' ? '#2a0f0f' : C.surface2,
                  color: simcSyncStatus === 'synced' ? '#38bdf8' : simcSyncStatus === 'error' ? '#f87171' : C.textMid,
                  transition: 'all .2s', whiteSpace: 'nowrap',
                }}>
                {simcSyncStatus === 'loading' ? (
                  <><span style={{ width: 8, height: 8, border: "1.5px solid #2e3a50", borderTopColor: "#38bdf8", borderRadius: "50%", display: "inline-block", animation: "spin .8s linear infinite" }} /> SYNCING</>
                ) : simcSyncStatus === 'synced' ? (
                  <>🔄 SIMC LIVE</>
                ) : simcSyncStatus === 'error' ? (
                  <>⚠ SYNC</>
                ) : (
                  <>🔄 SYNC SIMC</>
                )}
              </button>
            </div>
          </div>
          <nav style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
            <NavLink to="/"      className="site-nav-link" activeClassName="active" end>⚔ Simulator</NavLink>
            <NavLink to="/gear"  className="site-nav-link" activeClassName="active">⚗ Gear</NavLink>
            <NavLink to="/guide" className="site-nav-link" activeClassName="active">📖 Guide</NavLink>
            <NavLink to="/talent-optimizer" className="site-nav-link" activeClassName="active">🧬 Talent Optimizer</NavLink>
          </nav>
        </div>
      </header>

      <div className="site-main" style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 24px 48px" }}>
        {/* TABS */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 22, gap: 2 }}>
          {[["sim", "⚔ Simulator"], ["talents", "🌿 Talents"], ["report", "📊 Report"]].map(([k, l]) => (
            <button key={k} className={`tab-btn ${activeTab === k ? "active" : ""}`} onClick={() => setActiveTab(k)}>{l}</button>
          ))}
        </div>

        {/* ═══ SIM TAB ═══ */}
        {activeTab === "sim" && (
          <>
            {/* 2-COLUMN GRID */}
            <div className="sim-3col" style={{ display: "grid", gridTemplateColumns: "35% 65%", gap: 16, alignItems: "start" }}>

              {/* ═══ LEFT COLUMN — Inputs + Character + Gear (35%) ═══ */}
              <div className="sim-left-col" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Armory / SimC — tabbed single card */}
                <CARD style={{ display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
                  {/* Tab bar */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: `1px solid ${C.border}` }}>
                    {(["armory", "simc"] as const).map(t => (
                      <button key={t} onClick={() => setInputTab(t)} style={{
                        background: "transparent", border: "none", borderBottom: inputTab === t ? `2px solid ${C.gold}` : "2px solid transparent",
                        padding: "10px 0", cursor: "pointer", transition: "all .15s",
                        fontFamily: "'Orbitron',sans-serif", fontSize: 9, letterSpacing: 2, fontWeight: 700, textTransform: "uppercase",
                        color: inputTab === t ? C.goldLight : C.textDim,
                      }}>
                        {t === "armory" ? "🌐 Armory" : "📋 SimC"}
                      </button>
                    ))}
                  </div>

                  {/* Armory tab */}
                  {inputTab === "armory" && (
                    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
                        {["us", "eu", "kr", "tw"].map(r => (
                          <button key={r} onClick={() => { setArmoryRegion(r); setArmoryRealm(""); setArmoryRealmSearch(""); }}
                            style={{ background: armoryRegion === r ? "transparent" : C.surface2, border: `1px solid ${armoryRegion === r ? C.gold : C.border}`,
                              borderRadius: 6, padding: "7px 0", color: armoryRegion === r ? C.goldLight : C.textMid,
                              fontFamily: "'Orbitron',sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, cursor: "pointer", transition: "all .2s",
                              boxShadow: armoryRegion === r ? `inset 0 0 0 1px ${C.gold},0 0 10px rgba(217,119,6,.18)` : "none", textTransform: "uppercase"
                            }}>{r}</button>
                        ))}
                      </div>
                      <div ref={realmDropdownRef} style={{ position: "relative" }}>
                        <input
                          ref={realmInputRef}
                          className="ifield"
                          value={armoryRealmSearch}
                          onChange={e => { setArmoryRealmSearch(e.target.value); setShowRealmDropdown(true); setRealmHighlightIdx(-1); }}
                          onKeyDown={e => {
                            const filtered = realmSuggestions;
                            if (e.key === 'ArrowDown') { e.preventDefault(); if (!showRealmDropdown) { setShowRealmDropdown(true); setRealmHighlightIdx(0); return; } setRealmHighlightIdx(prev => (prev + 1) % filtered.length); return; }
                            if (e.key === 'ArrowUp') { e.preventDefault(); setRealmHighlightIdx(prev => (prev - 1 + filtered.length) % filtered.length); return; }
                            if (e.key === 'Escape') { if (showRealmDropdown) { e.preventDefault(); setShowRealmDropdown(false); setRealmHighlightIdx(-1); } return; }
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (realmHighlightIdx >= 0 && filtered[realmHighlightIdx]) { setArmoryRealmSearch(filtered[realmHighlightIdx]); setArmoryRealm(normalizeRealmSlug(filtered[realmHighlightIdx])); setShowRealmDropdown(false); setRealmHighlightIdx(-1); return; }
                              if (resolvedRealmSlug) { setShowRealmDropdown(false); setRealmHighlightIdx(-1); return; }
                              const first = filtered[0];
                              if (first) { setArmoryRealmSearch(first); setArmoryRealm(normalizeRealmSlug(first)); setShowRealmDropdown(false); setRealmHighlightIdx(-1); }
                            }
                          }}
                          onFocus={() => { setShowRealmDropdown(true); setRealmHighlightIdx(-1); }}
                          placeholder="Search realm..."
                          style={{ fontSize: 13, fontFamily: "'Rajdhani',sans-serif", fontWeight: 500 }}
                          autoComplete="off"
                        />
                        {showRealmDropdown && (() => {
                          const filtered = realmSuggestions;
                          if (filtered.length === 0) return null;
                          return (
                            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, zIndex: 100, maxHeight: 200, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,.4)" }}>
                              {filtered.map((rv, idx) => (
                                <div key={rv} onMouseDown={() => { setArmoryRealm(normalizeRealmSlug(rv)); setArmoryRealmSearch(rv); setShowRealmDropdown(false); setRealmHighlightIdx(-1); }} onMouseEnter={() => setRealmHighlightIdx(idx)}
                                  style={{ padding: "8px 12px", fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: idx === realmHighlightIdx ? C.goldLight : C.textSec, cursor: "pointer", transition: "background .08s", borderBottom: `1px solid ${C.borderSub}`, background: idx === realmHighlightIdx ? C.surface3 : "transparent" }}>
                                  {rv}
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                      <input className="ifield" value={armoryName} onChange={e => setArmoryName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleArmoryLookup()} placeholder="Character name" style={{ fontSize: 13, fontFamily: "'Rajdhani',sans-serif", fontWeight: 500 }} />
                      {armoryError && <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: C.red, lineHeight: 1.5 }}>⚠ {armoryError}</div>}
                      <button onClick={handleArmoryLookup} disabled={armoryLoading}
                        style={{ width: "100%", background: armoryLoading ? "#1c2a3a" : C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "11px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, cursor: armoryLoading ? "not-allowed" : "pointer", transition: "all .2s", color: armoryLoading ? C.textDim : C.textSec, fontFamily: "'Orbitron',sans-serif", fontSize: 10, letterSpacing: 3, textTransform: "uppercase", fontWeight: 700 }}>
                        {armoryLoading ? <><span style={{ width: 10, height: 10, border: "2px solid #2e3a50", borderTopColor: C.sentClr, borderRadius: "50%", display: "inline-block", animation: "spin .8s linear infinite" }} /> FETCHING...</> : <>🔵 FETCH FROM ARMORY</>}
                      </button>
                      {armoryAvatar && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <img src={armoryAvatar} alt="" style={{ width: 32, height: 32, borderRadius: 5, border: `2px solid ${C.border}` }} />
                          <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: C.green }}>✓ Loaded {itemEnrichLoading && <span style={{ color: C.goldLight }}>· Enriching...</span>}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* SimC tab */}
                  {inputTab === "simc" && (
                    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: C.textMid }}>
                          In-game: <code style={{ background: C.surface2, padding: "1px 5px", borderRadius: 3, fontSize: 11, color: C.textSec }}>/simc</code> → paste below
                        </span>
                        <button onClick={handleLoadSample} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 5, color: C.textMid, fontSize: 11, padding: "3px 8px", cursor: "pointer", fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, whiteSpace: "nowrap" }}>Sample</button>
                      </div>
                      <textarea className="ifield" value={simcInput} onChange={e => setSimcInput(e.target.value)} placeholder="Paste your SimulationCraft addon export here..." style={{ minHeight: 140, resize: "vertical", lineHeight: 1.6, width: "100%" }} />
                      {parseError && <div style={{ color: C.red, fontSize: 12, fontFamily: "'Rajdhani',sans-serif" }}>⚠ {parseError}</div>}
                      <button className="parse-btn" onClick={handleParse}>✦ Parse Character Data</button>
                    </div>
                  )}
                </CARD>

                {/* ── Character Stats (2×3 compact grid) ── */}
                <CARD style={{ padding: 14 }}>
                  {parsedChar ? (
                    <div style={{ background: C.greenBg, padding: "8px 12px", borderRadius: 8, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: C.green, fontSize: 12 }}>✓</span>
                      <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, color: C.green, letterSpacing: 2, fontWeight: 700 }}>CHARACTER LOADED</span>
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: "8px 0 6px", marginBottom: 10 }}>
                      <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 3, color: "#2e3a50" }}>IMPORT VIA ARMORY OR SIMC</div>
                    </div>
                  )}

                  {/* Character info row */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 14px", marginBottom: 10 }}>
                    {parsedChar ? (
                      [["Name", parsedChar.character.name, C.textPri, true], ["Level", parsedChar.character.level, C.textSec, false], ["Race", parsedChar.character.race, C.textSec, false], ["Avg iLvl", parsedChar.character.avgIlvl ? `${parsedChar.character.avgIlvl}` : null, C.goldLight, true]].filter(([, v]) => v).map(([l, v, c, bold]) => (
                        <div key={l} style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
                          <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 11, color: C.textDim, minWidth: 44 }}>{l}:</span>
                          <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, fontWeight: bold ? 700 : 500, color: c }}>{v}</span>
                        </div>
                      ))
                    ) : (
                      [["Name", "— — —"], ["Level", "—"], ["Race", "—"], ["Avg iLvl", "—"]].map(([l, v]) => (
                        <div key={l} style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
                          <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 11, color: C.textDim, minWidth: 44 }}>{l}:</span>
                          <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, fontWeight: 500, color: "#2e3a50" }}>{v}</span>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Stats — 2×3 compact grid */}
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 2, color: C.textDim, marginBottom: 6 }}>STATS</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                    {parsedChar ? (
                      [["AGI", parsedChar.stats.agility?.toLocaleString(), C.textPri], ["AP", Math.round(parsedChar.stats.attackPower)?.toLocaleString(), C.goldLight], ["Haste", `${parsedChar.stats.haste}%`, "#60a5fa"], ["Crit", `${parsedChar.stats.crit}%`, "#f59e0b"], ["Mastery", `${parsedChar.stats.mastery}%`, "#a78bfa"], ["Vers", `${parsedChar.stats.versatility}%`, "#34d399"]].map(([l, v, c]) => (
                        <div key={l} className="stat-chip" style={{ padding: "6px 8px" }}>
                          <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 1, color: C.textDim, marginBottom: 1 }}>{l}</div>
                          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: c, fontWeight: 700 }}>{v}</div>
                        </div>
                      ))
                    ) : (
                      [["AGI", "—"], ["AP", "—"], ["Haste", "—"], ["Crit", "—"], ["Mastery", "—"], ["Vers", "—"]].map(([l, v]) => (
                        <div key={l} className="stat-chip" style={{ padding: "6px 8px" }}>
                          <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 1, color: C.textDim, marginBottom: 1 }}>{l}</div>
                          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#2e3a50", fontWeight: 700 }}>{v}</div>
                        </div>
                      ))
                    )}
                  </div>
                </CARD>

                {/* ── Gear list (2-column, compact h-8 rows) ── */}
                <CARD style={{ padding: 14 }}>
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 2, color: C.textDim, marginBottom: 8 }}>
                    {parsedChar ? `GEAR (${parsedChar.gear.length} PIECES)` : "GEAR"}
                  </div>
                  {parsedChar && parsedChar.gear.length > 0 ? (
                    (() => {
                      const SLOT_ORDER_L = ['head','neck','shoulders','back','chest','wrist','hands','waist'];
                      const SLOT_ORDER_R = ['legs','feet','finger1','finger2','trinket1','trinket2','main_hand','off_hand'];
                      const SLOT_LABELS_L = ['Head','Neck','Shoulders','Back','Chest','Wrist','Hands','Waist'];
                      const SLOT_LABELS_R = ['Legs','Feet','Ring 1','Ring 2','Trinket 1','Trinket 2','Main Hand','Off Hand'];
                      const gearMap: Record<string, any> = {};
                      parsedChar.gear.forEach((g: any) => { gearMap[g.slot] = g; });
                      const cols = [
                        SLOT_ORDER_L.map((slot, i) => ({ slot, label: SLOT_LABELS_L[i], gear: gearMap[slot] })),
                        SLOT_ORDER_R.map((slot, i) => ({ slot, label: SLOT_LABELS_R[i], gear: gearMap[slot] })),
                      ];
                      return (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 8px" }} onMouseLeave={handleItemLeave}>
                          {cols.map((col, ci) => (
                            <div key={ci} style={{ display: "flex", flexDirection: "column" }}>
                              {col.map(({ slot, label, gear: g }, i) => {
                                const qualityColor = g ? getItemQualityColor(g.quality, g.ilvl, parsedChar.character?.avgIlvl) : C.textDim;
                                return (
                                  <div key={slot} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 32, padding: "0 4px", borderRadius: 3, background: i % 2 === 0 ? "transparent" : C.borderSub, cursor: g?.itemId ? "pointer" : "default" }}
                                    onMouseEnter={e => g?.itemId && handleItemHover(g.itemId, e)}>
                                    <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 11, color: C.textDim, fontWeight: 500, minWidth: 48, flexShrink: 0 }}>{label}</span>
                                    <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 11, color: qualityColor, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textAlign: "right", paddingLeft: 2 }}>{g?.name || "—"}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      );
                    })()
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 8px" }}>
                      {[
                        ["Head","Neck","Shoulders","Back","Chest","Wrist","Hands","Waist"],
                        ["Legs","Feet","Ring 1","Ring 2","Trinket 1","Trinket 2","Main Hand","Off Hand"]
                      ].map((col, ci) => (
                        <div key={ci} style={{ display: "flex", flexDirection: "column" }}>
                          {col.map((slot, i) => (
                            <div key={slot} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 32, padding: "0 4px", borderRadius: 3, background: i % 2 === 0 ? "transparent" : C.borderSub }}>
                              <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 11, color: "#5a6a82", fontWeight: 500, minWidth: 48 }}>{slot}</span>
                              <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 11, color: "#2e3a50", fontWeight: 600 }}>—</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </CARD>

                {/* Current Talents — always visible */}
                <CARD style={{ marginTop: 12 }}>
                  <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 8 }}>CURRENT TALENTS</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                      {parsedChar ? (
                        <>
                          <span className="badge" style={{ background: C.surface, color: C.goldLight, border: `1px solid ${C.gold}` }}>
                            {importedTalentSource === 'simc' ? 'IMPORTED FROM SIMC' : 'IMPORTED FROM ARMORY'}
                          </span>
                          <span
                            className="badge"
                            style={{
                              background: C.surface,
                              color: detectedHeroTalent === 'Sentinel' ? '#38bdf8' : detectedHeroTalent === 'Pack Leader' ? '#c084fc' : C.textDim,
                              border: `1px solid ${detectedHeroTalent === 'Sentinel' ? '#38bdf8' : detectedHeroTalent === 'Pack Leader' ? '#c084fc' : C.border}`,
                            }}
                          >
                            Hero talent: {detectedHeroTalent}
                          </span>
                        </>
                      ) : (
                        <span className="badge" style={{ background: C.surface, color: '#5a6a82', border: `1px solid ${C.border}` }}>
                          AWAITING IMPORT
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: parsedChar ? 8 : 0 }}>
                      {!parsedChar && (
                        <span className="badge" style={{ background: C.surface, color: '#5a6a82', border: `1px solid ${C.borderSub}` }}>
                          Hero talent: —
                        </span>
                      )}
                    </div>
                    <div
                      title={importedTalentString || 'No talent string found'}
                      style={{
                        fontFamily: "'IBM Plex Mono',monospace",
                        fontSize: 12,
                        color: parsedChar && importedTalentString ? C.textSec : '#5a6a82',
                        background: C.surface,
                        border: `1px solid ${C.borderSub}`,
                        borderRadius: 8,
                        padding: '8px 10px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {parsedChar ? (displayedTalentString || 'Talent string unavailable') : '—'}
                    </div>
                  </div>
                </CARD>
              </div>

              {/* ═══ RIGHT COLUMN — Simulation Config (65%) ═══ */}
              <div className="sim-right-col" id="sim-config" style={{ position: "sticky", top: 20, maxHeight: "calc(100vh - 40px)", overflowY: "auto" }}>
                <CARD style={{ display: "flex", flexDirection: "column" }}>
                  <LBL>⚙ Simulation Config</LBL>

                  {/* ── Hero Talent + Talent Loadout ───────────── */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 8 }}>HERO TALENT</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                      {Object.entries(MIDNIGHT_DATA.talents.hero).map(([k, h]) => (
                        <button key={k} className={`${k === "sentinel" ? "hero-sent" : "hero-pack"} ${heroTalent === k ? "sel" : ""}`}
                          onClick={() => {
                            setHeroTalent(k);
                            // pick the currently-selected build type for the new hero
                            const curType = selectedLoadoutId.split('-').slice(1).join('-') || 'st';
                            const next = TALENT_LOADOUTS.find(l => l.heroKey === k && l.id === `${k}-${curType}`)
                              || TALENT_LOADOUTS.find(l => l.heroKey === k);
                            if (next) { setSelectedLoadoutId(next.id); setSimMode(next.simMode); }
                          }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                            <span style={{ fontSize: 17 }}>{h.icon}</span>
                            <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 10, fontWeight: 700, color: k === "sentinel" ? C.sentClr : C.packClr }}>{h.name}</span>
                            {h.recommended && <span className="badge" style={{ background: C.greenBg, color: C.green, border: C.greenBdr, fontSize: 7, padding: "1px 6px" }}>BEST</span>}
                          </div>
                          <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: C.textMid }}>{h.weaponPref}</div>
                          <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: k === "sentinel" ? C.sentClr : C.packClr, marginTop: 4, fontWeight: 600 }}>ST +{Math.round(h.stBonus * 100)}% · AoE +{Math.round(h.aoeBonus * 100)}%</div>
                        </button>
                      ))}
                    </div>

                    {/* ── Custom Talent Slots ── */}
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 6 }}>CUSTOM LOADOUTS</div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                      {([0, 1] as const).map(slotIdx => {
                        const slot = customSlots[slotIdx];
                        const isEditing = editingSlot === slotIdx;
                        const slotHeroClr = slot ? (slot.heroKey === 'sentinel' ? C.sentClr : C.packClr) : C.textDim;
                        const slotHeroBg  = slot ? (slot.heroKey === 'sentinel' ? C.sentBg  : C.packBg)  : C.surface2;
                        const slotHeroBdr = slot ? (slot.heroKey === 'sentinel' ? C.sentBdr : C.packBdr) : C.border;
                        const isActive = selectedLoadoutId === `custom-${slotIdx}`;
                        return (
                          <div key={slotIdx} style={{ flex: 1 }}>
                            {slot ? (
                              <div
                                onClick={() => {
                                  setSelectedLoadoutId(`custom-${slotIdx}`);
                                  setHeroTalent(slot.heroKey);
                                  setSimMode(slot.simMode);
                                }}
                                style={{
                                  borderRadius: 10, padding: "10px 10px 8px", cursor: "pointer",
                                  background: isActive ? slotHeroBg : C.surface2,
                                  border: `2px solid ${isActive ? slotHeroBdr : slotHeroBdr + '33'}`,
                                  boxShadow: isActive ? `0 0 14px ${slotHeroClr}22` : undefined,
                                  transition: "all .15s",
                                  display: "flex", flexDirection: "column", gap: 4,
                                }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ fontSize: 13, lineHeight: 1 }}>{slot.heroKey === 'sentinel' ? '🌙' : '🐺'}</span>
                                  <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, fontWeight: 700,
                                    color: isActive ? slotHeroClr : C.textSec, letterSpacing: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 90 }}>
                                    {slot.name}
                                  </span>
                                  <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 8,
                                    background: '#1a1a2e', color: '#818cf8', border: '1px solid #818cf844',
                                    borderRadius: 3, padding: "0 4px" }}>CUSTOM</span>
                                  {isActive && <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 8,
                                    background: C.greenBg, color: C.green, border: `1px solid ${C.greenBdr}`,
                                    borderRadius: 3, padding: "0 4px" }}>ACTIVE</span>}
                                </div>
                                <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 10, color: C.textDim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {slot.heroKey === 'sentinel' ? 'Sentinel' : 'Pack Leader'} · {slot.simMode === 'single' ? 'ST' : slot.simMode === 'multi' ? 'AoE' : 'Cleave'}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
                                  <div style={{ display: "flex", gap: 4 }}>
                                    <button onClick={e => { e.stopPropagation(); setEditingSlot(slotIdx); setEditDraft({ ...slot }); }}
                                      title="Edit" style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.textMid, fontSize: 10, cursor: "pointer", padding: "1px 5px", lineHeight: 1.4 }}>✏</button>
                                    <button onClick={e => {
                                      e.stopPropagation();
                                      setCustomSlots(prev => { const c = [...prev]; c[slotIdx] = null; return c; });
                                      if (isActive) setSelectedLoadoutId('sentinel-st');
                                      if (editingSlot === slotIdx) { setEditingSlot(null); setEditDraft(null); }
                                    }}
                                      title="Remove" style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.red, fontSize: 10, cursor: "pointer", padding: "1px 5px", lineHeight: 1.4 }}>✕</button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setEditingSlot(slotIdx);
                                  setEditDraft({ name: `Custom ${slotIdx + 1}`, heroKey: heroTalent as 'sentinel'|'packLeader', simMode: 'single', enabledTalents: [], enabledHeroTalents: [], enabledClassTalents: [] });
                                }}
                                style={{
                                  width: "100%", height: "100%", minHeight: 80, borderRadius: 10, padding: "10px 8px", cursor: "pointer",
                                  background: isEditing ? C.surface3 : C.surface2,
                                  border: `2px dashed ${isEditing ? C.textMid : C.border}`,
                                  color: C.textDim, fontFamily: "'Rajdhani',sans-serif", fontSize: 12,
                                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                                }}>
                                <span style={{ fontSize: 16, opacity: .35 }}>+</span>
                                <span style={{ fontSize: 8, letterSpacing: 1, fontFamily: "'Orbitron',sans-serif", opacity: .5 }}>ADD CUSTOM</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Custom Slot Modal Editor — Full Screen */}
                    {editingSlot !== null && editDraft && (() => {
                      const heroClrE  = editDraft.heroKey === 'sentinel' ? C.sentClr : C.packClr;
                      const heroBgE   = editDraft.heroKey === 'sentinel' ? C.sentBg  : C.packBg;
                      const heroBdrE  = editDraft.heroKey === 'sentinel' ? C.sentBdr : C.packBdr;

                      // Point counters (25 core spec talents are always active; 3 core class talents always taken)
                      const specTotalSelected = editDraft.enabledTalents.length + 25;
                      const heroTotalSelected = editDraft.enabledHeroTalents.length;
                      const classTotalSelected = (editDraft.enabledClassTalents?.length ?? 0) + 3;
                      const specBudget = 31;
                      const heroBudgetVal = 10;
                      const classBudget = 31;

                      const closeModal = () => { setEditingSlot(null); setEditDraft(null); };

                      return (
                        <>
                          {/* Backdrop */}
                          <div
                            onClick={closeModal}
                            onKeyDown={e => { if (e.key === 'Escape') closeModal(); }}
                            style={{
                              position: "fixed", inset: 0, zIndex: 9990,
                              background: "rgba(0,0,0,.8)", backdropFilter: "blur(6px)",
                            }}
                          />
                          {/* ESC key listener */}
                          <div
                            ref={el => { if (el) el.focus(); }}
                            tabIndex={-1}
                            onKeyDown={e => { if (e.key === 'Escape') closeModal(); }}
                            style={{
                              position: "fixed", inset: "24px 8%", zIndex: 9991,
                              display: "flex", flexDirection: "column",
                              background: "#0d1117", border: `1px solid ${C.border}`,
                              borderRadius: 14, overflow: "hidden",
                              boxShadow: "0 24px 80px rgba(0,0,0,.7)",
                              outline: "none",
                            }}
                          >
                            {/* ── HEADER ── */}
                            <div style={{
                              padding: "16px 24px 12px",
                              borderBottom: `1px solid ${C.border}`,
                              background: C.surface2,
                            }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 12, letterSpacing: 2, color: heroClrE }}>
                                  CONFIGURE TALENTS — {editDraft.name || `SLOT ${editingSlot + 1}`}
                                </div>
                              </div>

                              {/* Controls row */}
                              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
                                {/* Name */}
                                <div style={{ flex: "1 1 180px" }}>
                                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 1.5, color: C.textDim, marginBottom: 4 }}>NAME</div>
                                  <input
                                    value={editDraft.name}
                                    onChange={e => setEditDraft(d => d ? { ...d, name: e.target.value } : d)}
                                    placeholder="e.g. AoE Pack Leader"
                                    maxLength={32}
                                    style={{
                                      width: "100%", background: C.surface3, border: `1px solid ${C.border}`,
                                      borderRadius: 6, padding: "6px 10px", color: C.textPri,
                                      fontFamily: "'Rajdhani',sans-serif", fontSize: 13, outline: "none",
                                      boxSizing: "border-box",
                                    }}
                                  />
                                </div>

                                {/* Scenario tabs */}
                                <div>
                                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 1.5, color: C.textDim, marginBottom: 4 }}>SCENARIO</div>
                                  <div style={{ display: "flex", gap: 4 }}>
                                    {([['single','🎯','Raid ST'],['cleave','⚔','Cleave'],['multi','💥','M+ AoE']] as const).map(([m,icon,label]) => (
                                      <button key={m}
                                        onClick={() => setEditDraft(d => d ? { ...d, simMode: m } : d)}
                                        style={{
                                          padding: "5px 10px", borderRadius: 6, cursor: "pointer",
                                          background: editDraft.simMode === m ? C.surface3 : "transparent",
                                          border: `1px solid ${editDraft.simMode === m ? C.textMid : C.border}`,
                                          color: editDraft.simMode === m ? C.textPri : C.textDim,
                                          fontFamily: "'Rajdhani',sans-serif", fontSize: 12,
                                        }}>
                                        {icon} {label}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {/* Hero toggle */}
                                <div>
                                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 1.5, color: C.textDim, marginBottom: 4 }}>HERO TALENT</div>
                                  <div style={{ display: "flex", gap: 4 }}>
                                    {([['sentinel','🌙','Sentinel',C.sentClr,C.sentBg,C.sentBdr],['packLeader','🐺','Pack Leader',C.packClr,C.packBg,C.packBdr]] as const).map(([k,icon,label,clr,bg,bdr]) => {
                                      const isActive = editDraft.heroKey === k;
                                      return (
                                        <button key={k}
                                          onClick={() => {
                                            if (isActive) return;
                                            if (editDraft.enabledHeroTalents.length > 0) {
                                              if (!window.confirm(`Switch to ${label}? Hero talent selections will be reset.`)) return;
                                            }
                                            setEditDraft(d => d ? { ...d, heroKey: k as 'sentinel'|'packLeader', enabledHeroTalents: [] } : d);
                                          }}
                                          style={{
                                            padding: "5px 12px", borderRadius: 7, cursor: isActive ? "default" : "pointer",
                                            background: isActive ? bg : "transparent",
                                            border: `1px solid ${isActive ? bdr : C.border}`,
                                            color: isActive ? clr : C.textDim,
                                            fontFamily: "'Rajdhani',sans-serif", fontSize: 12, fontWeight: 600,
                                            display: "flex", alignItems: "center", gap: 5,
                                            transition: "all .15s",
                                          }}>
                                          <span>{icon}</span><span>{label}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* ── POINT COUNTERS BAR ── */}
                            <div style={{
                              display: "flex", justifyContent: "center", gap: 32, padding: "8px 24px",
                              background: C.surface, borderBottom: `1px solid ${C.border}`,
                            }}>
                              {[
                                { label: "CLASS", count: classTotalSelected, budget: classBudget, color: "#60a5fa" },
                                { label: "HERO", count: heroTotalSelected, budget: heroBudgetVal, color: heroClrE },
                                { label: "SPEC", count: specTotalSelected, budget: specBudget, color: "#4ade80" },
                              ].map(p => (
                                <div key={p.label} style={{
                                  background: C.surface2, borderRadius: 999, padding: "4px 16px",
                                  display: "flex", alignItems: "center", gap: 8,
                                }}>
                                  <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 1.5, color: C.textDim, textTransform: "uppercase" }}>{p.label}</span>
                                  <span style={{
                                    fontFamily: "'IBM Plex Mono',monospace", fontSize: 16, fontWeight: 700,
                                    color: p.count > p.budget ? C.red : p.color,
                                  }}>
                                    {p.count} <span style={{ color: C.textDim, fontSize: 12 }}>/</span> {p.budget}
                                  </span>
                                </div>
                              ))}
                            </div>

                            {/* ── TALENT TREE (auto-scaled to fit) ── */}
                            <div
                              ref={modalTreeContainerRef}
                              style={{ flex: 1, overflow: "hidden", position: "relative" }}
                            >
                              <div
                                ref={modalTreeInnerRef}
                                style={{
                                  transformOrigin: "top center",
                                  transform: `scale(${modalTreeScale})`,
                                  display: "inline-flex",
                                  justifyContent: "center",
                                  width: "100%",
                                  minWidth: "fit-content",
                                }}
                              >
                                <BlizzardTalentTree
                                  specSelectedKeys={editDraft.enabledTalents}
                                  onSpecToggle={(key, selected) => {
                                    setEditDraft(d => {
                                      if (!d) return d;
                                      if (selected) {
                                        return { ...d, enabledTalents: [...d.enabledTalents, key] };
                                      } else {
                                        return { ...d, enabledTalents: cascadeRemove(key, d.enabledTalents) };
                                      }
                                    });
                                  }}
                                  heroKey={editDraft.heroKey}
                                  onHeroChange={(hero) => {
                                    if (editDraft.enabledHeroTalents.length > 0) {
                                      if (!window.confirm(`Switch to ${hero === 'sentinel' ? 'Sentinel' : 'Pack Leader'}? Hero talent selections will be reset.`)) return;
                                    }
                                    setEditDraft(d => d ? { ...d, heroKey: hero, enabledHeroTalents: [] } : d);
                                  }}
                                  heroSelectedKeys={editDraft.enabledHeroTalents}
                                  onHeroToggle={(key, selected) => {
                                    setEditDraft(d => {
                                      if (!d) return d;
                                      if (selected) {
                                        return { ...d, enabledHeroTalents: [...d.enabledHeroTalents, key] };
                                      } else {
                                        return { ...d, enabledHeroTalents: d.enabledHeroTalents.filter(k => k !== key) };
                                      }
                                    });
                                  }}
                                  classSelectedKeys={editDraft.enabledClassTalents}
                                  onClassToggle={(key, selected) => {
                                    setEditDraft(d => {
                                      if (!d) return d;
                                      if (selected) {
                                        return { ...d, enabledClassTalents: [...d.enabledClassTalents, key] };
                                      } else {
                                        return { ...d, enabledClassTalents: d.enabledClassTalents.filter(k => k !== key) };
                                      }
                                    });
                                  }}
                                />
                              </div>
                            </div>

                            {/* ── FOOTER ── */}
                            <div style={{
                              display: "flex", gap: 8, padding: "12px 24px",
                              borderTop: `1px solid ${C.border}`, background: C.surface2,
                            }}>
                              <button
                                onClick={() => {
                                  if (!editDraft.name.trim()) return;
                                  setCustomSlots(prev => { const c = [...prev]; c[editingSlot] = { ...editDraft }; return c; });
                                  setSelectedLoadoutId(`custom-${editingSlot}`);
                                  setHeroTalent(editDraft.heroKey);
                                  setSimMode(editDraft.simMode);
                                  closeModal();
                                }}
                                style={{
                                  flex: 1, padding: "12px 0", borderRadius: 7, cursor: "pointer",
                                  background: heroBgE, border: `1px solid ${heroBdrE}`,
                                  color: heroClrE, fontFamily: "'Orbitron',sans-serif", fontSize: 11, letterSpacing: 1.5,
                                }}>
                                ✓ SAVE TALENT SELECTION
                              </button>
                              <button
                                onClick={closeModal}
                                style={{
                                  padding: "12px 24px", borderRadius: 7, cursor: "pointer",
                                  background: "transparent", border: `1px solid ${C.border}`,
                                  color: C.textMid, fontFamily: "'Orbitron',sans-serif", fontSize: 11, letterSpacing: 1.5,
                                }}>
                                CANCEL
                              </button>
                            </div>
                          </div>
                        </>
                      );
                    })()}

                    {/* Talent Loadout cards — 3 builds for the active hero */}
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 8 }}>TALENT LOADOUT</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                    {(() => {
                      const loadouts = TALENT_LOADOUTS.filter(l => l.heroKey === heroTalent);
                      const heroClr  = heroTalent === 'sentinel' ? C.sentClr : C.packClr;
                      const heroBg   = heroTalent === 'sentinel' ? C.sentBg  : C.packBg;
                      const heroBdr  = heroTalent === 'sentinel' ? C.sentBdr : C.packBdr;
                      return loadouts.map(loadout => {
                        const isSel = selectedLoadoutId === loadout.id;
                        return (
                          <div key={loadout.id}
                            onClick={() => { setSelectedLoadoutId(loadout.id); setHeroTalent(loadout.heroKey); setSimMode(loadout.simMode); }}
                            style={{
                              borderRadius: 10, padding: "10px 10px 8px", cursor: "pointer",
                              background: isSel ? heroBg : C.surface2,
                              border: `2px solid ${isSel ? heroBdr : heroBdr + '33'}`,
                              boxShadow: isSel ? `0 0 14px ${heroClr}22` : undefined,
                              transition: "all .15s",
                              display: "flex", flexDirection: "column", gap: 4,
                            }}>

                            {/* Header */}
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ fontSize: 13, lineHeight: 1 }}>{loadout.icon}</span>
                              <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, fontWeight: 700,
                                color: isSel ? heroClr : C.textSec, letterSpacing: 1.2 }}>
                                {loadout.name}
                              </span>
                              {isSel && <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 8,
                                background: C.greenBg, color: C.green, border: `1px solid ${C.greenBdr}`,
                                borderRadius: 3, padding: "0 4px" }}>ACTIVE</span>}
                            </div>

                            <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 10, color: C.textDim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {loadout.scenario}
                            </div>

                            {/* DPS deltas */}
                            <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: '#4ade80', fontWeight: 700 }}>ST +{Math.round(loadout.stDelta*100)}%</span>
                              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: '#f97316', fontWeight: 700 }}>AoE +{Math.round(loadout.aoeDelta*100)}%</span>
                            </div>

                            {/* Copy talent string button */}
                            {isSel && (
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(loadout.exportString);
                                  setCopiedLoadoutId(loadout.id);
                                  setTimeout(() => setCopiedLoadoutId(null), 2000);
                                }}
                                style={{
                                  marginTop: 4, width: "100%",
                                  fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 1.5,
                                  padding: "6px 0", borderRadius: 7, cursor: "pointer",
                                  background: copiedLoadoutId === loadout.id ? C.greenBg : C.surface3,
                                  border: `1px solid ${copiedLoadoutId === loadout.id ? C.green : C.border}`,
                                  color: copiedLoadoutId === loadout.id ? C.green : C.textMid,
                                  transition: "all .2s",
                                }}>
                                {copiedLoadoutId === loadout.id ? '✓ COPIED' : '⎘ COPY STRING'}
                              </button>
                            )}
                          </div>
                        );
                      });
                    })()}
                    </div>

                    {/* Custom loadout cards (saved slots that match current hero) */}
                    {customSlots.map((slot, idx) => {
                      if (!slot) return null;
                      const customId = `custom-${idx}`;
                      const isSel = selectedLoadoutId === customId;
                      const heroClrC  = slot.heroKey === 'sentinel' ? C.sentClr : C.packClr;
                      const heroBgC   = slot.heroKey === 'sentinel' ? C.sentBg  : C.packBg;
                      const heroBdrC  = slot.heroKey === 'sentinel' ? C.sentBdr : C.packBdr;
                      const PILL_CLR_C: Record<string,string> = { core:'#60a5fa', st:'#4ade80', aoe:'#f97316', hero: heroClrC, hybrid:'#c084fc' };
                      const PILL_BG_C: Record<string,string>  = { core:'#0c1a2e', st:'#0f2a1a', aoe:'#1f1000', hero: heroBgC, hybrid:'#1a1033' };
                      const corePills  = SURVIVAL_SPEC_TREE.filter(n => n.dpsCategory === 'core');
                      const specPills  = SURVIVAL_SPEC_TREE.filter(n => n.dpsCategory !== 'core' && slot.enabledTalents.includes(n.key));
                      const heroPills  = HERO_TALENT_TREES[slot.heroKey].filter(hn => slot.enabledHeroTalents.includes(hn.key));
                      return (
                        <div key={customId}
                          onClick={() => { setSelectedLoadoutId(customId); setHeroTalent(slot.heroKey); setSimMode(slot.simMode); }}
                          style={{
                            marginBottom: 8, borderRadius: 10, padding: "12px 14px", cursor: "pointer",
                            background: isSel ? heroBgC : C.surface2,
                            border: `1px solid ${isSel ? heroBdrC : C.border}`,
                            transition: "all .15s",
                          }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: isSel ? 12 : 0 }}>
                            <span style={{ fontSize: 15 }}>{slot.heroKey === 'sentinel' ? '🌙' : '🐺'}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 9, fontWeight: 700,
                                  color: isSel ? heroClrC : C.textSec, letterSpacing: 1.5 }}>
                                  {slot.name}
                                </span>
                                <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 9,
                                  background: '#1a1a2e', color: '#818cf8', border: '1px solid #818cf844',
                                  borderRadius: 4, padding: "0 6px" }}>CUSTOM</span>
                                {isSel && <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 10,
                                  background: C.greenBg, color: C.green, border: `1px solid ${C.greenBdr}`,
                                  borderRadius: 4, padding: "0 6px" }}>ACTIVE</span>}
                              </div>
                              <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 11, color: C.textDim, marginTop: 1 }}>
                                {slot.heroKey === 'sentinel' ? 'Sentinel' : 'Pack Leader'} · {slot.simMode === 'single' ? 'Raid ST' : slot.simMode === 'multi' ? 'M+ AoE' : 'Cleave'}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button onClick={e => { e.stopPropagation(); setEditingSlot(idx as 0|1); setEditDraft({ ...slot }); }}
                                style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.textMid, fontSize: 11, cursor: "pointer", padding: "2px 6px" }}>✏</button>
                              <button onClick={e => {
                                e.stopPropagation();
                                setCustomSlots(prev => { const c = [...prev]; c[idx] = null; return c; });
                                if (isSel) setSelectedLoadoutId('sentinel-st');
                              }}
                                style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.red, fontSize: 11, cursor: "pointer", padding: "2px 6px" }}>✕</button>
                            </div>
                          </div>

                          {/* Expanded talent pills */}
                          {isSel && (
                            <>
                              {/* Core nodes */}
                              <div style={{ marginBottom: 6 }}>
                                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 2, color: PILL_CLR_C['core'], marginBottom: 4, opacity: .7 }}>ALWAYS ACTIVE (CORE)</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                  {corePills.map(n => (
                                    <span key={n.key} style={{
                                      fontFamily: "'Rajdhani',sans-serif", fontSize: 11, fontWeight: 700,
                                      color: '#60a5fa', background: '#0c1a2e', border: '1px solid #60a5fa44',
                                      borderRadius: 5, padding: "2px 8px",
                                    }}>{n.label}{n.pointCost === 2 ? ' ··' : ''}</span>
                                  ))}
                                </div>
                              </div>
                              {/* Optional spec nodes selected */}
                              {specPills.length > 0 && (
                                <div style={{ marginBottom: 6 }}>
                                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 2, color: C.textDim, marginBottom: 4, opacity: .7 }}>SELECTED OPTIONAL</div>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                    {specPills.map(n => {
                                      const clr = CAT_CLR[n.dpsCategory] || '#94a3b8';
                                      const bg  = n.dpsCategory === 'st' ? '#0f2a1a' : n.dpsCategory === 'aoe' ? '#1f1000' : n.dpsCategory === 'gateway' ? '#170828' : C.surface3;
                                      return (
                                        <span key={n.key} style={{
                                          fontFamily: "'Rajdhani',sans-serif", fontSize: 11, fontWeight: 700,
                                          color: clr, background: bg, border: `1px solid ${clr}44`,
                                          borderRadius: 5, padding: "2px 8px",
                                        }}>{n.label}{n.pointCost === 2 ? ' ··' : ''}{n.isGateway ? ' ⚡' : ''}</span>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              {/* Hero chain */}
                              {heroPills.length > 0 && (
                                <div style={{ marginBottom: 6 }}>
                                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 2, color: heroClrC, marginBottom: 4, opacity: .7 }}>HERO TALENTS</div>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                    {heroPills.map(hn => (
                                      <span key={hn.key} style={{
                                        fontFamily: "'Rajdhani',sans-serif", fontSize: 11, fontWeight: 700,
                                        color: heroClrC, background: heroBgC, border: `1px solid ${heroBdrC}44`,
                                        borderRadius: 5, padding: "2px 8px",
                                      }}>{hn.label}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {specPills.length === 0 && heroPills.length === 0 && (
                                <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 11, color: C.textDim, fontStyle: "italic" }}>
                                  No optional talents selected — only core talents active.
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Fight Duration */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 8 }}>FIGHT DURATION — <span style={{ color: C.goldLight }}>{dL(fightDuration)}</span></div>
                    <input type="range" min={60} max={600} step={30} value={fightDuration} onChange={e => setFightDuration(+e.target.value)} style={{ width: "100%", accentColor: C.gold }} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: C.textDim, marginTop: 4 }}><span>1 min</span><span>5 min</span><span>10 min</span></div>
                  </div>

                  {/* Advanced Options — collapses downward, collapsed by default */}
                  <div style={{ marginBottom: 16 }}>
                    <button className="adv-toggle" onClick={() => setShowAdv(!showAdv)}>
                      <span style={{ fontSize: 10 }}>{showAdv ? "▲" : "▼"}</span>
                      {showAdv ? "COLLAPSE" : "ADVANCED OPTIONS"} {!showAdv && <span style={{ color: C.textDim }}>(Buffs / Consumables / Fight Style)</span>}
                    </button>
                    {showAdv && (
                      <div style={{ marginTop: 8, padding: 14, background: C.surface2, borderRadius: 10, border: `1px solid ${C.border}`, animation: "fadeUp .2s ease" }}>
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 8 }}>FIGHT STYLE</div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                            {Object.entries(FIGHT_STYLES).map(([k, v]) => (
                              <button key={k} onClick={() => setFightStyle(k)}
                                style={{
                                  background: fightStyle === k ? C.goldBg : C.surface,
                                  border: `1px solid ${fightStyle === k ? C.gold : C.border}`,
                                  borderRadius: 8, padding: "8px 10px", cursor: "pointer", textAlign: "left", transition: "all .15s",
                                  boxShadow: fightStyle === k ? `0 0 8px rgba(217,119,6,.25)` : 'none',
                                }}>
                                <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, fontWeight: fightStyle === k ? 800 : 600, color: fightStyle === k ? C.goldLight : C.textMid }}>{v.label}</div>
                                <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 11, color: fightStyle === k ? '#a16207' : C.textDim }}>{v.desc} · {Math.round(v.mult * 100)}%</div>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 8 }}>RAID BUFFS</div>
                          {Object.entries(RAID_BUFFS).map(([k, b]) => (
                            <label key={k}
                              onClick={() => setRaidBuffs(p => ({ ...p, [k]: !p[k] }))}
                              style={{
                                display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", cursor: "pointer",
                                borderBottom: `1px solid ${C.borderSub}`,
                                background: raidBuffs[k] ? 'rgba(251,191,36,.05)' : 'transparent',
                                borderRadius: 4, transition: "background .15s",
                              }}>
                              <input type="checkbox" checked={raidBuffs[k]} readOnly style={{ accentColor: C.gold, width: 14, height: 14, cursor: "pointer" }} />
                              <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, fontWeight: raidBuffs[k] ? 800 : 500, color: raidBuffs[k] ? C.goldLight : C.textMid, flex: 1, transition: "color .15s, font-weight .15s" }}>
                                {b.icon} {b.label}
                              </span>
                              <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, fontWeight: raidBuffs[k] ? 700 : 400, color: raidBuffs[k] ? '#a16207' : C.textDim }}>
                                {b.stat}
                              </span>
                            </label>
                          ))}
                        </div>
                        <div>
                          <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 8 }}>CONSUMABLES</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {Object.entries(CONSUMABLES).map(([k, d]) => {
                              const selOpt = d.options.find(o => o.key === consumables[k]);
                              const isNone = consumables[k] === 'none';
                              return (
                                <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, color: C.textDim, width: 44, flexShrink: 0, letterSpacing: 1 }}>{d.label}</span>
                                  <div style={{ flex: 1, position: "relative" }}>
                                    <select
                                      className="ifield"
                                      value={consumables[k]}
                                      onChange={e => setConsumables(p => ({ ...p, [k]: e.target.value }))}
                                      style={{
                                        width: "100%", padding: "6px 10px", fontSize: 13,
                                        color: isNone ? C.textDim : C.goldLight,
                                        fontWeight: isNone ? 400 : 700,
                                        background: isNone ? C.surface3 : C.goldBg,
                                        border: `1px solid ${isNone ? C.border : C.gold}`,
                                        borderRadius: 6, cursor: "pointer",
                                      }}>
                                      {d.options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                                    </select>
                                  </div>
                                  {!isNone && (
                                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: C.green, fontWeight: 700, flexShrink: 0 }}>
                                      +{Math.round((selOpt!.mult - 1) * 100)}%
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Run Simulation button */}
                  <div style={{ flex: 1 }} />
                  <button 
                    className="sim-btn" 
                    onClick={handleSim} 
                    disabled={!parsedChar || isSimming}
                    style={parsedChar && !isSimming ? { animation: "goldPulse 2s ease-in-out infinite" } : { opacity: 0.5 }}
                  >
                    {isSimming ? "⟳ SIMULATING..." : "▶ RUN SIMULATION"}
                  </button>
                  {!parsedChar && <p style={{ textAlign: "center", color: C.textDim, fontFamily: "'Rajdhani',sans-serif", fontSize: 12, marginTop: 8 }}>Parse your character first</p>}
                </CARD>
              </div>
            </div>

            {/* BOTTOM ROW — Results (full width, appears after sim) */}
            {(isSimming || simResults) && (
              <div style={{ display: "block", width: "100%", marginTop: 20 }}>
                {isSimming && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 360, gap: 18 }}>
                    <div className="loading-ring" />
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 10, letterSpacing: 3, color: C.textDim }}>RUNNING SIMULATION</div>
                    <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, color: C.textMid, textAlign: "center", lineHeight: 1.7 }}>Calculating ability weights · cooldown alignment<br />talent synergies · target scaling</div>
                  </div>
                )}
                {!isSimming && simResults && (
                  <div className="result-anim" style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeUp .35s ease forwards" }}>

                    {/* ═══ TALENT COMPARISON ═══ */}
                    {userSimResult && optimalSimResult && (
                      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
                        <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 9, letterSpacing: 3, color: C.textDim, marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                          ⚖ TALENT COMPARISON
                          <div style={{ flex: 1, height: 1, background: C.borderSub }} />
                        </div>

                        {/* Two build columns + center delta */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 0, marginBottom: 16 }}>
                          {/* YOUR BUILD */}
                          <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: "10px 0 0 10px", padding: 16 }}>
                            <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textMid, marginBottom: 10 }}>YOUR BUILD</div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                              <span className="badge" style={{ background: userSimResult.hero === 'sentinel' ? C.sentBg : C.packBg, color: userSimResult.hero === 'sentinel' ? C.sentClr : C.packClr, border: `1px solid ${userSimResult.hero === 'sentinel' ? C.sentBdr : C.packBdr}` }}>
                                {MIDNIGHT_DATA.talents.hero[userSimResult.hero]?.icon} {MIDNIGHT_DATA.talents.hero[userSimResult.hero]?.name || userSimResult.hero}
                              </span>
                            </div>
                            <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 28, fontWeight: 900, color: C.textPri, lineHeight: 1, marginBottom: 6 }}>
                              {fmt(userSimResult.totalDps)}
                            </div>
                            <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: C.textMid, marginBottom: 12 }}>DPS estimate</div>
                            {importedTalentString && (
                              <div title={importedTalentString} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: C.textDim, background: C.surface3, borderRadius: 5, padding: "4px 8px", marginBottom: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {importedTalentString.length > 20 ? `${importedTalentString.slice(0, 20)}...` : importedTalentString}
                              </div>
                            )}
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                              {(userBuildInfo?.selected || []).map((t: any) => (
                                <span key={t.key} className={`tag ${t.always ? 'tag-core' : t.aoePriority ? 'tag-aoe' : 'tag-st'}`} style={{ fontSize: 11, padding: "2px 8px" }}>
                                  {t.key.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase())}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* CENTER DELTA */}
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 16px", background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
                            <div style={{ width: 1, flex: 1, background: C.borderSub }} />
                            {(() => {
                              const diff = optimalSimResult.totalDps - userSimResult.totalDps;
                              const isOptimal = diff <= 0;
                              return (
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "12px 0" }}>
                                  {isOptimal ? (
                                    <span className="badge" style={{ background: C.greenBg, color: C.green, border: `1px solid ${C.greenBdr}` }}>✓ OPTIMAL</span>
                                  ) : (
                                    <>
                                      <span style={{ fontSize: 18, color: C.gold }}>→</span>
                                      <span className="badge" style={{ background: C.goldBg, color: C.goldLight, border: `1px solid ${C.gold}` }}>
                                        ▲ +{fmt(diff)} DPS
                                      </span>
                                      <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 11, color: C.textDim, textAlign: "center", maxWidth: 60 }}>possible</span>
                                    </>
                                  )}
                                </div>
                              );
                            })()}
                            <div style={{ width: 1, flex: 1, background: C.borderSub }} />
                          </div>

                          {/* OPTIMAL BUILD */}
                          <div style={{ background: C.goldBg, border: `1px solid ${C.gold}`, borderRadius: "0 10px 10px 0", padding: 16 }}>
                            <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.goldLight, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                              ★ OPTIMAL BUILD
                              <span 
                                title="Optimal build derived from first-principles AP coefficient math and SimC APL data for Midnight 12.0 Pre-Season 1. Updated as the meta evolves."
                                style={{ cursor: "help", fontFamily: "sans-serif", fontSize: 11, color: C.textMid, opacity: 0.7 }}
                              >
                                ℹ
                              </span>
                            </div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                              <span className="badge" style={{ background: C.sentBg, color: C.sentClr, border: `1px solid ${C.sentBdr}` }}>
                                🦉 Sentinel
                              </span>
                            </div>
                            <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 28, fontWeight: 900, color: C.goldLight, lineHeight: 1, marginBottom: 6 }}>
                              {fmt(optimalSimResult.totalDps)}
                            </div>
                            <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: C.textMid, marginBottom: 12 }}>DPS estimate</div>
                            {(() => {
                              const optStr = optimalBuildInfo?.exportString || '';
                              return optStr ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                                  <div title={optStr} style={{ flex: 1, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: C.textDim, background: "rgba(0,0,0,0.3)", borderRadius: 5, padding: "4px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {optStr.length > 20 ? `${optStr.slice(0, 20)}...` : optStr}
                                  </div>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(optStr);
                                      setCopied('optimal');
                                      setTimeout(() => setCopied(''), 2000);
                                    }}
                                    style={{ background: C.gold, color: "#000", border: "none", borderRadius: 4, padding: "4px 8px", cursor: "pointer", fontFamily: "'Rajdhani',sans-serif", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}
                                  >
                                    {copied === 'optimal' ? '✓ Copied' : 'Copy'}
                                  </button>
                                </div>
                              ) : null;
                            })()}
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                              {(optimalBuildInfo?.selected || []).map((t: any) => (
                                <span key={t.key} className={`tag ${t.always ? 'tag-core' : t.aoePriority ? 'tag-aoe' : 'tag-st'}`} style={{ fontSize: 11, padding: "2px 8px" }}>
                                  {t.key.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase())}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* WHAT'S DIFFERENT */}
                        {talentDiffRows.length > 0 && (
                          <div>
                            <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 10 }}>WHAT'S DIFFERENT</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 0, borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
                              {talentDiffRows.map((row: any, i: number) => (
                                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", background: i % 2 === 0 ? C.surface2 : C.surface3, padding: "10px 14px", gap: 10 }}>
                                  <div>
                                    <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 11, color: C.textDim, marginBottom: 2, letterSpacing: 1 }}>YOU HAVE</div>
                                    <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, fontWeight: 700, color: "#a78bfa" }}>
                                      {row.from.key.replace(/([A-Z])/g, ' $1').trim()}
                                    </span>
                                  </div>
                                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                    <span style={{ color: C.gold, fontSize: 14 }}>→</span>
                                    <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 10, color: C.textDim, maxWidth: 140, textAlign: "center", lineHeight: 1.3 }}>
                                      {row.note}
                                    </div>
                                  </div>
                                  <div style={{ textAlign: "right" }}>
                                    <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 11, color: C.textDim, marginBottom: 2, letterSpacing: 1 }}>OPTIMAL USES</div>
                                    <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, fontWeight: 700, color: C.goldLight }}>
                                      {row.to.key.replace(/([A-Z])/g, ' $1').trim()}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* DPS Results */}
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8, gap: 4 }}>
                      <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 1, color: C.textDim, alignSelf: 'center', marginRight: 4 }}>SORT BY:</span>
                      {(['dps', 'apl'] as const).map(mode => (
                        <button key={mode} onClick={() => setAplSortMode(mode)}
                          style={{
                            background: aplSortMode === mode ? C.surface3 : C.surface2,
                            border: `1px solid ${aplSortMode === mode ? C.gold : C.border}`,
                            borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                            fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 1,
                            color: aplSortMode === mode ? C.goldLight : C.textMid,
                            transition: 'all .2s', textTransform: 'uppercase',
                          }}>{mode === 'dps' ? 'DPS' : 'APL Order'}</button>
                      ))}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: simResults.length > 1 ? "repeat(auto-fit, minmax(320px, 1fr))" : "1fr", gap: 16 }}>
                      {simResults.map((res, ri) => {
                        const aplOrderedNames = aplData ? (getRotationWeights(aplData, res.hero === 'packLeader' ? 'packLeader' : 'sentinel', res.build === 'aoe' ? 'aoe' : 'st') ? aplData[res.hero === 'packLeader' ? 'packLeader' : 'sentinel'][res.build === 'aoe' ? 'aoe' : 'st']?.ordered : null) : null;
                        const entries = Object.entries(res.breakdown);
                        const sorted = aplSortMode === 'apl' && aplOrderedNames
                          ? entries.sort((a, b) => {
                              const aIdx = aplOrderedNames.indexOf(a[0]) >= 0 ? aplOrderedNames.indexOf(a[0]) : 9999;
                              const bIdx = aplOrderedNames.indexOf(b[0]) >= 0 ? aplOrderedNames.indexOf(b[0]) : 9999;
                              return aIdx - bIdx || (b[1] as number) - (a[1] as number);
                            })
                          : entries.sort((a, b) => (b[1] as number) - (a[1] as number));
                        const maxVal = Math.max(...entries.map(e => e[1] as number));
                        const h = MIDNIGHT_DATA.talents.hero[res.hero];
                        return (
                          <div key={ri} className="result-anim" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, animationDelay: `${ri * .1}s` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                              <div>
                                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 9, letterSpacing: 2, color: C.textDim, marginBottom: 6 }}>
                                  {res.targets === 1 ? "🎯 SINGLE TARGET" : res.targets <= 3 ? `⚔ CLEAVE — ${res.targets} TARGETS` : `💥 MULTI-TARGET — ${res.targets} TARGETS`}
                                </div>
                                <div className="dps-anim" style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 40, fontWeight: 900, color: C.goldLight, lineHeight: 1 }}>{fmt(res.totalDps)}</div>
                                <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, marginTop: 2 }}>DPS estimate</div>
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                                <span className="badge" style={{ background: res.hero === "sentinel" ? C.sentBg : C.packBg, color: res.hero === "sentinel" ? C.sentClr : C.packClr, border: `1px solid ${res.hero === "sentinel" ? C.sentBdr : C.packBdr}` }}>{h.icon} {h.name}</span>
                                <span className="badge" style={{ background: C.surface2, color: C.textMid, border: `1px solid ${C.border}` }}>{dL(res.duration)}</span>
                              </div>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {sorted.map(([key, val]) => (
                                <div key={key}>
                                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                    <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, color: C.textSec, fontWeight: 500 }}>{key}</span>
                                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: C.textSec }}>{fmt(val)} <span style={{ color: C.textDim, fontSize: 11 }}>({Math.round(val / res.totalDps * 100)}%)</span></span>
                                  </div>
                                  <div style={{ height: 5, background: C.surface2, borderRadius: 3, overflow: "hidden" }}>
                                    <div style={{ height: "100%", borderRadius: 3, width: `${(val / maxVal) * 100}%`, background: bClr(key), animation: "barGrow .7s ease forwards", opacity: .9 }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Stat Weights & Target Scaling side by side */}
                    <div style={{ display: "grid", gridTemplateColumns: simResults.length > 1 ? "2fr 1fr" : "1fr", gap: 16 }}>
                      {statWeights && (
                        <CARD>
                          <LBL>📊 Stat Weights</LBL>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {Object.entries(statWeights.weights).sort((a, b) => b[1].normalized - a[1].normalized).map(([stat, w]) => (
                              <div key={stat} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, color: C.textSec, fontWeight: 600, minWidth: 80 }}>{stat}</span>
                                <div style={{ flex: 1, height: 5, background: C.surface2, borderRadius: 3, overflow: "hidden" }}>
                                  <div style={{ height: "100%", borderRadius: 3, width: `${w.normalized * 100}%`, background: stat === "Agility" ? C.goldLight : stat === "Mastery" ? "#a78bfa" : stat === "Crit" ? "#f59e0b" : stat === "Haste" ? "#60a5fa" : "#34d399", animation: "barGrow .7s ease forwards" }} />
                                </div>
                                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: C.goldLight, minWidth: 42, textAlign: "right" }}>{w.normalized.toFixed(3)}</span>
                              </div>
                            ))}
                          </div>
                          <div style={{ marginTop: 10, fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: C.textDim }}>Normalized to Agility = 1.000 · Base DPS: {fmt(statWeights.baseDps)}</div>
                        </CARD>
                      )}

                      {simResults.length > 1 && (
                        <CARD>
                          <LBL>📊 Target Scaling</LBL>
                          <div style={{ display: "flex", gap: 14, alignItems: "flex-end", height: 110 }}>
                            {simResults.map((r, i) => {
                              const maxV = Math.max(...simResults.map(x => x.totalDps));
                              return (
                                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: C.goldLight }}>{fmt(r.totalDps)}</div>
                                  <div style={{ width: "100%", maxWidth: 50, height: `${(r.totalDps / maxV) * 80}px`, borderRadius: "4px 4px 0 0", background: `linear-gradient(to top,${C.gold},${C.goldLight})`, transition: "height .5s ease" }} />
                                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 9, color: C.textDim }}>{r.targets}T</div>
                                </div>
                              );
                            })}
                          </div>
                        </CARD>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

          </>
        )}

        {/* ═══ TALENTS TAB ═══ */}
        {activeTab === "talents" && (() => {

          const highlightKeywords = (text: string) => {
            if (!text) return text;
            const keywords: [RegExp, string][] = [
              [/\b(survival)\b/gi, '#38bdf8'],
              [/\b(kill command)\b/gi, '#60a5fa'],
              [/\b(mongoose)\b/gi, '#a78bfa'],
              [/\b(wildfire bomb)\b/gi, '#f59e0b'],
              [/\b(sentinel)\b/gi, '#38bdf8'],
              [/\b(pack leader)\b/gi, '#c084fc'],
              [/\b(coordinated assault)\b/gi, '#e879f9'],
            ];
            let result = text;
            keywords.forEach(([rx, color]) => {
              result = result.replace(rx, `<span style="color:${color};font-weight:700">$1</span>`);
            });
            return result;
          };

          const filteredNotes = patchSourceFilter === 'All' ? patchNotes : patchNotes.filter(n => n.source === patchSourceFilter);

          const SUB_TALENT_META: Record<string, Record<string, string>> = {
            packLeader: {
              lethalBarbs: 'STRONG', hogstrider: 'WEAK', direSummons: 'SITUATIONAL',
              shellCover: 'SITUATIONAL', stampede: 'STRONG',
            },
            sentinel: {
              dontLookBack: 'STRONG', moonlightChakram: 'STRONG', lunarStorm: 'STRONG',
              moonsBlessing: 'SITUATIONAL', stargazer: 'STRONG', cantMissWontMiss: 'STRONG',
              conditioning: 'SITUATIONAL',
            },
          };

          const metaBadgeStyle = (meta: string) => {
            if (meta === 'STRONG') return { background: '#0f2a1a', color: '#4ade80', border: '1px solid rgba(74,222,128,.3)' };
            if (meta === 'WEAK') return { background: 'rgba(248,113,113,.08)', color: '#f87171', border: '1px solid rgba(248,113,113,.3)' };
            return { background: C.goldBg, color: C.goldLight, border: `1px solid ${C.gold}60` };
          };

          const MIDNIGHT_CHANGES = [
            { title: 'Explosive Shot Removed', badge: 'REWORK', badgeColor: C.goldLight, badgeBg: C.goldBg, desc: 'No longer in the class tree. Take Keen Eyesight, Unnatural Causes, Trigger Finger for class tree filler.' },
            { title: 'Boomstick ↔ WFB Loop', badge: 'BUFF', badgeColor: '#4ade80', badgeBg: '#0f2a1a', desc: 'Each Boomstick hit reduces Wildfire Bomb CD by 2s. Each WFB hit reduces Boomstick CD by 2s. Core feedback loop.' },
            { title: 'Mongoose Fury Baseline', badge: 'BUFF', badgeColor: '#4ade80', badgeBg: '#0f2a1a', desc: 'Now accessible via tree position without extra talent investment. Mongoose Rounds adds KC→Fury CD reduction.' },
            { title: 'Flamefang Pitch Added', badge: 'BUFF', badgeColor: '#4ade80', badgeBg: '#0f2a1a', desc: 'New 60s CD AoE DoT. Second charge talent is strong for M+. Core AoE build talent.' },
            { title: 'Raptor Swipe AoE', badge: 'REWORK', badgeColor: C.goldLight, badgeBg: C.goldBg, desc: 'Replaces Raptor Strike in AoE builds. Hits 5 targets and procs +3% Haste on hit.' },
            { title: 'Sentinel Owl Rework', badge: 'BUFF', badgeColor: '#4ade80', badgeBg: '#0f2a1a', desc: 'Owl now spawns on every Wildfire Bomb cast and resets WFB cooldown when the owl itself is off cooldown.' },
          ];

          const SOURCE_BADGE_STYLES: Record<string, { bg: string; border: string; color: string }> = {
            'MMO-Champion': { bg: 'rgba(251,146,60,.15)', border: '#fb923c', color: '#fb923c' },
            'Wowhead': { bg: 'rgba(96,165,250,.15)', border: '#60a5fa', color: '#60a5fa' },
            'Blizzard': { bg: 'rgba(217,119,6,.15)', border: '#d97706', color: '#d97706' },
          };

          const isNew48h = (dateStr: string) => {
            try { return (Date.now() - new Date(dateStr).getTime()) < 48 * 60 * 60 * 1000; } catch { return false; }
          };

          const buildRows = [
            { label: '🎯 SINGLE TARGET', hero: 'sentinel', heroLabel: 'Sentinel', targets: 1, heroColor: '#38bdf8', recommended: true },
            { label: '🎯 SINGLE TARGET', hero: 'packLeader', heroLabel: 'Pack Leader', targets: 1, heroColor: '#c084fc', recommended: false },
            { label: '💥 AOE / M+', hero: 'sentinel', heroLabel: 'Sentinel', targets: 5, heroColor: '#38bdf8', recommended: true },
            { label: '💥 AOE / M+', hero: 'packLeader', heroLabel: 'Pack Leader', targets: 5, heroColor: '#c084fc', recommended: false },
          ];

          // Estimate DPS for each build card using a default character
          const defaultChar = parsedChar || { stats: { agility: 1635, attackPower: 1717, haste: 10.58, crit: 20.13, mastery: 30.16, versatility: 8.28 }, character: {} };

          return (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

            {/* ═══ SECTION 1: OPTIMAL BUILDS ═══ */}
            <div>
              <LBL>🌿 Optimal Talent Builds</LBL>
              <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 16, fontWeight: 700, color: C.textMid, marginBottom: 8 }}>Community-verified · Midnight 12.0.1 Pre-Season</p>

              {/* Legend */}
              <div style={{ display: "flex", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
                {[
                  { label: 'Core', dot: '#93c5fd', bg: '#1e2d45' },
                  { label: 'Single Target', dot: '#d8b4fe', bg: '#1e1040', sup: 'ST' },
                  { label: 'Multi-Target', dot: '#6ee7b7', bg: '#0f2a1a', sup: 'AoE' },
                ].map(l => (
                  <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Rajdhani',sans-serif", fontSize: 15, fontWeight: 700, color: C.textDim }}>
                    {l.sup ? (
                      <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 10, color: l.dot, background: l.bg, padding: '2px 6px', borderRadius: 3, fontWeight: 700 }}>{l.sup}</span>
                    ) : (
                      <span style={{ color: l.dot, fontSize: 14 }}>●</span>
                    )}
                    {l.label}
                  </div>
                ))}
              </div>

              {/* ST Divider */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1, height: 1, background: C.borderSub }} />
                <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 12, letterSpacing: 3, color: '#1c2333', fontWeight: 900 }}>SINGLE TARGET</span>
                <div style={{ flex: 1, height: 1, background: C.borderSub }} />
              </div>

              {/* ST builds */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                {buildRows.filter(b => b.targets === 1).map((build, bi) => {
                  const opt = getOptimalTalents(build.targets, build.hero);
                  const estDps = runSimulation(defaultChar, build.targets, 300, build.hero, build.targets > 2 ? 'aoe' : 'st', 1.0, simcLiveData).totalDps;
                  return (
                    <div key={`st-${bi}`} style={{
                      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden',
                      borderTop: `3px solid ${build.heroColor}`, transition: 'border-color .2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#3d4f6a')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                    >
                      {/* Card Header */}
                      <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderBottom: `1px solid ${C.borderSub}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, fontWeight: 700, color: C.textSec }}>{build.label}</span>
                          <span className="badge" style={{ background: build.hero === 'sentinel' ? C.sentBg : C.packBg, color: build.heroColor, border: `1px solid ${build.hero === 'sentinel' ? C.sentBdr : C.packBdr}`, fontSize: 8 }}>
                            {build.hero === 'sentinel' ? '🦉' : '🐾'} {build.heroLabel}
                          </span>
                          {build.recommended && (
                            <span className="badge" style={{ background: C.greenBg, color: C.green, border: `1px solid ${C.greenBdr}`, fontSize: 7 }}>★ RECOMMENDED</span>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 16, color: C.goldLight, fontWeight: 700 }}>{fmt(Math.round(estDps))}</div>
                          <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 10, color: C.textDim }}>est. DPS</div>
                        </div>
                      </div>

                      {/* Talent Tags */}
                      <div style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                          {opt.selected.map(t => (
                            <span key={t.key} className={`tag ${t.always ? 'tag-core' : t.aoePriority ? 'tag-aoe' : 'tag-st'}`}>
                              {t.always && <span style={{ marginRight: 4 }}>•</span>}
                              {!t.always && t.aoePriority && <sup style={{ fontSize: 8, marginRight: 2 }}>AoE</sup>}
                              {!t.always && t.stPriority && <sup style={{ fontSize: 8, marginRight: 2 }}>ST</sup>}
                              {t.key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                            </span>
                          ))}
                        </div>

                        {/* Talent String */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: C.textDim, background: '#141c2a', borderRadius: 6, padding: '7px 12px', wordBreak: 'break-all', lineHeight: 1.5 }}>{opt.exportString}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <button className={`copy-btn ${copied === `talent-st-${bi}` ? 'done' : ''}`} onClick={() => copy(opt.exportString, `talent-st-${bi}`)}>{copied === `talent-st-${bi}` ? '✓ Copied' : 'Copy'}</button>
                            <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 9, color: C.textDim, whiteSpace: 'nowrap' }}>Esc → Talents → Import</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* AoE Divider */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1, height: 1, background: C.borderSub }} />
                <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 9, letterSpacing: 3, color: '#1c2333', fontWeight: 700 }}>AOE / M+</span>
                <div style={{ flex: 1, height: 1, background: C.borderSub }} />
              </div>

              {/* AoE builds */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {buildRows.filter(b => b.targets === 5).map((build, bi) => {
                  const opt = getOptimalTalents(build.targets, build.hero);
                  const estDps = runSimulation(defaultChar, build.targets, 300, build.hero, 'aoe', 1.0, simcLiveData).totalDps;
                  return (
                    <div key={`aoe-${bi}`} style={{
                      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden',
                      borderTop: `3px solid ${build.heroColor}`, transition: 'border-color .2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#3d4f6a')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                    >
                      <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderBottom: `1px solid ${C.borderSub}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, fontWeight: 700, color: C.textSec }}>{build.label}</span>
                          <span className="badge" style={{ background: build.hero === 'sentinel' ? C.sentBg : C.packBg, color: build.heroColor, border: `1px solid ${build.hero === 'sentinel' ? C.sentBdr : C.packBdr}`, fontSize: 8 }}>
                            {build.hero === 'sentinel' ? '🦉' : '🐾'} {build.heroLabel}
                          </span>
                          {build.recommended && (
                            <span className="badge" style={{ background: C.greenBg, color: C.green, border: `1px solid ${C.greenBdr}`, fontSize: 7 }}>★ RECOMMENDED</span>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 16, color: C.goldLight, fontWeight: 700 }}>{fmt(Math.round(estDps))}</div>
                          <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 10, color: C.textDim }}>est. DPS</div>
                        </div>
                      </div>
                      <div style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                          {opt.selected.map(t => (
                            <span key={t.key} className={`tag ${t.always ? 'tag-core' : t.aoePriority ? 'tag-aoe' : 'tag-st'}`}>
                              {t.always && <span style={{ marginRight: 4 }}>•</span>}
                              {!t.always && t.aoePriority && <sup style={{ fontSize: 8, marginRight: 2 }}>AoE</sup>}
                              {!t.always && t.stPriority && <sup style={{ fontSize: 8, marginRight: 2 }}>ST</sup>}
                              {t.key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                            </span>
                          ))}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: C.textDim, background: '#141c2a', borderRadius: 6, padding: '7px 12px', wordBreak: 'break-all', lineHeight: 1.5 }}>{opt.exportString}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <button className={`copy-btn ${copied === `talent-aoe-${bi}` ? 'done' : ''}`} onClick={() => copy(opt.exportString, `talent-aoe-${bi}`)}>{copied === `talent-aoe-${bi}` ? '✓ Copied' : 'Copy'}</button>
                            <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 9, color: C.textDim, whiteSpace: 'nowrap' }}>Esc → Talents → Import</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ═══ SECTION 2: HERO TALENT COMPARISON ═══ */}
            <div>
              <LBL>⚔ Hero Talent Comparison</LBL>

              {/* Performance Bars */}
              <CARD style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 14 }}>RELATIVE PERFORMANCE — MIDNIGHT 12.0 PRE-SEASON 1</div>
                {[
                  { label: 'Single Target', sentPct: 82, plPct: 75 },
                  { label: 'AoE / M+', sentPct: 95, plPct: 68 },
                ].map(row => (
                  <div key={row.label} style={{ marginBottom: 14 }}>
                    <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, marginBottom: 6, fontWeight: 600 }}>{row.label}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {/* Sentinel bar */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 11, color: '#38bdf8', fontWeight: 600 }}>🦉 Sentinel</span>
                          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: '#38bdf8' }}>{row.sentPct}%</span>
                        </div>
                        <div style={{ height: 8, background: '#141c2a', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${row.sentPct}%`, height: '100%', background: 'linear-gradient(90deg, #0c4a6e, #38bdf8)', borderRadius: 4, animation: 'barGrow .6s ease forwards' }} />
                        </div>
                      </div>
                      {/* Pack Leader bar */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 11, color: '#c084fc', fontWeight: 600 }}>🐾 Pack Leader</span>
                          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: '#c084fc' }}>{row.plPct}%</span>
                        </div>
                        <div style={{ height: 8, background: '#141c2a', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${row.plPct}%`, height: '100%', background: 'linear-gradient(90deg, #3b0764, #c084fc)', borderRadius: 4, animation: 'barGrow .6s ease forwards' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </CARD>

              {/* Side-by-side hero cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="responsive-grid">
                {Object.entries(MIDNIGHT_DATA.talents.hero).map(([key, hero]) => {
                  const heroColor = key === 'sentinel' ? '#38bdf8' : '#c084fc';
                  const heroBg = key === 'sentinel' ? C.sentBg : C.packBg;
                  const heroBdr = key === 'sentinel' ? C.sentBdr : C.packBdr;
                  const verdicts: Record<string, string> = {
                    packLeader: 'Pick this if your guild requires dual wield or you prefer a beast-proc playstyle.',
                    sentinel: 'Pick this for maximum performance in both raid and M+ — currently the stronger hero talent.',
                  };
                  const switchConditions: Record<string, string[]> = {
                    packLeader: [
                      'Raid requires dual wield weapon type',
                      'You have significantly better 1H weapons available',
                      'Guild composition already has Sentinel covered',
                    ],
                    sentinel: [
                      'You have access to a strong 2H polearm/staff',
                      'Running M+ where AoE performance is prioritized',
                      'Default choice for most content',
                    ],
                  };

                  return (
                    <div key={key} style={{
                      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
                      borderTop: `3px solid ${heroColor}`, overflow: 'hidden', transition: 'border-color .2s',
                      display: 'flex', flexDirection: 'column',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#3d4f6a')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                    >
                      {/* Card Header */}
                      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.borderSub}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 24 }}>{hero.icon}</span>
                          <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 14, fontWeight: 700, color: heroColor }}>{hero.name}</span>
                          {hero.recommended && (
                            <span className="badge" style={{ background: C.greenBg, color: C.green, border: `1px solid ${C.greenBdr}`, fontSize: 7 }}>★ RECOMMENDED</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                          <span className="badge" style={{ background: heroBg, color: heroColor, border: `1px solid ${heroBdr}`, fontSize: 8 }}>
                            {key === 'packLeader' ? '⚔ Dual Wield' : '🗡 2H Weapon'}
                          </span>
                          <span className="badge" style={{ background: '#141c2a', color: C.textSec, border: `1px solid ${C.border}`, fontSize: 8 }}>
                            ST +{Math.round(hero.stBonus * 100)}%
                          </span>
                          <span className="badge" style={{ background: '#141c2a', color: C.textSec, border: `1px solid ${C.border}`, fontSize: 8 }}>
                            AoE +{Math.round(hero.aoeBonus * 100)}%
                          </span>
                        </div>
                        <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: C.textDim, fontStyle: 'italic' }}>Defensive: {hero.defensiveBenefit}</div>
                      </div>

                      {/* Quick Verdict */}
                      <div style={{ padding: '12px 20px', background: heroBg, borderBottom: `1px solid ${C.borderSub}` }}>
                        <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, color: C.textSec, fontWeight: 700, margin: 0, lineHeight: 1.5 }}>
                          {verdicts[key]}
                        </p>
                      </div>

                      {/* Description */}
                      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.borderSub}` }}>
                        <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, lineHeight: 1.6, margin: 0 }}>{hero.desc}</p>
                      </div>

                      {/* Key Sub-Talents */}
                      <div style={{ padding: '14px 20px', flex: 1 }}>
                        <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 10 }}>KEY SUB-TALENTS</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {Object.entries(hero.subTalents).map(([sk, st]) => {
                            const meta = SUB_TALENT_META[key]?.[sk] || 'SITUATIONAL';
                            const mStyle = metaBadgeStyle(meta);
                            return (
                              <div key={sk} style={{
                                background: '#141c2a', border: `1px solid ${C.borderSub}`, borderRadius: 8, padding: '10px 12px',
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                  <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, color: heroColor, fontWeight: 700 }}>
                                    {sk.replace(/([A-Z])/g, ' $1').trim().replace(/^./, s => s.toUpperCase())}
                                  </span>
                                  <span style={{
                                    fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 1, fontWeight: 600,
                                    padding: '2px 8px', borderRadius: 10, ...mStyle,
                                  }}>{meta}</span>
                                </div>
                                <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>{st.desc}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* When to Switch */}
                      <div style={{ padding: '14px 20px', borderTop: `1px solid ${C.borderSub}` }}>
                        <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 8 }}>WHEN TO SWITCH</div>
                        <div style={{ background: heroBg, border: `1px solid ${heroBdr}`, borderRadius: 8, padding: '10px 14px' }}>
                          {switchConditions[key]?.map((cond, i) => (
                            <div key={i} style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: C.textMid, lineHeight: 1.8 }}>• {cond}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ═══ SECTION 3: KEY MIDNIGHT 12.0 CHANGES ═══ */}
            <div>
              <LBL>⚡ Key Midnight 12.0 Changes</LBL>
               <div
                ref={el => {
                  if (!el) return;
                  const handler = (ev: WheelEvent) => {
                    if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) return;
                    ev.preventDefault();
                    el.scrollLeft += ev.deltaY;
                  };
                  el.onwheel = handler;
                }}
                style={{ overflowX: 'auto', display: 'flex', gap: 12, paddingBottom: 8, cursor: 'grab' }}
              >
                {MIDNIGHT_CHANGES.map((change, i) => (
                  <div key={i} style={{
                    minWidth: 240, flexShrink: 0, background: C.surface, border: `1px solid ${C.border}`,
                    borderRadius: 12, padding: '16px 18px', transition: 'border-color .2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#3d4f6a')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 15, fontWeight: 700, color: C.goldLight }}>{change.title}</span>
                      <span style={{
                        fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 1, fontWeight: 600,
                        padding: '2px 8px', borderRadius: 10, background: change.badgeBg, color: change.badgeColor,
                        border: `1px solid ${change.badgeColor}40`,
                      }}>{change.badge}</span>
                    </div>
                    <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textSec, lineHeight: 1.6, margin: 0 }}>{change.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ═══ SECTION 4: LIVE PATCH NOTES ═══ */}
            <div>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                <LBL>📡 Live Patch Notes — Survival Hunter</LBL>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {patchLastUpdated && (
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: C.textDim }}>Last updated: {patchLastUpdated}</span>
                  )}
                  <button onClick={() => fetchPatchNotes(true)} disabled={patchLoading} style={{
                    background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 8px', cursor: patchLoading ? 'not-allowed' : 'pointer',
                    color: C.textDim, fontSize: 14, transition: 'all .2s', display: 'flex', alignItems: 'center',
                  }}>
                    <span style={{ display: 'inline-block', animation: patchLoading ? 'spin .8s linear infinite' : 'none' }}>↻</span>
                  </button>
                </div>
              </div>

              {/* Source filter pills */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                {['All', 'MMO-Champion', 'Wowhead', 'Blizzard'].map(src => (
                  <button key={src} onClick={() => setPatchSourceFilter(src)} style={{
                    background: patchSourceFilter === src ? C.gold : C.surface2,
                    border: `1px solid ${patchSourceFilter === src ? C.gold : C.border}`,
                    borderRadius: 20, padding: '5px 14px', cursor: 'pointer',
                    fontFamily: "'Rajdhani',sans-serif", fontSize: 12, fontWeight: 600, transition: 'all .2s',
                    color: patchSourceFilter === src ? '#fffbeb' : C.textDim,
                  }}>{src}</button>
                ))}
              </div>

              {/* Loading state */}
              {patchLoading && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} className="responsive-grid">
                  {[1, 2, 3].map(i => (
                    <div key={i} style={{
                      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, minHeight: 120,
                      animation: 'waitPulse 1.5s ease-in-out infinite',
                    }}>
                      <div style={{ height: 12, width: '40%', background: C.surface2, borderRadius: 4, marginBottom: 10 }} />
                      <div style={{ height: 10, width: '80%', background: C.surface2, borderRadius: 4, marginBottom: 6 }} />
                      <div style={{ height: 10, width: '60%', background: C.surface2, borderRadius: 4 }} />
                    </div>
                  ))}
                </div>
              )}

              {/* Error state */}
              {!patchLoading && patchError && (
                <CARD>
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, color: C.textMid, marginBottom: 10 }}>
                      {patchError}
                    </p>
                    <a href="https://www.mmo-champion.com/content/?2437491" target="_blank" rel="noopener noreferrer" style={{
                      fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: '#38bdf8', textDecoration: 'none',
                    }}>View manually at mmo-champion.com →</a>
                    <div style={{ marginTop: 10 }}>
                      <button onClick={() => fetchPatchNotes(true)} style={{
                        background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 14px',
                        cursor: 'pointer', fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: C.textMid, fontWeight: 600,
                      }}>Retry</button>
                    </div>
                  </div>
                </CARD>
              )}

              {/* Empty state */}
              {!patchLoading && !patchError && filteredNotes.length === 0 && (
                <CARD>
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, color: C.textMid, marginBottom: 8 }}>
                      No recent Survival Hunter patch notes found. Check back after the next hotfix.
                    </p>
                    <a href="https://www.mmo-champion.com/content/" target="_blank" rel="noopener noreferrer" style={{
                      fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: '#38bdf8', textDecoration: 'none',
                    }}>MMO-Champion Hotfix Tracker →</a>
                  </div>
                </CARD>
              )}

              {/* Patch note cards */}
              {!patchLoading && !patchError && filteredNotes.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'stretch' }} className="responsive-grid">
                  {filteredNotes.map((note, i) => {
                    const srcStyle = SOURCE_BADGE_STYLES[note.source] || SOURCE_BADGE_STYLES['Blizzard'];
                    return (
                      <div key={i} style={{
                        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px',
                        display: 'flex', flexDirection: 'column', transition: 'border-color .2s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = '#3d4f6a')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                          <span className="badge" style={{ background: srcStyle.bg, color: srcStyle.color, border: `1px solid ${srcStyle.border}`, fontSize: 7 }}>{note.source}</span>
                          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: C.textDim }}>{note.date}</span>
                          {isNew48h(note.pubDate) && (
                            <span className="badge" style={{ background: C.greenBg, color: C.green, border: `1px solid ${C.greenBdr}`, fontSize: 7 }}>NEW</span>
                          )}
                          {/hunter|survival/i.test(`${note.title} ${note.description}`) && (
                            <span className="badge" style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)', fontSize: 7 }}>🏹 HUNTER</span>
                          )}
                        </div>
                        <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 16, fontWeight: 700, color: C.textPri, marginBottom: 8, lineHeight: 1.3 }}>{note.title}</div>
                        <p style={{
                          fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textSec, lineHeight: 1.6, flex: 1,
                          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', margin: 0,
                        }} dangerouslySetInnerHTML={{ __html: highlightKeywords(note.description || '') }} />
                        <a href={note.link} target="_blank" rel="noopener noreferrer" style={{
                          fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: '#38bdf8', textDecoration: 'none', marginTop: 10, display: 'inline-block',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                        onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                        >Read Full Post →</a>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
          );
        })()}

        {/* ═══ REPORT TAB ═══ */}
        {activeTab === "report" && (
          <div>
            {!simResults || !simResults[0]?.detailed ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, gap: 12 }}>
                <div style={{ fontSize: 48, opacity: 0.3 }}>📊</div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 10, letterSpacing: 2, color: C.textDim }}>RUN A SIMULATION FIRST</div>
                <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, color: C.textMid, textAlign: "center", maxWidth: 260 }}>The detailed report shows ability breakdown, buff uptimes, and a full ability encyclopedia.</div>
              </div>
            ) : (() => {
              const primary = simResults[0];
              const detailed = primary.detailed;
              const actionEntries = Object.entries(detailed.actionCounts).sort((a, b) => b[1].dps - a[1].dps);
              const totalDps = primary.totalDps;
              const targetCount = primary.targets || 1;

              const ABILITY_NOTES: Record<string, string> = {
                "Kill Command": "Spam on cooldown for focus generation",
                "Raptor Strike": "Primary spender — stack Mongoose Fury first",
                "Raptor Swipe": "Cleave proc — always let it fire",
                "Wildfire Bomb": "Never cap charges — highest AoE priority",
                "Boomstick": "Use on CD — Shellshock amplifies ST damage",
                "Strike as One": "Passive pet attack — triggers on every ability",
                "Takedown": "Major CD — pool focus before using",
                "Flamefang Pitch": "Pre-place puddle for incoming adds",
                "Moonlight Chakram": "Use on CD for Sentinel builds",
                "Sentinel Mark + Lunar Storm": "Consumes mark — massive AoE burst",
                "Auto Attack (MH)": "Passive — ensure 100% uptime",
                "Auto Attack (OH)": "Passive — ensure melee range",
                "Pet (Claw)": "Passive pet damage — scales with AP",
                "Pet Melee": "Passive pet melee — keep pet alive",
                "Pack Leader Beasts": "Spawns from Kill Command procs",
                "Bear (Rend + Melee)": "Pack Leader beast — passive damage",
                "Coord. Assault": "Legacy CD — replaced by Takedown",
                "Kroluk's Warbanner": "Trinket proc — passive",
              };

              const CAT_BORDER = { DAMAGE: "#d97706", DOT: "#a78bfa", PET: "#60a5fa", COOLDOWN: "#fb923c", BUFF: "#4ade80" };
              const CAT_BG = { DAMAGE: "rgba(217,119,6,.12)", DOT: "rgba(167,139,250,.12)", PET: "rgba(96,165,250,.12)", COOLDOWN: "rgba(251,146,60,.12)", BUFF: "rgba(74,222,128,.12)" };

              const ABILITY_ENCYCLOPEDIA = [
                { name: "Kill Command", category: "DAMAGE", cd: "None (GCD)", range: "50 yd", cost: "Generates 20 Focus", description: "Commands your pet to savagely attack the target, dealing Physical damage. This is your primary focus generator — you press it constantly to fuel your Raptor Strike and other spenders. It has no cooldown beyond the GCD, making it spammable.", whyCast: "Kill Command is your engine. It generates the focus you need to use Raptor Strike and keeps your rotation flowing. In Pack Leader builds, it also triggers beast spawns for extra damage.", mistake: "Sitting on full focus and still pressing Kill Command — you waste the focus generation. Spend first, then generate." },
                { name: "Raptor Strike", category: "DAMAGE", cd: "None (GCD)", range: "Melee", cost: "30 Focus", description: "A vicious melee strike dealing heavy Physical damage. This is your primary focus spender and builds Mongoose Fury stacks that increase its own damage.", whyCast: "Raptor Strike is your main damage spender. Each cast stacks Mongoose Fury, increasing subsequent hits. During 6-stack windows, this is your hardest-hitting button.", mistake: "Spending Raptor Strike at low Mongoose Fury stacks instead of waiting for 5-6 stacks to maximize the damage multiplier." },
                { name: "Wildfire Bomb", category: "DAMAGE", cd: "18s (2 charges)", range: "40 yd", cost: "Free", description: "Hurls a bomb at the target, dealing Fire damage on impact and leaving a burning area. Has 2 charges via Grenade Juggler. Triggers Lethal Calibration for +15% crit damage.", whyCast: "Free damage on a charge system — never let both charges cap. Applies Lethal Calibration which buffs your entire rotation's crit damage for 12 seconds.", mistake: "Letting both charges sit at full while pressing other abilities. WFB charges should always be cycling." },
                { name: "Boomstick", category: "DAMAGE", cd: "60s", range: "40 yd", cost: "Free", description: "Fires a massive frontal cone blast dealing heavy Physical damage. Replaces Fury of the Eagle. Shellshock talent gives +40% single-target damage.", whyCast: "Your highest single-hit damage ability. Use on cooldown for burst. Shellshock makes it devastating in single target.", mistake: "Holding Boomstick for AoE when Shellshock is talented — it's a single-target powerhouse, use it on CD." },
                { name: "Strike as One", category: "PET", cd: "Passive", range: "Melee (pet)", cost: "None", description: "Every damaging ability you cast causes your pet to immediately strike the target. During Takedown, Raptor Swipe triggers it at 300% damage.", whyCast: "Pure passive throughput — the more buttons you press, the more pet attacks fire. ABC (Always Be Casting) directly increases SaO damage.", mistake: "Having dead GCDs or downtime. Every empty GCD is a missed Strike as One proc." },
                { name: "Takedown", category: "COOLDOWN", cd: "90s", range: "Melee", cost: "Generates 50 Focus", description: "Deals heavy damage and amplifies all your damage by 20% for 8 seconds. Also generates 50 Focus. Your most important burst cooldown.", whyCast: "20% damage amplification for 8 seconds is enormous. Time your highest damage abilities (Raptor Strike at max Fury, Boomstick) inside this window.", mistake: "Using Takedown when your other CDs aren't ready. Always pair with Coordinated Assault when possible." },
                { name: "Flamefang Pitch", category: "DAMAGE", cd: "30s (2 charges)", range: "40 yd", cost: "Free", description: "Throws a fiery projectile that creates a fire puddle on the ground, dealing sustained AoE damage. Great for pre-placing damage on incoming adds.", whyCast: "Free AoE damage on a charge system. Pre-place on pull locations in M+ for passive damage while mobs are gathered.", mistake: "Throwing it at targets that will move out of the puddle immediately." },
                { name: "Raptor Swipe", category: "DAMAGE", cd: "Passive (proc)", range: "Melee", cost: "Free", description: "Apex talent proc — 25% chance on Raptor Strike, 100% during Takedown. Cleaves nearby enemies. Triggers Strike as One.", whyCast: "Free cleave damage that triggers SaO. During Takedown, every Raptor Strike guarantees a Swipe, making it your highest priority window.", mistake: "Trying to 'fish' for procs outside Takedown. Just play normally — procs come naturally." },
                { name: "Coordinated Assault", category: "COOLDOWN", cd: "120s", range: "Self", cost: "None", description: "Major 2-minute cooldown that enhances your combat effectiveness. Pair with Takedown for maximum burst.", whyCast: "Your anchor cooldown. Every other CD should be planned around CA's availability at 0:00, 2:00, and 4:00.", mistake: "Using Takedown at 1:30 when CA returns at 2:00. Hold Takedown 30s to align." },
                { name: "Serpent Sting", category: "DOT", cd: "None", range: "40 yd", cost: "10 Focus", description: "Applies a poison DoT to the target. Low priority in the rotation but useful for maintaining damage during movement phases.", whyCast: "Movement filler — when you can't be in melee, Serpent Sting keeps damage rolling.", mistake: "Refreshing the DoT too early or prioritizing it over melee abilities when in range." },
                { name: "Pet (Kill Command procs)", category: "PET", cd: "Passive", range: "Pet range", cost: "None", description: "Your pet's auto attacks and special abilities triggered by Kill Command. Pet damage scales with your Attack Power and Mastery (Spirit Bond).", whyCast: "Passive throughput. Keep your pet alive and attacking at all times. Pet damage is 15-20% of your total.", mistake: "Letting your pet die or dismissing it accidentally. Always have Mend Pet ready." },
              ];

              const toggleSection = (key: string) => setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
              const isOpen = (key: string) => !collapsedSections[key];

              const dL = (s: number) => { const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, "0")}`; };

              // Export report as text
              const exportReport = () => {
                const lines = [
                  `SURVIVAL HUNTER SIM REPORT`,
                  `═══════════════════════════`,
                  `Hero: ${heroTalent === 'sentinel' ? 'Sentinel' : 'Pack Leader'} | Targets: ${targetCount} | Duration: ${dL(fightDuration)} | Style: ${FIGHT_STYLES[fightStyle]?.label || 'Patchwerk'}`,
                  `TOTAL DPS: ${fmt(Math.round(totalDps))}`,
                  ``,
                  `ABILITY BREAKDOWN`,
                  `─────────────────`,
                  ...actionEntries.map(([ability, data]) => `  ${ability.padEnd(28)} ${fmt(Math.round(data.dps)).padStart(8)} DPS  ${data.percentage.toFixed(1).padStart(5)}%  ${String(data.count).padStart(4)} casts`),
                  ``,
                  `STAT WEIGHTS`,
                  `────────────`,
                  ...(statWeights ? Object.entries(statWeights.weights).sort((a, b) => b[1].normalized - a[1].normalized).map(([stat, w]) => `  ${stat.padEnd(16)} ${w.normalized.toFixed(3)}`) : ['  (not calculated)']),
                  ``,
                  `Generated by Survival Hunter Sim · Midnight 12.0`,
                ];
                navigator.clipboard.writeText(lines.join('\n'));
                setCopied('report');
                setTimeout(() => setCopied(''), 2000);
              };

              // Section divider component
              const SectionDivider = ({ id, label, icon }: { id: string; label: string; icon: string }) => (
                <div
                  onClick={() => toggleSection(id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "14px 0", cursor: "pointer",
                    borderBottom: `1px solid ${C.border}`, marginTop: 24, marginBottom: isOpen(id) ? 16 : 0,
                    userSelect: "none",
                  }}
                >
                  <span style={{ fontSize: 16 }}>{icon}</span>
                  <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 10, letterSpacing: 3, color: C.goldLight, fontWeight: 700, flex: 1 }}>{label}</span>
                  <span style={{
                    fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, color: C.textDim,
                    transform: isOpen(id) ? "rotate(0deg)" : "rotate(-90deg)",
                    transition: "transform .2s ease",
                  }}>▼</span>
                </div>
              );

              return (
                <>
                {/* ═══ STICKY HEADER ═══ */}
                <div style={{
                  position: "sticky", top: 0, zIndex: 20,
                  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
                  padding: "10px 16px", marginBottom: 16,
                  display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10,
                  boxShadow: "0 4px 16px rgba(0,0,0,.3)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    {[
                      { label: "HERO", value: heroTalent === 'sentinel' ? '🦉 Sentinel' : '🐾 Pack Leader', color: heroTalent === 'sentinel' ? C.sentClr : C.packClr },
                      { label: "TARGETS", value: `${targetCount}T`, color: C.textPri },
                      { label: "DURATION", value: dL(fightDuration), color: C.textMid },
                    ].map(chip => (
                      <div key={chip.label} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                        <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 1, color: C.textDim }}>{chip.label}</span>
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: chip.color, fontWeight: 600 }}>{chip.value}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 18, color: C.goldLight, fontWeight: 700 }}>{fmt(Math.round(totalDps))} <span style={{ fontSize: 10, color: C.textDim }}>DPS</span></div>
                    <button onClick={exportReport} style={{
                      background: C.goldBg, border: `1px solid ${C.gold}60`, borderRadius: 6,
                      padding: "6px 12px", cursor: "pointer",
                      fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 1.5, color: C.goldLight, fontWeight: 700,
                    }}>{copied === 'report' ? '✓ COPIED' : '📋 EXPORT'}</button>
                  </div>
                </div>

                {/* ═══ SECTION: ABILITY BREAKDOWN ═══ */}
                <SectionDivider id="breakdown" label="ABILITY BREAKDOWN" icon="📊" />
                {isOpen("breakdown") && (
                  <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 20 }} className="responsive-grid">
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <CARD>
                        <LBL>📊 Simulation Summary</LBL>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                          {[
                            { label: "HERO", value: heroTalent === 'sentinel' ? '🦉 Sentinel' : '🐾 Pack Leader', color: heroTalent === 'sentinel' ? C.sentClr : C.packClr },
                            { label: "DURATION", value: dL(fightDuration), color: C.goldLight },
                            { label: "TARGETS", value: `${targetCount}T`, color: C.textPri },
                            { label: "STYLE", value: FIGHT_STYLES[fightStyle]?.label?.replace(/^[^\s]+\s/, '') || 'Patchwerk', color: C.textMid },
                          ].map(chip => (
                            <div key={chip.label} className="stat-chip" style={{ padding: "6px 10px", flex: "1 1 auto", minWidth: 80 }}>
                              <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 1, color: C.textDim, marginBottom: 2 }}>{chip.label}</div>
                              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: chip.color, fontWeight: 600 }}>{chip.value}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Rajdhani',sans-serif", fontSize: 13 }}>
                            <thead>
                              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                                {["Ability", "DPS", "%", "Casts", "Avg/Cast", "Notes"].map(h => (
                                  <th key={h} style={{ padding: "8px 6px", textAlign: h === "Ability" || h === "Notes" ? "left" : "right", fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 1, color: C.textDim, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {actionEntries.map(([ability, data]) => (
                                <tr key={ability} style={{ borderBottom: `1px solid ${C.borderSub}` }}>
                                  <td style={{ padding: "6px 6px", fontWeight: 600 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: bClr(ability), flexShrink: 0 }} />
                                      <span style={{ color: C.textSec, whiteSpace: "nowrap" }}>{ability}</span>
                                    </div>
                                  </td>
                                  <td style={{ padding: "6px 6px", color: C.goldLight, fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, textAlign: "right" }}>{fmt(Math.round(data.dps))}</td>
                                  <td style={{ padding: "6px 6px", color: C.textMid, fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, textAlign: "right" }}>{data.percentage.toFixed(1)}%</td>
                                  <td style={{ padding: "6px 6px", color: C.textMid, fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, textAlign: "right" }}>{data.count}</td>
                                  <td style={{ padding: "6px 6px", color: C.textMid, fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, textAlign: "right" }}>{data.avgHit.toLocaleString()}</td>
                                  <td style={{ padding: "6px 6px", color: C.textDim, fontSize: 11, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ABILITY_NOTES[ability] || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr style={{ borderTop: `2px solid ${C.gold}` }}>
                                <td style={{ padding: "10px 6px", fontFamily: "'Orbitron',sans-serif", fontSize: 9, letterSpacing: 1, color: C.goldLight, fontWeight: 700 }}>TOTAL</td>
                                <td style={{ padding: "10px 6px", fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, color: C.goldLight, fontWeight: 700, textAlign: "right" }}>{fmt(Math.round(totalDps))}</td>
                                <td style={{ padding: "10px 6px", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: C.goldLight, textAlign: "right" }}>100%</td>
                                <td colSpan={3} />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </CARD>
                      <CARD>
                        <LBL>⏱ Buff Uptimes</LBL>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {Object.entries(detailed.buffUptimes).map(([name, data]) => (
                            <div key={name}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                                <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textSec, fontWeight: 600 }}>{name}</span>
                                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: C.goldLight }}>{Math.round(data.uptime * 100)}%</span>
                              </div>
                              <div style={{ height: 4, background: C.surface2, borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ height: "100%", borderRadius: 2, width: `${data.uptime * 100}%`, background: C.green, transition: "width .5s ease" }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </CARD>
                    </div>
                    <div style={{ maxHeight: "calc(100vh - 180px)", overflowY: "auto", paddingRight: 4 }}>
                      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
                        <LBL>📖 Ability Encyclopedia</LBL>
                        <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, marginBottom: 16, lineHeight: 1.5 }}>
                          Every Survival Hunter ability used in the rotation — explained for beginners and optimizers alike.
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                          {ABILITY_ENCYCLOPEDIA.map(ability => {
                            const catColor = CAT_BORDER[ability.category] || C.textDim;
                            const catBg = CAT_BG[ability.category] || "transparent";
                            return (
                              <div key={ability.name} style={{ background: C.surface2, border: `1px solid ${C.borderSub}`, borderLeft: `4px solid ${catColor}`, borderRadius: "0 10px 10px 0", padding: "16px 18px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                                  <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 13, fontWeight: 700, color: C.textPri, letterSpacing: 0.5 }}>{ability.name}</span>
                                  <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 1.5, fontWeight: 700, padding: "3px 8px", borderRadius: 4, background: catBg, color: catColor, border: `1px solid ${catColor}40` }}>{ability.category}</span>
                                </div>
                                <div style={{ display: "flex", gap: 16, marginBottom: 10, flexWrap: "wrap" }}>
                                  {[{ label: "CD", value: ability.cd }, { label: "Range", value: ability.range }, { label: "Cost", value: ability.cost }].map(m => (
                                    <div key={m.label} style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
                                      <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 1, color: C.textDim }}>{m.label}:</span>
                                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: C.textMid }}>{m.value}</span>
                                    </div>
                                  ))}
                                </div>
                                <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, lineHeight: 1.65, margin: "0 0 12px 0" }}>{ability.description}</p>
                                <div style={{ background: "rgba(217,119,6,.08)", border: "1px solid rgba(217,119,6,.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
                                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 2, color: C.goldLight, marginBottom: 5 }}>WHY YOU CAST IT</div>
                                  <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textSec, lineHeight: 1.6, margin: 0 }}>{ability.whyCast}</p>
                                </div>
                                <div style={{ background: "rgba(248,113,113,.06)", border: "1px solid rgba(248,113,113,.15)", borderRadius: 8, padding: "10px 14px" }}>
                                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 2, color: C.red, marginBottom: 5 }}>COMMON MISTAKE</div>
                                  <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, lineHeight: 1.6, margin: 0 }}>{ability.mistake}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══ SECTION: SPELL SEQUENCE ═══ */}
                <SectionDivider id="sequence" label="SPELL SEQUENCE TIMELINE" icon="⏱" />
                {isOpen("sequence") && (() => {
                  const ABBREV: Record<string, string> = {
                    "Kill Command": "KC", "Mongoose Bite": "MB", "Raptor Strike": "MB",
                    "Wildfire Bomb": "WFB", "Boomstick": "BS", "Serpent Sting": "SS",
                    "Raptor Swipe": "RS", "Flamefang Pitch": "FP", "Takedown": "TD",
                    "Coordinated Assault": "CA", "Coord. Assault": "CA",
                    "Strike as One": "SaO", "Moonlight Chakram": "MC",
                    "Auto Attack (MH)": "AA", "Auto Attack (OH)": "AA2",
                  };

                  const isSentinel = heroTalent === 'sentinel';

                  const SEQUENCE = isSentinel ? [
                    { t: 0.0, ability: "Coordinated Assault", reason: "Pop major CD immediately for opening burst" },
                    { t: 0.0, ability: "Takedown", reason: "Pair with CA — 20% damage amp for 8s" },
                    { t: 0.5, ability: "Strike as One", reason: "Auto-triggered by Takedown" },
                    { t: 1.0, ability: "Wildfire Bomb", reason: "Applies Lethal Calibration (+15% crit dmg)" },
                    { t: 1.5, ability: "Strike as One", reason: "Auto-triggered by WFB" },
                    { t: 2.0, ability: "Boomstick", reason: "Shellshock amplified during TD window" },
                    { t: 2.5, ability: "Strike as One", reason: "Auto-triggered by Boomstick" },
                    { t: 3.5, ability: "Kill Command", reason: "Builds Mongoose Fury via crits" },
                    { t: 4.0, ability: "Strike as One", reason: "Auto-triggered by KC" },
                    { t: 4.5, ability: "Raptor Strike", reason: "Spender — stacks Mongoose Fury" },
                    { t: 5.0, ability: "Strike as One", reason: "Auto-triggered by Raptor Strike" },
                    { t: 5.5, ability: "Raptor Swipe", reason: "100% proc during Takedown" },
                    { t: 6.5, ability: "Kill Command", reason: "Keep pressing for focus + fury stacks" },
                    { t: 7.5, ability: "Raptor Strike", reason: "Spend at high fury stacks" },
                    { t: 8.5, ability: "Wildfire Bomb", reason: "2nd charge — maintain Lethal Calibration" },
                    { t: 9.5, ability: "Kill Command", reason: "Focus generator" },
                    { t: 10.5, ability: "Raptor Strike", reason: "Mongoose Fury window" },
                    { t: 12.0, ability: "Kill Command", reason: "Maintain rotation flow" },
                    { t: 13.0, ability: "Raptor Strike", reason: "Spend before fury expires" },
                    { t: 14.5, ability: "Kill Command", reason: "Refill focus" },
                    { t: 15.5, ability: "Flamefang Pitch", reason: "Off CD — free damage" },
                    { t: 17.0, ability: "Kill Command", reason: "Continue rotation" },
                    { t: 18.0, ability: "Raptor Strike", reason: "Primary spender" },
                    { t: 19.0, ability: "Wildfire Bomb", reason: "Charge available — keep cycling" },
                    { t: 20.0, ability: "Kill Command", reason: "Focus generation" },
                    { t: 21.5, ability: "Raptor Strike", reason: "Spend focus" },
                    { t: 23.0, ability: "Kill Command", reason: "Rotation filler" },
                    { t: 24.5, ability: "Raptor Strike", reason: "Continue spending" },
                    { t: 26.0, ability: "Kill Command", reason: "Build resources" },
                    { t: 27.5, ability: "Wildfire Bomb", reason: "Charge reset" },
                    { t: 29.0, ability: "Raptor Strike", reason: "Maintain damage flow" },
                  ] : [
                    { t: 0.0, ability: "Coordinated Assault", reason: "Pop major CD at pull" },
                    { t: 0.0, ability: "Takedown", reason: "Pair with CA for burst" },
                    { t: 0.5, ability: "Strike as One", reason: "Auto-triggered by Takedown" },
                    { t: 1.0, ability: "Wildfire Bomb", reason: "Lethal Calibration" },
                    { t: 1.5, ability: "Strike as One", reason: "Auto-triggered by WFB" },
                    { t: 2.0, ability: "Boomstick", reason: "Shellshock burst" },
                    { t: 3.0, ability: "Kill Command", reason: "May spawn Pack Leader beast" },
                    { t: 4.0, ability: "Raptor Strike", reason: "Spender — builds Fury" },
                    { t: 5.0, ability: "Raptor Swipe", reason: "100% proc during Takedown" },
                    { t: 6.0, ability: "Kill Command", reason: "Focus + Fury stacks" },
                    { t: 7.0, ability: "Raptor Strike", reason: "Spend at high stacks" },
                    { t: 8.5, ability: "Wildfire Bomb", reason: "2nd charge" },
                    { t: 9.5, ability: "Kill Command", reason: "Focus gen" },
                    { t: 10.5, ability: "Raptor Strike", reason: "Mongoose Fury window" },
                    { t: 12.0, ability: "Kill Command", reason: "Maintain flow" },
                    { t: 13.5, ability: "Raptor Strike", reason: "Spend before expiry" },
                    { t: 15.0, ability: "Flamefang Pitch", reason: "Off CD" },
                    { t: 16.5, ability: "Kill Command", reason: "Rotation" },
                    { t: 18.0, ability: "Wildfire Bomb", reason: "Charge cycle" },
                    { t: 19.5, ability: "Raptor Strike", reason: "Spender" },
                    { t: 21.0, ability: "Kill Command", reason: "Focus" },
                    { t: 22.5, ability: "Raptor Strike", reason: "Spend" },
                    { t: 24.0, ability: "Kill Command", reason: "Build" },
                    { t: 25.5, ability: "Wildfire Bomb", reason: "Reset" },
                    { t: 27.0, ability: "Raptor Strike", reason: "Maintain" },
                    { t: 29.0, ability: "Kill Command", reason: "Continue" },
                  ];

                  const cdMap = { "Coordinated Assault": 120, "Takedown": 90, "Wildfire Bomb": 18, "Boomstick": 60, "Flamefang Pitch": 30, "Moonlight Chakram": 90 };
                  const cdBars: Record<string, { start: number; end: number }[]> = {};
                  SEQUENCE.forEach(s => {
                    const cd = cdMap[s.ability]; if (!cd) return;
                    if (!cdBars[s.ability]) cdBars[s.ability] = [];
                    cdBars[s.ability].push({ start: s.t, end: Math.min(s.t + cd, 30) });
                  });

                  const uniqueAbilities = [...new Set(SEQUENCE.map(s => s.ability))];
                  const TIMELINE_WIDTH = 1800;
                  const LANE_HEIGHT = 28;
                  const PILL_HEIGHT = 20;

                  return (
                    <CARD>
                      <LBL>⏱ Spell Sequence Timeline — First 30 Seconds</LBL>
                      <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, marginBottom: 14, lineHeight: 1.5 }}>
                        {isSentinel ? "🦉 Sentinel" : "🐾 Pack Leader"} opener rotation · Theoretical optimal cast sequence
                      </p>
                      <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${C.border}` }}>
                        <div style={{ position: "relative", width: TIMELINE_WIDTH, minHeight: uniqueAbilities.length * LANE_HEIGHT + 30, background: "#0d1117", padding: "8px 0 0 0" }}>
                          {Array.from({ length: 31 }, (_, i) => (
                            <div key={i} style={{ position: "absolute", left: `${(i / 30) * 100}%`, top: 0, bottom: 0, borderLeft: i === 0 ? "none" : `1px solid ${i % 5 === 0 ? '#2e3a50' : '#1a2236'}`, zIndex: 0 }}>
                              {i % 5 === 0 && <span style={{ position: "absolute", bottom: 4, left: 4, fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: C.textDim }}>{i}s</span>}
                            </div>
                          ))}
                          {uniqueAbilities.map((ability) => {
                            const color = bClr(ability);
                            const abbrev = ABBREV[ability] || ability.slice(0, 3).toUpperCase();
                            const laneCasts = SEQUENCE.filter(s => s.ability === ability);
                            const cdBarList = cdBars[ability] || [];
                            return (
                              <div key={ability} style={{ position: "relative", height: LANE_HEIGHT, marginLeft: 0 }}>
                                {cdBarList.map((cd, ci) => (
                                  <div key={ci} style={{ position: "absolute", left: `${(cd.start / 30) * 100}%`, width: `${((cd.end - cd.start) / 30) * 100}%`, top: PILL_HEIGHT + 2, height: 4, background: "rgba(90,106,130,.25)", borderRadius: 2, zIndex: 1 }} />
                                ))}
                                {laneCasts.map((cast, ci) => (
                                  <div key={ci} style={{ position: "absolute", left: `${(cast.t / 30) * 100}%`, top: 2, height: PILL_HEIGHT, minWidth: 36, padding: "0 8px", background: color, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2, boxShadow: `0 2px 6px ${color}40` }}>
                                    <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, fontWeight: 700, color: "#fff", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{abbrev}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div style={{ marginTop: 20 }}>
                        <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 10 }}>OPENING SEQUENCE — FIRST 12 CASTS</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                          {SEQUENCE.slice(0, 12).map((cast, i) => {
                            const mins = Math.floor(cast.t / 60);
                            const secs = (cast.t % 60).toFixed(cast.t % 1 === 0 ? 0 : 1).padStart(cast.t % 1 === 0 ? 2 : 4, '0');
                            const ts = `${mins}:${secs}`;
                            const color = bClr(cast.ability);
                            return (
                              <div key={i} style={{ display: "grid", gridTemplateColumns: "48px 10px 160px 1fr", gap: 10, padding: "8px 10px", borderRadius: 6, background: i % 2 === 0 ? "transparent" : C.borderSub, alignItems: "center" }}>
                                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: C.textDim, textAlign: "right" }}>{ts}</span>
                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                                <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, color, fontWeight: 700 }}>{cast.ability}</span>
                                <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, lineHeight: 1.4 }}>→ {cast.reason}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(251,191,36,.06)", border: "1px solid rgba(217,119,6,.2)", borderRadius: 8 }}>
                        <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, margin: 0, lineHeight: 1.6 }}>
                          ⚠ This is a theoretical optimal sequence. Real combat varies based on movement, proc timing, Focus availability, and fight mechanics. Use this as a mental model, not a rigid script.
                        </p>
                      </div>
                    </CARD>
                  );
                })()}

                {/* ═══ SECTION: MONGOOSE FURY ═══ */}
                <SectionDivider id="mongoose" label="MONGOOSE FURY WINDOW" icon="🐍" />
                {isOpen("mongoose") && (() => {
                  const ap = primary?.attackPower || parsedChar?.stats?.attackPower || 45000;
                  const mbBase = Math.round(ap * 1.60);
                  const STACK_COLORS = ["#1a2236","#1e3a2a","#1f4a2e","#225a32","#258a3a","#28a744","#22c55e"];
                  const WINDOW_DURATION = 14;
                  const RAMP_END = 6;
                  const MB_CASTS = [6.5, 8.0, 9.5, 11.0, 12.5];
                  const missedStackDps = Math.round((mbBase * 0.15 * MB_CASTS.length) / WINDOW_DURATION);

                  return (
                    <CARD>
                      <LBL>🐍 Mongoose Fury Window Analyzer</LBL>
                      <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, marginBottom: 16, lineHeight: 1.5 }}>
                        Mongoose Fury stacks up to 6 via Kill Command crits (Mongoose Rounds). Each stack = +15% Mongoose Bite damage. Window lasts 14 seconds from first stack.
                      </p>
                      <div style={{ background: "#0d1117", borderRadius: 8, border: `1px solid ${C.border}`, padding: 16, marginBottom: 16 }}>
                        <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                          <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim }}>FURY WINDOW — 14 SECONDS</span>
                        </div>
                        <div style={{ display: "flex", marginBottom: 6 }}>
                          <div style={{ width: `${(RAMP_END / WINDOW_DURATION) * 100}%`, textAlign: "center" }}>
                            <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 2, color: "#22c55e", background: "rgba(34,197,94,.1)", padding: "2px 8px", borderRadius: 4 }}>RAMP PHASE</span>
                          </div>
                          <div style={{ flex: 1, textAlign: "center" }}>
                            <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 2, color: C.goldLight, background: C.goldBg, padding: "2px 8px", borderRadius: 4 }}>SPEND PHASE</span>
                          </div>
                        </div>
                        <div style={{ position: "relative", height: 48, borderRadius: 6, overflow: "hidden", background: "#1a2236", marginBottom: 8 }}>
                          {[0,1,2,3,4,5,6].map((s, i) => {
                            const segStart = i === 0 ? 0 : (i / 6) * RAMP_END;
                            const segEnd = ((i + 1) / 6) * RAMP_END;
                            if (segEnd > RAMP_END && i > 0) return null;
                            return (
                              <div key={i} style={{ position: "absolute", left: `${(segStart / WINDOW_DURATION) * 100}%`, width: `${((Math.min(segEnd, RAMP_END) - segStart) / WINDOW_DURATION) * 100}%`, top: 0, bottom: 0, background: STACK_COLORS[i], display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 10, fontWeight: 700, color: i >= 4 ? "#fff" : C.textDim }}>{i <= 6 ? `${i}` : ""}</span>
                              </div>
                            );
                          })}
                          <div style={{ position: "absolute", left: `${(RAMP_END / WINDOW_DURATION) * 100}%`, right: 0, top: 0, bottom: 0, background: "rgba(217,119,6,.12)" }} />
                          {MB_CASTS.map((t, i) => (
                            <div key={i} style={{ position: "absolute", left: `${(t / WINDOW_DURATION) * 100}%`, top: 4, bottom: 4, width: 4, background: C.goldLight, borderRadius: 2, boxShadow: `0 0 8px ${C.goldLight}60` }}>
                              <span style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", fontFamily: "'Orbitron',sans-serif", fontSize: 7, color: C.goldLight, whiteSpace: "nowrap" }}>MB</span>
                            </div>
                          ))}
                          <div style={{ position: "absolute", left: `${(RAMP_END / WINDOW_DURATION) * 100}%`, top: 0, bottom: 0, width: 2, background: "#fff", opacity: 0.3 }} />
                        </div>
                        <div style={{ position: "relative", height: 16 }}>
                          {[0, 2, 4, 6, 8, 10, 12, 14].map(t => (
                            <span key={t} style={{ position: "absolute", left: `${(t / WINDOW_DURATION) * 100}%`, transform: "translateX(-50%)", fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: C.textDim }}>{t}s</span>
                          ))}
                        </div>
                      </div>
                      <div style={{ background: C.borderSub, borderRadius: 8, padding: 14, marginBottom: 16 }}>
                        <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 10 }}>STACK DAMAGE SCALING</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 6 }}>
                          {[
                            { label: "1 stack MB", mult: "×1.15", dmg: fmt(Math.round(mbBase * 1.15)), color: STACK_COLORS[1] },
                            { label: "3 stack MB", mult: "×1.45", dmg: fmt(Math.round(mbBase * 1.45)), color: STACK_COLORS[3] },
                            { label: "6 stack MB", mult: "×1.90", dmg: fmt(Math.round(mbBase * 1.90)), color: STACK_COLORS[6] },
                          ].map((row, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", borderRadius: 6, background: row.color + "30", border: `1px solid ${row.color}50` }}>
                              <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textSec }}>{row.label}</span>
                              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: row.color, fontWeight: 700 }}>{row.mult} = {row.dmg}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(248,113,113,.08)", border: "1px solid rgba(248,113,113,.2)", borderRadius: 6 }}>
                          <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.red }}>
                            ⚠ Missed stack = ~{fmt(missedStackDps)} DPS lost per window ({Math.round(missedStackDps / (primary?.totalDps || 1) * 100 * 10) / 10}% of total)
                          </span>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                        {[
                          { title: "Build Efficiently", icon: "🏗️", color: "#22c55e", text: "Don't cast Mongoose Bite while building stacks unless you're about to cap Focus. KC crits build stacks faster — more crit = faster ramp." },
                          { title: "Spend at Max", icon: "💥", color: C.goldLight, text: "Wait for 5–6 stacks before unloading Mongoose Bites. The damage difference between 3 stacks and 6 stacks is enormous (45% vs 90%)." },
                          { title: "Tip of the Spear Sync", icon: "🎯", color: "#60a5fa", text: "Kill Command generates Tip of the Spear charges. Save 3 charges and spend them during your 6-stack Mongoose Bite window for maximum synergy." },
                        ].map((tip, i) => (
                          <div key={i} style={{ background: C.surface2, borderRadius: 8, border: `1px solid ${C.border}`, borderTop: `3px solid ${tip.color}`, padding: 14 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                              <span style={{ fontSize: 16 }}>{tip.icon}</span>
                              <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 9, letterSpacing: 1.5, color: tip.color, fontWeight: 700 }}>{tip.title.toUpperCase()}</span>
                            </div>
                            <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, lineHeight: 1.6, margin: 0 }}>{tip.text}</p>
                          </div>
                        ))}
                      </div>
                    </CARD>
                  );
                })()}

                {/* ═══ SECTION: STRIKE AS ONE ═══ */}
                <SectionDivider id="sao" label="STRIKE AS ONE" icon="⚔️" />
                {isOpen("sao") && (() => {
                  const ap = primary?.attackPower || parsedChar?.stats?.attackPower || 45000;
                  const saoBase = Math.round(ap * 1.10);
                  const isPL = heroTalent === "packLeader";
                  const triggerAbils = ["Raptor Strike", "Kill Command", "Wildfire Bomb", "Boomstick", "Raptor Swipe"];
                  const tdMultiplier = 3.0;
                  const saoTdDmg = Math.round(saoBase * tdMultiplier);
                  const tamTargets = 3;
                  const tamPerTarget = 0.15;

                  const SAO_SEQUENCE = [
                    { t: 0.0, trigger: "Raptor Strike" }, { t: 1.2, trigger: "Kill Command" },
                    { t: 2.0, trigger: "Wildfire Bomb" }, { t: 3.0, trigger: "Raptor Strike" },
                    { t: 4.0, trigger: "Boomstick" }, { t: 5.2, trigger: "Raptor Swipe" },
                    { t: 6.5, trigger: "Kill Command" }, { t: 7.5, trigger: "Raptor Strike" },
                  ];

                  const TRIGGER_COLORS = { "Raptor Strike": BAR_COLORS["Raptor Strike"], "Kill Command": BAR_COLORS["Kill Command"], "Wildfire Bomb": BAR_COLORS["Wildfire Bomb"], "Boomstick": BAR_COLORS["Boomstick"], "Raptor Swipe": BAR_COLORS["Raptor Swipe"] };
                  const TIMELINE_SECS = 10;

                  return (
                    <CARD>
                      <LBL>⚔️ Strike as One Analyzer</LBL>
                      <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, marginBottom: 16, lineHeight: 1.5 }}>
                        Strike as One is Survival's highest-throughput passive. Every damaging ability triggers your pet to attack for {fmt(saoBase)} damage. During Takedown, Raptor Swipe triggers SaO at <span style={{ color: C.goldLight, fontWeight: 700 }}>300% damage</span> ({fmt(saoTdDmg)}).
                        {isPL ? " As Pack Leader, your beast summons also benefit from SaO synergies." : " As Sentinel, Spirit Bond mastery amplifies all SaO damage."}
                      </p>
                      <div style={{ background: "#0d1117", borderRadius: 8, border: `1px solid ${C.border}`, padding: 16, marginBottom: 16 }}>
                        <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 12 }}>TRIGGER CHAIN — EVERY ABILITY FIRES SaO</div>
                        <div style={{ position: "relative", overflowX: "auto" }}>
                          <div style={{ position: "relative", width: Math.max(800, TIMELINE_SECS * 80), height: 70 }}>
                            {Array.from({ length: TIMELINE_SECS + 1 }, (_, i) => (
                              <div key={i} style={{ position: "absolute", left: `${(i / TIMELINE_SECS) * 100}%`, top: 0, bottom: 0, borderLeft: i === 0 ? "none" : `1px solid ${i % 2 === 0 ? '#2e3a50' : '#1a2236'}` }}>
                                {i % 2 === 0 && <span style={{ position: "absolute", bottom: 2, left: 4, fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: C.textDim }}>{i}s</span>}
                              </div>
                            ))}
                            {SAO_SEQUENCE.map((cast, i) => {
                              const color = TRIGGER_COLORS[cast.trigger] || "#64748b";
                              const abbrevMap = { "Raptor Strike": "RS", "Kill Command": "KC", "Wildfire Bomb": "WFB", "Boomstick": "BS", "Raptor Swipe": "RSw" };
                              return (
                                <Fragment key={i}>
                                  <div style={{ position: "absolute", left: `${(cast.t / TIMELINE_SECS) * 100}%`, top: 2, height: 20, minWidth: 36, padding: "0 6px", background: color, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2, boxShadow: `0 2px 6px ${color}40` }}>
                                    <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>{abbrevMap[cast.trigger] || cast.trigger.slice(0, 3)}</span>
                                  </div>
                                  <div style={{ position: "absolute", left: `calc(${(cast.t / TIMELINE_SECS) * 100}% + 4px)`, top: 32, height: 18, minWidth: 30, padding: "0 5px", background: "#22c55e", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2, opacity: 0.85 }}>
                                    <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, fontWeight: 700, color: "#fff" }}>SaO</span>
                                  </div>
                                  <div style={{ position: "absolute", left: `calc(${(cast.t / TIMELINE_SECS) * 100}% + 14px)`, top: 22, height: 10, width: 2, background: "rgba(34,197,94,.4)", zIndex: 1 }} />
                                </Fragment>
                              );
                            })}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
                          <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 1.5, color: C.textDim }}>TRIGGERS:</span>
                          {triggerAbils.map(a => (
                            <div key={a} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <div style={{ width: 8, height: 8, borderRadius: "50%", background: BAR_COLORS[a] || "#64748b" }} />
                              <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 11, color: C.textMid }}>{a}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{ background: C.borderSub, borderRadius: 8, padding: 14, marginBottom: 16 }}>
                        <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 10 }}>DAMAGE VALUES</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 6 }}>
                          {[
                            { label: "Base SaO hit", dmg: fmt(saoBase), color: "#22c55e", sub: "110% AP per trigger" },
                            { label: "During Takedown", dmg: fmt(saoTdDmg), color: C.goldLight, sub: "Raptor Swipe → 300% SaO" },
                            { label: `Two Against Many (${tamTargets}T)`, dmg: fmt(Math.round(saoBase * (1 + tamTargets * tamPerTarget) * tamTargets)), color: "#38bdf8", sub: `+${tamTargets} targets, +15% per target` },
                          ].map((row, i) => (
                            <div key={i} style={{ padding: "8px 12px", borderRadius: 6, background: `${row.color}10`, border: `1px solid ${row.color}30` }}>
                              <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: C.textDim, marginBottom: 2 }}>{row.label}</div>
                              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 16, color: row.color, fontWeight: 700 }}>{row.dmg}</div>
                              <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 11, color: C.textMid }}>{row.sub}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                        {[
                          { title: "Never Stop Pressing Buttons", icon: "⚡", color: "#22c55e", text: "SaO fires on EVERY damaging ability. Dead GCDs = missed SaO procs. ABC: Always Be Casting." },
                          { title: "Takedown is King", icon: "👑", color: C.goldLight, text: "During Takedown, Raptor Swipe triggers SaO at 300% damage. This makes Raptor Swipe your highest-priority button in the 8s window." },
                          { title: "Two Against Many (AoE)", icon: "🐺", color: "#38bdf8", text: "In AoE, Two Against Many makes SaO hit +2 targets with +15% per target. SaO becomes your top damage source on 3+ targets." },
                        ].map((tip, i) => (
                          <div key={i} style={{ background: C.surface2, borderRadius: 8, border: `1px solid ${C.border}`, borderTop: `3px solid ${tip.color}`, padding: 14 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                              <span style={{ fontSize: 16 }}>{tip.icon}</span>
                              <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 9, letterSpacing: 1.5, color: tip.color, fontWeight: 700 }}>{tip.title.toUpperCase()}</span>
                            </div>
                            <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, lineHeight: 1.6, margin: 0 }}>{tip.text}</p>
                          </div>
                        ))}
                      </div>
                    </CARD>
                  );
                })()}

                {/* ═══ SECTION: COOLDOWN ALIGNMENT ═══ */}
                <SectionDivider id="cooldowns" label="COOLDOWN ALIGNMENT" icon="🔄" />
                {isOpen("cooldowns") && (() => {
                  const FIGHT_DUR = 300;
                  const isSent = heroTalent === "sentinel";
                  const COOLDOWNS = [
                    { name: "Coordinated Assault", cd: 120, color: BAR_COLORS["Coord. Assault"] || "#e879f9", abbr: "CA" },
                    { name: "Takedown", cd: 90, color: BAR_COLORS["Takedown"] || "#93c5fd", abbr: "TD" },
                    { name: "Flamefang Pitch", cd: 60, color: BAR_COLORS["Flamefang Pitch"] || "#22d3ee", abbr: "FP" },
                    { name: "Wildfire Bomb", cd: 18, color: BAR_COLORS["Wildfire Bomb"] || "#f59e0b", abbr: "WFB", chargeReset: true },
                    ...(isSent ? [{ name: "Sentinel Owl", cd: 30, color: BAR_COLORS["Sentinel Mark + Lunar Storm"] || "#38bdf8", abbr: "OWL" }] : []),
                  ];
                  const castMap: Record<string, number[]> = {};
                  COOLDOWNS.forEach(cd => { const casts: number[] = []; for (let t = 0; t <= FIGHT_DUR; t += cd.cd) casts.push(t); castMap[cd.name] = casts; });
                  const allTimes = new Set<number>(); Object.values(castMap).forEach(arr => arr.forEach(t => allTimes.add(t)));
                  const burstWindows: { t: number; cds: string[]; label: string }[] = [];
                  Array.from(allTimes).sort((a, b) => a - b).forEach(t => {
                    const aligned = COOLDOWNS.filter(cd => castMap[cd.name].some(ct => Math.abs(ct - t) <= 3));
                    if (aligned.length >= 3 && !burstWindows.some(bw => Math.abs(bw.t - t) < 5))
                      burstWindows.push({ t, cds: aligned.map(c => c.abbr), label: "" });
                  });
                  burstWindows.forEach((bw, i) => {
                    const mins = Math.floor(bw.t / 60); const secs = Math.round(bw.t % 60);
                    const ts = `${mins}:${String(secs).padStart(2, "0")}`;
                    const hasCA = bw.cds.includes("CA");
                    bw.label = i === 0 ? `${ts} — OPENER: ${bw.cds.join(" + ")} all align. Full send.`
                      : hasCA ? `${ts} — MAJOR BURST: ${bw.cds.join(" + ")} align. Pop everything.`
                      : `${ts} — MINI BURST: ${bw.cds.join(" + ")} align. No CA yet.`;
                  });
                  const CHART_W = 1200; const ROW_H = 36;
                  return (
                    <CARD>
                      <LBL>🔄 Cooldown Alignment — 5-Minute Fight</LBL>
                      <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, marginBottom: 16, lineHeight: 1.5 }}>
                        Lining up major cooldowns for simultaneous burst windows is the difference between good and great Survival play.
                      </p>
                      <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 16 }}>
                        <div style={{ position: "relative", width: CHART_W, minHeight: COOLDOWNS.length * ROW_H + 30, background: "#0d1117", padding: "0 0 24px 0" }}>
                          {burstWindows.map((bw, i) => (
                            <div key={`bw-${i}`} style={{ position: "absolute", left: `${(bw.t / FIGHT_DUR) * 100}%`, top: 0, bottom: 0, width: 20, background: "rgba(217,119,6,0.15)", borderTop: `3px solid ${C.gold}`, zIndex: 1 }} />
                          ))}
                          {Array.from({ length: 11 }, (_, i) => i * 30).map(t => (
                            <div key={t} style={{ position: "absolute", left: `${(t / FIGHT_DUR) * 100}%`, top: 0, bottom: 0, borderLeft: `1px solid ${t % 60 === 0 ? '#2e3a50' : '#1a2236'}`, zIndex: 0 }}>
                              <span style={{ position: "absolute", bottom: 4, left: 4, fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: C.textDim }}>{Math.floor(t / 60)}:{String(t % 60).padStart(2, "0")}</span>
                            </div>
                          ))}
                          {COOLDOWNS.map((cd) => {
                            const casts = castMap[cd.name];
                            return (
                              <div key={cd.name} style={{ position: "relative", height: ROW_H, display: "flex", alignItems: "center" }}>
                                <div style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 1, color: cd.color, zIndex: 5, background: "#0d1117", padding: "2px 6px", borderRadius: 3, whiteSpace: "nowrap", opacity: 0.9 }}>{cd.abbr}</div>
                                {casts.length > 1 && <div style={{ position: "absolute", left: `${(casts[0] / FIGHT_DUR) * 100}%`, width: `${((casts[casts.length - 1] - casts[0]) / FIGHT_DUR) * 100}%`, top: "50%", height: 2, transform: "translateY(-50%)", background: `${cd.color}25`, zIndex: 2 }} />}
                                {casts.slice(0, -1).map((t, ci) => (
                                  <div key={ci} style={{ position: "absolute", left: `${(t / FIGHT_DUR) * 100}%`, width: `${(cd.cd / FIGHT_DUR) * 100}%`, top: "50%", height: 4, transform: "translateY(-50%)", background: `${cd.color}15`, borderRadius: 2, zIndex: 2 }} />
                                ))}
                                {casts.map((t, ci) => (
                                  <div key={ci} style={{ position: "absolute", left: `${(t / FIGHT_DUR) * 100}%`, top: "50%", transform: "translate(-50%, -50%)", width: 10, height: 10, borderRadius: "50%", background: cd.color, boxShadow: `0 0 8px ${cd.color}60`, zIndex: 3, border: burstWindows.some(bw => Math.abs(bw.t - t) <= 3) ? `2px solid ${C.goldLight}` : "none" }} />
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div style={{ background: C.borderSub, borderRadius: 8, padding: 14, marginBottom: 16 }}>
                        <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 10 }}>BURST WINDOWS</div>
                        {burstWindows.map((bw, i) => {
                          const hasCA = bw.cds.includes("CA");
                          return (
                            <div key={i} style={{ display: "flex", gap: 12, padding: "8px 10px", borderRadius: 6, background: hasCA ? "rgba(217,119,6,0.06)" : "transparent", borderLeft: `3px solid ${hasCA ? C.gold : C.border}`, marginBottom: 4, alignItems: "flex-start" }}>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", minWidth: 120 }}>
                                {bw.cds.map(abbr => { const cdi = COOLDOWNS.find(c => c.abbr === abbr); return <span key={abbr} style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 1, color: cdi?.color || C.textSec, background: `${cdi?.color || C.textSec}15`, padding: "2px 6px", borderRadius: 4 }}>{abbr}</span>; })}
                              </div>
                              <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, lineHeight: 1.5 }}>{bw.label}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ background: C.goldBg, borderRadius: 8, border: `1px solid ${C.gold}40`, borderTop: `3px solid ${C.gold}`, padding: 16 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 16 }}>🔑</span>
                          <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 9, letterSpacing: 1.5, color: C.goldLight, fontWeight: 700 }}>KEY PRINCIPLE</span>
                        </div>
                        <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, color: C.textSec, lineHeight: 1.7, margin: 0 }}>
                          <strong style={{ color: C.goldLight }}>Coordinated Assault is your anchor.</strong> Plan every other cooldown to be available when CA comes off cooldown at 2:00 and 4:00. If Takedown is not available during a CA window, you lost a burst window — avoid using Takedown outside of CA when possible in longer fights.
                        </p>
                      </div>
                    </CARD>
                  );
                })()}

                {/* ═══ SECTION: STAT WEIGHTS ═══ */}
                <SectionDivider id="stats" label="STAT WEIGHTS EXPLAINED" icon="📈" />
                {isOpen("stats") && (() => {
                  const STAT_DATA = [
                    { stat: "Agility", weight: statWeights?.weights?.['Agility']?.normalized || 1.00, color: C.goldLight, desc: "Your primary stat. Every point of Agility increases Attack Power directly and scales all your abilities. Always prioritize item level." },
                    { stat: "Haste", weight: statWeights?.weights?.['Haste']?.normalized || 0.84, color: "#60a5fa", desc: "Reduces GCD and most cooldowns. More Haste = more Kill Command casts per minute = more Mongoose Fury stacks = more Mongoose Bite windows. Scales Wildfire Bomb frequency and the Boomstick loop." },
                    { stat: "Critical Strike", weight: statWeights?.weights?.['Crit']?.normalized || 0.78, color: "#f59e0b", desc: "Strong during Mongoose Fury windows (MB crits hit hard at 6 stacks). Kill Command crits also build Mongoose Fury stacks faster with Mongoose Rounds." },
                    { stat: "Mastery: Spirit Bond", weight: statWeights?.weights?.['Mastery']?.normalized || 0.71, color: "#a78bfa", desc: "Increases pet damage (Kill Command, pet basics) and your own damage multiplicatively. Scales better at higher item level when pet becomes a larger portion of your damage." },
                    { stat: "Versatility", weight: statWeights?.weights?.['Versatility']?.normalized || 0.65, color: "#34d399", desc: "Flat damage increase and damage reduction. Solid floor stat, never terrible, never outstanding. Good for survivability in M+." },
                  ].sort((a, b) => b.weight - a.weight);

                  const maxW = STAT_DATA[0].weight;

                  // Upgrade simulator calc
                  const ilvlDiff = upgradeTo - upgradeFrom;
                  const dpsPerIlvl = totalDps * 0.008; // ~0.8% per ilvl
                  const estimatedGain = Math.round(ilvlDiff * dpsPerIlvl);

                  return (
                    <CARD>
                      <LBL>📈 Stat Weights Explained</LBL>
                      <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, marginBottom: 20, lineHeight: 1.5 }}>
                        How much each stat contributes to your DPS, normalized to Agility = 1.00. Higher = more valuable per point of rating.
                      </p>

                      {/* Bar chart */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
                        {STAT_DATA.map(s => (
                          <div key={s.stat}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                              <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 10, letterSpacing: 1, color: s.color, fontWeight: 700 }}>{s.stat}</span>
                              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, color: s.color, fontWeight: 700 }}>{s.weight.toFixed(2)}</span>
                            </div>
                            <div style={{ height: 10, background: C.surface2, borderRadius: 5, overflow: "hidden", marginBottom: 6 }}>
                              <div style={{ height: "100%", width: `${(s.weight / maxW) * 100}%`, background: s.color, borderRadius: 5, transition: "width .5s ease", boxShadow: `0 0 8px ${s.color}40` }} />
                            </div>
                            <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: C.textMid, lineHeight: 1.5, margin: 0 }}>{s.desc}</p>
                          </div>
                        ))}
                      </div>

                      {/* Upgrade Simulator */}
                      <div style={{ background: C.borderSub, borderRadius: 8, padding: 16 }}>
                        <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.goldLight, marginBottom: 12 }}>⬆ UPGRADE SIMULATOR</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid }}>Current:</span>
                            <input type="number" value={upgradeFrom} onChange={e => setUpgradeFrom(Number(e.target.value))}
                              style={{ width: 70, padding: "6px 8px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.textPri, fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, outline: "none" }} />
                          </div>
                          <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 16, color: C.goldLight }}>→</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid }}>Upgrade:</span>
                            <input type="number" value={upgradeTo} onChange={e => setUpgradeTo(Number(e.target.value))}
                              style={{ width: 70, padding: "6px 8px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.textPri, fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, outline: "none" }} />
                          </div>
                        </div>
                        <div style={{ padding: "10px 14px", borderRadius: 8, background: ilvlDiff > 0 ? "rgba(74,222,128,.08)" : "rgba(248,113,113,.08)", border: `1px solid ${ilvlDiff > 0 ? "rgba(74,222,128,.2)" : "rgba(248,113,113,.2)"}` }}>
                          <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, color: ilvlDiff > 0 ? C.green : C.red, fontWeight: 600 }}>
                            Upgrading from {upgradeFrom} → {upgradeTo} = approximately <strong style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{ilvlDiff > 0 ? '+' : ''}{fmt(estimatedGain)} DPS</strong> ({ilvlDiff > 0 ? '+' : ''}{((ilvlDiff * 0.8)).toFixed(1)}% based on stat scaling)
                          </span>
                        </div>
                      </div>
                    </CARD>
                  );
                })()}

                </>
              );
            })()}
          </div>
        )}
        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 48, paddingTop: 24, borderTop: `1px solid ${C.borderSub}` }}>
          <p style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 3, color: C.textDim }}>SURVIVAL HUNTER SIM · MIDNIGHT 12.0 PRE-SEASON 1 · INTERNAL ENGINE</p>
          {simcSyncStatus === 'synced' && simcSyncInfo && (
            <p style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: C.textDim, marginTop: 4 }}>
              SimC Data: {simcSyncInfo}
            </p>
          )}
        </div>
      </div>

      {/* Item Tooltip */}
      {hoveredItem && (() => {
        const gearPiece = parsedChar?.gear?.find((g: any) => String(g.itemId) === String(hoveredItem));
        const item = itemCache[hoveredItem];
        const qualityColors = { LEGENDARY: '#ff8000', EPIC: '#a335ee', RARE: '#0070dd', UNCOMMON: '#1eff00', COMMON: '#ffffff', POOR: '#9d9d9d' };
        const quality = gearPiece?.quality || item?.quality?.type || 'EPIC';
        const nameColor = qualityColors[quality] || '#a335ee';
        const displayName = gearPiece?.name || item?.name || 'Unknown Item';
        const displayIlvl = gearPiece?.ilvl || item?.preview_item?.level?.value || item?.level;
        // Use equipped item stats from equipment API (accurate to ilvl), fallback to base item template
        const equippedStats = gearPiece?.itemStats;
        const templateStats = item?.preview_item?.stats;

        return (
          <div style={{
            position: "fixed",
            pointerEvents: "none",
            zIndex: 9999,
            background: "linear-gradient(180deg,#141c2a,#0c1220)",
            border: `1px solid #2e4a6a`,
            borderRadius: 10,
            padding: "14px 16px",
            maxWidth: 320,
            minWidth: 220,
            boxShadow: "0 8px 32px rgba(0,0,0,.6)",
            fontFamily: "'Rajdhani',sans-serif",
            left: Math.min(tooltipPos.x, typeof window !== 'undefined' ? window.innerWidth - 340 : tooltipPos.x),
            top: Math.max(8, Math.min(tooltipPos.y, typeof window !== 'undefined' ? window.innerHeight - 300 : tooltipPos.y)),
          }}>
            {pendingItemFetchesRef.current.has(hoveredItem) && !item ? (
              <div style={{ color: C.textDim, fontSize: 12, fontStyle: "italic" }}>Loading item data...</div>
            ) : (
              <>
                {item?._icon && <img src={item._icon} style={{ width: 36, height: 36, borderRadius: 6, border: `1px solid ${C.border}`, marginRight: 10, float: "left" }} />}
                <div style={{ fontSize: 15, fontWeight: 700, color: nameColor, marginBottom: 4 }}>{displayName}</div>
                {displayIlvl && <div style={{ fontSize: 13, color: C.goldLight, marginBottom: 6 }}>Item Level {displayIlvl}</div>}
                {item?.item_subclass?.name && (
                  <div style={{ fontSize: 12, color: C.textDim, display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span>{item.item_subclass.name}</span>
                    {gearPiece?.slotLabel && <span>{gearPiece.slotLabel}</span>}
                  </div>
                )}
                {/* Show equipped stats (from equipment API — correct for actual ilvl) */}
                {equippedStats?.length > 0 ? equippedStats.map((s: any, i: number) => (
                  <div key={i} style={{ fontSize: 13, color: s.isEquipBonus ? '#1eff00' : C.textSec, padding: "1px 0" }}>
                    {s.isEquipBonus ? 'Equip: ' : '+'}{s.value} {s.name || s.type}
                  </div>
                )) : templateStats?.map((s: any, i: number) => (
                  <div key={i} style={{ fontSize: 13, color: C.textSec, padding: "1px 0" }}>+{s.value} {s.type?.name}</div>
                ))}
                {/* Enchantments */}
                {gearPiece?.enchantments?.length > 0 && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${C.borderSub}`, paddingTop: 4 }}>
                    {gearPiece.enchantments.map((enc: any, i: number) => {
                      const label = formatEnchantLabel(enc);
                      return label ? (
                        <div key={i} style={{ fontSize: 12, color: '#4ade80', padding: "1px 0" }}>✦ {label}</div>
                      ) : null;
                    })}
                  </div>
                )}
                {/* Gems */}
                {gearPiece?.sockets?.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    {gearPiece.sockets.map((s: any, i: number) => (
                      <div key={i} style={{ fontSize: 12, color: '#60a5fa', padding: "1px 0" }}>💎 {s.name || s.display}</div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* ── Talent Pill Tooltip ─────────────────────────────────────── */}
      {hoveredTalent && (() => {
        const t = hoveredTalent;
        const TYPE_CLR: Record<string,string> = {
          core: '#60a5fa', st: '#4ade80', aoe: '#f97316', hero: '#c084fc', hybrid: '#c084fc',
        };
        const TYPE_BG: Record<string,string> = {
          core: '#0c1a2e', st: '#0f2a1a', aoe: '#1f1000', hero: '#1a0e2e', hybrid: '#1a1033',
        };
        const TYPE_LBL: Record<string,string> = {
          core: 'CORE — ALWAYS ACTIVE', st: 'OPTIONAL — SINGLE TARGET',
          aoe: 'OPTIONAL — AoE / M+', hero: 'HERO TALENT', hybrid: 'OPTIONAL — HYBRID',
        };
        const clr = TYPE_CLR[t.type] || '#94a3b8';
        const bg  = TYPE_BG[t.type]  || C.surface2;
        return (
          <div
            onMouseEnter={() => { if (talentHideTimer.current) { window.clearTimeout(talentHideTimer.current); talentHideTimer.current = null; } }}
            onMouseLeave={handleTalentLeave}
            style={{
              position: "fixed", zIndex: 9999,
              left: talentTooltipPos.x, top: talentTooltipPos.y,
              width: 290,
              background: "linear-gradient(180deg,#141c2a 0%,#0c1220 100%)",
              border: `1px solid ${clr}55`,
              borderRadius: 12, padding: "14px 16px",
              boxShadow: "0 12px 48px rgba(0,0,0,.85)",
              fontFamily: "'Rajdhani',sans-serif",
              pointerEvents: "auto",
            }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                background: bg, border: `2px solid ${clr}66`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
              }}>
                {t.type === 'core' ? '🔒' : t.type === 'st' ? '🎯' : t.type === 'aoe' ? '💥' : t.type === 'hero' ? '✨' : '⚔'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: clr, lineHeight: 1.2 }}>
                  {t.name}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  <span style={{
                    fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 1.5,
                    color: clr, background: bg, border: `1px solid ${clr}44`,
                    borderRadius: 4, padding: "1px 7px", fontWeight: 700,
                  }}>{TYPE_LBL[t.type] ?? t.type.toUpperCase()}</span>
                  <span style={{
                    fontFamily: "'IBM Plex Mono',monospace", fontSize: 10,
                    color: t.points === 2 ? '#fbbf24' : C.textMid,
                    background: t.points === 2 ? '#2a1f08' : C.surface3,
                    border: `1px solid ${t.points === 2 ? '#78350f' : C.border}`,
                    borderRadius: 4, padding: "1px 7px", fontWeight: 700,
                  }}>{t.points} {t.points === 1 ? 'pt' : 'pts'}</span>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div style={{ borderTop: `1px solid ${C.borderSub}`, margin: "8px 0" }} />

            {/* Description */}
            <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>
              {t.desc}
            </div>

            {/* Core badge */}
            {t.type === 'core' && (
              <>
                <div style={{ borderTop: `1px solid ${C.borderSub}`, margin: "8px 0" }} />
                <div style={{ fontSize: 11, color: '#60a5fa', fontFamily: "'Orbitron',sans-serif", letterSpacing: 1 }}>
                  🔒 Required — cannot be removed from any build.
                </div>
              </>
            )}

            {/* Point cost note for 2pt */}
            {t.points === 2 && (
              <>
                <div style={{ borderTop: `1px solid ${C.borderSub}`, margin: "8px 0" }} />
                <div style={{ fontSize: 11, color: '#fbbf24' }}>
                  ⚠ 2-point talent — costs twice as many talent points. Budget carefully.
                </div>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}
