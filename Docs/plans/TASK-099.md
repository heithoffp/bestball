# TASK-099: Draft overlay — show tier breaks from PlayerRankings when sorted by My Rank

**Status:** Approved
**Priority:** P2

---

## Objective

When the Underdog draft board is sorted by "My Rank", inject a visual tier-break indicator on the first player row of each new tier (based on the user's PlayerRankings tier structure from the web app), so the user can see their personal tier boundaries directly in the draft room without switching tabs.

## Verification Criteria

1. When the board is sorted by "My Rank", rows that begin a new tier display a colored top-border indicator and a small "Tier X" badge above the player name area.
2. When the board is sorted by any other order (ADP, etc.), no tier indicators appear.
3. Switching the sort back to "My Rank" restores tier indicators on the next sweep.
4. As the user scrolls (virtualized rows recycle), tier indicators appear and disappear correctly based on which player occupies each row.
5. If no rankings data is saved to Supabase (user hasn't saved rankings), no tier indicators appear and no errors are thrown.
6. Tier indicator colors match the TIER_COLORS from PlayerRankings (S = gold, A = red, B = yellow, etc.).

## Verification Approach

1. Load the dev app (`npm run dev` in `best-ball-manager/`), navigate to PlayerRankings, arrange some tier breaks, and click Save.
2. Open Supabase Table Editor and confirm a row exists in `user_rankings` with the correct `user_id` and a valid `rankings` JSON column containing `{playerName, tierNum}` entries.
3. Open the Chrome extension on an Underdog draft page. Switch sort to "My Rank". Confirm tier break lines and badges appear at the correct tier boundaries.
4. Switch sort to ADP. Confirm all tier indicators disappear.
5. Switch back to "My Rank". Confirm they reappear.
6. Scroll the draft board. Confirm tier indicators correctly track which player rows start a tier.
7. Sign in as a user with no saved rankings. Confirm no tier indicators appear and no console errors are thrown.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/utils/rankingsExport.js` | Modify | Also save rankings to Supabase `user_rankings` table when `saveRankingsToAssets()` is called |
| `chrome-extension/src/utils/bridge.js` | Modify | Add `readRankings()` function that reads from Supabase `user_rankings` table |
| `chrome-extension/src/content/draft-overlay.js` | Modify | Load rankings data, detect "My Rank" sort state, and inject tier break styling on rows |

## Implementation Approach

### 1. Supabase `user_rankings` table

The `user_rankings` table needs to be created in Supabase with columns:
- `user_id` (uuid, references auth.users, PK)
- `rankings` (jsonb) — array of `{name: string, tierNum: number}` in ranked order
- `updated_at` (timestamptz)

Use `upsert` on `user_id` so each user has exactly one row (no history needed).

### 2. Web app: save rankings to Supabase (`rankingsExport.js`)

In `saveRankingsToAssets()`, after the existing `/__save-rankings` POST, also upsert to Supabase. Import `supabase` from `../lib/supabase` (or wherever the client is). Build the payload as an array of `{name, rank, tierNum}` from `rankedPlayers` + `tierMap`:

```js
const rankingsPayload = rankedPlayers.map((p, idx) => ({
  name: p.name.trim().toLowerCase(),
  rank: idx + 1,
  tierNum: tierMap.get(p.id) || 1,
}));
await supabase.from('user_rankings').upsert({
  user_id: (await supabase.auth.getUser()).data.user?.id,
  rankings: rankingsPayload,
  updated_at: new Date().toISOString(),
}, { onConflict: 'user_id' });
```

If Supabase is not configured or user is not signed in, skip silently (don't throw — this is optional enrichment).

### 3. Extension: `readRankings()` in bridge.js

```js
export async function readRankings() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from('user_rankings')
    .select('rankings')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (error || !data) return null;
  return data.rankings ?? null; // [{name, rank, tierNum}, ...]
}
```

### 4. Extension: load rankings data in `draft-overlay.js`

Add a module-level variable `playerRankingsMap = new Map()` (lowerCasedName → `{rank, tierNum}`).

In a new `loadRankingsData()` function:
```js
async function loadRankingsData() {
  try {
    const rankings = await readRankings();
    if (!rankings) return;
    playerRankingsMap = new Map(rankings.map(r => [r.name, { rank: r.rank, tierNum: r.tierNum }]));
    sweepRows();
  } catch (err) {
    console.warn('[BBM] Could not load rankings:', err.message);
  }
}
```

Call `loadRankingsData()` from `startOverlay()` alongside `loadPortfolioData()`.

### 5. Extension: sort detection

Add a `isMyRankSort()` helper that checks the active sort button:
```js
function isMyRankSort() {
  const buttons = document.querySelectorAll(SORT_BUTTONS_SELECTOR + ' button, ' + SORT_BUTTONS_SELECTOR + ' [role="button"]');
  for (const btn of buttons) {
    const text = btn.textContent?.trim().toLowerCase();
    if ((text === 'my rank' || text === 'my ranking') && (
      btn.getAttribute('aria-pressed') === 'true' ||
      btn.getAttribute('aria-selected') === 'true' ||
      btn.classList.contains('active') ||
      btn.getAttribute('data-active') === 'true'
    )) {
      return true;
    }
  }
  return false;
}
```

**Note:** The exact active-state attribute needs to be verified against the live Underdog DOM. If none of the ARIA attributes work, fall back to checking computed styles (background color change) or a CSS class diff between active/inactive buttons. This is the highest-risk step — if the DOM inspection doesn't confirm the selector during implementation, use a MutationObserver on the sort bar to detect class changes and test empirically.

To detect sort changes, observe mutations on the sort bar element and call `sweepRows()` when it changes.

### 6. Extension: tier break injection in `processRow()`

Tier breaks are injected as a styled attribute on the row — not a sibling DOM node — so they work correctly with the virtualized (absolutely-positioned) row layout.

In `processRow()`, after the existing injection logic:
```js
// Apply tier break indicator if sorted by My Rank
const tierActive = isMyRankSort() && playerTierMap.size > 0;
if (tierActive) {
  const playerName = getPlayerNameFromRow(row);
  if (playerName) {
    const entry = playerRankingsMap.get(playerName.trim().toLowerCase());
    const tierNum = entry?.tierNum;
    if (tierNum !== undefined) {
      // Check if this player starts a new tier (previous player in ranked order has lower tierNum)
      // Since we can't easily get the "previous" row here, use the tierNum itself:
      // Tier 1 never shows a break (it's the top); tier > 1 shows a break above.
      // We mark the row with the tier number and let CSS/a badge handle rendering.
      row.setAttribute('data-bbm-tier', String(tierNum));
      // Remove old badge if any, then inject new one if tier > 1
      row.querySelector('.bbm-tier-badge')?.remove();
      if (tierNum > 1) {
        const badge = document.createElement('div');
        badge.className = 'bbm-tier-badge';
        badge.textContent = getTierLabel(tierNum); // S, A+, A, etc.
        badge.style.borderTopColor = getTierBorderColor(tierNum);
        row.prepend(badge);
      }
    } else {
      row.removeAttribute('data-bbm-tier');
      row.querySelector('.bbm-tier-badge')?.remove();
    }
  }
} else {
  row.removeAttribute('data-bbm-tier');
  row.querySelector('.bbm-tier-badge')?.remove();
}
```

Add `getTierLabel(tierNum)` and `getTierBorderColor(tierNum)` as small helpers in the overlay file (matching the TIER_LABELS and TIER_COLORS from PlayerRankings).

**Important:** The `data-bbm-injected` attribute tracks which player currently occupies a row. On recycle, the existing code clears old injections. Extend this to also remove any `data-bbm-tier` attribute and `.bbm-tier-badge` element before re-injecting.

### 7. CSS for tier break styling

Add to `injectStyles()`:
```css
[data-bbm-tier] {
  border-top: 2px solid transparent;
}
/* Tier break: colored top border on the row */
[data-bbm-tier]:not([data-bbm-tier="1"]) {
  border-top: 2px solid var(--bbm-tier-color, #555);
}
.bbm-tier-badge {
  position: absolute;
  left: 4px;
  top: -1px;
  transform: translateY(-50%);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding: 1px 4px;
  border-radius: 2px;
  border-top: 2px solid transparent;
  pointer-events: none;
  color: inherit;
  opacity: 0.8;
  white-space: nowrap;
  z-index: 1;
}
```

The badge uses `position: absolute` with `top: -1px; transform: translateY(-50%)` so it straddles the top edge of the row, appearing visually between the previous and current player — even with absolute-positioned virtualized rows.

The row itself must have `position: relative` (or `position: static` with no overflow: hidden) for this to work. If the row doesn't have `position: relative`, set it via the attribute selector.

### 8. Sort change observation

In `startOverlay()`, after starting the grid observer, also observe the sort bar for class/attribute changes so tier indicators update when the user changes sort:

```js
const sortBarEl = document.querySelector(SORT_BUTTONS_SELECTOR);
if (sortBarEl) {
  const sortObserver = new MutationObserver(() => sweepRows());
  sortObserver.observe(sortBarEl, { attributes: true, attributeFilter: ['class', 'aria-pressed', 'data-active'], subtree: true });
}
```

Store the `sortObserver` reference and disconnect it in `stopOverlay()`.

## Dependencies

TASK-096 (overlay infrastructure — Done)

## Open Questions

- **Sort button active state:** The exact attribute/class indicating "My Rank" is active in the Underdog DOM is unknown. Plan uses `aria-pressed`/`aria-selected` as primary candidates. If neither works, a visual inspection during implementation is needed to find the correct signal. This is the highest-risk item — must be confirmed empirically before finalizing the sort detection logic.
- **Row `position: relative` assumption:** The badge uses absolute positioning relative to the row. If Underdog's rows have `overflow: hidden` or don't have a positioning context, the badge may clip or render in the wrong position. If this occurs, use an inline flex element instead of an absolutely-positioned badge.
- **Supabase table creation:** The `user_rankings` table must be created in Supabase before this task can be fully verified in production. In local dev, the `/__save-rankings` endpoint continues to work; the Supabase upsert is additive.

---
*Approved by: <!-- developer name/initials and date once approved -->*
