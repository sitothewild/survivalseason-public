// ─────────────────────────────────────────────────────────────
// components/TalentPanel.tsx
// Unified single-view talent panel.
// Layout: CLASS (left) | HERO with toggle (center) | SURVIVAL (right)
// Only one hero tree (Sentinel OR Pack Leader) active at a time.
// Switching hero trees resets the previous hero tree's points.
// ─────────────────────────────────────────────────────────────

import { useCallback, useState } from "react";
import TalentTreeGrid from "./TalentTreeGrid";
import { useTalentTreeData } from "../hooks/useTalentTreeData";
import type { BlizzardTalentTreeResponse } from "../types/talentTreeTypes";
import { buildSimcProfile, type FightStyle } from "../utils/simcProfileBuilder";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

// ─── PROPS ──────────────────────────────────────────────────

interface TalentPanelProps {
  fetchTalentTree: (
    treeId: number,
    specId: number
  ) => Promise<BlizzardTalentTreeResponse>;
}

// ─── COMPONENT ──────────────────────────────────────────────

export default function TalentPanel({ fetchTalentTree }: TalentPanelProps) {
  const [exportFightStyle, setExportFightStyle] = useState<FightStyle>("st");
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportResult, setExportResult] = useState<{ profileString: string; summary: any } | null>(null);
  const [copied, setCopied] = useState(false);

  const tree = useTalentTreeData(fetchTalentTree);

  // Switch hero tree AND reset all hero points
  const handleHeroSwitch = useCallback(
    (heroKey: "sentinel" | "packLeader") => {
      if (heroKey === tree.activeHeroTree) return;
      tree.resetHero();
      tree.setActiveHeroTree(heroKey);
    },
    [tree]
  );

  // Determine which hero nodes to render
  const activeHeroNodes =
    tree.activeHeroTree === "sentinel"
      ? tree.sentinelNodes
      : tree.packLeaderNodes;

  const activeHeroLabel =
    tree.activeHeroTree === "sentinel" ? "Sentinel" : "Pack Leader";

  // ── Loading
  if (tree.isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-[11px] text-slate-500 font-['Rajdhani',sans-serif] tracking-wider">
            Loading talent data...
          </span>
        </div>
      </div>
    );
  }

  // ── Error
  if (tree.error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3 max-w-xs text-center">
          <span className="text-red-400 text-sm">⚠</span>
          <span className="text-[11px] text-red-400 font-['Rajdhani',sans-serif]">
            {tree.error}
          </span>
          <button
            className="text-[10px] px-3 py-1 rounded bg-slate-800 border border-slate-700
                       text-slate-400 hover:text-amber-400 hover:border-amber-600 transition-colors"
            onClick={tree.refetch}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0 w-full">

      {/* ═══════════════════════════════════════════════════════
          HEADER BAR
          ═══════════════════════════════════════════════════════ */}
      <div
        className="
          flex items-center justify-between px-4 py-3
          bg-card/70 border border-border
          rounded-t-lg
        "
      >
        <h2
          className="
            text-[12px] font-bold tracking-[0.25em] uppercase
            font-['Orbitron',sans-serif] text-slate-300
          "
        >
          Survival Hunter — Talents
        </h2>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <PointBadge label="Class" spent={tree.classPointsSpent} max={31} />
            <PointBadge label="Spec" spent={tree.specPointsSpent} max={30} />
          </div>

          <div className="flex items-center gap-2">
            <button
              className="
                text-[9px] px-2.5 py-1 rounded
                bg-slate-800/60 border border-slate-700
                text-slate-500 hover:text-amber-400 hover:border-amber-600
                transition-colors font-['Rajdhani',sans-serif]
              "
              onClick={tree.resetAll}
            >
              Reset All
            </button>
            <button
              className="
                text-[9px] px-2.5 py-1 rounded
                bg-amber-900/30 border border-amber-700/50
                text-amber-400 hover:bg-amber-800/40 hover:border-amber-600
                transition-colors font-['Rajdhani',sans-serif]
              "
              onClick={() => {
                const talents = tree.getSelectedTalents();
                console.log("Selected talents for SimC:", talents);
              }}
            >
              Export to SimC
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          THREE-COLUMN LAYOUT
          Left: Class | Center: Hero (toggle) | Right: Survival
          All visible at once — no tabs.
          ═══════════════════════════════════════════════════════ */}
      <div
        className="
          flex items-start justify-center gap-6 p-6
          bg-card
          border-x border-b border-border
          rounded-b-lg
          overflow-x-auto
        "
      >
        {/* ─── LEFT COLUMN: Class (Hunter) Tree ─── */}
        <div className="flex-shrink-0">
          <TalentTreeGrid
            label="Hunter"
            nodes={tree.classNodes}
            talentState={tree.classState.points}
            choiceState={tree.classState.choices}
            gates={tree.classGates}
            totalPointsSpent={tree.classPointsSpent}
            maxPoints={31}
            onPointChange={tree.handleClassPointChange}
            onChoiceSelect={tree.handleClassChoiceSelect}
            onReset={tree.resetClass}
          />
        </div>

        {/* ─── COLUMN DIVIDER ─── */}
        <div className="self-stretch w-px bg-border/50 flex-shrink-0" />

        {/* ─── CENTER COLUMN: Hero Tree with Toggle ─── */}
        <div className="flex-shrink-0 flex flex-col items-center">

          {/* Sentinel / Pack Leader toggle */}
          <HeroTreeToggle
            activeHero={tree.activeHeroTree}
            onSwitch={handleHeroSwitch}
          />

          {/* Active hero tree */}
          <TalentTreeGrid
            label={activeHeroLabel}
            nodes={activeHeroNodes}
            talentState={tree.heroState.points}
            choiceState={tree.heroState.choices}
            totalPointsSpent={0}
            onPointChange={tree.handleHeroPointChange}
            onChoiceSelect={tree.handleHeroChoiceSelect}
            onReset={tree.resetHero}
          />
        </div>

        {/* ─── COLUMN DIVIDER ─── */}
        <div className="self-stretch w-px bg-border/50 flex-shrink-0" />

        {/* ─── RIGHT COLUMN: Spec (Survival) Tree ─── */}
        <div className="flex-shrink-0">
          <TalentTreeGrid
            label="Survival"
            nodes={tree.specNodes}
            talentState={tree.specState.points}
            choiceState={tree.specState.choices}
            gates={tree.specGates}
            totalPointsSpent={tree.specPointsSpent}
            maxPoints={30}
            onPointChange={tree.handleSpecPointChange}
            onChoiceSelect={tree.handleSpecChoiceSelect}
            onReset={tree.resetSpec}
          />
        </div>
      </div>
    </div>
  );
}

