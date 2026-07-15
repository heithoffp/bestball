// test-draft-parser.mjs — Node regression test for the live-session parse engine
// against the real OCR capture from a 2026-07-13 Underdog slow draft.
// Also smokes the esbuild JSC bundle the broadcast extension runs.
// Run from mobile-app/:  npm run test:draft

import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
  SELF_ACTIVITY_OVERLAY, SELF_OVERLAY_WITH_LIST, PURE_SELF_OVERLAY,
  PLAYERS_JAVONTE_VISIBLE, ROSTER_PANEL,
  UD_HOME_SCREEN, SELF_OVERLAY_GARBLED_HOME, SLOW_PLAYERS_LASTPICK_CARDS,
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
// The Players window spans QB/RB/WR (3 positions) — a provably unfiltered
// list, so the inference covers positions with no visible row too. This is
// the mid-draft-resume fix (TASK-329 scope item): Bowers (TE, ADP 12) must
// not surface as a top target when the list top is at ADP 29.5.
check('unfiltered list infers unseen positions too', availNames.includes('Brock Bowers'), false);
check('top available matches visible list top', availNames[0], 'Chris Olave');
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

// Self-capture: the overlay region of our expanded Live Activity is excised
// (TASK-329); the real content beneath it still parses. This fixture's
// below-overlay content has no matchable rows, so it classifies 'header'
// (a valid drafter-card label survives) — the key is that none of the
// overlay's own output (headline, targets, roster bar) is ingested.
const selfObs = parseUnderdogScreen(textToItems(SELF_ACTIVITY_OVERLAY), ctx);
check('self overlay excised, remainder classified', selfObs.kind, 'header');
check('self overlay headline not read as ticker', selfObs.picksUntil, null);
check('self overlay targets not read as rows', selfObs.rows.length, 0);
const selfSession = createDraftSession({ pool, teams: 12, rounds: 18, username: 'BIRDENTHUSIAST' });
selfSession.ingest(selfObs);
check('self overlay mutates nothing load-bearing', [
  selfSession.getStatus().currentPick,
  selfSession.getStatus().anchoredSlot,
], [1, null]);
// ...and must not resurrect players marked gone (its target rows are ours).
const resSession = createDraftSession({ pool, teams: 12, rounds: 18 });
resSession.ingest(parseUnderdogScreen(textToItems(PLAYERS_TAB), ctx)); // marks ADP<29.5 gone
const goneBefore = !resSession.getDraftState().availablePlayers.some(p => p.name === 'Saquon Barkley');
resSession.ingest(parseUnderdogScreen(textToItems(SELF_ACTIVITY_OVERLAY), ctx));
const goneAfter = !resSession.getDraftState().availablePlayers.some(p => p.name === 'Saquon Barkley');
check('self overlay does not resurrect drafted players', [goneBefore, goneAfter], [true, true]);
check('self overlay target (Pickens) stays gone',
  resSession.getDraftState().availablePlayers.some(p => p.name === 'George Pickens'), false);

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

// ---- TASK-329: overlay excision + window-based availability ----
console.log('overlay excision + window inference (TASK-329):');

// Expanded Live Activity over the Players tab (IMG_2805 / fastdraft.txt): the
// overlay covers the header, but the list + "2 picks away" divider survive.
const ovObs = parseUnderdogScreen(textToItems(SELF_OVERLAY_WITH_LIST), ctx);
check('overlay+list: kind', ovObs.kind, 'players');
check('overlay+list: stale glance headline not read as ticker', ovObs.picksUntil, null);
check('overlay+list: divider read under the overlay', ovObs.picksAwayDivider, 2);
check('overlay+list: rows matched', ovObs.rows.length, 7);
check('overlay+list: overlay target never becomes a row',
  ovObs.rows.some(r => r.player.name === 'Zay Flowers'), false);
check('overlay+list: window edges',
  [ovObs.availability?.topVisibleAdp, ovObs.availability?.bottomVisibleAdp], [29.5, 38.6]);

// Overlay with nothing usable beneath it still classifies 'self' and is inert.
const pureSelf = parseUnderdogScreen(textToItems(PURE_SELF_OVERLAY), ctx);
check('pure overlay still self', pureSelf.kind, 'self');

