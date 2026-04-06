<!-- Completed: 2026-04-06 | Commit: 32d52a6 -->
# TASK-144: PlayerRankings platform toggle + per-platform storage

**Status:** Approved
**Priority:** P1

---

## Objective
Add a platform selector to the Rankings tab and persist rankings separately per platform
(Underdog / DraftKings) in both Supabase Storage and the `user_rankings` Postgres table,
so each platform's saved rankings (with tier breaks) can later be consumed by the
corresponding overlay.

## Verification Criteria
1. When both UD and DK ADP snapshots are loaded, a platform toggle appears above the position
   filter chips showing "Underdog" and "DraftKings" buttons. Defaults to "Underdog".
2. Clicking a platform button reseeds the ranked list from that platform's saved rankings
   (if any) or falls back to the platform's latest ADP rows. Tier breaks are cleared on switch.
3. The Save button persists to `rankings_underdog` or `rankings_draftkings` in Supabase
   Storage (keyed by active platform), and upserts `(user_id, platform)` in `user_rankings`.
4. On next load, each platform's saved rankings are restored independently from Supabase.
5. Existing users with a legacy `rankings` file get it migrated to `rankings_underdog`
   automatically on first load (one-time fallback read only; no overwrite of any existing
   `rankings_underdog` file).
6. When only one platform has ADP data, the toggle does not render.
7. Drag-and-drop reordering and tier editing still work correctly after switching platforms.

## Verification Approach
1. Run `npm run build` from `best-ball-manager/` — zero errors expected.
2. Run `npm run lint` — zero new errors expected.
3. Developer: confirm Supabase migration ran (check `user_rankings` table has `platform`
   column in Supabase Studio).
4. Developer visual check: both UD and DK ADP files present → Rankings tab shows toggle,
   defaults to Underdog.
5. Developer: switch to DraftKings, drag-reorder a few players, hit Save. Reload page →
   DK rankings restore with the custom order. Switch to Underdog → UD rankings are
   independent (not affected by the DK save).
6. Developer: confirm `user_rankings` table has two rows for the test user (one per platform).

Steps 1–2 Claude runs. Steps 3–6 require developer.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/App.jsx` | Modify | Load per-platform rankings on startup; update `handleRankingsUpload` to accept `platform`; replace `rankingsSource` with `rankingsByPlatform` map |
| `best-ball-manager/src/components/PlayerRankings.jsx` | Modify | Accept `rankingsByPlatform` prop; add platform state + toggle UI; pass `selectedPlatform` to save/upload callbacks |
| `best-ball-manager/src/utils/rankingsExport.js` | Modify | Accept `platform` param in `saveRankingsToAssets`; use `rankings_{platform}` storage ID; include `platform` in `user_rankings` upsert |
| Supabase — SQL migration (manual step) | Modify | Add `platform` column to `user_rankings`, change uniqueness to `(user_id, platform)` |

## Implementation Approach

### Step 1 — Supabase migration (developer runs in Supabase Studio SQL editor)
```sql
ALTER TABLE user_rankings
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'underdog';

-- Re-key uniqueness from user_id alone to (user_id, platform)
ALTER TABLE user_rankings
  DROP CONSTRAINT IF EXISTS user_rankings_pkey,
  DROP CONSTRAINT IF EXISTS user_rankings_user_id_key;

ALTER TABLE user_rankings
  ADD PRIMARY KEY (user_id, platform);
