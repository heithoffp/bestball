<!-- Completed: 2026-04-05 | Commit: pending -->
# TASK-137: DraftKings draft overlay not working in snake draft room

**Status:** Done
**Priority:** P2

---

## Objective

The DraftKings draft overlay (FAB panel + Exp/Corr injection on player rows) does not function when entering a DK snake draft page (`draftkings.com/draft/snake/*`). The overlay works correctly on Underdog. This was part of the TASK-132 scope but was not fully verified. Needs investigation into content script injection, DOM selector accuracy for DK's BaseTable rendering, possible SPA navigation issues preventing the content script from initializing on draft pages, and whether `getDraftState()` (currently throwing) needs implementation.

## Dependencies

- TASK-132 (DraftKings adapter) — complete.
- TASK-131 (adapter-agnostic overlay refactor) — complete.

## Open Questions

- Is the content script injecting at all on `/draft/snake/*` pages? (Check via console log or DevTools Sources panel.)
- Are the BaseTable DOM selectors (`getInjectionTarget()`, `getPlayerRows()`) matching elements on the live draft page, or does DK use different markup during an active draft vs. the lobby?
- Does the overlay require `getDraftState()` to be implemented, or does it function without it?
- Is DK's draft page an SPA that navigates without a full page load, potentially preventing the content script from running?

## Progress Notes (2026-04-05)

### Root causes identified and partially fixed:

1. **`processRow()` silently skipped all DK rows** — hardcoded `row.getAttribute('data-id')` returned null for DK rows (DK has no `data-id` attribute). Fixed by adding `adapter.getRowId(row)` — DK uses player name text as row key.

2. **Injection point mismatch** — Underdog has a `rightSide` container wrapping stat cells; DK has flat gridcell siblings. Fixed by adding `adapter.getInjectionPoint(row)` returning `{parent, before}` so each adapter controls placement.

3. **Abbreviated name matching** — DK shows "J. Jefferson" while portfolio data has "Justin Jefferson". Added `abbreviatedNameMap` built from portfolio data and `resolvePlayerKey()` function. Wired into `computeExposure()`, `computeCorrelation()`, `analyzeStackOverlay()`, `applyTierBreak()`.

4. **Header injection in wrong row** — DK has two header rows (grouped + columns). Fixed by finding the column header row via `[data-key="averageDraftPosition"]` + `closest('[role="row"]')`.

### Current blocker:

Row cells are injected with correct inline styles (`position: absolute; left: 635px`) and no `overflow: hidden` ancestor is clipping, but cells visually appear misplaced. BaseTable manages cell layout internally — injected elements with absolute positioning aren't rendering at the expected coordinates despite correct computed styles. Suspect BaseTable's CSS or a transform/stacking-context issue is interfering.

**Next steps:**
- Inspect whether BaseTable applies CSS transforms or uses a different positioning context
- Consider injecting into a layer outside BaseTable's managed DOM entirely
- Try using a fixed overlay layer positioned relative to viewport coordinates of each row

### Files changed:
- `chrome-extension/src/adapters/draftkings.js` — added `getRowId()`, `getInjectionPoint()`, `postInjectRow()`, `injectHeaderCells()`, updated `sortButtonsSelector`
- `chrome-extension/src/adapters/underdog.js` — added `getRowId()`, `getInjectionPoint()`
- `chrome-extension/src/content/draft-overlay.js` — updated `processRow()` to use adapter methods, added `resolvePlayerKey()` + `abbreviatedNameMap`, updated all metric functions to use name resolution, added DK overflow CSS rules
