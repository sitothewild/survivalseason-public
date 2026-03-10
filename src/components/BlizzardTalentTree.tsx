// @ts-nocheck
// BlizzardTalentTree.tsx — Survival Hunter talent tree (CSS Grid layout)
// Class | Hero | Spec in a horizontal flex row; nodes placed via display_row/display_col → grid-row/grid-column.
import React, {
  useState, useEffect, useMemo, useCallback, useRef,
} from "react";
import { getSurvivalTalentTree } from "@/lib/blizzardApi";
import type { BzTalentNode, BzHeroTree, TalentTreeFullResponse } from "@/lib/blizzardApi";

// ─── Layout constants ─────────────────────────────────────────────────────────
const CELL = 52;           // node width & height px
const GAP  = 8;            // grid gap px
const STEP = CELL + GAP;   // 60 px per grid unit
const PAD  = 10;           // inner padding inside each tree panel

// ─── Theme ────────────────────────────────────────────────────────────────────
const GOLD      = "#fbbf24";
const GOLD_DIM  = "#92620d";
const GOLD_GLOW = "rgba(251,191,36,.45)";
const LINE_COLOR = "#C8A84B";

// ─── Fallback hero trees (hardcoded for when the API hero endpoint is unavailable) ──
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
  { id: 42, name: "Sentinel",    hero_talent_nodes: FALLBACK_SENTINEL_NODES },
  { id: 43, name: "Pack Leader", hero_talent_nodes: FALLBACK_PACK_LEADER_NODES },
];

// ─── Name → TalentConfig key ──────────────────────────────────────────────────
const NAME_TO_KEY: Record<string, string> = {
  "Kill Command": "killCommand",
  "Wildfire Bomb": "wildfireBomb",
  "Raptor Strike": "raptorStrike",
  "Guerrilla Tactics": "guerrillaTactics",
  "Tip of the Spear": "tipOfTheSpear",
  "Lunge": "lunge",
  "Boomstick": "boomstick",
  "Strike as One": "strikeAsOne",
  "Flamebreak": "flamebreak",
  "Quick Reload": "quickReload",
  "Mongoose Fury": "mongooseFury",
  "Wildfire Shells": "wildfireShells",
  "Shellshock": "shellshock",
  "Wallop": "wallop",
  "Bonding": "bonding",
  "Sweeping Spear": "sweepingSpear",
  "Blackrock Munitions": "blackrockMunitions",
  "Takedown": "takedown",
  "Killer Companion": "killerCompanion",
  "Twin Fangs": "twinFangs",
  "Savagery": "savagery",
  "Wildfire Infusion": "wildfireInfusion",
  "Flanked": "flanked",
  "Primal Surge": "primalSurge",
  "Raptor Swipe": "raptorSwipe",
  "Flanker's Advantage": "flankerAdvantage",
  "Bloodseeker": "bloodseeker",
  "Two Against Many": "twoAgainstMany",
  "Lethal Calibration": "lethalCalibration",
  // Sentinel
  "Stargazer": "stargazer",
  "Open Fire": "openFire",
  "Lunar Inspiration": "lunarInspiration",
  "Extrapolation": "extrapolation",
  "Twilight Requiem": "twilightRequiem",
  "Stalk and Strike": "stalkAndStrike",
  "Don't Look Back": "dontLookBack",
  "Catch Out": "catchOut",
  "Invigorating Pulse": "invigoratingPulse",
  "Eyes Closed": "eyesClosed",
  "Lunar Calling": "lunarCalling",
  "Release and Reload": "releaseAndReload",
  "Lunar Storm": "lunarStorm",
  // Pack Leader
  "Vicious Hunt": "viciousHunt",
  "Pack Coordination": "packCoordination",
  "Howl of the Pack": "howlOfThePack",
  "Den Recovery": "denRecovery",
  "Ursine Fury": "ursineFury",
  "Sharpened Claws": "sharpenedClaws",
  "Wild Attacks": "wildAttacks",
  "Cornered Prey": "corneredPrey",
  "Frenzied Tear": "frenziedTear",
  "Go for the Throat": "goForTheThroat",
  "Furious Assault": "furiousAssault",
  "Scattered Prey": "scatteredPrey",
  "Wyvern's Gaze": "wyvernGaze",
  "Claw Frenzy": "clawFrenzy",
  "Pack Assault": "packAssault",
};

// Always-selected spec talents
const CORE_SPEC = new Set([
  "killCommand","wildfireBomb","raptorStrike","guerrillaTactics",
  "tipOfTheSpear","lunge","boomstick","strikeAsOne","flamebreak",
  "quickReload","mongooseFury","wildfireShells","shellshock","wallop",
  "bonding","sweepingSpear","blackrockMunitions","takedown",
  "killerCompanion","twinFangs","savagery","wildfireInfusion",
  "flanked","primalSurge","raptorSwipe",
]);

