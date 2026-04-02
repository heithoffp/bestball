# TASK-064: Fix tab bar active state — use gradient accent instead of solid color

**Status:** Draft
**Priority:** P2

---

## Objective
The active tab in `.tab-button.active` uses a solid `background: var(--accent-yellow)` instead of the `var(--gradient-accent)` gradient specified in the UI/UX Guide section 5. The guide describes the active tab's gold glow as "one of the strongest brand moments in the UI" and specifies gradient background + `shadow 0 1px 6px rgba(232, 191, 74, 0.4)`. Update to match the design system specification.

## Dependencies
None
