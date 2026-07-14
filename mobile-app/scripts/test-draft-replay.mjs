// test-draft-replay.mjs — replay a full recorded Underdog fast draft through
// the live-session engine and assert against known ground truth (TASK-328).
//
// Corpus: docs/task-328-evidence/frames-ocr.jsonl — Windows OCR over 1fps
// frames of docs/live_draft_recording/ScreenRecording_07-13-2026 13-16-13_1.mp4
// (regenerate with scripts/ocr-frames.ps1; frames via ffmpeg -vf fps=1).
// Windows OCR garbles differently than iOS Vision — this is a tolerance
// stress test, not a Vision-parity test.
//
// Ground truth (verified frame-by-frame during TASK-328 research):
//   12 teams, user BIRDENTHUSIAST at slot 7,
//   user picks: Jonathan Taylor #7, Drake London #18, Tee Higgins #31,
//   recording ends mid-draft just after pick #31 (current pick >= 32).
//
// Run from mobile-app/:  node scripts/test-draft-replay.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildPool } from '../src/draft/playerMatcher.js';
import { parseUnderdogScreen } from '../src/draft/underdogParser.js';
import { createDraftSession } from '../src/draft/sessionEngine.js';

const TEAMS = 12;

// Slate pool covering every player drafted or visible in the recording,
// with the ADP values shown on the Players tab.
const POOL_ROWS = [
  ['Jahmyr Gibbs', 'RB', 'DET', 1.1],
  ['Bijan Robinson', 'RB', 'ATL', 2.0],
  ["Ja'Marr Chase", 'WR', 'CIN', 3.1],
  ['Puka Nacua', 'WR', 'LAR', 4.0],
  ['Jaxon Smith-Njigba', 'WR', 'SEA', 5.3],
  ['Christian McCaffrey', 'RB', 'SF', 6.4],
  ['Amon-Ra St. Brown', 'WR', 'DET', 7.5],
  ['Jonathan Taylor', 'RB', 'IND', 7.5],
  ['CeeDee Lamb', 'WR', 'DAL', 9.6],
  ['Justin Jefferson', 'WR', 'MIN', 10.0],
  ['Ashton Jeanty', 'RB', 'LV', 11.1],
  ['James Cook', 'RB', 'BUF', 11.8],
  ['Saquon Barkley', 'RB', 'PHI', 13.4],
  ['Omarion Hampton', 'RB', 'LAC', 14.5],
  ['Chase Brown', 'RB', 'CIN', 16.4],
  ["De'Von Achane", 'RB', 'MIA', 17.5],
  ['Derrick Henry', 'RB', 'BAL', 17.8],
  ['A.J. Brown', 'WR', 'NE', 18.0],
  ['Drake London', 'WR', 'ATL', 19.8],
  ['Brock Bowers', 'TE', 'LV', 20.6],
  ['Nico Collins', 'WR', 'HOU', 22.3],
  ['George Pickens', 'WR', 'DAL', 23.5],
  ['Jeremiyah Love', 'RB', 'ARI', 24.7],
  ['Rashee Rice', 'WR', 'KC', 25.5],
  ['DeVonta Smith', 'WR', 'PHI', 26.5],
  ['Breece Hall', 'RB', 'NYJ', 27.8],
  ['Trey McBride', 'TE', 'ARI', 28.8],
  ['Chris Olave', 'WR', 'NO', 29.5],
  ['Zay Flowers', 'WR', 'BAL', 30.4],
  ['Kyren Williams', 'RB', 'LAR', 31.2],
  ['Tee Higgins', 'WR', 'CIN', 32.8],
  ['Travis Etienne Jr.', 'RB', 'NO', 32.9],
  ['Josh Allen', 'QB', 'BUF', 34.6],
  ['Emeka Egbuka', 'WR', 'TB', 34.9],
  ['Ladd McConkey', 'WR', 'LAC', 35.0],
  ['Javonte Williams', 'RB', 'DAL', 36.3],
  ['Malik Nabers', 'WR', 'NYG', 38.6],
  ['Tetairoa McMillan', 'WR', 'CAR', 38.7],
  ['Kenneth Walker III', 'RB', 'KC', 40.0],
  ['Josh Jacobs', 'RB', 'LV', 41.0],
  ['Luther Burden', 'WR', 'CHI', 45.0],
  ['Kyle Pitts', 'TE', 'ATL', 46.0],
  ['Jayden Daniels', 'QB', 'WAS', 47.0],
  ['Davante Adams', 'WR', 'LAR', 48.0],
].map(([name, position, team, adp]) => ({ name, position, team, adp }));

