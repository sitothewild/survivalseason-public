// @ts-nocheck
// BlizzardTalentTree.tsx — Survival Hunter talent tree rendered from Blizzard Game Data API
// Fetches live node positions, icons, and connections; supports class / spec / hero sections.
import React, {
  useState, useEffect, useMemo, useCallback, useRef,
} from "react";
import { getSurvivalTalentTree } from "@/lib/blizzardApi";
import type {
  BzTalentNode, BzHeroTree, TalentTreeFullResponse,
} from "@/lib/blizzardApi";

// ─────────────────────────────────────────────────────────────────────────────
// Constants & mappings
// ─────────────────────────────────────────────────────────────────────────────

const NODE_D      = 52;   // node circle diameter
const COL_STEP    = 74;   // horizontal spacing (center to center)
const ROW_STEP    = 74;   // vertical spacing
const PAD         = 20;   // padding inside each section
const SECTION_GAP = 36;   // gap between class / hero / spec columns

const GOLD = "#fbbf24";
const GOLD_DIM = "#92620d";
const GOLD_GLOW = "rgba(251,191,36,.45)";

// Spell name → TalentConfig key (for sim-engine integration)
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

// Spec core talents (always on in every build)
const CORE_SPEC = new Set([
  "killCommand","wildfireBomb","raptorStrike","guerrillaTactics",
  "tipOfTheSpear","lunge","boomstick","strikeAsOne","flamebreak",
  "quickReload","mongooseFury","wildfireShells","shellshock","wallop",
  "bonding","sweepingSpear","blackrockMunitions","takedown",
  "killerCompanion","twinFangs","savagery","wildfireInfusion",
  "flanked","primalSurge","raptorSwipe",
]);

// Class tree nodes always taken (community consensus class build)
const CORE_CLASS = new Set([
  "Keen Eyesight","Unnatural Causes","Trigger Finger",
]);

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

// Convert API display_row/col → pixel center in a section
function nodeCenter(node: BzTalentNode, minRow: number, minCol: number) {
  return {
    cx: PAD + (node.display_col - minCol) * COL_STEP + NODE_D / 2,
    cy: PAD + (node.display_row - minRow) * ROW_STEP + NODE_D / 2,
  };
}

// Pixel bounds of a section
function sectionSize(nodes: BzTalentNode[]) {
  if (!nodes.length) return { w: 0, h: 0, minRow: 0, minCol: 0 };
  const rows = nodes.map((n) => n.display_row);
  const cols = nodes.map((n) => n.display_col);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  return {
    w: (maxCol - minCol) * COL_STEP + NODE_D + PAD * 2,
    h: (maxRow - minRow) * ROW_STEP + NODE_D + PAD * 2,
    minRow,
    minCol,
  };
}

function buildNodeMap(nodes: BzTalentNode[]) {
  const m = new Map<number, BzTalentNode>();
  nodes.forEach((n) => m.set(n.id, n));
  return m;
}

// ─────────────────────────────────────────────────────────────────────────────
// TalentNodeCircle — renders one node (single or choice)
// ─────────────────────────────────────────────────────────────────────────────

interface TalentNodeCircleProps {
  node: BzTalentNode;
  minRow: number;
  minCol: number;
  mediaMap: Record<number, string>;
  // selection
  selectedKeys: Set<string>;
  selectedChoices: Record<number, number>; // nodeId → entryIndex for choice nodes
  canSelect: boolean;
  isCore: boolean;
  onClick: () => void;
  onChoiceClick: (entryIdx: number) => void;
  onHover: (info: TooltipInfo | null, x: number, y: number) => void;
}

