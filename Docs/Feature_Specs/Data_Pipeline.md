# Data Pipeline

## Purpose
Handles all data ingestion, parsing, normalization, enrichment, and persistence. The invisible backbone that turns raw CSV files into the enriched data structures every feature consumes.

## Current Status
Active

## User-Facing Behavior

### Roster Data Ingestion
- Roster data is synced from the Chrome extension — no manual CSV upload
- Rankings tab still supports CSV upload for custom rankings files

### Loading Feedback
- App-level status messages: "Loading data..." → "Processing exposure data..." → "Processing rankings..."
- Rendered as a card banner: `{status.type}: {status.msg}`
- Tab components wrapped in `<Suspense>` with fallback text

### Storage
- **Local:** IndexedDB (`bestball-db`, version 1, `files` store)
- **Cloud:** Supabase bucket `user-files` — stores `{userId}/{fileId}.csv` + `.meta.json`
- **Sync strategy:** Save to local first, then cloud if authenticated
- **Retrieval:** Cloud first (if authenticated), fall back to local on error
- **Migration:** On first sign-in, local data auto-pushed to cloud if cloud is empty

### Authentication
- Google OAuth via Supabase
- Optional — app works fully without auth (IndexedDB only)
- `AuthButton` component: "Sign in with Google" → avatar + "Sign out"

## Data Processing Pipeline

### 1. CSV Parsing (`utils/csv.js`)
- PapaParse with `header: true`, `skipEmptyLines: true`, `dynamicTyping: false`
- Supports both File objects and raw text strings

### 2. Column Mapping (`utils/dataLoader.js`)
Roster data primarily arrives via the Chrome extension (`utils/extensionBridge.js`), pre-shaped to canonical fields. The CSV column fallbacks below remain in use for the bundled demo dataset and the Rankings CSV upload. Underdog variants:
- Name: `Player Name` | `player_name` | `Player`
- Position: `Position` | `position` | `Pos`
- Team: `Team` | `team`
- Entry ID: `Draft Entry` | `Entry ID` | `entry_id`
- Pick: `Pick Number` | `pick_number` | `Pick`

ADP CSV column fallbacks:
- First name: `firstName` | `first_name`
- Last name: `lastName` | `last_name`
- ADP: `adp` | `ADP`
- Team: `team` | `teamName`
- Position: `position` | `slotName`

Missing columns default to `'N/A'` or `'Unknown'`. Rows with name = `'Unknown'` are filtered out.

### 3. Normalization (`utils/helpers.js`)
- `stableId(input)`: Canonical player ID via hash — lowercase, trimmed, quote-removed, whitespace-collapsed
- All player matching across data sources uses `stableId()` for consistency

### 4. Master List Aggregation (`processMasterList()`)
Joins rosters + ADP snapshots into canonical player objects:
1. Builds snapshot lookup tables from each date-stamped ADP CSV
2. Counts roster appearances per player for exposure %
3. Constructs universe of unique players from all sources
4. Resolves position/team via fallback chain: latest snapshot → adpMap → roster
5. Builds history timeline from all snapshots
6. Sorts: exposure descending, then ADP ascending (nulls last)

### 5. Enrichment (`processLoadedData()`)
- Backfills missing projections using nearest same-position ADP neighbor
- Computes `adpDiff` (ADP - pick position) per roster entry
- Resolves rankings preference chain: user rankings → latest ADP → projections

### Sync Replacement Semantics
- `syncSaveFile()` uses `put()` with fixed key `'roster'` — **each sync completely replaces previous data**
- No confirmation dialog, no preview, no undo mechanism
- No backup of previous data

## Known Limitations
- **No CSV format validation** — unrecognized CSVs parse silently and produce empty results
- **No sync confirmation** — destructive replacement with no undo
- **No progress bar** during processing (only text status messages)
- **No error boundaries** — errors surface as raw `String(err)` in status banner
- ADP snapshots are static (bundled at build time, both Underdog and DraftKings); users cannot add their own

## Key Files
- `src/components/FileUploadButton.jsx` — upload UI component (used by Rankings tab)
- `src/utils/csv.js` — `parseCSVFile()`, `parseCSVText()`
- `src/utils/dataLoader.js` — `processLoadedData()`, column mapping
- `src/utils/helpers.js` — `stableId()`, `parseAdpString()`, `processMasterList()`
- `src/utils/storage.js` — IndexedDB operations, sync facade
- `src/utils/cloudStorage.js` — Supabase file operations
- `src/contexts/AuthContext.jsx` — Google OAuth provider
- `src/utils/supabaseClient.js` — Supabase configuration
- `src/App.jsx` — orchestrates loading, status messages, data distribution
