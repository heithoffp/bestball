<!-- Completed: 2026-04-05 | Commit: pending -->
# TASK-135: DraftKings adapter — improve entry metadata (tournament name, team, pick order)

**Status:** Done
**Priority:** P3

---

## Objective

Improve the metadata quality of entries synced by the DraftKings adapter: resolve NFL team abbreviations via the draftables API, add slate grouping labels, and provide a manual configuration map for tournament names per draft group ID. Pick/round order remains a known limitation (no DK endpoint exposes draft-pick sequence for completed best-ball entries).

## What Was Delivered

- **Team abbreviations:** Auto-resolved via batch-fetching `api.draftkings.com/draftgroups/v1/draftgroups/{id}/draftables` — builds a `teamId → teamAbbreviation` map applied to each player's `team` field with graceful fallback.
- **Slate title:** Added `slateTitle` field to DK entry output (defaults to `'DraftKings'`, configurable per group via `DRAFT_GROUP_META`). Fixes entries showing under "Other" slate.
- **Tournament name:** Manual `DRAFT_GROUP_META` config object maps `draftGroupId → { name, slate }`. DK doesn't expose historical contest names via any public API — confirmed after testing draftgroups metadata endpoint (returns generic "Salary" gameType), getcontests lobby (only lists current contests), and lineup API (no contest name field). Manual mapping is the practical solution.
- **UD prefix:** Prepended "UD " to Underdog slate titles for platform disambiguation.
- **Host permissions:** Added `https://api.draftkings.com/*` to manifest for cross-origin draftables fetch.
- **CORS fix:** Removed `credentials: 'include'` from draftables fetch — the cross-origin endpoint returns `Access-Control-Allow-Origin: *` which is incompatible with credentialed requests.

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/src/adapters/draftkings.js` | Modified | Added `DRAFT_GROUP_META` config, draftables batch-fetch for teams, `slateTitle` output |
| `chrome-extension/manifest.json` | Modified | Added `https://api.draftkings.com/*` to host_permissions |
| `chrome-extension/src/injected/underdog-bridge.js` | Modified | Prepended "UD " to Underdog slate titles |

## Known Limitations

- **Tournament name:** Cannot be auto-resolved for historical DK draft groups. The `DRAFT_GROUP_META` map must be maintained manually.
- **Pick/round order:** DK lineup API returns players in roster-slot order, not draft-pick order. No known endpoint returns pick sequence. `pick: idx + 1, round: 0` is a best-effort representation.
- **Multiple tournaments per draft group:** A single `ContestDraftGroupId` can contain multiple tournaments (different buy-in tiers). The lineup API doesn't expose which specific tournament the user entered, so all entries in a group share the same label.
