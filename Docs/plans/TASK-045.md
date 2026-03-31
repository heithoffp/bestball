# TASK-045: Web app sync UX

**Status:** Draft
**Priority:** P2

---

## Objective

Add a "Sync from Extension" trigger to the web app that detects when the Chrome extension has pushed new portfolio data to Supabase and loads it as the active portfolio. Replaces the manual CSV upload flow for extension users with a one-click or automatic sync experience.

## Dependencies

TASK-043 (Supabase data bridge — needs the read API)

## Open Questions

- Should sync be automatic (web app polls or subscribes to Supabase realtime on load) or manual (user clicks a button)? Manual with a clear indicator is safer for v1.
- Where does the sync button/indicator live? Likely near the existing upload button in the Exposures tab or the app header.
- How does the web app know the extension is installed? Extensions can inject a small marker into the page; if absent, the sync option could be hidden or show an install prompt.
- What happens to existing IndexedDB data when the user syncs from the extension? Should prompt before overwriting.
