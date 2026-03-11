// ─────────────────────────────────────────────────────────────
// hooks/useTalentTreeData.ts
// Fetches the Blizzard talent tree for Hunter/Survival, maps nodes,
// and provides state management for all four trees.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo } from "react";
import type {
  BlizzardTalentTreeResponse,
  MappedTalentNode,
} from "../types/talentTreeTypes";
import {
  HUNTER_TREE_ID,
  SURVIVAL_SPEC_ID,
} from "../types/talentTreeTypes";
import {
  mapTalentTree,
  getGateRows,
  debugPrintTree,
} from "../utils/talentTreeMapper";

// ─── TYPES ──────────────────────────────────────────────────

interface TalentTreeState {
  points: Record<number, number>; // nodeId → current rank points
  choices: Record<number, number | null>; // nodeId → choice option index
}

interface UseTalentTreeDataReturn {
  // Loading / error
  isLoading: boolean;
  error: string | null;

  // Mapped node arrays
  classNodes: MappedTalentNode[];
  specNodes: MappedTalentNode[];
  sentinelNodes: MappedTalentNode[];
  packLeaderNodes: MappedTalentNode[];

  // State per tree
  classState: TalentTreeState;
  specState: TalentTreeState;
  heroState: TalentTreeState; // combined sentinel + pack leader

  // Point totals
  classPointsSpent: number;
  specPointsSpent: number;

  // Gates
  classGates: { points: number; afterRow: number }[];
  specGates: { points: number; afterRow: number }[];

  // Active hero tree
  activeHeroTree: "sentinel" | "packLeader";
  setActiveHeroTree: (tree: "sentinel" | "packLeader") => void;
  /** Switch hero tree atomically: sets key + auto-fills non-choice nodes */
  switchHeroTree: (tree: "sentinel" | "packLeader") => void;

  // Actions
  handleClassPointChange: (nodeId: number, delta: number) => void;
  handleSpecPointChange: (nodeId: number, delta: number) => void;
  handleHeroPointChange: (nodeId: number, delta: number) => void;
  handleClassChoiceSelect: (nodeId: number, optionIndex: number) => void;
  handleSpecChoiceSelect: (nodeId: number, optionIndex: number) => void;
  handleHeroChoiceSelect: (nodeId: number, optionIndex: number) => void;
  resetClass: () => void;
  resetSpec: () => void;
  resetHero: () => void;
  resetAll: () => void;

  // For SimC / optimizer
  getSelectedTalents: () => SelectedTalent[];

  // Refresh data
  refetch: () => void;
}

export interface SelectedTalent {
  nodeId: number;
  talentId: number;
  spellId: number;
  name: string;
  rank: number;
  section: "class" | "spec" | "hero";
}

// ─── HOOK ───────────────────────────────────────────────────

