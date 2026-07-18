# ADR-030: Mobile launch data: on-device cache-first rendering with delta sync

**Date:** 2026-07-18
**Status:** Accepted

---

## Context

Every launch of the mobile app blocks the UI on a full network round of the user's
portfolio data. `PortfolioContext.loadData()` re-downloads **all** `extension_entries`
rows — including the `players` JSON — on every launch (~2 KB per entry; a 300-entry
portfolio re-fetches ~600 KB each time), then runs the local processing pipeline before
the first screen renders. Rankings load cloud-first (two Storage round-trips per
platform file) even though `storage.js` already persists a local copy it then ignores.
After first render, the prewarm re-fetches the combo-boards artifact and every captured
board's full `picks` JSONB again each session. The result is a long visible spinner on
every cold start, plus recurring Supabase egress that grows with portfolio size.

Constraints that shape the solution:

- The Chrome extension is the **only writer** of `extension_entries`, and it stamps
  `synced_at = now()` on every upsert (insert *and* update) — so a `synced_at` cursor
  catches all adds and edits. Deletions, however, are invisible to a timestamp delta.
- Captured boards (`draft_boards_admin`) are effectively immutable per `draft_id` once
  written.
- The codebase already has this caching pattern for *derived* results
  (`modelCache.js`, `podAdvanceStore.js`) — but not for source data.
- iOS-first product; AsyncStorage value-size limits are an Android concern but
  multi-MB JSON blobs are safer in a file store either way.
- Rosters only change when the extension syncs on desktop, so a few seconds of
  staleness on mobile is invisible in practice.

## Decision

Adopt a cache-first, refresh-in-background (stale-while-revalidate) strategy for all
mobile launch data:

1. **Entries cache + delta sync.** Persist the mapped `extension_entries` array, the
   `max(synced_at)` cursor, and the owning user id as a JSON file via
   `expo-file-system`. On launch, render immediately from the cache; in the
   background, fetch only rows with `synced_at > cursor` **plus** a lightweight
   `select entry_id` list to reconcile deletions. Merge, re-process, update state,
   rewrite the cache.
2. **Rankings local-first.** Read the locally persisted rankings copy immediately;
   refresh from cloud Storage in the background instead of blocking on it.
3. **Boards cached permanently per `draft_id`.** Captured boards are immutable, so
   cache them on device and only fetch ids never seen before. Cache the combo-boards
   artifact with a freshness window.
4. **Hygiene.** The cache is keyed by user id and cleared on sign-out via the existing
   `clearAllData()` path, so account switches cannot leak another user's portfolio.

## Alternatives Considered

### Option A: Cache-first + `synced_at` delta + id-list reconciliation (chosen)
- **Pros:** Launch renders at local-CPU speed with zero blocking network; no schema
  changes (cursor and reconciliation use existing columns); egress drops to
  near-zero on unchanged portfolios; extends an established in-repo pattern.
- **Cons:** Two background queries instead of one; correctness depends on every
  writer bumping `synced_at` (true today — single writer).

### Option B: Cache-first with full background refetch (no delta)
- **Pros:** Simplest possible correctness story — the background pass is exactly
  today's query; no cursor bookkeeping.
- **Cons:** Keeps paying full egress every launch (the recurring-bandwidth half of
  the problem); still worth having as the fallback path when the cursor is missing
  or the cache is corrupt — the chosen design degrades to this.

### Option C: Server-side tombstones / sync journal table
- **Pros:** Single delta query answers adds, updates, and deletes; textbook sync.
- **Cons:** New table + migration + new grants (post-2026-10-30 Supabase rules),
  extension write-path changes, and ongoing journal pruning — heavy machinery for a
  table with one writer and a cheap id-list alternative.

### Option D: Local database (expo-sqlite) as a true offline replica
- **Pros:** Structured queries, partial updates, scales to very large portfolios.
- **Cons:** New dependency and data layer for what is today a single read-all-rows
  consumer; the processing pipeline wants the full array in memory anyway, so SQL
  adds complexity without a consumer.

## Consequences

### Positive
- Cold-start renders from device storage at local-CPU speed; the spinner no longer
  scales with portfolio size or network quality.
- Supabase egress per launch drops from full-portfolio to near-zero when nothing
  changed; immutable board payloads are fetched at most once per device.
- Offline launches show the last-synced portfolio instead of an error.

### Negative
- A staleness window exists between render and background-refresh completion; data
  synced on desktop moments earlier appears after a beat rather than at first paint.
- Cache lifecycle becomes real surface area: invalidation on sign-out, user-id
  mismatch, corrupt-file recovery, and cursor resets all need explicit handling.
- Two sources of truth during the refresh merge — bugs here can show phantom or
  missing rosters until the next full refresh.

### Risks
- **Silent-update risk:** if any future writer updates `extension_entries` without
  bumping `synced_at`, deltas miss it. Mitigation: the id-list reconciliation catches
  adds/deletes regardless, and any full refresh (pull-to-refresh / cache miss)
  self-heals; document the invariant at the extension write path.
- **Board immutability assumption:** if a board row is ever re-scraped with corrected
  picks, permanently cached copies go stale. Mitigation: version the board cache key
  so a bump forces refetch.
- The pre-existing pagination gap in `readExtensionEntries` (PostgREST 1000-row cap)
  truncates large portfolios today; the delta path must paginate both the delta and
  id-list queries or the cache would *persist* the truncation.

## Revisit Conditions

- A second writer to `extension_entries` appears (e.g., server-side sync or another
  client) — revisit the single-writer `synced_at` invariant, likely via Option C.
- Portfolio sizes or new per-entry payloads push the cache file into tens of MB —
  revisit Option D (sqlite replica).
- Supabase adds a first-class changes/sync API for PostgREST tables — reevaluate
  hand-rolled cursors.

## Related
- Tasks: TASK-345
- ADRs: ADR-018 (precomputed Storage artifacts — the combo-boards artifact this
  caches), ADR-022 (Expo app shell)

---
*Approved by: Patrick (developer), 2026-07-18 — approved in discussion prior to drafting.*
