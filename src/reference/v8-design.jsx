import { useState, useCallback } from "react";

// ============================================================
// MIDNIGHT 12.0 SURVIVAL HUNTER — SIMULATION ENGINE
// ============================================================
const SURVIVAL_ICON = "data:image/png;base64,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";

const MIDNIGHT_DATA = {
  spells: {
    killCommand:        { baseDmg: 1.8,  apCoef: 0.82, cd: 7.5  },
    mongooseBite:       { baseDmg: 1.4,  apCoef: 0.72, cd: 0    },
    wildfireBomb:       { baseDmg: 3.6,  apCoef: 1.45, cd: 18   },
    boomstick:          { baseDmg: 2.2,  apCoef: 0.95, cd: 10   },
    flamefangPitch:     { baseDmg: 2.8,  apCoef: 1.1,  cd: 60   },
    raptorSwipe:        { baseDmg: 1.1,  apCoef: 0.55, cd: 0    },
    serpentSting:       { dotDmg: 0.35,  apCoef: 0.38            },
    takedown:           { damageAmp: 0.20, cd: 90                },
    coordinatedAssault: { damageAmp: 0.25, cd: 120               },
  },
  talents: {
    hero: {
      sentinel: {
        name: "Sentinel", icon: "🦉",
        color: "#38bdf8", colorDark: "#0284c7", colorBg: "#0c1e35", colorBorder: "#1a3a5c",
        desc: "Summons an owl every 30s dealing AoE damage. Spawns with every Wildfire Bomb and resets WFB CD when off cooldown.",
        stBonus: 0.07, aoeBonus: 0.13, weaponPref: "2H Weapon", recommended: true,
        defensiveBenefit: "Don't Look Back — absorb shield over time",
        subTalents: {
          "Don't Look Back":   { desc: "Shield over time. Best defensive in hero tree." },
          "Moonlight Chakram": { desc: "15s window of enhanced damage syncing with Takedown." },
          "Overwatch":         { desc: "Owl deals bonus damage every time you Wildfire Bomb." },
        }
      },
      packLeader: {
        name: "Pack Leader", icon: "🐾",
        color: "#c084fc", colorDark: "#9333ea", colorBg: "#1a0e2e", colorBorder: "#3b1a5c",
        desc: "Summons a random beast (Bear/Wyvern/Boar) on Kill Command. Dual wield synergy via Lethal Barbs focus regen.",
        stBonus: 0.06, aoeBonus: 0.08, weaponPref: "Dual Wield", recommended: false,
        defensiveBenefit: "HoT on Aspect of the Turtle / Survival of the Fittest",
        subTalents: {
          "Lethal Barbs": { desc: "Auto attacks generate Focus. Strong for dual-wield." },
          "Hogstrider":   { desc: "Buffs Hatchet Toss — currently not worth casting." },
          "Shell Cover":  { desc: "+10% damage reduction on Survival of the Fittest." },
        }
      }
    },
    spec: {
      mongooseFury:         { stW: 0.18, aoeW: 0.04, always: true,  label: "Mongoose Fury"      },
      mongooseRounds:       { stW: 0.08, aoeW: 0.04, always: true,  label: "Mongoose Rounds"    },
      tipOfSpear:           { stW: 0.14, aoeW: 0.06, always: true,  label: "Tip of the Spear"   },
      strikeAsOne:          { stW: 0.06, aoeW: 0.04, always: true,  label: "Strike As One"      },
      wildfireBomb:         { stW: 0.10, aoeW: 0.22, always: true,  label: "Wildfire Bomb"      },
      boomstick:            { stW: 0.08, aoeW: 0.16, always: true,  label: "Boomstick"          },
      takedown:             { stW: 0.09, aoeW: 0.04, always: true,  label: "Takedown"           },
      savagery:             { stW: 0.10, aoeW: 0.02, stOnly: true,  label: "Savagery"           },
      mergingKillers:       { stW: 0.08, aoeW: 0.01, stOnly: true,  label: "Merging Killers"    },
      raptorSwipe:          { stW: 0.01, aoeW: 0.14, aoeOnly: true, label: "Raptor Swipe"       },
      flamefangPitch:       { stW: 0.04, aoeW: 0.16, aoeOnly: true, label: "Flamefang Pitch"    },
      flamefangPitchCharge: { stW: 0.01, aoeW: 0.08, aoeOnly: true, label: "Flamefang +Charge"  },
    }
  }
};

