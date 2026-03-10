// @ts-nocheck
// BlizzardTalentTree.tsx — WoW in-game style talent tree
// Replicates the diamond grid layout with golden connection lines and hero portraits.
import React, {
  useState, useEffect, useMemo, useCallback, useRef,
} from "react";
import { getSurvivalTalentTree } from "@/lib/blizzardApi";
import type {
  BzTalentNode, BzHeroTree, TalentTreeFullResponse,
} from "@/lib/blizzardApi";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const NODE_SIZE = 40;
const COL_STEP = 52;   // horizontal spacing between columns
const ROW_STEP = 56;   // vertical spacing between rows
const TREE_PAD = 16;

const GOLD = "#d4a017";
const GOLD_BRIGHT = "#fbbf24";
const GOLD_DIM = "#6b5316";
const GOLD_GLOW = "rgba(251,191,36,.4)";
const INACTIVE_BORDER = "#3a3a2e";
const LOCKED_BORDER = "#1e1e1a";
const BG_DARK = "rgba(10,12,18,.85)";
const FALLBACK_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%230d1520'/%3E%3Ctext x='32' y='38' text-anchor='middle' fill='%234b6070' font-size='28'%3E%3F%3C/text%3E%3C/svg%3E";

// ── Hardcoded fallback hero trees ────────────────────────────────────────────
const FALLBACK_SENTINEL_NODES: BzTalentNode[] = [
  { id: 94973, display_row: 1, display_col: 1, node_type: { id: 1, type: "SINGLE" }, entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1253825, name: "Lunar Inspiration" }, description: "Your Sentinel abilities deal increased Arcane damage." } }] },
  { id: 94958, display_row: 1, display_col: 0, node_type: { id: 2, type: "SELECTION" }, entries: [
    { id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1253751, name: "Stargazer" }, description: "Raptor Strike extends Sentinel Mark by 2 sec." } },
    { id: 2, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1253807, name: "Open Fire" }, description: "Kill Command reduces Sentinel cooldown by 5 sec." } },
  ] },
  { id: 94971, display_row: 1, display_col: 2, node_type: { id: 1, type: "SINGLE" }, entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 450379, name: "Extrapolation" }, description: "Sentinel Marks have near-permanent uptime." } }] },
  { id: 110028, display_row: 1, display_col: 3, node_type: { id: 2, type: "SELECTION" }, entries: [
    { id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1264904, name: "Twilight Requiem" }, description: "When Sentinel expires, deals Arcane damage to all marked targets." } },
    { id: 2, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1266069, name: "Stalk and Strike" }, description: "Mongoose Bite/Raptor Strike damage increased per active Sentinel Mark." } },
  ] },
  { id: 94960, display_row: 2, display_col: 0, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94958 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 450373, name: "Don't Look Back" }, description: "Harpoon applies Sentinel Mark on impact." } }] },
  { id: 94959, display_row: 2, display_col: 1, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94973 }, { id: 94971 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 450376, name: "Catch Out" }, description: "Kill Command can apply an additional Sentinel Mark." } }] },
  { id: 94957, display_row: 2, display_col: 2, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94971 }, { id: 110028 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 450380, name: "Invigorating Pulse" }, description: "Sentinel Mark consumption heals you." } }] },
  { id: 94970, display_row: 3, display_col: 0, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94960 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1253846, name: "Eyes Closed" }, description: "Sentinel Mark damage increased by 10%." } }] },
  { id: 94956, display_row: 3, display_col: 1, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94959 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 450378, name: "Lunar Calling" }, description: "Sentinel Mark consumption damage increased and can crit." } }] },
  { id: 109805, display_row: 3, display_col: 3, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94957 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1264903, name: "Release and Reload" }, description: "Sentinel cooldown reduced when you consume Sentinel Marks." } }] },
  { id: 94955, display_row: 4, display_col: 1, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94970 }, { id: 94956 }, { id: 109805 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 450384, name: "Lunar Storm" }, description: "Capstone: Sentinel Mark consumption triggers Lunar Storm AoE." } }] },
];

