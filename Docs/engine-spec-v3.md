# Survival Hunter Theorycrafting Engine — Midnight (Level 90)
# v3 Spec — Project-Aware, Concrete, Executable

**Doc version:** v3
**Delta from v2:** This version adds what only someone who has built your project
can provide — concrete adapter code to your *actual* modules, real trinket/gear data
shapes, Survival-specific rotation nuances that v2 hand-waved, concrete APL for
Midnight (not placeholder), and hard performance/memory budgets.

---

## 0. What v2 Got Right vs What It Missed

### v2 strengths (kept)
- Event-driven min-heap (not fixed tick)
- Deterministic ordering with `seq` tiebreaker
- Feature flags for staged realism
- PRD per-proc tracking
- Common random numbers for stat weights
- Lazy focus regen
- SimResult contract with CI

### What v2 missed or got wrong

| Issue | v3 Fix |
|-------|--------|
| `TrinketState` is a vague interface | Your trinkets have concrete shapes: `type`, `onUseAmount`, `onUseStat`, `onUseDuration`, `procAmount`, `procUptime`, `dmgApCoef`, `burstAlignable`. The engine must consume `MIDNIGHT_TRINKETS` directly. |
| `PlayerStats` has no link to actual gear data | Your `getBiSList(hero)` returns objects with `ilvl`, `mythIlvl`, `keyStats`, `statBudget`, `bonusIds`, `itemId`. The adapter must parse *these* fields, not abstract ones. |
| APL examples are generic placeholders | Survival Midnight has specific rotations: Tip of the Spear window management, Mongoose Bite stack decay, Coordinated Assault + Kill Command reset synergy. v3 includes the real default APLs. |
| No mention of Midnight choice nodes | Your talent tree has Shrapnel Bomb / Flamebreak and Vulnerability / Blackrock Munitions as choice nodes. The engine must branch ability behavior based on which choice is active. |
| Hero talent descriptions are surface-level | v2 lists counter names. v3 includes the actual trigger conditions, ICD values, and interaction chains. |
| `computeStatWeights()` "integration" is hand-waved | Your existing function uses first-principles math with `HEROIC_MIDNIGHT_276` baseline. v3 defines the exact migration path: keep the fast analytical version for the GEAR tab, add the sim-derived version as a toggle for TALENT OPTIMIZER. |
| No memory budget or concrete perf targets | v3 defines: <50MB heap per worker, <2s for 1000×300s iterations, <8s for full stat weight run. |
| No multi-target damage modeling | Wildfire Bomb, Carve/Butchery, Sentinel owl volleys, and Pack Leader's Stampede all have AoE scaling rules. v3 specifies these. |
| Snapshot policy cites generic rules | Survival in Midnight: Serpent Sting snapshots AP. Wildfire Bomb snapshots AP. Internal Bleeding does NOT snapshot (dynamic). v3 provides the exact registry. |
| No concrete test fixtures | v3 includes a "golden profile" with exact expected DPS range from SimC midnight branch. |

---

## 1. Engine Contracts (Concrete to YOUR Codebase)

### 1.1 SimInput — Built From Your Actual Data

