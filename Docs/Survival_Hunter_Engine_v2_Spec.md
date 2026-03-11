# Survival Hunter Theorycrafting Engine — Midnight (Level 90) — v2 Spec (Executable)

**Doc version:** v2
**Purpose:** A deterministic, web-based simulation engine for a Level 90 Survival Hunter in the Midnight expansion, integrated into the existing React + Supabase + theorycrafting modules.

---

## 0. Goals, Non-Goals, and Existing Systems

### 0.1 Goals

* Produce **reliable mean DPS** and **breakdowns** for Survival Hunter (Hero: Sentinel or Pack Leader).
* Support:
  * **Raid ST** (300s), **M+ pull** (40s), **Dungeon slice** (180s).
  * **N iterations** (1k default; 10k for weights).
* Provide:
  * **DPS breakdown chart**
  * **Opener timeline** (first 30s)
  * **Stat weights (delta method + confidence intervals)**
  * **Talent comparisons** (including Sentinel vs Pack Leader)
* Ensure:
  * **Determinism** (seeded, stable event ordering)
  * **Performance** (Web Worker, minimal allocations, no fixed tick loop)
  * **Integration** (extend existing modules; no rewrites)

### 0.2 Non-goals (v2)

* Full raid encounter scripting (movement, mechanics, target swapping) beyond basic knobs.
* Full survivability model (leech, healing, DR from externals) except as placeholders/flags.
* Perfect, patch-to-patch parity with in-game combat logs on day one (we validate vs SimC within tolerance).

### 0.3 Existing Project Systems (must be extended, not replaced)

Already available:

* React + Tailwind UI (Lovable, GitHub-backed)
* Talent tree UI (3-column: CLASS | HERO toggle | SURVIVAL) with icons
* Blizzard API integration via Supabase edge functions (OAuth configured)
* Gear Optimizer with `getBiSList(hero)`, trinket/enchant/gem rankings
* SimC profile export (talents + BIS gear → SimC string)
* `@/lib/theorycrafting` with `computeStatWeights()` and `HEROIC_MIDNIGHT_276`
* `@/lib/gearOptimizer` with full BiS data, trinket DPS calcs, enchant ranking

---

## 1. Engine Contracts (Inputs/Outputs) — Required for Integration

### 1.1 Canonical Types

```ts
export type FightStyle = "raid_st" | "mplus_pull" | "dungeon_slice";
export type HeroTree = "sentinel" | "pack_leader";
export type PlayerSkill = "ideal" | "average"; // future use, default "ideal"

export interface SimConfig {
  durationMs: number;         // e.g. 300_000
  iterations: number;         // e.g. 1000
  fightStyle: FightStyle;

  targets: number;            // 1, 2, 5...
  targetHp?: number;          // optional: for time-to-die model
  targetArmor?: number;       // explicit target armor value (NOT K)
  bossLevelDelta?: 0 | 1 | 2 | 3; // +3 boss default

  latencyMs?: number;         // optional queue/latency approximation
  playerSkill?: PlayerSkill;  // default "ideal"

  seed: number;               // base seed (deterministic replay)
  hero: HeroTree;

  apl: string;                // raw APL text
  captureTimeline?: boolean;  // if true, capture first 30s of a chosen iteration
  timelineDurationMs?: number; // default 30_000
  captureDpsSamples?: boolean; // for UI histograms; default false to save memory

  // Feature flags to stage realism without rewrites
  features?: {
    prd?: boolean;                      // default true
    dotSnapshotting?: "none" | "ap_only" | "full"; // default "ap_only" (v2 baseline)
    latencyModel?: boolean;             // default false
    multiTarget?: boolean;              // default false (v2 baseline: 1 target)
    drAppliesToTotalPercent?: boolean;  // default true (see §4)
    debugLogEvents?: boolean;           // default false
  };
}

export interface PlayerStats {
  agility: number;
  attackPower: number; // derived (but can be supplied)
  critRating: number;
  hasteRating: number;
  masteryRating: number;
  versatilityRating: number;

  weapon: {
    type: "2h" | "dw";
    mainHandDps: number;
    offHandDps?: number;
    mainHandSpeed: number;
    offHandSpeed?: number;
  };
}

export interface TalentState {
  // whatever your talent panel stores, but normalized:
  enabledTalents: Record<string, boolean>;
  talentRanks?: Record<string, number>;
  hero: HeroTree;
}

export interface SpellBook {
  // resolved spell availability + ids + ranks from talents/hero
  // maps APL action names to spell ids and handlers
  actions: Record<string, { spellId: number; actionId: string }>;
}

export interface TrinketState {
  // from existing gearOptimizer / BiS data
  // must include proc definitions, ICDs, stat procs, damage procs, etc.
  equipped: Array<{ itemId: number; name: string; procId?: string }>;
  procTable: Record<string, ProcDefinition>;
}

export interface SimInput {
  config: SimConfig;
  stats: PlayerStats;
  talents: TalentState;
  spellBook: SpellBook;
  trinkets: TrinketState;
}
```

