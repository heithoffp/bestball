# TASK-158: Contextual Help — remove Help tab and migrate Getting Started content

**Status:** Draft
**Priority:** P3

---

## Objective
Once all per-tab annotation overlays are in place (TASK-153 through TASK-157), remove the standalone Help tab from the tab bar, delete or archive HelpGuide.jsx and its CSS, and migrate "Getting Started" content (extension install, sync instructions) to a persistent surface — either a global "?" in the app header or a first-run welcome banner.

## Dependencies
TASK-153, TASK-154, TASK-155, TASK-156, TASK-157 — all per-tab annotations must be complete before the Help tab can be removed.

## Design Reference (from TASK-151 + Dashboard implementation)
The contextual help system uses:
- Per-tab `?` button in TabLayout toolbar (gold ghost button, gold glow when active)
- Transparent overlay with gold highlight rings and top-left anchored callout cards
- Concise one-sentence annotations per element
- No backdrop dimming — page stays fully visible and interactive
- ESC or `?` toggle to dismiss

The "Getting Started" content is the only help content that doesn't belong to a specific tab — it needs a new home outside the tab system.

## Open Questions
- Global "?" button in the app header vs first-run banner vs both?
- Should Getting Started be shown automatically on first visit (with a dismiss/don't-show-again)?
