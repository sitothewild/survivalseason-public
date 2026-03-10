// ─────────────────────────────────────────────────────────────
// components/TalentPanel.tsx
// Top-level tabbed talent tree panel.
// Tabs: CLASS | SURVIVAL | SENTINEL | PACK LEADER
// Wires useTalentTreeData hook → TalentTreeGrid for each section.
// ─────────────────────────────────────────────────────────────

import { useState, useCallback } from "react";
import TalentTreeGrid from "./TalentTreeGrid";
import { useTalentTreeData } from "../hooks/useTalentTreeData";
import type { BlizzardTalentTreeResponse } from "../types/talentTreeTypes";

// ─── PROPS ──────────────────────────────────────────────────

interface TalentPanelProps {
  /** Your edge function that fetches from Blizzard API.
   *  Should call: /data/wow/talent-tree/{treeId}/playable-specialization/{specId} */
  fetchTalentTree: (
    treeId: number,
    specId: number
  ) => Promise<BlizzardTalentTreeResponse>;
}

// ─── TAB CONFIG ─────────────────────────────────────────────

type TabKey = "class" | "spec" | "sentinel" | "packLeader";

const TABS: { key: TabKey; label: string }[] = [
  { key: "class", label: "CLASS" },
  { key: "spec", label: "SURVIVAL" },
  { key: "sentinel", label: "SENTINEL" },
  { key: "packLeader", label: "PACK LEADER" },
];

// ─── COMPONENT ──────────────────────────────────────────────

export default function TalentPanel({ fetchTalentTree }: TalentPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("class");

  const tree = useTalentTreeData(fetchTalentTree);

  // When switching hero tabs, also update the active hero tree in state
  const handleTabClick = useCallback(
    (tab: TabKey) => {
      setActiveTab(tab);
      if (tab === "sentinel") tree.setActiveHeroTree("sentinel");
      if (tab === "packLeader") tree.setActiveHeroTree("packLeader");
    },
    [tree]
  );

  // ── Loading / Error states
  if (tree.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-[11px] text-slate-500 font-['Rajdhani',sans-serif] tracking-wider">
            Loading talent data...
          </span>
        </div>
      </div>
    );
  }

  if (tree.error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3 max-w-xs text-center">
          <span className="text-red-400 text-sm">⚠</span>
          <span className="text-[11px] text-red-400 font-['Rajdhani',sans-serif]">
            {tree.error}
          </span>
          <button
            className="
              text-[10px] px-3 py-1 rounded
              bg-slate-800 border border-slate-700
              text-slate-400 hover:text-amber-400 hover:border-amber-600
              transition-colors
            "
            onClick={tree.refetch}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      {/* ─── Tab Bar ─── */}
      <div
        className="
          flex border-b border-[#2e3a50]
          bg-[#1c2333]/50
          rounded-t-lg overflow-hidden
        "
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              className={`
                flex-1 py-2.5 px-3
                text-[10px] font-bold tracking-[0.15em] uppercase
                font-['Orbitron',sans-serif]
                transition-all duration-150
                border-b-2
                focus:outline-none
                ${isActive
                  ? "text-amber-400 border-amber-500 bg-[#1c2333]"
                  : "text-slate-600 border-transparent hover:text-slate-400 hover:bg-[#1c2333]/30"
                }
              `}
              onClick={() => handleTabClick(tab.key)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ─── Tree Content ─── */}
      <div className="p-4 bg-[#0f1520] rounded-b-lg min-h-[400px]">
        {/* CLASS tab */}
        {activeTab === "class" && (
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
        )}

        {/* SURVIVAL tab */}
        {activeTab === "spec" && (
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
        )}

        {/* SENTINEL tab */}
        {activeTab === "sentinel" && (
          <TalentTreeGrid
            label="Sentinel"
            nodes={tree.sentinelNodes}
            talentState={tree.heroState.points}
            choiceState={tree.heroState.choices}
            totalPointsSpent={0} // hero trees don't have point gates
            onPointChange={tree.handleHeroPointChange}
            onChoiceSelect={tree.handleHeroChoiceSelect}
            onReset={tree.resetHero}
          />
        )}

        {/* PACK LEADER tab */}
        {activeTab === "packLeader" && (
          <TalentTreeGrid
            label="Pack Leader"
            nodes={tree.packLeaderNodes}
            talentState={tree.heroState.points}
            choiceState={tree.heroState.choices}
            totalPointsSpent={0}
            onPointChange={tree.handleHeroPointChange}
            onChoiceSelect={tree.handleHeroChoiceSelect}
            onReset={tree.resetHero}
          />
        )}
      </div>

      {/* ─── Bottom Controls ─── */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#1c2333]/30 rounded-b-lg border-t border-[#2e3a50]/50">
        <div className="flex items-center gap-4">
          <span className="text-[9px] text-slate-600 font-mono">
            Class: {tree.classPointsSpent}/31
          </span>
          <span className="text-[9px] text-slate-600 font-mono">
            Spec: {tree.specPointsSpent}/30
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="
              text-[9px] px-2.5 py-1 rounded
              bg-slate-800/60 border border-slate-700
              text-slate-500 hover:text-amber-400 hover:border-amber-600
              transition-colors font-['Rajdhani',sans-serif]
              focus:outline-none
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
              focus:outline-none
            "
            onClick={() => {
              const talents = tree.getSelectedTalents();
              console.log("Selected talents for SimC:", talents);
              // TODO: pass to simcProfileBuilder.ts
            }}
          >
            Export to SimC
          </button>
        </div>
      </div>
    </div>
  );
}