### 1.2 Result Object (UI + Debug + CI)

```ts
export interface SimResult {
  meanDps: number;
  meanDamage: number;
  iterations: number;

  stdevDps: number;
  stderrDps: number;
  ci95: [number, number]; // normal approx is ok for 1k+, else use t-dist later

  breakdown: Record<string, {
    damage: number;
    hits: number;
    crits: number;
    source: "hunter_direct" | "hunter_dot" | "pet_melee" | "pet_special" | "trinket" | "hero_proc";
  }>;

  dpsSamples?: number[]; // optional, only if config.captureDpsSamples

  timeline?: TimelineEvent[]; // optional, only if captureTimeline
  debug?: DebugInfo;          // optional
}

export interface TimelineEvent {
  tMs: number;
  lane: "gcd" | "cooldowns" | "focus" | "buffs" | "dots";
  label: string;
  value?: number; // e.g. focus level
  meta?: Record<string, any>;
}

export interface DebugInfo {
  baseSeed: number;
  displayIterationSeed?: number;
  aplHash: string;
  hero: HeroTree;

  counters: {
    sentinelRangedCounter?: number;
    packPetCounter?: number;
  };

  // minimal deterministic replay packet:
  replay: {
    iterationIndex: number;
    iterationSeed: number;
    config: SimConfig;
    stats: PlayerStats;
    talents: TalentState;
    apl: string;
  };

  // optionally include a small event log excerpt for diagnosis
  eventLog?: Array<{ tMs: number; type: string; note?: string }>;
}
```

**Contract rule:** UI, worker, stat weights, talent comparison, and SimC export all must share the same `SimInput` construction path to avoid "UI shows X, sim runs Y."

---

## 2. Core Simulation Architecture (Event-Driven, Deterministic)

### 2.1 Event Queue (Min-Heap)

Use an event-driven priority queue (min-heap). **No fixed 10ms tick loops.**

```ts
export type EventType =
  | "CAST_START"
  | "CAST_COMPLETE"
  | "GCD_READY"
  | "AUTO_ATTACK"
  | "PET_ATTACK"
  | "DOT_TICK"
  | "AURA_EXPIRE"
  | "PROC_ROLL"
  | "COOLDOWN_READY"
  | "INTERNAL"; // engine housekeeping

export interface SimEvent {
  tMs: number;           // integer ms
  priority: number;      // tie-breaker
  seq: number;           // strict ordering (monotonic) to guarantee stability
  type: EventType;
  payload?: any;
}
```

### 2.2 Deterministic Ordering at Identical Timestamps

When multiple events have the same `tMs`, process them in this exact order (lowest `priority` first):

1. `AURA_EXPIRE`
2. `DOT_TICK`
3. `CAST_COMPLETE`
4. `COOLDOWN_READY`
5. `GCD_READY`
6. `PROC_ROLL`
7. `AUTO_ATTACK`
8. `PET_ATTACK`
9. `CAST_START` (if scheduled as a discrete event)

**Rule:** For stable ordering within the same priority and time, use `seq` (monotonic increment on enqueue). This prevents nondeterminism across browsers.

### 2.3 Engine Invariants (Required)

* `nowMs` only moves forward (never decreases).
* All state mutations occur inside event handlers.
* No handler may enqueue an event where `event.tMs < nowMs`.
* Abilities may only be executed at defined points (`GCD_READY`, `CAST_COMPLETE`, etc.).
* Randomness must come only from the engine RNG (seeded), never `Math.random()`.

