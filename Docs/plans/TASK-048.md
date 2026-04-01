# TASK-048: Update chrome-extension-data-flow.d2 to show Supabase bridge write path

**Status:** Draft
**Priority:** P3

---

## Objective

The TASK-043 implementation added a Supabase write path from the Chrome extension (bridge.js → extension_entries table) and a corresponding read path from the web app (extensionBridge.js → extension_entries). The `docs/systems-model/subsystems/chrome-extension-data-flow.d2` diagram predates this work and does not reflect these components. Update the diagram so it accurately represents the current data flow between the extension, Supabase, and the web app.

## Dependencies

TASK-043 (Supabase data bridge) — complete

## Open Questions

- Does `core.d2` or `feedback.d2` also need updating, or only the chrome-extension-data-flow diagram?
