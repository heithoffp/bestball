// On-demand generator for 1200×630 blog hero (Open Graph) PNGs.
//
// NOT part of the build. Run it to produce a committed hero image for a post:
//   node scripts/generate-og-card.mjs --out public/blog/images/og-<slug>.png --title "Post Title" [--eyebrow "AGAINST ADP"]
// With no args it (re)generates the default blog fallback card (public/og-image-blog.png).
//
// Styled after public/og-card.html (dark gradient, gold accents, brand mark) but
// renders the post title as the headline. Uses the Playwright Chromium already
// installed for e2e tests — no new dependency.

import { mkdirSync } from 'node:fs';
import { dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const title = arg('title', 'Against ADP');
const eyebrow = arg('eyebrow', 'AGAINST ADP — THE BEST BALL EXPOSURES BLOG');
const outArg = arg('out', 'public/og-image-blog.png');
const outPath = isAbsolute(outArg) ? outArg : resolve(appRoot, outArg);

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Self-contained card markup. Headline wraps; font scales down for long titles.
const headlineSize = title.length > 48 ? 56 : title.length > 30 ? 66 : 76;
const html = `<!doctype html><html><head><meta charset="utf-8" />
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1200px; height:630px; overflow:hidden;
    font-family:'JetBrains Mono','Courier New',monospace; }
  .card { width:1200px; height:630px;
    background:linear-gradient(135deg,#0C1A30 0%,#060E1F 100%);
    position:relative; overflow:hidden;
    display:flex; flex-direction:column; justify-content:center; padding:96px 88px; gap:28px; }
  .card::before { content:''; position:absolute; top:50%; left:50%;
    transform:translate(-50%,-50%); width:900px; height:520px;
    background:radial-gradient(ellipse,rgba(212,168,67,0.10) 0%,transparent 70%); }
  .card::after { content:''; position:absolute; inset:0;
    background-image:linear-gradient(rgba(232,191,74,0.04) 1px,transparent 1px),
      linear-gradient(90deg,rgba(232,191,74,0.04) 1px,transparent 1px);
    background-size:60px 60px; }
  .corner { position:absolute; width:40px; height:40px;
    border-color:rgba(232,191,74,0.25); border-style:solid; }
  .tl { top:32px; left:32px; border-width:2px 0 0 2px; }
  .tr { top:32px; right:32px; border-width:2px 2px 0 0; }
  .bl { bottom:32px; left:32px; border-width:0 0 2px 2px; }
  .br { bottom:32px; right:32px; border-width:0 2px 2px 0; }
  .eyebrow { position:relative; z-index:1; font-size:20px; font-weight:700;
    letter-spacing:0.18em; color:rgba(212,168,67,0.85); }
  .headline { position:relative; z-index:1;
    font-family:'DM Serif Display',Georgia,serif;
    font-size:${headlineSize}px; line-height:1.08; color:#F4F7FC; max-width:1000px; }
  .brand-row { position:relative; z-index:1; display:flex; align-items:center; gap:16px; margin-top:12px; }
  .brand-name { font-size:26px; font-weight:700; letter-spacing:-0.5px;
    background:linear-gradient(135deg,#F0CC5B 0%,#D4A843 50%,#E8BF4A 100%);
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
  .url { font-size:18px; color:rgba(212,168,67,0.6); letter-spacing:0.05em; }
  .dot { color:rgba(139,163,199,0.5); }
</style></head>
<body><div class="card">
  <div class="corner tl"></div><div class="corner tr"></div>
  <div class="corner bl"></div><div class="corner br"></div>
  <div class="eyebrow">${esc(eyebrow)}</div>
  <div class="headline">${esc(title)}</div>
  <div class="brand-row">
    <svg width="56" height="56" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="10" y1="10" x2="38" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#F0CC5B"/><stop offset="50%" stop-color="#D4A843"/><stop offset="100%" stop-color="#E8BF4A"/>
        </linearGradient>
        <linearGradient id="b" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0C1A30"/><stop offset="100%" stop-color="#060E1F"/>
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="24" fill="url(#b)"/>
      <circle cx="24" cy="24" r="22.5" fill="none" stroke="url(#g)" stroke-width="2"/>
      <circle cx="24" cy="24" r="14" fill="none" stroke="url(#g)" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="18 7 10 7 23 7 8 7.96" transform="rotate(-90 24 24)"/>
      <circle cx="24" cy="24" r="2.5" fill="url(#g)"/>
    </svg>
    <span class="brand-name">Best Ball Exposures</span>
    <span class="dot">·</span>
    <span class="url">bestballexposures.com</span>
  </div>
</div></body></html>`;

async function main() {
  mkdirSync(dirname(outPath), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  // Give the webfonts a beat to settle before snapshotting.
  await page.waitForTimeout(400);
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  await browser.close();
  console.log(`[generate-og-card] wrote ${outPath} (1200×630)`);
}

main();
