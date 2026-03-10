import { useState, useCallback, useMemo } from "react";

// ── Types ─────────────────────────────────────────────────────
interface HeroTalentChoice {
  key: string;
  label: string;
  spellId: number;
  desc: string;
}

interface HeroTalentNodeDef {
  nodeId: number;
  row: number;        // 1-4
  col: number;        // 0-3
  label: string;
  spellId: number;
  desc: string;
  /** If present, this is a choice node — pick A or B */
  choiceB?: HeroTalentChoice;
  /** Prerequisite node IDs that must be selected first */
  requires?: number[];
}

interface HeroTreeDef {
  name: string;
  icon: string;
  maxPoints: number;
  /** Points needed in earlier rows to unlock each row */
  tierGates: Record<number, number>; // row -> min points spent in rows < row
  nodes: HeroTalentNodeDef[];
}

// ── Data ─────────────────────────────────────────────────────
// Blizzard API node IDs & spell IDs from talent-tree/774/playable-specialization/255
// Midnight 12.0.1 (live)

const SENTINEL_TREE: HeroTreeDef = {
  name: "Sentinel",
  icon: "🦉",
  maxPoints: 10,
  tierGates: { 1: 0, 2: 2, 3: 5, 4: 8 },
  nodes: [
    // ─── Row 1 ─────────────────────────────────────
    { nodeId: 94973, row: 1, col: 1, label: "Lunar Inspiration", spellId: 1253825,
      desc: "Your Sentinel abilities deal increased Arcane damage." },
    { nodeId: 94958, row: 1, col: 0, label: "Stargazer", spellId: 1253751,
      desc: "Raptor Strike / Mongoose Bite extends Sentinel Mark by 2 sec.",
      choiceB: { key: "openFire", label: "Open Fire", spellId: 1253807,
        desc: "Kill Command reduces the cooldown of Sentinel by 5 sec." } },
    { nodeId: 94971, row: 1, col: 2, label: "Extrapolation", spellId: 450379,
      desc: "Sentinel Marks have 99.99% uptime — effectively permanent in combat." },
    { nodeId: 110028, row: 1, col: 3, label: "Twilight Requiem", spellId: 1264904,
      desc: "When Sentinel expires, it deals Arcane damage to all marked targets.",
      choiceB: { key: "stalkAndStrike", label: "Stalk and Strike", spellId: 1266069,
        desc: "Mongoose Bite / Raptor Strike damage increased for each active Sentinel Mark." } },
    // ─── Row 2 ─────────────────────────────────────
    { nodeId: 94960, row: 2, col: 0, label: "Don't Look Back", spellId: 450373,
      desc: "Harpoon gains Sentinel Mark application on impact.", requires: [94958] },
    { nodeId: 94959, row: 2, col: 1, label: "Catch Out", spellId: 450376,
      desc: "Kill Command has a chance to apply an additional Sentinel Mark.", requires: [94973, 94971] },
    { nodeId: 94957, row: 2, col: 2, label: "Invigorating Pulse", spellId: 450380,
      desc: "Sentinel Mark consumption heals you for a small amount.", requires: [94971, 110028] },
    // ─── Row 3 ─────────────────────────────────────
    { nodeId: 94970, row: 3, col: 0, label: "Eyes Closed", spellId: 1253846,
      desc: "Sentinel Mark damage is increased by 10%.", requires: [94960] },
    { nodeId: 94956, row: 3, col: 1, label: "Lunar Calling", spellId: 450378,
      desc: "Sentinel Mark consumption damage is increased and can critically strike.", requires: [94959] },
    { nodeId: 109805, row: 3, col: 3, label: "Release and Reload", spellId: 1264903,
      desc: "Sentinel's cooldown is reduced when you consume Sentinel Marks.", requires: [94957] },
    // ─── Row 4 (Capstone) ──────────────────────────
    { nodeId: 94955, row: 4, col: 1, label: "Lunar Storm", spellId: 450384,
      desc: "Capstone: Sentinel Mark consumption triggers a devastating Lunar Storm AoE. Your strongest burst AoE event.",
      requires: [94970, 94956, 109805] },
  ],
};

