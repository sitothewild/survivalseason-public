// @ts-nocheck
// BlizzardTalentTree.tsx — WoW in-game style talent tree
// Visual design matches hunter-tree.html / survival-tree.html / sentinel-tree.html
import React, {
  useState, useEffect, useMemo, useCallback, useRef,
} from "react";
import { getSurvivalTalentTree } from "@/lib/blizzardApi";
import type {
  BzTalentNode, BzHeroTree, TalentTreeFullResponse,
} from "@/lib/blizzardApi";

// ─────────────────────────────────────────────────────────────────────────────
// Constants — matched exactly to HTML reference files
// ─────────────────────────────────────────────────────────────────────────────

const NODE_R    = 18;           // node radius (R=18 in HTML)
const NODE_SIZE = NODE_R * 2;   // diameter = 36px
const COL_STEP  = 48;           // horizontal step (CW=48 in HTML)
const ROW_STEP  = 52;           // vertical step (RH=52 in HTML)
const TREE_PAD  = 30;           // padding inside tree container (PAD=30 in HTML)

const GOLD      = "#C8A84B";    // primary gold
const GOLD_DIM  = "#7a5a20";    // dim gold for inactive borders/lines
const GOLD_GLOW = "rgba(200,168,75,.45)";
const NODE_FILL = "#110a03";    // node background
const LINE_DIM  = "#3a2a08";    // inner ring / dim line color

const FALLBACK_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23110a03'/%3E%3C/svg%3E";

// ── Hardcoded fallback hero trees ────────────────────────────────────────────
const FALLBACK_SENTINEL_NODES: BzTalentNode[] = [
  { id: 94973, display_row: 1, display_col: 2, node_type: { id: 1, type: "SINGLE" }, entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1253825, name: "Lunar Inspiration" }, description: "Your Sentinel abilities deal increased Arcane damage." } }] },
  { id: 94958, display_row: 1, display_col: 1, node_type: { id: 2, type: "SELECTION" }, entries: [
    { id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1253751, name: "Stargazer" }, description: "Raptor Strike extends Sentinel Mark by 2 sec." } },
    { id: 2, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1253807, name: "Open Fire" }, description: "Kill Command reduces Sentinel cooldown by 5 sec." } },
  ] },
  { id: 94971, display_row: 1, display_col: 3, node_type: { id: 1, type: "SINGLE" }, entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 450379, name: "Extrapolation" }, description: "Sentinel Marks have near-permanent uptime." } }] },
  { id: 110028, display_row: 1, display_col: 4, node_type: { id: 2, type: "SELECTION" }, entries: [
    { id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1264904, name: "Twilight Requiem" }, description: "When Sentinel expires, deals Arcane damage to all marked targets." } },
    { id: 2, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1266069, name: "Stalk and Strike" }, description: "Mongoose Bite/Raptor Strike damage increased per active Sentinel Mark." } },
  ] },
  { id: 94960, display_row: 2, display_col: 1, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94958 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 450373, name: "Don't Look Back" }, description: "Harpoon applies Sentinel Mark on impact." } }] },
  { id: 94959, display_row: 2, display_col: 2, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94973 }, { id: 94971 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 450376, name: "Catch Out" }, description: "Kill Command can apply an additional Sentinel Mark." } }] },
  { id: 94957, display_row: 2, display_col: 3, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94971 }, { id: 110028 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 450380, name: "Invigorating Pulse" }, description: "Sentinel Mark consumption heals you." } }] },
  { id: 94970, display_row: 3, display_col: 1, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94960 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1253846, name: "Eyes Closed" }, description: "Sentinel Mark damage increased by 10%." } }] },
  { id: 94956, display_row: 3, display_col: 2, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94959 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 450378, name: "Lunar Calling" }, description: "Sentinel Mark consumption damage increased and can crit." } }] },
  { id: 109805, display_row: 3, display_col: 4, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94957 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1264903, name: "Release and Reload" }, description: "Sentinel cooldown reduced when you consume Sentinel Marks." } }] },
  { id: 94955, display_row: 4, display_col: 2, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94970 }, { id: 94956 }, { id: 109805 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 450384, name: "Lunar Storm" }, description: "Capstone: Sentinel Mark consumption triggers Lunar Storm AoE." } }] },
];

