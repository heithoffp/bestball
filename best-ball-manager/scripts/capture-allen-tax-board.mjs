// Capture the synthetic "two-column fork" draft board for the The Allen Tax blog
// post (TASK-262). Renders the real DraftBoardModal via the dev-only harness at
// /dev-capture.html and writes two PNGs into public/blog/images/:
//   - allen-tax-board-2026-06-15.png      full board panel (in-body hero, @2x)
//   - allen-tax-board-og-2026-06-15.png   1200×630 social card
//
// Prerequisite: dev server running →  npm run dev
// Usage:        node scripts/capture-allen-tax-board.mjs
//
// Mirrors scripts/capture-screenshots.js (same @playwright/test chromium).

import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(here, '../public/blog/images');
const URL = 'http://localhost:5173/dev-capture.html';
const DIALOG = '[role="dialog"]';

// Freeze entrance animations (deterministic frame) and hide the modal's close
// button — it's a UI affordance, not wanted in a static marketing image.
const FREEZE = `*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}`
  + `button[aria-label="Close draft board"]{display:none!important}`;
// For the OG frame: kill the blur and make the area around the panel a clean
// solid surface so the 1200×630 clip has no semi-transparent backdrop.
const OG_BG = `.backdrop,[role="dialog"]{} body>div{background:#060E1F!important;backdrop-filter:none!important}`;

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  // 1) In-body hero — full 12-column board, high-DPI element screenshot.
  {
    const ctx = await browser.newContext({
      viewport: { width: 1700, height: 1050 },
      deviceScaleFactor: 2,
      colorScheme: 'dark',
    });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForSelector(DIALOG, { timeout: 30000 });
    await page.addStyleTag({ content: FREEZE });
    await page.waitForTimeout(600); // let webfonts settle
    const out = join(OUT_DIR, 'allen-tax-board-2026-06-15.png');
    await page.locator(DIALOG).screenshot({ path: out });
    console.log(`  ✓ ${out}`);
    await ctx.close();
  }

  // 2) OG card — 1200×630, full board centered on a clean surface.
  {
    const ctx = await browser.newContext({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 1,
      colorScheme: 'dark',
    });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForSelector(DIALOG, { timeout: 30000 });
    await page.addStyleTag({ content: FREEZE + OG_BG });
    await page.waitForTimeout(600);
    const out = join(OUT_DIR, 'allen-tax-board-og-2026-06-15.png');
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
    console.log(`  ✓ ${out}`);
    await ctx.close();
  }

  await browser.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Board capture failed:', err);
  process.exit(1);
});