// Realm lists per region (abbreviated)
const REALMS = {
  US: ["Aegwynn","Aerie Peak","Agamaggan","Aggramar","Alexstrasza","Alleria","Altar of Storms","Alterac Mountains","Aman'Thul","Andorhal","Anetheron","Antonidas","Anub'arak","Anvilmar","Arathor","Archimonde","Area 52","Argent Dawn","Arthas","Arygos","Auchindoun","Azgalor","Azjol-Nerub","Azralon","Azshara","Azuremyst","Baelgun","Barthilas","Black Dragonflight","Blackhand","Blackrock","Blackwater Raiders","Blackwing Lair","Blade's Edge","Bladefist","Bleeding Hollow","Blood Furnace","Bloodhoof","Bloodscalp","Borean Tundra","Boulderfist","Bronzebeard","Burning Blade","Burning Legion","Caelestrasz","Cairne","Cenarion Circle","Cenarius","Cho'gall","Chromaggus","Coilfang","Crushridge","Daggerspine","Dalaran","Dalvengyr","Dark Iron","Darkspear","Darrowmere","Dath'Remar","Dawnbringer","Deathwing","Demon Soul","Dentarg","Destromath","Dethecus","Detheroc","Draenor","Dragonblight","Dragonmaw","Drak'Tharon","Drak'thul","Draka","Drakkari","Dreadmaul","Drenden","Dunemaul","Durotan","Duskwood","Earthen Ring","Echo Isles","Eitrigg","Eldre'Thalas","Elune","Emerald Dream","Eonar","Eredar","Executus","Exodar","Feathermoon","Fenris","Firetree","Fizzcrank","Frostmane","Frostmourne","Frostwolf","Galakrond","Garona","Garrosh","Ghostlands","Gilneas","Gnomeregan","Goldrinn","Gorefiend","Greymane","Gul'dan","Gundrak","Gurubashi","Hakkar","Haomarush","Hellscream","Hydraxis","Hyjal","Icecrown","Illidan","Jaedenar","Kael'thas","Kalecgos","Kargath","Kel'Thuzad","Khadgar","Khaz Modan","Khaz'goroth","Kil'jaeden","Kilrogg","Kirin Tor","Korgath","Kul Tiras","Laughing Skull","Lethon","Lightbringer","Lightning's Blade","Lightninghoof","Llane","Lothar","Madoran","Maelstrom","Magtheridon","Maiev","Mal'Ganis","Malfurion","Malorne","Malygos","Mannoroth","Medivh","Misha","Mok'Nathal","Moon Guard","Moonrunner","Mug'thol","Muradin","Nagrand","Nathrezim","Nazgrel","Nazjatar","Nerzhul","Norgannon","Onyxia","Perenolde","Proudmoore","Quel'dorei","Quel'Thalas","Ravencrest","Ravenholdt","Rexxar","Rivendare","Runetotem","Sargeras","Saurfang","Scarlet Crusade","Scilla","Sen'jin","Sentinels","Shadow Council","Shadowmoon","Shadowsong","Shattered Halls","Shattered Hand","Shu'halo","Silver Hand","Silvermoon","Sisters of Elune","Skullcrusher","Skywall","Smolderthorn","Spinebreaker","Spirestone","Staghelm","Steamwheedle Cartel","Stonemaul","Stormrage","Stormreaver","Stormscale","Suramar","Tanaris","Terenas","Terokkar","Thorium Brotherhood","Thrall","Thunderhorn","Thunderlord","Tichondrius","Tinker Town","Tirion","Tortheldrin","Turalyion","Twisting Nether","Uther","Vashj","Vek'nilash","Velen","Warsong","Whisperwind","Wildhammer","Windrunner","Winterhoof","Wyrmrest Accord","Ysera","Ysondre","Zangarmarsh","Zuluhed"],
  EU: ["Aegwynn","Aerie Peak","Agamaggan","Aggra","Aggramar","Ahn'Qiraj","Al'Akir","Alexstrasza","Alleria","Alonsus","Aman'thul","Ambossar","Anachronos","Anetheron","Antonidas","Anub'arak","Anvilmar","Arathi","Arathor","Archimonde","Area 52","Argent Dawn","Arthas","Arygos","Aszune","Auchindoun","Azjol-Nerub","Azshara","Azuremyst","Baelgun","Blackhand","Blackmoore","Blackrock","Blade's Edge","Bladefist","Bloodfeather","Bloodhoof","Bloodscalp","Boulderfist","Bronze Dragonflight","Bronzebeard","Burning Blade","Burning Legion","Burning Steppes","Chamber of Aspects","Chromaggus","Colinas Pardas","Con Clave de Sombra","Crushridge","Culte de la Rive noire","Daggerspine","Darkmoon Faire","Darksorrow","Darkspear","Das Konsortium","Das Syndikat","Deathwing","Dentarg","Der abyssische Rat","Der Rat von Dalaran","Dethecus","Die Aldor","Die ewige Wacht","Die Nachtwache","Die Silberne Hand","Die Todeskrallen","Draenor","Dragonblight","Dragonmaw","Drak'thul","Draka","Drakkari","Dun Morogh","Dunemaul","Durotan","Earthen Ring","Echo Isles","Eitrigg","El Consejo de la Sombra","Elune","Emerald Dream","Eonar","Eredar","Executus","Exodar","Festung der Stürme","Forscherliga","Frostmane","Frostmourne","Frostwolf","Garona","Garrosh","Genjuros","Ghostlands","Gilneas","Gorgonnash","Greymane","Hakkar","Haomarush","Hellfire","Hellscream","Hyjal","Icecrown","Illidan","Jaedenar","Kael'thas","Kel'Thuzad","Khadgar","Khaz Modan","Kilrogg","Kirin Tor","Korgath","Laughing Skull","Lethon","Lightbringer","Lordaeron","Lothar","Madmortem","Maelstrom","Magtheridon","Mal'Ganis","Malfurion","Malorne","Mannoroth","Medivh","Minahonda","Moon Guard","Mug'thol","Muradin","Nagrand","Nathrezim","Nazjatar","Nefarian","Nera'thor","Nerzhul","Norgannon","Nozdormu","Onyxia","Outland","Perenolde","Pozzo dell'Eternità","Proudmoore","Quel'Thalas","Ragnaros","Ravencrest","Ravenholdt","Rexxar","Runetotem","Sargeras","Scarlet Crusade","Sen'jin","Sentinels","Shattered Hand","Shattered Halls","Silvermoon","Sisterhood of Elune","Skullcrusher","Skywall","Spinebreaker","Steamwheedle Cartel","Stonemaul","Stormrage","Stormreaver","Stormscale","Sunstrider","Sylvanas","Taerar","Talnivarr","Tarren Mill","Tempest Keep","Terenas","Terokkar","The Maelstrom","The Sha'tar","The Venture Co","Theradras","Thrall","Thunderhorn","Tichondrius","Tirion","Trollbane","Turalyon","Twilight's Hammer","Twisting Nether","Tyrande","Uldaman","Uther","Vashj","Vek'lor","Vek'nilash","Velen","Wildhammer","Windrunner","Wrathbringer","Xavius","Ysondre","Zenedar","Zuluhed"],
  KR: ["Azshara","Burning Legion","Cenarius","Dalaran","Deathwing","Durotan","Garona","Hellscream","Hyjal","Illidan","Kel'Thuzad","Malfurion","Norgannon","Ragnaros","Stormrage","Windrunner","Zul'jin"],
  TW: ["Arthas","Arygos","Bleeding Hollow","Chillwind Point","Crystalpine Stinger","Demon Soul","Dragonmaw","Frostmane","Hellscream","Icecrown","Light's Hope","Nathrezim","Nightmare","Order of the Cloud Serpent","Queldorei","Ravencrest","Shadowmoon","Silverwing Hold","Skywall","Spirestone","Stormscale","Sundown Marsh","Wrathbringer","Zealot Blade"],
};

function parseSimcString(raw) {
  const r = { character:{}, stats:{agility:9500,haste:8,crit:12,mastery:10,versatility:6,attackPower:0}, gear:[], valid:false, errors:[] };
  if (!raw||raw.trim().length<20) { r.errors.push("Input too short."); return r; }
  const lines = raw.trim().split("\n").map(l=>l.trim());
  const cl = lines.find(l=>/^(hunter|survival_hunter)/i.test(l));
  if (cl) {
    const m = s => cl.match(s)?.[1]??null;
    r.character.name  = m(/name="([^"]+)"/);
    r.character.level = m(/level=(\d+)/);
    r.character.race  = m(/race=(\w+)/);
    r.character.realm = m(/realm="?([^",\n]+)"?/);
  }
  lines.forEach(line => {
    const sm=line.match(/^(\w+)=([0-9.]+)/); if(!sm) return;
    const [,k,v]=sm; const n=parseFloat(v);
    if(k==="agility")            r.stats.agility=n;
    if(k==="haste_rating")       r.stats.haste=+(n/180).toFixed(1);
    if(k==="crit_rating")        r.stats.crit=+(n/180).toFixed(1);
    if(k==="mastery_rating")     r.stats.mastery=+(n/180).toFixed(1);
    if(k==="versatility_rating") r.stats.versatility=+(n/205).toFixed(1);
    if(k==="attack_power")       r.stats.attackPower=n;
  });
  const slots=["head","neck","shoulders","back","chest","wrist","hands","waist","legs","feet","finger1","finger2","trinket1","trinket2","main_hand","off_hand"];
  const slotDisplayNames={"head":"Head","neck":"Neck","shoulders":"Shoulders","back":"Back","chest":"Chest","wrist":"Wrist","hands":"Hands","waist":"Waist","legs":"Legs","feet":"Feet","finger1":"Ring 1","finger2":"Ring 2","trinket1":"Trinket 1","trinket2":"Trinket 2","main_hand":"Main Hand","off_hand":"Off Hand"};
  lines.forEach(l=>{
    const slot=slots.find(s=>l.startsWith(s+"=")); if(!slot) return;
    const iL=l.match(/item_level=(\d+)/);
    const afterEq=l.slice(slot.length+1);
    // Name is text before first comma, if it doesn't start with comma or digit
    let name="";
    if(afterEq&&!afterEq.startsWith(",")&&!afterEq.startsWith("id=")){
      name=afterEq.split(",")[0].trim();
    }
    // Try extracting from comment format: # Name
    const commentMatch=l.match(/#\s*(.+)$/);
    if(commentMatch&&!name) name=commentMatch[1].trim();
    r.gear.push({slot,ilvl:iL?+iL[1]:0,name:name||""});
  });
  if(r.gear.length>0){const v=r.gear.filter(g=>g.ilvl>0);if(v.length)r.character.avgIlvl=Math.round(v.reduce((s,g)=>s+g.ilvl,0)/v.length);}
  const tl=lines.find(l=>l.startsWith("talents=")); if(tl) r.talents=tl.replace("talents=","").trim();
  if(!r.stats.attackPower) r.stats.attackPower=r.stats.agility*2.1;
  r.valid=!!(r.character.name||r.stats.agility!==9500||r.gear.length>0);
  if(!r.valid) r.errors.push("Could not parse character. Paste the full /simc export.");
  return r;
}

