// @ts-nocheck
import { useState, useCallback, useEffect } from "react";
import { getFullCharacter, equipmentToSimData, getItemsBatch, getItem, getItemMedia } from "@/lib/blizzardApi";
import WowModelViewer from "@/components/WowModelViewer";

// ============================================================
// MIDNIGHT 12.0.1 SURVIVAL HUNTER SIMULATION ENGINE
// Sources: Azortharion (Trueshot Lodge), Method.gg (Symex), Maxroll (heleni),
//          Wowhead, Icy Veins, Mythicstats, Raidbots/SimC APL
// ============================================================

const MIDNIGHT_DATA = {
  baseStats: {
    attackPower: 7200,
    baseAgility: 3800,
    petDamageMultiplier: 0.42,
  },
  // Updated ability data based on Azortharion's HackMD analysis & SimC APL
  spells: {
    // Kill Command — no longer has a CD, 20 focus generator (with talent), filler/builder
    killCommand: { baseDmg: 2.7, apCoef: 1.23, cd: 0, focus: -20, aoeTargets: 1, note: 'No CD in Midnight. Spammable focus builder.' },
    // Raptor Strike — primary melee spender, 35 focus (40 base - 5 from talent)
    raptorStrike: { baseDmg: 1.86, apCoef: 0.96, cd: 0, focus: 35, aoeTargets: 1, note: 'Primary spender. Procs Mongoose Fury overlaps.' },
    // Wildfire Bomb — no focus cost, 254% AP primary, 182% AP secondary, enhanced by Sentinel Mark (+130%)
    wildfireBomb: { baseDmg: 3.81, apCoef: 1.54, cd: 18, focus: 0, aoeTargets: 8, dotDmg: 0.40, dotDuration: 6, note: 'No focus cost. Guerrilla Tactics +15%. Lethal Calibration: +15% crit dmg for 12s.' },
    // Boomstick — replaces Fury of the Eagle, frontal AoE, 1min CD
    boomstick: { baseDmg: 2.4, apCoef: 1.05, cd: 60, focus: 0, aoeTargets: 5, note: 'Replaces FotE. Shellshock: +40% ST (-5% per extra target). Mongoose Rounds: grants MF stacks.' },
    // Flamefang Pitch — ground-targeted AoE, 30s CD, leaves fire puddle
    flamefangPitch: { baseDmg: 3.2, apCoef: 1.25, cd: 30, focus: 0, aoeTargets: 8, dotDmg: 0.55, dotDuration: 8, note: 'Ground AoE + puddle. Grenade Juggler: +1 charge & grants WFB charge. Wildfire Imbuement: fire dmg buff 10s.' },
    // Takedown — replaces Coordinated Assault, 1:30 base CD (reducible to 1min via Savagery)
    takedown: { damageAmp: 0.20, cd: 90, duration: 8, focus: -50, note: 'Deals damage + 20% amp for 8s. Generates 50 focus. Flanked: hits 4 extra targets + 100% attack speed.' },
    // Raptor Swipe — Apex talent, 25% proc from Raptor Strike (100% during Takedown at rank 3)
    raptorSwipe: { baseDmg: 1.4, apCoef: 0.68, cd: 0, focus: -15, aoeTargets: 5, note: 'Apex talent. 25% from RS (100% during Takedown at rank 3). Pet attacks via Strike as One at 300%.' },
    // Hatchet Toss — baseline ranged poke, no rotational value unless Pack Leader (Hogstrider)
    hatchetToss: { baseDmg: 0.8, apCoef: 0.35, cd: 0, focus: 0, aoeTargets: 1, note: 'Ranged poke. Hogstrider: cleaves 4 targets +200% dmg. Currently not worth casting even talented.' },
    // Strike as One — passive, pet attacks on every damaging ability
    strikeAsOne: { baseDmg: 0.86, apCoef: 0.43, cd: 0, focus: 0, aoeTargets: 1, note: 'Passive. Two Against Many: +2 targets, +15% per target hit.' },
    // Moonlight Chakram — Sentinel only, available 15s after Takedown
    moonlightChakram: { baseDmg: 3.5, apCoef: 1.4, cd: 90, focus: 0, aoeTargets: 8, note: 'Sentinel only. Bounces between targets. Twilight Requiem: AoE explosion on expiry.' },
  },
  // Stat priority from Method.gg (Symex) — Midnight 12.0.1
  statPriority: {
    st: ['Agility', 'Mastery', 'Critical Strike = Haste', 'Versatility'],
    aoe: ['Agility', 'Mastery', 'Haste', 'Critical Strike', 'Versatility'],
    note: 'Mastery (Spirit Bond) increases you and pet damage. Mastery overtook Haste in Midnight due to Strike as One and pet-scaling changes.'
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
      // Core — always taken per Method/Maxroll builds
      mongooseFury: { dps: 0.10, stTarget: 0.14, aoe: 0.06, desc: "Raptor Strike increases RS damage by 10% for 8s. Multiple overlaps stack. ~2-3% real DPS from proper management (Azortharion).", always: true },
      strikeAsOne: { dps: 0.08, stTarget: 0.10, aoe: 0.06, desc: "All damaging abilities cause pet to attack. Two Against Many: +2 targets, +15% per enemy hit.", always: true },
      wildfireBomb: { dps: 0.14, stTarget: 0.11, aoe: 0.22, desc: "No focus cost. 254% AP primary / 182% AP secondary. Lethal Calibration: +15% crit dmg for 12s.", always: true },
      takedown: { dps: 0.08, stTarget: 0.12, aoe: 0.06, desc: "Replaces Coordinated Assault. 20% amp for 8s (10s Sentinel). Generates 50 focus. 1:30 base CD.", always: true },
      boomstick: { dps: 0.10, stTarget: 0.09, aoe: 0.14, desc: "Replaces Fury of the Eagle. Frontal AoE, 1m CD. Shellshock: +40% ST. Mongoose Rounds or Wildfire Shells.", always: true },
      raptorSwipe: { dps: 0.09, stTarget: 0.04, aoe: 0.16, desc: "Apex talent (4 points). 25% proc → 100% during Takedown. Rank 3: Strike as One at 300%. Focus refund.", always: true },
      // Situational ST
      savagery: { dps: 0.06, stTarget: 0.09, aoe: 0.03, desc: "2-point node: reduces Takedown CD by 15/30s. Enables 1-minute Takedown windows in raids.", stPriority: true },
      vulnerability: { dps: 0.05, stTarget: 0.07, aoe: 0.02, desc: "Raptor Strike and Boomstick deal 20% increased crit damage.", stPriority: true },
      mongooseRounds: { dps: 0.05, stTarget: 0.07, aoe: 0.03, desc: "Each Boomstick hit grants 1 Mongoose Fury stack. Good for pre-Takedown setup.", stPriority: true },
      // AoE talents
      flamefangPitch: { dps: 0.10, stTarget: 0.04, aoe: 0.18, desc: "30s CD ground AoE + fire puddle. 2nd charge via Grenade Juggler. Wildfire Imbuement: fire buff 10s.", aoePriority: true },
      grenadeJuggler: { dps: 0.04, stTarget: 0.01, aoe: 0.08, desc: "Flamefang Pitch gains 1 extra charge + grants 1 Wildfire Bomb charge.", aoePriority: true },
      wildfileShells: { dps: 0.04, stTarget: 0.02, aoe: 0.07, desc: "Each Boomstick hit reduces WFB CD by 4s. (Choice node vs Mongoose Rounds.)", aoePriority: true },
      shrapnelBomb: { dps: 0.03, stTarget: 0.01, aoe: 0.06, desc: "WFB periodic is now a bleed. Synergizes with Shower of Blood (+16% bleed).", aoePriority: true },
      flamebreak: { dps: 0.04, stTarget: 0.03, aoe: 0.07, desc: "All Fire damage +15%. Strong with Flamefang Pitch + Wildfire Imbuement.", aoePriority: true },
      // Passive buffs
      lethalCalibration: { dps: 0.06, stTarget: 0.07, aoe: 0.05, desc: "Throwing WFB increases crit damage by 15% for 12s. Maintain via CDR.", always: true },
      wildfireImbuement: { dps: 0.05, stTarget: 0.04, aoe: 0.07, desc: "Flamefang Pitch imbues weapon with fire. You and pet deal extra fire dmg for 10s.", aoePriority: true },
      twoAgainstMany: { dps: 0.04, stTarget: 0.02, aoe: 0.08, desc: "Strike as One hits +2 enemies, +15% damage per enemy struck.", aoePriority: true },
    },
    hero: {
      packLeader: {
        name: "Pack Leader",
        desc: "Focused on Kill Command and pet damage. Howl of the Pack Leader spawns Bear/Wyvern/Boar every 30s on Kill Command. Currently underperforms vs Sentinel in raids due to weak bleed talents and Hogstrider/Hatchet Toss not being worth casting. Dual wield synergy via Lethal Barbs focus regen from auto attacks.",
        stBonus: 0.05,
        aoeBonus: 0.07,
        mechanic: "killCommandProcs",
        defensiveBenefit: "Shell Cover: +10% DR on Survival of the Fittest (30% base → 40%)",
        weaponPref: "Dual Wield (1H Axes/Swords/Daggers)",
        recommended: false,
        subTalents: {
          lethalBarbs: { dps: 0.03, stTarget: 0.04, aoe: 0.02, desc: "Auto attacks generate 2 Focus each to you and pet. Strong for dual-wield builds." },
          hogstrider: { dps: 0.01, stTarget: 0.01, aoe: 0.01, desc: "Hatchet Toss cleaves 4 targets +200% damage. Currently not worth casting even with this talent (Method.gg)." },
          direSummons: { dps: 0.02, stTarget: 0.03, aoe: 0.02, desc: "Reduces beast spawn cooldown. Also reduces WFB CD by 6s when beast spawns." },
          shellCover: { dps: 0, stTarget: 0, aoe: 0, desc: "+10% DR on Survival of the Fittest. Defensive only." },
          stampede: { dps: 0.03, stTarget: 0.02, aoe: 0.04, desc: "Capstone: Takedown grants extra beast spawn → Stampede dealing damage in a line for 7s." },
        }
      },
      sentinel: {
        name: "Sentinel",
        desc: "Empowers Wildfire Bomb via Sentinel's Mark (20% proc from Raptor Strike, increased during Takedown). When consumed, triggers Lunar Storm (AoE capstone). Don't Look Back provides 10% max HP absorb shield. Currently preferred hero talent for both Raid and M+ (Method.gg/Maxroll).",
        stBonus: 0.07,
        aoeBonus: 0.12,
        mechanic: "sentinelMark",
        defensiveBenefit: "Don't Look Back: 10% max HP absorb on Sentinel's Mark consumption. Great for rot and one-shots.",
        weaponPref: "2H Weapon (Polearm/Staff)",
        recommended: true,
        subTalents: {
          dontLookBack: { dps: 0, stTarget: 0, aoe: 0, desc: "10% max HP absorb shield when Sentinel's Mark consumed. Best defensive in the tree." },
          moonlightChakram: { dps: 0.05, stTarget: 0.06, aoe: 0.08, desc: "New ability available 15s after Takedown. Bounces between targets dealing heavy damage." },
          lunarStorm: { dps: 0.04, stTarget: 0.04, aoe: 0.07, desc: "Capstone: AoE damage in 10yd radius when Sentinel's Mark consumed." },
          moonsBlessing: { dps: 0.03, stTarget: 0.03, aoe: 0.04, desc: "+10% Sentinel's Mark proc chance. WFB CD reduced by 6s on proc. Key enabler." },
          stargazer: { dps: 0.03, stTarget: 0.04, aoe: 0.02, desc: "Raptor Strike increases crit damage by 2% for 10s, stacking. (Choice vs Open Fire.)" },
          cantMissWontMiss: { dps: 0.03, stTarget: 0.04, aoe: 0.02, desc: "Raptor Strike +10% damage. Takedown duration +2s (→10s). Sentinel ST." },
          conditioning: { dps: 0, stTarget: 0, aoe: 0, desc: "+8% movement speed, -30s Cheetah CD. Mobility utility." },
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
    character: {},
    stats: { agility: 0, haste: 0, crit: 0, mastery: 0, versatility: 0, attackPower: 0 },
    gear: [],
    talents: null,
    valid: false,
    errors: []
  };

  if (!simcText || simcText.trim().length < 20) {
    result.errors.push("Input appears empty or too short.");
    return result;
  }

  const lines = simcText.trim().split('\n').map(l => l.trim());

  // Character info from individual lines (SimC addon format)
  const charLine = lines.find(l => /^(hunter|survival_hunter)/i.test(l));
  if (charLine) {
    // hunter="Blezaa" format
    const nameMatch = charLine.match(/^(?:hunter|survival_hunter)="([^"]+)"/i) || charLine.match(/name="([^"]+)"/);
    if (nameMatch) result.character.name = nameMatch[1];
  }
  // Individual key=value lines
  lines.forEach(line => {
    const kv = line.match(/^(\w+)=(.+)$/);
    if (!kv) return;
    const [, key, val] = kv;
    if (key === 'level') result.character.level = parseInt(val);
    if (key === 'race') result.character.race = val;
    if (key === 'server' || key === 'realm') result.character.realm = val;
    if (key === 'region') result.character.region = val;
  });

  // Parse stats from simc stat lines (if present)
  lines.forEach(line => {
    const statMatch = line.match(/^(\w+)=([0-9.]+)$/);
    if (!statMatch) return;
    const [, key, val] = statMatch;
    const v = parseFloat(val);
    if (key === 'agility') result.stats.agility = v;
    if (key === 'haste_rating') result.stats.haste = +(v / 180).toFixed(2);
    if (key === 'crit_rating') result.stats.crit = +(v / 180).toFixed(2);
    if (key === 'mastery_rating') result.stats.mastery = +(v / 180).toFixed(2);
    if (key === 'versatility_rating') result.stats.versatility = +(v / 205).toFixed(2);
    if (key === 'attack_power') result.stats.attackPower = v;
  });

  // Try to extract gear items
  const slotLabels: Record<string, string> = {
    head: 'Head', neck: 'Neck', shoulders: 'Shoulders', back: 'Back', chest: 'Chest',
    wrist: 'Wrist', hands: 'Hands', waist: 'Waist', legs: 'Legs', feet: 'Feet',
    finger1: 'Ring 1', finger2: 'Ring 2', trinket1: 'Trinket 1', trinket2: 'Trinket 2',
    main_hand: 'Main Hand', off_hand: 'Off Hand', tabard: 'Tabard', shirt: 'Shirt'
  };
  const gearSlotNames = Object.keys(slotLabels).join('|');
  const gearSlotPattern = new RegExp(`^(${gearSlotNames})=`);

  // Stop parsing gear once we hit "Gear from Bags" section
  const bagSectionIdx = lines.findIndex(l => /gear from bags/i.test(l));
  const equipLines = bagSectionIdx >= 0 ? lines.slice(0, bagSectionIdx) : lines;

  // Build a map of comment lines preceding gear lines: "# Item Name (ilvl)"
  const commentItemPattern = /^#\s+(.+?)\s+\((\d+)\)\s*$/;

  equipLines.forEach((line, idx) => {
    if (!gearSlotPattern.test(line)) return;
    const slotMatch = line.match(/^(\w+)=/);
    if (!slotMatch) return;

    const rawSlot = slotMatch[1];
    const slotKey = rawSlot.replace(/^shoulder$/, 'shoulders').replace(/^wrists$/, 'wrist');
    if (slotKey === 'tabard' || slotKey === 'shirt') return; // skip non-gear

    const idMatch = line.match(/,id=(\d+)/);

    // Look at the comment line immediately above for name & ilvl
    let itemName = slotLabels[slotKey] || slotKey;
    let ilvl = 0;
    if (idx > 0) {
      const prevLine = equipLines[idx - 1];
      const cm = prevLine.match(commentItemPattern);
      if (cm) {
        itemName = cm[1];
        ilvl = parseInt(cm[2]) || 0;
      }
    }

    // Fallback: try item_level= in the line itself
    const iLvlInline = line.match(/item_level=(\d+)/);
    if (iLvlInline) ilvl = parseInt(iLvlInline[1]);

    result.gear.push({
      slot: slotKey,
      slotLabel: slotLabels[slotKey] || slotKey,
      ilvl,
      itemId: idMatch ? idMatch[1] : null,
      name: itemName
    });
  });
  console.log('[SV-SIM] Parsed gear items:', result.gear.length);

  // Average ilvl
  if (result.gear.length > 0) {
    result.character.avgIlvl = Math.round(result.gear.reduce((sum, g) => sum + (g.ilvl || 0), 0) / result.gear.filter(g => g.ilvl > 0).length) || 0;
  }

  // Talent string
  const talentLine = lines.find(l => /^talents=/.test(l));
  if (talentLine) {
    result.talents = talentLine.replace('talents=', '').trim();
  }

  // If we got some useful data, mark valid
  if (result.character.name || result.stats.agility > 0 || result.gear.length > 0) {
    result.valid = true;
  } else {
    result.errors.push("Could not parse character data. Make sure you paste the full SimulationCraft addon export.");
  }

  // Estimate stats from average ilvl when explicit stat lines are missing
  const avgIlvl = result.character.avgIlvl || 0;
  if (result.stats.agility === 0 && avgIlvl > 0) {
    // Rough scaling: ilvl 200 ~ 6000 agi, ilvl 250 ~ 12000 agi
    result.stats.agility = Math.round(6000 + (avgIlvl - 200) * 120);
  }
  if (result.stats.agility === 0) result.stats.agility = 9500;
  if (result.stats.attackPower === 0) result.stats.attackPower = result.stats.agility * 2.1;

  // Estimate secondary stats from ilvl if not explicitly provided
  if (result.stats.haste === 0 && avgIlvl > 0) {
    // Estimate secondary ratings from ilvl. At ilvl 230, expect ~1800 rating per secondary stat.
    // Total secondary budget scales roughly as (ilvl - 150) * 80
    const totalSecondary = Math.max(0, (avgIlvl - 150) * 80);
    result.stats.haste = +(totalSecondary * 0.28 / 180).toFixed(2);       // ~28% budget → ~10% haste
    result.stats.crit = +(totalSecondary * 0.25 / 180).toFixed(2);        // ~25% → ~9% crit
    result.stats.mastery = +(totalSecondary * 0.30 / 180).toFixed(2);      // ~30% → ~11% mastery
    result.stats.versatility = +(totalSecondary * 0.17 / 205).toFixed(2);  // ~17% → ~5% vers
  }

  return result;
}

// ============================================================
// CORE DPS SIMULATION ENGINE
// Sources: SimC APL, Azortharion rotation priority, Method.gg coefficients
// ============================================================
function runSimulation(charData, targetCount, fightDuration, heroTalent, build) {
  const stats = charData.stats;
  const agi = stats.agility || 9500;
  const hasteBonus = 1 + (stats.haste || 8) / 100;
  const critBonus = 1 + ((stats.crit || 12) / 100) * 0.5;
  const masteryBonus = 1 + (stats.mastery || 10) / 100 * 0.9;
  const versBonus = 1 + (stats.versatility || 6) / 100;
  const ap = stats.attackPower || agi * 2.1;

  // Stat multiplier — haste excluded here (already affects cast speed via GCD)
  const statMult = critBonus * masteryBonus * versBonus;
  const T = targetCount;
  const gcdBase = 1.5 / hasteBonus;

  // Weapon normalization constant — calibrated so ilvl 230 (~20K AP) produces ~20K ST DPS
  const WEAPON_NORM = 1.5;

  // Rotation time fractions — how much GCD budget each ability uses
  const rot = build === 'st' ? {
    raptorStrike: 0.32,
    killCommand: 0.22,
    wildfireBomb: 0.10,
    boomstick: 0.06,
    takedown: 0.03,
    raptorSwipe: 0.04,
    moonlightChakram: heroTalent === 'sentinel' ? 0.02 : 0,
    hatchetToss: heroTalent === 'packLeader' ? 0.01 : 0,
  } : {
    raptorStrike: 0.18,
    killCommand: 0.14,
    wildfireBomb: 0.12,
    boomstick: 0.08,
    flamefangPitch: 0.08,
    takedown: 0.03,
    raptorSwipe: 0.10,
    moonlightChakram: heroTalent === 'sentinel' ? 0.02 : 0,
    hatchetToss: heroTalent === 'packLeader' ? 0.02 : 0,
  };

  let breakdown = {};

  // Core calc: (apCoef * AP / WEAPON_NORM) * statMult * castsPerSec * targets
  const calcAbility = (key, uptimeFraction, targetMult) => {
    const spell = MIDNIGHT_DATA.spells[key];
    if (!spell) return 0;
    const dmgPerCast = spell.apCoef * (ap / WEAPON_NORM) * statMult;
    const castsPerSec = uptimeFraction / gcdBase;
    return dmgPerCast * castsPerSec * targetMult;
  };

  // Raptor Strike — primary spender, Mongoose Fury overlap ~35% bonus
  breakdown['Raptor Strike'] = calcAbility('raptorStrike', rot.raptorStrike || 0, 1) * 1.35;

  // Kill Command — no CD, spammable focus builder
  breakdown['Kill Command'] = calcAbility('killCommand', rot.killCommand || 0, 1);

  // Wildfire Bomb — 8 target AoE, DoT component adds ~25%
  breakdown['Wildfire Bomb'] = calcAbility('wildfireBomb', rot.wildfireBomb || 0, Math.min(T, 8)) * 1.25;

  // Boomstick — Shellshock: +40% ST, -5% per extra target
  const shellshockMult = T === 1 ? 1.40 : Math.max(1, 1.40 - (T - 1) * 0.05);
  breakdown['Boomstick'] = calcAbility('boomstick', rot.boomstick || 0, Math.min(T, 5)) * shellshockMult;

  // Raptor Swipe (Apex talent)
  breakdown['Raptor Swipe'] = calcAbility('raptorSwipe', rot.raptorSwipe || 0, Math.min(T, 5));

  // Flamefang Pitch (AoE build)
  if (build === 'aoe' && rot.flamefangPitch) {
    breakdown['Flamefang Pitch'] = calcAbility('flamefangPitch', rot.flamefangPitch, Math.min(T, 8)) * 1.35;
  }

  // Strike as One — passive pet attacks from all abilities (~5-8% of total)
  const totalUptime = Object.values(rot).reduce((s, v) => s + v, 0);
  breakdown['Strike as One'] = (0.12 * (ap / WEAPON_NORM)) * statMult * (totalUptime / gcdBase) * Math.min(T, 3);

  // Pet baseline damage (Spirit Bond mastery scaling, auto attacks + basic attacks)
  // Pet does ~10-12% of total damage
  breakdown['Pet (Spirit Bond)'] = (0.10 * (ap / WEAPON_NORM)) * statMult * 1.5 * (build === 'st' ? 1 : 0.80);

  // Lethal Calibration (+15% crit dmg uptime from WFB)
  const lcUptime = Math.min(1, 12 / (18 / hasteBonus));
  const lcBase = (breakdown['Raptor Strike'] + breakdown['Kill Command'] + breakdown['Boomstick'] + breakdown['Raptor Swipe']);
  breakdown['Lethal Calibration'] = lcBase * 0.15 * lcUptime * (stats.crit || 12) / 100;

  // Moonlight Chakram (Sentinel)
  if (heroTalent === 'sentinel' && rot.moonlightChakram) {
    breakdown['Moonlight Chakram'] = calcAbility('moonlightChakram', rot.moonlightChakram, Math.min(T, 8));
  }

  // Hatchet Toss (Pack Leader)
  if (heroTalent === 'packLeader' && rot.hatchetToss) {
    breakdown['Hatchet Toss'] = calcAbility('hatchetToss', rot.hatchetToss, Math.min(T, 4));
  }

  // Takedown (20% amp for 8-10s window)
  const tdDur = heroTalent === 'sentinel' ? 10 : 8;
  const tdCD = 90 - (build === 'st' ? 30 : 15);
  const tdUptime = tdDur / tdCD;
  breakdown['Takedown (20% amp)'] = Object.values(breakdown).reduce((s, v) => s + v, 0) * 0.20 * tdUptime;

  // Hero talent bonus
  const heroData = MIDNIGHT_DATA.talents.hero[heroTalent];
  const heroPct = build === 'st' ? heroData.stBonus : heroData.aoeBonus;
  const baseTotal = Object.values(breakdown).reduce((s, v) => s + v, 0);
  if (heroTalent === 'sentinel') {
    breakdown['Sentinel Mark + Lunar Storm'] = baseTotal * heroPct;
  } else {
    breakdown['Pack Leader Beasts'] = baseTotal * heroPct;
  }

  let totalDps = Object.values(breakdown).reduce((s, v) => s + v, 0);

  // Multi-target diminishing returns
  if (T > 1) {
    const cleaveFactor = T <= 3 ? 1 + (T - 1) * 0.55
      : T <= 5 ? 2.1 + (T - 3) * 0.35
      : T <= 8 ? 2.8 + (T - 5) * 0.20
      : 3.4 + (T - 8) * 0.12;
    const stDps = totalDps / (1 + heroPct);
    totalDps = stDps * cleaveFactor * (1 + heroPct * 0.8);
  }

  const cdEfficiency = Math.min(1.12, 1 + (fightDuration - 180) / 900 * 0.12);
  totalDps *= cdEfficiency;

  const rawSum = Object.values(breakdown).reduce((s, v) => s + v, 0);
  const normFactor = totalDps / rawSum;
  Object.keys(breakdown).forEach(k => { breakdown[k] = Math.round(breakdown[k] * normFactor); });

  return { totalDps: Math.round(totalDps), breakdown, targets: T, duration: fightDuration, hero: heroTalent, build };
}

// ============================================================
// STAT WEIGHT CALCULATOR — Delta method (SimC-style)
// Bumps each stat by a small amount and measures DPS delta
// ============================================================
function calcStatWeights(charData, targetCount, fightDuration, heroTalent, build) {
  const baseDps = runSimulation(charData, targetCount, fightDuration, heroTalent, build).totalDps;

  const DELTA = {
    agility: 200,       // +200 agility
    haste: 1.5,         // +1.5% haste (≈270 rating)
    crit: 1.5,          // +1.5% crit (≈270 rating)
    mastery: 1.5,       // +1.5% mastery (≈270 rating)
    versatility: 1.5,   // +1.5% vers (≈308 rating)
  };

  const RATING_PER_PERCENT = {
    haste: 180,
    crit: 180,
    mastery: 180,
    versatility: 205,
  };

  const weights = {};

  // Agility: bump agi and AP together
  const agiChar = JSON.parse(JSON.stringify(charData));
  agiChar.stats.agility += DELTA.agility;
  agiChar.stats.attackPower = agiChar.stats.agility * 2.1;
  const agiDps = runSimulation(agiChar, targetCount, fightDuration, heroTalent, build).totalDps;
  const agiDelta = (agiDps - baseDps) / DELTA.agility; // DPS per 1 agility
  weights['Agility'] = { perPoint: agiDelta, perRating: agiDelta, delta: agiDps - baseDps, bump: `+${DELTA.agility}` };

  // Secondary stats: bump percentage, convert to per-rating-point
  ['haste', 'crit', 'mastery', 'versatility'].forEach(stat => {
    const bumpChar = JSON.parse(JSON.stringify(charData));
    bumpChar.stats[stat] = (bumpChar.stats[stat] || 0) + DELTA[stat];
    const bumpDps = runSimulation(bumpChar, targetCount, fightDuration, heroTalent, build).totalDps;
    const dpsDelta = bumpDps - baseDps;
    const ratingBump = DELTA[stat] * RATING_PER_PERCENT[stat]; // equivalent rating
    const perRating = dpsDelta / ratingBump;
    const label = stat.charAt(0).toUpperCase() + stat.slice(1);
    weights[label] = { perPoint: perRating, perRating, delta: dpsDelta, bump: `+${DELTA[stat]}%`, ratingBump: Math.round(ratingBump) };
  });

  // Normalize to agility = 1.00
  const agiWeight = weights['Agility'].perPoint;
  Object.keys(weights).forEach(k => {
    weights[k].normalized = agiWeight > 0 ? +(weights[k].perPoint / agiWeight).toFixed(3) : 0;
  });

  return { weights, baseDps };
}

// ============================================================
// OPTIMAL TALENT RECOMMENDER — Export strings from Method.gg (Symex)
// ============================================================
function getOptimalTalents(targetCount, heroTalent) {
  const isAoe = targetCount > 2;
  const spec = MIDNIGHT_DATA.talents.spec;
  const selected = [];

  Object.entries(spec).forEach(([key, t]) => {
    const include = t.always
      || (isAoe && t.aoePriority)
      || (!isAoe && t.stPriority);
    if (include) selected.push({ key, ...t });
  });

  return {
    selected,
    hero: MIDNIGHT_DATA.talents.hero[heroTalent],
    heroKey: heroTalent,
    mode: isAoe ? 'AoE' : 'Single Target',
    // Export strings from Method.gg (Symex) — Midnight 12.0.1, updated Feb 26 2026
    exportString: isAoe
      ? (heroTalent === 'sentinel'
        ? 'C8PAAAAAAAAAAAAAAAAAAAAAAMWgBmxoxyAYmgNzMzMmxyAAAAAAgZmZmZYGjZMwYyAAAAAGAALbzMziZmZmZGDAMDbMLGjZmNG'
        : 'C8PAAAAAAAAAAAAAAAAAAAAAAMgxMG2ILwMM0gFzMzMz4BWGAAAAAAMzMzMDzYMjBGTGAAAAwAAYZZmZ2MzMjZGDgZ2AMLGjZmNG')
      : (heroTalent === 'sentinel'
        ? 'C8PAAAAAAAAAAAAAAAAAAAAAAMWgBmxoxyAYmgNjZmxMPwy8AAAAAAAMzMzMDzYMjBGTGAAAAwAAYZbmZWMzMzMzYAgZYjZxYMjNG'
        : 'C8PAAAAAAAAAAAAAAAAAAAAAAMgxMGWILwMM0gFjZmZmxyAAAAAAgZmZmZYGjZMwYyAAAAAGAwYZbmZWMzMzMzYAMzGgZxYMjNG')
  };
}

// ============================================================
// COMPONENTS
// ============================================================

// Realm lists by region — common US/EU/KR/TW realms
const REALM_DATA: Record<string, string[]> = {
  us: [
    "Aegwynn", "Aerie Peak", "Agamaggan", "Aggramar", "Akama", "Alexstrasza", "Alleria",
    "Altar of Storms", "Alterac Mountains", "Aman'Thul", "Andorhal", "Anetheron", "Antonidas",
    "Anub'arak", "Anvilmar", "Arathor", "Archimonde", "Area 52", "Argent Dawn", "Arthas",
    "Arygos", "Auchindoun", "Azgalor", "Azjol-Nerub", "Azralon", "Azshara", "Azuremyst",
    "Baelgun", "Balnazzar", "Barthilas", "Black Dragonflight", "Blackhand", "Blackrock",
    "Blackwater Raiders", "Blackwing Lair", "Blade's Edge", "Bladefist", "Bleeding Hollow",
    "Blood Furnace", "Bloodhoof", "Bloodscalp", "Bonechewer", "Borean Tundra", "Boulderfist",
    "Bronzebeard", "Burning Blade", "Burning Legion", "Caelestrasz", "Cairne", "Cenarion Circle",
    "Cenarius", "Cho'gall", "Chromaggus", "Coilfang", "Crushridge", "Daggerspine", "Dalaran",
    "Dalvengyr", "Dark Iron", "Darkspear", "Darrowmere", "Dath'Remar", "Dawnbringer",
    "Deathwing", "Demon Soul", "Dentarg", "Destromath", "Dethecus", "Detheroc", "Doomhammer",
    "Draenor", "Dragonblight", "Dragonmaw", "Drak'Tharon", "Drak'thul", "Draka",
    "Drakkari", "Dreadmaul", "Drenden", "Dunemaul", "Durotan", "Duskwood", "Earthen Ring",
    "Echo Isles", "Eitrigg", "Eldre'Thalas", "Elune", "Emerald Dream", "Eonar",
    "Eredar", "Executus", "Exodar", "Farstriders", "Feathermoon", "Fenris", "Firetree",
    "Fizzcrank", "Frostmane", "Frostmourne", "Frostwolf", "Galakrond", "Gallywix",
    "Garithos", "Garona", "Garrosh", "Ghostlands", "Gilneas", "Gnomeregan", "Goldrinn",
    "Gorefiend", "Gorgonnash", "Greymane", "Grizzly Hills", "Gul'dan", "Gundrak",
    "Gurubashi", "Hakkar", "Haomarush", "Hellscream", "Hydraxis", "Hyjal",
    "Icecrown", "Illidan", "Jaedenar", "Jubei'Thos", "Kael'thas", "Kalecgos",
    "Kargath", "Kel'Thuzad", "Khadgar", "Khaz Modan", "Khaz'goroth", "Kil'jaeden",
    "Kilrogg", "Kirin Tor", "Korgath", "Korialstrasz", "Kul Tiras", "Laughing Skull",
    "Lethon", "Lightbringer", "Lightning's Blade", "Lightninghoof", "Llane", "Lothar",
    "Madoran", "Maelstrom", "Magtheridon", "Maiev", "Mal'Ganis", "Malfurion",
    "Malorne", "Malygos", "Mannoroth", "Medivh", "Misha", "Mok'Nathal",
    "Moon Guard", "Moonrunner", "Mug'thol", "Muradin", "Nagrand", "Nathrezim",
    "Nazgrel", "Nazjatar", "Nemesis", "Ner'zhul", "Nesingwary", "Nordrassil",
    "Norgannon", "Onyxia", "Perenolde", "Proudmoore", "Quel'dorei", "Quel'Thalas",
    "Ragnaros", "Ravencrest", "Ravenholdt", "Rexxar", "Rivendare", "Runetotem",
    "Sargeras", "Saurfang", "Scarlet Crusade", "Scilla", "Sen'jin", "Sentinels",
    "Shadow Council", "Shadowmoon", "Shadowsong", "Shandris", "Shattered Halls",
    "Shattered Hand", "Shu'halo", "Silver Hand", "Silvermoon", "Sisters of Elune",
    "Skullcrusher", "Skywall", "Smolderthorn", "Spinebreaker", "Spirestone",
    "Staghelm", "Steamwheedle Cartel", "Stonemaul", "Stormrage", "Stormreaver",
    "Stormscale", "Suramar", "Tanaris", "Terenas", "Terokkar", "Thaurissan",
    "The Forgotten Coast", "The Scryers", "The Underbog", "The Venture Co",
    "Thorium Brotherhood", "Thrall", "Thunderhorn", "Thunderlord", "Tichondrius",
    "Tol Barad", "Tortheldrin", "Trollbane", "Turalyon", "Twisting Nether",
    "Uldaman", "Uldum", "Undermine", "Ursin", "Uther", "Vashj", "Vek'nilash",
    "Velen", "Warsong", "Whisperwind", "Wildhammer", "Windrunner", "Winterhoof",
    "Wyrmrest Accord", "Ysera", "Ysondre", "Zangarmarsh", "Zul'jin", "Zuluhed",
  ],
  eu: [
    "Aegwynn", "Aerie Peak", "Agamaggan", "Aggra", "Aggramar", "Ahn'Qiraj", "Al'Akir",
    "Alexstrasza", "Alleria", "Alonsus", "Aman'Thul", "Ambossar", "Anachronos",
    "Anetheron", "Antonidas", "Anub'arak", "Arak-arahm", "Arathi", "Archimonde",
    "Area 52", "Argent Dawn", "Arthas", "Arygos", "Aszune", "Auchindoun",
    "Azjol-Nerub", "Azshara", "Azuremyst", "Baelgun", "Balnazzar", "Blackhand",
    "Blackmoore", "Blackrock", "Blackscar", "Blade's Edge", "Bladefist", "Bloodfeather",
    "Bloodhoof", "Bloodscalp", "Blutkessel", "Boulderfist", "Bronze Dragonflight",
    "Bronzebeard", "Burning Blade", "Burning Legion", "Burning Steppes", "C'Thun",
    "Chamber of Aspects", "Chants éternels", "Cho'gall", "Chromaggus", "Colinas Pardas",
    "Confrérie du Thorium", "Conseil des Ombres", "Crushridge", "Daggerspine",
    "Dalaran", "Dalvengyr", "Darkmoon Faire", "Darksorrow", "Darkspear", "Das Konsortium",
    "Das Syndikat", "Deathguard", "Deathwing", "Defias Brotherhood", "Dentarg",
    "Der Mithrilorden", "Der Rat von Dalaran", "Destromath", "Dethecus",
    "Die Aldor", "Die Arguswacht", "Die Nachtwache", "Die Silberne Hand",
    "Die Todeskrallen", "Die ewige Wacht", "Doomhammer", "Draenor", "Dragonblight",
    "Dragonmaw", "Drak'thul", "Drek'Thar", "Dun Modr", "Dun Morogh", "Dunemaul",
    "Durotan", "Earthen Ring", "Echsenkessel", "Eitrigg", "Eldre'Thalas", "Elune",
    "Emerald Dream", "Emeriss", "Eonar", "Eredar", "Executus", "Exodar",
    "Festung der Stürme", "Fordragon", "Forscherliga", "Frostmane", "Frostmourne",
    "Frostwhisper", "Frostwolf", "Galakrond", "Garona", "Garrosh", "Genjuros",
    "Ghostlands", "Gilneas", "Gordunni", "Gorgonnash", "Greymane", "Grim Batol",
    "Gul'dan", "Hakkar", "Haomarush", "Hellfire", "Hellscream", "Howling Fjord",
    "Hyjal", "Illidan", "Jaedenar", "Kael'thas", "Karazhan", "Kargath",
    "Kel'Thuzad", "Khadgar", "Khaz Modan", "Khaz'goroth", "Kil'jaeden",
    "Kilrogg", "Kirin Tor", "Kor'gall", "Krag'jin", "Krasus", "Kul Tiras",
    "Kult der Verdammten", "La Croisade écarlate", "Laughing Skull", "Les Clairvoyants",
    "Les Sentinelles", "Lightbringer", "Lightning's Blade", "Lordaeron", "Los Errantes",
    "Lothar", "Madmortem", "Magtheridon", "Mal'Ganis", "Malfurion", "Malorne",
    "Malygos", "Mannoroth", "Maréchal Expeditionnaire", "Mazrigos", "Medivh",
    "Minahonda", "Moonglade", "Mug'thol", "Nagrand", "Nathrezim", "Naxxramas",
    "Nazjatar", "Nefarian", "Nemesis", "Neptulon", "Ner'zhul", "Nera'thor",
    "Nethersturm", "Nordrassil", "Norgannon", "Nozdormu", "Onyxia", "Outland",
    "Perenolde", "Proudmoore", "Quel'Thalas", "Ragnaros", "Rajaxx", "Rashgarroth",
    "Ravencrest", "Ravenholdt", "Rexxar", "Runetotem", "Sanguino", "Sargeras",
    "Saurfang", "Scarshield Legion", "Sen'jin", "Shadowsong", "Shattered Halls",
    "Shattered Hand", "Shattrath", "Shen'dralar", "Silvermoon", "Sinstralis",
    "Skullcrusher", "Spinebreaker", "Sporeggar", "Steamwheedle Cartel", "Stormrage",
    "Stormreaver", "Stormscale", "Sunstrider", "Suramar", "Sylvanas", "Taerar",
    "Talnivarr", "Tarren Mill", "Teldrassil", "Temple noir", "Terenas", "Terokkar",
    "Terrordar", "The Maelstrom", "The Sha'tar", "The Venture Co", "Theradras",
    "Thrall", "Throk'Feroth", "Thunderhorn", "Tichondrius", "Tirion", "Todeswache",
    "Trollbane", "Turalyon", "Twilight's Hammer", "Twisting Nether", "Tyrande",
    "Uldaman", "Ulduar", "Uldum", "Un'Goro", "Varimathras", "Vashj", "Vek'lor",
    "Vek'nilash", "Vol'jin", "Wildhammer", "Winterhoof", "Wrathbringer",
    "Xavius", "Ysera", "Ysondre", "Zenedar", "Zirkel des Cenarius",
    "Zul'jin", "Zuluhed",
  ],
  kr: [
    "Aegwynn", "Alexstrasza", "Azshara", "Burning Legion", "Cenarius", "Dalaran",
    "Deathwing", "Durotan", "Garona", "Gul'dan", "Hellscream", "Hyjal",
    "Malfurion", "Norgannon", "Rexxar", "Stormrage", "Wildhammer", "Windrunner",
    "Zul'jin",
  ],
  tw: [
    "Arthas", "Bleeding Hollow", "Chillwind Point", "Crystalpine Stinger",
    "Demon Fall Canyon", "Dragonmaw", "Frostmane", "Hellscream", "Icecrown",
    "Light's Hope", "Nightsong", "Onyxia", "Order of the Cloud Serpent",
    "Quel'dorei", "Shadowmoon", "Silverwing Hold", "Skywall", "Spirestone",
    "Stormscale", "Sundown Marsh", "Whisperwind", "World Tree", "Wrathbringer",
    "Zealot Blade",
  ],
};

const SAMPLE_SIMC = `hunter="Azurethane"
level=80
race=night_elf
region=us
server=stormrage
spec=survival
talents=C8PAAAAAAAAAAAAAAAAAAAAAAMWgBmxohBwMBbGzMjZmlBAAAAAAzYmZGMeAzYGMmMAAAAAAgxy2MzsYmZGzMzAAGwwYMjN
agility=12450
attack_power=26145
haste_rating=1820
crit_rating=2340
mastery_rating=1620
versatility_rating=980
head=,id=232011,item_level=639
neck=,id=231814,item_level=636
shoulders=,id=232013,item_level=639
back=,id=231756,item_level=636
chest=,id=232009,item_level=639
wrist=,id=231758,item_level=636
hands=,id=232012,item_level=639
waist=,id=231760,item_level=636
legs=,id=232010,item_level=639
feet=,id=231762,item_level=636
finger1=,id=231770,item_level=636
finger2=,id=231772,item_level=636
trinket1=,id=231780,item_level=636
trinket2=,id=231782,item_level=636
main_hand=,id=231800,item_level=639`;

export default function SurvivalHunterSim() {
  const [simcInput, setSimcInput] = useState('');
  const [parsedChar, setParsedChar] = useState(null);
  const [parseError, setParseError] = useState('');
  const [heroTalent, setHeroTalent] = useState('sentinel');
  const [fightDuration, setFightDuration] = useState(300);
  const [simResults, setSimResults] = useState(null);
  const [statWeights, setStatWeights] = useState(null);
  const [optimalTalents, setOptimalTalents] = useState(null);
  const [isSimming, setIsSimming] = useState(false);
  const [activeTab, setActiveTab] = useState('sim'); // 'sim' | 'talents'
  const [simMode, setSimMode] = useState('single'); // 'single' | 'cleave' | 'multi'
  const [targetCount, setTargetCount] = useState(1);
  const [copied, setCopied] = useState(false);
  const [particles, setParticles] = useState([]);
  // Armory Lookup state
  const [armoryRealm, setArmoryRealm] = useState('');
  const [armoryRealmSearch, setArmoryRealmSearch] = useState('');
  const [showRealmDropdown, setShowRealmDropdown] = useState(false);
  const [armoryName, setArmoryName] = useState('');
  const [armoryRegion, setArmoryRegion] = useState('us');
  const [armoryLoading, setArmoryLoading] = useState(false);
  const [armoryError, setArmoryError] = useState('');
  const [armoryAvatar, setArmoryAvatar] = useState('');
  const [itemEnrichLoading, setItemEnrichLoading] = useState(false);
  const realmDropdownRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const handler = (e: MouseEvent) => {
      if (!node.contains(e.target as Node)) setShowRealmDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  // Item tooltip state
  const [itemCache, setItemCache] = useState<Record<string, any>>({});
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [tooltipLoading, setTooltipLoading] = useState(false);

  useEffect(() => {
    const ps = Array.from({ length: 18 }, (_, i) => ({
      id: i, x: Math.random() * 100, y: Math.random() * 100,
      size: Math.random() * 3 + 1, speed: Math.random() * 20 + 15,
      delay: Math.random() * 8, opacity: Math.random() * 0.4 + 0.1
    }));
    setParticles(ps);
  }, []);

  const handleParse = useCallback(() => {
    setParseError('');
    const result = parseSimcString(simcInput);
    if (result.valid) {
      setParsedChar(result);
    } else {
      setParseError(result.errors.join(' '));
      setParsedChar(null);
    }
    setSimResults(null);
  }, [simcInput]);

  const handleLoadSample = () => {
    setSimcInput(SAMPLE_SIMC);
    setParsedChar(null);
    setSimResults(null);
    setParseError('');
  };

  const handleArmoryLookup = useCallback(async () => {
    if (!armoryRealm.trim() || !armoryName.trim()) {
      setArmoryError('Enter both realm and character name.');
      return;
    }
    setArmoryLoading(true);
    setArmoryError('');
    setArmoryAvatar('');
    try {
      const fullData = await getFullCharacter(
        armoryRealm.trim().toLowerCase().replace(/\s+/g, '-'),
        armoryName.trim().toLowerCase(),
        armoryRegion
      );

      if (fullData.profile?.error) {
        throw new Error(fullData.profile.error);
      }

      const simData = equipmentToSimData(fullData);

      // Check if character is a survival hunter
      if (simData.character.spec && simData.character.spec.toLowerCase() !== 'survival') {
        setArmoryError(`Warning: ${simData.character.name} is specced as ${simData.character.spec}, not Survival. Results may be inaccurate.`);
      }

      setParsedChar(simData);
      setSimResults(null);

      // Extract avatar
      if (fullData.media?.assets) {
        const avatar = fullData.media.assets.find((a: any) => a.key === 'avatar');
        if (avatar?.value) setArmoryAvatar(avatar.value);
      }

      // Enrich gear with Blizzard item data
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
            // Update gear names from API data
            const enrichedGear = simData.gear.map((g: any) => {
              if (g.itemId && itemMap[g.itemId]) {
                const apiItem = itemMap[g.itemId];
                return { ...g, name: apiItem.name || g.name };
              }
              return g;
            });
            setParsedChar(prev => prev ? { ...prev, gear: enrichedGear } : prev);
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
    } finally {
      setArmoryLoading(false);
    }
  }, [armoryRealm, armoryName, armoryRegion]);

  const handleItemHover = useCallback(async (itemId: string, event: any) => {
    if (!itemId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltipPos({ x: rect.right + 8, y: rect.top });
    setHoveredItem(itemId);

    if (itemCache[itemId]) return; // already cached

    setTooltipLoading(true);
    try {
      const [itemData, mediaData] = await Promise.all([
        getItem(parseInt(itemId), armoryRegion || 'us'),
        getItemMedia(parseInt(itemId), armoryRegion || 'us').catch(() => null),
      ]);
      const icon = mediaData?.assets?.find((a: any) => a.key === 'icon')?.value || null;
      setItemCache(prev => ({ ...prev, [itemId]: { ...itemData, _icon: icon } }));
    } catch (e) {
      setItemCache(prev => ({ ...prev, [itemId]: { _error: e.message } }));
    } finally {
      setTooltipLoading(false);
    }
  }, [itemCache, armoryRegion]);

  const handleItemLeave = useCallback(() => {
    setHoveredItem(null);
  }, []);

  const getTargets = () => {
    if (simMode === 'single') return [1];
    if (simMode === 'cleave') return [2, 3];
    return [5, 8, 10];
  };

  const handleSim = useCallback(() => {
    if (!parsedChar) return;
    setIsSimming(true);
    setSimResults(null);

    setTimeout(() => {
      const targets = getTargets();
      const results = targets.map(t => {
        const build = t === 1 ? 'st' : 'aoe';
        const st = runSimulation(parsedChar, t, fightDuration, heroTalent, build);
        return st;
      });

      // Calculate stat weights for the primary target scenario (first target count)
      const primaryBuild = targets[0] === 1 ? 'st' : 'aoe';
      const sw = calcStatWeights(parsedChar, targets[0], fightDuration, heroTalent, primaryBuild);
      setStatWeights(sw);

      const optimal = getOptimalTalents(targets[targets.length - 1], heroTalent);
      setSimResults(results);
      setOptimalTalents(optimal);
      setIsSimming(false);
    }, 1400);
  }, [parsedChar, heroTalent, fightDuration, simMode]);

  const copyExportString = (str) => {
    navigator.clipboard.writeText(str).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const formatDps = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toString();

  const getBarColor = (key) => {
    const colors = {
      'Kill Command': '#f97316', 'Raptor Strike': '#ef4444', 'Wildfire Bomb': '#f59e0b',
      'Boomstick': '#eab308', 'Flamefang Pitch': '#ff6b35', 'Raptor Swipe': '#e74c3c',
      'Strike as One': '#22c55e', 'Pet (Spirit Bond)': '#a78bfa',
      'Lethal Calibration': '#fb923c', 'Takedown (20% amp)': '#60a5fa',
      'Sentinel Mark + Lunar Storm': '#38bdf8', 'Pack Leader Beasts': '#a78bfa',
      'Moonlight Chakram': '#818cf8', 'Hatchet Toss': '#9ca3af',
    };
    return colors[key] || '#6b7280';
  };

  const sentinelSelected = heroTalent === 'sentinel';

  return (
    <div className="sim-root" style={{
      minHeight: '100vh', background: 'linear-gradient(180deg, #06080f 0%, #0a0e1a 30%, #0d1020 60%, #080c18 100%)', color: '#e8dcc8',
      fontFamily: "'Cinzel Decorative', 'Palatino Linotype', serif",
      position: 'relative', overflow: 'hidden'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700;900&family=Cinzel:wght@400;600;700&family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap');
        
        * { box-sizing: border-box; }
        
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0f111a; }
        ::-webkit-scrollbar-thumb { background: #8b5e3c; border-radius: 3px; }

        @keyframes float {
          0%, 100% { transform: translateY(0px) translateX(0px); opacity: var(--op); }
          50% { transform: translateY(-30px) translateX(10px); opacity: calc(var(--op) * 0.4); }
        }
        @keyframes fireGlow {
          0%, 100% { box-shadow: 0 0 20px #c45e0044, 0 0 40px #8b2a0022; }
          50% { box-shadow: 0 0 35px #e07030aa, 0 0 70px #c45e0044; }
        }
        @keyframes simPulse {
          0% { transform: scale(1); box-shadow: 0 0 0 0 #e07030aa; }
          50% { transform: scale(1.02); box-shadow: 0 0 0 12px #e0703000; }
          100% { transform: scale(1); box-shadow: 0 0 0 0 #e0703000; }
        }
        @keyframes scanLine {
          0% { top: 0; }
          100% { top: 100%; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes barGrow {
          from { width: 0; }
        }
        @keyframes resultFlash {
          0% { background: rgba(224,112,48,0.3); }
          100% { background: transparent; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .hero-btn {
          background: linear-gradient(135deg, #1a0e06, #2a1808);
          border: 1px solid #4a2c14;
          border-radius: 6px;
          padding: 14px 18px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }
        .hero-btn:hover { border-color: #8b5e3c; transform: translateY(-1px); }
        .hero-btn.selected {
          border-color: #e07030;
          background: linear-gradient(135deg, #2a1200, #3a1a08);
          box-shadow: 0 0 16px #e0703044;
        }
        
        .sim-btn {
          background: linear-gradient(135deg, #c44e00, #8b2a00);
          border: 1px solid #e07030;
          border-radius: 8px;
          padding: 16px 32px;
          color: #fff8f0;
          font-family: 'Cinzel', serif;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 2px;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s;
          animation: fireGlow 2s ease-in-out infinite;
        }
        .sim-btn:hover:not(:disabled) { background: linear-gradient(135deg, #e05800, #b03800); transform: translateY(-2px); }
        .sim-btn:disabled { opacity: 0.5; cursor: not-allowed; animation: none; }

        .tab-btn {
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          padding: 10px 24px;
          color: #7a6040;
          font-family: 'Cinzel', serif;
          font-size: 12px;
          letter-spacing: 2px;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s;
        }
        .tab-btn.active { color: #e8c88a; border-bottom-color: #e07030; }
        .tab-btn:hover { color: #c8a870; }

        .mode-btn {
          background: #0f1118;
          border: 1px solid #2a2018;
          border-radius: 6px;
          padding: 10px 18px;
          color: #7a6040;
          font-family: 'Cinzel', serif;
          font-size: 11px;
          letter-spacing: 1px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .mode-btn.active {
          background: #1e1208;
          border-color: #e07030;
          color: #e8c88a;
        }

        .input-field {
          background: #0f1118;
          border: 1px solid #2a2018;
          border-radius: 6px;
          color: #c8b890;
          font-family: 'EB Garamond', serif;
          font-size: 13px;
          padding: 10px 14px;
          transition: border-color 0.2s;
          outline: none;
          width: 100%;
        }
        .input-field:focus { border-color: #8b5e3c; }

        .result-card { animation: fadeIn 0.4s ease forwards; }
        .bar-fill { animation: barGrow 0.8s ease forwards; }
        .talent-tag {
          background: #1a1208;
          border: 1px solid #3a2810;
          border-radius: 4px;
          padding: 4px 10px;
          font-family: 'EB Garamond', serif;
          font-size: 13px;
          color: #c8a870;
          margin: 3px;
          display: inline-block;
          transition: all 0.2s;
        }
        .talent-tag.core { border-color: #e07030; color: #f0c880; }
        .talent-tag.aoe { border-color: #22c55e66; color: #86efac; }
        .talent-tag.st { border-color: #60a5fa66; color: #93c5fd; }
        .talent-tag:hover { transform: scale(1.04); }
        
        .divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, #3a2810, #8b5e3c, #3a2810, transparent);
          margin: 24px 0;
        }
        
        .glow-text {
          text-shadow: 0 0 20px #e0703066, 0 0 40px #c44e0033;
        }
        
        .sentinel-badge { color: #f0a830; text-shadow: 0 0 12px #e0703066, 0 0 24px #c44e0033; }
        .pack-badge { color: #e8b840; text-shadow: 0 0 12px #d4940066, 0 0 24px #b8780033; }
        
        .loading-ring {
          width: 48px; height: 48px;
          border: 3px solid #2a1808;
          border-top-color: #e07030;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto;
        }

        .sim-root {
          width: 100%;
          overflow-x: hidden;
        }

        .sim-shell {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 1280px;
          margin: 0 auto;
          padding: 24px 20px;
        }

        .tabs-row {
          display: flex;
          border-bottom: 1px solid #1a1208;
          margin-bottom: 28px;
          gap: 4px;
        }

        .sim-mode-grid {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .responsive-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }

        .hero-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }

        .result-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 14px;
          gap: 10px;
        }

        .breakdown-head {
          display: flex;
          justify-content: space-between;
          margin-bottom: 3px;
          gap: 8px;
        }

        .breakdown-label {
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .breakdown-value {
          white-space: nowrap;
        }

        @media (max-width: 768px) {
          .sim-shell {
            padding: 16px 12px;
          }

          .responsive-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }

          .hero-grid,
          .stats-grid {
            grid-template-columns: 1fr;
          }

          .tabs-row {
            flex-wrap: wrap;
            gap: 2px;
          }

          .tab-btn {
            flex: 1 1 calc(50% - 2px);
            min-width: 0;
            text-align: center;
            padding: 10px 8px;
            font-size: 10px;
            letter-spacing: 1px;
          }

          .mode-btn {
            flex: 1 1 100% !important;
            padding: 8px 10px;
            font-size: 10px;
          }

          .hero-btn {
            padding: 12px 14px;
          }

          .sim-btn {
            padding: 14px 16px;
            font-size: 12px;
            letter-spacing: 1px;
            width: 100%;
          }

          .title-row {
            gap: 8px;
            flex-wrap: wrap;
          }

          .glow-text {
            letter-spacing: 2px !important;
          }

          .subtitle-line {
            letter-spacing: 2px !important;
            font-size: 10px !important;
          }

          .result-card {
            padding: 14px !important;
          }

          .result-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 6px;
          }

          .breakdown-value {
            font-size: 11px !important;
          }
        }

        .item-tooltip {
          position: fixed;
          z-index: 9999;
          background: linear-gradient(180deg, #1a0e2e, #0c0816);
          border: 1px solid #4a3080;
          border-radius: 8px;
          padding: 14px 16px;
          min-width: 260px;
          max-width: 320px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.8), 0 0 20px rgba(100,60,180,0.2);
          pointer-events: none;
          animation: fadeIn 0.15s ease;
          font-family: 'EB Garamond', serif;
        }
        .item-tooltip-name {
          font-family: 'Cinzel', serif;
          font-size: 14px;
          font-weight: 700;
          margin-bottom: 4px;
        }
        .item-tooltip-ilvl {
          font-size: 12px;
          color: #f0c880;
          margin-bottom: 6px;
        }
        .item-tooltip-stat {
          font-size: 12px;
          color: #c8b890;
          padding: 1px 0;
        }
        .item-tooltip-stat b {
          color: #e8dcc8;
        }
        .item-tooltip-binding {
          font-size: 11px;
          color: #7a6040;
          margin-bottom: 2px;
        }
        .item-tooltip-type {
          font-size: 11px;
          color: #8a7050;
          display: flex;
          justify-content: space-between;
          margin-bottom: 4px;
        }
        .item-tooltip-icon {
          width: 36px;
          height: 36px;
          border-radius: 4px;
          border: 1px solid #4a3080;
          margin-right: 10px;
          float: left;
        }
        .item-tooltip-loading {
          color: #7a6040;
          font-size: 11px;
          font-style: italic;
        }
        .gear-row {
          cursor: pointer;
          transition: background 0.15s;
        }
        .gear-row:hover {
          background: #1a1a10 !important;
        }
      `}</style>

      {/* Background particles */}
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'fixed', left: `${p.x}%`, top: `${p.y}%`,
          width: p.size, height: p.size, borderRadius: '50%',
          background: '#e07030', opacity: p.opacity,
          animation: `float ${p.speed}s ease-in-out infinite`,
          animationDelay: `${p.delay}s`,
          '--op': p.opacity, pointerEvents: 'none', zIndex: 0
        }} />
      ))}

      {/* Background grid */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: 'linear-gradient(rgba(139,94,60,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(139,94,60,0.04) 1px, transparent 1px)',
        backgroundSize: '40px 40px'
      }} />

      <div className="sim-shell">

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div className="title-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{ fontSize: 28 }}>🦅</div>
            <h1 className="glow-text" style={{
              fontFamily: "'Cinzel Decorative', serif", fontSize: 'clamp(20px, 3vw, 32px)',
              fontWeight: 900, margin: 0, letterSpacing: 4,
              background: 'linear-gradient(135deg, #e8c88a, #e07030, #c44e00)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
            }}>
              SURVIVAL HUNTER
            </h1>
            <div style={{ fontSize: 28 }}>🔥</div>
          </div>
          <p className="subtitle-line" style={{ fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: 4, color: '#7a6040', margin: 0 }}>
            MIDNIGHT 12.0.1 · PRE-SEASON 1 · TALENT OPTIMIZER & SIMULATOR
          </p>
          <div className="divider" style={{ margin: '16px auto', maxWidth: 400 }} />
          <p style={{ fontFamily: "'EB Garamond', serif", fontSize: 14, color: '#8a7050', margin: 0, fontStyle: 'italic' }}>
            Sources: Azortharion (Trueshot Lodge) · Method.gg (Symex) · Maxroll (heleni) · Wowhead · Raidbots/SimC APL
          </p>
        </div>

        {/* Tabs */}
        <div className="tabs-row" style={{ display: 'flex', borderBottom: '1px solid #1a1208', marginBottom: 28, gap: 4 }}>
          <button className={`tab-btn ${activeTab === 'sim' ? 'active' : ''}`} onClick={() => setActiveTab('sim')}>⚔ Simulator</button>
          <button className={`tab-btn ${activeTab === 'talents' ? 'active' : ''}`} onClick={() => setActiveTab('talents')}>🌿 Talents</button>
          <button className={`tab-btn ${activeTab === 'guide' ? 'active' : ''}`} onClick={() => setActiveTab('guide')}>📖 Guide</button>
        </div>

        {/* ===== SIM TAB ===== */}
        {activeTab === 'sim' && (
          <div className="responsive-grid">

            {/* LEFT: Inputs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Armory Lookup */}
              <div style={{ background: '#0d0f16', border: '1px solid #2a2018', borderRadius: 10, padding: 20 }}>
                <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: 13, letterSpacing: 2, color: '#e8c88a', margin: '0 0 12px' }}>
                  🌐 ARMORY LOOKUP
                </h3>
                <p style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: '#6a5030', marginBottom: 10 }}>
                  Pull your character directly from the WoW Armory — no addon needed
                </p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  {['us', 'eu', 'kr', 'tw'].map(r => (
                    <button key={r} className={`mode-btn ${armoryRegion === r ? 'active' : ''}`}
                      onClick={() => setArmoryRegion(r)}
                      style={{ flex: 1, padding: '6px 8px', fontSize: 11, textTransform: 'uppercase' }}>
                      {r}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  {/* Realm searchable dropdown */}
                  <div ref={realmDropdownRef} style={{ position: 'relative' }}>
                    <input className="input-field" placeholder="Search realm..."
                      value={armoryRealmSearch}
                      onChange={e => {
                        setArmoryRealmSearch(e.target.value);
                        setShowRealmDropdown(true);
                        if (!e.target.value) setArmoryRealm('');
                      }}
                      onFocus={() => setShowRealmDropdown(true)}
                      style={{ width: '100%' }}
                    />
                    {showRealmDropdown && (() => {
                      const realms = REALM_DATA[armoryRegion] || [];
                      const q = armoryRealmSearch.toLowerCase();
                      const filtered = q ? realms.filter(r => r.toLowerCase().includes(q)) : realms;
                      if (filtered.length === 0) return null;
                      return (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                          background: '#0d0f16', border: '1px solid #2a2018', borderRadius: '0 0 6px 6px',
                          maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                        }}>
                          {filtered.slice(0, 50).map(realm => (
                            <div key={realm}
                              onClick={() => {
                                setArmoryRealm(realm.toLowerCase().replace(/[' ]/g, '-'));
                                setArmoryRealmSearch(realm);
                                setShowRealmDropdown(false);
                              }}
                              style={{
                                padding: '6px 10px', cursor: 'pointer', fontSize: 12,
                                fontFamily: "'EB Garamond', serif", color: '#c8a870',
                                borderBottom: '1px solid #1a1208',
                                background: armoryRealmSearch.toLowerCase() === realm.toLowerCase() ? '#1a2a1a' : 'transparent',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#1a1a2a')}
                              onMouseLeave={e => (e.currentTarget.style.background = armoryRealmSearch.toLowerCase() === realm.toLowerCase() ? '#1a2a1a' : 'transparent')}
                            >
                              {realm}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  <input className="input-field" placeholder="Character name"
                    value={armoryName} onChange={e => setArmoryName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleArmoryLookup()} />
                </div>
                {armoryError && (
                  <div style={{ color: armoryError.startsWith('Warning') ? '#f59e0b' : '#ef4444', fontSize: 12, marginBottom: 8, fontFamily: "'EB Garamond', serif" }}>
                    ⚠ {armoryError}
                  </div>
                )}
                <button onClick={handleArmoryLookup} disabled={armoryLoading}
                  style={{
                    width: '100%', background: armoryLoading ? '#1a1208' : '#0e1a1e', border: '1px solid #1a3a4a',
                    borderRadius: 6, padding: '10px', color: '#38bdf8', fontFamily: "'Cinzel', serif",
                    fontSize: 11, letterSpacing: 2, cursor: armoryLoading ? 'not-allowed' : 'pointer', transition: 'all 0.2s'
                  }}>
                  {armoryLoading ? '⟳ LOOKING UP...' : '🔍 FETCH FROM ARMORY'}
                </button>
                {armoryAvatar && (
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <img src={armoryAvatar} alt="Character avatar" style={{ width: 40, height: 40, borderRadius: 4, border: '1px solid #3a2810' }} />
                    <span style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: '#86efac' }}>
                      ✓ Character loaded from Armory
                      {itemEnrichLoading && <span style={{ color: '#f59e0b' }}> · Enriching item names...</span>}
                    </span>
                  </div>
                )}
                <div className="divider" style={{ margin: '16px 0 0' }} />
              </div>

              {/* SimC Import */}
              <div style={{ background: '#0d0f16', border: '1px solid #2a2018', borderRadius: 10, padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: 13, letterSpacing: 2, color: '#e8c88a', margin: 0 }}>
                    📋 SIMULATIONCRAFT IMPORT
                  </h3>
                  <button onClick={handleLoadSample} style={{
                    background: '#1a1208', border: '1px solid #3a2810', borderRadius: 4,
                    color: '#8a7050', fontSize: 11, padding: '4px 10px', cursor: 'pointer',
                    fontFamily: "'EB Garamond', serif"
                  }}>Load Sample</button>
                </div>
                <p style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: '#6a5030', marginBottom: 10 }}>
                  In-game: /simc → copy all output and paste below
                </p>
                <textarea
                  className="input-field"
                  value={simcInput}
                  onChange={e => setSimcInput(e.target.value)}
                  placeholder="Paste your SimulationCraft addon export here..."
                  style={{ height: 160, resize: 'vertical', lineHeight: 1.6 }}
                />
                {parseError && (
                  <div style={{ color: '#ef4444', fontSize: 12, marginTop: 8, fontFamily: "'EB Garamond', serif" }}>
                    ⚠ {parseError}
                  </div>
                )}
                <button onClick={handleParse} style={{
                  marginTop: 12, width: '100%', background: '#151e14', border: '1px solid #2a3a1a',
                  borderRadius: 6, padding: '10px', color: '#86efac', fontFamily: "'Cinzel', serif",
                  fontSize: 11, letterSpacing: 2, cursor: 'pointer', transition: 'all 0.2s'
                }}>
                  ✦ PARSE CHARACTER
                </button>

                {parsedChar && (
                  <div style={{ marginTop: 14, padding: 12, background: '#0f1a0e', borderRadius: 6, border: '1px solid #1e3018', animation: 'fadeIn 0.3s ease' }}>
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: 12, color: '#86efac', marginBottom: 8 }}>
                      ✓ CHARACTER LOADED
                    </div>
                    {/* Character info + 3D Model row */}
                    <div style={{ display: 'flex', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        {/* Character info */}
                        <div className="stats-grid" style={{ fontFamily: "'EB Garamond', serif", fontSize: 13, marginBottom: 10 }}>
                          {parsedChar.character.name && <span style={{ color: '#e8c88a' }}>Name: <b>{parsedChar.character.name}</b></span>}
                          {parsedChar.character.level && <span style={{ color: '#c8a870' }}>Level: {parsedChar.character.level}</span>}
                          {parsedChar.character.race && <span style={{ color: '#c8a870' }}>Race: {parsedChar.character.race}</span>}
                          {parsedChar.character.avgIlvl > 0 && <span style={{ color: '#f0c880' }}>Avg iLvl: <b>{parsedChar.character.avgIlvl}</b></span>}
                        </div>

                    {/* Stats */}
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: 10, letterSpacing: 1, color: '#7a6040', marginBottom: 6 }}>STATS</div>
                    <div className="stats-grid" style={{ fontFamily: "'EB Garamond', serif", fontSize: 13, marginBottom: 10 }}>
                      <span style={{ color: '#a0a0a0' }}>AGI: <b>{parsedChar.stats.agility.toLocaleString()}</b></span>
                      <span style={{ color: '#c8a870' }}>AP: <b>{Math.round(parsedChar.stats.attackPower).toLocaleString()}</b></span>
                      <span style={{ color: '#60a5fa' }}>Haste: <b>{parsedChar.stats.haste}%</b></span>
                      <span style={{ color: '#f59e0b' }}>Crit: <b>{parsedChar.stats.crit}%</b></span>
                      <span style={{ color: '#a78bfa' }}>Mastery: <b>{parsedChar.stats.mastery}%</b></span>
                      <span style={{ color: '#34d399' }}>Vers: <b>{parsedChar.stats.versatility}%</b></span>
                    </div>
                      </div>
                      {/* Character Render Viewer */}
                      <div style={{ flexShrink: 0 }}>
                        <WowModelViewer
                          renderUrl={parsedChar.media?.assets?.find((a: any) => a.key === 'main-raw')?.value || parsedChar.media?.assets?.find((a: any) => a.key === 'main')?.value}
                          fallbackUrl={parsedChar.media?.assets?.find((a: any) => a.key === 'avatar')?.value}
                          width={200}
                          height={240}
                        />
                      </div>
                    </div>

                    {/* Gear list */}
                    {parsedChar.gear.length > 0 && (
                      <>
                        <div style={{ fontFamily: "'Cinzel', serif", fontSize: 10, letterSpacing: 1, color: '#7a6040', marginBottom: 6 }}>
                          GEAR ({parsedChar.gear.length} PIECES)
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {parsedChar.gear.map((g, gi) => {
                            const qualityColor = g.ilvl >= 250 ? '#ff8000' : g.ilvl >= 230 ? '#a335ee' : g.ilvl >= 200 ? '#0070dd' : g.ilvl > 0 ? '#1eff00' : '#9d9d9d';
                            return (
                            <div key={gi} className="gear-row"
                              onMouseEnter={e => g.itemId && handleItemHover(g.itemId, e)}
                              onMouseLeave={handleItemLeave}
                              style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '4px 8px', borderRadius: 4,
                                background: gi % 2 === 0 ? '#0a0e08' : 'transparent',
                                fontFamily: "'EB Garamond', serif", fontSize: 12,
                                position: 'relative'
                              }}>
                              <span style={{ color: '#8a7050', minWidth: 80 }}>{g.slotLabel}</span>
                              <span style={{ color: qualityColor, flex: 1, textAlign: 'center', fontSize: 11 }}>
                                {g.name}
                                {g.itemId && <span style={{ color: '#4a3020', fontSize: 10 }}> 🔍</span>}
                              </span>
                              <span style={{ color: qualityColor, fontWeight: 600, minWidth: 30, textAlign: 'right' }}>
                                {g.ilvl > 0 ? g.ilvl : '—'}
                              </span>
                            </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Sim Config */}
              <div style={{ background: '#0d0f16', border: '1px solid #2a2018', borderRadius: 10, padding: 20 }}>
                <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: 13, letterSpacing: 2, color: '#e8c88a', margin: '0 0 16px' }}>
                  ⚙ SIMULATION CONFIG
                </h3>

                {/* Hero Talent */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: 1, color: '#7a6040', display: 'block', marginBottom: 8 }}>
                    HERO TALENT
                  </label>
                  <div className="hero-grid">
                    <button className={`hero-btn ${heroTalent === 'sentinel' ? 'selected' : ''}`}
                      onClick={() => setHeroTalent('sentinel')}>
                      <div className="sentinel-badge" style={{ fontFamily: "'Cinzel', serif", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>🦉 SENTINEL</div>
                      <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 11, color: '#6a5030', lineHeight: 1.4 }}>
                        Owl procs on WFB · Resets WFB CD · Best overall
                      </div>
                      <div style={{ marginTop: 6, fontFamily: "'EB Garamond', serif", fontSize: 11, color: '#38bdf8' }}>
                        ★ Currently Recommended · 2H weapon
                      </div>
                    </button>
                    <button className={`hero-btn ${heroTalent === 'packLeader' ? 'selected' : ''}`}
                      onClick={() => setHeroTalent('packLeader')}>
                      <div className="pack-badge" style={{ fontFamily: "'Cinzel', serif", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>🐾 PACK LEADER</div>
                      <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 11, color: '#6a5030', lineHeight: 1.4 }}>
                        Beast procs on Kill Command · Focus regen
                      </div>
                      <div style={{ marginTop: 6, fontFamily: "'EB Garamond', serif", fontSize: 11, color: '#a78bfa' }}>
                        Dual wield · Bleed talents underperform
                      </div>
                    </button>
                  </div>
                </div>

                {/* Sim Mode */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: 1, color: '#7a6040', display: 'block', marginBottom: 8 }}>
                    SIMULATION MODE
                  </label>
                  <div className="sim-mode-grid">
                    {[
                      { key: 'single', label: '🎯 Single Target', sub: '1 target' },
                      { key: 'cleave', label: '⚔ Cleave', sub: '2–3 targets' },
                      { key: 'multi', label: '💥 Multi-Target', sub: '5 / 8 / 10 targets' }
                    ].map(m => (
                      <button key={m.key} className={`mode-btn ${simMode === m.key ? 'active' : ''}`}
                        onClick={() => setSimMode(m.key)} style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ fontSize: 13, marginBottom: 2 }}>{m.label}</div>
                        <div style={{ fontSize: 10, color: '#5a4030' }}>{m.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fight Duration */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: 1, color: '#7a6040', display: 'block', marginBottom: 8 }}>
                    FIGHT DURATION: <span style={{ color: '#e8c88a' }}>{Math.floor(fightDuration / 60)}:{String(fightDuration % 60).padStart(2, '0')}</span>
                  </label>
                  <input type="range" min={60} max={600} step={30} value={fightDuration}
                    onChange={e => setFightDuration(+e.target.value)}
                    style={{ width: '100%', accentColor: '#e07030' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'EB Garamond', serif", fontSize: 11, color: '#4a3020', marginTop: 4 }}>
                    <span>1 min</span><span>5 min</span><span>10 min</span>
                  </div>
                </div>

                <button className="sim-btn" onClick={handleSim}
                  disabled={!parsedChar || isSimming}
                  style={{ width: '100%' }}>
                  {isSimming ? '⟳ SIMULATING...' : '▶ RUN SIMULATION'}
                </button>

                {!parsedChar && (
                  <p style={{ textAlign: 'center', color: '#4a3020', fontFamily: "'EB Garamond', serif", fontSize: 12, marginTop: 10 }}>
                    Parse your character data first
                  </p>
                )}
              </div>
            </div>

            {/* RIGHT: Results */}
            <div>
              {isSimming && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 20 }}>
                  <div className="loading-ring" />
                  <div style={{ fontFamily: "'Cinzel', serif", fontSize: 12, letterSpacing: 3, color: '#7a6040' }}>
                    RUNNING SIMULATION...
                  </div>
                  <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: '#4a3020', textAlign: 'center' }}>
                    Calculating ability weights, cooldown alignment,<br />talent synergies, and target scaling...
                  </div>
                </div>
              )}

              {!isSimming && !simResults && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12 }}>
                  <div style={{ fontSize: 48, opacity: 0.3 }}>🔥</div>
                  <div style={{ fontFamily: "'Cinzel', serif", fontSize: 12, letterSpacing: 2, color: '#3a2810' }}>
                    RESULTS WILL APPEAR HERE
                  </div>
                  <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 13, color: '#3a2810', textAlign: 'center', maxWidth: 240 }}>
                    Import your character via SimulationCraft addon and run a simulation to see your DPS breakdown.
                  </div>
                </div>
              )}

              {!isSimming && simResults && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {simResults.map((result, ri) => {
                    const maxDps = Math.max(...Object.values(result.breakdown));
                    const sortedBreakdown = Object.entries(result.breakdown).sort((a, b) => b[1] - a[1]);
                    return (
                      <div key={ri} className="result-card" style={{
                        background: '#0d0f16', border: '1px solid #2a2018', borderRadius: 10, padding: 20,
                        animationDelay: `${ri * 0.1}s`
                      }}>
                        <div className="result-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                          <div>
                            <div style={{ fontFamily: "'Cinzel', serif", fontSize: 12, letterSpacing: 2, color: '#7a6040', marginBottom: 4 }}>
                              {result.targets === 1 ? '🎯 SINGLE TARGET' : result.targets <= 3 ? `⚔ CLEAVE (${result.targets} targets)` : `💥 MULTI-TARGET (${result.targets} targets)`}
                            </div>
                            <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 28, fontWeight: 700, color: '#e07030' }}>
                              {formatDps(result.totalDps)}
                            </div>
                            <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: '#5a4030' }}>DPS</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: heroTalent === 'sentinel' ? '#38bdf8' : '#a78bfa' }}>
                              {MIDNIGHT_DATA.talents.hero[heroTalent].name}
                            </div>
                            <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 11, color: '#4a3020' }}>
                              {Math.floor(result.duration / 60)}:{String(result.duration % 60).padStart(2, '0')} fight
                            </div>
                          </div>
                        </div>

                        {/* Ability breakdown bars */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {sortedBreakdown.map(([key, val]) => (
                            <div key={key}>
                              <div className="breakdown-head" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                <span className="breakdown-label" style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: '#8a7050' }}>{key}</span>
                                <span className="breakdown-value" style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: '#c8a870' }}>
                                  {formatDps(val)} ({Math.round(val / result.totalDps * 100)}%)
                                </span>
                              </div>
                              <div style={{ height: 6, background: '#1a1208', borderRadius: 3, overflow: 'hidden' }}>
                                <div className="bar-fill" style={{
                                  height: '100%', borderRadius: 3,
                                  width: `${(val / maxDps) * 100}%`,
                                  background: getBarColor(key)
                                }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {/* Multi-target comparison chart */}
                  {simResults.length > 1 && (
                    <div style={{ background: '#0d0f16', border: '1px solid #2a2018', borderRadius: 10, padding: 20 }}>
                      <div style={{ fontFamily: "'Cinzel', serif", fontSize: 12, letterSpacing: 2, color: '#7a6040', marginBottom: 14 }}>
                        📊 TARGET SCALING COMPARISON
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', height: 100 }}>
                        {simResults.map((r, i) => {
                          const maxVal = Math.max(...simResults.map(x => x.totalDps));
                          const pct = r.totalDps / maxVal;
                          return (
                            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                              <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 11, color: '#e8c88a' }}>
                                {formatDps(r.totalDps)}
                              </div>
                              <div style={{
                                width: '100%', background: `linear-gradient(180deg, #e07030, #c44e00)`,
                                height: `${pct * 80}px`, borderRadius: '3px 3px 0 0',
                                transition: 'height 0.8s ease'
                              }} />
                              <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 11, color: '#6a5030' }}>
                                {r.targets}T
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Stat Weights */}
                  {statWeights && (
                    <div style={{ background: '#0d0f16', border: '1px solid #2a2018', borderRadius: 10, padding: 20, marginTop: 16 }}>
                      <div style={{ fontFamily: "'Cinzel', serif", fontSize: 12, letterSpacing: 2, color: '#7a6040', marginBottom: 14 }}>
                        ⚖️ STAT WEIGHTS <span style={{ fontSize: 10, color: '#5a4030', letterSpacing: 1 }}>(normalized to Agility = 1.00)</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {Object.entries(statWeights.weights)
                          .sort(([,a], [,b]) => b.normalized - a.normalized)
                          .map(([stat, data]) => {
                            const maxNorm = Math.max(...Object.values(statWeights.weights).map(w => w.normalized));
                            const barPct = maxNorm > 0 ? (data.normalized / maxNorm) * 100 : 0;
                            const statColors = {
                              'Agility': '#22c55e',
                              'Mastery': '#f59e0b',
                              'Crit': '#ef4444',
                              'Haste': '#38bdf8',
                              'Versatility': '#a78bfa',
                            };
                            const color = statColors[stat] || '#6b7280';
                            return (
                              <div key={stat}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                  <span style={{ fontFamily: "'EB Garamond', serif", fontSize: 13, color }}>
                                    {stat}
                                  </span>
                                  <span style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: '#c8a870' }}>
                                    {data.normalized.toFixed(3)}
                                    <span style={{ color: '#5a4030', marginLeft: 8, fontSize: 11 }}>
                                      (+{Math.round(data.delta)} DPS from {data.bump})
                                    </span>
                                  </span>
                                </div>
                                <div style={{ height: 6, background: '#1a1208', borderRadius: 3, overflow: 'hidden' }}>
                                  <div style={{
                                    height: '100%', borderRadius: 3,
                                    width: `${barPct}%`,
                                    background: color,
                                    transition: 'width 0.6s ease',
                                  }} />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                      <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 11, color: '#4a3020', marginTop: 12, lineHeight: 1.5 }}>
                        Weights calculated via delta method: each stat is bumped independently and DPS change measured.
                        Per-rating values normalized to Agility = 1.00. Higher = more valuable per point.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== TALENTS TAB ===== */}
        {activeTab === 'talents' && (
          <div className="responsive-grid">

            {/* Optimal Builds */}
            <div style={{ background: '#0d0f16', border: '1px solid #2a2018', borderRadius: 10, padding: 24 }}>
              <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: 13, letterSpacing: 2, color: '#e8c88a', margin: '0 0 6px' }}>
                🌿 OPTIMAL TALENT BUILDS
              </h3>
              <p style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: '#5a4030', marginBottom: 20 }}>
                Method.gg & Icy Veins verified · Midnight 12.0.1 Pre-Season
              </p>

              {[
                { label: 'Single Target (Sentinel)', hero: 'sentinel', targets: 1 },
                { label: 'Single Target (Pack Leader)', hero: 'packLeader', targets: 1 },
                { label: 'AoE / M+ (Sentinel)', hero: 'sentinel', targets: 5 },
                { label: 'AoE / M+ (Pack Leader)', hero: 'packLeader', targets: 5 },
              ].map((build, bi) => {
                const opt = getOptimalTalents(build.targets, build.hero);
                return (
                  <div key={bi} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: bi < 3 ? '1px solid #1a1208' : 'none' }}>
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: 12, color: build.hero === 'sentinel' ? '#38bdf8' : '#a78bfa', marginBottom: 10 }}>
                      {build.label}
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      {opt.selected.map(t => (
                        <span key={t.key} className={`talent-tag ${t.always ? 'core' : t.aoePriority ? 'aoe' : 'st'}`}>
                          {t.key === 'mongooseFury' ? 'Mongoose Fury' :
                           t.key === 'mongooseRounds' ? 'Mongoose Rounds' :
                           t.key === 'strikeAsOne' ? 'Strike as One' :
                           t.key === 'wildfireBomb' ? 'Wildfire Bomb' :
                           t.key === 'boomstick' ? 'Boomstick' :
                           t.key === 'savagery' ? 'Savagery' :
                           t.key === 'vulnerability' ? 'Vulnerability' :
                           t.key === 'raptorSwipe' ? 'Raptor Swipe' :
                           t.key === 'flamefangPitch' ? 'Flamefang Pitch' :
                           t.key === 'grenadeJuggler' ? 'Grenade Juggler' :
                           t.key === 'wildfileShells' ? 'Wildfire Shells' :
                           t.key === 'shrapnelBomb' ? 'Shrapnel Bomb' :
                           t.key === 'flamebreak' ? 'Flamebreak' :
                           t.key === 'lethalCalibration' ? 'Lethal Calibration' :
                           t.key === 'wildfireImbuement' ? 'Wildfire Imbuement' :
                           t.key === 'twoAgainstMany' ? 'Two Against Many' :
                           t.key === 'takedown' ? 'Takedown' : t.key}
                        </span>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        flex: 1, fontFamily: 'monospace', fontSize: 10, color: '#4a3020',
                        background: '#080a10', borderRadius: 4, padding: '6px 10px',
                        wordBreak: 'break-all', lineHeight: 1.4
                      }}>
                        {opt.exportString}
                      </div>
                      <button onClick={() => copyExportString(opt.exportString)} style={{
                        background: '#1a1208', border: '1px solid #3a2810', borderRadius: 4,
                        color: '#8a7050', fontSize: 11, padding: '6px 12px', cursor: 'pointer',
                        fontFamily: "'EB Garamond', serif", whiteSpace: 'nowrap'
                      }}>
                        {copied ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Hero Talents Detail */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {Object.entries(MIDNIGHT_DATA.talents.hero).map(([key, hero]) => (
                <div key={key} style={{
                  background: '#0d0f16', border: `1px solid ${key === 'sentinel' ? '#1a3040' : '#2a1840'}`,
                  borderRadius: 10, padding: 20
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{
                        fontFamily: "'Cinzel', serif", fontSize: 14, fontWeight: 700, marginBottom: 4,
                        color: key === 'sentinel' ? '#38bdf8' : '#a78bfa'
                      }}>
                        {key === 'sentinel' ? '🦉' : '🐾'} {hero.name}
                        {hero.recommended && <span style={{ marginLeft: 8, fontSize: 10, color: '#86efac', fontWeight: 400 }}>★ RECOMMENDED</span>}
                      </div>
                      <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: '#6a5030' }}>
                        Weapon: {hero.weaponPref}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: '#c8a870' }}>ST: +{Math.round(hero.stBonus * 100)}%</div>
                      <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: '#86efac' }}>AoE: +{Math.round(hero.aoeBonus * 100)}%</div>
                    </div>
                  </div>
                  <p style={{ fontFamily: "'EB Garamond', serif", fontSize: 13, color: '#8a7050', lineHeight: 1.6, margin: '0 0 14px' }}>
                    {hero.desc}
                  </p>
                  <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: '#5a4030', marginBottom: 10, fontStyle: 'italic' }}>
                    Defensive: {hero.defensiveBenefit}
                  </div>
                  <div className="divider" style={{ margin: '12px 0' }} />
                  <div style={{ fontFamily: "'Cinzel', serif", fontSize: 10, letterSpacing: 1, color: '#4a3020', marginBottom: 8 }}>KEY SUB-TALENTS</div>
                  {Object.entries(hero.subTalents).map(([sk, st]) => (
                    <div key={sk} style={{ marginBottom: 8 }}>
                      <span style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: '#c8a870' }}>
                        {sk.replace(/([A-Z])/g, ' $1').trim()}:
                      </span>
                      <span style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: '#6a5030', marginLeft: 6 }}>
                        {st.desc}
                      </span>
                    </div>
                  ))}
                </div>
              ))}

              {/* Spec talent notes */}
              <div style={{ background: '#0d0f16', border: '1px solid #2a2018', borderRadius: 10, padding: 20 }}>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: 12, letterSpacing: 2, color: '#e8c88a', marginBottom: 14 }}>
                  🔑 KEY MIDNIGHT CHANGES
                </div>
                {[
                  { title: 'Explosive Shot & Kill Shot REMOVED', desc: 'No more essential active DPS in class tree. Pick passive increases (Keen Eyesight, Unnatural Causes, Trigger Finger, Serrated Tips) then utility. (Azortharion/Method)' },
                  { title: 'Kill Command — No Cooldown', desc: 'KC is now a spammable focus builder (20 focus w/ talent). Freedom to dump and rebuild focus at will enables Mongoose Fury overlap gameplay. (Azortharion)' },
                  { title: 'Takedown replaces Coordinated Assault', desc: '1:30 CD (→1min w/ Savagery). 20% amp for 8s (10s Sentinel). Generates 50 focus. Flanked: +4 targets +100% attack speed. TLDR: WFB > Pitch/Boom > Takedown > RS spam. (Azortharion)' },
                  { title: 'Mongoose Fury Rework', desc: 'No longer stacks to 6. Now an overlap mechanic: each RS adds 10% for 8s, multiple overlaps stack. ~2-3% real DPS from proper management vs yolo. (Azortharion analysis)' },
                  { title: 'Boomstick replaces Fury of the Eagle', desc: 'Frontal AoE shotgun, 1min CD. Shellshock: +40% ST (-5% per target). Mongoose Rounds grants MF stacks for pre-Takedown setup. (Maxroll)' },
                  { title: 'Flamefang Pitch (new AoE)', desc: '30s CD ground-targeted AoE + fire puddle. Grenade Juggler: +1 charge & grants WFB charge. Wildfire Imbuement: fire damage buff 10s. (Azortharion)' },
                  { title: 'Raptor Swipe — Apex Talent', desc: '4-point Apex: RS has 25% chance → Raptor Swipe (5 targets). Rank 3: every 2nd RS → Swipe. During Takedown: 100% proc + Strike as One at 300%. (Maxroll/Method)' },
                  { title: 'Dual Wield Support', desc: 'Survival can now dual wield 1H axes/swords/daggers. 2H still preferred with Sentinel. Pack Leader + Lethal Barbs favors DW. WDPS calculations matter — see Azortharion analysis. (Azortharion)' },
                  { title: 'Stat Priority Changed', desc: 'Mastery (Spirit Bond) overtook Haste as top secondary due to Strike as One + pet scaling. ST: Agi > Mastery > Crit = Haste > Vers. AoE: Agi > Mastery > Haste > Crit > Vers. (Method.gg Symex)' },
                ].map((note, i) => (
                  <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < 4 ? '1px solid #1a1208' : 'none' }}>
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: '#e07030', marginBottom: 4 }}>▸ {note.title}</div>
                    <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 13, color: '#6a5030', lineHeight: 1.5 }}>{note.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== GUIDE TAB ===== */}
        {activeTab === 'guide' && (
          <div className="responsive-grid">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Rotation */}
              <div style={{ background: '#0d0f16', border: '1px solid #2a2018', borderRadius: 10, padding: 24 }}>
                <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: 13, letterSpacing: 2, color: '#e8c88a', margin: '0 0 16px' }}>
                  ⚔ SINGLE TARGET ROTATION
                </h3>
                {[
                  { n: 1, label: 'Wildfire Bomb', note: 'If 2 charges, or Takedown ready, or Lethal Calibration down, or Sentinel\'s Mark on target. Never cap.' },
                  { n: 2, label: 'Flamefang Pitch / Boomstick', note: 'Cast before Takedown to apply Wildfire Imbuement / Mongoose Fury stacks.' },
                  { n: 3, label: 'Takedown', note: 'On CD. Savagery reduces to 1min. 20% amp for 8-10s. 100% Raptor Swipe proc.' },
                  { n: 4, label: 'Raptor Strike (>72.5 Focus)', note: 'Dump focus for Mongoose Fury overlaps. Continue pressing to drain all focus.' },
                  { n: 5, label: 'Moonlight Chakram', note: '[Sentinel] Available 15s after Takedown. Bounces between targets.' },
                  { n: 6, label: 'Kill Command', note: 'No CD — spam to rebuild focus. Builds Tip of the Spear. [Pack Leader] Prioritize when beast available.' },
                  { n: 7, label: 'Raptor Strike (maintenance)', note: 'Continue RS if 3+ Mongoose Fury stacks active to maintain overlap window.' },
                ].map(r => (
                  <div key={r.n} style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', background: '#1a0e06', border: '1px solid #e07030',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: "'Cinzel', serif", fontSize: 11, color: '#e07030', flexShrink: 0
                    }}>{r.n}</div>
                    <div>
                      <div style={{ fontFamily: "'Cinzel', serif", fontSize: 12, color: '#e8c88a', marginBottom: 2 }}>{r.label}</div>
                      <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 13, color: '#6a5030' }}>{r.note}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* AoE Rotation */}
              <div style={{ background: '#0d0f16', border: '1px solid #2a2018', borderRadius: 10, padding: 24 }}>
                <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: 13, letterSpacing: 2, color: '#e8c88a', margin: '0 0 16px' }}>
                  💥 AoE ROTATION (3+ targets)
                </h3>
                {[
                  { n: 1, label: 'Wildfire Bomb', note: 'Top priority. Sentinel: proc Sentinel\'s Mark → Lunar Storm AoE. Maintain Lethal Calibration.' },
                  { n: 2, label: 'Flamefang Pitch', note: '30s CD ground AoE + fire puddle. Grenade Juggler: +1 charge. Wildfire Imbuement: fire buff.' },
                  { n: 3, label: 'Boomstick', note: 'Frontal AoE, 5 targets. Wildfire Shells: -4s WFB CD per hit.' },
                  { n: 4, label: 'Raptor Strike → Raptor Swipe', note: 'Apex talent: 25% chance to cleave 5 targets (100% during Takedown). Main AoE spender.' },
                  { n: 5, label: 'Kill Command', note: 'Focus builder. [Pack Leader] spawns beasts for AoE damage.' },
                  { n: 6, label: 'Takedown', note: '20% amp. Flanked: hits 4 extra targets + 100% attack speed. 100% Swipe proc.' },
                ].map(r => (
                  <div key={r.n} style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', background: '#0e1a0e', border: '1px solid #22c55e',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: "'Cinzel', serif", fontSize: 11, color: '#22c55e', flexShrink: 0
                    }}>{r.n}</div>
                    <div>
                      <div style={{ fontFamily: "'Cinzel', serif", fontSize: 12, color: '#86efac', marginBottom: 2 }}>{r.label}</div>
                      <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 13, color: '#6a5030' }}>{r.note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Stats */}
              <div style={{ background: '#0d0f16', border: '1px solid #2a2018', borderRadius: 10, padding: 24 }}>
                <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: 13, letterSpacing: 2, color: '#e8c88a', margin: '0 0 16px' }}>
                  📊 STAT PRIORITY (Midnight 12.0)
                </h3>
                {[
                  { stat: 'Agility', color: '#f0c880', note: 'Primary stat. Always highest value per point.' },
                  { stat: 'Mastery', color: '#a78bfa', note: 'Spirit Bond: increases you and pet damage. Top secondary in Midnight due to Strike as One + pet scaling. (Method.gg)' },
                  { stat: 'Critical Strike', color: '#f59e0b', note: 'Strong scaling with Lethal Calibration (+15% crit dmg) and Stargazer (+2% stacking). Equal to Haste in ST.' },
                  { stat: 'Haste', color: '#60a5fa', note: 'Reduces GCD, focus regen, Kill Command throughput. Equal to Crit in ST, better in AoE. (Method.gg)' },
                  { stat: 'Versatility', color: '#34d399', note: 'Flat damage + survivability. Lowest priority but solid floor stat.' },
                ].map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ fontFamily: "'Cinzel', serif", fontSize: 12, color: s.color }}>{s.stat}</span>
                        <span style={{ fontFamily: "'EB Garamond', serif", fontSize: 11, color: '#4a3020' }}>#{i + 1}</span>
                      </div>
                      <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: '#5a4030' }}>{s.note}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* How to use */}
              <div style={{ background: '#0d0f16', border: '1px solid #2a2018', borderRadius: 10, padding: 24 }}>
                <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: 13, letterSpacing: 2, color: '#e8c88a', margin: '0 0 16px' }}>
                  📋 HOW TO USE THIS SIMULATOR
                </h3>
                {[
                  { step: '1', title: 'Get SimulationCraft Addon', desc: 'Install the SimulationCraft addon from CurseForge or WoWInterface.' },
                  { step: '2', title: 'Export Your Character', desc: 'In-game: type /simc and press Enter. A window appears with your character data.' },
                  { step: '3', title: 'Copy & Paste', desc: 'Select all text in the SimC window (Ctrl+A), copy it, and paste into the Import box on the Simulator tab.' },
                  { step: '4', title: 'Configure & Simulate', desc: 'Choose your Hero Talent, fight duration, and simulation mode (ST/Cleave/Multi). Click Run.' },
                  { step: '5', title: 'Read Results', desc: 'Compare DPS breakdown side-by-side. The bar chart shows each ability\'s contribution. Export optimal talent strings directly to your game.' },
                ].map(s => (
                  <div key={s.step} style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 4, background: '#1a0e06', border: '1px solid #8b5e3c',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: "'Cinzel', serif", fontSize: 10, color: '#e8c88a', flexShrink: 0
                    }}>{s.step}</div>
                    <div>
                      <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: '#c8a870', marginBottom: 3 }}>{s.title}</div>
                      <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 13, color: '#6a5030', lineHeight: 1.5 }}>{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Consumables */}
              <div style={{ background: '#0d0f16', border: '1px solid #2a2018', borderRadius: 10, padding: 24 }}>
                <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: 13, letterSpacing: 2, color: '#e8c88a', margin: '0 0 16px' }}>
                  🧪 CONSUMABLES (Midnight 12.0.1)
                </h3>
                {[
                  { icon: '🧪', label: 'Flask', item: 'Flask of the Magisters', color: '#a78bfa', note: 'Best flask for Agility DPS. Provides a large primary stat boost for 30 minutes (persists through death).' },
                  { icon: '⚗️', label: 'Combat Potion', item: 'Draught of Rampant Abandon', color: '#f87171', note: 'Use on pull and during Takedown windows. Grants a burst of primary stat at the cost of some stamina. Pre-pot 1s before pull.' },
                  { icon: '🗡️', label: 'Weapon Oil', item: 'Thalassian Phoenix Oil', color: '#fb923c', note: 'Apply to weapon(s). Chance to ignite enemies on hit dealing fire damage. Synergizes with Flamefang Pitch and fire talents.' },
                  { icon: '🍖', label: 'Food', item: 'Silvermoon Parade', color: '#fbbf24', note: 'Agility food buff. Use when no Feast is available. Always have personal food as backup in raid/M+.' },
                  { icon: '💎', label: 'Meta Gem', item: 'Eversong Diamond', color: '#22d3ee', note: 'Best meta gem for Survival. Provides Agility proc with high uptime. Socket in your helmet.' },
                  { icon: '🪨', label: 'Gems', item: 'Mastery + Secondary', color: '#a78bfa', note: 'Prioritize Mastery gems in Midnight. Fill remaining sockets with Mastery/Crit or Mastery/Haste based on stat weights from Raidbots.' },
                  { icon: '🔮', label: 'Enchants', item: 'Enchant Weapon — Authority of Radiant Power', color: '#c084fc', note: 'Weapon enchant. Ring: Mastery. Cloak: Avoidance or Leech. Chest: Crystalline Radiance. Legs: Stormbound Armor Kit. Boots: Defender\'s March.' },
                ].map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 16, flexShrink: 0, width: 24, textAlign: 'center' }}>{c.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2, flexWrap: 'wrap', gap: 4 }}>
                        <span style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: '#8a7050', textTransform: 'uppercase', letterSpacing: 1 }}>{c.label}</span>
                        <span style={{ fontFamily: "'Cinzel', serif", fontSize: 12, color: c.color }}>{c.item}</span>
                      </div>
                      <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: '#5a4030', lineHeight: 1.5 }}>{c.note}</div>
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 12, padding: '10px 14px', background: '#0a0c10', borderRadius: 6, border: '1px solid #1a1208' }}>
                  <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 11, color: '#4a3020', fontStyle: 'italic' }}>
                    Source: Method.gg (Symex) & Maxroll Survival Hunter Consumables Guide — Midnight 12.0.1
                  </div>
                </div>
              </div>

              {/* Mythic+ Dungeon Tips */}
              <div style={{ background: '#0d0f16', border: '1px solid #2a2018', borderRadius: 10, padding: 24 }}>
                <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: 13, letterSpacing: 2, color: '#e8c88a', margin: '0 0 16px' }}>
                  🏰 MYTHIC+ DUNGEON TIPS (Survival Hunter)
                </h3>
                <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 13, color: '#6a5030', marginBottom: 16, lineHeight: 1.6 }}>
                  Survival excels in M+ with strong sustained AoE, solid ST priority damage, and Sentinel's Lunar Storm for burst windows. Use Flamefang Pitch + Boomstick on cooldown during pulls, and save Takedown for dangerous packs or bosses.
                </div>

                <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: 1, color: '#c8a870', margin: '0 0 10px', textTransform: 'uppercase' }}>General Route Tips</div>
                {[
                  { icon: '🎯', tip: 'Pull around Takedown cooldown', desc: 'Your burst is on a ~60-90s cycle. Chain pulls so Takedown is ready for each dangerous pack. Communicate with your tank.' },
                  { icon: '🔥', tip: 'Pre-place Flamefang Pitch', desc: 'Drop the fire puddle where mobs are being gathered before they arrive. Free ticking damage as the tank positions.' },
                  { icon: '💣', tip: 'Never cap WFB charges', desc: 'Wildfire Bomb is your highest priority in AoE. With Grenade Juggler giving extra charges, always keep one cycling. Maintain Lethal Calibration uptime.' },
                  { icon: '🐾', tip: 'Use Misdirection on CD', desc: 'MD your tank every 30s. Especially important on big pulls and at the start of boss fights. Macro it to your tank.' },
                  { icon: '🛡️', tip: 'Survival of the Fittest for tank deaths', desc: 'SotF is your external DR. If the tank drops low or dies, you can kite with Aspect of the Cheetah + Harpoon mobility.' },
                  { icon: '⚡', tip: 'Sentinel: Lunar Storm placement', desc: 'Lunar Storm triggers on Sentinel Mark consumption. Position yourself so the AoE hits the full pack. It does massive damage on stacked mobs.' },
                ].map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 14, flexShrink: 0, width: 20, textAlign: 'center' }}>{t.icon}</div>
                    <div>
                      <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: '#e8c88a', marginBottom: 2 }}>{t.tip}</div>
                      <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: '#5a4030', lineHeight: 1.5 }}>{t.desc}</div>
                    </div>
                  </div>
                ))}

                <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: 1, color: '#c8a870', margin: '18px 0 10px', textTransform: 'uppercase' }}>Mob Priority Targets</div>
                <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: '#5a4030', marginBottom: 10, lineHeight: 1.5 }}>
                  Focus these mob types first in every dungeon. Use Raptor Strike + Kill Command to burn priority targets while your AoE (WFB, Pitch, Swipe) handles the rest.
                </div>
                {[
                  { priority: '1', label: 'Healers & Casters (Interruptible)', color: '#f87171', desc: 'Always #1 kill target. Use Counter Shot / Intimidation to lock them down. Survival has a 24s interrupt — coordinate with group.' },
                  { priority: '2', label: 'Inspiring / Bolstering Mobs', color: '#fbbf24', desc: 'Kill Inspiring mobs first (they make nearby mobs immune to CC). With Bolstering, burn the smallest HP mob last to avoid buffing the pack.' },
                  { priority: '3', label: 'Raging / Enraged Mobs', color: '#fb923c', desc: 'Tranq Shot removes enrage effects. You are one of the few classes with a reliable enrage dispel — use it proactively.' },
                  { priority: '4', label: 'Frontals & Swirlies', color: '#60a5fa', desc: 'As melee, dodge telegraphed abilities. Harpoon back in after mechanics. Aspect of the Cheetah for emergency repositioning.' },
                  { priority: '5', label: 'Boss Add Spawns', color: '#a78bfa', desc: 'Save Boomstick + Flamefang Pitch for add phases. Takedown if adds are high priority. Your AoE burst is excellent for burning adds before they reach the group.' },
                ].map((m, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%', background: '#1a0a0a', border: `1px solid ${m.color}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: "'Cinzel', serif", fontSize: 10, color: m.color, flexShrink: 0
                    }}>{m.priority}</div>
                    <div>
                      <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: m.color, marginBottom: 2 }}>{m.label}</div>
                      <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: '#5a4030', lineHeight: 1.5 }}>{m.desc}</div>
                    </div>
                  </div>
                ))}

                <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: 1, color: '#c8a870', margin: '18px 0 10px', textTransform: 'uppercase' }}>Utility Toolkit</div>
                {[
                  { ability: 'Binding Shot', key: 'AoE Root', color: '#22d3ee', desc: 'Place on stacked mobs. 5s root after they leave the area. Excellent for kiting and grouping.' },
                  { ability: 'Intimidation', key: 'ST Stun', color: '#fbbf24', desc: '3s stun on a 1min CD. Save for critical casts that Counter Shot can\'t reach (stun-only interrupts).' },
                  { ability: 'Tar Trap', key: 'AoE Slow', color: '#34d399', desc: '50% slow zone. Drop on patrol paths or kite routes. Stacks with Binding Shot for complete control.' },
                  { ability: 'Aspect of the Turtle', key: 'Immunity', color: '#60a5fa', desc: 'Full immunity for 8s. Use for soaking mechanics or surviving one-shots. Cannot attack during.' },
                  { ability: 'Tranquilizing Shot', key: 'Enrage Dispel', color: '#fb923c', desc: 'Removes 1 enrage and 1 magic buff. Critical utility in M+ — always watch for purgeable buffs.' },
                ].map((u, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'flex-start' }}>
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: 10, color: u.color, width: 90, flexShrink: 0 }}>
                      {u.ability} <span style={{ fontSize: 9, color: '#4a3020' }}>({u.key})</span>
                    </div>
                    <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: '#5a4030', lineHeight: 1.4 }}>{u.desc}</div>
                  </div>
                ))}

                <div style={{ marginTop: 12, padding: '10px 14px', background: '#0a0c10', borderRadius: 6, border: '1px solid #1a1208' }}>
                  <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 11, color: '#4a3020', fontStyle: 'italic' }}>
                    Source: Method.gg M+ Survival Guide, Mythicstats.com comp data, Archon.gg dungeon rankings — Midnight 12.0.1
                  </div>
                </div>
              </div>

              {/* Data disclaimer */}
              <div style={{ background: '#0a0c10', border: '1px solid #1a1208', borderRadius: 8, padding: 16 }}>
                <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: '#4a3020', lineHeight: 1.6, fontStyle: 'italic' }}>
                  ⚠ Simulation values are calculated internally using Midnight 12.0 ability coefficients, rotation modeling, and stat scaling formulas derived from Method.gg and Icy Veins pre-season guides. Tuning values will shift as Blizzard applies hotfixes — update talent weight constants as needed when major patches land.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 48, paddingTop: 24, borderTop: '1px solid #1a1208' }}>
          <p style={{ fontFamily: "'Cinzel', serif", fontSize: 10, letterSpacing: 3, color: '#3a2810' }}>
            SURVIVAL HUNTER SIM · MIDNIGHT 12.0 PRE-SEASON 1 · INTERNAL ENGINE
          </p>
        </div>
      </div>

      {/* Item Tooltip */}
      {hoveredItem && (
        <div className="item-tooltip" style={{
          left: Math.min(tooltipPos.x, typeof window !== 'undefined' ? window.innerWidth - 340 : tooltipPos.x),
          top: Math.max(8, Math.min(tooltipPos.y, typeof window !== 'undefined' ? window.innerHeight - 300 : tooltipPos.y)),
        }}>
          {tooltipLoading && !itemCache[hoveredItem] ? (
            <div className="item-tooltip-loading">Loading item data...</div>
          ) : itemCache[hoveredItem]?._error ? (
            <div className="item-tooltip-loading">Could not load item data</div>
          ) : itemCache[hoveredItem] ? (() => {
            const item = itemCache[hoveredItem];
            const qualityColors = {
              LEGENDARY: '#ff8000', EPIC: '#a335ee', RARE: '#0070dd',
              UNCOMMON: '#1eff00', COMMON: '#ffffff', POOR: '#9d9d9d', HEIRLOOM: '#00ccff'
            };
            const nameColor = qualityColors[item.quality?.type] || '#a335ee';
            return (
              <>
                {item._icon && <img className="item-tooltip-icon" src={item._icon} alt="" />}
                <div className="item-tooltip-name" style={{ color: nameColor }}>
                  {item.name || 'Unknown Item'}
                </div>
                <div className="item-tooltip-ilvl">
                  Item Level {item.level || item.item_level || '?'}
                </div>
                {item.preview_item?.binding?.type && (
                  <div className="item-tooltip-binding">
                    {item.preview_item.binding.type === 'ON_EQUIP' ? 'Binds when equipped' : 'Binds when picked up'}
                  </div>
                )}
                {(item.preview_item?.inventory_type?.name || item.preview_item?.item_subclass?.name) && (
                  <div className="item-tooltip-type">
                    <span>{item.preview_item?.inventory_type?.name || ''}</span>
                    <span>{item.preview_item?.item_subclass?.name || ''}</span>
                  </div>
                )}
                {item.preview_item?.armor && (
                  <div className="item-tooltip-stat">
                    <b>{item.preview_item.armor.value.toLocaleString()}</b> Armor
                  </div>
                )}
                {item.preview_item?.stats?.map((stat: any, si: number) => {
                  const statColors: Record<string, string> = {
                    AGILITY: '#a0d0a0', INTELLECT: '#6080ff', STRENGTH: '#c07060',
                    STAMINA: '#c8b890', CRIT_RATING: '#f59e0b', HASTE_RATING: '#60a5fa',
                    MASTERY_RATING: '#a78bfa', VERSATILITY: '#34d399'
                  };
                  const c = statColors[stat.type?.type] || '#c8b890';
                  const prefix = stat.is_negated ? '-' : '+';
                  return (
                    <div key={si} className="item-tooltip-stat" style={{ color: c }}>
                      {prefix}{stat.value} {stat.type?.name || stat.type?.type || ''}
                    </div>
                  );
                })}
                {item.preview_item?.spells?.map((spell: any, si: number) => (
                  <div key={si} style={{ fontSize: 11, color: '#1eff00', marginTop: 4, lineHeight: 1.4 }}>
                    {spell.description || spell.spell?.name || ''}
                  </div>
                ))}
                {item.preview_item?.set && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#f0c880' }}>
                    Set: {item.preview_item.set.display_string || item.preview_item.set.item_set?.name || ''}
                  </div>
                )}
                {item.preview_item?.durability && (
                  <div style={{ marginTop: 4, fontSize: 10, color: '#6a5030' }}>
                    Durability {item.preview_item.durability.value} / {item.preview_item.durability.value}
                  </div>
                )}
                {item.required_level && (
                  <div style={{ fontSize: 10, color: '#6a5030' }}>
                    Requires Level {item.required_level}
                  </div>
                )}
              </>
            );
          })() : (
            <div className="item-tooltip-loading">Hover to load...</div>
          )}
        </div>
      )}
    </div>
  );
}
