# TASK-043: Supabase data bridge

**Status:** Draft
**Priority:** P1

---

## Objective

Design and implement the Supabase schema and read/write API that lets the Chrome extension write portfolio data and lets the web app read it. This is the shared infrastructure that unblocks TASK-044 (scraper), TASK-045 (web app sync UX), and TASK-047 (overlay scoring). Without this bridge, the extension and web app have no way to share data across origins.

## Dependencies

TASK-042 (extension scaffold must exist before extension-side bridge code can be tested)

## Open Questions

- Should the bridge store raw scraped rows (entry_id, player, pick, etc.) or pre-processed exposure data? Raw is safer — lets the web app run its own processing pipeline.
- Row-level security: bridge table should be user-scoped (authenticated user can only read/write their own rows).
- How does the extension authenticate to Supabase? Likely via a stored session token after user logs in via the popup.
- Does the extension write a full snapshot each sync (replace all rows) or append/merge? Full replace is simpler for v1.
