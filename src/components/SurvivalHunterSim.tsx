// @ts-nocheck
import { useState, useCallback, useEffect } from "react";
import { getFullCharacter, equipmentToSimData, getItemsBatch, getItem, getItemMedia } from "@/lib/blizzardApi";
import WowModelViewer from "@/components/WowModelViewer";
import survivalIconImg from "@/assets/survival-icon.png";

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
  const slotLabels: Record<string, string> = {
    head:'Head',neck:'Neck',shoulders:'Shoulders',back:'Back',chest:'Chest',wrist:'Wrist',hands:'Hands',waist:'Waist',legs:'Legs',feet:'Feet',
    finger1:'Ring 1',finger2:'Ring 2',trinket1:'Trinket 1',trinket2:'Trinket 2',main_hand:'Main Hand',off_hand:'Off Hand',tabard:'Tabard',shirt:'Shirt'
  };
  const gearSlotNames = Object.keys(slotLabels).join('|');
  const gearSlotPattern = new RegExp(`^(${gearSlotNames})=`);
  const bagSectionIdx = lines.findIndex(l => /gear from bags/i.test(l));
  const equipLines = bagSectionIdx >= 0 ? lines.slice(0, bagSectionIdx) : lines;
  const commentItemPattern = /^#\s+(.+?)\s+\((\d+)\)\s*$/;
  equipLines.forEach((line, idx) => {
    if (!gearSlotPattern.test(line)) return;
    const slotMatch = line.match(/^(\w+)=/); if (!slotMatch) return;
    const rawSlot = slotMatch[1];
    const slotKey = rawSlot.replace(/^shoulder$/, 'shoulders').replace(/^wrists$/, 'wrist');
    if (slotKey === 'tabard' || slotKey === 'shirt') return;
    const idMatch = line.match(/,id=(\d+)/);
    let itemName = slotLabels[slotKey] || slotKey; let ilvl = 0;
    if (idx > 0) { const cm = equipLines[idx - 1].match(commentItemPattern); if (cm) { itemName = cm[1]; ilvl = parseInt(cm[2]) || 0; } }
    const iLvlInline = line.match(/item_level=(\d+)/); if (iLvlInline) ilvl = parseInt(iLvlInline[1]);
    result.gear.push({ slot: slotKey, slotLabel: slotLabels[slotKey] || slotKey, ilvl, itemId: idMatch ? idMatch[1] : null, name: itemName });
  });
  if (result.gear.length > 0) { result.character.avgIlvl = Math.round(result.gear.reduce((sum, g) => sum + (g.ilvl || 0), 0) / result.gear.filter(g => g.ilvl > 0).length) || 0; }
  const talentLine = lines.find(l => /^talents=/.test(l)); if (talentLine) result.talents = talentLine.replace('talents=', '').trim();
  if (result.character.name || result.stats.agility > 0 || result.gear.length > 0) result.valid = true;
  else result.errors.push("Could not parse character data.");
  const avgIlvl = result.character.avgIlvl || 0;
  if (result.stats.agility === 0 && avgIlvl > 0) result.stats.agility = Math.round(400 + Math.max(0, avgIlvl - 550) * 13.5);
  if (result.stats.agility === 0) result.stats.agility = 1500;
  if (result.stats.attackPower === 0) result.stats.attackPower = Math.round(result.stats.agility * 1.05);
  if (result.stats.haste === 0 && avgIlvl > 0) {
    const s = Math.max(0, (avgIlvl - 550)) / 86;
    result.stats.haste = +(5 + s * 5.6).toFixed(2); result.stats.crit = +(8 + s * 12.1).toFixed(2);
    result.stats.mastery = +(10 + s * 20.2).toFixed(2); result.stats.versatility = +(2 + s * 6.3).toFixed(2);
  }
  return result;
}

// ============================================================
// SIMULATION ENGINE (kept exactly from existing)
// ============================================================
const SIMC_BREAKDOWN_PL_ST = { 'Strike as One':0.1883,'Raptor Swipe':0.1471,'Raptor Strike':0.1271,'Boomstick':0.0772,'Auto Attack (MH)':0.0711,'Kill Command':0.0499,'Wildfire Bomb':0.0821,'Auto Attack (OH)':0.0339,'Takedown':0.0331,'Pack Leader Beasts':0.0716,'Pet (Claw)':0.0246,"Kroluk's Warbanner":0.0220,'Pet Melee':0.0200,'Bear (Rend + Melee)':0.0261 };
const SIMC_BREAKDOWN_SENT_ST = { 'Raptor Strike':0.1400,'Raptor Swipe':0.1350,'Strike as One':0.1200,'Wildfire Bomb':0.1050,'Boomstick':0.0800,'Auto Attack (MH)':0.0650,'Kill Command':0.0500,'Moonlight Chakram':0.0450,'Sentinel Mark + Lunar Storm':0.0700,'Takedown':0.0380,'Auto Attack (OH)':0.0300,'Pet (Claw)':0.0250,'Pet Melee':0.0220,"Kroluk's Warbanner":0.0200 };

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

