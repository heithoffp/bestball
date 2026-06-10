<!-- Completed: 2026-06-09 | Commit: 823dbeb -->
# TASK-256: Per-route Open Graph metadata + hero images for blog posts (build-time prerender)

**Status:** Pending Approval
**Priority:** P2

---

## Objective
Make sharing a `/blog/<slug>` URL on Reddit / Twitter / iMessage render a post-specific
title, description, and 1200×630 hero image instead of the generic site-wide dashboard card.
Achieve this with a build-time prerender step that emits a static `dist/blog/<slug>/index.html`
carrying per-post Open Graph / Twitter meta tags, plus an `image:` frontmatter field and a
default fallback image.

## Background / root cause
The site is a Vite + React SPA on Vercel. `vercel.json` rewrites `/(.*)` → `/index.html`, so
every URL — including `/blog/<slug>` — serves the same static `index.html` with site-wide OG
tags (`og:image = og-image-dashboard.png`). Social crawlers do **not** run JavaScript, so the
React app's client-side rendering can never change what the crawler reads. The fix must put
post-specific tags into the HTML *before* it ships — i.e. at build time. (KB not compiled at
repo root — research phase ran without KB context.)

## Verification Criteria
1. `npm run build` completes successfully and the new `postbuild` step logs
   `prerendered N post(s)` where N = number of published posts.
2. `dist/blog/five-draftkings-sales-underdog-wont-give-you/index.html` exists.
3. In that file, the following are post-specific (not the site defaults):
   - `<title>` and `og:title`/`twitter:title` contain the post title ("Five DraftKings Sales…").
   - `og:url` and `<link rel="canonical">` = `https://bestballexposures.com/blog/five-draftkings-sales-underdog-wont-give-you`.
   - `og:image`/`twitter:image` = an absolute `https://bestballexposures.com/...` URL ending in the post's hero PNG.
   - `og:description`/`twitter:description` = the post's excerpt/description.
   - The title's apostrophe is HTML-escaped correctly (no broken attribute).
