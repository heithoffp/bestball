<!-- Completed: 2026-06-20 | Commit: 28675fc -->
# TASK-277: Fix Eliminator bye window — build playerTeamMap/playerPositionMap from all rosters

**Status:** Approved (Level 3 auto-executed)
**Priority:** P2

---

## Objective

The Eliminator **Byes** floating window only showed bye weeks for players the user had
**previously drafted in the currently-selected tournament slate**. When only the Eliminator
slate was selected, the window dropped any current pick not already in a completed Eliminator
draft.

Root cause: in `applyPortfolioFilter()` (`chrome-extension/src/content/draft-overlay.js`),
`playerTeamMap` (canonicalName → NFL team abbreviation) and `playerPositionMap` were rebuilt
from the **slate-filtered** roster set. A pick's bye only renders when its team resolves
(`picksWithTeam()` → `draftTeamMap.get(key) || playerTeamMap.get(key)`), so a shrunken
fallback map silently dropped picks from the bye rainbow.

A player's NFL team and position are **slate-independent reference data** — identical in every
tournament. They must be built from all synced rosters, not the slate-filtered subset.

Sibling to **TASK-275** (the live-draft `draftTeamMap`, the primary team source for Underdog).
This task hardens the fallback path so the window degrades gracefully whenever the live bridge
map is incomplete (timeout, unresolved team, not signed in).

## Decision

Reference data (team, position) vs exposure data (roster membership, counts) must be scoped
differently. Reference maps build from `allEntries`; exposure data (`playerIndexMap`,
`totalRosters`, pick-samples) stays slate-filtered so exposure %, roster counts, and
correlation are unchanged. Bounded, single-file design call — applied in-loop under run-scoped
Level 3.

## Verification

1. **Build:** `cd chrome-extension && npm run build` — bundle succeeds. ✅ (passing)
2. **Independent verifier (design-bearing):** sub-agent confirmed reference maps build from
   `allEntries`, exposure maps stay `filtered`, no use-before-assignment, no exposure
   regression in `computeExposure`/`computeCorrelation`. ✅ PASS
3. **Manual (developer — requires a live Underdog Eliminator draft):** with **only** the
   Eliminator slate selected, draft a player not in a completed Eliminator draft and confirm
   the pick appears in the Byes window under the correct position + bye week; confirm exposure
   %/roster counts still reflect only the selected slate (no regression). Requires a rebuilt
   `dist/` bundle reloaded in the browser.

## Files to Change

| File | Change |
|------|--------|
| `chrome-extension/src/content/draft-overlay.js` | In `applyPortfolioFilter()`, build `playerTeamMap` and `playerPositionMap` from `allEntries` (slate-independent reference data); keep `playerIndexMap`, `totalRosters`, and the pick-samples map built from the slate-`filtered` set (exposure data). |

## Notes

Applied directly to the working tree (uncommitted) alongside in-flight TASK-275 per developer
choice — no isolated branch. Stays `In Progress` until the developer reviews and commits.
