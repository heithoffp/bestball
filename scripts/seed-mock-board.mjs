#!/usr/bin/env node
/**
 * seed-mock-board.mjs — TASK-240 review aid.
 *
 * Populates ONE draft_boards_admin row with realistic mock player data so the
 * Draft Board modal can be reviewed before the real admin-extension repair
 * re-scrape runs (the 2026-06-09 scrape stored null player names — see
 * docs/plans/TASK-240.md).
 *
 * What it does:
 *  - Picks a board whose draft_id also exists in extension_entries (so the
 *    "Board" button appears on a roster the developer actually owns).
 *  - Keeps the developer's REAL picks in their real slot (joined by pick number
 *    from the extension_entries players array).
 *  - Fills the other 11 slots with real players from the latest bundled
 *    Underdog ADP snapshot, assigned in ADP order with mild jitter.
 *  - Tags the row source='mock_test'. The admin-extension repair mode treats
 *    any source other than 'admin_scraper' as un-cached, so the next real
 *    scrape run overwrites this mock automatically.
 *
 * Usage:  node scripts/seed-mock-board.mjs [draft_id]
 * Requires <repoRoot>/.env.local with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
loadEnv({ path: join(repoRoot, '.env.local') });

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEAM_ABBR = {
  'ARIZONA CARDINALS': 'ARI', 'ATLANTA FALCONS': 'ATL', 'BALTIMORE RAVENS': 'BAL',
  'BUFFALO BILLS': 'BUF', 'CAROLINA PANTHERS': 'CAR', 'CHICAGO BEARS': 'CHI',
  'CINCINNATI BENGALS': 'CIN', 'CLEVELAND BROWNS': 'CLE', 'DALLAS COWBOYS': 'DAL',
  'DENVER BRONCOS': 'DEN', 'DETROIT LIONS': 'DET', 'GREEN BAY PACKERS': 'GB',
  'HOUSTON TEXANS': 'HOU', 'INDIANAPOLIS COLTS': 'IND', 'JACKSONVILLE JAGUARS': 'JAX',
  'KANSAS CITY CHIEFS': 'KC', 'LOS ANGELES CHARGERS': 'LAC', 'LOS ANGELES RAMS': 'LAR',
  'LAS VEGAS RAIDERS': 'LV', 'MIAMI DOLPHINS': 'MIA', 'MINNESOTA VIKINGS': 'MIN',
  'NEW ENGLAND PATRIOTS': 'NE', 'NEW ORLEANS SAINTS': 'NO', 'NEW YORK GIANTS': 'NYG',
  'NEW YORK JETS': 'NYJ', 'PHILADELPHIA EAGLES': 'PHI', 'PITTSBURGH STEELERS': 'PIT',
  'SEATTLE SEAHAWKS': 'SEA', 'SAN FRANCISCO 49ERS': 'SF', 'TAMPA BAY BUCCANEERS': 'TB',
  'TENNESSEE TITANS': 'TEN', 'WASHINGTON COMMANDERS': 'WAS',
};

function parseCsvLine(line) {
  const fields = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { fields.push(cur); cur = ''; }
    else cur += c;
  }
  fields.push(cur);
  return fields;
}

function loadAdpPool() {
  const adpDir = join(repoRoot, 'best-ball-manager', 'src', 'assets', 'adp');
  const latest = readdirSync(adpDir).filter(f => f.startsWith('underdog_adp_')).sort().pop();
  const lines = readFileSync(join(adpDir, latest), 'utf8').trim().split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const pool = [];
  for (const line of lines.slice(1)) {
    const f = parseCsvLine(line);
    const name = `${f[idx.firstName] ?? ''} ${f[idx.lastName] ?? ''}`.trim();
    const adp = parseFloat(f[idx.adp]);
    if (!name || !Number.isFinite(adp)) continue;
    pool.push({
      name,
      position: (f[idx.slotName] || '').toUpperCase(),
      team: TEAM_ABBR[(f[idx.teamName] || '').toUpperCase()] || '',
      adp,
    });
  }
  pool.sort((a, b) => a.adp - b.adp);
  console.log(`ADP pool: ${pool.length} players from ${latest}`);
  return pool;
}

const requestedId = process.argv[2];

// 1. Pick the target board: requested id, or the first 'UD 2026 Season' board
//    that has a matching extension entry.
const { data: boards, error: bErr } = await admin
  .from('draft_boards_admin')
  .select('draft_id, slate_title, entry_count, rounds, picks');
if (bErr) { console.error(bErr.message); process.exit(1); }

const { data: entries, error: eErr } = await admin
  .from('extension_entries')
  .select('entry_id, user_id, tournament, slate_title, draft_date, players');
if (eErr) { console.error(eErr.message); process.exit(1); }
const entryById = new Map(entries.map(e => [String(e.entry_id), e]));

let board = requestedId
  ? boards.find(b => String(b.draft_id) === requestedId)
  : boards
      .filter(b => entryById.has(String(b.draft_id)))
      .sort((a, b) => (a.slate_title === 'UD 2026 Season' ? -1 : 1) - (b.slate_title === 'UD 2026 Season' ? -1 : 1))[0];

if (!board) { console.error('No suitable board found.'); process.exit(1); }
const entry = entryById.get(String(board.draft_id));
if (!entry) { console.error(`No extension entry matches board ${board.draft_id}.`); process.exit(1); }

console.log(`Target: ${board.draft_id} (${board.slate_title}, ${board.entry_count} entries × ${board.rounds} rounds)`);
console.log(`Roster: ${entry.tournament} — drafted ${entry.draft_date} (user ${entry.user_id})`);

// 2. Map the developer's real picks onto the board by pick number.
const realByPick = new Map((entry.players ?? []).map(p => [Number(p.pick), p]));
const userSlots = new Set(
  board.picks.filter(p => realByPick.has(Number(p.pick))).map(p => p.slot)
);
if (userSlots.size !== 1) {
  console.error(`Expected exactly one user slot, found: ${[...userSlots].join(',') || 'none'}.`);
  process.exit(1);
}
const userSlot = [...userSlots][0];
console.log(`User slot: ${userSlot} (${realByPick.size} real picks)`);

// 3. Fill remaining picks from the ADP pool in draft order with mild jitter.
const pool = loadAdpPool();
const usedNames = new Set([...realByPick.values()].map(p => p.name.toLowerCase()));
const available = pool.filter(p => !usedNames.has(p.name.toLowerCase()));

let cursor = 0;
const takeNear = (pickNumber) => {
  // Window of the next few unused players; deterministic jitter by pick number.
  const window = [];
  let i = cursor;
  while (window.length < 4 && i < available.length) {
    if (available[i]) window.push(i);
    i++;
  }
  if (!window.length) return null;
  const chosenIdx = window[pickNumber % window.length];
  const player = available[chosenIdx];
  available[chosenIdx] = null;
  while (cursor < available.length && !available[cursor]) cursor++;
  return player;
};

const newPicks = [...board.picks]
  .sort((a, b) => Number(a.pick) - Number(b.pick))
  .map(p => {
    const pickNumber = Number(p.pick);
    const round = p.round ?? Math.ceil(pickNumber / (board.entry_count || 12));
    const real = realByPick.get(pickNumber);
    if (real) {
      return { ...p, round, name: real.name, position: real.position, team: real.team };
    }
    const mock = takeNear(pickNumber) ?? { name: 'Mock Player', position: 'WR', team: '' };
    return { ...p, round, name: mock.name, position: mock.position, team: mock.team };
  });

// 4. Write back, tagged as mock so the repair scrape overwrites it.
const { error: upErr } = await admin
  .from('draft_boards_admin')
  .update({ picks: newPicks, source: 'mock_test', fetched_at: new Date().toISOString() })
  .eq('draft_id', board.draft_id);
if (upErr) { console.error(`update failed: ${upErr.message}`); process.exit(1); }

console.log(`Seeded ${newPicks.length} picks (source=mock_test).`);
console.log('Sample row 1:', JSON.stringify(newPicks.slice(0, 3)));
console.log(`\nReview: open /rosters, find the roster for draft ${board.draft_id}`);
console.log(`(${entry.tournament}, drafted ${entry.draft_date}) and click "Board".`);