// Class tree nodes always taken
const CORE_CLASS = new Set([
  "Keen Eyesight","Unnatural Causes","Trigger Finger",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nodeSpellName(node: BzTalentNode): string | null {
  return node.entries?.[0]?.spell_tooltip?.spell?.name ?? null;
}

function nodeTalentKey(node: BzTalentNode): string | null {
  const name = nodeSpellName(node);
  return name ? (NAME_TO_KEY[name] ?? null) : null;
}

/** Pixel center of a node within a tree panel's SVG (excludes PAD, which is applied by SVG position). */
function nodeCenterPx(node: BzTalentNode, minRow: number, minCol: number) {
  return {
    x: (node.display_col - minCol) * STEP + CELL / 2,
    y: (node.display_row - minRow) * STEP + CELL / 2,
  };
}

function buildNodeMap(nodes: BzTalentNode[]) {
  const m = new Map<number, BzTalentNode>();
  nodes.forEach((n) => m.set(n.id, n));
  return m;
}

function gridDimensions(nodes: BzTalentNode[]) {
  if (!nodes.length) return { numRows: 0, numCols: 0, minRow: 0, minCol: 0, w: 0, h: 0 };
  const rows = nodes.map((n) => n.display_row);
  const cols = nodes.map((n) => n.display_col);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  const numRows = maxRow - minRow + 1;
  const numCols = maxCol - minCol + 1;
  return {
    numRows, numCols, minRow, minCol,
    w: numCols * STEP - GAP,   // exact pixel span of grid content
    h: numRows * STEP - GAP,
  };
}

function computeUsedPts(
  nodes: BzTalentNode[],
  selectedKeys: Set<string>,
  coreKeys: Set<string>,
): number {
  return nodes.reduce((sum, n) => {
    const key = nodeTalentKey(n);
    if (!key || coreKeys.has(key)) return sum;
    return sum + (selectedKeys.has(key) ? (n.entries?.[0]?.max_rank ?? 1) : 0);
  }, 0);
}

// ─── Spell icon with fallback ─────────────────────────────────────────────────

function SpellIcon({
  url, name, brightness, style,
}: { url: string; name?: string; brightness: number; style?: React.CSSProperties }) {
  const [failed, setFailed] = useState(false);
  const initial = name?.[0]?.toUpperCase() ?? "?";

  if (failed || !url) {
    return (
      <div style={{
        width: "100%", height: "100%",
        background: "#111c2a",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#7a8fa0", fontSize: 18, fontWeight: 700,
        fontFamily: "'Rajdhani',sans-serif",
        filter: `brightness(${brightness})`,
        userSelect: "none",
        ...style,
      }}>
        {initial}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      style={{
        width: "100%", height: "100%",
        objectFit: "cover",
        filter: `brightness(${brightness})`,
        transition: "filter .15s",
        display: "block",
        ...style,
      }}
    />
  );
}

// ─── Rank badge ───────────────────────────────────────────────────────────────

const RANK_BADGE_STYLE: React.CSSProperties = {
  position: "absolute",
  bottom: 1,
  left: "50%",
  transform: "translateX(-50%)",
  background: "rgba(0,0,0,.82)",
  color: GOLD,
  fontSize: 9,
  fontFamily: "'Rajdhani',sans-serif",
  fontWeight: 700,
  padding: "0px 4px",
  borderRadius: 3,
  lineHeight: 1.5,
  pointerEvents: "none",
  whiteSpace: "nowrap",
};

// ─── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipInfo {
  name: string;
  description: string;
  castTime?: string;
  cooldown?: string;
  rank: number;
  maxRank: number;
}

function Tooltip({ info, x, y }: { info: TooltipInfo; x: number; y: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x + 14, top: y + 14 });

  useEffect(() => {
    if (!ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    setPos({
      left: x + 14 + width > window.innerWidth  ? x - width - 14 : x + 14,
      top:  y + 14 + height > window.innerHeight ? y - height - 14 : y + 14,
    });
  }, [x, y, info]);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        zIndex: 9998,
        background: "#0a1520ee",
        border: `1px solid ${GOLD_DIM}`,
        borderRadius: 8,
        padding: "10px 14px",
        maxWidth: 280,
        pointerEvents: "none",
      }}
    >
      <div style={{
        fontFamily: "'Rajdhani',sans-serif", fontSize: 14,
        fontWeight: 700, color: GOLD, marginBottom: 4,
      }}>
        {info.name}
      </div>
      {info.maxRank > 1 && (
        <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4 }}>
          Rank {info.rank} / {info.maxRank}
        </div>
      )}
      <div style={{ fontSize: 12, color: "#d1d5db", lineHeight: 1.5 }}>
        {info.description}
      </div>
      {(info.castTime || info.cooldown) && (
        <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
          {info.castTime && <span style={{ fontSize: 10, color: "#9ca3af" }}>Cast: {info.castTime}</span>}
          {info.cooldown && <span style={{ fontSize: 10, color: "#9ca3af" }}>CD: {info.cooldown}</span>}
        </div>
      )}
    </div>
  );
}

