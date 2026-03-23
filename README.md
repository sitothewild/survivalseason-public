# Survival Hunter Simulator — Midnight (12.0)

A **World of Warcraft: Midnight (12.0) Survival Hunter DPS simulator and toolkit** built as a single-page React application with a full event-driven simulation engine.

**Published URL:** https://survivalseason.lovable.app

---

## Purpose

- **Simulate DPS** with a tick-level event-driven engine (deterministic, seedable, multi-iteration with target-error convergence)
- **Import characters** from the Blizzard Armory — gear, stats, talents, and trinkets auto-populate
- **Compare hero talent trees** (Pack Leader vs Sentinel) with per-hero APLs sourced from SimC
- **Browse rotation priorities** parsed from SimulationCraft's `midnight` branch APL
- **Gear optimization** with enchant, gem, consumable, and weapon enhancement support
- **Stat weights** computed via delta-sim methodology
- **Live patch notes** aggregated from Wowhead, MMO-Champion, and Blizzard

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  React SPA (Vite + TypeScript + Tailwind + shadcn/ui)    │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────────────────┐  │
│  │ Pages:           │  │ Simulation Engine:            │  │
│  │  Index (Sim UI)  │  │  SimLoop → EventQueue → RNG  │  │
│  │  Gear            │  │  APLEngine (condition parser) │  │
│  │  Guide           │  │  SpellDB + CombatMath         │  │
│  │  TalentOptimizer │  │  FocusModel + CombatState     │  │
│  └──────────────────┘  │  PRD (bad-luck protection)    │  │
│                        │  WorkerPool (Web Workers)     │  │
│                        └──────────────────────────────┘  │
│                                                          │
│  supabase-js SDK                                         │
└────────────┬─────────────────────────────────────────────┘
             │
┌────────────▼─────────────────────────────────────────────┐
│  Lovable Cloud (Supabase)                                 │
│  ┌──────────────────┐  ┌───────────────────────────────┐ │
│  │ simc_data_cache   │  │ Edge Functions:               │ │
│  │ (table)           │  │ • simc-data-sync              │ │
│  │ - data_key (PK)   │  │ • blizzard-character          │ │
│  │ - data (JSONB)    │  │ • blizzard-game-data          │ │
│  │ - github_sha      │  │ • blizzard-item-db            │ │
│  │ - updated_at      │  │ • blizzard-data-snapshot      │ │
│  │                   │  │ • fetch-patch-notes           │ │
│  └──────────────────┘  └──────────────┬────────────────┘ │
└───────────────────────────────────────┼──────────────────┘
                                        │
                      ┌─────────────────▼─────────────────┐
                      │ External APIs:                    │
                      │ • GitHub (SimC midnight branch)   │
                      │ • Blizzard Battle.net API         │
                      │ • Wowhead / MMO-Champion RSS      │
                      └───────────────────────────────────┘
