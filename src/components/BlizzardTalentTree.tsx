// @ts-nocheck
/**
 * BlizzardTalentTree — Fully interactive Survival Hunter talent tree
 *
 * Three columns: Survival Spec (34 pts) | Hero (13 pts) | (future: Hunter Class)
 * Implements: click to select, right-click to deselect, row gates,
 * parent prerequisites, choice nodes, cascade deselection, reset buttons.
 */
import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  SURVIVAL_NODES, SENTINEL_NODES, PACK_LEADER_NODES, HUNTER_NODES,
  SPEC_ROW_GATES, CLASS_ROW_GATES, HERO_UNLOCK_THRESHOLD,
  SPEC_MAX_PTS, CLASS_MAX_PTS, HERO_MAX_PTS,
  WOWHEAD_ICON_FALLBACKS,
  SIM_TALENT_MAP,
  type TalentNodeDef, type NodeState,
} from "@/lib/talentData";
import { useTalentTree } from "@/hooks/useTalentTree";

// ── Visual constants ─────────────────────────────────────────
const GOLD        = "#C8A84B";
const GOLD_DIM    = "#7a5a20";
const GOLD_GLOW   = "rgba(200,168,75,.45)";
const NODE_FILL   = "#0e0a04";
const NODE_FILL_SEL = "#1a1200";
const LOCKED_RING = "#3a3a3a";
const LINE_LOCKED = "#2a2a2a";
const LINE_HALF   = "#5a3a10";
const LINE_ACTIVE = "#C8A84B";

const FALLBACK_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23110a03'/%3E%3Ctext x='32' y='40' text-anchor='middle' fill='%237a5a20' font-size='26' font-family='serif'%3E%3F%3C/text%3E%3C/svg%3E";

function resolveIcon(spellId: number | null | undefined): string {
  if (!spellId) return FALLBACK_ICON;
  return WOWHEAD_ICON_FALLBACKS[spellId] ?? FALLBACK_ICON;
}

// Hero tree row gates (simple 1-per-row within hero tree, after hero unlock)
const HERO_ROW_GATES: Record<number, number> = {
  1: 0, 2: 1, 3: 4, 4: 7, 5: 10,
};

// ── Point counter color ──────────────────────────────────────
function pointColor(pts: number, max: number): string {
  if (pts >= max) return "#38bdf8";
  if (pts >= 21) return GOLD;
  if (pts >= 11) return "#a07828";
  return "#666";
}

// ── Grid layout calculation ──────────────────────────────────
const CW = 52;  // col step
const RH = 56;  // row step
const PAD = 30;
const NODE_R = 20;

function gridBounds(nodes: TalentNodeDef[]) {
  const rows = nodes.map(n => n.row);
  const cols = nodes.map(n => n.col);
  const minRow = Math.min(...rows), maxRow = Math.max(...rows);
  const minCol = Math.min(...cols), maxCol = Math.max(...cols);
  const w = (maxCol - minCol) * CW + NODE_R * 2 + PAD * 2;
  const h = (maxRow - minRow) * RH + NODE_R * 2 + PAD * 2;
  return { minRow, maxRow, minCol, maxCol, w, h };
}

function nodePos(node: TalentNodeDef, minRow: number, minCol: number) {
  return {
    x: PAD + (node.col - minCol) * CW + NODE_R,
    y: PAD + (node.row - minRow) * RH + NODE_R,
  };
}

// ── Tooltip ──────────────────────────────────────────────────
interface TooltipInfo {
  name: string;
  desc: string;
  spellId: number | null;
  pts: number;
  maxPts: number;
  state: NodeState;
  ptsNeeded?: number;
}

