<!-- Completed: 2026-04-07 -->
# TASK-167: Landing page — deploy to production with SEO and Open Graph

**Status:** Approved
**Priority:** P1

---

## Objective
Deploy the landing page to production on Vercel. Add SEO meta tags (title, description, keywords), Open Graph tags for rich social media previews (critical for Reddit and Twitter sharing), Twitter card meta, favicon, and basic sitemap. Ensure the landing page loads fast (<2s LCP), renders correctly on mobile, and the signup CTA connects to the existing auth flow. The Open Graph preview is especially important — when someone shares the link on Reddit, it needs to look compelling.

## Dependencies
TASK-165 (landing page must be built first) ✓ Complete

## Files to Change

| File | Change |
|------|--------|
| `best-ball-manager/index.html` | Add `<title>`, meta description, OG tags, Twitter card, canonical, favicon link |
| `best-ball-manager/public/favicon.svg` | SVG favicon derived from BrandLogo (dark navy + gold) |
| `best-ball-manager/public/og-card.html` | Standalone 1200×630 HTML card for developer to screenshot → og-image.png |
| `best-ball-manager/public/og-image.png` | Developer provides after screenshotting og-card.html |
| `best-ball-manager/public/sitemap.xml` | Single-URL sitemap: https://bestballexposures.com |
| `best-ball-manager/public/robots.txt` | Allow all crawlers, reference sitemap |

## Implementation Approach

1. **index.html** — insert into `<head>`:
   - `<title>Best Ball Exposures — Portfolio Analytics for Best Ball Drafters</title>`
   - Meta description (~155 chars)
   - OG: `og:title`, `og:description`, `og:image` (→ `/og-image.png`), `og:url`, `og:type`, `og:site_name`
   - Twitter: `twitter:card` = `summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`
   - `<link rel="canonical">` pointing to `https://bestballexposures.com`
   - `<link rel="icon">` pointing to `/favicon.svg`

2. **favicon.svg** — static SVG file using the fixed-gradient BrandLogo markup from `BRAND_LOGO_SVG` in BrandLogo.jsx.

3. **og-card.html** — self-contained HTML (no external deps) rendering a 1200×630 card:
   - Dark navy background matching app brand
   - BrandLogo mark (inline SVG)
   - "Best Ball Exposures" in gold gradient mono font
   - Tagline: "Your whole portfolio. One screen."
   - URL: bestballexposures.com
   - Developer opens in browser, screenshots at 1200×630, saves as `public/og-image.png`

4. **sitemap.xml** — minimal XML sitemap with single `<url>` entry.

5. **robots.txt** — `User-agent: *`, `Allow: /`, `Sitemap:` reference.

## Verification Criteria

- [ ] `npm run build` passes with no errors
- [ ] `index.html` contains correct `og:image`, `og:url`, `twitter:card` tags
- [ ] Favicon displays in browser tab
- [ ] `og-card.html` opens in browser and renders correctly at 1200×630
- [ ] `sitemap.xml` is valid XML and references correct domain
- [ ] `robots.txt` is present and references sitemap

## Verification Approach

1. Run `npm run build` from `best-ball-manager/` — must exit 0.
2. Inspect `dist/index.html` to confirm all meta tags are present.
3. Open `public/og-card.html` in browser — visually confirm layout at 1200×630.
4. Developer confirms favicon visible in browser tab during `npm run dev`.
