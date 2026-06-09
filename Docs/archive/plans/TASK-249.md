<!-- Completed: 2026-06-09 | Commit: pending (developer to commit) -->
# TASK-249: Publish weekly blog content to website — blog index + article pages

**Status:** Pending Approval
**Priority:** P1

---

## Objective
Render the markdown articles authored in `docs/blog/` (produced by the `/weekly-blog` skill) as a public, design-forward blog section on the website. The single newest published post is free to everyone (including logged-out visitors); every older post becomes Pro-locked the moment a newer one publishes. Serves as an SEO / top-of-funnel content surface and a recurring Pro retention perk. Relates to FEAT-014 (Landing Page) and EPIC-04 (Onboarding & Growth); complements TASK-193 (SEO long-tail content). Mirror-not-advisor framing in CTAs.

## Verification Criteria
1. **Public reach** — visiting `/blog` while logged out renders a magazine-style index; the newest published post opens fully at `/blog/<slug>` with no auth wall.
2. **Gating** — exactly one post (the newest published, by `date` desc) is free. Every older published post renders a locked teaser (lede + fade) with an upgrade CTA for guest/free tiers, and renders in full for Pro. When a newer post publishes, the previously-free post automatically becomes locked.
3. **Draft safety** — posts with `status: draft` never appear in the index or resolve at their slug (current 3 posts are drafts; they stay hidden until flipped to `published`).
4. **Authoring workflow** — adding/publishing a post requires only editing markdown in `docs/blog/` (set `status: published`) + a deploy; no component edits.
5. **Content fidelity** — markdown renders correctly: headings, bold, the `**N. Player**` ranking pattern, links, lists, blockquotes, and `[INSERT IMAGE: …]` placeholders render as styled figure frames (not raw text).
6. **In-app discoverability** — a "Blog" entry in the app tab bar navigates to `/blog`.
7. **Design quality** — distinctive editorial aesthetic (display serif headlines, mono stat figures, gold hairlines on navy) that harmonizes with brand tokens; not a plain markdown dump. Drop cap on lede, byline with reading time, prev/next nav.
8. **Quality gates** — `npm run build` and `npm run lint` both succeed.

## Verification Approach
- **Build/lint (Claude runs):** `cd best-ball-manager && npm run build` exits 0; `npm run lint` reports no new errors.
- **Sync step (Claude runs):** `npm run sync-blog` (and confirm `predev`/`prebuild` invoke it) copies the 3 `docs/blog/*.md` into `src/content/blog/`.
- **Manual (developer, in `npm run dev`):** I will temporarily flip one or more posts to `status: published` for verification, then:
  1. Logged out → `/blog` shows the index; newest post opens fully; an older published post shows the locked teaser + CTA. *(Confirms criteria 1, 2, 5, 7.)*
  2. A `status: draft` post does not appear and 404s/redirects at its slug. *(Criterion 3.)*
  3. As a Pro user, every post opens in full. *(Criterion 2.)*
  4. In-app: the "Blog" tab navigates to `/blog`. *(Criterion 6.)*