const pool = buildPool(POOL_ROWS);

const corpusPath = path.join(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  'docs/task-328-evidence/frames-ocr.jsonl'
);
if (!existsSync(corpusPath)) {
  console.error(`corpus missing: ${corpusPath}\nGenerate it with scripts/ocr-frames.ps1 (see header).`);
  process.exit(1);
}

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

const frames = readFileSync(corpusPath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
console.log(`replaying ${frames.length} frames…`);

const session = createDraftSession({ pool, teams: TEAMS, rounds: 18 });
let crashes = 0;
let headerChecks = 0;
let headerMismatches = 0;
const mismatchLog = [];
const kindCounts = {};

for (const { frame, items } of frames) {
  let obs;
  try {
    obs = parseUnderdogScreen(items, { pool, teams: TEAMS });
    session.ingest(obs);
  } catch (e) {
    crashes++;
    console.error(`frame ${frame} crashed: ${e && e.message}`);
    continue;
  }
  kindCounts[obs.kind] = (kindCounts[obs.kind] || 0) + 1;

  // Wherever the header was legible and the slot is anchored, the derived
  // countdown must agree with what the screen said.
  const st = session.getStatus();
  if (obs.picksUntil != null && !obs.lobby && st.slotSource === 'anchored') {
    headerChecks++;
    if (st.picksUntil !== obs.picksUntil) {
      headerMismatches++;
      if (mismatchLog.length < 8) {
        mismatchLog.push(`frame ${frame}: header says ${obs.picksUntil}, engine says ${st.picksUntil} (P${st.currentPick})`);
      }
    }
  }
}

const status = session.getStatus();
console.log(`kinds: ${JSON.stringify(kindCounts)}`);
console.log(`ledger: ${status.ledgerSize} picks · currentPick ${status.currentPick} · header agreement ${headerChecks - headerMismatches}/${headerChecks}`);
for (const m of mismatchLog) console.log(`  mismatch · ${m}`);

check('no frame crashes', crashes, 0);
check('username learned', status.learnedUsername, 'BIRDENTHUSIAST');
check('slot anchored to 7', [status.slot, status.slotSource], [7, 'anchored']);
// Tee Higgins (#31) is NOT expected: the recording cuts one second after the
// pick, before the confirmation card's name text renders (f_0365–366 show
// only the "WR" badge) and the Board is never revisited — the player identity
// simply never appears on screen. In a live session the next frames or any
// Board visit fills it in (covered by the fixture tests).
check('my picks (slot-7 overalls in the ledger)',
  status.myPicks.map(p => `${p.overall}:${p.name}`),
  ['7:Jonathan Taylor', '18:Drake London']);
check('draft reached pick 32+', status.currentPick >= 32, true);
check('my next pick is #42', status.myNextPick, 42);
check('not flagged as resume', status.isResume, false);
const mismatchRate = headerChecks ? headerMismatches / headerChecks : 1;
check('header legible on plenty of frames (>100)', headerChecks > 100, true);
check('countdown agrees with legible headers (>=98%)', mismatchRate <= 0.02, true);

console.log(failures === 0 ? '\nReplay: all checks passed.' : `\nReplay: ${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
