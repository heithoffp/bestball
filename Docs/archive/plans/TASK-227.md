# TASK-227: Fix DK roster name matching — use draftables displayName at sync time

**Status:** Pending Approval
**Priority:** P1

---

## Objective

DK's `getlineupswithplayersforuser` lineup API returns abbreviated first names in both `p.fn` and `p.fnu` (confirmed live by developer on 2026-05-10 — Bijan Robinson comes back as `fn="B."`, James Cook III as `fn="J."`, Luther Burden III as `fn="L."`). The DK adapter at `chrome-extension/src/adapters/draftkings.js:236` builds roster entries via `name: \`${p.fn} ${p.ln}\``, so DK rosters land in the database as `"B. Robinson"`, `"J. Cook III"`, `"L. Burden III"`.

In the web app, `processMasterList` and `dataLoader.js` canonicalize those names to `"b robinson"` / `"j cook"` / `"l burden"`, while DK's ADP CSV uses full names that canonicalize to `"bijan robinson"` / `"james cook"` / `"luther burden"`. The keys never collide, so the affected players silently lose ADP, projections, team, and stack data on Exposures, ADP Tracker, Combos, Draft Assistant, and Roster Viewer.

The DK adapter already fetches `api.draftkings.com/draftgroups/v1/draftgroups/{id}/draftables` (line 152) for position and team lookups. That same response carries each player's full `displayName` (e.g. `"James Cook III"`). Fix the data at the sync source by preferring `displayName` over the abbreviated `${p.fn} ${p.ln}` concatenation. No web-app code changes required — the existing canonicalization will match the ADP keys cleanly once roster names are full.

This is orthogonal to TASK-226 (which added abbreviation fallback for the live extension overlay only). TASK-226 stays as-is and remains the safety net for any player whose draftables `displayName` is unavailable.

## Verification Criteria

1. After re-syncing a DK portfolio that contains Bijan Robinson, James Cook III, and Luther Burden III, the web app's Exposures tab displays each of those players with: a non-zero ADP value, a populated team abbreviation, and a non-zero projection. (Today they show `-` for ADP and blank team/projection.)
2. After re-sync, the Combos tab and Draft Assistant tab attribute these players to their real teams (e.g. Bijan Robinson → ATL) rather than treating them as orphan/no-team entries.
3. A roster entry whose `did` (draftableId) is missing from the draftables response — or whose draftables fetch failed — still produces a usable `name` field via the existing `${p.fn} ${p.ln}` fallback. No roster row drops out.
4. `npm run build` in `chrome-extension/` completes without errors.
5. The picks-panel disambiguation bonus: on a DK live draft page where the user's portfolio contains both Bijan Robinson and Brian Robinson Jr. (both RB), the live overlay's correlation breakdown attributes a "B. Robinson" pick to the correct full-name canonical key based on the team column visible in the DK roster panel.
6. (Scope expansion 2026-05-10) On a DK live draft page, a player whose last name contains an internal period — `A. St. Brown` (Amon-Ra St. Brown) is the canonical example — shows correct non-zero `Exp` and `Corr` when present in the user's synced rosters, instead of the current 0% / blank.

## Verification Approach

Automated:
- Run `npm run build` inside `chrome-extension/` to confirm clean build.

Manual (requires the developer):
1. Build and load the updated unpacked extension in Chrome.
2. From `https://www.draftkings.com/mycontests`, run the **Sync Rosters** flow against a DK portfolio that includes at least one of: Bijan Robinson, James Cook III, Luther Burden III. (If none of those are in your portfolio, any player whose draftables `displayName` differs from `${p.fn} ${p.ln}` will exercise the fix — easiest check is opening DevTools → Network → response from `getlineupswithplayersforuser` and confirming `p.fn` is short.)
3. Open the web app, go to the **Exposures** tab, and confirm those players now show ADP, team, and projection values that match the DK ADP CSV.
4. Open the **ADP Tracker** tab for one of the same players and confirm the historical timeline renders.
5. Open a DK live draft page (any active draft). Hover the correlation cell for a row whose name appears in your portfolio — confirm the breakdown popup credits the correct picks. For the bonus disambiguation criterion, confirm a portfolio containing two same-position B. Robinsons resolves the right one for each.

