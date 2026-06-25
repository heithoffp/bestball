# ADR-012: Reconcile cross-platform player renames via an explicit alias map in canonicalName

**Date:** 2026-06-25
**Status:** Accepted

---

## Context
Player identity across the app is matched by name, not by a stable id. `canonicalName()`
(`best-ball-manager/src/utils/helpers.js`) is the single normalization chokepoint — it lowercases,
strips generational suffixes (Jr./Sr./II–V), removes periods, and collapses whitespace. Its output
keys ~31 callsites: ADP lookups, projections, team enrichment, exposure counting, and `stableId()`
player identity. The Chrome extension keeps a mirror of `canonicalName` (`chrome-extension/src/utils/canonicalName.js`)
for its in-page overlay (added under TASK-226).

The matching breaks when a platform changes a player's *display name* mid-season. Concrete case:
Underdog's ADP feed switched "Kenneth Gainwell" to "Kenny Gainwell" in the 2026-06-25 snapshot.
Rosters were synced earlier as "Kenneth", so `canonicalName('Kenneth Gainwell')` ≠
`canonicalName('Kenny Gainwell')` and the player silently loses his ADP (renders `-`). This is a
general class: any nickname/legal-name swap by a platform drops a player's ADP, projection, and
correct exposure grouping with no error.

Two constraints shape the fix:
- **The function is load-bearing and cross-cutting.** A wrong merge of two distinct players would
  corrupt exposure percentages and `stableId`, so the matching rule must be exact and predictable.
- **Synced rosters carry no stable id.** Extension entries store only `{name, position, team, pick, round}`.
  The platform adapters (`underdog-bridge.js`, `draftkings.js`) resolve a platform player id at parse
  time but drop it, and the Supabase `extension_entries.players` JSON has no id field. So already-synced
  portfolios cannot be matched by id without a re-sync.

## Decision
Reconcile known cross-platform renames with an **explicit, full-name alias map** applied as the final
step of `canonicalName()`. Aliases are keyed by the full canonicalized name (e.g.
`'kenny gainwell' → 'kenneth gainwell'`) so both forms collapse to one key. The same map is mirrored
into the extension's `canonicalName`. Entries are added on demand as renames are observed.

## Alternatives Considered

### Option A: Explicit full-name alias map in canonicalName (chosen)
A small map of `canonicalFullName → canonicalFullName`, applied after existing normalization.
- **Pros:** Deterministic and reviewable — every merge is an explicit, auditable line. Zero risk of
  collapsing two distinct players because keys are full names, not first-name substitutions. Fixes all
  ~31 callsites at once via the single chokepoint. Trivial to add, trivial to revert. Works for
  already-synced rosters with no re-sync.
- **Cons:** Manual upkeep — each new rename needs an entry, and an unreported rename stays broken until
  someone notices and adds it. Reactive, not automatic.

### Option B: Fuzzy / Levenshtein name matching
Match names within an edit-distance threshold.
- **Pros:** Automatic; would catch renames without manual entries.
- **Cons:** Non-deterministic risk on a function driving exposure % and `stableId`. False positives are
  unacceptable here — distinct players with similar names could merge and silently corrupt portfolio
  analytics. "Kenny"→"Kenneth" is also not a small edit distance, so a threshold loose enough to catch it
  would catch far too much.

### Option C: Match on platform player_id
Capture each platform's stable player id at sync and join ADP→roster on the id.
- **Pros:** The robust, rename-proof solution — display names become irrelevant.
- **Cons:** Not viable for the present problem. Extension entries and the Supabase schema carry no id,
  and adapters discard the id they see, so **every already-synced roster would be unmatched** until
  re-synced. Requires changes to the `PlayerEntry` shape, both adapters, the storage schema, and a user
  re-sync — far beyond fixing a dropped ADP. Recorded here as the preferred long-term direction.

## Consequences

### Positive
- Kenneth Gainwell (and any future reported rename) matches ADP/projections/exposure again, across web
  app and extension overlay, with one map entry.
- The merge logic stays exact and explainable — no analytics-corruption risk introduced into a
  cross-cutting identity function.
- Cheap and low-risk to land; no schema change, no user action required.

### Negative
- The alias map is maintained by hand. Renames are caught reactively: a player stays broken between the
  rename and the day someone adds the entry. There is no automated detector.

### Risks
- **Staleness / silent gaps** — if renames become frequent, manual upkeep won't keep pace. The escalation
  path is Option C (capture `platform_player_id` at sync and join on it), opened as its own task at that point.
- **Mapping direction drift** — entries must point to the form used by synced rosters (the historical/legal
  name), since that is the constant; pointing the wrong way would fix the symptom only until the next sync.

## Revisit Conditions
- More than a handful of alias entries accrue in a single season, or renames are reported faster than
  they are patched → escalate to Option C (id-based matching) as a tracked task.
- A future re-architecture gives synced rosters a stable `platform_player_id` → revisit whether the alias
  map is still needed at all.

## Related
- Tasks: TASK-279 (implements this), TASK-226 (extension `canonicalName` suffix stripping — the mirror this builds on)

---
*Approved by: PH — 2026-06-25*
