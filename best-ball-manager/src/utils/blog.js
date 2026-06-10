// Blog content layer.
//
// Posts are authored as markdown in <repo>/docs/blog (by the /weekly-blog skill)
// and synced into src/content/blog by scripts/sync-blog.mjs at dev/build time.
// This module loads them, parses frontmatter, and owns the free-vs-Pro gating rule.
//
// Gating rule (TASK-249): the single newest PUBLISHED post is free to everyone;
// every older published post is Pro-only. Soft client-side gate for v1 — see
// TASK-254 for server-side enforcement.

import { parseFrontmatter, slugFromFilename, buildExcerpt } from './blogParse.js';

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

/** Published posts, newest first. Drafts never surface. */
export function getPublishedPosts() {
  return ALL_POSTS.filter((p) => p.status === 'published');
}

export function getPostBySlug(slug) {
  return getPublishedPosts().find((p) => p.slug === slug) || null;
}

/** The newest published post is free to everyone. */
export function isPostFree(slug, posts = getPublishedPosts()) {
  return posts.length > 0 && posts[0].slug === slug;
}

/** Gate: newest published is free; older requires Pro. */
export function canReadPost(slug, tier, posts = getPublishedPosts()) {
  return isPostFree(slug, posts) || tier === 'pro';
}

/** First `count` paragraphs of a post body — used for the locked teaser. */
export function getLede(content, count = 2) {
  return content
    .split(/\n\s*\n/)
    .filter((p) => p.trim() && !p.trim().startsWith('#'))
    .slice(0, count)
    .join('\n\n');
}

/** Human-readable date: "June 9, 2026". */
export function formatPostDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
