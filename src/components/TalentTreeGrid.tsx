// ─────────────────────────────────────────────────────────────
// components/TalentTreeGrid.tsx
// Renders a full talent tree section (class, spec, or hero) from
// MappedTalentNode[] in a vertical grid layout.
// ─────────────────────────────────────────────────────────────

import { useMemo } from "react";
import TalentNode from "./TalentNode";
import type { MappedTalentNode } from "../types/talentTreeTypes";

// ─── PROPS ──────────────────────────────────────────────────

interface TalentTreeGridProps {
  label: string; // "HUNTER", "SURVIVAL", "SENTINEL", "PACK LEADER"
  nodes: MappedTalentNode[];
  talentState: Record<number, number>; // nodeId → currentPoints
  choiceState: Record<number, number | null>; // nodeId → selected option idx
  gates?: { points: number; afterRow: number }[]; // restriction lines
  totalPointsSpent: number;
  maxPoints?: number; // e.g. 31 for class, 30 for spec
  onPointChange: (nodeId: number, delta: number) => void;
  onChoiceSelect: (nodeId: number, optionIndex: number) => void;
  onReset?: () => void;
}

// ─── COMPONENT ──────────────────────────────────────────────

export default function TalentTreeGrid({
  label,
  nodes,
  talentState,
  choiceState,
  gates = [],
  totalPointsSpent,
  maxPoints,
  onPointChange,
  onChoiceSelect,
  onReset,
}: TalentTreeGridProps) {
  // Group nodes by gridRow
  const rowGroups = useMemo(() => {
    const grouped = new Map<number, MappedTalentNode[]>();
    for (const node of nodes) {
      if (!grouped.has(node.gridRow)) grouped.set(node.gridRow, []);
      grouped.get(node.gridRow)!.push(node);
    }
    // Sort each row's nodes by gridCol
    for (const [, row] of grouped) {
      row.sort((a, b) => a.gridCol - b.gridCol);
    }
    return grouped;
  }, [nodes]);

  const sortedRowIndices = useMemo(
    () => [...rowGroups.keys()].sort((a, b) => a - b),
    [rowGroups]
  );

  // Build a set of locked node IDs based on gates
  const lockedNodeIds = useMemo(() => {
    const locked = new Set<number>();
    for (const gate of gates) {
      if (totalPointsSpent < gate.points) {
        // Lock all nodes in rows AFTER this gate
        for (const node of nodes) {
          if (node.gridRow > gate.afterRow) {
            locked.add(node.nodeId);
          }
        }
      }
    }
    return locked;
  }, [gates, totalPointsSpent, nodes]);

  return (
    <div className="flex flex-col items-center">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between w-full mb-3 px-1">
        <h3
          className="
            text-[11px] font-bold tracking-[0.2em] uppercase
            font-['Orbitron',sans-serif] text-slate-400
          "
        >
          {label}
        </h3>

        <div className="flex items-center gap-2">
          {maxPoints != null && (
            <span
              className="
                text-[11px] font-mono font-bold
                font-['IBM_Plex_Mono',monospace]
                text-amber-500
              "
            >
              {totalPointsSpent}/{maxPoints}
            </span>
          )}

          {onReset && (
            <button
              className="
                w-6 h-6 rounded flex items-center justify-center
                bg-slate-800/60 border border-slate-700
                text-slate-500 text-xs
                hover:border-amber-600 hover:text-amber-400
                transition-colors duration-150
                focus:outline-none
              "
              onClick={onReset}
              title="Reset tree"
              aria-label={`Reset ${label} tree`}
            >
              ↺
            </button>
          )}
        </div>
      </div>

      {/* ─── Tree Grid ─── */}
      <div
        className="
          flex flex-col items-center gap-3
          p-5 rounded-lg
          bg-secondary/80 border border-border
          backdrop-blur-sm
          min-w-[280px]
        "
      >
        {sortedRowIndices.map((rowIdx) => {
          const rowNodes = rowGroups.get(rowIdx)!;
          const gateBeforeThisRow = gates.find((g) => g.afterRow === rowIdx - 1);

          return (
            <div key={rowIdx}>
              {/* Gate line indicator */}
              {gateBeforeThisRow && (
                <GateLine
                  requiredPoints={gateBeforeThisRow.points}
                  currentPoints={totalPointsSpent}
                />
              )}

              {/* Row of nodes */}
              <div className="flex justify-center items-start gap-1.5">
                {rowNodes.map((node) => (
                  <TalentNode
                    key={node.nodeId}
                    node={node}
                    currentPoints={talentState[node.nodeId] ?? 0}
                    choiceSelection={choiceState[node.nodeId] ?? null}
                    isLocked={lockedNodeIds.has(node.nodeId)}
                    onPointChange={(delta) => onPointChange(node.nodeId, delta)}
                    onChoiceSelect={(optIdx) => onChoiceSelect(node.nodeId, optIdx)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── GATE LINE ──────────────────────────────────────────────

function GateLine({
  requiredPoints,
  currentPoints,
}: {
  requiredPoints: number;
  currentPoints: number;
}) {
  const isMet = currentPoints >= requiredPoints;

  return (
    <div className="flex items-center gap-2 my-2 px-2">
      <div
        className={`flex-1 h-px ${
          isMet ? "bg-amber-600/50" : "bg-slate-700/60"
        }`}
      />
      <span
        className={`
          text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-sm
          font-['IBM_Plex_Mono',monospace]
          ${isMet
            ? "text-amber-400 bg-amber-900/20 border border-amber-700/30"
            : "text-slate-600 bg-slate-800/40 border border-slate-700/30"
          }
        `}
      >
        {requiredPoints} pts
      </span>
      <div
        className={`flex-1 h-px ${
          isMet ? "bg-amber-600/50" : "bg-slate-700/60"
        }`}
      />
    </div>
  );
}