function TalentTooltip({ info, x, y }: { info: TooltipInfo; x: number; y: number }) {
  const left = Math.min(x + 14, window.innerWidth - 300);
  const top = Math.min(y - 8, window.innerHeight - 200);
  return (
    <div style={{
      position: "fixed", left, top, zIndex: 10000,
      background: "linear-gradient(160deg,#1c1005 0%,#0d0a02 100%)",
      border: `1px solid ${GOLD_DIM}`, borderTop: `2px solid ${GOLD}`,
      borderRadius: 4, padding: "10px 14px", maxWidth: 280,
      pointerEvents: "none",
      boxShadow: `0 0 24px rgba(0,0,0,.85),inset 0 1px 0 ${GOLD_DIM}60`,
    }}>
      <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, fontWeight: 700,
        color: GOLD, marginBottom: 2, letterSpacing: 0.5 }}>
        {info.name}
      </div>
      {info.spellId && (
        <div style={{ fontSize: 9, color: "#555", marginBottom: 4, fontFamily: "monospace" }}>
          #{info.spellId}
        </div>
      )}
      {info.maxPts > 1 && (
        <div style={{ fontSize: 10, color: GOLD_DIM, marginBottom: 4, fontFamily: "monospace" }}>
          {info.pts} / {info.maxPts}
        </div>
      )}
      <div style={{ fontSize: 12, color: "#b8a878", lineHeight: 1.55, fontFamily: "'Rajdhani',sans-serif", whiteSpace: "pre-line" }}>
        {info.desc}
      </div>
      {info.state === 'LOCKED' && info.ptsNeeded !== undefined && info.ptsNeeded > 0 && (
        <div style={{ fontSize: 11, color: "#f87171", marginTop: 6, fontFamily: "'Rajdhani',sans-serif" }}>
          Requires {info.ptsNeeded} more talent points
        </div>
      )}
    </div>
  );
}

// ── Connection Lines ─────────────────────────────────────────
function ConnectionLines({
  nodes, minRow, minCol, w, h, pointsMap,
}: {
  nodes: TalentNodeDef[];
  minRow: number; minCol: number; w: number; h: number;
  pointsMap: Record<string, number>;
}) {
  const lines = useMemo(() => {
    const result: React.ReactNode[] = [];
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    nodes.forEach(node => {
      node.parents.forEach(pid => {
        const parent = nodeMap.get(pid);
        if (!parent) return;
        const from = nodePos(parent, minRow, minCol);
        const to = nodePos(node, minRow, minCol);
        const parentOn = (pointsMap[pid] ?? 0) > 0;
        const nodeOn = (pointsMap[node.id] ?? 0) > 0;

        let stroke: string, opacity: number;
        if (parentOn && nodeOn) {
          stroke = LINE_ACTIVE;
          opacity = 0.7;
        } else if (parentOn || nodeOn) {
          stroke = LINE_HALF;
          opacity = 0.8;
        } else {
          stroke = LINE_LOCKED;
          opacity = 0.6;
        }

        result.push(
          <line key={`${pid}-${node.id}`}
            x1={from.x} y1={from.y} x2={to.x} y2={to.y}
            stroke={stroke} strokeWidth={1.5} opacity={opacity}
          />
        );
      });
    });
    return result;
  }, [nodes, minRow, minCol, pointsMap]);

  return (
    <svg width={w} height={h}
      style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
      {lines}
    </svg>
  );
}

