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
 * Output: public/screenshots/*.png at 2560×1600 (1280×800 @2×)
 */

import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '../public/screenshots');
const BASE_URL = 'http://localhost:5173?demo=true';

const VIEWPORT = { width: 1440, height: 900 };
const DEVICE_SCALE = 2;

async function waitForApp(page) {
  // Wait for the tab bar to appear (means data loaded and app rendered)
  await page.waitForSelector('.tab-bar', { timeout: 30000 });
  // Wait a bit for charts to render
  await page.waitForTimeout(2000);
}

async function clickTab(page, label) {
  const tab = page.locator('.tab-button', { hasText: label });
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
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await waitForApp(page);

  // Hide the demo data banner and sign-in button for cleaner marketing screenshots
  await page.addStyleTag({ content: '.demo-banner { display: none !important; }' });

  console.log('Capturing screenshots...\n');

  // 1. Dashboard — hero (viewport) and full scroll
  console.log('Dashboard:');
  await clickTab(page, 'Dashboard');
  await page.waitForTimeout(1000);
  await capture(page, 'dashboard-hero');
  await capture(page, 'dashboard-full', { fullPage: true });

  // 2. Exposures
  console.log('Exposures:');
  await clickTab(page, 'Exposures');
  await page.waitForTimeout(500);
  await capture(page, 'exposures');

  // 3. Roster Viewer
  console.log('Rosters:');
  await clickTab(page, 'Rosters');
  await page.waitForTimeout(500);
  await capture(page, 'roster-viewer');

  // 4. ADP Tracker
  console.log('ADP Tracker:');
  await clickTab(page, 'ADP Tracker');
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
  await clickTab(page, 'Combos');
  await page.waitForTimeout(1000);
  await capture(page, 'combo-analysis');

  // 6. Rankings
  console.log('Rankings:');
  await clickTab(page, 'Rankings');
  await page.waitForTimeout(1000);
  await capture(page, 'rankings');

  // 7. Draft Assistant
  console.log('Draft Assistant:');
  await clickTab(page, 'Draft Asst');
  await page.waitForTimeout(1000);
  await capture(page, 'draft-assistant');

  await browser.close();
  console.log(`\nDone! Screenshots saved to public/screenshots/`);
}

main().catch(err => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