// On-device garble (debug 2026-07-15): the roster-bar separator OCR'd as "-".
// Headline + garbled roster bar = two weak kinds -> still detected as self.
check('garbled roster-bar separator still a self signal',
  parseUnderdogScreen(['Up in 16 picks', 'QB 1 - RB 2 • WR 3 • TE 0'], ctx).kind, 'self');

// The stuck-at-11 scenario: anchored slot, then the overlay frame — the
// divider must ratchet the countdown even with the header covered.
const ovSession = createDraftSession({ pool, teams: 12, rounds: 18, username: 'BIRDENTHUSIAST' });
ovSession.ingest(parseUnderdogScreen(textToItems(FAST_LOBBY_FULL), ctx)); // anchors slot 7
ovSession.ingest(ovObs);
check('divider ratchets position under the overlay',
  [ovSession.getStatus().picksUntil, ovSession.getStatus().currentPick], [2, 5]);
check('glance recovers instead of freezing', ovSession.getGlance().headline, 'Up in 2 picks');

// Window pass: Javonte Williams (ADP 36.3) is inside the visible 29.5–38.6
// window but not visible -> inferred gone; edge/visible players untouched.
check('window pass marks mid-window player gone',
  ovSession.getDraftState().availablePlayers.some(p => p.name === 'Javonte Williams'), false);
check('window pass spares visible + edge players',
  ['Chris Olave', 'Malik Nabers', 'Tetairoa McMillan']
    .every(n => ovSession.getDraftState().availablePlayers.some(p => p.name === n)), true);
check('mid-window player excluded from glance target pool',
  ovSession.getGlance().targets.some(t => t.includes('Javonte Williams')), false);

// Self-heal: a later frame showing him visible clears the stale mark.
ovSession.ingest(parseUnderdogScreen(textToItems(PLAYERS_JAVONTE_VISIBLE), ctx));
check('stale window mark self-heals on visibility',
  ovSession.getDraftState().availablePlayers.some(p => p.name === 'Javonte Williams'), true);

// Drafter-card roster panel (debug3.txt): rows are drafted players — must
// classify 'roster', never feed availability, never clear inferred-gone.
const rosterObs = parseUnderdogScreen(textToItems(ROSTER_PANEL), ctx);
check('roster panel: kind', rosterObs.kind, 'roster');
check('roster panel: no availability', rosterObs.availability, null);
const rosterSession = createDraftSession({ pool, teams: 12, rounds: 18 });
rosterSession.ingest(parseUnderdogScreen(textToItems(PLAYERS_TAB), ctx)); // marks ADP<29.5 gone
check('setup: Barkley inferred gone',
  rosterSession.getDraftState().availablePlayers.some(p => p.name === 'Saquon Barkley'), false);
rosterSession.ingest(parseUnderdogScreen(textToItems(ROSTER_PANEL), ctx)); // lists Barkley as a PICK
check('roster panel does not resurrect drafted players',
  rosterSession.getDraftState().availablePlayers.some(p => p.name === 'Saquon Barkley'), false);

// Boxed (live Vision path): excision is geometric — everything at or above
// the lowest overlay signal is dropped, the list below parses.
const mkRow = (name, pr, tb, y) => ([
  { text: name, x: 0.10, y, w: 0.18, h: 0.02 },
  { text: pr, x: 0.10, y: y + 0.025, w: 0.05, h: 0.015 },
  { text: tb, x: 0.17, y: y + 0.025, w: 0.10, h: 0.015 },
]);
const BOXED_OVERLAY_LIST = [
  { text: 'Up in 11 picks', x: 0.30, y: 0.05, w: 0.30, h: 0.02 },
  { text: 'synced 12 sec ago', x: 0.30, y: 0.08, w: 0.22, h: 0.015 },
  { text: 'RB · Zay Flowers · FALLING', x: 0.20, y: 0.11, w: 0.45, h: 0.02 },
  { text: 'QB 1 · RB 3 · WR 2 · TE 0', x: 0.25, y: 0.15, w: 0.45, h: 0.02 },
  { text: 'Players', x: 0.08, y: 0.26, w: 0.10, h: 0.02 },
  { text: 'Queue', x: 0.40, y: 0.26, w: 0.08, h: 0.02 },
  { text: 'Board', x: 0.70, y: 0.26, w: 0.08, h: 0.02 },
  ...mkRow('Chris Olave', 'WR13', 'NO, Bye 8', 0.32),
  ...mkRow('Kyren Williams', 'RB15', 'LAR, Bye 6', 0.38),
  ...mkRow('Tee Higgins', 'WR14', 'CIN, Bye 6', 0.44),
  ...mkRow('Josh Allen', 'QB1', 'BUF, Bye 7', 0.50),
  ...mkRow('Emeka Egbuka', 'WR15', 'TB, Bye 9', 0.56),
  ...mkRow('Ladd McConkey', 'WR16', 'LAC, Bye 5', 0.62),
  { text: '2 picks away', x: 0.35, y: 0.68, w: 0.30, h: 0.015 },
  ...mkRow('Malik Nabers', 'WR17', 'NYG, Bye 11', 0.72),
];
const boxedOv = parseUnderdogScreen(BOXED_OVERLAY_LIST, ctx);
check('boxed overlay: kind', boxedOv.kind, 'players');
check('boxed overlay: headline excised, divider read',
  [boxedOv.picksUntil, boxedOv.picksAwayDivider], [null, 2]);