const PACK_LEADER_TREE: HeroTreeDef = {
  name: "Pack Leader",
  icon: "🐾",
  maxPoints: 10,
  tierGates: { 1: 0, 2: 2, 3: 5, 4: 8 },
  nodes: [
    // ─── Row 1 ─────────────────────────────────────
    { nodeId: 94985, row: 1, col: 0, label: "Vicious Hunt", spellId: 472358,
      desc: "Kill Command has a chance to summon a dire beast to attack your target." },
    { nodeId: 94962, row: 1, col: 2, label: "Pack Coordination", spellId: 472357,
      desc: "Auto-selected. Your pet's damage is increased while you fight alongside it." },
    { nodeId: 94979, row: 1, col: 3, label: "Howl of the Pack", spellId: 472719,
      desc: "Your pet's Basic Attack generates Focus for you.",
      choiceB: { key: "slickedShoes_unused", label: "Den Recovery", spellId: 472720,
        desc: "Aspect of the Turtle also heals your pet to full." } },
    // ─── Row 2 ─────────────────────────────────────
    { nodeId: 94972, row: 2, col: 0, label: "Ursine Fury", spellId: 472476,
      desc: "Kill Command deals increased damage and has a chance to reset its cooldown.",
      choiceB: { key: "sharpenedClaws", label: "Sharpened Claws", spellId: 472524,
        desc: "Your pet's critical strikes deal increased damage." },
      requires: [94985] },
    { nodeId: 94984, row: 2, col: 1, label: "Wild Attacks", spellId: 472550,
      desc: "Your pet's Basic Attack can trigger a bonus attack.", requires: [94985, 94962] },
    { nodeId: 94988, row: 2, col: 2, label: "Cornered Prey", spellId: 472639,
      desc: "Kill Command damage is increased on targets below 20% health.", requires: [94962, 94979] },
    { nodeId: 109803, row: 2, col: 3, label: "Frenzied Tear", spellId: 1264781,
      desc: "Your pet enters a frenzy after Kill Command, increasing attack speed.", requires: [94979] },
    // ─── Row 3 ─────────────────────────────────────
    { nodeId: 94969, row: 3, col: 0, label: "Go for the Throat", spellId: 472660,
      desc: "Kill Command generates additional Focus.", requires: [94972] },
    { nodeId: 94967, row: 3, col: 1, label: "Furious Assault", spellId: 472707,
      desc: "Your melee attacks have a chance to trigger an additional pet attack.", requires: [94984] },
    { nodeId: 109804, row: 3, col: 2, label: "Scattered Prey", spellId: 1264797,
      desc: "Kill Command hits additional nearby targets for reduced damage.",
      choiceB: { key: "wyvernsGaze", label: "Wyvern's Gaze", spellId: 1264792,
        desc: "Your pet stuns targets with its attacks periodically." },
      requires: [94988] },
    { nodeId: 109802, row: 3, col: 3, label: "Claw Frenzy", spellId: 1264775,
      desc: "Your pet's attack speed is increased for each active bleed on the target.", requires: [109803] },
    // ─── Row 4 (Capstone) ──────────────────────────
    { nodeId: 94966, row: 4, col: 1, label: "Pack Assault", spellId: 472741,
      desc: "Capstone: Takedown triggers a Pack Assault — all beasts attack simultaneously for massive burst.",
      requires: [94969, 94967, 109804, 109802] },
  ],
};

// ── Colors ────────────────────────────────────────────────────
const COLORS = {
  surface: "#1c2333", surface2: "#242d3f", surface3: "#2c3750",
  border: "#2e3a50", borderSub: "#1a2236",
  textPri: "#f1f5f9", textSec: "#cbd5e1", textMid: "#94a3b8", textDim: "#5a6a82",
  gold: "#d97706", goldLight: "#fbbf24", goldBg: "#2a1f08",
  green: "#4ade80", greenBg: "#0f2a1a",
  sentinel: { bg: "#0c1e35", bdr: "#1a3a5c", clr: "#38bdf8", glow: "rgba(56,189,248,.15)" },
  packLeader: { bg: "#1a0e2e", bdr: "#3b1a5c", clr: "#c084fc", glow: "rgba(192,132,252,.15)" },
};

// ── Component ────────────────────────────────────────────────
interface Props {
  heroKey: "sentinel" | "packLeader";
}

interface SelectedState {
  /** Set of nodeIds that are selected */
  selected: Set<number>;
  /** For choice nodes: nodeId -> 'a' | 'b' */
  choices: Record<number, "a" | "b">;
}