// ─── TalentNode — single node visual (no positioning; parent grid cell handles that) ──

interface TalentNodeProps {
  node: BzTalentNode;
  mediaMap: Record<number, string>;
  selectedKeys: Set<string>;
  selectedChoices: Record<number, number>;
  canSelect: boolean;
  isCore: boolean;
  onClick: () => void;
  onChoiceClick: (entryIdx: number) => void;
  onHover: (info: TooltipInfo | null, x: number, y: number) => void;
}

function TalentNode({
  node, mediaMap, selectedKeys, selectedChoices,
  canSelect, isCore, onClick, onChoiceClick, onHover,
}: TalentNodeProps) {
  if (!node.entries?.length || !node.node_type) return null;

  const isChoice = node.node_type.type === "SELECTION";
  const key = nodeTalentKey(node);
  const isSelected = key ? (selectedKeys.has(key) || isCore) : isCore;
  const isLocked = !isCore && !isSelected && !canSelect;

  const borderColor = isSelected ? GOLD : isLocked ? "#1e2d3d" : "#3a4f68";
  const glowShadow  = isSelected ? `0 0 0 2px ${GOLD_GLOW}, 0 0 12px 2px ${GOLD_GLOW}` : undefined;
  const brightness  = isSelected ? 1 : isLocked ? 0.3 : 0.65;
  const cursor      = isCore ? "default" : isLocked ? "not-allowed" : "pointer";

  const baseStyle: React.CSSProperties = {
    width: CELL, height: CELL,
    borderRadius: "50%",
    border: `2px solid ${borderColor}`,
    boxShadow: glowShadow,
    overflow: "hidden",
    cursor,
    transition: "border-color .15s, box-shadow .15s",
    position: "relative",
    background: "#0a1520",
    flexShrink: 0,
  };

  if (isChoice && node.entries.length >= 2) {
    const chosenIdx = selectedChoices[node.id] ?? 0;
    const entry = node.entries[chosenIdx];
    return (
      <div
        style={{ ...baseStyle, display: "flex" }}
        title={node.entries.map((e) => e.spell_tooltip?.spell?.name).join(" / ")}
        onMouseEnter={(e) => {
          onHover({
            name: entry?.spell_tooltip?.spell?.name ?? "?",
            description: entry?.spell_tooltip?.description ?? "",
            castTime: entry?.spell_tooltip?.cast_time,
            cooldown: entry?.spell_tooltip?.cooldown,
            rank: 1,
            maxRank: entry?.max_rank ?? 1,
          }, e.clientX, e.clientY);
        }}
        onMouseLeave={() => onHover(null, 0, 0)}
      >
        {/* Left half — entry 0 */}
        <div
          style={{ width: "50%", height: "100%", overflow: "hidden", position: "relative" }}
          onClick={() => { if (!isLocked) onChoiceClick(0); }}
        >
          <ChoiceHalf
            entry={node.entries[0]} mediaMap={mediaMap}
            active={isSelected && chosenIdx === 0}
            brightness={brightness} side="left"
          />
        </div>
        {/* Right half — entry 1 */}
        <div
          style={{ width: "50%", height: "100%", overflow: "hidden", position: "relative" }}
          onClick={() => { if (!isLocked) onChoiceClick(1); }}
        >
          <ChoiceHalf
            entry={node.entries[1]} mediaMap={mediaMap}
            active={isSelected && chosenIdx === 1}
            brightness={brightness} side="right"
          />
        </div>
        <div style={{
          position: "absolute", left: "50%", top: 0, width: 1,
          height: "100%", background: "#000", opacity: 0.6, pointerEvents: "none",
        }} />
        {isSelected && <div style={RANK_BADGE_STYLE}>1/1</div>}
      </div>
    );
  }

  const entry = node.entries[0];
  const spellId = entry?.spell_tooltip?.spell?.id;
  const iconUrl  = spellId ? (mediaMap[spellId] ?? "") : "";
  const maxRank  = entry?.max_rank ?? 1;
  const spellName = entry?.spell_tooltip?.spell?.name;

  return (
    <div
      style={baseStyle}
      onClick={() => { if (!isCore && canSelect) onClick(); }}
      onMouseEnter={(e) => onHover({
        name: spellName ?? "?",
        description: entry?.spell_tooltip?.description ?? "",
        castTime: entry?.spell_tooltip?.cast_time,
        cooldown: entry?.spell_tooltip?.cooldown,
        rank: isSelected ? maxRank : 0,
        maxRank,
      }, e.clientX, e.clientY)}
      onMouseLeave={() => onHover(null, 0, 0)}
      title={spellName}
    >
      <SpellIcon url={iconUrl} name={spellName} brightness={brightness} />
      {(maxRank > 1 || isSelected) && (
        <div style={RANK_BADGE_STYLE}>
          {isSelected ? maxRank : 0}/{maxRank}
        </div>
      )}
    </div>
  );
}