check('boxed overlay: rows', boxedOv.rows.length, 7);
check('boxed overlay: window bottom', boxedOv.availability?.bottomVisibleAdp, 38.6);

// ---- TASK-329 slow-draft regressions (frames-1784120786, 2026-07-15) ----
console.log('slow-draft frame-recording regressions (TASK-329):');

// UD home screen: the tagline "Your players. Your picks." must not read as
// an on-the-clock header (it flashed "You're on the clock!" at P1 on device).
const homeObs = parseUnderdogScreen(textToItems(UD_HOME_SCREEN), ctx);
check('UD home screen inert', [homeObs.kind, homeObs.onClock, homeObs.picksUntil],
  ['unknown', false, null]);
// ...while the real singular header still works.
check('real "Your pick" header still detected',
  parseUnderdogScreen(['Your pick: 0:15'], ctx).onClock, true);

// Garbled overlay over the home screen: excision must still cover the whole
// overlay (garbled roster bar + truncated headline are self signals), so our
// own target rows never parse as visible players.
const garbledOv = parseUnderdogScreen(textToItems(SELF_OVERLAY_GARBLED_HOME), ctx);
check('garbled overlay: no rows from our own targets', garbledOv.rows.length, 0);
check('garbled overlay: no header signals', [garbledOv.onClock, garbledOv.picksUntil], [false, null]);
const garbledSession = createDraftSession({ pool, teams: 12, rounds: 18 });
garbledSession.ingest(parseUnderdogScreen(textToItems(PLAYERS_TAB), ctx)); // marks ADP<29.5 gone
garbledSession.ingest(garbledOv);
check('garbled overlay does not resurrect drafted players',
  ['Jahmyr Gibbs', 'Bijan Robinson', "Ja'Marr Chase"]
    .some(n => garbledSession.getDraftState().availablePlayers.some(p => p.name === n)), false);

// Slow-draft carousel: completed cards list their LAST pick as "F. Surname" —
// those must not become Players rows or count as visible in the window.
const slowObs = parseUnderdogScreen(textToItems(SLOW_PLAYERS_LASTPICK_CARDS), ctx);
check('slow players: kind', slowObs.kind, 'players');
check('slow players: abbreviated card names never become rows',
  slowObs.rows.some(r => r.player.name === 'Trey McBride' || r.player.name === 'George Pickens'), false);
check('slow players: rows are the real list', slowObs.rows[0]?.player.name, 'Chris Olave');
check('slow players: card names not "visible" for availability',
  (slowObs.availability?.visibleCanonicals || []).some(c => c === 'trey mcbride' || c === 'george pickens'),
  false);
const slowSession = createDraftSession({ pool, teams: 12, rounds: 18 });
slowSession.ingest(parseUnderdogScreen(textToItems(PLAYERS_TAB), ctx)); // marks ADP<29.5 gone
slowSession.ingest(slowObs);
check('just-drafted players stay gone despite card names',
  ['Trey McBride', 'George Pickens']
    .some(n => slowSession.getDraftState().availablePlayers.some(p => p.name === n)), false);
check('targets converge to the visible list top',
  slowSession.getGlance().targets.some(t => t.includes('McBride') || t.includes('Pickens')), false);

