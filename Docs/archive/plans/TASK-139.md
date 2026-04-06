<!-- Completed: 2026-04-05 | Commit: pending -->
# TASK-139: DraftKings overlay — stack pills not appearing on player rows

**Status:** Done
**Priority:** P2

---

## Objective

Fix stack pills (inline badges showing stack relationships like "QB+WR") so they appear on DraftKings draft pages. Currently they only work on Underdog due to a hardcoded DOM selector.

## Verification Criteria

1. `applyStackBadge()` in `draft-overlay.js` uses the active adapter's `stackPillTargetSelector` instead of the hardcoded `[class*="playerPosition"]` selector.
2. DraftKings adapter exposes `stackPillTargetSelector: '.PlayerCell_player-position-and-team'`.
3. Underdog adapter exposes `stackPillTargetSelector: '[class*="playerPosition"]'` (preserves existing behavior).
4. The adapter interface documents the new selector property.
5. Extension builds without errors (`npm run build` in `chrome-extension/`).

## Verification Approach

1. Review the four changed files to confirm the selector wiring is correct.
2. Run `npm run build` in `chrome-extension/` — expect clean build with no errors.
3. Developer manually tests on a DraftKings draft page: stack pills should appear next to players whose teammates are already drafted.
4. Developer manually tests on an Underdog draft page: stack pills still appear (no regression).

Steps 1-2 can be run by Claude. Steps 3-4 require the developer.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/src/adapters/interface.js` | Modify | Document `stackPillTargetSelector` in selectors JSDoc |
| `chrome-extension/src/adapters/underdog.js` | Modify | Add `stackPillTargetSelector: '[class*="playerPosition"]'` to selectors |
| `chrome-extension/src/adapters/draftkings.js` | Modify | Add `stackPillTargetSelector: '.PlayerCell_player-position-and-team'` to selectors |
| `chrome-extension/src/content/draft-overlay.js` | Modify | Use `adapter.selectors.stackPillTargetSelector` + scope overflow to rows |

## Implementation Approach

1. In `interface.js`, add `stackPillTargetSelector` to the selectors documentation — the element within a player row where stack pills should be appended.
2. In `underdog.js`, add `stackPillTargetSelector: '[class*="playerPosition"]'` to the adapter's `selectors` object. This preserves the current working behavior.
3. In `draftkings.js`, add `stackPillTargetSelector: '.PlayerCell_player-position-and-team'` to the adapter's `selectors` object.
4. In `draft-overlay.js`, change `applyStackBadge()` to use `adapter.selectors.stackPillTargetSelector` instead of the hardcoded selector.
5. Bonus fix: scoped `overflow: visible !important` CSS from `.BaseTable__body, .BaseTable__table` to `.BaseTable__row` to restore DK table scrolling.

## Dependencies

- TASK-137 (DK overlay working) — complete.
- TASK-138 (abbreviated name disambiguation) — complete.

---
*Approved by: PH — 2026-04-05*
