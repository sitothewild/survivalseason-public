// @ts-nocheck
import { useState, useMemo, useRef, useCallback } from "react";
import { NavLink } from "@/components/NavLink";
import {
  computeStatWeights,
  getOptimalTalentConfig,
  HEROIC_MIDNIGHT_276,
} from "@/lib/theorycrafting";
import {
  MIDNIGHT_TRINKETS, MIDNIGHT_ENCHANTS, MIDNIGHT_GEMS, MIDNIGHT_RINGS,
  TIER_SET_HERO_ANALYSIS, STAT_PRIORITY, ENCHANT_SLOTS,
  GEAR_TRACKS, DAWNCREST_TIERS, UPGRADE_COSTS,
  getBiSList, rankTrinkets, rankEnchantsForSlot,
} from "@/lib/gearOptimizer";
import { useBlizzardEnchants, triggerEnchantSnapshot } from "@/hooks/useBlizzardEnchants";
import { useBlizzardItemDB, triggerItemDBSync } from "@/hooks/useBlizzardItemDB";
import survivalIconImg from "@/assets/survival-icon.png";

// ── Shared colour palette (mirrors SurvivalHunterSim) ────────
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

const STAT_COLORS: Record<string,string> = {
  "Agility":"#f59e0b",
  "Critical Strike":"#f87171",
  "Haste":"#60a5fa",
  "Mastery (Spirit Bond)":"#4ade80",
  "Versatility":"#94a3b8",
};
const TRINKET_TYPE_CLR: Record<string,string> = {
  on_use:"#f59e0b", proc:"#60a5fa", equip:"#4ade80", damage_proc:"#f87171",
};
const TRINKET_TYPE_LBL: Record<string,string> = {
  on_use:"ON-USE", proc:"PROC", equip:"EQUIP", damage_proc:"DMG PROC",
};
const GRADE_CLR: Record<string,string> = {
  S:"#fbbf24", A:"#4ade80", B:"#60a5fa", C:"#94a3b8",
};

