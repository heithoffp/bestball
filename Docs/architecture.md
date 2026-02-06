# Best Ball Manager – Architecture Overview

## High-Level Overview

The Best Ball Manager is a client-side React application built with Vite.  
Its primary responsibility is to ingest CSV draft and ADP data, normalize it into a canonical player model, and compute portfolio-level analytics such as player exposure.

The app is intentionally **frontend-only** for MVP velocity and ease of distribution. All data lives in memory (with minimal config persisted to localStorage).

---

## Technology Stack

- **Vite** – build tool / dev server
- **React 18** – UI framework
- **PapaParse** – CSV parsing (File API + text parsing)
- **Plain CSS** – global styles (no CSS-in-JS yet)

---

## Architectural Principles

1. **Separation of concerns**
   - UI components are dumb and stateless where possible
   - Data parsing, normalization, and aggregation live in utilities
   - App-level orchestration happens in `App.jsx`

2. **Explicit data flow**
   - CSV → parsed rows → normalized roster entries → canonical player table
   - No implicit side effects or hidden state mutations

3. **MVP-first, extensible later**
   - Simple models now (name-based identity)
   - Clear seams for future features (charts, filters, persistence, TypeScript)

---

## Directory Structure

```
src/
├─ main.jsx # React entry point
├─ App.jsx # Application orchestration & state
├─ index.css # Global styling / theme
│
├─ components/ # UI components (presentation-first)
│ ├─ ConfigSection.jsx # CSV path + file upload configuration
│ ├─ ExposureTable.jsx # Exposure summary table
│ └─ CanonicalTable.jsx # Canonical player table
│
├─ utils/ # Non-UI logic
│ ├─ csv.js # CSV parsing helpers (PapaParse)
│ └─ helpers.js # Domain logic (IDs, aggregation)
```


---

## Data Flow

### 1. Input
- User provides:
  - Roster CSV (URL or local file)
  - Optional ADP CSV (URL or local file)
- Configuration is persisted to `localStorage`

### 2. Parsing
- CSV files are parsed using PapaParse
- Parsing is isolated in `utils/csv.js`
- Output: arrays of raw row objects

### 3. Normalization
- Raw roster rows are mapped into normalized roster entries:
  - `name`
  - `position`
  - `team`
  - `entry_id`
  - `pick`
  - `round`
- Minimal name normalization is applied (trim + whitespace collapse)

### 4. Canonical Player Aggregation
- Implemented in `processMasterList` (`utils/helpers.js`)
- Responsibilities:
  - Generate stable `player_id`
  - Aggregate draft counts per player
  - Compute exposure percentages
  - Merge ADP data when available

### 5. Presentation
- Aggregated canonical player data is passed to tables
- Tabs control which table is rendered
- UI is fully derived from React state (no DOM mutation)

---

## State Ownership

### App-Level State (`App.jsx`)
- Configuration (CSV paths)
- Roster data (normalized rows)
- ADP map
- Canonical player list
- UI state (active tab, status messages)

### Component-Level State
- Temporary input state (file uploads, form inputs)
- No business logic or aggregation

---

## Key Utility Functions

### `parseCSVFile(file)`
- Parses local CSV files using the File API
- Returns array of row objects

### `parseCSVText(text)`
- Parses CSV text fetched via `fetch`
- Returns array of row objects

### `stableId(input)`
- Generates deterministic player IDs
- Currently based on `name|position|team`

### `processMasterList(rosters, adpMap)`
- Core domain function
- Produces the canonical player table
- Calculates exposure metrics

---

## Known Limitations (Intentional for MVP)

- Player identity is name-based and brittle
- No fuzzy matching between roster and ADP data
- No column-mapping UI
- No persistence beyond session + localStorage
- No virtualization for large tables
- No charts yet (exposure vs ADP, time-series)

---

## Planned Evolution Paths

- Add column-mapping UI for CSV ingestion
- Introduce fuzzy name matching / player identity resolution
- Persist ADP snapshots for time-series analysis
- Add charting layer (exposure vs ADP, trends)
- Convert to TypeScript for stronger domain modeling
- Extract domain logic into a dedicated `domain/` layer

---

## Summary

This architecture optimizes for:
- Fast iteration
- Clear data flow
- Easy refactoring

It deliberately avoids premature abstraction while keeping all critical seams visible for future growth.
