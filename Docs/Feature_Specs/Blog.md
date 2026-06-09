# Feature Spec: Blog ("Against ADP")

**Status:** Implemented (TASK-249)
**Routes:** `/blog` (index), `/blog/:slug` (article) — public, standalone pages
**Source task:** TASK-249 · **Hardening follow-up:** TASK-254

## Purpose

A weekly editorial column ("Against ADP") published off the same data the app runs on.
Serves two goals at once:

- **Top-of-funnel / SEO** — public, link-shareable content that pulls new drafters in.
- **Pro retention** — the newest issue is a free hook; the back catalogue is a Pro perk.

Framing stays *mirror, not advisor* in CTAs — the upsell describes what Pro includes,
it does not prescribe action.

## Content source & authoring workflow

- Posts are authored as markdown in `docs/blog/` by the `/weekly-blog` skill.
  `docs/blog/index.md` is the running authoring log (not a post) and is ignored.
- `best-ball-manager/scripts/sync-blog.mjs` copies dated post files
  (`YYYY-MM-DD-<slug>.md`) into `best-ball-manager/src/content/blog/` (git-ignored,
  generated). It runs automatically via the `predev` and `prebuild` npm hooks, so dev
  servers and Vercel builds always bundle the latest content. `docs/blog/` is the single
  source of truth.
- **To publish:** set a post's frontmatter `status: published`, commit, deploy. No
  component changes are needed.

### Frontmatter schema

```yaml
title: "Five DraftKings Sales Underdog Won't Give You"
date: 2026-06-09          # YYYY-MM-DD; drives ordering and the URL slug
status: published         # draft (hidden) | published (live)
topic_tags: [adp, cross-platform]   # rendered as chips
kb_sources: [...]         # provenance only; not displayed
```

The URL slug is the filename with the date prefix and `.md` stripped
(`2026-06-09-five-draftkings-sales-underdog-wont-give-you.md` → `/blog/five-draftkings-sales-underdog-wont-give-you`).

## Visibility & gating rule

- Only `status: published` posts appear, sorted by `date` descending. Drafts never
  surface in the index and 404 → redirect to `/blog` at their slug.
- **The single newest published post is free to everyone, including logged-out visitors.**
- **Every older published post is Pro-only.** When a newer post publishes, the
  previously-free post automatically becomes locked (the rule keys off list position,
  not a per-post flag).
- Locked posts render the lede (first two paragraphs) under a fade, followed by a Pro
  upsell card linking to `/?upgrade=1` (the existing auth → plan-picker hand-off).

> **Known limitation (v1):** gating is client-side. Because posts are bundled into the
> app JS, locked content technically ships to the browser and is reachable via devtools.
> Accepted as a v1 tradeoff for a weekly content perk. Server-side, RLS-enforced delivery
> is tracked as **TASK-254**.

## Placement

- **Public:** `/blog` and `/blog/:slug` render as standalone pages with their own chrome
  (`BlogChrome`) — no app shell, no auth gate — mirroring the `/install` pattern.
- **In-app:** a "Blog" button in the dashboard tab bar navigates to `/blog`.

## Design

"Against ADP" — a sportsbook-almanac editorial aesthetic layered over the brand's
navy/gold tokens so reading feels distinct from the dashboard:

- **Type:** Fraunces (display serif headlines + italic pull quotes), Newsreader (reading
  body, ~720px measure), JetBrains Mono (dates, tags, figures — the brand's existing mono).
  Blog fonts are scoped to the blog CSS modules; the app UI is unaffected.
- **Detail:** gold hairline rules, drop cap on the lede, bold ranking leads styled as
  editorial markers, blockquotes as pull quotes, `[INSERT IMAGE: …]` placeholders rendered
  as dashed gold figure frames, restrained staggered fade-up on load.

## Rendering

`react-markdown` + `remark-gfm`, lazy-loaded with the blog route. A component map styles
links (open in new tab), images, and the `[INSERT IMAGE: …]` placeholder convention.

## Key files

| File | Role |
|------|------|
| `scripts/sync-blog.mjs` | Copies `docs/blog/*.md` → `src/content/blog/` |
| `src/utils/blog.js` | Content loading, frontmatter parse, gating helpers |
| `src/components/BlogChrome.jsx` | Standalone public masthead/footer |
| `src/components/BlogIndex.jsx` | Magazine index: free hero + Pro archive ledger |
| `src/components/BlogPost.jsx` | Article reader + locked-teaser variant |
| `src/App.jsx` | `/blog` + `/blog/:slug` routing; in-app "Blog" tab link |