export default function Gear() {
  const [hero, setHero] = useState<"sentinel"|"packLeader">("sentinel");
  const [bisOpen, setBisOpen] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingItemDB, setSyncingItemDB] = useState(false);

  // Load enchant data from Blizzard API cache
  const { data: enchantData, refetch: refetchEnchants } = useBlizzardEnchants();
  const { data: itemDB, refetch: refetchItemDB } = useBlizzardItemDB();

  const handleSyncEnchants = useCallback(async () => {
    setSyncing(true);
    try {
      await triggerEnchantSnapshot("us");
      await refetchEnchants();
    } catch (e) {
      console.error("[Gear] Enchant sync failed:", e);
    } finally {
      setSyncing(false);
    }
  }, [refetchEnchants]);

  const handleSyncItemDB = useCallback(async () => {
    setSyncingItemDB(true);
    try {
      const result = await triggerItemDBSync("us");
      console.log("[Gear] Item DB sync result:", result);
      await refetchItemDB();
    } catch (e) {
      console.error("[Gear] Item DB sync failed:", e);
    } finally {
      setSyncingItemDB(false);
    }
  }, [refetchItemDB]);

  // BiS tooltip state — mirrors sim page hover-tooltip pattern
  const [hoveredBiS, setHoveredBiS] = useState<string | null>(null);
  const [bisTooltipPos, setBisTooltipPos] = useState({ x: 0, y: 0 });
  const bisHideTimer = useRef<number | null>(null);

  const handleBiSHover = useCallback((slot: string, e: React.MouseEvent) => {
    if (bisHideTimer.current) { window.clearTimeout(bisHideTimer.current); bisHideTimer.current = null; }
    const row = e.currentTarget as HTMLElement;
    // Only update X position from the Myth ilvl column; Y stays fixed at viewport center
    const cells = row.querySelectorAll("td");
    const mythCell = cells[3];
    const cellRect = mythCell ? mythCell.getBoundingClientRect() : row.getBoundingClientRect();
    setBisTooltipPos(prev => ({ x: cellRect.right + 8, y: prev.y || 0 }));
    setHoveredBiS(slot);
  }, []);

  const handleBiSLeave = useCallback(() => {
    bisHideTimer.current = window.setTimeout(() => setHoveredBiS(null), 160);
  }, []);

  const isSent   = hero === "sentinel";
  const heroClr  = isSent ? C.sentClr  : C.packClr;
  const heroBg   = isSent ? C.sentBg   : C.packBg;
  const heroBdr  = isSent ? C.sentBdr  : C.packBdr;
  const heroName = isSent ? "Sentinel" : "Pack Leader";
  const heroIcon = isSent ? "🦉" : "🐾";

  // Compute stat weights from the theorycrafting engine using 276 Hero-track baseline
  const { sentWeights, plWeights } = useMemo(() => {
    const tier  = { has2pc: true, has4pc: true };
    const sent  = computeStatWeights(HEROIC_MIDNIGHT_276, getOptimalTalentConfig("sentinel",   "st"), tier, "sentinel",   1);
    const pl    = computeStatWeights(HEROIC_MIDNIGHT_276, getOptimalTalentConfig("packLeader", "st"), tier, "packLeader", 1);
    return { sentWeights: sent, plWeights: pl };
  }, []);

  const activeWeights = isSent ? sentWeights : plWeights;
  const rankedTrinkets = useMemo(() => rankTrinkets(activeWeights, hero), [activeWeights, hero]);
  const bisList        = useMemo(() => getBiSList(hero), [hero]);
  const tierAnalysis   = TIER_SET_HERO_ANALYSIS[hero];
  const statPriority   = STAT_PRIORITY[hero];

  // ── Mini components ────────────────────────────────────────

  const SecTitle = ({ icon, children }: any) => (
    <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
      <span style={{ fontSize:20 }}>{icon}</span>
      <h2 style={{ fontFamily:"'Orbitron',sans-serif", fontSize:13, letterSpacing:3,
        color:heroClr, textTransform:"uppercase", margin:0, fontWeight:700 }}>
        {children}
      </h2>
      <div style={{ flex:1, height:1, background:heroBdr }} />
    </div>
  );

  const Card = ({ children, highlight=false, style={} }: any) => (
    <div style={{
      background: highlight ? heroBg : C.surface,
      border:`1px solid ${highlight ? heroBdr : C.border}`,
      borderRadius:14, padding:24, ...style,
    }}>
      {children}
    </div>
  );

  const GradeBadge = ({ grade }: { grade:string }) => (
    <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:10, fontWeight:700,
      color:"#000", background:GRADE_CLR[grade]||"#94a3b8",
      borderRadius:4, padding:"2px 6px" }}>
      {grade}
    </span>
  );

  // ── Nav bar (shared across pages) ─────────────────────────
  const NAV_LINKS = [
    { to:"/",                  label:"⚔ Simulator" },
    { to:"/gear",              label:"⚗ Gear"      },
    { to:"/guide",             label:"📖 Guide"     },
    { to:"/talent-optimizer",  label:"🧬 Talent Optimizer" },
  ];

  return (
    <div style={{ minHeight:"100vh", background:C.pageBg, color:C.textPri,
      fontFamily:"'Rajdhani','Segoe UI',sans-serif" }}>

      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;600;700;900&family=IBM+Plex+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;}
        body{margin:0;}
        .gear-nav-link{
          font-family:'Rajdhani',sans-serif; font-size:14px; font-weight:700;
          letter-spacing:1.5px; text-transform:uppercase; text-decoration:none;
          color:#64748b; padding:10px 18px; border-bottom:3px solid transparent;
          transition:color .2s, border-color .2s;
        }
        .gear-nav-link:hover{ color:#94a3b8; }
        .gear-nav-link.active{ color:#fbbf24; border-bottom-color:#d97706; }
        .trinket-card{ transition:transform .15s, box-shadow .15s; }
        .trinket-card:hover{ transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,.4); }
        @media(max-width:900px){
          .gear-3col{ grid-template-columns:1fr !important; }
          .gear-2col{ grid-template-columns:1fr !important; }
          .bis-table{ font-size:11px !important; }
        }
        @media(max-width:600px){
          .gear-header-inner{ flex-direction:column !important; align-items:flex-start !important; }
          .gear-hero-toggle{ flex-wrap:wrap; }
        }
      `}</style>

      {/* ── Site Header ─────────────────────────────────────── */}
      <header style={{ background:"linear-gradient(135deg,#0d1117,#1c2333,#0f1a2e)",
        borderBottom:`1px solid ${C.border}`, padding:"16px 28px" }}>
        <div style={{ maxWidth:1400, margin:"0 auto" }}>
          {/* Logo row */}
          <div className="gear-header-inner" style={{ display:"flex", alignItems:"center",
            justifyContent:"space-between", flexWrap:"wrap", gap:12, marginBottom:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <div style={{ width:44, height:44, borderRadius:10, overflow:"hidden",
                border:`2px solid ${C.sentBdr}`, flexShrink:0 }}>
                <img src={survivalIconImg} alt="Survival Hunter"
                  style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              </div>
              <div>
                <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:16,
                  fontWeight:700, color:C.textPri, letterSpacing:2 }}>
                  SURVIVAL HUNTER
                </div>
                <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:8,
                  letterSpacing:3, color:C.textDim, marginTop:3 }}>
                  GEAR OPTIMIZER · MIDNIGHT 12.0 · PRE-SEASON 1
                </div>
              </div>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
              <span style={{ background:C.goldBg, color:C.goldLight, border:`1px solid rgba(217,119,6,.4)`,
                borderRadius:6, padding:"3px 10px", fontSize:12, fontFamily:"'Rajdhani',sans-serif", fontWeight:700 }}>
                ★ PRE-SEASON 1
              </span>
              <span style={{ background:C.surface2, color:C.textMid, border:`1px solid ${C.border}`,
                borderRadius:6, padding:"3px 10px", fontSize:12, fontFamily:"'Rajdhani',sans-serif" }}>
                PATCH 12.0.1
              </span>
              <span style={{ background:C.greenBg, color:C.green, border:C.greenBdr,
                borderRadius:6, padding:"3px 10px", fontSize:12, fontFamily:"'Rajdhani',sans-serif", fontWeight:700 }}>
                🦉 SENTINEL META
              </span>
            </div>
          </div>

          {/* Nav bar */}
          <nav style={{ display:"flex", borderBottom:`1px solid ${C.border}`, gap:0 }}>
            {NAV_LINKS.map(({ to, label }) => (
              <NavLink key={to} to={to} className="gear-nav-link" activeClassName="active">
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* ── Page body ───────────────────────────────────────── */}
      <main style={{ maxWidth:1400, margin:"0 auto", padding:"32px 28px 64px" }}>

        {/* Hero toggle + page intro */}
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between",
          flexWrap:"wrap", gap:16, marginBottom:32 }}>
          <div>
            <h1 style={{ fontFamily:"'Orbitron',sans-serif", fontSize:22, fontWeight:900,
              color:heroClr, letterSpacing:3, margin:0, textTransform:"uppercase" }}>
              {heroIcon} {heroName} — Gear &amp; Optimizer
            </h1>
          </div>
          <div className="gear-hero-toggle" style={{ display:"flex", gap:10 }}>
            {(["sentinel","packLeader"] as const).map(h => (
              <button key={h} onClick={() => setHero(h)} style={{
                fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:14,
                letterSpacing:1, padding:"10px 22px", borderRadius:10, cursor:"pointer",
                background: hero===h ? (h==="sentinel"?C.sentBg:C.packBg) : C.surface2,
                border:`1px solid ${hero===h ? (h==="sentinel"?C.sentClr:C.packClr) : C.border}`,
                color: hero===h ? (h==="sentinel"?C.sentClr:C.packClr) : C.textMid,
                transition:"all .2s",
              }}>
                {h==="sentinel" ? "🦉 Sentinel" : "🐾 Pack Leader"}
              </button>
            ))}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════
            SECTION 0 — Track & Rank System
        ═══════════════════════════════════════════════════ */}
        <Card span style={{ marginBottom:20 }}>
          <SecTitle icon="📊">Midnight Season 1 — Track &amp; Rank System</SecTitle>
          <p style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13, color:C.textMid,
            marginTop:0, marginBottom:20, maxWidth:820 }}>
            Every piece of gear belongs to a <strong style={{ color:C.textSec }}>Track</strong> (its potential ceiling) and a{' '}
            <strong style={{ color:C.textSec }}>Rank 1–6</strong> (its current power).
            Each rank upgrade costs <strong style={{ color:C.goldLight }}>20 Dawncrests</strong> and{' '}
            <strong style={{ color:C.goldLight }}>Gold</strong>, totalling 120 Dawncrests per piece.
            Weekly cap: ~100 crests per tier. <em style={{ color:C.textDim }}>Slot discount: if you own a max-rank item in a slot,
            upgrading any alternate item for that slot to max rank costs 0 crests (Gold only).</em>
          </p>

          {/* Track table */}
          <div style={{ overflowX:"auto", marginBottom:24 }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"'Rajdhani',sans-serif", fontSize:13 }}>
              <thead>
                <tr>
                  {["Track","Rank 1 ilvl","Rank 6 ilvl","ilvl/Rank","Currency","Source"].map(h => (
                    <th key={h} style={{ textAlign:"left", padding:"8px 12px",
                      borderBottom:`1px solid ${C.border}`, color:C.textMid,
                      fontFamily:"'Orbitron',sans-serif", fontSize:9, letterSpacing:1.5,
                      textTransform:"uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {GEAR_TRACKS.map((t, i) => (
                  <tr key={t.name} style={{ background: i%2===0 ? "transparent" : C.surface2 }}>
                    <td style={{ padding:"10px 12px", fontWeight:800, color:t.color }}>{t.name}</td>
                    <td style={{ padding:"10px 12px", color:C.textSec,
                      fontFamily:"'IBM Plex Mono',monospace" }}>{t.rankMin}</td>
                    <td style={{ padding:"10px 12px", fontWeight:700, color:t.color,
                      fontFamily:"'IBM Plex Mono',monospace" }}>{t.rankMax}</td>
                    <td style={{ padding:"10px 12px", color:C.textMid,
                      fontFamily:"'IBM Plex Mono',monospace" }}>+{t.ilvlPerRank}</td>
                    <td style={{ padding:"10px 12px", color:C.goldLight }}>{t.currency}</td>
                    <td style={{ padding:"10px 12px", color:C.textSec, maxWidth:280 }}>{t.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Upgrade cost summary */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px,1fr))",
            gap:12, marginBottom:20 }}>
            {[
              { label:"Crests per piece",   val:String(UPGRADE_COSTS.crestsPerPiece), sub:"Rank 1 → Rank 6" },
              { label:"Weekly crest cap",   val:"~100", sub:"per Dawncrest tier" },
              { label:"Gear slots",         val:String(UPGRADE_COSTS.totalPieces), sub:"full character" },
              { label:"Weeks to full BiS",  val:`~${UPGRADE_COSTS.weeksToFullyUpgrade}`, sub:"without slot discounts" },
            ].map(s => (
              <div key={s.label} style={{ background:C.surface2, border:`1px solid ${C.border}`,
                borderRadius:10, padding:"14px 16px" }}>
                <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:22,
                  color:C.goldLight, fontWeight:700 }}>{s.val}</div>
                <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:12,
                  color:C.textSec, marginTop:2, fontWeight:700 }}>{s.label}</div>
                <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:11,
                  color:C.textMid, marginTop:2 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Slot discount callout */}
          <div style={{ background:C.goldBg, border:`1px solid #78350f`,
            borderRadius:10, padding:"12px 16px",
            fontFamily:"'Rajdhani',sans-serif", fontSize:13, color:C.goldLight }}>
            <strong>Slot Discount:</strong>{" "}
            {UPGRADE_COSTS.slotDiscountNote}
            {" "}This makes swapping secondary stat combos between Heroic and Mythic gear free — ideal for optimising Sentinel vs Pack Leader builds.
          </div>
        </Card>

        {/* ═══════════════════════════════════════════════════
            SECTION 1 — Stat Weights + Stat Priority
        ═══════════════════════════════════════════════════ */}
        <div className="gear-2col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr",
          gap:20, marginBottom:20 }}>

          {/* Scale factors */}
          <Card>
            <SecTitle icon="⚖">Scale Factors (Stat Weights)</SecTitle>
            <p style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13, color:C.textDim, marginTop:0, marginBottom:16 }}>
              DPS per 1 stat rating · Agility = 1.00 reference · 4pc tier active · Hero-track 276 ilvl baseline
            </p>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
              {([["🦉 Sentinel", sentWeights, C.sentClr], ["🐾 Pack Leader", plWeights, C.packClr]] as const).map(([label, w, clr]: any) => (
                <div key={label}>
                  <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:9, color:clr,
                    letterSpacing:2, marginBottom:12 }}>{label}</div>
                  {w.priority.map((p: any) => {
                    const maxSf = w.priority[0]?.sf || 1;
                    const pct   = Math.max(8, (p.sf / maxSf) * 100);
                    return (
                      <div key={p.stat} style={{ marginBottom:10 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                          <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13, fontWeight:700,
                            color: STAT_COLORS[p.stat]||C.textSec }}>{p.stat}</span>
                          <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:C.textMid }}>
                            {p.sf.toFixed(3)}
                          </span>
                        </div>
                        <div style={{ height:6, background:C.surface3, borderRadius:4 }}>
                          <div style={{ height:"100%", width:`${pct}%`, borderRadius:4,
                            background: STAT_COLORS[p.stat]||"#64748b",
                            transition:"width .5s ease" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div style={{ marginTop:16, padding:"10px 14px", background:C.surface2,
              borderLeft:`3px solid ${heroClr}`, borderRadius:"0 8px 8px 0",
              fontFamily:"'Rajdhani',sans-serif", fontSize:13, color:C.textSec }}>
              {isSent
                ? "Sentinel: Crit ≈ Mastery for ST — Moonlight Chakram + Lethal Calibration + Vulnerability + Stargazer all multiply with crit%. With 4pc, Boomstick resets push Crit above Mastery."
                : "Pack Leader: Mastery is the clear #1 secondary — Spirit Bond scales pet damage at 0.6%/mastery% across KC beasts, bears, boar, wyvern, and Stampede simultaneously."}
            </div>
          </Card>

          {/* Stat priority */}
          <Card>
            <SecTitle icon="📊">Stat Priority</SecTitle>
            {statPriority.map((s, i) => (
              <div key={s.stat} style={{ display:"flex", gap:12, marginBottom:14, alignItems:"flex-start" }}>
                <div style={{ width:26, height:26, borderRadius:7, background:heroBg,
                  border:`1px solid ${heroBdr}`, display:"flex", alignItems:"center",
                  justifyContent:"center", fontFamily:"'Orbitron',sans-serif",
                  fontSize:11, color:heroClr, flexShrink:0, fontWeight:700 }}>
                  {i+1}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:3, flexWrap:"wrap" }}>
                    <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:15, fontWeight:700,
                      color: STAT_COLORS[s.stat]||C.textSec }}>{s.stat}</span>
                    <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:8, color:C.textDim, letterSpacing:1.5 }}>
                      ST #{s.stPriority} · AoE #{s.aoePriority}
                    </span>
                  </div>
                  <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13, color:C.textDim, lineHeight:1.5 }}>
                    {s.reasoning}
                  </div>
                  {s.hardCap && (
                    <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:12,
                      color:"#fb923c", marginTop:4 }}>⚠ {s.hardCap}</div>
                  )}
                </div>
              </div>
            ))}
          </Card>
        </div>

        {/* ═══════════════════════════════════════════════════
            SECTION — BiS Gear List
        ═══════════════════════════════════════════════════ */}
        <Card style={{ marginBottom:20 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
            flexWrap:"wrap", gap:10, marginBottom:20 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <span style={{ fontSize:20 }}>⚔</span>
              <h2 style={{ fontFamily:"'Orbitron',sans-serif", fontSize:13, letterSpacing:3,
                color:heroClr, textTransform:"uppercase", margin:0, fontWeight:700 }}>
                BiS Gear List — {isSent ? "Sentinel (2H Polearm)" : "Pack Leader (Dual Wield)"} · Hero 276 → Myth 289
              </h2>
            </div>
            <button onClick={() => setBisOpen(o => !o)} style={{
              fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:13,
              background: bisOpen ? heroBg : C.surface2,
              border:`1px solid ${bisOpen ? heroBdr : C.border}`,
              color: bisOpen ? heroClr : C.textMid,
              borderRadius:8, padding:"7px 16px", cursor:"pointer" }}>
              {bisOpen ? "▲ Collapse" : "▼ Expand"}
            </button>
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom: bisOpen ? 20 : 0 }}>
            {["Head","Shoulders","Chest","Hands","Legs"].map(slot => (
              <span key={slot} style={{ fontFamily:"'Orbitron',sans-serif", fontSize:8,
                color:C.goldLight, background:C.goldBg, borderRadius:4, padding:"3px 8px",
                border:`1px solid rgba(217,119,6,.3)`, letterSpacing:1 }}>
                🏆 {slot}: Tier
              </span>
            ))}
            <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13, color:C.textDim,
              alignSelf:"center" }}>
              — Complete the 4pc before chasing off-set upgrades.
            </span>
          </div>
          {bisOpen && (
            <div style={{ overflowX:"auto" }}>
              <table className="bis-table" style={{ width:"100%", borderCollapse:"collapse",
                fontFamily:"'Rajdhani',sans-serif", fontSize:13 }}>
                <thead>
                  <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                    {["Slot","Item","Hero ilvl","Myth ilvl","Key Stats"].map(h => (
                      <th key={h} style={{ textAlign:"left", padding:"8px 12px",
                        fontFamily:"'Orbitron',sans-serif", fontSize:8, color:C.textDim,
                        letterSpacing:2, whiteSpace:"nowrap", fontWeight:700 }}>{h}</th>
                    ))}
                    <th style={{ padding:"8px 12px", fontFamily:"'Orbitron',sans-serif",
                      fontSize:8, color:C.textDim, letterSpacing:2, fontWeight:700, textAlign:"right" }}>
                      HOVER FOR DETAILS
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bisList.map((row, i) => {
                    const isTier    = ["Head","Shoulders","Chest","Hands","Legs"].includes(row.slot);
                    const isHovered = hoveredBiS === row.slot;
                    return (
                      <tr key={row.slot}
                        onMouseEnter={e => handleBiSHover(row.slot, e)}
                        onMouseLeave={handleBiSLeave}
                        style={{
                          borderBottom:`1px solid ${C.borderSub}`,
                          background: isHovered
                            ? (isTier ? "#3d2a06" : heroBg)
                            : (isTier ? C.goldBg : i%2===0 ? "transparent" : C.surface2),
                          cursor:"default",
                          transition:"background .1s",
                        }}>
                        <td style={{ padding:"8px 12px", color:heroClr,
                          fontWeight:700, whiteSpace:"nowrap" }}>{row.slot}</td>
                        <td style={{ padding:"8px 12px", color:C.textPri, fontWeight:600 }}>
                          {isTier && <span style={{ color:C.goldLight, marginRight:6 }}>🏆</span>}
                          {row.itemName}
                        </td>
                        <td style={{ padding:"8px 12px", color:"#a855f7",
                          fontFamily:"'IBM Plex Mono',monospace", fontWeight:700,
                          whiteSpace:"nowrap" }}>{row.ilvl}</td>
                        <td style={{ padding:"8px 12px", color:C.goldLight,
                          fontFamily:"'IBM Plex Mono',monospace", fontWeight:700,
                          whiteSpace:"nowrap" }}>{row.mythIlvl ?? "—"}</td>
                        <td style={{ padding:"8px 12px", color:C.goldLight,
                          whiteSpace:"nowrap" }}>{row.keyStats}</td>
                        <td style={{ padding:"8px 12px", textAlign:"right" }}>
                          <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:11,
                            color: isHovered ? heroClr : C.textDim, letterSpacing:1 }}>
                            {isHovered ? "▶ details" : "···"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ═══════════════════════════════════════════════════
            SECTION 2 — Trinket Rankings
        ═══════════════════════════════════════════════════ */}
        <Card style={{ marginBottom:20 }}>
          <SecTitle icon="💎">Trinket Rankings — {heroName} (Hero 276 / Myth 289)</SecTitle>
          <p style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13, color:C.textDim,
            marginTop:0, marginBottom:20 }}>
            DPS contribution = stat budget × uptime × scale factor. Burst-alignable on-use trinkets
            include a <strong style={{ color:C.goldLight }}>+12% effective bonus</strong> for lining
            up with Takedown / Boomstick windows.
          </p>

          {/* Top 2 — large cards */}
          <div className="gear-2col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
            {rankedTrinkets.slice(0,2).map(t => (
              <div key={t.id} className="trinket-card" style={{
                background: heroBg, border:`2px solid ${heroBdr}`,
                borderRadius:12, padding:20, position:"relative" }}>
                <div style={{ position:"absolute", top:14, right:14, display:"flex", gap:6, alignItems:"center" }}>
                  <GradeBadge grade={isSent ? t.sentinelRating : t.packLeaderRating} />
                  <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:10, color:heroClr }}>
                    #{t.rank} BiS
                  </span>
                </div>
                <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:17, fontWeight:700,
                  color:C.textPri, marginBottom:6, paddingRight:80 }}>{t.name}</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:8 }}>
                  <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:8,
                    color: TRINKET_TYPE_CLR[t.type], background:`${TRINKET_TYPE_CLR[t.type]}18`,
                    borderRadius:4, padding:"3px 7px", letterSpacing:1 }}>
                    {TRINKET_TYPE_LBL[t.type]}
                  </span>
                  {t.burstAlignable && (
                    <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:8,
                      color:C.goldLight, background:C.goldBg, borderRadius:4, padding:"3px 7px" }}>
                      ⚡ BURST ALIGN
                    </span>
                  )}
                  <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:14,
                    color:C.goldLight, fontWeight:700 }}>
                    +{t.estimatedDps.toLocaleString()} DPS
                  </span>
                </div>
                <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:12, color:C.textDim, marginBottom:8 }}>
                  {t.source} · ilvl {t.ilvl}
                </div>
                <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13, color:C.textMid, lineHeight:1.5 }}>
                  {t.notes}
                </div>
                <div style={{ display:"flex", gap:16, marginTop:12, paddingTop:10,
                  borderTop:`1px solid ${C.borderSub}` }}>
                  <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:C.sentClr }}>
                    🦉 {t.sentinelDps.toLocaleString()} DPS
                  </span>
                  <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:C.packClr }}>
                    🐾 {t.packLeaderDps.toLocaleString()} DPS
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Rest — compact grid */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px, 1fr))", gap:12 }}>
            {rankedTrinkets.slice(2).map(t => (
              <div key={t.id} className="trinket-card" style={{
                background:C.surface2, border:`1px solid ${C.border}`,
                borderRadius:10, padding:14, position:"relative" }}>
                <div style={{ position:"absolute", top:10, right:10, display:"flex", gap:5, alignItems:"center" }}>
                  <GradeBadge grade={isSent ? t.sentinelRating : t.packLeaderRating} />
                  <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:9, color:C.textDim }}>#{t.rank}</span>
                </div>
                <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:14, fontWeight:700,
                  color:C.textPri, marginBottom:4, paddingRight:55 }}>{t.name}</div>
                <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginBottom:5 }}>
                  <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:8,
                    color:TRINKET_TYPE_CLR[t.type], background:`${TRINKET_TYPE_CLR[t.type]}18`,
                    borderRadius:4, padding:"2px 5px" }}>
                    {TRINKET_TYPE_LBL[t.type]}
                  </span>
                  {t.burstAlignable && (
                    <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:8,
                      color:C.goldLight, background:C.goldBg, borderRadius:4, padding:"2px 5px" }}>
                      ⚡ ALIGN
                    </span>
                  )}
                  <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:C.goldLight }}>
                    +{t.estimatedDps.toLocaleString()} DPS
                  </span>
                </div>
                <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:11, color:C.textDim, marginBottom:4 }}>
                  {t.source} · ilvl {t.ilvl}
                </div>
                <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:12, color:C.textMid }}>
                  {t.notes}
                </div>
                <div style={{ display:"flex", gap:12, marginTop:8 }}>
                  <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:C.sentClr }}>
                    🦉 {t.sentinelDps.toLocaleString()}
                  </span>
                  <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:C.packClr }}>
                    🐾 {t.packLeaderDps.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ═══════════════════════════════════════════════════
            SECTION 3 — Enchants + Gems + Rings
        ═══════════════════════════════════════════════════ */}
        <div className="gear-3col" style={{ display:"grid",
          gridTemplateColumns:"1fr 1fr 1fr", gap:20, marginBottom:20 }}>

          {/* Enchants */}
          <Card>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
              <SecTitle icon="✦">Enchant Recommendations</SecTitle>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                {enchantData?.source === "api_cached" && enchantData.fetchedAt && (
                  <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:9, color:C.textDim }}>
                    API {new Date(enchantData.fetchedAt).toLocaleDateString()}
                  </span>
                )}
                <button onClick={handleSyncEnchants} disabled={syncing}
                  style={{ fontFamily:"'Orbitron',sans-serif", fontSize:8, letterSpacing:1,
                    color: syncing ? C.textDim : C.goldLight, background:C.goldBg,
                    border:`1px solid ${C.gold}`, borderRadius:4, padding:"3px 8px",
                    cursor: syncing ? "wait" : "pointer", opacity: syncing ? 0.6 : 1 }}>
                  {syncing ? "SYNCING…" : "⟳ SYNC API"}
                </button>
              </div>
            </div>
            {ENCHANT_SLOTS.map(slot => {
              const ranked = rankEnchantsForSlot(slot, activeWeights, hero);
              if (!ranked.length) return null;
              const best = ranked[0];
              const alt  = ranked[1];
              return (
                <div key={slot} style={{ marginBottom:16, paddingBottom:16,
                  borderBottom:`1px solid ${C.borderSub}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                    <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:8,
                      color:C.textDim, letterSpacing:2 }}>{slot.toUpperCase()}</span>
                    {best.estimatedDps > 0 && (
                      <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:C.goldLight }}>
                        +{best.estimatedDps.toLocaleString()} DPS
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:14,
                    fontWeight:700, color:C.textPri, marginBottom:4 }}>
                    {best.name}
                  </div>
                  <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:12,
                    color:C.textDim, lineHeight:1.5, marginBottom:alt ? 5 : 0 }}>
                    {best.notes}
                  </div>
                  {alt && (
                    <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:12,
                      color:C.textDim, marginTop:4 }}>
                      <span style={{ color:C.textMid }}>Alt: </span>{alt.name}
                    </div>
                  )}
                </div>
              );
            })}
          </Card>

          {/* Gems */}
          <Card>
            <SecTitle icon="💠">Gem Strategy</SecTitle>
            <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13, color:C.textDim,
              marginBottom:16, lineHeight:1.5 }}>
              Socket the <strong style={{ color:C.goldLight }}>Elusive Blasphemite unique first</strong> —
              it gives +6 of all secondaries per gem socketed, so every other gem you slot
              multiplies its value.
            </div>
            {MIDNIGHT_GEMS
              .sort((a,b) => (isSent ? a.sentinelRank : a.packLeaderRank) - (isSent ? b.sentinelRank : b.packLeaderRank))
              .map(g => (
                <div key={g.id} style={{ marginBottom:12, padding:"10px 14px",
                  background: g.isUnique ? heroBg : C.surface2,
                  border:`1px solid ${g.isUnique ? heroBdr : C.border}`,
                  borderRadius:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                    <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:14, fontWeight:700,
                      color: g.isUnique ? heroClr : C.textPri }}>
                      {g.isUnique && "⭐ "}{g.name}
                    </span>
                    <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                      {g.isUnique && (
                        <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:8,
                          color:C.goldLight, background:C.goldBg, borderRadius:4, padding:"2px 5px" }}>
                          UNIQUE
                        </span>
                      )}
                      <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:9,
                        color:heroClr }}>#{isSent ? g.sentinelRank : g.packLeaderRank}</span>
                    </div>
                  </div>
                  <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:12,
                    color:C.textDim, lineHeight:1.5 }}>
                    {g.notes}
                  </div>
                </div>
              ))}
          </Card>

          {/* Rings */}
          <Card>
            <SecTitle icon="💍">Ring Rankings</SecTitle>
            {MIDNIGHT_RINGS
              .sort((a,b) => (isSent ? a.sentinelRank : a.packLeaderRank) - (isSent ? b.sentinelRank : b.packLeaderRank))
              .map(r => {
                const rank = isSent ? r.sentinelRank : r.packLeaderRank;
                return (
                  <div key={r.id} style={{ marginBottom:14, padding:"12px 14px",
                    background: rank===1 ? heroBg : C.surface2,
                    border:`1px solid ${rank===1 ? heroBdr : C.border}`,
                    borderRadius:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:14, fontWeight:700,
                        color: rank===1 ? heroClr : C.textPri }}>
                        #{rank} {r.name}
                      </span>
                      <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11,
                        color:C.textDim }}>ilvl {r.ilvl}</span>
                    </div>
                    <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13, color:C.textMid, marginBottom:5 }}>
                      +{r.stat1Rating} {r.stat1} · +{r.stat2Rating} {r.stat2}
                    </div>
                    <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:12,
                      color:C.textDim, lineHeight:1.5 }}>
                      {r.notes}
                    </div>
                  </div>
                );
              })}
            <div style={{ padding:"10px 12px", background:C.surface3, borderRadius:8,
              fontFamily:"'Rajdhani',sans-serif", fontSize:13, color:C.textSec,
              borderLeft:`2px solid ${heroClr}` }}>
              ✦ Ring enchants: {isSent
                ? "Radiant Crit (Ring 1) + Radiant Mastery (Ring 2)"
                : "2× Radiant Mastery for maximum Spirit Bond value"}
            </div>
          </Card>
        </div>

        {/* ═══════════════════════════════════════════════════
            SECTION 4 — Tier Set Analysis
        ═══════════════════════════════════════════════════ */}
        <Card style={{ marginBottom:20 }}>
          <SecTitle icon="🏆">Tier Set Analysis — {heroName}</SecTitle>
          <div className="gear-2col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
            {[
              { label:"2PC", mechanic:tierAnalysis.twoPcMechanic, synergy:tierAnalysis.twoPcSynergy },
              { label:"4PC", mechanic:tierAnalysis.fourPcMechanic, synergy:tierAnalysis.fourPcSynergy },
            ].map(({ label, mechanic, synergy }) => (
              <div key={label} style={{ background:heroBg, border:`1px solid ${heroBdr}`,
                borderRadius:12, padding:18 }}>
                <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:11, color:heroClr,
                  letterSpacing:2, marginBottom:10 }}>{label} BONUS</div>
                <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:15, fontWeight:700,
                  color:C.textPri, marginBottom:8 }}>{mechanic}</div>
                <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13, color:C.textMid,
                  lineHeight:1.6 }}>{synergy}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom:16 }}>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:9, color:heroClr,
              letterSpacing:2, marginBottom:10 }}>KEY INTERACTIONS</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {tierAnalysis.keyInteractions.map((ki, i) => (
                <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start",
                  padding:"8px 12px", background:C.surface2, borderRadius:8 }}>
                  <span style={{ color:heroClr, fontSize:16, lineHeight:1, flexShrink:0 }}>→</span>
                  <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13,
                    color:C.textSec, lineHeight:1.5 }}>{ki}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding:"12px 16px", background:C.surface2,
            borderLeft:`3px solid ${C.goldLight}`, borderRadius:"0 10px 10px 0" }}>
            <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13 }}>
              <span style={{ color:C.goldLight, fontWeight:700 }}>Stat shift with 4pc active: </span>
              <span style={{ color:C.textSec }}>{tierAnalysis.statPriorityShift}</span>
            </span>
          </div>
        </Card>
      </main>

      {/* ── BiS Gear Tooltip ───────────────────────────────────── */}
      {hoveredBiS && (() => {
        const row = bisList.find(r => r.slot === hoveredBiS);
        if (!row) return null;

        const isTier    = ["Head","Shoulders","Chest","Hands","Legs"].includes(row.slot);
        const isWeapon  = ["Main Hand","Off Hand"].includes(row.slot);
        const isJewelry = ["Neck","Ring 1","Ring 2","Trinket 1","Trinket 2"].includes(row.slot);
        const isTrinket = ["Trinket 1","Trinket 2"].includes(row.slot);

        const SLOT_ICONS: Record<string,string> = {
          "Head":"🪖","Shoulders":"🛡","Chest":"🎽","Wrist":"⌚","Hands":"🧤",
          "Waist":"🪢","Legs":"🩲","Boots":"🥾","Back":"🧥",
          "Neck":"📿","Ring 1":"💍","Ring 2":"💍",
          "Trinket 1":"💎","Trinket 2":"💎",
          "Main Hand":"⚔","Off Hand":"🗡",
        };
        const STAT_CLR: Record<string,string> = {
          Agility:"#fbbf24", Stamina:"#94a3b8",
          Mastery:"#4ade80","Critical Strike":"#f87171",
          Haste:"#60a5fa", Versatility:"#a3a3a3",
        };

        // Cross-referenced trinket data
        const trinketData = row.trinketId
          ? MIDNIGHT_TRINKETS.find(t => t.id === row.trinketId)
          : null;

        // Hero-specific tier set bonuses
        const tierAnalysis = isTier ? TIER_SET_HERO_ANALYSIS[hero] : null;

        // Source split
        const sourceParts = row.source.split(" — ");
        const sourceBase  = sourceParts[0];
        const sourceBoss  = sourceParts.slice(1).join(" — ");

        const tipW = 340;
        const tipH = 480;
        const tipX = Math.min(bisTooltipPos.x, window.innerWidth - tipW - 8);
        // Fixed vertical position: centered in viewport
        const tipY = Math.max(8, (window.innerHeight - tipH) / 2);

        const Divider = () => (
          <div style={{ borderTop:`1px solid ${C.borderSub}`, margin:"10px 0" }} />
        );
        const Label = ({ children }: any) => (
          <div style={{ fontSize:9, letterSpacing:2, color:C.textDim,
            fontFamily:"'Orbitron',sans-serif", marginBottom:5, textTransform:"uppercase" }}>
            {children}
          </div>
        );

        return (
          <div style={{
            position:"fixed", zIndex:9999, pointerEvents:"none",
            left: tipX, top: tipY,
            width: tipW,
            background:"linear-gradient(180deg,#141c2a 0%,#0c1220 100%)",
            border:"1px solid #2e4a6a",
            borderRadius:12, padding:"16px 18px",
            boxShadow:"0 12px 48px rgba(0,0,0,.8)",
            fontFamily:"'Rajdhani',sans-serif",
          }}>

            {/* ── Header: icon + name + slot ─────────────────── */}
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
              <div style={{
                width:40, height:40, borderRadius:8, flexShrink:0,
                background: isTier ? C.goldBg : isWeapon ? heroBg : isJewelry ? "#1a1033" : C.surface2,
                border:`2px solid ${isTier ? "#92400e" : isWeapon ? heroBdr : "#4c1d95"}`,
                display:"flex", alignItems:"center", justifyContent:"center", fontSize:22,
              }}>
                {SLOT_ICONS[row.slot] ?? "⚙"}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:15, fontWeight:800, color:"#c084fc", lineHeight:1.2 }}>
                  {isTier && <span style={{ color:C.goldLight }}>🏆 </span>}
                  {row.itemName}
                </div>
                <div style={{ display:"flex", gap:8, marginTop:4, alignItems:"center" }}>
                  <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11,
                    color:"#a855f7", background:"#2a1a3a", border:"1px solid #5b21b6",
                    borderRadius:4, padding:"1px 7px", fontWeight:700 }}>
                    Hero {row.ilvl}
                  </span>
                  <span style={{ color:C.textDim, fontSize:10 }}>→</span>
                  <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11,
                    color:C.goldLight, background:C.goldBg, border:"1px solid #78350f",
                    borderRadius:4, padding:"1px 7px", fontWeight:700 }}>
                    Myth {row.mythIlvl ?? "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Stat budget ─────────────────────────────────── */}
            {row.statBudget && (
              <>
                {(row.statBudget.agility || row.statBudget.stamina) && (
                  <div style={{ marginBottom:6 }}>
                    {row.statBudget.agility && (
                      <div style={{ fontSize:13, color:STAT_CLR.Agility, padding:"1px 0" }}>
                        +{row.statBudget.agility.toLocaleString()} Agility
                      </div>
                    )}
                    {row.statBudget.stamina && (
                      <div style={{ fontSize:13, color:STAT_CLR.Stamina, padding:"1px 0" }}>
                        +{row.statBudget.stamina.toLocaleString()} Stamina
                      </div>
                    )}
                  </div>
                )}
                {row.statBudget.secondaries.map(s => (
                  <div key={s.name} style={{ fontSize:13,
                    color: STAT_CLR[s.name] ?? C.textSec, padding:"1px 0" }}>
                    +{s.value.toLocaleString()} {s.name}
                  </div>
                ))}
              </>
            )}

            {/* ── Trinket proc / on-use data ──────────────────── */}
            {isTrinket && trinketData && (
              <>
                <Divider />
                {trinketData.primaryAgi > 0 && (
                  <div style={{ fontSize:13, color:STAT_CLR.Agility, padding:"1px 0" }}>
                    +{trinketData.primaryAgi.toLocaleString()} Agility
                  </div>
                )}
                {trinketData.type === 'on_use' && (
                  <div style={{ fontSize:13, color:"#34d399", padding:"2px 0", lineHeight:1.4 }}>
                    Use: Gain +{trinketData.onUseAmount?.toLocaleString()}{" "}
                    {trinketData.onUseStat === 'crit' ? 'Critical Strike'
                      : trinketData.onUseStat === 'mastery' ? 'Mastery'
                      : trinketData.onUseStat === 'haste' ? 'Haste'
                      : 'stat'}{" "}
                    for {trinketData.onUseDuration}s.{" "}
                    <span style={{ color:C.textDim }}>({trinketData.onUseCD}s CD)</span>
                  </div>
                )}
                {trinketData.type === 'proc' && trinketData.procAmount && (
                  <div style={{ fontSize:13, color:"#a3e635", padding:"2px 0", lineHeight:1.4 }}>
                    Equip: {trinketData.procStat === 'agi'
                      ? `Stacking proc — +${(trinketData.procAmount / 10).toLocaleString()} Agility per stack (max 10, avg ~7). ~70% effective uptime.`
                      : `Proc: +${trinketData.procAmount.toLocaleString()}{" "}
                        ${trinketData.procStat === 'mastery' ? 'Mastery'
                          : trinketData.procStat === 'haste' ? 'Haste'
                          : trinketData.procStat === 'crit' ? 'Critical Strike'
                          : 'stat'} (~${Math.round((trinketData.procUptime ?? 0)*100)}% uptime).`
                    }
                  </div>
                )}
                {trinketData.type === 'damage_proc' && (
                  <div style={{ fontSize:13, color:"#f87171", padding:"2px 0", lineHeight:1.4 }}>
                    Equip: Periodically deals {Math.round((trinketData.dmgApCoef ?? 0)*100)}% Attack Power to nearby enemies (~{trinketData.dmgCPM?.toFixed(1)}/min).
                  </div>
                )}
                <div style={{ fontSize:11, color:C.textDim, marginTop:4, lineHeight:1.4 }}>
                  {trinketData.notes}
                </div>
              </>
            )}

            {/* ── Equip / special effect ──────────────────────── */}
            {row.equipText && !isTier && (
              <>
                <Divider />
                <div style={{ fontSize:13, color:"#34d399", lineHeight:1.5 }}>
                  {row.equipText}
                </div>
              </>
            )}

            {/* ── Tier Set Bonus (hero-specific) ──────────────── */}
            {isTier && tierAnalysis && (
              <>
                <Divider />
                <div style={{ marginBottom:8 }}>
                  <div style={{ fontSize:10, fontFamily:"'Orbitron',sans-serif",
                    color:C.goldLight, letterSpacing:1.5, marginBottom:6 }}>
                    {heroIcon} {heroName} — Survival Hunter S1 Tier Set
                  </div>
                  {/* 2pc */}
                  <div style={{ marginBottom:8 }}>
                    <span style={{ fontSize:11, fontFamily:"'IBM Plex Mono',monospace",
                      color:"#fbbf24", background:"#2a1f08", border:"1px solid #78350f",
                      borderRadius:4, padding:"1px 7px", marginRight:6 }}>2pc</span>
                    <span style={{ fontSize:13, color:C.textSec, fontWeight:700 }}>
                      {tierAnalysis.twoPcMechanic}
                    </span>
                    <div style={{ fontSize:12, color:"#86efac", marginTop:4, lineHeight:1.5,
                      paddingLeft:4, borderLeft:`2px solid #14532d` }}>
                      {tierAnalysis.twoPcSynergy}
                    </div>
                  </div>
                  {/* 4pc */}
                  <div>
                    <span style={{ fontSize:11, fontFamily:"'IBM Plex Mono',monospace",
                      color:C.goldLight, background:C.goldBg, border:"1px solid #92400e",
                      borderRadius:4, padding:"1px 7px", marginRight:6 }}>4pc</span>
                    <span style={{ fontSize:13, color:C.textSec, fontWeight:700 }}>
                      {tierAnalysis.fourPcMechanic}
                    </span>
                    <div style={{ fontSize:12, color:"#fde68a", marginTop:4, lineHeight:1.5,
                      paddingLeft:4, borderLeft:`2px solid #78350f` }}>
                      {tierAnalysis.fourPcSynergy}
                    </div>
                  </div>
                </div>
                {/* Stat priority shift */}
                <div style={{ fontSize:11, color:C.textDim, background:C.surface2,
                  borderRadius:6, padding:"6px 10px", lineHeight:1.5, marginTop:4 }}>
                  <span style={{ color: heroClr, fontWeight:700 }}>Stat shift: </span>
                  {tierAnalysis.statPriorityShift}
                </div>
              </>
            )}

            {/* ── Source ──────────────────────────────────────── */}
            <Divider />
            <Label>Source</Label>
            <div style={{ fontSize:12, color:C.textSec, fontWeight:600 }}>{sourceBase}</div>
            {sourceBoss && (
              <div style={{ fontSize:12, color:heroClr, marginTop:2 }}>↳ {sourceBoss}</div>
            )}

            {/* ── Notes / enchant ─────────────────────────────── */}
            {row.notes && (
              <>
                <Divider />
                <Label>Notes &amp; Enchants</Label>
                <div style={{ fontSize:12, color:C.textMid, lineHeight:1.5 }}>{row.notes}</div>
              </>
            )}
          </div>
        );
      })()}

      {/* Footer */}
      <footer style={{ textAlign:"center", padding:"24px 28px",
        borderTop:`1px solid ${C.borderSub}`, marginTop:16 }}>
        <p style={{ fontFamily:"'Orbitron',sans-serif", fontSize:8, letterSpacing:3,
          color:C.textDim, margin:0 }}>
          SURVIVAL HUNTER GEAR OPTIMIZER · MIDNIGHT 12.0 PRE-SEASON 1
        </p>
        <p style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:12, color:C.textDim,
          marginTop:6 }}>
          All DPS values derived from first-principles stat-weight computation.
          Not affiliated with Blizzard Entertainment.
        </p>
      </footer>
    </div>
  );
}