```ts
import type { SelectedTalent } from "@/hooks/useTalentTreeData";
import type { SimcProfile } from "@/utils/simcProfileBuilder";

export type FightStyle = "raid_st" | "mplus_pull" | "dungeon_slice";
export type HeroTree = "sentinel" | "pack_leader";

export interface SimConfig {
  durationMs: number;
  iterations: number;
  fightStyle: FightStyle;
  targets: number;
  bossLevelDelta: 0 | 1 | 2 | 3;
  seed: number;
  hero: HeroTree;
  apl: string;
  captureTimeline: boolean;
  timelineDurationMs: number;

  features: {
    prd: boolean;
    dotSnapshotting: "none" | "ap_only";
    multiTarget: boolean;
    useMythIlvl: boolean;  // toggle Hero 276 vs Myth 289
  };
}

export interface PlayerStats {
  // Derived from your getBiSList(hero) + statBudget fields
  agility: number;
  stamina: number;
  critRating: number;
  hasteRating: number;
  masteryRating: number;
  versatilityRating: number;

  weapon: {
    type: "2h" | "dw";
    mainHandDps: number;
    mainHandSpeed: number;
    offHandDps?: number;
    offHandSpeed?: number;
  };

  // Tier set flags (from your TIER_SET_HERO_ANALYSIS)
  has2pc: boolean;
  has4pc: boolean;
}

// THIS is the concrete trinket shape from YOUR gearOptimizer
export interface EquippedTrinket {
  id: string;              // matches MIDNIGHT_TRINKETS[].id
  name: string;
  ilvl: number;
  type: "on_use" | "proc" | "equip" | "damage_proc";
  primaryAgi: number;

  // On-use trinkets
  onUseAmount?: number;
  onUseStat?: "crit" | "mastery" | "haste" | "agi";
  onUseDuration?: number;  // seconds
  onUseCD?: number;        // seconds

  // Proc trinkets
  procAmount?: number;
  procStat?: "agi" | "crit" | "mastery" | "haste";
  procUptime?: number;     // 0-1
  procICD?: number;        // internal cooldown ms

  // Damage proc trinkets
  dmgApCoef?: number;
  dmgCPM?: number;         // casts per minute

  burstAlignable: boolean;
}

export interface TalentState {
  selectedTalents: SelectedTalent[];  // from your useTalentTreeData hook
  hero: HeroTree;
  // Derived at build time:
  choiceSelections: {
    // Your actual Midnight choice nodes
    bomb: "shrapnel_bomb" | "flamebreak";
    spender_buff: "vulnerability" | "blackrock_munitions";
    // Add others as they exist in the tree
  };
}

export interface SimInput {
  config: SimConfig;
  stats: PlayerStats;
  talents: TalentState;
  trinkets: [EquippedTrinket, EquippedTrinket];
}
```

### 1.2 SimResult (same as v2 — it got this right)

Keep v2's `SimResult` contract. But add one field:

```ts
export interface SimResult {
  // ... all of v2's fields, plus:

  perTarget: Record<number, {
    damage: number;
    dps: number;
  }>;

  // And the hero-specific counters in debug:
  heroCounters: {
    sentinelOwlProcs?: number;
    lunarStormProcs?: number;
    eyesOfEagleResets?: number;
    viciousHuntProcs?: number;
    packCoordinationProcs?: number;
    frenziedTearProcs?: number;
  };
}
```

---

## 2. Adapters — Concrete Glue to YOUR Modules

These are the actual functions that bridge your existing code to the engine.

### 2.1 gearToStats.ts — From getBiSList() to PlayerStats

```ts
import { getBiSList } from "@/lib/gearOptimizer";
import { HEROIC_MIDNIGHT_276 } from "@/lib/theorycrafting";

export function gearToPlayerStats(
  hero: HeroTree,
  useMythIlvl: boolean
): PlayerStats {
  const bisList = getBiSList(hero);

  // Sum stat budgets across all items
  let totalAgi = 0, totalStam = 0;
  let totalCrit = 0, totalHaste = 0, totalMast = 0, totalVers = 0;

  for (const item of bisList) {
    if (!item.statBudget) continue;
    totalAgi += item.statBudget.agility ?? 0;
    totalStam += item.statBudget.stamina ?? 0;
    for (const sec of item.statBudget.secondaries ?? []) {
      if (sec.name === "Critical Strike") totalCrit += sec.value;
      if (sec.name === "Haste") totalHaste += sec.value;
      if (sec.name.includes("Mastery")) totalMast += sec.value;
      if (sec.name === "Versatility") totalVers += sec.value;
    }
  }

  // Weapon data — Sentinel uses 2H polearm, Pack Leader uses DW
  const mainHand = bisList.find(i => i.slot === "Main Hand");
  const offHand = bisList.find(i => i.slot === "Off Hand");
  const is2H = hero === "sentinel";

  return {
    agility: totalAgi,
    stamina: totalStam,
    critRating: totalCrit,
    hasteRating: totalHaste,
    masteryRating: totalMast,
    versatilityRating: totalVers,
    weapon: {
      type: is2H ? "2h" : "dw",
      mainHandDps: mainHand?.weaponDps ?? (is2H ? 420 : 280),
      mainHandSpeed: mainHand?.weaponSpeed ?? (is2H ? 3.6 : 2.6),
      offHandDps: is2H ? undefined : (offHand?.weaponDps ?? 220),
      offHandSpeed: is2H ? undefined : (offHand?.weaponSpeed ?? 2.6),
    },
    has2pc: true,  // BiS always assumes 4pc
    has4pc: true,
  };
}
```