---

## 3. RNG + PRD Model (Per-Proc, Seeded, Reproducible)

### 3.1 Seeded RNG

Use a deterministic generator (e.g., xoshiro256++).

* `baseSeed` from `SimConfig.seed`
* `iterationSeed = hash64(baseSeed, iterationIndex)`
  Store `iterationSeed` in `DebugInfo` for deterministic replay.

### 3.2 PRD (Pseudo-Random Distribution) — Per Proc Source

PRD state must be tracked **per proc id**:

```ts
interface PRDState {
  sinceLastProc: number; // attempts since last proc
}
type PRDTable = Map<string, PRDState>;
```

### 3.3 PRD Roll Timing (Define When You Roll)

* On-hit/on-cast procs: roll at `CAST_COMPLETE`
* Auto-attack procs: roll at `AUTO_ATTACK` / `PET_ATTACK`
* DoT procs: roll at `DOT_TICK`

### 3.4 PRD Formula

Use a C-value model (as per WoW/SimC style).

* Each failed attempt increments `sinceLastProc`
* actual chance = `C * sinceLastProc` (clamped ≤ 1)

**Important:** PRD C-values and proc definitions belong in data (or proc table), not hardcoded.

### 3.5 Variance Reduction for Stat Weights (Required)

Stat weights must use **common random numbers**:

* Baseline run and +200 stat run use the same per-iteration seeds.
* This drastically reduces noise and stabilizes weights with fewer iterations.

Optional future upgrade:

* Antithetic sampling (seed + "inverted stream") behind a feature flag.

---

## 4. Combat Math (Level 90) — One Canonical Pipeline

### 4.1 Canonical Pipeline Per Secondary

Every stat conversion must use this order:

1. **Rating → Base % (pre-DR)**
2. Add flat % modifiers (talents/buffs)
3. Apply DR (per configured policy)
4. Convert to multipliers (crit chance, haste multiplier, vers multiplier, etc.)

All engine code must call one shared module function:

* `computeCombatMultipliers(stats, config, auraState)`

### 4.2 Rating → Percentage Conversion (Config File)

Use SimC midnight `sc_scale_data.inc` values for level 90:

```
percentage = rating / ratingPerPercent(stat, level)
```

Store in `src/data/combatRatings.json` (versioned), not hardcoded.

Example baseline values:

* Crit: ~180 rating per 1%
* Haste: ~170 rating per 1%
* Vers: ~205 rating per 1%
* Mastery: spec-specific

### 4.3 Diminishing Returns (Piecewise Linear)

DR curve is piecewise bands. Thresholds (per SimC) for Crit/Haste/Vers and Mastery:

* 30% → 39% → 47% → 54% → 66% → 126%

Marginal multipliers:

* 100% up to 30%
* 90% for (30–39]
* 80% for (39–47]
* 70% for (47–54]
* 60% for (54–66]
* 50% for (66–126]
  (extendable)

Implementation note:

* Keep thresholds and multipliers data-driven (combat ratings config can hold DR bands per stat).
* Provide a unit-tested function:
  * `applyDR(stat, totalPercent): effectivePercent`

**DR policy flag (v2 default):** apply DR to total percent (rating + buffs). This may diverge slightly from live in edge cases; keep configurable via `features.drAppliesToTotalPercent`.

### 4.4 Armor & Physical Mitigation (Separate Target Armor vs K)

Use the standard reduction equation:

```
mitigation = targetArmor / (targetArmor + K)
damage_after_armor = physical * (1 - mitigation)
```

* `targetArmor` is a **config value** (content dependent).
* `K` is a **constant** derived from level delta; store as config or computed.

Bleeds and nature damage bypass armor.

### 4.5 Primary Stat and Weapon Normalization

* Attack Power = Agility × 1.0 (Survival baseline)
* Weapon DPS affects auto-attacks and normalized abilities
* Normalize:
  * 2H: 3.3
  * DW MH: 2.4 (and OH rules as defined by spell)

---

## 5. Spell & Proc Data: Provider Abstraction + Versioning

### 5.1 SpellDataProvider (Single Source of Truth)

Avoid scattering spell coefficient logic across abilities. Use:

