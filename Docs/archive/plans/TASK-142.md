<!-- Completed: 2026-04-06 | Commit: 32d52a6 -->

# TASK-142: ADP TimeSeries platform selector

**Status:** Done
**Priority:** P1

---

## Objective

Add a platform toggle (Underdog | DraftKings | Both) to the ADP TimeSeries component so users can view per-platform ADP timelines. In single-platform mode the chart shows one line per player from that platform's snapshots only. In "Both" mode the chart renders two lines per selected player — solid for Underdog, dashed for DraftKings — enabling direct side-by-side comparison.

## Verification Criteria

1. A platform toggle appears in the ADP Tracker controls when more than one platform has data. Options are `All`, `Underdog`, `DraftKings`.
2. Selecting `Underdog` filters the player list and chart to only Underdog snapshots; trend and ADP values reflect only Underdog data.
3. Selecting `DraftKings` filters to only DraftKings snapshots; trend and ADP values reflect only DraftKings data.
4. Selecting `All` (default) shows combined data. With both platforms loaded, each selected player renders two lines in the chart: solid for Underdog, dashed for DraftKings.
5. A player that exists in only one platform shows a line only for that platform in "All" mode (no line rendered for the platform it is absent from).
6. The toggle is hidden (or shows only one button) when all loaded ADP files are from a single platform.
7. No console errors or React key warnings.

## Verification Approach

1. Run `npm run build` from `best-ball-manager/` — expect clean build, zero errors.
2. Run `npm run lint` — zero new lint errors.
3. Steps 3–6 require the developer to load the app with both Underdog and DraftKings ADP files present (the two new `2026-04-05` snapshots already in `src/assets/adp/`):
   a. Confirm the platform toggle appears in the ADP Tracker controls.
   b. Click `Underdog` — confirm chart lines update to UD data only; confirm trend/ADP values change.
   c. Click `DraftKings` — same check for DK data.
   d. Click `All` — confirm two lines per selected player (solid vs. dashed), correctly labeled.
   e. Select a player present in only one platform — confirm one line appears, not two.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/App.jsx` | Modify | Pass `adpByPlatform` prop to `AdpTimeSeries` |
| `best-ball-manager/src/components/AdpTimeSeries.jsx` | Modify | Add `platformFilter` state, platform toggle UI, per-platform history building, dual-line chart rendering |

## Dependencies

TASK-141 — multi-platform ADP foundation (complete as of 2026-04-06).

---
*Approved by: Patrick — 2026-04-06*
