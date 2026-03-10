import { useState, useMemo } from "react";
import { NavLink } from "@/components/NavLink";
import survivalIconImg from "@/assets/survival-icon.png";

const C = {
  pageBg: "#d4dae2", surface: "#1c2333", surface2: "#242d3f", surface3: "#2c3750",
  border: "#2e3a50", borderSub: "#1a2236",
  textPri: "#f1f5f9", textSec: "#cbd5e1", textMid: "#94a3b8", textDim: "#5a6a82",
  gold: "#d97706", goldLight: "#fbbf24", goldBg: "#2a1f08",
  green: "#4ade80", greenBg: "#0f2a1a", greenBdr: "rgba(74,222,128,.3)",
  red: "#f87171",
  sentBg: "#0c1e35", sentBdr: "#1a3a5c", sentClr: "#38bdf8",
  packBg: "#1a0e2e", packBdr: "#3b1a5c", packClr: "#c084fc",
};

const NAV_LINKS = [
  { to: "/", label: "⚔ Simulator" },
  { to: "/gear", label: "⚗ Gear" },
  { to: "/guide", label: "📖 Guide" },
  { to: "/talent-optimizer", label: "🧬 Talent Optimizer" },
  { to: "/calculator", label: "🧮 Calculator" },
];

// ── Stat formulas ────────────────────────────────────────────
// Based on Midnight 12.0.1 survival hunter coefficients
const BASE_AP_AT_276 = 12500;
const ILVL_AP_SLOPE = 65; // AP per ilvl above 200

interface StatInputs {
  ilvl: number;
  crit: number;       // rating
  haste: number;
  mastery: number;
  vers: number;
  agility: number;    // from gear, 0 = auto from ilvl
  weaponDps: number;
}

interface CalcResult {
  attackPower: number;
  critPct: number;
  hastePct: number;
  masteryPct: number;
  versPct: number;
  critMult: number;
  hasteMult: number;
  masteryMult: number;
  versMult: number;
  totalMult: number;
  estimatedDps: number;
  statWeights: { stat: string; label: string; weight: number; dpsPerPoint: number }[];
}

const CRIT_CONV = 180;    // rating per 1%
const HASTE_CONV = 170;
const MASTERY_CONV = 180;
const VERS_CONV = 205;

function calculate(inputs: StatInputs, hero: "sentinel" | "packLeader", targets: number): CalcResult {
  const ap = inputs.agility > 0
    ? inputs.agility * 1.05 // agility → AP
    : BASE_AP_AT_276 + (inputs.ilvl - 276) * ILVL_AP_SLOPE;

  const critPct = 5 + inputs.crit / CRIT_CONV;
  const hastePct = inputs.haste / HASTE_CONV;
  const masteryPct = 14 + inputs.mastery / MASTERY_CONV; // SV base mastery 14%
  const versPct = inputs.vers / VERS_CONV;

  const critMult = 1 + (critPct / 100) * 1.0; // 100% extra on crit
  const hasteMult = 1 + hastePct / 100;
  const masteryMult = 1 + masteryPct / 100;
  const versMult = 1 + versPct / 100;

  const totalMult = critMult * hasteMult * masteryMult * versMult;

  // Base DPS model: AP * coefficient * total mult
  const baseCoeff = hero === "sentinel" ? 0.42 : 0.40;
  const targetMult = 1 + Math.min(targets - 1, 7) * 0.18; // AoE scaling
  const estimatedDps = ap * baseCoeff * totalMult * targetMult;

  // Stat weights via partial derivatives
  const delta = 100; // rating delta for weight calc
  const baseDps = estimatedDps;

  const weights = [
    {
      stat: "crit", label: "Critical Strike",
      calc: () => {
        const newCrit = 5 + (inputs.crit + delta) / CRIT_CONV;
        const newMult = (1 + (newCrit / 100)) * hasteMult * masteryMult * versMult;
        return ap * baseCoeff * newMult * targetMult;
      }
    },
    {
      stat: "haste", label: "Haste",
      calc: () => {
        const newHaste = (inputs.haste + delta) / HASTE_CONV;
        const newMult = critMult * (1 + newHaste / 100) * masteryMult * versMult;
        return ap * baseCoeff * newMult * targetMult;
      }
    },
    {
      stat: "mastery", label: "Mastery",
      calc: () => {
        const newMastery = 14 + (inputs.mastery + delta) / MASTERY_CONV;
        const newMult = critMult * hasteMult * (1 + newMastery / 100) * versMult;
        return ap * baseCoeff * newMult * targetMult;
      }
    },
    {
      stat: "vers", label: "Versatility",
      calc: () => {
        const newVers = (inputs.vers + delta) / VERS_CONV;
        const newMult = critMult * hasteMult * masteryMult * (1 + newVers / 100);
        return ap * baseCoeff * newMult * targetMult;
      }
    },
  ].map(w => {
    const newDps = w.calc();
    const dpsPerPoint = (newDps - baseDps) / delta;
    return { stat: w.stat, label: w.label, weight: dpsPerPoint, dpsPerPoint };
  });

  // Normalize weights to highest = 1.0
  const maxWeight = Math.max(...weights.map(w => w.weight));
  weights.forEach(w => { w.weight = maxWeight > 0 ? w.weight / maxWeight : 0; });

  return {
    attackPower: Math.round(ap),
    critPct, hastePct, masteryPct, versPct,
    critMult, hasteMult, masteryMult, versMult,
    totalMult, estimatedDps: Math.round(estimatedDps),
    statWeights: weights.sort((a, b) => b.weight - a.weight),
  };
}

