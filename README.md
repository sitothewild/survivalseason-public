# Survival Hunter Simulator — Technical Documentation

A **World of Warcraft: Midnight (12.0) Survival Hunter DPS simulator and toolkit** built as a single-page React application.

**Published URL:** https://survivalseason.lovable.app

## Purpose

Allows players to:

- **Simulate DPS** with customizable gear stats (Agility, Haste, Crit, Mastery, Versatility)
- **Compare hero talent trees** (Pack Leader vs Sentinel)
- **View live rotation priorities** parsed from SimulationCraft's open-source APL (Action Priority List)
- **Browse live patch notes** aggregated from Wowhead, MMO-Champion, and Blizzard
- **Look up character data** via Blizzard's official API

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  React SPA (Vite + TypeScript + Tailwind)       │
│  ┌───────────────┐  ┌────────────────────────┐  │
│  │ SurvivalHunter│  │ aplParser.ts           │  │
│  │ Sim.tsx (UI)  │──│ (weight calculation)   │  │
│  └───────┬───────┘  └────────────────────────┘  │
│          │                                       │
│          │ supabase-js SDK                       │
└──────────┼──────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────┐
│  Lovable Cloud (Supabase)                        │
│  ┌──────────────────┐  ┌──────────────────────┐ │
│  │ simc_data_cache   │  │ Edge Functions:      │ │
│  │ (table)           │  │ • simc-data-sync     │ │
│  │ - data_key (PK)   │  │ • blizzard-character │ │
│  │ - data (JSONB)    │  │ • blizzard-game-data │ │
│  │ - github_sha      │  │ • fetch-patch-notes  │ │
│  │ - updated_at      │  └──────────┬───────────┘ │
│  └──────────────────┘              │             │
└────────────────────────────────────┼─────────────┘
                                     │
                    ┌────────────────▼────────────┐
                    │ External APIs:              │
                    │ • GitHub (SimC repo)        │
                    │ • Blizzard Battle.net API   │
                    │ • Wowhead RSS               │
                    │ • MMO-Champion RSS          │
                    └─────────────────────────────┘
```

---

## Data Pipeline: SimC → Live Weights

### Edge Function: `simc-data-sync`

**File:** `supabase/functions/simc-data-sync/index.ts`

**Flow:**

1. Client calls the function (POST, optionally `{force: true}`)
2. Function fetches the **latest commit SHA** from `simulationcraft/simc` GitHub repo, **`midnight` branch**
3. Compares SHA against cached value in `simc_data_cache` table
4. If stale (or forced), fetches two raw C++ files:
   - `engine/class_modules/apl/apl_hunter.cpp` — contains the APL (rotation logic)
   - `engine/class_modules/sc_hunter.cpp` — contains spell implementations
5. **Parses the APL** using regex to extract action lists per hero spec:
   - `plst` / `plcleave` = Pack Leader single-target / cleave
   - `sentst` / `sentcleave` = Sentinel single-target / cleave
   - `cds` = cooldown usage
6. **Parses spell data** — extracts references to Tip of the Spear, Coordinated Assault, Mongoose Fury, tier set bonuses, hardcoded multipliers
7. **Upserts** the parsed JSON into `simc_data_cache` with key `"survival_hunter_data"`
8. Returns `{status: "cached"|"updated", sha, data}`

### Client-Side Parser: `src/utils/aplParser.ts`

**Two entry points:**

1. **`parseSimcAPL(rawText)`** — Parses raw APL text with section detection (comments like `// SENTINEL ST`). Used if raw text were available.

2. **`buildAPLFromActionLists(actionLists)`** — **Primary path.** Takes the pre-parsed `actionLists` map from the edge function and converts it into the `ParsedAPL` format:

```ts
interface ParsedAPL {
  sentinel: { st: RotationData; aoe: RotationData };
  packLeader: { st: RotationData; aoe: RotationData };
}
interface RotationData {
  ordered: string[];           // priority-ordered ability names
  weights: Record<string, number>; // normalized 0–1 weights
}
```

**Weight calculation:** Uses inverse-rank weighting (`1/(i+1)`), normalized to sum to 1.0. First ability in the APL gets highest weight.

**Stale data protection:**

- `DEPRECATED_ABILITIES` array (`spearhead`, `mongoose_bite`, `flanking_strike`, etc.) — if detected in APL text, parser rejects and falls back
- `isValidBreakdown` in the sim engine — if any single ability > 35% of damage, falls back to defaults
- `isStaleSimcData` in the UI component — scans cached data for deprecated ability names and auto-triggers a force refresh

**Name mapping:** SimC snake_case → engine camelCase via `SIMC_TO_ENGINE` lookup table (e.g., `kill_command` → `killCommand`).

---

## Simulation Engine

**Location:** Embedded in `src/components/SurvivalHunterSim.tsx`

### Inputs

