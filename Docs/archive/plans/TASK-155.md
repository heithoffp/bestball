<!-- Completed: 2026-04-06 | Commit: f914fa9 -->
# TASK-155: Contextual Help — ADP Tracker annotations

**Status:** Done
**Priority:** P3

---

## Objective
Implement annotation overlay for the ADP Tracker tab. Add `data-help-id` attributes to key elements and define a `HELP_ANNOTATIONS` array covering the player selection panel, chart area, quartile box toggle, and column meanings.

## Dependencies
TASK-151 — Complete.

## Design Reference (from TASK-151 + Dashboard implementation)
- **No backdrop dimming** — transparent overlay, page stays visible and interactive
- **Gold highlight rings** on annotated elements (`box-shadow: 0 0 0 2px var(--accent-glow)`)
- **Callout cards** anchored consistently to **top-left** of each target element
- **Concise copy** — one short sentence per annotation (see Dashboard.jsx `HELP_ANNOTATIONS` for tone)
- Add `data-help-id="xxx"` attributes to target elements in JSX
- Tab component owns `helpOpen` state via `useState(false)`
- Pass `helpAnnotations`, `helpOpen`, `onHelpToggle={() => setHelpOpen(h => !h)}` to TabLayout
- If tab doesn't use TabLayout yet, wrap content in it (Dashboard pattern: `<TabLayout title="..." flush ...><div className={styles.root}>...</div></TabLayout>`)