// ── Single Talent Node ───────────────────────────────────────
function InteractiveTalentNode({
  node, nodeState, pts, choiceSide,
  onLeftClick, onRightClick, onChoiceClick, onHover,
}: {
  node: TalentNodeDef;
  nodeState: NodeState;
  pts: number;
  choiceSide: 0 | 1 | undefined;
  onLeftClick: () => void;
  onRightClick: (e: React.MouseEvent) => void;
  onChoiceClick: (side: 0 | 1) => void;
  onHover: (info: TooltipInfo | null, x: number, y: number) => void;
}) {
  const isChoice = node.type === 'choice';
  const isApex = node.type === 'apex';
  const isCapstone = node.row === 5 && node.parents.length >= 3;
  const sz = isApex ? 52 : 40;

  const ringColor = nodeState === 'SELECTED' ? GOLD
    : nodeState === 'PARTIAL' ? GOLD
    : nodeState === 'AVAILABLE' ? GOLD_DIM
    : LOCKED_RING;

  const fillColor = (nodeState === 'SELECTED' || nodeState === 'PARTIAL') ? NODE_FILL_SEL : NODE_FILL;
  const glow = nodeState === 'SELECTED'
    ? `0 0 0 2px ${GOLD_GLOW}, 0 0 14px 3px ${GOLD_GLOW}` : undefined;
  const brightness = nodeState === 'SELECTED' ? 1 : nodeState === 'PARTIAL' ? 0.7 : nodeState === 'AVAILABLE' ? 0.5 : 0.2;
  const cursor = nodeState === 'LOCKED' ? 'not-allowed'
    : (nodeState === 'AVAILABLE' || nodeState === 'PARTIAL') ? 'pointer'
    : 'pointer'; // SELECTED can be right-clicked

  const handleEnter = (e: React.MouseEvent) => {
    if (isChoice) {
      const nameA = node.choiceA?.name ?? "Option A";
      const nameB = node.choiceB?.name ?? "Option B";
      const descA = node.choiceA?.desc ?? "";
      const descB = node.choiceB?.desc ?? "";
      const marker = choiceSide === 0 ? `► ${nameA}: ${descA}\n\n${nameB}: ${descB}`
        : choiceSide === 1 ? `${nameA}: ${descA}\n\n► ${nameB}: ${descB}`
        : `${nameA}: ${descA}\n\n${nameB}: ${descB}`;
      onHover({
        name: `${nameA} / ${nameB}`,
        desc: marker,
        spellId: null,
        pts, maxPts: node.maxPts, state: nodeState,
      }, e.clientX, e.clientY);
    } else {
      onHover({
        name: node.name,
        desc: node.desc,
        spellId: node.spellId,
        pts, maxPts: node.maxPts, state: nodeState,
      }, e.clientX, e.clientY);
    }
  };

  // CHOICE NODE
  if (isChoice) {
    const iconA = resolveIcon(node.choiceA?.spellId);
    const iconB = resolveIcon(node.choiceB?.spellId);
    const brightA = (nodeState === 'SELECTED' || nodeState === 'PARTIAL') && choiceSide === 0 ? 1 : brightness * 0.6;
    const brightB = (nodeState === 'SELECTED' || nodeState === 'PARTIAL') && choiceSide === 1 ? 1 : brightness * 0.6;

    return (
      <div
        style={{
          width: sz, height: sz, borderRadius: "50%",
          border: `1.5px solid ${ringColor}`, boxShadow: glow,
          overflow: "hidden", cursor, position: "relative",
          background: fillColor, display: "flex",
        }}
        onMouseEnter={handleEnter}
        onMouseMove={(e) => handleEnter(e)}
        onMouseLeave={() => onHover(null, 0, 0)}
        onContextMenu={onRightClick}
      >
        {/* Left half */}
        <div onClick={() => { if (nodeState !== 'LOCKED') onChoiceClick(0); }}
          style={{ width: "50%", height: "100%", overflow: "hidden", position: "relative", flexShrink: 0 }}>
          <img src={iconA} alt="" loading="lazy" draggable={false}
            onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_ICON; }}
            style={{ width: sz, height: sz, objectFit: "cover", position: "absolute", left: 0, top: 0,
              filter: `brightness(${brightA})`, transition: "filter .15s" }} />
        </div>
        {/* Right half */}
        <div onClick={() => { if (nodeState !== 'LOCKED') onChoiceClick(1); }}
          style={{ width: "50%", height: "100%", overflow: "hidden", position: "relative", flexShrink: 0 }}>
          <img src={iconB} alt="" loading="lazy" draggable={false}
            onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_ICON; }}
            style={{ width: sz, height: sz, objectFit: "cover", position: "absolute", left: -(sz / 2), top: 0,
              filter: `brightness(${brightB})`, transition: "filter .15s" }} />
        </div>
        {/* Dashed divider */}
        <div style={{
          position: "absolute", left: "50%", top: 4, bottom: 4, width: 1,
          transform: "translateX(-50%)",
          background: `repeating-linear-gradient(to bottom,${GOLD_DIM} 0,${GOLD_DIM} 3px,transparent 3px,transparent 5px)`,
          pointerEvents: "none",
        }} />
        {/* Inner ring */}
        <div style={{ position: "absolute", inset: 4, borderRadius: "50%",
          border: `1px solid #3a2a08`, pointerEvents: "none" }} />
      </div>
    );
  }

  // STANDARD / APEX NODE
  const iconUrl = resolveIcon(node.spellId);
  const outerStrokeW = (isCapstone || isApex) ? 2.5 : 1.5;

  // Partial state: half-gold arc using SVG overlay
  const showPartialArc = nodeState === 'PARTIAL';

  return (
    <div
      onClick={() => {
        if (nodeState === 'AVAILABLE' || nodeState === 'PARTIAL') onLeftClick();
      }}
      onContextMenu={onRightClick}
      onMouseEnter={handleEnter}
      onMouseMove={(e) => handleEnter(e)}
      onMouseLeave={() => onHover(null, 0, 0)}
      style={{
        width: sz, height: sz, borderRadius: "50%",
        border: `${outerStrokeW}px solid ${ringColor}`,
        boxShadow: glow ?? ((isCapstone || isApex) && nodeState === 'SELECTED'
          ? `0 0 18px 4px ${GOLD_GLOW}` : undefined),
        cursor, position: "relative", overflow: "hidden",
        background: fillColor, transition: "border-color .15s,box-shadow .15s",
      }}
    >
      <img src={iconUrl} alt="" loading="lazy" draggable={false}
        onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_ICON; }}
        style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%",
          filter: `brightness(${brightness})`, transition: "filter .15s" }} />
      {/* Inner ring */}
      <div style={{ position: "absolute", inset: isApex ? 6 : 4, borderRadius: "50%",
        border: `1px solid #3a2a08`, pointerEvents: "none" }} />
      {/* Partial arc overlay */}
      {showPartialArc && (
        <svg style={{ position: "absolute", inset: -outerStrokeW, width: sz + outerStrokeW * 2, height: sz + outerStrokeW * 2, pointerEvents: "none" }}>
          <circle
            cx={(sz + outerStrokeW * 2) / 2} cy={(sz + outerStrokeW * 2) / 2}
            r={(sz / 2) + outerStrokeW / 2}
            fill="none" stroke={GOLD} strokeWidth={outerStrokeW}
            strokeDasharray={`${Math.PI * sz * (pts / node.maxPts)} ${Math.PI * sz}`}
            transform={`rotate(-90 ${(sz + outerStrokeW * 2) / 2} ${(sz + outerStrokeW * 2) / 2})`}
          />
        </svg>
      )}
      {/* Rank badge for multi-point nodes */}
      {node.maxPts > 1 && (
        <div style={{
          position: "absolute", bottom: -2, right: -2,
          background: pts > 0 ? "#1c1005" : "#0d0a02",
          border: `1px solid ${pts > 0 ? GOLD : GOLD_DIM}`,
          borderRadius: 3, padding: "0 3px",
          fontSize: 8, fontWeight: 700, lineHeight: "13px",
          color: pts > 0 ? GOLD : GOLD_DIM,
          fontFamily: "'Rajdhani',sans-serif", pointerEvents: "none",
        }}>
          {pts}/{node.maxPts}
        </div>
      )}
    </div>
  );
}

