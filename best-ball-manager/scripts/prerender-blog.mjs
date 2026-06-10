// Prerender per-post Open Graph / Twitter metadata for blog posts.
//
// The site is a client-rendered SPA: vercel.json rewrites every path to the one
// index.html, so social crawlers (Reddit/Twitter/iMessage) — which do NOT run JS —
// always read the site-wide OG tags. This postbuild step writes a static
// dist/blog/<slug>/index.html per PUBLISHED post, copying the built index.html and
// swapping the OG/Twitter/canonical/title tags to the post's values. Human visitors
// still get the SPA (the hashed /assets script tags are preserved → React hydrates
// and routes to the post); crawlers get correct per-post cards.
//
// Wired to `postbuild` in package.json so it runs after `vite build`.
// Slug/frontmatter logic is imported from src/utils/blogParse.js so the emitted
// path always matches the slug the SPA routes to.

import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, slugFromFilename, buildExcerpt } from '../src/utils/blogParse.js';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..'); // best-ball-manager/
const DIST = join(appRoot, 'dist');
const DIST_INDEX = join(DIST, 'index.html');
const CONTENT = join(appRoot, 'src', 'content', 'blog'); // populated by prebuild (sync-blog)

const SITE = 'https://bestballexposures.com';
const DEFAULT_IMAGE = '/og-image-blog.png'; // fallback hero when a post has no `image:`
const POST_RE = /^\d{4}-\d{2}-\d{2}-.+\.md$/;

// Escape a string for safe insertion into an HTML attribute or text node.
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Make an asset path absolute against the site origin.
function absUrl(pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${SITE}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

// Replace a <meta property|name="key" content="..."> value by attribute match.
function replaceMeta(html, attr, key, value) {
  const re = new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`);
  return html.replace(re, `$1${esc(value)}$2`);
}

function prerenderPost(indexHtml, post) {
  const url = `${SITE}/blog/${post.slug}`;
  const image = absUrl(post.image || DEFAULT_IMAGE);
  const desc = post.ogDescription;
  const title = post.title;

  let html = indexHtml;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  html = html.replace(
    /(<meta name="description" content=")[^"]*(")/,
    `$1${esc(desc)}$2`,
  );
  html = html.replace(
    /(<link rel="canonical" href=")[^"]*(")/,
    `$1${esc(url)}$2`,
  );
  html = replaceMeta(html, 'property', 'og:title', title);
  html = replaceMeta(html, 'property', 'og:description', desc);
  html = replaceMeta(html, 'property', 'og:url', url);
  html = replaceMeta(html, 'property', 'og:image', image);
  html = replaceMeta(html, 'property', 'og:image:width', '1200');
  html = replaceMeta(html, 'property', 'og:image:height', '630');
  html = replaceMeta(html, 'property', 'og:image:alt', `${title} — Best Ball Exposures`);
  html = replaceMeta(html, 'name', 'twitter:title', title);
  html = replaceMeta(html, 'name', 'twitter:description', desc);
  html = replaceMeta(html, 'name', 'twitter:image', image);
  // og:type is "website" site-wide; mark posts as articles.
  html = html.replace(
    /(<meta property="og:type" content=")[^"]*(")/,
    `$1article$2`,
  );
  return html;
}

function main() {
  if (!existsSync(DIST_INDEX)) {
    console.warn(`[prerender-blog] ${DIST_INDEX} not found — run vite build first. Skipping.`);
    return;
  }
  if (!existsSync(CONTENT)) {
    console.warn(`[prerender-blog] no synced content at ${CONTENT} — nothing to prerender.`);
    return;
  }

  const indexHtml = readFileSync(DIST_INDEX, 'utf8');
  const files = readdirSync(CONTENT).filter((f) => POST_RE.test(f));

  let count = 0;
  for (const f of files) {
    const raw = readFileSync(join(CONTENT, f), 'utf8');
    const { data, content } = parseFrontmatter(raw);
    const status = (data.status || 'draft').toLowerCase();
    if (status !== 'published') continue;

    const excerpt = buildExcerpt(content);
    const description = data.description || '';
    const post = {
      slug: slugFromFilename(f),
      title: data.title || slugFromFilename(f),
      image: data.image || null,
      ogDescription: description || excerpt,
    };
    if (!post.image) {
      console.log(`[prerender-blog] ${post.slug}: no image: frontmatter → default ${DEFAULT_IMAGE}`);
    }

    const outDir = join(DIST, 'blog', post.slug);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'index.html'), prerenderPost(indexHtml, post));
    count++;
  }

  console.log(`[prerender-blog] prerendered ${count} post(s)`);
}

main();
