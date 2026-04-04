<!-- Completed: 2026-04-04 | Commit: c17767c -->
# TASK-128: Scale simulation to 10M rosters and report uniqueness as X per million

**Status:** Done
**Priority:** P2

---

## Objective

Scale the uniqueness simulation from 1.2M rosters (100K sims × 12) to 10M rosters (~833K sims × 12) to improve frequency accuracy. Update the UI to display uniqueness as a per-million rate ("X per 1M" or "< 1 per 1M") rather than a raw count over a non-round denominator.

## Verification Criteria

1. `python simulation/simulate.py --sims 833334 --multi-epoch` completes without error and prints `Total rosters: 10,000,008`.
2. `simulation/output/tier1_frequency.json` metadata field `total_rosters` equals `10000008`.
3. `best-ball-manager/public/sim/tier1_frequency.json` is replaced with the new output (metadata `total_rosters` matches).
4. `formatUniqueness` in `RosterViewer.jsx` no longer references the old `/ M` format — uses `per 1M` and normalizes via `Math.round(count / (totalRosters / 1_000_000))`.
5. In the running app, the Roster Viewer uniqueness column shows values like "175 per 1M" or "< 1 per 1M". No instance of the old "X / 1.2M" format appears.

## Verification Approach

1. Run the simulation (Step 1 of Implementation Approach) and confirm the printed summary shows `Total rosters: 10,000,008`.
2. Read the first 10 lines of `simulation/output/tier1_frequency.json` and confirm `total_rosters` = `10000008`.
3. Confirm `best-ball-manager/public/sim/tier1_frequency.json` has been updated (check `total_rosters` field).
4. Read `RosterViewer.jsx` lines 48–53 and confirm the new `formatUniqueness` body.
5. Run `npm run dev` from `best-ball-manager/` and visually inspect the Roster Viewer uniqueness column — confirm the new format.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `simulation/output/tier1_frequency.json` | Regenerate | Output of the 10M-roster sim run; not committed to git |
| `best-ball-manager/public/sim/tier1_frequency.json` | Replace | Copy new sim output to the public asset served by Vite |
| `best-ball-manager/src/components/RosterViewer.jsx` | Modify | Update `formatUniqueness` (lines 48–53) to normalize to per-million and display "X per 1M" / "< 1 per 1M" |

## Implementation Approach

### Step 1 — Run the simulation

From the repo root (takes 30–60 minutes — run in a background terminal):

```bash
python simulation/simulate.py --sims 833334 --multi-epoch
```

This produces 833,334 × 12 = 10,000,008 total rosters spread equally across all 9 ISO-week epochs. Output lands in `simulation/output/tier1_frequency.json`.

### Step 2 — Copy output to the public asset

```bash
cp simulation/output/tier1_frequency.json best-ball-manager/public/sim/tier1_frequency.json
```

### Step 3 — Update `formatUniqueness` in `RosterViewer.jsx`

Change lines 48–53 from:

```js
function formatUniqueness(score, loading) {
  if (loading || !score) return { text: '—', muted: true };
  const m = (score.totalRosters / 1_000_000).toFixed(1) + 'M';
  if (score.found) return { text: `${score.count} / ${m}`, muted: false };
  return { text: `< 1 / ${m}`, muted: false };
}
```

To:

```js
function formatUniqueness(score, loading) {
  if (loading || !score) return { text: '—', muted: true };
  if (!score.found) return { text: '< 1 per 1M', muted: false };
  const perMillion = Math.round(score.count / (score.totalRosters / 1_000_000));
  if (perMillion < 1) return { text: '< 1 per 1M', muted: false };
  return { text: `${perMillion} per 1M`, muted: false };
}
```

Logic: `perMillion` normalizes the raw count to a per-million rate. The "1M" denominator is hard-coded in the display string — it is always "1M" regardless of `totalRosters`, giving clean readability. The sort in `rosterScores` uses raw `count` and is unaffected.

Also update the fallback in `rosterScores` (line 294) from the stale `1200000` to `10000000`:

```js
: { found: false, totalRosters: tier1?.metadata?.total_rosters ?? 10000000 };
```

## Dependencies

TASK-115 — uniqueness engine JS integration complete. TASK-127 — model refit to round 1–4 complete. Both are `Done`.

---
*Approved by: developer*
