<!-- Completed: 2026-04-01 -->
# TASK-078: Standardize transition timing to use motion tokens

**Status:** Draft
**Priority:** P4

---

## Objective
Multiple components use hardcoded transition durations (`0.1s`, `0.15s`, `0.2s`, `0.3s`) and easing functions instead of the motion tokens defined in the design system (`--duration-fast: 120ms`, `--duration-normal: 200ms`, `--ease-default: cubic-bezier(0.25, 0.1, 0.25, 1)`). Migrate all transition declarations to use the appropriate token for consistent motion across the app.

## Dependencies
None
