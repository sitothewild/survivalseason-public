// ─────────────────────────────────────────────────────────────
// components/TalentNode.tsx
// Individual talent node: regular (circle), choice (split), selection (hero)
// Design system: surface #1c2333, border #2e3a50, gold #d97706, text #f1f5f9
// Fonts: Orbitron (headers), Rajdhani (body), IBM Plex Mono (numbers)
// ─────────────────────────────────────────────────────────────

import { useState, useCallback } from "react";
import type { MappedTalentNode, ChoiceOption } from "../types/talentTreeTypes";

// ─── PROPS ──────────────────────────────────────────────────

interface TalentNodeProps {
  node: MappedTalentNode;
  currentPoints: number;
  choiceSelection: number | null; // 0 = optionA, 1 = optionB, null = none
  isLocked: boolean; // true if prerequisite points not met
  onPointChange: (delta: number) => void; // +1 or -1
  onChoiceSelect: (optionIndex: number) => void;
}

// ─── COMPONENT ──────────────────────────────────────────────

export default function TalentNode({
  node,
  currentPoints,
  choiceSelection,
  isLocked,
  onPointChange,
  onChoiceSelect,
}: TalentNodeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const isMaxed = currentPoints >= node.maxRank;
  const isActive = currentPoints > 0;

  // Left-click = add point, right-click = remove point
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (isLocked) return;
      if (node.nodeType === "choice") return; // choice nodes use the split buttons
      if (!isMaxed) onPointChange(1);
    },
    [isLocked, isMaxed, node.nodeType, onPointChange]
  );

  const handleRightClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (node.nodeType === "choice") {
        // Right-click on choice node = deselect
        onChoiceSelect(-1);
        return;
      }
      if (currentPoints > 0) onPointChange(-1);
    },
    [currentPoints, node.nodeType, onPointChange, onChoiceSelect]
  );

  // Render based on node type
  if (node.nodeType === "choice" && node.choiceOptions?.length === 2) {
    return (
      <ChoiceNodeRenderer
        node={node}
        selection={choiceSelection}
        isLocked={isLocked}
        onSelect={onChoiceSelect}
        onRightClick={handleRightClick}
        showTooltip={showTooltip}
        setShowTooltip={setShowTooltip}
      />
    );
  }

  if (node.nodeType === "selection") {
    return (
      <SelectionNodeRenderer
        node={node}
        isActive={isActive}
        isLocked={isLocked}
        showTooltip={showTooltip}
        setShowTooltip={setShowTooltip}
        onClick={handleClick}
        onRightClick={handleRightClick}
      />
    );
  }

  // Default: regular active/passive node
  return (
    <RegularNodeRenderer
      node={node}
      currentPoints={currentPoints}
      isActive={isActive}
      isMaxed={isMaxed}
      isLocked={isLocked}
      showTooltip={showTooltip}
      setShowTooltip={setShowTooltip}
      onClick={handleClick}
      onRightClick={handleRightClick}
    />
  );
}

// ─── REGULAR NODE (CIRCLE) ──────────────────────────────────

