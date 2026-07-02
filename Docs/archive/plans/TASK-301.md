<!-- Completed: 2026-07-02 | Commit: f5bb972 (verified shipped in 2026-07-02 launch review) -->
# TASK-301: Arena: featured-tournament scoping - Best Ball Mania pool + leaderboard filter

**Status:** Approved (Level 3 auto-executed)
**Priority:** P2
**Epic:** EPIC-07 (Best Ball Arena)

---

## Objective
With ~40 daily site visitors, votes spread across every synced tournament dilute the
Elo signal — no single queue converges. Scope the Arena to a **featured tournament**
(Best Ball Mania) so all votes concentrate on one comparable pool, and give the
leaderboard a matching Featured/All filter that defaults to the featured view.

## Decision
**Developer-granted in the goal statement** ("maybe we need to limit voting to specific
tournaments (best ball mania)"). Implementation choice (bounded, reversible): a shared
constant pattern-matched against `display_snapshot->>tournamentTitle` — no schema
migration, no config table change. The pairing pool **falls back to the full pool**
when the featured pool has < 2 votable teams, so this can never reintroduce
"No matchups yet". Board teams captured without a tournament title are matched by
their slate title as well. Revisit as a config-table value if featured tournaments
rotate often (noted for the backlog, not this task).

## Verification
- `arena-pair`: pool query first tries `display_snapshot->>tournamentTitle` /
  `slateTitle` ilike the featured pattern; if the votable result is < 2 teams it
  re-queries without the tournament filter (fallback preserves current behavior).
- `arenaClient.getLeaderboard` accepts a `tournament: 'featured'|'all'` option and
  applies the same ilike filter server-side; `ArenaLeaderboard` renders a
  Featured/All chip row defaulting to **featured**, alongside the platform filter.
- The featured pattern lives in exactly two constants (one Deno, one browser), both
  named `FEATURED_TOURNAMENT`, with comments cross-referencing each other.
- Voting screen context bar shows the tournament title when both snapshots share one.
- `cd best-ball-manager && npm run lint && npm run build` pass (no new errors vs
  pre-existing baseline).
- Independent verifier sub-agent reviews the diff against this plan.

## Files to Change
| File | Change |
|------|--------|
| `supabase/functions/_shared/arena.ts` | `FEATURED_TOURNAMENT` pattern constant |
| `supabase/functions/arena-pair/index.ts` | Featured-first pool query with full-pool fallback |
| `best-ball-manager/src/utils/arenaFeatured.js` (new) | Browser-side featured-tournament constant + matcher |
| `best-ball-manager/src/utils/arenaClient.js` | `getLeaderboard({ tournament })` filter |
| `best-ball-manager/src/components/arena/ArenaLeaderboard.jsx` | Featured/All chips, default featured |
| `best-ball-manager/src/components/arena/ArenaVote.jsx` | Context bar shows shared tournament title |

## Rollback
Revert the commit. Fallback semantics mean a bad pattern degrades to today's behavior,
not to an empty Arena.
