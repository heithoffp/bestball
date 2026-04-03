<!-- Completed: 2026-04-03 | Commit: cee9a97 -->
# TASK-124: Cross-module roster nav — core mechanism + Exposure Analysis integration

**Status:** Done
**Priority:** P2

---

## Objective

Build the shared navigation infrastructure for cross-module roster navigation and wire up the first integration: a `navigateToRosters(context)` callback (defined in `App.jsx`, passed as a prop) that switches the active tab to `rosters` and pre-seeds RosterViewer's player filter. Exposure Analysis gets a "See Rosters" button on each player row as the first integration point.

## Verification Criteria

1. Clicking "See Rosters" on a player row in Exposure Analysis switches to the Rosters tab with that player pre-populated in the `selectedPlayers` filter — rosters shown are only those containing that player.
2. A dismissible context banner is visible at the top of Roster Viewer when entered via cross-module nav: "Showing rosters containing [Player Name] — Clear filter". Clicking "Clear filter" dismisses the banner and removes the pre-seeded player from the filter.
3. After the banner is dismissed (or the user manually changes filters), the Roster Viewer behaves exactly as if it had been opened normally — no ghost state from the navigation context.
4. Navigating to the Rosters tab directly (clicking the tab) does not trigger the banner or pre-seed any filter.
5. The "See Rosters" button is not shown in mobile card view (where the row layout doesn't have room).

## Verification Approach

1. Run `npm run build` from `best-ball-manager/` — confirm clean build with no errors.
2. Run `npm run dev` and load the app with demo data.
3. Navigate to the Exposures tab. On a player row with count > 0, confirm a "See Rosters" button appears in the desktop table view.
4. Click the button — confirm the tab switches to Rosters, the player name appears as a selected player chip in the filter, the roster list is filtered to only rosters containing that player, and the context banner is visible.
5. Click "Clear filter" in the banner — confirm banner disappears and filter is cleared (all rosters shown).
6. Navigate away from Rosters and back — confirm no banner appears (context was cleared).
7. Click the Rosters tab directly from any other tab — confirm no banner, no pre-seeded filter.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/App.jsx` | Modify | Add `rosterNavContext` state; `navigateToRosters(context)` handler; pass `initialFilter` and `onNavigateToRosters` props to RosterViewer and ExposureTable |
| `best-ball-manager/src/components/RosterViewer.jsx` | Modify | Accept `initialFilter` prop; on mount/prop change initialize `selectedPlayers` from it; show dismissible banner when active |
| `best-ball-manager/src/components/ExposureTable.jsx` | Modify | Accept `onNavigateToRosters` prop; add "See Rosters" button in desktop table row (hidden on mobile) |

## Implementation Approach

### 1. App.jsx — add navigation state and handler

Add one new state and one callback:

```js
const [rosterNavContext, setRosterNavContext] = useState(null);
// { players: string[] } | null

const navigateToRosters = useCallback((context) => {
  setRosterNavContext(context);
  setActiveTab('rosters');
}, []);
```

Clear the context when the user navigates to Rosters directly (not via the callback):

- `navigateToRosters` sets context and switches tab (as above).
- Tab bar onClick: if `key === 'rosters'`, call `setRosterNavContext(null)` before `setActiveTab('rosters')`.

### 2. RosterViewer.jsx — accept and apply initialFilter

`selectedPlayers` and `navBannerPlayers` both seeded from `useState(() => initialFilter?.players ?? [])`. Banner shown when `navBannerPlayers.length > 0`; "Clear filter" clears both. Component re-mounts on every tab switch so initializer runs fresh.

### 3. ExposureTable.jsx — "See Rosters" button in desktop table

Narrow `colNav` column added to colgroup/thead. Each row with `displayCount > 0` gets a `seeRostersBtn` that calls `onNavigateToRosters({ players: [p.name] })`. Empty `<td>` rendered for 0-count rows to keep column alignment. Mobile card view unchanged.

## Dependencies

None

---
*Approved by: Patrick — 2026-04-03*
