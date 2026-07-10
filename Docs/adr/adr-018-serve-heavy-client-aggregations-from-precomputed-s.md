# ADR-018: Serve heavy client aggregations from precomputed Storage artifacts

**Date:** 2026-07-09
**Status:** Accepted

---

## Context

The Early Combo frequency tables (`utils/realDraftData.js` — consumed by the Roster
Viewer's Early Combo %, the Draft Explorer, the uniqueness engine, and the Arena rarity
chip) were built client-side by downloading **all** of `draft_boards_admin` on every
authenticated app load: 1,529 rows × ~40 KB of `picks` JSONB ≈ **62 MB of Postgres TOAST
reads per load** (measured 2026-07-09; one 250-row page took 4.6 s). This was the dominant
consumer of the Supabase Disk IO Budget — the project received a budget-depletion warning —
and a large egress cost. The tables need only ~2% of that data: each board's id, slate
title, and first-4 pick names per seat.

The table keeps growing through draft season (participant capture ADR-009 + admin scraper
ADR-008), so the cost scaled with both data and traffic.

## Decision

When a client feature aggregates over a whole table, precompute a slim artifact
server-side (an admin script under `scripts/`) and serve it from Supabase **Storage** —
object reads cost no Postgres disk IO. The artifact's access boundary must match the table
it replaces: here, a **private** `app-data` bucket with an authenticated-read storage
policy (migration 016), because `draft_boards_admin` was authenticated-only and guests
have always resolved to empty combo tables.

First application: `scripts/build-combo-boards.mjs` →
`app-data/combo-boards-v1.json` (1.36 MB; 1,529 boards, 18,348 seats), consumed by
`realDraftData.js`.

## Alternatives Considered

### Option A: Precomputed Storage artifact (chosen)
- **Pros:** Eliminates the database read entirely (object storage, not Postgres); 45×
  smaller payload; the client's aggregation, classification, and own-roster merge logic
  stay unchanged; pattern reusable for any future whole-table aggregation.
- **Cons:** Artifact is stale until the script re-runs (ops step, cadence tracked in
  TASK-317); artifact schema becomes a script↔client contract (versioned `-v1` suffix).

### Option B: Server-side aggregate table in Postgres
- **Pros:** Always fresh if maintained by triggers; no new storage surface.
- **Cons:** Reads still cost Postgres disk IO; a multi-MB aggregate JSONB row is itself a
  TOAST detoast on every load; trigger maintenance is more complex than a rebuild script
  and the tables are tolerant of staleness anyway.

### Option C: Client-side IndexedDB cache of the full fetch
- **Pros:** No server or ops changes.
- **Cons:** Every device's first load still reads 62 MB from Postgres; cost scales with
  user count rather than data size; cache-invalidation logic on the client for a
  server-growth problem.

## Consequences

### Positive
- App-load database reads drop by ~62 MB per load; leading Disk IO Budget consumer removed.
- Egress per load drops ~45× (62 MB → 1.36 MB).
- Guests/auth behavior unchanged (private bucket mirrors the old RLS boundary).

### Negative
- Combo tables lag reality until `build-combo-boards.mjs` re-runs; new boards are
  invisible to the tables in the interim (refresh cadence / automation is TASK-317).
- The artifact schema is a contract: script and `realDraftData.js` must change together
  (breaking changes should bump the object name, e.g. `-v2`).

### Risks
- Silent staleness if the rebuild is forgotten mid-draft-season — rarity percentages
  drift. Mitigation: fold the run into an existing operational rhythm (weekly digest).

## Revisit Conditions

- Boards grow past ~10k or artifact size approaches ~10 MB (consider sharding or
  server-side aggregation).
- Freshness becomes user-visible (consider automating the rebuild via cron/Edge Function).
- Additional whole-table client aggregations appear (apply this pattern; if several
  accumulate, consider a general precompute pipeline).

## Related

- Tasks: TASK-315 (implementation), TASK-317 (refresh cadence + user-board caching)
- ADRs: ADR-008 (admin scraping pipeline), ADR-009 (participant-authorized capture)

---
*Approved by: developer (PH), 2026-07-09*
