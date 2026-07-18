// test-dk-draft-replay.mjs — replay the recorded DraftKings slow-draft session
// (TASK-350) and assert its ground truth against the DK parser + engine.
//
// Corpus: docs/draftkings_debug/frames-1784385816.jsonl — a live-capture
// recording (2026-07-18) of a 12-team DK slow draft mid-session:
// iOS Spotlight search (frames 0–3) → DK Rosters tab (4–5) → Players tab
// (6–7) → expanded BBE Live Activity over the room (7–9, interleaved) →
// Board tab (10–12) → tab transition (13) → empty Queue (14) → Players
// (15–16) → Rosters (17–20, one Live Activity overlay) → BBE app (21–25).
//
// Ground truth (verified against the draft): user BirdEnthusiast at slot 4,
// 4 picks made (P. Nacua 4, D. Henry 21, R. Rice 28, T. McMillan 45), draft
// on pick 48 (Round 4, Pick 12), user up in 4.
//
// Run from mobile-app/:  node scripts/test-dk-draft-replay.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildPool } from '../src/draft/playerMatcher.js';
import { parseDraftKingsScreen } from '../src/draft/draftkingsParser.js';
import { createDraftSession } from '../src/draft/sessionEngine.js';
import '../src/draft/extensionEngine.entry.js'; // defines globalThis.BBEEngine

const TEAMS = 12;
const ROUNDS = 20; // DK Best Ball drafts 20 rounds
const USERNAME = 'BirdEnthusiast';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const framesPath = path.join(root, 'docs/draftkings_debug/frames-1784385816.jsonl');
// The DK ADP snapshot current at recording time (bundled web-app asset).
const poolPath = path.join(
  root, '../best-ball-manager/src/assets/adp/draftking_adp_2026-07-18.csv',
);

for (const [label, p] of [['frames corpus', framesPath], ['ADP pool', poolPath]]) {
  if (!existsSync(p)) {
    console.error(`${label} missing: ${p}`);
    process.exit(1);
  }
}

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`  ok  ${label}`);
  else {
    failures++;
    console.error(`FAIL  ${label}\n      expected ${e}\n      got      ${a}`);
  }
}

// ---- pool (DK rankings CSV: ID,Name,Position,ADP,Team) ----
const unquote = s => (s ?? '').trim().replace(/^"(.*)"$/, '$1');
const csv = readFileSync(poolPath, 'utf8').split(/\r?\n/).filter(Boolean);
const headers = csv[0].split(',').map(h => unquote(h).toLowerCase());
const col = (...names) => names.map(n => headers.indexOf(n)).find(i => i >= 0) ?? -1;
const iName = col('name', 'player', 'player_name');
const iPos = col('position', 'pos');
const iTeam = col('team', 'teamname');
const iAdp = col('adp');
const poolRows = csv.slice(1).map((line) => {
  const c = line.split(',').map(unquote);
  const name = c[iName];
  return name ? {
    name,
    position: iPos >= 0 ? c[iPos]?.toUpperCase() : null,
    team: iTeam >= 0 ? c[iTeam]?.toUpperCase() : null,
    adp: iAdp >= 0 ? parseFloat(c[iAdp]) : NaN,
  } : null;
}).filter(Boolean);
const pool = buildPool(poolRows);
check('DK pool loaded (≥ 200 players)', pool.players.length >= 200, true);