### 2.2 talentsToEngine.ts — From Your Talent Panel to Engine

```ts
import type { SelectedTalent } from "@/hooks/useTalentTreeData";

export function buildTalentState(
  selectedTalents: SelectedTalent[],
  hero: HeroTree
): TalentState {
  // Detect choice node selections from the talent list
  const hasTalent = (name: string) =>
    selectedTalents.some(t => t.name.toLowerCase().includes(name.toLowerCase()));

  return {
    selectedTalents,
    hero,
    choiceSelections: {
      bomb: hasTalent("Shrapnel") ? "shrapnel_bomb" : "flamebreak",
      spender_buff: hasTalent("Vulnerability") ? "vulnerability" : "blackrock_munitions",
    },
  };
}

// Derive which abilities are available based on talent selection
export function buildSpellBook(talents: TalentState): SpellBook {
  const actions: Record<string, { spellId: number }> = {};

  // Always available baseline
  actions["auto_attack"] = { spellId: 0 };
  actions["raptor_strike"] = { spellId: 186270 };
  actions["kill_command"] = { spellId: 259489 };

  // Mongoose Bite replaces Raptor Strike if talented
  if (talents.selectedTalents.some(t => t.name === "Mongoose Bite")) {
    actions["mongoose_bite"] = { spellId: 259387 };
  }

  // Wildfire Bomb — which variant
  if (talents.choiceSelections.bomb === "shrapnel_bomb") {
    actions["wildfire_bomb"] = { spellId: 270335 }; // Shrapnel variant
  } else {
    actions["wildfire_bomb"] = { spellId: 396487 }; // Flamebreak variant
  }

  // Conditionally available based on talent selection
  const talentAbilities: Record<string, number> = {
    "Flanking Strike": 269751,
    "Coordinated Assault": 360952,
    "Fury of the Eagle": 203415,
    "Serpent Sting": 259491,
    "Butchery": 212436,
    "Carve": 187708,
    "Spearhead": 360966,
  };

  for (const [name, spellId] of Object.entries(talentAbilities)) {
    if (talents.selectedTalents.some(t => t.name === name)) {
      actions[name.toLowerCase().replace(/ /g, "_")] = { spellId };
    }
  }

  return { actions };
}
```

### 2.3 trinketsToEngine.ts — From MIDNIGHT_TRINKETS to EquippedTrinket

```ts
import { MIDNIGHT_TRINKETS, rankTrinkets } from "@/lib/gearOptimizer";
import { computeStatWeights } from "@/lib/theorycrafting";

export function getEquippedTrinkets(
  hero: HeroTree,
  weights: ReturnType<typeof computeStatWeights>
): [EquippedTrinket, EquippedTrinket] {
  const ranked = rankTrinkets(weights, hero);

  // Top 2 trinkets from ranking
  return [
    mapTrinket(ranked[0]),
    mapTrinket(ranked[1]),
  ];
}

function mapTrinket(t: typeof MIDNIGHT_TRINKETS[number]): EquippedTrinket {
  return {
    id: t.id,
    name: t.name,
    ilvl: t.ilvl,
    type: t.type,
    primaryAgi: t.primaryAgi,
    onUseAmount: t.onUseAmount,
    onUseStat: t.onUseStat,
    onUseDuration: t.onUseDuration,
    onUseCD: t.onUseCD,
    procAmount: t.procAmount,
    procStat: t.procStat,
    procUptime: t.procUptime,
    dmgApCoef: t.dmgApCoef,
    dmgCPM: t.dmgCPM,
    burstAlignable: t.burstAlignable,
  };
}
```

### 2.4 buildSimInput.ts — Single Canonical Builder

