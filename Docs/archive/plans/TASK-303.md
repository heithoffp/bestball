<!-- Completed: 2026-07-02 | Commit: f5bb972 (verified shipped in 2026-07-02 launch review) -->
# TASK-303: Arena: leaderboard Elo visualization + your-team placement upgrade

**Status:** Approved (Level 3 auto-executed)
**Priority:** P2
**Epic:** EPIC-07 (Best Ball Arena)

---

## Objective
The leaderboard is a flat table: Elo is a bare number, the top 3 get only a colored
rank chip, and "Your best: #N" is a text fragment. Make the standings glanceable and
make the viewer's own placement a first-class moment:

1. **Podium strip** — the top 3 as champion cards (gold/silver/bronze) above the
   table: rank, build archetype, Elo, record.
2. **Elo bars** — a thin bar behind each row's Elo scaled to the visible min–max
   range, so the rating distribution is visible at a glance.
3. **Your-team banner** — a pinned summary card: true rank (server count of teams
   with higher Elo under the active filters — not just position within the fetched
   200), total pool size, percentile, Elo, W–L, and a "Find my team" action that
   scrolls to and flashes the row when it's within the fetched page.
4. Keeps the platform filter and the TASK-301 Featured/All tournament filter.

## Decision
Bounded UI design under the developer's blanket grant for this run. True-rank uses
two `head: true` count queries under existing RLS (no schema change).

## Verification
- Top 3 render as podium cards AND remain in the table (podium is a summary, not a
  removal — rank numbering unchanged).
- Each row shows an Elo bar whose width is scaled within the currently visible rows;
  bars re-scale when filters change.
- Signed-in owner with at least one ranked team sees the banner with rank/total/
  percentile consistent with the count queries; "Find my team" scrolls to the row
  and flashes it; the action is hidden when the row is outside the fetched page.
- Guests and owners with no ranked teams see no banner (no errors).
- `cd best-ball-manager && npm run lint && npm run build` pass (no new errors vs
  baseline).
- `docs/Feature_Specs/Best_Ball_Arena.md` updated for TASK-300..303 behavior.
- Independent verifier sub-agent reviews the diff against this plan.

## Files to Change
| File | Change |
|------|--------|
| `best-ball-manager/src/components/arena/ArenaLeaderboard.jsx` | Podium strip, Elo bars, your-team banner, find-my-team |
| `best-ball-manager/src/utils/arenaClient.js` | `getArenaRank` count helper |
| `best-ball-manager/src/components/Arena.module.css` | Podium, bars, banner, row flash |
| `docs/Feature_Specs/Best_Ball_Arena.md` | Spec update for the run's Arena changes |

## Rollback
Revert the commit — pure frontend + docs, no data/API change.
