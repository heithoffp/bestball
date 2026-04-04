# TASK-131: Refactor draft-overlay.js to be adapter-agnostic

**Status:** Pending Approval
**Priority:** P2

---

## Objective

Move all Underdog-specific DOM selector constants and helper functions out of `draft-overlay.js` and into the adapter interface, so the overlay works with any registered platform adapter. This is a pure refactor — no behavioral change on Underdog, and it unblocks DraftKings overlay support (TASK-132).

## Verification Criteria

1. Loading the Underdog draft page still shows Exp/Corr columns, tier badges, the FAB button, and the confidence panel — identical to pre-refactor behavior.
2. `draft-overlay.js` contains no hardcoded Underdog-specific strings (no `playerPickCell`, `rightSide`, `statCell`, `playerListSortButtons`, `playerName`, `positionSection`, `positionHeader`, `styles__active__A5wMB`, `Underdog` in log messages).
3. The adapter instance is the sole source of platform selectors and `isDraftPage()` / `isMyRankSort()` logic.
4. `eslint` passes with no new warnings.

## Verification Approach

1. Grep `draft-overlay.js` for each hardcoded string listed in criterion 2 — expect zero matches.
2. Run `npm run lint` from `best-ball-manager/` — clean pass (lint covers the extension via shared config if applicable; otherwise inspect manually).
3. Developer: load the extension on an Underdog draft page and confirm Exp/Corr columns, tier badges, FAB, and panel all work normally.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/src/adapters/interface.js` | Modify | Add `selectors` object typedef, `isMyRankSort()` method, and `syncPageErrorMessage` property to `PlatformAdapter` |
| `chrome-extension/src/adapters/underdog.js` | Modify | Add `selectors` object with all 9 selector constants, `isMyRankSort()` implementation (moved from overlay), `syncPageErrorMessage` string |
| `chrome-extension/src/content/draft-overlay.js` | Modify | Replace 9 hardcoded constants with `adapter.selectors.*`; replace `isDraftPage()` and `isMyRankSort()` calls with `adapter.*`; accept `adapter` as first param in `initDraftOverlay`; remove the exported `isDraftPage()` function; fix log message |
| `chrome-extension/src/content/content.js` | Modify | Pass `adapter` as first argument to `initDraftOverlay` |

## Implementation Approach

### 1. Extend `adapters/interface.js`

Add to the `PlatformAdapter` typedef:

```js
/**
 * @property {Object} selectors
 *   Platform-specific CSS selectors for DOM injection.
 * @property {string} selectors.gridSelector           - Virtualized grid container
 * @property {string} selectors.rowSelector            - Individual player row element
 * @property {string} selectors.rightSideSelector      - Right-side stat area within a row
 * @property {string} selectors.statCellSelector       - Native stat cell (ADP/Proj) within rightSide
 * @property {string} selectors.sortButtonsSelector    - Sort button bar above the draft board
 * @property {string} selectors.myPicksSelector        - "My team" picked player cells
 * @property {string} selectors.playerNameInRowSelector - Player name element within a row
 * @property {string} selectors.positionSectionSelector - Position grouping section in "my team"
 * @property {string} selectors.positionHeaderSelector  - Position label within a positionSection
 *
 * @property {() => boolean} isMyRankSort
 *   Returns true when the draft board is currently sorted by the user's custom rank.
 *   Return false if the platform has no such sort mode.
 *
 * @property {string} syncPageErrorMessage
 *   Error message shown in the panel when the user triggers sync but is not on
 *   the platform's completed entries page.
 */
```

### 2. Update `adapters/underdog.js`

Move the 9 selector constants out of `draft-overlay.js` and into the adapter object:

```js
selectors: {
  gridSelector:              '[role="grid"]',
  rowSelector:               '[data-testid="player-cell-wrapper"]',
  rightSideSelector:         '[class*="rightSide"]',
  statCellSelector:          '[class*="statCell"]',
  sortButtonsSelector:       '[class*="playerListSortButtons"]',
  myPicksSelector:           '[class*="playerPickCell"]',
  playerNameInRowSelector:   '[class*="playerName"]',
  positionSectionSelector:   '[class*="positionSection"]',
  positionHeaderSelector:    '[class*="positionHeader"]',
},

