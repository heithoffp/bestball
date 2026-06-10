# TASK-257: Teach /weekly-blog skill to set image: frontmatter + generate hero card per post

**Status:** Draft
**Priority:** P3

---

## Objective
TASK-256 added build-time OG prerender with an image: frontmatter field and a Playwright hero generator (scripts/generate-og-card.mjs). Future posts should get a hero automatically: the /weekly-blog authoring skill should set image: in frontmatter and run generate-og-card.mjs (or fall back to /og-image-blog.png) so every new post ships with a proper social card without manual steps. Without this, the OG image step is easy to forget on each weekly post.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
