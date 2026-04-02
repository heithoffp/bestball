# TASK-075: Migrate ComboAnalysis inline styles to CSS module

**Status:** Draft
**Priority:** P3

---

## Objective
`ComboAnalysis.jsx` uses heavy inline styles (e.g., the `PlayerBadge` component and numerous style objects throughout) instead of CSS module classes. This makes it impossible to consistently apply design tokens and creates maintenance friction. Extract all inline styles to `ComboAnalysis.module.css` (which may already exist partially) using design system tokens.

## Dependencies
- TASK-057 (ComboAnalysis redesign should be completed first to avoid conflicts)
