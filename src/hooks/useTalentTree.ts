import { useState, useCallback, useMemo } from 'react';
import type { TalentNodeDef, NodeState } from '@/lib/talentData';

export interface TalentTreeState {
  points: Record<string, number>;       // nodeId → current points
  choiceSelections: Record<string, 0 | 1>; // choiceNodeId → which side selected
}

export interface UseTalentTreeReturn {
  state: TalentTreeState;
  totalPoints: number;
  getNodeState: (node: TalentNodeDef) => NodeState;
  canAllocate: (node: TalentNodeDef) => boolean;
  allocatePoint: (nodeId: string) => void;
  deallocatePoint: (nodeId: string) => void;
  selectChoice: (nodeId: string, side: 0 | 1) => void;
  reset: () => void;
}

export function useTalentTree(
  nodes: TalentNodeDef[],
  maxPoints: number,
  rowGates: Record<number, number>,
  /** External gate: e.g. hero tree requires N spec points */
  externalGateMet: boolean = true,
): UseTalentTreeReturn {
  const [state, setState] = useState<TalentTreeState>({
    points: {},
    choiceSelections: {},
  });

  const nodeMap = useMemo(() => {
    const m = new Map<string, TalentNodeDef>();
    nodes.forEach(n => m.set(n.id, n));
    return m;
  }, [nodes]);

  const totalPoints = useMemo(() => {
    return Object.values(state.points).reduce((s, p) => s + p, 0);
  }, [state.points]);

  const hasParentSelected = useCallback((node: TalentNodeDef): boolean => {
    if (node.parents.length === 0) return true;
    return node.parents.some(pid => (state.points[pid] ?? 0) > 0);
  }, [state.points]);

  const getNodeState = useCallback((node: TalentNodeDef): NodeState => {
    const pts = state.points[node.id] ?? 0;
    if (pts >= node.maxPts) return 'SELECTED';
    if (pts > 0) return 'PARTIAL';

    if (!externalGateMet) return 'LOCKED';

    // Check row gate
    const requiredPts = rowGates[node.row] ?? 0;
    if (totalPoints < requiredPts) return 'LOCKED';

    // Check parent connectivity
    if (!hasParentSelected(node)) return 'LOCKED';

    return 'AVAILABLE';
  }, [state.points, totalPoints, rowGates, hasParentSelected, externalGateMet]);

  const canAllocate = useCallback((node: TalentNodeDef): boolean => {
    const nodeState = getNodeState(node);
    if (nodeState === 'LOCKED') return false;
    const pts = state.points[node.id] ?? 0;
    if (pts >= node.maxPts) return false;
    if (totalPoints >= maxPoints) return false;
    return true;
  }, [getNodeState, state.points, totalPoints, maxPoints]);

  const allocatePoint = useCallback((nodeId: string) => {
    const node = nodeMap.get(nodeId);
    if (!node) return;
    const pts = state.points[nodeId] ?? 0;
    if (pts >= node.maxPts) return;
    if (totalPoints >= maxPoints) return;

    // For choice nodes, must have a side selected first
    if (node.type === 'choice' && state.choiceSelections[nodeId] === undefined) return;

    setState(prev => ({
      ...prev,
      points: { ...prev.points, [nodeId]: pts + 1 },
    }));
  }, [nodeMap, state.points, state.choiceSelections, totalPoints, maxPoints]);

  const wouldOrphan = useCallback((nodeId: string, newPoints: Record<string, number>): string[] => {
    // Find all nodes that depend on nodeId as their ONLY selected parent
    const orphans: string[] = [];
    for (const node of nodes) {
      if (node.parents.length === 0) continue;
      const pts = newPoints[node.id] ?? 0;
      if (pts <= 0) continue;
      // Check if this node still has at least one selected parent
      const hasOtherParent = node.parents.some(pid => {
        if (pid === nodeId) return false;
        return (newPoints[pid] ?? 0) > 0;
      });
      if (!hasOtherParent && node.parents.includes(nodeId)) {
        orphans.push(node.id);
      }
    }
    return orphans;
  }, [nodes]);

  const deallocatePoint = useCallback((nodeId: string) => {
    const pts = state.points[nodeId] ?? 0;
    if (pts <= 0) return;

    // Cascade deselection
    let newPoints = { ...state.points, [nodeId]: pts - 1 };
    if (newPoints[nodeId] <= 0) {
      delete newPoints[nodeId];
      // Find and remove orphaned children
      let changed = true;
      while (changed) {
        changed = false;
        const orphans = wouldOrphan(nodeId, newPoints);
        // Also check all nodes that lost parents from cascade
        for (const node of nodes) {
          if (node.parents.length === 0) continue;
          const nodePts = newPoints[node.id] ?? 0;
          if (nodePts <= 0) continue;
          const hasAnyParent = node.parents.some(pid => (newPoints[pid] ?? 0) > 0);
          if (!hasAnyParent) {
            delete newPoints[node.id];
            changed = true;
          }
        }
        // Also check row gates
        const newTotal = Object.values(newPoints).reduce((s, p) => s + p, 0);
        for (const node of nodes) {
          const nodePts = newPoints[node.id] ?? 0;
          if (nodePts <= 0) continue;
          const requiredPts = rowGates[node.row] ?? 0;
          if (newTotal < requiredPts) {
            // Can't cascade row gates without removing too many — just remove direct deps
          }
        }
      }
    }

    let newChoices = { ...state.choiceSelections };
    // Clean up choice selections for deallocated nodes
    for (const id of Object.keys(state.points)) {
      if ((newPoints[id] ?? 0) <= 0) {
        delete newChoices[id];
      }
    }

    setState({ points: newPoints, choiceSelections: newChoices });
  }, [state, nodes, wouldOrphan, rowGates]);

  const selectChoice = useCallback((nodeId: string, side: 0 | 1 | -1) => {
    const node = nodeMap.get(nodeId);
    if (!node || node.type !== 'choice') return;
    const currentPts = state.points[nodeId] ?? 0;
    const currentSide = state.choiceSelections[nodeId];

    // -1 = explicit deselect (right-click), or toggle: clicking same side deselects
    if (side === -1 || (currentSide !== undefined && currentSide === side)) {
      setState(prev => {
        const newChoices = { ...prev.choiceSelections };
        delete newChoices[nodeId];
        const newPoints = { ...prev.points };
        delete newPoints[nodeId];
        return { points: newPoints, choiceSelections: newChoices };
      });
      return;
    }

    if (currentPts > 0 && currentSide !== undefined && currentSide !== side) {
      // Switching sides: keep the point, just change selection
      setState(prev => ({
        ...prev,
        choiceSelections: { ...prev.choiceSelections, [nodeId]: side },
      }));
      return;
    }

    // Set choice and allocate if not yet allocated
    setState(prev => {
      const newState = {
        ...prev,
        choiceSelections: { ...prev.choiceSelections, [nodeId]: side },
      };
      if (currentPts === 0 && totalPoints < maxPoints) {
        const nodeState = getNodeState(node);
        if (nodeState !== 'LOCKED') {
          newState.points = { ...prev.points, [nodeId]: 1 };
        }
      }
      return newState;
    });
  }, [nodeMap, state, totalPoints, maxPoints, getNodeState]);

  const reset = useCallback(() => {
    setState({ points: {}, choiceSelections: {} });
  }, []);

  return {
    state,
    totalPoints,
    getNodeState,
    canAllocate,
    allocatePoint,
    deallocatePoint,
    selectChoice,
    reset,
  };
}
