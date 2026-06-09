# TASK-255: Blog SEO — per-post meta/OG, canonical, Article schema & sitemap for /blog routes

**Status:** Draft
**Priority:** P2

---

## Objective
TASK-249 shipped the blog as an SEO / top-of-funnel surface, but /blog and /blog/:slug are client-rendered SPA routes: non-JS crawlers and social unfurlers receive the generic site <head> with no per-post <title>/description, Open Graph image, canonical URL, JSON-LD Article structured data, or sitemap entry. Add crawler-visible per-post metadata (prerender/SSG or head injection), an Article schema block, and include published posts in the sitemap so issues index and unfurl. Complements TASK-193 (SEO long-tail) and TASK-194 (Search Console).

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
