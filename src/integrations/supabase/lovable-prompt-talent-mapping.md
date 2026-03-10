# Lovable Prompt: Fix Tree ID, Map Blizzard Nodes, Wire Choice Nodes

## CONTEXT

This app is a Survival Hunter talent optimizer. It has:
- Talent tree UI (React + Tailwind) with tabs: CLASS | SURVIVAL | SENTINEL | PACK LEADER
- Backend modules: `blizzardApiClient.ts`, `simcProfileBuilder.ts`, `simcRunner.ts`, `talentOptimizer.ts`
- Supabase edge functions for Blizzard API auth (OAuth credentials already configured)
- Blizzard API returns talent tree data with `display_row` and `display_col` per node

---

## TASK 1: FIX TREE ID (786 → 774)

In `blizzardApiClient.ts`, find every occurrence of tree ID `786` and replace with `774`.

The correct endpoint for the Hunter talent tree is:
```
GET /data/wow/talent-tree/774/playable-specialization/255
    ?namespace=static-{version}&locale=en_US
```

Constants to use everywhere:
```ts
const HUNTER_TREE_ID = 774;      // NOT 786
const SURVIVAL_SPEC_ID = 255;
const SENTINEL_HERO_ID = 42;
const PACK_LEADER_HERO_ID = 43;
```

Create a `constants/talentIds.ts` file exporting these, and import them in `blizzardApiClient.ts` and `talentOptimizer.ts` instead of hardcoding.

---

## TASK 2: MAP BLIZZARD API NODES → HTML GRID

The Blizzard API response for `/data/wow/talent-tree/774/playable-specialization/255` returns:
- `class_talent_nodes[]` — Hunter class tree nodes
- `spec_talent_nodes[]` — Survival spec tree nodes
- `hero_talent_trees[]` — array containing Sentinel (id: 42) and Pack Leader (id: 43)

Each node has:
```ts
{
  id: number,
  display_row: number,      // vertical position (higher = further down the tree)
  display_col: number,      // horizontal position (higher = further right)
  node_type: { type: "ACTIVE" | "PASSIVE" | "CHOICE" | "SELECTION" },
  ranks: [{
    rank: number,
    tooltip?: { talent: { id, name }, spell_tooltip: { spell: { id, name }, description } },
    choice_of_tooltips?: [...]  // only on CHOICE nodes — array of 2 tooltip objects
  }],
  locked_by: number[],      // node IDs that gate this
  unlocks: number[]          // node IDs this unlocks
}
```

### Mapping Algorithm

Create `utils/talentTreeMapper.ts` with this logic:

```ts
function mapNodeSection(apiNodes, section, expectedRowCounts) {
  // 1. Group nodes by display_row
  const rowMap = new Map<number, ApiNode[]>();
  for (const node of apiNodes) {
    if (!rowMap.has(node.display_row)) rowMap.set(node.display_row, []);
    rowMap.get(node.display_row).push(node);
  }

  // 2. Sort row keys ascending → these become grid rows 0, 1, 2...
  const sortedApiRows = [...rowMap.keys()].sort((a, b) => a - b);

  // 3. For each row, sort nodes by display_col ascending → grid cols 0, 1, 2...
  const mapped = [];
  sortedApiRows.forEach((apiRow, gridRowIdx) => {
    const nodesInRow = rowMap.get(apiRow).sort((a, b) => a.display_col - b.display_col);
    nodesInRow.forEach((node, gridColIdx) => {
      mapped.push({
        nodeId: node.id,
        displayRow: node.display_row,
        displayCol: node.display_col,
        gridRow: gridRowIdx,
        gridCol: gridColIdx,
        name: extractName(node),
        spellId: extractSpellId(node),
        talentId: extractTalentId(node),
        nodeType: node.node_type.type.toLowerCase(),
        maxRank: node.ranks.length,
        section,
        choiceOptions: extractChoiceOptions(node),
        lockedBy: node.locked_by ?? [],
        unlocks: node.unlocks ?? [],
      });
    });
  });

  // 4. Validate: log warning if row counts don't match expected
  const actualRowCounts = sortedApiRows.map(r => rowMap.get(r).length);
  if (JSON.stringify(actualRowCounts) !== JSON.stringify([...expectedRowCounts])) {
    console.warn(`${section} tree mismatch — API: [${actualRowCounts}], expected: [${expectedRowCounts}]`);
  }

  return mapped;
}
```

### Expected Row Counts (for validation)

Hunter class tree:   `[3, 3, 4, 3, 5, 7, 3, 7, 6, 3]` (10 rows, 44 nodes)
Survival spec tree:  `[1, 2, 2, 3, 5, 4, 6, 3, 4, 5]` (10 rows + apex capstone)
Sentinel hero tree:  `[1, 4, 4, 4, 1]` (5 rows, 14 nodes)
Pack Leader hero:    `[1, 4, 4, 4, 1]` (5 rows, 14 nodes)

