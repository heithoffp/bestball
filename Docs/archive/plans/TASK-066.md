<!-- Completed: 2026-04-01 -->
# TASK-066: Eliminate backward-compat color aliases — migrate to design system tokens

**Status:** Draft
**Priority:** P2

---

## Objective
The codebase uses legacy backward-compat aliases (`--bg-card`, `--bg-hover`, `--bg-dark`, `--border`, `--accent-blue`, `--accent-green`, `--accent-yellow`, `--accent-red`) throughout `index.css` and component CSS modules. Several aliases map to semantically wrong values (e.g., `--accent-blue` → `--accent` which is gold). Replace all usages with canonical design system tokens (`--surface-0/1/2/3`, `--border-subtle/default/strong`, `--pos-*` colors), then remove the alias definitions from `:root`.

## Dependencies
- TASK-062 (position badge colors should be fixed first to avoid conflicts)