// ---- TASK-331: replay harness parity ----
// Replaying a recorded frames JSONL through scripts/replay-frames.mjs must
// produce the same final state as ingesting the screens directly (identical
// engine modules — parity is the point of the recorder).
console.log('replay harness (TASK-331):');
{
  const dir = mkdtempSync(path.join(tmpdir(), 'bbe-replay-'));
  const poolCsv = ['name,position,team,adp',
    ...POOL_ROWS.map(r => `${r.name},${r.position},${r.team},${r.adp}`)].join('\n');
  const framesJsonl = FAST_DRAFT_SEQUENCE
    .map((screen, i) => JSON.stringify({ t: 1000 + i, items: textToItems(screen) }))
    .join('\n');
  const poolPath = path.join(dir, 'pool.csv');
  const framesPath = path.join(dir, 'frames.jsonl');
  writeFileSync(poolPath, poolCsv);
  writeFileSync(framesPath, framesJsonl);
  const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'replay-frames.mjs');
  const out = execFileSync(process.execPath, [scriptPath, framesPath, '--pool', poolPath, '--quiet'],
    { encoding: 'utf8' });
  const statusJson = out.split('---- final status ----')[1]?.split('---- glance ----')[0];
  const replayed = JSON.parse(statusJson);
  const direct = createDraftSession({ pool, teams: 12, rounds: 18 });
  for (const screen of FAST_DRAFT_SEQUENCE) {
    direct.ingest(parseUnderdogScreen(textToItems(screen), { pool, teams: 12 }));
  }
  const d = direct.getStatus();
  check('replay matches direct ingestion', {
    slot: replayed.slot, currentPick: replayed.currentPick, picksUntil: replayed.picksUntil,
    ledgerSize: replayed.ledgerSize, myPicks: replayed.myPicks,
  }, {
    slot: d.slot, currentPick: d.currentPick, picksUntil: d.picksUntil,
    ledgerSize: d.ledgerSize, myPicks: d.myPicks.map(p => `${p.round}:${p.name}`),
  });
  check('replay learned the username', replayed.learnedUsername, 'BIRDENTHUSIAST');
}

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
  check('bundle reports engine version', last.engine, 'task329.4');
  // ADR-023 self-describing identity — the fields FrameProcessor's sanity-eval
  // reads off globalThis.BBEEngine to gate the App Group hot-load.
  check('bundle exposes version identity', vm.runInContext('BBEEngine.version', context), 'task329.4');
  check('bundle exposes integer build', vm.runInContext('typeof BBEEngine.build', context), 'number');
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

// ---- TASK-333: engineSource.js hot-load bundle sync guard (ADR-023) ----
// The app hands this generated module's ENGINE_SOURCE to the broadcast
// extension through the App Group. It must stay byte-identical to the bundle
// the extension ships, and must self-describe the way FrameProcessor's
// integrity eval expects — a skipped `npm run build:engine` fails here.
console.log('engineSource hot-load bundle (TASK-333):');
{
  const genPath = path.join(
    path.dirname(path.dirname(fileURLToPath(import.meta.url))),
    'src/draft/generated/engineSource.js'
  );
  if (!existsSync(genPath)) {
    failures++;
    console.error('FAIL  engineSource.js missing — run: npm run build:engine');
  } else {
    const gen = await import(pathToFileURL(genPath).href);
    check('engineSource exports version string', typeof gen.ENGINE_VERSION, 'string');
    check('engineSource exports integer build', Number.isInteger(gen.ENGINE_BUILD), true);
    // Byte-identical to the extension bundle (bundlePath from the smoke test).
    check('ENGINE_SOURCE matches assets/engine.js', gen.ENGINE_SOURCE, readFileSync(bundlePath, 'utf8'));
    // The exact integrity gate FrameProcessor runs: eval in a bare context and
    // read the self-declared identity off globalThis.BBEEngine.
    const gctx = vm.createContext({});
    vm.runInContext(gen.ENGINE_SOURCE, gctx, { filename: 'engineSource' });
    check('hot-load source self-describes version', vm.runInContext('BBEEngine.version', gctx), gen.ENGINE_VERSION);
    check('hot-load source self-describes build', vm.runInContext('BBEEngine.build', gctx), gen.ENGINE_BUILD);
  }
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