function TalentNodeCircle({
  node, minRow, minCol, mediaMap,
  selectedKeys, selectedChoices, canSelect, isCore,
  onClick, onChoiceClick, onHover,
}: TalentNodeCircleProps) {
  // Guard: skip nodes with missing data
  if (!node.entries?.length || !node.node_type) return null;

  const isChoice = node.node_type.type === "SELECTION";
  const { cx, cy } = nodeCenter(node, minRow, minCol);
  const left = cx - NODE_D / 2;
  const top  = cy - NODE_D / 2;

  // Determine selection state
  const key = nodeTalentKey(node);
  const isSelected = key
    ? (selectedKeys.has(key) || isCore)
    : isCore;
  const isLocked = !isCore && !isSelected && !canSelect;

  const borderColor = isSelected
    ? GOLD
    : isLocked
    ? "#1e2d3d"
    : "#3a4f68";
  const glowShadow = isSelected ? `0 0 0 2px ${GOLD_GLOW}, 0 0 12px 2px ${GOLD_GLOW}` : undefined;
  const brightness = isSelected ? 1 : isLocked ? 0.3 : 0.65;

  if (isChoice && node.entries.length >= 2) {
    const chosenIdx = selectedChoices[node.id] ?? 0;
    return (
      <div
        style={{
          position: "absolute",
          left,
          top,
          width: NODE_D,
          height: NODE_D,
          borderRadius: "50%",
          border: `2px solid ${borderColor}`,
          boxShadow: glowShadow,
          overflow: "hidden",
          cursor: isLocked ? "not-allowed" : "pointer",
          display: "flex",
          transition: "border-color .15s, box-shadow .15s",
        }}
        title={node.entries.map((e) => e.spell_tooltip?.spell?.name).join(" / ")}
        onMouseEnter={(e) => {
          const entry = node.entries[chosenIdx];
          onHover(
            {
              name: entry.spell_tooltip?.spell?.name ?? "?",
              description: entry.spell_tooltip?.description ?? "",
              castTime: entry.spell_tooltip?.cast_time,
              cooldown: entry.spell_tooltip?.cooldown,
              rank: 1,
              maxRank: entry.max_rank,
            },
            e.clientX,
            e.clientY
          );
        }}
        onMouseLeave={() => onHover(null, 0, 0)}
      >
        {/* Left half = entry 0 */}
        <div
          style={{ width: "50%", height: "100%", overflow: "hidden", position: "relative" }}
          onClick={() => { if (!isLocked) onChoiceClick(0); }}
        >
          <ChoiceIcon
            entry={node.entries[0]}
            mediaMap={mediaMap}
            active={isSelected && chosenIdx === 0}
            brightness={brightness}
            clipLeft
          />
        </div>
        {/* Right half = entry 1 */}
        <div
          style={{ width: "50%", height: "100%", overflow: "hidden", position: "relative" }}
          onClick={() => { if (!isLocked) onChoiceClick(1); }}
        >
          <ChoiceIcon
            entry={node.entries[1]}
            mediaMap={mediaMap}
            active={isSelected && chosenIdx === 1}
            brightness={brightness}
            clipRight
          />
        </div>
        {/* Divider */}
        <div style={{
          position: "absolute", left: "50%", top: 0, width: 1,
          height: "100%", background: "#000", opacity: 0.6, pointerEvents: "none",
        }} />
        {/* rank badge */}
        {isSelected && (
          <div style={RANK_BADGE_STYLE}>1/1</div>
        )}
      </div>
    );
  }

  // Single node
  const entry = node.entries[0];
  const spellId = entry?.spell_tooltip?.spell?.id;
  const iconUrl = spellId ? (mediaMap[spellId] ?? FALLBACK_ICON) : FALLBACK_ICON;
  const maxRank = entry?.max_rank ?? 1;

  return (
    <div
      onClick={() => { if (!isCore && canSelect) onClick(); }}
      onMouseEnter={(e) => onHover(
        {
          name: entry?.spell_tooltip?.spell?.name ?? "?",
          description: entry?.spell_tooltip?.description ?? "",
          castTime: entry?.spell_tooltip?.cast_time,
          cooldown: entry?.spell_tooltip?.cooldown,
          rank: isSelected ? maxRank : 0,
          maxRank,
        },
        e.clientX, e.clientY
      )}
      onMouseLeave={() => onHover(null, 0, 0)}
      style={{
        position: "absolute",
        left,
        top,
        width: NODE_D,
        height: NODE_D,
        borderRadius: "50%",
        border: `2px solid ${borderColor}`,
        boxShadow: glowShadow,
        overflow: "hidden",
        cursor: isCore ? "default" : isLocked ? "not-allowed" : "pointer",
        transition: "border-color .15s, box-shadow .15s",
        background: "#0a1520",
      }}
      title={entry?.spell_tooltip?.spell?.name}
    >
      <img
        src={iconUrl}
        alt=""
        loading="lazy"
        draggable={false}
        onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_ICON; }}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: `brightness(${brightness})`,
          transition: "filter .15s",
          borderRadius: "50%",
        }}
      />
      {/* rank badge */}
      {maxRank > 1 || isSelected ? (
        <div style={RANK_BADGE_STYLE}>
          {isSelected ? maxRank : 0}/{maxRank}
        </div>
      ) : null}
    </div>
  );
}