const FALLBACK_PACK_LEADER_NODES: BzTalentNode[] = [
  { id: 94985, display_row: 1, display_col: 0, node_type: { id: 1, type: "SINGLE" }, entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472358, name: "Vicious Hunt" }, description: "Kill Command can summon a dire beast to attack." } }] },
  { id: 94962, display_row: 1, display_col: 2, node_type: { id: 1, type: "SINGLE" }, entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472357, name: "Pack Coordination" }, description: "Pet damage increased while fighting alongside it." } }] },
  { id: 94979, display_row: 1, display_col: 3, node_type: { id: 2, type: "SELECTION" }, entries: [
    { id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472719, name: "Howl of the Pack" }, description: "Pet's Basic Attack generates Focus for you." } },
    { id: 2, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472720, name: "Den Recovery" }, description: "Aspect of the Turtle heals pet to full." } },
  ] },
  { id: 94972, display_row: 2, display_col: 0, node_type: { id: 2, type: "SELECTION" }, prerequisite_nodes: [{ id: 94985 }], entries: [
    { id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472476, name: "Ursine Fury" }, description: "Kill Command deals increased damage, can reset cooldown." } },
    { id: 2, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472524, name: "Sharpened Claws" }, description: "Pet crit strikes deal increased damage." } },
  ] },
  { id: 94984, display_row: 2, display_col: 1, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94985 }, { id: 94962 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472550, name: "Wild Attacks" }, description: "Pet's Basic Attack can trigger a bonus attack." } }] },
  { id: 94988, display_row: 2, display_col: 2, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94962 }, { id: 94979 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472639, name: "Cornered Prey" }, description: "Kill Command damage increased on targets below 20% health." } }] },
  { id: 109803, display_row: 2, display_col: 3, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94979 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1264781, name: "Frenzied Tear" }, description: "Pet enters frenzy after Kill Command." } }] },
  { id: 94969, display_row: 3, display_col: 0, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94972 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472660, name: "Go for the Throat" }, description: "Kill Command generates additional Focus." } }] },
  { id: 94967, display_row: 3, display_col: 1, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94984 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472707, name: "Furious Assault" }, description: "Melee attacks can trigger additional pet attack." } }] },
  { id: 109804, display_row: 3, display_col: 2, node_type: { id: 2, type: "SELECTION" }, prerequisite_nodes: [{ id: 94988 }], entries: [
    { id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1264797, name: "Scattered Prey" }, description: "Kill Command hits additional nearby targets." } },
    { id: 2, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1264792, name: "Wyvern's Gaze" }, description: "Pet stuns targets periodically." } },
  ] },
  { id: 109802, display_row: 3, display_col: 3, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 109803 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1264775, name: "Claw Frenzy" }, description: "Pet attack speed increased per active bleed." } }] },
  { id: 94966, display_row: 4, display_col: 1, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94969 }, { id: 94967 }, { id: 109804 }, { id: 109802 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472741, name: "Pack Assault" }, description: "Capstone: Takedown triggers Pack Assault — all beasts attack." } }] },
];

const FALLBACK_HERO_TREES: BzHeroTree[] = [
  { id: 42, name: "Sentinel", hero_talent_nodes: FALLBACK_SENTINEL_NODES },
  { id: 43, name: "Pack Leader", hero_talent_nodes: FALLBACK_PACK_LEADER_NODES },
];

// Spell name → TalentConfig key
const NAME_TO_KEY: Record<string, string> = {
  "Kill Command": "killCommand", "Wildfire Bomb": "wildfireBomb", "Raptor Strike": "raptorStrike",
  "Guerrilla Tactics": "guerrillaTactics", "Tip of the Spear": "tipOfTheSpear", "Lunge": "lunge",
  "Boomstick": "boomstick", "Strike as One": "strikeAsOne", "Flamebreak": "flamebreak",
  "Quick Reload": "quickReload", "Mongoose Fury": "mongooseFury", "Wildfire Shells": "wildfireShells",
  "Shellshock": "shellshock", "Wallop": "wallop", "Bonding": "bonding", "Sweeping Spear": "sweepingSpear",
  "Blackrock Munitions": "blackrockMunitions", "Takedown": "takedown", "Killer Companion": "killerCompanion",
  "Twin Fangs": "twinFangs", "Savagery": "savagery", "Wildfire Infusion": "wildfireInfusion",
  "Flanked": "flanked", "Primal Surge": "primalSurge", "Raptor Swipe": "raptorSwipe",
  "Flanker's Advantage": "flankerAdvantage", "Bloodseeker": "bloodseeker",
  "Two Against Many": "twoAgainstMany", "Lethal Calibration": "lethalCalibration",
  "Stargazer": "stargazer", "Open Fire": "openFire", "Lunar Inspiration": "lunarInspiration",
  "Extrapolation": "extrapolation", "Twilight Requiem": "twilightRequiem",
  "Stalk and Strike": "stalkAndStrike", "Don't Look Back": "dontLookBack",
  "Catch Out": "catchOut", "Invigorating Pulse": "invigoratingPulse",
  "Eyes Closed": "eyesClosed", "Lunar Calling": "lunarCalling",
  "Release and Reload": "releaseAndReload", "Lunar Storm": "lunarStorm",
  "Vicious Hunt": "viciousHunt", "Pack Coordination": "packCoordination",
  "Howl of the Pack": "howlOfThePack", "Den Recovery": "denRecovery",
  "Ursine Fury": "ursineFury", "Sharpened Claws": "sharpenedClaws",
  "Wild Attacks": "wildAttacks", "Cornered Prey": "corneredPrey",
  "Frenzied Tear": "frenziedTear", "Go for the Throat": "goForTheThroat",
  "Furious Assault": "furiousAssault", "Scattered Prey": "scatteredPrey",
  "Wyvern's Gaze": "wyvernGaze", "Claw Frenzy": "clawFrenzy", "Pack Assault": "packAssault",
};

