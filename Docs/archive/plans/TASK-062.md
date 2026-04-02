# TASK-062: Fix position badge colors — migrate from broken backward-compat aliases to canonical position tokens

**Status:** Draft
**Priority:** P2

---

## Objective
Legacy `.badge-*` classes in `index.css` map to incorrect colors via backward-compat aliases. `.badge-qb` uses red (`--accent-red` → `--negative` → `#E74C3C`) instead of purple, `.badge-wr` uses gold (`--accent-blue` → `--accent`) instead of amber, and `.badge-te` uses gold (`--accent-yellow` → `--accent`) instead of blue. These aliases silently broke position color mappings. Replace all position color references with the canonical `--pos-qb`/`--pos-rb`/`--pos-wr`/`--pos-te` tokens defined in the design system.

## Dependencies
None

## Open Questions
- Are `.badge-*` classes still used anywhere, or have components migrated to inline styles / CSS modules?
