<!-- Completed: 2026-04-03 | Commit: cee9a97 -->
# TASK-096: Live draft overlay — wire up exposure and correlation from portfolio data

**Status:** In Progress
**Priority:** P2

---

## Objective

Port the exposure and correlation computation from `DraftFlowAnalysis.jsx` into the Chrome extension so the draft overlay's Exp and Corr columns show real portfolio metrics instead of "--" placeholders during live Underdog drafts.

## Verification Criteria

1. On a live Underdog draft page, the Exp column shows a non-"--" percentage (e.g. "34%") for players who appear in the user's portfolio.
2. Players with zero portfolio presence show "0%" (not "--").
3. The Corr column shows "0" when no picks have been made yet, and updates to a non-zero value after the user makes picks that overlap with the candidate player's roster appearances.
4. Hovering the Corr cell opens the popup and shows per-pick breakdown rows (player name, position badge, bar, percentage) for each current pick.
5. After reloading the page mid-draft, data reloads from Supabase and metrics remain accurate.

## Verification Approach

1. Developer loads the extension, navigates to a live Underdog draft page.
2. Confirm Exp column shows percentage values (not "--") before any picks are made.
3. Make 1-2 picks, confirm Corr column updates to non-zero values for relevant players.
4. Hover a Corr cell with a non-zero value — confirm popup shows rows with pick names and percentages.
5. Reload the page mid-draft — confirm data reloads and metrics re-populate without manual sync.
6. Check browser console for `[BBM]` logs — confirm no errors, confirm "Portfolio loaded: N entries" log appears.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/src/utils/bridge.js` | Modify | Add `readEntries()` that fetches `extension_entries` from Supabase for current user |
| `chrome-extension/src/content/draft-overlay.js` | Modify | Add portfolio load, playerIndexMap build, current picks detection, and per-row metric computation |

## Implementation Approach

### Step 1 — bridge.js: add `readEntries()`

Add an exported async function that queries the `extension_entries` table for the current authenticated user and returns entries in the same shape written by `writeEntries()`:

```js
export async function readEntries() {
  if (!supabase) throw new Error('[BBM] Supabase not configured');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('[BBM] Not authenticated');

  const { data, error } = await supabase
    .from('extension_entries')
    .select('entry_id, tournament, draft_date, players')
    .eq('user_id', session.user.id);

  if (error) throw error;
  return (data ?? []).map(row => ({
    entryId: row.entry_id,
    tournamentTitle: row.tournament,
    draftDate: row.draft_date,
    players: row.players ?? [],
  }));
}
```

### Step 2 — draft-overlay.js: module-level state

Add three module-level state variables (alongside the existing `gridObserver`, `enabled`, `rafId`):

```js
let playerIndexMap = new Map();   // playerName -> Set<rosterIndex>
let totalRosters = 0;
let currentPicks = [];            // [{name, position, round}, ...]
let picksObserver = null;
```

### Step 3 — draft-overlay.js: `loadPortfolioData()`

New async function called once from `startOverlay()` (after `injectStyles()`):

```js
async function loadPortfolioData() {
  try {
    const entries = await readEntries();
    totalRosters = entries.length;
    playerIndexMap = new Map();
    entries.forEach((entry, rosterIdx) => {
      (entry.players ?? []).forEach(p => {
        if (!p.name) return;
        const key = p.name.trim().toLowerCase();
        if (!playerIndexMap.has(key)) playerIndexMap.set(key, new Set());
        playerIndexMap.get(key).add(rosterIdx);
      });
    });
    console.log(`[BBM] Portfolio loaded: ${totalRosters} entries, ${playerIndexMap.size} players`);
    sweepRows(); // re-sweep now that data is available
  } catch (err) {
    console.warn('[BBM] Could not load portfolio data:', err.message);
  }
}
```

Note: keys are lowercased for resilient matching against whatever name format the DOM provides.

### Step 4 — draft-overlay.js: current picks detection

Underdog renders the user's drafted players in a "my team" section of the draft board. The most reliable approach is to observe a picks container and read player name text from it.

**Selector strategy (to be verified against live DOM):**
- Underdog my-picks panel selector: `[data-testid="my-team-player"]` or similar (verify in DevTools)
- Player name within a pick row: the first `.playerName` or `[class*="playerName"]` text node

Add `startPicksObserver()` and `resolveCurrentPicks()`:

```js
const MY_PICKS_SELECTOR = '[data-testid="my-team-player"]'; // verify in DOM

function resolveCurrentPicks() {
  const pickEls = document.querySelectorAll(MY_PICKS_SELECTOR);
  currentPicks = Array.from(pickEls).map((el, idx) => {
    const nameEl = el.querySelector('[class*="playerName"], [class*="name"]');
    const posEl = el.querySelector('[class*="position"], [class*="pos"]');
    return {
      name: nameEl?.textContent?.trim() ?? '',
      position: posEl?.textContent?.trim() ?? '',
      round: idx + 1,
    };
  }).filter(p => p.name);
  sweepRows(); // re-render all visible rows with updated picks
}

