<!-- Completed: 2026-04-07 | Commit: pending -->
# TASK-160: Fix DraftKings roster ingestion — draft pick order and player positions

**Status:** Done
**Priority:** P2

---

## Objective
Fix two bugs in the Chrome extension's DraftKings roster scraping: (1) players get lineup slot labels (FLEX, BN) instead of real positions (QB, RB, WR, TE), and (2) pick numbers reflect roster-slot order instead of actual draft pick order. Both corrupt downstream analytics (Draft Flow Analysis, CLV, archetype classification).

## Verification Criteria
1. DK-synced entries have correct football positions (QB, RB, WR, TE) — no FLEX or BN values
2. DK-synced entries have correct overall pick numbers (e.g., 9, 28, 33) and round numbers (1-20) — not sequential slot indices
3. Existing Underdog sync flow is unaffected
4. Contest name and metadata are populated from the mycontests data (replacing the manual `DRAFT_GROUP_META` lookup)

## Verification Approach
1. Reload the extension with the changes
2. Navigate to `draftkings.com/mycontests` and trigger sync
3. Check browser console for any errors
4. In the web app, verify DK entries show correct positions and pick/round numbers in the Rosters tab and Draft Flow Analysis
5. Verify Underdog entries still work correctly (no regression)

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/src/adapters/draftkings.js` | Modify | Add mycontests fetch, draftStatus fetch, fix position and pick mapping |

## Implementation Approach

### Phase 1: Fix positions using draftables (already fetched)

The draftables endpoint already returns `position` (QB/RB/WR/TE) and `displayName` per player. Extend the existing draftables processing to also build a `displayName → position` map alongside `tidToTeam`.

In the player mapping (line 101-107), replace `position: p.pn` with a lookup from the new map using `${p.fn} ${p.ln}` as the key, falling back to `p.pn` if not found.

### Phase 2: Fix pick order using draftStatus API

**Step 1 — Fetch contest-entry mapping from `/contest/mycontests`**

After fetching the lineup API, also fetch `https://www.draftkings.com/contest/mycontests` (same-origin, `credentials: 'include'`). Parse the HTML response to extract the embedded JSON array of contest entries. Each entry contains:
- `ContestId` → the `{draftId}` URL parameter
- `UserContestId` → the `{entryId}` URL parameter
- `ActiveLineupId` → join key matching `LineupId` from the lineup API
- `ContestName` → human-readable contest name (replaces `DRAFT_GROUP_META`)
- `Sport` → sport filter (1 = NFL)

Build a `LineupId → { ContestId, UserContestId, ContestName }` lookup from the NFL entries.

**Step 2 — Fetch draftStatus for each entry**

For each NFL lineup that has a match in the mycontests mapping, call:
```
https://api.draftkings.com/drafts/v1/{ContestId}/entries/{UserContestId}/draftStatus?format=json
```
With `credentials: 'include'`. Use `Promise.allSettled` for resilience.

**Step 3 — Extract picks for the current user**

From each draftStatus response:
1. Find the user's `userKey` by matching `users[].displayName` to the DK username (available from the mycontests HTML), or by matching picks — the user's entry will have picks matching the lineup's player list.
2. Filter `draftBoard[]` to only the user's picks (matching `userKey`).
3. For each pick, extract `overallSelectionNumber` (pick), `roundNumber` (round), and look up the player in `playerPool.draftablePlayers` by `playerId` to get `displayName` and `teamPositionId`.
4. Build a `playerDisplayName → { pick, round, position }` map.

**Step 4 — Map into Entry format**

Replace the current player mapping with draftStatus data where available. Use `teamPositionId` mapping: 1=QB, 2=RB, 3=WR, 4=TE. Fall back to draftables position if draftStatus is unavailable.

Use `ContestName` from mycontests for `tournamentTitle` instead of the manual `DRAFT_GROUP_META`.

### Edge Cases
- **draftStatus fetch fails:** Fall back to draftables-only data (correct positions, slot-order picks with round=0 — same as current behavior but with fixed positions)
- **mycontests HTML parsing fails:** Fall back entirely to current behavior
- **Player name mismatch between APIs:** Use `draftableId` (`did` field from lineup API = `draftableId` in draftStatus) as the primary join key instead of name matching
- **Large response size:** draftStatus is ~1.5MB per entry. With many entries, batch requests and add console progress logging

## Dependencies
- ~~TASK-174~~ — Completed. API field mapping confirmed.
