# TASK-147: Regenerate sim with consistent player_id format

**Status:** Draft
**Priority:** P3

---

## Objective

Regenerate `public/sim/tier1_frequency.json` with a consistent, canonical player_id format so that combo-rate lookups are reliable across platforms. The current sim was built from a UD ADP snapshot that inconsistently included/omitted generational suffixes — some players have "III"/"Jr." in their ID (Kenneth Walker III, Travis Etienne Jr.), others don't (Brian Thomas, Luther Burden, James Cook). This caused a portion of combo-rate results to return 0.0 (not observed) even for common portfolio combinations.

**Root cause (from 2026-04-06 investigation):**
The sim engine builds `player_id` as `id-{displayName}-{pos}-{team}` from whatever name the UD snapshot had at build time. Players added to UD before or after a naming convention change appear differently. Additionally, DK adds Jr./III to some players UD omits, making cross-platform matching fragile.

**Canonical player_id format to enforce in the sim:**
- Strip generational suffixes (Jr., Sr., II, III, IV, V) from the display name — use the suffix-free form as the ID base
- Use full NFL team names (e.g., "Jacksonville Jaguars", not "JAX"; "Atlanta Falcons", not "ATL")
- Use empty string for FA/no-team players (produces trailing `-` in the ID, e.g., `id-CarnellTate-WR-`)
- Scope: ADP ≤ 120 (covers first ~4 rounds of a 12-team best-ball draft — the only picks that matter for the 4-pick combo key)

**What does NOT need to change:**
- The app-side `processMasterList` and `canonicalName` logic (already handles this)
- Any UI component
- Any ADP or roster data files

## Dependencies

- None — this is a standalone sim regeneration task

## Open Questions

- Where is the sim generation script (`simulation/engine.py` or similar)? Locate before drafting the full plan.
- Should the new sim strip suffixes universally, or only for players where UD omits them? (Recommend: strip universally for consistency — the app side uses suffix-free canonical names for matching anyway.)
- Is there a minimum combo frequency threshold for inclusion in `tier1_frequency.json`? Preserve the existing `adp_cutoff`, `total_rosters`, and epoch parameters.
