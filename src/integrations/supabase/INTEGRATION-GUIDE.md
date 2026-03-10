# Drop-in Integration Guide

## Files to Add

Place these files into your Lovable project at these exact paths:

```
src/
├── types/
│   └── talentTreeTypes.ts          ← Types + constants (HUNTER_TREE_ID=774, etc.)
├── utils/
│   └── talentTreeMapper.ts         ← Maps Blizzard API → grid positions
├── hooks/
│   └── useTalentTreeData.ts        ← Fetch + state management hook
├── components/
│   ├── TalentNode.tsx              ← Individual node (regular, choice, selection)
│   ├── TalentTreeGrid.tsx          ← Renders a single tree section as a grid
│   └── TalentPanel.tsx             ← Top-level tabbed panel (CLASS|SURVIVAL|SENTINEL|PACK LEADER)
```

## Wiring into Your App

### 1. Create the Blizzard API fetch function

In your existing `blizzardApiClient.ts`, add or update:

```ts
import { HUNTER_TREE_ID, SURVIVAL_SPEC_ID } from "../types/talentTreeTypes";

export async function fetchTalentTree(treeId: number, specId: number) {
  // Call your Supabase edge function that proxies to Blizzard API
  const { data, error } = await supabase.functions.invoke("blizzard-talent-tree", {
    body: { treeId, specId },
  });

  if (error) throw new Error(error.message);
  return data;
}
```

Make sure the edge function hits:
```
GET https://us.api.blizzard.com/data/wow/talent-tree/774/playable-specialization/255
    ?namespace=static-{version}&locale=en_US
```

### 2. Use TalentPanel in your page

```tsx
import TalentPanel from "./components/TalentPanel";
import { fetchTalentTree } from "./utils/blizzardApiClient";

function TalentsPage() {
  return (
    <div className="max-w-2xl mx-auto py-6">
      <TalentPanel fetchTalentTree={fetchTalentTree} />
    </div>
  );
}
```

### 3. Connect to SimC Profile Builder

The `useTalentTreeData` hook exposes `getSelectedTalents()` which returns:

```ts
interface SelectedTalent {
  nodeId: number;
  talentId: number;
  spellId: number;
  name: string;
  rank: number;
  section: "class" | "spec" | "hero";
}
```

Pass this array to your `simcProfileBuilder.ts` to generate the talent string
for simulation. For choice nodes, the correct `talentId` is already resolved
to whichever option the user picked.

### 4. Fix Tree ID Globally

Search your entire codebase for `786` and replace with `774` (Hunter tree ID).
The constants file exports `HUNTER_TREE_ID = 774` — import it everywhere instead
of hardcoding.

## What Each Component Does

| Component | Role |
|-----------|------|
| **TalentNode** | Renders one node. Regular nodes = circle with rank badge. Choice nodes = split left/right button. Selection nodes = larger hero portrait circle. Left-click adds, right-click removes. Tooltip on hover shows name, type, rank, and spell ID. |
| **TalentTreeGrid** | Takes `MappedTalentNode[]` and renders rows. Handles gate lines (e.g. "8 pts required"). Passes lock state down to nodes. Has reset button + point counter. |
| **TalentPanel** | The tabbed container. Manages which tree tab is visible. Wires the `useTalentTreeData` hook to grids. Has "Export to SimC" and "Reset All" buttons. |
| **useTalentTreeData** | The brain. Fetches from Blizzard API on mount. Runs the mapper. Initializes all state. Handles point changes, choice selections, resets. Exposes `getSelectedTalents()` for SimC. |
| **talentTreeMapper** | Pure functions. Groups API nodes by `display_row`, sorts by `display_col`, assigns grid positions. Extracts choice options. Parses restriction/gate lines. |

## Styling Notes

All components use your existing design tokens:
- Surface: `#1c2333` / `bg-[#1c2333]`
- Border: `#2e3a50` / `border-[#2e3a50]`
- Gold accent: `#d97706` / `text-amber-500`, `border-amber-500`
- Text: `#f1f5f9` / `text-slate-100`
- Fonts: `Orbitron` (headers), `Rajdhani` (body), `IBM Plex Mono` (numbers)
- Tailwind utility classes only — no custom CSS needed
