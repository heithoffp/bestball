import { createRequire } from 'module';
import { mkdirSync } from 'fs';

const require = createRequire('C:/Software/Personal/BestBall/best-ball-manager/package.json');
const { chromium } = require('playwright');

const OUT_DIR = 'C:/Software/Personal/BestBall/mobile-app/docs/promotional_screenshots/marketing';
const HTML = 'file:///C:/Software/Personal/BestBall/mobile-app/docs/promotional_screenshots/marketing/_source/marketing.html';

const NAMES = [
  '01_draft_day',
  '02_dashboard',
  '03_exposures',
  '04_adp_tracker',
  '05_combos',
  '06_arena',
];

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1284, height: 2778 },
  deviceScaleFactor: 1,
});

await page.goto(HTML, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

const panels = page.locator('.panel');
const count = await panels.count();
console.log(`panels found: ${count}`);

for (let i = 0; i < count; i++) {
  const path = `${OUT_DIR}/${NAMES[i]}.png`;
  await panels.nth(i).screenshot({ path });
  console.log(`captured ${path}`);
}

await browser.close();
console.log('done');
