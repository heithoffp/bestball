# TASK-316: Arena featured flag + partial indexes: stop JSONB ilike scans in pair/leaderboard

**Status:** Approved (developer pre-approved in session, 2026-07-09)
**Priority:** P1

---

## Objective

Make the Arena's hot queries index-served instead of JSONB-scan-served. Today `arena-pair`
(every matchup fetch, guests included) and the leaderboard/rank/search reads filter
`arena_teams` (16,379 rows, ~2 KB `display_snapshot` each) with
`ilike '%best ball mania%'` over JSONB extractions and sort on unindexed columns
(`matches`, filtered `elo`), forcing a detoast scan of the ~5,444-row enrolled pool to
return a 412-row featured pool — measured 250–550 ms per request. Secondary contributor to
the Disk IO Budget depletion (2026-07-09).

## Design

1. **Migration `supabase/migrations/016_arena_featured_flag.sql`:**
   - `featured boolean` **stored generated column** on `arena_teams`:
     `position('best ball mania' in lower(coalesce(display_snapshot->>'tournamentTitle','')...)` OR the
     same over `slateTitle`. Snapshots are frozen at registration, so the flag is a
     write-time fact; a generated column keeps every write path (arena-register Edge
     Function, direct client inserts, backfill scripts) correct with no code changes.
     Backfill is implicit (adding a stored generated column rewrites the 16k-row table once).
   - Partial indexes matching the two hot query shapes:
     - `arena_teams_pair_pool_idx on (matches) where enrolled and source='owned' and featured`
       → arena-pair's `order by matches asc limit 200` becomes a bounded index scan.
     - `arena_teams_featured_lb_idx on (elo desc) where enrolled and source='owned' and featured`
       → leaderboard page + rank counts become index(-only) scans.
   - `grant select (featured)` to `anon, authenticated` (migration 012 made the client
     SELECT column-scoped, so the new column needs an explicit grant).
   - Header note: the pattern must stay in sync with `FEATURED_TOURNAMENT_LABEL`
     (`_shared/arena.ts` / `arenaFeatured.js`); featuring a different tournament means
     dropping and re-adding the generated column.
2. **`supabase/functions/arena-pair/index.ts`:** replace `.or(FEATURED_TOURNAMENT_OR_FILTER)`
   with `.eq('featured', true)`. Requires `supabase functions deploy arena-pair` after merge
   (arena-vote untouched).
3. **`best-ball-manager/src/utils/arenaClient.js`:** `getLeaderboard`, `searchLeaderboard`,
   `getMyBestArenaTeam`, `getArenaRank` replace `.or(FEATURED_TOURNAMENT.orFilter)` with
   `.eq('featured', true)`.
4. **Leaderboard count cache:** `getLeaderboard` requests `count: 'exact'` only on cache
   miss per `(platform, tournament)` for the session; pagination reuses the cached total.
   Cache invalidated by `registerArenaTeams` / `setArenaEnrollment` (the two client actions
   that change pool membership).
5. `FEATURED_TOURNAMENT_OR_FILTER` / client `orFilter` retired (single source of truth
   becomes the generated column + label constant).

## Verification Criteria

- Migration applies cleanly to production; `featured` count matches the previous
  ilike-filter count (412 enrolled+owned featured teams as of 2026-07-09).
- The pair-pool query shape (`eq featured` + `order matches limit 200`) returns the same
  200 rows as the old or-ilike shape, measurably faster (was ~300 ms).
- Leaderboard/search/rank return identical rows/totals via `eq('featured', true)`.
- Repeat `getLeaderboard` calls in one session issue no second exact-count (verified by
  code inspection of the cache path).
- `npm run lint && npm run build` pass; no remaining references to the retired or-filter.

## Verification Approach

1. Apply migration (SQL editor / CLI). Run a service-role count comparison:
   old or-ilike filter vs `featured=true` — counts must match.
2. Re-run the timed pool query from the investigation diagnostic; compare latency.
3. `grep -R "FEATURED_TOURNAMENT_OR_FILTER\|orFilter" best-ball-manager/src supabase/functions` → only
   retired/absent.
4. `npm run lint && npm run build`.
5. Manual (developer): after `supabase functions deploy arena-pair`, fetch a matchup in the
   live Arena and confirm pairing + voting still work end-to-end.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/016_arena_featured_flag.sql` | Create | Generated `featured` column, partial indexes, column grant |
| `supabase/functions/arena-pair/index.ts` | Modify | Pool query filters on `featured` |
| `supabase/functions/_shared/arena.ts` | Modify | Retire `FEATURED_TOURNAMENT_OR_FILTER`, point docs at the column |
| `best-ball-manager/src/utils/arenaClient.js` | Modify | `eq('featured')` filters + session count cache |
| `best-ball-manager/src/utils/arenaFeatured.js` | Modify | Retire client orFilter |
| `docs/Feature_Specs/Best_Ball_Arena.md` | Modify | Document the featured column + index-served queries |

## Rollback Approach

Queries are backward-compatible with the old filter: revert the code commits (functions +
client) and redeploy `arena-pair` — the ilike path works with or without the column.
`featured` + indexes can then be dropped with a follow-up
`alter table ... drop column featured` if desired.