const FALLBACK_PACK_LEADER_NODES: BzTalentNode[] = [
  { id: 94985, display_row: 1, display_col: 1, node_type: { id: 1, type: "SINGLE" }, entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472358, name: "Vicious Hunt" }, description: "Kill Command can summon a dire beast to attack." } }] },
  { id: 94962, display_row: 1, display_col: 3, node_type: { id: 1, type: "SINGLE" }, entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472357, name: "Pack Coordination" }, description: "Pet damage increased while fighting alongside it." } }] },
  { id: 94979, display_row: 1, display_col: 4, node_type: { id: 2, type: "SELECTION" }, entries: [
    { id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472719, name: "Howl of the Pack" }, description: "Pet's Basic Attack generates Focus for you." } },
    { id: 2, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472720, name: "Den Recovery" }, description: "Aspect of the Turtle heals pet to full." } },
  ] },
  { id: 94972, display_row: 2, display_col: 1, node_type: { id: 2, type: "SELECTION" }, prerequisite_nodes: [{ id: 94985 }], entries: [
    { id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472476, name: "Ursine Fury" }, description: "Kill Command deals increased damage, can reset cooldown." } },
    { id: 2, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472524, name: "Sharpened Claws" }, description: "Pet crit strikes deal increased damage." } },
  ] },
  { id: 94984, display_row: 2, display_col: 2, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94985 }, { id: 94962 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472550, name: "Wild Attacks" }, description: "Pet's Basic Attack can trigger a bonus attack." } }] },
  { id: 94988, display_row: 2, display_col: 3, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94962 }, { id: 94979 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472639, name: "Cornered Prey" }, description: "Kill Command damage increased on targets below 20% health." } }] },
  { id: 109803, display_row: 2, display_col: 4, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94979 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1264781, name: "Frenzied Tear" }, description: "Pet enters frenzy after Kill Command." } }] },
  { id: 94969, display_row: 3, display_col: 1, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94972 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472660, name: "Go for the Throat" }, description: "Kill Command generates additional Focus." } }] },
  { id: 94967, display_row: 3, display_col: 2, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94984 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472707, name: "Furious Assault" }, description: "Melee attacks can trigger additional pet attack." } }] },
  { id: 109804, display_row: 3, display_col: 3, node_type: { id: 2, type: "SELECTION" }, prerequisite_nodes: [{ id: 94988 }], entries: [
    { id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1264797, name: "Scattered Prey" }, description: "Kill Command hits additional nearby targets." } },
    { id: 2, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1264792, name: "Wyvern's Gaze" }, description: "Pet stuns targets periodically." } },
  ] },
  { id: 109802, display_row: 3, display_col: 4, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 109803 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 1264775, name: "Claw Frenzy" }, description: "Pet attack speed increased per active bleed." } }] },
  { id: 94966, display_row: 4, display_col: 2, node_type: { id: 1, type: "SINGLE" }, prerequisite_nodes: [{ id: 94969 }, { id: 94967 }, { id: 109804 }, { id: 109802 }], entries: [{ id: 1, type: "PASSIVE", max_rank: 1, spell_tooltip: { spell: { id: 472741, name: "Pack Assault" }, description: "Capstone: Takedown triggers Pack Assault — all beasts attack." } }] },
];

const FALLBACK_HERO_TREES: BzHeroTree[] = [
  { id: 42, name: "Sentinel",    hero_talent_nodes: FALLBACK_SENTINEL_NODES },
  { id: 43, name: "Pack Leader", hero_talent_nodes: FALLBACK_PACK_LEADER_NODES },
];

// ── Spell name → TalentConfig key ────────────────────────────────────────────
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

/**
 * Direct column/row positioning — uses actual display_col/display_row values
 * normalized to start at (0,0). Preserves the diamond stagger pattern from
 * the HTML reference files (e.g. row 0 at cols 2,4,6 and row 2 at 1,3,5,7).
 */
function gridLayout(nodes: BzTalentNode[]) {
  if (!nodes.length) {
    return { minRow: 0, maxRow: 0, minCol: 0, maxCol: 0, w: 0, h: 0 };
  }
  const rows = nodes.map((n) => n.display_row);
  const cols = nodes.map((n) => n.display_col);
  const minRow = Math.min(...rows), maxRow = Math.max(...rows);
  const minCol = Math.min(...cols), maxCol = Math.max(...cols);
  const w = (maxCol - minCol) * COL_STEP + NODE_SIZE + TREE_PAD * 2;
  const h = (maxRow - minRow) * ROW_STEP + NODE_SIZE + TREE_PAD * 2;
  return { minRow, maxRow, minCol, maxCol, w, h };
}