Migration note (non-blocking, document in this plan only): rosters synced before this fix will keep their abbreviated names in storage. The first re-sync after the update will overwrite them with full names. No automatic backfill is performed; users who don't re-sync will continue to see the old behavior. Acceptable for a P1 data-correctness fix at this lifecycle stage.

## Files to Change

| Path | Change |
|---|---|
| `chrome-extension/src/adapters/draftkings.js` | Extend `didToInfo` to also store `displayName` (and `firstName` / `lastName` if present, as belt-and-suspenders fallbacks). In the player mapping at the bottom of `getEntries`, prefer `dInfo.displayName` over `${p.fn} ${p.ln}`. Additionally extract the team string in `getCurrentPicks` from `.PlayerCell_player-team` and include it on each pick object. |
| `chrome-extension/src/content/draft-overlay.js` | In `resolveCurrentPicks` (~line 597), pass `{ position: p.position, team: p.team }` (instead of just `{ position: p.position }`) to `resolvePlayerKey` so ambiguous `"B. Robinson"`-style abbreviations can disambiguate by team when the position is shared. **Also (scope expansion 2026-05-10):** unify the keying of `abbreviatedNameMap` so that last names containing internal periods (e.g. `"St. Brown"`) match. The current build at ~line 285 produces key `"a. st brown"` (period only after initial — `lastName` came from a canonical fullName whose periods were already stripped), while the lookup at ~line 700 leaves embedded periods intact, producing `"a. st. brown"`. Result: zero exposure on `A. St. Brown` even when in portfolio. Fix by routing both build and lookup through `canonicalName` — drop the period from the abbrev build (`\`${firstInitial} ${lastName}\``) and use `canonicalName(displayName)` as the lookup key. |

No changes to:
- `best-ball-manager/**` — web app canonicalization is already correct; the fix is upstream at the data source.
- `chrome-extension/src/utils/canonicalName.js` — TASK-226 helper stays.
- `chrome-extension/src/adapters/underdog.js` — UD lineup API returns full names; unaffected.
- Sync/storage layer (`extensionBridge`, Supabase entries schema) — same shape, just better content in the `name` field.

## Implementation Approach

1. **Extend draftables lookup.** In `draftkings.js:161-174`, where `didToInfo[d.draftableId]` is currently populated with `{ position, team }`, also include `displayName: d.displayName ?? null`. (The endpoint returns `displayName`, `firstName`, `lastName`, `shortName` — `displayName` is the canonical full form like `"James Cook III"`.)
2. **Prefer displayName in the player map step.** In `draftkings.js:232-242`, change:
   ```js
   name: `${p.fn} ${p.ln}`,
   ```
   to:
   ```js
   name: dInfo?.displayName ?? `${p.fn} ${p.ln}`,
   ```
   This preserves the existing fallback path for any draftableId that isn't in the lookup map (e.g., draftables fetch failure on that draft group).
3. **Picks-panel team capture.** In `draftkings.js:380-394 getCurrentPicks`, after reading `position`, also read team via `row.querySelector('.PlayerCell_player-team')?.textContent?.trim().toUpperCase() || ''` and add `team` to each pushed pick object. Note: the existing `getPlayerContext(row)` selector at line 405-408 demonstrates the same DOM path, so we know the selector works on DK rows.
4. **Pass team in resolveCurrentPicks.** In `draft-overlay.js:597-601`, change the context object passed to `resolvePlayerKey` from `{ position: p.position }` to `{ position: p.position, team: p.team }`. The existing disambiguation logic in `resolvePlayerKey` (lines 708-725) already handles team — this just plumbs it through.
5. **Smoke-build.** Run `npm run build` in `chrome-extension/` and check for syntax errors.
6. **Hand off for manual verification per the steps above.**

## Rollback Approach

Revert the commit. Extension-only change with no schema, no Supabase migration, and no web-app coupling. Existing rosters that were re-synced under the new code will keep their full-name `name` field in storage; that's harmless because the web app already accepts both forms (full names canonicalize the same way ADP does, abbreviated forms are what we had before). No data migration needed in either direction.

---

Please review and reply **approved** to proceed, or provide feedback to revise.