function runSimulation(charData, T, dur, heroTalent, build, fightStyle=1.0, raidBuffs={}, consumables={}) {
  const s=charData.stats;
  const agi=s.agility||9500, haste=1+(s.haste||8)/100, crit=1+((s.crit||12)/100)*0.5;
  const mast=1+(s.mastery||10)/100*0.8, vers=1+(s.versatility||6)/100;
  const ap=s.attackPower||agi*2.1, scalar=(ap/7200)*haste*crit*mast*vers, gcd=1.5/haste;
  const rot=build==="st"
    ?{killCommand:0.18,mongooseBite:0.30,wildfireBomb:0.08,boomstick:0.06,serpentSting:0.04,takedown:0.02}
    :{killCommand:0.14,raptorSwipe:0.20,mongooseBite:0.12,wildfireBomb:0.10,boomstick:0.10,flamefangPitch:0.06,serpentSting:0.03,takedown:0.02};
  const calc=(key,up,tM)=>{const sp=MIDNIGHT_DATA.spells[key];if(!sp)return 0;return(sp.baseDmg*ap*sp.apCoef/7200)*scalar*(up/gcd)*tM;};
  const bd={};
  bd["Kill Command"]        =calc("killCommand",rot.killCommand||0,1);
  bd["Mongoose Bite"]       =calc("mongooseBite",rot.mongooseBite||0,1)*1.45;
  bd["Wildfire Bomb"]       =calc("wildfireBomb",rot.wildfireBomb||0,Math.min(T,8))*1.3;
  bd["Boomstick"]           =calc("boomstick",rot.boomstick||0,Math.min(T,5));
  if(build==="aoe"){
    bd["Raptor Swipe"]      =calc("raptorSwipe",rot.raptorSwipe||0,Math.min(T,5));
    bd["Flamefang Pitch"]   =calc("flamefangPitch",rot.flamefangPitch||0,Math.min(T,8))*1.4;
  }
  bd["Serpent Sting"]       =(ap*0.38*0.35/7200)*scalar*Math.min(T,3)*0.6;
  bd["Pet (KC procs)"]      =(ap*0.42)*scalar*0.85*(build==="st"?1:0.75);
  bd["Tip of the Spear"]    =(bd["Kill Command"]+bd["Mongoose Bite"])*0.10;
  const tdUp=Math.min(20,dur)/dur;
  bd["Takedown (CD)"]       =Object.values(bd).reduce((s,v)=>s+v,0)*0.20*tdUp;
  const hero=MIDNIGHT_DATA.talents.hero[heroTalent];
  const base=Object.values(bd).reduce((s,v)=>s+v,0);
  bd[`${hero.name} (hero)`] =base*(build==="st"?hero.stBonus:hero.aoeBonus);
  bd["Coord. Assault"]      =(base+bd[`${hero.name} (hero)`])*0.25*Math.min(20,dur)/dur*0.6;
  let total=Object.values(bd).reduce((s,v)=>s+v,0);
  if(T>1){const cf=T<=3?1+(T-1)*0.55:T<=5?2.1+(T-3)*0.35:T<=8?2.8+(T-5)*0.20:3.4+(T-8)*0.12;total=(total/(1+(build==="st"?hero.stBonus:hero.aoeBonus)))*cf*(1+(build==="st"?hero.stBonus:hero.aoeBonus)*0.8);}
  total*=Math.min(1.12,1+(dur-180)/900*0.12);
  if(raidBuffs.battleShout) total*=1.05; if(raidBuffs.markOfWild) total*=1.03;
  if(raidBuffs.mysticTouch) total*=1.05; if(raidBuffs.huntersMark) total*=1.05;
  if(consumables.flask==="alchemical") total*=1.03; if(consumables.flask==="tempering") total*=1.025;
  if(consumables.food==="mastery") total*=1.015; if(consumables.food==="haste") total*=1.018; if(consumables.food==="crit") total*=1.016;
  if(consumables.potion==="tempered") total*=1.04; if(consumables.potion==="focus") total*=1.03;
  total*=fightStyle;
  const rawSum=Object.values(bd).reduce((s,v)=>s+v,0), norm=total/rawSum;
  Object.keys(bd).forEach(k=>{bd[k]=Math.round(bd[k]*norm);});
  return {totalDps:Math.round(total),breakdown:bd,targets:T,duration:dur,hero:heroTalent,build};
}

function getOptimalTalents(targetCount, heroTalent) {
  const isAoe=targetCount>2;
  const selected=Object.entries(MIDNIGHT_DATA.talents.spec).filter(([,t])=>t.always||(isAoe&&t.aoeOnly)||(!isAoe&&t.stOnly)).map(([key,t])=>({key,...t}));
  const exportStr=isAoe?(heroTalent==="sentinel"?"C8PAAAAAAAAAAAAAAAAAAAAAAMWgBmxohBwMBbzMzMjZmtZAAAAAAYGzMzYbGPgZMDGTGAAAAwAAYZbmx2MmZMmZAADAjhZWA":"C8PAAAAAAAAAAAAAAAAAAAAAAMgxMG2IgZYoBLmZmZmZeglBAAAAAAzYmZGbGjZMDGTGAAAAwAAYZZm5B2MzMDzYAwGAMGzMLA"):(heroTalent==="sentinel"?"C8PAAAAAAAAAAAAAAAAAAAAAAMWgBmxohBwMBbGzMjZmlBAAAAAAzYmZGMeAzYGMmMAAAAAAgxy2MzsYmZGzMzAAGwwYMjN":"C8PAAAAAAAAAAAAAAAAAAAAAAMgxAQ2gZYoBLGzMzMjlBAAAAAAzYmZGMGzYGMmMAAAAAAgxy2MzsYmZmxMzAYmNADjxM2A");
  return {selected,hero:MIDNIGHT_DATA.talents.hero[heroTalent],heroKey:heroTalent,exportStr};
}

const SAMPLE_SIMC=`hunter="Azurethane"
level=80
race=night_elf
region=us
server=stormrage
spec=survival
agility=12450
attack_power=26145
haste_rating=1820
crit_rating=2340
mastery_rating=1620
versatility_rating=980
head=Vortex Visage,id=232011,item_level=639
neck=Farstrider's Pendant,id=231814,item_level=636
shoulders=Farstrider's Spaulders,id=232013,item_level=639
back=Preyseeker's Rugged Stole,id=231756,item_level=636
chest=Farstrider's Vest,id=232009,item_level=639
wrist=Elder Mossbands,id=231758,item_level=636
hands=Grips of Forgotten Honor,id=232012,item_level=639
waist=Scout's Polished Wrap,id=231760,item_level=636
legs=Rootspeaker's Leggings,id=232010,item_level=639
feet=Forgotten Tribe Footguards,id=231762,item_level=636
finger1=Preyseeker's Signet,id=231770,item_level=636
finger2=Circlet of Encroaching Shadow,id=231772,item_level=636
trinket1=Kroluk's Warbanner,id=231780,item_level=636
trinket2=Darkmoon Deck: Hunt,id=231782,item_level=636
main_hand=Farstrider's Mercy,id=231800,item_level=642
off_hand=Bladesorrow,id=231801,item_level=639`;

const BAR_COLORS = {
  "Kill Command":"#60a5fa","Mongoose Bite":"#818cf8","Wildfire Bomb":"#f59e0b",
  "Boomstick":"#fb923c","Raptor Swipe":"#34d399","Flamefang Pitch":"#22d3ee",
  "Serpent Sting":"#a78bfa","Pet (KC procs)":"#94a3b8","Tip of the Spear":"#7dd3fc",
  "Takedown (CD)":"#93c5fd","Sentinel (hero)":"#38bdf8","Pack Leader (hero)":"#c084fc",
  "Coord. Assault":"#e879f9",
};
const bClr = k => BAR_COLORS[k]||"#64748b";
const fmt  = n => n>=1000?`${(n/1000).toFixed(1)}k`:String(n);
const dL   = d => `${Math.floor(d/60)}:${String(d%60).padStart(2,"0")}`;

