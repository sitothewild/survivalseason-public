// ─────────────────────────────────────────────────────────────
// components/TalentTreeGrid.tsx
// Renders a full talent tree section using CSS Grid with
// display_row / display_col from the Blizzard API as the
// authoritative grid positions.
// ─────────────────────────────────────────────────────────────

import { useMemo } from "react";
import TalentNode from "./TalentNode";
import type { MappedTalentNode } from "../types/talentTreeTypes";

// ─── PROPS ──────────────────────────────────────────────────

interface TalentTreeGridProps {
  label: string;
  nodes: MappedTalentNode[];
  talentState: Record<number, number>;
  choiceState: Record<number, number | null>;
  gates?: { points: number; afterRow: number }[]; // afterRow = API restricted_row (display_row)
  totalPointsSpent: number;
  maxPoints?: number;
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
  // Compute grid bounds from API display positions
  const { minCol, numCols } = useMemo(() => {
    if (nodes.length === 0) return { minCol: 0, numCols: 1 };
    let mnC = Infinity, mxC = -Infinity;
    for (const n of nodes) {
      if (n.displayCol < mnC) mnC = n.displayCol;
      if (n.displayCol > mxC) mxC = n.displayCol;
    }
    return { minCol: mnC, numCols: mxC - mnC + 1 };
  }, [nodes]);

  // Build locked set: gate rows AND prerequisite (lockedBy) validation
  const lockedNodeIds = useMemo(() => {
    const locked = new Set<number>();
    // Gate check: nodes below a gate are locked if total points < threshold
    for (const gate of gates) {
      if (totalPointsSpent < gate.points) {
        for (const node of nodes) {
          if (node.displayRow >= gate.afterRow) locked.add(node.nodeId);
        }
      }
    }
    // Prerequisite check: nodes whose lockedBy parents all have 0 points are locked
    for (const node of nodes) {
      if (node.lockedBy.length > 0) {
        const prereqMet = node.lockedBy.some(
          (parentId) => (talentState[parentId] ?? 0) > 0
        );
        if (!prereqMet) locked.add(node.nodeId);
      }
    }
    return locked;
  }, [gates, totalPointsSpent, nodes, talentState]);

  // Group by displayRow
  const sortedDisplayRows = useMemo(() =>
    [...new Set(nodes.map(n => n.displayRow))].sort((a, b) => a - b),
  [nodes]);

  const nodesByDisplayRow = useMemo(() => {
    const map = new Map<number, MappedTalentNode[]>();
    for (const n of nodes) {
      if (!map.has(n.displayRow)) map.set(n.displayRow, []);
      map.get(n.displayRow)!.push(n);
    }
    return map;
  }, [nodes]);

  // Map gates to the displayRow they appear before
  const gateAtDisplayRow = useMemo(() => {
    const map = new Map<number, number>();
    for (const gate of gates) {
      map.set(gate.afterRow, gate.points);
    }
    return map;
  }, [gates]);

  return (
    <div className="flex flex-col items-center">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between w-full mb-3 px-1">
        <h3 className="text-[11px] font-bold tracking-[0.2em] uppercase font-['Orbitron',sans-serif] text-muted-foreground">
          {label}
        </h3>
        <div className="flex items-center gap-2">
          {maxPoints != null && (
            <span className="text-[11px] font-mono font-bold font-['IBM_Plex_Mono',monospace] text-primary">
              {totalPointsSpent}/{maxPoints}
            </span>
          )}
          {onReset && (
            <button
              className="w-6 h-6 rounded flex items-center justify-center bg-secondary/60 border border-border text-muted-foreground text-xs hover:border-primary hover:text-primary transition-colors duration-150 focus:outline-none"
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
        className="flex flex-col items-stretch gap-1 p-5 rounded-lg bg-secondary/80 border border-border backdrop-blur-sm"
        style={{ minWidth: Math.max(280, numCols * 72) }}
      >
        {sortedDisplayRows.map((displayRow) => {
          const rowNodes = nodesByDisplayRow.get(displayRow)!;
          const gatePoints = gateAtDisplayRow.get(displayRow);

          return (
            <div key={displayRow}>
              {gatePoints != null && (
                <GateLine requiredPoints={gatePoints} currentPoints={totalPointsSpent} />
              )}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${numCols}, 1fr)`,
                  justifyItems: "center",
                  alignItems: "start",
                  gap: "4px",
                }}
              >
                {rowNodes.map((node) => (
                  <div key={node.nodeId} style={{ gridColumn: node.displayCol - minCol + 1 }}>
                    <TalentNode
                      node={node}
                      currentPoints={talentState[node.nodeId] ?? 0}
                      choiceSelection={choiceState[node.nodeId] ?? null}
                      isLocked={lockedNodeIds.has(node.nodeId)}
                      onPointChange={(delta) => onPointChange(node.nodeId, delta)}
                      onChoiceSelect={(optIdx) => onChoiceSelect(node.nodeId, optIdx)}
                    />
                  </div>
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

function GateLine({ requiredPoints, currentPoints }: { requiredPoints: number; currentPoints: number }) {
  const isMet = currentPoints >= requiredPoints;
  return (
    <div className="flex items-center gap-2 my-2 px-2">
      <div className={`flex-1 h-px ${isMet ? "bg-primary/50" : "bg-border/60"}`} />
      <span
        className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-sm font-['IBM_Plex_Mono',monospace] ${
          isMet
            ? "text-primary bg-primary/10 border border-primary/30"
            : "text-muted-foreground bg-secondary/40 border border-border/30"
        }`}
      >
        {requiredPoints} pts
      </span>
      <div className={`flex-1 h-px ${isMet ? "bg-primary/50" : "bg-border/60"}`} />
    </div>
  );
}
