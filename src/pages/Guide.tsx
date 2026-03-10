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
import HeroTalentTree from "@/components/HeroTalentTree";
import { BlizzardTalentTree } from "@/components/BlizzardTalentTree";
import survivalIconImg from "@/assets/survival-icon.png";
import talentOptimizerBg from "@/assets/talent-optimizer-bg.png";

const C = {
  pageBg:"#d4dae2", surface:"#1c2333", surface2:"#242d3f", surface3:"#2c3750",
  border:"#2e3a50", borderSub:"#1a2236",
  textPri:"#f1f5f9", textSec:"#cbd5e1", textMid:"#94a3b8", textDim:"#5a6a82",
  gold:"#d97706", goldLight:"#fbbf24", goldBg:"#2a1f08",
  sentBg:"#0c1e35", sentBdr:"#1a3a5c", sentClr:"#38bdf8",
  packBg:"#1a0e2e", packBdr:"#3b1a5c", packClr:"#c084fc",
  green:"#4ade80", greenBg:"#0f2a1a", greenBdr:"rgba(74,222,128,.3)",
  red:"#f87171",
};

const NAV_LINKS = [
  { to:"/",                  label:"⚔ Simulator" },
  { to:"/gear",              label:"⚗ Gear"      },
  { to:"/guide",             label:"📖 Guide"     },
  { to:"/talent-optimizer",  label:"🧬 Talent Optimizer" },
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
            SECTION — Talent Tree (WoWHead-style visual)
        ═══════════════════════════════════════════════════ */}
        {(() => {
          const heroTree = HERO_TALENT_TREES[hero];
          const CAT_CLR: Record<string,string> = { core:'#60a5fa', st:'#4ade80', aoe:'#f97316', gateway:'#f59e0b' };
          const CAT_BG:  Record<string,string> = { core:'#0c1a2e', st:'#0f2a1a', aoe:'#1f1000', gateway:'#2a1f08' };
          const CAT_LBL: Record<string,string> = { core:'CORE', st:'ST', aoe:'AoE', gateway:'GATEWAY' };
          const heroClrL = hero === 'sentinel' ? C.sentClr : C.packClr;
          const heroBgL  = hero === 'sentinel' ? C.sentBg  : C.packBg;
          const heroBdrL = hero === 'sentinel' ? C.sentBdr : C.packBdr;

          const stPts  = SURVIVAL_SPEC_TREE.filter(n => n.inSTBuild).reduce((s,n) => s+n.pointCost, 0);
          const aoePts = SURVIVAL_SPEC_TREE.filter(n => n.inAoEBuild).reduce((s,n) => s+n.pointCost, 0);
          const heroPts = heroTree.length;
          const gatewayPts = SURVIVAL_SPEC_TREE.filter(n => n.isGateway && n.inAoEBuild).reduce((s,n) => s+n.pointCost, 0);

          // ── Spec tree grid config ───────────────────────
          const SPEC_COLS = 7;  // cols 0-6
          const SPEC_ROWS = 11; // rows 1-11
          const NODE_SIZE = 48;
          const COL_GAP = 14;
          const ROW_GAP = 12;
          const gridW = SPEC_COLS * NODE_SIZE + (SPEC_COLS - 1) * COL_GAP;
          const gridH = SPEC_ROWS * NODE_SIZE + (SPEC_ROWS - 1) * ROW_GAP;

          const nodePos = (row: number, col: number) => ({
            x: col * (NODE_SIZE + COL_GAP) + NODE_SIZE / 2,
            y: (row - 1) * (NODE_SIZE + ROW_GAP) + NODE_SIZE / 2,
          });

          // ── Hero tree grid config ───────────────────────
          const HERO_COLS = 4;
          const HERO_ROWS = 4;
          const HERO_NODE = 52;
          const HERO_COL_GAP = 20;
          const HERO_ROW_GAP = 16;
          const heroGridW = HERO_COLS * HERO_NODE + (HERO_COLS - 1) * HERO_COL_GAP;
          const heroGridH = HERO_ROWS * HERO_NODE + (HERO_ROWS - 1) * HERO_ROW_GAP;

          const heroNodePos = (row: number, col: number) => ({
            x: col * (HERO_NODE + HERO_COL_GAP) + HERO_NODE / 2,
            y: (row - 1) * (HERO_NODE + HERO_ROW_GAP) + HERO_NODE / 2,
          });

          // Deduplicate hero choice nodes (show only first of each position)
          const heroNodesDeduped = heroTree.filter((n, i, arr) => {
            if (!n.isChoice) return true;
            return arr.findIndex(x => x.row === n.row && x.col === n.col) === i;
          });

          // Short labels for compact nodes
          const shortLabel = (label: string) => {
            const map: Record<string, string> = {
              'Kill Command': 'KC', 'Wildfire Bomb': 'WFB', 'Raptor Strike': 'RS',
              'Guerrilla Tactics': 'GT', 'Tip of the Spear': 'TotS', 'Lunge': 'Lunge',
              'Boomstick': 'Boom', 'Strike as One': 'SaO', 'Flamebreak': 'FB',
              'Bloodseeker': 'BS', 'Quick Reload': 'QR', "Flanker's Advantage": 'FA',
              'Two Against Many': 'TAM', 'Mongoose Fury': 'MF', 'Wildfire Shells': 'WFS',
              'Shellshock': 'SS', 'Wallop': 'Wall', 'Bonding': 'Bond',
              'Sweeping Spear': 'SwSp', 'Blackrock Munitions': 'BRM', 'Takedown': 'TD',
              'Killer Companion': 'KComp', 'Twin Fangs': 'TF', 'Savagery': 'Sav',
              'Wildfire Infusion': 'WFI', 'Flanked': 'Flnk', 'Lethal Calibration': 'LC',
              'Primal Surge': 'PS', 'Raptor Swipe': 'RSwp',
            };
            return map[label] || label.split(' ').map(w => w[0]).join('');
          };

          return (
            <Card span style={{ marginBottom:20 }}>
              <Lbl>🌲 Talent Tree — {isSent ? 'Sentinel' : 'Pack Leader'}</Lbl>

              {/* ── Budget summary ──────────────────────────── */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:24 }}>
                {[
                  { label:"ST Build", val:`${stPts} pts`, sub:"spec DPS nodes", clr:C.sentClr },
                  { label:"AoE Build", val:`${aoePts} pts`, clr:'#f97316', sub:`incl. ${gatewayPts} gateway` },
                  { label:"Hero Tree", val:`${heroPts} pts`, clr: heroClrL, sub:"all nodes · separate budget" },
                  { label:"Total Tree", val:"~30 pts", clr:C.textMid, sub:"~11 pts for utility/class" },
                ].map(s => (
                  <div key={s.label} style={{ background:C.surface2, borderRadius:8,
                    padding:"10px 12px", border:`1px solid ${C.border}`, textAlign:"center" }}>
                    <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:7, color:C.textDim,
                      letterSpacing:1.5, marginBottom:4 }}>{s.label}</div>
                    <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:16,
                      color:s.clr, marginBottom:2 }}>{s.val}</div>
                    <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:10, color:C.textDim }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* ── Legend ──────────────────────────────────── */}
              <div style={{ display:"flex", gap:14, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
                {[
                  { clr:'#60a5fa', label:'Core' }, { clr:'#4ade80', label:'ST' },
                  { clr:'#f97316', label:'AoE' }, { clr:'#f59e0b', label:'Gateway' },
                ].map(l => (
                  <div key={l.label} style={{ display:"flex", alignItems:"center", gap:5 }}>
                    <div style={{ width:10, height:10, borderRadius:"50%", background:l.clr, border:`2px solid ${l.clr}` }} />
                    <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:11, color:C.textMid }}>{l.label}</span>
                  </div>
                ))}
                <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <div style={{ width:10, height:10, borderRadius:"50%", border:"2px dashed #64748b" }} />
                  <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:11, color:C.textMid }}>2pt node</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:5, marginLeft:8 }}>
                  <div style={{ width:12, height:12, transform:"rotate(45deg)", border:"2px solid #fbbf24", background:"#2a1f08" }} />
                  <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:11, color:C.textMid }}>Choice node</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:5, marginLeft:8 }}>
                  <div style={{ width:14, height:14, borderRadius:"50%", background:"linear-gradient(135deg,#fbbf24,#f97316)", border:"2px solid #fbbf24" }} />
                  <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:11, color:C.textMid }}>Apex</span>
                </div>
              </div>

              {/* ═══ SIDE-BY-SIDE LAYOUT: Spec + Hero ═══ */}
              <div style={{ display:"flex", gap:28, alignItems:"flex-start", flexWrap:"wrap" }}>

                {/* ── LEFT: SPEC TALENT TREE ── */}
                <div style={{ flex:"1 1 auto", minWidth:gridW + 20 }}>
                  <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:9, letterSpacing:2.5,
                    color:C.textSec, marginBottom:14, display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ color:'#60a5fa' }}>◆</span> SPECIALIZATION TREE
                    <div style={{ flex:1, height:1, background:C.border }} />
                  </div>

                  <div style={{ position:"relative", width:gridW, height:gridH, margin:"0 auto",
                    background:`linear-gradient(180deg, ${C.surface2} 0%, ${C.surface} 100%)`,
                    borderRadius:12, border:`1px solid ${C.border}`, padding:0, overflow:"visible" }}>

                    {/* SVG prerequisite lines */}
                    <svg style={{ position:"absolute", top:0, left:0, width:gridW, height:gridH,
                      pointerEvents:"none", zIndex:1 }}>
                      <defs>
                        <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.5" />
                          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.15" />
                        </linearGradient>
                      </defs>
                      {SURVIVAL_SPEC_TREE.map(node =>
                        node.prerequisites.map(prereq => {
                          const parent = SURVIVAL_SPEC_TREE.find(n => n.key === prereq);
                          if (!parent) return null;
                          const from = nodePos(parent.row, parent.col);
                          const to   = nodePos(node.row, node.col);
                          return (
                            <line key={`${prereq}-${node.key}`}
                              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                              stroke="url(#lineGrad)" strokeWidth={1.5}
                              strokeDasharray={node.isGateway ? "4,3" : "none"}
                              opacity={0.7} />
                          );
                        })
                      )}
                    </svg>

                    {/* Nodes */}
                    {SURVIVAL_SPEC_TREE.map(node => {
                      const pos = nodePos(node.row, node.col);
                      const clr = CAT_CLR[node.dpsCategory];
                      const isApex = node.isApex;
                      const isMultiPt = node.pointCost >= 2;
                      const isChoice = node.gatewayNote?.startsWith('Choice node');
                      const size = isApex ? 56 : NODE_SIZE;
                      const inBuild = node.inSTBuild;

                      return (
                        <div key={node.key} title={`${node.label} (${node.pointCost}pt) — ${CAT_LBL[node.dpsCategory]}${node.gatewayNote ? '\n' + node.gatewayNote : ''}`}
                          style={{
                            position:"absolute", zIndex:3,
                            left: pos.x - size/2, top: pos.y - size/2,
                            width:size, height:size,
                            display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                            cursor:"default",
                            transition:"transform .15s, box-shadow .15s",
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.15)"; (e.currentTarget as HTMLElement).style.zIndex = "10"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; (e.currentTarget as HTMLElement).style.zIndex = "3"; }}
                        >
                          <div style={{
                            width: isApex ? 46 : isMultiPt ? 40 : 36,
                            height: isApex ? 46 : isMultiPt ? 40 : 36,
                            borderRadius: isChoice ? 4 : "50%",
                            transform: isChoice ? "rotate(45deg)" : "none",
                            background: isApex
                              ? "linear-gradient(135deg,#2a1f08,#1c1505)"
                              : inBuild
                                ? `radial-gradient(circle at 30% 30%, ${clr}33, ${CAT_BG[node.dpsCategory]})`
                                : C.surface3,
                            border: `2px solid ${inBuild ? clr : '#3e4a5e'}`,
                            boxShadow: inBuild
                              ? `0 0 ${isApex ? 16 : 10}px ${clr}44, inset 0 0 8px ${clr}22`
                              : 'none',
                            display:"flex", alignItems:"center", justifyContent:"center",
                          }}>
                            <span style={{
                              fontFamily:"'Orbitron',sans-serif",
                              fontSize: isApex ? 10 : isMultiPt ? 9 : 8,
                              fontWeight:700,
                              color: inBuild ? clr : '#5a6a82',
                              letterSpacing: 0.5,
                              transform: isChoice ? "rotate(-45deg)" : "none",
                              textAlign:"center", lineHeight:1.1,
                            }}>
                              {shortLabel(node.label)}
                            </span>
                          </div>

                          <div style={{
                            position:"absolute", bottom: isApex ? -14 : -12,
                            fontFamily:"'Rajdhani',sans-serif", fontSize:8, fontWeight:600,
                            color: inBuild ? C.textMid : '#3e4a5e',
                            whiteSpace:"nowrap", textAlign:"center",
                            maxWidth:60, overflow:"hidden", textOverflow:"ellipsis",
                          }}>
                            {node.label}
                          </div>

                          {isMultiPt && (
                            <div style={{
                              position:"absolute", top:-3, right:-3,
                              width:16, height:16, borderRadius:"50%",
                              background: isApex ? '#f59e0b' : '#fbbf24',
                              color:"#000", fontFamily:"'Orbitron',sans-serif",
                              fontSize:8, fontWeight:900,
                              display:"flex", alignItems:"center", justifyContent:"center",
                              border:"1.5px solid #000",
                            }}>
                              {node.pointCost}
                            </div>
                          )}

                          <div style={{ position:"absolute", bottom: isApex ? -22 : -20,
                            display:"flex", gap:3 }}>
                            {node.inSTBuild && <div style={{ width:5, height:5, borderRadius:"50%", background:C.green }} />}
                            {node.inAoEBuild && <div style={{ width:5, height:5, borderRadius:"50%", background:'#f97316' }} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── RIGHT: HERO TALENT TREE ── */}
                <div style={{ flex:"0 0 auto", minWidth:heroGridW + 20 }}>
                  <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:9, letterSpacing:2.5,
                    color: heroClrL, marginBottom:14, display:"flex", alignItems:"center", gap:8 }}>
                    <span>{hero === 'sentinel' ? '🌙' : '🐺'}</span>
                    {hero === 'sentinel' ? 'SENTINEL' : 'PACK LEADER'} TREE
                    <div style={{ flex:1, height:1, background:heroBdrL }} />
                  </div>

                  <div style={{ position:"relative", width:heroGridW, height:heroGridH, margin:"0 auto",
                    background:`linear-gradient(180deg, ${heroBgL}cc 0%, ${C.surface} 100%)`,
                    borderRadius:12, border:`1px solid ${heroBdrL}`, padding:0 }}>

                    {/* SVG lines */}
                    <svg style={{ position:"absolute", top:0, left:0, width:heroGridW, height:heroGridH,
                      pointerEvents:"none", zIndex:1 }}>
                      {[0,1,2,3].map(col => {
                        const lines: any[] = [];
                        for (let r = 1; r < 4; r++) {
                          const fromNode = heroNodesDeduped.find(n => n.row === r && n.col === col);
                          const toNode   = heroNodesDeduped.find(n => n.row === r+1 && n.col === col);
                          if (fromNode && toNode) {
                            const from = heroNodePos(r, col);
                            const to   = heroNodePos(r+1, col);
                            lines.push(
                              <line key={`hero-${r}-${col}`}
                                x1={from.x} y1={from.y + HERO_NODE/2 - 4}
                                x2={to.x} y2={to.y - HERO_NODE/2 + 4}
                                stroke={heroClrL} strokeWidth={1.5} opacity={0.35} />
                            );
                          }
                        }
                        if (col === 1) {
                          const capstone = heroNodesDeduped.find(n => n.row === 4);
                          if (capstone) {
                            [0,1,2,3].forEach(srcCol => {
                              const srcNode = heroNodesDeduped.find(n => n.row === 3 && n.col === srcCol);
                              if (srcNode) {
                                const from = heroNodePos(3, srcCol);
                                const to   = heroNodePos(4, capstone.col);
                                lines.push(
                                  <line key={`hero-cap-${srcCol}`}
                                    x1={from.x} y1={from.y + HERO_NODE/2 - 4}
                                    x2={to.x} y2={to.y - HERO_NODE/2 + 4}
                                    stroke={heroClrL} strokeWidth={1.5} opacity={0.25}
                                    strokeDasharray="3,3" />
                                );
                              }
                            });
                          }
                        }
                        return lines;
                      })}
                    </svg>

                    {/* Hero nodes */}
                    {heroNodesDeduped.map(node => {
                      const pos = heroNodePos(node.row, node.col);
                      const isCapstone = node.row === 4;
                      const isChoice = node.isChoice;
                      const choicePartner = isChoice
                        ? heroTree.find(n => n.row === node.row && n.col === node.col && n.key !== node.key)
                        : null;
                      const size = isCapstone ? 58 : HERO_NODE;

                      return (
                        <div key={node.key}
                          title={`${node.label}${isChoice && choicePartner ? ' / ' + choicePartner.label : ''}${node.desc ? '\n' + node.desc : ''}`}
                          style={{
                            position:"absolute", zIndex:3,
                            left: pos.x - size/2, top: pos.y - size/2,
                            width:size, height:size,
                            display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                            cursor:"default",
                            transition:"transform .15s",
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.12)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
                        >
                          <div style={{
                            width: isCapstone ? 48 : isChoice ? 38 : 40,
                            height: isCapstone ? 48 : isChoice ? 38 : 40,
                            borderRadius: isChoice ? 6 : "50%",
                            transform: isChoice ? "rotate(45deg)" : "none",
                            background: isCapstone
                              ? `radial-gradient(circle at 30% 30%, ${heroClrL}44, ${heroBgL})`
                              : `radial-gradient(circle at 30% 30%, ${heroClrL}22, ${heroBgL})`,
                            border: `2px solid ${isCapstone ? heroClrL : heroBdrL}`,
                            boxShadow: isCapstone
                              ? `0 0 18px ${heroClrL}55, inset 0 0 10px ${heroClrL}22`
                              : `0 0 8px ${heroClrL}22`,
                            display:"flex", alignItems:"center", justifyContent:"center",
                          }}>
                            <span style={{
                              fontFamily:"'Orbitron',sans-serif",
                              fontSize: isCapstone ? 8 : 7,
                              fontWeight:700,
                              color: heroClrL,
                              transform: isChoice ? "rotate(-45deg)" : "none",
                              textAlign:"center", lineHeight:1,
                              letterSpacing:0.3,
                            }}>
                              {node.label.split(' ').map(w => w[0]).join('')}
                            </span>
                          </div>

                          <div style={{
                            position:"absolute", bottom: isCapstone ? -16 : -13,
                            fontFamily:"'Rajdhani',sans-serif", fontSize:8, fontWeight:600,
                            color: heroClrL, whiteSpace:"nowrap", textAlign:"center",
                            maxWidth:70, overflow:"hidden", textOverflow:"ellipsis",
                            opacity:0.8,
                          }}>
                            {node.label}
                          </div>

                          {isChoice && choicePartner && (
                            <div style={{
                              position:"absolute", top:-8,
                              fontFamily:"'Rajdhani',sans-serif", fontSize:7,
                              color:C.goldLight, background:C.goldBg,
                              borderRadius:3, padding:"0 4px",
                              border:"1px solid rgba(217,119,6,.4)",
                            }}>
                              ↔
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Card>
          );
        })()}

        {/* ═══════════════════════════════════════════════════
            ROW — Consumables, Rotation Priority, M+ Tips (3-col compact)
        ═══════════════════════════════════════════════════ */}
        <div className="g-3col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr",
          gap:16, marginBottom:20 }}>

          {/* Consumables */}
          <Card>
            <Lbl>🧪 Consumables</Lbl>
            {[
              { icon:"🧪", label:"Flask",         item:"Flask of the Magisters",        note:"Best Agi flask. 60-min, persists through death." },
              { icon:"⚗️", label:"Combat Potion", item:"Draught of Rampant Abandon",    note:"Use on pull. 2nd pot during Takedown burst." },
              { icon:"🗡️", label:"Weapon Oil",    item:"Thalassian Phoenix Oil",         note:"Fire proc — synergises with Flamebreak +15%." },
              { icon:"🍖", label:"Food",          item:"Silvermoon Parade (Agi)",        note:"Always Agi food. Vers is a step down." },
              { icon:"💎", label:"Meta Gem",      item:"Eversong Diamond",              note:"Agi proc. Socket in helm first." },
              { icon:"🔮", label:"Augment Rune",  item:"Crystalline Augment Rune",      note:"Use on every prog/parse attempt." },
            ].map((c, i) => (
              <div key={i} style={{ display:"flex", gap:8, marginBottom:8, alignItems:"flex-start" }}>
                <span style={{ fontSize:12, flexShrink:0, width:18, textAlign:"center" }}>{c.icon}</span>
                <div>
                  <div style={{ display:"flex", gap:6, alignItems:"baseline", marginBottom:1 }}>
                    <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:7,
                      color:C.textDim, letterSpacing:1 }}>{c.label}</span>
                    <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:12,
                      color:C.goldLight, fontWeight:600 }}>{c.item}</span>
                  </div>
                  <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:11,
                    color:C.textMid, lineHeight:1.4 }}>{c.note}</div>
                </div>
              </div>
            ))}
          </Card>

          {/* Rotation Priority */}
          <Card>
            <Lbl>🔄 Rotation Priority</Lbl>
            <div style={{ marginBottom:8, padding:"6px 10px", background:heroBg,
              border:`1px solid ${heroBdr}`, borderRadius:8,
              fontFamily:"'Rajdhani',sans-serif", fontSize:12, color:C.textSec }}>
              {isSent
                ? "Sentinel: RS → Sentinel Mark procs → Lunar Storm. Never delay KC."
                : "Pack Leader: KC first, always. Every KC = potential beast spawn."}
            </div>
            {theory.rotationNotes.map((n, i) => (
              <div key={i} style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:12,
                color:C.textSec, padding:"5px 10px", marginBottom:5,
                background:C.surface2, borderRadius:6,
                border:`1px solid ${C.border}`, lineHeight:1.4 }}>
                <span style={{ color:heroClr, marginRight:6 }}>→</span>{n}
              </div>
            ))}
          </Card>

          {/* M+ Tips */}
          <Card>
            <Lbl>🏰 Mythic+ Tips</Lbl>
            {[
              { icon:"🎯", tip:"Pull around Takedown", desc:"Chain pulls so Takedown is off CD when packs land." },
              { icon:"💣", tip:"Pool WFB charges", desc:"Never let WFB sit at 2 charges — throw immediately on pack." },
              { icon:"⚡", tip:"Lunar Storm positioning",  desc:"Position so Sentinel Mark AoE hits the full pack." },
              { icon:"🐾", tip:"Misdirect on every CD", desc:"MD tank every 30s. Macro: /cast [@focus] Misdirection." },
              { icon:"🌀", tip:"Hold Boomstick for packs", desc:"If new pack in <10s, delay for grouped targets." },
            ].map((t, i) => (
              <div key={i} style={{ display:"flex", gap:8, marginBottom:8, alignItems:"flex-start" }}>
                <span style={{ fontSize:12, flexShrink:0, width:18, textAlign:"center" }}>{t.icon}</span>
                <div>
                  <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:12,
                    color:C.goldLight, fontWeight:700, marginBottom:1 }}>{t.tip}</div>
                  <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:11,
                    color:C.textMid, lineHeight:1.4 }}>{t.desc}</div>
                </div>
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