export function useTalentTreeData(
  /** Your Supabase edge function URL that proxies Blizzard API calls */
  fetchFn: (treeId: number, specId: number) => Promise<BlizzardTalentTreeResponse>
): UseTalentTreeDataReturn {
  // ── Loading state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Mapped nodes
  const [classNodes, setClassNodes] = useState<MappedTalentNode[]>([]);
  const [specNodes, setSpecNodes] = useState<MappedTalentNode[]>([]);
  const [sentinelNodes, setSentinelNodes] = useState<MappedTalentNode[]>([]);
  const [packLeaderNodes, setPackLeaderNodes] = useState<MappedTalentNode[]>([]);

  // ── Tree states
  const [classState, setClassState] = useState<TalentTreeState>({
    points: {},
    choices: {},
  });
  const [specState, setSpecState] = useState<TalentTreeState>({
    points: {},
    choices: {},
  });
  const [heroState, setHeroState] = useState<TalentTreeState>({
    points: {},
    choices: {},
  });

  // ── Gates
  const [classGates, setClassGates] = useState<{ points: number; afterRow: number }[]>([]);
  const [specGates, setSpecGates] = useState<{ points: number; afterRow: number }[]>([]);

  // ── Active hero tree selection
  const [activeHeroTree, setActiveHeroTree] = useState<"sentinel" | "packLeader">("sentinel");

  // ── Fetch & map
  const fetchAndMap = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchFn(HUNTER_TREE_ID, SURVIVAL_SPEC_ID);

      // Validate tree ID
      if (response.id !== HUNTER_TREE_ID) {
        console.warn(
          `⚠️ Blizzard API returned tree ${response.id}, expected ${HUNTER_TREE_ID}. ` +
          `Check blizzardApiClient.ts endpoint URL.`
        );
      }

      // Map all trees
      const mapped = mapTalentTree(response);

      setClassNodes(mapped.classNodes);
      setSpecNodes(mapped.specNodes);
      setSentinelNodes(mapped.sentinelNodes);
      setPackLeaderNodes(mapped.packLeaderNodes);

      // Debug: print tree layouts to console
      if (import.meta.env?.DEV) {
        debugPrintTree(mapped.classNodes, "Hunter Class");
        debugPrintTree(mapped.specNodes, "Survival Spec");
        debugPrintTree(mapped.sentinelNodes, "Sentinel Hero");
        debugPrintTree(mapped.packLeaderNodes, "Pack Leader Hero");
      }

      // Initialize point states (all 0)
      setClassState({
        points: initPoints(mapped.classNodes),
        choices: initChoices(mapped.classNodes),
      });
      setSpecState({
        points: initPoints(mapped.specNodes),
        choices: initChoices(mapped.specNodes),
      });
      // Hero tree: auto-fill non-choice nodes for the active hero tree (default: sentinel)
      const activeHeroNodes = mapped.sentinelNodes; // default hero tree
      const inactiveHeroNodes = mapped.packLeaderNodes;
      setHeroState({
        points: {
          ...initPoints(inactiveHeroNodes),
          ...initHeroPoints(activeHeroNodes),
        },
        choices: initChoices([...mapped.sentinelNodes, ...mapped.packLeaderNodes]),
      });

      // Parse gate/restriction lines — use raw API display_row values directly
      if (response.restriction_lines) {
        const gates = getGateRows(response.restriction_lines);
        // restricted_row IS the first locked display_row.
        // afterRow = the display_row just before the gate (max displayRow < restricted_row)
        setClassGates(
          gates.classGates.map((g) => ({
            points: g.points,
            afterRow: g.row, // This is the restricted_row from API — nodes with displayRow >= this are locked
          }))
        );
        setSpecGates(
          gates.specGates.map((g) => ({
            points: g.points,
            afterRow: g.row,
          }))
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load talent tree data";
      setError(msg);
      console.error("useTalentTreeData error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    fetchAndMap();
  }, [fetchAndMap]);

  // ── Point totals
  const classPointsSpent = useMemo(
    () => Object.values(classState.points).reduce((sum, v) => sum + v, 0),
    [classState.points]
  );
  const specPointsSpent = useMemo(
    () => Object.values(specState.points).reduce((sum, v) => sum + v, 0),
    [specState.points]
  );

  // ── Dependents map (reverse lookup: nodeId → nodeIds that list it in lockedBy)
  const dependentsMap = useMemo(() => {
    const allNodes = [...classNodes, ...specNodes, ...sentinelNodes, ...packLeaderNodes];
    const map = new Map<number, number[]>();
    for (const node of allNodes) {
      for (const parentId of node.lockedBy) {
        if (!map.has(parentId)) map.set(parentId, []);
        map.get(parentId)!.push(node.nodeId);
      }
    }
    return map;
  }, [classNodes, specNodes, sentinelNodes, packLeaderNodes]);

  // ── Point change handlers (with cap, prerequisite, and dependency enforcement)
  const makePointHandler = (
    setState: React.Dispatch<React.SetStateAction<TalentTreeState>>,
    nodes: MappedTalentNode[],
    maxPoints: number,
    gates: { points: number; afterRow: number }[] = []
  ) => {
    return (nodeId: number, delta: number) => {
      const node = nodes.find((n) => n.nodeId === nodeId);
      if (!node) return;

      setState((prev) => {
        const current = prev.points[nodeId] ?? 0;
        const totalSpent = Object.values(prev.points).reduce((sum, v) => sum + v, 0);

        if (delta > 0) {
          // ── ADDING a point ──
          // Cap check
          if (totalSpent >= maxPoints) return prev;
          // Max rank check
          if (current >= node.maxRank) return prev;
          // Prerequisite check (all lockedBy nodes must have >= 1 point)
          if (node.lockedBy.length > 0) {
            const prereqMet = node.lockedBy.every(
              (parentId) => (prev.points[parentId] ?? 0) > 0
            );
            if (!prereqMet) return prev;
          }
          // Gate check
          for (const gate of gates) {
            if (node.displayRow >= gate.afterRow && totalSpent < gate.points) {
              return prev;
            }
          }

          return {
            ...prev,
            points: { ...prev.points, [nodeId]: current + 1 },
          };
        } else if (delta < 0) {
          // ── REMOVING a point ──
          if (current <= 0) return prev;
          const nextVal = current - 1;

          // Dependency protection: if going to 0, check if any dependents have points
          if (nextVal === 0) {
            const deps = dependentsMap.get(nodeId) ?? [];
            for (const depId of deps) {
              if ((prev.points[depId] ?? 0) > 0) return prev; // blocked
            }
          }

          return {
            ...prev,
            points: { ...prev.points, [nodeId]: nextVal },
          };
        }

        return prev;
      });
    };
  };

  const handleClassPointChange = useCallback(
    makePointHandler(setClassState, classNodes, 34, classGates),
    [classNodes, classGates]
  );
  const handleSpecPointChange = useCallback(
    makePointHandler(setSpecState, specNodes, 34, specGates),
    [specNodes, specGates]
  );
  const handleHeroPointChange = useCallback(
    makePointHandler(setHeroState, [...sentinelNodes, ...packLeaderNodes], 13),
    [sentinelNodes, packLeaderNodes]
  );

  // ── Choice handlers
  const makeChoiceHandler = (
    setState: React.Dispatch<React.SetStateAction<TalentTreeState>>
  ) => {
    return (nodeId: number, optionIndex: number) => {
      setState((prev) => {
        const currentChoice = prev.choices[nodeId];

        // -1 means deselect (from right-click)
        if (optionIndex === -1 || currentChoice === optionIndex) {
          return {
            ...prev,
            choices: { ...prev.choices, [nodeId]: null },
            points: { ...prev.points, [nodeId]: 0 },
          };
        }

        return {
          ...prev,
          choices: { ...prev.choices, [nodeId]: optionIndex },
          points: { ...prev.points, [nodeId]: 1 },
        };
      });
    };
  };

  const handleClassChoiceSelect = useCallback(makeChoiceHandler(setClassState), []);
  const handleSpecChoiceSelect = useCallback(makeChoiceHandler(setSpecState), []);
  const handleHeroChoiceSelect = useCallback(makeChoiceHandler(setHeroState), []);

  // ── Reset handlers
  const resetClass = useCallback(() => {
    setClassState({
      points: initPoints(classNodes),
      choices: initChoices(classNodes),
    });
  }, [classNodes]);

  const resetSpec = useCallback(() => {
    setSpecState({
      points: initPoints(specNodes),
      choices: initChoices(specNodes),
    });
  }, [specNodes]);

  const resetHero = useCallback(() => {
    // Re-auto-allocate non-choice nodes for the active hero tree
    const activeNodes = activeHeroTree === "sentinel" ? sentinelNodes : packLeaderNodes;
    const inactiveNodes = activeHeroTree === "sentinel" ? packLeaderNodes : sentinelNodes;
    setHeroState({
      points: {
        ...initPoints(inactiveNodes),
        ...initHeroPoints(activeNodes),
      },
      choices: initChoices([...sentinelNodes, ...packLeaderNodes]),
    });
  }, [sentinelNodes, packLeaderNodes, activeHeroTree]);

  // Switch hero tree atomically: set new key + auto-fill new tree's non-choice nodes
  const switchHeroTree = useCallback(
    (newKey: "sentinel" | "packLeader") => {
      setActiveHeroTree(newKey);
      const activeNodes = newKey === "sentinel" ? sentinelNodes : packLeaderNodes;
      const inactiveNodes = newKey === "sentinel" ? packLeaderNodes : sentinelNodes;
      setHeroState({
        points: {
          ...initPoints(inactiveNodes),
          ...initHeroPoints(activeNodes),
        },
        choices: initChoices([...sentinelNodes, ...packLeaderNodes]),
      });
    },
    [sentinelNodes, packLeaderNodes]
  );

  const resetAll = useCallback(() => {
    resetClass();
    resetSpec();
    resetHero();
  }, [resetClass, resetSpec, resetHero]);

  // ── Build selected talents for SimC / optimizer
  const getSelectedTalents = useCallback((): SelectedTalent[] => {
    const result: SelectedTalent[] = [];

    const collectFromTree = (
      nodes: MappedTalentNode[],
      state: TalentTreeState,
      section: "class" | "spec" | "hero"
    ) => {
      for (const node of nodes) {
        const pts = state.points[node.nodeId] ?? 0;
        if (pts === 0) continue;

        if (node.nodeType === "choice" && node.choiceOptions) {
          const choiceIdx = state.choices[node.nodeId];
          if (choiceIdx !== null && choiceIdx !== undefined && choiceIdx >= 0) {
            const opt = node.choiceOptions[choiceIdx];
            result.push({
              nodeId: node.nodeId,
              talentId: opt.talentId,
              spellId: opt.spellId,
              name: opt.name,
              rank: 1,
              section,
            });
          }
        } else {
          result.push({
            nodeId: node.nodeId,
            talentId: node.talentId,
            spellId: node.spellId,
            name: node.name,
            rank: pts,
            section,
          });
        }
      }
    };

    collectFromTree(classNodes, classState, "class");
    collectFromTree(specNodes, specState, "spec");

    // Only include the active hero tree
    const heroNodes = activeHeroTree === "sentinel" ? sentinelNodes : packLeaderNodes;
    collectFromTree(heroNodes, heroState, "hero");

    return result;
  }, [
    classNodes, specNodes, sentinelNodes, packLeaderNodes,
    classState, specState, heroState, activeHeroTree,
  ]);

  return {
    isLoading,
    error,
    classNodes,
    specNodes,
    sentinelNodes,
    packLeaderNodes,
    classState,
    specState,
    heroState,
    classPointsSpent,
    specPointsSpent,
    classGates,
    specGates,
    activeHeroTree,
    setActiveHeroTree,
    switchHeroTree,
    handleClassPointChange,
    handleSpecPointChange,
    handleHeroPointChange,
    handleClassChoiceSelect,
    handleSpecChoiceSelect,
    handleHeroChoiceSelect,
    resetClass,
    resetSpec,
    resetHero,
    resetAll,
    getSelectedTalents,
    refetch: fetchAndMap,
  };
}

// ─── HELPERS ────────────────────────────────────────────────

function initPoints(nodes: MappedTalentNode[]): Record<number, number> {
  const state: Record<number, number> = {};
  for (const n of nodes) state[n.nodeId] = 0;
  return state;
}

/** Auto-fill hero tree: non-choice and non-selection nodes get 1 point automatically */
function initHeroPoints(nodes: MappedTalentNode[]): Record<number, number> {
  const state: Record<number, number> = {};
  for (const n of nodes) {
    // Selection nodes and choice nodes start at 0; everything else auto-fills
    state[n.nodeId] = (n.nodeType === "choice" || n.nodeType === "selection") ? 0 : 1;
  }
  return state;
}

function initChoices(nodes: MappedTalentNode[]): Record<number, number | null> {
  const state: Record<number, number | null> = {};
  for (const n of nodes) {
    if (n.nodeType === "choice") state[n.nodeId] = null;
  }
  return state;
}

// No more apiRowToGridRow needed — we use display_row values directly