export default function HeroTalentTree({ heroKey }: Props) {
  const tree = heroKey === "sentinel" ? SENTINEL_TREE : PACK_LEADER_TREE;
  const pal = heroKey === "sentinel" ? COLORS.sentinel : COLORS.packLeader;

  // Initialize: all nodes selected (hero trees typically have all 10 taken), choice A default
  const [state, setState] = useState<SelectedState>(() => {
    const selected = new Set(tree.nodes.map(n => n.nodeId));
    const choices: Record<number, "a" | "b"> = {};
    tree.nodes.forEach(n => { if (n.choiceB) choices[n.nodeId] = "a"; });
    return { selected, choices };
  });

  const pointsSpent = state.selected.size;
  const rows = [1, 2, 3, 4];

  // Points spent in rows before a given row
  const pointsBeforeRow = useCallback((row: number) => {
    return tree.nodes.filter(n => n.row < row && state.selected.has(n.nodeId)).length;
  }, [tree.nodes, state.selected]);

  // Check if a row is unlocked
  const isRowUnlocked = useCallback((row: number) => {
    const gate = tree.tierGates[row] ?? 0;
    return pointsBeforeRow(row) >= gate;
  }, [tree.tierGates, pointsBeforeRow]);

  // Check if a node's prerequisites are met
  const prereqsMet = useCallback((node: HeroTalentNodeDef) => {
    if (!node.requires?.length) return true;
    return node.requires.some(reqId => state.selected.has(reqId));
  }, [state.selected]);

  // Check if node can be selected
  const canSelect = useCallback((node: HeroTalentNodeDef) => {
    if (state.selected.has(node.nodeId)) return true; // already selected
    if (pointsSpent >= tree.maxPoints) return false;
    if (!isRowUnlocked(node.row)) return false;
    if (!prereqsMet(node)) return false;
    return true;
  }, [state.selected, pointsSpent, tree.maxPoints, isRowUnlocked, prereqsMet]);

  // Check if deselecting a node would orphan downstream nodes
  const canDeselect = useCallback((node: HeroTalentNodeDef) => {
    if (!state.selected.has(node.nodeId)) return false;
    // Check if removing this node would break any selected node's prereqs
    const hypothetical = new Set(state.selected);
    hypothetical.delete(node.nodeId);
    for (const n of tree.nodes) {
      if (!hypothetical.has(n.nodeId)) continue;
      if (!n.requires?.length) continue;
      // At least one prereq must still be met
      if (!n.requires.some(r => hypothetical.has(r))) return false;
    }
    // Check tier gates still hold
    for (const n of tree.nodes) {
      if (!hypothetical.has(n.nodeId)) continue;
      const ptsBefore = tree.nodes.filter(x => x.row < n.row && hypothetical.has(x.nodeId)).length;
      if (ptsBefore < (tree.tierGates[n.row] ?? 0)) return false;
    }
    return true;
  }, [state.selected, tree]);

  const toggleNode = useCallback((node: HeroTalentNodeDef) => {
    setState(prev => {
      const next = { selected: new Set(prev.selected), choices: { ...prev.choices } };
      if (next.selected.has(node.nodeId)) {
        // Try deselect
        const hypothetical = new Set(next.selected);
        hypothetical.delete(node.nodeId);
        // Validate
        let valid = true;
        for (const n of tree.nodes) {
          if (!hypothetical.has(n.nodeId)) continue;
          if (n.requires?.length && !n.requires.some(r => hypothetical.has(r))) { valid = false; break; }
          const ptsBefore = tree.nodes.filter(x => x.row < n.row && hypothetical.has(x.nodeId)).length;
          if (ptsBefore < (tree.tierGates[n.row] ?? 0)) { valid = false; break; }
        }
        if (valid) next.selected.delete(node.nodeId);
      } else {
        if (next.selected.size < tree.maxPoints && isRowUnlocked(node.row) && prereqsMet(node)) {
          next.selected.add(node.nodeId);
        }
      }
      return next;
    });
  }, [tree, isRowUnlocked, prereqsMet]);

  const toggleChoice = useCallback((nodeId: number) => {
    setState(prev => ({
      ...prev,
      choices: { ...prev.choices, [nodeId]: prev.choices[nodeId] === "a" ? "b" : "a" },
    }));
  }, []);

  const resetTree = useCallback(() => {
    const selected = new Set(tree.nodes.map(n => n.nodeId));
    const choices: Record<number, "a" | "b"> = {};
    tree.nodes.forEach(n => { if (n.choiceB) choices[n.nodeId] = "a"; });
    setState({ selected, choices });
  }, [tree]);

  const clearTree = useCallback(() => {
    const choices: Record<number, "a" | "b"> = {};
    tree.nodes.forEach(n => { if (n.choiceB) choices[n.nodeId] = "a"; });
    setState({ selected: new Set(), choices });
  }, [tree]);

  // Get max columns for the tree
  const maxCol = useMemo(() => Math.max(...tree.nodes.map(n => n.col)), [tree.nodes]);

  // Hover state for tooltip
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div style={{ background: COLORS.surface, borderRadius: 14, padding: 24, border: `1px solid ${COLORS.border}` }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 9, letterSpacing: 3,
            color: pal.clr, textTransform: "uppercase", marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
            {tree.icon} {tree.name} Hero Talent Tree
            <div style={{ flex: 1, height: 1, background: pal.bdr, minWidth: 40 }} />
          </div>
          <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, color: COLORS.textMid }}>
            Click nodes to select/deselect. Choice nodes have a swap button. Tier gates enforce row unlocking.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Point counter */}
          <div style={{
            padding: "6px 14px", borderRadius: 8,
            background: pointsSpent === tree.maxPoints ? COLORS.greenBg : COLORS.goldBg,
            border: `1px solid ${pointsSpent === tree.maxPoints ? "rgba(74,222,128,.4)" : "rgba(217,119,6,.4)"}`,
            fontFamily: "'Orbitron',sans-serif", fontSize: 13, fontWeight: 700,
            color: pointsSpent === tree.maxPoints ? COLORS.green : COLORS.goldLight,
          }}>
            {pointsSpent}/{tree.maxPoints}
          </div>
          <button onClick={resetTree} style={{
            fontFamily: "'Rajdhani',sans-serif", fontSize: 11, fontWeight: 700, padding: "5px 10px",
            borderRadius: 6, border: `1px solid ${COLORS.border}`, background: COLORS.surface2,
            color: COLORS.textMid, cursor: "pointer",
          }}>Fill All</button>
          <button onClick={clearTree} style={{
            fontFamily: "'Rajdhani',sans-serif", fontSize: 11, fontWeight: 700, padding: "5px 10px",
            borderRadius: 6, border: `1px solid ${COLORS.border}`, background: COLORS.surface2,
            color: COLORS.textMid, cursor: "pointer",
          }}>Clear</button>
        </div>
      </div>

      {/* Tree grid */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map(row => {
          const rowNodes = tree.nodes.filter(n => n.row === row);
          const unlocked = isRowUnlocked(row);
          const gate = tree.tierGates[row] ?? 0;
          const isCapstone = row === 4;

          return (
            <div key={row}>
              {/* Tier gate indicator */}
              {gate > 0 && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, marginBottom: 6, paddingLeft: 4,
                }}>
                  <div style={{
                    flex: 1, height: 1,
                    background: unlocked
                      ? `linear-gradient(90deg, ${pal.clr}44, transparent)`
                      : `linear-gradient(90deg, ${COLORS.textDim}44, transparent)`,
                  }} />
                  <span style={{
                    fontFamily: "'Orbitron',sans-serif", fontSize: 7, letterSpacing: 2,
                    color: unlocked ? pal.clr : COLORS.textDim,
                    padding: "2px 8px", borderRadius: 4,
                    background: unlocked ? pal.glow : "transparent",
                    border: `1px solid ${unlocked ? pal.clr + "44" : COLORS.borderSub}`,
                  }}>
                    {unlocked ? "✓" : "🔒"} {gate} PTS REQUIRED
                  </span>
                  <div style={{
                    flex: 1, height: 1,
                    background: unlocked
                      ? `linear-gradient(90deg, transparent, ${pal.clr}44)`
                      : `linear-gradient(90deg, transparent, ${COLORS.textDim}44)`,
                  }} />
                </div>
              )}

              {/* Nodes row */}
              <div style={{
                display: "grid",
                gridTemplateColumns: `repeat(${maxCol + 1}, 1fr)`,
                gap: 8,
              }}>
                {/* Fill empty cols */}
                {Array.from({ length: maxCol + 1 }, (_, col) => {
                  const node = rowNodes.find(n => n.col === col);
                  if (!node) return <div key={col} />;

                  const selected = state.selected.has(node.nodeId);
                  const selectable = canSelect(node);
                  const deselectable = canDeselect(node);
                  const isChoice = !!node.choiceB;
                  const choiceIsB = state.choices[node.nodeId] === "b";
                  const activeLabel = isChoice && choiceIsB ? node.choiceB!.label : node.label;
                  const activeDesc = isChoice && choiceIsB ? node.choiceB!.desc : node.desc;
                  const activeSpell = isChoice && choiceIsB ? node.choiceB!.spellId : node.spellId;
                  const locked = !unlocked || (!selected && !selectable);
                  const isHov = hovered === node.nodeId;

                  return (
                    <div key={col} style={{ position: "relative" }}
                      onMouseEnter={() => setHovered(node.nodeId)}
                      onMouseLeave={() => setHovered(null)}>
                      <div
                        onClick={() => !locked && toggleNode(node)}
                        style={{
                          borderRadius: isCapstone ? 12 : 10,
                          padding: isCapstone ? "14px 16px" : "10px 12px",
                          cursor: locked ? "not-allowed" : "pointer",
                          opacity: locked ? 0.4 : 1,
                          transition: "all .2s",
                          transform: isHov && !locked ? "scale(1.02)" : "scale(1)",
                          background: selected
                            ? isCapstone
                              ? `linear-gradient(135deg, ${pal.bg}, ${pal.bdr})`
                              : pal.glow
                            : COLORS.surface2,
                          border: `2px solid ${
                            selected
                              ? isCapstone ? pal.clr : pal.clr + "88"
                              : locked ? COLORS.borderSub : COLORS.border
                          }`,
                          boxShadow: selected
                            ? `0 0 12px ${pal.clr}22, inset 0 1px 0 ${pal.clr}11`
                            : "none",
                        }}
                      >
                        {/* Row/tier label */}
                        <div style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          marginBottom: 4,
                        }}>
                          <span style={{
                            fontFamily: "'Orbitron',sans-serif", fontSize: 7,
                            color: selected ? pal.clr : COLORS.textDim,
                            letterSpacing: 1.5,
                          }}>
                            {isCapstone ? "★ CAPSTONE" : `T${row}`}
                            {isChoice && (
                              <span style={{ color: COLORS.goldLight, marginLeft: 6 }}>◆ CHOICE</span>
                            )}
                          </span>
                          {/* Selection indicator */}
                          <div style={{
                            width: 14, height: 14, borderRadius: isCapstone ? 4 : 7,
                            border: `2px solid ${selected ? pal.clr : COLORS.textDim + "66"}`,
                            background: selected ? pal.clr : "transparent",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 8, color: selected ? "#000" : "transparent",
                            transition: "all .2s",
                          }}>
                            ✓
                          </div>
                        </div>

                        {/* Talent name */}
                        <div style={{
                          fontFamily: "'Rajdhani',sans-serif", fontSize: isCapstone ? 15 : 13,
                          fontWeight: 700,
                          color: selected ? pal.clr : COLORS.textSec,
                          marginBottom: 4,
                        }}>
                          {activeLabel}
                        </div>

                        {/* Description */}
                        <div style={{
                          fontFamily: "'Rajdhani',sans-serif",
                          fontSize: 11, color: COLORS.textMid, lineHeight: 1.45,
                          minHeight: 30,
                        }}>
                          {activeDesc}
                        </div>

                        {/* Spell ID badge */}
                        <div style={{
                          marginTop: 6, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
                        }}>
                          <span style={{
                            fontFamily: "'IBM Plex Mono',monospace", fontSize: 9,
                            color: COLORS.textDim, background: COLORS.surface3,
                            borderRadius: 3, padding: "1px 5px",
                          }}>
                            #{activeSpell}
                          </span>
                          {node.requires?.length ? (
                            <span style={{
                              fontFamily: "'Rajdhani',sans-serif", fontSize: 9,
                              color: COLORS.textDim,
                            }}>
                              🔗 {node.requires.length} prereq
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Choice swap button */}
                      {isChoice && selected && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleChoice(node.nodeId); }}
                          style={{
                            position: "absolute", bottom: -4, left: "50%", transform: "translateX(-50%)",
                            fontFamily: "'Rajdhani',sans-serif", fontSize: 9, fontWeight: 700,
                            padding: "2px 10px", borderRadius: 10,
                            background: COLORS.goldBg, border: `1px solid ${COLORS.gold}66`,
                            color: COLORS.goldLight, cursor: "pointer",
                            zIndex: 2, whiteSpace: "nowrap",
                          }}
                        >
                          ⇄ {choiceIsB ? node.label : node.choiceB!.label}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div style={{
        marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center",
      }}>
        <span style={{
          fontFamily: "'Orbitron',sans-serif", fontSize: 8, color: COLORS.textDim,
          letterSpacing: 2,
        }}>SELECTED:</span>
        {tree.nodes.filter(n => state.selected.has(n.nodeId)).map(n => {
          const isChoice = !!n.choiceB;
          const choiceIsB = state.choices[n.nodeId] === "b";
          const label = isChoice && choiceIsB ? n.choiceB!.label : n.label;
          return (
            <span key={n.nodeId} style={{
              fontFamily: "'Rajdhani',sans-serif", fontSize: 11, fontWeight: 600,
              padding: "2px 8px", borderRadius: 4,
              background: pal.glow, border: `1px solid ${pal.clr}44`,
              color: pal.clr,
            }}>
              {label}
            </span>
          );
        })}
        {pointsSpent === 0 && (
          <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: COLORS.textDim }}>
            No talents selected — click nodes to build your path
          </span>
        )}
      </div>
    </div>
  );
}