function ChoiceIcon({ entry, mediaMap, active, brightness, clipLeft, clipRight }: any) {
  const spellId = entry?.spell_tooltip?.spell?.id;
  const iconUrl = spellId ? (mediaMap[spellId] ?? FALLBACK_ICON) : FALLBACK_ICON;
  return (
    <img
      src={iconUrl}
      alt=""
      loading="lazy"
      draggable={false}
      onError={(e: any) => { e.target.src = FALLBACK_ICON; }}
      style={{
        width: NODE_D,
        height: NODE_D,
        objectFit: "cover",
        filter: `brightness(${active ? 1 : brightness})`,
        position: "absolute",
        left: clipRight ? -NODE_D / 2 : 0,
        top: 0,
        transition: "filter .15s",
      }}
    />
  );
}

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

const FALLBACK_ICON =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' fill='%23222'/><text x='50%25' y='55%25' text-anchor='middle' dominant-baseline='middle' fill='%23888' font-size='22'>?</text></svg>";

// ─────────────────────────────────────────────────────────────────────────────
// ConnectionLines — SVG lines between prerequisite nodes
// ─────────────────────────────────────────────────────────────────────────────

interface ConnectionLinesProps {
  nodes: BzTalentNode[];
  nodeMap: Map<number, BzTalentNode>;
  minRow: number;
  minCol: number;
  selectedKeys: Set<string>;
  selectedChoices: Record<number, number>;
}

