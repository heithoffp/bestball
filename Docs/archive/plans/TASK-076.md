# TASK-076: Add global focus-visible ring with accent-glow

**Status:** Draft
**Priority:** P4

---

## Objective
There is no global `*:focus-visible` rule for keyboard navigation. UI/UX Guide section 11 states "All interactive elements are reachable via Tab. Focus rings use `--accent-glow`." Currently only `.modal-field input:focus` has focus styling. Add a global focus-visible rule and ensure all interactive elements (buttons, links, filter chips, drill cards, tab buttons) show a consistent accent-glow focus ring.

## Dependencies
None