```ts
interface SpellInfo {
  spellId: number;
  name: string;
  school: "physical" | "nature" | "fire" | "frost" | "shadow" | "arcane" | "holy";
  cooldownMs?: number;
  castTimeMs?: number;
  coefficient?: number;   // if known
  flags?: string[];       // e.g. "dot", "bleed", "channeled"
}

interface SpellDataProvider {
  getSpell(spellId: number): SpellInfo;
  getCoefficient(spellId: number, variant?: string): number | null;
  getCooldownMs(spellId: number): number;
  getSchool(spellId: number): SpellInfo["school"];
}
```

### 5.2 Data Sources and Caching

Rules:

1. Try Blizzard API spell data (`/data/wow/spell/{spellId}`)
2. If coefficient missing/unusable, fall back to SimC extraction (midnight branch data)
3. Cache in `src/data/spellData.json`

### 5.3 Versioning and Invalidation

`spellData.json` must include metadata:

* `build: "midnight-<patch/build>"`
* `generatedAt`
* `sources`
* `schemaVersion`

Invalidate cache when:

* app version changed OR
* `combatRatings.json.version` changed OR
* user clicks "Refresh data"

---

## 6. State Model: CombatState, Auras, DoTs, and Lazy Resource Updates

### 6.1 CombatState (Hunter + Pet + Target)

Combat state must be explicit and mutation-based (for performance). Suggested structure:

```ts
interface ActorState {
  gcdReadyAtMs: number;
  casting?: { spellId: number; endsAtMs: number };
  autoAttackNextAtMs: number;

  focus: number;            // hunter focus pool (shared with pet costs in Survival)
  focusCap: number;
  lastFocusUpdateAtMs: number; // for lazy regen

  ap: number;
  critChance: number;
  hasteMult: number;
  versMult: number;

  auras: AuraTracker;
  cooldowns: CooldownTracker;
}

interface CombatState {
  nowMs: number;

  hunter: ActorState;
  pet: ActorState;      // separate swing timer and pseudo-GCD rules if needed
  target: TargetState;

  hero: HeroTree;
  heroState: SentinelState | PackLeaderState;

  rng: RNG;
  prd: PRDTable;

  breakdown: BreakdownAccumulator;
  debug?: DebugAccumulator;
}
```

### 6.2 Focus: Lazy Regen (No Regen Events)

Do not schedule regen ticks. Instead:

* On any operation that needs accurate focus:
  * `regen = baseRegenPerSec * hasteMult`
  * `focus += regen * (nowMs - lastFocusUpdateAtMs) / 1000`
  * clamp to cap
  * update timestamp

This is a major performance win.

### 6.3 Aura & DoT Tracker (Data-Driven Rules)

Use a consistent aura record:

```ts
interface ActiveAura {
  key: string;           // stable key used everywhere
  spellId: number;
  appliedAtMs: number;
  durationMs: number;
  expiresAtMs: number;
  stacks: number;
  maxStacks: number;

  tickIntervalMs?: number;
  nextTickAtMs?: number;

  pandemicWindowMs: number;

  snapshot?: {
    ap?: number;
    critChance?: number;
    versMult?: number;
    mastery?: number;
  };
}
```

### 6.4 Snapshot Policy (Must Be Explicit)

Do not let each ability author "guess." Use a registry:

```ts
const DOT_RULES: Record<string, {
  pandemic: boolean;
  tickIntervalMs: number;
  snapshots: Array<"ap" | "crit" | "vers" | "mastery">;
}> = {
  serpent_sting: { pandemic: true, tickIntervalMs: 2000, snapshots: ["ap"] },
  wildfire_bomb: { pandemic: true, tickIntervalMs: 1000, snapshots: ["ap"] },
  // etc...
};
```

**v2 default:** snapshot AP only (`features.dotSnapshotting = "ap_only"`).
Later: `"full"` or `"none"` behind flags.

### 6.5 Pandemic Refresh

If refreshed when `remaining <= duration * 0.3`, carry over remaining duration up to `duration * 0.3` extra.

---

## 7. APL Engine: Parse → Validate → Compile (Fast Hot Loop)

### 7.1 APL Syntax (Human-Readable)

Example:

```
actions=auto_attack
actions+=/kill_command,if=focus>=30&cooldown.flanking_strike.remains>gcd
actions+=/wildfire_bomb,if=dot.wildfire_bomb.refreshable
actions+=/raptor_strike,if=buff.tip_of_the_spear.stack>=2
actions+=/flanking_strike,if=focus<60
```

### 7.2 Grammar Requirements (v2)

Support:

* boolean operators: `&` (AND), `|` (OR), `!` (NOT)
* parentheses: `( ... )`
* comparisons: `> >= < <= == !=`
* literals: numbers, identifiers

### 7.3 Condition Fields (Versioned)

Evaluator must support, at minimum:

* `focus`, `gcd`
* `cooldown.X.remains`, `cooldown.X.ready`
* `buff.X.up`, `buff.X.stack`, `buff.X.remains`
* `debuff.X.refreshable`
* `dot.X.ticking`, `dot.X.remains`, `dot.X.refreshable`
* `pet.active`
* `target.time_to_die`
* `spell_targets.X`
* `talent.X.enabled`
* `hero_tree.sentinel` / `hero_tree.pack_leader`

**Versioning:** maintain a list of supported fields in code and include `aplSchemaVersion`. Unknown fields fail validation with helpful errors.

### 7.4 Compile Step (Required for Performance)

Pipeline:

1. Parse to AST
2. Validate names:
   * action names exist in `SpellBook.actions`
   * buffs/dots exist in registry
3. Compile each condition AST → `(state) => boolean`
4. Compile APL list → `(state) => ActionId | null`

**Rule:** No string parsing or string lookups inside the per-event hot loop.

---

## 8. Survival Combat Logic: Dual Actor (Hunter + Pet) + Shared Focus Rules

### 8.1 Scheduling Rules

* Hunter actions are chosen at `GCD_READY` (and possibly `CAST_COMPLETE` for chaining).
* Pet auto-attacks schedule themselves using `pet.autoAttackNextAtMs`.
* Pet specials triggered by hunter spells or hero mechanics must be scheduled explicitly.

### 8.2 Shared Focus in Survival

Pet specials can cost hunter focus. The sim must treat focus as a single pool with consistent timing rules (spend at cast time or completion—pick one, document it, and enforce it everywhere).

### 8.3 Pet AP Scaling (as given)

```
pet_AP = hunter_AP * 0.6 * (1 + mastery_spirit_bond%)
```

Make this a single function called by pet damage calculations.

---

## 9. Hero Talent Logic (Sentinel vs Pack Leader)

### 9.1 Sentinel

Track:

* **Sentinel counter:** every 5th ranged attack triggers owl volley.
* **Lunar Storm:** 30% chance after owl fires, PRD-based, creates 8s aura ticking every 1s.
* **Eyes of the Eagle:** Kill Command chance to reset Wildfire Bomb CD (charge logic respected).
* **Sentinel's Wisdom / Watch:** crit% stacking buff mechanic (explicit aura keys + max stacks).

All counters and procs must be stored in `heroState` and included in debug replay.

### 9.2 Pack Leader

Track:

* **Vicious Hunt:** after Kill Command, pet next basic attack bonus + bleed
* **Pack Coordination:** every 4th pet basic triggers bonus hunter strike
* **Frenzied Tear:** spender chance to trigger extra pet attack (PRD)
* **Den Recovery:** survivability-only placeholder (behind flag)

---

## 10. Blizzard API Integration (Extends Existing Supabase/OAuth)

### 10.1 Endpoints Needed

* `/profile/wow/character/{realm}/{name}/equipment`
  * map to internal gear state (override BIS)
  * store item IDs, enchants, gems, bonus IDs, sockets
  * map to SimC for "Import from Armory"
* `/profile/wow/character/{realm}/{name}/specializations`
  * load active talent string
  * decode via Blizzard import/export format
  * map nodes → talentTreeMapper grid
* `/data/wow/spell/{spellId}`
  * use for spell metadata/coefficient when possible
  * cache to spellData.json via provider

### 10.2 Import Flow

```
User enters "Name-Realm"
  → fetchCharacterEquipment() → build gear state
  → fetchCharacterTalents() → decode talent string → set talent UI state
  → UI shows "Simulating YOUR character" vs "Simulating BIS template"
  → SimInput constructed from (gear state + talents + hero selection + APL)
```