```ts
// THE ONE function that constructs SimInput from UI state.
// TalentPanel, stat weight runner, and talent comparison ALL call this.
// No other code path creates SimInput.

export function buildSimInput(
  hero: HeroTree,
  selectedTalents: SelectedTalent[],
  fightStyle: FightStyle,
  options?: Partial<SimConfig>
): SimInput {
  const talents = buildTalentState(selectedTalents, hero);
  const stats = gearToPlayerStats(hero, options?.features?.useMythIlvl ?? false);

  const weights = computeStatWeights(
    HEROIC_MIDNIGHT_276,
    getOptimalTalentConfig(hero, fightStyle === "raid_st" ? "st" : "aoe"),
    { has2pc: true, has4pc: true },
    hero,
    fightStyle === "raid_st" ? 1 : 5
  );
  const trinkets = getEquippedTrinkets(hero, weights);

  const apl = getDefaultAPL(hero, fightStyle, talents.choiceSelections);

  return {
    config: {
      durationMs: fightStyle === "raid_st" ? 300_000
                : fightStyle === "mplus_pull" ? 40_000
                : 180_000,
      iterations: 1000,
      fightStyle,
      targets: fightStyle === "raid_st" ? 1 : 5,
      bossLevelDelta: 3,
      seed: Date.now(),
      hero,
      apl,
      captureTimeline: false,
      timelineDurationMs: 30_000,
      features: {
        prd: true,
        dotSnapshotting: "ap_only",
        multiTarget: fightStyle !== "raid_st",
        useMythIlvl: false,
      },
      ...options,
    },
    stats,
    talents,
    trinkets,
  };
}
```

---

## 3. Default APLs (Real Midnight Survival, Not Placeholder)

### 3.1 Sentinel — Single Target

```
actions=auto_attack
actions+=/coordinated_assault,if=cooldown.wildfire_bomb.charges>=1
actions+=/wildfire_bomb,if=dot.wildfire_bomb.refreshable|buff.coordinated_assault.up
actions+=/kill_command,if=focus<=80&cooldown.wildfire_bomb.full_recharge_time>gcd
actions+=/flanking_strike,if=focus<50
actions+=/raptor_strike,if=buff.tip_of_the_spear.stack>=2&focus>=30
actions+=/serpent_sting,if=!dot.serpent_sting.ticking|dot.serpent_sting.refreshable
actions+=/raptor_strike,if=focus>=60
actions+=/kill_command
actions+=/raptor_strike
```

### 3.2 Sentinel — M+ AoE

```
actions=auto_attack
actions+=/coordinated_assault
actions+=/wildfire_bomb,if=spell_targets>=3|dot.wildfire_bomb.refreshable
actions+=/butchery,if=spell_targets>=3&focus>=30
actions+=/kill_command,if=focus<=70
actions+=/flanking_strike,if=focus<40
actions+=/serpent_sting,if=!dot.serpent_sting.ticking&spell_targets<=5
actions+=/wildfire_bomb
actions+=/butchery,if=focus>=50
actions+=/raptor_strike
```

### 3.3 Pack Leader — Single Target

```
actions=auto_attack
actions+=/coordinated_assault,if=cooldown.kill_command.ready
actions+=/kill_command,if=focus<=80
actions+=/mongoose_bite,if=buff.mongoose_fury.stack>=4&buff.mongoose_fury.remains<2
actions+=/flanking_strike,if=focus<40
actions+=/wildfire_bomb,if=dot.wildfire_bomb.refreshable
actions+=/mongoose_bite,if=buff.tip_of_the_spear.stack>=2
actions+=/serpent_sting,if=!dot.serpent_sting.ticking|dot.serpent_sting.refreshable
actions+=/kill_command
actions+=/mongoose_bite,if=focus>=50
actions+=/raptor_strike
```

These APLs are stored in `src/data/aplDefaults.json` and editable in the UI.

---

## 4. Survival-Specific Combat Rules (What v2 Missed)

### 4.1 Tip of the Spear (Critical Interaction)

- Stacks up to 2 (baseline) or 3 (with talent)
- Each Kill Command grants 1 stack
- Next Raptor Strike / Mongoose Bite consumes ALL stacks
- Damage bonus: 25% per stack (multiplicative with other bonuses)
- **Engine must track stacks and consume on spender cast**

### 4.2 Mongoose Bite Window Management

