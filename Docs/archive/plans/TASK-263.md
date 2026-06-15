<!-- Completed: 2026-06-15 | Commit: (this commit) -->
# TASK-263: Scheduled blog publishing + author preview gate

**Status:** Pending Approval
**Priority:** P2

---

## Objective
Let a blog post's `date` frontmatter double as its **go-live date**: a `status: published` post
with a future `date` stays hidden from the public (and gets no public OG card) until that date,
then appears automatically client-side. The logged-in author (email normalizing to
`heithoff.patrick`, `+tag` stripped) can preview scheduled posts on the live site with a clear
PREVIEW badge; everyone else is bounced exactly as they are for a draft today.

## Verification Criteria
1. **Public hides scheduled posts.** A post with `status: published` and `date` in the future
   does **not** appear in the `/blog` index and is **not** readable at `/blog/<slug>` for a
   guest, a free user, or a Pro user. The slug bounces to `/blog` (same as a draft).
2. **Auto-publish by date.** With no rebuild/deploy, the same post becomes visible in the index
   and readable once the local date reaches its `date`. (Simulated in test by injecting "today".)
3. **Author preview.** When the logged-in user's email normalizes to `heithoff.patrick`
   (`heithoff.patrick@gmail.com`, `heithoff.patrick+beta@gmail.com`, any `+tag`), scheduled
   posts appear in the index and are readable, each marked with a visible **PREVIEW · Scheduled
   <date>** badge. A non-author logged-in user sees none of this.
4. **Free/Pro rule unchanged.** The "newest published is free, older is Pro" rule is computed
   against the **live** post list (date ≤ today), so a scheduled post never becomes the "free"
   post and never demotes the current free post — verified for both public and author-preview.
5. **No pre-launch OG leak.** `npm run build` emits a `dist/blog/<slug>/index.html` OG card
   only for posts that are published **and** `date ≤ today`. A scheduled post has no prerendered
   card.
6. **Existing posts unaffected.** All four currently-published posts (past dates) render
   identically before and after the change.
7. `npm run build` and `npm run lint` both succeed.

## Verification Approach
- **Unit (pure logic).** Add a small Node test (runnable with `node --test`) for the two pure
  modules, since `isLive`/`normalizeEmail`/`isAuthorEmail` are deterministic and `import.meta`-free:
  - `normalizeEmail('Heithoff.Patrick+beta@gmail.com')` → `heithoff.patrick@gmail.com`;
    `isAuthorEmail` true for `+tag` variants, false for `someone.else@gmail.com` and `null`.
  - `isLive({status:'published', date:'2026-06-10'}, '2026-06-15')` → true;
    `isLive({status:'published', date:'2026-06-20'}, '2026-06-15')` → false;
    `isLive({status:'draft', date:'2026-06-10'}, …)` → false.
  - Report command output (`node --test` exit 0, all assertions pass).
- **Date gating in `blog.js`.** Because `today` is injected as a parameter (not read from the
  clock inside the pure helpers), the test sets a fixed "today" and asserts `getPublishedPosts`
  / `getPostBySlug` include vs. exclude a fixture post correctly with and without
  `includeScheduled`.
- **Prerender script.** Run `npm run build` and confirm `dist/blog/` contains a directory for
  each live post and **none** for a temporarily future-dated fixture; report the `ls` output and
  the `[prerender-blog]` count line. Remove the fixture after.
- **Manual (developer).** On `npm run dev`: (a) set the current Allen-tax draft to
  `status: published` with a future `date`, confirm it is hidden when logged out and visible with
  a PREVIEW badge when logged in as `heithoff.patrick+…`; (b) confirm a non-author login does not
  see it. These require a real Supabase login, so the developer confirms them.
