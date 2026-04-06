<!-- Completed: 2026-04-06 | Commit: pending -->
# TASK-152: Contextual Help — Dashboard annotations

**Status:** Done
**Priority:** P3

---

## Objective
Design and implement the annotation overlay content for the Dashboard tab. Completed as part of TASK-151 implementation — Dashboard was the first tab wired up to verify the overlay system end-to-end.

## Dependencies
TASK-151 — Complete.

## Design Reference (from TASK-151)
See Dashboard.jsx `HELP_ANNOTATIONS` array for the established pattern. Key decisions:
- **No backdrop dimming** — overlay is transparent; page stays fully visible and interactive
- **Gold highlight rings** on annotated elements (`box-shadow: 0 0 0 2px var(--accent-glow)`)
- **Callout cards** anchored consistently to **top-left** of each target element
- **Concise copy** — one short sentence per annotation, no verbose explanations
- Add `data-help-id="xxx"` attributes to target elements in JSX
- Tab owns `helpOpen` state, passes `helpAnnotations`/`helpOpen`/`onHelpToggle` to TabLayout
- Annotations scroll with content via `requestAnimationFrame`-throttled scroll listener
