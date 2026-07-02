<!-- Completed: 2026-07-02 | Commit: f5bb972 (verified shipped in 2026-07-02 launch review) -->
# TASK-284: Arena: enrollment toggle + paid-tier gating

**Status:** Approved (Level 3 auto-executed)
**Priority:** P2

## Objective
Per ADR-013, add an enroll/unenroll control on a user's own rosters that sets
eligibility for the vote pool + leaderboard. Enrolling is a **PAID-tier feature**
gated via `featureAccess.js`; viewing and voting remain free/guest. Enrollment is
explicit consent to public ranking.

## Design note (deviation from "in RosterViewer")
The objective suggested the toggle "e.g. in RosterViewer". Implemented instead as a
self-contained **My Teams** panel inside the Arena tab — same outcome (the user
enrolls their own rosters, paid-gated), lower risk (no edits to the complex
RosterViewer virtualization), and it keeps the Arena pillar cohesive. "e.g." made
RosterViewer a suggestion, not a requirement.

## Verification
- `npm run lint` clean; `npm run build` succeeds. ✅
- Gate uses `canAccessFeature(tier, 'arena_enroll')` (pro): guests see a sign-in prompt, non-pro see "Upgrade to Pro" (`openPlanPicker`), only pro see the enroll list.
- Enroll/unenroll write only `enrolled`/`display_snapshot`/`updated_at` on the owner's own rows (column-scoped grants respected; no upsert; no rating-column writes).
- Wired into Arena.jsx (My Teams nav + view; `rosterData` passed; `onGoToMyTeams` to ArenaVote).
- Graceful states: unavailable, no rosters synced, toggle error.
- Independent verifier verdict: **pass**.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `src/components/arena/ArenaMyTeams.jsx` | Create | Enroll/unenroll panel + paid gate + standings display |
| `src/components/Arena.jsx` | Modify | Add My Teams nav + view; pass rosterData + onGoToMyTeams |
| `src/components/Arena.module.css` | Modify | My Teams list/row/button styles |

(`featureAccess.js` `arena_enroll: 'pro'` and `arenaClient` enroll/unenroll were added in TASK-282's commit.)
