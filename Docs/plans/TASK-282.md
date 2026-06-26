# TASK-282: Arena: voting UI (Arena.jsx + route/tab + arenaClient)

**Status:** Approved (Level 3 auto-executed)
**Priority:** P1

## Objective
Per ADR-013, build the LLM-arena-style voting screen: a new `/arena` route + tab in
App.jsx, `arenaClient.js` wrapping the Edge Function calls, a blind two-roster
head-to-head card (reusing the RosterViewer position/archetype idiom), pick/skip
buttons, an instant Elo-delta reveal, and auto-advance. Free and guest-accessible
(top-of-funnel). Built against the TASK-281 contract; designed with the
`frontend-design` skill (scoreboard personality, gold VS-medallion signature).

## Verification
- `npm run lint` clean on all new files; `npm run build` succeeds. ✅ (lint exit 0, build ✓)
- `/arena` registered in App.jsx (TAB_PATHS, tabs, lazy import, render) and rendered **without** a LockedFeature wrapper (guest-accessible); `featureAccess.js` has `arena: 'guest'`.
- `arenaClient.js` request/response shapes match the Edge Functions exactly (pairing `{pairing:{token,team_a:{id,display_snapshot},...}}`; vote `{token,winner:'a'|'b',guestId}` → `{counted,team_a:{delta},...}`).
- Voting flow: fetch pairing → two blind cards + VS medallion → pick/skip → instant reveal (winner glow + Elo deltas) → auto-advance; empty / unavailable / rate-limited / error states handled; guest-cap nudge shown.
- Independent verifier verdict: **pass**.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `src/utils/arenaClient.js` | Create | Edge Function calls (pair/vote) + guest id + leaderboard/enroll reads (full client) |
| `src/utils/arenaSnapshot.js` | Create | Build anonymized display snapshots from roster rows |
| `src/components/Arena.jsx` | Create | Arena container + sub-nav (Vote) + help |
| `src/components/Arena.module.css` | Create | Scoreboard styling, VS medallion, reveal animations, responsive |
| `src/components/arena/ArenaRosterCard.jsx` | Create | Blind roster card (snapshot only, no owner identity) |
| `src/components/arena/ArenaVote.jsx` | Create | Voting flow + reveal + states |
| `src/App.jsx` | Modify | `/arena` route + tab + render (guest-accessible) |
| `src/utils/featureAccess.js` | Modify | `arena: 'guest'`, `arena_enroll: 'pro'` |
| `src/index.css` | Modify | Mobile tab grid → 2×5 for the added 10th tab |

## Notes / known limits
- Full pair→vote loop needs the deployed Edge Functions; until then `ARENA_AVAILABLE` is false and the screen shows a friendly "warming up" state.
- Leaderboard + My Teams views are added by TASK-283 / TASK-284 (this commit ships the Vote view + full client).