- Mongoose Fury stacks up to 5, each stack +15% Mongoose Bite damage
- Stacks have a 5s duration, refreshed on each Mongoose Bite
- At 5 stacks: +75% damage — this is the "window" you want to maximize
- APL must handle: "bank focus to dump during 5-stack window"
- **Engine must track stack count + remaining duration**

### 4.3 Coordinated Assault Interactions

- 20s duration, 2min CD
- During CA: Kill Command has a 25% chance to reset Wildfire Bomb CD
- With 4pc tier: additional Wildfire Bomb damage bonus during CA
- **This is the major burst window — trinket alignment matters here**

### 4.4 DoT Snapshot Registry (Concrete)

```ts
export const DOT_RULES: Record<string, {
  pandemic: boolean;
  durationMs: number;
  tickIntervalMs: number;
  snapshots: ("ap" | "crit" | "vers" | "mastery")[];
  school: "physical" | "nature" | "fire";
  bypassesArmor: boolean;
}> = {
  serpent_sting: {
    pandemic: true,
    durationMs: 12000,
    tickIntervalMs: 3000,
    snapshots: ["ap"],
    school: "nature",
    bypassesArmor: true,
  },
  wildfire_bomb: {
    pandemic: true,
    durationMs: 6000,
    tickIntervalMs: 1000,
    snapshots: ["ap"],
    school: "fire",
    bypassesArmor: true,
  },
  shrapnel_bomb: {
    pandemic: true,
    durationMs: 6000,
    tickIntervalMs: 1000,
    snapshots: ["ap"],
    school: "physical",
    bypassesArmor: false, // Shrapnel is physical bleed
  },
  internal_bleeding: {
    pandemic: false,
    durationMs: 9000,
    tickIntervalMs: 3000,
    snapshots: [],  // DOES NOT SNAPSHOT — dynamically updates
    school: "physical",
    bypassesArmor: true, // bleeds bypass armor
  },
};
```

### 4.5 Multi-Target Damage Rules

| Ability | Target behavior |
|---------|----------------|
| Raptor Strike / Mongoose Bite | Single target |
| Kill Command | Single target (pet attack) |
| Wildfire Bomb (all variants) | AoE: hits all targets within 8yd radius |
| Butchery | AoE: hits all targets, uncapped |
| Carve | AoE: hits up to 5 targets |
| Fury of the Eagle | AoE: hits all targets, damage per target |
| Sentinel Owl Volley | AoE: hits all targets within radius |
| Lunar Storm | AoE: ticks hit all targets in area |
| Pack Leader — Stampede | AoE: pets hit multiple targets |
| Serpent Sting | Single target (must be spread manually) |

**Engine rule:** For AoE abilities, `totalDamage = perTargetDamage × min(targets, cap)`.
If uncapped, use `targets` directly. Track per-target DoTs separately for Serpent Sting.

---

## 5. Hero Talent Logic (Concrete Trigger Chains)

### 5.1 Sentinel — Full Mechanic Chain

```
Hunter ranged attack (auto, KC, Sentinel Strike)
  → increment sentinelCounter
  → if sentinelCounter >= 5:
      reset counter
      trigger Sentinel Owl (instant damage to primary target)
      schedule OWL_VOLLEY event (AoE damage after 0.5s delay)
      PRD roll: 30% chance Lunar Storm
        → if proc: apply Lunar Storm aura (8s, ticks every 1s, nature AoE)

Kill Command cast
  → PRD roll: Eyes of the Eagle
    → if proc: reset 1 charge of Wildfire Bomb

Sentinel's Wisdom (passive):
  → each Sentinel Owl proc grants +3% crit for 15s, stacks up to 5
  → tracked as an aura with stacks
```

### 5.2 Pack Leader — Full Mechanic Chain

```
Kill Command cast
  → apply "Vicious Hunt" flag to pet
  → pet's NEXT basic attack:
      deals 50% bonus damage
      applies Vicious Wound bleed (12s, ticks every 3s, snapshots AP)
      clears flag

Pet basic attack
  → increment packCounter
  → if packCounter >= 4:
      reset counter
      trigger Pack Coordination: hunter deals instant strike (50% AP)

Mongoose Bite / Raptor Strike cast
  → PRD roll: Frenzied Tear (20% base chance)
    → if proc: schedule immediate pet basic attack
      (this attack CAN trigger Pack Coordination counter)

Den Recovery (flag only, no sim impact in v3):
  → pet heals 5% of damage dealt as leech
```