// ─── HERO TREE TOGGLE ───────────────────────────────────────
// Two-button choice node that sits above the hero tree.
// Mimics WoW's in-game hero talent selection.
// Switching resets the other tree's points.

function HeroTreeToggle({
  activeHero,
  onSwitch,
}: {
  activeHero: "sentinel" | "packLeader";
  onSwitch: (hero: "sentinel" | "packLeader") => void;
}) {
  const isSentinel = activeHero === "sentinel";

  return (
    <div className="flex flex-col items-center mb-4">
      <span className="text-[9px] text-slate-600 font-mono uppercase tracking-widest mb-2">
        Hero Talent
      </span>

      <div
        className="flex rounded-lg overflow-hidden border-2 transition-colors duration-200"
        style={{
          borderColor: isSentinel
            ? "rgba(20, 184, 166, 0.5)"
            : "rgba(249, 115, 22, 0.5)",
        }}
      >
        {/* Sentinel */}
        <button
          className={`
            px-4 py-2 text-[10px] font-bold tracking-wider uppercase
            font-['Orbitron',sans-serif]
            transition-all duration-200 focus:outline-none
            ${isSentinel
              ? "bg-teal-900/50 text-teal-300 shadow-[inset_0_0_12px_rgba(20,184,166,0.15)]"
              : "bg-slate-900/60 text-slate-600 hover:text-slate-400 hover:bg-slate-800/60"
            }
          `}
          onClick={() => onSwitch("sentinel")}
        >
          ✦ Sentinel
        </button>

        <div className="w-px bg-slate-700" />

        {/* Pack Leader */}
        <button
          className={`
            px-4 py-2 text-[10px] font-bold tracking-wider uppercase
            font-['Orbitron',sans-serif]
            transition-all duration-200 focus:outline-none
            ${!isSentinel
              ? "bg-orange-900/50 text-orange-300 shadow-[inset_0_0_12px_rgba(249,115,22,0.15)]"
              : "bg-slate-900/60 text-slate-600 hover:text-slate-400 hover:bg-slate-800/60"
            }
          `}
          onClick={() => onSwitch("packLeader")}
        >
          ✦ Pack Leader
        </button>
      </div>

      <span className="text-[8px] text-slate-700 mt-1.5 italic">
        Switching resets hero talent points
      </span>
    </div>
  );
}

// ─── POINT BADGE ────────────────────────────────────────────

function PointBadge({
  label,
  spent,
  max,
}: {
  label: string;
  spent: number;
  max?: number;
}) {
  const isFull = max != null && spent >= max;

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] text-slate-600 font-['Rajdhani',sans-serif]">
        {label}
      </span>
      <span
        className={`
          text-[10px] font-bold font-mono
          font-['IBM_Plex_Mono',monospace]
          ${isFull ? "text-emerald-400" : "text-amber-500"}
        `}
      >
        {spent}
        {max != null && `/${max}`}
      </span>
    </div>
  );
}
