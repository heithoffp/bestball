<!-- Completed: 2026-04-03 | Commit: cee9a97 -->
# TASK-115: Uniqueness engine JS integration + UI in RosterViewer

**Status:** Pending Approval
**Priority:** P2

---

## Objective

Bundle the simulation's Tier 1 frequency table as a static JSON asset in the Vite app, and replace the existing heuristic `calculateCompositeRarity()` in RosterViewer with a direct lookup against it. If a combo is not found in the table, display "< 1 per 1.2M" — no Tier 2 estimation. Add Lineup Disruptor in expanded rows and update HelpGuide with the methodology.

## Verification Criteria

1. `simulation/output/pilot_report.json` shows `max_frequency.players` with exactly **4 player IDs** (not 6), confirming 4-pick keys are active.
2. `best-ball-manager/public/sim/tier1_frequency.json` is present and non-empty.
3. RosterViewer renders without console errors; Uniqueness column is populated for at least one roster after sim data loads.
4. Tier 1 hit displays as `"X / 1.2M"` format (e.g. `"3 / 1.2M"`).
5. Roster not in Tier 1 table displays as `"< 1 / 1.2M"`.
6. Lineup Disruptor label appears in the expanded row for any Tier 1 roster.
7. Sort by "Uniqueness" works ascending and descending.
8. `grep -r "calculateCompositeRarity" best-ball-manager/src/` returns no matches.
9. `npm run lint` (from `best-ball-manager/`) passes with no new warnings.
10. HelpGuide renders a new "Uniqueness Score" section.

## Verification Approach

1. Run `python simulate.py --multi-epoch --pilot` from `simulation/` — inspect `output/pilot_report.json`, confirm `max_frequency.players` has 4 entries.
2. `ls best-ball-manager/public/sim/` — confirm `tier1_frequency.json` is present.
3. `npm run build` from `best-ball-manager/` — confirm clean build.
4. `npm run lint` — report any warnings; fix if present.
5. `grep -r "calculateCompositeRarity" best-ball-manager/src/` — must return no matches.
6. Open dev server (`npm run dev`), navigate to Roster Viewer — confirm no console errors, confirm Uniqueness column values appear.
7. Visually confirm `"X / 1.2M"` and `"< 1 / 1.2M"` labels on different rosters.
8. Visually confirm Lineup Disruptor text in an expanded Tier 1 roster row.
9. Visually confirm Sort by Uniqueness asc/desc works.
10. Navigate to Help Guide — confirm new Uniqueness section.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `simulation/engine.py` | Modify | Change combo key from all-6-picks to 4 lowest-ADP picks |
| `simulation/output/tier1_frequency.json` | Regenerate | Rebuilt via `python simulate.py --multi-epoch --pilot` |
| `simulation/output/pilot_report.json` | Regenerate | Same pilot run — used for verification |
| `best-ball-manager/public/sim/tier1_frequency.json` | Create | Copy from simulation/output |
| `best-ball-manager/src/utils/uniquenessEngine.js` | Create | Lazy loader + combo key builder + Tier 1 lookup + disruptor |
| `best-ball-manager/src/App.jsx` | Modify | Pass `masterPlayers` prop to `<RosterViewer>` |
| `best-ball-manager/src/components/RosterViewer.jsx` | Modify | Accept `masterPlayers`, lazy-load sim data, replace heuristic, update UI and sort |
| `best-ball-manager/src/components/HelpGuide.jsx` | Modify | Add Uniqueness Score section |

## Implementation Approach

### Step 1 — Python: Change combo key from 6-pick to 4-pick (`simulation/engine.py`)

In `run_simulation()`, the "Build combo keys" block is at lines 399–407. Replace:

**Current:**
```python
# Build combo keys — sort each team's roster by player_id
for team_idx in range(num_teams):
    indices = team_roster_indices[team_idx]
    indices.sort(key=lambda i: player_ids[i])
    ids = [player_ids[i] for i in indices]
    combo_key = "|".join(ids)
    combo_counts[combo_key] += 1
    if combo_key not in combo_players:
        combo_players[combo_key] = ids
```

**New:**
```python
# Build combo keys — first 4 picks by ADP (roster identity inflection point),
# then sort those 4 by player_id for order independence
for team_idx in range(num_teams):
    indices = team_roster_indices[team_idx]
    indices_by_adp = sorted(indices, key=lambda i: adps[i])[:4]
    indices_by_adp.sort(key=lambda i: player_ids[i])
    ids = [player_ids[i] for i in indices_by_adp]
    combo_key = "|".join(ids)
    combo_counts[combo_key] += 1
    if combo_key not in combo_players:
        combo_players[combo_key] = ids
```

`adps` is already a numpy array in scope (line 237).

### Step 2 — Regenerate simulation output

From `simulation/`:
```
python simulate.py --multi-epoch --pilot
```