### Use in React Components

Each tree React component (e.g., `ClassTalentTree.tsx`, `SpecTalentTree.tsx`) should:

1. Receive `mappedNodes: MappedTalentNode[]` as a prop
2. Group by `gridRow` and render each row as a flex container
3. Each node renders as a circle (`w-10 h-10 rounded-full`) with:
   - Border color based on state: `border-gray-600` (unselected), `border-amber-500` (selected), `border-green-500` (maxed)
   - For choice nodes: render as an **octagon or square** shape to visually distinguish
   - Tooltip on hover showing talent name, description, and rank
4. Use the existing `talentState` pattern: `Record<nodeId, currentPoints>`

```tsx
// Inside the tree component render:
{sortedRows.map((rowIdx) => (
  <div key={rowIdx} className="flex justify-center gap-2">
    {nodesByRow[rowIdx]
      .sort((a, b) => a.gridCol - b.gridCol)
      .map((node) => (
        <TalentNode
          key={node.nodeId}
          node={node}
          currentPoints={talentState[node.nodeId] ?? 0}
          choiceSelection={choiceState[node.nodeId] ?? null}
          onPointChange={(delta) => handlePointChange(node, delta)}
          onChoiceSelect={(optionIdx) => handleChoiceSelect(node.nodeId, optionIdx)}
        />
      ))}
  </div>
))}
```

---

## TASK 3: WIRE CHOICE NODES

Choice nodes have 2 mutually exclusive talent options. The Blizzard API puts both in `ranks[0].choice_of_tooltips`.

### Extract Choice Options

```ts
function extractChoiceOptions(node) {
  if (node.node_type.type !== "CHOICE") return undefined;
  const rank = node.ranks[0];
  if (!rank?.choice_of_tooltips?.length) return undefined;

  return rank.choice_of_tooltips.map(tt => ({
    talentId: tt.talent.id,
    spellId: tt.spell_tooltip.spell.id,
    name: tt.talent.name,
    description: tt.spell_tooltip.description,
  }));
}
```

### Choice Node React State

Add a separate state for choice selections alongside the points state:

```ts
// In the parent component or store:
const [choiceState, setChoiceState] = useState<Record<number, number | null>>({});
// nodeId → 0 (option A) or 1 (option B) or null (no choice)

function handleChoiceSelect(nodeId: number, optionIndex: number) {
  setChoiceState(prev => ({
    ...prev,
    [nodeId]: prev[nodeId] === optionIndex ? null : optionIndex, // toggle
  }));
  // Also set points to 1 when a choice is made
  setTalentState(prev => ({
    ...prev,
    [nodeId]: optionIndex !== null ? 1 : 0,
  }));
}
```

### Choice Node UI Component

```tsx
function ChoiceNodeWidget({ node, selection, onSelect }) {
  const [optA, optB] = node.choiceOptions;

  return (
    <div className="relative group">
      {/* Split circle: left half = option A, right half = option B */}
      <div className="w-12 h-12 rounded-lg border-2 border-gray-600 overflow-hidden
                      flex cursor-pointer hover:border-amber-400 transition-colors">
        <button
          className={`flex-1 flex items-center justify-center text-xs
            ${selection === 0 ? 'bg-amber-600/80 text-white' : 'bg-slate-800/60 text-gray-400'}
            hover:bg-amber-600/40 transition-colors`}
          onClick={() => onSelect(0)}
          title={optA.name}
        >
          A
        </button>
        <div className="w-px bg-gray-600" />
        <button
          className={`flex-1 flex items-center justify-center text-xs
            ${selection === 1 ? 'bg-amber-600/80 text-white' : 'bg-slate-800/60 text-gray-400'}
            hover:bg-amber-600/40 transition-colors`}
          onClick={() => onSelect(1)}
          title={optB.name}
        >
          B
        </button>
      </div>

      {/* Tooltip on hover */}
      <div className="absolute z-50 hidden group-hover:block bottom-full left-1/2
                      -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 border border-gray-700
                      rounded-lg shadow-xl text-xs">
        <div className={`font-semibold ${selection === 0 ? 'text-amber-400' : 'text-gray-300'}`}>
          {optA.name}
        </div>
        <p className="text-gray-400 mt-1 mb-2">{optA.description}</p>
        <div className="border-t border-gray-700 pt-2">
          <div className={`font-semibold ${selection === 1 ? 'text-amber-400' : 'text-gray-300'}`}>
            {optB.name}
          </div>
          <p className="text-gray-400 mt-1">{optB.description}</p>
        </div>
      </div>
    </div>
  );
}
```

---

## TASK 4: INTEGRATION — DATA FLOW

