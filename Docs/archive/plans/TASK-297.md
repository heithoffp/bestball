<!-- Completed: 2026-07-02 | Commit: f5bb972 (verified shipped in 2026-07-02 launch review) -->
# TASK-297: Arena 'Tale of the Tape' redesign + CLV + perf

**Status:** Approved (developer pre-approved via /frontend-design session 2026-06-29)
**Priority:** P2
**Epic:** EPIC-07 (Best Ball Arena)

---

## Objective
Redesign the Best Ball Arena voting screen from two identical gray columns into a
prizefight **"Tale of the Tape"** scorecard: red/blue corner contender cards (corner
color random per-matchup and positional — never owner-derived, so ADR-013 blind
fairness holds) flanking a central stat-comparison spine. Surface the tournament
title + slate name (already in `display_snapshot`, currently unrendered), make **total
team CLV** the headline spine stat with **per-player CLV micro-bars**, add
position-colored **monogram avatars**, and make matchups feel instant via **prefetch +
a skeleton** loading state.

## Verification Criteria
1. The voting screen renders the new scorecard: two corner cards + central spine, with a
   context bar showing tournament title (when present) and slate name.
2. Total team CLV appears as the spine's headline stat for both teams; each player row
   shows a CLV micro-bar + value when ADP is available, and a graceful "—" when not.
3. Corner colors (red/blue) are assigned by board side at render time only — not derived
   from owner/user identity; own teams are still never shown, no owner identity leaks.
4. Advancing to the next matchup is instant when a prefetched pairing is ready; a skeleton
   (not a bare spinner) shows on cold loads.
5. Old `display_snapshot` rows without CLV/ADP still render without errors.
6. `npm run lint` and `npm run build` both pass.
7. Responsive: corners stack vertically below 900px; `prefers-reduced-motion` disables the
   clash/surge animations.

## Verification Approach
- `cd best-ball-manager && npm run lint && npm run build` — both exit 0.
- `npm run dev` + load `/arena` (beta account) and eyeball the scorecard, context bar,
  CLV bars, reveal animation; throttle network to confirm the skeleton + instant advance.
  (Manual step — developer confirms.)
- Code inspection: corner color derives from render-side index, not `user_id`; snapshot
  enrichment is null-safe.

## Files to Change
| File | Change |
|------|--------|
| `src/utils/arenaSnapshot.js` | `buildSnapshot` accepts an optional ADP lookup; writes per-player `adp` + `clv` and team `clvTotal`/`avgCLV` into the snapshot. New helper to build the lookup from `masterPlayers`. |
| `src/components/Arena.jsx` | Thread `masterPlayers` into the ADP lookup used by auto-register/enrollment so new snapshots carry CLV. |
| `src/components/arena/ArenaVote.jsx` | Prefetch next pairing during the reveal window; skeleton loading state; pass corner side to the cards. |
| `src/components/arena/ArenaRosterCard.jsx` | New "contender" layout: corner header, monogram avatars, per-player CLV micro-bars; expose values for the spine. |
| `src/components/arena/ArenaTape.jsx` (new) | The central comparison spine (Total CLV, stack, archetype, picks) — A-value \| B-value with winner-side highlight. |
| `src/components/Arena.module.css` | Tale-of-the-Tape layout, corner tints, spine, monograms, CLV bars, skeleton, reveal motion, mobile reflow. |

## Implementation Approach
1. **Data:** add a `buildAdpLookup(masterPlayers)` (name→latest ADP via `stableId`) and
   enrich `buildSnapshot` to compute CLV (`calcCLV`) per player + a team total/avg. Keep it
   optional so callers without `masterPlayers` still work; display layer treats missing
   CLV as "—".
2. **Layout:** rebuild `ArenaRosterCard` as a corner contender (red/blue tint passed in by
   side), with monogram avatars (initials on a position-colored disc) and a thin
   center-baseline CLV bar per row. Extract the central spine into `ArenaTape` so the
   comparison logic (which side wins each stat) lives in one place.
3. **Perf:** in `ArenaVote`, kick off a background `getPairing()` as soon as the current
   pairing is shown; on vote-reveal, swap in the prefetched pairing instantly after the
   reveal window. Replace the spinner state with a skeleton tape.
4. **Polish:** clash-in entrance + winner surge / loser desaturate, all gated behind
   `prefers-reduced-motion`. Verify lint + build.

## Rollback Approach
Revert the commit; all changes are additive to the Arena component tree and the snapshot
shape is backward-compatible (extra JSONB keys), so no data migration to undo.

## Notes
- Real player headshots are deferred to **TASK-298** (needs an ADR for the external image
  source); this task ships the monogram fallback that the headshot enhances.
