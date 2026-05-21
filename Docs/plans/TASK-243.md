# TASK-243: RosterViewer — prefer admin-scraped draft board over per-user when available

**Status:** Draft
**Priority:** P3

---

## Objective
Wire the read path so RosterViewer's draft-board modal (TASK-240) prefers data from draft_boards_admin (admin scraper, TASK-241) over the per-user draft_board on extension_entries. Includes a new RLS read policy or Supabase RPC, mirror-not-advisor preservation, and the dual-data-path test matrix (admin-only, user-only, both, neither) called out in ADR-008.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
