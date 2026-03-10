// @ts-nocheck
import { useRef, useState, useEffect } from "react";
import { NavLink } from "@/components/NavLink";
import { BlizzardTalentTree } from "@/components/BlizzardTalentTree";
import survivalIconImg from "@/assets/survival-icon.png";

const C = {
  pageBg:"#d4dae2", surface:"#1c2333", surface2:"#242d3f", surface3:"#2c3750",
  border:"#2e3a50", borderSub:"#1a2236",
  textPri:"#f1f5f9", textSec:"#cbd5e1", textMid:"#94a3b8", textDim:"#5a6a82",
  gold:"#d97706", goldLight:"#fbbf24", goldBg:"#2a1f08",
  sentBg:"#0c1e35", sentBdr:"#1a3a5c", sentClr:"#38bdf8",
  packBg:"#1a0e2e", packBdr:"#3b1a5c", packClr:"#c084fc",
};

const NAV_LINKS = [
  { to:"/",                  label:"⚔ Simulator" },
  { to:"/gear",              label:"⚗ Gear"      },
  { to:"/guide",             label:"📖 Guide"     },
  { to:"/talent-optimizer",  label:"🧬 Talent Optimizer" },
];

export default function TalentOptimizer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [treeScale, setTreeScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    const inner = innerRef.current;
    if (!container || !inner) return;
    const measure = () => {
      const cw = container.clientWidth;
      const iw = inner.scrollWidth;
      if (iw > 0) {
        setTreeScale(Math.max(0.4, Math.min(cw / iw, 1)));
      }
    };
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    requestAnimationFrame(measure);
    return () => ro.disconnect();
  }, []);

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
                  TALENT OPTIMIZER · MIDNIGHT 12.0 · PRE-SEASON 1
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

      {/* ── Page body ─────────────────────────────────────── */}
      <main style={{ maxWidth:1400, margin:"0 auto", padding:"32px 28px 64px" }}>
        <h1 style={{ fontFamily:"'Orbitron',sans-serif", fontSize:22, fontWeight:900,
          color:C.sentClr, letterSpacing:3, margin:0, marginBottom:24, textTransform:"uppercase" }}>
          Talent Optimizer
        </h1>

        {/* Dark panel wrapping the talent tree — matches Custom Loadout style */}
        <div style={{
          background:"linear-gradient(160deg,#0d1117 0%,#1c2333 50%,#0f1a2e 100%)",
          border:`1px solid ${C.border}`,
          borderRadius:12,
          padding:"24px 16px 32px",
          overflow:"hidden",
        }}>
          <div ref={containerRef} style={{ width:"100%", overflow:"hidden" }}>
            <div
              ref={innerRef}
              style={{
                transformOrigin:"top center",
                transform:`scale(${treeScale})`,
                display:"inline-flex",
                justifyContent:"center",
                width:"100%",
                minWidth:"fit-content",
              }}
            >
              <BlizzardTalentTree />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
