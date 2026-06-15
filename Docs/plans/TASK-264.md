# TASK-264: Daily rebuild so scheduled posts get OG cards on go-live date

**Status:** Draft
**Priority:** P4

---

## Objective
TASK-263 makes scheduled blog posts appear automatically client-side at their date, but the static OG social card and sitemap entry only regenerate on the next build/deploy. A daily Vercel cron rebuild (or scheduled deploy) would make per-post social cards/sitemap correct the day a scheduled post goes live without a manual deploy. Optional polish; only matters if a scheduled post is shared socially on day one.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
