<!-- Completed: 2026-06-09 | Commit: uncommitted (working tree) -->
# TASK-253: ADP Tracker — % change / raw ADP calculation toggle

**Status:** Done
**Priority:** P3

---

## Objective
Add a toggle to the ADP Tracker that switches the table's **Δ UD-DK** and **Trend** columns
between raw ADP differences and percentage change, with **% as the default**. A 10-spot ADP
move is far more meaningful in the early rounds than the late rounds, and % change captures
that magnitude better than raw spots. The line chart is unaffected (keeps plotting absolute ADP).

## Verification Criteria
- A new toggle in the controls row offers **% / ADP**, defaulting to **%**.
- In **% mode**:
  - **UD Trend / DK Trend** (two-platform) and **Trend** (single-platform) show `(last − first) / first × 100`, formatted with the existing rise/fall arrow and a `%` suffix.
  - **Δ UD-DK** shows the mean-relative percentage `(ud − dkClamped) / ((ud + dkClamped) / 2) × 100`, signed, with a `%` suffix (`dkClamped = min(dkAdp, 216)`, preserving the existing UD-depth clamp).
- In **ADP mode**: all three columns show the current raw-spot values, unchanged from today.
- Sorting on any toggled column sorts by the **currently displayed** metric (so switching modes re-orders correctly), with nulls still pushed to the bottom.
- Trend arrow/color semantics are identical in both modes (negative = rising = `▲` = positive color).
- The **ADP**, **UD ADP**, **DK ADP**, **Exposure**, **Value**, and **My Pick** columns are unchanged in both modes.
- The line chart, tooltip, and pick-range overlays are unchanged in both modes.
- Mobile/tablet trend column respects the toggle.

## Verification Approach
1. `cd best-ball-manager && npm run lint` — exits clean (no new warnings/errors).
2. `npm run build` — completes successfully.
3. **Developer manual check** (`npm run dev`, ADP Tracker tab, demo data with both platforms):
   - Toggle defaults to **%**; trend/delta cells show `%` values with arrows/signs.
   - Spot-check one player: e.g. ADP 100 → 90 over window reads `▲ 10.0%`; raw mode reads `▲ 10.0`.
   - Spot-check Δ UD-DK against the mean-relative formula on a known row.
   - Click each toggled column header — sort order is sensible in both modes; "-" rows sink to the bottom.
   - Switch to single-platform filter — single **Trend** column toggles too.
   - Confirm the chart, tooltip, and "My Pick Ranges" overlay are visually identical across modes.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/AdpTimeSeries.jsx` | Modify | Add `calcMode` state (default `'pct'`); compute pct variants alongside raw; add toggle UI; select active value + formatter in render and sort |
| `docs/Feature_Specs/ADP_Tracker.md` | Modify | Document the new toggle in Controls and Computations sections |

No CSS-module change expected — the toggle reuses the existing global `filter-btn-group` classes (same pattern as the time-scale buttons).

## Implementation Approach

1. **State** — add `const [calcMode, setCalcMode] = useState('pct');` alongside the existing `timeScale` state.

2. **Compute pct variants next to the raw ones (no `calcMode` dependency, so toggling never recomputes):**
   - `platStats` (per-platform trend): the window `first` ADP is currently discarded after computing `trend = latest − first`. Store it and add `trendPct = (first && first !== 0) ? (latest − first) / first × 100 : null` to each platform entry (keep `trend` as-is).
   - `timeFilteredPlayers` (single-platform trend): alongside `change`, add `changePct = (firstInWindow && firstInWindow !== 0) ? (lastInWindow − firstInWindow) / firstInWindow × 100 : null`.
   - `filteredAndSortedList` map: alongside `deltaAdp`, compute `dkClamped = Math.min(rawDk, UD_MAX_PICK)` and `deltaAdpPct = (rawUd !== null && rawDk !== null) ? (rawUd − dkClamped) / ((rawUd + dkClamped) / 2) × 100 : null`. Pass through `udTrendPct`/`dkTrendPct` from `platStats` and `changePct` from `timeFilteredPlayers`.

3. **Formatters** — add `fmtDeltaPct` (signed, `%` suffix) and `fmtTrendPct` (arrow + abs value + `%`), mirroring the existing `fmtDelta`/`fmtTrend`. `trendColor` is unchanged (sign-based, works for both).

4. **Sort resolution** — define `const METRIC_KEYS = new Set(['deltaAdp', 'udTrend', 'dkTrend', 'change']);` and, in the comparator, resolve the effective key: when `calcMode === 'pct'` and `sortConfig.key` is in `METRIC_KEYS`, read the `${key}Pct` field instead. Add the four pct keys to the existing `numericKeys` null-handling list so "-" rows still sink. Column headers keep calling `handleSort('deltaAdp' | 'udTrend' | 'dkTrend' | 'change')` — no header wiring changes.

5. **Render** — in each toggled cell, pick value + formatter by mode, e.g.
   `calcMode === 'pct' ? fmtTrendPct(p.udTrendPct) : fmtTrend(p.udTrend)` and
   `trendColor(calcMode === 'pct' ? p.udTrendPct : p.udTrend)`. Same pattern for DK trend, single-platform/mobile `change`, and Δ UD-DK (`fmtDeltaPct`/`fmtDelta`).

6. **Toggle UI** — add a `filter-btn-group` in the controls row (after the time-scale group) with two items: `%` (value `'pct'`) and `ADP` (value `'raw'`), wired to `setCalcMode`, following the exact markup of the time-scale buttons.

7. **Help text** — extend the existing `controls` help annotation (and/or `trend-col`) to mention the %/ADP toggle so the per-tab help overlay stays accurate.

8. **Feature spec** — update `docs/Feature_Specs/ADP_Tracker.md`: add the toggle to the Controls table and note the two trend/delta formulas in Computations.

**Edge cases:** `first`/`firstInWindow` is `null` → pct `null` (already the raw-trend behavior). ADP picks are ≥ 1 so the divide-by-zero guard is defensive only. Δ pct uses the **clamped** DK value in both numerator and denominator to stay consistent with the existing Δ UD-DK clamp rationale. Sign semantics match raw, so arrows/colors are untouched.

## Dependencies
None.

## Open Questions
None — the two formula decisions (mean-relative Δ, `(last−first)/first` trend) and the table-only scope were confirmed with the developer before planning.

---
*Approved by: <!-- pending -->*