const CORE_SPEC = new Set([
  "killCommand","wildfireBomb","raptorStrike","guerrillaTactics",
  "tipOfTheSpear","lunge","boomstick","strikeAsOne","flamebreak",
  "quickReload","mongooseFury","wildfireShells","shellshock","wallop",
  "bonding","sweepingSpear","blackrockMunitions","takedown",
  "killerCompanion","twinFangs","savagery","wildfireInfusion",
  "flanked","primalSurge","raptorSwipe",
]);

const CORE_CLASS = new Set(["Keen Eyesight","Unnatural Causes","Trigger Finger"]);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function nodeSpellName(node: BzTalentNode): string | null {
  return node.entries?.[0]?.spell_tooltip?.spell?.name ?? null;
}

function nodeTalentKey(node: BzTalentNode): string | null {
  const name = nodeSpellName(node);
  return name ? (NAME_TO_KEY[name] ?? null) : null;
}

function buildNodeMap(nodes: BzTalentNode[]) {
  const m = new Map<number, BzTalentNode>();
  nodes.forEach((n) => m.set(n.id, n));
  return m;
}

/** Get unique sorted rows/cols and create index mappings */
function gridLayout(nodes: BzTalentNode[]) {
  if (!nodes.length) return { rows: 0, cols: 0, rowMap: new Map<number, number>(), colMap: new Map<number, number>(), uniqueRows: [] as number[], uniqueCols: [] as number[] };
  const uRows = [...new Set(nodes.map(n => n.display_row))].sort((a, b) => a - b);
  const uCols = [...new Set(nodes.map(n => n.display_col))].sort((a, b) => a - b);
  return {
    rows: uRows.length,
    cols: uCols.length,
    rowMap: new Map(uRows.map((r, i) => [r, i])),
    colMap: new Map(uCols.map((c, i) => [c, i])),
    uniqueRows: uRows,
    uniqueCols: uCols,
  };
}

/** Pixel position of node center in the absolute-positioned layout */
function nodePos(rowIdx: number, colIdx: number) {
  return {
    x: TREE_PAD + colIdx * COL_STEP + NODE_SIZE / 2,
    y: TREE_PAD + rowIdx * ROW_STEP + NODE_SIZE / 2,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip
// ─────────────────────────────────────────────────────────────────────────────

interface TooltipInfo {
  name: string;
  description: string;
  rank?: number;
  maxRank?: number;
}

function NodeTooltip({ info, x, y }: { info: TooltipInfo; x: number; y: number }) {
  const left = Math.min(x + 14, window.innerWidth - 300);
  const top = Math.min(y - 10, window.innerHeight - 160);
  return (
    <div style={{
      position: "fixed", left, top, zIndex: 10000,
      background: "linear-gradient(135deg, #1a1408 0%, #0d0f14 100%)",
      border: `1px solid ${GOLD_DIM}`, borderRadius: 6,
      padding: "10px 14px", maxWidth: 280, pointerEvents: "none",
      boxShadow: `0 0 20px rgba(0,0,0,.8), inset 0 1px 0 ${GOLD_DIM}40`,
    }}>
      <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, fontWeight: 700, color: GOLD_BRIGHT, marginBottom: 4 }}>
        {info.name}
      </div>
      {info.maxRank && info.maxRank > 1 && (
        <div style={{ fontSize: 10, color: "#7a6d3a", marginBottom: 4 }}>
          Rank {info.rank ?? 0} / {info.maxRank}
        </div>
      )}
      <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 12, color: "#b8a67a", lineHeight: 1.5 }}>
        {info.description}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG Connection Lines — golden diagonal lines like the in-game tree
// ─────────────────────────────────────────────────────────────────────────────