Overwrites `output/tier1_frequency.json` and `output/pilot_report.json`.

### Step 3 — Copy Tier 1 to `best-ball-manager/public/sim/`

```
mkdir -p best-ball-manager/public/sim
cp simulation/output/tier1_frequency.json best-ball-manager/public/sim/
```

Fetched lazily at runtime via `fetch('/sim/tier1_frequency.json')`. Tier 2 is not copied — not used.

### Step 4 — Create `best-ball-manager/src/utils/uniquenessEngine.js`

```js
/**
 * Uniqueness Engine — Tier 1 exact frequency lookup only.
 * Combo key: 4 lowest-ADP players, sorted by player_id, joined by "|".
 * If a combo is not in the table, it is reported as "< 1 per totalRosters".
 */

let _tier1 = null;
let _loading = false;
const _callbacks = [];

export async function loadSimData() {
  if (_tier1) return _tier1;
  if (_loading) return new Promise(resolve => _callbacks.push(resolve));
  _loading = true;
  try {
    _tier1 = await fetch('/sim/tier1_frequency.json').then(r => r.json());
  } finally {
    _loading = false;
    _callbacks.forEach(cb => cb(_tier1));
    _callbacks.length = 0;
  }
  return _tier1;
}

/**
 * Build the 4-pick combo key from a roster.
 * Players must have `player_id` and a numeric `latestADP` or `adp`.
 * @returns {string|null}
 */
export function buildComboKey(rosterPlayers) {
  const withAdp = rosterPlayers
    .filter(p => p.player_id && Number.isFinite(Number(p.latestADP ?? p.adp)))
    .map(p => ({ player_id: p.player_id, adp: Number(p.latestADP ?? p.adp) }));
  if (withAdp.length < 4) return null;
  withAdp.sort((a, b) => a.adp - b.adp);
  const top4 = withAdp.slice(0, 4);
  top4.sort((a, b) => a.player_id.localeCompare(b.player_id));
  return top4.map(p => p.player_id).join('|');
}

/**
 * Look up a combo key in the Tier 1 table.
 * @returns {{ count: number, totalRosters: number }|null} — null means not in table (< 1 per totalRosters)
 */
export function lookupTier1(comboKey, tier1) {
  const entry = tier1?.combos?.[comboKey];
  if (!entry) return null;
  return { count: entry.count, totalRosters: tier1.metadata?.total_rosters ?? 1 };
}

/**
 * Lineup Disruptor — which of the first-4 players, when removed, leaves the remaining 3
 * appearing across the most Tier 1 combos? That player is the "chalk" anchor pulling the
 * roster toward common territory.
 * @returns {{ player_id: string, name: string, count: number }|null}
 */
export function findLineupDisruptor(rosterPlayers, tier1) {
  if (!tier1?.combos) return null;
  const withAdp = rosterPlayers
    .filter(p => p.player_id && Number.isFinite(Number(p.latestADP ?? p.adp)))
    .map(p => ({ ...p, adp: Number(p.latestADP ?? p.adp) }));
  withAdp.sort((a, b) => a.adp - b.adp);
  const top4 = withAdp.slice(0, 4);
  if (top4.length < 4) return null;
  const combosEntries = Object.entries(tier1.combos);
  let bestCount = 0;
  let disruptor = null;
  for (let i = 0; i < top4.length; i++) {
    const remaining = top4.filter((_, j) => j !== i);
    let count = 0;
    for (const [ck, entry] of combosEntries) {
      if (remaining.every(p => ck.includes(p.player_id))) count += entry.count;
    }
    if (count > bestCount) {
      bestCount = count;
      disruptor = { player_id: top4[i].player_id, name: top4[i].name, count };
    }
  }
  return bestCount > 0 ? disruptor : null;
}
```

### Step 5 — `App.jsx`: Pass `masterPlayers` to RosterViewer

Find `<RosterViewer rosterData={...} />` and add:
```jsx
<RosterViewer rosterData={rosterData} masterPlayers={masterPlayers} />
```

### Step 6 — `RosterViewer.jsx`: Full integration

**6a. Add imports:**
```js
import { loadSimData, buildComboKey, lookupTier1, findLineupDisruptor } from '../utils/uniquenessEngine';
```

**6b. Update component signature:**
```jsx
export default function RosterViewer({ rosterData = [], masterPlayers = [] }) {
```

**6c. Build name→player_id lookup:**
```js
const nameToPlayerId = useMemo(() => {
  const map = new Map();
  masterPlayers.forEach(p => {
    if (p.player_id && p.name)
      map.set(p.name.trim().toLowerCase().replace(/\s+/g, ' '), p.player_id);
  });
  return map;
}, [masterPlayers]);
```

**6d. Annotate roster players with player_id** — inside the existing `rosters` useMemo, when building the `players` array per entry, map:
```js
const players = rawPlayers.map(p => ({
  ...p,
  player_id: nameToPlayerId.get(p.name?.trim().toLowerCase().replace(/\s+/g, ' ')) ?? null,
}));
```