function RegularNodeRenderer({
  node,
  currentPoints,
  isActive,
  isMaxed,
  isLocked,
  showTooltip,
  setShowTooltip,
  onClick,
  onRightClick,
}: {
  node: MappedTalentNode;
  currentPoints: number;
  isActive: boolean;
  isMaxed: boolean;
  isLocked: boolean;
  showTooltip: boolean;
  setShowTooltip: (v: boolean) => void;
  onClick: (e: React.MouseEvent) => void;
  onRightClick: (e: React.MouseEvent) => void;
}) {
  // Border color: locked=dim, unselected=gray, active=gold, maxed=green
  const borderColor = isLocked
    ? "border-gray-700/50"
    : isMaxed
    ? "border-emerald-500"
    : isActive
    ? "border-amber-500"
    : "border-slate-500";

  // Inner fill
  const bgColor = isLocked
    ? "bg-slate-900/40"
    : isMaxed
    ? "bg-emerald-900/30"
    : isActive
    ? "bg-amber-900/25"
    : "bg-slate-800/60";

  // Glow effect when active
  const glow = isMaxed
    ? "shadow-[0_0_8px_rgba(16,185,129,0.3)]"
    : isActive
    ? "shadow-[0_0_8px_rgba(217,119,6,0.25)]"
    : "";

  // Passive nodes = slightly smaller circle
  const size = node.nodeType === "passive" ? "w-9 h-9" : "w-11 h-11";

  return (
    <div
      className="relative flex flex-col items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button
        className={`
          ${size} rounded-full border-2 ${borderColor} ${bgColor} ${glow}
          flex items-center justify-center
          transition-all duration-150 ease-out
          ${isLocked ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:scale-110 hover:border-amber-400"}
          focus:outline-none focus:ring-2 focus:ring-amber-500/40
        `}
        onClick={onClick}
        onContextMenu={onRightClick}
        disabled={isLocked}
        aria-label={`${node.name} — ${currentPoints}/${node.maxRank}`}
      >
        {/* Node type indicator: active = small lightning, passive = dot */}
        <span
          className={`text-[10px] font-bold font-mono
            ${isMaxed ? "text-emerald-300" : isActive ? "text-amber-300" : "text-slate-500"}
          `}
        >
          {node.nodeType === "active" ? "⚡" : "◆"}
        </span>
      </button>

      {/* Rank badge */}
      {node.maxRank > 1 && (
        <span
          className={`
            absolute -bottom-1 -right-1 text-[9px] font-mono font-bold
            px-1 rounded-sm leading-tight
            ${isMaxed ? "bg-emerald-800 text-emerald-200" : "bg-slate-800 text-slate-400"}
            border ${isMaxed ? "border-emerald-600" : "border-slate-600"}
          `}
        >
          {currentPoints}/{node.maxRank}
        </span>
      )}

      {/* Talent name under node */}
      <span
        className={`
          mt-1 text-[8px] leading-tight text-center max-w-[80px]
          font-['Rajdhani',sans-serif] whitespace-normal break-words
          ${isActive ? "text-slate-300" : "text-slate-600"}
        `}
      >
        {node.name}
      </span>

      {/* Tooltip */}
      {showTooltip && (
        <NodeTooltip
          name={node.name}
          nodeType={node.nodeType}
          currentPoints={currentPoints}
          maxRank={node.maxRank}
          spellId={node.spellId}
        />
      )}
    </div>
  );
}

// ─── CHOICE NODE (SPLIT BUTTON) ─────────────────────────────