---

## 11. Outputs & Visualization (UI-Facing + Debug)

### 11.1 DPS Breakdown

* Pie/donut chart by ability
* Group by source:
  * hunter direct / hunter DoTs / pet melee / pet specials / trinkets / hero procs
* Display raw damage, % total, hits, crit rate

### 11.2 Timeline View (Deterministic)

Capture first 30s for a chosen iteration:

* lanes: GCD usage, cooldowns, focus, buffs, dots
* scrubbable and zoomable
* timeline should be derived from a single deterministic iteration seed stored in `DebugInfo`

### 11.3 Stat Weights (Delta + CI) — Hook Existing computeStatWeights()

* Base sim at N iterations
* For each stat:
  * add +200 rating
  * re-sim using **same per-iteration seeds**
  * `weight = (meanDpsNew - meanDpsBase) / 200`
* Normalize to Agility = 1.00
* Display table + bar chart + CI

### 11.4 Talent Comparison

* Sub-sim mode for each talent config
* Ranked table: "Talent A: +X DPS over baseline"
* Sentinel vs Pack Leader side-by-side
* Feeds Talent Optimizer recommended highlights

### 11.5 Debug / Replay Packet (Required)

Expose a "Copy debug packet" button:

* includes base seed, iteration seed, hero, APL hash, and minimal state required to reproduce.

---

## 12. Performance Requirements (Web Worker + Low Allocation)

### 12.1 Must Run Off Main Thread

* `simWorker.ts` runs the engine
* progress messages:
  * `{ type: "progress", completedIterations, totalIterations }`
* result message:
  * `{ type: "result", result: SimResult }`

### 12.2 Worker Pool (Stat Weights)

For weights:

* 2–4 workers
* each worker runs a chunk of iterations
* aggregate results with streaming stats (avoid sending large arrays)

### 12.3 Allocation and Hot Loop Rules

* Use integer `ms` timestamps
* Avoid creating new objects per event in the hot path
* Pre-resolve:
  * action name → action handler function
  * aura key → numeric index (optional)
* Don't send giant per-iteration logs to UI by default

### 12.4 Streaming Variance (Avoid DPS Samples by Default)

Compute mean/stdev using a stable online algorithm (e.g., Welford).
Only include `dpsSamples` if explicitly requested.

---

## 13. Validation & Testing (Regression Guardrails)

### 13.1 SimC Parity Gate (Within Tolerance)

Create fixed baseline profiles per hero tree:

* gear: `getBiSList(hero)`
* talents: default for hero
* APL: from `aplDefaults.json`
* fight: 300s patchwerk, 1 target

Run:

* engine sim → mean DPS + breakdown
* SimC run with exported profile → DPS

Acceptance criteria (choose and document):

* Mean DPS within ±1–2% (initial target)
* Top 5 abilities match ordering + reasonable share similarity
* No glaring breakdown anomalies (e.g., pet damage zero)

### 13.2 Unit Tests (Minimum Set)

* DR curve correctness at each threshold boundary
* PRD expected proc rate over long run + no pathological streaking
* Pandemic refresh carryover behavior
* Event ordering determinism (same seed → identical timeline)
* APL parsing/validation error messages
* Focus lazy regen correctness (cap + regen across time gaps)
* SpellDataProvider version invalidation logic

---

## 14. Integration Adapters (Explicit Glue to Existing Code)

### 14.1 Adapter Responsibilities

**Gear → PlayerStats**

* Consume current gear state (BIS or Armory-imported)
* Use existing gear optimizer logic where possible
* Output `PlayerStats` (ratings, agility, weapon DPS/speed)

**Talent UI → TalentState**

* Consume existing talent panel selection state
* Output normalized `TalentState` + hero choice

**TalentState → SpellBook**

* Determine which actions are available (and their spell IDs)
* Provide mapping for APL validation/compile

**computeStatWeights() integration**

* Keep existing API if desired:
  * `computeStatWeights(input)` becomes a wrapper around engine runs
* Must use common random numbers between baseline and delta runs

**SimC export integration**

* SimC export must use the same gear/talent data that feeds `SimInput`

---

## 15. File Structure (Extends Existing `src/`)

