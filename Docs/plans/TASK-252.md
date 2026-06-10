# TASK-252: Retire admin-extension and draft_boards_admin (per ADR-009)

**Status:** Draft
**Priority:** P3

---

## Objective
ADR-009 supersedes ADR-008 and retires the admin-side scraping pipeline (UD /v2/drafts/{id} is ownership-gated, so it only fetched the developer's own drafts). Remove the admin-extension/ directory, drop the draft_boards_admin table (add a drop migration; migration 006 created it), and remove TASK-247's grant-reminder dependency. Verify best-ball-manager and chrome-extension are unaffected. The ~272 cached rows were only the developer's own drafts (already available via normal sync) so no data migration is needed.

## Dependencies
**Blocked by TASK-240 follow-up (2026-06-10):** per the developer's /goal directive, the
Roster Viewer Draft Board view now *reads* `draft_boards_admin` as its interim data source
(migration 009 added an authenticated read policy), and the admin-extension was fixed
(v0.2.0) so the developer can repair the 89 nameless boards. Do not drop the table or
remove the admin-extension until participant-authorized capture at sync time (ADR-009's
chosen path) replaces this read path in `best-ball-manager/src/utils/draftBoards.js`.

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