function ConnectionLines({ nodes, nodeMap, minRow, minCol, selectedKeys, selectedChoices }: ConnectionLinesProps) {
  const lines = useMemo(() => {
    const result: Array<{ key: string; x1: number; y1: number; x2: number; y2: number; active: boolean }> = [];
    for (const node of nodes) {
      for (const prereq of node.prerequisite_nodes ?? []) {
        const prereqNode = nodeMap.get(prereq.id);
        if (!prereqNode) continue;
        const from = nodeCenter(prereqNode, minRow, minCol);
        const to   = nodeCenter(node,       minRow, minCol);
        const prereqKey = nodeTalentKey(prereqNode);
        const nodeKey   = nodeTalentKey(node);
        const prereqOn  = prereqKey ? selectedKeys.has(prereqKey) : false;
        const nodeOn    = nodeKey   ? selectedKeys.has(nodeKey)   : false;
        result.push({
          key:    `${prereq.id}-${node.id}`,
          x1: from.cx, y1: from.cy,
          x2: to.cx,   y2: to.cy,
          active: prereqOn && nodeOn,
        });
      }
    }
    return result;
  }, [nodes, nodeMap, minRow, minCol, selectedKeys]);

  return (
    <svg
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}
      width="100%"
      height="100%"
    >
      {lines.map((l) => (
        <line
          key={l.key}
          x1={l.x1} y1={l.y1}
          x2={l.x2} y2={l.y2}
          stroke={l.active ? `${GOLD}99` : "#1e2d3d"}
          strokeWidth={l.active ? 2.5 : 1.5}
          strokeDasharray={l.active ? undefined : "5 3"}
        />
      ))}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TalentSection — renders one column (class | hero | spec)
// ─────────────────────────────────────────────────────────────────────────────

interface TalentSectionProps {
  label: string;
  labelColor: string;
  nodes: BzTalentNode[];
  mediaMap: Record<number, string>;
  pointBudget: number;
  selectedKeys: Set<string>;
  selectedChoices: Record<number, number>;
  coreKeys: Set<string>;  // keys that are always considered "on"
  onToggle: (node: BzTalentNode) => void;
  onChoiceSelect: (node: BzTalentNode, entryIdx: number) => void;
  onHover: (info: TooltipInfo | null, x: number, y: number) => void;
}

function TalentSection({
  label, labelColor, nodes, mediaMap, pointBudget,
  selectedKeys, selectedChoices, coreKeys,
  onToggle, onChoiceSelect, onHover,
}: TalentSectionProps) {
  const { w, h, minRow, minCol } = sectionSize(nodes);
  const nodeMap = useMemo(() => buildNodeMap(nodes), [nodes]);

  // Compute usedPts from non-core selected nodes
  const usedPts = useMemo(() => {
    return nodes.reduce((sum, n) => {
      const key = nodeTalentKey(n);
      if (!key || coreKeys.has(key)) return sum;
      return sum + (selectedKeys.has(key) ? (n.entries?.[0]?.max_rank ?? 1) : 0);
    }, 0);
  }, [nodes, selectedKeys, coreKeys]);

  if (!nodes.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "0 4px" }}>
        <span style={{
          fontFamily: "'Orbitron',sans-serif", fontSize: 9, letterSpacing: 2,
          color: labelColor, textTransform: "uppercase",
        }}>{label}</span>
        <span style={{
          fontFamily: "'IBM Plex Mono',monospace", fontSize: 10,
          color: usedPts >= pointBudget ? GOLD : "#4b6070",
          fontWeight: 700,
        }}>{usedPts} / {pointBudget} pts</span>
      </div>

      {/* Tree container */}
      <div style={{ position: "relative", width: w, height: h, background: "rgba(0,8,20,.45)", borderRadius: 10, overflow: "hidden" }}>
        {/* Subtle tinted background */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `radial-gradient(ellipse 80% 60% at 50% 40%, rgba(251,191,36,.04) 0%, transparent 70%)`,
          pointerEvents: "none",
        }} />

        {/* Connection lines (behind nodes) */}
        <ConnectionLines
          nodes={nodes}
          nodeMap={nodeMap}
          minRow={minRow}
          minCol={minCol}
          selectedKeys={selectedKeys}
          selectedChoices={selectedChoices}
        />

        {/* Nodes */}
        {nodes.map((node) => {
          const key = nodeTalentKey(node);
          const isCore = !!(key && coreKeys.has(key));
          // Can select if prereqs met and under budget
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
            <TalentNodeCircle
              key={node.id}
              node={node}
              minRow={minRow}
              minCol={minCol}
              mediaMap={mediaMap}
              selectedKeys={selectedKeys}
              selectedChoices={selectedChoices}
              canSelect={canSelect}
              isCore={isCore}
              onClick={() => onToggle(node)}
              onChoiceClick={(idx) => onChoiceSelect(node, idx)}
              onHover={onHover}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HeroToggle — Pack Leader / Sentinel selector above hero tree
// ─────────────────────────────────────────────────────────────────────────────

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
      <div style={{ display: "flex", justifyContent: "center", gap: 24, marginBottom: 10 }}>
        {heroTrees.map((ht) => {
          const isActive = ht.id === activeHeroId;
          // Grab first node's first entry icon as the hero's "face" icon
          const heroNodes = ht.spec_talent_nodes ?? ht.hero_talent_nodes ?? ht.class_talent_nodes ?? [];
          const firstSpellId = heroNodes[0]?.entries?.[0]?.spell_tooltip?.spell?.id;
          const iconUrl = firstSpellId ? (mediaMap[firstSpellId] ?? FALLBACK_ICON) : FALLBACK_ICON;
          return (
            <div
              key={ht.id}
              onClick={() => {
                if (!isActive) setPendingId(ht.id);
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                cursor: isActive ? "default" : "pointer",
              }}
            >
              <div style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                border: `3px solid ${isActive ? GOLD : "#2d3e52"}`,
                boxShadow: isActive ? `0 0 0 3px ${GOLD_GLOW}, 0 0 20px 4px ${GOLD_GLOW}` : undefined,
                overflow: "hidden",
                opacity: isActive ? 1 : 0.45,
                transition: "border-color .2s, opacity .2s, box-shadow .2s",
                transform: isActive ? "scale(1.07)" : "scale(1)",
              }}>
                <img
                  src={iconUrl}
                  alt={ht.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={(e: any) => { e.target.src = FALLBACK_ICON; }}
                />
              </div>
              <span style={{
                fontFamily: "'Rajdhani',sans-serif",
                fontSize: 11,
                fontWeight: isActive ? 700 : 400,
                color: isActive ? GOLD : "#4b6070",
                letterSpacing: 1,
                textTransform: "uppercase",
              }}>{ht.name}</span>
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
            <div style={{ fontSize: 14, color: "#d1d5db", fontFamily: "'Rajdhani',sans-serif", marginBottom: 16 }}>
              Switch to <strong style={{ color: GOLD }}>
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
                }}>Confirm</button>
              <button
                onClick={() => setPendingId(null)}
                style={{
                  background: "transparent", color: "#6b7280",
                  border: "1px solid #2d3e52", borderRadius: 7,
                  padding: "8px 20px",
                  fontFamily: "'Rajdhani',sans-serif", fontSize: 13,
                  cursor: "pointer",
                }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip
// ─────────────────────────────────────────────────────────────────────────────

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
      left: x + 14 + width > window.innerWidth ? x - width - 14 : x + 14,
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
      <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, fontWeight: 700, color: GOLD, marginBottom: 4 }}>
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

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton loader
// ─────────────────────────────────────────────────────────────────────────────

function TreeSkeleton() {
  return (
    <div style={{ display: "flex", gap: 32, justifyContent: "center", padding: 20, overflowX: "auto" }}>
      {[6, 4, 5].map((cols, si) => (
        <div key={si} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ height: 14, width: 100, background: "#1e2d3d", borderRadius: 4, marginBottom: 4 }} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${cols}, ${NODE_D}px)`,
              gap: 22,
              padding: 20,
              background: "rgba(0,8,20,.45)",
              borderRadius: 10,
            }}
          >
            {Array.from({ length: cols * 8 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: NODE_D,
                  height: NODE_D,
                  borderRadius: "50%",
                  background: "#0d1a28",
                  animation: "pulse 1.8s ease-in-out infinite",
                  animationDelay: `${(i % 7) * 120}ms`,
                }}
              />
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
  /** Currently selected optional spec talent keys (TalentConfig keys) */
  specSelectedKeys?: string[];
  /** Called when optional spec node is toggled */
  onSpecToggle?: (key: string, selected: boolean) => void;
  /** Current hero path */
  heroKey?: "sentinel" | "packLeader";
  /** Called when hero switches */
  onHeroChange?: (hero: "sentinel" | "packLeader") => void;
  /** Selected hero talent keys */
  heroSelectedKeys?: string[];
  /** Called when hero node toggled */
  onHeroToggle?: (key: string, selected: boolean) => void;
  /** Compact mode — scales down to fit in smaller containers */
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
  const [treeData, setTreeData] = useState<TalentTreeFullResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setLoadError(null);
    getSurvivalTalentTree()
      .then((data) => {
        if (mounted) {
          setTreeData(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setLoadError(err?.message ?? "Failed to load talent tree");
          setIsLoading(false);
        }
      });
    return () => { mounted = false; };
  }, []);

  // ── Selection state (internal fallback if no external props) ─────────────
  const [internalSpecKeys, setInternalSpecKeys] = useState<string[]>([]);
  const [internalHeroKey, setInternalHeroKey] = useState<"sentinel" | "packLeader">("sentinel");
  const [internalHeroKeys, setInternalHeroKeys] = useState<string[]>([]);
  const [selectedChoices, setSelectedChoices] = useState<Record<number, number>>({});

  const activeSpecKeys = specSelectedKeys ?? internalSpecKeys;
  const activeHeroKey  = heroKeyProp  ?? internalHeroKey;
  const activeHeroKeys = heroSelectedKeysProp ?? internalHeroKeys;

  // Build the set of all "selected" keys (core + optional + hero)
  const selectedKeys = useMemo<Set<string>>(() => {
    return new Set([...CORE_SPEC.values(), ...activeSpecKeys, ...activeHeroKeys]);
  }, [activeSpecKeys, activeHeroKeys]);

  // ── Hero tree resolution ──────────────────────────────────────────────────
  const heroTrees = useMemo(() => treeData?.heroTrees ?? [], [treeData]);

  const activeHeroTreeId = useMemo(() => {
    if (!heroTrees.length) return -1;
    // Match by name (sentinel / pack leader)
    const lcKey = activeHeroKey.toLowerCase().replace(/\s+/g, "");
    const match = heroTrees.find((ht) =>
      ht.name.toLowerCase().replace(/\s+/g, "") === lcKey ||
      ht.name.toLowerCase().includes(activeHeroKey === "sentinel" ? "sentinel" : "pack")
    );
    return match?.id ?? heroTrees[0]?.id ?? -1;
  }, [heroTrees, activeHeroKey]);

  const activeHeroTree = useMemo(
    () => heroTrees.find((ht) => ht.id === activeHeroTreeId),
    [heroTrees, activeHeroTreeId]
  );

  const heroNodes: BzTalentNode[] = useMemo(
    () =>
      activeHeroTree
        ? (activeHeroTree.spec_talent_nodes ??
           activeHeroTree.hero_talent_nodes ??
           activeHeroTree.class_talent_nodes ??
           [])
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
    if (onSpecToggle) {
      onSpecToggle(key, !isOn);
    } else {
      setInternalSpecKeys((prev) =>
        isOn ? prev.filter((k) => k !== key) : [...prev, key]
      );
    }
  }, [selectedKeys, onSpecToggle]);

  const handleChoiceSelect = useCallback((node: BzTalentNode, entryIdx: number) => {
    const entry = node.entries[entryIdx];
    const newKey = entry ? (NAME_TO_KEY[entry.spell_tooltip?.spell?.name ?? ""] ?? null) : null;
    const oldIdx = selectedChoices[node.id] ?? 0;
    const oldEntry = node.entries[oldIdx];
    const oldKey = oldEntry ? (NAME_TO_KEY[oldEntry.spell_tooltip?.spell?.name ?? ""] ?? null) : null;

    setSelectedChoices((prev) => ({ ...prev, [node.id]: entryIdx }));

    // Deselect old choice, select new choice
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
    if (onHeroToggle) {
      onHeroToggle(key, !isOn);
    } else {
      setInternalHeroKeys((prev) =>
        isOn ? prev.filter((k) => k !== key) : [...prev, key]
      );
    }
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
    const isPackLeader = ht.name.toLowerCase().includes("pack");
    const newKey = isPackLeader ? "packLeader" : "sentinel";
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
  const specNodes  = specTree.spec_talent_nodes ?? [];

  // Point budgets from API or sensible defaults
  const classBudget = specTree.talent_point_budget?.class_points ?? 31;
  const specBudget  = specTree.talent_point_budget?.spec_points  ?? 31;
  const heroBudget  = 10;

  // Class core keys: map by name to detect always-taken nodes
  const classCoreKeys = new Set(
    classNodes
      .filter((n) => CORE_CLASS.has(nodeSpellName(n) ?? ""))
      .map((n) => nodeTalentKey(n))
      .filter(Boolean) as string[]
  );

  // Compact mode: measure inner content and scale to fit container
  const compactRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [compactScale, setCompactScale] = useState(1);

  useEffect(() => {
    if (!compact || !compactRef.current || !innerRef.current) return;
    const observer = new ResizeObserver(() => {
      const containerW = compactRef.current?.clientWidth ?? 0;
      const innerW = innerRef.current?.scrollWidth ?? 0;
      if (innerW > 0 && containerW > 0) {
        setCompactScale(Math.min(1, containerW / innerW));
      }
    });
    observer.observe(compactRef.current);
    // Also measure on first render
    const containerW = compactRef.current?.clientWidth ?? 0;
    const innerW = innerRef.current?.scrollWidth ?? 0;
    if (innerW > 0 && containerW > 0) {
      setCompactScale(Math.min(1, containerW / innerW));
    }
    return () => observer.disconnect();
  }, [compact, treeData]);

  const innerH = innerRef.current?.scrollHeight ?? 0;

  return (
    <div ref={compactRef} style={{ userSelect: "none", ...(compact ? { overflow: "hidden" } : {}) }}>
      {/* ── Scroll wrapper ─────────────────────────────────────────────── */}
      <div
        ref={innerRef}
        style={{
          ...(compact
            ? { transform: `scale(${compactScale})`, transformOrigin: "top left", height: innerH * compactScale || "auto" }
            : { overflowX: "auto", overflowY: "visible" }),
        }}
      >
        <div style={{
          display: "flex",
          gap: compact ? SECTION_GAP * 0.6 : SECTION_GAP,
          alignItems: "flex-start",
          minWidth: "fit-content",
          padding: compact ? "4px 2px 8px" : "8px 4px 16px",
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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            {/* Hero selector */}
            {heroTrees.length >= 2 && (
              <HeroToggle
                heroTrees={heroTrees}
                activeHeroId={activeHeroTreeId}
                mediaMap={mediaMap}
                onSwitch={handleHeroSwitch}
              />
            )}

            <TalentSection
              label={activeHeroTree?.name ?? "Hero"}
              labelColor={activeHeroKey === "sentinel" ? "#818cf8" : "#fb923c"}
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

      {/* Tooltip */}
      {tooltip && <Tooltip info={tooltip.info} x={tooltip.x} y={tooltip.y} />}

      {/* Keyframe for skeleton pulse */}
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