```

---

## Simulation Engine

**Location:** `src/engine/`

The engine is a **tick-level, event-driven DPS simulator** — not a weight-based estimator. It models every GCD, cooldown, proc, DoT tick, and pet action across hundreds of iterations.

### Core Modules

| Module | Purpose |
|--------|---------|
| `SimLoop.ts` | Main simulation loop — processes events, evaluates APL, handles damage, hero talent triggers, DoT ticks. Deterministic: same seed → same result. |
| `APLEngine.ts` | Parses SimC-style APL syntax with conditional evaluation (`buff.X.up`, `cooldown.X.remains<gcd`, `talent.X`, `!talent.X`, OR operators). Ships with 4 default APLs from SimC midnight branch. |
| `SpellDB.ts` | Spell definitions with AP coefficients, cooldowns, focus costs, schools, AoE caps, and talent requirements. Data sourced from `simcSpellData.ts`. |
| `CombatState.ts` | Tracks all runtime state: buffs, debuffs, cooldowns, DoTs, focus, combo points, pet state, hero counters, and a full combat log. |
| `EventQueue.ts` | Priority queue for simulation events (casts, ticks, procs, auras expiring). |
| `FocusModel.ts` | Models focus generation and spending with haste-scaled regen. |
| `CombatMath.ts` | Armor mitigation, rating-to-percent conversions, diminishing returns. Uses Midnight 12.0 combat ratings. |
| `RNG.ts` | Deterministic PRNG (hash64-based) for reproducible results. |
| `PRD.ts` | Pseudo-Random Distribution for bad-luck protection on proc abilities. |
| `WorkerPool.ts` | Distributes iterations across Web Workers for parallel execution. |
| `SimWorker.ts` | Worker entry point — runs a batch of iterations and returns aggregated results. |

### Simulation Flow

1. **Build `SimInput`** from character data (gear, talents, trinkets, consumables, enchants, gems)
2. **Resolve buff multipliers** (Battle Shout, Mark of the Wild, Mystic Touch, Hunter's Mark)
3. **Parse APL** — selects the correct APL based on hero tree + fight style
4. **Run N iterations** (or until target error threshold met):
   - Initialize `CombatState`, `FocusModel`, `EventQueue`
   - Schedule auto-attacks (player + pet), potion at pull
   - Each tick: process events → evaluate APL → cast next ability → apply damage/buffs/debuffs
   - Track all damage events, crit counts, hero-specific counters
5. **Aggregate** mean/median/stddev/p5/p95 DPS, per-ability breakdown, timeline

### Hero Talent Support

- **Pack Leader:** Howl of the Pack beast cycling (Boar → Bear → Wyvern), howl beast buff tracking, Frenzied Tear procs, Pack Coordination
- **Sentinel:** Sentinel Owl procs, Lunar Storm, Eyes of the Eagle resets, Sentinel's Mark debuff, Vicious Hunt procs

### APL System

Four pre-built APLs from SimC `midnight` branch (`apl_hunter.cpp`):

| Key | Description |
|-----|-------------|
| `pack_leader_raid_st` | Pack Leader single-target raid |
| `pack_leader_mplus_aoe` | Pack Leader M+ AoE |
| `sentinel_raid_st` | Sentinel single-target raid |
| `sentinel_mplus_aoe` | Sentinel M+ AoE |

Conditions supported: `buff.X.up/down`, `buff.X.stack`, `cooldown.X.remains<gcd`, `cooldown.X.on_cooldown`, `talent.X`/`!talent.X`, `debuff.X.remains`, `fury_of_the_wyvern_extendable`, `full_recharge_time`, and `|` (OR) operators.

### SimOptions (Advanced Configuration)

| Category | Options |
|----------|---------|
| **Raid Buffs** | Battle Shout (+5% AP), Mark of the Wild (+3% Vers), Mystic Touch (+5% phys dmg taken), Hunter's Mark (+5% dmg to target) |
| **Consumables** | Phials, food, potions (stat-based, applied at pull) |
| **Weapon Enhancement** | Damage procs (AP coefficient + CPM) |
| **Enchants** | Per-slot or "auto" BiS selection |
| **Gems** | Single-stat (88 rating) or dual-stat (44+44) fills, Blasphemite support |
| **Augment Rune** | Flat stat bonus |

Tier set bonuses (2pc/4pc) are **auto-detected from equipped gear** — no manual toggle.

---

## Adapters

**Location:** `src/engine/adapters/`

| Adapter | Purpose |
|---------|---------|
| `charToSimInput.ts` | Converts Blizzard Armory character data → `SimInput`. Auto-detects tier set, maps gear to stats, resolves talents. |
| `gearToStats.ts` | Extracts stat totals from equipped gear items. |
| `talentsToEngine.ts` | Maps talent tree selections → `TalentState` with active talent set. |
| `trinketsToEngine.ts` | Resolves trinket items → `EquippedTrinket` with proc/on-use data. |
| `simResultToLegacy.ts` | Converts `SimResult` → legacy format for backward-compatible UI rendering. |

---

## Edge Functions

### `simc-data-sync`
Fetches latest SimC survival hunter APL + spell data from GitHub (`midnight` branch). Compares commit SHA for cache invalidation. Parses C++ source files via regex. Upserts to `simc_data_cache`.

### `blizzard-character`
Proxies Blizzard Profile API (OAuth2 client credentials). Fetches profile, equipment, stats, media renders. Handles US/EU/KR/TW regions.

### `blizzard-game-data`
Proxies Blizzard Game Data API for item/spell/talent lookups.

### `blizzard-item-db`
Item database queries against Blizzard's item API.

### `blizzard-data-snapshot`
Bulk data snapshot of game data for offline reference.

### `fetch-patch-notes`
Aggregates news from Wowhead, MMO-Champion, and Blizzard RSS feeds. Filters for hunter-relevant content.

All edge functions are publicly callable (`verify_jwt = false`).

---

## UI Pages

| Route | Page | Content |
|-------|------|---------|
| `/` | **Index** | Main simulation UI — stat inputs, DPS output, ability breakdown chart, stat weights, combat log, advanced options (buffs, consumables, enchants, gems) |
| `/gear` | **Gear** | Character import via Blizzard Armory, equipment display, gear optimization |
| `/guide` | **Guide** | APL rotation display, SimC sync status (branch, SHA), rotation priorities per hero/fight style |
| `/talent-optimizer` | **Talent Optimizer** | Talent tree visualization and optimization |

---

## Data Pipeline: SimC → Live APL

1. Client calls `simc-data-sync` edge function
2. Function fetches latest commit SHA from `simulationcraft/simc` GitHub repo (`midnight` branch)
3. If SHA changed, fetches `apl_hunter.cpp` + `sc_hunter.cpp`
4. Parses APL action lists and spell data via regex
5. Upserts parsed JSON to `simc_data_cache` table
6. Client-side `aplParser.ts` converts cached data to rotation weights for the legacy UI path
7. Engine's `APLEngine.ts` uses its own compiled APL strings for tick-level simulation

**Stale data protection** operates at 3 layers:
- Edge function parser filters deprecated abilities
- Client-side `DEPRECATED_ABILITIES` array rejects stale APL data
- UI-level `isStaleSimcData` triggers force refresh

---

## Database

**Single table:** `simc_data_cache`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated |
| `data_key` | TEXT (unique) | Cache key, e.g. `"survival_hunter_data"` |
| `data` | JSONB | Parsed SimC data blob |
| `github_sha` | TEXT | Git commit SHA for cache invalidation |
| `created_at` | TIMESTAMPTZ | Row creation time |
| `updated_at` | TIMESTAMPTZ | Last refresh time |

No RLS — accessed only via service role in edge functions.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Build | Vite 5 |
| Styling | Tailwind CSS + shadcn/ui |
| Charts | Recharts |
| State/Data | TanStack React Query |
| Routing | React Router v6 |
| Backend | Lovable Cloud — Edge Functions (Deno), PostgreSQL |
| Testing | Vitest + Testing Library |
| External | Blizzard Battle.net API, GitHub API, Wowhead/MMO-Champion RSS |

---

## Local Development

```sh
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
npm i
npm run dev
```

### Testing

```sh
npm test
```

Tests include: engine validation, APL correctness, Raidbots calibration, character adapter mapping, trinket proc modeling, and stat weight computation.