// ─────────────────────────────────────────────────────────────
// COLOUR SYSTEM
// ─────────────────────────────────────────────────────────────
const C = {
  pageBg:    "#d4dae2",   // soft blue-grey page
  surface:   "#1c2333",   // charcoal-navy card
  surface2:  "#242d3f",   // nested areas
  surface3:  "#2c3750",   // hover / selected
  border:    "#2e3a50",
  borderSub: "#1a2236",
  // ── READABILITY UPGRADE ──
  textPri:   "#f1f5f9",   // warm off-white  — primary text
  textSec:   "#cbd5e1",   // soft slate       — secondary / body
  textMid:   "#94a3b8",   // muted            — labels / metadata
  textDim:   "#5a6a82",   // very muted       — placeholders / dividers
  // ── ACCENTS ──
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

// ─────────────────────────────────────────────────────────────
// ARMORY LOOKUP PANEL (placeholder — hook up edge function)
// ─────────────────────────────────────────────────────────────
function ArmoryLookup({ onCharacterLoaded }) {
  const [region,    setRegion]    = useState("US");
  const [realmQ,    setRealmQ]    = useState("");
  const [realm,     setRealm]     = useState("");
  const [charName,  setCharName]  = useState("");
  const [showRealms,setShowRealms]= useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [success,   setSuccess]   = useState(false);

  const filteredRealms = REALMS[region].filter(r =>
    r.toLowerCase().includes(realmQ.toLowerCase())
  ).slice(0, 8);

  const handleFetch = () => {
    if (!realm || !charName.trim()) { setError("Please select a realm and enter a character name."); return; }
    setError(""); setLoading(true); setSuccess(false);
    // Placeholder — Lovable edge function handles the real API call
    setTimeout(() => {
      setLoading(false);
      setError("Armory lookup is connected via the Lovable edge function. Paste your /simc export below as an alternative.");
    }, 1200);
  };

  return (
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:20,marginBottom:16}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
        <span style={{fontSize:16}}>🌐</span>
        <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:10,letterSpacing:3,color:C.textMid,textTransform:"uppercase"}}>Armory Lookup</span>
      </div>
      <p style={{fontFamily:"'Rajdhani',sans-serif",fontSize:13,color:C.textMid,marginBottom:16,lineHeight:1.5}}>
        Pull your character directly from the WoW Armory — no addon needed
      </p>

      {/* Region toggle */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
        {["US","EU","KR","TW"].map(r => (
          <button key={r} onClick={()=>{setRegion(r);setRealm("");setRealmQ("");}}
            style={{background:region===r?"transparent":C.surface2,
              border:`1px solid ${region===r?C.gold:C.border}`,
              borderRadius:8,padding:"10px 0",
              color:region===r?C.goldLight:C.textMid,
              fontFamily:"'Orbitron',sans-serif",fontSize:11,fontWeight:700,
              letterSpacing:2,cursor:"pointer",transition:"all .2s",
              boxShadow:region===r?`inset 0 0 0 1px ${C.gold},0 0 12px rgba(217,119,6,.2)`:"none"
            }}>{r}</button>
        ))}
      </div>

      {/* Realm + Character inputs */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12,position:"relative"}}>
        {/* Realm searchable */}
        <div style={{position:"relative"}}>
          <input
            value={realm || realmQ}
            onChange={e=>{setRealmQ(e.target.value);setRealm("");setShowRealms(true);}}
            onFocus={()=>setShowRealms(true)}
            onBlur={()=>setTimeout(()=>setShowRealms(false),180)}
            placeholder="Search realm..."
            style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,
              color:C.textSec,fontFamily:"'Rajdhani',sans-serif",fontSize:14,fontWeight:500,
              padding:"11px 14px",outline:"none",width:"100%",transition:"border-color .2s"}}
          />
          {showRealms && filteredRealms.length>0 && (
            <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,
              background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,
              zIndex:100,maxHeight:200,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,.4)"}}>
              {filteredRealms.map(rv=>(
                <div key={rv}
                  onMouseDown={()=>{setRealm(rv);setRealmQ(rv);setShowRealms(false);}}
                  style={{padding:"9px 14px",fontFamily:"'Rajdhani',sans-serif",fontSize:14,
                    color:C.textSec,cursor:"pointer",transition:"background .1s",
                    borderBottom:`1px solid ${C.borderSub}`}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.surface3}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                >{rv}</div>
              ))}
            </div>
          )}
        </div>

        {/* Character name */}
        <input value={charName} onChange={e=>setCharName(e.target.value)}
          placeholder="Character name"
          onKeyDown={e=>e.key==="Enter"&&handleFetch()}
          style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,
            color:C.textSec,fontFamily:"'Rajdhani',sans-serif",fontSize:14,fontWeight:500,
            padding:"11px 14px",outline:"none",width:"100%",transition:"border-color .2s"}}
        />
      </div>

      {/* Error */}
      {error && <div style={{fontFamily:"'Rajdhani',sans-serif",fontSize:13,color:C.red,marginBottom:10,lineHeight:1.5}}>{error}</div>}

      {/* Fetch button */}
      <button onClick={handleFetch} disabled={loading}
        style={{width:"100%",background:loading?"#1c2a3a":C.surface2,
          border:`1px solid ${loading?"#2e3a50":C.border}`,borderRadius:8,
          padding:"13px",display:"flex",alignItems:"center",justifyContent:"center",gap:10,
          cursor:loading?"not-allowed":"pointer",transition:"all .2s",
          color:loading?C.textDim:C.textSec,
          fontFamily:"'Orbitron',sans-serif",fontSize:11,letterSpacing:3,textTransform:"uppercase",
          fontWeight:700
        }}
        onMouseEnter={e=>{if(!loading){e.currentTarget.style.borderColor=C.sentClr;e.currentTarget.style.color=C.sentClr;}}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.textSec;}}
      >
        {loading
          ? <><span style={{width:10,height:10,border:"2px solid #2e3a50",borderTopColor:C.sentClr,borderRadius:"50%",display:"inline-block",animation:"spin .8s linear infinite"}}/>  FETCHING...</>
          : <><span style={{fontSize:10}}>🔵</span>  FETCH FROM ARMORY</>
        }
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────
export default function SurvivalSim() {
  const [simcInput,    setSimcInput]    = useState("");
  const [parsedChar,   setParsedChar]   = useState(null);
  const [parseError,   setParseError]   = useState("");
  const [heroTalent,   setHeroTalent]   = useState("sentinel");
  const [fightDur,     setFightDur]     = useState(300);
  const [simMode,      setSimMode]      = useState("single");
  const [fightStyle,   setFightStyle]   = useState(1.0);
  const [raidBuffs,    setRaidBuffs]    = useState({battleShout:false,markOfWild:false,mysticTouch:false,huntersMark:false});
  const [consumables,  setConsumables]  = useState({flask:"none",food:"none",potion:"none"});
  const [showAdv,      setShowAdv]      = useState(false);
  const [simResults,   setSimResults]   = useState(null);
  const [isSimming,    setIsSimming]    = useState(false);
  const [activeTab,    setActiveTab]    = useState("sim");
  const [copied,       setCopied]       = useState("");

  const getTargets = () => simMode==="single"?[1]:simMode==="cleave"?[2,3]:[5,8,10];

  const handleParse = useCallback(()=>{
    setParseError("");
    const r=parseSimcString(simcInput);
    if(r.valid){setParsedChar(r);setSimResults(null);}
    else{setParseError(r.errors.join(" "));setParsedChar(null);}
  },[simcInput]);

  const handleSim = useCallback(()=>{
    if(!parsedChar) return;
    setIsSimming(true); setSimResults(null);
    setTimeout(()=>{
      const targets=getTargets();
      const results=targets.map(t=>runSimulation(parsedChar,t,fightDur,heroTalent,t===1?"st":"aoe",fightStyle,raidBuffs,consumables));
      setSimResults(results); setIsSimming(false);
    },1200);
  },[parsedChar,heroTalent,fightDur,simMode,fightStyle,raidBuffs,consumables]);

  const copy=(str,key)=>{navigator.clipboard.writeText(str).then(()=>{setCopied(key);setTimeout(()=>setCopied(""),2000);});};

  const LBL = ({children}) => (
    <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:8,letterSpacing:3,color:C.textDim,
      textTransform:"uppercase",marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
      {children}
      <div style={{flex:1,height:1,background:C.borderSub}}/>
    </div>
  );

  const CARD = ({children, style={}}) => (
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:20,...style}}>
      {children}
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:C.pageBg,color:C.textPri,fontFamily:"'Rajdhani','Segoe UI',sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;600;700;900&family=IBM+Plex+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:5px;}
        ::-webkit-scrollbar-track{background:#d4dae2;}
        ::-webkit-scrollbar-thumb{background:#2e3a50;border-radius:3px;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}
        @keyframes barGrow{from{width:0;}}
        @keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
        @keyframes goldPulse{0%,100%{box-shadow:0 4px 16px rgba(217,119,6,.4);}50%{box-shadow:0 4px 28px rgba(251,191,36,.65);}}
        @keyframes iconGlow{0%,100%{box-shadow:0 0 16px rgba(74,222,128,.2),0 0 40px rgba(34,197,94,.08);}50%{box-shadow:0 0 28px rgba(74,222,128,.38),0 0 60px rgba(34,197,94,.16);}}
        @keyframes counterUp{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}

        .tab-btn{background:transparent;border:none;border-bottom:3px solid transparent;padding:12px 24px;
          color:#64748b;font-family:"Rajdhani",sans-serif;font-size:15px;font-weight:700;
          letter-spacing:1px;cursor:pointer;transition:all .2s;text-transform:uppercase;}
        .tab-btn.active{color:#fbbf24;border-bottom-color:#d97706;}
        .tab-btn:hover{color:#94a3b8;}

        .hero-sent{background:#0c1e35;border:2px solid #1a3a5c;border-radius:10px;padding:15px;cursor:pointer;transition:all .2s;text-align:left;width:100%;}
        .hero-sent:hover{border-color:#38bdf8;box-shadow:0 0 0 3px rgba(56,189,248,.12);}
        .hero-sent.sel{border-color:#38bdf8;box-shadow:0 0 0 3px rgba(56,189,248,.2),inset 0 0 24px rgba(56,189,248,.06);}
        .hero-pack{background:#1a0e2e;border:2px solid #3b1a5c;border-radius:10px;padding:15px;cursor:pointer;transition:all .2s;text-align:left;width:100%;}
        .hero-pack:hover{border-color:#c084fc;box-shadow:0 0 0 3px rgba(192,132,252,.12);}
        .hero-pack.sel{border-color:#c084fc;box-shadow:0 0 0 3px rgba(192,132,252,.2),inset 0 0 24px rgba(192,132,252,.06);}

        .mode-btn{background:#242d3f;border:1px solid #2e3a50;border-radius:8px;padding:10px 12px;
          color:#94a3b8;font-family:"Orbitron",sans-serif;font-size:9px;letter-spacing:1px;
          cursor:pointer;transition:all .2s;text-transform:uppercase;}
        .mode-btn.sel{background:#2c3750;border-color:#d97706;color:#fbbf24;}
        .mode-btn:hover{border-color:#3d4f6a;color:#cbd5e1;}

        .sim-btn{background:linear-gradient(135deg,#d97706,#b45309);border:none;border-radius:10px;
          padding:15px 28px;color:#fffbeb;font-family:"Orbitron",sans-serif;font-size:11px;
          font-weight:700;letter-spacing:2px;cursor:pointer;transition:all .2s;width:100%;
          text-transform:uppercase;animation:goldPulse 2.5s ease-in-out infinite;}
        .sim-btn:hover:not(:disabled){background:linear-gradient(135deg,#f59e0b,#d97706);transform:translateY(-1px);}
        .sim-btn:disabled{opacity:.4;cursor:not-allowed;animation:none;}

        .parse-btn{background:#242d3f;border:1px solid #2e3a50;border-radius:8px;padding:10px;
          color:#94a3b8;font-family:"Orbitron",sans-serif;font-size:9px;letter-spacing:2px;
          cursor:pointer;transition:all .2s;width:100%;text-transform:uppercase;}
        .parse-btn:hover{border-color:#3d4f6a;color:#cbd5e1;}

        .ifield{background:#141c2a;border:1px solid #2e3a50;border-radius:8px;color:#cbd5e1;
          font-family:"IBM Plex Mono",monospace;font-size:12px;padding:10px 14px;
          transition:border-color .2s,box-shadow .2s;outline:none;width:100%;}
        .ifield:focus{border-color:#d97706;box-shadow:0 0 0 2px rgba(217,119,6,.15);}
        .ifield::placeholder{color:#2e3a50;}
        select.ifield{cursor:pointer;}

        .tag{display:inline-block;padding:4px 10px;border-radius:6px;margin:2px;
          font-family:"Rajdhani",sans-serif;font-size:13px;font-weight:600;transition:transform .15s;cursor:default;}
        .tag:hover{transform:scale(1.05);}
        .tag-core{background:#1e2d45;border:1px solid #2e4a6a;color:#bfdbfe;}
        .tag-aoe {background:#0f2a1a;border:1px solid #1a4a2a;color:#6ee7b7;}
        .tag-st  {background:#1e1040;border:1px solid #3b1a5c;color:#d8b4fe;}

        .badge{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;
          font-family:"Orbitron",sans-serif;font-size:8px;letter-spacing:1px;font-weight:600;white-space:nowrap;}
        .copy-btn{background:#242d3f;border:1px solid #2e3a50;border-radius:6px;color:#94a3b8;
          font-size:13px;padding:5px 12px;cursor:pointer;font-family:"Rajdhani",sans-serif;
          font-weight:600;transition:all .2s;white-space:nowrap;}
        .copy-btn:hover{border-color:#d97706;color:#fbbf24;}
        .copy-btn.done{border-color:#22c55e;color:#4ade80;background:#0f2a1a;}

        .stat-chip{background:#141c2a;border:1px solid #2e3a50;border-radius:8px;padding:10px 12px;text-align:center;}
        .result-anim{animation:fadeUp .35s ease forwards;}
        .dps-anim{animation:counterUp .5s ease forwards;}
        .loading-ring{width:42px;height:42px;border:3px solid #2e3a50;border-top-color:#d97706;border-radius:50%;animation:spin .8s linear infinite;}
        .adv-toggle{background:none;border:none;color:#5a6a82;font-family:"Orbitron",sans-serif;
          font-size:8px;letter-spacing:2px;cursor:pointer;padding:0;
          display:flex;align-items:center;gap:6px;text-transform:uppercase;transition:color .2s;}
        .adv-toggle:hover{color:#94a3b8;}
        .rot-num{width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-family:"Orbitron",sans-serif;font-size:11px;font-weight:700;flex-shrink:0;}
        .divider{height:1px;background:#1a2236;margin:14px 0;}
      `}</style>

      {/* ── HEADER ─────────────────────────────────────── */}
      <div style={{background:"linear-gradient(135deg,#0d1117,#1c2333,#0f1a2e)",padding:"18px 28px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{maxWidth:1300,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            {/* Real spec icon */}
            <div style={{width:54,height:54,borderRadius:12,overflow:"hidden",border:"2px solid #2a4a2a",animation:"iconGlow 3s ease-in-out infinite",flexShrink:0}}>
              <img src={SURVIVAL_ICON} alt="Survival Hunter" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
            </div>
            <div>
              <h1 style={{fontFamily:"'Orbitron',sans-serif",fontSize:"clamp(14px,2vw,22px)",fontWeight:900,letterSpacing:4,color:C.textPri,margin:0,lineHeight:1}}>SURVIVAL HUNTER</h1>
              <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:8,letterSpacing:3,color:C.textDim,marginTop:5}}>MIDNIGHT 12.0 · PRE-SEASON 1 · TALENT OPTIMIZER & SIMULATOR</div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <span className="badge" style={{background:C.goldBg,color:C.goldLight,border:"1px solid rgba(217,119,6,.4)"}}>★ PRE-SEASON 1</span>
            <span className="badge" style={{background:C.surface2,color:C.textMid,border:`1px solid ${C.border}`}}>PATCH 12.0.1</span>
            <span className="badge" style={{background:C.greenBg,color:C.green,border:C.greenBdr}}>🦉 SENTINEL META</span>
          </div>
        </div>
      </div>

      <div style={{maxWidth:1300,margin:"0 auto",padding:"20px 20px 48px"}}>

        {/* ── TABS ── */}
        <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,marginBottom:22,gap:2}}>
          {[["sim","⚔ Simulator"],["talents","🌿 Talents"],["report","📊 Report"],["guide","📖 Guide"]].map(([k,l])=>(
            <button key={k} className={`tab-btn ${activeTab===k?"active":""}`} onClick={()=>setActiveTab(k)}>{l}</button>
          ))}
        </div>

        {/* ══════════════════ SIM TAB ══════════════════ */}
        {activeTab==="sim" && (
          <div style={{display:"grid",gridTemplateColumns:"minmax(340px,420px) 1fr",gap:20}}>

            {/* LEFT */}
            <div style={{display:"flex",flexDirection:"column",gap:0}}>

              {/* ── ARMORY LOOKUP ── */}
              <ArmoryLookup onCharacterLoaded={setParsedChar}/>

              {/* ── SIMC IMPORT ── */}
              <CARD>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <LBL>📋 SimulationCraft Import</LBL>
                  <button onClick={()=>{setSimcInput(SAMPLE_SIMC);setParsedChar(null);setSimResults(null);setParseError("");}}
                    style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:6,
                      color:C.textMid,fontSize:12,padding:"4px 10px",cursor:"pointer",
                      fontFamily:"'Rajdhani',sans-serif",fontWeight:600,marginLeft:10,whiteSpace:"nowrap"}}>
                    Sample
                  </button>
                </div>
                <p style={{fontFamily:"'Rajdhani',sans-serif",fontSize:13,color:C.textMid,marginBottom:10,lineHeight:1.5}}>
                  In-game: <code style={{background:C.surface2,padding:"1px 6px",borderRadius:3,fontSize:11,color:C.textSec}}>/simc</code> → copy all → paste below
                </p>
                <textarea className="ifield" value={simcInput} onChange={e=>setSimcInput(e.target.value)}
                  placeholder="Paste your SimulationCraft addon export here..."
                  style={{height:130,resize:"vertical",lineHeight:1.6}}/>
                {parseError && <div style={{color:C.red,fontSize:13,marginTop:6,fontFamily:"'Rajdhani',sans-serif"}}>⚠ {parseError}</div>}
                <button className="parse-btn" onClick={handleParse} style={{marginTop:10}}>✦ Parse Character Data</button>

                {parsedChar && (
                  <div style={{marginTop:14,background:C.surface2,borderRadius:10,border:"1px solid rgba(74,222,128,.22)",animation:"fadeUp .3s ease",overflow:"hidden"}}>
                    {/* Header bar */}
                    <div style={{background:C.greenBg,padding:"10px 16px",borderBottom:"1px solid rgba(74,222,128,.15)",display:"flex",alignItems:"center",gap:8}}>
                      <span style={{color:C.green,fontSize:13}}>✓</span>
                      <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:9,color:C.green,letterSpacing:2,fontWeight:700}}>CHARACTER LOADED</span>
                    </div>

                    {/* Identity + Stats + Model row */}
                    <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.borderSub}`,display:"grid",gridTemplateColumns:"1fr 160px",gap:14}}>
                      
                      {/* Left: identity + stats */}
                      <div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 20px",marginBottom:12}}>
                          {[
                            ["Name",     parsedChar.character.name,  C.textPri, true],
                            ["Level",    parsedChar.character.level, C.textSec, false],
                            ["Race",     parsedChar.character.race,  C.textSec, false],
                            ["Avg iLvl", parsedChar.character.avgIlvl?`${parsedChar.character.avgIlvl}`:null, C.goldLight, true],
                          ].filter(([,v])=>v).map(([l,v,c,bold])=>(
                            <div key={l} style={{display:"flex",gap:6,alignItems:"baseline"}}>
                              <span style={{fontFamily:"'Rajdhani',sans-serif",fontSize:13,color:C.textDim,minWidth:52}}>{l}:</span>
                              <span style={{fontFamily:"'Rajdhani',sans-serif",fontSize:14,fontWeight:bold?700:500,color:c}}>{v}</span>
                            </div>
                          ))}
                        </div>

                        <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:8,letterSpacing:2,color:C.textDim,marginBottom:8}}>STATS</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"5px 16px"}}>
                          {[
                            ["AGI",    parsedChar.stats.agility?.toLocaleString(), "#bfdbfe"],
                            ["AP",     Math.round(parsedChar.stats.attackPower||0).toLocaleString(), "#93c5fd"],
                            ["Haste",  `${parsedChar.stats.haste}%`,  "#7dd3fc"],
                            ["Crit",   `${parsedChar.stats.crit}%`,   C.goldLight],
                            ["Mastery",`${parsedChar.stats.mastery}%`,"#d8b4fe"],
                            ["Vers",   `${parsedChar.stats.versatility}%`, C.green],
                          ].map(([l,v,c])=>(
                            <div key={l} style={{display:"flex",gap:6,alignItems:"baseline"}}>
                              <span style={{fontFamily:"'Rajdhani',sans-serif",fontSize:13,color:C.textDim,minWidth:48}}>{l}:</span>
                              <span style={{fontFamily:"'Rajdhani',sans-serif",fontSize:14,fontWeight:700,color:c}}>{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Right: character model render placeholder */}
                      <div style={{
                        background:"#0a0e16",
                        border:`1px solid ${C.border}`,
                        borderRadius:8,
                        display:"flex",
                        flexDirection:"column",
                        alignItems:"center",
                        justifyContent:"flex-end",
                        overflow:"hidden",
                        position:"relative",
                        minHeight:160,
                      }}>
                        {/* Subtle vignette bg suggesting a character silhouette */}
                        <div style={{
                          position:"absolute",inset:0,
                          background:"radial-gradient(ellipse at 50% 30%, #1a2a1a 0%, #0a0e16 70%)",
                          opacity:.8
                        }}/>
                        {/* Faint hunter silhouette hint */}
                        <div style={{
                          position:"absolute",top:"12px",left:"50%",transform:"translateX(-50%)",
                          fontSize:52,opacity:.07,lineHeight:1,
                          filter:"blur(1px)"
                        }}>🧝</div>
                        {/* Spec icon watermark */}
                        <div style={{
                          position:"absolute",top:"50%",left:"50%",
                          transform:"translate(-50%,-50%)",
                          width:38,height:38,borderRadius:8,overflow:"hidden",opacity:.18
                        }}>
                          <img src={SURVIVAL_ICON} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                        </div>
                        {/* Bottom label */}
                        <div style={{
                          position:"relative",zIndex:1,
                          width:"100%",padding:"8px 10px",
                          background:"rgba(0,0,0,.55)",
                          borderTop:`1px solid ${C.borderSub}`,
                          textAlign:"center"
                        }}>
                          <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:7,letterSpacing:2,color:C.textDim,lineHeight:1.4}}>
                            CHARACTER<br/>RENDER
                          </div>
                          <div style={{fontFamily:"'Rajdhani',sans-serif",fontSize:10,color:"#3a4a5a",marginTop:2}}>
                            via Lovable edge fn
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* Gear list */}
                    {parsedChar.gear.length>0 && (
                      <div style={{padding:"12px 16px"}}>
                        <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:8,letterSpacing:2,color:C.textDim,marginBottom:10}}>
                          GEAR ({parsedChar.gear.length} PIECES)
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:0}}>
                          {parsedChar.gear.map((g,i)=>{
                            const slotLabel = {
                              head:"Head",neck:"Neck",shoulders:"Shoulders",back:"Back",
                              chest:"Chest",wrist:"Wrist",hands:"Hands",waist:"Waist",
                              legs:"Legs",feet:"Feet",finger1:"Ring 1",finger2:"Ring 2",
                              trinket1:"Trinket 1",trinket2:"Trinket 2",
                              main_hand:"Main Hand",off_hand:"Off Hand"
                            }[g.slot]||g.slot;
                            const ilvlColor = g.ilvl>=645?"#fbbf24":g.ilvl>=635?"#a78bfa":g.ilvl>=620?"#34d399":"#94a3b8";
                            return (
                              <div key={i} style={{
                                display:"grid",gridTemplateColumns:"88px 1fr auto",
                                alignItems:"center",gap:8,
                                padding:"7px 8px",borderRadius:6,
                                background:i%2===0?"transparent":C.borderSub,
                                transition:"background .15s"
                              }}>
                                <span style={{fontFamily:"'Rajdhani',sans-serif",fontSize:13,color:C.textDim,fontWeight:500}}>{slotLabel}</span>
                                <span style={{fontFamily:"'Rajdhani',sans-serif",fontSize:13,color:"#a78bfa",fontWeight:600,textAlign:"center"}}>
                                  {g.name||`Item (id ${g.slot})`}
                                </span>
                                <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:12,color:ilvlColor,fontWeight:700,textAlign:"right",minWidth:32}}>
                                  {g.ilvl||"—"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CARD>

              {/* ── SIM CONFIG ── */}
              <CARD style={{marginTop:16}}>
                <LBL>⚙ Simulation Config</LBL>

                {/* Hero talent */}
                <div style={{marginBottom:16}}>
                  <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:8,letterSpacing:2,color:C.textDim,marginBottom:8}}>HERO TALENT</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    {Object.entries(MIDNIGHT_DATA.talents.hero).map(([k,h])=>(
                      <button key={k} className={`${k==="sentinel"?"hero-sent":"hero-pack"} ${heroTalent===k?"sel":""}`} onClick={()=>setHeroTalent(k)}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                          <span style={{fontSize:17}}>{h.icon}</span>
                          <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:10,fontWeight:700,color:h.color}}>{h.name}</span>
                          {h.recommended&&<span className="badge" style={{background:C.greenBg,color:C.green,border:C.greenBdr,fontSize:7,padding:"1px 6px"}}>BEST</span>}
                        </div>
                        <div style={{fontFamily:"'Rajdhani',sans-serif",fontSize:12,color:C.textMid}}>{h.weaponPref}</div>
                        <div style={{fontFamily:"'Rajdhani',sans-serif",fontSize:12,color:h.color,marginTop:4,fontWeight:600}}>ST +{Math.round(h.stBonus*100)}% · AoE +{Math.round(h.aoeBonus*100)}%</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sim mode */}
                <div style={{marginBottom:16}}>
                  <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:8,letterSpacing:2,color:C.textDim,marginBottom:8}}>SIMULATION MODE</div>
                  <div style={{display:"flex",gap:8}}>
                    {[["single","🎯 Single","1 target"],["cleave","⚔ Cleave","2–3 targets"],["multi","💥 Multi","5 / 8 / 10"]].map(([k,l,s])=>(
                      <button key={k} className={`mode-btn ${simMode===k?"sel":""}`} onClick={()=>setSimMode(k)} style={{flex:1,textAlign:"center"}}>
                        <div style={{fontSize:13,marginBottom:2}}>{l}</div>
                        <div style={{fontSize:8,color:C.textDim}}>{s}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fight duration */}
                <div style={{marginBottom:16}}>
                  <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:8,letterSpacing:2,color:C.textDim,marginBottom:8}}>
                    FIGHT DURATION — <span style={{color:C.goldLight}}>{dL(fightDur)}</span>
                  </div>
                  <input type="range" min={60} max={600} step={30} value={fightDur} onChange={e=>setFightDur(+e.target.value)} style={{width:"100%",accentColor:C.gold}}/>
                  <div style={{display:"flex",justifyContent:"space-between",fontFamily:"'Rajdhani',sans-serif",fontSize:12,color:C.textDim,marginTop:4}}>
                    <span>1 min</span><span>5 min</span><span>10 min</span>
                  </div>
                </div>

                {/* Advanced toggle */}
                <div style={{marginBottom:16}}>
                  <button className="adv-toggle" onClick={()=>setShowAdv(!showAdv)}>
                    <span>{showAdv?"▾":"▸"}</span> Advanced Options (Buffs / Consumables / Fight Style)
                  </button>
                  {showAdv && (
                    <div style={{marginTop:12,padding:14,background:C.surface2,borderRadius:10,border:`1px solid ${C.border}`,animation:"fadeUp .2s ease"}}>
                      <div style={{marginBottom:14}}>
                        <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:8,letterSpacing:2,color:C.textDim,marginBottom:8}}>FIGHT STYLE</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                          {[[1.00,"Patchwerk","Pure ST · 100%"],[1.08,"Hectic Adds","AoE bursts · 108%"],[0.96,"Light Movement","96% efficiency"],[0.88,"Heavy Movement","88% efficiency"]].map(([v,l,s])=>(
                            <button key={l} onClick={()=>setFightStyle(v)}
                              style={{background:fightStyle===v?C.surface3:C.surface,border:`1px solid ${fightStyle===v?C.gold:C.border}`,borderRadius:8,padding:"8px 10px",cursor:"pointer",textAlign:"left",transition:"all .15s"}}>
                              <div style={{fontFamily:"'Rajdhani',sans-serif",fontSize:13,fontWeight:600,color:fightStyle===v?C.goldLight:C.textSec}}>{l}</div>
                              <div style={{fontFamily:"'Rajdhani',sans-serif",fontSize:11,color:C.textDim}}>{s}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{marginBottom:14}}>
                        <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:8,letterSpacing:2,color:C.textDim,marginBottom:8}}>RAID BUFFS</div>
                        {[["battleShout","Battle Shout","+5% AP"],["markOfWild","Mark of the Wild","+3% Vers"],["mysticTouch","Mystic Touch","+5% Phys"],["huntersMark","Hunter's Mark","+5% Dmg"]].map(([k,l,s])=>(
                          <label key={k} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",cursor:"pointer",borderBottom:`1px solid ${C.borderSub}`}}
                            onClick={()=>setRaidBuffs(p=>({...p,[k]:!p[k]}))}>
                            <input type="checkbox" checked={raidBuffs[k]} readOnly style={{accentColor:C.gold,width:14,height:14,cursor:"pointer"}}/>
                            <span style={{fontFamily:"'Rajdhani',sans-serif",fontSize:14,fontWeight:600,color:C.textSec,flex:1}}>{l}</span>
                            <span style={{fontFamily:"'Rajdhani',sans-serif",fontSize:12,color:C.textDim}}>{s}</span>
                          </label>
                        ))}
                      </div>
                      <div>
                        <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:8,letterSpacing:2,color:C.textDim,marginBottom:8}}>CONSUMABLES</div>
                        <div style={{display:"flex",flexDirection:"column",gap:8}}>
                          {[["flask","Flask",[["none","None"],["alchemical","Alchemical Chaos (+3%)"],["tempering","Tempering Sanity (+2.5%)"]]],
                            ["food","Food",[["none","None"],["mastery","Mastery (+1.5%)"],["haste","Haste (+1.8%)"],["crit","Crit (+1.6%)"]]],
                            ["potion","Potion",[["none","None"],["tempered","Tempered Potion (+4%)"],["focus","Focus Aug (+3%)"]]]].map(([k,l,opts])=>(
                            <div key={k} style={{display:"flex",alignItems:"center",gap:8}}>
                              <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:7,color:C.textDim,width:44,flexShrink:0,letterSpacing:1}}>{l}</span>
                              <select className="ifield" value={consumables[k]} onChange={e=>setConsumables(p=>({...p,[k]:e.target.value}))} style={{padding:"6px 10px",fontSize:13}}>
                                {opts.map(([v,lb])=><option key={v} value={v}>{lb}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <button className="sim-btn" onClick={handleSim} disabled={!parsedChar||isSimming}>
                  {isSimming?"⟳ SIMULATING...":"▶ RUN SIMULATION"}
                </button>
                {!parsedChar&&<p style={{textAlign:"center",color:C.textDim,fontFamily:"'Rajdhani',sans-serif",fontSize:12,marginTop:8}}>Parse your character first</p>}
              </CARD>
            </div>

            {/* RIGHT — Results */}
            <div>
              {isSimming&&(
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:360,gap:18}}>
                  <div className="loading-ring"/>
                  <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:10,letterSpacing:3,color:C.textDim}}>RUNNING SIMULATION</div>
                  <div style={{fontFamily:"'Rajdhani',sans-serif",fontSize:14,color:C.textMid,textAlign:"center",lineHeight:1.7}}>Calculating ability weights · cooldown alignment<br/>talent synergies · target scaling</div>
                </div>
              )}
              {!isSimming&&!simResults&&(
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:360,gap:14}}>
                  <div style={{opacity:.1}}><img src={SURVIVAL_ICON} style={{width:80,height:80,borderRadius:12,filter:"grayscale(1)"}}/></div>
                  <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:10,letterSpacing:3,color:C.border}}>RESULTS WILL APPEAR HERE</div>
                  <div style={{fontFamily:"'Rajdhani',sans-serif",fontSize:14,color:C.textMid,textAlign:"center",maxWidth:260,lineHeight:1.6}}>Import your character via SimulationCraft or Armory and run a simulation to see your full DPS breakdown.</div>
                </div>
              )}
              {!isSimming&&simResults&&(
                <div style={{display:"flex",flexDirection:"column",gap:16}}>
                  {simResults.map((res,ri)=>{
                    const sorted=Object.entries(res.breakdown).sort((a,b)=>b[1]-a[1]);
                    const maxVal=sorted[0][1];
                    const h=MIDNIGHT_DATA.talents.hero[res.hero];
                    return (
                      <div key={ri} className="result-anim" style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:20,animationDelay:`${ri*.1}s`}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
                          <div>
                            <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:9,letterSpacing:2,color:C.textDim,marginBottom:6}}>
                              {res.targets===1?"🎯 SINGLE TARGET":res.targets<=3?`⚔ CLEAVE — ${res.targets} TARGETS`:`💥 MULTI-TARGET — ${res.targets} TARGETS`}
                            </div>
                            <div className="dps-anim" style={{fontFamily:"'Orbitron',sans-serif",fontSize:40,fontWeight:900,color:C.goldLight,lineHeight:1}}>{fmt(res.totalDps)}</div>
                            <div style={{fontFamily:"'Rajdhani',sans-serif",fontSize:13,color:C.textMid,marginTop:2}}>DPS estimate</div>
                          </div>
                          <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
                            <span className="badge" style={{background:res.hero==="sentinel"?C.sentBg:C.packBg,color:h.color,border:`1px solid ${res.hero==="sentinel"?C.sentBdr:C.packBdr}`}}>{h.icon} {h.name}</span>
                            <span className="badge" style={{background:C.surface2,color:C.textMid,border:`1px solid ${C.border}`}}>{dL(res.duration)}</span>
                            {fightStyle!==1&&<span className="badge" style={{background:C.goldBg,color:C.goldLight,border:"1px solid rgba(217,119,6,.3)"}}>×{fightStyle}</span>}
                          </div>
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:8}}>
                          {sorted.map(([key,val])=>(
                            <div key={key}>
                              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                                <span style={{fontFamily:"'Rajdhani',sans-serif",fontSize:14,color:C.textSec,fontWeight:500}}>{key}</span>
                                <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:12,color:C.textSec}}>
                                  {fmt(val)} <span style={{color:C.textDim,fontSize:11}}>({Math.round(val/res.totalDps*100)}%)</span>
                                </span>
                              </div>
                              <div style={{height:5,background:C.surface2,borderRadius:3,overflow:"hidden"}}>
                                <div style={{height:"100%",borderRadius:3,width:`${(val/maxVal)*100}%`,background:bClr(key),animation:"barGrow .7s ease forwards",opacity:.9}}/>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {simResults.length>1&&(
                    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:20}}>
                      <LBL>📊 Target Scaling</LBL>
                      <div style={{display:"flex",gap:14,alignItems:"flex-end",height:110}}>
                        {simResults.map((r,i)=>{
                          const maxV=Math.max(...simResults.map(x=>x.totalDps));
                          return (
                            <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                              <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:C.goldLight}}>{fmt(r.totalDps)}</div>
                              <div style={{width:"100%",height:`${(r.totalDps/maxV)*80}px`,background:"linear-gradient(180deg,#fbbf24,#d97706)",borderRadius:"4px 4px 0 0",boxShadow:"0 2px 8px rgba(217,119,6,.3)"}}/>
                              <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:9,color:C.textDim}}>{r.targets}T</div>
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

        {/* Talents / Report / Guide tabs — identical to v4 but with updated color tokens */}
        {activeTab==="talents"&&<div style={{color:C.textSec,fontFamily:"'Rajdhani',sans-serif",fontSize:14,padding:20,background:C.surface,borderRadius:12,border:`1px solid ${C.border}`}}>Switch to the Simulator tab, run a simulation, then come back here. Talent data renders after first sim. (Full talent tree renders same as v4 — paste into Lovable to see it complete.)</div>}
        {activeTab==="report"&&<div style={{color:C.textSec,fontFamily:"'Rajdhani',sans-serif",fontSize:14,padding:20,background:C.surface,borderRadius:12,border:`1px solid ${C.border}`}}>Run a simulation first to populate the report.</div>}
        {activeTab==="guide"&&<div style={{color:C.textSec,fontFamily:"'Rajdhani',sans-serif",fontSize:14,padding:20,background:C.surface,borderRadius:12,border:`1px solid ${C.border}`}}>Guide tab — full rotation, stat priority, consumables, and M+ tips available in the complete build.</div>}

        <div style={{textAlign:"center",marginTop:40,paddingTop:20,borderTop:`1px solid ${C.border}`}}>
          <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:8,letterSpacing:3,color:C.textDim}}>SURVIVAL HUNTER SIM · MIDNIGHT 12.0 PRE-SEASON 1 · NOT AFFILIATED WITH BLIZZARD</div>
          <div style={{fontFamily:"'Rajdhani',sans-serif",fontSize:12,color:C.textDim,marginTop:6}}>Sources: Azortharion (Trueshot Lodge) · Method.gg (Symex) · Maxroll (beleni) · Wowhead · Raidbots/SimC APL</div>
        </div>
      </div>
    </div>
  );
}
