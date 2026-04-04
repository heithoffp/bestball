# TASK-106: Overlay confidence panel — sync progress and connectivity status

**Status:** Pending Approval
**Priority:** P2

---

## Objective

Expand the `#bbm-panel` floating config panel to show sync status and connectivity health. The panel currently has only an Overlay toggle — users have no visibility into whether their portfolio loaded, whether they're authenticated, or when data was last synced.

## Verification Criteria

1. Panel shows a colored status dot + label reflecting auth/load state:
   - Green "Connected" after successful portfolio load
   - Amber "Not signed in" when no Supabase session
   - Red error message (e.g., "Connection lost — tap to retry") on load failure
2. Panel shows "N entries · synced X ago" after a successful sync
3. Panel shows "Not yet synced" if no `lastSync` in `chrome.storage.local`
4. Panel shows "Fetching entries…" while `loadPortfolioData()` is in flight
5. Clicking the status row in error state re-triggers `loadPortfolioData()`
6. Status refreshes each time the FAB is clicked to open the panel

## Verification Approach

Manual in browser with extension loaded:
1. Load extension on an Underdog page while signed in — open panel, confirm green dot + sync line
2. Sign out of Supabase (clear session from chrome.storage) — reload, open panel, confirm amber dot
3. Simulate error: temporarily break the Supabase URL, reload, open panel, confirm red dot + error text and retry-on-click
4. Check "Fetching entries…" by slowing network in DevTools while overlay loads on a draft page

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/src/content/draft-overlay.js` | Modify | Add loadState, loadError, updatePanelStatus(), resolveErrorMessage(), formatRelativeTime(); update loadPortfolioData() and injectFloatingButton() |

## Implementation Approach

### 1. New module-level state (top of file, near other module vars)

```js
let loadState = 'idle'; // 'idle' | 'loading' | 'ready' | 'error'
let loadError = null;   // string | null
```

### 2. `resolveErrorMessage(err)` helper

```js
function resolveErrorMessage(err) {
  const msg = err?.message ?? '';
  if (msg.includes('Not authenticated') || msg.includes('JWT')) return 'Session expired — sign in again';
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('NetworkError')) return 'Connection lost — tap to retry';
  return 'Load failed — tap to retry';
}
```

### 3. `formatRelativeTime(ms)` helper

Returns strings like "just now", "2m ago", "1h ago", "3d ago".

```js
function formatRelativeTime(ms) {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}
```

### 4. `updatePanelStatus()` function

```js
async function updatePanelStatus() {
  const dot = document.querySelector('.bbm-status-dot');
  const label = document.querySelector('.bbm-status-label');
  const syncLine = document.querySelector('.bbm-panel-sync-line');
  if (!dot || !label || !syncLine) return;

  // Auth check
  const session = await getAuthSession();

  let dotColor, labelText;
  if (!session) {
    dotColor = '#F59E0B'; // amber
    labelText = 'Not signed in';
  } else if (loadState === 'loading') {
    dotColor = '#6B7280'; // grey
    labelText = 'Loading portfolio…';
  } else if (loadState === 'error') {
    dotColor = '#EF4444'; // red
    labelText = loadError ?? 'Load failed — tap to retry';
  } else {
    dotColor = '#10B981'; // green
    labelText = 'Connected';
  }

  dot.style.background = dotColor;
  label.textContent = labelText;

  // Status row click for retry
  const statusRow = document.querySelector('.bbm-panel-status');
  if (statusRow) {
    statusRow.style.cursor = loadState === 'error' ? 'pointer' : 'default';
  }

  // Sync line
  if (loadState === 'loading') {
    syncLine.textContent = 'Fetching entries…';
    return;
  }

  chrome.storage.local.get(['lastSync', 'entryCount'], (result) => {
    if (result.lastSync) {
      syncLine.textContent = `${result.entryCount ?? 0} entries · synced ${formatRelativeTime(result.lastSync)}`;
    } else {
      syncLine.textContent = 'Not yet synced';
    }
  });
}
```

### 5. `loadPortfolioData()` changes

Wrap with state transitions (keep all existing logic inside, only add state management around it):

```js
async function loadPortfolioData() {
  loadState = 'loading';
  updatePanelStatus();
  try {
    const entries = await readEntries();
    // ... existing map-building logic unchanged ...
    loadState = 'ready';
    loadError = null;
    console.log(`[BBM] Portfolio loaded: ${totalRosters} entries, ${playerIndexMap.size} players indexed`);
    sweepRows();
  } catch (err) {
    loadState = 'error';
    loadError = resolveErrorMessage(err);
    console.warn('[BBM] Could not load portfolio data:', err.message);
  } finally {
    updatePanelStatus();
  }
}
```

### 6. Panel HTML additions in `injectFloatingButton()`

After the overlay toggle row, append to the panel innerHTML:

```html
<hr class="bbm-panel-divider" />
<div class="bbm-panel-status">
  <span class="bbm-status-dot"></span>
  <span class="bbm-status-label">—</span>
</div>
<div class="bbm-panel-sync-line">—</div>
```

Wire the status row click for error retry:

```js
const statusRow = panel.querySelector('.bbm-panel-status');
statusRow.addEventListener('click', () => {
  if (loadState === 'error') loadPortfolioData();
});
```

### 7. FAB click handler update

After `panel.classList.toggle('open')`, add:
```js
if (panel.classList.contains('open')) updatePanelStatus();
```

### 8. CSS additions in `injectStyles()`

```css
.bbm-panel-divider {
  border: none;
  border-top: 1px solid #243A5C;
  margin: 8px 0;
}
.bbm-panel-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}
.bbm-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  background: #6B7280;
}
.bbm-status-label {
  font-size: 11px;
  color: #C0CCE0;
}
.bbm-panel-sync-line {
  font-size: 10px;
  color: #8A9BB5;
  margin-top: 3px;
  padding-left: 12px;
}
```

## Dependencies

TASK-100 — floating logo button and panel DOM structure (done).

---
*Approved by: <!-- developer name/initials and date once approved -->*