```
src/
├── engine/
│   ├── SimulationEngine.ts       // event loop, iteration runner
│   ├── EventQueue.ts             // min-heap + deterministic ordering
│   ├── CombatState.ts            // hunter + pet + target state
│   ├── AuraTracker.ts            // aura/DoT mgmt + pandemic + snapshot policy
│   ├── DamageCalculator.ts       // armor, crit, vers, mastery multipliers
│   ├── CombatMath.ts             // rating->%, DR, multipliers (canonical pipeline)
│   ├── FocusModel.ts             // lazy regen + spend rules
│   ├── CooldownTracker.ts        // unified cooldown handling
│   ├── APLParser.ts              // parse -> AST
│   ├── APLCompiler.ts            // validate + compile into fast functions
│   ├── SpellDataProvider.ts      // cached spell/proc lookup
│   ├── PRD.ts                    // per-proc PRD states
│   ├── RNG.ts                    // xoshiro256++ seeded
│   └── abilities/
│       ├── RaptorStrike.ts
│       ├── MongooseBite.ts
│       ├── KillCommand.ts
│       ├── WildfireBomb.ts
│       ├── FlankingStrike.ts
│       ├── CoordinatedAssault.ts
│       ├── FuryOfTheEagle.ts
│       └── SerpentSting.ts
├── engine/hero/
│   ├── SentinelLogic.ts
│   └── PackLeaderLogic.ts
├── engine/adapters/
│   ├── buildSimInput.ts          // single canonical builder from UI state
│   ├── gearToStats.ts            // gear state -> PlayerStats
│   ├── talentsToSpellBook.ts     // TalentState -> SpellBook
│   └── resultToCharts.ts         // optional: shape breakdown/timeline for UI
├── data/
│   ├── combatRatings.json
│   ├── spellData.json
│   ├── aplDefaults.json
│   └── dotRules.json             // optional externalization of DOT_RULES
├── workers/
│   ├── simWorker.ts
│   └── workerPool.ts
└── (existing components/, hooks/, utils/, types/, lib/)
```

---

## 16. Implementation Order (Phased, With Guardrails)

### Phase 1 — Foundation + Determinism

1. `RNG.ts` + hash-derived per-iteration seeds
2. `PRD.ts` with per-proc state
3. `EventQueue.ts` with deterministic tie-breaking
4. `CombatMath.ts` (rating → % → DR → multipliers) + unit tests
5. `CombatState.ts` + `FocusModel.ts` (lazy regen)
6. `AuraTracker.ts` (pandemic + snapshots via registry)

### Phase 2 — Engine Loop + First Damage

7. `SimulationEngine.ts` (iteration runner, event handlers)
8. `DamageCalculator.ts` + baseline physical/nature damage
9. Add hunter auto-attacks + pet auto-attacks

### Phase 3 — Abilities + APL

10. Implement core abilities (Kill Command, Wildfire Bomb, Raptor/Mongoose, etc.)
11. `APLParser.ts` → `APLCompiler.ts` (parse/validate/compile)
12. Default APLs in `aplDefaults.json`

### Phase 4 — Hero Trees

13. `SentinelLogic.ts` (counter, owl, lunar storm PRD, WFB resets)
14. `PackLeaderLogic.ts` (pet counter, bonus strikes, frenzied tear PRD)

### Phase 5 — UI + Worker + Reporting

15. `simWorker.ts` + progress updates
16. DPS breakdown + timeline capture rendering
17. Stat weights wrapper (common random numbers) hooking `computeStatWeights()`
18. Talent comparison mode (batch sims)

### Phase 6 — Armory Import + Validation

19. Armory import gear + talents flow
20. SimC parity harness + regression tests

---

## Appendix A — Corrections Preserved From the Original "Got Wrong" Section

| Claim | Correction |
| --- | --- |
| fixed tick loop | event-driven priority queue |
| flat DR penalty | piecewise linear DR bands |
| K-value confusion | K is constant; armor is separate input |
| Decimal.js required | JS `Number` is sufficient |
| spell API always usable | often incomplete; supplement with SimC |
| wrong Sentinel mechanic | Sentinel's Watch is crit buff; Lunar Storm is proc |
| no Web Workers | sim must be off-main-thread |
| ignore existing codebase | integrate via adapters to existing gear/talent/export |
