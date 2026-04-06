# TASK-167: Landing page — deploy to production with SEO and Open Graph

**Status:** Draft
**Priority:** P1

---

## Objective
Deploy the landing page to production on Vercel. Add SEO meta tags (title, description, keywords), Open Graph tags for rich social media previews (critical for Reddit and Twitter sharing), Twitter card meta, favicon, and basic sitemap. Ensure the landing page loads fast (<2s LCP), renders correctly on mobile, and the signup CTA connects to the existing auth flow. The Open Graph preview is especially important — when someone shares the link on Reddit, it needs to look compelling.

## Dependencies
TASK-165 (landing page must be built first)

## Open Questions
- Custom domain setup needed, or deploy on existing Vercel URL?
- Separate Vercel project or route within existing app deployment?