- **Lint/build:** `npm run lint` and `npm run build` exit clean.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/utils/authorPreview.js` | Create | `normalizeEmail()` (lowercase, strip `+tag`) + `isAuthorEmail()` against `AUTHOR_EMAILS` allowlist (`heithoff.patrick@gmail.com`). Pure, no imports. |
| `best-ball-manager/src/utils/blog.js` | Modify | Add `todayStr()` + `isLive(post, today)`; add `{ includeScheduled }` option to `getPublishedPosts`/`getPostBySlug`; keep `isPostFree`/`canReadPost` computed on the live list; `canReadPost` returns true for the author. |
| `best-ball-manager/src/contexts/AuthContext.jsx` | Modify | Derive `isAuthor = isAuthorEmail(user?.email)`; expose in context value. |
| `best-ball-manager/src/components/BlogIndex.jsx` | Modify | `useAuth()`; call `getPublishedPosts({ includeScheduled: isAuthor })`; render PREVIEW/Scheduled badge on future-dated rows. |
| `best-ball-manager/src/components/BlogPost.jsx` | Modify | `useAuth()`; `getPostBySlug(slug, { includeScheduled: isAuthor })` and matching post list; render a preview banner for a scheduled post. |
| `best-ball-manager/src/components/BlogIndex.module.css` | Modify | Style the scheduled/preview badge. |
| `best-ball-manager/src/components/BlogPost.module.css` | Modify | Style the preview banner. |
| `best-ball-manager/scripts/prerender-blog.mjs` | Modify | Gate prerender on published **and** `date ≤ today` (reuse the same date comparison). |
| `best-ball-manager/src/utils/__tests__/blog.test.mjs` | Create | `node --test` unit coverage for `authorPreview` + date gating. |

## Implementation Approach
1. **`authorPreview.js` (pure).**
   - `normalizeEmail(email)`: return `''` for falsy; lowercase; split on `@`; strip everything
     from the first `+` in the local part; rejoin `local@domain`.
   - `AUTHOR_EMAILS = new Set(['heithoff.patrick@gmail.com'])` — extendable.
   - `isAuthorEmail(email)`: `AUTHOR_EMAILS.has(normalizeEmail(email))`.
   - No `import.meta`, so it is unit-testable and reusable by Node scripts if ever needed.
2. **`blog.js` date model.**
   - `todayStr()`: local `YYYY-MM-DD` via `new Date().toLocaleDateString('en-CA')` (ISO-ordered).
   - `isLive(post, today = todayStr())`: `post.status === 'published' && post.date <= today`
     (string compare is correct for zero-padded ISO dates).
   - `getLivePosts(today)`: `ALL_POSTS.filter(p => isLive(p, today))` (already sorted newest-first).
   - `getPublishedPosts({ includeScheduled = false, today = todayStr() } = {})`: if
     `includeScheduled`, return all `status === 'published'` posts (live + scheduled), newest
     first; else `getLivePosts(today)`. Keep a zero-arg call working (back-compat default).
   - `getPostBySlug(slug, { includeScheduled = false } = {})`: look up within the same set the
     index would show, so a scheduled slug resolves only for authors.
   - **Free/Pro stays anchored to live.** Default `posts` for `isPostFree`/`canReadPost` becomes
     `getLivePosts()` so "newest free" is always the newest *live* post even while an author
     previews a scheduled one. `canReadPost(slug, tier, posts, { isAuthor } = {})` →
     `isAuthor || isPostFree(...) || tier === 'pro'`.
3. **`AuthContext.jsx`.** Import `isAuthorEmail`; compute `const isAuthor =
   isAuthorEmail(user?.email);` next to `emailVerified`; add `isAuthor` to the provider value.
   Client-side preview gate only — not a security boundary (see ADR note).
4. **`BlogIndex.jsx`.** Add `const { isAuthor } = useAuth();`. Call
   `getPublishedPosts({ includeScheduled: isAuthor })`. For any row/feature where `!isLive(post)`,
   render a **PREVIEW · Scheduled <formatPostDate(date)>** badge so a scheduled post is never
   mistaken for a live one. Empty-state copy unchanged.
5. **`BlogPost.jsx`.** Add `const { isAuthor } = useAuth();`. Use
   `getPublishedPosts({ includeScheduled: isAuthor })` for the pager list and
   `getPostBySlug(slug, { includeScheduled: isAuthor })` for the post. Unknown/draft/scheduled-
   for-non-author → existing bounce to `/blog`. When the resolved post is scheduled, render a
   banner above the header ("Preview — scheduled for <date>, not yet public"). Pass `{ isAuthor }`
   into `canReadPost` so the author preview is never locked.
6. **`prerender-blog.mjs`.** Change the guard from `status !== 'published'` to also skip when
   `date > today` (compute `today` once; `new Date().toISOString().slice(0,10)` is acceptable for
   a build step). Log skipped-as-scheduled counts.
7. **Edge cases.**
   - Missing/invalid `date` → `buildPost` defaults to `1970-01-01` (reads as live); unchanged.
   - `includeScheduled` does not change ordering (newest-first); a scheduled future post sorts
     above live ones in the author's index, which is intended.
   - Guests / no Supabase: `user` null → `isAuthor` false → public behavior.
   - **`public/sitemap.xml` is static/manual** — do not add a scheduled post's URL until it goes
     live (no code change; note for whoever edits the sitemap).
8. **Known limitation (document, don't fix here).** Auto-publish at midnight is client-side only;
   the static OG card and sitemap entry materialize on the next build/deploy. Instant-on-date
   social cards would need a daily Vercel cron rebuild — propose as a follow-up task if wanted.

## Dependencies
None. (Related: TASK-254 — server-side gate enforcement — would later harden both this preview
gate and the existing Pro gate; out of scope here.)

## Open Questions
1. **Author email domain.** Allowlist defaults to `heithoff.patrick@gmail.com`. Confirm the
   domain (and add any others, e.g. a work address) before merge — trivially editable in
   `AUTHOR_EMAILS`.
2. **ADR.** This sets two small but non-obvious conventions: (a) `date` = go-live date, and
   (b) an accepted *soft-privacy* posture — scheduled, unreleased post content ships in the
   public JS bundle (hidden by UI, not by the server). Recommend a short ADR via hus-adr to
   record both, consistent with how the existing soft Pro gate is documented (TASK-254). Approve
   separately.

---
*Approved by: <!-- pending -->*
