// test-slow-draft-replay.mjs — replay the recorded SLOW-draft mid-join session
// (TASK-336) and assert its ground truth: a roster glance + players-tab scroll
// must suffice with NO board frame, room presence must track enter/leave, and
// the extension's push policy must deliver the corrected targets.
//
// Corpus: docs/debug_screenshots/frames-1784198568.jsonl — a live-capture
// recording (2026-07-16) of joining an in-progress 12-team slow draft:
// BBE app (frames 0–6) → board glance (7) → UD lobby excursion (8–11) →
// players tab (12+) → own-roster panel (14, 21–24) → leaves the room (31–32).
//
// Ground truth (verified against the draft): user BIRDENTHUSIAST at slot 9,
// 8 picks made (through RJ Harvey at overall 88), draft at pick 89.
//
// Run from mobile-app/:  node scripts/test-slow-draft-replay.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildPool } from '../src/draft/playerMatcher.js';
import { parseUnderdogScreen } from '../src/draft/underdogParser.js';
import { createDraftSession } from '../src/draft/sessionEngine.js';
import '../src/draft/extensionEngine.entry.js'; // defines globalThis.BBEEngine

const TEAMS = 12;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const framesPath = path.join(root, 'docs/debug_screenshots/frames-1784198568.jsonl');
// The UD ADP snapshot current at recording time (bundled web-app asset).
const poolPath = path.join(
  root, '../best-ball-manager/src/assets/adp/underdog_adp_2026-07-13.csv'
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

// ---- pool (same header fallbacks as replay-frames.mjs) ----
const unquote = s => (s ?? '').trim().replace(/^"(.*)"$/, '$1');
const csv = readFileSync(poolPath, 'utf8').split(/\r?\n/).filter(Boolean);
const headers = csv[0].split(',').map(h => unquote(h).toLowerCase());
const col = (...names) => names.map(n => headers.indexOf(n)).find(i => i >= 0) ?? -1;
const iFirst = col('firstname', 'first_name');
const iLast = col('lastname', 'last_name');
const iName = col('name', 'player', 'player_name', 'full_name');
const iPos = col('position', 'pos', 'slotname');
const iTeam = col('team', 'teamname', 'team_abbr');
const iAdp = col('adp', 'averagedraftposition', 'avg_pick');
const poolRows = csv.slice(1).map((line) => {
  const c = line.split(',').map(unquote);
  const name = iName >= 0 ? c[iName] : `${c[iFirst] ?? ''} ${c[iLast] ?? ''}`.trim();
  return name ? {
    name,
    position: iPos >= 0 ? c[iPos]?.toUpperCase() : null,
    team: iTeam >= 0 ? c[iTeam]?.toUpperCase() : null,
    adp: iAdp >= 0 ? parseFloat(c[iAdp]) : NaN,
  } : null;
}).filter(Boolean);
const pool = buildPool(poolRows);

const frames = readFileSync(framesPath, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
console.log(`replaying ${frames.length} slow-draft frames…`);

const MY_PICKS = [
  '9:Jonathan Taylor', '16:Chase Brown', '33:Tee Higgins', '40:Tetairoa McMillan',
  '57:Lamar Jackson', '64:Jordyn Tyson', '81:Jayden Reed', '88:RJ Harvey',
];

// ---- 1. No-board resume: board frames dropped, roster panel must carry ----
{
  const session = createDraftSession({ pool, teams: TEAMS, rounds: 18, username: 'BIRDENTHUSIAST' });
  const transitions = [];
  let prev = 'unseen';
  for (const f of frames) {
    const obs = parseUnderdogScreen(f.items, { pool, teams: TEAMS });
    if (obs.kind === 'board') continue; // the point: NO board evidence at all
    session.ingest(obs, f.t * 1000);
    const p = session.getStatus().presence;
    if (p !== prev) { transitions.push(`${prev}->${p}`); prev = p; }
  }
  const st = session.getStatus();
  console.log('no-board resume:');
  check('all 8 picks recovered from the roster panel alone',
    st.myPicks.map(p => `${p.overall}:${p.name}`), MY_PICKS);
  check('slot anchored to 9 without the board', [st.slot, st.slotSource], [9, 'anchored']);
  check('availability inference held (80+ marked gone)', st.inferredGone >= 80, true);
  check('draft position reached pick 89', st.currentPick, 89);
  check('flagged as a mid-draft resume', st.isResume, true);
  check('no stale elite name in the target pool (nothing under ADP 60)',
    session.getDraftState().availablePlayers.slice(0, 6)
      .every(p => !Number.isFinite(p.adp) || p.adp >= 60), true);
  // Presence: with the board frame dropped, the first in-room evidence is the
  // players tab (frame 12) — the lobby excursion (8–11) passes while presence
  // is still 'unseen' — then the tail (31–32) leaves. Flapping would add pairs.
  // (The full replay incl. the board glance also walks in->out->in across the
  // lobby excursion; the push-policy block below covers that path.)
  check('presence transition sequence',
    transitions, ['unseen->in', 'in->out']);
  const glance = session.getGlance();
  check('final glance is the away card', glance.phase, 'away');
  check('away card holds draft position', glance.headline.includes('R8 · P89'), true);
  check('away card hides the target grid', glance.targets, []);
}

// ---- 2. Glance target format (TASK-336 compact grid contract) ----
{
  const session = createDraftSession({
    pool, teams: TEAMS, rounds: 18, username: 'BIRDENTHUSIAST',
    exposureMap: new Map([['rico dowdle', 41.5]]),
  });
  for (const f of frames) {
    const obs = parseUnderdogScreen(f.items, { pool, teams: TEAMS });
    if (obs.kind === 'unknown') continue; // stay in-room for a tracking glance
    session.ingest(obs, f.t * 1000);
  }
  const glance = session.getGlance();
  console.log('glance format:');
  check('tracking glance carries six targets', glance.targets.length, 6);
  check('every target is POS·LastName·EXP·FLAGS',
    glance.targets.every(t => /^(QB|RB|WR|TE)·[A-Za-z'.-]+(\s[A-Za-z'.-]+)?·\d*·[SPQF]*$/.test(t)), true);
  check('exposure renders in the cell',
    glance.targets.some(t => t.startsWith('RB·Dowdle·42·') || t.startsWith('RB·Dowdle·41·')), true);
}

// ---- 3. Presence tick: a static out-of-room screen flips to away ----
{
  const session = createDraftSession({ pool, teams: TEAMS, rounds: 18 });
  const t0 = 1_784_000_000_000;
  const inObs = { kind: 'players', rows: [], boardPicks: [], rosterPicks: [], upcomingOveralls: [], availability: null, queueNames: [], drafterCards: [], confirmCard: null, lobby: false, filledCount: 0, picksUntil: null, picksAwayDivider: null };
  const outObs = { ...inObs, kind: 'unknown' };
  session.ingest(inObs, t0);
  check('in-room after a players frame', session.getStatus().presence, 'in');
  session.ingest(outObs, t0 + 2000);
  check('one out frame never flips presence', session.getStatus().presence, 'in');
  check('tick before the timeout holds', session.tick(t0 + 6000).presenceChanged, false);
  check('tick after 10 s of out-only evidence flips', session.tick(t0 + 12000).presenceChanged, true);
  check('now away', session.getStatus().presence, 'out');
  session.ingest(inObs, t0 + 20000);
  check('a single room frame re-enters', session.getStatus().presence, 'in');
  // A room screen left static must NOT time out (tick keys on newer out evidence).
  check('static in-room screen never times out', session.tick(t0 + 600000).presenceChanged, false);
}

// ---- 4. Push policy (extension gate mirror over the recording) ----
{
  const init = globalThis.BBEEngine.init(JSON.stringify({
    poolRows, teams: TEAMS, rounds: 18, username: 'BIRDENTHUSIAST', configEpoch: 7,
  }));
  check('engine init', init, 'ok');
  let lastPushedPick = 0;
  let lastPushedTargets = '[]';
  let lastPushAt = -Infinity;
  const pushes = [];
  for (const f of frames) {
    const r = JSON.parse(globalThis.BBEEngine.ingest(JSON.stringify(f.items), String(f.t * 1000)));
    const glance = r.glance || {};
    const targetsJson = JSON.stringify(glance.targets || []);
    const newPick = (glance.currentPick ?? 0) > lastPushedPick;
    const targetsDiffer = targetsJson !== lastPushedTargets;
    if (r.significant || (newPick && f.t - lastPushAt >= 3) || (targetsDiffer && f.t - lastPushAt >= 15)) {
      lastPushAt = f.t;
      lastPushedPick = Math.max(lastPushedPick, glance.currentPick ?? 0);
      lastPushedTargets = targetsJson;
      pushes.push({ t: f.t, phase: glance.phase, targets: glance.targets || [] });
    }
    check.epoch = r.epoch;
  }
  console.log('push policy:');
  check('results echo the config epoch', check.epoch, 7);
  const corrected = pushes.filter(p => p.t >= 1784198590
    && p.targets.some(t => t.includes('Dowdle')));
  check('a corrected-targets push follows the availability scan', corrected.length >= 1, true);
  check('no pushed card ever shows the stale elite tier again',
    pushes.filter(p => p.t >= 1784198590).every(p => !p.targets.some(t => t.includes('Gibbs'))), true);
  check('the session ends on a pushed away card', pushes[pushes.length - 1].phase, 'away');
  check('push volume stays sane (≤ 8 for the whole session)', pushes.length <= 8, true);
}

console.log(failures === 0 ? '\nSlow-draft replay: all checks passed.' : `\nSlow-draft replay: ${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
