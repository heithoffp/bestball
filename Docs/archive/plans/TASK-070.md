# TASK-070: Add font-family: var(--font-mono) to tab button labels

**Status:** Draft
**Priority:** P3

---

## Objective
UI/UX Guide section 4 specifies that tab labels should use JetBrains Mono (`--font-mono`). The `.tab-button` class in `index.css` is missing a `font-family` declaration, so tab labels inherit DM Sans from the body. Add the correct font-family to match the design system specification.

## Dependencies
None
