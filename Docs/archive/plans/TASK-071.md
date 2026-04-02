<!-- Completed: 2026-04-01 -->
# TASK-071: Migrate hardcoded spacing values to spacing tokens

**Status:** Draft
**Priority:** P3

---

## Objective
Component CSS modules use hardcoded pixel values for gap, padding, and margin (e.g., `gap: 20px`, `padding: 12px 16px`, `margin-bottom: 18px`) instead of the spacing tokens defined in the design system (`--space-xs: 0.25rem`, `--space-sm: 0.5rem`, `--space-md: 1rem`, `--space-lg: 1.5rem`, `--space-xl: 2rem`, `--space-2xl: 3rem`). Migrate hardcoded spacing values to use the appropriate token.

## Dependencies
None
