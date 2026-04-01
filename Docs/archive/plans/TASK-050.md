<!-- Completed: 2026-04-01 | Commit: pending -->
# TASK-050: Remove CSV upload references from web app UI

**Status:** Draft
**Priority:** P2

---

## Objective

Remove or replace all CSV upload references in the web app UI now that data flows from the Chrome extension via Supabase. Buttons, help text, instructions, modals, and tooltips that reference CSV uploading should be removed or updated to reflect the extension-based sync flow. This task is logically sequenced after TASK-045 (sync UX) so that replacement language is in place before the old language is removed.

## Dependencies

TASK-045 (Web app sync UX) — sync flow should be implemented before CSV upload references are removed, so the UI doesn't leave users with no data ingestion path.

## Open Questions

- Are there any user-facing help docs or onboarding flows (e.g., HelpGuide component) that describe the CSV upload step-by-step that also need updating?
- Should the CSV upload path be removed entirely or soft-disabled with a tooltip explaining the extension is now required?