function ChoiceHalf({ entry, mediaMap, active, brightness, side }: any) {
  const spellId = entry?.spell_tooltip?.spell?.id;
  const iconUrl = spellId ? (mediaMap[spellId] ?? "") : "";
  const name = entry?.spell_tooltip?.spell?.name;
  return (
    <div style={{
      width: CELL, height: CELL,
      position: "absolute",
      left: side === "right" ? -(CELL / 2) : 0,
      top: 0,
    }}>
      <SpellIcon url={iconUrl} name={name} brightness={active ? 1 : brightness} />
    </div>
  );
}

// ─── Connection lines ─────────────────────────────────────────────────────────

interface ConnectionLinesProps {
  nodes: BzTalentNode[];
  nodeMap: Map<number, BzTalentNode>;
  minRow: number;
  minCol: number;
  w: number;
  h: number;
  selectedKeys: Set<string>;
  coreKeys: Set<string>;
}

function ConnectionLines({ nodes, nodeMap, minRow, minCol, w, h, selectedKeys, coreKeys }: ConnectionLinesProps) {
  const lines = useMemo(() => {
    const result: Array<{
      key: string; x1: number; y1: number; x2: number; y2: number; active: boolean;
    }> = [];

    for (const node of nodes) {
      for (const prereq of node.prerequisite_nodes ?? []) {
        const prereqNode = nodeMap.get(prereq.id);
        if (!prereqNode) continue;
        const from = nodeCenterPx(prereqNode, minRow, minCol);
        const to   = nodeCenterPx(node, minRow, minCol);
        const pk = nodeTalentKey(prereqNode);
        const nk = nodeTalentKey(node);
        const prereqOn = pk ? (coreKeys.has(pk) || selectedKeys.has(pk)) : false;
        const nodeOn   = nk ? (coreKeys.has(nk) || selectedKeys.has(nk)) : false;
        result.push({
          key: `${prereq.id}-${node.id}`,
          x1: from.x, y1: from.y,
          x2: to.x,   y2: to.y,
          active: prereqOn && nodeOn,
        });
      }
    }
    return result;
  }, [nodes, nodeMap, minRow, minCol, selectedKeys, coreKeys]);

  return (
    <svg
      style={{
        position: "absolute",
        left: PAD, top: PAD,
        pointerEvents: "none",
        zIndex: 0,
        overflow: "visible",
      }}
      width={w}
      height={h}
    >
      {lines.map((l) => (
        <line
          key={l.key}
          x1={l.x1} y1={l.y1}
          x2={l.x2} y2={l.y2}
          stroke={l.active ? LINE_COLOR : "#1e2d3d"}
          strokeWidth={l.active ? 2 : 1.5}
          strokeOpacity={l.active ? 0.7 : 1}
          strokeDasharray={l.active ? undefined : "4 3"}
        />
      ))}
    </svg>
  );
}

// ─── Points pill ──────────────────────────────────────────────────────────────

function PointsPill({
  label, labelColor, usedPts, budget,
}: { label: string; labelColor: string; usedPts: number; budget: number }) {
  const over = usedPts > budget;
  const full = usedPts >= budget;
  const ptsColor = over ? "#f87171" : full ? GOLD : "#4ade80";

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
      marginBottom: 8,
      gap: 8,
    }}>
      <span style={{
        fontFamily: "'Orbitron',sans-serif",
        fontSize: 10,
        letterSpacing: 2,
        color: labelColor,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}>
        {label}
      </span>
      <span style={{
        background: "#1a2535",
        border: `1px solid ${over ? "#f87171" : full ? GOLD_DIM : "#2d3e52"}`,
        borderRadius: 20,
        padding: "3px 12px",
        fontFamily: "'Rajdhani',sans-serif",
        fontSize: 15,
        fontWeight: 700,
        color: ptsColor,
        letterSpacing: 0.5,
        whiteSpace: "nowrap",
      }}>
        {usedPts} / {budget} pts
      </span>
    </div>
  );
}

// ─── TalentSection — one column with CSS Grid ─────────────────────────────────

interface TalentSectionProps {
  label: string;
  labelColor: string;
  nodes: BzTalentNode[];
  mediaMap: Record<number, string>;
  pointBudget: number;
  selectedKeys: Set<string>;
  selectedChoices: Record<number, number>;
  coreKeys: Set<string>;
  onToggle: (node: BzTalentNode) => void;
  onChoiceSelect: (node: BzTalentNode, entryIdx: number) => void;
  onHover: (info: TooltipInfo | null, x: number, y: number) => void;
}

