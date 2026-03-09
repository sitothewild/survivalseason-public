// @ts-nocheck
import { useState, useEffect, useMemo } from "react";
import { NavLink } from "@/components/NavLink";
import { supabase } from "@/integrations/supabase/client";
import {
  getFullOptimalAnalysis,
  HEROIC_MIDNIGHT_276,
  SURVIVAL_SPEC_TREE,
  HERO_TALENT_TREES,
  ROW_GATES,
} from "@/lib/theorycrafting";
import survivalIconImg from "@/assets/survival-icon.png";

const C = {
  pageBg:"#0d1117", surface:"#1c2333", surface2:"#242d3f", surface3:"#2c3750",
  border:"#2e3a50", borderSub:"#1a2236",
  textPri:"#f1f5f9", textSec:"#cbd5e1", textMid:"#94a3b8", textDim:"#5a6a82",
  gold:"#d97706", goldLight:"#fbbf24", goldBg:"#2a1f08",
  sentBg:"#0c1e35", sentBdr:"#1a3a5c", sentClr:"#38bdf8",
  packBg:"#1a0e2e", packBdr:"#3b1a5c", packClr:"#c084fc",
  green:"#4ade80", greenBg:"#0f2a1a", greenBdr:"rgba(74,222,128,.3)",
  red:"#f87171",
};

const NAV_LINKS = [
  { to:"/",      label:"⚔ Simulator" },
  { to:"/gear",  label:"⚗ Gear"      },
  { to:"/guide", label:"📖 Guide"     },
];

