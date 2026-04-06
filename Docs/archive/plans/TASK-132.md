<!-- Completed: 2026-04-05 | Commit: see git history -->
# TASK-132: DraftKings adapter — entries scraping + draft overlay

**Status:** Approved
**Priority:** P2

---

## Objective

Add full DraftKings best-ball support to the Chrome extension: scrape completed NFL entries from the DK lineup API, and inject the Exp/Corr overlay + FAB panel on live DK snake draft pages. Users get the same overlay experience they have on Underdog.

## Verification Criteria

1. On `draftkings.com/mycontests`, triggering sync calls the lineup API and returns only NFL entries (`SportId === 1`), with each entry containing `entryId`, `draftDate`, `tournamentTitle`, and a `players` array with `name` and `position` per player.
2. On a live `draftkings.com/draft/snake/*` page, the FAB panel appears and the overlay injects exposure/correlation data into the player list rows.
3. Player rows in the picks panel are correctly read — filled slots have a name and position; empty slots are skipped.
4. No console errors on either page related to the DraftKings adapter.
5. The Underdog adapter continues to work unchanged after registry update.

## Verification Approach

1. Load the unpacked extension in Chrome DevTools.
2. Navigate to `draftkings.com/mycontests` — open DevTools Console, trigger sync via the popup or FAB, confirm entries are logged with correct shape.
3. Navigate to a live DraftKings best-ball draft — confirm FAB appears and overlay renders on player rows.
4. Navigate to an Underdog draft — confirm overlay still works.
5. Inspect Console for errors on both platforms.

Steps 2–5 require the developer (live browser interaction).

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/src/adapters/draftkings.js` | Create | New DraftKings platform adapter implementing the PlatformAdapter interface |
| `chrome-extension/src/adapters/registry.js` | Modify | Import and register draftkingsAdapter |
| `chrome-extension/manifest.json` | Modify | Add DraftKings host permissions and content script entry |

## Implementation Approach

### 1. `chrome-extension/src/adapters/draftkings.js`

Create the adapter with the full PlatformAdapter shape:

**`isMatch(url)`**
Match both pages this adapter serves:
```js
const { hostname, pathname } = new URL(url);
return hostname === 'www.draftkings.com' &&
  (pathname.startsWith('/mycontests') || pathname.startsWith('/draft/snake/'));
```

**`getEntries()`**
- Guard: throw `syncPageErrorMessage` if not on `/mycontests`.
- Fetch: `fetch('https://www.draftkings.com/lineup/getlineupswithplayersforuser', { credentials: 'include' })` — same-origin, no auth header needed.
- Filter: keep only entries where `SportId === 1` (NFL). Other sports (Golf = 13, etc.) are excluded.
- Map each lineup to `Entry`:
  - `entryId`: `String(lineup.LineupId)`
  - `tournamentTitle`: `String(lineup.ContestDraftGroupId)` (no tournament name in API response)
  - `draftDate`: parse `lineup.LastModified` from `/Date(1234567890000)/` format using `new Date(parseInt(lineup.LastModified.match(/\d+/)[0])).toISOString()`
  - `players`: map `lineup.Players` → `{ name: p.fn + ' ' + p.ln, position: p.pn, team: p.tid?.toString() ?? '', pick: idx + 1, round: 0 }`
  - Note: `round` is 0 because DK's lineup API returns players in roster-slot order, not draft-pick order. Pick number is a best-effort index. This is acceptable for exposure analysis.
  - Filter players: skip any with `pn === 'BN'`... actually keep all positions as-is — the web app normalizes via stableId. Keep all players including BN slots.

**`getDraftState()`**
Not implemented yet — throw `'[BBM] getDraftState() not implemented for DraftKings'`.

**`getInjectionTarget()`**
```js
return document.querySelector('.BaseTable__body');
```

**`getStyles()`**
```js
return {
  fontFamily:  '"Open Sans", sans-serif',
  fontSize:    '12px',
  textColor:   '#1a1a1a',
  bgColor:     'rgba(255, 255, 255, 0.95)',
  borderColor: '#e0e0e0',
};
```

**`getPlayerRows()`**
The player list and picks panel both use `.BaseTable__body` + `[role="row"].BaseTable__row`. Distinguish the player list by selecting the `BaseTable__body` that does NOT contain a `[data-key="position"]` header column (the picks panel has that header).
```js
const allBodies = document.querySelectorAll('.BaseTable__body');
const picksTable = document.querySelector('[data-key="position"]')?.closest('.BaseTable__table');
const playerListBody = [...allBodies].find(b => !picksTable?.contains(b));
return [...(playerListBody?.querySelectorAll('[role="row"].BaseTable__row') ?? [])];
```

**`selectors`**
```js
selectors: {
  gridSelector:              '.BaseTable__body',
  rowSelector:               '[role="row"].BaseTable__row',
  rightSideSelector:         '.CellBase_cellbase',
  statCellSelector:          '.NumberCell_number-cell',
  sortButtonsSelector:       '[role="row"].BaseTable__header-row',
  myPicksSelector:           '.PlayerCell_player-name',
  playerNameInRowSelector:   '.PlayerCell_player-name',
  positionSectionSelector:   '[role="row"].BaseTable__row',
  positionHeaderSelector:    '.DKResponsiveGrid_dk-grid-cell',
}
```

**`isMyRankSort()`**
DraftKings has no "My Rank" sort — return `false`.

**`syncPageErrorMessage`**
`'Navigate to your DraftKings My Contests page first'`

**Picks panel reading** (used by draft-overlay.js via selectors):
- Picks panel: `document.querySelector('[data-key="position"]')?.closest('.BaseTable__table')`
- Filled pick rows: rows inside picks panel body that contain `.PlayerCell_player-name`
- Name: `.PlayerCell_player-name` text
- Position: first gridcell's `.DKResponsiveGrid_dk-grid-cell` text

### 2. `chrome-extension/src/adapters/registry.js`

Add import and register:
```js
import draftkingsAdapter from './draftkings.js';

const adapters = [
  underdogAdapter,
  draftkingsAdapter,
];
```

### 3. `chrome-extension/manifest.json`

Add to `host_permissions`:
```json
"https://www.draftkings.com/*"
```

Add to `content_scripts` array:
```json
{
  "matches": ["https://www.draftkings.com/*"],
  "js": ["src/content/content.js"],
  "run_at": "document_idle"
}
```

No `world: MAIN` bridge script needed — DraftKings entries are fetched via a direct same-origin `fetch()` call from the content script, not intercepted from a page-injected script.

## Dependencies

- TASK-131 (adapter-agnostic overlay refactor) — **complete**.

---
*Approved by: <!-- developer name/initials and date once approved -->*