function TalentSection({
  label, labelColor, nodes, mediaMap, pointBudget,
  selectedKeys, selectedChoices, coreKeys,
  onToggle, onChoiceSelect, onHover,
}: TalentSectionProps) {
  const { numRows, numCols, minRow, minCol, w, h } = useMemo(
    () => gridDimensions(nodes), [nodes],
  );
  const nodeMap = useMemo(() => buildNodeMap(nodes), [nodes]);

  const usedPts = useMemo(
    () => computeUsedPts(nodes, selectedKeys, coreKeys),
    [nodes, selectedKeys, coreKeys],
  );

  if (!nodes.length) return null;

  const panelW = w + PAD * 2;
  const panelH = h + PAD * 2;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", flexShrink: 0 }}>
      <PointsPill label={label} labelColor={labelColor} usedPts={usedPts} budget={pointBudget} />

      {/* Tree panel */}
      <div style={{
        position: "relative",
        width: panelW,
        height: panelH,
        background: "rgba(0,8,20,.45)",
        borderRadius: 10,
        overflow: "hidden",
      }}>
        {/* Subtle radial glow */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `radial-gradient(ellipse 80% 60% at 50% 40%, rgba(251,191,36,.04) 0%, transparent 70%)`,
          pointerEvents: "none",
          zIndex: 0,
        }} />

        {/* Connection lines (SVG offset by PAD to align with grid content) */}
        <ConnectionLines
          nodes={nodes} nodeMap={nodeMap}
          minRow={minRow} minCol={minCol}
          w={w} h={h}
          selectedKeys={selectedKeys} coreKeys={coreKeys}
        />

        {/* CSS Grid — nodes snap to display_row / display_col positions */}
        <div style={{
          position: "absolute",
          left: PAD, top: PAD,
          display: "grid",
          gridTemplateRows: `repeat(${numRows}, ${CELL}px)`,
          gridTemplateColumns: `repeat(${numCols}, ${CELL}px)`,
          gap: GAP,
          zIndex: 1,
        }}>
          {nodes.map((node) => {
            const key = nodeTalentKey(node);
            const isCore = !!(key && coreKeys.has(key));
            const prereqsMet = (node.prerequisite_nodes ?? []).every((p) => {
              const pNode = nodeMap.get(p.id);
              if (!pNode) return true;
              const pk = nodeTalentKey(pNode);
              return pk ? (coreKeys.has(pk) || selectedKeys.has(pk)) : false;
            });
            const canSelect = prereqsMet && (
              isCore || (selectedKeys.has(key ?? "") ? true : usedPts < pointBudget)
            );

            return (
              <div
                key={node.id}
                style={{
                  gridRow:    node.display_row - minRow + 1,
                  gridColumn: node.display_col - minCol + 1,
                }}
              >
                <TalentNode
                  node={node}
                  mediaMap={mediaMap}
                  selectedKeys={selectedKeys}
                  selectedChoices={selectedChoices}
                  canSelect={canSelect}
                  isCore={isCore}
                  onClick={() => onToggle(node)}
                  onChoiceClick={(idx) => onChoiceSelect(node, idx)}
                  onHover={onHover}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── HeroToggle — Pack Leader / Sentinel selector ─────────────────────────────

interface HeroToggleProps {
  heroTrees: BzHeroTree[];
  activeHeroId: number;
  mediaMap: Record<number, string>;
  onSwitch: (heroId: number) => void;
}

function HeroToggle({ heroTrees, activeHeroId, mediaMap, onSwitch }: HeroToggleProps) {
  const [pendingId, setPendingId] = useState<number | null>(null);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 10 }}>
        {heroTrees.map((ht) => {
          const isActive = ht.id === activeHeroId;
          const heroNodes = ht.spec_talent_nodes ?? ht.hero_talent_nodes ?? ht.class_talent_nodes ?? [];
          const firstSpellId = heroNodes[0]?.entries?.[0]?.spell_tooltip?.spell?.id;
          const iconUrl = firstSpellId ? (mediaMap[firstSpellId] ?? "") : "";
          const firstName = heroNodes[0]?.entries?.[0]?.spell_tooltip?.spell?.name;

          return (
            <div
              key={ht.id}
              onClick={() => { if (!isActive) setPendingId(ht.id); }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 5,
                cursor: isActive ? "default" : "pointer",
              }}
            >
              <div style={{
                width: 72, height: 72,
                borderRadius: "50%",
                border: `3px solid ${isActive ? GOLD : "#2d3e52"}`,
                boxShadow: isActive ? `0 0 0 3px ${GOLD_GLOW}, 0 0 20px 4px ${GOLD_GLOW}` : undefined,
                overflow: "hidden",
                opacity: isActive ? 1 : 0.45,
                transition: "border-color .2s, opacity .2s, box-shadow .2s",
                transform: isActive ? "scale(1.08)" : "scale(1)",
                background: "#0a1520",
              }}>
                <SpellIcon url={iconUrl} name={firstName} brightness={1} />
              </div>
              <span style={{
                fontFamily: "'Rajdhani',sans-serif",
                fontSize: 11,
                fontWeight: isActive ? 700 : 400,
                color: isActive ? GOLD : "#4b6070",
                letterSpacing: 1,
                textTransform: "uppercase",
                textAlign: "center",
              }}>
                {ht.name}
              </span>
            </div>
          );
        })}
      </div>

      {/* Confirmation modal */}
      {pendingId !== null && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,.65)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setPendingId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0d1520",
              border: `1px solid ${GOLD_DIM}`,
              borderRadius: 12,
              padding: 28,
              maxWidth: 360,
              textAlign: "center",
            }}
          >
            <div style={{
              fontSize: 14, color: "#d1d5db",
              fontFamily: "'Rajdhani',sans-serif", marginBottom: 16,
            }}>
              Switch to{" "}
              <strong style={{ color: GOLD }}>
                {heroTrees.find((h) => h.id === pendingId)?.name}
              </strong>?
              <br />
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                This will reset your hero talent selections.
              </span>
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button
                onClick={() => { onSwitch(pendingId!); setPendingId(null); }}
                style={{
                  background: GOLD, color: "#000",
                  border: "none", borderRadius: 7,
                  padding: "8px 20px",
                  fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Confirm
              </button>
              <button
                onClick={() => setPendingId(null)}
                style={{
                  background: "transparent", color: "#6b7280",
                  border: "1px solid #2d3e52", borderRadius: 7,
                  padding: "8px 20px",
                  fontFamily: "'Rajdhani',sans-serif", fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function TreeSkeleton() {
  return (
    <div style={{ display: "flex", gap: 24, justifyContent: "center", padding: 20, overflowX: "auto" }}>
      {[{ cols: 8, rows: 10 }, { cols: 4, rows: 6 }, { cols: 7, rows: 10 }].map(({ cols, rows }, si) => (
        <div key={si} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ height: 14, width: 120, background: "#1e2d3d", borderRadius: 4, marginBottom: 4 }} />
          <div style={{
            display: "grid",
            gridTemplateRows: `repeat(${rows}, ${CELL}px)`,
            gridTemplateColumns: `repeat(${cols}, ${CELL}px)`,
            gap: GAP,
            padding: PAD,
            background: "rgba(0,8,20,.45)",
            borderRadius: 10,
          }}>
            {Array.from({ length: cols * rows }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: CELL, height: CELL,
                  borderRadius: "50%",
                  background: "#0d1a28",
                  animation: "pulse 1.8s ease-in-out infinite",
                  animationDelay: `${(i % 7) * 120}ms`,
                  opacity: Math.random() > 0.35 ? 1 : 0,
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Total points summary bar ─────────────────────────────────────────────────

function TotalPointsBar({
  classUsed, classBudget,
  specUsed, specBudget,
  heroUsed, heroBudget,
}: {
  classUsed: number; classBudget: number;
  specUsed: number; specBudget: number;
  heroUsed: number; heroBudget: number;
}) {
  const totalBudget = classBudget + specBudget + heroBudget;
  const totalUsed   = classUsed + specUsed + heroUsed;
  const remaining   = totalBudget - totalUsed;
  const over        = remaining < 0;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      marginBottom: 12,
      flexWrap: "wrap",
    }}>
      <span style={{
        fontFamily: "'Rajdhani',sans-serif",
        fontSize: 20,
        fontWeight: 700,
        color: over ? "#f87171" : GOLD,
        letterSpacing: 1,
      }}>
        {over ? `${Math.abs(remaining)} over budget` : `${remaining} points remaining`}
      </span>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface BlizzardTalentTreeProps {
  specSelectedKeys?: string[];
  onSpecToggle?: (key: string, selected: boolean) => void;
  heroKey?: "sentinel" | "packLeader";
  onHeroChange?: (hero: "sentinel" | "packLeader") => void;
  heroSelectedKeys?: string[];
  onHeroToggle?: (key: string, selected: boolean) => void;
  /** Compact mode — scales down the full tree to fit smaller containers */
  compact?: boolean;
}

export function BlizzardTalentTree({
  specSelectedKeys,
  onSpecToggle,
  heroKey: heroKeyProp,
  onHeroChange,
  heroSelectedKeys: heroSelectedKeysProp,
  onHeroToggle,
  compact = false,
}: BlizzardTalentTreeProps) {
  // ── Data ──────────────────────────────────────────────────────────────────
  const [treeData, setTreeData]   = useState<TalentTreeFullResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setLoadError(null);
    getSurvivalTalentTree()
      .then((data) => { if (mounted) { setTreeData(data); setIsLoading(false); } })
      .catch((err) => { if (mounted) { setLoadError(err?.message ?? "Failed to load talent tree"); setIsLoading(false); } });
    return () => { mounted = false; };
  }, []);

  // ── Internal selection state (fallback when no external props) ────────────
  const [internalSpecKeys, setInternalSpecKeys]   = useState<string[]>([]);
  const [internalHeroKey,  setInternalHeroKey]    = useState<"sentinel" | "packLeader">("sentinel");
  const [internalHeroKeys, setInternalHeroKeys]   = useState<string[]>([]);
  const [selectedChoices,  setSelectedChoices]    = useState<Record<number, number>>({});

  const activeSpecKeys = specSelectedKeys      ?? internalSpecKeys;
  const activeHeroKey  = heroKeyProp           ?? internalHeroKey;
  const activeHeroKeys = heroSelectedKeysProp  ?? internalHeroKeys;

  const selectedKeys = useMemo<Set<string>>(
    () => new Set([...CORE_SPEC.values(), ...activeSpecKeys, ...activeHeroKeys]),
    [activeSpecKeys, activeHeroKeys],
  );

  // ── Hero tree resolution (fall back to hardcoded data if API omits hero trees) ──
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

  // ── Compact scaling ───────────────────────────────────────────────────────
  const compactRef   = useRef<HTMLDivElement>(null);
  const innerRef     = useRef<HTMLDivElement>(null);
  const [compactScale,  setCompactScale]  = useState(0.45);
  const [compactHeight, setCompactHeight] = useState<number>(400);

  useEffect(() => {
    if (!compact) return;
    const timer = setTimeout(() => {
      if (!compactRef.current || !innerRef.current) return;
      const containerW = compactRef.current.clientWidth;
      const innerW = innerRef.current.scrollWidth;
      const innerH = innerRef.current.scrollHeight;
      if (innerW > 0 && containerW > 0) {
        const s = Math.min(1, containerW / innerW);
        setCompactScale(s);
        if (innerH > 0) setCompactHeight(innerH * s);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [compact, treeData]);

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
    if (onSpecToggle) {
      onSpecToggle(key, !isOn);
    } else {
      setInternalSpecKeys((prev) => isOn ? prev.filter((k) => k !== key) : [...prev, key]);
    }
  }, [selectedKeys, onSpecToggle]);

  const handleChoiceSelect = useCallback((node: BzTalentNode, entryIdx: number) => {
    const entry    = node.entries[entryIdx];
    const newKey   = entry ? (NAME_TO_KEY[entry.spell_tooltip?.spell?.name ?? ""] ?? null) : null;
    const oldIdx   = selectedChoices[node.id] ?? 0;
    const oldEntry = node.entries[oldIdx];
    const oldKey   = oldEntry ? (NAME_TO_KEY[oldEntry.spell_tooltip?.spell?.name ?? ""] ?? null) : null;

    setSelectedChoices((prev) => ({ ...prev, [node.id]: entryIdx }));
    if (onSpecToggle) {
      if (oldKey) onSpecToggle(oldKey, false);
      if (newKey) onSpecToggle(newKey, true);
    } else {
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
    if (onHeroToggle) {
      onHeroToggle(key, !isOn);
    } else {
      setInternalHeroKeys((prev) => isOn ? prev.filter((k) => k !== key) : [...prev, key]);
    }
  }, [selectedKeys, onHeroToggle]);

  const handleHeroChoiceSelect = useCallback((node: BzTalentNode, entryIdx: number) => {
    const entry    = node.entries[entryIdx];
    const newKey   = entry ? (NAME_TO_KEY[entry.spell_tooltip?.spell?.name ?? ""] ?? null) : null;
    const oldIdx   = selectedChoices[node.id] ?? 0;
    const oldEntry = node.entries[oldIdx];
    const oldKey   = oldEntry ? (NAME_TO_KEY[oldEntry.spell_tooltip?.spell?.name ?? ""] ?? null) : null;

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
    const newKey: "sentinel" | "packLeader" = ht.name.toLowerCase().includes("pack") ? "packLeader" : "sentinel";
    if (onHeroChange) {
      onHeroChange(newKey);
    } else {
      setInternalHeroKey(newKey);
      setInternalHeroKeys([]);
    }
  }, [heroTrees, onHeroChange]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (isLoading) return <TreeSkeleton />;

  if (loadError) {
    return (
      <div style={{
        padding: 24, textAlign: "center",
        fontFamily: "'Rajdhani',sans-serif", color: "#f87171", fontSize: 13,
      }}>
        <div style={{ marginBottom: 8 }}>⚠ Could not load talent tree from Blizzard API</div>
        <div style={{ fontSize: 11, color: "#6b7280" }}>{loadError}</div>
      </div>
    );
  }

  if (!treeData) return null;

  const { specTree, mediaMap } = treeData;
  const classNodes = specTree.class_talent_nodes ?? [];

  // Filter hero node IDs out of spec nodes (Blizzard API sometimes includes them in spec_talent_nodes)
  const heroNodeIdSet = new Set<number>();
  for (const ht of heroTrees) {
    for (const n of (ht.hero_talent_nodes ?? ht.spec_talent_nodes ?? ht.class_talent_nodes ?? [])) {
      heroNodeIdSet.add(n.id);
    }
  }
  const specNodes = (specTree.spec_talent_nodes ?? []).filter((n: BzTalentNode) => !heroNodeIdSet.has(n.id));

  const classBudget = specTree.talent_point_budget?.class_points ?? 31;
  const specBudget  = specTree.talent_point_budget?.spec_points  ?? 31;
  const heroBudget  = 10;

  const classCoreKeys = new Set(
    classNodes
      .filter((n) => CORE_CLASS.has(nodeSpellName(n) ?? ""))
      .map((n) => nodeTalentKey(n))
      .filter(Boolean) as string[],
  );

  const classUsed = computeUsedPts(classNodes, selectedKeys, classCoreKeys);
  const specUsed  = computeUsedPts(specNodes,  selectedKeys, CORE_SPEC);
  const heroUsed  = computeUsedPts(heroNodes,  selectedKeys, new Set());

  const heroLabel = activeHeroTree?.name ?? "Hero";
  const heroLabelColor = activeHeroKey === "sentinel" ? "#818cf8" : "#fb923c";

  return (
    <div ref={compactRef} style={{ userSelect: "none", ...(compact ? { overflow: "hidden" } : {}) }}>
      {/* Total remaining banner — hidden in compact mode */}
      {!compact && (
        <TotalPointsBar
          classUsed={classUsed} classBudget={classBudget}
          specUsed={specUsed}   specBudget={specBudget}
          heroUsed={heroUsed}   heroBudget={heroBudget}
        />
      )}

      {/* Three-column flex row: Class | Hero | Spec */}
      <div
        ref={innerRef}
        style={compact
          ? { transform: `scale(${compactScale})`, transformOrigin: "top left", height: compactHeight || undefined }
          : { overflowX: "auto", overflowY: "visible", paddingBottom: 16 }
        }
      >
        <div style={{
          display: "flex",
          flexDirection: "row",
          gap: 24,
          alignItems: "flex-start",
          minWidth: "fit-content",
          padding: "4px 4px 4px",
        }}>
          {/* CLASS TREE */}
          <TalentSection
            label="Class"
            labelColor="#60a5fa"
            nodes={classNodes}
            mediaMap={mediaMap}
            pointBudget={classBudget}
            selectedKeys={selectedKeys}
            selectedChoices={selectedChoices}
            coreKeys={classCoreKeys}
            onToggle={handleSpecToggle}
            onChoiceSelect={handleChoiceSelect}
            onHover={handleHover}
          />

          {/* HERO TREE (center) */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
            {heroTrees.length >= 2 && (
              <HeroToggle
                heroTrees={heroTrees}
                activeHeroId={activeHeroTreeId}
                mediaMap={mediaMap}
                onSwitch={handleHeroSwitch}
              />
            )}
            <TalentSection
              label={heroLabel}
              labelColor={heroLabelColor}
              nodes={heroNodes}
              mediaMap={mediaMap}
              pointBudget={heroBudget}
              selectedKeys={selectedKeys}
              selectedChoices={selectedChoices}
              coreKeys={new Set()}
              onToggle={handleHeroToggle}
              onChoiceSelect={handleHeroChoiceSelect}
              onHover={handleHover}
            />
          </div>

          {/* SPEC TREE */}
          <TalentSection
            label="Survival"
            labelColor="#4ade80"
            nodes={specNodes}
            mediaMap={mediaMap}
            pointBudget={specBudget}
            selectedKeys={selectedKeys}
            selectedChoices={selectedChoices}
            coreKeys={CORE_SPEC}
            onToggle={handleSpecToggle}
            onChoiceSelect={handleChoiceSelect}
            onHover={handleHover}
          />
        </div>
      </div>

      </div>

      {/* Tooltip */}
      {tooltip && <Tooltip info={tooltip.info} x={tooltip.x} y={tooltip.y} />}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: .35; }
          50%       { opacity: .75; }
        }
      `}</style>
    </div>
  );
}

export default BlizzardTalentTree;
