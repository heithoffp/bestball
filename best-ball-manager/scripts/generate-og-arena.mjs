// On-demand generator for the Best Ball Arena 1200×630 Open Graph PNG.
//
// NOT part of the build. Run it to (re)produce the committed Arena share card:
//   node scripts/generate-og-arena.mjs            # writes public/og-image-arena.png
//   node scripts/generate-og-arena.mjs --out path/to.png
//
// Sibling of generate-og-card.mjs (same Playwright pipeline, same brand frame:
// navy gradient, gold grid, corner ticks, brand row). The middle is Arena-specific:
// two contender cards in the red/blue corner treatment facing a gold VS medallion,
// echoing the voting screen so the link preview looks like the product.

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

const outArg = arg('out', 'public/og-image-arena.png');
const outPath = isAbsolute(outArg) ? outArg : resolve(appRoot, outArg);

// Contender card contents. Names are illustrative BBM7 picks; the stack teams are
// painted in their real franchise colors (see nflTeamColors.js).
const CARD_A = {
  corner: '#ec5a5f', glow: 'rgba(236,90,95,0.32)',
  build: 'HERO RB', clv: '+3.4%',
  stack: { text: 'CIN ×3', color: '#FB4F14' },
  players: [
    ['QB', 'Joe Burrow'],
    ['RB', 'Bijan Robinson'],
    ['WR', "Ja'Marr Chase"],
    ['WR', 'Tee Higgins'],
  ],
};
const CARD_B = {
  corner: '#4f93f5', glow: 'rgba(79,147,245,0.32)',
  build: 'ZERO RB', clv: '+1.8%',
  stack: { text: 'DEN ×3', color: '#F65A22' },
  players: [
    ['QB', 'Bo Nix'],
    ['WR', 'Courtland Sutton'],
    ['WR', 'Marvin Mims Jr.'],
    ['TE', 'Evan Engram'],
  ],
};

const POS_COLORS = { QB: '#d64358', RB: '#3bae7c', WR: '#4f93f5', TE: '#d4a843' };

function playerRows(card) {
  return card.players.map(([pos, name]) => `
    <div class="prow">
      <span class="pos" style="color:${POS_COLORS[pos]};border-color:${POS_COLORS[pos]}55">${pos}</span>
      <span class="pname">${name}</span>
    </div>`).join('');
}

function contenderCard(card, side) {
  return `
  <div class="ccard" style="--corner:${card.corner};--corner-glow:${card.glow}">
    <div class="chead">
      <span class="build" style="color:${card.corner}">${card.build}</span>
      <span class="stack" style="color:${card.stack.color};border-color:${card.stack.color}66">${card.stack.text}</span>
    </div>
    ${playerRows(card)}
    <div class="cfoot">TEAM CLV <span style="color:${card.corner}">${card.clv}</span></div>
  </div>`;
}

const html = `<!doctype html><html><head><meta charset="utf-8" />
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700;800&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1200px; height:630px; overflow:hidden;
    font-family:'JetBrains Mono','Courier New',monospace; }
  .card { width:1200px; height:630px;
    background:linear-gradient(135deg,#0C1A30 0%,#060E1F 100%);
    position:relative; overflow:hidden;
    display:flex; flex-direction:column; align-items:center;
    padding:52px 72px 44px; }
  .card::before { content:''; position:absolute; top:50%; left:50%;
    transform:translate(-50%,-50%); width:900px; height:520px;
    background:radial-gradient(ellipse,rgba(212,168,67,0.10) 0%,transparent 70%); }
  .card::after { content:''; position:absolute; inset:0;
    background-image:linear-gradient(rgba(232,191,74,0.04) 1px,transparent 1px),
      linear-gradient(90deg,rgba(232,191,74,0.04) 1px,transparent 1px);
    background-size:60px 60px; }
  .corner { position:absolute; width:40px; height:40px;
    border-color:rgba(232,191,74,0.25); border-style:solid; z-index:2; }
  .tl { top:28px; left:28px; border-width:2px 0 0 2px; }
  .tr { top:28px; right:28px; border-width:2px 2px 0 0; }
  .bl { bottom:28px; left:28px; border-width:0 0 2px 2px; }
  .br { bottom:28px; right:28px; border-width:0 2px 2px 0; }

  .headline { position:relative; z-index:1; font-size:64px; font-weight:800;
    letter-spacing:0.04em;
    background:linear-gradient(135deg,#F0CC5B 0%,#D4A843 50%,#E8BF4A 100%);
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
  .tagline { position:relative; z-index:1; margin-top:10px;
    font-family:'DM Sans',sans-serif; font-size:25px; color:#B9C7DE; }
  .tagline strong { color:#F4F7FC; font-weight:700; }

  .ring { position:relative; z-index:1; display:flex; align-items:center;
    gap:34px; margin-top:34px; }
  .ccard { width:390px; background:#0D1B33;
    border:1px solid rgba(148,175,215,0.18); border-left:4px solid var(--corner);
    border-radius:14px; padding:18px 22px;
    box-shadow:0 0 0 1px var(--corner-glow), 0 10px 34px var(--corner-glow);
    display:flex; flex-direction:column; gap:9px; }
  .chead { display:flex; align-items:center; justify-content:space-between; margin-bottom:2px; }
  .build { font-size:21px; font-weight:800; letter-spacing:0.08em; }
  .stack { font-size:17px; font-weight:700; border:1px solid; border-radius:999px;
    padding:3px 12px; }
  .prow { display:flex; align-items:center; gap:12px; }
  .pos { font-size:14px; font-weight:700; width:38px; text-align:center;
    border:1px solid; border-radius:6px; padding:1px 0; }
  .pname { font-family:'DM Sans',sans-serif; font-size:20px; color:#E7EDF7; }
  .cfoot { margin-top:4px; padding-top:10px; font-size:15px; font-weight:700;
    letter-spacing:0.1em; color:#8BA3C7;
    border-top:1px solid rgba(148,175,215,0.14); }

  .vs { width:96px; height:96px; border-radius:50%; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
    font-size:34px; font-weight:800; color:#0A1526;
    background:linear-gradient(135deg,#F0CC5B 0%,#D4A843 55%,#E8BF4A 100%);
    box-shadow:0 0 0 6px rgba(212,168,67,0.18), 0 0 46px rgba(212,168,67,0.35); }

  .brand-row { position:relative; z-index:1; display:flex; align-items:center;
    gap:14px; margin-top:auto; }
  .brand-name { font-size:22px; font-weight:700; letter-spacing:-0.5px;
    background:linear-gradient(135deg,#F0CC5B 0%,#D4A843 50%,#E8BF4A 100%);
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
  .url { font-size:17px; color:rgba(212,168,67,0.6); letter-spacing:0.05em; }
  .dot { color:rgba(139,163,199,0.5); }
</style></head>
<body><div class="card">
  <div class="corner tl"></div><div class="corner tr"></div>
  <div class="corner bl"></div><div class="corner br"></div>
  <div class="headline">BEST BALL ARENA</div>
  <div class="tagline">Two real BBM7 rosters. No usernames. <strong>You pick the winner.</strong></div>
  <div class="ring">
    ${contenderCard(CARD_A, 'a')}
    <div class="vs">VS</div>
    ${contenderCard(CARD_B, 'b')}
  </div>
  <div class="brand-row">
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
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
    <span class="url">bestballexposures.com/arena</span>
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
  console.log(`[generate-og-arena] wrote ${outPath} (1200×630)`);
}

main();