// ── Stat input component ────────────────────────────────────
function StatSlider({ label, value, onChange, min, max, step = 1, suffix = "", color }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step?: number; suffix?: string; color: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, fontWeight: 700, color: C.textSec }}>
          {label}
        </span>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color, fontWeight: 700 }}>
          {typeof value === "number" ? value.toLocaleString() : value}{suffix}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          width: "100%", height: 6, appearance: "none", WebkitAppearance: "none",
          background: `linear-gradient(90deg, ${color}66 0%, ${color} ${((value - min) / (max - min)) * 100}%, ${C.surface3} ${((value - min) / (max - min)) * 100}%)`,
          borderRadius: 3, outline: "none", cursor: "pointer",
        }}
      />
      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
          background: ${color}; border: 2px solid ${C.surface}; cursor: pointer;
        }
      `}</style>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────
export default function Calculator() {
  const [hero, setHero] = useState<"sentinel" | "packLeader">("sentinel");
  const [targets, setTargets] = useState(1);
  const [inputs, setInputs] = useState<StatInputs>({
    ilvl: 276,
    crit: 4200,
    haste: 3800,
    mastery: 2600,
    vers: 2400,
    agility: 0,
    weaponDps: 680,
  });

  const isSent = hero === "sentinel";
  const heroClr = isSent ? C.sentClr : C.packClr;
  const heroBg = isSent ? C.sentBg : C.packBg;
  const heroBdr = isSent ? C.sentBdr : C.packBdr;

  const result = useMemo(() => calculate(inputs, hero, targets), [inputs, hero, targets]);

  const updateInput = (key: keyof StatInputs) => (val: number) =>
    setInputs(prev => ({ ...prev, [key]: val }));

  // Compare scenarios
  const [compareMode, setCompareMode] = useState(false);
  const [inputs2, setInputs2] = useState<StatInputs>({ ...inputs });
  const result2 = useMemo(() => compareMode ? calculate(inputs2, hero, targets) : null, [inputs2, hero, targets, compareMode]);
  const updateInput2 = (key: keyof StatInputs) => (val: number) =>
    setInputs2(prev => ({ ...prev, [key]: val }));

  const Card = ({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) => (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 14, padding: 24, ...style,
    }}>{children}</div>
  );

  const Lbl = ({ children }: { children: React.ReactNode }) => (
    <div style={{
      fontFamily: "'Orbitron',sans-serif", fontSize: 9, letterSpacing: 3,
      color: heroClr, textTransform: "uppercase", marginBottom: 14,
      display: "flex", alignItems: "center", gap: 10, fontWeight: 700,
    }}>
      {children}
      <div style={{ flex: 1, height: 1, background: heroBdr }} />
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.pageBg, color: C.textPri,
      fontFamily: "'Rajdhani','Segoe UI',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;600;700;900&family=IBM+Plex+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;} body{margin:0;}
        .g-nav-link{font-family:'Rajdhani',sans-serif;font-size:14px;font-weight:700;
          letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;
          color:#64748b;padding:10px 18px;border-bottom:3px solid transparent;
          transition:color .2s,border-color .2s;display:inline-block;}
        .g-nav-link:hover{color:#94a3b8;}
        .g-nav-link.active{color:#fbbf24;border-bottom-color:#d97706;}
        @media(max-width:900px){ .calc-grid{grid-template-columns:1fr !important;} }
      `}</style>

      {/* Header */}
      <header style={{ background: "linear-gradient(135deg,#0d1117,#1c2333,#0f1a2e)",
        borderBottom: `1px solid ${C.border}`, padding: "16px 28px" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
            flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, overflow: "hidden",
                border: `2px solid ${C.sentBdr}`, flexShrink: 0 }}>
                <img src={survivalIconImg} alt="Survival Hunter"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 16,
                  fontWeight: 700, color: C.textPri, letterSpacing: 2 }}>SURVIVAL HUNTER</div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8,
                  letterSpacing: 3, color: C.textDim, marginTop: 3 }}>
                  INTERACTIVE CALCULATOR · MIDNIGHT 12.0
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ background: C.goldBg, color: C.goldLight,
                border: "1px solid rgba(217,119,6,.4)", borderRadius: 6,
                padding: "3px 10px", fontSize: 12, fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 }}>
                ★ PRE-SEASON 1
              </span>
            </div>
          </div>
          <nav style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
            {NAV_LINKS.map(({ to, label }) => (
              <NavLink key={to} to={to} className="g-nav-link" activeClassName="active"
                {...(to === "/" ? { end: true } : {})}>
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 28px 64px" }}>
        {/* Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
          <div>
            <h1 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 22, fontWeight: 900,
              color: heroClr, letterSpacing: 3, margin: 0, textTransform: "uppercase" }}>
              🧮 Interactive DPS Calculator
            </h1>
            <p style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 15, color: C.textMid, marginTop: 8, maxWidth: 620 }}>
              Adjust stats to see real-time DPS estimates, stat weights, and multiplier breakdowns.
              Compare two gear sets side-by-side with Compare mode.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {(["sentinel", "packLeader"] as const).map(h => (
              <button key={h} onClick={() => setHero(h)} style={{
                fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 14,
                letterSpacing: 1, padding: "9px 20px", borderRadius: 10, cursor: "pointer",
                background: hero === h ? (h === "sentinel" ? C.sentBg : C.packBg) : C.surface2,
                border: `1px solid ${hero === h ? (h === "sentinel" ? C.sentClr : C.packClr) : C.border}`,
                color: hero === h ? (h === "sentinel" ? C.sentClr : C.packClr) : C.textMid,
                transition: "all .2s",
              }}>
                {h === "sentinel" ? "🦉 Sentinel" : "🐾 Pack Leader"}
              </button>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
              background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 9, color: C.textDim, letterSpacing: 1 }}>TARGETS</span>
              {[1, 3, 5, 8].map(t => (
                <button key={t} onClick={() => setTargets(t)} style={{
                  fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, width: 28, height: 28,
                  borderRadius: 6, cursor: "pointer", border: "none",
                  background: targets === t ? heroClr : C.surface3,
                  color: targets === t ? "#000" : C.textMid, fontWeight: 700,
                }}>
                  {t}
                </button>
              ))}
            </div>
            <button onClick={() => { setCompareMode(!compareMode); if (!compareMode) setInputs2({ ...inputs }); }}
              style={{
                fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 14,
                padding: "9px 20px", borderRadius: 10, cursor: "pointer",
                background: compareMode ? C.goldBg : C.surface2,
                border: `1px solid ${compareMode ? C.gold : C.border}`,
                color: compareMode ? C.goldLight : C.textMid, transition: "all .2s",
              }}>
              {compareMode ? "✓ Compare ON" : "⇄ Compare"}
            </button>
          </div>
        </div>

        {/* Main grid */}
        <div className="calc-grid" style={{ display: "grid", gridTemplateColumns: compareMode ? "1fr 1fr" : "380px 1fr", gap: 20, marginBottom: 20 }}>
          {/* Stat inputs */}
          <Card>
            <Lbl>{compareMode ? "📊 Set A — Stats" : "📊 Stat Inputs"}</Lbl>
            <StatSlider label="Item Level" value={inputs.ilvl} onChange={updateInput("ilvl")}
              min={220} max={310} color={heroClr} />
            <StatSlider label="Critical Strike" value={inputs.crit} onChange={updateInput("crit")}
              min={0} max={10000} step={50} color="#f87171" />
            <StatSlider label="Haste" value={inputs.haste} onChange={updateInput("haste")}
              min={0} max={10000} step={50} color="#60a5fa" />
            <StatSlider label="Mastery" value={inputs.mastery} onChange={updateInput("mastery")}
              min={0} max={10000} step={50} color="#a78bfa" />
            <StatSlider label="Versatility" value={inputs.vers} onChange={updateInput("vers")}
              min={0} max={10000} step={50} color="#34d399" />
            <StatSlider label="Weapon DPS" value={inputs.weaponDps} onChange={updateInput("weaponDps")}
              min={400} max={900} step={5} suffix=" dps" color={C.goldLight} />
            <div style={{ marginTop: 8, padding: "8px 12px", background: heroBg,
              border: `1px solid ${heroBdr}`, borderRadius: 8,
              fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: C.textDim }}>
              Set Agility to 0 for auto-calculation from ilvl. Override for manual entry.
            </div>
            <StatSlider label="Agility Override" value={inputs.agility} onChange={updateInput("agility")}
              min={0} max={25000} step={100} color={C.goldLight} />
          </Card>

          {compareMode ? (
            <Card>
              <Lbl>📊 Set B — Stats</Lbl>
              <StatSlider label="Item Level" value={inputs2.ilvl} onChange={updateInput2("ilvl")}
                min={220} max={310} color={heroClr} />
              <StatSlider label="Critical Strike" value={inputs2.crit} onChange={updateInput2("crit")}
                min={0} max={10000} step={50} color="#f87171" />
              <StatSlider label="Haste" value={inputs2.haste} onChange={updateInput2("haste")}
                min={0} max={10000} step={50} color="#60a5fa" />
              <StatSlider label="Mastery" value={inputs2.mastery} onChange={updateInput2("mastery")}
                min={0} max={10000} step={50} color="#a78bfa" />
              <StatSlider label="Versatility" value={inputs2.vers} onChange={updateInput2("vers")}
                min={0} max={10000} step={50} color="#34d399" />
              <StatSlider label="Weapon DPS" value={inputs2.weaponDps} onChange={updateInput2("weaponDps")}
                min={400} max={900} step={5} suffix=" dps" color={C.goldLight} />
              <StatSlider label="Agility Override" value={inputs2.agility} onChange={updateInput2("agility")}
                min={0} max={25000} step={100} color={C.goldLight} />
            </Card>
          ) : (
            /* Results panel */
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* DPS Result */}
              <Card>
                <Lbl>⚡ Estimated DPS</Lbl>
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 48, fontWeight: 900,
                    color: heroClr, letterSpacing: 2 }}>
                    {result.estimatedDps.toLocaleString()}
                  </div>
                  <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, color: C.textDim, marginTop: 6 }}>
                    {isSent ? "Sentinel" : "Pack Leader"} · {targets}T · {inputs.ilvl} ilvl
                  </div>
                </div>
                {/* Multiplier breakdown */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                  {[
                    { label: "Crit", val: result.critMult, pct: result.critPct, color: "#f87171" },
                    { label: "Haste", val: result.hasteMult, pct: result.hastePct, color: "#60a5fa" },
                    { label: "Mastery", val: result.masteryMult, pct: result.masteryPct, color: "#a78bfa" },
                    { label: "Vers", val: result.versMult, pct: result.versPct, color: "#34d399" },
                  ].map(s => (
                    <div key={s.label} style={{ background: C.surface2, borderRadius: 8,
                      padding: "10px 8px", border: `1px solid ${C.border}`, textAlign: "center" }}>
                      <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7,
                        color: C.textDim, letterSpacing: 1.5, marginBottom: 6 }}>{s.label.toUpperCase()}</div>
                      <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 16,
                        color: s.color }}>{s.pct.toFixed(1)}%</div>
                      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10,
                        color: C.textDim, marginTop: 2 }}>×{s.val.toFixed(3)}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, textAlign: "center" }}>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: C.goldLight }}>
                    Total Multiplier: ×{result.totalMult.toFixed(4)}
                  </span>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: C.textDim, marginLeft: 12 }}>
                    AP: {result.attackPower.toLocaleString()}
                  </span>
                </div>
              </Card>

              {/* Stat Weights */}
              <Card>
                <Lbl>📏 Stat Weights (per 100 rating)</Lbl>
                {result.statWeights.map(sw => {
                  const clr = sw.stat === "crit" ? "#f87171"
                    : sw.stat === "haste" ? "#60a5fa"
                    : sw.stat === "mastery" ? "#a78bfa" : "#34d399";
                  return (
                    <div key={sw.stat} style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, fontWeight: 700, color: C.textSec }}>
                          {sw.label}
                        </span>
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: clr }}>
                          {sw.weight.toFixed(3)} ({sw.dpsPerPoint.toFixed(2)} DPS/pt)
                        </span>
                      </div>
                      <div style={{ width: "100%", height: 8, borderRadius: 4, background: C.surface3, overflow: "hidden" }}>
                        <div style={{
                          width: `${sw.weight * 100}%`, height: "100%",
                          background: `linear-gradient(90deg, ${clr}88, ${clr})`,
                          borderRadius: 4, transition: "width .3s",
                        }} />
                      </div>
                    </div>
                  );
                })}
                <div style={{ marginTop: 8, fontFamily: "'Rajdhani',sans-serif", fontSize: 11, color: C.textDim }}>
                  Weights normalized to 1.0 for the best stat. DPS/pt shows raw DPS gain per 1 rating point.
                </div>
              </Card>
            </div>
          )}
        </div>

        {/* Compare results */}
        {compareMode && result2 && (
          <Card style={{ marginBottom: 20 }}>
            <Lbl>⇄ Comparison Results</Lbl>
            <div className="calc-grid" style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 20 }}>
              {/* Set A */}
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 9, color: C.textDim, letterSpacing: 2, marginBottom: 10 }}>SET A</div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 36, fontWeight: 900, color: heroClr }}>
                  {result.estimatedDps.toLocaleString()}
                </div>
                <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textDim, marginTop: 4 }}>
                  {inputs.ilvl} ilvl · AP {result.attackPower.toLocaleString()}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 12 }}>
                  {[
                    { l: "Crit", v: result.critPct, c: "#f87171" },
                    { l: "Haste", v: result.hastePct, c: "#60a5fa" },
                    { l: "Mastery", v: result.masteryPct, c: "#a78bfa" },
                    { l: "Vers", v: result.versPct, c: "#34d399" },
                  ].map(s => (
                    <div key={s.l} style={{ background: C.surface2, borderRadius: 6, padding: "6px 8px",
                      border: `1px solid ${C.border}` }}>
                      <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, color: C.textDim, letterSpacing: 1 }}>{s.l}</div>
                      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: s.c }}>{s.v.toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Delta */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 120 }}>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 9, color: C.textDim, letterSpacing: 2, marginBottom: 8 }}>DELTA</div>
                {(() => {
                  const diff = result2.estimatedDps - result.estimatedDps;
                  const pctDiff = result.estimatedDps > 0 ? (diff / result.estimatedDps) * 100 : 0;
                  const positive = diff >= 0;
                  return (
                    <>
                      <div style={{
                        fontFamily: "'Orbitron',sans-serif", fontSize: 28, fontWeight: 900,
                        color: positive ? C.green : C.red,
                      }}>
                        {positive ? "+" : ""}{diff.toLocaleString()}
                      </div>
                      <div style={{
                        fontFamily: "'IBM Plex Mono',monospace", fontSize: 14,
                        color: positive ? C.green : C.red, marginTop: 4,
                      }}>
                        {positive ? "+" : ""}{pctDiff.toFixed(2)}%
                      </div>
                      <div style={{
                        marginTop: 12, padding: "6px 14px", borderRadius: 8,
                        background: positive ? C.greenBg : "rgba(248,113,113,.1)",
                        border: `1px solid ${positive ? C.greenBdr : "rgba(248,113,113,.3)"}`,
                        fontFamily: "'Rajdhani',sans-serif", fontSize: 13, fontWeight: 700,
                        color: positive ? C.green : C.red,
                      }}>
                        Set B is {positive ? "better" : "worse"}
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Set B */}
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 9, color: C.textDim, letterSpacing: 2, marginBottom: 10 }}>SET B</div>
                <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 36, fontWeight: 900, color: heroClr }}>
                  {result2.estimatedDps.toLocaleString()}
                </div>
                <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: C.textDim, marginTop: 4 }}>
                  {inputs2.ilvl} ilvl · AP {result2.attackPower.toLocaleString()}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 12 }}>
                  {[
                    { l: "Crit", v: result2.critPct, c: "#f87171" },
                    { l: "Haste", v: result2.hastePct, c: "#60a5fa" },
                    { l: "Mastery", v: result2.masteryPct, c: "#a78bfa" },
                    { l: "Vers", v: result2.versPct, c: "#34d399" },
                  ].map(s => (
                    <div key={s.l} style={{ background: C.surface2, borderRadius: 6, padding: "6px 8px",
                      border: `1px solid ${C.border}` }}>
                      <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 7, color: C.textDim, letterSpacing: 1 }}>{s.l}</div>
                      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: s.c }}>{s.v.toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Quick reference */}
        <Card>
          <Lbl>📋 Rating Conversion Reference</Lbl>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Rajdhani',sans-serif", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Stat", "Rating / 1%", "Your Rating", "Your %", "Multiplier"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "7px 10px",
                      fontFamily: "'Orbitron',sans-serif", fontSize: 9, letterSpacing: 1,
                      color: C.textDim, fontWeight: 400 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { stat: "Critical Strike", conv: CRIT_CONV, rating: inputs.crit, pct: result.critPct, mult: result.critMult, c: "#f87171" },
                  { stat: "Haste", conv: HASTE_CONV, rating: inputs.haste, pct: result.hastePct, mult: result.hasteMult, c: "#60a5fa" },
                  { stat: "Mastery", conv: MASTERY_CONV, rating: inputs.mastery, pct: result.masteryPct, mult: result.masteryMult, c: "#a78bfa" },
                  { stat: "Versatility", conv: VERS_CONV, rating: inputs.vers, pct: result.versPct, mult: result.versMult, c: "#34d399" },
                ].map(s => (
                  <tr key={s.stat} style={{ borderBottom: `1px solid ${C.borderSub}` }}>
                    <td style={{ padding: "7px 10px", color: s.c, fontWeight: 600 }}>{s.stat}</td>
                    <td style={{ padding: "7px 10px", color: C.textMid, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11 }}>{s.conv}</td>
                    <td style={{ padding: "7px 10px", color: C.textSec }}>{s.rating.toLocaleString()}</td>
                    <td style={{ padding: "7px 10px", color: s.c }}>{s.pct.toFixed(1)}%</td>
                    <td style={{ padding: "7px 10px", color: C.textMid, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11 }}>×{s.mult.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </main>

      <footer style={{ textAlign: "center", padding: "24px 28px", borderTop: `1px solid ${C.borderSub}` }}>
        <p style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, letterSpacing: 3, color: C.textDim, margin: 0 }}>
          SURVIVAL HUNTER INTERACTIVE CALCULATOR · MIDNIGHT 12.0
        </p>
      </footer>
    </div>
  );
}
