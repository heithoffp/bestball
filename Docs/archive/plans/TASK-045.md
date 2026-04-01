<!-- Completed: 2026-04-01 | Commit: pending -->
# TASK-045: Web app sync UX

**Status:** Approved
**Priority:** P2

---

## Objective

Make the Chrome extension the sole data source for the web app. Authenticated users load portfolio data exclusively from `extension_entries` in Supabase. The CSV roster upload path is removed entirely. Unauthenticated users see read-only demo data. Authenticated users with no extension entries see a "get started" empty state that directs them to install the extension.

## Verification Criteria

1. Authenticated user with extension entries → data loads automatically on mount, `isUsingDemoData` is false, entry count and last-synced time shown in header.
2. Authenticated user with no extension entries → empty state with extension install CTA (not demo data, not an error).
3. Unauthenticated user → demo data loads as before (read-only preview).
4. Sync button in header: clicking it re-reads `extension_entries` and reprocesses without a page reload. Button is disabled and shows loading state during sync.
5. No CSV roster upload button, modal, or handler anywhere in the app.
6. Demo banner "Upload your rosters" link is removed.
7. `processLoadedData` continues to work correctly with both `rosterText` (existing paths) and `rosterRows` (new extension path).
8. `npm run build` produces zero errors.

## Verification Approach

1. Run `npm run build` from `best-ball-manager/` — confirm zero errors.
2. Open dev server (`npm run dev`), signed in with an account that has `extension_entries` rows:
   - Confirm dashboard shows real portfolio data on load.
   - Confirm header shows entry count + last-synced time.
   - Click sync button — confirm data refreshes.
3. Sign out — confirm demo data loads and sync button is hidden.
4. Sign in with an account that has no `extension_entries` — confirm empty state renders with extension install CTA (no demo data, no upload button).
5. Audit the rendered UI for any remaining CSV upload affordances (buttons, file inputs, drag-drop zones).

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `src/utils/extensionBridge.js` | Modify | Add `convertEntriesToRosterRows(entries)` |
| `src/utils/dataLoader.js` | Modify | Accept `rosterRows` as an alternative to `rosterText` |
| `src/App.jsx` | Modify | Remove CSV upload handlers and demo banner upload link; add extension load path, sync button, and empty-state logic |
| `src/components/Dashboard.jsx` | Modify | Replace CSV upload empty state with extension install CTA |
| `src/components/ExposureTable.jsx` | Modify | Remove `onRosterUpload` and `uploadAuthGuard` props and their usage |

## Implementation Approach

### Step 1 — `extensionBridge.js`: row converter

Add `convertEntriesToRosterRows(entries)` after `readExtensionEntries`:

```js
export function convertEntriesToRosterRows(entries) {
  const rows = [];
  for (const entry of entries) {
    for (const player of (entry.players ?? [])) {
      rows.push({
        name: player.name?.trim().replace(/\s+/g, ' ') || 'Unknown',
        position: player.position || 'N/A',
        team: player.team || 'N/A',
        entry_id: entry.entryId,
        pick: Number(player.pick) || 0,
        round: player.round ?? (player.pick > 0 ? Math.ceil(player.pick / 18) : '-'),
        pickedAt: entry.draftDate || null,
        tournamentTitle: entry.tournamentTitle || null,
      });
    }
  }
  return rows.filter(p => p.name !== 'Unknown');
}
```

### Step 2 — `dataLoader.js`: accept pre-mapped rows

Add `rosterRows` as an optional alternative to `rosterText`:

```js
export async function processLoadedData({ rosterText, rosterRows, adpFiles, rankingsText, projectionsText })
```

At the top of the function, replace the CSV parse + map block with:

```js
let mappedRosters;
if (rosterRows) {
  mappedRosters = rosterRows; // pre-mapped from extension, skip CSV parsing
} else {
  const parsed = rosterText ? await parseCSVText(String(rosterText)) : [];
  mappedRosters = parsed.map(row => { /* existing mapping unchanged */ }).filter(p => p.name !== 'Unknown');
}
```

Non-breaking — all existing callers pass `rosterText` and continue to work.

### Step 3 — `App.jsx`: new data loading architecture

**Remove entirely:**
- `handleRosterUpload` callback
- `uploadAuthGuard` callback
- `loadFromStorage()` function
- Demo banner upload link (the `<label>` with hidden `<input type="file">` inside the `isUsingDemoData` block)
- `onRosterUpload` and `uploadAuthGuard` props passed to `<Dashboard>` and `<ExposureTable>`

**New state:**
```js
const [extensionSyncInfo, setExtensionSyncInfo] = useState(null);
// shape: { count: number, lastSyncedAt: string } | null
const [isSyncing, setIsSyncing] = useState(false);
```

