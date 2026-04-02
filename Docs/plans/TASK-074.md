# TASK-074: Standardize chart tooltip styling across all Recharts components

**Status:** Approved
**Priority:** P3

---

## Objective
Chart tooltips used inconsistent styling across components. Dashboard and ComboAnalysis used `var(--bg-card)` + `var(--border)` (backward-compat aliases). AdpTimeSeries used `var(--surface-1)`. Standardize all to the canonical design system tokens.

## Dependencies
None

## Verification Criteria
- All Recharts tooltips use consistent styling: `var(--surface-3)` background, `var(--border-default)` border, 8px radius, shadow, 280px max-width
- Build passes with no errors
- Lint passes with no new warnings

## Verification Approach
1. Run `npm run build` — must succeed
2. Run `npm run lint` — must pass clean
3. Grep for `contentStyle` and tooltip CSS — all should reference canonical tokens

## Files Changed
- `Dashboard.jsx` — updated `contentStyle` prop to canonical tokens + shadow + maxWidth
- `ComboAnalysis.jsx` — updated `contentStyle` prop to canonical tokens + shadow + maxWidth
- `AdpTimeSeries.module.css` — updated `.tooltip` to use `var(--surface-3)`, `var(--border-default)`, border-radius 8px, shadow, max-width 280px
- `AdpTimeSeries.jsx` — removed redundant `card` class from custom tooltip (tooltip CSS module now self-contained)

## Implementation Approach
Standardized all tooltip styling to: `background: var(--surface-3)`, `border: 1px solid var(--border-default)`, `border-radius: 8px`, `box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3)`, `max-width: 280px`. For inline `contentStyle` props (Dashboard, ComboAnalysis), updated the object literal. For AdpTimeSeries's custom tooltip component, updated the CSS module class.