function ChoiceNodeRenderer({
  node,
  selection,
  isLocked,
  onSelect,
  onRightClick,
  showTooltip,
  setShowTooltip,
}: {
  node: MappedTalentNode;
  selection: number | null;
  isLocked: boolean;
  onSelect: (idx: number) => void;
  onRightClick: (e: React.MouseEvent) => void;
  showTooltip: boolean;
  setShowTooltip: (v: boolean) => void;
}) {
  const [optA, optB] = node.choiceOptions!;
  const hasSelection = selection !== null && selection >= 0;

  const borderColor = isLocked
    ? "border-gray-700/50"
    : hasSelection
    ? "border-amber-500"
    : "border-slate-500";

  return (
    <div
      className="relative flex flex-col items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onContextMenu={onRightClick}
    >
      {/* Split octagonal shape via rounded-lg + clip */}
      <div
        className={`
          w-12 h-11 rounded-lg border-2 ${borderColor}
          overflow-hidden flex
          transition-all duration-150 ease-out
          ${isLocked ? "cursor-not-allowed opacity-40" : "hover:border-amber-400"}
          ${hasSelection ? "shadow-[0_0_8px_rgba(217,119,6,0.25)]" : ""}
        `}
      >
        {/* Option A — left half */}
        <button
          className={`
            flex-1 flex items-center justify-center text-[9px] font-bold
            transition-all duration-100
            ${selection === 0
              ? "bg-amber-700/70 text-amber-100"
              : "bg-slate-800/60 text-slate-500 hover:bg-amber-900/30 hover:text-amber-300"
            }
            ${isLocked ? "cursor-not-allowed" : "cursor-pointer"}
            focus:outline-none
          `}
          onClick={() => !isLocked && onSelect(0)}
          disabled={isLocked}
          aria-label={optA.name}
        >
          ◀
        </button>

        {/* Divider */}
        <div className="w-px bg-slate-600/80" />

        {/* Option B — right half */}
        <button
          className={`
            flex-1 flex items-center justify-center text-[9px] font-bold
            transition-all duration-100
            ${selection === 1
              ? "bg-amber-700/70 text-amber-100"
              : "bg-slate-800/60 text-slate-500 hover:bg-amber-900/30 hover:text-amber-300"
            }
            ${isLocked ? "cursor-not-allowed" : "cursor-pointer"}
            focus:outline-none
          `}
          onClick={() => !isLocked && onSelect(1)}
          disabled={isLocked}
          aria-label={optB.name}
        >
          ▶
        </button>
      </div>

      {/* Selected talent name under node */}
      <span
        className={`
          mt-1 text-[8px] leading-tight text-center max-w-[64px] truncate
          font-['Rajdhani',sans-serif]
          ${hasSelection ? "text-slate-300" : "text-slate-600"}
        `}
      >
        {hasSelection
          ? node.choiceOptions![selection!].name
          : `${optA.name.split(" ")[0]} / ${optB.name.split(" ")[0]}`}
      </span>

      {/* Choice tooltip — shows both options */}
      {showTooltip && (
        <ChoiceTooltip optA={optA} optB={optB} selection={selection} />
      )}
    </div>
  );
}

// ─── SELECTION NODE (HERO TREE TOP) ─────────────────────────

function SelectionNodeRenderer({
  node,
  isActive,
  isLocked,
  showTooltip,
  setShowTooltip,
  onClick,
  onRightClick,
}: {
  node: MappedTalentNode;
  isActive: boolean;
  isLocked: boolean;
  showTooltip: boolean;
  setShowTooltip: (v: boolean) => void;
  onClick: (e: React.MouseEvent) => void;
  onRightClick: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="relative flex flex-col items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button
        className={`
          w-14 h-14 rounded-full border-3
          ${isActive ? "border-amber-400 bg-amber-900/30 shadow-[0_0_12px_rgba(217,119,6,0.35)]" : "border-slate-500 bg-slate-800/50"}
          flex items-center justify-center
          transition-all duration-200
          ${isLocked ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:scale-105 hover:border-amber-300"}
          focus:outline-none focus:ring-2 focus:ring-amber-500/40
        `}
        onClick={onClick}
        onContextMenu={onRightClick}
        disabled={isLocked}
        aria-label={node.name}
      >
        {/* Hero portrait placeholder — a larger icon */}
        <span className={`text-lg ${isActive ? "text-amber-300" : "text-slate-500"}`}>
          ✦
        </span>
      </button>

      <span
        className={`
          mt-1 text-[9px] leading-tight text-center font-bold tracking-wide
          font-['Orbitron',sans-serif] uppercase
          ${isActive ? "text-amber-400" : "text-slate-600"}
        `}
      >
        {node.name}
      </span>

      {showTooltip && (
        <NodeTooltip
          name={node.name}
          nodeType="selection"
          currentPoints={isActive ? 1 : 0}
          maxRank={1}
          spellId={node.spellId}
        />
      )}
    </div>
  );
}

// ─── TOOLTIP COMPONENTS ─────────────────────────────────────