// ── Tree Section ─────────────────────────────────────────────
function TreeSection({
  label, nodes, maxPts, rowGates, externalGateMet = true,
  onTalentChange,
}: {
  label: string;
  nodes: TalentNodeDef[];
  maxPts: number;
  rowGates: Record<number, number>;
  externalGateMet?: boolean;
  onTalentChange?: (nodeId: string, pts: number, choiceSide?: 0 | 1) => void;
}) {
  const tree = useTalentTree(nodes, maxPts, rowGates, externalGateMet);
  const { minRow, minCol, w, h } = useMemo(() => gridBounds(nodes), [nodes]);

  const [tooltip, setTooltip] = useState<{ info: TooltipInfo; x: number; y: number } | null>(null);
  const tipTimer = useRef<number>();

  const handleHover = useCallback((info: TooltipInfo | null, x: number, y: number) => {
    clearTimeout(tipTimer.current);
    if (!info) {
      tipTimer.current = window.setTimeout(() => setTooltip(null), 80);
    } else {
      // Calculate ptsNeeded for locked nodes
      if (info.state === 'LOCKED') {
        const node = nodes.find(n => n.name === info.name);
        if (node) {
          const gate = rowGates[node.row] ?? 0;
          info.ptsNeeded = Math.max(0, gate - tree.totalPoints);
        }
      }
      setTooltip({ info, x, y });
    }
  }, [nodes, rowGates, tree.totalPoints]);

  const handleRightClick = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    tree.deallocatePoint(nodeId);
    onTalentChange?.(nodeId, Math.max(0, (tree.state.points[nodeId] ?? 0) - 1));
  }, [tree, onTalentChange]);

  const handleLeftClick = useCallback((nodeId: string) => {
    tree.allocatePoint(nodeId);
    onTalentChange?.(nodeId, (tree.state.points[nodeId] ?? 0) + 1);
  }, [tree, onTalentChange]);

  const handleChoice = useCallback((nodeId: string, side: 0 | 1) => {
    tree.selectChoice(nodeId, side);
    onTalentChange?.(nodeId, 1, side);
  }, [tree, onTalentChange]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", width: "100%" }}>
        <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, fontWeight: 700,
          letterSpacing: 3, color: GOLD, textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, fontWeight: 700,
          color: pointColor(tree.totalPoints, maxPts) }}>
          {tree.totalPoints} / {maxPts}
        </span>
        <button
          onClick={() => tree.reset()}
          title="Reset tree"
          style={{
            width: 22, height: 22, borderRadius: 4, border: `1px solid #444`,
            background: "#222", color: "#888", cursor: "pointer", fontSize: 12,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "border-color .15s, color .15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.color = GOLD; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.color = "#888"; }}
        >
          ↺
        </button>
      </div>

      {/* Tree panel */}
      <div style={{
        position: "relative", width: w, height: h,
        background: "transparent",
      }}>
        <ConnectionLines
          nodes={nodes} minRow={minRow} minCol={minCol}
          w={w} h={h} pointsMap={tree.state.points}
        />

        {nodes.map(node => {
          const pos = nodePos(node, minRow, minCol);
          const nodeState = tree.getNodeState(node);
          const pts = tree.state.points[node.id] ?? 0;
          const choiceSide = tree.state.choiceSelections[node.id];
          const isApex = node.type === 'apex';
          const sz = isApex ? 52 : 40;

          return (
            <div key={node.id} style={{
              position: "absolute",
              left: pos.x - sz / 2,
              top: pos.y - sz / 2,
              zIndex: 3,
            }}>
              <InteractiveTalentNode
                node={node}
                nodeState={nodeState}
                pts={pts}
                choiceSide={choiceSide}
                onLeftClick={() => handleLeftClick(node.id)}
                onRightClick={(e) => handleRightClick(e, node.id)}
                onChoiceClick={(side) => handleChoice(node.id, side)}
                onHover={handleHover}
              />
            </div>
          );
        })}
      </div>

      {tooltip && <TalentTooltip info={tooltip.info} x={tooltip.x} y={tooltip.y} />}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────
export interface BlizzardTalentTreeProps {
  specSelectedKeys?: string[];
  onSpecToggle?: (key: string, selected: boolean) => void;
  heroKey?: "sentinel" | "packLeader";
  onHeroChange?: (hero: "sentinel" | "packLeader") => void;
  heroSelectedKeys?: string[];
  onHeroToggle?: (key: string, selected: boolean) => void;
  classSelectedKeys?: string[];
  onClassToggle?: (key: string, selected: boolean) => void;
  onTalentConfigChange?: (config: Record<string, any>) => void;
}

export function BlizzardTalentTree({
  heroKey: heroKeyProp,
  onHeroChange,
  onTalentConfigChange,
  onClassToggle,
  classSelectedKeys,
}: BlizzardTalentTreeProps) {
  const [internalHeroKey, setInternalHeroKey] = useState<"sentinel" | "packLeader">("sentinel");
  const activeHeroKey = heroKeyProp ?? internalHeroKey;

  const [specTotalPts, setSpecTotalPts] = useState(0);

  const heroNodes = activeHeroKey === "sentinel" ? SENTINEL_NODES : PACK_LEADER_NODES;
  const heroGateMet = specTotalPts >= HERO_UNLOCK_THRESHOLD;

  const isSentinel = activeHeroKey === "sentinel";

  const handleSpecChange = useCallback((nodeId: string, pts: number) => {
    // Recalculate total from the tree section internally
    // We track this via a ref-based approach
  }, []);

  const handleHeroSwitch = useCallback(() => {
    const newKey = activeHeroKey === "sentinel" ? "packLeader" : "sentinel";
    if (onHeroChange) onHeroChange(newKey);
    else setInternalHeroKey(newKey);
  }, [activeHeroKey, onHeroChange]);

  return (
    <div style={{ userSelect: "none" }}>
      <div style={{ overflowX: "auto", overflowY: "visible" }}>
        <div style={{
          display: "flex", gap: 16, alignItems: "flex-start",
          justifyContent: "center",
          minWidth: "fit-content", padding: "8px 8px 16px",
        }}>
          {/* HUNTER CLASS TREE (left) */}
          <TreeSection
            label="HUNTER"
            nodes={HUNTER_NODES}
            maxPts={CLASS_MAX_PTS}
            rowGates={CLASS_ROW_GATES}
          />

          {/* HERO TREE (center) */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            {/* Hero switcher */}
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {(["sentinel", "packLeader"] as const).map(h => {
                const isActive = activeHeroKey === h;
                const clr = h === "sentinel" ? "#7dd3fc" : "#d8b4fe";
                return (
                  <button key={h}
                    onClick={() => {
                      if (onHeroChange) onHeroChange(h);
                      else setInternalHeroKey(h);
                    }}
                    style={{
                      fontFamily: "'Rajdhani',sans-serif", fontSize: 11, fontWeight: 700,
                      padding: "4px 12px", borderRadius: 6, cursor: "pointer",
                      border: `1px solid ${isActive ? clr : "#444"}`,
                      background: isActive ? `${clr}22` : "#111",
                      color: isActive ? clr : "#666",
                      transition: "all .15s",
                    }}>
                    {h === "sentinel" ? "🌙 Sentinel" : "🐺 Pack Leader"}
                  </button>
                );
              })}
            </div>

            {!heroGateMet && (
              <div style={{ fontSize: 10, color: "#f87171", marginBottom: 6, fontFamily: "'Rajdhani',sans-serif" }}>
                Requires {HERO_UNLOCK_THRESHOLD} spec points to unlock
              </div>
            )}

            <TreeSection
              label={isSentinel ? "SENTINEL" : "PACK LEADER"}
              nodes={heroNodes}
              maxPts={HERO_MAX_PTS}
              rowGates={HERO_ROW_GATES}
              externalGateMet={heroGateMet}
            />
          </div>

          {/* SURVIVAL SPEC TREE (right) */}
          <SpecTreeSection onTotalChange={setSpecTotalPts} />
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:.35} 50%{opacity:.7} }
      `}</style>
    </div>
  );
}

// Wrapper for spec tree that reports total points upward
function SpecTreeSection({ onTotalChange }: { onTotalChange: (pts: number) => void }) {
  const tree = useTalentTree(SURVIVAL_NODES, SPEC_MAX_PTS, SPEC_ROW_GATES, true);
  const { minRow, minCol, w, h } = useMemo(() => gridBounds(SURVIVAL_NODES), []);

  // Report total points changes
  const prevTotal = useRef(0);
  if (tree.totalPoints !== prevTotal.current) {
    prevTotal.current = tree.totalPoints;
    // Use setTimeout to avoid setState during render
    setTimeout(() => onTotalChange(tree.totalPoints), 0);
  }

  const [tooltip, setTooltip] = useState<{ info: TooltipInfo; x: number; y: number } | null>(null);
  const tipTimer = useRef<number>();

  const handleHover = useCallback((info: TooltipInfo | null, x: number, y: number) => {
    clearTimeout(tipTimer.current);
    if (!info) {
      tipTimer.current = window.setTimeout(() => setTooltip(null), 80);
    } else {
      if (info.state === 'LOCKED') {
        const node = SURVIVAL_NODES.find(n => n.name === info.name);
        if (node) {
          const gate = SPEC_ROW_GATES[node.row] ?? 0;
          info.ptsNeeded = Math.max(0, gate - tree.totalPoints);
        }
      }
      setTooltip({ info, x, y });
    }
  }, [tree.totalPoints]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", width: "100%" }}>
        <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, fontWeight: 700,
          letterSpacing: 3, color: GOLD, textTransform: "uppercase" }}>SURVIVAL</span>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, fontWeight: 700,
          color: pointColor(tree.totalPoints, SPEC_MAX_PTS) }}>
          {tree.totalPoints} / {SPEC_MAX_PTS}
        </span>
        <button
          onClick={() => tree.reset()}
          title="Reset tree"
          style={{
            width: 22, height: 22, borderRadius: 4, border: `1px solid #444`,
            background: "#222", color: "#888", cursor: "pointer", fontSize: 12,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.color = GOLD; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.color = "#888"; }}
        >
          ↺
        </button>
      </div>

      {/* Tree panel */}
      <div style={{
        position: "relative", width: w, height: h,
        background: "linear-gradient(180deg,rgba(22,12,4,.95) 0%,rgba(10,5,2,.98) 100%)",
        border: `1px solid ${GOLD_DIM}50`,
        borderTop: `2px solid ${GOLD}40`,
        borderRadius: 6,
        boxShadow: `0 0 40px rgba(200,168,75,.05),inset 0 1px 0 ${GOLD_DIM}20`,
      }}>
        <ConnectionLines
          nodes={SURVIVAL_NODES} minRow={minRow} minCol={minCol}
          w={w} h={h} pointsMap={tree.state.points}
        />

        {SURVIVAL_NODES.map(node => {
          const pos = nodePos(node, minRow, minCol);
          const nodeState = tree.getNodeState(node);
          const pts = tree.state.points[node.id] ?? 0;
          const choiceSide = tree.state.choiceSelections[node.id];
          const isApex = node.type === 'apex';
          const sz = isApex ? 52 : 40;

          return (
            <div key={node.id} style={{
              position: "absolute",
              left: pos.x - sz / 2,
              top: pos.y - sz / 2,
              zIndex: 3,
            }}>
              <InteractiveTalentNode
                node={node}
                nodeState={nodeState}
                pts={pts}
                choiceSide={choiceSide}
                onLeftClick={() => tree.allocatePoint(node.id)}
                onRightClick={(e) => { e.preventDefault(); tree.deallocatePoint(node.id); }}
                onChoiceClick={(side) => tree.selectChoice(node.id, side)}
                onHover={handleHover}
              />
            </div>
          );
        })}
      </div>

      {tooltip && <TalentTooltip info={tooltip.info} x={tooltip.x} y={tooltip.y} />}
    </div>
  );
}

export default BlizzardTalentTree;