const frames = readFileSync(framesPath, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
console.log(`replaying ${frames.length} DK frames…`);

const MY_PICKS = [
  '4:Puka Nacua', '21:Derrick Henry', '28:Rashee Rice', '45:Tetairoa McMillan',
];

// ---- 1. Full replay: slot, position, roster, presence ----
{
  const session = createDraftSession({
    pool, teams: TEAMS, rounds: ROUNDS, username: USERNAME,
  });
  let selfLedgerAdds = 0;
  for (const f of frames) {
    const obs = parseDraftKingsScreen(f.items, { pool, teams: TEAMS, username: USERNAME });
    const before = session.getStatus().ledgerSize;
    const summary = session.ingest(obs, f.t * 1000);
    if (obs.kind === 'self' && session.getStatus().ledgerSize !== before) selfLedgerAdds++;
    if (summary && summary.newDraft) check('no spurious new-draft reset', 'reset', 'none');
  }
  const st = session.getStatus();
  console.log('full replay:');
  check('slot resolved to 4', st.slot, 4);
  check('slot came from evidence (anchored or inferred)',
    ['anchored', 'inferred'].includes(st.slotSource), true);
  check('draft position reached pick 48 exactly', st.currentPick, 48);
  check('up in 4', st.picksUntil, 4);
  check('my next pick is overall 52', st.myNextPick, 52);
  check('all 4 of my picks on the roster', st.myPicks.map(p => `${p.overall}:${p.name}`), MY_PICKS);
  check('board frames populated a real ledger (≥ 20 picks known)', st.ledgerSize >= 20, true);
  check('self-overlay frames added nothing to the ledger', selfLedgerAdds, 0);
  check('flagged as a mid-draft resume', st.isResume, true);
  const glance = session.getGlance();
  check('roster bar reflects DK picks', glance.rosterBar, 'QB 0 · RB 1 · WR 3 · TE 0');
  check('no drafted player among the targets',
    session.getDraftState().availablePlayers.slice(0, 12)
      .every(p => !st.myPicks.some(m => m.canonical === p.canonical)), true);
}

// ---- 2. Ledger accuracy spot checks (board ground truth) ----
{
  const session = createDraftSession({
    pool, teams: TEAMS, rounds: ROUNDS, username: USERNAME,
  });
  for (const f of frames) {
    session.ingest(parseDraftKingsScreen(f.items, { pool, teams: TEAMS, username: USERNAME }), f.t * 1000);
  }
  const state = session.getDraftState();
  const drafted = new Set(state.availablePlayers.map(p => p.canonical));
  console.log('ledger accuracy:');
  // Board frame 10 ground truth, one pick per visible column.
  for (const name of ['bijan robinson', 'josh allen', 'jamarr chase', 'terry mclaurin']) {
    check(`${name} is off the board`, drafted.has(name), false);
  }
  // "Last Pick: T. McLaurin WAS-WR" at Round 4 Pick 11 → overall 46 — must
  // agree with the board's 4.10|46 cell (gilbeyiii column).
  const st = session.getStatus();
  const mcLaurin = st.myPicks.find(p => p.name === 'Terry McLaurin');
  check('T. McLaurin never lands on MY roster (slot 3, not 4)', mcLaurin, undefined);
}

// ---- 3. Engine-level replay through the real extension entry ----
{
  const init = globalThis.BBEEngine.init(JSON.stringify({
    poolRows, teams: TEAMS, rounds: ROUNDS, username: USERNAME,
    platform: 'draftkings', configEpoch: 3,
  }));
  check('engine init (platform: draftkings)', init, 'ok');
  let last = null;
  for (const f of frames) {
    last = JSON.parse(globalThis.BBEEngine.ingest(JSON.stringify(f.items), String(f.t * 1000)));
  }
  console.log('extension engine:');
  check('results echo the config epoch', last.epoch, 3);
  check('engine status agrees on position', last.status.currentPick, 48);
  check('engine status agrees on slot', last.status.slot, 4);
  check('engine status agrees on roster size', last.status.myPickCount, 4);
}

// ---- 4. UD parser regression guard: DK config never routes to UD parsing ----
{
  const initUd = globalThis.BBEEngine.init(JSON.stringify({
    poolRows, teams: TEAMS, rounds: 18, username: 'BIRDENTHUSIAST', configEpoch: 4,
  }));
  check('engine re-init without platform (UD default)', initUd, 'ok');
  // A DK Rosters frame through the UD parser must not fabricate a board — it
  // historically read only the "up in N" ticker. This documents the split.
  const r = JSON.parse(globalThis.BBEEngine.ingest(JSON.stringify(frames[4].items), String(frames[4].t * 1000)));
  console.log('platform separation:');
  check('UD parser on a DK frame ledgers nothing', r.status.ledgerSize, 0);
}

console.log(failures === 0 ? '\nDK replay: all checks passed.' : `\nDK replay: ${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
