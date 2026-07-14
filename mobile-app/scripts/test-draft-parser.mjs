// test-draft-parser.mjs — Node regression test for the live-session parse engine
// against the real OCR capture from a 2026-07-13 Underdog slow draft.
// Also smokes the esbuild JSC bundle the broadcast extension runs.
// Run from mobile-app/:  npm run test:draft

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { buildPool, matchPlayer } from '../src/draft/playerMatcher.js';
import { parseUnderdogScreen, textToItems } from '../src/draft/underdogParser.js';
import { createDraftSession } from '../src/draft/sessionEngine.js';
import {
  PLAYERS_TAB, BOARD_TAB_1, BOARD_TAB_2, QUEUE_TAB,
} from '../src/draft/__fixtures__/underdogOcrFixture.js';

// Synthetic pool mirroring the fixture draft's slate (name, pos, team, adp).
const POOL_ROWS = [
  ['Jahmyr Gibbs', 'RB', 'DET', 1.5],
  ['Jaxon Smith-Njigba', 'WR', 'SEA', 2.0],
  ['Bijan Robinson', 'RB', 'ATL', 2.8],
  ["Ja'Marr Chase", 'WR', 'CIN', 4.0],
  ['Saquon Barkley', 'RB', 'PHI', 5.2],
  ['Puka Nacua', 'WR', 'LAR', 6.1],
  ['Amon-Ra St. Brown', 'WR', 'DET', 7.9],
  ['Jonathan Taylor', 'RB', 'IND', 9.1],
  ['Justin Jefferson', 'WR', 'MIN', 10.2],
  ['CeeDee Lamb', 'WR', 'DAL', 10.8],
  ['Brock Bowers', 'TE', 'LV', 12.0],
  ['Ashton Jeanty', 'RB', 'LV', 14.2],
  ['Omarion Hampton', 'RB', 'LAC', 15.0],
  ['Chase Brown', 'RB', 'CIN', 16.0],
  ["De'Von Achane", 'RB', 'MIA', 16.5],
  ['A.J. Brown', 'WR', 'NE', 20.7],
  ['Drake London', 'WR', 'ATL', 21.9],
  ['Nico Collins', 'WR', 'HOU', 22.8],
  ['Rashee Rice', 'WR', 'KC', 23.5],
  ['Trey McBride', 'TE', 'ARI', 24.9],
  ['George Pickens', 'WR', 'DAL', 26.0],
  ['Zay Flowers', 'WR', 'BAL', 27.1],
  ['Breece Hall', 'RB', 'NYJ', 27.8],
  ['Chris Olave', 'WR', 'NO', 29.5],
  ['Kyren Williams', 'RB', 'LAR', 31.2],
  ['Tee Higgins', 'WR', 'CIN', 32.8],
  ['Josh Allen', 'QB', 'BUF', 34.6],
  ['Emeka Egbuka', 'WR', 'TB', 34.9],
  ['Ladd McConkey', 'WR', 'LAC', 35.0],
  ['Javonte Williams', 'RB', 'DAL', 36.3],
  ['Malik Nabers', 'WR', 'NYG', 38.6],
  ['Tetairoa McMillan', 'WR', 'CAR', 38.7],
].map(([name, position, team, adp]) => ({ name, position, team, adp }));

