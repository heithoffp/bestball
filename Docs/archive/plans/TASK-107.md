<!-- Completed: 2026-04-04 | Commit: c17767c -->
# TASK-107: Overlay confidence panel — tournament selection filter

**Status:** Done
**Priority:** P2

---

## Objective

Add a multi-select tournament filter to the overlay confidence panel so users can scope which entries feed the exposure and correlation data shown during a live draft. Filter options are unique `(tournamentTitle, slateTitle)` combos derived from the user's loaded entries. Nothing selected = all entries used (default). Selection persists across drafts via `chrome.storage.local`.

## Verification Criteria

1. Panel shows hierarchical slate→tournament checkboxes; slates collapsed by default, expandable via arrow
2. All checkboxes checked by default on first load
3. Slate checkbox shows indeterminate state when partially selected; toggles all its tournaments
4. Unchecking tournaments filters `playerIndexMap` to matching entries; exposure % updates accordingly
5. Filter selection persists in `chrome.storage.local` under `tournamentFilter` (array of tournament title strings)
6. Stale stored titles are silently pruned on load; empty after pruning → auto-select all
7. Clicking checkboxes does not close the panel

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/src/content/draft-overlay.js` | Modify | Hierarchical filter, slateGroups shape, applyPortfolioFilter(), collapsible slates, panel stopPropagation |

## Dependencies

TASK-100 — floating logo button and panel DOM structure (done).
TASK-106 — panel structure with divider pattern (same session).

---
*Approved by: Patrick — 2026-04-04*
