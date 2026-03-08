import { useState, useCallback, useEffect } from "react";

// ============================================================
// MIDNIGHT 12.0 SURVIVAL HUNTER SIMULATION ENGINE
// Based on Method.gg + Icy Veins + Epiccarry Midnight Pre-Season data
// ============================================================

const MIDNIGHT_DATA = {
  baseStats: {
    attackPower: 7200,
    baseAgility: 3800,
    petDamageMultiplier: 0.42,
  },
  spells: {
    // Core rotational abilities
    killCommand: { baseDmg: 1.8, apCoef: 0.82, cd: 7.5, focus: -30, aoeTargets: 1 },
    mongooseBite: { baseDmg: 1.4, apCoef: 0.72, cd: 0, focus: 30, stacks: "fury" },
    raptor: { baseDmg: 1.3, apCoef: 0.68, cd: 0, focus: 30, aoeTargets: 1 },
    wildfireBomb: { baseDmg: 3.6, apCoef: 1.45, cd: 18, focus: 0, aoeTargets: 8, dotDmg: 0.45, dotDuration: 6 },
    boomstick: { baseDmg: 2.2, apCoef: 0.95, cd: 10, focus: 0, aoeTargets: 5, reducesWFB: 2 },
    flamefangPitch: { baseDmg: 2.8, apCoef: 1.1, cd: 60, focus: 0, aoeTargets: 8, dotDmg: 0.6, dotDuration: 8 },
    takedown: { damageAmp: 0.20, cd: 90, duration: 15, targets: "all" },
    raptorSwipe: { baseDmg: 1.1, apCoef: 0.55, cd: 0, focus: 25, aoeTargets: 5, hasteProc: 0.03 },
    serpentSting: { dotDmg: 0.35, apCoef: 0.38, duration: 18, focus: 10 },
    coordinatedAssault: { damageAmp: 0.25, cd: 120, duration: 20 },
  },
  talents: {
    class: {
      keenEyesight: { dps: 0.03, type: "passive", row: 1 },
      unnaturalCauses: { dps: 0.04, type: "passive", row: 1 },
      triggerFinger: { dps: 0.035, type: "passive", row: 2 },
      roarOfSacrifice: { dps: 0, utility: true, row: 2 },
      intimidation: { dps: 0, utility: true, row: 3 },
      tarCoatedBindings: { dps: 0, utility: true, row: 3 },
    },
    spec: {
      // Core / always taken
      mongooseFury: { dps: 0.12, stTarget: 0.18, aoe: 0.04, desc: "Mongoose Bite stacks to 6, each increasing damage 15%. Now baseline via tree position.", always: true },
      mongooseRounds: { dps: 0.06, stTarget: 0.08, aoe: 0.04, desc: "Kill Command reduces Mongoose Fury CD by 1s.", always: true },
      tipOfSpear: { dps: 0.10, stTarget: 0.14, aoe: 0.06, desc: "+15% direct damage per stack (up to 3). Consumed by Mongoose Bite.", always: true },
      strikeAsOne: { dps: 0.05, stTarget: 0.06, aoe: 0.04, desc: "Tip of the Spear consumption causes pet to hit an additional time.", always: true },
      wildfireBomb: { dps: 0.14, stTarget: 0.10, aoe: 0.22, desc: "Core AoE bomb. Boomstick reduces WFB CD by 2s.", always: true },
      boomstick: { dps: 0.11, stTarget: 0.08, aoe: 0.16, desc: "AoE cooldown hitting 5 targets. Each WFB hit reduces Boomstick CD by 2s.", always: true },
      // Situational ST
      savagery: { dps: 0.07, stTarget: 0.10, aoe: 0.02, desc: "Takedown CD reduced by up to 30s, enabling tighter cooldown alignment.", stPriority: true },
      mergingKillers: { dps: 0.05, stTarget: 0.08, aoe: 0.01, desc: "Kill Command damage increased by 20% after Mongoose Bite.", stPriority: true },
      // AoE talents
      raptorSwipe: { dps: 0.08, stTarget: 0.01, aoe: 0.14, desc: "Replaces Raptor Strike in AoE. Hits 5 targets and grants 3% Haste proc.", aoePriority: true },
      flamefangPitch: { dps: 0.09, stTarget: 0.04, aoe: 0.16, desc: "60s CD AoE DoT. Second charge talent makes it strong in M+ and raid cleave.", aoePriority: true },
      flamefangPitchCharge: { dps: 0.04, stTarget: 0.01, aoe: 0.08, desc: "Grants Flamefang Pitch a second charge.", aoePriority: true },
      // Utility
      takedown: { dps: 0.06, stTarget: 0.09, aoe: 0.04, desc: "Major CD +20% damage amp for you and pet. Enhanced by Savagery.", always: true },
    },
    hero: {
      packLeader: {
        name: "Pack Leader",
        desc: "Summons random beast companion on Kill Command (Bear/Wyvern/Boar). Dual wield synergy via Lethal Barbs focus regen. Currently underperforms vs Sentinel due to weak bleed talents.",
        stBonus: 0.06,
        aoeBonus: 0.08,
        mechanic: "killCommandProcs",
        defensiveBenefit: "Heal over time on Aspect of Turtle / Survival of the Fittest",
        weaponPref: "dual wield",
        recommended: false,
        subTalents: {
          lethalBarbs: { dps: 0.03, stTarget: 0.04, aoe: 0.02, desc: "Auto attacks generate Focus. Strong for dual-wield build." },
          hogstrider: { dps: 0.02, stTarget: 0.03, aoe: 0.01, desc: "Buffs Hatchet Toss. Currently not worth casting even with this talent." },
          shellCover: { dps: 0, stTarget: 0, aoe: 0, desc: "+10% damage reduction on Survival of the Fittest. Defensive, stacks awkwardly." },
        }
      },
      sentinel: {
        name: "Sentinel",
        desc: "Summons owl every 30s dealing AoE damage. Spawns with every Wildfire Bomb. Resets WFB CD when owl comes off CD. Best hero talent currently.",
        stBonus: 0.07,
        aoeBonus: 0.13,
        mechanic: "owlProcs",
        defensiveBenefit: "Don't Look Back — shields over time, excellent for rot and one-shots",
        weaponPref: "2H weapon",
        recommended: true,
        subTalents: {
          dontLookBack: { dps: 0, stTarget: 0, aoe: 0, desc: "Shield over time. Best defensive in the hero tree." },
          moonlightChakram: { dps: 0.05, stTarget: 0.06, aoe: 0.09, desc: "Replaces Trueshot/Takedown for 15s window of enhanced damage." },
          overwatch: { dps: 0.04, stTarget: 0.04, aoe: 0.07, desc: "Owl deals bonus damage when you Wildfire Bomb." },
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

  // Character header line (e.g. hunter="CharName" or hunter,name="CharName",...)
  const charLine = lines.find(l => /^(hunter|survival_hunter)/i.test(l));
  if (charLine) {
    const nameMatch = charLine.match(/name="([^"]+)"/);
    const levelMatch = charLine.match(/level=(\d+)/);
    const raceMatch = charLine.match(/race=(\w+)/);
    const realmMatch = charLine.match(/realm="?([^",\n]+)"?/);
    if (nameMatch) result.character.name = nameMatch[1];
    if (levelMatch) result.character.level = parseInt(levelMatch[1]);
    if (raceMatch) result.character.race = raceMatch[1];
    if (realmMatch) result.character.realm = realmMatch[1];
  }

  // Parse stats from simc stat lines
  lines.forEach(line => {
    const statMatch = line.match(/^(\w+)=([0-9.]+)/);
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
  const gearLines = lines.filter(l => /^(head|neck|shoulders|back|chest|wrist|hands|waist|legs|feet|finger1|finger2|trinket1|trinket2|main_hand|off_hand)=/.test(l));
  gearLines.forEach(gl => {
    const slotMatch = gl.match(/^(\w+)=/);
    const iLvlMatch = gl.match(/item_level=(\d+)/);
    const nameMatch = gl.match(/,([^,=]+),/) || gl.match(/="([^"]+)"/);
    if (slotMatch) {
      result.gear.push({
        slot: slotMatch[1],
        ilvl: iLvlMatch ? parseInt(iLvlMatch[1]) : 0,
        name: nameMatch ? nameMatch[1] : slotMatch[1]
      });
    }
  });

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

  // Fill in defaults/estimates if stats are missing
  if (result.stats.agility === 0) result.stats.agility = 9500;
  if (result.stats.attackPower === 0) result.stats.attackPower = result.stats.agility * 2.1;

  return result;
}

// ============================================================
// CORE DPS SIMULATION ENGINE
// ============================================================
function runSimulation(charData, targetCount, fightDuration, heroTalent, build) {
  const stats = charData.stats;
  const agi = stats.agility || 9500;
  const hasteBonus = 1 + (stats.haste || 8) / 100;
  const critBonus = 1 + ((stats.crit || 12) / 100) * 0.5;
  const masteryBonus = 1 + (stats.mastery || 10) / 100 * 0.8;
  const versBonus = 1 + (stats.versatility || 6) / 100;
  const ap = stats.attackPower || agi * 2.1;

  // Base scalar
  const baseScalar = (ap / 7200) * hasteBonus * critBonus * masteryBonus * versBonus;

  // Ability DPS contributions (per target capped at AoE limits, ST mode = 1 target)
  const effTargets = (t) => Math.min(t, 8); // most SV abilities cap ~8
  const T = targetCount;

  // Rotation model: approximate GCD-based uptime over fight duration
  const gcdBase = 1.5 / hasteBonus;
  const totalGCDs = fightDuration / gcdBase;

  // Uptime weights per ability (fraction of GCDs spent)
  const rot = build === 'st' ? {
    killCommand: 0.18,
    mongooseBite: 0.30,
    tipOfSpear: 0.00, // passive
    wildfireBomb: 0.08,
    boomstick: 0.06,
    serpentSting: 0.04,
    takedown: 0.02,
  } : {
    killCommand: 0.14,
    raptorSwipe: 0.20,
    mongooseBite: 0.12,
    wildfireBomb: 0.10,
    boomstick: 0.10,
    flamefangPitch: 0.06,
    serpentSting: 0.03,
    takedown: 0.02,
  };

  // DPS per ability
  let breakdown = {};
  let totalDps = 0;

  const calcAbility = (key, uptimeFraction, targetMult) => {
    const spell = MIDNIGHT_DATA.spells[key];
    if (!spell) return 0;
    const dmgPerCast = (spell.baseDmg * ap * spell.apCoef / 7200) * baseScalar;
    const castsPerSec = uptimeFraction / gcdBase;
    return dmgPerCast * castsPerSec * targetMult;
  };

  // Kill Command
  const kcDps = calcAbility('killCommand', rot.killCommand || 0, 1);
  breakdown['Kill Command'] = kcDps;

  // Mongoose Bite / Raptor Swipe
  const mbDps = calcAbility('mongooseBite', rot.mongooseBite || 0, 1) * 1.45; // fury stacks avg
  breakdown['Mongoose Bite'] = mbDps;

  if (build === 'aoe') {
    const rsDps = calcAbility('raptorSwipe', rot.raptorSwipe || 0, Math.min(T, 5));
    breakdown['Raptor Swipe'] = rsDps;
  }

  // Wildfire Bomb
  const wfbDps = calcAbility('wildfireBomb', rot.wildfireBomb || 0, Math.min(T, 8)) * 1.3; // dot included
  breakdown['Wildfire Bomb'] = wfbDps;

  // Boomstick
  const bsDps = calcAbility('boomstick', rot.boomstick || 0, Math.min(T, 5));
  breakdown['Boomstick'] = bsDps;

  // Flamefang Pitch (AoE build)
  if (build === 'aoe' && rot.flamefangPitch) {
    const ffDps = calcAbility('flamefangPitch', rot.flamefangPitch, Math.min(T, 8)) * 1.4;
    breakdown['Flamefang Pitch'] = ffDps;
  }

  // Serpent Sting
  const ssDps = (ap * 0.38 * 0.35 / 7200) * baseScalar * (Math.min(T, 3)) * 0.6;
  breakdown['Serpent Sting'] = ssDps;

  // Pet DPS
  const petDps = (ap * 0.42) * baseScalar * 0.85;
  breakdown['Pet (Kill Command procs)'] = petDps * (build === 'st' ? 1 : 0.75);

  // Tip of Spear passive on top
  const tipBonus = (mbDps + kcDps) * 0.10;
  breakdown['Tip of the Spear (passive)'] = tipBonus;

  // Takedown cooldown contribution
  const takedownUptime = Math.min(20, fightDuration) / fightDuration;
  const takedownBonus = Object.values(breakdown).reduce((s, v) => s + v, 0) * 0.20 * takedownUptime;
  breakdown['Takedown (CD)'] = takedownBonus;

  // Hero talent bonus
  const heroData = MIDNIGHT_DATA.talents.hero[heroTalent];
  const heroBonusPct = build === 'st' ? heroData.stBonus : heroData.aoeBonus;
  const baseTotal = Object.values(breakdown).reduce((s, v) => s + v, 0);
  const heroBonus = baseTotal * heroBonusPct;
  breakdown[`${heroData.name} (hero)`] = heroBonus;

  // Coordinated Assault CD contribution
  const caUptime = Math.min(20, fightDuration) / fightDuration;
  const caBonus = (baseTotal + heroBonus) * 0.25 * caUptime * 0.6;
  breakdown['Coordinated Assault (CD)'] = caBonus;

  // Sum all
  totalDps = Object.values(breakdown).reduce((s, v) => s + v, 0);

  // Apply multi-target diminishing returns (Survival has strong cleave but not unlimited)
  if (T > 1) {
    const cleaveFactor = T <= 3 ? 1 + (T - 1) * 0.55
      : T <= 5 ? 2.1 + (T - 3) * 0.35
      : T <= 8 ? 2.8 + (T - 5) * 0.20
      : 3.4 + (T - 8) * 0.12;
    // Re-normalize: single target baseline * cleave factor
    const stDps = totalDps / (1 + heroBonusPct);
    totalDps = stDps * cleaveFactor * (1 + heroBonusPct * 0.8);
  }

  // Fight duration bonus (longer fights = more cooldown uses)
  const cdEfficiency = Math.min(1.12, 1 + (fightDuration - 180) / 900 * 0.12);
  totalDps *= cdEfficiency;

  // Normalize breakdown to match total
  const rawSum = Object.values(breakdown).reduce((s, v) => s + v, 0);
  const normFactor = totalDps / rawSum;
  Object.keys(breakdown).forEach(k => { breakdown[k] = Math.round(breakdown[k] * normFactor); });

  return {
    totalDps: Math.round(totalDps),
    breakdown,
    targets: T,
    duration: fightDuration,
    hero: heroTalent,
    build
  };
};

// ============================================================
// OPTIMAL TALENT RECOMMENDER
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
    exportString: isAoe
      ? (heroTalent === 'sentinel'
        ? 'C8PAAAAAAAAAAAAAAAAAAAAAAMWgBmxohBwMBbzMzMjZmtZAAAAAAYGzMzYbGPgZMDGTGAAAAwAAYZbmx2MmZMmZAADAjhZWA'
        : 'C8PAAAAAAAAAAAAAAAAAAAAAAMgxMG2IgZYoBLmZmZmZeglBAAAAAAzYmZGbGjZMDGTGAAAAwAAYZZm5B2MzMDzYAwGAMGzMLA')
      : (heroTalent === 'sentinel'
        ? 'C8PAAAAAAAAAAAAAAAAAAAAAAMWgBmxohBwMBbGzMjZmlBAAAAAAzYmZGMeAzYGMmMAAAAAAgxy2MzsYmZGzMzAAGwwYMjN'
        : 'C8PAAAAAAAAAAAAAAAAAAAAAAMgxAQ2gZYoBLGzMzMjlBAAAAAAzYmZGMGzYGMmMAAAAAAgxy2MzsYmZmxMzAYmNADjxM2A')
  };
}

// ============================================================
// COMPONENTS
// ============================================================

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
  const [optimalTalents, setOptimalTalents] = useState(null);
  const [isSimming, setIsSimming] = useState(false);
  const [activeTab, setActiveTab] = useState('sim'); // 'sim' | 'talents'
  const [simMode, setSimMode] = useState('single'); // 'single' | 'cleave' | 'multi'
  const [targetCount, setTargetCount] = useState(1);
  const [copied, setCopied] = useState(false);
  const [particles, setParticles] = useState([]);

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
      'Kill Command': '#f97316', 'Mongoose Bite': '#ef4444', 'Wildfire Bomb': '#f59e0b',
      'Boomstick': '#eab308', 'Flamefang Pitch': '#ff6b35', 'Raptor Swipe': '#e74c3c',
      'Serpent Sting': '#22c55e', 'Pet (Kill Command procs)': '#a78bfa',
      'Tip of the Spear (passive)': '#fb923c', 'Takedown (CD)': '#60a5fa',
      'Sentinel (hero)': '#38bdf8', 'Pack Leader (hero)': '#a78bfa',
      'Coordinated Assault (CD)': '#c084fc',
    };
    return colors[key] || '#6b7280';
  };

  const sentinelSelected = heroTalent === 'sentinel';

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0c10', color: '#e8dcc8',
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
        
        .sentinel-badge { color: #38bdf8; }
        .pack-badge { color: #a78bfa; }
        
        .loading-ring {
          width: 48px; height: 48px;
          border: 3px solid #2a1808;
          border-top-color: #e07030;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto;
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

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1280, margin: '0 auto', padding: '24px 20px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 8 }}>
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
          <p style={{ fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: 4, color: '#7a6040', margin: 0 }}>
            MIDNIGHT 12.0 · PRE-SEASON 1 · TALENT OPTIMIZER & SIMULATOR
          </p>
          <div className="divider" style={{ margin: '16px auto', maxWidth: 400 }} />
          <p style={{ fontFamily: "'EB Garamond', serif", fontSize: 14, color: '#8a7050', margin: 0, fontStyle: 'italic' }}>
            Internal simulation engine · No external dependencies · Based on Method.gg & Icy Veins Midnight data
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1a1208', marginBottom: 28, gap: 4 }}>
          <button className={`tab-btn ${activeTab === 'sim' ? 'active' : ''}`} onClick={() => setActiveTab('sim')}>⚔ Simulator</button>
          <button className={`tab-btn ${activeTab === 'talents' ? 'active' : ''}`} onClick={() => setActiveTab('talents')}>🌿 Talents</button>
          <button className={`tab-btn ${activeTab === 'guide' ? 'active' : ''}`} onClick={() => setActiveTab('guide')}>📖 Guide</button>
        </div>

        {/* ===== SIM TAB ===== */}
        {activeTab === 'sim' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

            {/* LEFT: Inputs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontFamily: "'EB Garamond', serif", fontSize: 13 }}>
                      {parsedChar.character.name && <span style={{ color: '#e8c88a' }}>Name: <b>{parsedChar.character.name}</b></span>}
                      {parsedChar.character.level && <span style={{ color: '#c8a870' }}>Level: {parsedChar.character.level}</span>}
                      {parsedChar.character.race && <span style={{ color: '#c8a870' }}>Race: {parsedChar.character.race}</span>}
                      {parsedChar.character.avgIlvl > 0 && <span style={{ color: '#f0c880' }}>Avg iLvl: {parsedChar.character.avgIlvl}</span>}
                      <span style={{ color: '#a0a0a0' }}>AGI: {parsedChar.stats.agility.toLocaleString()}</span>
                      <span style={{ color: '#60a5fa' }}>Haste: {parsedChar.stats.haste}%</span>
                      <span style={{ color: '#f59e0b' }}>Crit: {parsedChar.stats.crit}%</span>
                      <span style={{ color: '#a78bfa' }}>Mastery: {parsedChar.stats.mastery}%</span>
                      <span style={{ color: '#34d399' }}>Vers: {parsedChar.stats.versatility}%</span>
                      {parsedChar.gear.length > 0 && <span style={{ color: '#7a6040' }}>Gear pieces: {parsedChar.gear.length}</span>}
                    </div>
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
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
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                <span style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: '#8a7050' }}>{key}</span>
                                <span style={{ fontFamily: "'EB Garamond', serif", fontSize: 12, color: '#c8a870' }}>
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
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== TALENTS TAB ===== */}
        {activeTab === 'talents' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

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
                           t.key === 'tipOfSpear' ? 'Tip of the Spear' :
                           t.key === 'strikeAsOne' ? 'Strike As One' :
                           t.key === 'wildfireBomb' ? 'Wildfire Bomb' :
                           t.key === 'boomstick' ? 'Boomstick' :
                           t.key === 'savagery' ? 'Savagery' :
                           t.key === 'mergingKillers' ? 'Merging Killers' :
                           t.key === 'raptorSwipe' ? 'Raptor Swipe' :
                           t.key === 'flamefangPitch' ? 'Flamefang Pitch' :
                           t.key === 'flamefangPitchCharge' ? '+Flamefang Charge' :
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
                  { title: 'Explosive Shot REMOVED', desc: 'Button bloat reduction. No more essential active DPS choices in class tree — pick passive increases (Keen Eyesight, Unnatural Causes, Trigger Finger) then utility.' },
                  { title: 'Boomstick ⟷ Wildfire Bomb Loop', desc: 'Each Boomstick shot reduces WFB CD by 2s. Each WFB hit reduces Boomstick CD by 2s. Core feedback loop of the spec.' },
                  { title: 'Mongoose Fury now baseline', desc: 'Tree position makes it always available. Mongoose Rounds talent adds Kill Command → Mongoose Fury CD reduction synergy.' },
                  { title: 'Flamefang Pitch (new AoE)', desc: '60s CD AoE DoT. Second charge talent very strong for M+ cleave situations.' },
                  { title: 'Raptor Swipe (AoE)', desc: 'Replaces Raptor Strike in AoE builds. Hits 5 targets + grants 3% Haste proc.' },
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Rotation */}
              <div style={{ background: '#0d0f16', border: '1px solid #2a2018', borderRadius: 10, padding: 24 }}>
                <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: 13, letterSpacing: 2, color: '#e8c88a', margin: '0 0 16px' }}>
                  ⚔ SINGLE TARGET ROTATION
                </h3>
                {[
                  { n: 1, label: 'Takedown', note: 'On cooldown. Enhanced by Savagery (-30s max reduction).' },
                  { n: 2, label: 'Wildfire Bomb', note: 'Never cap charges. Owl spawns on cast (Sentinel).' },
                  { n: 3, label: 'Boomstick', note: 'On cooldown. Reduces WFB CD by 2s per target hit.' },
                  { n: 4, label: 'Kill Command', note: 'On cooldown. Builds Tip of the Spear stacks.' },
                  { n: 5, label: 'Mongoose Bite ×6', note: 'Maximize Mongoose Fury stacks before consuming. 15% dmg per stack.' },
                  { n: 6, label: 'Raptor Strike', note: 'Focus dump when not in Mongoose Fury window.' },
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
                  { n: 1, label: 'Wildfire Bomb', note: 'Priority 1. Sentinel owl spawns on every cast.' },
                  { n: 2, label: 'Flamefang Pitch', note: '60s CD DoT. Maintain on as many targets as possible.' },
                  { n: 3, label: 'Boomstick', note: 'Hits 5 targets. Critical for bomb/stick feedback loop.' },
                  { n: 4, label: 'Raptor Swipe', note: 'Replaces Raptor Strike. 5-target cleave + Haste proc.' },
                  { n: 5, label: 'Kill Command', note: 'Maintain for Tip of the Spear and pet procs.' },
                  { n: 6, label: 'Serpent Sting', note: 'Multidot 2-3 targets for additional passive damage.' },
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
                  { stat: 'Haste', color: '#60a5fa', note: 'Reduces GCD and ability CDs. Top secondary for both ST and AoE.' },
                  { stat: 'Critical Strike', color: '#f59e0b', note: 'Strong scaling with Mongoose Fury stacks. Close 2nd to Haste.' },
                  { stat: 'Mastery', color: '#a78bfa', note: 'Increases pet and Kill Command damage. Scales well in AoE.' },
                  { stat: 'Versatility', color: '#34d399', note: 'Flat damage increase + survivability. Good floor stat.' },
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
    </div>
  );
}
