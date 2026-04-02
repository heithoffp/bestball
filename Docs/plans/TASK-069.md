# TASK-069: Migrate hardcoded font-size values to typography tokens

**Status:** Draft
**Priority:** P3

---

## Objective
Component CSS modules pervasively use hardcoded `font-size` values (16px, 15px, 14px, 13px, 11px, etc.) instead of the typography tokens defined in the design system (`--text-xs: 0.7rem`, `--text-sm: 0.8rem`, `--text-base: 0.9rem`, `--text-md: 1rem`, `--text-lg: 1.15rem`, `--text-xl: 1.4rem`, `--text-2xl: 2rem`). Migrate all hardcoded font-size declarations to use the appropriate token.

## Dependencies
None

## Open Questions
- Some hardcoded sizes may not map cleanly to existing tokens (e.g., 9px). Decide whether to add a new token or round to nearest.
