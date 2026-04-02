<!-- Completed: 2026-04-01 -->
# TASK-072: Migrate hardcoded border-radius values to radius tokens

**Status:** Draft
**Priority:** P3

---

## Objective
The codebase uses a mix of hardcoded border-radius values (6px, 8px, 10px, 12px, 14px) instead of the design system tokens (`--radius-sm: 6px`, `--radius-md: 10px`, `--radius-lg: 14px`). Migrate all hardcoded border-radius declarations to use the appropriate token. Values that don't map to existing tokens (e.g., 3px for small pills, 20px for chips) may need new tokens or can remain as-is with justification.

## Dependencies
None