function getAbilityCoefficient(ability) {
  const c = { 'Strike as One':1.10,'Raptor Strike':1.40,'Kill Command':1.55,'Wildfire Bomb':1.20,'Boomstick':2.50,'Raptor Swipe':1.85,'Flamefang Pitch':1.80,'Mongoose Bite':1.60,'Hatchet Toss':0.95 };
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

function runSimulation(charData, targetCount, fightDuration, heroTalent, build, externalMult = 1.0) {
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
  return { totalDps: Math.round(totalDps), breakdown, targets: T, duration: fightDuration, hero: heroTalent, build, detailed };
}

function calcStatWeights(charData, targetCount, fightDuration, heroTalent, build, externalMult = 1.0) {
  const baseDps = runSimulation(charData, targetCount, fightDuration, heroTalent, build, externalMult).totalDps;
  const DELTA = { agility: 200, haste: 1.5, crit: 1.5, mastery: 1.5, versatility: 1.5 };
  const RATING_PER_PERCENT = { haste: 170, crit: 170, mastery: 170, versatility: 205 };
  const weights = {};
  const agiChar = JSON.parse(JSON.stringify(charData)); agiChar.stats.agility += DELTA.agility; agiChar.stats.attackPower = Math.round(agiChar.stats.agility * 1.05);
  const agiDps = runSimulation(agiChar, targetCount, fightDuration, heroTalent, build, externalMult).totalDps;
  const agiDelta = (agiDps - baseDps) / DELTA.agility;
  weights['Agility'] = { perPoint: agiDelta, perRating: agiDelta, delta: agiDps - baseDps, bump: `+${DELTA.agility}` };
  ['haste', 'crit', 'mastery', 'versatility'].forEach(stat => {
    const bumpChar = JSON.parse(JSON.stringify(charData)); bumpChar.stats[stat] = (bumpChar.stats[stat] || 0) + DELTA[stat];
    const bumpDps = runSimulation(bumpChar, targetCount, fightDuration, heroTalent, build, externalMult).totalDps;
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
  textMid:   "#94a3b8",
  textDim:   "#5a6a82",
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
  "Kill Command":"#60a5fa","Mongoose Bite":"#818cf8","Wildfire Bomb":"#f59e0b",
  "Boomstick":"#fb923c","Raptor Swipe":"#34d399","Flamefang Pitch":"#22d3ee",
  "Raptor Strike":"#ef4444","Strike as One":"#22c55e","Serpent Sting":"#a78bfa",
  "Pet (KC procs)":"#94a3b8","Tip of the Spear":"#7dd3fc","Takedown":"#93c5fd",
  "Takedown (CD)":"#93c5fd","Sentinel (hero)":"#38bdf8","Pack Leader (hero)":"#c084fc",
  "Sentinel Mark + Lunar Storm":"#38bdf8","Moonlight Chakram":"#818cf8",
  "Pack Leader Beasts":"#a78bfa","Auto Attack (MH)":"#94a3b8","Auto Attack (OH)":"#64748b",
  "Pet (Claw)":"#a3e635","Pet Melee":"#86efac","Bear (Rend + Melee)":"#fb923c",
  "Coord. Assault":"#e879f9","Kroluk's Warbanner":"#fbbf24",
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

const SAMPLE_SIMC = `hunter="blezaa"\nlevel=90\nrace=tauren\nregion=us\nserver=turalyon\nspec=survival\ntalents=C8PAo4YcvOcqUdzB9zV+NhSAcMgxMG2ILwMM0gFzMzMzwyAAAAAAgZMjZYGjZMDGTzAAAAAGAALLzMziZmZmZGzMgZ2AgxYmZhB\nagility=1558\nattack_power=1635\nhaste_rating=370\ncrit_rating=282\nmastery_rating=722\nversatility_rating=285\n# Midnight Suneater Crown (639)\nhead=,id=232011,item_level=639\n# Midnight Thread Choker (636)\nneck=,id=231814,item_level=636\n# Midnight Suneater Shoulderguards (639)\nshoulders=,id=232013,item_level=639\n# Midnight Drape of Dusk (636)\nback=,id=231756,item_level=636\n# Midnight Suneater Hauberk (639)\nchest=,id=232009,item_level=639\n# Midnight Bindings of Twilight (636)\nwrist=,id=231758,item_level=636\n# Midnight Suneater Grips (639)\nhands=,id=232012,item_level=639\n# Midnight Cord of Shadows (636)\nwaist=,id=231760,item_level=636\n# Midnight Suneater Legguards (639)\nlegs=,id=232010,item_level=639\n# Midnight Boots of the Nightborne (636)\nfeet=,id=231762,item_level=636\n# Midnight Signet of Dusk (636)\nfinger1=,id=231770,item_level=636\n# Midnight Band of Eternal Night (636)\nfinger2=,id=231772,item_level=636\n# Kroluk's Warbanner (636)\ntrinket1=,id=231780,item_level=636\n# Light's Potential (636)\ntrinket2=,id=231782,item_level=636\n# Midnight Suneater Glaive (639)\nmain_hand=,id=231800,item_level=639\n# Midnight Suneater Dirk (636)\noff_hand=,id=231802,item_level=636`;

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

// ============================================================
// MAIN COMPONENT — V8 Off-White + Charcoal Navy Design
// ============================================================
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
  const [activeTab, setActiveTab] = useState('sim');
  const [simMode, setSimMode] = useState('single');
  const [fightStyle, setFightStyle] = useState('patchwerk');
  const [raidBuffs, setRaidBuffs] = useState<Record<string, boolean>>({ battleShout: true, markOfTheWild: true, mysticTouch: true, huntersMark: true });
  const [consumables, setConsumables] = useState<Record<string, string>>({ flask: 'flaskOfAlchemicalChaos', food: 'mastery', potion: 'tempered' });
  const [showAdv, setShowAdv] = useState(false);
  const [copied, setCopied] = useState('');
  // Armory
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
    const handler = (e: MouseEvent) => { if (!node.contains(e.target as Node)) setShowRealmDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  // Item tooltips
  const [itemCache, setItemCache] = useState<Record<string, any>>({});
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [tooltipLoading, setTooltipLoading] = useState(false);

  const handleParse = useCallback(() => {
    setParseError(''); const result = parseSimcString(simcInput);
    if (result.valid) { setParsedChar(result); } else { setParseError(result.errors.join(' ')); setParsedChar(null); }
    setSimResults(null);
  }, [simcInput]);

  const handleLoadSample = () => { setSimcInput(SAMPLE_SIMC); setParsedChar(null); setSimResults(null); setParseError(''); };

  const handleArmoryLookup = useCallback(async () => {
    if (!armoryRealm.trim() || !armoryName.trim()) { setArmoryError('Enter both realm and character name.'); return; }
    setArmoryLoading(true); setArmoryError(''); setArmoryAvatar('');
    try {
      const fullData = await getFullCharacter(armoryRealm.trim().toLowerCase().replace(/\s+/g, '-'), armoryName.trim().toLowerCase(), armoryRegion);
      if (fullData.profile?.error) throw new Error(fullData.profile.error);
      const simData = equipmentToSimData(fullData);
      if (simData.character.spec && simData.character.spec.toLowerCase() !== 'survival') setArmoryError(`Warning: ${simData.character.name} is specced as ${simData.character.spec}, not Survival.`);
      setParsedChar(simData); setSimResults(null);
      if (fullData.media?.assets) { const avatar = fullData.media.assets.find((a: any) => a.key === 'avatar'); if (avatar?.value) setArmoryAvatar(avatar.value); }
      const itemIds = simData.gear.filter((g: any) => g.itemId).map((g: any) => parseInt(g.itemId));
      if (itemIds.length > 0) {
        setItemEnrichLoading(true);
        try {
          const items = await getItemsBatch(itemIds, armoryRegion);
          if (Array.isArray(items)) { const itemMap = {}; items.forEach((item: any) => { if (item.id) itemMap[item.id] = item; });
            const enrichedGear = simData.gear.map((g: any) => g.itemId && itemMap[g.itemId] ? { ...g, name: itemMap[g.itemId].name || g.name } : g);
            setParsedChar(prev => prev ? { ...prev, gear: enrichedGear } : prev);
          }
        } catch (e) { console.warn('Item enrichment failed:', e); } finally { setItemEnrichLoading(false); }
      }
    } catch (err) { setArmoryError(err.message || 'Failed to look up character.'); setParsedChar(null); } finally { setArmoryLoading(false); }
  }, [armoryRealm, armoryName, armoryRegion]);

  const handleItemHover = useCallback(async (itemId: string, event: any) => {
    if (!itemId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltipPos({ x: rect.right + 8, y: rect.top });
    setHoveredItem(itemId);
    // Check cache via functional update to avoid dependency on itemCache
    setItemCache(prev => {
      if (prev[itemId]) return prev; // Already cached, no fetch needed
      // Fetch item data asynchronously
      (async () => {
        setTooltipLoading(true);
        try {
          const [itemData, mediaData] = await Promise.all([
            getItem(parseInt(itemId), armoryRegion || 'us'),
            getItemMedia(parseInt(itemId), armoryRegion || 'us').catch(() => null)
          ]);
          const icon = mediaData?.assets?.find((a: any) => a.key === 'icon')?.value || null;
          setItemCache(p => ({ ...p, [itemId]: { ...itemData, _icon: icon } }));
        } catch (e) {
          setItemCache(p => ({ ...p, [itemId]: { _error: e.message } }));
        } finally {
          setTooltipLoading(false);
        }
      })();
      return prev;
    });
  }, [armoryRegion]);

  const handleItemLeave = useCallback(() => { setHoveredItem(null); }, []);

  const getTargets = () => simMode === 'single' ? [1] : simMode === 'cleave' ? [2, 3] : [5, 8, 10];

  const handleSim = useCallback(() => {
    if (!parsedChar) return; setIsSimming(true); setSimResults(null);
    let externalMult = 1.0; externalMult *= FIGHT_STYLES[fightStyle]?.mult || 1.0;
    Object.entries(raidBuffs).forEach(([buff, enabled]) => { if (enabled && RAID_BUFFS[buff]) externalMult *= RAID_BUFFS[buff].mult; });
    Object.entries(consumables).forEach(([cat, sel]) => { const opt = CONSUMABLES[cat]?.options?.find(o => o.key === sel); if (opt) externalMult *= opt.mult; });
    setTimeout(() => {
      const targets = getTargets();
      const results = targets.map(t => runSimulation(parsedChar, t, fightDuration, heroTalent, t === 1 ? 'st' : 'aoe', externalMult));
      const primaryBuild = targets[0] === 1 ? 'st' : 'aoe';
      const sw = calcStatWeights(parsedChar, targets[0], fightDuration, heroTalent, primaryBuild, externalMult);
      setStatWeights(sw); setSimResults(results); setOptimalTalents(getOptimalTalents(targets[targets.length - 1], heroTalent)); setIsSimming(false);
    }, 1200);
  }, [parsedChar, heroTalent, fightDuration, simMode, fightStyle, raidBuffs, consumables]);

  const copy = (str, key) => { navigator.clipboard.writeText(str).then(() => { setCopied(key); setTimeout(() => setCopied(''), 2000); }); };

  // Helper components
  const LBL = ({ children }) => (
    <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 3, color: C.textDim, textTransform: "uppercase", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
      {children}
      <div style={{ flex: 1, height: 1, background: C.borderSub }} />
    </div>
  );

  const CARD = ({ children, style = {} }) => (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, ...style }}>{children}</div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.pageBg, color: C.textPri, fontFamily: "'Rajdhani','Segoe UI',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;600;700;900&family=IBM+Plex+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;}
        .tab-btn{background:transparent;border:none;border-bottom:3px solid transparent;padding:12px 24px;color:#64748b;font-family:"Rajdhani",sans-serif;font-size:15px;font-weight:700;letter-spacing:1px;cursor:pointer;transition:all .2s;text-transform:uppercase;}
        .tab-btn.active{color:#fbbf24;border-bottom-color:#d97706;}
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
        .adv-toggle{background:none;border:none;color:#5a6a82;font-family:"Orbitron",sans-serif;font-size:8px;letter-spacing:2px;cursor:pointer;padding:0;display:flex;align-items:center;gap:6px;text-transform:uppercase;transition:color .2s;}
        .adv-toggle:hover{color:#94a3b8;}
        .divider{height:1px;background:#1a2236;margin:14px 0;}
        .item-tooltip{position:fixed;z-index:9999;background:linear-gradient(180deg,#141c2a,#0c1220);border:1px solid #2e4a6a;border-radius:10px;padding:14px 16px;min-width:260px;max-width:320px;box-shadow:0 8px 32px rgba(0,0,0,.6);pointer-events:none;animation:fadeIn .15s ease;font-family:"Rajdhani",sans-serif;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}
        @keyframes barGrow{from{width:0;}}
        @keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
        @keyframes goldPulse{0%,100%{box-shadow:0 4px 16px rgba(217,119,6,.4);}50%{box-shadow:0 4px 28px rgba(251,191,36,.65);}}
        @keyframes iconGlow{0%,100%{box-shadow:0 0 16px rgba(74,222,128,.2),0 0 40px rgba(34,197,94,.08);}50%{box-shadow:0 0 28px rgba(74,222,128,.38),0 0 60px rgba(34,197,94,.16);}}
        @keyframes counterUp{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
        @media(max-width:900px){.responsive-grid{grid-template-columns:1fr !important;}.tab-btn{flex:1 1 calc(50% - 2px);min-width:0;text-align:center;padding:10px 8px;font-size:13px;}}
      `}</style>

      {/* HEADER */}
      <div style={{ background: "linear-gradient(135deg,#0d1117,#1c2333,#0f1a2e)", padding: "18px 28px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 54, height: 54, borderRadius: 12, overflow: "hidden", border: "2px solid #2a4a2a", animation: "iconGlow 3s ease-in-out infinite", flexShrink: 0 }}>
              <img src={SURVIVAL_ICON} alt="Survival Hunter" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
            <div>
              <h1 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "clamp(14px,2vw,22px)", fontWeight: 900, letterSpacing: 4, color: C.textPri, margin: 0, lineHeight: 1 }}>SURVIVAL HUNTER</h1>
              <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 3, color: C.textDim, marginTop: 5 }}>MIDNIGHT 12.0 · PRE-SEASON 1 · TALENT OPTIMIZER & SIMULATOR</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className="badge" style={{ background: C.goldBg, color: C.goldLight, border: `1px solid rgba(217,119,6,.4)` }}>★ PRE-SEASON 1</span>
            <span className="badge" style={{ background: C.surface2, color: C.textMid, border: `1px solid ${C.border}` }}>PATCH 12.0.1</span>
            <span className="badge" style={{ background: C.greenBg, color: C.green, border: C.greenBdr }}>🦉 SENTINEL META</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "20px 20px 48px" }}>
        {/* TABS */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 22, gap: 2 }}>
          {[["sim", "⚔ Simulator"], ["talents", "🌿 Talents"], ["report", "📊 Report"], ["guide", "📖 Guide"]].map(([k, l]) => (
            <button key={k} className={`tab-btn ${activeTab === k ? "active" : ""}`} onClick={() => setActiveTab(k)}>{l}</button>
          ))}
        </div>

        {/* ═══ SIM TAB ═══ */}
        {activeTab === "sim" && (
          <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "minmax(340px,420px) 1fr", gap: 20 }}>
            {/* LEFT */}
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {/* Armory Lookup */}
              <CARD style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 16 }}>🌐</span>
                  <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 10, letterSpacing: 3, color: C.textMid, textTransform: "uppercase" }}>Armory Lookup</span>
                </div>
                <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, marginBottom: 16, lineHeight: 1.5 }}>
                  Pull your character directly from the WoW Armory — no addon needed
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
                  {["us", "eu", "kr", "tw"].map(r => (
                    <button key={r} onClick={() => { setArmoryRegion(r); setArmoryRealm(""); setArmoryRealmSearch(""); }}
                      style={{ background: armoryRegion === r ? "transparent" : C.surface2, border: `1px solid ${armoryRegion === r ? C.gold : C.border}`,
                        borderRadius: 8, padding: "10px 0", color: armoryRegion === r ? C.goldLight : C.textMid,
                        fontFamily: "'Orbitron',sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 2, cursor: "pointer", transition: "all .2s",
                        boxShadow: armoryRegion === r ? `inset 0 0 0 1px ${C.gold},0 0 12px rgba(217,119,6,.2)` : "none", textTransform: "uppercase"
                      }}>{r}</button>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12, position: "relative" }}>
                  <div ref={realmDropdownRef} style={{ position: "relative" }}>
                    <input className="ifield" value={armoryRealm ? armoryRealmSearch : armoryRealmSearch}
                      onChange={e => { setArmoryRealmSearch(e.target.value); setArmoryRealm(""); setShowRealmDropdown(true); }}
                      onFocus={() => setShowRealmDropdown(true)} placeholder="Search realm..."
                      style={{ fontSize: 14, fontFamily: "'Rajdhani',sans-serif", fontWeight: 500 }} />
                    {showRealmDropdown && (() => {
                      const realms = REALM_DATA[armoryRegion] || []; const q = armoryRealmSearch.toLowerCase();
                      const filtered = q ? realms.filter(r => r.toLowerCase().includes(q)).slice(0, 8) : realms.slice(0, 8);
                      if (filtered.length === 0) return null;
                      return (
                        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, zIndex: 100, maxHeight: 200, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,.4)" }}>
                          {filtered.map(rv => (
                            <div key={rv} onMouseDown={() => { setArmoryRealm(rv.toLowerCase().replace(/[' ]/g, '-')); setArmoryRealmSearch(rv); setShowRealmDropdown(false); }}
                              style={{ padding: "9px 14px", fontFamily: "'Rajdhani',sans-serif", fontSize: 14, color: C.textSec, cursor: "pointer", transition: "background .1s", borderBottom: `1px solid ${C.borderSub}` }}
                              onMouseEnter={e => e.currentTarget.style.background = C.surface3} onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                            >{rv}</div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  <input className="ifield" value={armoryName} onChange={e => setArmoryName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleArmoryLookup()} placeholder="Character name" style={{ fontSize: 14, fontFamily: "'Rajdhani',sans-serif", fontWeight: 500 }} />
                </div>
                {armoryError && <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.red, marginBottom: 10, lineHeight: 1.5 }}>⚠ {armoryError}</div>}
                <button onClick={handleArmoryLookup} disabled={armoryLoading}
                  style={{ width: "100%", background: armoryLoading ? "#1c2a3a" : C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "13px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, cursor: armoryLoading ? "not-allowed" : "pointer", transition: "all .2s", color: armoryLoading ? C.textDim : C.textSec, fontFamily: "'Orbitron',sans-serif", fontSize: 11, letterSpacing: 3, textTransform: "uppercase", fontWeight: 700 }}>
                  {armoryLoading ? <><span style={{ width: 10, height: 10, border: "2px solid #2e3a50", borderTopColor: C.sentClr, borderRadius: "50%", display: "inline-block", animation: "spin .8s linear infinite" }} /> FETCHING...</> : <>🔵 FETCH FROM ARMORY</>}
                </button>
                {armoryAvatar && (
                  <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
                    <img src={armoryAvatar} alt="" style={{ width: 40, height: 40, borderRadius: 6, border: `2px solid ${C.border}` }} />
                    <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.green }}>✓ Loaded from Armory {itemEnrichLoading && <span style={{ color: C.goldLight }}>· Enriching items...</span>}</span>
                  </div>
                )}
              </CARD>

              {/* SimC Import */}
              <CARD>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <LBL>📋 SimulationCraft Import</LBL>
                  <button onClick={handleLoadSample} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.textMid, fontSize: 12, padding: "4px 10px", cursor: "pointer", fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, marginLeft: 10, whiteSpace: "nowrap" }}>Sample</button>
                </div>
                <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, marginBottom: 10, lineHeight: 1.5 }}>
                  In-game: <code style={{ background: C.surface2, padding: "1px 6px", borderRadius: 3, fontSize: 11, color: C.textSec }}>/simc</code> → copy all → paste below
                </p>
                <textarea className="ifield" value={simcInput} onChange={e => setSimcInput(e.target.value)} placeholder="Paste your SimulationCraft addon export here..." style={{ height: 130, resize: "vertical", lineHeight: 1.6 }} />
                {parseError && <div style={{ color: C.red, fontSize: 13, marginTop: 6, fontFamily: "'Rajdhani',sans-serif" }}>⚠ {parseError}</div>}
                <button className="parse-btn" onClick={handleParse} style={{ marginTop: 10 }}>✦ Parse Character Data</button>

                {parsedChar && (
                  <div style={{ marginTop: 14, background: C.surface2, borderRadius: 10, border: `1px solid ${C.greenBdr}`, animation: "fadeUp .3s ease", overflow: "hidden" }}>
                    <div style={{ background: C.greenBg, padding: "10px 16px", borderBottom: `1px solid rgba(74,222,128,.15)`, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: C.green, fontSize: 13 }}>✓</span>
                      <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 9, color: C.green, letterSpacing: 2, fontWeight: 700 }}>CHARACTER LOADED</span>
                    </div>
                    <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.borderSub}`, display: "grid", gridTemplateColumns: "1fr 160px", gap: 14 }}>
                      <div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px", marginBottom: 12 }}>
                          {[["Name", parsedChar.character.name, C.textPri, true], ["Level", parsedChar.character.level, C.textSec, false], ["Race", parsedChar.character.race, C.textSec, false], ["Avg iLvl", parsedChar.character.avgIlvl ? `${parsedChar.character.avgIlvl}` : null, C.goldLight, true]].filter(([, v]) => v).map(([l, v, c, bold]) => (
                            <div key={l} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                              <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textDim, minWidth: 52 }}>{l}:</span>
                              <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, fontWeight: bold ? 700 : 500, color: c }}>{v}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 8 }}>STATS</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                          {[["AGI", parsedChar.stats.agility?.toLocaleString(), C.textPri], ["AP", Math.round(parsedChar.stats.attackPower)?.toLocaleString(), C.goldLight], ["Haste", `${parsedChar.stats.haste}%`, "#60a5fa"], ["Crit", `${parsedChar.stats.crit}%`, "#f59e0b"], ["Mastery", `${parsedChar.stats.mastery}%`, "#a78bfa"], ["Vers", `${parsedChar.stats.versatility}%`, "#34d399"]].map(([l, v, c]) => (
                            <div key={l} className="stat-chip">
                              <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 1, color: C.textDim, marginBottom: 2 }}>{l}</div>
                              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: c, fontWeight: 700 }}>{v}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Model viewer or placeholder */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                        {parsedChar.media?.assets ? (
                          <WowModelViewer renderUrl={parsedChar.media?.assets?.find((a: any) => a.key === 'main-raw')?.value || parsedChar.media?.assets?.find((a: any) => a.key === 'main')?.value} fallbackUrl={parsedChar.media?.assets?.find((a: any) => a.key === 'avatar')?.value} width={150} height={180} />
                        ) : (
                          <div style={{ width: "100%", height: 160, background: "#141c2a", border: `1px solid ${C.border}`, borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative" }}>
                            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 38, height: 38, borderRadius: 8, overflow: "hidden", opacity: .18 }}>
                              <img src={SURVIVAL_ICON} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            </div>
                            <div style={{ position: "relative", zIndex: 1, fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 2, color: C.textDim, textAlign: "center" }}>CHARACTER<br />RENDER</div>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Gear list */}
                    {parsedChar.gear.length > 0 && (
                      <div style={{ padding: "12px 16px" }}>
                        <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 10 }}>GEAR ({parsedChar.gear.length} PIECES)</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                          {parsedChar.gear.map((g, i) => {
                            const ilvlColor = g.ilvl >= 645 ? "#fbbf24" : g.ilvl >= 635 ? "#a78bfa" : g.ilvl >= 620 ? "#34d399" : "#94a3b8";
                            return (
                              <div key={i} style={{ display: "grid", gridTemplateColumns: "88px 1fr auto", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 6, background: i % 2 === 0 ? "transparent" : C.borderSub, transition: "background .15s", cursor: g.itemId ? "pointer" : "default" }}
                                onMouseEnter={e => g.itemId && handleItemHover(g.itemId, e)} onMouseLeave={handleItemLeave}>
                                <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textDim, fontWeight: 500 }}>{g.slotLabel}</span>
                                <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: "#a78bfa", fontWeight: 600, textAlign: "center" }}>{g.name || `Item`}</span>
                                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: ilvlColor, fontWeight: 700, textAlign: "right", minWidth: 32 }}>{g.ilvl || "—"}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CARD>

              {/* Sim Config */}
              <CARD style={{ marginTop: 16 }}>
                <LBL>⚙ Simulation Config</LBL>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 8 }}>HERO TALENT</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {Object.entries(MIDNIGHT_DATA.talents.hero).map(([k, h]) => (
                      <button key={k} className={`${k === "sentinel" ? "hero-sent" : "hero-pack"} ${heroTalent === k ? "sel" : ""}`} onClick={() => setHeroTalent(k)}>
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
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 8 }}>SIMULATION MODE</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[["single", "🎯 Single", "1 target"], ["cleave", "⚔ Cleave", "2–3 targets"], ["multi", "💥 Multi", "5/8/10"]].map(([k, l, s]) => (
                      <button key={k} className={`mode-btn ${simMode === k ? "sel" : ""}`} onClick={() => setSimMode(k)} style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: 13, marginBottom: 2 }}>{l}</div>
                        <div style={{ fontSize: 8, color: C.textDim }}>{s}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 8 }}>FIGHT DURATION — <span style={{ color: C.goldLight }}>{dL(fightDuration)}</span></div>
                  <input type="range" min={60} max={600} step={30} value={fightDuration} onChange={e => setFightDuration(+e.target.value)} style={{ width: "100%", accentColor: C.gold }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: C.textDim, marginTop: 4 }}><span>1 min</span><span>5 min</span><span>10 min</span></div>
                </div>
                {/* Advanced toggle */}
                <div style={{ marginBottom: 16 }}>
                  <button className="adv-toggle" onClick={() => setShowAdv(!showAdv)}>
                    <span>{showAdv ? "▾" : "▸"}</span> Advanced Options (Buffs / Consumables / Fight Style)
                  </button>
                  {showAdv && (
                    <div style={{ marginTop: 12, padding: 14, background: C.surface2, borderRadius: 10, border: `1px solid ${C.border}`, animation: "fadeUp .2s ease" }}>
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 8 }}>FIGHT STYLE</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                          {Object.entries(FIGHT_STYLES).map(([k, v]) => (
                            <button key={k} onClick={() => setFightStyle(k)}
                              style={{ background: fightStyle === k ? C.surface3 : C.surface, border: `1px solid ${fightStyle === k ? C.gold : C.border}`, borderRadius: 8, padding: "8px 10px", cursor: "pointer", textAlign: "left", transition: "all .15s" }}>
                              <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, fontWeight: 600, color: fightStyle === k ? C.goldLight : C.textSec }}>{v.label}</div>
                              <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 11, color: C.textDim }}>{v.desc} · {Math.round(v.mult * 100)}%</div>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 8 }}>RAID BUFFS</div>
                        {Object.entries(RAID_BUFFS).map(([k, b]) => (
                          <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer", borderBottom: `1px solid ${C.borderSub}` }} onClick={() => setRaidBuffs(p => ({ ...p, [k]: !p[k] }))}>
                            <input type="checkbox" checked={raidBuffs[k]} readOnly style={{ accentColor: C.gold, width: 14, height: 14, cursor: "pointer" }} />
                            <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, fontWeight: 600, color: C.textSec, flex: 1 }}>{b.icon} {b.label}</span>
                            <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: C.textDim }}>{b.stat}</span>
                          </label>
                        ))}
                      </div>
                      <div>
                        <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 8 }}>CONSUMABLES</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {Object.entries(CONSUMABLES).map(([k, d]) => (
                            <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, color: C.textDim, width: 44, flexShrink: 0, letterSpacing: 1 }}>{d.label}</span>
                              <select className="ifield" value={consumables[k]} onChange={e => setConsumables(p => ({ ...p, [k]: e.target.value }))} style={{ padding: "6px 10px", fontSize: 13 }}>
                                {d.options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <button className="sim-btn" onClick={handleSim} disabled={!parsedChar || isSimming}>{isSimming ? "⟳ SIMULATING..." : "▶ RUN SIMULATION"}</button>
                {!parsedChar && <p style={{ textAlign: "center", color: C.textDim, fontFamily: "'Rajdhani',sans-serif", fontSize: 12, marginTop: 8 }}>Parse your character first</p>}
              </CARD>
            </div>

            {/* RIGHT — Results */}
            <div>
              {isSimming && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 360, gap: 18 }}>
                  <div className="loading-ring" />
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 10, letterSpacing: 3, color: C.textDim }}>RUNNING SIMULATION</div>
                  <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, color: C.textMid, textAlign: "center", lineHeight: 1.7 }}>Calculating ability weights · cooldown alignment<br />talent synergies · target scaling</div>
                </div>
              )}
              {!isSimming && !simResults && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 360, gap: 14 }}>
                  <div style={{ opacity: .1 }}><img src={SURVIVAL_ICON} style={{ width: 80, height: 80, borderRadius: 12, filter: "grayscale(1)" }} /></div>
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 10, letterSpacing: 3, color: C.border }}>RESULTS WILL APPEAR HERE</div>
                  <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, color: C.textMid, textAlign: "center", maxWidth: 260, lineHeight: 1.6 }}>Import your character and run a simulation to see your full DPS breakdown.</div>
                </div>
              )}
              {!isSimming && simResults && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {simResults.map((res, ri) => {
                    const sorted = Object.entries(res.breakdown).sort((a, b) => b[1] - a[1]); const maxVal = sorted[0][1];
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

                  {/* Stat Weights */}
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

                  {/* Target Scaling */}
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
              )}
            </div>
          </div>
        )}

        {/* ═══ TALENTS TAB ═══ */}
        {activeTab === "talents" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Optimal Builds */}
            <CARD>
              <LBL>🌿 Optimal Talent Builds</LBL>
              <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, marginBottom: 20 }}>Method.gg & Icy Veins verified · Midnight 12.0.1 Pre-Season</p>
              {[{ label: 'Single Target (Sentinel)', hero: 'sentinel', targets: 1 }, { label: 'Single Target (Pack Leader)', hero: 'packLeader', targets: 1 }, { label: 'AoE / M+ (Sentinel)', hero: 'sentinel', targets: 5 }, { label: 'AoE / M+ (Pack Leader)', hero: 'packLeader', targets: 5 }].map((build, bi) => {
                const opt = getOptimalTalents(build.targets, build.hero);
                return (
                  <div key={bi} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: bi < 3 ? `1px solid ${C.borderSub}` : "none" }}>
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 10, color: C.goldLight, letterSpacing: 1, marginBottom: 10 }}>{build.label}</div>
                    <div style={{ marginBottom: 10, display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {opt.selected.map(t => (
                        <span key={t.key} className={`tag ${t.always ? 'tag-core' : t.aoePriority ? 'tag-aoe' : 'tag-st'}`}>
                          {t.key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                        </span>
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, fontFamily: "monospace", fontSize: 10, color: C.textDim, background: "#141c2a", borderRadius: 4, padding: "6px 10px", wordBreak: "break-all", lineHeight: 1.4 }}>{opt.exportString}</div>
                      <button className={`copy-btn ${copied === `talent-${bi}` ? "done" : ""}`} onClick={() => copy(opt.exportString, `talent-${bi}`)}>{copied === `talent-${bi}` ? "✓ Copied" : "Copy"}</button>
                    </div>
                  </div>
                );
              })}
            </CARD>

            {/* Hero talent details */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {Object.entries(MIDNIGHT_DATA.talents.hero).map(([key, hero]) => (
                <CARD key={key}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 20 }}>{hero.icon}</span>
                    <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 12, fontWeight: 700, color: key === "sentinel" ? C.sentClr : C.packClr }}>{hero.name}</span>
                    {hero.recommended && <span className="badge" style={{ background: C.greenBg, color: C.green, border: C.greenBdr, fontSize: 7 }}>★ RECOMMENDED</span>}
                  </div>
                  <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, lineHeight: 1.6, marginBottom: 10 }}>{hero.desc}</p>
                  <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: C.textDim, marginBottom: 10 }}>Weapon: {hero.weaponPref} · ST +{Math.round(hero.stBonus * 100)}% · AoE +{Math.round(hero.aoeBonus * 100)}%</div>
                  <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: C.textDim, fontStyle: "italic", marginBottom: 10 }}>Defensive: {hero.defensiveBenefit}</div>
                  <div className="divider" />
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 8 }}>KEY SUB-TALENTS</div>
                  {Object.entries(hero.subTalents).map(([sk, st]) => (
                    <div key={sk} style={{ marginBottom: 6 }}>
                      <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: key === "sentinel" ? C.sentClr : C.packClr, fontWeight: 600 }}>{sk.replace(/([A-Z])/g, ' $1').trim()}: </span>
                      <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: C.textMid }}>{st.desc}</span>
                    </div>
                  ))}
                </CARD>
              ))}
            </div>
          </div>
        )}

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

              // Category border colors
              const CAT_BORDER = { DAMAGE: "#d97706", DOT: "#a78bfa", PET: "#60a5fa", COOLDOWN: "#fb923c", BUFF: "#4ade80" };
              const CAT_BG = { DAMAGE: "rgba(217,119,6,.12)", DOT: "rgba(167,139,250,.12)", PET: "rgba(96,165,250,.12)", COOLDOWN: "rgba(251,146,60,.12)", BUFF: "rgba(74,222,128,.12)" };

              const ABILITY_ENCYCLOPEDIA = [
                {
                  name: "Kill Command", category: "DAMAGE", cd: "None (GCD)", range: "50 yd", cost: "Generates 20 Focus",
                  description: "Commands your pet to savagely attack the target, dealing Physical damage. This is your primary focus generator — you press it constantly to fuel your Raptor Strike and other spenders. It has no cooldown beyond the GCD, making it spammable.",
                  whyCast: "Kill Command is your engine. It generates the focus you need to use Raptor Strike and keeps your rotation flowing. In Pack Leader builds, it also triggers beast spawns for extra damage.",
                  mistake: "Sitting on full focus and still pressing Kill Command — you waste the focus generation. Spend first, then generate.",
                },
                {
                  name: "Raptor Strike", category: "DAMAGE", cd: "None (GCD)", range: "Melee", cost: "30 Focus",
                  description: "A powerful melee strike that deals heavy Physical damage. Each cast builds a stack of Mongoose Fury, increasing subsequent Raptor Strike damage by 10% for 8 seconds. Stacks overlap and accumulate.",
                  whyCast: "This is your hardest-hitting single-target ability when Mongoose Fury is stacked. During Takedown, Raptor Swipe procs 100% of the time, making it even more valuable as a combo piece.",
                  mistake: "Casting Raptor Strike without any Mongoose Fury stacks or when you're about to cap on Wildfire Bomb charges.",
                },
                {
                  name: "Wildfire Bomb", category: "DOT", cd: "18s (charges)", range: "40 yd", cost: "None",
                  description: "Hurls a bomb that explodes on impact, dealing initial Fire damage and leaving a burning DoT on all targets hit. It has charges that regenerate over time. With Lethal Calibration, it also grants +15% crit damage for 12 seconds.",
                  whyCast: "Free damage with no focus cost, plus it buffs your crit damage. The DoT component makes it scale well in AoE. Never let both charges sit full — that's wasted DPS.",
                  mistake: "Capping at 2 charges. You should always have one charge recharging. Treat it like a resource, not a cooldown.",
                },
                {
                  name: "Boomstick", category: "DAMAGE", cd: "60s", range: "12 yd cone", cost: "None",
                  description: "Replaces Fury of the Eagle. Fires a devastating frontal cone blast dealing massive Physical damage to all enemies. With Shellshock talent, it deals 40% increased damage to a single target (reduced per additional target).",
                  whyCast: "Your strongest burst ability on a 1-minute cooldown. In single-target, Shellshock makes it hit extremely hard. In AoE, it cleaves everything in front of you. Align with Takedown for maximum impact.",
                  mistake: "Using Boomstick when targets are behind you or spread out — it's a frontal cone, so positioning matters.",
                },
                {
                  name: "Serpent Sting", category: "DOT", cd: "None", range: "40 yd", cost: "10 Focus",
                  description: "Applies a Nature damage DoT to the target over 18 seconds. A low-maintenance ability that provides steady ticking damage while you execute your core rotation.",
                  whyCast: "Cheap, persistent damage that ticks in the background. Apply it once and refresh before it falls off. In multi-target, spreading Serpent Sting adds meaningful passive DPS.",
                  mistake: "Refreshing too early (before pandemic window) or forgetting to apply it entirely on priority targets.",
                },
                {
                  name: "Flanking Strike", category: "DAMAGE", cd: "30s", range: "Melee", cost: "Generates 30 Focus",
                  description: "You and your pet strike the target simultaneously, dealing combined Physical damage. Generates a large chunk of focus on use, making it both a damage ability and a powerful focus generator.",
                  whyCast: "Burst focus generation on a short cooldown. Use it when you need focus quickly — especially before a Takedown window to ensure you can spam Raptor Strikes during the buff.",
                  mistake: "Holding it too long. It's a 30s cooldown — use it on CD unless you're specifically pooling for a burst window 5 seconds away.",
                },
                {
                  name: "Takedown", category: "COOLDOWN", cd: "90s", range: "Melee", cost: "Generates 50 Focus",
                  description: "Your major damage cooldown. Deals 180% AP damage on activation and grants a 20% damage amplification buff for 8 seconds. Also generates 50 focus instantly. During Takedown, Raptor Swipe procs 100% from Raptor Strike.",
                  whyCast: "This is your burst window. Everything you do for 8 seconds hits 20% harder, and you get guaranteed Raptor Swipe procs. Align Boomstick, Wildfire Bomb, and pooled focus into this window.",
                  mistake: "Popping Takedown with no focus pooled or when Boomstick is on cooldown. You want maximum abilities inside the 8-second buff.",
                },
                {
                  name: "Coordinated Assault", category: "COOLDOWN", cd: "120s", range: "Self", cost: "None",
                  description: "Legacy 2-minute cooldown that empowers your attacks and your pet's attacks for a duration. In the Midnight expansion, this is largely replaced by Takedown for Survival Hunters running the new talent tree.",
                  whyCast: "If talented (non-Takedown builds), it provides a sustained damage increase over a longer window. Pairs with trinkets and external buffs for maximum value.",
                  mistake: "Using it during heavy movement phases where you can't maintain melee uptime for the full duration.",
                },
                {
                  name: "Raptor Swipe", category: "DAMAGE", cd: "Proc-based", range: "8 yd AoE", cost: "Generates 15 Focus",
                  description: "An Apex talent proc. Each Raptor Strike has a 25% chance to trigger Raptor Swipe (100% during Takedown). It hits up to 5 targets around you and generates focus, making it both a cleave tool and a resource builder.",
                  whyCast: "Free cleave damage that generates focus. During Takedown, every Raptor Strike guarantees a Raptor Swipe, creating a powerful burst AoE combo. This is why Takedown is so strong in M+.",
                  mistake: "There's no mistake to make — it's automatic. But you should be in melee range of grouped enemies to maximize its cleave.",
                },
                {
                  name: "Flamefang Pitch", category: "COOLDOWN", cd: "30s", range: "40 yd (ground target)", cost: "None",
                  description: "Throws a fire bomb at a target location, dealing burst Fire damage on impact and leaving a fire puddle that damages enemies standing in it. With Grenade Juggler, it gains an extra charge.",
                  whyCast: "Strong AoE cooldown that also does solid single-target damage from the puddle. Pre-place it where mobs are being gathered in M+ for maximum tick value.",
                  mistake: "Placing it where mobs are about to move away from. Coordinate with your tank's positioning for full puddle uptime.",
                },
                {
                  name: "Pet (Kill Command Procs)", category: "PET", cd: "Passive", range: "Melee (pet)", cost: "None",
                  description: "Your pet's passive attacks triggered by Kill Command and the Strike as One talent. Every damaging ability you cast causes your pet to attack. In Pack Leader builds, Kill Command also spawns additional beasts (Bear, Wyvern, Boar).",
                  whyCast: "Passive damage that scales with your Attack Power. Keep your pet alive and on the target. In Pack Leader builds, this becomes a significant portion of your total damage via beast spawns.",
                  mistake: "Letting your pet die or having it on a different target than your priority target. Pet positioning and survival directly affect your DPS.",
                },
              ];

              return (
                <>
                <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 20 }} className="responsive-grid">
                  {/* LEFT — Simulation Summary Table */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <CARD>
                      <LBL>📊 Simulation Summary</LBL>
                      {/* Header chips */}
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

                      {/* Ability breakdown table */}
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

                    {/* Buff Uptimes — compact */}
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

                  {/* RIGHT — Ability Encyclopedia */}
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
                            <div key={ability.name} style={{
                              background: C.surface2,
                              border: `1px solid ${C.borderSub}`,
                              borderLeft: `4px solid ${catColor}`,
                              borderRadius: "0 10px 10px 0",
                              padding: "16px 18px",
                            }}>
                              {/* Header */}
                              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                                <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 13, fontWeight: 700, color: C.textPri, letterSpacing: 0.5 }}>{ability.name}</span>
                                <span style={{
                                  fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 1.5, fontWeight: 700,
                                  padding: "3px 8px", borderRadius: 4,
                                  background: catBg, color: catColor, border: `1px solid ${catColor}40`,
                                }}>{ability.category}</span>
                              </div>

                              {/* Meta row */}
                              <div style={{ display: "flex", gap: 16, marginBottom: 10, flexWrap: "wrap" }}>
                                {[
                                  { label: "CD", value: ability.cd },
                                  { label: "Range", value: ability.range },
                                  { label: "Cost", value: ability.cost },
                                ].map(m => (
                                  <div key={m.label} style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
                                    <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 1, color: C.textDim }}>{m.label}:</span>
                                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: C.textMid }}>{m.value}</span>
                                  </div>
                                ))}
                              </div>

                              {/* Description */}
                              <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, lineHeight: 1.65, margin: "0 0 12px 0" }}>
                                {ability.description}
                              </p>

                              {/* Why you cast it */}
                              <div style={{ background: "rgba(217,119,6,.08)", border: `1px solid rgba(217,119,6,.2)`, borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
                                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 2, color: C.goldLight, marginBottom: 5 }}>WHY YOU CAST IT</div>
                                <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textSec, lineHeight: 1.6, margin: 0 }}>{ability.whyCast}</p>
                              </div>

                              {/* Common mistake */}
                              <div style={{ background: "rgba(248,113,113,.06)", border: `1px solid rgba(248,113,113,.15)`, borderRadius: 8, padding: "10px 14px" }}>
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

                {/* ═══ SPELL SEQUENCE TIMELINE ═══ */}
                {(() => {
                  const ABBREV: Record<string, string> = {
                    "Kill Command": "KC", "Mongoose Bite": "MB", "Raptor Strike": "MB",
                    "Wildfire Bomb": "WFB", "Boomstick": "BS", "Serpent Sting": "SS",
                    "Raptor Swipe": "RS", "Flamefang Pitch": "FP", "Takedown": "TD",
                    "Coordinated Assault": "CA", "Coord. Assault": "CA",
                    "Strike as One": "SaO", "Moonlight Chakram": "MC",
                    "Auto Attack (MH)": "AA", "Auto Attack (OH)": "AA2",
                  };

                  const isSentinel = heroTalent === 'sentinel';

                  // Generate a theoretical opener sequence based on hero talent
                  const SEQUENCE = isSentinel ? [
                    { t: 0.0, ability: "Takedown", reason: "Pop your major CD immediately at pull for the 20% damage amp window." },
                    { t: 0.0, ability: "Wildfire Bomb", reason: "Free damage + Lethal Calibration crit buff. No focus cost — always first." },
                    { t: 1.0, ability: "Boomstick", reason: "Heavy burst inside Takedown window. Shellshock amplifies ST damage." },
                    { t: 2.0, ability: "Kill Command", reason: "Generate focus after spending on opener abilities." },
                    { t: 3.0, ability: "Raptor Strike", reason: "First Mongoose Fury stack. Triggers guaranteed Raptor Swipe during TD." },
                    { t: 4.0, ability: "Kill Command", reason: "Refuel focus — keep the engine running." },
                    { t: 5.0, ability: "Raptor Strike", reason: "Stack #2 Mongoose Fury. Raptor Swipe procs for cleave damage." },
                    { t: 6.5, ability: "Moonlight Chakram", reason: "Sentinel capstone — bounces between targets for heavy damage." },
                    { t: 7.5, ability: "Kill Command", reason: "Continue focus generation. Strike as One triggers pet attack." },
                    { t: 8.5, ability: "Raptor Strike", reason: "Stack #3 Mongoose Fury before Takedown buff expires." },
                    { t: 10.0, ability: "Wildfire Bomb", reason: "Second charge available. Refresh Lethal Calibration buff." },
                    { t: 11.0, ability: "Kill Command", reason: "Maintain focus flow. Sentinel Mark may proc from RS." },
                    { t: 12.0, ability: "Raptor Strike", reason: "Spend focus — Mongoose Fury still active from earlier stacks." },
                    { t: 13.5, ability: "Kill Command", reason: "Focus generator — keep above 30 for next RS." },
                    { t: 14.5, ability: "Serpent Sting", reason: "Apply DoT now that opener burst is done. Cheap, persistent damage." },
                    { t: 16.0, ability: "Kill Command", reason: "Standard rotation — KC is your bread and butter." },
                    { t: 17.0, ability: "Raptor Strike", reason: "Refresh Mongoose Fury stacks. Maintain the 10% buff." },
                    { t: 18.5, ability: "Kill Command", reason: "Focus generation. Pet attacks via Strike as One." },
                    { t: 19.5, ability: "Wildfire Bomb", reason: "Charge available again — never cap charges." },
                    { t: 20.5, ability: "Kill Command", reason: "Sustain focus for upcoming RS." },
                    { t: 21.5, ability: "Raptor Strike", reason: "Maintain Mongoose Fury uptime." },
                    { t: 23.0, ability: "Kill Command", reason: "Standard filler — generates focus and triggers pet." },
                    { t: 24.0, ability: "Raptor Strike", reason: "Spend focus. Mongoose Fury stacks high now." },
                    { t: 25.5, ability: "Kill Command", reason: "Focus builder before Flamefang Pitch." },
                    { t: 26.5, ability: "Flamefang Pitch", reason: "30s CD now available. Place puddle on target." },
                    { t: 28.0, ability: "Kill Command", reason: "Keep generating focus." },
                    { t: 29.0, ability: "Raptor Strike", reason: "Spend focus. Mongoose Fury rolling strong." },
                  ] : [
                    { t: 0.0, ability: "Takedown", reason: "Pop your major CD at pull — 20% amp + 50 focus + guaranteed RS procs." },
                    { t: 0.0, ability: "Kill Command", reason: "Immediately trigger Pack Leader beast spawn on pull." },
                    { t: 1.0, ability: "Wildfire Bomb", reason: "Free damage — starts Lethal Calibration crit buff." },
                    { t: 2.0, ability: "Boomstick", reason: "Heavy burst inside Takedown. Mongoose Rounds: each hit = 1 MF stack." },
                    { t: 3.0, ability: "Raptor Strike", reason: "Guaranteed Raptor Swipe during Takedown. Stacks Mongoose Fury." },
                    { t: 4.0, ability: "Kill Command", reason: "Generate focus + trigger another beast spawn." },
                    { t: 5.0, ability: "Raptor Strike", reason: "Stack #2 MF. Raptor Swipe cleaves nearby targets." },
                    { t: 6.5, ability: "Kill Command", reason: "Focus generation. Lethal Barbs: auto attacks generate 2 Focus each." },
                    { t: 7.5, ability: "Raptor Strike", reason: "Stack #3 MF. Takedown buff still active." },
                    { t: 8.5, ability: "Kill Command", reason: "Refuel — Takedown buff fading. Maximize casts inside window." },
                    { t: 10.0, ability: "Wildfire Bomb", reason: "Second charge ready — maintain Lethal Calibration." },
                    { t: 11.0, ability: "Kill Command", reason: "Standard focus gen. Beast spawn cooldown cycling." },
                    { t: 12.0, ability: "Raptor Strike", reason: "Spend focus. Mongoose Fury stacking." },
                    { t: 13.5, ability: "Kill Command", reason: "Keep focus above 30 for spenders." },
                    { t: 14.5, ability: "Serpent Sting", reason: "Apply DoT during downtime between burst windows." },
                    { t: 16.0, ability: "Kill Command", reason: "Bread and butter — triggers pet attacks." },
                    { t: 17.0, ability: "Raptor Strike", reason: "Maintain Mongoose Fury. RS procs possible." },
                    { t: 18.5, ability: "Kill Command", reason: "Focus gen. Pack Leader beasts attacking." },
                    { t: 19.5, ability: "Wildfire Bomb", reason: "Never cap charges." },
                    { t: 20.5, ability: "Kill Command", reason: "Sustain rotation." },
                    { t: 21.5, ability: "Raptor Strike", reason: "Mongoose Fury maintenance." },
                    { t: 23.0, ability: "Kill Command", reason: "Filler — focus gen + pet trigger." },
                    { t: 24.0, ability: "Raptor Strike", reason: "High MF stacks now — big hits." },
                    { t: 25.5, ability: "Kill Command", reason: "Fuel for upcoming Flamefang Pitch window." },
                    { t: 26.5, ability: "Flamefang Pitch", reason: "30s CD ready. Fire puddle on target." },
                    { t: 28.0, ability: "Kill Command", reason: "Keep generating." },
                    { t: 29.0, ability: "Raptor Strike", reason: "Spend focus. MF rolling." },
                  ];

                  // Collect unique abilities for swim lanes
                  const uniqueAbilities = [...new Set(SEQUENCE.map(s => s.ability))];

                  // Cooldown periods (ability -> array of {start, end})
                  const CD_DURATIONS: Record<string, number> = {
                    "Takedown": 90, "Boomstick": 60, "Flamefang Pitch": 30,
                    "Wildfire Bomb": 18, "Moonlight Chakram": 90,
                    "Coordinated Assault": 120, "Coord. Assault": 120,
                  };

                  // Calculate cooldown bars from sequence
                  const cdBars: Record<string, Array<{ start: number; end: number }>> = {};
                  SEQUENCE.forEach(cast => {
                    const cdDur = CD_DURATIONS[cast.ability];
                    if (cdDur) {
                      if (!cdBars[cast.ability]) cdBars[cast.ability] = [];
                      cdBars[cast.ability].push({ start: cast.t, end: Math.min(30, cast.t + cdDur) });
                    }
                  });

                  const TIMELINE_WIDTH = 1800; // px for 30 seconds
                  const LANE_HEIGHT = 28;
                  const PILL_HEIGHT = 20;

                  return (
                    <CARD style={{ marginTop: 20 }}>
                      <LBL>⏱ Spell Sequence Timeline — First 30 Seconds</LBL>
                      <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, marginBottom: 14, lineHeight: 1.5 }}>
                        {isSentinel ? "🦉 Sentinel" : "🐾 Pack Leader"} opener rotation · Theoretical optimal cast sequence
                      </p>

                      {/* Timeline visualization */}
                      <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${C.border}` }}>
                        <div style={{ position: "relative", width: TIMELINE_WIDTH, minHeight: uniqueAbilities.length * LANE_HEIGHT + 30, background: "#0d1117", padding: "8px 0 0 0" }}>
                          {/* Time ticks */}
                          {Array.from({ length: 31 }, (_, i) => (
                            <div key={i} style={{
                              position: "absolute", left: `${(i / 30) * 100}%`, top: 0, bottom: 0,
                              borderLeft: i === 0 ? "none" : `1px solid ${i % 5 === 0 ? '#2e3a50' : '#1a2236'}`,
                              zIndex: 0,
                            }}>
                              {i % 5 === 0 && (
                                <span style={{
                                  position: "absolute", bottom: 4, left: 4,
                                  fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: C.textDim,
                                }}>{i}s</span>
                              )}
                            </div>
                          ))}

                          {/* Swim lanes */}
                          {uniqueAbilities.map((ability, laneIdx) => {
                            const color = bClr(ability);
                            const abbrev = ABBREV[ability] || ability.slice(0, 3).toUpperCase();
                            const laneCasts = SEQUENCE.filter(s => s.ability === ability);
                            const cdBarList = cdBars[ability] || [];

                            return (
                              <div key={ability} style={{ position: "relative", height: LANE_HEIGHT, marginLeft: 0 }}>
                                {/* Cooldown bars */}
                                {cdBarList.map((cd, ci) => (
                                  <div key={ci} style={{
                                    position: "absolute",
                                    left: `${(cd.start / 30) * 100}%`,
                                    width: `${((cd.end - cd.start) / 30) * 100}%`,
                                    top: PILL_HEIGHT + 2,
                                    height: 4,
                                    background: "rgba(90,106,130,.25)",
                                    borderRadius: 2,
                                    zIndex: 1,
                                  }} />
                                ))}

                                {/* Ability pills */}
                                {laneCasts.map((cast, ci) => (
                                  <div key={ci} style={{
                                    position: "absolute",
                                    left: `${(cast.t / 30) * 100}%`,
                                    top: 2,
                                    height: PILL_HEIGHT,
                                    minWidth: 36,
                                    padding: "0 8px",
                                    background: color,
                                    borderRadius: 6,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    zIndex: 2,
                                    boxShadow: `0 2px 6px ${color}40`,
                                  }}>
                                    <span style={{
                                      fontFamily: "'Orbitron',sans-serif",
                                      fontSize: 8,
                                      fontWeight: 700,
                                      color: "#fff",
                                      letterSpacing: 0.5,
                                      whiteSpace: "nowrap",
                                    }}>{abbrev}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Sequence Notes — first 12 casts */}
                      <div style={{ marginTop: 20 }}>
                        <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 2, color: C.textDim, marginBottom: 10 }}>OPENING SEQUENCE — FIRST 12 CASTS</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                          {SEQUENCE.slice(0, 12).map((cast, i) => {
                            const mins = Math.floor(cast.t / 60);
                            const secs = (cast.t % 60).toFixed(cast.t % 1 === 0 ? 0 : 1).padStart(cast.t % 1 === 0 ? 2 : 4, '0');
                            const ts = `${mins}:${secs}`;
                            const color = bClr(cast.ability);
                            return (
                              <div key={i} style={{
                                display: "grid",
                                gridTemplateColumns: "48px 10px 160px 1fr",
                                gap: 10,
                                padding: "8px 10px",
                                borderRadius: 6,
                                background: i % 2 === 0 ? "transparent" : C.borderSub,
                                alignItems: "center",
                              }}>
                                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: C.textDim, textAlign: "right" }}>{ts}</span>
                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                                <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, color, fontWeight: 700 }}>{cast.ability}</span>
                                <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, lineHeight: 1.4 }}>→ {cast.reason}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Disclaimer */}
                      <div style={{
                        marginTop: 16, padding: "12px 16px",
                        background: "rgba(251,191,36,.06)", border: `1px solid rgba(217,119,6,.2)`,
                        borderRadius: 8,
                      }}>
                        <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, margin: 0, lineHeight: 1.6 }}>
                          ⚠ This is a theoretical optimal sequence. Real combat varies based on movement, proc timing, Focus availability, and fight mechanics. Use this as a mental model, not a rigid script.
                        </p>
                      </div>
                    </CARD>
                  );
                })()}
              );
            })()}
          </div>
        )}

        {/* ═══ GUIDE TAB ═══ */}
        {activeTab === "guide" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* How to use */}
            <CARD>
              <LBL>📋 How to Use This Simulator</LBL>
              {[{ step: "1", title: "Get SimulationCraft Addon", desc: "Install from CurseForge or WoWInterface." }, { step: "2", title: "Export Your Character", desc: "In-game: /simc → Enter. A window appears." }, { step: "3", title: "Copy & Paste", desc: "Ctrl+A, Ctrl+C, paste in the Import box." }, { step: "4", title: "Configure & Simulate", desc: "Choose Hero Talent, duration, mode. Click Run." }, { step: "5", title: "Read Results", desc: "DPS breakdown + stat weights + talent export strings." }].map(s => (
                <div key={s.step} style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "flex-start" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: C.goldBg, border: `1px solid ${C.gold}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Orbitron',sans-serif", fontSize: 11, color: C.goldLight, flexShrink: 0 }}>{s.step}</div>
                  <div>
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 10, color: C.goldLight, marginBottom: 3, letterSpacing: 1 }}>{s.title}</div>
                    <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textMid, lineHeight: 1.5 }}>{s.desc}</div>
                  </div>
                </div>
              ))}
            </CARD>

            {/* Stat Priority */}
            <CARD>
              <LBL>📊 Stat Priority (Midnight 12.0)</LBL>
              {[{ stat: "Agility", color: C.goldLight, note: "Primary stat. Always highest value per point." }, { stat: "Mastery", color: "#a78bfa", note: "Spirit Bond: increases you and pet damage. Top secondary." }, { stat: "Critical Strike", color: "#f59e0b", note: "Strong with Lethal Calibration (+15% crit dmg)." }, { stat: "Haste", color: "#60a5fa", note: "Reduces GCD, focus regen. Equal to Crit in ST." }, { stat: "Versatility", color: "#34d399", note: "Flat damage + survivability. Lowest priority." }].map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, color: s.color, fontWeight: 600 }}>{s.stat} <span style={{ color: C.textDim, fontSize: 11 }}>#{i + 1}</span></div>
                    <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: C.textMid }}>{s.note}</div>
                  </div>
                </div>
              ))}
            </CARD>

            {/* Consumables */}
            <CARD>
              <LBL>🧪 Consumables (Midnight 12.0.1)</LBL>
              {[{ icon: "🧪", label: "Flask", item: "Flask of the Magisters", note: "Best flask for Agility DPS. 30 min duration." }, { icon: "⚗️", label: "Combat Potion", item: "Draught of Rampant Abandon", note: "Use on pull and during Takedown windows." }, { icon: "🗡️", label: "Weapon Oil", item: "Thalassian Phoenix Oil", note: "Fire damage proc. Synergizes with Flamefang Pitch." }, { icon: "🍖", label: "Food", item: "Silvermoon Parade", note: "Agility food buff." }, { icon: "💎", label: "Meta Gem", item: "Eversong Diamond", note: "Agility proc. Socket in helmet." }, { icon: "🔮", label: "Enchants", item: "Authority of Radiant Power", note: "Weapon. Rings: Mastery. Chest: Crystalline Radiance." }].map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 14, flexShrink: 0, width: 20, textAlign: "center" }}>{c.icon}</span>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 2 }}>
                      <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, color: C.textDim, letterSpacing: 1 }}>{c.label}</span>
                      <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.goldLight, fontWeight: 600 }}>{c.item}</span>
                    </div>
                    <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: C.textMid, lineHeight: 1.5 }}>{c.note}</div>
                  </div>
                </div>
              ))}
            </CARD>

            {/* M+ Tips */}
            <CARD>
              <LBL>🏰 Mythic+ Tips</LBL>
              {[{ icon: "🎯", tip: "Pull around Takedown cooldown", desc: "Your burst is on a 60-90s cycle. Chain pulls so Takedown is ready." }, { icon: "🔥", tip: "Pre-place Flamefang Pitch", desc: "Drop fire puddle where mobs are being gathered." }, { icon: "💣", tip: "Never cap WFB charges", desc: "Wildfire Bomb is highest AoE priority. Keep charges cycling." }, { icon: "🐾", tip: "Use Misdirection on CD", desc: "MD your tank every 30s." }, { icon: "⚡", tip: "Lunar Storm placement", desc: "Position for full pack coverage." }].map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 13, flexShrink: 0, width: 20, textAlign: "center" }}>{t.icon}</span>
                  <div>
                    <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.goldLight, fontWeight: 600, marginBottom: 2 }}>{t.tip}</div>
                    <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: C.textMid, lineHeight: 1.5 }}>{t.desc}</div>
                  </div>
                </div>
              ))}
            </CARD>
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 48, paddingTop: 24, borderTop: `1px solid ${C.borderSub}` }}>
          <p style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 3, color: C.textDim }}>SURVIVAL HUNTER SIM · MIDNIGHT 12.0 PRE-SEASON 1 · INTERNAL ENGINE</p>
        </div>
      </div>

      {/* Item Tooltip */}
      {hoveredItem && (
        <div className="item-tooltip" style={{
          left: Math.min(tooltipPos.x, typeof window !== 'undefined' ? window.innerWidth - 340 : tooltipPos.x),
          top: Math.max(8, Math.min(tooltipPos.y, typeof window !== 'undefined' ? window.innerHeight - 300 : tooltipPos.y)),
        }}>
          {tooltipLoading && !itemCache[hoveredItem] ? (
            <div style={{ color: C.textDim, fontSize: 12, fontStyle: "italic" }}>Loading item data...</div>
          ) : itemCache[hoveredItem]?._error ? (
            <div style={{ color: C.textDim, fontSize: 12 }}>Could not load item data</div>
          ) : itemCache[hoveredItem] ? (() => {
            const item = itemCache[hoveredItem];
            const qualityColors = { LEGENDARY: '#ff8000', EPIC: '#a335ee', RARE: '#0070dd', UNCOMMON: '#1eff00', COMMON: '#ffffff', POOR: '#9d9d9d' };
            const nameColor = qualityColors[item.quality?.type] || '#a335ee';
            return (
              <>
                {item._icon && <img src={item._icon} style={{ width: 36, height: 36, borderRadius: 6, border: `1px solid ${C.border}`, marginRight: 10, float: "left" }} />}
                <div style={{ fontSize: 15, fontWeight: 700, color: nameColor, marginBottom: 4 }}>{item.name}</div>
                {item.level && <div style={{ fontSize: 13, color: C.goldLight, marginBottom: 6 }}>Item Level {item.level}</div>}
                {item.item_class?.name && item.item_subclass?.name && (
                  <div style={{ fontSize: 12, color: C.textDim, display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span>{item.item_subclass.name}</span>
                    {item.inventory_type?.name && <span>{item.inventory_type.name}</span>}
                  </div>
                )}
                {item.preview_item?.stats && item.preview_item.stats.map((s, i) => (
                  <div key={i} style={{ fontSize: 13, color: C.textSec, padding: "1px 0" }}>+{s.value} {s.type?.name}</div>
                ))}
              </>
            );
          })() : null}
        </div>
      )}
    </div>
  );
}