export default function Guide() {
  const [hero, setHero]           = useState<"sentinel"|"packLeader">("sentinel");
  const [targets, setTargets]     = useState(1);
  const [simcData, setSimcData]   = useState<any>(null);
  const [simcLoading, setSimcLoading] = useState(true);

  const isSent  = hero === "sentinel";
  const heroClr = isSent ? C.sentClr  : C.packClr;
  const heroBg  = isSent ? C.sentBg   : C.packBg;
  const heroBdr = isSent ? C.sentBdr  : C.packBdr;

  // Auto-load cached SimC data on mount (no sync button needed)
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("simc-data-sync", {
          body: { force: false },
        });
        if (data?.data) setSimcData(data.data);
      } catch (_) {}
      finally { setSimcLoading(false); }
    })();
  }, []);

  // Theory analysis — re-runs when hero or target count changes
  const theory = useMemo(() => {
    const tier = { has2pc: true, has4pc: true };
    return getFullOptimalAnalysis(hero, targets, HEROIC_MIDNIGHT_276, tier);
  }, [hero, targets]);

  // ── Sub-components ──────────────────────────────────────────

  const Card = ({ children, style = {}, span = false }: any) => (
    <div style={{
      background:C.surface, border:`1px solid ${C.border}`,
      borderRadius:14, padding:24,
      ...(span ? { gridColumn:"1 / -1" } : {}),
      ...style,
    }}>
      {children}
    </div>
  );

  const Lbl = ({ children }: any) => (
    <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:9, letterSpacing:3,
      color:heroClr, textTransform:"uppercase", marginBottom:14,
      display:"flex", alignItems:"center", gap:10, fontWeight:700 }}>
      {children}
      <div style={{ flex:1, height:1, background:heroBdr }} />
    </div>
  );

  const Step = ({ n, title, desc }: any) => (
    <div style={{ display:"flex", gap:12, marginBottom:14, alignItems:"flex-start" }}>
      <div style={{ width:28, height:28, borderRadius:7, background:C.goldBg,
        border:`1px solid ${C.gold}`, display:"flex", alignItems:"center",
        justifyContent:"center", fontFamily:"'Orbitron',sans-serif",
        fontSize:11, color:C.goldLight, flexShrink:0 }}>{n}</div>
      <div>
        <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:10,
          color:C.goldLight, marginBottom:3, letterSpacing:1 }}>{title}</div>
        <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13,
          color:C.textMid, lineHeight:1.5 }}>{desc}</div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:C.pageBg, color:C.textPri,
      fontFamily:"'Rajdhani','Segoe UI',sans-serif" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;600;700;900&family=IBM+Plex+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;} body{margin:0;}
        .g-nav-link{font-family:'Rajdhani',sans-serif;font-size:14px;font-weight:700;
          letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;
          color:#64748b;padding:10px 18px;border-bottom:3px solid transparent;
          transition:color .2s,border-color .2s;display:inline-block;}
        .g-nav-link:hover{color:#94a3b8;}
        .g-nav-link.active{color:#fbbf24;border-bottom-color:#d97706;}
        @media(max-width:900px){
          .g-2col{grid-template-columns:1fr !important;}
          .g-3col{grid-template-columns:1fr !important;}
        }
        @keyframes spin{to{transform:rotate(360deg);}}
      `}</style>

      {/* ── Header ─────────────────────────────────────────── */}
      <header style={{ background:"linear-gradient(135deg,#0d1117,#1c2333,#0f1a2e)",
        borderBottom:`1px solid ${C.border}`, padding:"16px 28px" }}>
        <div style={{ maxWidth:1400, margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
            flexWrap:"wrap", gap:12, marginBottom:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <div style={{ width:44, height:44, borderRadius:10, overflow:"hidden",
                border:`2px solid ${C.sentBdr}`, flexShrink:0 }}>
                <img src={survivalIconImg} alt="Survival Hunter"
                  style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              </div>
              <div>
                <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:16,
                  fontWeight:700, color:C.textPri, letterSpacing:2 }}>SURVIVAL HUNTER</div>
                <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:8,
                  letterSpacing:3, color:C.textDim, marginTop:3 }}>
                  ROTATION GUIDE · MIDNIGHT 12.0 · PRE-SEASON 1
                </div>
              </div>
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <span style={{ background:C.goldBg, color:C.goldLight,
                border:`1px solid rgba(217,119,6,.4)`, borderRadius:6,
                padding:"3px 10px", fontSize:12, fontFamily:"'Rajdhani',sans-serif", fontWeight:700 }}>
                ★ PRE-SEASON 1
              </span>
              <span style={{ background:C.surface2, color:C.textMid,
                border:`1px solid ${C.border}`, borderRadius:6,
                padding:"3px 10px", fontSize:12, fontFamily:"'Rajdhani',sans-serif" }}>
                PATCH 12.0.1
              </span>
            </div>
          </div>
          <nav style={{ display:"flex", borderBottom:`1px solid ${C.border}` }}>
            {NAV_LINKS.map(({ to, label }) => (
              <NavLink key={to} to={to} className="g-nav-link" activeClassName="active"
                {...(to==="/" ? { end:true } : {})}>
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* ── Page body ────────────────────────────────────────── */}
      <main style={{ maxWidth:1400, margin:"0 auto", padding:"32px 28px 64px" }}>

        {/* Page intro + controls */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
          flexWrap:"wrap", gap:16, marginBottom:28 }}>
          <div>
            <h1 style={{ fontFamily:"'Orbitron',sans-serif", fontSize:22, fontWeight:900,
              color:heroClr, letterSpacing:3, margin:0, textTransform:"uppercase" }}>
              {isSent ? "🦉 Sentinel" : "🐾 Pack Leader"} — Rotation Guide
            </h1>
            <p style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:15, color:C.textMid,
              marginTop:8, maxWidth:620 }}>
              First-principles ability DPS breakdown, talent analysis, community comparison,
              and live SimC APL. All numbers computed from raw AP coefficients —
              not anchored to a fixed value.
            </p>
          </div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            {(["sentinel","packLeader"] as const).map(h => (
              <button key={h} onClick={() => setHero(h)} style={{
                fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:14,
                letterSpacing:1, padding:"9px 20px", borderRadius:10, cursor:"pointer",
                background: hero===h ? (h==="sentinel"?C.sentBg:C.packBg) : C.surface2,
                border:`1px solid ${hero===h ? (h==="sentinel"?C.sentClr:C.packClr) : C.border}`,
                color: hero===h ? (h==="sentinel"?C.sentClr:C.packClr) : C.textMid,
                transition:"all .2s",
              }}>
                {h==="sentinel" ? "🦉 Sentinel" : "🐾 Pack Leader"}
              </button>
            ))}
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 16px",
              background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10 }}>
              <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:9, color:C.textDim, letterSpacing:1 }}>TARGETS</span>
              {[1,3,5,8].map(t => (
                <button key={t} onClick={() => setTargets(t)} style={{
                  fontFamily:"'IBM Plex Mono',monospace", fontSize:12, width:28, height:28,
                  borderRadius:6, cursor:"pointer", border:"none",
                  background: targets===t ? heroClr : C.surface3,
                  color: targets===t ? "#000" : C.textMid,
                  fontWeight:700 }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════
            ROW 1 — Static reference cards (2-col)
        ═══════════════════════════════════════════════════ */}
        <div className="g-2col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr",
          gap:20, marginBottom:20 }}>

          {/* How to Use */}
          <Card>
            <Lbl>📋 How to Use the Simulator</Lbl>
            <Step n="1" title="Install SimulationCraft Addon"  desc="Get it from CurseForge or WoWInterface. Keep it updated." />
            <Step n="2" title="Export Your Character"          desc="In-game: type /simc → press Enter. A window appears with your full character string." />
            <Step n="3" title="Copy & Paste"                   desc="Ctrl+A, Ctrl+C to copy the entire string. Paste it into the Import box on the Simulator page." />
            <Step n="4" title="Configure & Simulate"           desc="Choose Hero Talent, fight duration, and target count. Click Run Simulation." />
            <Step n="5" title="Read Results"                   desc="DPS breakdown by ability, stat weights, talent export string, and APL priority order." />
            <div style={{ marginTop:14, padding:"10px 14px", background:heroBg,
              border:`1px solid ${heroBdr}`, borderRadius:8,
              fontFamily:"'Rajdhani',sans-serif", fontSize:13, color:C.textMid }}>
              Tip: paste your SimC string once then bookmark the page — your import is remembered in-session while you tweak talents and fight settings.
            </div>
          </Card>

          {/* M+ Tips */}
          <Card>
            <Lbl>🏰 Mythic+ Tips</Lbl>
            {[
              { icon:"🎯", tip:"Pull around Takedown", desc:"Your burst cycle is ~60–90s. Chain pulls so Takedown is off cooldown when the pack lands." },
              { icon:"💣", tip:"Pool WFB charges for packs", desc:"Never let Wildfire Bomb sit at 2 charges — WFB is your highest AoE priority. Throw it immediately as the pack lands." },
              { icon:"⚡", tip:"Lunar Storm positioning",  desc:"Position so your Sentinel Mark Lunar Storm AoE hits the full pack. It bounces — one missed target is real loss." },
              { icon:"🐾", tip:"Misdirect on every CD", desc:"MD your tank every 30s. Automate this with a macro: /cast [@focus] Misdirection." },
              { icon:"🌀", tip:"Hold Boomstick for packs", desc:"If a new pack is incoming in <10s, delay Boomstick so it fires into grouped targets." },
            ].map((t, i) => (
              <div key={i} style={{ display:"flex", gap:10, marginBottom:12, alignItems:"flex-start" }}>
                <span style={{ fontSize:14, flexShrink:0, width:22, textAlign:"center" }}>{t.icon}</span>
                <div>
                  <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13,
                    color:C.goldLight, fontWeight:700, marginBottom:2 }}>{t.tip}</div>
                  <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:12,
                    color:C.textMid, lineHeight:1.5 }}>{t.desc}</div>
                </div>
              </div>
            ))}
          </Card>

          {/* Consumables */}
          <Card>
            <Lbl>🧪 Consumables (Midnight 12.0.1)</Lbl>
            {[
              { icon:"🧪", label:"Flask",         item:"Flask of the Magisters",        note:"Best Agility flask. 60-min duration, persists through death." },
              { icon:"⚗️", label:"Combat Potion", item:"Draught of Rampant Abandon",    note:"Use on pull. Second pot during Takedown burst window at ~3–4 min." },
              { icon:"🗡️", label:"Weapon Oil",    item:"Thalassian Phoenix Oil",         note:"Fire damage proc — synergises with Flamebreak's all-fire-damage +15% bonus." },
              { icon:"🍖", label:"Food",          item:"Silvermoon Parade (Agility)",    note:"Always use Agility food. Vers food is a meaningful step down." },
              { icon:"💎", label:"Meta Gem",      item:"Eversong Diamond",              note:"Agility proc. Socket in helm — highest priority socket." },
              { icon:"🔮", label:"Augment Rune",  item:"Crystalline Augment Rune",      note:"Use on pull for every prog attempt or parse attempt." },
            ].map((c, i) => (
              <div key={i} style={{ display:"flex", gap:10, marginBottom:12, alignItems:"flex-start" }}>
                <span style={{ fontSize:14, flexShrink:0, width:22, textAlign:"center" }}>{c.icon}</span>
                <div>
                  <div style={{ display:"flex", gap:8, alignItems:"baseline", marginBottom:2 }}>
                    <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:8,
                      color:C.textDim, letterSpacing:1 }}>{c.label}</span>
                    <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13,
                      color:C.goldLight, fontWeight:600 }}>{c.item}</span>
                  </div>
                  <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:12,
                    color:C.textMid, lineHeight:1.5 }}>{c.note}</div>
                </div>
              </div>
            ))}
          </Card>

          {/* Rotation Priority */}
          <Card>
            <Lbl>🔄 Rotation Priority Notes</Lbl>
            <div style={{ marginBottom:12, padding:"8px 12px", background:heroBg,
              border:`1px solid ${heroBdr}`, borderRadius:8,
              fontFamily:"'Rajdhani',sans-serif", fontSize:13, color:C.textSec }}>
              {isSent
                ? "Sentinel: RS → Sentinel Mark procs → Lunar Storm. KC crits are the 2pc engine. Never delay KC."
                : "Pack Leader: KC first, always. Every KC is a potential beast spawn. Takedown → Stampede capstone."}
            </div>
            {theory.rotationNotes.map((n, i) => (
              <div key={i} style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13,
                color:C.textSec, padding:"8px 12px", marginBottom:8,
                background:C.surface2, borderRadius:6,
                border:`1px solid ${C.border}`, lineHeight:1.5 }}>
                <span style={{ color:heroClr, marginRight:8 }}>→</span>{n}
              </div>
            ))}
          </Card>
        </div>

        {/* ═══════════════════════════════════════════════════
            SECTION — Ability DPS Breakdown
        ═══════════════════════════════════════════════════ */}
        <Card span style={{ marginBottom:20 }}>
          <Lbl>⚗️ First-Principles Ability DPS Breakdown — 276 Hero-track / 4pc Tier</Lbl>
          <p style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13, color:C.textDim,
            marginTop:0, marginBottom:16, lineHeight:1.6 }}>
            Calculated from raw AP coefficients × Attack Power × stat multipliers × CPM model.
            Built from scratch — not anchored to a fixed number.
            <strong style={{ color:C.goldLight }}> Hero-track 276 ilvl (Heroic Raid)</strong>, 4pc tier,
            {" "}{isSent ? "Sentinel" : "Pack Leader"} hero, {targets} target{targets>1?"s":""}.
          </p>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse",
              fontFamily:"'Rajdhani',sans-serif", fontSize:13 }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                  {["Ability","DPS","% of Total","CPM","Dmg/Cast","Notes"].map(h => (
                    <th key={h} style={{ textAlign:"left", padding:"7px 10px",
                      fontFamily:"'Orbitron',sans-serif", fontSize:9, letterSpacing:1,
                      color:C.textDim, fontWeight:400 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {theory.abilities.filter(a => a.dps > 0).map((a, i) => {
                  const barClr = i===0 ? C.goldLight : i<3 ? heroClr : C.textMid;
                  return (
                    <tr key={a.key} style={{ borderBottom:`1px solid ${C.borderSub}`,
                      background: i%2===0 ? "transparent" : "rgba(255,255,255,.015)" }}>
                      <td style={{ padding:"7px 10px", color:C.textSec, fontWeight:600 }}>{a.label}</td>
                      <td style={{ padding:"7px 10px" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ width:60, height:6, borderRadius:3,
                            background:C.surface3, overflow:"hidden" }}>
                            <div style={{ width:`${Math.min(100, a.pctOfTotal * 3)}%`,
                              height:"100%", background:barClr, borderRadius:3 }} />
                          </div>
                          <span style={{ color:barClr, fontWeight:600 }}>
                            {a.dps.toLocaleString(undefined, { maximumFractionDigits:0 })}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding:"7px 10px", color:C.goldLight }}>{a.pctOfTotal.toFixed(1)}%</td>
                      <td style={{ padding:"7px 10px", color:C.textMid }}>{a.cpm.toFixed(1)}</td>
                      <td style={{ padding:"7px 10px", color:C.textMid,
                        fontFamily:"'IBM Plex Mono',monospace", fontSize:11 }}>
                        {Math.round(a.dpsCast).toLocaleString()}
                      </td>
                      <td style={{ padding:"7px 10px", color:C.textDim, fontSize:11, maxWidth:260 }}>
                        {a.notes.slice(0,2).join(" · ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop:14, display:"flex", gap:10, flexWrap:"wrap" }}>
            <span style={{ background:C.goldBg, color:C.goldLight,
              border:`1px solid rgba(217,119,6,.4)`, borderRadius:6,
              padding:"4px 10px", fontFamily:"'Rajdhani',sans-serif", fontWeight:700 }}>
              Total: {theory.totalDps.toLocaleString()} DPS
            </span>
            <span style={{ background:heroBg, color:heroClr,
              border:`1px solid ${heroBdr}`, borderRadius:6,
              padding:"4px 10px", fontFamily:"'Rajdhani',sans-serif" }}>
              {isSent ? "Sentinel" : "Pack Leader"} {targets}T
            </span>
            <span style={{ background:C.surface2, color:C.textMid,
              border:`1px solid ${C.border}`, borderRadius:6,
              padding:"4px 10px", fontFamily:"'Rajdhani',sans-serif" }}>
              276 ilvl · 2pc + 4pc tier
            </span>
          </div>
        </Card>

        {/* ═══════════════════════════════════════════════════
            SECTION — Tier Set Value
        ═══════════════════════════════════════════════════ */}
        <Card span style={{ marginBottom:20 }}>
          <Lbl>🏆 Midnight Tier Set Value — 2pc + 4pc Math</Lbl>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr",
            gap:12, marginBottom:16 }}>
            {[
              { label:"2pc DPS Gain", val:`+${theory.tierSetValue.twoPcDps.toLocaleString()}`,
                sub:"KC crits → WFB CD reduction", color:heroClr },
              { label:"4pc DPS Gain", val:`+${theory.tierSetValue.fourPcDps.toLocaleString()}`,
                sub:"WFB 20% → Boomstick reset", color:C.goldLight },
              { label:"Combined Gain", val:`+${theory.tierSetValue.totalDps.toLocaleString()}`,
                sub:`+${theory.totalDps > 0 ? ((theory.tierSetValue.totalDps / (theory.totalDps - theory.tierSetValue.totalDps)) * 100).toFixed(1) : 0}% total DPS`,
                color:C.green },
            ].map(s => (
              <div key={s.label} style={{ background:C.surface2, borderRadius:10,
                padding:16, border:`1px solid ${C.border}`, textAlign:"center" }}>
                <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:8,
                  color:C.textDim, letterSpacing:1, marginBottom:8 }}>{s.label}</div>
                <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:20,
                  color:s.color, marginBottom:6 }}>{s.val}</div>
                <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:12,
                  color:C.textDim }}>{s.sub}</div>
              </div>
            ))}
          </div>
          <div style={{ background:C.surface2, borderRadius:10, padding:14,
            border:`1px solid ${C.border}` }}>
            {theory.tierSetValue.notes.map((n, i) => (
              <div key={i} style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13,
                color:C.textMid, padding:"5px 0",
                borderBottom: i < theory.tierSetValue.notes.length-1
                  ? `1px solid ${C.borderSub}` : "none" }}>
                <span style={{ color:C.goldLight, marginRight:8 }}>▸</span>{n}
              </div>
            ))}
          </div>
        </Card>

        {/* ═══════════════════════════════════════════════════
            SECTION — Talent Tree Path & Constraints
        ═══════════════════════════════════════════════════ */}
        {(() => {
          const heroTree = HERO_TALENT_TREES[hero];
          const rows = [1,2,3,4,5,6,7];
          const CAT_CLR:  Record<string,string> = { core:'#60a5fa', st:'#4ade80', aoe:'#f97316', gateway:'#f59e0b' };
          const CAT_BG:   Record<string,string> = { core:'#0c1a2e', st:'#0f2a1a', aoe:'#1f1000', gateway:'#2a1f08' };
          const CAT_LBL:  Record<string,string> = { core:'CORE', st:'ST', aoe:'AoE', gateway:'GATEWAY' };
          const heroClrL  = hero === 'sentinel' ? C.sentClr : C.packClr;
          const heroBgL   = hero === 'sentinel' ? C.sentBg  : C.packBg;
          const heroBdrL  = hero === 'sentinel' ? C.sentBdr : C.packBdr;

          // Point totals for the selected build
          const specNodes = SURVIVAL_SPEC_TREE.filter(n =>
            hero === 'sentinel' ? n.inSTBuild : n.inSTBuild  // default to ST build display
          );
          const stPts  = SURVIVAL_SPEC_TREE.filter(n => n.inSTBuild).reduce((s,n) => s+n.pointCost, 0);
          const aoePts = SURVIVAL_SPEC_TREE.filter(n => n.inAoEBuild).reduce((s,n) => s+n.pointCost, 0);
          const heroPts = heroTree.length; // all 13 hero nodes, 1pt each
          const gatewayPts = SURVIVAL_SPEC_TREE.filter(n => n.isGateway && n.inAoEBuild).reduce((s,n) => s+n.pointCost, 0);

          return (
            <Card span style={{ marginBottom:20 }}>
              <Lbl>🌲 Spec Talent Tree — Path, Gates & Forced Picks</Lbl>
              <p style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13, color:C.textDim,
                marginTop:0, marginBottom:14, lineHeight:1.6 }}>
                Blizzard's talent tree enforces two constraints: <strong style={{color:C.textSec}}>row gates</strong> (you must spend N
                points in earlier rows to unlock deeper nodes) and <strong style={{color:C.textSec}}>prerequisite links</strong> (some talents
                require a specific prior node). This means certain <strong style={{color:'#f59e0b'}}>gateway talents</strong> must be taken
                not for their own value, but to open the path to better nodes.
              </p>

              {/* ── Budget summary ──────────────────────────── */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:18 }}>
                {[
                  { label:"ST Build Total", val:`${stPts} pts`, sub:"spec tree (DPS nodes)", clr:C.sentClr },
                  { label:"AoE Build Total", val:`${aoePts} pts`, clr:'#f97316',
                    sub:`incl. ${gatewayPts} gateway pts` },
                  { label:"Hero Talent Tree", val:`${heroPts} pts`, clr: heroClrL,
                    sub:"separate budget · all 13 nodes" },
                  { label:"Full 30-pt Tree", val:"~30 pts", clr:C.textMid,
                    sub:"rem. ~11 pts = utility + class tree" },
                ].map(s => (
                  <div key={s.label} style={{ background:C.surface2, borderRadius:8,
                    padding:"12px 14px", border:`1px solid ${C.border}`, textAlign:"center" }}>
                    <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:7, color:C.textDim,
                      letterSpacing:1.5, marginBottom:6 }}>{s.label}</div>
                    <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:18,
                      color:s.clr, marginBottom:4 }}>{s.val}</div>
                    <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:11, color:C.textDim }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* ── Row-by-row spec tree ─────────────────────── */}
              <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:8, letterSpacing:2,
                color:C.textDim, marginBottom:10 }}>SPEC TALENT TREE — ROW BY ROW</div>
              <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:20 }}>
                {rows.map(row => {
                  const nodes = SURVIVAL_SPEC_TREE.filter(n => n.row === row);
                  const gate  = ROW_GATES[row];
                  return (
                    <div key={row} style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                      {/* Row label */}
                      <div style={{ width:72, flexShrink:0, paddingTop:10 }}>
                        <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:7,
                          color:C.textDim, letterSpacing:1 }}>ROW {row}</div>
                        <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:9,
                          color: gate === 0 ? C.green : C.textDim, marginTop:2 }}>
                          {gate === 0 ? 'FREE' : `≥${gate}pt`}
                        </div>
                      </div>
                      {/* Talent nodes */}
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6, flex:1 }}>
                        {nodes.map(node => {
                          const clr = CAT_CLR[node.dpsCategory];
                          const bg  = CAT_BG[node.dpsCategory];
                          const hasNote = node.isGateway || node.isApex || (node.pointCost === 2 && node.dpsCategory !== 'gateway');
                          return (
                            <div key={node.key} style={{
                              borderRadius:8, padding:"8px 12px",
                              background: node.isGateway ? '#1c1505' : bg,
                              border:`1px solid ${node.isGateway ? '#f59e0b66' : clr+'44'}`,
                              minWidth:160, maxWidth:260, flex:"1 1 160px",
                            }}>
                              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                                <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13,
                                  fontWeight:700, color:clr }}>
                                  {node.label}
                                </span>
                                <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:9,
                                  color: node.pointCost === 2 ? '#fbbf24' : C.textDim,
                                  background: node.pointCost === 2 ? '#2a1f08' : C.surface3,
                                  borderRadius:3, padding:"1px 5px",
                                  fontWeight: node.pointCost === 2 ? 700 : 400 }}>
                                  {node.pointCost}pt
                                </span>
                                <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:7,
                                  color:clr, background:bg, border:`1px solid ${clr}44`,
                                  borderRadius:3, padding:"1px 5px", letterSpacing:1 }}>
                                  {node.isApex ? 'APEX' : CAT_LBL[node.dpsCategory]}
                                </span>
                              </div>
                              {node.prerequisites.length > 0 && (
                                <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:10,
                                  color:C.textDim, marginBottom:3 }}>
                                  🔗 requires:{" "}
                                  {node.prerequisites.map(p => {
                                    const pn = SURVIVAL_SPEC_TREE.find(x => x.key === p);
                                    return pn?.label ?? p;
                                  }).join(' + ')}
                                </div>
                              )}
                              {/* ST / AoE build membership */}
                              <div style={{ display:"flex", gap:4, marginBottom: hasNote ? 5 : 0 }}>
                                {node.inSTBuild  && <span style={{ fontSize:9, color:C.green,  background:C.greenBg, borderRadius:3, padding:"0 5px" }}>✓ ST</span>}
                                {node.inAoEBuild && <span style={{ fontSize:9, color:'#f97316', background:'#1f1000', borderRadius:3, padding:"0 5px" }}>✓ AoE</span>}
                                {!node.inSTBuild && !node.inAoEBuild && <span style={{ fontSize:9, color:C.textDim }}>situational</span>}
                              </div>
                              {hasNote && node.gatewayNote && (
                                <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:10,
                                  color: node.isGateway ? '#f59e0b' : '#60a5fa',
                                  lineHeight:1.4,
                                  borderTop:`1px solid ${C.borderSub}`, paddingTop:4, marginTop:4 }}>
                                  {node.isGateway ? '⚠ ' : 'ℹ '}{node.gatewayNote}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Hero talent tree path ────────────────────── */}
              <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:8, letterSpacing:2,
                color: heroClrL, marginBottom:10 }}>
                {hero === 'sentinel' ? '🌙 SENTINEL' : '🐺 PACK LEADER'} — HERO TALENT TREE (13 pts · WoWHead-verified)
              </div>
              {/* 4-row × 4-col grid matching actual WoWHead tree layout */}
              <div style={{
                display:"grid", gridTemplateColumns:"repeat(4, 1fr)",
                gridTemplateRows:"repeat(4, auto)", gap:8, marginBottom:14
              }}>
                {heroTree.map((node) => {
                  const isCapstone = node.row === 4;
                  return (
                    <div key={node.key} style={{
                      gridColumn: node.col + 1,
                      gridRow: node.row,
                      borderRadius:8, padding:"10px 12px",
                      background: isCapstone ? heroBgL : C.surface2,
                      border:`1px solid ${isCapstone ? heroClrL : heroBdrL}`,
                    }}>
                      <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:7,
                        color: isCapstone ? heroClrL : C.textDim, letterSpacing:1.5, marginBottom:3 }}>
                        {isCapstone ? 'CAPSTONE' : `ROW ${node.row}`} · 1pt
                      </div>
                      <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13,
                        fontWeight:700, color:heroClrL, marginBottom:4 }}>{node.label}</div>
                      <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:11,
                        color:C.textMid, lineHeight:1.4 }}>{node.desc}</div>
                    </div>
                  );
                })}
              </div>

              {/* ── Gateway talent callout ───────────────────── */}
              <div style={{ background:'#1c1505', border:'1px solid #f59e0b55',
                borderRadius:10, padding:"12px 16px" }}>
                <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:8, color:'#f59e0b',
                  letterSpacing:2, marginBottom:8 }}>⚠ GATEWAY / FORCED PICKS EXPLAINED</div>
                <p style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13, color:'#fbbf24',
                  margin:"0 0 8px", lineHeight:1.5 }}>
                  Some talents in the AoE path exist primarily as path gates — their standalone DPS value
                  is lower than what you'd choose if points were unrestricted, but the tree path forces
                  them to reach higher-value nodes.
                </p>
                {SURVIVAL_SPEC_TREE.filter(n => n.isGateway).map(node => (
                  <div key={node.key} style={{ display:"flex", gap:10, padding:"8px 0",
                    borderTop:`1px solid ${C.borderSub}` }}>
                    <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13,
                      fontWeight:700, color:'#f59e0b', minWidth:140 }}>{node.label}</span>
                    <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:12,
                      color:C.textMid, lineHeight:1.5 }}>{node.gatewayNote}</span>
                  </div>
                ))}
                <div style={{ marginTop:10, fontFamily:"'Rajdhani',sans-serif", fontSize:12,
                  color:C.textDim, borderTop:`1px solid ${C.borderSub}`, paddingTop:8 }}>
                  The DPS delta table on the right accounts for gateway picks — their removal cost
                  reflects both their own value <em>and</em> the fact that removing them collapses
                  the entire downstream path.
                </div>
              </div>
            </Card>
          );
        })()}

        {/* ═══════════════════════════════════════════════════
            SECTION — Talent Delta Table
        ═══════════════════════════════════════════════════ */}
        <Card span style={{ marginBottom:20 }}>
          <Lbl>🧮 Talent DPS Delta — Our Math vs Community Rankings</Lbl>
          <p style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13, color:C.textDim,
            marginTop:0, marginBottom:6, lineHeight:1.6 }}>
            DPS impact of each talent in the optimal budget-constrained build (8 optional spec pts · 3 hero pts).
            <span style={{ color:C.green, marginLeft:10 }}>✓ Agreement</span>
            <span style={{ color:"#f59e0b", marginLeft:10 }}>⚡ We differ</span> from mainstream guides.
            Talents <em>not in the current build</em> show potential gain if a swap were made.
          </p>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse",
              fontFamily:"'Rajdhani',sans-serif", fontSize:13 }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                  {["Talent","Pts","In Build","DPS Impact","% Impact","Community","Our Rank","Reasoning"].map(h => (
                    <th key={h} style={{ textAlign:"left", padding:"7px 10px",
                      fontFamily:"'Orbitron',sans-serif", fontSize:9, letterSpacing:1,
                      color:C.textDim, fontWeight:400 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {theory.talentDeltas.map((t, i) => {
                  const differs = t.communityRanks !== t.ourRanks;
                  const isLoss = t.inBuild && t.dpsDelta > 0;
                  const isGain = !t.inBuild && t.dpsDelta < 0;
                  return (
                    <tr key={t.key} style={{
                      borderBottom:`1px solid ${C.borderSub}`,
                      background: differs
                        ? "rgba(245,158,11,.05)"
                        : i%2===0 ? "transparent" : "rgba(255,255,255,.015)",
                    }}>
                      <td style={{ padding:"7px 10px", color:differs?"#fbbf24":C.textSec, fontWeight:600 }}>
                        {differs && <span style={{ marginRight:6 }}>⚡</span>}
                        {t.label}
                      </td>
                      <td style={{ padding:"7px 10px" }}>
                        <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11,
                          color: t.pointCost === 2 ? "#fbbf24" : C.textMid,
                          fontWeight: t.pointCost === 2 ? 700 : 400 }}>
                          {t.pointCost}pt
                        </span>
                      </td>
                      <td style={{ padding:"7px 10px" }}>
                        <span style={{ fontSize:12, color: t.inBuild ? C.green : C.textDim }}>
                          {t.inBuild ? "✓ Yes" : "✗ No"}
                        </span>
                      </td>
                      <td style={{ padding:"7px 10px" }}>
                        {isLoss ? (
                          <span style={{ color:C.red, fontFamily:"'IBM Plex Mono',monospace", fontSize:12 }}>
                            −{t.dpsDelta.toLocaleString()} DPS
                          </span>
                        ) : isGain ? (
                          <span style={{ color:C.green, fontFamily:"'IBM Plex Mono',monospace", fontSize:12 }}>
                            +{Math.abs(t.dpsDelta).toLocaleString()} DPS*
                          </span>
                        ) : (
                          <span style={{ color:C.textDim, fontSize:12 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding:"7px 10px", color: isLoss ? C.red : isGain ? C.green : C.textDim }}>
                        {isLoss ? `-${t.pctIncrease.toFixed(2)}%` : isGain ? `+${Math.abs(t.pctIncrease).toFixed(2)}%*` : "—"}
                      </td>
                      <td style={{ padding:"7px 10px" }}>
                        <span style={{ color:t.communityRanks?C.green:C.textDim, fontSize:12 }}>
                          {t.communityRanks ? "✓ Ranked" : "✗ Skip"}
                        </span>
                      </td>
                      <td style={{ padding:"7px 10px" }}>
                        <span style={{ color:C.green, fontSize:12 }}>✓ Core</span>
                      </td>
                      <td style={{ padding:"7px 10px", color:C.textDim, fontSize:11,
                        maxWidth:280 }}>{t.reasoning}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:11, color:C.textDim, marginTop:8 }}>
            * Gain shown for talents not in current build. Requires freeing points from another talent (8pt optional budget). Not freely addable.
          </p>
        </Card>

        {/* ═══════════════════════════════════════════════════
            SECTION — vs Community
        ═══════════════════════════════════════════════════ */}
        <Card span style={{ marginBottom:20 }}>
          <Lbl>🆚 Our Build vs Community Rankings — Where We Differ</Lbl>
          <div style={{ marginBottom:18 }}>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:9, color:C.green,
              letterSpacing:1, marginBottom:10 }}>✓ AGREEMENTS WITH POPULAR GUIDES</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {theory.vsCommunity.agreements.map((a, i) => (
                <span key={i} style={{ background:C.greenBg, color:C.green,
                  border:C.greenBdr, borderRadius:8, padding:"5px 10px",
                  fontFamily:"'Rajdhani',sans-serif", fontSize:12,
                  lineHeight:1.4, maxWidth:320 }}>
                  ✓ {a}
                </span>
              ))}
            </div>
          </div>
          <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:9, color:"#f59e0b",
            letterSpacing:1, marginBottom:12 }}>⚡ KEY DIFFERENCES FROM MAINSTREAM GUIDES</div>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {theory.vsCommunity.differences.map((d, i) => (
              <div key={i} style={{ background:C.surface2, borderRadius:10,
                padding:16, border:`1px solid rgba(245,158,11,.2)` }}>
                <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:10,
                  color:"#fbbf24", letterSpacing:1, marginBottom:10 }}>{d.topic}</div>
                <div className="g-2col" style={{ display:"grid",
                  gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:10 }}>
                  <div>
                    <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:8,
                      color:C.textDim, letterSpacing:1, marginBottom:5 }}>COMMUNITY VIEW</div>
                    <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13,
                      color:C.textMid, lineHeight:1.6 }}>{d.communityView}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:8,
                      color:heroClr, letterSpacing:1, marginBottom:5 }}>OUR ANALYSIS</div>
                    <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13,
                      color:C.textSec, lineHeight:1.6 }}>{d.ourView}</div>
                  </div>
                </div>
                <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11,
                  color:C.goldLight, background:C.goldBg, borderRadius:5,
                  padding:"4px 10px", display:"inline-block" }}>
                  DPS delta: {d.delta}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* ═══════════════════════════════════════════════════
            SECTION — SimC Live APL
        ═══════════════════════════════════════════════════ */}
        <Card span>
          <Lbl>🔄 SimC Live Action Priority List</Lbl>

          {simcLoading ? (
            <div style={{ display:"flex", alignItems:"center", gap:10, color:C.textDim }}>
              <span style={{ width:14, height:14, border:"2px solid #2e3a50",
                borderTopColor:"#38bdf8", borderRadius:"50%", display:"inline-block",
                animation:"spin .8s linear infinite" }} />
              <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13 }}>
                Loading cached SimC data…
              </span>
            </div>
          ) : simcData?.apl?.actionLists ? (
            <>
              <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
                <span style={{ background:C.sentBg, color:C.sentClr,
                  border:`1px solid rgba(56,189,248,.4)`, borderRadius:6,
                  padding:"3px 10px", fontFamily:"'Rajdhani',sans-serif", fontSize:12 }}>
                  SHA: {simcData.sha?.slice(0,7) || "—"}
                </span>
                <span style={{ background:C.surface2, color:C.textMid,
                  border:`1px solid ${C.border}`, borderRadius:6,
                  padding:"3px 10px", fontFamily:"'Rajdhani',sans-serif", fontSize:12 }}>
                  Branch: midnight
                </span>
                <span style={{ background:C.greenBg, color:C.green,
                  border:C.greenBdr, borderRadius:6,
                  padding:"3px 10px", fontFamily:"'Rajdhani',sans-serif", fontSize:12 }}>
                  {simcData.fetchedAt
                    ? new Date(simcData.fetchedAt).toLocaleString()
                    : "Cached"}
                </span>
                <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:12,
                  color:C.textDim, alignSelf:"center" }}>
                  Use the <strong style={{ color:C.sentClr }}>⚔ Simulator</strong> to force-refresh via the SYNC SIMC button.
                </span>
              </div>
              <div className="g-2col" style={{ display:"grid",
                gridTemplateColumns:"1fr 1fr", gap:16 }}>
                {[
                  { key:"sentst",    label:"Sentinel ST",      color:C.sentClr },
                  { key:"sentcleave",label:"Sentinel Cleave",  color:C.sentClr },
                  { key:"plst",      label:"Pack Leader ST",   color:C.packClr },
                  { key:"plcleave",  label:"Pack Leader Cleave",color:C.packClr },
                ].map(({ key, label, color }) => {
                  const actions = simcData.apl.actionLists[key];
                  if (!actions?.length) return null;
                  return (
                    <div key={key} style={{ background:C.surface2, borderRadius:10,
                      padding:14, border:`1px solid ${C.border}` }}>
                      <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:9,
                        letterSpacing:2, color, marginBottom:10,
                        textTransform:"uppercase" }}>{label}</div>
                      <div style={{ maxHeight:220, overflowY:"auto" }}>
                        {actions.slice(0,15).map((action, i) => {
                          const parts = action.split("#");
                          const spell = parts[0].split(",")[0].trim();
                          return (
                            <div key={i} style={{ fontFamily:"'IBM Plex Mono',monospace",
                              fontSize:11, color:C.textMid, padding:"3px 0",
                              borderBottom:`1px solid ${C.borderSub}` }}>
                              <span style={{ color:C.goldLight }}>{i+1}.</span>{" "}
                              <span style={{ color:C.textSec }}>{spell}</span>
                              {parts[1] && (
                                <span style={{ color:C.textDim, marginLeft:6, fontSize:9 }}>
                                  // {parts[1].trim()}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13, color:C.textMid }}>
              <p>No cached SimC data found. Go to the{" "}
                <strong style={{ color:C.sentClr }}>⚔ Simulator</strong> page and click
                <strong style={{ color:C.sentClr }}> SYNC SIMC</strong> to pull the latest
                APL from the SimulationCraft GitHub midnight branch.
              </p>
            </div>
          )}
        </Card>
      </main>

      <footer style={{ textAlign:"center", padding:"24px 28px",
        borderTop:`1px solid ${C.borderSub}` }}>
        <p style={{ fontFamily:"'Orbitron',sans-serif", fontSize:8, letterSpacing:3,
          color:C.textDim, margin:0 }}>
          SURVIVAL HUNTER ROTATION GUIDE · MIDNIGHT 12.0 PRE-SEASON 1
        </p>
        <p style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:12,
          color:C.textDim, marginTop:6 }}>
          All DPS values derived from first-principles theorycrafting. Not affiliated with Blizzard Entertainment.
        </p>
      </footer>
    </div>
  );
}
