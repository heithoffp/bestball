# TASK-044: Underdog entries list scraper

**Status:** Draft
**Priority:** P2

---

## Objective

Build the content script that runs on the Underdog entries list page, extracts all roster entries (entry ID, players, picks, draft date, tournament), and writes them to Supabase via the data bridge. This replaces the current manual CSV download/upload flow — users just visit their Underdog entries page and their portfolio syncs automatically.

## Dependencies

TASK-042 (extension scaffold)
TASK-043 (Supabase data bridge — needs the write API)

## Open Questions

- What is the exact URL pattern for the Underdog entries list page? Likely `https://underdogfantasy.com/best-ball/entries` or similar — needs confirmation against live site.
- Does Underdog render entries via server-side HTML or a client-side React/API fetch? If client-side, the content script may need to wait for DOM hydration or intercept the API response.
- What fields are available on the entries list vs. requiring a click into each individual entry? If player-level data (picks) requires drilling into each entry, scraping complexity increases significantly.
- Does the scraper need to handle pagination if the user has many entries?