/** Pixel center of a node within its tree container SVG */
function nodeCenter(
  node: BzTalentNode,
  minRow: number,
  minCol: number,
): { x: number; y: number } {
  return {
    x: TREE_PAD + (node.display_col - minCol) * COL_STEP + NODE_R,
    y: TREE_PAD + (node.display_row - minRow) * ROW_STEP + NODE_R,
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
  const left = Math.min(x + 16, window.innerWidth - 300);
  const top  = Math.min(y - 8,  window.innerHeight - 180);
  return (
    <div style={{
      position: "fixed", left, top, zIndex: 10000,
      background: "linear-gradient(160deg, #1c1005 0%, #0d0a02 100%)",
      border: `1px solid ${GOLD_DIM}`,
      borderTop: `2px solid ${GOLD}`,
      borderRadius: 4,
      padding: "10px 14px", maxWidth: 280, pointerEvents: "none",
      boxShadow: `0 0 24px rgba(0,0,0,.85), inset 0 1px 0 ${GOLD_DIM}60`,
    }}>
      <div style={{
        fontFamily: "'Rajdhani',sans-serif", fontSize: 14, fontWeight: 700,
        color: GOLD, marginBottom: 4, letterSpacing: 0.5,
      }}>
        {info.name}
      </div>
      {info.maxRank && info.maxRank > 1 && (
        <div style={{ fontSize: 10, color: GOLD_DIM, marginBottom: 4, fontFamily: "monospace" }}>
          Rank {info.rank ?? 0} / {info.maxRank}
        </div>
      )}
      <div style={{ fontSize: 12, color: "#b8a878", lineHeight: 1.55, fontFamily: "'Rajdhani',sans-serif" }}>
        {info.description}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG Connection Lines — golden lines between prerequisite nodes
// ─────────────────────────────────────────────────────────────────────────────

function ConnectionLines({
  nodes, nodeMap, minRow, minCol, w, h, selectedKeys, coreKeys,
}: {
  nodes: BzTalentNode[];
  nodeMap: Map<number, BzTalentNode>;
  minRow: number; minCol: number;
  w: number; h: number;
  selectedKeys: Set<string>;
  coreKeys: Set<string>;
}) {
  const lines = useMemo(() => {
    const result: React.ReactNode[] = [];
    nodes.forEach((node) => {
      if (!node.prerequisite_nodes?.length) return;
      const to = nodeCenter(node, minRow, minCol);
      const nk = nodeTalentKey(node);
      const nodeOn = nk ? (selectedKeys.has(nk) || coreKeys.has(nk)) : false;

      node.prerequisite_nodes.forEach((prereq) => {
        const pNode = nodeMap.get(prereq.id);
        if (!pNode) return;
        const from = nodeCenter(pNode, minRow, minCol);
        const pk = nodeTalentKey(pNode);
        const parentOn = pk ? (selectedKeys.has(pk) || coreKeys.has(pk)) : false;
        const active = parentOn && nodeOn;
        result.push(
          <line
            key={`${pNode.id}-${node.id}`}
            x1={from.x} y1={from.y} x2={to.x} y2={to.y}
            stroke={active ? GOLD : GOLD_DIM}
            strokeWidth={active ? 2 : 1.5}
            opacity={active ? 0.9 : 0.35}
          />
        );
      });
    });
    return result;
  }, [nodes, nodeMap, minRow, minCol, selectedKeys, coreKeys]);

  return (
    <svg
      width={w} height={h}
      style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
    >
      {lines}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TalentNode — circular node with icon + double-ring style (matches HTML)
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
  const key = nodeTalentKey(node);
  const isSelected = key ? (selectedKeys.has(key) || isCore) : isCore;
  const isLocked = !isCore && !isSelected && !canSelect;

  const borderColor = isSelected ? GOLD : isLocked ? "#1c1408" : GOLD_DIM;
  const glow = isSelected
    ? `0 0 0 2px ${GOLD_GLOW}, 0 0 14px 3px ${GOLD_GLOW}`
    : undefined;
  const brightness = isSelected ? 1 : isLocked ? 0.2 : 0.5;
  const cursor = isCore ? "default" : isLocked ? "not-allowed" : "pointer";

  const handleEnter = (e: React.MouseEvent) => {
    const entry = node.entries[isChoice ? chosenIdx : 0];
    onHover({
      name: entry?.spell_tooltip?.spell?.name ?? "?",
      description: entry?.spell_tooltip?.description ?? "",
      rank: isSelected ? (entry?.max_rank ?? 1) : 0,
      maxRank: entry?.max_rank ?? 1,
    }, e.clientX, e.clientY);
  };

  // ── Choice node: split-icon with dashed vertical divider ────────────────
  if (isChoice) {
    return (
      <div
        style={{
          width: NODE_SIZE, height: NODE_SIZE, borderRadius: "50%",
          border: `1.5px solid ${borderColor}`, boxShadow: glow,
          overflow: "hidden", cursor, position: "relative",
          background: NODE_FILL, transition: "border-color .15s, box-shadow .15s",
          display: "flex",
        }}
        onMouseEnter={handleEnter}
        onMouseLeave={() => onHover(null, 0, 0)}
      >
        {/* Left icon half (entry 0) */}
        <div
          onClick={() => { if (!isLocked) onChoiceClick(0); }}
          style={{ width: "50%", height: "100%", overflow: "hidden", position: "relative", flexShrink: 0 }}
        >
          <img
            src={node.entries[0]?.spell_tooltip?.spell?.id
              ? (mediaMap[node.entries[0].spell_tooltip.spell.id] ?? FALLBACK_ICON)
              : FALLBACK_ICON}
            alt="" loading="lazy" draggable={false}
            onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_ICON; }}
            style={{
              width: NODE_SIZE, height: NODE_SIZE,
              objectFit: "cover", position: "absolute", left: 0, top: 0,
              filter: `brightness(${isSelected && chosenIdx === 0 ? 1 : brightness * 0.6})`,
              transition: "filter .15s",
            }}
          />
        </div>
        {/* Right icon half (entry 1) */}
        <div
          onClick={() => { if (!isLocked) onChoiceClick(1); }}
          style={{ width: "50%", height: "100%", overflow: "hidden", position: "relative", flexShrink: 0 }}
        >
          <img
            src={node.entries[1]?.spell_tooltip?.spell?.id
              ? (mediaMap[node.entries[1].spell_tooltip.spell.id] ?? FALLBACK_ICON)
              : FALLBACK_ICON}
            alt="" loading="lazy" draggable={false}
            onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_ICON; }}
            style={{
              width: NODE_SIZE, height: NODE_SIZE,
              objectFit: "cover", position: "absolute", left: -(NODE_SIZE / 2), top: 0,
              filter: `brightness(${isSelected && chosenIdx === 1 ? 1 : brightness * 0.6})`,
              transition: "filter .15s",
            }}
          />
        </div>
        {/* Dashed vertical divider (matches HTML choice node style) */}
        <div style={{
          position: "absolute", left: "50%", top: 4, bottom: 4,
          width: 1, transform: "translateX(-50%)",
          background: `repeating-linear-gradient(to bottom, ${GOLD_DIM} 0px, ${GOLD_DIM} 3px, transparent 3px, transparent 5px)`,
          pointerEvents: "none",
        }} />
        {/* Inner ring overlay */}
        <div style={{
          position: "absolute", inset: 4, borderRadius: "50%",
          border: `1px solid ${LINE_DIM}`, pointerEvents: "none",
        }} />
      </div>
    );
  }

  // ── Standard node: icon + double-ring (matches HTML) ────────────────────
  const entry = node.entries[0];
  const spellId = entry?.spell_tooltip?.spell?.id;
  const iconUrl = spellId && mediaMap[spellId] ? mediaMap[spellId] : FALLBACK_ICON;
  const maxRank = entry?.max_rank ?? 1;

  return (
    <div
      onClick={() => { if (!isCore && canSelect) onClick(); }}
      onMouseEnter={handleEnter}
      onMouseLeave={() => onHover(null, 0, 0)}
      style={{
        width: NODE_SIZE, height: NODE_SIZE, borderRadius: "50%",
        border: `1.5px solid ${borderColor}`, boxShadow: glow,
        cursor, position: "relative", overflow: "hidden",
        background: NODE_FILL,
        transition: "border-color .15s, box-shadow .15s",
      }}
    >
      <img
        src={iconUrl} alt="" loading="lazy" draggable={false}
        onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_ICON; }}
        style={{
          width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%",
          filter: `brightness(${brightness})`, transition: "filter .15s",
        }}
      />
      {/* Inner ring (matches HTML double-circle decoration) */}
      <div style={{
        position: "absolute", inset: 4, borderRadius: "50%",
        border: `1px solid ${LINE_DIM}`, pointerEvents: "none",
      }} />
      {/* Rank badge */}
      {maxRank > 1 && (
        <div style={{
          position: "absolute", bottom: -2, right: -2,
          background: isSelected ? "#1c1005" : "#0d0a02",
          border: `1px solid ${isSelected ? GOLD : GOLD_DIM}`,
          borderRadius: 3, padding: "0 3px",
          fontSize: 8, fontWeight: 700, lineHeight: "13px",
          color: isSelected ? GOLD : GOLD_DIM,
          fontFamily: "'Rajdhani',sans-serif",
          pointerEvents: "none",
        }}>
          {isSelected ? maxRank : 0}/{maxRank}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TalentSection — one tree column (class / spec)
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
  const validNodes = useMemo(() => nodes.filter((n) => n.entries?.length > 0 && n.entries[0]?.spell_tooltip?.spell?.name), [nodes]);
  const { minRow, minCol, maxCol, w, h } = useMemo(() => gridLayout(validNodes), [validNodes]);
  const nodeMap = useMemo(() => buildNodeMap(validNodes), [validNodes]);

  const usedPts = useMemo(() => validNodes.reduce((sum, n) => {
    const k = nodeTalentKey(n);
    if (!k || coreKeys.has(k)) return sum;
    return sum + (selectedKeys.has(k) ? (n.entries?.[0]?.max_rank ?? 1) : 0);
  }, 0), [validNodes, selectedKeys, coreKeys]);

  if (!validNodes.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: "1 1 0", minWidth: w }}>
      {/* Section header — matches HTML .tree-header style */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
        <span style={{
          fontFamily: "'Rajdhani',sans-serif", fontSize: 12, fontWeight: 700,
          letterSpacing: 3, color: GOLD, textTransform: "uppercase",
        }}>{label}</span>
        {showPointCounter && (
          <span style={{
            fontFamily: "'Rajdhani',sans-serif", fontSize: 15, fontWeight: 700,
            color: usedPts >= pointBudget ? GOLD : GOLD_DIM,
          }}>{usedPts}</span>
        )}
      </div>

      {/* Tree container — matches HTML .talent-window style */}
      <div style={{
        position: "relative", width: w, height: h,
        background: "linear-gradient(180deg, rgba(22,12,4,0.95) 0%, rgba(10,5,2,0.98) 100%)",
        border: `1px solid ${GOLD_DIM}50`,
        borderTop: `2px solid ${GOLD}40`,
        borderRadius: 6,
        boxShadow: `0 0 40px rgba(200,168,75,0.05), inset 0 1px 0 ${GOLD_DIM}20`,
      }}>
        <ConnectionLines
          nodes={validNodes} nodeMap={nodeMap}
          minRow={minRow} minCol={minCol}
          w={w} h={h}
          selectedKeys={selectedKeys} coreKeys={coreKeys}
        />

        {validNodes.map((node) => {
          const key = nodeTalentKey(node);
          const isCore = !!(key && coreKeys.has(key));
          const prereqsMet = (node.prerequisite_nodes ?? []).every((p) => {
            const pNode = nodeMap.get(p.id);
            if (!pNode) return true;
            const pk = nodeTalentKey(pNode);
            return pk ? (coreKeys.has(pk) || selectedKeys.has(pk)) : false;
          });
          const canSelect = prereqsMet && (isCore || (selectedKeys.has(key ?? "") ? true : usedPts < pointBudget));

          // Direct col positioning — preserves stagger (matches HTML px formula)
          const left = TREE_PAD + (node.display_col - minCol) * COL_STEP;
          const top  = TREE_PAD + (node.display_row - minRow) * ROW_STEP;

          return (
            <div
              key={node.id}
              style={{ position: "absolute", left, top }}
            >
              <TalentNode
                node={node} mediaMap={mediaMap}
                selectedKeys={selectedKeys} selectedChoices={selectedChoices}
                canSelect={canSelect} isCore={isCore}
                onClick={() => onToggle(node)}
                onChoiceClick={(idx) => onChoiceSelect(node, idx)}
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
// HeroSection — portrait + toggle + hero talent tree
// Matches sentinel-tree.html: large portrait circle (R=30) + talent nodes
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
  const accentColor = isSentinel ? "#7dd3fc" : "#d8b4fe";

  // Use first node's spell icon as portrait
  const portraitSpellId = heroNodes[0]?.entries?.[0]?.spell_tooltip?.spell?.id;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "0 0 auto" }}>
      {/* Section label */}
      <div style={{
        fontFamily: "'Rajdhani',sans-serif", fontSize: 12, fontWeight: 700,
        letterSpacing: 3, color: GOLD, textTransform: "uppercase", marginBottom: 6,
      }}>
        {heroName.toUpperCase()}
      </div>

      {/* Hero portrait — matches sentinel-tree.html hero node (R=30, gold border, glow) */}
      <div
        onClick={() => {
          if (heroTrees.length >= 2) {
            const other = heroTrees.find((ht) => ht.id !== activeHeroTreeId);
            if (other) onHeroSwitch(other.id);
          }
        }}
        title={heroTrees.length >= 2 ? "Click to switch hero talent" : undefined}
        style={{
          width: 60, height: 60, borderRadius: "50%",
          border: `2px solid ${GOLD}`,
          boxShadow: `0 0 16px ${GOLD_GLOW}, 0 0 32px rgba(200,168,75,.12)`,
          overflow: "hidden", marginBottom: 6,
          background: NODE_FILL,
          cursor: heroTrees.length >= 2 ? "pointer" : "default",
          flexShrink: 0,
        }}
      >
        {portraitSpellId && mediaMap[portraitSpellId] ? (
          <img
            src={mediaMap[portraitSpellId]} alt={heroName}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_ICON; }}
          />
        ) : (
          <div style={{
            width: "100%", height: "100%", display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: 26,
          }}>
            {isSentinel ? "🌙" : "🐺"}
          </div>
        )}
      </div>

      {/* Mini gate connector dot (matches HTML sn_gate) */}
      <div style={{
        width: 8, height: 8, borderRadius: "50%",
        background: GOLD_DIM, marginBottom: 4, opacity: 0.7,
      }} />

      {/* Hero switch dots */}
      {heroTrees.length >= 2 && (
        <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
          {heroTrees.map((ht) => {
            const isActive = ht.id === activeHeroTreeId;
            const htSentinel = ht.name.toLowerCase().includes("sentinel");
            const clr = htSentinel ? "#7dd3fc" : "#d8b4fe";
            return (
              <button
                key={ht.id}
                onClick={() => onHeroSwitch(ht.id)}
                title={ht.name}
                style={{
                  width: 8, height: 8, borderRadius: "50%", padding: 0, border: "none",
                  background: isActive ? clr : GOLD_DIM,
                  cursor: "pointer", opacity: isActive ? 1 : 0.45,
                  transition: "all .15s",
                }}
              />
            );
          })}
        </div>
      )}

      {/* Hero talent nodes panel */}
      <div style={{
        background: "linear-gradient(180deg, rgba(22,12,4,0.95) 0%, rgba(10,5,2,0.98) 100%)",
        border: `1px solid ${GOLD_DIM}50`,
        borderTop: `2px solid ${GOLD}40`,
        borderRadius: 6,
        padding: "4px 2px",
        boxShadow: `inset 0 1px 0 ${GOLD_DIM}20`,
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
// Loading Skeleton — matches HTML visual style
// ─────────────────────────────────────────────────────────────────────────────

function TreeSkeleton() {
  return (
    <div style={{ display: "flex", gap: 20, justifyContent: "center", padding: 20, opacity: 0.55 }}>
      {[{ cols: 5, rows: 8 }, { cols: 3, isHero: true, rows: 5 }, { cols: 5, rows: 10 }].map((sec, si) => (
        <div key={si} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ height: 12, width: 70, background: GOLD_DIM, borderRadius: 3, opacity: 0.4 }} />
          {sec.isHero && (
            <div style={{
              width: 60, height: 60, borderRadius: "50%",
              border: `2px solid ${GOLD_DIM}`, opacity: 0.3, marginBottom: 4,
            }} />
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: COL_STEP - NODE_SIZE, justifyContent: "center", maxWidth: sec.cols * COL_STEP }}>
            {Array.from({ length: sec.cols * Math.min(sec.rows, 5) }).map((_, i) => (
              <div key={i} style={{
                width: NODE_SIZE, height: NODE_SIZE, borderRadius: "50%",
                background: NODE_FILL, border: `1.5px solid ${GOLD_DIM}40`,
                animation: "pulse 1.8s ease-in-out infinite",
                animationDelay: `${(i % 6) * 130}ms`,
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
      .then((data) => { if (mounted) { setTreeData(data); setIsLoading(false); } })
      .catch((err) => { if (mounted) { setLoadError(err?.message ?? "Failed to load"); setIsLoading(false); } });
    return () => { mounted = false; };
  }, []);

  // ── Selection state ───────────────────────────────────────────────────────
  const [internalSpecKeys, setInternalSpecKeys] = useState<string[]>([]);
  const [internalHeroKey, setInternalHeroKey] = useState<"sentinel" | "packLeader">("sentinel");
  const [internalHeroKeys, setInternalHeroKeys] = useState<string[]>([]);
  const [selectedChoices, setSelectedChoices] = useState<Record<number, number>>({});

  const activeSpecKeys = specSelectedKeys ?? internalSpecKeys;
  const activeHeroKey  = heroKeyProp ?? internalHeroKey;
  const activeHeroKeys = heroSelectedKeysProp ?? internalHeroKeys;

  const selectedKeys = useMemo<Set<string>>(
    () => new Set([...CORE_SPEC.values(), ...activeSpecKeys, ...activeHeroKeys]),
    [activeSpecKeys, activeHeroKeys],
  );

  // ── Hero tree resolution ──────────────────────────────────────────────────
  const heroTrees = useMemo(() => {
    const apiTrees = treeData?.heroTrees ?? [];
    return apiTrees.length > 0 ? apiTrees : FALLBACK_HERO_TREES;
  }, [treeData]);

  const activeHeroTreeId = useMemo(() => {
    if (!heroTrees.length) return -1;
    const match = heroTrees.find((ht) =>
      ht.name.toLowerCase().includes(activeHeroKey === "sentinel" ? "sentinel" : "pack")
    );
    return match?.id ?? heroTrees[0]?.id ?? -1;
  }, [heroTrees, activeHeroKey]);

  const activeHeroTree = useMemo(
    () => heroTrees.find((ht) => ht.id === activeHeroTreeId),
    [heroTrees, activeHeroTreeId],
  );

  const heroNodes: BzTalentNode[] = useMemo(
    () => activeHeroTree
      ? (activeHeroTree.spec_talent_nodes ?? activeHeroTree.hero_talent_nodes ?? activeHeroTree.class_talent_nodes ?? [])
      : [],
    [activeHeroTree],
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
    else setInternalSpecKeys((prev) => isOn ? prev.filter((k) => k !== key) : [...prev, key]);
  }, [selectedKeys, onSpecToggle]);

  const handleChoiceSelect = useCallback((node: BzTalentNode, entryIdx: number) => {
    const entry = node.entries[entryIdx];
    const newKey = entry ? (NAME_TO_KEY[entry.spell_tooltip?.spell?.name ?? ""] ?? null) : null;
    const oldIdx = selectedChoices[node.id] ?? 0;
    const oldEntry = node.entries[oldIdx];
    const oldKey = oldEntry ? (NAME_TO_KEY[oldEntry.spell_tooltip?.spell?.name ?? ""] ?? null) : null;
    setSelectedChoices((prev) => ({ ...prev, [node.id]: entryIdx }));
    if (oldKey && onSpecToggle) onSpecToggle(oldKey, false);
    if (newKey && onSpecToggle) onSpecToggle(newKey, true);
    else if (!onSpecToggle) {
      setInternalSpecKeys((prev) => {
        let next = oldKey ? prev.filter((k) => k !== oldKey) : [...prev];
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
    else setInternalHeroKeys((prev) => isOn ? prev.filter((k) => k !== key) : [...prev, key]);
  }, [selectedKeys, onHeroToggle]);

  const handleHeroChoiceSelect = useCallback((node: BzTalentNode, entryIdx: number) => {
    const entry = node.entries[entryIdx];
    const newKey = entry ? (NAME_TO_KEY[entry.spell_tooltip?.spell?.name ?? ""] ?? null) : null;
    const oldIdx = selectedChoices[node.id] ?? 0;
    const oldEntry = node.entries[oldIdx];
    const oldKey = oldEntry ? (NAME_TO_KEY[oldEntry.spell_tooltip?.spell?.name ?? ""] ?? null) : null;
    setSelectedChoices((prev) => ({ ...prev, [node.id]: entryIdx }));
    if (onHeroToggle) {
      if (oldKey) onHeroToggle(oldKey, false);
      if (newKey) onHeroToggle(newKey, true);
    } else {
      setInternalHeroKeys((prev) => {
        let next = oldKey ? prev.filter((k) => k !== oldKey) : [...prev];
        if (newKey && !next.includes(newKey)) next = [...next, newKey];
        return next;
      });
    }
  }, [selectedChoices, onHeroToggle]);

  const handleHeroSwitch = useCallback((heroId: number) => {
    const ht = heroTrees.find((h) => h.id === heroId);
    if (!ht) return;
    const newKey = ht.name.toLowerCase().includes("pack") ? "packLeader" : "sentinel";
    if (onHeroChange) onHeroChange(newKey);
    else { setInternalHeroKey(newKey); setInternalHeroKeys([]); }
  }, [heroTrees, onHeroChange]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (isLoading) return <TreeSkeleton />;

  if (loadError) {
    return (
      <div style={{
        padding: 24, textAlign: "center",
        fontFamily: "'Rajdhani',sans-serif", color: "#f87171", fontSize: 13,
      }}>
        <div style={{ marginBottom: 8, color: GOLD }}>⚠ Could not load talent tree</div>
        <div style={{ fontSize: 11, color: GOLD_DIM }}>{loadError}</div>
      </div>
    );
  }

  if (!treeData) return null;

  const { specTree, mediaMap } = treeData;
  const classNodes = specTree.class_talent_nodes ?? [];

  // Filter hero node IDs out of spec nodes — check ALL node list keys on each hero tree
  const heroNodeIdSet = new Set<number>();
  for (const ht of heroTrees) {
    for (const n of [
      ...(ht.hero_talent_nodes ?? []),
      ...(ht.spec_talent_nodes ?? []),
      ...(ht.class_talent_nodes ?? []),
    ]) {
      heroNodeIdSet.add(n.id);
    }
  }
  const rawSpecNodes = (specTree.spec_talent_nodes ?? []).filter((n: BzTalentNode) => !heroNodeIdSet.has(n.id));

  // Remove spatially isolated outlier nodes (stray hero nodes that leaked into spec list)
  let specNodes = rawSpecNodes;
  if (rawSpecNodes.length >= 3) {
    const cols = rawSpecNodes.map((n) => n.display_col).sort((a, b) => a - b);
    const medianCol = cols[Math.floor(cols.length / 2)];
    const mainCluster = rawSpecNodes.filter((n) => Math.abs(n.display_col - medianCol) <= 6);
    if (mainCluster.length < rawSpecNodes.length) {
      const mainMinCol = Math.min(...mainCluster.map((n) => n.display_col));
      const mainMaxCol = Math.max(...mainCluster.map((n) => n.display_col));
      specNodes = rawSpecNodes.filter((n) => n.display_col >= mainMinCol - 1 && n.display_col <= mainMaxCol + 1);
    }
  }

  const classBudget = specTree.talent_point_budget?.class_points ?? 31;
  const specBudget  = specTree.talent_point_budget?.spec_points  ?? 31;

  const classCoreKeys = new Set(
    classNodes
      .filter((n) => CORE_CLASS.has(nodeSpellName(n) ?? ""))
      .map((n) => nodeTalentKey(n))
      .filter(Boolean) as string[]
  );

  return (
    <div style={{ userSelect: "none" }}>
      <div style={{ overflowX: "auto", overflowY: "visible" }}>
        <div style={{
          display: "flex", gap: 16, alignItems: "flex-start",
          justifyContent: "center",
          minWidth: "fit-content", padding: "8px 8px 16px",
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

      {tooltip && <NodeTooltip info={tooltip.info} x={tooltip.x} y={tooltip.y} />}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: .35; }
          50%       { opacity: .7; }
        }
      `}</style>
    </div>
  );
}

export default BlizzardTalentTree;
