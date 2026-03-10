// @ts-nocheck

/**
 * BlizzardTalentTree — Fully interactive Survival Hunter talent tree
 *
 * Three columns: Survival Spec (34 pts) | Hero (13 pts) | (future: Hunter Class)
 * Implements: click to select, right-click to deselect, row gates,
 * parent prerequisites, choice nodes, cascade deselection, reset buttons.
 */
import React, { useState, useCallback, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import heroSentinelImg from "@/assets/hero-sentinel.png";
import heroPackLeaderImg from "@/assets/hero-pack-leader.png";
import {
  SURVIVAL_NODES, SENTINEL_NODES, PACK_LEADER_NODES, HUNTER_NODES, APEX_NODES,
  SPEC_ROW_GATES, CLASS_ROW_GATES, HERO_UNLOCK_THRESHOLD,
  SPEC_MAX_PTS, CLASS_MAX_PTS, HERO_MAX_PTS,
  WOWHEAD_ICON_FALLBACKS,
  SIM_TALENT_MAP,
  type TalentNodeDef, type NodeState,
} from "@/lib/talentData";
import { useTalentTree, type UseTalentTreeReturn } from "@/hooks/useTalentTree";
import { getPresetBuild } from "@/lib/presetBuilds";
import type { FightStyle } from "@/utils/simcProfileBuilder";

// ── Visual constants ─────────────────────────────────────────
const GOLD        = "#C8A84B";
const GOLD_DIM    = "#7a5a20";
const GOLD_GLOW   = "rgba(200,168,75,.45)";
const NODE_FILL   = "#0e0a04";
const NODE_FILL_SEL = "#1a1200";
const LOCKED_RING = "#3a3a3a";
const LINE_LOCKED = "#555555";
const LINE_HALF   = "#8a6a30";
const LINE_ACTIVE = "#C8A84B";

const FALLBACK_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23110a03'/%3E%3C/svg%3E";

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
// Standard size (Hunter class + Survival spec)
const CW = 62;  // col step
const RH = 66;  // row step
const PAD = 32;
const NODE_R = 24;

// Compact size (Hero trees + Apex)
const CW_C = 32;
const RH_C = 56;
const PAD_C = 16;
const NODE_R_C = 20;

function gridBounds(nodes: TalentNodeDef[], compact = false) {
  const cw = compact ? CW_C : CW;
  const rh = compact ? RH_C : RH;
  const pad = compact ? PAD_C : PAD;
  const nr = compact ? NODE_R_C : NODE_R;
  const rows = nodes.map(n => n.row);
  const cols = nodes.map(n => n.col);
  const minRow = Math.min(...rows), maxRow = Math.max(...rows);
  const minCol = Math.min(...cols), maxCol = Math.max(...cols);
  const w = (maxCol - minCol) * cw + nr * 2 + pad * 2;
  const h = (maxRow - minRow) * rh + nr * 2 + pad * 2;
  return { minRow, maxRow, minCol, maxCol, w, h };
}

function nodePos(node: TalentNodeDef, minRow: number, minCol: number, compact = false) {
  const cw = compact ? CW_C : CW;
  const rh = compact ? RH_C : RH;
  const pad = compact ? PAD_C : PAD;
  const nr = compact ? NODE_R_C : NODE_R;
  return {
    x: pad + (node.col - minCol) * cw + nr,
    y: pad + (node.row - minRow) * rh + nr,
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
  choiceASpellId?: number;
  choiceBSpellId?: number;
  choiceSide?: 0 | 1;
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
  nodes, minRow, minCol, w, h, pointsMap, compact = false,
}: {
  nodes: TalentNodeDef[];
  minRow: number; minCol: number; w: number; h: number;
  pointsMap: Record<string, number>;
  compact?: boolean;
}) {
  const lines = useMemo(() => {
    const result: React.ReactNode[] = [];
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    nodes.forEach(node => {
      node.parents.forEach(pid => {
        const parent = nodeMap.get(pid);
        if (!parent) return;
        const from = nodePos(parent, minRow, minCol, compact);
        const to = nodePos(node, minRow, minCol, compact);
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
  }, [nodes, minRow, minCol, pointsMap, compact]);

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
  const isTier = node.id.startsWith('apex_tier');
  const isCapstone = node.row === 5 && node.parents.length >= 3;
  const sz = isApex ? 58 : isTier ? 32 : 46;

  const ringColor = nodeState === 'SELECTED' ? GOLD
    : nodeState === 'PARTIAL' ? GOLD
    : nodeState === 'AVAILABLE' ? GOLD_DIM
    : LOCKED_RING;

  const fillColor = (nodeState === 'SELECTED' || nodeState === 'PARTIAL') ? NODE_FILL_SEL : NODE_FILL;
  const emboss = isApex
    ? `0 0 0 3px ${GOLD_GLOW}, 0 4px 12px 2px rgba(0,0,0,.7), inset 0 2px 4px rgba(200,168,75,.25), inset 0 -2px 4px rgba(0,0,0,.5), 0 0 24px 6px ${GOLD_GLOW}`
    : undefined;
  const glow = nodeState === 'SELECTED'
    ? (isApex ? emboss! : `0 0 0 3px ${GOLD_GLOW}, 0 0 18px 5px ${GOLD_GLOW}`)
    : isApex
      ? `0 0 0 2px rgba(122,90,32,.4), 0 4px 10px 2px rgba(0,0,0,.6), inset 0 2px 3px rgba(200,168,75,.15), inset 0 -2px 3px rgba(0,0,0,.4), 0 0 16px 4px rgba(122,90,32,.2)`
      : `0 0 0 1px rgba(122,90,32,.3), 0 0 8px 2px rgba(122,90,32,.15)`;
  const imgFilter = (nodeState === 'SELECTED') ? 'none' : 'grayscale(1) brightness(0.75)';
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
        choiceASpellId: node.choiceA?.spellId,
        choiceBSpellId: node.choiceB?.spellId,
        choiceSide: choiceSide,
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
    const filterA = (nodeState === 'SELECTED' || nodeState === 'PARTIAL') && choiceSide === 0 ? 'none' : 'grayscale(1) brightness(0.75)';
    const filterB = (nodeState === 'SELECTED' || nodeState === 'PARTIAL') && choiceSide === 1 ? 'none' : 'grayscale(1) brightness(0.75)';

    const hexClip = "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";
    const hexInset = "polygon(28% 3%, 72% 3%, 97% 50%, 72% 97%, 28% 97%, 3% 50%)";

    return (
      <div
        style={{
          width: sz, height: sz, position: "relative", cursor,
        }}
        onMouseEnter={handleEnter}
        onMouseMove={(e) => handleEnter(e)}
        onMouseLeave={() => onHover(null, 0, 0)}
        onContextMenu={onRightClick}
      >
        {/* Hex border background */}
        <div style={{
          position: "absolute", inset: -2.5,
          clipPath: hexClip,
          background: ringColor,
          boxShadow: glow,
        }} />
        {/* Hex content area */}
        <div style={{
          position: "absolute", inset: 0,
          clipPath: hexClip,
          overflow: "hidden",
          background: NODE_FILL,
          display: "flex",
        }}>
          {/* Left half */}
          <div onClick={() => { if (nodeState !== 'LOCKED') onChoiceClick(0); }}
            style={{
              width: "50%", height: "100%", flexShrink: 0,
              backgroundImage: `url(${iconA})`,
              backgroundSize: `${sz}px ${sz}px`,
              backgroundPosition: "left center",
              backgroundRepeat: "no-repeat",
              filter: filterA, transition: "filter .15s",
            }} />
          {/* Right half */}
          <div onClick={() => { if (nodeState !== 'LOCKED') onChoiceClick(1); }}
            style={{
              width: "50%", height: "100%", flexShrink: 0,
              backgroundImage: `url(${iconB})`,
              backgroundSize: `${sz}px ${sz}px`,
              backgroundPosition: "right center",
              backgroundRepeat: "no-repeat",
              filter: filterB, transition: "filter .15s",
            }} />
          {/* Dashed divider */}
          <div style={{
            position: "absolute", left: "50%", top: 4, bottom: 4, width: 1,
            transform: "translateX(-50%)",
            background: `repeating-linear-gradient(to bottom,${GOLD_DIM} 0,${GOLD_DIM} 3px,transparent 3px,transparent 5px)`,
            pointerEvents: "none",
          }} />
        </div>
      </div>
    );
  }

  // STANDARD / APEX NODE
  const iconUrl = resolveIcon(node.spellId);
  const outerStrokeW = (isCapstone || isApex) ? 3.5 : 2.5;

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
        background: "transparent", transition: "border-color .15s,box-shadow .15s",
      }}
    >
      <img src={iconUrl} alt="" loading="lazy" draggable={false}
        onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_ICON; }}
        style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%",
          filter: imgFilter, transition: "filter .15s" }} />
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
  onTalentChange, compact = false, tree: externalTree,
  onGlobalHover,
}: {
  label: string;
  nodes: TalentNodeDef[];
  maxPts: number;
  rowGates: Record<number, number>;
  externalGateMet?: boolean;
  onTalentChange?: (nodeId: string, pts: number, choiceSide?: 0 | 1) => void;
  compact?: boolean;
  tree?: UseTalentTreeReturn;
  onGlobalHover?: (info: TooltipInfo | null) => void;
}) {
  const internalTree = useTalentTree(nodes, maxPts, rowGates, externalGateMet);
  const tree = externalTree ?? internalTree;
  const { minRow, minCol, w, h } = useMemo(() => gridBounds(nodes, compact), [nodes, compact]);

  const tipTimer = useRef<number>();

  const handleHover = useCallback((info: TooltipInfo | null, _x: number, _y: number) => {
    clearTimeout(tipTimer.current);
    if (!info) {
      tipTimer.current = window.setTimeout(() => onGlobalHover?.(null), 80);
    } else {
      if (info.state === 'LOCKED') {
        const node = nodes.find(n => n.name === info.name);
        if (node) {
          const gate = rowGates[node.row] ?? 0;
          info.ptsNeeded = Math.max(0, gate - tree.totalPoints);
        }
      }
      onGlobalHover?.(info);
    }
  }, [nodes, rowGates, tree.totalPoints, onGlobalHover]);

  const handleRightClick = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    const node = nodes.find(n => n.id === nodeId);
    if (node?.type === 'choice') {
      tree.selectChoice(nodeId, -1);
      onTalentChange?.(nodeId, 0);
    } else {
      tree.deallocatePoint(nodeId);
      onTalentChange?.(nodeId, Math.max(0, (tree.state.points[nodeId] ?? 0) - 1));
    }
  }, [tree, nodes, onTalentChange]);

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
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: "100%" }}>
        {!compact && <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 16, fontWeight: 700,
          letterSpacing: 3, color: GOLD, textTransform: "uppercase" }}>{label}</span>}
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 700,
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
          w={w} h={h} pointsMap={tree.state.points} compact={compact}
        />

        {nodes.map(node => {
          const pos = nodePos(node, minRow, minCol, compact);
          const nodeState = tree.getNodeState(node);
          const pts = tree.state.points[node.id] ?? 0;
          const choiceSide = tree.state.choiceSelections[node.id];
          const isApex = node.type === 'apex';
          const sz = compact ? (isApex ? 48 : 40) : (isApex ? 58 : 46);

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
  fightStyle?: FightStyle;
}

export interface BlizzardTalentTreeHandle {
  getSelectedTalents: () => { nodeId: string; spellId: number; name: string; rank: number; section: "class" | "spec" | "hero" }[];
  getActiveHeroKey: () => "sentinel" | "packLeader";
}

export const BlizzardTalentTree = forwardRef<BlizzardTalentTreeHandle, BlizzardTalentTreeProps>(function BlizzardTalentTree({
  heroKey: heroKeyProp,
  onHeroChange,
  onTalentConfigChange,
  onClassToggle,
  classSelectedKeys,
  fightStyle,
}, ref) {
  const [internalHeroKey, setInternalHeroKey] = useState<"sentinel" | "packLeader">("sentinel");
  const activeHeroKey = heroKeyProp ?? internalHeroKey;

  const [specTotalPts, setSpecTotalPts] = useState(0);

  // Global tooltip state — all trees feed into this, rendered below Apex
  const [globalTooltip, setGlobalTooltip] = useState<TooltipInfo | null>(null);
  const globalTipTimer = useRef<number>();
  const handleGlobalHover = useCallback((info: TooltipInfo | null) => {
    clearTimeout(globalTipTimer.current);
    if (!info) {
      globalTipTimer.current = window.setTimeout(() => setGlobalTooltip(null), 120);
    } else {
      setGlobalTooltip(info);
    }
  }, []);

  const heroNodes = activeHeroKey === "sentinel" ? SENTINEL_NODES : PACK_LEADER_NODES;
  const heroGateMet = true; // Hero tree always unlocked

  const isSentinel = activeHeroKey === "sentinel";

  const handleSpecChange = useCallback((nodeId: string, pts: number) => {
    // Recalculate total from the tree section internally
  }, []);

  const handleHeroSwitch = useCallback(() => {
    const newKey = activeHeroKey === "sentinel" ? "packLeader" : "sentinel";
    if (onHeroChange) onHeroChange(newKey);
    else setInternalHeroKey(newKey);
  }, [activeHeroKey, onHeroChange]);

  // Combined survival + apex nodes share 34-pt budget
  const allSpecNodes = useMemo(() => [...SURVIVAL_NODES, ...APEX_NODES], []);
  const specTree = useTalentTree(allSpecNodes, SPEC_MAX_PTS, SPEC_ROW_GATES, true);

  // Hero tree lifted to parent level for preset loading
  const heroTree = useTalentTree(heroNodes, HERO_MAX_PTS, HERO_ROW_GATES, heroGateMet);

  // Class tree lifted for export access
  const classTree = useTalentTree(HUNTER_NODES, CLASS_MAX_PTS, CLASS_ROW_GATES, true);

  // Expose getSelectedTalents via ref
  useImperativeHandle(ref, () => ({
    getSelectedTalents: () => {
      const result: { nodeId: string; spellId: number; name: string; rank: number; section: "class" | "spec" | "hero" }[] = [];
      const collectFromTree = (
        nodes: TalentNodeDef[],
        points: Record<string, number>,
        choices: Record<string, 0 | 1>,
        section: "class" | "spec" | "hero",
      ) => {
        for (const node of nodes) {
          const pts = points[node.id] ?? 0;
          if (pts <= 0) continue;
          if (node.type === 'choice') {
            const side = choices[node.id];
            const chosen = side === 1 ? node.choiceB : node.choiceA;
            if (chosen?.spellId) {
              result.push({ nodeId: node.id, spellId: chosen.spellId, name: chosen.name, rank: pts, section });
            }
          } else if (node.spellId) {
            result.push({ nodeId: node.id, spellId: node.spellId, name: node.name, rank: pts, section });
          }
        }
      };
      collectFromTree(HUNTER_NODES, classTree.state.points, classTree.state.choiceSelections, "class");
      collectFromTree([...SURVIVAL_NODES, ...APEX_NODES], specTree.state.points, specTree.state.choiceSelections, "spec");
      collectFromTree(heroNodes, heroTree.state.points, heroTree.state.choiceSelections, "hero");
      return result;
    },
    getActiveHeroKey: () => activeHeroKey,
  }), [classTree.state, specTree.state, heroTree.state, heroNodes, activeHeroKey]);

  // Report total points for hero gate
  const prevTotal = useRef(0);
  if (specTree.totalPoints !== prevTotal.current) {
    prevTotal.current = specTree.totalPoints;
    setTimeout(() => setSpecTotalPts(specTree.totalPoints), 0);
  }

  // Apply preset builds when fight style changes
  const prevFightStyle = useRef<FightStyle | undefined>(undefined);
  const prevHeroForPreset = useRef<string>(activeHeroKey);
  useEffect(() => {
    if (!fightStyle) return;
    const heroChanged = prevHeroForPreset.current !== activeHeroKey;
    const fightChanged = prevFightStyle.current !== fightStyle;
    if (fightChanged || heroChanged) {
      prevFightStyle.current = fightStyle;
      prevHeroForPreset.current = activeHeroKey;
      const preset = getPresetBuild(activeHeroKey, fightStyle);
      specTree.loadBuild(preset.spec);
      heroTree.loadBuild(preset.hero);
    }
  }, [fightStyle, activeHeroKey]);

  return (
    <div style={{ userSelect: "none", position: "relative" }}>
      <div style={{ overflowX: "auto", overflow: "clip visible" }}>
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
            tree={classTree}
            onGlobalHover={handleGlobalHover}
          />

          {/* HERO TREE + APEX (center) */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            {/* Hero switcher — single large circle toggle */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 12 }}>
              <button
                onClick={handleHeroSwitch}
                title={`Switch to ${isSentinel ? "Pack Leader" : "Sentinel"}`}
                style={{
                  width: 100, height: 100, borderRadius: "50%",
                  border: `3px solid ${isSentinel ? "#7dd3fc" : "#d8b4fe"}`,
                  background: "#0a0a12",
                  boxShadow: `0 0 20px 4px ${isSentinel ? "rgba(125,211,252,.3)" : "rgba(216,180,254,.3)"}, 0 0 0 2px ${isSentinel ? "rgba(125,211,252,.15)" : "rgba(216,180,254,.15)"}`,
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all .3s ease",
                  position: "relative",
                  overflow: "hidden",
                  padding: 0,
                }}
              >
                <img
                  src={isSentinel ? heroSentinelImg : heroPackLeaderImg}
                  alt={isSentinel ? "Sentinel" : "Pack Leader"}
                  style={{
                    width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%",
                    transition: "opacity .3s ease",
                  }}
                />
              </button>
              <span style={{
                fontFamily: "'Orbitron',sans-serif", fontSize: 13, fontWeight: 700,
                letterSpacing: 2, color: isSentinel ? "#7dd3fc" : "#d8b4fe",
                marginTop: 6, textTransform: "uppercase",
                transition: "color .3s ease",
              }}>
                {isSentinel ? "Sentinel" : "Pack Leader"}
              </span>
              <span style={{ fontSize: 8, color: "#666", marginTop: 2, fontFamily: "'Rajdhani',sans-serif" }}>
                Click to switch
              </span>
            </div>


            <TreeSection
              label={isSentinel ? "SENTINEL" : "PACK LEADER"}
              nodes={heroNodes}
              maxPts={HERO_MAX_PTS}
              rowGates={HERO_ROW_GATES}
              externalGateMet={heroGateMet}
              compact
              tree={heroTree}
              onGlobalHover={handleGlobalHover}
            />

            {/* APEX TALENT (under hero tree) */}
            <ApexSection tree={specTree} onGlobalHover={handleGlobalHover} />
          </div>

          {/* SURVIVAL SPEC TREE (right) */}
          <SpecTreeSection tree={specTree} onGlobalHover={handleGlobalHover} />
        </div>
      </div>

      {/* Floating tooltip — fixed to bottom-center of the tree, outside flow */}
      <div style={{
        position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
        zIndex: 100, pointerEvents: "none",
      }}>
        <StaticTooltipPanel info={globalTooltip} />
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:.35} 50%{opacity:.7} }
      `}</style>
    </div>
  );
}

// Apex section rendered under the Hero tree
function ApexSection({ tree, onGlobalHover }: { tree: UseTalentTreeReturn; onGlobalHover?: (info: TooltipInfo | null) => void }) {
  const { minRow, minCol, w, h } = useMemo(() => gridBounds(APEX_NODES, true), []);
  const tipTimer = useRef<number>();

  const handleHover = useCallback((info: TooltipInfo | null, _x: number, _y: number) => {
    clearTimeout(tipTimer.current);
    if (!info) {
      tipTimer.current = window.setTimeout(() => onGlobalHover?.(null), 120);
    } else {
      onGlobalHover?.(info);
    }
  }, [onGlobalHover]);

  const apexPts = APEX_NODES.reduce((sum, n) => sum + (tree.state.points[n.id] ?? 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginTop: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 16, fontWeight: 700,
          letterSpacing: 3, color: GOLD, textTransform: "uppercase" }}>APEX</span>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 700,
          color: apexPts > 0 ? GOLD : "#666" }}>
          {apexPts} / 4
        </span>
      </div>

      <div style={{ position: "relative", width: w, height: h, background: "transparent" }}>
        <ConnectionLines
          nodes={APEX_NODES} minRow={minRow} minCol={minCol}
          w={w} h={h} pointsMap={tree.state.points} compact
        />

        {APEX_NODES.map(node => {
          const pos = nodePos(node, minRow, minCol, true);
          const nodeState = tree.getNodeState(node);
          const pts = tree.state.points[node.id] ?? 0;
          const isApex = node.type === 'apex';
          const isTier = node.id.startsWith('apex_tier');
          const sz = isApex ? 58 : (isTier ? 28 : 36);

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
                choiceSide={undefined}
                onLeftClick={() => tree.allocatePoint(node.id)}
                onRightClick={(e) => { e.preventDefault(); tree.deallocatePoint(node.id); }}
                onChoiceClick={() => {}}
                onHover={handleHover}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Floating tooltip panel — renders above layout, doesn't affect sizing
function StaticTooltipPanel({ info }: { info: TooltipInfo | null }) {
  return (
    <div style={{
      width: 260,
      opacity: info ? 1 : 0,
      transform: info ? "translateY(0)" : "translateY(4px)",
      transition: "opacity .15s ease, transform .15s ease",
      background: "linear-gradient(160deg, rgba(20,14,5,.97) 0%, rgba(10,8,2,.98) 100%)",
      border: `1px solid ${GOLD_DIM}`,
      borderTop: `2px solid ${GOLD}`,
      borderRadius: 6,
      padding: "12px 14px",
      boxShadow: `0 8px 32px rgba(0,0,0,.7), 0 0 1px ${GOLD_DIM}, inset 0 1px 0 ${GOLD_DIM}40`,
      backdropFilter: "blur(8px)",
    }}>
      {info && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            {info.choiceASpellId && info.choiceBSpellId ? (
              <div style={{ display: "flex", gap: 4 }}>
                <img
                  src={resolveIcon(info.choiceASpellId)}
                  alt=""
                  style={{ width: 28, height: 28, borderRadius: 4, border: `1px solid ${info.choiceSide === 0 ? GOLD : GOLD_DIM}`, objectFit: "cover",
                    filter: info.choiceSide === 0 ? 'none' : 'grayscale(1) brightness(0.75)' }}
                  draggable={false}
                />
                <img
                  src={resolveIcon(info.choiceBSpellId)}
                  alt=""
                  style={{ width: 28, height: 28, borderRadius: 4, border: `1px solid ${info.choiceSide === 1 ? GOLD : GOLD_DIM}`, objectFit: "cover",
                    filter: info.choiceSide === 1 ? 'none' : 'grayscale(1) brightness(0.75)' }}
                  draggable={false}
                />
              </div>
            ) : info.spellId ? (
              <img
                src={resolveIcon(info.spellId)}
                alt=""
                style={{ width: 28, height: 28, borderRadius: 4, border: `1px solid ${GOLD_DIM}`, objectFit: "cover" }}
                draggable={false}
              />
            ) : null}
            <div>
              <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, fontWeight: 700,
                color: GOLD, letterSpacing: 0.5 }}>
                {info.name}
              </div>
              {info.maxPts > 1 && (
                <div style={{ fontSize: 10, color: GOLD_DIM, fontFamily: "monospace" }}>
                  {info.pts} / {info.maxPts}
                </div>
              )}
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#b8a878", lineHeight: 1.5,
            fontFamily: "'Rajdhani',sans-serif", whiteSpace: "pre-line" }}>
            {info.desc}
          </div>
          {info.state === 'LOCKED' && info.ptsNeeded !== undefined && info.ptsNeeded > 0 && (
            <div style={{ fontSize: 11, color: "#f87171", marginTop: 6, fontFamily: "'Rajdhani',sans-serif" }}>
              Requires {info.ptsNeeded} more talent points
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Survival spec tree (uses shared tree state from parent)
function SpecTreeSection({ tree, onGlobalHover }: { tree: UseTalentTreeReturn; onGlobalHover?: (info: TooltipInfo | null) => void }) {
  const { minRow, minCol, w, h } = useMemo(() => gridBounds(SURVIVAL_NODES), []);

  const tipTimer = useRef<number>();

  const handleHover = useCallback((info: TooltipInfo | null, _x: number, _y: number) => {
    clearTimeout(tipTimer.current);
    if (!info) {
      tipTimer.current = window.setTimeout(() => onGlobalHover?.(null), 80);
    } else {
      if (info.state === 'LOCKED') {
        const node = SURVIVAL_NODES.find(n => n.name === info.name);
        if (node) {
          const gate = SPEC_ROW_GATES[node.row] ?? 0;
          info.ptsNeeded = Math.max(0, gate - tree.totalPoints);
        }
      }
      onGlobalHover?.(info);
    }
  }, [tree.totalPoints, onGlobalHover]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      {/* Header */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: "100%" }}>
        <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 16, fontWeight: 700,
          letterSpacing: 3, color: GOLD, textTransform: "uppercase" }}>SURVIVAL</span>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 700,
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
        background: "transparent",
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
          const sz = 40;

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
    </div>
  );
}

export default BlizzardTalentTree;
