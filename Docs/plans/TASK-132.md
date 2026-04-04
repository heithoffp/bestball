# TASK-132: DraftKings adapter — entries scraping + draft overlay

**Status:** Draft
**Priority:** P2

---

## Objective

Add full DraftKings best-ball support to the Chrome extension: scrape completed entries from the DK entries page, and inject the Exp/Corr overlay + FAB panel on live DK draft pages. Provides the same overlay experience users have on Underdog.

## Dependencies

- TASK-131 (adapter-agnostic overlay) must be complete before starting this task.
- Developer must provide DOM discovery data (see Open Questions below) before the full plan can be written.

## Open Questions

### DOM Discovery Checklist

Before the full plan can be written, the developer needs to inspect DraftKings and provide the following. Open DevTools on the relevant pages and note what you find:

**URL patterns:**
- [ ] What is the URL of your completed best-ball entries/contests page? (e.g. `www.draftkings.com/my-contests/...`)
- [ ] What is the URL pattern for a live best-ball draft? (e.g. `www.draftkings.com/draft/contest/12345`)
- [ ] Does the live draft URL change mid-draft (SPA navigation) or does it stay stable?

**Entries scraping (completed entries page):**
- [ ] Does DK load entries via `fetch()` calls or `XMLHttpRequest`? (Check Network tab → filter XHR/Fetch — look for calls to a DK API with a list of contests/lineups)
- [ ] If API-based: what is the endpoint URL pattern? Does it require an auth header (Bearer token)?
- [ ] What shape does a single entry have in the API response? (entryId, player names, positions, draft date, tournament name)
- [ ] Alternative: Is the entries list statically rendered in the DOM (no API needed)?

**Draft board (live draft page):**
- [ ] What element wraps the scrollable player list? (Right-click → Inspect — look for a `role="grid"` or large container with many player rows)
- [ ] What class/attribute identifies a single player row? (Inspect a player row — look for `data-testid`, `data-id`, or a consistent class name)
- [ ] Within a player row, what element holds the ADP/projected stats on the right side?
- [ ] What class/selector identifies the sort button bar above the list?
- [ ] Does DK have a "My Rank" sort option? If so, how is the active sort button marked in the DOM?

**"My picks" panel:**
- [ ] What selector identifies the already-drafted players in your team panel?
- [ ] Within a picked player element, how do you find the player name and position?

**Styling:**
- [ ] What is DK's primary background color (hex) for the draft board?
- [ ] What is the primary text color?
- [ ] What font family does DK use?
