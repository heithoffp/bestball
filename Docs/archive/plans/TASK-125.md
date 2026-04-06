<!-- Completed: 2026-04-04 | Commit: 1457e4e -->
# TASK-125: Cross-module roster nav — Dashboard integration

**Status:** Done
**Priority:** P3

---

## Objective

Wire up the `navigateToRosters` mechanism (built in TASK-124) to three Dashboard touchpoints: Top Exposures player names, Archetype Distribution stacked bar segments, and Exposure by Round player entries. Users can drill from any headline dashboard insight directly into the matching rosters.

## Verification Criteria

1. Clicking a player name in Top Exposures switches to the Rosters tab, pre-seeds that player in the `selectedPlayers` filter, and shows the nav banner ("Showing rosters containing [name] — Clear filter").
2. Clicking an archetype segment (e.g., the RB_HERO bar) switches to Rosters with that archetype filter pre-selected (rbFilter = 'RB_HERO') and shows the nav banner ("Showing RB archetype: RB Hero — Clear filter").
3. Clicking the highest-exposure player in Exposure by Round switches to Rosters filtered to that player with nav banner.
4. Clicking the lowest-exposure player (non-blind-spot, count > 0) in Exposure by Round switches to Rosters filtered to that player with nav banner.
5. Blind spot entries (0% exposure) are not clickable — no cursor change, no onClick.
6. Clearing the archetype nav banner resets the triggered filter to 'all' and dismisses the banner. Other filters are unaffected.
7. Clearing the player nav banner (existing behavior) still works correctly.
8. Navigating to Rosters by clicking the tab bar directly shows no banner and no pre-seeded filter.
9. `npm run build` from `best-ball-manager/` passes clean with no errors.

## Verification Approach

1. Run `npm run build` from `best-ball-manager/` — confirm no errors.
2. Run `npm run dev` and load the app with demo data.
3. Navigate to Dashboard. On a player name in Top Exposures, confirm it appears clickable (cursor pointer, hover underline). Click it — confirm tab switches to Rosters, player chip appears in filter, banner is shown.
4. Back on Dashboard, click an archetype segment in the RB Archetype stacked bar — confirm Rosters tab opens with that RB archetype chip selected in the RB filter and banner shows the archetype name.
5. Click a QB or TE archetype segment — confirm the corresponding filter (qbFilter / teFilter) is set.
6. In Exposure by Round, click the highest-exposure player name — confirm Rosters filters to that player with banner.
7. Click a lowest-exposure player (non-blind-spot) — confirm same behavior.
8. Hover over a blind spot entry (0% gray names) — confirm no pointer cursor and no navigation on click.
9. Clear the archetype banner — confirm banner disappears and the archetype filter resets to 'all' while other filters are unchanged.
10. Navigate to Rosters via the tab bar — confirm no banner appears.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/App.jsx` | Modify | Pass `onNavigateToRosters={navigateToRosters}` to Dashboard |
| `best-ball-manager/src/components/Dashboard.jsx` | Modify | Accept `onNavigateToRosters` prop; add click handlers to Top Exposures names, archetype segments, and Exposure by Round player entries |
| `best-ball-manager/src/components/Dashboard.module.css` | Modify | Add `.playerLink` style (button reset + cursor pointer + hover underline) |
| `best-ball-manager/src/components/RosterViewer.jsx` | Modify | Extend `initialFilter` to accept `{ archetype: { rb?, qb?, te? } }`; init archetype filters from it; show archetype nav banner |

## Implementation Approach

### 1. App.jsx — pass prop to Dashboard

Add `onNavigateToRosters={navigateToRosters}` to the Dashboard JSX element alongside the existing `onNavigate` prop. No logic change needed.

### 2. Dashboard.jsx — accept prop and wire integration points

**Top Exposures player names:**

Replace the `<span className={styles.exposureName}>` with a `<button className={styles.playerLink}>` that calls `onNavigateToRosters({ players: [p.name] })` on click. Only applies when `onNavigateToRosters` is defined (prop defaults to `null`).

**Archetype Distribution stacked bar segments:**

Each segment `<div>` in the stacked bar already has a `title` but no onClick. Add:
- `onClick={() => onNavigateToRosters({ archetype: { [archetypeType]: seg.key } })}` where `archetypeType` is `'rb'`, `'qb'`, or `'te'` based on which bar is being rendered.
- `style={{ ..., cursor: onNavigateToRosters ? 'pointer' : 'default' }}`

The `.map()` already has access to `title` and `data` arrays per bar. Each bar renders inside `[{ title: 'RB Archetype', data: rbDistribution, type: 'rb' }, ...]`. Change the map to include a `type` field and thread it through to the segment onClick.

**Exposure by Round — Highest and Lowest:**

- **Highest** player: wrap `{r.highest.name}` in `<button className={styles.playerLink}>` calling `onNavigateToRosters({ players: [r.highest.name] })`.
- **Lowest** player (when `r.lowest` is not null — already only set when count > 0): same pattern.
- **Blind spots** (`r.blindSpots` entries): leave as plain `<span>` — no wrapping, no onClick.

### 3. Dashboard.module.css — `.playerLink` style

```css
.playerLink {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  text-align: left;
}
.playerLink:hover {
  text-decoration: underline;
}
```

### 4. RosterViewer.jsx — archetype filter context

**State initialization changes:**

```js
const [rbFilter, setRbFilter] = useState(() => initialFilter?.archetype?.rb ?? 'all');
const [qbFilter, setQbFilter] = useState(() => initialFilter?.archetype?.qb ?? 'all');
const [teFilter, setTeFilter] = useState(() => initialFilter?.archetype?.te ?? 'all');
```

**New state for archetype banner:**

```js
const [navBannerArchetype, setNavBannerArchetype] = useState(() => initialFilter?.archetype ?? null);
```

**Banner rendering:** Currently shows the player banner when `navBannerPlayers.length > 0`. Add an else-if block for `navBannerArchetype !== null`.

`ARCHETYPE_METADATA` is already imported in RosterViewer.

## Dependencies

TASK-124 — core navigation mechanism (Done)

---
*Approved by: Patrick — 2026-04-04*