4. That same file still contains the hashed Vite script tag(s) (`<script type="module" src="/assets/…">`) so the SPA still hydrates and renders the post for human visitors.
5. The emitted directory name (the slug) is **identical** to the slug `blog.js` computes for the same file (proves no SPA-vs-prerender divergence).
6. The hero PNG and the default fallback PNG both exist and are exactly **1200×630**.
7. A post with **no** `image:` frontmatter falls back to the default blog OG image (verified by the script's fallback branch logging it, or a temporary draft check).
8. `npm run lint` passes clean.
9. Crawler simulation: `npm run preview`, then a raw `curl http://localhost:4173/blog/five-draftkings-sales-underdog-wont-give-you` returns HTML containing the post-specific `og:image` **without executing JS**.

## Verification Approach
Claude runs:
1. `cd best-ball-manager && npm run build` — confirm exit 0 and the `[prerender-blog] prerendered N post(s)` log line.
2. Inspect `dist/blog/five-draftkings-sales-underdog-wont-give-you/index.html` (grep the og:/twitter:/canonical/title tags) — confirm every value in criterion 3, plus the script tag in criterion 4.
3. Confirm the emitted slug dir name matches the slug from the shared `blogParse.js` (run a tiny node snippet, or compare against the known expected slug).
4. Check PNG dimensions for the hero and fallback (criterion 6) via an image-size read.
5. `npm run lint`.
6. `npm run preview` (background) + `curl` the post URL and grep for the post-specific `og:image` (criterion 9).

**Developer manual step (required, cannot be done locally):** After this is merged and Vercel
deploys, paste the live post URL into a card validator (e.g. opengraph.xyz, the Twitter/X card
validator) or share it into a private Discord/Reddit test — confirm the post-specific image and
title render. Social crawlers require the publicly deployed URL; local checks only prove the
HTML is correct, not that Reddit accepts it. I will pause and ask you to confirm this before
closing the task.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/utils/blogParse.js` | Create | Pure (no Vite/`import.meta`) ESM module exporting `parseFrontmatter`, `slugFromFilename`, `buildExcerpt`. Single source of truth for slug/excerpt logic shared by the SPA and the Node prerender script. |
| `best-ball-manager/src/utils/blog.js` | Modify | Import the three helpers from `blogParse.js` (remove the in-file copies); add `image` and optional `description` to the parsed post object; expose `ogDescription` (= `description` ?? `excerpt`). |
| `best-ball-manager/scripts/prerender-blog.mjs` | Create | New `postbuild` script. Reads `dist/index.html`, and for each **published** post in `src/content/blog/*.md` (using `blogParse.js`), writes `dist/blog/<slug>/index.html` with og/twitter/canonical/title tags replaced (attribute-matched regex, HTML-escaped values). Mirrors `sync-blog.mjs` style. |
| `best-ball-manager/scripts/generate-og-card.mjs` | Create | On-demand (not in the build) Playwright generator: renders a self-contained branded HTML card (styled after `og-card.html`) with a post title → screenshots a 1200×630 PNG into `public/blog/images/`. Used to produce committed hero PNGs. |
| `best-ball-manager/package.json` | Modify | Add `"postbuild": "node scripts/prerender-blog.mjs"` and `"generate-og-card": "node scripts/generate-og-card.mjs"`. |
| `best-ball-manager/vercel.json` | Modify | Add `{ "source": "/blog/:slug", "destination": "/blog/:slug/index.html" }` **before** the `/(.*)` catch-all so prerendered files are served to crawlers; `/blog` and client navigation still fall through to the SPA. |
| `Docs/blog/2026-06-09-five-draftkings-sales-underdog-wont-give-you.md` | Modify | Add `image: "/blog/images/og-five-draftkings-sales.png"` to frontmatter. |
| `best-ball-manager/public/blog/images/og-five-draftkings-sales.png` | Create | Generated 1200×630 hero for the published post (committed artifact). |
| `best-ball-manager/public/og-image-blog.png` | Create | Generic 1200×630 default blog OG image (fallback when a post has no `image:`). |

## Implementation Approach
1. **Extract shared parser (`blogParse.js`).** Move `parseFrontmatter`, `slugFromFilename`
   (`replace(/\.md$/,'').replace(/^\d{4}-\d{2}-\d{2}-/,'')`), and `buildExcerpt` verbatim out
   of `blog.js` into a new pure ESM module with **no** `import.meta.glob` so plain Node can
   import it. `blog.js` re-imports them — behavior unchanged for the SPA. This guarantees the
   prerender computes the exact same slug/excerpt as the running app (criterion 5).
2. **Extend the post schema.** In the frontmatter loop, `image` and `description` already parse
   as quoted scalars. In `blog.js`'s post builder add `image: data.image || null` and
   `description: data.description || ''`; expose `ogDescription = description || excerpt`.
3. **Prerender script (`prerender-blog.mjs`, postbuild).**
   - Resolve `appRoot`; read built `dist/index.html` (abort with a clear warning if missing).
   - Read `src/content/blog/*.md` (already populated by the `prebuild` sync), parse with
     `blogParse.js`, keep `status === 'published'`.
   - For each post compute: `url = https://bestballexposures.com/blog/<slug>`,
     `image = absolute(post.image || '/og-image-blog.png')`, `desc = ogDescription`,
     `title = post.title`.
   - Replace tags by **attribute-matched regex** (robust to default-string drift), e.g.
     `/(<meta property="og:title" content=")[^"]*(")/` → inject escaped title; same for
     `og:description`, `og:url`, `og:image`, `og:image:alt`, `twitter:title`,
     `twitter:description`, `twitter:image`, `<title>…</title>`, and
     `<link rel="canonical" href="…">`. **HTML-escape** all injected values
     (`& < > " '` → entities) — the sample title contains an apostrophe.
   - `mkdirSync(dist/blog/<slug>, {recursive:true})` and write `index.html`. The copied file
     keeps the original hashed `/assets/*` script tags (absolute paths, so they resolve from
     any depth) → SPA still hydrates (criterion 4).
   - Log `[prerender-blog] prerendered N post(s)`.
4. **OG card generator (`generate-og-card.mjs`).** Self-contained: build an HTML string styled
   after `public/og-card.html` (dark gradient, gold accents, brand mark) with the post title as
   the headline and `bestballexposures.com/blog` as the URL line; launch Playwright
   (`devDependency` already present), set viewport 1200×630, screenshot to the target PNG.
   Run it once to produce both `og-five-draftkings-sales.png` and the generic
   `og-image-blog.png` (latter uses a generic "Against ADP — the Best Ball Exposures blog"
   headline). Commit the PNGs; the generator is not part of the build.
5. **Vercel routing.** Insert the `/blog/:slug` rewrite ahead of the catch-all. Vercel matches
   it to the prerendered static file; human SPA navigations (client-side) are unaffected, and
   `/blog` (index) still falls through to `/index.html`.
6. **Frontmatter + verify.** Add `image:` to the 2026-06-09 post, run the build, and execute
   the Verification Approach.

## Dependencies
None blocking. Playwright is already a dev dependency. The earlier `Docs/`-casing sync fix
(commit 55c289b) is in place, so the prebuild sync populates `src/content/blog/` correctly.

## Open Questions / Alternatives considered
- **Serverless/edge meta injection** (a Vercel function intercepting `/blog/*`) — rejected:
  adds runtime cost and a moving part for ~weekly content; build-time prerender is free.
- **`@vercel/og` dynamic image generation** — deferred: nice future enhancement (auto-render a
  card from the title with zero per-post asset work), but a committed static PNG is simpler and
  cheaper to ship now. The `generate-og-card.mjs` helper is the bridge until/if we adopt it.
- **Why extract `blogParse.js`** rather than duplicate the parser in the script: a divergent
  slug would silently produce a prerendered file at the wrong path → crawler gets the SPA
  default and the fix appears not to work. Shared module eliminates that class of bug.
- **Authoring-skill follow-up:** the `/weekly-blog` skill should learn to set `image:` and
  generate a hero for every new post; tracked separately so future posts get cards by default.

---
*Approved by: Developer — 2026-06-09*
