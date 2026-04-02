# TASK-068: Replace hardcoded hex colors with design system tokens

**Status:** Draft
**Priority:** P2

---

## Objective
Multiple components use hardcoded hex color values that bypass the design system: `#00e5a0` in RosterViewer.module.css (search highlight and rowOpen border), `#ef4444`/`#fca5a5` in DraftFlowAnalysis.module.css (reminder constraint styling), and `#3b82f6` in DraftFlowAnalysis.module.css (ADP divider lines). Replace with appropriate semantic tokens (`--positive`, `--negative`, `--info`, `--accent`, `--border-subtle`).

## Dependencies
None
