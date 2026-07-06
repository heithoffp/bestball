// Prerender Arena-specific Open Graph / Twitter metadata for /arena.
//
// Same mechanism as prerender-blog.mjs: the SPA's catch-all rewrite means social
// crawlers (which do not run JS) fetching bestballexposures.com/arena would read
// the site-wide dashboard OG card. This postbuild step copies the built
// dist/index.html to dist/arena/index.html with Arena title/description/image
// swapped in; vercel.json rewrites /arena to it. Human visitors still get the
// SPA — the hashed /assets script tags are preserved, so React hydrates and
// routes to /arena normally.
//
// Wired to `postbuild` in package.json, after prerender-blog.mjs.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const DIST = join(appRoot, 'dist');
const DIST_INDEX = join(DIST, 'index.html');

const SITE = 'https://bestballexposures.com';
const URL = `${SITE}/arena`;
const TITLE = 'Best Ball Arena — Head-to-Head Roster Battles';
const DESCRIPTION =
  'Anonymous best-ball rosters go head to head. Pick the winner, move the ratings, climb the leaderboard. Free to play — synced teams enter the pool automatically.';
const IMAGE = `${SITE}/og-image-arena.png`;
const IMAGE_ALT = 'Anonymous best-ball rosters facing off in the Best Ball Arena.';

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function replaceMeta(html, attr, key, value) {
  const re = new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`);
  return html.replace(re, `$1${esc(value)}$2`);
}

function main() {
  if (!existsSync(DIST_INDEX)) {
    console.warn(`[prerender-arena] ${DIST_INDEX} not found — run vite build first. Skipping.`);
    return;
  }

  let html = readFileSync(DIST_INDEX, 'utf8');
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(TITLE)}</title>`);
  html = html.replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(DESCRIPTION)}$2`);
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${esc(URL)}$2`);
  html = replaceMeta(html, 'property', 'og:title', TITLE);
  html = replaceMeta(html, 'property', 'og:description', DESCRIPTION);
  html = replaceMeta(html, 'property', 'og:url', URL);
  html = replaceMeta(html, 'property', 'og:image', IMAGE);
  html = replaceMeta(html, 'property', 'og:image:width', '1200');
  html = replaceMeta(html, 'property', 'og:image:height', '630');
  html = replaceMeta(html, 'property', 'og:image:alt', IMAGE_ALT);
  html = replaceMeta(html, 'name', 'twitter:title', TITLE);
  html = replaceMeta(html, 'name', 'twitter:description', DESCRIPTION);
  html = replaceMeta(html, 'name', 'twitter:image', IMAGE);

  const outDir = join(DIST, 'arena');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), html);
  console.log('[prerender-arena] wrote dist/arena/index.html');
}

main();
