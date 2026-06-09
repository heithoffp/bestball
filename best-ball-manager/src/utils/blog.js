// Blog content layer.
//
// Posts are authored as markdown in <repo>/docs/blog (by the /weekly-blog skill)
// and synced into src/content/blog by scripts/sync-blog.mjs at dev/build time.
// This module loads them, parses frontmatter, and owns the free-vs-Pro gating rule.
//
// Gating rule (TASK-249): the single newest PUBLISHED post is free to everyone;
// every older published post is Pro-only. Soft client-side gate for v1 — see
// TASK-254 for server-side enforcement.

const WORDS_PER_MIN = 220;

// Eagerly bundle the raw markdown. Glob is relative to this file.
const modules = import.meta.glob('../content/blog/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/**
 * Minimal YAML-frontmatter parser for the known blog schema:
 *   title (quoted string), date (YYYY-MM-DD), status, topic_tags (inline array),
 *   kb_sources (block list — ignored for display).
 * Avoids gray-matter and its Node/Buffer polyfills.
 */
function parseFrontmatter(raw) {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw; // strip BOM if present
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, content: text };

  const [, fm, content] = match;
  const data = {};
  const lines = fm.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let value = kv[2].trim();

    // Block list (key: then "  - item" lines) — only kb_sources uses this; skip its items.
    if (value === '') {
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) i++;
      data[key] = [];
      continue;
    }

    // Inline array: [a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      continue;
    }

    // Strip surrounding quotes from scalars.
    value = value.replace(/^["']|["']$/g, '');
    data[key] = value;
  }

  return { data, content: content.trim() };
}

function slugFromFilename(path) {
  const file = path.split('/').pop().replace(/\.md$/, '');
  return file.replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

function readingTime(content) {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MIN));
}

function buildExcerpt(content) {
  const firstPara = content
    .replace(/\[INSERT IMAGE:[^\]]*\]/gi, '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith('#'));
  if (!firstPara) return '';
  const plain = firstPara
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > 180 ? `${plain.slice(0, 177).trimEnd()}…` : plain;
}

function buildPost(path, raw) {
  const { data, content } = parseFrontmatter(raw);
  return {
    slug: slugFromFilename(path),
    title: data.title || slugFromFilename(path),
    date: data.date || '1970-01-01',
    status: (data.status || 'draft').toLowerCase(),
    topicTags: data.topic_tags || [],
    content,
    excerpt: buildExcerpt(content),
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