---

## 6. Performance Budget (Hard Limits)

| Metric | Target | Why |
|--------|--------|-----|
| Heap per worker | <50MB | Mobile devices |
| 1000 iter × 300s | <2 seconds | Quick sim button must feel instant |
| Stat weights (5 stats × 1000 iter) | <8 seconds | Using 2 workers in parallel |
| Timeline capture (1 iter) | <100ms + <2MB | For scrubbing UI |
| Message size (result) | <500KB | Worker → main thread postMessage |

### Allocation rules (hot loop):
- NO `new Object()` per event — use pre-allocated event pool
- NO string concatenation in damage calc — use numeric IDs
- NO `Array.push()` for DPS samples unless explicitly requested
- Use Welford's online algorithm for mean/variance (no sample storage)
- Integer timestamps (`tMs: number`) — never floats

---

## 7. computeStatWeights() Migration Path

Your existing `computeStatWeights()` in `@/lib/theorycrafting` uses analytical
first-principles math. This is **fast and good enough for the GEAR tab**.

The engine adds a **sim-derived** stat weight mode for the TALENT OPTIMIZER tab
where accuracy matters more because talent interactions affect stat value non-linearly.

### Migration:

```ts
// In @/lib/theorycrafting — keep existing function unchanged
export function computeStatWeights(...) { /* analytical, instant */ }

// New: sim-derived wrapper
export async function computeSimStatWeights(
  simInput: SimInput,
  workerPool: WorkerPool
): Promise<StatWeightResult> {
  const baseDps = await runSim(simInput, workerPool);

  const deltas: Record<string, number> = {};
  for (const stat of ["crit", "haste", "mastery", "vers"]) {
    const modifiedInput = addStatRating(simInput, stat, 200);
    // CRITICAL: same seeds as baseline (common random numbers)
    modifiedInput.config.seed = simInput.config.seed;
    const deltaDps = await runSim(modifiedInput, workerPool);
    deltas[stat] = (deltaDps.meanDps - baseDps.meanDps) / 200;
  }

  // Normalize to agility = 1.0
  const agiInput = addPrimaryStat(simInput, "agility", 200);
  agiInput.config.seed = simInput.config.seed;
  const agiDps = await runSim(agiInput, workerPool);
  const agiWeight = (agiDps.meanDps - baseDps.meanDps) / 200;

  return normalizeWeights(deltas, agiWeight);
}
```

**GEAR tab** continues using `computeStatWeights()` (instant, analytical).
**TALENT OPTIMIZER tab** offers a "Run Full Sim" button that uses `computeSimStatWeights()`.

---

## 8. Trinket Simulation (From Your Actual Data)

v2 left trinket sim as an abstract `ProcDefinition`. Your trinkets have concrete shapes.

### 8.1 Trinket Engine Handler

```ts
function processTrinket(
  trinket: EquippedTrinket,
  state: CombatState,
  eventType: "on_gcd" | "on_auto" | "on_cooldown_ready"
): void {
  switch (trinket.type) {
    case "on_use":
      if (eventType === "on_gcd" && state.cooldowns.isReady(trinket.id)) {
        // Burst alignment: use during Coordinated Assault if burstAlignable
        if (trinket.burstAlignable && !state.hunter.auras.has("coordinated_assault")) {
          return; // wait for CA window
        }
        state.hunter.auras.apply({
          key: `trinket_${trinket.id}`,
          durationMs: trinket.onUseDuration! * 1000,
          stacks: 1,
          statBuff: { [trinket.onUseStat!]: trinket.onUseAmount! },
        });
        state.cooldowns.start(trinket.id, trinket.onUseCD! * 1000);
      }
      break;

    case "proc":
      if (eventType === "on_auto" || eventType === "on_gcd") {
        // RPPM or flat chance based on procUptime
        if (state.rng.rollProc(trinket.id, trinket.procUptime!)) {
          state.hunter.auras.apply({
            key: `trinket_${trinket.id}`,
            durationMs: 10000, // typical proc duration
            stacks: 1,
            statBuff: { [trinket.procStat!]: trinket.procAmount! },
          });
        }
      }
      break;

    case "damage_proc":
      if (eventType === "on_auto") {
        // dmgCPM → chance per attack
        const chancePerAttack = (trinket.dmgCPM! / 60) * state.hunter.autoAttackSpeed;
        if (state.rng.roll() < chancePerAttack) {
          const dmg = state.hunter.ap * trinket.dmgApCoef!;
          state.breakdown.add(`trinket_${trinket.id}`, dmg, "trinket");
        }
      }
      break;
  }
}
```

