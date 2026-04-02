<!-- Completed: 2026-04-02 | Commit: 26c7181 -->
# TASK-082: Roster Viewer: Align archetype filter colors and position colors to UI/UX Guide Midnight Gold palette

**Status:** Done
**Priority:** P3

---

## Objective

Two color maps in `RosterViewer.jsx` are out of sync with the UI/UX Guide's Midnight Gold design system. `ARCHETYPE_COLORS` uses ad-hoc pastel/arbitrary values with no position-family relationship. `POS_COLORS` has QB and WR swapped and TE wrong. Both maps will be corrected: archetypes rationalized to hue-range variants of their position's canonical color, and position colors aligned to the guide's specification.

## Verification Criteria

1. Each RB archetype chip renders in a shade of RB green (`#10B981` family).
2. Each QB archetype chip renders in a shade of QB purple (`#BF44EF` family).
3. Each TE archetype chip renders in a shade of TE blue (`#3B82F6` family).
4. The "All" chip uses accent gold (`#E8BF4A`) when active, matching the guide's filter chip active spec.
5. Position badges (PositionSnapshot, pick grid, player list) show QB as purple, WR as amber, TE as blue — matching the guide.
6. No two archetypes within the same position group share an identical color.

## Verification Approach

Visual inspection only — no automated tests. After implementation:
1. Load Roster Viewer in dev server (`npm run dev` from `best-ball-manager/`).
2. Open the sidebar filter panel. Confirm RB chips are green-toned, QB chips are purple-toned, TE chips are blue-toned. Confirm "All" button shows gold when active.
3. Open any individual roster. Confirm position badges on pick grid and player list show QB purple, WR amber, TE blue.
4. Toggle each archetype filter and confirm the distribution bar color matches the chip color.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/RosterViewer.jsx` | Modify | Update `ARCHETYPE_COLORS` to position-family hue-range variants; fix `POS_COLORS` QB/WR/TE values; update `'all'` chip hardcoded color; color FilterGroup position labels |

## Implementation Approach

**1. `ARCHETYPE_COLORS` — hue-range approach (not tonal):**

```js
const ARCHETYPE_COLORS = {
  // RB family — hue range: yellow → lime → emerald → cyan-teal
  RB_HERO:          '#10B981',  // emerald (canonical)
  RB_BALANCED:      '#84cc16',  // lime
  RB_ZERO:          '#06b6d4',  // cyan-teal
  RB_HYPER_FRAGILE: '#eab308',  // yellow

  // QB family — hue range: hot pink → purple → bright rose
  QB_ELITE:         '#BF44EF',  // purple (canonical)
  QB_CORE:          '#ec4899',  // hot pink
  QB_LATE:          '#fb7185',  // bright rose

  // TE family — hue range: sky → blue → bright indigo
  TE_ELITE:         '#3B82F6',  // blue (canonical)
  TE_ANCHOR:        '#818cf8',  // bright indigo
  TE_LATE:          '#38bdf8',  // sky blue
};
```

**2. `POS_COLORS` — corrected to match UI/UX Guide:**
```js
QB: '#BF44EF', RB: '#10B981', WR: '#F59E0B', TE: '#3B82F6',
```

**3. "All" chip color:** `#00e5a0` → `#E8BF4A`

**4. FilterGroup label color:** `POS_COLORS[label]` applied inline to position header spans.

## Dependencies

None

---
*Approved by: Patrick 2026-04-02*
