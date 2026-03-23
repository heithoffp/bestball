# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Vision

The goal is a deployable website that serves as the one-stop shop for managing a best-ball portfolio. Users should be able to gain actionable insights through a simple, intuitive interface that surfaces the most useful data without requiring them to dig. Every feature and design decision should prioritize clarity and usability — get the right information in front of the user with minimal friction.

The full product vision, design principles, scope, and exclusions are defined in **`Docs/Vision_and_Scope.md`**. This is the authoritative source for product direction — consult it before proposing new features or making design decisions. Key principles: the app is a "mirror, not advisor" (describe state, don't prescribe actions), all features must be zero-config (no user-set targets), and the dashboard is the primary entry point with tabs as drill-downs.

## Documentation Structure

- **`Docs/Vision_and_Scope.md`** — Product direction, design principles, exclusions (the "why" and "what")
- **`Docs/Feature_Specs/`** — Detailed behavior specs per implemented feature (the "how")
- **`Docs/Backlog.md`** — Prioritized work items and status tracking (the "what's next")

When modifying a feature, update the corresponding Feature Spec. When adding or completing work items, update the Backlog. Vision_and_Scope should only change when product direction shifts.

## Project Overview

Best Ball Manager is a React 19 + Vite 7 single-page app for analyzing fantasy football best-ball draft portfolios. It ingests roster CSVs and ADP (Average Draft Position) snapshots, then provides analytics across six tab views: exposure tables, ADP time series, draft flow, combo analysis, roster construction archetypes, and individual roster viewing.

## Commands

```bash
cd best-ball-manager
npm run dev      # Start Vite dev server with HMR
npm run build    # Production build
npm run lint     # ESLint
npm run preview  # Preview production build
```

All commands must be run from the `best-ball-manager/` subdirectory.

## Architecture

### Data Flow

CSV assets (`src/assets/rosters.csv` + `src/assets/adp/*.csv` date-stamped snapshots) are loaded in `App.jsx` on mount, parsed via PapaParse (`utils/csv.js`), then processed through `utils/helpers.js` which normalizes player names, computes exposure percentages, and builds a master player list with historical ADP timelines. Enriched data flows into six tab components.

### Key Utilities

- **`utils/helpers.js`** — `stableId()` for canonical player IDs, `parseAdpString()` for ADP format handling, `processMasterList()` for the main aggregation pipeline that joins rosters with ADP data
- **`utils/draftScorer.js`** — Multi-factor candidate scoring: projected value, diversification, exposure penalty, strategy fit, reach penalty, and strategy kill detection. Uses weighted utility composition.
- **`utils/rosterArchetypes.js`** — Classifies rosters into strategic archetypes (RB_HERO, RB_ZERO, RB_HYPER_FRAGILE, RB_VALUE) via `PROTOCOL_TREE`. `analyzePortfolioTree()` aggregates portfolio-level strategy distribution.

### Components

Six main tab components in `src/components/`: ExposureTable, AdpTimeSeries, DraftFlowAnalysis, ComboAnalysis, RosterConstruction, RosterViewer. All are functional components using hooks with `useMemo` for expensive computations.

## Conventions

- ES Modules throughout (`"type": "module"`)
- Utility files use lowercase with camelCase (`draftScorer.js`); components use PascalCase
- Player identity is normalized via `stableId()` — always use it when matching players across data sources
- ADP snapshots are named `underdog_adp_YYYY-MM-DD.csv` and sorted by date for timeline construction
