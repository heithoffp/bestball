<!-- Completed: 2026-04-01 | Commit: dc9101a -->
# TASK-044: Underdog entries list scraper

**Status:** Done
**Priority:** P2

---

## Objective

Implement `getEntries()` in the Underdog adapter so the extension scrapes all of a user's best-ball roster entries from `app.underdogfantasy.com` and writes them to Supabase via `writeEntries()`. Add a "Sync Now" button to the popup to trigger the scrape manually.

## Verification Criteria

1. On any `app.underdogfantasy.com/completed/*` page, clicking "Sync Now" in the popup triggers `getEntries()` and completes without error.
2. `getEntries()` returns an array of `Entry` objects matching the interface in `adapters/interface.js`: `entryId`, `tournamentTitle`, `draftDate`, `players[{name, position, team, pick, round}]`.
3. Entries are written to Supabase `extension_entries` — row count matches the user's known entry count.
4. Popup shows entry count and updates `lastSync` timestamp after a successful sync.
5. Popup shows an actionable error message if sync fails (not signed in, not on entries page, API error).
6. `npm run build` in `chrome-extension/` exits 0.

## Verification Approach

1. Run `cd chrome-extension && npm run build` — confirm exit 0.
2. Load unpacked extension in Chrome (`chrome://extensions → Load unpacked → chrome-extension/dist/`).
3. Sign in via the popup using a test account. Confirm "Sync Now" button is visible.
4. Navigate to `https://app.underdogfantasy.com/completed/all/`. Wait ~2 seconds for the page to make its first API calls (this populates the auth token and stats store). Click "Sync Now".
5. Confirm popup shows entry count (e.g. "Synced 104 entries").
6. Open Supabase table editor → `extension_entries` — confirm rows are present and the `players` JSON array has names, positions, and teams (not empty/unknown values).
7. Click "Sync Now" while signed out — confirm popup shows "Not signed in" error.
8. Navigate to a non-Underdog page and click "Sync Now" — confirm "Not on Underdog entries page" error.
9. **Developer step:** Confirm at least one entry's picks match what is shown in the Underdog UI.

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/manifest.json` | Modified | Updated `host_permissions` and `content_scripts.matches` to `app.underdogfantasy.com`; added `api.underdogfantasy.com` and `stats.underdogfantasy.com` |
| `chrome-extension/src/adapters/underdog.js` | Modified | `getEntries()` implemented — delegates to page bridge via postMessage |
| `chrome-extension/src/content/content.js` | Modified | Handles `SYNC_ENTRIES` message: calls `adapter.getEntries()` then `writeEntries()` |
| `chrome-extension/src/popup/popup.html` | Modified | Added "Sync Now" button and sync result element |
| `chrome-extension/src/popup/popup.js` | Modified | Wired Sync Now button — sends `SYNC_ENTRIES`, updates status display |
| `chrome-extension/src/injected/underdog-bridge.js` | Created | Page bridge: XHR interceptor, slate data loader, full API call chain, pick normalisation |

## Implementation Notes

### API call chain (confirmed)

```
/v2/user/completed_slates  (filter: best_ball: true)
  └── /v1/user/slates/{id}/tournament_rounds
        └── /v1/user/tournament_rounds/{id}/drafts?page=N  (paginated, 25/page, loop meta.next)
              └── /v2/drafts/{id}                           (picks + draft_entries)

stats.underdogfantasy.com/v1/slates/{slate_id}/players                              ← player names/positions/team_ids
stats.underdogfantasy.com/v1/slates/{slate_id}/scoring_types/{nflTypeId}/appearances ← appearance_id → player_id
stats.underdogfantasy.com/v1/scoring_types  (filter sport_id === 'NFL')              ← get nflTypeId
```

### Key discoveries made during implementation

**1. All API field names are snake_case**
`draft.draft_entries`, `draft.entry_count`, `draft.draft_at`, `pick.appearance_id`, `pick.draft_entry_id`

**2. userId — JWT sub is Auth0 format, not Underdog UUID**
- JWT `sub` = `auth0|...` (Auth0 format)
- `draft_entries[].user_id` = Underdog internal UUID
- Fix: call `GET /api.underdogfantasy.com/v1/user` at sync start; response is `{ user: { id: "<uuid>" } }`

**3. Appearances/players are not in the draft response**
- `/v2/drafts/{id}` returns only picks with `appearance_id` — no player names embedded
- Player data lives at `stats.underdogfantasy.com` scoped by slate + scoring type
- Stats endpoints require query params (`product`, `product_experience_id`, `state_config_id`) captured from page XHR
- NFL scoring type ID is global — filter `/v1/scoring_types` by `sport_id === 'NFL'`
- Slate data is loaded once per unique `slate_id` via `ensureSlateLoaded()` and cached in `window.__BBM`

**4. Drafts endpoint is paginated**
- 25 entries per page; loop until `meta.next === null`
- Root cause of initial 45/104 mismatch: Big Board (84 entries) spread across 4 pages, only page 1 fetched

**5. Underdog uses XHR, not fetch**
- Original plan to wrap `window.fetch` doesn't apply
- XHR interceptor wraps `XMLHttpRequest.prototype.open/setRequestHeader/send`

### window.__BBM state shape

```js
window.__BBM = {
  token:            null,   // 'Bearer <jwt>' from first api.underdogfantasy.com XHR
  userId:           null,   // Underdog internal UUID from GET /v1/user
  statsParams:      '',     // query string from first stats.underdogfantasy.com XHR
  nflScoringTypeId: null,   // cached from /v1/scoring_types filtered by sport_id === 'NFL'
  appearances:      {},     // appearance_id → { player_id, ... }
  players:          {},     // player_id     → { first_name, last_name, position_name, team_id }
  teams:            {},     // team_id       → { abbr }
}
```

## Dependencies

- TASK-042 (extension scaffold) — complete
- TASK-043 (Supabase data bridge) — complete; `writeEntries()` is ready in `bridge.js`

---
*Approved by: developer, 2026-04-01*
