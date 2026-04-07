<!-- Completed: 2026-04-07 | Commit: pending -->
# TASK-174: Verify DraftKings lineup API response fields for draftStatus endpoint

**Status:** Done
**Priority:** P2

---

## Objective
Identify the correct URL parameters for the DraftKings draftStatus API (`api.draftkings.com/drafts/v1/{draftId}/entries/{entryId}/draftStatus`) by examining the lineup API response fields and finding the mapping from lineup data to draftStatus URL parameters. This unblocks TASK-160 (fix DK roster ingestion).

## Research Findings

### Lineup API (`getlineupswithplayersforuser`) — Fields
Top-level fields per lineup object:
- `LineupId` — unique lineup identifier (e.g., 5527273631)
- `SportId` — sport type (1 = NFL, 13 = Golf, etc.)
- `ContestDraftGroupId` — draft group identifier (e.g., 141336)
- `LastModified` — timestamp in `/Date(ms)/` format
- `Name`, `DisplayName`, `VisibleWhenUnlinked`, `IsOrphaned`, `EntryCount`
- `Players[]` — array of player objects

Player-level fields: `pid`, `pdkid`, `pcode`, `tid`, `tsid`, `fn`, `ln`, `fnu`, `lnu`, `pn` (lineup slot label — NOT real position), `rosposid`, `htid`, `atid`, `htabbr`, `atabbr`, `s`, `pd`, `pu`, `tr`, `ppg`, `r`, `pts`, `ipc`, `ytp`, `swp`, `stats`, `fullStats`, `nsstats`, `pp`, `i`, `did` (draftableId), `psc`, `ps`, `imgLg`, `imgSm`, and others.

**Key finding: No `ContestId` or `EntryId` field exists in the lineup API response.**

### draftStatus URL Mapping — Confirmed

The draftStatus URL parameters do NOT come from the lineup API. They come from a separate endpoint.

| URL Parameter | Field Name | Value (example) | Source |
|---|---|---|---|
| `{draftId}` | `ContestId` / `ActiveContestId` | 189434426 | `/contest/mycontests` |
| `{entryId}` | `UserContestId` | 5104978374 | `/contest/mycontests` |

**Join key:** `LineupId` (= `ActiveLineupId`) appears in both the lineup API and the mycontests page, linking the two data sources.

Confirmed URL pattern:
```
https://api.draftkings.com/drafts/v1/{ContestId}/entries/{UserContestId}/draftStatus?format=json
```

### Contest Data Source — `/contest/mycontests`

The same-origin endpoint `https://www.draftkings.com/contest/mycontests` (requires `credentials: 'include'`) returns an HTML page with embedded JSON containing contest entries. Each entry includes:

- `ContestId` (= `ActiveContestId`) → the `{draftId}` parameter
- `UserContestId` → the `{entryId}` parameter
- `LineupId` (= `ActiveLineupId`) → join key to lineup API
- `ActiveDraftGroupId` → matches `ContestDraftGroupId` from lineup API
- `ContestName`, `Sport`, `BuyInAmount` — contest metadata

### Authentication
- **draftStatus endpoint:** Requires authentication (returns 401 without cookies). Must use `credentials: 'include'` from `www.draftkings.com` origin.
- **`api.draftkings.com` CORS:** Returns `Access-Control-Allow-Origin: *`, which is incompatible with `credentials: 'include'`. However, the `/drafts/v1/` endpoints appear to have proper CORS headers (DK's own draft room page calls them with credentials successfully).
- **Draftables endpoint:** Publicly accessible without credentials.

### Additional Finding — Draftables Position Data
The draftables endpoint (`api.draftkings.com/draftgroups/v1/draftgroups/{id}/draftables`) — already fetched for team abbreviations — returns a `position` field with real football positions (QB, RB, WR, TE) and `displayName` per player. This provides an alternative position fix for TASK-160 that doesn't require the draftStatus API.

### Disproven Assumptions
- `ContestDraftGroupId` is NOT the `{draftId}` in the URL (141336 ≠ 189434426)
- `LineupId` is NOT the `{entryId}` in the URL (5527273631 ≠ 5104978374)
- The `draftgroups/v1/draftgroups/{id}` detail endpoint returns 404 for the known draft group ID

## Dependencies
None — this was a research/investigation task.