- **Stat sliders:** Agility, Haste%, Crit%, Mastery%, Versatility%
- **Hero talent toggle:** Pack Leader vs Sentinel
- **Target count:** Single-target vs AoE (determines which weight set to use)

### DPS Calculation

The engine applies ability weights to stat-scaled base damage:

- Each ability has a base damage scaled by Agility
- Secondary stats modify via multipliers (Crit adds expected value, Haste reduces GCD, Mastery/Vers are flat multipliers)
- Weights from the parsed APL determine how much each ability contributes to total DPS
- Hero talent selection changes which weight set is active

### Output

- Total DPS number
- Per-ability DPS breakdown (bar chart via Recharts)
- Stat weights (how much 1% of each stat is worth in DPS)

---

## Edge Functions

### `blizzard-character`

- Proxies Blizzard Profile API calls
- Uses OAuth2 client credentials flow (`BLIZZARD_CLIENT_ID` / `BLIZZARD_CLIENT_SECRET`)
- Fetches character profile, equipment, stats, media renders
- Handles regionality (US/EU/KR/TW)

### `blizzard-game-data`

- Proxies Blizzard Game Data API calls
- Used for item lookups, spell data, talent tree data
- Same OAuth2 flow

### `fetch-patch-notes`

- Aggregates news from multiple RSS sources:
  - Wowhead retail RSS
  - MMO-Champion RSS
  - Blizzard official
- Filters for relevant content (hotfixes, class tuning, patch notes)
- Returns unified JSON array with title, source, date, URL, description

### `simc-data-sync`

Detailed in the Data Pipeline section above.

All edge functions have `verify_jwt = false` in `supabase/config.toml` — they're publicly callable (no auth required).

---

## UI Structure

Single page app with tab-based navigation in `SurvivalHunterSim.tsx`:

| Tab | Content |
|-----|---------|
| **Simulate** | Stat sliders, DPS output, breakdown chart, stat weights |
| **Talents** | Hero talent comparison (Pack Leader vs Sentinel), live patch notes feed |
| **Guide** | APL rotation display, SimC data status (branch, SHA, last sync), rotation priorities per hero/mode |
| **Gear** | Character lookup via Blizzard API, equipment display |

### Patch Notes Display

- Fetched on mount via `fetch-patch-notes` edge function
- Each article shows source badge, date, title, description snippet
- Hunter-specific content highlighted with 🏹 badge
- Ability keywords color-coded (e.g., "Wildfire Bomb" in gold, "Survival" in sky blue)

### Guide / APL Display

- Shows current SimC branch (`midnight`) and commit SHA
- Displays rotation priority for selected hero talent + target mode
- Shows whether engine is using **live APL weights** or **fallback weights**
- Manual "Sync SimC Data" button with force-refresh option

---

## Database Schema

**Single table:** `simc_data_cache`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated |
| `data_key` | TEXT (unique) | Cache key, e.g. `"survival_hunter_data"` |
| `data` | JSONB | Full parsed SimC data blob |
| `github_sha` | TEXT | Git commit SHA for cache invalidation |
| `created_at` | TIMESTAMPTZ | Row creation time |
| `updated_at` | TIMESTAMPTZ | Last refresh time |

No RLS policies — table is accessed only via service role key in edge functions (not directly from client).

---

## Secrets / Environment

| Secret | Purpose |
|--------|---------|
| `BLIZZARD_CLIENT_ID` | Blizzard API OAuth2 |
| `BLIZZARD_CLIENT_SECRET` | Blizzard API OAuth2 |
| `LOVABLE_API_KEY` | AI gateway (if used) |
| `SUPABASE_*` | Auto-configured by Lovable Cloud |

Client-side `.env` has `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` — all auto-managed.

---

## Key Design Decisions

1. **Cache-first architecture:** SimC data is fetched once, cached in DB, and only refreshed when the GitHub SHA changes. This avoids rate-limiting and speeds up page loads.

2. **Deprecated ability detection at 3 layers:** Edge function parser, client-side APL parser (`DEPRECATED_ABILITIES`), and UI-level stale check (`isStaleSimcData`). Belt-and-suspenders approach because the SimC repo may still contain War Within (11.x) code.

3. **Fallback weights:** Hardcoded Midnight-accurate weights ensure the sim always produces reasonable output even if GitHub is down or the parser fails.

4. **No authentication:** This is a public tool — no user accounts, no RLS needed. Edge functions use service role key for DB access.

5. **Edge functions as API proxies:** Blizzard API requires OAuth2 with client secret, which can't be exposed client-side. Edge functions handle the token exchange.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS + shadcn/ui |
| Charts | Recharts |
| State/Data | TanStack React Query |
| Routing | React Router v6 |
| Backend | Lovable Cloud (Supabase) — Edge Functions (Deno), PostgreSQL |
| External | Blizzard Battle.net API, GitHub API, Wowhead/MMO-Champion RSS |

---

## Local Development

```sh
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
npm i
npm run dev
```

Requires Node.js & npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).
