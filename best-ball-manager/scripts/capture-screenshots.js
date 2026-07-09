/**
 * Automated screenshot capture for Best Ball Exposures.
 *
 * Prerequisites:
 *   1. Dev server running: npm run dev
 *   2. Playwright installed: npx playwright install chromium
 *
 * Usage:
 *   node scripts/capture-screenshots.js
 *
 * Output: public/screenshots/*.png at 2880×1800 (1440×900 @2×)
 */
/* global process */

import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '../public/screenshots');
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

const VIEWPORT = { width: 1440, height: 900 };
const DEVICE_SCALE = 2;

async function waitForApp(page) {
  // Demo mode is entered through the landing page CTA (the old ?demo=true
  // query param is no longer handled by App.jsx).
  await page.waitForSelector('text=Explore the live demo', { timeout: 30000 });
  await page.getByRole('button', { name: 'Explore the live demo' }).first().click();
  // Wait for the nav rail to appear (means data loaded and app rendered)
  await page.waitForSelector('[data-nav="rail"]', { timeout: 30000 });
  // Wait a bit for charts to render
  await page.waitForTimeout(2000);
}

async function clickTab(page, key) {
  const tab = page.locator(`[data-nav-item="${key}"]`);
  await tab.click();
  await page.waitForTimeout(1500); // let lazy component + charts render
}

async function capture(page, name, options = {}) {
  const filepath = path.join(OUTPUT_DIR, `${name}.png`);
  if (options.fullPage) {
    await page.screenshot({ path: filepath, fullPage: true });
  } else {
    await page.screenshot({ path: filepath });
  }
  console.log(`  ✓ ${name}.png`);
}

async function main() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE,
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  console.log(`Navigating to ${BASE_URL}`);
  // 'networkidle' never settles when Supabase env vars are configured (the
  // client keeps connections open) — wait on selectors instead.
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await waitForApp(page);

  // Hide the demo data banner and sign-in button for cleaner marketing screenshots
  await page.addStyleTag({ content: '.demo-banner { display: none !important; }' });

  console.log('Capturing screenshots...\n');

  // 1. Dashboard — hero (viewport) and full scroll
  console.log('Dashboard:');
  await clickTab(page, 'dashboard');
  await page.waitForTimeout(1000);
  await capture(page, 'dashboard-hero');
  await capture(page, 'dashboard-full', { fullPage: true });

  // 2. Exposures
  console.log('Exposures:');
  await clickTab(page, 'exposures');
  await page.waitForTimeout(500);
  await capture(page, 'exposures');

  // 3. Roster Viewer
  console.log('Rosters:');
  await clickTab(page, 'rosters');
  await page.waitForTimeout(500);
  await capture(page, 'roster-viewer');

  // 3b. Draft board modal — cropped to the modal panel. Clicked via the DOM:
  // the Board button sits in a horizontally-scrolled table column, and a
  // Playwright click can stall on actionability checks there.
  console.log('Draft board:');
  page.evaluate(() => { document.querySelector('button[class*="boardBtn"]')?.click(); }).catch(() => {});
  await page.waitForTimeout(4000);
  const panelBox = await page.evaluate(() => {
    const panel = document.querySelector('[class*="backdrop"]')?.firstElementChild;
    if (!panel) return null;
    const r = panel.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (panelBox) {
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'draft-board.png'), clip: panelBox });
    console.log('  ✓ draft-board.png');
  } else {
    console.log('  ✗ draft-board (modal did not open)');
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);

  // 4. ADP Tracker
  console.log('ADP Tracker:');
  await clickTab(page, 'timeseries');
  await page.waitForTimeout(1000);
  // Try to select a few popular players if a search/select input exists
  const searchInput = page.locator('input[placeholder*="player"], input[placeholder*="Player"], input[placeholder*="search"], input[placeholder*="Search"]').first();
  if (await searchInput.isVisible().catch(() => false)) {
    for (const name of ['Bijan Robinson', 'Ja\'Marr Chase', 'Josh Allen', 'Trey McBride']) {
      await searchInput.fill(name);
      await page.waitForTimeout(300);
      // Click the first suggestion/result if there's a dropdown
      const suggestion = page.locator('[class*="suggestion"], [class*="option"], [class*="result"]').first();
      if (await suggestion.isVisible({ timeout: 500 }).catch(() => false)) {
        await suggestion.click();
        await page.waitForTimeout(200);
      }
      await searchInput.fill('');
    }
    await page.waitForTimeout(1000);
  }
  await capture(page, 'adp-tracker');

  // 5. Combos
  console.log('Combos:');
  await clickTab(page, 'combo');
  await page.waitForTimeout(1000);
  await capture(page, 'combo-analysis');

  // 6. Rankings
  console.log('Rankings:');
  await clickTab(page, 'rankings');
  await page.waitForTimeout(1000);
  await capture(page, 'rankings');

  // 7. Draft Assistant
  console.log('Draft Assistant:');
  await clickTab(page, 'draftflow');
  await page.waitForTimeout(1000);
  await capture(page, 'draft-assistant');

  // 8. Arena — needs the real backend (Supabase env vars) to load a matchup.
  // Clipped to the content area (nav rail excluded) for the landing page.
  console.log('Arena:');
  await clickTab(page, 'arena');
  await page.waitForTimeout(7000);
  const rail = await page.locator('[data-nav="rail"]').boundingBox();
  const railW = Math.ceil(rail.x + rail.width);
  await page.screenshot({
    path: path.join(OUTPUT_DIR, 'arena.png'),
    clip: { x: railW, y: 0, width: VIEWPORT.width - railW, height: VIEWPORT.height },
  });
  console.log('  ✓ arena.png');

  await browser.close();
  console.log(`\nDone! Screenshots saved to public/screenshots/`);
}

main().catch(err => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
