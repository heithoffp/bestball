// test-draft-parser.mjs — Node regression test for the live-session parse engine
// against the real OCR capture from a 2026-07-13 Underdog slow draft.
// Also smokes the esbuild JSC bundle the broadcast extension runs.
// Run from mobile-app/:  npm run test:draft

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import {
  buildPool, matchPlayer, usernameMatches, matchAbbrevPlayer,
} from '../src/draft/playerMatcher.js';
import { parseUnderdogScreen, textToItems } from '../src/draft/underdogParser.js';
import { createDraftSession } from '../src/draft/sessionEngine.js';
import {
  PLAYERS_TAB, BOARD_TAB_1, BOARD_TAB_2, QUEUE_TAB,
} from '../src/draft/__fixtures__/underdogOcrFixture.js';
import {
  FAST_LOBBY_EARLY, FAST_LOBBY_FULL, FAST_UP_NEXT, FAST_YOUR_PICK,
  FAST_POST_PICK, FAST_DETAIL_PANEL, FAST_TRUNCATED_CARD, FAST_DRAFT_SEQUENCE,
  SELF_ACTIVITY_OVERLAY,
} from '../src/draft/__fixtures__/underdogFastDraftFixture.js';

// Synthetic pool mirroring the fixture draft's slate (name, pos, team, adp).
const POOL_ROWS = [
  ['Jahmyr Gibbs', 'RB', 'DET', 1.5],
  ['Jaxon Smith-Njigba', 'WR', 'SEA', 2.0],
  ['Bijan Robinson', 'RB', 'ATL', 2.8],
  ["Ja'Marr Chase", 'WR', 'CIN', 4.0],
  ['Saquon Barkley', 'RB', 'PHI', 5.2],
  ['Puka Nacua', 'WR', 'LAR', 6.1],
  ['Christian McCaffrey', 'RB', 'SF', 6.5],
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
// Resume detection: the fixture is a capture of a draft already deep into R3,
// so joining it must register as a mid-draft resume.
check('resume detected (mid-draft capture)', status.isResume, true);
check('picks already made at start (> 1 round)', status.picksAtStart > 12, true);

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

// Fresh draft: a round-1 board must NOT be flagged as a resume.
const freshSession = createDraftSession({ pool, teams: 12, rounds: 18 });
freshSession.ingest({
  kind: 'board',
  boardPicks: [
    { overall: 1, player: { canonical: 'jahmyr gibbs', name: 'Jahmyr Gibbs', position: 'RB', team: 'DET' }, round: 1, pickInRound: 1, score: 1, raw: 'x' },
    { overall: 2, player: { canonical: 'jaxon smith-njigba', name: 'Jaxon Smith-Njigba', position: 'WR', team: 'SEA' }, round: 1, pickInRound: 2, score: 1, raw: 'y' },
  ],
  rows: [], upcomingOveralls: [], availability: null, queueNames: [],
  picksUntil: null, picksAwayDivider: null, clockSeconds: null,
});
check('fresh draft not flagged as resume', freshSession.getStatus().isResume, false);
check('fresh draft picksAtStart', freshSession.getStatus().picksAtStart, 2);

// On-the-clock phase: simulate the board reaching the user's pick.
const session2 = createDraftSession({ pool, teams: 12, rounds: 18, slot: 9 });
session2.ingest(players);
session2.ingest({ ...players, picksUntil: 0, onClock: true, upcomingOveralls: [34, 35], availability: null, rows: [], boardPicks: [], queueNames: [], stats: players.stats, kind: 'header', picksAwayDivider: null, clockSeconds: null });
check('onClock phase', session2.getGlance().phase, 'onClock');
check('onClock headline', session2.getGlance().headline, "You're on the clock!");

// ---- TASK-328: usernames + abbreviated confirmation-card names ----
console.log('usernames & abbreviated names (TASK-328):');
check('usernameMatches exact (case-insensitive)', usernameMatches('BIRDENTHUSIAST', 'birdenthusiast'), true);
check('usernameMatches 1-char OCR garble', usernameMatches('BIRDENTHUSIAST', 'BIRDENTHUS1AST'), true);
check('usernameMatches rejects truncation', usernameMatches('BIRDENTHUSIAST', 'BIRD'), false);
check('usernameMatches rejects other user', usernameMatches('BIRDENTHUSIAST', 'NORFHEAD'), false);
check('abbrev name + team', matchAbbrevPlayer(pool, 'J. Taylor', 'IND')?.player.name, 'Jonathan Taylor');
check('abbrev multi-token surname', matchAbbrevPlayer(pool, 'A. St. Brown', 'DET')?.player.name, 'Amon-Ra St. Brown');
check('abbrev truncated surname', matchAbbrevPlayer(pool, 'J. Smith-Nji', 'SEA')?.player.name, 'Jaxon Smith-Njigba');
check('abbrev garbage rejected', matchAbbrevPlayer(pool, 'Q. Zzyzx', 'AAA'), null);

// ---- TASK-328: fast-draft screen parsing ----
console.log('fast-draft parser (TASK-328):');
const lobbyEarly = parseUnderdogScreen(textToItems(FAST_LOBBY_EARLY), ctx);
check('lobby flag', lobbyEarly.lobby, true);
check('lobby usernames (only named card)', lobbyEarly.lobbyUsernames, ['BIRDENTHUSIAST']);
check('lobby filled placeholders', lobbyEarly.filledCount, 3);

const lobbyFull = parseUnderdogScreen(textToItems(FAST_LOBBY_FULL), ctx);
check('drafter cards extracted', lobbyFull.drafterCards.map(c => c.username),
  ['ABLEVINS', 'FREDZ238', 'BIRDENTHUSIAST', 'NORFHEAD']);
check('card next overall', lobbyFull.drafterCards.find(c => c.username === 'BIRDENTHUSIAST')?.nextOverall, 7);
check('card tally with O-for-0 garble', lobbyFull.drafterCards.find(c => c.username === 'NORFHEAD')?.tally,
  { QB: 0, RB: 0, WR: 0, TE: 0 });

const yourPick = parseUnderdogScreen(textToItems(FAST_YOUR_PICK), ctx);
check('your-pick header onClock', [yourPick.onClock, yourPick.picksUntil], [true, 0]);
check('your-pick inline clock', yourPick.clockSeconds, 15);
check('your-pick on-clock card is the user', yourPick.drafterCards.find(c => c.onClock)?.username, 'BIRDENTHUSIAST');

const postPick = parseUnderdogScreen(textToItems(FAST_POST_PICK), ctx);
check('confirmation card (one line)', [postPick.confirmCard?.team, postPick.confirmCard?.nameRaw], ['IND', 'J. Taylor']);
check('confirmation card (two lines)',
  parseUnderdogScreen(['UP IN 9 PICKS', 'ATL', 'D. London'], ctx).confirmCard?.nameRaw, 'D. London');

// Windows-OCR-observed garbles: pipe merged into the digits, or label split
// across two fragments (see docs/task-328-evidence).
check('card label pipe-merged "1.717"',
  parseUnderdogScreen(['UP NEXT', 'BIRDENTHUSIAST', '1.717'], ctx).drafterCards[0]?.nextOverall, 7);
check('card label pipe-merged "3.6130"',
  parseUnderdogScreen(['UP IN 3 PICKS', 'FREDZ238', '3.6130'], ctx).drafterCards[0]?.nextOverall, 30);
check('card label split "2.7" / "19"',
  parseUnderdogScreen(['UP NEXT', 'FREDZ238', '2.7', '19'], ctx).drafterCards[0]?.nextOverall, 19);
check('ADP decimal never recovers as a card',
  parseUnderdogScreen(['UP NEXT', 'FREDZ238', '29.5'], ctx).drafterCards.length, 0);

const detail = parseUnderdogScreen(textToItems(FAST_DETAIL_PANEL), ctx);
check('detail panel kind', detail.kind, 'detail');
check('detail panel never feeds availability', detail.availability, null);

// ---- TASK-328: fast-draft session (slot anchoring, event ledger) ----
console.log('fast-draft session (TASK-328):');
const fast = createDraftSession({ pool, teams: 12, rounds: 18 });
const fastSummaries = FAST_DRAFT_SEQUENCE.map(s => fast.ingest(parseUnderdogScreen(textToItems(s), ctx)));
const fs = fast.getStatus();
check('username auto-learned from lobby', fs.learnedUsername, 'BIRDENTHUSIAST');
check('slot anchored from own card', [fs.slot, fs.slotSource, fs.anchoredSlot], [7, 'anchored', 7]);
check('current pick tracked through fast picks', fs.currentPick, 9);
check('my pick captured without Board tab', fs.myPicks.map(p => p.name), ['Jonathan Taylor']);
check('opponent pick captured from confirm card', fs.ledgerSize, 2);
check('picksUntil survives ticker dropout', fs.picksUntil, 9);
check('my next pick via snake math', fs.myNextPick, 18);
check('myPickEvent fired on your-pick exit', fastSummaries[4].myPickEvent, true);
check('confirm pick attributed', fastSummaries[4].confirmPick, 'Jonathan Taylor');
check('lobby capture is not a resume', fs.isResume, false);
check('user tally harvested from card', fs.opponentTallies.BIRDENTHUSIAST, { QB: 0, RB: 1, WR: 0, TE: 0 });
check('fast glance roster bar', fast.getGlance().rosterBar, 'QB 0 · RB 1 · WR 0 · TE 0');

// Configured username anchors without ever seeing the lobby.
const fastCfg = createDraftSession({ pool, teams: 12, rounds: 18, username: 'birdenthusiast' });
fastCfg.ingest(parseUnderdogScreen(textToItems(FAST_UP_NEXT), ctx));
check('configured username anchors mid-draft',
  [fastCfg.getStatus().anchoredSlot, fastCfg.getStatus().currentPick], [7, 6]);

// Manual slot in conflict with the username anchor surfaces, manual wins.
const fastManual = createDraftSession({ pool, teams: 12, rounds: 18, slot: 3, username: 'BIRDENTHUSIAST' });
fastManual.ingest(parseUnderdogScreen(textToItems(FAST_LOBBY_FULL), ctx));
check('manual slot beats anchor but flags conflict',
  [fastManual.getStatus().slot, fastManual.getStatus().slotConflict, fastManual.getStatus().anchoredSlot],
  [3, true, 7]);

// Edge-truncated username fragment must never pin the slot.
const fastTrunc = createDraftSession({ pool, teams: 12, rounds: 18, username: 'BIRDENTHUSIAST' });
fastTrunc.ingest(parseUnderdogScreen(textToItems(FAST_TRUNCATED_CARD), ctx));
check('truncated card fragment never anchors', fastTrunc.getStatus().anchoredSlot, null);

// v2 snapshot round-trip carries the anchor + learned username.
const fastRestored = createDraftSession({ pool, teams: 12, rounds: 18 });
check('v2 hydrate accepted', fastRestored.hydrate(fast.serialize()), true);
check('v2 hydrated anchor + username',
  [fastRestored.getStatus().slot, fastRestored.getStatus().slotSource, fastRestored.getStatus().learnedUsername],
  [7, 'anchored', 'BIRDENTHUSIAST']);
check('v2 hydrated my picks', fastRestored.getStatus().myPicks.map(p => p.name), ['Jonathan Taylor']);

// ---- TASK-328 iteration 2: on-device defect regressions (2026-07-14) ----
console.log('on-device defect regressions (TASK-328 iter 2):');

// Self-capture: our expanded Live Activity over the draft room is inert.
const selfObs = parseUnderdogScreen(textToItems(SELF_ACTIVITY_OVERLAY), ctx);
check('self overlay classified', selfObs.kind, 'self');
const selfSession = createDraftSession({ pool, teams: 12, rounds: 18, username: 'BIRDENTHUSIAST' });
selfSession.ingest(selfObs);
check('self overlay is fully inert', [
  selfSession.getStatus().syncCount,
  selfSession.getStatus().currentPick,
  selfSession.getStatus().anchoredSlot,
], [0, 1, null]);
// ...and must not resurrect players marked gone (its target rows are ours).
const resSession = createDraftSession({ pool, teams: 12, rounds: 18 });
resSession.ingest(parseUnderdogScreen(textToItems(PLAYERS_TAB), ctx)); // marks ADP<29.5 gone
const goneBefore = !resSession.getDraftState().availablePlayers.some(p => p.name === 'Saquon Barkley');
resSession.ingest(parseUnderdogScreen(textToItems(SELF_ACTIVITY_OVERLAY), ctx));
const goneAfter = !resSession.getDraftState().availablePlayers.some(p => p.name === 'Saquon Barkley');
check('self overlay does not resurrect drafted players', [goneBefore, goneAfter], [true, true]);

// Abbreviated-name team tie-break: same surname + initial, hint team must win
// regardless of pool order (on-device: "J. Taylor"/IND matched J.J. Taylor/N/A).
const taylorPoolA = buildPool([
  { name: 'J.J. Taylor', position: 'RB', team: 'N/A', adp: null },
  { name: 'Jonathan Taylor', position: 'RB', team: 'IND', adp: 9.1 },
]);
const taylorPoolB = buildPool([
  { name: 'Jonathan Taylor', position: 'RB', team: 'IND', adp: 9.1 },
  { name: 'J.J. Taylor', position: 'RB', team: 'N/A', adp: null },
]);
check('abbrev tie-break (dup surname first)', matchAbbrevPlayer(taylorPoolA, 'J. Taylor', 'IND')?.player.name, 'Jonathan Taylor');
check('abbrev tie-break (dup surname last)', matchAbbrevPlayer(taylorPoolB, 'J. Taylor', 'IND')?.player.name, 'Jonathan Taylor');

// Cumulative inferred-gone: a later, smaller scroll window must not clear
// marks made by an earlier, deeper one.
const cumSession = createDraftSession({ pool, teams: 12, rounds: 18 });
cumSession.ingest(parseUnderdogScreen(textToItems(PLAYERS_TAB), ctx)); // top ADP 29.5 -> Barkley gone
cumSession.ingest({
  kind: 'players', boardPicks: [], rows: [], upcomingOveralls: [], queueNames: [],
  picksUntil: 2, picksAwayDivider: null, clockSeconds: null, onClock: false,
  drafterCards: [], confirmCard: null, lobby: false, filledCount: 0, detailPanel: false,
  availability: { topVisibleAdp: 5.0, positionsSeen: ['RB'], visibleCanonicals: ['jahmyr gibbs'] },
  stats: { lines: 0, matchedRows: 0, boardMatches: 0, unmatchedNames: [] },
});
check('inferred-gone accumulates across scroll windows',
  cumSession.getDraftState().availablePlayers.some(p => p.name === 'Saquon Barkley'), false);

// Boxed board cells: the y-sort interleaves side-by-side columns, so name
// association must be geometric. Reproduces the on-device 2026-07-14 failure
// ("Jonathan / Taylor / RB - IND (1.9)" recorded as a different player because
// the meta line grabbed the neighbor column's fragments).
const BOXED_BOARD = [
  { text: 'UP IN 3 PICKS', x: 0.35, y: 0.08, w: 0.30 },
  { text: 'SEANJDUNN', x: 0.05, y: 0.14, w: 0.11 },
  { text: '1hr', x: 0.07, y: 0.17, w: 0.04 },
  // Row band 1 — two adjacent columns; y-sort interleaves their fragments.
  { text: '9', x: 0.30, y: 0.300, w: 0.02 },
  { text: '10', x: 0.55, y: 0.301, w: 0.03 },
  { text: 'Jonathan', x: 0.30, y: 0.330, w: 0.10 },
  { text: 'Justin', x: 0.55, y: 0.331, w: 0.08 },
  { text: 'Taylor', x: 0.30, y: 0.360, w: 0.08 },
  { text: 'Jefferson', x: 0.55, y: 0.361, w: 0.11 },
  { text: 'RB - IND (1.9)', x: 0.30, y: 0.390, w: 0.13 },
  { text: 'WR - MIN (1.10)', x: 0.55, y: 0.391, w: 0.14 },
  // Row band 2, snake return.
  { text: '16', x: 0.30, y: 0.470, w: 0.03 },
  { text: '15', x: 0.55, y: 0.471, w: 0.03 },
  { text: 'Chase', x: 0.30, y: 0.500, w: 0.07 },
  { text: 'Omarion', x: 0.55, y: 0.501, w: 0.09 },
  { text: 'Brown', x: 0.30, y: 0.530, w: 0.07 },
  { text: 'Hampton', x: 0.55, y: 0.531, w: 0.10 },
  { text: 'RB - CIN (2.4)', x: 0.30, y: 0.560, w: 0.13 },
  { text: 'RB - LAC (2.3)', x: 0.55, y: 0.561, w: 0.13 },
];
const boxedBoard = parseUnderdogScreen(BOXED_BOARD, ctx);
check('boxed board: kind', boxedBoard.kind, 'board');
check('boxed board: geometric cell association',
  boxedBoard.boardPicks.map(p => `${p.overall}:${p.player.name}`).sort(),
  ['10:Justin Jefferson', '15:Omarion Hampton', '16:Chase Brown', '9:Jonathan Taylor']);

// ---- serialize -> hydrate round-trip (extension <-> app handoff) ----
console.log('serialize/hydrate:');
const snapshotData = session.serialize();
const restored = createDraftSession({ pool, teams: 12, rounds: 18 });
check('hydrate accepts snapshot', restored.hydrate(snapshotData), true);
check('hydrated slot', restored.getStatus().slot, 9);
check('hydrated current pick', restored.getStatus().currentPick, 31);
check('hydrated ledger', restored.getStatus().ledgerSize, 20);
check('hydrated my picks', restored.getStatus().myPicks.map(p => p.name), ['Jonathan Taylor', 'Chase Brown']);
check('hydrated resume flag', restored.getStatus().isResume, true);
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
  check('bundle reports engine version', last.engine, 'task328.3');
  check('bundle carries diag ring buffer', Array.isArray(last.diag) && last.diag.length > 0, true);
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
