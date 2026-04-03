<!-- Completed: 2026-04-03 | Commit: cee9a97 -->
# TASK-101: Fix overlay headers (Exp/Corr) not rendering on navigate-to-draft from preview window

**Status:** Draft
**Priority:** P2

---

## Objective

When the user is on a smaller Underdog draft preview/lobby page and clicks "Go to Draft" to enter the full draft room, the Exp and Corr column headers are not injected. The row-level overlay elements inject correctly but the sort-bar headers are missing. This is a navigation timing bug — `injectHeaders()` runs before the sort bar DOM is present after the page transition.

## Dependencies

TASK-096 (overlay infrastructure — Done)

## Open Questions

- What URL pattern does the preview/lobby page use vs the full draft URL? Confirm both match `isDraftPage()` or if the preview is a different route.
- Root cause is likely that `injectHeaders()` is called during the initial `sweepRows()` RAF, but the `[class*="playerListSortButtons"]` element hasn't mounted yet after the SPA navigation. The reconnecting observer on the grid fires and re-sweeps rows, but headers need their own retry loop since they depend on a different DOM element than the grid.
- Fix approach: `injectHeaders()` already returns early if `sampleRow` is absent (retry on next sweep). The issue may be that after "Go to Draft" navigation, `startOverlay()` is not called again because `gridObserver` is already set (guard `if (gridObserver) return`). Need to confirm whether the SPA navigation tears down and re-mounts the grid or keeps it.
