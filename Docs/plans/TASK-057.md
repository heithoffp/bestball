# TASK-057: Redesign Combo Analysis tab — Stack Profiles, Team Stacks, QB Pairs

**Status:** Approved
**Priority:** P2

---

## Objective

Replace the existing ComboAnalysis.jsx with three purpose-built views that each uniquely answer an audit question from TASK-051, aligned with the Mirror-Not-Advisor and Shape Over Spreadsheet design principles. Drop the Early Starts view (maps to no Combo Analysis audit question). Remove all opinionated coloring.

## Verification Criteria

1. Three tabs render: "Stack Profiles", "Team Stacks", "QB Pairs".
2. **Stack Profiles:** Each drafted QB appears as a row with a horizontal diversity bar. Bar segments represent distinct stack combinations sized proportionally to count. Clicking a row expands to show exact player names and counts. No red/green coloring on any value.
3. **Team Stacks:** Horizontal bar chart showing one bar per NFL team, sorted by roster count descending. Each bar is a single color (no game-stack split — data unavailable). Count and percentage shown.
4. **QB Pairs:** Ranked card list of top QB co-occurrences. Each card shows two QB badges, count, and % of total rosters. No "same game?" annotation (opponent data unavailable).
5. All three `useMemo` computations are gated so only the active view's computation runs on mount — the others compute lazily on first activation.
6. No prescriptive language, thresholds, or red/green indicators anywhere in the component.
7. `npm run lint` passes with no new errors.

## Verification Approach

1. Run `npm run lint` from `best-ball-manager/` — confirm clean.
2. Load app with real roster data. Navigate to Combo Analysis tab.
3. Stack Profiles: verify QB rows appear sorted by roster count, bars render with proportional segments, expand works.
4. Team Stacks: verify bar chart renders sorted, all teams with stacks appear, count + % visible.
5. QB Pairs: verify ranked cards appear with two QB badges per card, count + % shown, sorted by frequency.
6. Switch tabs rapidly — confirm no performance lag (computations are lazy).
7. Visual check: confirm no red/green on any numeric value.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/ComboAnalysis.jsx` | Modify | Full rewrite — replace three old views with three new views |

## Implementation Approach

### Data shape

`rosterData` is a flat array of player rows: `{ entry_id, name, position, team, round, pick, latestADP, ... }`.

Group into rosters: `Map<entry_id → player[]>`. All three views operate on this roster map.

**No opponent data** — game stack detection is not possible. Team Stacks shows team-stack frequency only. QB Pairs shows no "same game?" annotation.

---

### View 1 — Stack Profiles

**Computation (`useMemo`, gated to `activeTab === 'stacks'`):**

For each roster, find all QBs. For each QB, find teammates whose `team === qb.team` and `position` in `['WR', 'TE', 'RB']`. Sort teammate names alphabetically to form a canonical combo key (e.g., `"Kelce | MVS"` or `"NAKED"`). Accumulate counts per QB → combo key.

Output: array of `{ qb: {name, team}, totalDrafts, combos: [{key, players[], count}] }` sorted by `totalDrafts` descending.

**Render:**

Each QB is a row:
- Left: QB name, team, total drafts
- Right: horizontal diversity bar — one segment per combo, width = `count / totalDrafts * 100%`, colored by position mix (if all WR: amber; if TE present: blue; if naked: slate). Segments sorted by count descending.
- Expand toggle: opens a sub-table showing combo name, player badges, count, % of that QB's drafts.

Key: no red/green. Naked is slate/muted, not a warning color.

---

### View 2 — Team Stacks

**Computation (`useMemo`, gated to `activeTab === 'teams'`):**

For each roster, find all QBs. For each QB, count rosters where that QB appears with at least one same-team skill player (WR, TE, RB with `team === qb.team`). Accumulate by team name: `Map<team → Set<entry_id>>` (use Set to avoid double-counting rosters with 2 QBs from same team on the same roster).

Output: `[{ team, count, pct }]` sorted by count descending.

**Render:**

Recharts `BarChart` (horizontal). One bar per team. X-axis: count. Y-axis: team name. Show count and pct label at end of bar. Single color (position blue or a neutral brand color — no semantic coloring).

---

### View 3 — QB Pairs

**Computation (`useMemo`, gated to `activeTab === 'qbpairs'`):**

For each roster with ≥ 2 QBs, enumerate all pairs. Canonicalize pair key: `[qb1.name, qb2.name].sort().join('||')`. Accumulate counts.

Output: `[{ qb1, qb2, count, pct }]` sorted by count descending. Top 20.

**Render:**

Ranked card list. Each card:
- Rank number (#1, #2, …)
- QB badge (position color dot + name) for qb1
- "+" separator
- QB badge for qb2
- Count + pct of total rosters on the right

No matrix. No ADP tier blending. Clean and readable.

---

### Performance / lazy compute

```jsx
const stackProfilesData = useMemo(() => {
  if (activeTab !== 'stacks') return null;
  // ... computation
}, [teams, activeTab]);
```

Same pattern for the other two views. Each only computes when its tab is active. `teams` (the roster map) is computed once and shared.

---

### State

```jsx
const [activeTab, setActiveTab] = useState('stacks');
const [expandedQBs, setExpandedQBs] = useState(new Set());
const [minCount, setMinCount] = useState(1);
```

`minCount` filter applies to all three views (hide combos/teams/pairs appearing fewer than N times).

---

### Component structure

Single file. No sub-components extracted (one-off views). Internal `Badge` helper kept for QB/player rendering.

---

### Mirror-Not-Advisor compliance checklist

- [ ] No color implies "too high" or "too low"
- [ ] Naked QB count is muted gray, not red
- [ ] No "warning" language in labels
- [ ] All values described as counts or percentages of portfolio — not graded

## Dependencies

None — `ComboAnalysis.jsx` is self-contained.

## Open Questions

- **Game stacks:** No opponent data in `rosterData`. "Same game?" annotation in QB Pairs and the game-stack segment in Team Stacks are deferred until opponent data is available. Note this as a future enhancement if schedule data is ever added.
- **Recharts availability:** Team Stacks will use Recharts `BarChart`. Confirm Recharts is already a dependency (it is — used in other tabs).

---
*Approved by: <!-- developer name/initials and date once approved -->*
