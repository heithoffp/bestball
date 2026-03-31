# TASK-046: Draft overlay scaffold

**Status:** Draft
**Priority:** P2

---

## Objective

Build the content script and injected UI shell that appears on Underdog's live draft pages. No scoring logic yet — just a stable, correctly positioned overlay panel that survives Underdog's React re-renders and provides the mounting point for TASK-047's scoring UI. Getting the injection and stability right is the hard part; scoring is additive once this works.

## Dependencies

TASK-042 (extension scaffold)

## Open Questions

- What is the URL pattern for Underdog live draft pages? Likely `https://underdogfantasy.com/draft/*` or similar — needs verification.
- How does Underdog's React app manage the DOM? The overlay must use a MutationObserver or similar to re-inject if Underdog replaces the root node during navigation.
- Where should the overlay panel be positioned? Options: sidebar panel, floating overlay, injected row below each player card. Needs a decision before building the shell.
- Does the overlay need to be togglable (show/hide) to avoid blocking the draft board?