**New `loadFromExtension()` function:**
```js
async function loadFromExtension() {
  const { readExtensionEntries, convertEntriesToRosterRows } = await import('./utils/extensionBridge');
  const entries = await readExtensionEntries(user.id);
  if (entries.length === 0) return false;
  const rosterRows = convertEntriesToRosterRows(entries);
  const adpFiles = await loadBundledAdp();
  const projectionsRaw = Object.values(projectionsModules)[0];
  const result = await processLoadedData({
    rosterRows,
    adpFiles,
    projectionsText: projectionsRaw ? String(projectionsRaw) : undefined,
  });
  applyResult(result);
  setIsUsingDemoData(false);
  setExtensionSyncInfo({ count: entries.length, lastSyncedAt: entries[0]?.syncedAt ?? null });
  trackEvent('extension_sync_loaded', { count: entries.length });
  return true;
}
```

**Revised `loadData()`:**
```js
async function loadData() {
  setStatus({ type: 'loading', msg: 'Loading data...' });
  try {
    if (user?.id && supabase) {
      // Authenticated: extension is the only data source
      const loaded = await loadFromExtension();
      if (!loaded) {
        // Authenticated but no extension entries — show empty state
        setRosterData([]);
        setMasterPlayers([]);
        setAdpSnapshots([]);
        setRankingsSource([]);
        setExtensionSyncInfo(null);
      }
      setStatus({ type: '', msg: '' });
    } else {
      // Unauthenticated: demo data for preview
      await loadFromAssets();
    }
  } catch (err) {
    console.error('Load failed', err);
    setStatus({ type: 'error', msg: String(err) });
  }
}
```

If `loadFromExtension` throws (network error, Supabase offline), let it bubble to the catch block and show an error status. Do not silently fall back to demo data for authenticated users — the error is meaningful.

**Manual sync handler:**
```js
const handleManualSync = useCallback(async () => {
  if (!user?.id || isSyncing) return;
  setIsSyncing(true);
  setStatus({ type: 'loading', msg: 'Syncing from extension...' });
  try {
    await loadFromExtension();
    setStatus({ type: '', msg: '' });
  } catch (err) {
    setStatus({ type: 'error', msg: String(err) });
  } finally {
    setIsSyncing(false);
  }
}, [user?.id, isSyncing]);
```

**Sync button in header** (insert before `<AuthButton />`):
```jsx
{user && supabase && extensionSyncInfo && (
  <button
    className="toolbar-btn"
    onClick={handleManualSync}
    disabled={isSyncing}
    title="Re-sync from Chrome extension"
    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', opacity: isSyncing ? 0.5 : 1 }}
  >
    <RefreshCw size={14} className={isSyncing ? 'spin' : ''} />
    <span>{extensionSyncInfo.count} entries</span>
  </button>
)}
```

Add `RefreshCw` to the lucide-react import. Add `.spin` CSS keyframe animation in `index.css`.

**Demo banner:** Remove the upload `<label>` and hidden file input. The banner text ("You're viewing sample data.") can remain for unauthenticated users, or be removed in TASK-050.

### Step 4 — `Dashboard.jsx`: new empty state

Replace the CSV upload empty state with an extension install CTA:

```jsx
if (rosterData.length === 0) {
  return (
    <div className={styles.emptyState}>
      <Chrome size={48} className={styles.emptyIcon} />
      <div className={styles.emptyTitle}>Connect the Chrome extension</div>
      <div className={styles.emptyDesc}>
        Install the Best Ball Exposures Chrome extension, visit your Underdog completed entries, and sync your portfolio. Your analysis will load here automatically.
      </div>
      <a
        href="https://chrome.google.com/webstore/..."
        target="_blank"
        rel="noreferrer"
        className="btn-primary"
      >
        Get the Extension
      </a>
    </div>
  );
}
```

Use `Chrome` icon from lucide-react. The Chrome Web Store URL is a placeholder — leave it as `#` or a TBD comment if not yet published. Remove the `Upload` icon import if it's no longer used elsewhere in Dashboard.

Also remove `onRosterUpload` and `uploadAuthGuard` from the Dashboard component's prop signature.

### Step 5 — `ExposureTable.jsx`: remove upload props

Remove `onRosterUpload` and `uploadAuthGuard` from the component signature and any usage within the component. Remove the `FileUploadButton` import if it's only used for roster upload in this file.

### What is NOT changed in this task

- **Rankings CSV upload** (`handleRankingsUpload`, `PlayerRankings` file input) — custom rankings are separate from roster data and remain in place. This can be revisited later.
- **`FileUploadButton` component** — not deleted; may still be used by PlayerRankings.
- **`cloudStorage.js` / `storage.js` utilities** — not deleted; used by rankings and potentially future features.
- **`loadFromAssets()`** — kept for the unauthenticated demo path.

## Dependencies

TASK-043 (Supabase data bridge — `readExtensionEntries` already defined)

---
*Approved by: <!-- developer name/initials and date once approved -->*
