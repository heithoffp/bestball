# Best Ball Portfolio Manager

## Overview

Best Ball Portfolio Manager is a commercial SaaS product for analyzing fantasy football best-ball draft portfolios. It ingests roster CSVs and ADP (Average Draft Position) snapshots, then provides analytics across multiple tab views — serving as the one-stop shop for portfolio awareness. Users gain actionable insights through a simple, intuitive interface that surfaces the most useful data without requiring them to dig.

## Project Vision

The full product vision, design principles, scope, and exclusions are defined in **`Docs/Vision_and_Scope.md`**. This is the authoritative source for product direction — consult it before proposing new features or making design decisions. Key principles: the app is a "mirror, not advisor" (describe state, don't prescribe actions), all features must be zero-config (no user-set targets), and the dashboard is the primary entry point with tabs as drill-downs.

## Tech Stack
- **Language(s):** JavaScript (ES Modules)
- **Framework(s):** React 19, Recharts, Lucide React
- **Build/Package:** Vite 7, npm
- **Runtime:** Browser (client-side only)
- **Backend Services:** Supabase (auth + cloud storage, optional — IndexedDB fallback)
- **Deployment:** Vercel (with analytics + speed insights)

## Key Commands

All commands must be run from the `best-ball-manager/` subdirectory.

| Command | Purpose | Confirm Before Running? |
|---------|---------|------------------------|
| `npm run dev` | Start Vite dev server with HMR | No |
| `npm run build` | Production build | No |
| `npm run lint` | ESLint | No |
| `npm run preview` | Preview production build | No |

## Read-Only Paths
- `best-ball-manager/src/assets/` — CSV data files (demo rosters, ADP snapshots, projections, rankings). Never modify these.

## Architecture

### Data Flow

Roster data is synced from the Chrome extension (stored in IndexedDB or Supabase cloud storage). ADP snapshots (`src/assets/adp/*.csv` date-stamped) are bundled at build time. Both are loaded in `App.jsx` on mount, parsed via PapaParse (`utils/csv.js`), then processed through `utils/helpers.js` which normalizes player names, computes exposure percentages, and builds a master player list with historical ADP timelines. Enriched data flows into tab components.

### Key Utilities

- **`utils/helpers.js`** — `stableId()` for canonical player IDs, `parseAdpString()` for ADP format handling, `processMasterList()` for the main aggregation pipeline that joins rosters with ADP data
- **`utils/draftScorer.js`** — Multi-factor candidate scoring: projected value, diversification, exposure penalty, strategy fit, reach penalty, and strategy kill detection. Uses weighted utility composition.
- **`utils/rosterArchetypes.js`** — Classifies rosters into strategic archetypes (RB_HERO, RB_ZERO, RB_HYPER_FRAGILE, RB_VALUE) via `PROTOCOL_TREE`. `analyzePortfolioTree()` aggregates portfolio-level strategy distribution.

### Components

Main tab components in `src/components/`: Dashboard, ExposureTable, AdpTimeSeries, DraftFlowAnalysis, ComboAnalysis, RosterConstruction, RosterViewer, PlayerRankings, HelpGuide. All are functional components using hooks with `useMemo` for expensive computations.

## Development Guidelines

- ES Modules throughout (`"type": "module"`)
- Utility files use lowercase with camelCase (`draftScorer.js`); components use PascalCase
- Player identity is normalized via `stableId()` — always use it when matching players across data sources
- ADP snapshots are named `underdog_adp_YYYY-MM-DD.csv` and sorted by date for timeline construction

## External Dependencies & Environment

- **Supabase:** Auth and cloud storage (optional — app works fully via IndexedDB without auth)
- **Vercel:** Hosting with analytics and speed insights
- No required environment variables for local development

## Platform
- **OS:** Windows 11
- **Shell:** bash (Unix-style paths and syntax)
- **Path syntax:** Forward slashes, `/dev/null`

## Documentation Structure

- **`Docs/Vision_and_Scope.md`** — Product direction, design principles, exclusions (the "why" and "what")
- **`Docs/Feature_Specs/`** — Detailed behavior specs per implemented feature (the "how")

When modifying a feature, update the corresponding Feature Spec. Vision_and_Scope should only change when product direction shifts.

## Project Files

| File/Dir | Purpose |
|----------|---------|
| `CLAUDE.md` | This file — project context and working agreements |
| `LIFECYCLE.md` | Project phase, current phase, phase goal, deadline, and governance tier |
| `ROADMAP.md` | Epics and features — high-level project planning (owned by hus-backlog) |
| `BACKLOG.md` | Task table with status, priority, and plan links |
| `docs/plans/` | Per-task implementation plans (approval required before coding) |
| `docs/adr/` | Architecture Decision Records (approval required before acting) |
| `Docs/Vision_and_Scope.md` | Product vision, design principles, scope, and exclusions |
| `Docs/Feature_Specs/` | Detailed behavior specs per implemented feature |

---

## Session Protocol

Follow these steps at the start of every Claude Code session:

1. Read this file (`CLAUDE.md`) to re-orient to the project.
2. Read `LIFECYCLE.md` — note the current phase, phase goal, governance tier, and deadline.
   Apply the governance behavior for this tier (per hus-lifecycle rules).
   If a phase deadline is set, note days remaining.
3. Read `ROADMAP.md` to confirm current epic context.
4. Check `BACKLOG.md` for any tasks with status `In Progress`.
5. If resuming a task, confirm its plan file exists and has been **approved** before
   touching any code.

---

## Working Agreements

### File Ownership — Non-Negotiable
**Every governed file has exactly one owning skill. Never edit these files directly — always use the owning skill.**

| File/Directory | Owning Skill | Rule |
|----------------|-------------|------|
| `BACKLOG.md` | hus-backlog | All edits via hus-backlog |
| `ROADMAP.md` | hus-backlog | All edits via hus-backlog |
| `docs/plans/` | hus-backlog | All edits via hus-backlog |
| `LIFECYCLE.md` | hus-lifecycle | All edits via hus-lifecycle |
| `docs/adr/` | hus-adr | All edits via hus-adr |

### Approval Gate — Non-Negotiable
**Claude never writes code or acts on a decision without explicit developer approval.**

- **Plans:** Use hus-backlog to draft a plan file. Present it to the developer.
  Wait for approval. Only then write code.
- **ADRs:** Use hus-adr to draft an ADR. Present it to the developer.
  Wait for approval. Only then act on the decision.

When proposing a plan or ADR, end the message with:
> "Please review and reply **approved** to proceed, or provide feedback to revise."

Do not proceed until the developer has explicitly said "approved" or equivalent confirmation.

### Task Management
Use **hus-backlog** for all task and plan operations. Do not edit `BACKLOG.md` or
`docs/plans/` manually — always follow hus-backlog rules.

### Architectural Decisions
Use **hus-adr** whenever making a significant design choice — technology selection,
structural patterns, meaningful trade-offs. When in doubt, write an ADR.

### Lifecycle and Phases
Use **hus-lifecycle** for all phase tracking, phase transitions, and governance tier
management. Do not manually edit `LIFECYCLE.md` — always follow hus-lifecycle rules.

### Never
- Write code without an approved plan file.
- Act on an architectural decision without an approved ADR.
- Transition phases without developer approval.
- Modify read-only paths listed above.
- Skip the session protocol.