function NodeTooltip({
  name,
  nodeType,
  currentPoints,
  maxRank,
  spellId,
}: {
  name: string;
  nodeType: string;
  currentPoints: number;
  maxRank: number;
  spellId: number;
}) {
  return (
    <div
      className="
        absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-3
        w-56 p-3 rounded-lg
        bg-[#0d1117] border border-[#2e3a50]
        shadow-[0_4px_24px_rgba(0,0,0,0.7)]
        pointer-events-none
      "
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-bold text-amber-400 font-['Rajdhani',sans-serif]">
          {name}
        </span>
        <span className="text-[9px] text-slate-500 font-mono uppercase">
          {nodeType}
        </span>
      </div>

      {/* Rank bar */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[9px] text-slate-500 font-mono">Rank</span>
        <div className="flex gap-0.5">
          {Array.from({ length: maxRank }, (_, i) => (
            <div
              key={i}
              className={`w-2.5 h-1.5 rounded-sm ${
                i < currentPoints ? "bg-amber-500" : "bg-slate-700"
              }`}
            />
          ))}
        </div>
        <span className="text-[9px] text-slate-400 font-mono">
          {currentPoints}/{maxRank}
        </span>
      </div>

      {/* Spell ID ref */}
      {spellId > 0 && (
        <span className="text-[8px] text-slate-600 font-mono block">
          Spell ID: {spellId}
        </span>
      )}

      {/* Interaction hint */}
      <div className="mt-2 pt-1.5 border-t border-slate-800">
        <span className="text-[8px] text-slate-600 italic">
          Left-click to add · Right-click to remove
        </span>
      </div>
    </div>
  );
}

function ChoiceTooltip({
  optA,
  optB,
  selection,
}: {
  optA: ChoiceOption;
  optB: ChoiceOption;
  selection: number | null;
}) {
  return (
    <div
      className="
        absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-3
        w-72 p-3 rounded-lg
        bg-[#0d1117] border border-[#2e3a50]
        shadow-[0_4px_24px_rgba(0,0,0,0.7)]
        pointer-events-none
      "
    >
      {/* Choice header */}
      <div className="text-[9px] text-slate-500 font-mono uppercase tracking-wider mb-2">
        Choose One
      </div>

      {/* Option A */}
      <div
        className={`p-2 rounded mb-1.5 border ${
          selection === 0
            ? "border-amber-600/60 bg-amber-900/20"
            : "border-slate-700/50 bg-slate-800/30"
        }`}
      >
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[8px] text-slate-600 font-mono">◀</span>
          <span
            className={`text-[11px] font-bold font-['Rajdhani',sans-serif] ${
              selection === 0 ? "text-amber-400" : "text-slate-300"
            }`}
          >
            {optA.name}
          </span>
        </div>
        <p className="text-[9px] text-slate-400 leading-relaxed">
          {optA.description}
        </p>
        <span className="text-[7px] text-slate-600 font-mono mt-1 block">
          Spell {optA.spellId}
        </span>
      </div>

      {/* Option B */}
      <div
        className={`p-2 rounded border ${
          selection === 1
            ? "border-amber-600/60 bg-amber-900/20"
            : "border-slate-700/50 bg-slate-800/30"
        }`}
      >
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[8px] text-slate-600 font-mono">▶</span>
          <span
            className={`text-[11px] font-bold font-['Rajdhani',sans-serif] ${
              selection === 1 ? "text-amber-400" : "text-slate-300"
            }`}
          >
            {optB.name}
          </span>
        </div>
        <p className="text-[9px] text-slate-400 leading-relaxed">
          {optB.description}
        </p>
        <span className="text-[7px] text-slate-600 font-mono mt-1 block">
          Spell {optB.spellId}
        </span>
      </div>

      {/* Interaction hint */}
      <div className="mt-2 pt-1.5 border-t border-slate-800">
        <span className="text-[8px] text-slate-600 italic">
          Click left/right to choose · Right-click to deselect
        </span>
      </div>
    </div>
  );
}
