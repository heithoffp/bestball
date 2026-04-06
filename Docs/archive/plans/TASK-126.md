<!-- Completed: 2026-04-06 | Commit: 32d52a6 -->
# TASK-126: Cross-module roster nav — Combo Analysis, ADP Tracker, Roster Construction

**Status:** Done
**Priority:** P3

---

## Objective

Add "See Roster(s)" navigation to the ADP Tracker tab (per player row) and Combo Analysis tab (per QB row and per combo detail row, plus QB Pairs). Each button calls the existing `navigateToRosters` mechanism to open the Rosters tab pre-filtered. Roster Construction integration remains deferred (tab disabled).

## Verification Criteria

**ADP Tracker**
- Each player row in the table has a "See Rosters" icon button, visible on hover (always visible on mobile).
- Clicking it navigates to the Rosters tab filtered by `{ players: [playerName] }`.
- Existing row click (checkbox/chart toggle) is unaffected — `stopPropagation` prevents bubbling.

**Combo Analysis — Stack Profiles**
- Each QB row in the table has a "See Rosters" icon button → navigates filtered by `{ players: [qb.name] }`.
- Each expanded combo detail row has a "See Rosters" icon → navigates filtered by `{ players: [qb.name, ...teammate names] }`.

**Combo Analysis — QB Pairs**
- Each pair row has a "See Rosters" icon → navigates filtered by `{ players: [qb1.name, qb2.name] }`.

**General**
- Buttons only render when `onNavigateToRosters` prop is provided.
- No regressions on existing interactions (row expand/collapse in combos, chart selection in ADP tracker).

## Verification Approach

1. `npm run build` from `best-ball-manager/` — clean build, no errors.
2. `npm run dev`, load the app with roster data.
3. **ADP Tracker:** Hover a player row — icon appears. Click it → Rosters tab opens filtered to that player (nav banner shows name).
4. **Combo Analysis — Stack Profiles:** Hover a QB row — icon appears. Click it → Rosters opens filtered to that QB. Expand a QB row, hover a combo detail row — icon appears. Click it → Rosters opens filtered to QB + all stacked players.
5. **Combo Analysis — QB Pairs:** Hover a pair row — icon appears. Click it → Rosters opens filtered to both QBs.
6. Confirm clicking elsewhere on each row still works (ADP tracker: toggles chart selection; Combos: expands/collapses QB; Pairs: no existing click action).

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/App.jsx` | Modify | Pass `onNavigateToRosters={navigateToRosters}` to `AdpTimeSeries` and `ComboAnalysis` |
| `best-ball-manager/src/components/AdpTimeSeries.jsx` | Modify | Accept `onNavigateToRosters` prop; add icon button per player row |
| `best-ball-manager/src/components/AdpTimeSeries.module.css` | Modify | `.navBtn` — hover-reveal style |
| `best-ball-manager/src/components/ComboAnalysis.jsx` | Modify | Accept `onNavigateToRosters` prop; add icon buttons to QB rows, combo detail rows, QB pair rows |

## Implementation Approach

### 1. `App.jsx`

- Line ~318: add `onNavigateToRosters={navigateToRosters}` to `AdpTimeSeries`.
- Line ~326: add `onNavigateToRosters={navigateToRosters}` to `ComboAnalysis`.

### 2. `AdpTimeSeries.jsx`

- Add `onNavigateToRosters = null` to props destructure (line 86).
- Append a `24px` column to `tableGrid` at all breakpoints — only when `onNavigateToRosters` is non-null. This preserves existing column counts.
- Add a matching empty `<div />` to the table header row.
- In each player row's `.map()`, append a button cell as the last child:
  ```jsx
  {onNavigateToRosters && (
    <div className={styles.navBtnCell}>
      <button className={styles.navBtn}
        title="See rosters"
        onClick={e => { e.stopPropagation(); onNavigateToRosters({ players: [p.name] }); }}>
        <Users size={13} />
      </button>
    </div>
  )}
  ```
- Import `Users` from `lucide-react` (already used in the project).

### 3. `AdpTimeSeries.module.css`

Add:
```css
.navBtnCell { display: flex; align-items: center; justify-content: center; }
.navBtn {
  background: transparent; border: none; cursor: pointer;
  padding: 3px; opacity: 0; transition: opacity 0.15s;
  color: var(--text-muted);
}
.navBtn:hover { color: var(--text-primary); }
.playerRow:hover .navBtn { opacity: 1; }
@media (max-width: 768px) { .navBtn { opacity: 1; } }
```

### 4. `ComboAnalysis.jsx`

- Add `onNavigateToRosters = null` to props destructure (line 81).
- Import `Users` from `lucide-react`.
- Add a small shared inline helper for the button (kept local — no file created):
  ```jsx
  const NavBtn = ({ players }) => onNavigateToRosters ? (
    <button
      title="See rosters"
      onClick={e => { e.stopPropagation(); onNavigateToRosters({ players }); }}
      style={{ background:'none', border:'none', cursor:'pointer', padding:'3px 6px',
               color:'var(--text-muted)', opacity: 0, transition:'opacity 0.15s' }}
      className="combo-nav-btn"
    >
      <Users size={13} />
    </button>
  ) : null;
  ```
  Use a CSS hover rule `.combo-nav-btn` in global styles or an inline `onMouseEnter/Leave` toggle to show on hover. Since ComboAnalysis has no CSS module, use `onMouseEnter/Leave` on the parent row to toggle a local state, **or** add a `combo-nav-btn` rule to the global `index.css`/`App.css`. Given the existing pattern of inline styles in ComboAnalysis, use `onMouseEnter/Leave` on the row container to set a `hoveredRow` state key, toggling button opacity.

- **Stack Profiles — QB row** (`<tr onClick={() => toggleQB(...)}`): Add `NavBtn` with `players={[group.qb.name]}` as the last `<td>`.
- **Stack Profiles — combo detail row**: Add `NavBtn` with `players={[group.qb.name, ...combo.players.map(p => p.name)]}` inside each detail row's action area (right side, after the count/pct).
- **QB Pairs — pair row**: Add `NavBtn` with `players={[pair.qb1.name, pair.qb2.name]}` in the row's right-side `<div>`.

**Hover reveal in ComboAnalysis:** Since inline styles dominate, use per-row `useState`-less approach — add `onMouseEnter`/`onMouseLeave` directly on the row element to toggle a CSS class or inline opacity. Simplest: add `className="combo-row"` to each parent and add a global rule `tr.combo-row:hover .combo-nav-btn, div.combo-row:hover .combo-nav-btn { opacity: 1; }` to the existing global CSS file (`src/index.css`).

## Dependencies

TASK-124 — core navigation mechanism (complete; `navigateToRosters` and `initialFilter` pattern in place)

---

*Approved by: <!-- developer name/initials and date once approved -->*