function ConnectionLines({
  nodes, nodeMap, rowMap, colMap, width, height, selectedKeys, coreKeys,
}: {
  nodes: BzTalentNode[];
  nodeMap: Map<number, BzTalentNode>;
  rowMap: Map<number, number>;
  colMap: Map<number, number>;
  width: number;
  height: number;
  selectedKeys: Set<string>;
  coreKeys: Set<string>;
}) {
  const lines: React.ReactNode[] = [];

  nodes.forEach(node => {
    if (!node.prerequisite_nodes?.length) return;
    const ri = rowMap.get(node.display_row);
    const ci = colMap.get(node.display_col);
    if (ri === undefined || ci === undefined) return;
    const to = nodePos(ri, ci);
    const nodeKey = nodeTalentKey(node);
    const nodeOn = nodeKey ? (selectedKeys.has(nodeKey) || coreKeys.has(nodeKey)) : false;

    node.prerequisite_nodes.forEach(prereq => {
      const pNode = nodeMap.get(prereq.id);
      if (!pNode) return;
      const pri = rowMap.get(pNode.display_row);
      const pci = colMap.get(pNode.display_col);
      if (pri === undefined || pci === undefined) return;
      const from = nodePos(pri, pci);
      const pKey = nodeTalentKey(pNode);
      const parentOn = pKey ? (selectedKeys.has(pKey) || coreKeys.has(pKey)) : false;
      const active = parentOn && nodeOn;

      lines.push(
        <line
          key={`${pNode.id}-${node.id}`}
          x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke={active ? GOLD : GOLD_DIM}
          strokeWidth={active ? 2.5 : 1.5}
          opacity={active ? 1 : 0.35}
        />
      );
    });
  });

  return (
    <svg
      width={width} height={height}
      style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
    >
      {lines}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TalentNode — single circular node with icon, border, rank badge
// ─────────────────────────────────────────────────────────────────────────────

function TalentNode({
  node, mediaMap, selectedKeys, selectedChoices, canSelect, isCore,
  onClick, onChoiceClick, onHover,
}: {
  node: BzTalentNode;
  mediaMap: Record<number, string>;
  selectedKeys: Set<string>;
  selectedChoices: Record<number, number>;
  canSelect: boolean;
  isCore: boolean;
  onClick: () => void;
  onChoiceClick: (idx: number) => void;
  onHover: (info: TooltipInfo | null, x: number, y: number) => void;
}) {
  if (!node.entries?.length || !node.node_type) return null;

  const isChoice = node.node_type.type === "SELECTION" && node.entries.length >= 2;
  const chosenIdx = selectedChoices[node.id] ?? 0;
  const entry = node.entries[isChoice ? chosenIdx : 0];
  const key = nodeTalentKey(node);
  const isSelected = key ? (selectedKeys.has(key) || isCore) : isCore;
  const isLocked = !isCore && !isSelected && !canSelect;
  const maxRank = entry?.max_rank ?? 1;

  const borderColor = isSelected ? GOLD_BRIGHT : isLocked ? LOCKED_BORDER : INACTIVE_BORDER;
  const glowShadow = isSelected
    ? `0 0 0 2px ${GOLD_GLOW}, 0 0 12px 3px ${GOLD_GLOW}`
    : undefined;
  const brightness = isSelected ? 1 : isLocked ? 0.25 : 0.55;

  const spellId = entry?.spell_tooltip?.spell?.id;
  const iconUrl = spellId && mediaMap[spellId] ? mediaMap[spellId] : FALLBACK_ICON;

  const handleMouseEnter = (e: React.MouseEvent) => {
    const name = entry?.spell_tooltip?.spell?.name ?? "?";
    const desc = entry?.spell_tooltip?.description ?? "";
    onHover({ name, description: desc, rank: isSelected ? maxRank : 0, maxRank }, e.clientX, e.clientY);
  };

  // Choice node — split circle with two halves
  if (isChoice) {
    return (
      <div
        style={{
          width: NODE_SIZE, height: NODE_SIZE,
          borderRadius: isSelected ? "50%" : 4,
          transform: isSelected ? undefined : "rotate(45deg)",
          border: `2px solid ${borderColor}`,
          boxShadow: glowShadow,
          overflow: "hidden", cursor: isLocked ? "not-allowed" : "pointer",
          display: "flex", transition: "all .2s",
          background: "#0a0c12",
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => onHover(null, 0, 0)}
      >
        {node.entries.slice(0, 2).map((ent, idx) => {
          const sid = ent.spell_tooltip?.spell?.id;
          const src = sid && mediaMap[sid] ? mediaMap[sid] : FALLBACK_ICON;
          const isChosen = isSelected && chosenIdx === idx;
          return (
            <div
              key={idx}
              onClick={() => { if (!isLocked) onChoiceClick(idx); }}
              style={{
                width: "50%", height: "100%", overflow: "hidden", position: "relative",
                borderRight: idx === 0 ? `1px solid ${GOLD_DIM}30` : undefined,
              }}
            >
              <img
                src={src} alt="" loading="lazy" draggable={false}
                onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_ICON; }}
                style={{
                  width: NODE_SIZE, height: NODE_SIZE,
                  objectFit: "cover",
                  transform: isSelected ? undefined : "rotate(-45deg) scale(1.4)",
                  marginLeft: idx === 0 ? 0 : -(NODE_SIZE / 2),
                  filter: `brightness(${isChosen ? 1 : brightness * 0.5})`,
                  transition: "filter .15s",
                }}
              />
            </div>
          );
        })}
      </div>
    );
  }

  // Single node — circular
  return (
    <div
      onClick={() => { if (!isCore && canSelect) onClick(); }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => onHover(null, 0, 0)}
      style={{
        width: NODE_SIZE, height: NODE_SIZE, borderRadius: "50%",
        border: `2px solid ${borderColor}`, boxShadow: glowShadow,
        cursor: isCore ? "default" : isLocked ? "not-allowed" : "pointer",
        transition: "all .2s", background: "#0a0c12",
        position: "relative", overflow: "hidden",
      }}
    >
      <img
        src={iconUrl} alt="" loading="lazy" draggable={false}
        onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_ICON; }}
        style={{
          width: "100%", height: "100%", objectFit: "cover",
          filter: `brightness(${brightness})`, transition: "filter .15s",
          borderRadius: "50%",
        }}
      />
      {maxRank > 1 && (
        <div style={{
          position: "absolute", bottom: -2, right: -2,
          background: isSelected ? "#1a1a0a" : "#0d0f14",
          border: `1px solid ${isSelected ? GOLD : GOLD_DIM}`,
          borderRadius: 3, padding: "0 3px",
          fontSize: 8, fontWeight: 700, lineHeight: "13px",
          color: isSelected ? GOLD_BRIGHT : "#4a4030",
          fontFamily: "'Rajdhani',sans-serif",
        }}>
          {isSelected ? maxRank : 0}/{maxRank}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TalentSection — one tree column (absolute-positioned diamond layout)
// ─────────────────────────────────────────────────────────────────────────────

function TalentSection({
  label, pointBudget, nodes, mediaMap,
  selectedKeys, selectedChoices, coreKeys,
  onToggle, onChoiceSelect, onHover,
  showPointCounter = true,
}: {
  label: string;
  pointBudget: number;
  nodes: BzTalentNode[];
  mediaMap: Record<number, string>;
  selectedKeys: Set<string>;
  selectedChoices: Record<number, number>;
  coreKeys: Set<string>;
  onToggle: (node: BzTalentNode) => void;
  onChoiceSelect: (node: BzTalentNode, entryIdx: number) => void;
  onHover: (info: TooltipInfo | null, x: number, y: number) => void;
  showPointCounter?: boolean;
}) {
  const { rows, cols, rowMap, colMap } = useMemo(() => gridLayout(nodes), [nodes]);
  const nodeMap = useMemo(() => buildNodeMap(nodes), [nodes]);

  const usedPts = useMemo(() => {
    return nodes.reduce((sum, n) => {
      const key = nodeTalentKey(n);
      if (!key || coreKeys.has(key)) return sum;
      return sum + (selectedKeys.has(key) ? (n.entries?.[0]?.max_rank ?? 1) : 0);
    }, 0);
  }, [nodes, selectedKeys, coreKeys]);

  if (!nodes.length) return null;

  const gridW = cols * COL_STEP - (COL_STEP - NODE_SIZE) + TREE_PAD * 2;
  const gridH = rows * ROW_STEP - (ROW_STEP - NODE_SIZE) + TREE_PAD * 2;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: "1 1 0", minWidth: gridW }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, justifyContent: "center",
      }}>
        <span style={{
          fontFamily: "'Rajdhani',sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: 3,
          color: "#c8b882", textTransform: "uppercase",
        }}>{label}</span>
        {showPointCounter && (
          <span style={{
            fontFamily: "'Rajdhani',sans-serif", fontSize: 18, fontWeight: 700,
            color: usedPts >= pointBudget ? GOLD_BRIGHT : "#5a5040",
          }}>{usedPts}</span>
        )}
      </div>

      {/* Tree container */}
      <div style={{
        position: "relative", width: gridW, height: gridH,
        borderRadius: 8,
      }}>
        <ConnectionLines
          nodes={nodes} nodeMap={nodeMap}
          rowMap={rowMap} colMap={colMap}
          width={gridW} height={gridH}
          selectedKeys={selectedKeys} coreKeys={coreKeys}
        />

        {/* Nodes (absolute positioned) */}
        {nodes.map(node => {
          const key = nodeTalentKey(node);
          const isCore = !!(key && coreKeys.has(key));
          const prereqsMet = (node.prerequisite_nodes ?? []).every(p => {
            const pNode = nodeMap.get(p.id);
            if (!pNode) return true;
            const pk = nodeTalentKey(pNode);
            return pk ? (coreKeys.has(pk) || selectedKeys.has(pk)) : false;
          });
          const canSelect = prereqsMet && (isCore || (selectedKeys.has(key ?? "") ? true : usedPts < pointBudget));

          const ri = rowMap.get(node.display_row);
          const ci = colMap.get(node.display_col);
          if (ri === undefined || ci === undefined) return null;

          return (
            <div
              key={node.id}
              style={{
                position: "absolute",
                left: TREE_PAD + ci * COL_STEP,
                top: TREE_PAD + ri * ROW_STEP,
              }}
            >
              <TalentNode
                node={node} mediaMap={mediaMap}
                selectedKeys={selectedKeys} selectedChoices={selectedChoices}
                canSelect={canSelect} isCore={isCore}
                onClick={() => onToggle(node)}
                onChoiceClick={idx => onChoiceSelect(node, idx)}
                onHover={onHover}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero Section — large portrait + hero tree + toggle
// ─────────────────────────────────────────────────────────────────────────────

function HeroSection({
  heroTrees, activeHeroTreeId, activeHeroKey, activeHeroTree, heroNodes,
  mediaMap, selectedKeys, selectedChoices,
  onHeroToggle, onHeroChoiceSelect, onHeroSwitch, onHover,
}: {
  heroTrees: BzHeroTree[];
  activeHeroTreeId: number;
  activeHeroKey: "sentinel" | "packLeader";
  activeHeroTree: BzHeroTree | undefined;
  heroNodes: BzTalentNode[];
  mediaMap: Record<number, string>;
  selectedKeys: Set<string>;
  selectedChoices: Record<number, number>;
  onHeroToggle: (node: BzTalentNode) => void;
  onHeroChoiceSelect: (node: BzTalentNode, entryIdx: number) => void;
  onHeroSwitch: (id: number) => void;
  onHover: (info: TooltipInfo | null, x: number, y: number) => void;
}) {
  const isSentinel = activeHeroKey === "sentinel";
  const heroName = activeHeroTree?.name ?? (isSentinel ? "Sentinel" : "Pack Leader");
  const accentColor = isSentinel ? "#38bdf8" : "#c084fc";

  // Get hero portrait spell ID (first node's first entry)
  const portraitSpellId = heroNodes[0]?.entries?.[0]?.spell_tooltip?.spell?.id;

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      flex: "0 0 auto",
    }}>
      {/* Hero name */}
      <div style={{
        fontFamily: "'Rajdhani',sans-serif", fontSize: 13, fontWeight: 700,
        letterSpacing: 3, color: "#c8b882", textTransform: "uppercase",
        marginBottom: 8,
      }}>
        {heroName.toUpperCase()}
      </div>

      {/* Large hero portrait */}
      <div style={{
        width: 80, height: 80, borderRadius: "50%",
        border: `3px solid ${GOLD}`,
        boxShadow: `0 0 20px ${GOLD_GLOW}, 0 0 40px rgba(212,160,23,.15)`,
        overflow: "hidden", marginBottom: 4,
        background: "#0a0c12",
        cursor: heroTrees.length >= 2 ? "pointer" : "default",
      }}
        onClick={() => {
          if (heroTrees.length >= 2) {
            const other = heroTrees.find(ht => ht.id !== activeHeroTreeId);
            if (other) onHeroSwitch(other.id);
          }
        }}
        title={heroTrees.length >= 2 ? "Click to switch hero tree" : undefined}
      >
        {portraitSpellId && mediaMap[portraitSpellId] ? (
          <img
            src={mediaMap[portraitSpellId]} alt={heroName}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_ICON; }}
          />
        ) : (
          <div style={{
            width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 32,
          }}>
            {isSentinel ? "🌙" : "🐺"}
          </div>
        )}
      </div>

      {/* Hero switch buttons */}
      {heroTrees.length >= 2 && (
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {heroTrees.map(ht => {
            const isActive = ht.id === activeHeroTreeId;
            const htSentinel = ht.name.toLowerCase().includes("sentinel");
            const clr = htSentinel ? "#38bdf8" : "#c084fc";
            return (
              <button
                key={ht.id}
                onClick={() => onHeroSwitch(ht.id)}
                style={{
                  width: 8, height: 8, borderRadius: "50%", padding: 0,
                  border: `1.5px solid ${isActive ? clr : GOLD_DIM}`,
                  background: isActive ? clr : "transparent",
                  cursor: "pointer", transition: "all .15s",
                }}
                title={ht.name}
              />
            );
          })}
        </div>
      )}

      {/* Hero talent tree (dark panel behind it) */}
      <div style={{
        background: BG_DARK,
        borderRadius: 10,
        padding: "8px 4px",
        border: `1px solid ${GOLD_DIM}30`,
      }}>
        <TalentSection
          label=""
          pointBudget={10}
          nodes={heroNodes}
          mediaMap={mediaMap}
          selectedKeys={selectedKeys}
          selectedChoices={selectedChoices}
          coreKeys={new Set()}
          onToggle={onHeroToggle}
          onChoiceSelect={onHeroChoiceSelect}
          onHover={onHover}
          showPointCounter={false}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading Skeleton
// ─────────────────────────────────────────────────────────────────────────────

function TreeSkeleton() {
  return (
    <div style={{ display: "flex", gap: 24, justifyContent: "center", padding: 16, opacity: 0.6 }}>
      {[5, 4, 5].map((cols, si) => (
        <div key={si} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ height: 14, width: 80, background: GOLD_DIM, borderRadius: 4, opacity: 0.3 }} />
          {si === 1 && (
            <div style={{
              width: 64, height: 64, borderRadius: "50%",
              background: GOLD_DIM, opacity: 0.2,
            }} />
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", maxWidth: cols * 52 }}>
            {Array.from({ length: cols * 4 }).map((_, i) => (
              <div key={i} style={{
                width: NODE_SIZE, height: NODE_SIZE, borderRadius: "50%",
                background: "#0d1520", border: `1px solid ${LOCKED_BORDER}`,
                animation: "pulse 1.8s ease-in-out infinite",
                animationDelay: `${(i % 5) * 150}ms`,
              }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Export — BlizzardTalentTree
// ─────────────────────────────────────────────────────────────────────────────

export interface BlizzardTalentTreeProps {
  specSelectedKeys?: string[];
  onSpecToggle?: (key: string, selected: boolean) => void;
  heroKey?: "sentinel" | "packLeader";
  onHeroChange?: (hero: "sentinel" | "packLeader") => void;
  heroSelectedKeys?: string[];
  onHeroToggle?: (key: string, selected: boolean) => void;
}

export function BlizzardTalentTree({
  specSelectedKeys,
  onSpecToggle,
  heroKey: heroKeyProp,
  onHeroChange,
  heroSelectedKeys: heroSelectedKeysProp,
  onHeroToggle,
}: BlizzardTalentTreeProps) {
  // ── Data ──────────────────────────────────────────────────────────────────
  const [treeData, setTreeData] = useState<TalentTreeFullResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setLoadError(null);
    getSurvivalTalentTree()
      .then(data => { if (mounted) { setTreeData(data); setIsLoading(false); } })
      .catch(err => { if (mounted) { setLoadError(err?.message ?? "Failed to load"); setIsLoading(false); } });
    return () => { mounted = false; };
  }, []);

  // ── Selection state ─────────────────────────────────────────────────────
  const [internalSpecKeys, setInternalSpecKeys] = useState<string[]>([]);
  const [internalHeroKey, setInternalHeroKey] = useState<"sentinel" | "packLeader">("sentinel");
  const [internalHeroKeys, setInternalHeroKeys] = useState<string[]>([]);
  const [selectedChoices, setSelectedChoices] = useState<Record<number, number>>({});

  const activeSpecKeys = specSelectedKeys ?? internalSpecKeys;
  const activeHeroKey = heroKeyProp ?? internalHeroKey;
  const activeHeroKeys = heroSelectedKeysProp ?? internalHeroKeys;

  const selectedKeys = useMemo<Set<string>>(() => {
    return new Set([...CORE_SPEC.values(), ...activeSpecKeys, ...activeHeroKeys]);
  }, [activeSpecKeys, activeHeroKeys]);

  // ── Hero tree resolution ──────────────────────────────────────────────────
  const heroTrees = useMemo(() => {
    const apiTrees = treeData?.heroTrees ?? [];
    return apiTrees.length > 0 ? apiTrees : FALLBACK_HERO_TREES;
  }, [treeData]);

  const activeHeroTreeId = useMemo(() => {
    if (!heroTrees.length) return -1;
    const match = heroTrees.find(ht =>
      ht.name.toLowerCase().includes(activeHeroKey === "sentinel" ? "sentinel" : "pack")
    );
    return match?.id ?? heroTrees[0]?.id ?? -1;
  }, [heroTrees, activeHeroKey]);

  const activeHeroTree = useMemo(
    () => heroTrees.find(ht => ht.id === activeHeroTreeId),
    [heroTrees, activeHeroTreeId]
  );

  const heroNodes: BzTalentNode[] = useMemo(
    () => activeHeroTree
      ? (activeHeroTree.spec_talent_nodes ?? activeHeroTree.hero_talent_nodes ?? activeHeroTree.class_talent_nodes ?? [])
      : [],
    [activeHeroTree]
  );

  // ── Tooltip ───────────────────────────────────────────────────────────────
  const [tooltip, setTooltip] = useState<{ info: TooltipInfo; x: number; y: number } | null>(null);
  const tooltipTimer = useRef<number>();
  const handleHover = useCallback((info: TooltipInfo | null, x: number, y: number) => {
    clearTimeout(tooltipTimer.current);
    if (!info) {
      tooltipTimer.current = window.setTimeout(() => setTooltip(null), 80);
    } else {
      setTooltip({ info, x, y });
    }
  }, []);

  // ── Toggle handlers ───────────────────────────────────────────────────────
  const handleSpecToggle = useCallback((node: BzTalentNode) => {
    const key = nodeTalentKey(node);
    if (!key || CORE_SPEC.has(key)) return;
    const isOn = selectedKeys.has(key);
    if (onSpecToggle) onSpecToggle(key, !isOn);
    else setInternalSpecKeys(prev => isOn ? prev.filter(k => k !== key) : [...prev, key]);
  }, [selectedKeys, onSpecToggle]);

  const handleChoiceSelect = useCallback((node: BzTalentNode, entryIdx: number) => {
    const entry = node.entries[entryIdx];
    const newKey = entry ? (NAME_TO_KEY[entry.spell_tooltip?.spell?.name ?? ""] ?? null) : null;
    const oldIdx = selectedChoices[node.id] ?? 0;
    const oldEntry = node.entries[oldIdx];
    const oldKey = oldEntry ? (NAME_TO_KEY[oldEntry.spell_tooltip?.spell?.name ?? ""] ?? null) : null;
    setSelectedChoices(prev => ({ ...prev, [node.id]: entryIdx }));
    if (oldKey && onSpecToggle) onSpecToggle(oldKey, false);
    if (newKey && onSpecToggle) onSpecToggle(newKey, true);
    else if (!onSpecToggle) {
      setInternalSpecKeys(prev => {
        let next = oldKey ? prev.filter(k => k !== oldKey) : [...prev];
        if (newKey && !next.includes(newKey)) next = [...next, newKey];
        return next;
      });
    }
  }, [selectedChoices, onSpecToggle]);

  const handleHeroToggle = useCallback((node: BzTalentNode) => {
    const key = nodeTalentKey(node);
    if (!key) return;
    const isOn = selectedKeys.has(key);
    if (onHeroToggle) onHeroToggle(key, !isOn);
    else setInternalHeroKeys(prev => isOn ? prev.filter(k => k !== key) : [...prev, key]);
  }, [selectedKeys, onHeroToggle]);

  const handleHeroChoiceSelect = useCallback((node: BzTalentNode, entryIdx: number) => {
    const entry = node.entries[entryIdx];
    const newKey = entry ? (NAME_TO_KEY[entry.spell_tooltip?.spell?.name ?? ""] ?? null) : null;
    const oldIdx = selectedChoices[node.id] ?? 0;
    const oldEntry = node.entries[oldIdx];
    const oldKey = oldEntry ? (NAME_TO_KEY[oldEntry.spell_tooltip?.spell?.name ?? ""] ?? null) : null;
    setSelectedChoices(prev => ({ ...prev, [node.id]: entryIdx }));
    if (onHeroToggle) {
      if (oldKey) onHeroToggle(oldKey, false);
      if (newKey) onHeroToggle(newKey, true);
    } else {
      setInternalHeroKeys(prev => {
        let next = oldKey ? prev.filter(k => k !== oldKey) : [...prev];
        if (newKey && !next.includes(newKey)) next = [...next, newKey];
        return next;
      });
    }
  }, [selectedChoices, onHeroToggle]);

  const handleHeroSwitch = useCallback((heroId: number) => {
    const ht = heroTrees.find(h => h.id === heroId);
    if (!ht) return;
    const newKey = ht.name.toLowerCase().includes("pack") ? "packLeader" : "sentinel";
    if (onHeroChange) onHeroChange(newKey);
    else { setInternalHeroKey(newKey); setInternalHeroKeys([]); }
  }, [heroTrees, onHeroChange]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (isLoading) return <TreeSkeleton />;

  if (loadError) {
    return (
      <div style={{ padding: 24, textAlign: "center", fontFamily: "'Rajdhani',sans-serif", color: "#f87171", fontSize: 13 }}>
        <div style={{ marginBottom: 8 }}>⚠ Could not load talent tree</div>
        <div style={{ fontSize: 11, color: "#6b7280" }}>{loadError}</div>
      </div>
    );
  }

  if (!treeData) return null;

  const { specTree, mediaMap } = treeData;
  const classNodes = specTree.class_talent_nodes ?? [];

  // Filter hero node IDs out of spec nodes
  const heroNodeIdSet = new Set<number>();
  for (const ht of heroTrees) {
    for (const n of (ht.hero_talent_nodes ?? ht.spec_talent_nodes ?? ht.class_talent_nodes ?? [])) {
      heroNodeIdSet.add(n.id);
    }
  }
  const specNodes = (specTree.spec_talent_nodes ?? []).filter((n: BzTalentNode) => !heroNodeIdSet.has(n.id));

  const classBudget = specTree.talent_point_budget?.class_points ?? 31;
  const specBudget = specTree.talent_point_budget?.spec_points ?? 31;

  const classCoreKeys = new Set(
    classNodes
      .filter(n => CORE_CLASS.has(nodeSpellName(n) ?? ""))
      .map(n => nodeTalentKey(n))
      .filter(Boolean) as string[]
  );

  return (
    <div style={{ userSelect: "none" }}>
      <div style={{ overflowX: "auto", overflowY: "visible" }}>
        <div style={{
          display: "flex", gap: 20, alignItems: "flex-start",
          justifyContent: "center",
          minWidth: "fit-content", padding: "8px 4px 16px",
        }}>
          {/* CLASS TREE */}
          <TalentSection
            label="HUNTER"
            nodes={classNodes} mediaMap={mediaMap}
            pointBudget={classBudget}
            selectedKeys={selectedKeys} selectedChoices={selectedChoices}
            coreKeys={classCoreKeys}
            onToggle={handleSpecToggle} onChoiceSelect={handleChoiceSelect}
            onHover={handleHover}
          />

          {/* HERO TREE */}
          <HeroSection
            heroTrees={heroTrees}
            activeHeroTreeId={activeHeroTreeId}
            activeHeroKey={activeHeroKey}
            activeHeroTree={activeHeroTree}
            heroNodes={heroNodes}
            mediaMap={mediaMap}
            selectedKeys={selectedKeys}
            selectedChoices={selectedChoices}
            onHeroToggle={handleHeroToggle}
            onHeroChoiceSelect={handleHeroChoiceSelect}
            onHeroSwitch={handleHeroSwitch}
            onHover={handleHover}
          />

          {/* SPEC TREE */}
          <TalentSection
            label="SURVIVAL"
            nodes={specNodes} mediaMap={mediaMap}
            pointBudget={specBudget}
            selectedKeys={selectedKeys} selectedChoices={selectedChoices}
            coreKeys={CORE_SPEC}
            onToggle={handleSpecToggle} onChoiceSelect={handleChoiceSelect}
            onHover={handleHover}
          />
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && <NodeTooltip info={tooltip.info} x={tooltip.x} y={tooltip.y} />}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: .4; }
          50%       { opacity: .8; }
        }
      `}</style>
    </div>
  );
}

export default BlizzardTalentTree;
