<!-- Completed: 2026-06-20 | Commit: pending-v1.3.0-release -->
# TASK-275: Fix Eliminator bye window dropping freshly-drafted Underdog players

**Status:** Approved
**Priority:** P2

---

## Objective

On a live **Underdog** Eliminator draft, the bye window (`Eliminator · Byes`) silently
drops any picked player whose team can't be resolved. The only team source for live picks
is `playerTeamMap`, built from the user's **already-synced portfolio**, so players never
previously rostered (rookies, new-to-portfolio players) resolve to `null` and disappear
from the bye rainbow. Fix it by giving the overlay an authoritative, live team source via
the page bridge.

(DraftKings is out of scope — it has no Eliminator contest.)

## Approach — live bridge lookup

Reuse the existing `getEntries`/`getBoards` postMessage pattern. The bridge already caches
Underdog reference data (`__BBM.players`, `__BBM.teams`, `__BBM.appearances`) and resolves
player→team in `normalizePick`/`normalizeBoard`. Expose that to the overlay for the current
draft as a `name → team` map; the overlay uses it as the primary team source for live picks,
with the portfolio map as fallback.

## Verification Criteria

- A drafted player not in the synced portfolio appears in the `Eliminator · Byes` window
  under the correct position with the correct bye week.
- A same-position shared bye still triggers the bye-clash row badge for such players.
- Players already in the portfolio still resolve (no regression).
- Extension bundle builds.

## Verification Approach

1. `cd chrome-extension && npm run build` — bundle succeeds.
2. Manual (developer, requires a live Underdog Eliminator draft):
   a. Enable Eliminator Mode, draft a player **not** in the synced portfolio (e.g. a rookie).
   b. Confirm the player appears in the bye window under the correct position + bye week.
   c. Confirm a same-position shared bye still triggers the bye-clash badge.
   d. Confirm portfolio players still resolve (no regression).
3. Reload the extension after the build before testing (dist bundle).

## Files to Change

| File | Change |
|------|--------|
| `chrome-extension/src/injected/underdog-bridge.js` | Add a `BBM_DRAFT_TEAMS_REQUEST` → `BBM_DRAFT_TEAMS_RESULT` handler. Reads the draft id from `location.pathname` (`/draft/{uuid}`), fetches `/v2/drafts/{id}` for `slate_id`, calls `ensureSlateLoaded(slateId)`, then returns `{ name, team }[]` for every slate player (team resolved via `team_id` → `__BBM.teams`, mirroring `normalizePick`). Entries with no resolvable team are omitted. Failures post an error, never throw. |
| `chrome-extension/src/adapters/underdog.js` | Add `getDraftPlayerTeams()` — posts the request, resolves with `{name, team}[]` (Promise + timeout, mirroring `getEntries`). |
| `chrome-extension/src/content/draft-overlay.js` | Add module-level `draftTeamMap` (canonicalName → team). On draft pages when Eliminator activates, call `adapter.getDraftPlayerTeams?.()` once and populate it (canonicalized). In `picksWithTeam()` resolve `draftTeamMap.get(key) ?? playerTeamMap.get(key) ?? null`. Apply the same fallback to the candidate-team lookup in `applyEliminatorBadge`. |

## Implementation Notes / Risks

- **Team-abbr resolution** is the main risk: `__BBM.teams` is populated passively from
  stats-host responses; if none has fired, team_ids may not map to abbreviations.
  Mitigation: `ensureSlateLoaded` pulls slate players/appearances, and the handler skips
  players whose team can't be resolved (no regression — those are already dropped today).
  Log resolved/total counts to `console.debug`.
- The bridge stays import-free; returns raw full names and lets the overlay canonicalize.
- Map is slate-stable — one fetch per draft suffices; refresh when the window opens / a new
  draft page loads.

## Rollback

Revert the commit — the change is additive (new message type + adapter method + fallback
map); removing it restores portfolio-only behavior.