### On App Load / Tab Switch

```ts
// In your data fetching hook or effect:
async function loadTalentTreeData() {
  // 1. Fetch from Blizzard API via your edge function
  const response = await fetchTalentTree(HUNTER_TREE_ID, SURVIVAL_SPEC_ID);

  // 2. Map all sections
  const classNodes = mapNodeSection(response.class_talent_nodes, "class", [3,3,4,3,5,7,3,7,6,3]);
  const specNodes = mapNodeSection(response.spec_talent_nodes, "spec", [1,2,2,3,5,4,6,3,4,5]);

  const sentinelTree = response.hero_talent_trees.find(ht => ht.id === 42);
  const packLeaderTree = response.hero_talent_trees.find(ht => ht.id === 43);

  const sentinelNodes = sentinelTree
    ? mapNodeSection(sentinelTree.hero_talent_nodes, "hero", [1,4,4,4,1])
    : [];
  const packLeaderNodes = packLeaderTree
    ? mapNodeSection(packLeaderTree.hero_talent_nodes, "hero", [1,4,4,4,1])
    : [];

  // 3. Initialize state
  const classTalentState = Object.fromEntries(classNodes.map(n => [n.nodeId, 0]));
  const specTalentState = Object.fromEntries(specNodes.map(n => [n.nodeId, 0]));
  const heroTalentState = Object.fromEntries(
    [...sentinelNodes, ...packLeaderNodes].map(n => [n.nodeId, 0])
  );

  // 4. Initialize choice state
  const allChoiceNodes = [...classNodes, ...specNodes, ...sentinelNodes, ...packLeaderNodes]
    .filter(n => n.nodeType === "choice");
  const choiceState = Object.fromEntries(allChoiceNodes.map(n => [n.nodeId, null]));

  // 5. Store in app state / context
  return { classNodes, specNodes, sentinelNodes, packLeaderNodes,
           classTalentState, specTalentState, heroTalentState, choiceState };
}
```

### For SimC Profile Builder

When building the SimC profile string, the talent optimizer needs to convert the `talentState` + `choiceState` into a talent loadout string. For choice nodes, use the `talentId` of the selected option:

```ts
function buildTalentLoadout(nodes, talentState, choiceState) {
  const selectedTalents = [];

  for (const node of nodes) {
    const pts = talentState[node.nodeId] ?? 0;
    if (pts === 0) continue;

    if (node.nodeType === "choice" && node.choiceOptions) {
      const choiceIdx = choiceState[node.nodeId];
      if (choiceIdx !== null && choiceIdx !== undefined) {
        selectedTalents.push({
          nodeId: node.nodeId,
          talentId: node.choiceOptions[choiceIdx].talentId,
          spellId: node.choiceOptions[choiceIdx].spellId,
          rank: 1,
        });
      }
    } else {
      selectedTalents.push({
        nodeId: node.nodeId,
        talentId: node.talentId,
        spellId: node.spellId,
        rank: pts,
      });
    }
  }

  return selectedTalents;
}
```

---

## DO NOT CHANGE

- Color theme: surface `#1c2333`, border `#2e3a50`, gold `#d97706`, text `#f1f5f9`
- Font system: Orbitron headers, Rajdhani body, IBM Plex Mono numbers
- Simulation engine or APL logic
- Armory OAuth edge function
- The 4-tab structure: CLASS | SURVIVAL | SENTINEL | PACK LEADER

---

## SUMMARY OF FILES TO CREATE/MODIFY

| File | Action | What |
|------|--------|------|
| `constants/talentIds.ts` | **CREATE** | Export HUNTER_TREE_ID=774, SURVIVAL_SPEC_ID=255, SENTINEL_HERO_ID=42, PACK_LEADER_HERO_ID=43 |
| `utils/talentTreeMapper.ts` | **CREATE** | mapNodeSection(), extractChoiceOptions(), buildChoiceNodeMap() |
| `blizzardApiClient.ts` | **MODIFY** | Import from constants, replace hardcoded 786→774 |
| `components/TalentNode.tsx` | **MODIFY** | Add choice node rendering (split button UI) |
| `components/ClassTalentTree.tsx` | **MODIFY** | Use mappedNodes + gridRow/gridCol for layout |
| `components/SpecTalentTree.tsx` | **MODIFY** | Same as above for Survival tree |
| `components/HeroTalentTree.tsx` | **MODIFY** | Same for Sentinel/Pack Leader, handle SELECTION type |
| `hooks/useTalentTreeData.ts` | **CREATE** | Hook that fetches API data, runs mapper, initializes state |
| `talentOptimizer.ts` | **MODIFY** | Import constants, use mapped nodes for optimization logic |
| `simcProfileBuilder.ts` | **MODIFY** | Use buildTalentLoadout() with choice state for SimC strings |