```
Existing rows get `platform = 'underdog'` from the DEFAULT. No data loss.

### Step 2 — `rankingsExport.js`
Add `platform = 'underdog'` param to `saveRankingsToAssets`:
- Storage ID: `rankings_${platform}` (was `'rankings'`)
- `user_rankings` upsert: add `platform` field; `onConflict: 'user_id,platform'`
- Filename for storage meta: `rankings_${platform}.csv`

### Step 3 — `App.jsx`
**State:** Replace `rankingsSource` with `rankingsByPlatform = {}` (map: platform → parsed rows).

**Load per-platform rankings** (in both `loadFromExtension` and the no-extension path):
```js
const platforms = ['underdog', 'draftkings'];
const rankingsMap = {};
for (const p of platforms) {
  let file = await syncGetFile(`rankings_${p}`, user.id);
  // One-time legacy fallback: migrate 'rankings' → 'rankings_underdog'
  if (!file && p === 'underdog') {
    file = await syncGetFile('rankings', user.id);
  }
  if (file) {
    const { parseCSVText } = await import('./utils/csv');
    rankingsMap[p] = await parseCSVText(file.text);
  }
}
setRankingsByPlatform(rankingsMap);
```

**`handleRankingsUpload(text, filename, platform)`** — add `platform` param:
- Save to `rankings_${platform}`
- Update `rankingsByPlatform[platform]` in state

**Render:** Pass `rankingsByPlatform={rankingsByPlatform}` to `<PlayerRankings>` (replaces
`initialPlayers`). Also remove the existing `syncGetFile('rankings', user.id)` block that
set `rankingsSource`.

### Step 4 — `PlayerRankings.jsx`

**Prop signature:** Replace `initialPlayers` with `rankingsByPlatform = {}`:
```js
export default function PlayerRankings({ rankingsByPlatform = {}, masterPlayers, onRankingsUpload, uploadAuthGuard, adpByPlatform = {} })
```

**Platform state** (same `platformInitDone` ref pattern as `AdpTimeSeries`):
```js
const availablePlatforms = useMemo(
  () => Object.keys(adpByPlatform).filter(p => adpByPlatform[p]?.latestRows?.length > 0),
  [adpByPlatform]
);
const [selectedPlatform, setSelectedPlatform] = useState(null);
const platformInitDone = useRef(false);
useEffect(() => {
  if (!platformInitDone.current && availablePlatforms.length > 0) {
    platformInitDone.current = true;
    const preferred = availablePlatforms.includes('underdog') ? 'underdog' : availablePlatforms[0];
    setSelectedPlatform(preferred);
  }
}, [availablePlatforms]);
```

**Active source** (saved rankings take priority; fall back to ADP rows):
```js
const activeSource = useMemo(() => {
  const saved = selectedPlatform ? rankingsByPlatform?.[selectedPlatform] : null;
  if (saved?.length > 0) return saved;
  return adpByPlatform?.[selectedPlatform]?.latestRows ?? [];
}, [rankingsByPlatform, selectedPlatform, adpByPlatform]);
```

**Seeding useEffect:**
- Replace `initialPlayers` → `activeSource` throughout
- Before `setRankedPlayers(...)`, call `setOverallTierBreaks(new Set())` and `setTierLabels({})`
  (clearing tier state on any source change, including platform switches)
- Change deps: `[initialPlayers]` → `[activeSource]`
- Update ref guard: `prevInitialPlayersRef.current === activeSource`

**Save handler** — pass platform to `saveRankingsToAssets`:
```js
await saveRankingsToAssets(rankedPlayers, fullTierMap, tierLabels, selectedPlatform || 'underdog');
```

**Upload handler** — pass platform upstream:
```js
onRankingsUpload(text, filename, selectedPlatform || 'underdog')
```

**Empty state** — update check:
```js
if (availablePlatforms.length === 0 && Object.values(rankingsByPlatform).every(r => !r?.length)) {
```

**Platform toggle UI** — add before the position chips (`filter-chip-group` div):
```jsx
{availablePlatforms.length > 1 && (
  <div className="filter-btn-group" style={{ padding: '0 0 8px' }}>
    {['underdog', 'draftkings']
      .filter(p => availablePlatforms.includes(p))
      .map(p => (
        <button key={p}
          className={`filter-btn-group__item ${selectedPlatform === p ? 'filter-btn-group__item--active' : ''}`}
          onClick={() => setSelectedPlatform(p)}
        >
          {p === 'underdog' ? 'Underdog' : 'DraftKings'}
        </button>
      ))}
  </div>
)}
```

### Edge cases
- `adpByPlatform` empty on first render → `availablePlatforms = []` → `selectedPlatform = null`
  → `activeSource = []` → seeding skips. Correct — data not loaded yet.
- Only one platform → toggle hidden; `selectedPlatform` set to that platform; save/load use
  `rankings_{platform}`.
- User uploads custom CSV → goes through `onRankingsUpload(text, filename, platform)` →
  overwrites that platform's saved rankings. The other platform is unaffected.

## Dependencies
- TASK-141 — platform-tagged ADP snapshots (done ✓)

---
*Approved by: <!-- developer name/initials and date once approved -->*
