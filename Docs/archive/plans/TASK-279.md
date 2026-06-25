<!-- Completed: 2026-06-25 | Commit: PENDING -->
# TASK-279: Cross-platform name reconciliation: nickname aliases so renamed players keep ADP

**Status:** Approved (implementation gated on ADR — matching strategy)
**Priority:** P2

---

## Objective
Ensure a player whose display name is changed by a platform mid-season (e.g. Underdog now returns "Kenny Gainwell" where synced rosters say "Kenneth Gainwell") still matches their ADP, projections, and exposure data. Fix the immediate Gainwell symptom and the general class via an explicit alias layer at the single name-normalization chokepoint.

## Verification Criteria
- `canonicalName('Kenny Gainwell') === canonicalName('Kenneth Gainwell')` — both resolve to one key.
- In the app (demo or synced), Kenneth Gainwell shows his Underdog ADP (≈105.4 from the 06-25 snapshot) instead of `-`.
- No over-merging regression: two genuinely different players are never collapsed to the same key by the alias layer (alias entries are full-name scoped, not blanket first-name substitutions). Exposure counts for unaffected players are unchanged.
- The Chrome-extension overlay matches Gainwell too, after `cd chrome-extension && npm run build` (the extension keeps a `canonicalName` mirror per TASK-226).
- `npm run build` exits 0; `npm run lint` clean for touched files.

## Verification Approach
1. **Unit check** — throwaway node snippet importing `canonicalName`: assert `canonicalName('Kenny Gainwell') === canonicalName('Kenneth Gainwell')`, and assert two unrelated players (e.g. `'Mike Evans'` vs `'Mike Williams'`) still produce distinct keys. Report output.
2. **App behavior (developer)** — load demo/synced data, open Exposures (or Roster Viewer) and the ADP Tracker, locate Kenneth Gainwell, confirm a real Underdog ADP renders instead of `-`.
3. **Extension (developer)** — rebuild the extension, open a DraftKings/Underdog draft page containing Gainwell, confirm the overlay shows his exposure/ADP rather than a blank.
4. **Build/lint** — `npm run build` (exit 0), `npm run lint` (clean).

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/utils/playerAliases.js` | Create | Full-name alias map (e.g. `'kenny gainwell' → 'kenneth gainwell'`) + a small applier used by `canonicalName` |
| `best-ball-manager/src/utils/helpers.js` | Modify | `canonicalName()` applies the alias map as its final step (after existing suffix/period/whitespace normalization) |
| `chrome-extension/src/utils/canonicalName.js` | Modify | Mirror the alias step so overlay matching stays consistent (requires `cd chrome-extension && npm run build`) |

## Implementation Approach
1. **Create `playerAliases.js`** exporting a `NAME_ALIASES` object keyed by *full* canonicalized name → canonical target, plus `applyAlias(key)` returning the mapped value or the key unchanged. Seed it with `'kenny gainwell': 'kenneth gainwell'`. Full-name keys (not first-name substitutions) are deliberate: they make every alias an explicit, reviewable, deterministic mapping with zero risk of collapsing two distinct players — important because `canonicalName` keys exposure counts and `stableId` across 31 callsites.
2. **Wire into `canonicalName`** (`helpers.js`) as the final transform: compute the existing canonical string, then `return applyAlias(canonical)`. Single chokepoint → every ADP/projection/exposure/history lookup benefits automatically.
3. **Mirror into the extension** `canonicalName.js` (copy the alias module or inline the map) and rebuild the extension bundle so the in-page overlay matches identically.
4. Build + lint, then run the verification steps.

**Why not the other approaches** (to be locked by the ADR below):
- *Fuzzy matching* (Levenshtein) — rejected: false-positive merges on a function that drives exposure % and player identity are unacceptable; non-deterministic risk across 31 callsites.
- *Platform player_id matching* — the most robust long-term option, but **not viable for the immediate fix**: extension roster entries store only `{name, position, team, pick, round}` (the UD/DK adapters have the ids at parse time but drop them, and Supabase `extension_entries.players` has no id field). Already-synced rosters carry no id and cannot be retroactively tagged without a re-sync. Worth a separate future task to capture `platform_player_id` at sync time and join on it — but it does not unblock Gainwell today.

## Dependencies
- **ADR (matching strategy)** — this task changes `canonicalName`, a core utility used at 31 callsites. The choice (explicit full-name alias map vs. fuzzy vs. id-based) is a non-obvious, cross-cutting decision and should be recorded. Recommend drafting a short ADR via hus-adr before implementation. Implementation proceeds once the ADR is approved.
- Benefits from TASK-278 (correct 06-25 snapshot) but is independent of it.

## Open Questions
- Should the alias map also be seeded with other known platform renames now, or grow on demand as they're reported? (Recommend: seed Gainwell now, grow on demand — each entry is cheap and explicit.)
- Longer-term: capture `platform_player_id` at extension sync to make name changes irrelevant — track as a separate task if the ADR favors moving that direction eventually.

---
*Approved by: PH — 2026-06-25*
