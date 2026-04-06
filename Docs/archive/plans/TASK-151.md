<!-- Completed: 2026-04-06 | Commit: pending -->
# TASK-151: Contextual Help — shared HelpOverlay component and infrastructure

**Status:** Pending Approval
**Priority:** P3

---

## Objective
Build the reusable annotation overlay system that powers per-tab contextual help. A "?" button in each tab's toolbar toggles an overlay that dims the page and renders gold callout labels anchored to key UI elements — turning the live tab into an annotated diagram.

## Verification Criteria
1. TabLayout renders a "?" icon button in the toolbar when `helpAnnotations` prop is provided.
2. Clicking the "?" button toggles a semi-transparent overlay covering the tab content area.
3. Overlay renders annotation callouts at positions specified by the `helpAnnotations` data array.
4. Each annotation displays a short label and an optional description, styled with the gold accent system.
5. Overlay dismisses on ESC key, clicking the "?" button again, or clicking the overlay backdrop.
6. Overlay entrance uses a fade animation (opacity 0→1, ~200ms).
7. Annotations use `data-help-id` attributes on target elements for positioning — callouts anchor relative to the element's bounding rect.
8. A demo annotation set can be passed to any tab to verify the system works end-to-end.
9. `npm run build` completes with no errors.

## Verification Approach
1. Add a temporary demo annotation array to one tab (e.g., Exposures) targeting 2-3 elements with `data-help-id` attributes.
2. Run `npm run dev` — navigate to that tab, click "?", verify overlay appears with callouts positioned near the target elements.
3. Press ESC — overlay dismisses. Click "?" again — overlay reappears. Click backdrop — overlay dismisses.
4. Run `npm run build` — confirm no errors.
5. Remove the demo annotations after verification.

Steps 1-4 require the developer to confirm visual correctness. Step 4 (build) can be run by Claude.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/HelpOverlay.jsx` | Create | Overlay component: backdrop, annotation callouts with label/description, positioning logic |
| `best-ball-manager/src/components/HelpOverlay.module.css` | Create | Styles: backdrop dim, callout cards, gold accent lines, fade animation, responsive adjustments |
| `best-ball-manager/src/components/TabLayout.jsx` | Modify | Add `helpAnnotations` and `helpOpen`/`onHelpToggle` props; render "?" button in toolbar; wrap content in position:relative container for annotation anchoring |
| `best-ball-manager/src/components/TabLayout.module.css` | Modify | Add styles for the "?" help button (ghost variant, gold accent on active state) |

## Implementation Approach

### 1. Annotation Data Schema
Each tab will pass an array of annotation objects:
```js
[
  {
    id: 'exposure-pct',           // matches data-help-id on target element
    label: 'Exposure %',          // short callout title
    description: 'Fraction of your rosters containing this player',  // optional detail
    anchor: 'top-right',          // preferred callout position relative to element
  },
]
```

Supported `anchor` values: `top-left`, `top-right`, `bottom-left`, `bottom-right`, `left`, `right`. The component calculates position from the target element's `getBoundingClientRect()` and adjusts to stay within viewport bounds.

### 2. HelpOverlay Component
- Receives `annotations` array and `onClose` callback.
- On mount, queries all `[data-help-id]` elements within the tab content container.
- For each annotation, finds the matching element by `data-help-id`, reads its bounding rect, and positions a callout card nearby.
- Uses `useLayoutEffect` to compute positions after render, and a `ResizeObserver` on the container to recompute if layout shifts.
- Backdrop: `position: absolute; inset: 0; background: rgba(6, 14, 31, 0.75); z-index: 100`.
- Callout cards: `position: absolute; z-index: 101` with gold left-border accent, surface-2 background, and a subtle connecting line (CSS pseudo-element or thin border) pointing toward the target element.
- ESC key listener via `useEffect`.

### 3. Callout Visual Design
- Card: `background: var(--surface-2)`, `border-left: 3px solid var(--accent)`, `border-radius: var(--radius-sm)`, compact padding.
- Label: `font-family: var(--font-mono)`, `color: var(--accent)`, `font-size: var(--text-sm)`, uppercase.
- Description: `color: var(--text-secondary)`, `font-size: var(--text-xs)`, max-width ~220px.
- Target highlight: the target element gets a subtle gold outline ring (`box-shadow: 0 0 0 2px var(--accent-glow)`) applied via a temporary class while overlay is open.
- Fade entrance: `@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }` with `animation: fadeIn 200ms ease`.

### 4. TabLayout Integration
- Add optional props: `helpAnnotations` (array), `helpOpen` (boolean), `onHelpToggle` (callback).
- When `helpAnnotations` is provided, render a "?" button at the end of the toolbar controls (using `HelpCircle` icon from lucide-react, styled as `toolbar-btn--ghost` with gold color when active).
- Wrap the content area in a `position: relative` container so HelpOverlay can position absolutely within it.
- When `helpOpen` is true, render `<HelpOverlay>` inside the content wrapper.
- State management lives in the parent tab component (each tab owns its own `helpOpen` state) — TabLayout just passes through.

### 5. Responsive Handling
- On mobile (<600px), callout cards stack as a scrollable list at the bottom of the overlay instead of positioned annotations (elements are too small/repositioned to anchor reliably).
- "?" button remains in toolbar on all breakpoints.

## Dependencies
None

## Open Questions
- Exact callout arrow/line treatment TBD during implementation — may use a simple CSS triangle or omit if visual anchoring via proximity + highlight ring is sufficient.

---
*Approved by: <!-- developer name/initials and date once approved -->*
