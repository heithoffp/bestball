<!-- Completed: 2026-04-03 | Commit: cee9a97 -->
# TASK-104: UI housecleaning — ADP filter, column spacing, Rankings title, Save button, hierarchical tournament dropdown

**Status:** Done
**Priority:** P3

---

## Objective

Fix five small UI/UX annoyances across the web app: filter ADP tracker to players with actual ADP data, widen the cramped right columns in the ADP tracker table, remove the redundant "Player Rankings" heading in the Rankings tab, fix the Save button's white-on-gold text contrast, and upgrade the tournament filter in Rosters and Exposures tabs to a grouped slate → tournament hierarchy.

## Verification Criteria

1. ADP Tracker list contains no rows with `displayAdp` of `'-'` (no-ADP players absent).
2. The 4 right columns (Exp, ADP, Value, Trend) in the ADP Tracker table have visible breathing room between them.
3. The Rankings tab header shows no "Player Rankings" h2 — only the search, Save, Export, and Upload buttons.
4. The Save button text is dark (not white) when the button is in its default gradient state; text turns white when the button shows Saved (green) or Error (red).
5. The tournament dropdown in both Exposure and Rosters tabs groups individual tournaments under their slate label, with an "All [Slate]" option per group.

## Verification Approach

Developer confirms visually in the running dev server (`npm run dev` from `best-ball-manager/`):
1. Open ADP Tracker — scroll the list and confirm no players show `'-'` in the ADP column.
2. Inspect the 4 right columns — confirm Exp, ADP, Value, Trend have visible spacing.
3. Open Rankings tab — confirm no "Player Rankings" heading renders in the header area.
4. In Rankings tab, inspect the Save button at rest (gold gradient) — text should be dark. Confirm text goes white after a save action.
5. In Exposure and Rosters tabs, open the tournament dropdown — confirm `<optgroup>` labels for each slate appear, with an "All [Slate]" entry and individual tournaments nested beneath.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/AdpTimeSeries.jsx` | Modify | Add `lastAdp !== null` filter in `filteredAndSortedList` useMemo |
| `best-ball-manager/src/components/AdpTimeSeries.module.css` | Modify | Widen right column widths; add `column-gap` to header and row grids |
| `best-ball-manager/src/components/PlayerRankings.jsx` | Modify | Remove `<h2>Player Rankings</h2>` (×2) and the now-empty `headerLeft` div |
| `best-ball-manager/src/components/PlayerRankings.module.css` | Modify | Change `.saveBtn` `color` from `white` to dark; inline style in JSX handles state overrides |
| `best-ball-manager/src/utils/extensionBridge.js` | Modify | Read `slate_title` from Supabase; pass `slateTitle` through `convertEntriesToRosterRows` |
| `best-ball-manager/src/components/ExposureTable.jsx` | Modify | Replace flat tournament `<select>` with `<optgroup>`-grouped select; update filter logic |
| `best-ball-manager/src/components/RosterViewer.jsx` | Modify | Same grouped select + filter update as ExposureTable (two dropdown instances) |

## Dependencies

None.

---

*Approved by: Patrick 2026-04-03*
