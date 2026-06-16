# TASK-267: Fix blog OG card gate for same-day-published posts

**Status:** Draft
**Priority:** P3

---

## Objective
prerender-blog.mjs scheduled-post gate (if date > today: continue, line ~110) skips emitting the per-post Open Graph HTML for any post whose date equals the deploy day, because at build time the UTC 'today' often still trails the post date. Result: crawlers fall back to the site-wide default (dashboard) card. Confirmed on 'The Allen Tax' (dated 2026-06-16, last deployed 2026-06-15) — live URL served og-image-dashboard.png instead of og-the-allen-tax.png. Older posts (e.g. 2026-06-09) are unaffected. Candidate fixes: (a) treat date==today as live (>= vs >), (b) emit a build-time warning when a published post is gated as scheduled so a redeploy is triggered, (c) auto-redeploy hook on publish date. Severity: medium, recurring, degrades social sharing of fresh posts.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
