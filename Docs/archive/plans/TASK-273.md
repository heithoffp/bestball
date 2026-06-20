<!-- Completed: 2026-06-20 | Commit: pending-v1.3.0-release -->
# TASK-273 — Trim Eliminator row badges to bye-clash only (drop Fade + late-bye)

**Status:** Approved
**Priority:** P3

---

## Objective

In Eliminator Mode, remove the **Fade** badge and the **premium late-bye** badge
(`BYE 13` / `BYE 14`) from the per-candidate row badges in both surfaces (web Draft
Assistant and Chrome extension). Keep the same-position **bye-clash** conflict badge.
Leave the floating "Bye Rainbow" window/panel unchanged.

The underlying `eliminatorModel.js` flags (`fade`, `isLateBye`) remain — only the
row-badge *rendering* of those two pills is removed.

## Verification Criteria

- Fade and `BYE 13`/`BYE 14` badges no longer render on candidate rows in either surface.
- The same-position bye-clash badge still renders.
- The floating Bye Rainbow window/panel is unchanged.
- Lint and production build pass for the web app; the extension bundle builds.

## Verification Approach

1. `cd best-ball-manager && npm run lint` — passes (no unused-var/import errors).
2. `cd best-ball-manager && npm run build` — succeeds.
3. `cd chrome-extension && npm run build` — succeeds.
4. Manual (developer): enable Eliminator Mode in the Draft Assistant and on a draft page
   in the extension — confirm Fade and `BYE 13/14` badges are gone from candidate rows,
   the bye-clash badge still appears, and the Bye Rainbow window is unchanged.

## Files to Change

| File | Change |
|------|--------|
| `best-ball-manager/src/components/DraftFlowAnalysis.jsx` | Remove the `isLateBye` and `fade` badge blocks from `elimBadges`; keep `byeClash`. Update the comment. |
| `best-ball-manager/src/components/DraftFlowAnalysis.module.css` | Remove orphaned `.elimByeBadge`, `.elimByeLate`, `.elimFadeBadge`. Keep `.elimClashBadge`. |
| `chrome-extension/src/content/draft-overlay.js` | In `applyEliminatorBadge`, drop the `fade` and `isLateBye` pills; keep the `byeClash` pill. Update the doc comment. |

## Implementation Approach

- `eliminatorModel.js` untouched — flags stay in the model (rainbow window / tier logic
  still use bye tiers).
- Web: `AlertTriangle` import stays (used by the bye-clash badge).
- Extension: row pills are styled inline — no extension CSS cleanup needed; `.bbm-elim-bye-*`
  classes belong to the rainbow window and stay.
- Extension requires `npm run build` after the source edit so `dist/` reflects the change.
