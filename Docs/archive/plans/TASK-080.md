<!-- Completed: 2026-04-02 | Commit: 26c7181 -->
# TASK-080: Roster Viewer: Merge Player & Team search into a single combined filter

**Status:** Approved
**Priority:** P3

---

## Objective

Replace the two side-by-side `MultiSelectInput` controls ("Player Search" and "Team Stack") in Roster Viewer with a single `CombinedSearchInput` widget that accepts both player names and NFL team abbreviations in one input. Chips are color-coded by type using design tokens (`--positive` for players, `--info` for teams) and carry a muted type prefix (`PL` / `TM`) for non-color disambiguation per the accessibility requirement in the UI/UX Guide.

## Verification Criteria

1. The Roster Viewer filter panel shows exactly one search input where "Player Search" and "Team Stack" previously appeared — on both desktop and mobile.
2. Typing a player name shows matching player suggestions; typing a team abbreviation shows matching team suggestions.
3. Selecting a player adds a chip styled with `var(--positive)` and prefixed `PL ·`. Selecting a team adds a chip styled with `var(--info)` and prefixed `TM ·`.
4. Filtering behavior is identical to before: rosters that include the selected players AND the selected team stacks are returned.
5. The collapsed filter toggle still shows pills for both selected players and selected teams.
6. Clearing the combined input removes all chips and clears the search text.
7. No hardcoded hex color values (`#00e5a0`, `#60a5fa`) appear in the new component.
8. No regressions in the existing archetype filters, CLV filter, or tournament filter.

## Verification Approach

1. Run `npm run build` from `best-ball-manager/` — must produce zero errors.
2. Run `npm run lint` — must produce zero new lint warnings/errors.
3. Visual check in dev server (`npm run dev`): open Roster Viewer, confirm one combined search input replaces the two inputs.
4. Type "Patrick" — confirm player autocomplete suggestions appear.
5. Select a player — confirm green chip with `PL ·` prefix appears.
6. Type "KC" — confirm team suggestion appears.
7. Select "KC" — confirm blue chip with `TM ·` prefix appears. Confirm roster list filters correctly.
8. Click the clear (✕) button — confirm all chips and search text are removed, full roster list restored.
9. Open on mobile viewport (DevTools, 375px) — confirm single combined input renders correctly.
10. Confirm the collapsed-filter pill row shows both player and team pills.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/filters/CombinedSearchInput.jsx` | Create | New combined player+team autocomplete component |
| `best-ball-manager/src/components/filters/index.js` | Modify | Export `CombinedSearchInput` |
| `best-ball-manager/src/components/RosterViewer.jsx` | Modify | Replace two `MultiSelectInput` usages with one `CombinedSearchInput`; consolidate search state |

## Implementation Approach

### 1. Create `CombinedSearchInput.jsx`

New component in `best-ball-manager/src/components/filters/`:

**Props:**
```
selectedPlayers   (string[])
selectedTeams     (string[])
onAddPlayer       (string => void)
onAddTeam         (string => void)
onRemovePlayer    (string => void)
onRemoveTeam      (string => void)
onClear           (() => void)
playerSuggestions (string[])        — filtered player name list from parent
teamSuggestions   (string[])        — filtered team abbrev list from parent
searchValue       (string)
onSearchChange    (string => void)
placeholder       (string)          — default "Search players & teams..."
label             (string)
```

**Chip rendering:**
- Player chips: `chipColor="var(--positive)"`, label rendered as `<span style={{ color: 'var(--text-muted)', marginRight: 4 }}>PL ·</span>{name}`
- Team chips: `chipColor="var(--info)"`, label rendered as `<span style={{ color: 'var(--text-muted)', marginRight: 4 }}>TM ·</span>{team}`
- Each chip has a remove button calling the appropriate handler.
- Chip background/border derived from the color token at 15%/35% opacity (same pattern as `MultiSelectInput`).

**Dropdown:** Combined list — player matches first (up to 6), team matches below (up to 4). When both have results, render a `<div>` divider styled with `borderTop: '1px solid var(--border-subtle)'`, `margin: '4px 0'` between sections. Each option carries a type tag so the correct `onAdd` handler is called on selection.

**Keyboard nav:** Arrow keys navigate the full flat combined list. Enter selects the highlighted item via the correct add handler. Backspace with empty input removes the last chip: check `selectedTeams` last, then `selectedPlayers`.

The component reuses existing `filter-multiselect` CSS classes (same as `MultiSelectInput`) — no new CSS needed.

### 2. Update `filters/index.js`

Add: `export { default as CombinedSearchInput } from './CombinedSearchInput';`

### 3. Update `RosterViewer.jsx`

**State changes:**
- Remove `const [playerSearch, setPlayerSearch] = useState('');`
- Remove `const [teamSearch, setTeamSearch] = useState('');`
- Add `const [combinedSearch, setCombinedSearch] = useState('');`
- Keep `selectedPlayers` and `selectedTeams` unchanged — all downstream filter logic, pill summary, and highlight logic are unaffected.

**Autocomplete suggestion memos** — replace the two separate memos with a single `combinedQuery` driving both `playerSuggestions` and `teamSuggestions`.

**Render changes:** Both mobile and desktop `renderFilterBody()` branches use a single `CombinedSearchInput` in place of two `MultiSelectInput` blocks.

### 4. Existing hardcoded colors in RosterViewer.jsx

The pill summary `color: '#00e5a0'` for the match count inline style is out of scope — tracked under TASK-068.

## Dependencies

None

---
*Approved by: PH 2026-04-02*