isMyRankSort() {
  const activeBtn = document.querySelector('button.styles__active__A5wMB');
  return activeBtn?.querySelector('span')?.textContent?.trim().toLowerCase() === 'my rank';
},

syncPageErrorMessage: 'Navigate to your Underdog entries page first',
```

### 3. Refactor `draft-overlay.js`

**Module-level constants block (lines 17–23):** Delete all 9 `const X_SELECTOR = ...` lines. They will be referenced as `adapter.selectors.*` throughout.

**`initDraftOverlay` signature:** Change from `initDraftOverlay(onSync = null)` to `initDraftOverlay(adapter, onSync = null)`. Store `adapter` in a module-level variable so all functions can access it.

**Replace all usages of the 9 constants** (9 constants, ~14 call sites):
- `GRID_SELECTOR` → `adapter.selectors.gridSelector`
- `ROW_SELECTOR` → `adapter.selectors.rowSelector`
- `RIGHT_SIDE_SELECTOR` → `adapter.selectors.rightSideSelector`
- `STAT_CELL_SELECTOR` → `adapter.selectors.statCellSelector`
- `SORT_BUTTONS_SELECTOR` → `adapter.selectors.sortButtonsSelector`
- `MY_PICKS_SELECTOR` → `adapter.selectors.myPicksSelector`
- `PLAYER_NAME_IN_ROW_SELECTOR` → `adapter.selectors.playerNameInRowSelector`
- `POSITION_SECTION_SELECTOR` → `adapter.selectors.positionSectionSelector`
- `POSITION_HEADER_SELECTOR` → `adapter.selectors.positionHeaderSelector`

**`isDraftPage()` (exported, line 96):** Delete this function entirely. Replace the two internal call sites with `adapter.isDraftPage()`. The export is unused in `content.js` (which calls `initDraftOverlay` and never imports `isDraftPage`).

**`isMyRankSort()` (lines 88–92):** Delete this function. Replace the two call sites (`applyTierBreak` and `injectHeaders`) with `adapter.isMyRankSort()`.

**`handleUrlChange()` (line 1544):** The `wasOnDraft` line currently re-implements the Underdog URL pattern inline:
```js
const wasOnDraft = /^\/draft\/[a-f0-9-]+/i.test(new URL(lastUrl).pathname);
```
Replace with a URL-based call. Since `adapter.isDraftPage()` reads `window.location` (current URL), we need a different approach for the *previous* URL. Either:
- Add an optional `isDraftUrl(url)` to the adapter interface, or
- Store a boolean `wasOnDraftPage` before updating `lastUrl`.

The simplest approach: store `let wasOnDraftPage = false` and update it before saving `lastUrl`:
```js
function handleUrlChange() {
  const currentUrl = window.location.href;
  if (currentUrl === lastUrl) return;

  const wasOnDraft = wasOnDraftPage;
  lastUrl = currentUrl;
  wasOnDraftPage = adapter.isDraftPage();
  const isOnDraft = wasOnDraftPage;
  ...
}
```
Initialize `wasOnDraftPage = adapter.isDraftPage()` at `initDraftOverlay` time.

**`handleSync()` error message (line 393):** Replace hardcoded `'Navigate to your Underdog entries page first'` with `adapter.syncPageErrorMessage`. Same for the catch block message at line 434.

**Log message (line 1587):** Replace `'[BBM] Initializing on Underdog page'` with `\`[BBM] Initializing on ${adapter.constructor?.name ?? 'platform'} page\`` or simply `'[BBM] Initializing draft overlay'`.

### 4. Update `content.js`

Change the `initDraftOverlay` call to pass `adapter` as the first argument:
```js
initDraftOverlay(adapter, () => adapter.getEntries().then(entries => writeEntries(entries)));
```

## Dependencies

None — pure refactor with no external dependencies.

## Open Questions

- **`isDraftUrl(url)` vs `wasOnDraftPage` flag:** The plan uses a module-level boolean flag rather than adding a new `isDraftUrl(url)` method to the interface. This avoids expanding the interface for an edge case. The DraftKings adapter will use the same approach.

---
*Approved by: <!-- developer name/initials and date once approved -->*
