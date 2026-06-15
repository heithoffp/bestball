// Blog content layer.
//
// Posts are authored as markdown in <repo>/docs/blog (by the /weekly-blog skill)
// and synced into src/content/blog by scripts/sync-blog.mjs at dev/build time.
// This module loads them, parses frontmatter, and owns the free-vs-Pro gating rule.
//
// Gating rule (TASK-249): the single newest PUBLISHED post is free to everyone;
// every older published post is Pro-only. Soft client-side gate for v1 — see
// TASK-254 for server-side enforcement.
//
// Scheduled publishing (TASK-263): a post's `date` doubles as its go-live date.
// A post is LIVE only when status==='published' AND date<=today; a published
// post with a future date is "scheduled" — hidden from the public until its
// date, then it surfaces automatically (client-side, no rebuild). The post
// author can preview scheduled posts in place by passing { includeScheduled }.

import { parseFrontmatter, slugFromFilename, buildExcerpt } from './blogParse.js';
import { todayStr, isLive } from './blogSchedule.js';

// Re-export so existing importers (`import { isLive } from '../utils/blog'`) keep working.
export { todayStr, isLive };

const WORDS_PER_MIN = 220;

// Eagerly bundle the raw markdown. Glob is relative to this file.
const modules = import.meta.glob('../content/blog/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

// Frontmatter parsing / slug / excerpt logic lives in ./blogParse.js so the Node
// prerender script (scripts/prerender-blog.mjs) computes identical slugs.

function readingTime(content) {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MIN));
}

function buildPost(path, raw) {
  const { data, content } = parseFrontmatter(raw);
  const excerpt = buildExcerpt(content);
  const description = data.description || '';
  return {
    slug: slugFromFilename(path),
    title: data.title || slugFromFilename(path),
    date: data.date || '1970-01-01',
    status: (data.status || 'draft').toLowerCase(),
    topicTags: data.topic_tags || [],
    image: data.image || null,
    description,
    content,
    excerpt,
    ogDescription: description || excerpt,
    readingTime: readingTime(content),
  };
}

// Built once at module load.
const ALL_POSTS = Object.entries(modules)
  .map(([path, raw]) => buildPost(path, raw))
  .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // newest first

/** Live published posts (date<=today), newest first. */
function getLivePosts(today = todayStr()) {
  return ALL_POSTS.filter((p) => isLive(p, today)); // ALL_POSTS already sorted newest-first
}

/**
 * Published posts, newest first. By default only LIVE posts (drafts and
 * not-yet-due scheduled posts never surface). Pass { includeScheduled: true }
 * — the author-preview path — to include published-but-future posts too.
 */
export function getPublishedPosts({ includeScheduled = false, today = todayStr() } = {}) {
  if (includeScheduled) return ALL_POSTS.filter((p) => p.status === 'published');
  return getLivePosts(today);
}

export function getPostBySlug(slug, { includeScheduled = false } = {}) {
  return getPublishedPosts({ includeScheduled }).find((p) => p.slug === slug) || null;
}

/** The newest LIVE post is free to everyone. Anchored to the live list so a
 *  scheduled post being previewed never becomes (or displaces) the free post. */
export function isPostFree(slug, posts = getLivePosts()) {
  return posts.length > 0 && posts[0].slug === slug;
}

/** Gate: the author always reads; otherwise newest live is free, older needs Pro. */
export function canReadPost(slug, tier, posts = getLivePosts(), { isAuthor = false } = {}) {
  return isAuthor || isPostFree(slug, posts) || tier === 'pro';
}

/** First `count` paragraphs of a post body — used for the locked teaser.
 *  Skips headings and image-only paragraphs (e.g. a leading hero image) so the
 *  teaser opens on prose, not a figure. */
export function getLede(content, count = 2) {
  return content
    .split(/\n\s*\n/)
    .filter((p) => {
      const t = p.trim();
      return t && !t.startsWith('#') && t.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim().length > 0;
    })
    .slice(0, count)
    .join('\n\n');
}

/** Human-readable date: "June 9, 2026". */
export function formatPostDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
