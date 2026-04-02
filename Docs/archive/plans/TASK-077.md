<!-- Completed: 2026-04-01 -->
# TASK-077: Add consistent dark-themed scrollbar styling across all scrollable areas

**Status:** Draft
**Priority:** P4

---

## Objective
Only `DraftFlowAnalysis.module.css` has custom scrollbar styles (`.scrollArea::-webkit-scrollbar`). All other scrollable containers use browser-default scrollbars, which appear as bright system scrollbars on the dark theme and break the Midnight Gold aesthetic. Add consistent `::-webkit-scrollbar` styling to all scrollable areas or apply a global scrollbar style.

## Dependencies
None