function startPicksObserver() {
  if (picksObserver) return;
  // Watch the entire document for mutations in the picks area
  picksObserver = new MutationObserver(() => {
    resolveCurrentPicks();
  });
  picksObserver.observe(document.body, { childList: true, subtree: true });
  resolveCurrentPicks(); // initial read
}
```

Stop the observer in `stopOverlay()`:
```js
if (picksObserver) { picksObserver.disconnect(); picksObserver = null; }
currentPicks = [];
```

### Step 5 — draft-overlay.js: player name resolution from row DOM

Each Underdog player row (`data-testid="player-cell-wrapper"`) contains the player's name in a text element. Strategy:

```js
function getPlayerNameFromRow(row) {
  const nameEl = row.querySelector('[class*="playerName"], [class*="name"]');
  return nameEl?.textContent?.trim() ?? null;
}
```

The key used for lookup should be lowercased to match the playerIndexMap keys.

### Step 6 — draft-overlay.js: compute metrics per row

Add pure computation functions (no DOM side effects):

```js
function computeExposure(playerName) {
  if (totalRosters === 0) return 0;
  const key = playerName.trim().toLowerCase();
  const rosterSet = playerIndexMap.get(key);
  if (!rosterSet) return 0;
  return (rosterSet.size / totalRosters) * 100;
}

function computeCorrelation(playerName) {
  const key = playerName.trim().toLowerCase();
  const candidateRosters = playerIndexMap.get(key) ?? new Set();
  const breakdown = [];
  let sumProb = 0, comparisons = 0;

  currentPicks.forEach(pick => {
    const pickKey = pick.name.trim().toLowerCase();
    const pickRosters = playerIndexMap.get(pickKey) ?? new Set();
    if (pickRosters.size === 0) return;

    let intersection = 0;
    if (pickRosters.size < candidateRosters.size) {
      pickRosters.forEach(rid => { if (candidateRosters.has(rid)) intersection++; });
    } else {
      candidateRosters.forEach(rid => { if (pickRosters.has(rid)) intersection++; });
    }

    const prob = intersection / pickRosters.size;
    sumProb += prob;
    comparisons++;
    breakdown.push({ name: pick.name, position: pick.position, round: pick.round, pct: Math.round(prob * 100) });
  });

  return {
    score: comparisons > 0 ? Math.round((sumProb / comparisons) * 100) : 0,
    breakdown,
  };
}
```

### Step 7 — draft-overlay.js: update `processRow()` to populate values

After injecting the `[exp, corr]` elements, call the compute functions and set values:

```js
const playerName = getPlayerNameFromRow(row);
if (playerName && totalRosters > 0) {
  const expPct = computeExposure(playerName);
  exp.textContent = `${Math.round(expPct)}%`;

  const { score, breakdown } = computeCorrelation(playerName);
  corrValue.textContent = String(score);

  // Populate corr popup
  const popup = corr.querySelector('.bbm-corr-popup');
  if (breakdown.length > 0) {
    popup.innerHTML =
      '<div class="bbm-corr-popup-title">Roster Overlap</div>' +
      breakdown.map(b => `
        <div class="bbm-corr-popup-row">
          <span class="bbm-corr-popup-pos">${b.position}</span>
          <span class="bbm-corr-popup-name">${b.name}</span>
          <div class="bbm-corr-popup-bar">
            <div class="bbm-corr-popup-bar-fill" style="width:${b.pct}%;background:#3b82f6"></div>
          </div>
          <span class="bbm-corr-popup-pct">${b.pct}%</span>
        </div>`).join('');
  } else {
    popup.innerHTML =
      '<div class="bbm-corr-popup-title">Roster Overlap</div>' +
      '<div class="bbm-corr-popup-empty">No picks yet</div>';
  }
}
```

For recycled rows (when `existing === playerId` is not true but the row exists), call an `updateRowMetrics(row)` helper that re-reads and refreshes values without re-injecting DOM.

### Step 8 — wire into `startOverlay()`

```js
function startOverlay() {
  if (gridObserver) return;
  injectStyles();
  loadPortfolioData();   // async, sweeps rows when done
  startPicksObserver();  // starts watching picks
  gridObserver = createReconnectingObserver({ ... });
  sweepRows();
}
```

### Edge cases

- **No portfolio data loaded yet:** exp shows "--%" and corr shows "--" (existing default — no change until loadPortfolioData() completes)
- **Player not in portfolio:** shows "0%" exposure, "0" correlation
- **Row recycled:** `processRow` already removes old `.bbm-inline-overlay` nodes and reinjects — the metric computation runs fresh each time
- **Picks observer fires frequently:** `sweepRows()` is already debounced via RAF, so thrashing is bounded

## Dependencies

None — TASK-042, TASK-043, TASK-044, TASK-045, TASK-046 are all Done.

## Open Questions

- **MY_PICKS_SELECTOR:** The exact DOM selector for the user's current draft picks panel needs to be verified in DevTools on a live Underdog draft. The implementation should use a verified selector; if unknown at implementation time, use a console.log to dump candidate elements and iterate.
- **Player name selector within a row:** Similarly, `[class*="playerName"]` is the most likely pattern but must be verified. If wrong, `getPlayerNameFromRow()` returns null and rows silently show the existing placeholders — non-breaking.
- **Row update for already-injected rows:** When picks change, `sweepRows()` is triggered but `processRow` skips rows where `existing === playerId`. A `updateRowMetrics()` helper that refreshes values on already-injected rows is needed to handle the post-pick update case.

---
*Approved by: <!-- developer name/initials and date once approved -->*