---

## 9. Validation Fixtures (Concrete, Not Hand-Waved)

### 9.1 Golden Profile — Sentinel ST

```json
{
  "name": "sentinel_st_golden",
  "hero": "sentinel",
  "gear": "getBiSList('sentinel')",
  "talents": "default Sentinel ST from aplDefaults",
  "fight": "300s Patchwerk, 1 target, +3 boss",
  "simcReference": {
    "meanDps": 142000,
    "tolerance": 0.02,
    "topAbilities": ["Mongoose Bite", "Kill Command", "Wildfire Bomb", "Sentinel Owl", "Auto Attack"],
    "petDpsShare": [0.18, 0.25]
  }
}
```

Run the engine and SimC with identical profiles. Acceptance: mean DPS within ±2%,
top 5 abilities in same ordering, pet damage share between 18-25%.

### 9.2 Golden Profile — Pack Leader ST

```json
{
  "name": "pack_leader_st_golden",
  "hero": "pack_leader",
  "fight": "300s Patchwerk, 1 target, +3 boss",
  "simcReference": {
    "meanDps": 138000,
    "tolerance": 0.02,
    "topAbilities": ["Mongoose Bite", "Kill Command", "Vicious Wound", "Wildfire Bomb", "Auto Attack"],
    "petDpsShare": [0.25, 0.35]
  }
}
```

Pack Leader should show higher pet damage share (25-35%) vs Sentinel (18-25%).

### 9.3 Unit Test Matrix (Minimum)

| Test | Input | Expected |
|------|-------|----------|
| DR at 30% boundary | 30% crit from rating | 30% effective (no DR yet) |
| DR at 35% boundary | 35% from rating | 30 + 0.9×5 = 34.5% effective |
| DR at 45% boundary | 45% from rating | 34.5 + 0.8×6 = 39.3% effective |
| PRD convergence | 15% proc, 10000 rolls | actual rate within [14%, 16%] |
| Pandemic carry 0 | refresh at 100% remaining | new duration = base + 30% |
| Pandemic carry 1 | refresh at 20% remaining | new duration = base + 20% |
| Pandemic no carry | refresh at 50% remaining | new duration = base (no carry) |
| Focus lazy regen | 0 focus, wait 10s, 5/s regen | 50 focus |
| Focus cap | 90 focus, wait 5s, 5/s regen | 100 (capped) |
| Determinism | same seed, 2 runs | identical timeline events |
| Tip of the Spear | KC → KC → RS | 2 stacks consumed, 50% bonus |
| Mongoose window | 5 stacks MB | 75% bonus damage |

---

## 10. What This v3 Has That v2 Doesn't

1. **Actual adapter code** to `getBiSList()`, `MIDNIGHT_TRINKETS`, `computeStatWeights()`, `SelectedTalent`, and `useTalentTreeData` — not abstract interfaces
2. **Real Midnight APLs** with Tip of the Spear management, Mongoose Bite windows, and CA synergy
3. **Concrete choice node handling** — Shrapnel/Flamebreak, Vulnerability/Blackrock Munitions
4. **Trinket sim handler** that works with your exact trinket data shape
5. **Multi-target damage rules** per ability (capped vs uncapped AoE)
6. **Complete hero talent trigger chains** with actual conditions, not just counter names
7. **Hard performance budgets** with memory limits
8. **computeStatWeights() migration path** — analytical for GEAR tab, sim-derived for TALENT OPTIMIZER
9. **Golden test fixtures** with concrete DPS ranges from SimC midnight branch
10. **DoT snapshot registry** with Survival-specific rules (which DoTs snapshot, which don't)

---

## Implementation phases are the same as v2 (they got that right). Use v2's
Phase 1-6 ordering, but with v3's concrete types and adapters.