const pool = buildPool(POOL_ROWS);

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok  ${label}`);
  } else {
    failures++;
    console.error(`FAIL  ${label}\n      expected ${e}\n      got      ${a}`);
  }
}

// ---- matcher unit checks (fixture-observed OCR garbles) ----
console.log('playerMatcher:');
check('exact', matchPlayer(pool, 'Chris Olave')?.player.name, 'Chris Olave');
check('OCR-mangled first name', matchPlayer(pool, 'Je Von Achane', { position: ':B', team: 'MIA' })?.player.name, "De'Von Achane");
check('lowercase St.', matchPlayer(pool, 'Amon-Ra st. Brown')?.player.name, 'Amon-Ra St. Brown');
check('truncated name prefix', matchPlayer(pool, 'Ja’Marr Ch…')?.player.name ?? matchPlayer(pool, "Ja'Marr Ch…")?.player.name, "Ja'Marr Chase");
check('initial form', matchPlayer(pool, 'J. Jefferson')?.player.name, 'Justin Jefferson');
check('garbage rejected', matchPlayer(pool, 'Queue'), null);
check('username rejected by shape', matchPlayer(pool, 'BIRDENTHUSIAST')?.player ?? null, null);

// ---- per-screen parse checks ----
console.log('underdogParser:');
const ctx = { pool, teams: 12 };
const players = parseUnderdogScreen(textToItems(PLAYERS_TAB), ctx);
check('players: kind', players.kind, 'players');
check('players: picksUntil', players.picksUntil, 2);
check('players: upcoming overalls', [...players.upcomingOveralls].sort((x, y) => x - y), [32, 33, 34]);
check('players: rows matched', players.rows.length, 9);
check('players: first row', players.rows[0]?.player.name, 'Chris Olave');
check('players: row team hint', players.rows[1]?.team, 'LAR');
check('players: availability top ADP', players.availability?.topVisibleAdp, 29.5);
check('players: divider', players.picksAwayDivider, 2);

const board1 = parseUnderdogScreen(textToItems(BOARD_TAB_1), ctx);
check('board1: kind', board1.kind, 'board');
check('board1: picks found', board1.boardPicks.length, 12);
check('board1: pick 1 overall', board1.boardPicks.find(p => p.player.name === 'Jahmyr Gibbs')?.overall, 1);
check('board1: snake overall for 2.12', board1.boardPicks.find(p => p.player.name === 'Rashee Rice')?.overall, 24);
check('board1: A.J. Brown matched', board1.boardPicks.find(p => p.overall === 21)?.player.name, 'A.J. Brown');
check('board1: single-line name', board1.boardPicks.find(p => p.overall === 26)?.player.name, 'George Pickens');

const board2 = parseUnderdogScreen(textToItems(BOARD_TAB_2), ctx);
check('board2: kind', board2.kind, 'board');
check('board2: picks found', board2.boardPicks.length, 8);
check('board2: garbled pos/name (2.5)', board2.boardPicks.find(p => p.overall === 17)?.player.name, "De'Von Achane");
check('board2: garbled WR (1.8)', board2.boardPicks.find(p => p.overall === 8)?.player.name, 'Amon-Ra St. Brown');
check('board2: dropped-dot card "310 | 34"', board2.upcomingOveralls.includes(34), true);

const queue = parseUnderdogScreen(textToItems(QUEUE_TAB), ctx);
check('queue: kind', queue.kind, 'queue');
check('queue: names', queue.queueNames, ['chris olave']);
check('queue: clock 59:50', queue.clockSeconds, 3590);

// ---- full session across all four screens ----
console.log('sessionEngine:');
const session = createDraftSession({
  pool, teams: 12, rounds: 18,
  exposureMap: new Map([['ladd mcconkey', 30]]),
});
session.ingest(board1);
session.ingest(board2);
session.ingest(players);
session.ingest(queue);

const status = session.getStatus();
check('slot inferred', status.slot, 9);
check('current pick', status.currentPick, 31);
check('round', status.round, 3);
check('picks until', status.picksUntil, 2);
check('my next pick', status.myNextPick, 33);
check('ledger size', status.ledgerSize, 20);
check('my picks reconstructed', status.myPicks.map(p => `${p.round}:${p.name}`), ['1:Jonathan Taylor', '2:Chase Brown']);

const ds = session.getDraftState();
check('DraftState currentPick', ds.currentPick, 31);
check('DraftState slot', ds.draftSlot, 9);
check('DraftState myPicks', ds.myPicks.map(p => p.name), ['Jonathan Taylor', 'Chase Brown']);
const availNames = ds.availablePlayers.map(p => p.name);
check('drafted not available', availNames.includes('Jahmyr Gibbs'), false);
check('availability inference (Barkley gone, unseen)', availNames.includes('Saquon Barkley'), false);
check('availability inference (Nacua gone, unseen)', availNames.includes('Puka Nacua'), false);
// TE never appeared in a Players-tab row, so the engine conservatively keeps
// Bowers available — a Board screenshot covering his pick would remove him.
check('conservative for unseen positions', availNames[0], 'Brock Bowers');
check('Olave still available', availNames.includes('Chris Olave'), true);

const glance = session.getGlance();
check('glance phase', glance.phase, 'tracking');
check('glance headline', glance.headline, 'Up in 2 picks');
check('glance pick context', [glance.currentPick, glance.round, glance.myNextPick], [31, 3, 33]);
check('glance roster bar', glance.rosterBar, 'QB 0 · RB 2 · WR 0 · TE 0');
check('glance targets count', glance.targets.length, 3);
check('glance queue-risk flag', glance.targets.some(t => t.includes('Chris Olave') && t.includes('QUEUE RISK')), true);

// On-the-clock phase: simulate the board reaching the user's pick.
const session2 = createDraftSession({ pool, teams: 12, rounds: 18, slot: 9 });
session2.ingest(players);
session2.ingest({ ...players, picksUntil: 0, onClock: true, upcomingOveralls: [34, 35], availability: null, rows: [], boardPicks: [], queueNames: [], stats: players.stats, kind: 'header', picksAwayDivider: null, clockSeconds: null });
check('onClock phase', session2.getGlance().phase, 'onClock');
check('onClock headline', session2.getGlance().headline, "You're on the clock!");

// ---- serialize -> hydrate round-trip (extension <-> app handoff) ----
console.log('serialize/hydrate:');
const snapshotData = session.serialize();
const restored = createDraftSession({ pool, teams: 12, rounds: 18 });
check('hydrate accepts snapshot', restored.hydrate(snapshotData), true);
check('hydrated slot', restored.getStatus().slot, 9);
check('hydrated current pick', restored.getStatus().currentPick, 31);
check('hydrated ledger', restored.getStatus().ledgerSize, 20);
check('hydrated my picks', restored.getStatus().myPicks.map(p => p.name), ['Jonathan Taylor', 'Chase Brown']);
check('hydrated glance headline', restored.getGlance().headline, 'Up in 2 picks');

// ---- JSC bundle smoke test (what the broadcast extension actually runs) ----
console.log('extension engine bundle:');
const bundlePath = path.join(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  'targets/draft-broadcast/assets/engine.js'
);
if (!existsSync(bundlePath)) {
  failures++;
  console.error('FAIL  bundle missing — run: npm run build:engine');
} else {
  // Bare context like JavaScriptCore: no console, no Node globals.
  const context = vm.createContext({});
  vm.runInContext(readFileSync(bundlePath, 'utf8'), context, { filename: 'engine.js' });
  const engineCfg = JSON.stringify({
    poolRows: POOL_ROWS, teams: 12, rounds: 18, slot: null,
    exposureMap: { 'ladd mcconkey': 30 },
  });
  const initRes = vm.runInContext(
    `BBEEngine.init(${JSON.stringify(engineCfg)})`, context
  );
  check('bundle init', initRes, 'ok');
  let last = null;
  for (const screen of [BOARD_TAB_1, BOARD_TAB_2, PLAYERS_TAB, QUEUE_TAB]) {
    const itemsJson = JSON.stringify(screen.split('\n').map(s => s.trim()).filter(Boolean));
    const raw = vm.runInContext(
      `BBEEngine.ingest(${JSON.stringify(itemsJson)})`, context
    );
    last = JSON.parse(raw);
  }
  check('bundle ingest ok', last.ok, true);
  check('bundle glance matches direct engine', {
    phase: last.glance.phase,
    headline: last.glance.headline,
    currentPick: last.glance.currentPick,
    myNextPick: last.glance.myNextPick,
    rosterBar: last.glance.rosterBar,
  }, {
    phase: 'tracking',
    headline: 'Up in 2 picks',
    currentPick: 31,
    myNextPick: 33,
    rosterBar: 'QB 0 · RB 2 · WR 0 · TE 0',
  });
  check('bundle state hydrates in app', createDraftSession({ pool, teams: 12, rounds: 18 }).hydrate(last.state), true);
  check('bundle reports slot', last.status.slot, 9);
  // Non-UD screens (any other app on the broadcast) must be inert.
  const noise = JSON.stringify(JSON.stringify(['Messages', 'Hey what time is the party', 'Sent']));
  const noiseRes = JSON.parse(vm.runInContext(`BBEEngine.ingest(${noise})`, context));
  check('non-draft screen is inert', [noiseRes.ok, noiseRes.kind, noiseRes.changed], [true, 'unknown', false]);
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
