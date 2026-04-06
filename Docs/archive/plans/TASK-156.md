<!-- Completed: 2026-04-06 | Commit: pending -->
# TASK-156: Contextual Help — Rankings annotations

**Status:** Done
**Priority:** P3

---

## Objective
Implement annotation overlay for the Rankings tab. Add `data-help-id` attributes to key elements and define a `HELP_ANNOTATIONS` array covering tier system, drag-and-drop, tier break insertion, position toggle, CSV export, and keyboard shortcuts.

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

## Open Questions
- Keyboard shortcuts: include as a single annotation with a compact list, e.g. "Keyboard: ↑↓ move, T set tier, Delete remove."