**6e. Lazy-load sim data on mount:**
```js
const [tier1, setTier1] = useState(null);
useEffect(() => { loadSimData().then(setTier1); }, []);
```

**6f. Replace `rosterScores` useMemo** — replace `calculateCompositeRarity()` with lookup:
```js
const rosterScores = useMemo(() => {
  const byId = {};
  rosters.forEach(r => {
    const key = buildComboKey(r.players);
    const hit = key && tier1 ? lookupTier1(key, tier1) : null;
    byId[r.entry_id] = hit
      ? { found: true, count: hit.count, totalRosters: hit.totalRosters }
      : { found: false, totalRosters: tier1?.metadata?.total_rosters ?? 1200000 };
  });
  return byId;
}, [rosters, tier1]);
```

**6g. Lineup disruptor memo** (only computed for found combos):
```js
const lineupDisruptors = useMemo(() => {
  if (!tier1) return {};
  const byId = {};
  rosters.forEach(r => {
    if (rosterScores[r.entry_id]?.found) {
      byId[r.entry_id] = findLineupDisruptor(r.players, tier1);
    }
  });
  return byId;
}, [rosters, rosterScores, tier1]);
```

**6h. Update sort key** — rename `rarityPercentile` → `uniqueness` in SORT_OPTIONS and sort logic:
```js
{ value: 'uniqueness', label: 'Uniqueness' }
```
```js
if (sortKey === 'uniqueness') {
  const as = rosterScores[a.entry_id];
  const bs = rosterScores[b.entry_id];
  // Lower count = rarer. Not-found (found: false) treated as count 0 (most unique).
  const av = as?.found ? as.count : 0;
  const bv = bs?.found ? bs.count : 0;
  return sortDir === 'asc' ? av - bv : bv - av;
}
```

**6i. UI helper and display:**
```js
function formatUniqueness(score, loading) {
  if (loading || !score) return { text: '—', muted: true };
  const m = (score.totalRosters / 1000).toFixed(0);
  if (score.found) return { text: `${score.count} / ${m}K`, muted: false };
  return { text: `< 1 / ${m}K`, muted: false };
}
```

In each roster row, replace the old Uniq Lift cell:
```jsx
const uniq = formatUniqueness(rosterScores[r.entry_id], !tier1);
<span
  title={rosterScores[r.entry_id]?.found
    ? 'Observed in simulation — exact frequency count.'
    : 'Not observed — this is a uniquely rare combo.'}
  style={{ color: uniq.muted ? 'var(--text-muted)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}
>
  {uniq.text}
</span>
```

**6j. Lineup Disruptor in expanded row:**
```jsx
{lineupDisruptors[r.entry_id] && (
  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
    <span style={{ color: 'var(--accent-gold)', fontWeight: 600 }}>Lineup Disruptor:</span>
    {' '}{lineupDisruptors[r.entry_id].name}
    <span style={{ opacity: 0.6 }}> — swapping this pick would increase your core uniqueness</span>
  </div>
)}
```

**6k. Remove dead code:**
- Delete `calculateCompositeRarity()` and `survivalProbability()` (lines 85–172)
- Delete `archetypeRarityNorm()` if not used outside rosterScores
- Delete `alphaPhase`, `betaPhase`, `archetypeBoostMax` useState if not used elsewhere
- Delete `percentileRank()` and `normalize()` helpers if no other usage

### Step 7 — `HelpGuide.jsx`: Add Uniqueness Score section

Add a new section covering:
- **"Your first 4 picks define your roster identity"** — rounds 1–4 are the inflection point where drafter intent crystallises; rounds 5–6 add little additional signal.
- **Score format:** `"X / 1.2M"` = this exact combination of first 4 picks appeared X times across 1.2M simulated drafts. Lower is rarer.
- **`"< 1 / 1.2M"`** = combo was not directly observed in simulation — a rare roster.
- **Lineup Disruptor:** The player in your first 4 picks whose removal leaves the most common remaining core. Replacing them would push your portfolio toward more unique territory.

## Dependencies

- TASK-114 — simulation multi-epoch mode is working (pilot output with `multi_epoch: true` exists). The `engine.py` change in Step 1 must run before regenerating output.
- ADR-003 — accepted. Note: this implementation uses Tier 1 only; Tier 2 is intentionally omitted (rare combos simply display `"< 1 / 1.2M"`).

---
*Approved by: Patrick — 2026-04-03*

**UI/UX amendments (post-approval):**
- `formatUniqueness`: use `(totalRosters / 1_000_000).toFixed(1) + 'M'` not `/1000 + 'K'`
- Uniqueness cell: add `minWidth: '7ch'` to prevent CLS on data load
- Tooltip: use both `title` and `aria-label` for touch/keyboard accessibility