- Developer confirms the rendered article matches the editorial direction before close.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/scripts/sync-blog.mjs` | Create | Copy `docs/blog/*.md` → `src/content/blog/` (single source of truth = `docs/blog/`) |
| `best-ball-manager/package.json` | Modify | Add `react-markdown` + `remark-gfm` deps; add `sync-blog`, `predev`, `prebuild` scripts |
| `best-ball-manager/.gitignore` | Modify | Ignore generated `src/content/blog/` |
| `best-ball-manager/src/utils/blog.js` | Create | Glob+load content, frontmatter parse, sort, slug, excerpt, reading-time, gating helpers |
| `best-ball-manager/src/components/BlogIndex.jsx` | Create | Magazine index: featured free hero + ledger-style archive list with Pro-lock pills |
| `best-ball-manager/src/components/BlogIndex.module.css` | Create | Index styles |
| `best-ball-manager/src/components/BlogPost.jsx` | Create | Article reader + locked-teaser variant + prev/next; react-markdown component map |
| `best-ball-manager/src/components/BlogPost.module.css` | Create | Article + reader-typography styles |
| `best-ball-manager/src/components/BlogChrome.jsx` | Create | Shared standalone header/footer (BrandLogo, "Open App", X link) for public blog routes |
| `best-ball-manager/src/components/BlogChrome.module.css` | Create | Chrome styles |
| `best-ball-manager/src/App.jsx` | Modify | Standalone public routes for `/blog` and `/blog/:slug`; add "Blog" tab-bar link |
| `best-ball-manager/index.html` | Modify | `<link>` Fraunces + Newsreader (preconnect to fonts) |
| `docs/Feature_Specs/Blog.md` | Create | Behavior spec for the blog feature |

## Implementation Approach

### 1. Content pipeline (single source of truth)
- `/weekly-blog` writes to `docs/blog/`. Keep that as the only place posts are authored.
- `scripts/sync-blog.mjs` copies `docs/blog/*.md` → `best-ball-manager/src/content/blog/`. Wire it to `predev` and `prebuild` so dev and Vercel builds always materialize content inside `src/` (robust, Vite-native globbing — avoids fragile cross-root `import.meta.glob` + `server.fs.allow`). On Vercel the whole repo is checked out, so `../docs/blog` resolves during the build. Generated dir is git-ignored.
- `utils/blog.js` loads via `import.meta.glob('../content/blog/*.md', { query: '?raw', import: 'default', eager: true })`.

### 2. Parsing & data model (`utils/blog.js`)
- Tiny zero-dep frontmatter parser (the schema is simple: `title`, `date`, `status`, `topic_tags` array, `kb_sources`). Avoids gray-matter's Node/Buffer polyfills.
- Build a post object: `{ slug (from filename), title, date, status, topicTags, bodyMarkdown, excerpt (first ~160 chars of first paragraph), readingTime (words/220) }`.
- `getPublishedPosts()` → filter `status === 'published'`, sort by `date` desc.
- Gating helpers (the crux):
  - `isPostFree(slug, posts)` → `slug === posts[0].slug` (newest published).
  - `canReadPost(slug, posts, tier)` → `isPostFree(...) || tier === 'pro'`.

### 3. Rendering (`BlogPost.jsx`)
- `react-markdown` + `remark-gfm`, lazy-loaded with the blog route (isolated chunk). Component map for editorial styling: `h2/h3`, `p` (first-of-type → drop cap), `strong`, `a`, `ul/ol`, `blockquote` → pull-quote, `hr`, `img`.
- Pre-process `[INSERT IMAGE: description]` lines → a styled dashed figure frame with the description as caption (visible, so missing art is obvious; not raw bracket text).
- **Locked variant:** when `!canReadPost`, render the lede (first ~2 paragraphs) with a fade-to-transparent mask, then a Pro upsell card ("This post is now in the Pro archive" — descriptive, mirror-not-advisor) wired to `openPlanPicker()` / sign-in for guests.

### 4. Routing & placement (`App.jsx`)
- Mirror the existing `/install` / `/unsubscribe` standalone pattern (public, no app chrome, no auth gate), placed before the landing-page gate:
  - `pathname === '/blog'` → `<BlogChrome><BlogIndex/></BlogChrome>`
  - `pathname.startsWith('/blog/')` → derive slug → `<BlogChrome><BlogPost slug=…/></BlogChrome>`; unknown/draft slug → redirect to `/blog`.
- In-app discoverability: add a `Blog` button to the tab bar that `navigate('/blog')`. (It leaves the dashboard shell — acceptable; it's content, not a gated analytics tab. Noted as a deliberate tradeoff.)

### 5. Design direction — "The Stack": a sportsbook almanac
Harmonizes with brand tokens (`--surface-0 #060E1F`, `--accent #E8BF4A`) but adds an editorial reading layer so it doesn't feel like the dashboard:
- **Type:** display **Fraunces** (high-contrast optical serif) for headlines + italic kickers; **Newsreader** for long-form body (~62–68ch measure); existing **JetBrains Mono** for stat figures, dates, and ADP deltas as a signature detail (e.g. `−17%` set in gold mono). Fonts scoped to blog CSS modules so the app is untouched.
- **Surface:** navy "paper", gold hairline rules, drop cap on the lede, numbered ranking blocks styled as ledger rows, blockquotes as pull quotes, `topic_tags` as small mono chips.
- **Index:** oversized featured hero for the free newest post (FREE badge); archive below as a ledger list (mono date · serif title · Pro-lock pill).
- **Motion:** restrained — staggered fade-up on load (`animation-delay`), subtle hover lift on archive rows.

### 6. Dependencies & quality
- Add `react-markdown`, `remark-gfm`. Run `npm install`, then build + lint.

## Dependencies
None (content already exists in `docs/blog/`).

## Open Questions

1. **Soft gating is client-side (monetization tradeoff).** Because posts are bundled into the JS, Pro-archive markdown ships to every browser and a determined user could read locked posts via devtools. Acceptable for a v1 weekly-content perk; true enforcement needs server-side delivery (Supabase table/Edge Function with RLS) — the storage model you explicitly deferred. **Recommendation:** accept soft-gating for v1, and I'll add a follow-up task for server-side enforcement. This is a non-obvious, monetization-affecting choice — **I can record it as a short ADR** if you'd like it formalized. *(Needs your call: accept soft-gating + follow-up task, or formalize via ADR first.)*
2. **Publish trigger.** Plan assumes visibility = `status: published` (drafts stay hidden). The 3 existing posts are `draft`, so nothing shows until you flip them. Confirm that workflow (vs. "show everything not explicitly draft").
3. **In-app placement.** Plan puts "Blog" in the tab bar routing to the standalone `/blog`. Alternative is a header toolbar icon link. Confirm tab bar is what you want.

---
*Approved by: <!-- pending -->*
