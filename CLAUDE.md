# Best Ball Exposures

## Overview

**Best Ball Exposures** (BBE) is a commercial SaaS product for analyzing fantasy football best-ball draft portfolios. Users sync rosters from supported platforms via a Chrome extension, then explore portfolio-level analytics across a tabbed dashboard — exposures, ADP movement, draft assistance, combo analysis, and more. The product positions as the "one-stop shop for portfolio awareness" and follows a *mirror, not advisor* design philosophy: describe state, don't prescribe action.

- **Brand:** Best Ball Exposures (mobile: "BB EXPOSURES")
- **Domain:** BestBallExposures.com
- **Social:** [@BBExposures](https://x.com/BBExposures)
- **Platforms supported:** Underdog and DraftKings
- **Distribution:** Web app (subscription) + Chrome extension (roster sync)

## Project Vision

The full product vision, design principles, and exclusions live in **`docs/Vision_and_Scope.md`**. Consult it before proposing new features. Core principles:

- **Mirror, not advisor** — describe portfolio state; never prescribe. Computed opinions are limited to the Draft Assistant tab and Roster Viewer (single-roster grading is OK there).
- **Zero-config insights** — every feature must be useful immediately after sync; no targets, no preference wizards.
- **Dashboard-first navigation** — Dashboard is the home base; other tabs are drill-downs.

## Tech Stack

### Web app (`best-ball-manager/`)
- **Language:** JavaScript (ES Modules)
- **UI:** React 19, React Router 7, Recharts, Lucide React, @dnd-kit (drag-and-drop)
- **State / data:** PapaParse (CSV), @tanstack/react-virtual (large lists)
- **Build:** Vite 7
- **Auth + cloud storage:** Supabase (`@supabase/supabase-js`); IndexedDB fallback when unauthenticated
- **Payments:** Stripe (`@stripe/stripe-js`) — handled via Supabase Edge Functions for webhooks (see ADR-001)
- **Observability:** Sentry (`@sentry/react`), Vercel Analytics, Vercel Speed Insights
- **Testing:** Playwright
- **Lint:** ESLint 9
- **Hosting:** Vercel

### Chrome extension (`chrome-extension/`)
Roster sync utility — reads Underdog/DraftKings draft pages, writes entries to Supabase / IndexedDB for the web app to consume. Out of scope for most web-app sessions.

Bundled by **Vite + @crxjs/vite-plugin** into `chrome-extension/dist/` — the dist directory is what Edge / Chrome / Firefox load, not `src/`. **Any change to files under `chrome-extension/src/` requires `cd chrome-extension && npm run build` before the developer can reload-and-test in the browser.** Skipping the build silently runs the previous bundle and looks like the fix didn't work.

### Auxiliary code (out of scope unless explicitly working on it)
- `scrapers/` — Python ADP scrapers
- `simulation/` — Python Monte Carlo / projection tools
- `scripts/` — Node admin scripts (e.g., `grant-pro.mjs`)
- `supabase/` — Edge Functions and SQL migrations

## Key Commands

All web-app commands run from `best-ball-manager/`:

| Command | Purpose | Confirm Before Running? |
|---------|---------|------------------------|
| `npm run dev` | Vite dev server with HMR | No |
| `npm run build` | Production build | No |
| `npm run lint` | ESLint | No |
| `npm run preview` | Preview production build | No |
| `npx playwright test` | Run e2e tests | No |

Extension commands run from `chrome-extension/`:

| Command | Purpose | Confirm Before Running? |
|---------|---------|------------------------|
| `npm run build` | Bundle `src/` → `dist/` (run after every source edit) | No |
| `npm run release` | Cut a versioned release (zip + signed xpi) | Yes |

## Read-Only Paths

- `best-ball-manager/src/assets/` — bundled CSV data (demo rosters, ADP snapshots, projections, default rankings). Never modify.

## Architecture

### Tab structure (`src/App.jsx`)

The app routes via `react-router-dom` with these tabs:

| Tab key | Path | Component | Purpose |
|---------|------|-----------|---------|
| `dashboard` | `/` | `Dashboard.jsx` | Portfolio overview (default landing) |
| `exposures` | `/exposures` | `ExposureTable.jsx` | Player exposure table |
| `rosters` | `/rosters` | `RosterViewer.jsx` | Per-roster deep dive with grades |
| `timeseries` | `/adp-tracker` | `AdpTimeSeries.jsx` | Historical ADP timelines |
| `combo` | `/combos` | `ComboAnalysis.jsx` | QB stack and dual-QB pair analysis |
| `rankings` | `/rankings` | `PlayerRankings.jsx` | Custom drag-and-drop draft board |
| `draftflow` | `/draft-assistant` | `DraftFlowAnalysis.jsx` | Live-draft companion (the only opinionated tab) |

Help is rendered as a **per-tab overlay** (`HelpOverlay.jsx`), not its own tab. The standalone `HelpGuide.jsx` is no longer mounted as a tab.

`RosterConstruction.jsx` exists in the codebase but is **disabled** in `App.jsx` for performance. The source file is preserved.

`DraftExplorer.jsx` exists but is unused — dead code candidate.

### Data flow

1. **Bootstrap (`App.jsx`)** — On mount, `loadData()` chooses a path:
   - Authenticated user with Supabase: load rosters via `extensionBridge` (data written by the Chrome extension), plus per-platform rankings from Supabase.
   - Unauthenticated guest: render `LandingPage`. Demo data loads on demand via "Try Demo".
2. **Bundled assets** — ADP snapshots (`src/assets/adp/{underdog|draftking}_adp_YYYY-MM-DD.csv`), projections, rankings, and demo rosters are imported via Vite `import.meta.glob`.
3. **Processing (`utils/dataLoader.js` → `utils/helpers.js`)** — CSVs parsed by PapaParse, players normalized via `stableId()`, exposure percentages computed, master player list built with historical ADP timelines per platform.
4. **Subscription gating (`SubscriptionContext.jsx`, `featureAccess.js`)** — Each tab is wrapped in `canAccessFeature(tier, key)`; locked tabs render `LockedFeature` with a sign-up prompt.

### Key utilities (`src/utils/`)

| File | Responsibility |
|------|----------------|
| `helpers.js` | `stableId()`, `parseAdpString()`, `processMasterList()` aggregation pipeline |
| `dataLoader.js` | Top-level orchestration of CSV → enriched data structures |
| `csv.js` | Thin PapaParse wrapper |
| `extensionBridge.js` | Reads roster entries written by the Chrome extension |
| `storage.js` / `cloudStorage.js` | IndexedDB + Supabase storage with sync-first-then-cloud strategy |
| `draftModel.js` | Draft state model used by Draft Assistant |
| `rosterArchetypes.js` | `classifyRosterPath()`, `analyzePortfolioTree()`, `PROTOCOL_TREE` (Hero RB / Zero RB / Hyper Fragile / Balanced × QB tiers × TE tiers) |
| `stackAnalysis.js` | `analyzeStack()` — Elite Overstack / Stack / RB Stack / Game Stack classification |
| `uniquenessEngine.js` | Roster uniqueness scoring (see ADR-003) |
| `clvHelpers.js` | Closing Line Value helpers |
| `featureAccess.js` | Subscription tier gating |
| `supabaseClient.js`, `stripeClient.js` | Third-party client singletons |
| `sentry.js`, `analytics.js` | Observability shims |

### Contexts

- `AuthContext.jsx` — Supabase auth state + recovery mode
- `SubscriptionContext.jsx` — Stripe-backed tier (`guest` | paid tiers)

## Development Guidelines

- ES Modules throughout (`"type": "module"`)
- Components: `PascalCase.jsx` with co-located `PascalCase.module.css`
- Utilities: `camelCase.js`
- Player identity: always normalize via `stableId()` when matching across data sources
- ADP filenames: `{underdog|draftking}_adp_YYYY-MM-DD.csv`; sorted by date for timeline construction
- Mobile responsiveness via `useMediaQuery` hook + CSS modules with breakpoints at 599px / 899px

## External Dependencies & Environment

- **Supabase:** Auth, cloud storage (`user-files` bucket), Edge Functions for Stripe webhooks (ADR-001)
- **Stripe:** Subscription billing
- **Vercel:** Hosting, Analytics, Speed Insights
- **Sentry:** Error reporting
- Local development: app runs without environment variables (Supabase/Stripe optional — guest tier and IndexedDB fallback)

### Supabase Data API grants (post-2026-10-30)

Starting **October 30, 2026**, Supabase no longer auto-exposes new `public` schema
tables to the Data API. Every new table created in `public` after that date requires
explicit `GRANT` statements; an RLS policy alone is not sufficient — `supabase-js`,
PostgREST, and GraphQL will return `42501` if grants are missing. **Existing tables
keep their current grants**, so no action is needed for tables already in production.

Every new migration that creates a table in `public` must follow this pattern:

```sql
create table public.your_table (...);

alter table public.your_table enable row level security;

-- Required: grant the roles that need access. Match the roles to actual callsites.
grant select on public.your_table to anon;                              -- only if anonymous reads are intended
grant select, insert, update, delete on public.your_table to authenticated;
grant select, insert, update, delete on public.your_table to service_role;

-- Then policies, indexes, etc.
create policy "..." on public.your_table for select to authenticated using (...);
```

Note: `service_role` requires an explicit grant under the new default — it is not
automatically bypassed. Tighten grants to the verbs actually used (e.g., read-only
tables should only grant `select`).

## Platform

- **OS:** Windows 11
- **Shell:** PowerShell (project default) or bash (also available)
- **Path syntax:** Forward slashes work in both shells

## Documentation Structure

> **Note:** Git tracks the documentation tree as `Docs/` (capital D); on Windows the
> case-insensitive filesystem makes `docs/` (lowercase) work too. Convention in this
> project — and in the hus skills — is to *refer* to it as `docs/` in prose. A planned
> rename to canonical lowercase is tracked as TASK-209.

- **`docs/Vision_and_Scope.md`** — Product direction, design principles, exclusions (the "why" / "what")
- **`docs/Feature_Specs/`** — Detailed behavior specs per implemented tab (the "how")
- **`docs/adr/`** — Architecture Decision Records (owned by hus-adr)
- **`docs/plans/`** — Per-task implementation plans (owned by hus-backlog)
- **`docs/archive/`** — Completed plans + retired notes
- **`docs/systems-model/`** — Systems-thinking diagrams and analyses
- **`docs/migrations/`** — Database / data migration notes
- Business / strategy docs live alongside specs in `docs/`: `Pricing_Strategy.md`, `Channel_Strategy.md`, `Uniqueness_Model.md`, `competitive-landscape.md`, `creator-outreach.md`, `value-proposition.md`, `UI_UX_Guide.md`

When modifying a feature, update its Feature Spec. Vision_and_Scope changes only on product direction shifts.

## Project Files

| File / Dir | Purpose |
|------------|---------|
| `CLAUDE.md` | This file — project context and working agreements |
| `LIFECYCLE.md` | Project phase, goal, deadline, governance tier |
| `ROADMAP.md` | Epics and features (owned by hus-backlog) |
| `BACKLOG.md` | Active and completed task table (owned by hus-backlog) |
| `README.md` | Public repo README |
| `docs/` | All other documentation (specs, ADRs, plans, strategy) |
| `best-ball-manager/` | The web application |
| `chrome-extension/` | Roster-sync extension |
| `scrapers/` | Python ADP scrapers |
| `simulation/` | Python simulation / projection tools |
| `scripts/` | Node admin scripts |
| `supabase/` | Edge Functions + SQL migrations |
| `brand/` | Brand assets |

---

## Session Protocol

At the start of every session:

1. Read this file (`CLAUDE.md`).
2. Read `LIFECYCLE.md` — note phase, goal, governance tier, deadline. Apply tier behavior per hus-lifecycle.
3. Read `ROADMAP.md` — confirm current epic context.
4. Check `BACKLOG.md` for tasks with status `In Progress`.
5. If resuming a task, confirm its plan file exists and has been **approved** before touching code.

---

## Working Agreements

### File Ownership — Non-Negotiable

Every governed file has exactly one owning skill. Never edit these directly — invoke the owning skill.

| File / Directory | Owning Skill |
|------------------|--------------|
| `BACKLOG.md` | hus-backlog |
| `ROADMAP.md` | hus-backlog |
| `docs/plans/` | hus-backlog |
| `LIFECYCLE.md` | hus-lifecycle |
| `docs/adr/` | hus-adr |

### Approval Gate — Non-Negotiable

Claude never writes code or acts on a decision without explicit developer approval.

- **Plans** — drafted via hus-backlog, presented, approved, then code.
- **ADRs** — drafted via hus-adr, presented, approved, then act.

End every plan or ADR proposal with:
> "Please review and reply **approved** to proceed, or provide feedback to revise."

### Task Management

Use **hus-backlog** for all task and plan operations. Never edit `BACKLOG.md` or `docs/plans/` manually.

### Architectural Decisions

Use **hus-adr** for any significant design choice — technology selection, structural patterns, meaningful trade-offs. When in doubt, write an ADR.

### Lifecycle and Phases

Use **hus-lifecycle** for phase tracking, transitions, and governance tier management. Never manually edit `LIFECYCLE.md`.

### Never

- Write code without an approved plan.
- Act on an architectural decision without an approved ADR.
- Transition phases without developer approval.
- Modify read-only paths.
- Skip the session protocol.
