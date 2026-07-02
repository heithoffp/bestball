<!-- Completed: 2026-07-02 | Commit: f5bb972 (verified shipped in 2026-07-02 launch review) -->
# TASK-283: Arena: leaderboard view

**Status:** Approved (Level 3 auto-executed)
**Priority:** P2

## Objective
Per ADR-013, build the opt-in public Arena leaderboard: enrolled teams ranked by Elo
with W/L, win%, rank, and movement; a platform filter; and a "your rank" highlight for
the signed-in owner. Reads the arena tables (TASK-280); Elo populated by TASK-281.

## Verification
- `npm run lint` clean on Arena files (project has 3 unrelated pre-existing errors in AuthContext.jsx / HelpOverlay.jsx); `npm run build` succeeds. ✅
- Reads `getLeaderboard` (enrolled-only, Elo desc); renders rank, team (archetype summary), Elo, W–L, win%, movement; rows expand to the full `ArenaRosterCard`.
- Platform filter (All / Underdog / DraftKings) re-queries and re-ranks.
- "Your rank" summary + own-row highlight ("You" tag); **no other user's identity is exposed** (`user_id` used only to flag the viewer's own rows, never rendered).
- Movement computed client-side vs the viewer's last visit (per-platform localStorage); first visit shows neutral, not a false arrow.
- Top-3 podium rank chips (gold/silver/bronze).
- Independent verifier verdict: **pass**.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `src/components/arena/ArenaLeaderboard.jsx` | Create | Ranked table + platform filter + your-rank + movement + expandable rows |
| `src/components/Arena.jsx` | Modify | Add Leaderboard nav + view |
| `src/components/Arena.module.css` | Modify | Leaderboard table, podium rank chips, movement, mobile column drop |

(`getLeaderboard` was added to `arenaClient.js` in TASK-282's commit.)

## Known v1 limitation
- True historical rank movement needs a rank-snapshot table (none in v1). Movement is the honest client-side "since your last visit" delta; a server-side daily rank snapshot is the scale path (ADR-013 revisit).
