# Contextual Help Overlay

## Purpose
Per-tab guided help that explains key elements on the active screen. Replaces the original standalone Help Guide tab with phased, in-place annotations — users get help where they are, not in a separate document.

## Current Status
Active. The standalone `HelpGuide.jsx` tab has been removed from `App.jsx`. Help is now driven by the `HelpOverlay.jsx` overlay, toggled from a global "Help" button in the tab bar.

## User-Facing Behavior

### Triggering
- Global **Help** button in the tab bar (rightmost, with `HelpCircle` icon on mobile).
- Toggling Help while on a tab opens the overlay scoped to that tab.
- Switching tabs while help is open closes the overlay (handled in `App.jsx` tab click).

### Phased annotation walkthrough
- One annotation at a time. Each annotation has `{ id, label, description, anchor? }`.
- Each tab component supplies its own `annotations` array and tags target elements with `data-help-id="<id>"`.
- The overlay finds the tagged element, draws a highlight ring, and positions a callout near it.
- Anchor values: `below` (default), `above`, `left`, `right`. Position is clamped to the container bounds.

### Navigation
- Bottom navigation bar shows step counter (e.g., `2 / 5`) with previous / next buttons.
- Last step's "next" becomes a close button.
- Keyboard: `←/→` and `↑/↓` advance steps; `Esc` closes.
- Auto-scrolls the highlighted element into view if off-screen.

### Mobile
- Below 600px, the callout content collapses into the bottom navigation bar (single-row card content) instead of floating near the element.

## Implementation Notes
- The overlay listens to `resize` and the nearest scrollable ancestor's `scroll` event, throttled via `requestAnimationFrame`, to reposition the callout when content moves.
- The CSS module (`HelpOverlay.module.css`) provides the highlight ring (`.highlightRing`), backdrop, callout, and navigation bar styles.

## Props

| Prop | Purpose |
|------|---------|
| `annotations` | Array of `{ id, label, description, anchor? }` describing each step |
| `onClose` | Called when the overlay should dismiss |
| `containerRef` | Ref to the positioned container that wraps the tab's content |

## Each tab's responsibility
A tab participating in contextual help must:
1. Wrap its content in a positioned container and pass the `ref` to `<HelpOverlay containerRef={...} />`.
2. Add `data-help-id="<unique-id>"` to elements it wants annotated.
3. Provide a stable `annotations` array (typically as a memoized constant inside the component).
4. Read `helpOpen` and `onHelpToggle` props supplied by `App.jsx` to coordinate the global toggle.

## Key Files
- `src/components/HelpOverlay.jsx` — the overlay implementation
- `src/components/HelpOverlay.module.css` — overlay styles
- `src/components/HelpGuide.jsx` — legacy standalone help component, no longer mounted (kept for reference; safe to remove in a future cleanup)
