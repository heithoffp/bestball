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

## Scope shift (2026-06-12, TASK-258)
TASK-258 implemented participant-authorized capture by having the **customer extension write
the full board to `draft_boards_admin`** (developer's storage decision: reuse the existing
table rather than create a new one). Consequence: this task can **no longer drop
`draft_boards_admin`** — the customer write path and the web read path both depend on it now.

Revised scope:
- Remove the `admin-extension/` directory and the admin scraper write path (migration 006's
  `service_role` grant can stay or be tightened — no longer exercised).
- **Do not drop `draft_boards_admin`.** Optionally rename it to `draft_boards` to shed the
  now-misleading `_admin` suffix (would touch migration files, `draftBoards.js`, and the
  extension's `writeBoards`); decide whether the rename is worth the churn.
- The `source` column now distinguishes `'extension'` (live customer captures) from
  `'admin_scraper'` (legacy) — useful for a one-time cleanup of stale admin rows.

## Open Questions
- Rename `draft_boards_admin` → `draft_boards`, or keep the name and just retire the admin
  extension? (Rename is cosmetic but touches three subsystems.)
