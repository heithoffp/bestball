// replay-frames.mjs — replay a recorded live-capture session (TASK-331)
// through the exact engine the broadcast extension runs, offline.
//
// Input: the frames-<epoch>.jsonl exported from the confidence hub ("Frames"
// button) — one line per OCR'd frame: {"t": epochSec, "items": [{text,x,y,w,h,confidence}]}.
//
// Usage (from mobile-app/):
//   node scripts/replay-frames.mjs <frames.jsonl> --pool <adp.csv>
//        [--platform underdog|draftkings|dk] [--username BIRDENTHUSIAST]
//        [--slot N] [--teams 12] [--rounds 18]
//        [--from <epochSec>] [--to <epochSec>] [--dump <frameIndex>] [--quiet]
//        [--push-sim] [--drop-kind board,players]
// --platform (TASK-350): parse with the DraftKings screen grammar instead of
//   Underdog's (also passed through to the extension engine in --push-sim).
// --drop-kind (TASK-336): parse but do NOT ingest frames of the given kinds —
//   proves e.g. that a roster glance + players scroll suffices without any
//   board frame ("no-board mid-draft resume").
//
// Prints a per-frame timeline (kind · picksUntil · currentPick · ledger ·
// inferredGone, with deltas), then the final status, glance, and top targets.
// --dump N prints frame N's raw OCR lines and exits (close inspection).
// --push-sim (TASK-335 / ADR-024): instead of the timeline, run every frame
//   through the REAL extension entry (BBEEngine.ingest, so changed/significant/
//   currentPick are genuine engine outputs) and apply the event-driven push gate
//   the broadcast extension uses, printing each push decision + a summary. This
//   verifies the push policy offline against a recorded draft.

import { readFileSync } from 'node:fs';
import { buildPool } from '../src/draft/playerMatcher.js';
import { parseUnderdogScreen } from '../src/draft/underdogParser.js';
import { parseDraftKingsScreen } from '../src/draft/draftkingsParser.js';
import { createDraftSession } from '../src/draft/sessionEngine.js';
// Side-effect import: defines globalThis.BBEEngine (the extension's JSC entry),
// used by --push-sim so the simulated push decision runs on the exact engine.
import '../src/draft/extensionEngine.entry.js';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] != null ? process.argv[i + 1] : fallback;
}
const has = name => process.argv.includes(`--${name}`);

const framesPath = process.argv[2];
if (!framesPath || framesPath.startsWith('--')) {
  console.error('usage: node scripts/replay-frames.mjs <frames.jsonl> --pool <adp.csv> [options]');
  process.exit(1);
}

// ---- pool from a UD ADP CSV (same header fallbacks as the app's loader) ----
function poolFromCsv(path) {
  const text = readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const unquote = s => (s ?? '').trim().replace(/^"(.*)"$/, '$1');
  const headers = lines[0].split(',').map(h => unquote(h).toLowerCase());
  const idx = (...names) => names.map(n => headers.indexOf(n)).find(i => i >= 0) ?? -1;
  const iName = idx('name', 'player', 'player_name', 'full_name');
  const iFirst = idx('firstname', 'first_name');
  const iLast = idx('lastname', 'last_name');
  const iPos = idx('position', 'pos', 'slotname');
  const iTeam = idx('team', 'teamname', 'team_abbr');
  const iAdp = idx('adp', 'averagedraftposition', 'avg_pick');
  if (iName < 0 && (iFirst < 0 || iLast < 0)) {
    console.error(`--pool CSV has no recognizable name column (headers: ${headers.join(', ')})`);
    process.exit(1);
  }
  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(',').map(unquote);
    const name = iName >= 0
      ? cols[iName]
      : `${cols[iFirst] ?? ''} ${cols[iLast] ?? ''}`.trim();
    if (!name) continue;
    rows.push({
      name,
      position: iPos >= 0 ? cols[iPos]?.toUpperCase() : null,
      team: iTeam >= 0 ? cols[iTeam]?.toUpperCase() : null,
      adp: iAdp >= 0 ? parseFloat(cols[iAdp]) : NaN,
    });
  }
  return rows;
}

const poolPath = arg('pool');
if (!poolPath) {
  console.error('--pool <adp.csv> is required (platform ADP snapshot: name,position,team,adp)');
  process.exit(1);
}
const poolRows = poolFromCsv(poolPath);
const pool = buildPool(poolRows);
console.log(`pool: ${pool.players.length} players from ${poolPath}`);

// ---- platform (TASK-350) ----
const platform = /^(dk|draftkings)$/i.test(arg('platform', 'underdog')) ? 'draftkings' : 'underdog';
const parseScreen = (items, ctx) => (platform === 'draftkings'
  ? parseDraftKingsScreen(items, ctx)
  : parseUnderdogScreen(items, ctx));
console.log(`platform: ${platform}`);

// ---- frames ----
const frames = readFileSync(framesPath, 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line, i) => {
    try { return JSON.parse(line); } catch { console.error(`skipping malformed line ${i + 1}`); return null; }
  })
  .filter(Boolean);
console.log(`frames: ${frames.length} from ${framesPath}\n`);

const dumpIdx = arg('dump');
if (dumpIdx != null) {
  const f = frames[parseInt(dumpIdx, 10)];
  if (!f) { console.error(`no frame ${dumpIdx}`); process.exit(1); }
  console.log(`frame ${dumpIdx} · t=${f.t}`);
  for (const it of f.items) {
    const text = typeof it === 'string' ? it : it.text;
    const pos = typeof it === 'object' && it.y != null ? `  (x=${it.x?.toFixed(2)} y=${it.y?.toFixed(2)})` : '';
    console.log(`  ${JSON.stringify(text)}${pos}`);
  }
  process.exit(0);
}

// ---- push-sim (TASK-335 / ADR-024, triggers extended by TASK-336): simulate
// the extension's event-driven push decision over the recording, using the
// REAL engine. A priority-10 push fires on a significant transition (crunch /
// my pick / room presence — bypasses the floors), a newly-detected pick
// (3 s floor), or a changed target list (15 s floor — mirrors FrameProcessor's
// lastPushedTargets). Frame-quiet gaps ≥ 10 s also run the extension's
// presence tick. The frame epoch `t` is the simulated clock. ----
if (has('push-sim')) {
  const teams = parseInt(arg('teams', '12'), 10);
  const initRes = globalThis.BBEEngine.init(JSON.stringify({
    poolRows,
    teams,
    platform,
    rounds: parseInt(arg('rounds', '18'), 10),
    slot: arg('slot') ? parseInt(arg('slot'), 10) : null,
    username: arg('username') || null,
  }));
  if (initRes !== 'ok') { console.error(`engine init failed: ${initRes}`); process.exit(1); }

  const quiet = has('quiet');
  let lastPushedPick = 0;
  let lastPushedTargets = JSON.stringify([]);
  let lastPushAt = -Infinity;
  let prevT = null;
  let pushes = 0; let skipped = 0; let idleSkipped = 0; let ticks = 0;

  const decide = (r, now, i, viaTick) => {
    const glance = r.glance || {};
    const pick = glance.currentPick ?? 0;
    const sig = !!r.significant;
    const newPick = pick > lastPushedPick;
    const targetsJson = JSON.stringify(glance.targets || []);
    const targetsDiffer = targetsJson !== lastPushedTargets;
    const willPush = sig
      || (newPick && now - lastPushAt >= 3.0)
      || (targetsDiffer && now - lastPushAt >= 15.0);
    const tag = viaTick ? 'tick' : `#${String(i).padStart(4)}`;
    if (willPush) {
      lastPushAt = now;
      lastPushedPick = Math.max(lastPushedPick, pick);
      lastPushedTargets = targetsJson;
      pushes++;
      console.log(
        `${tag} t=${now} PUSH p10 cp=${pick} phase=${glance.phase}`
        + `${newPick ? ' [newpick]' : ''}${sig ? ' [sig]' : ''}${targetsDiffer ? ' [targets]' : ''}`,
      );
      for (const t of glance.targets || []) console.log(`        ${t}`);
    } else if (!viaTick) {
      skipped++;
      if (!newPick && !sig && !targetsDiffer) idleSkipped++;
      if (!quiet) {
        console.log(
          `${tag} t=${now} skip     cp=${pick}`
          + ` (changed=${!!r.changed} newPick=${newPick} sig=${sig} targets=${targetsDiffer})`,
        );
      }
    }
  };

  frames.forEach((f, i) => {
    // FrameProcessor ticks the presence clock when frames go quiet ≥ 10 s.
    if (prevT != null && f.t - prevT >= 10) {
      ticks++;
      const tr = JSON.parse(globalThis.BBEEngine.tick(String((f.t - 1) * 1000)));
      if (tr.ok && tr.significant) decide(tr, f.t - 1, i, true);
    }
    prevT = f.t;
    const r = JSON.parse(globalThis.BBEEngine.ingest(JSON.stringify(f.items), String(f.t * 1000)));
    decide(r, f.t, i, false);
  });
  console.log('\n---- push-sim summary (ADR-024 + TASK-336) ----');
  console.log(`frames:  ${frames.length}  (presence ticks: ${ticks})`);
  console.log(`pushes:  ${pushes}`);
  console.log(`skipped: ${skipped}  (${idleSkipped} with nothing advanced)`);
  process.exit(0);
}

// ---- replay ----
const teams = parseInt(arg('teams', '12'), 10);
const session = createDraftSession({
  pool,
  teams,
  rounds: parseInt(arg('rounds', '18'), 10),
  slot: arg('slot') ? parseInt(arg('slot'), 10) : null,
  username: arg('username'),
});

const from = arg('from') ? parseInt(arg('from'), 10) : -Infinity;
const to = arg('to') ? parseInt(arg('to'), 10) : Infinity;
const quiet = has('quiet');
const dropKinds = new Set((arg('drop-kind') || '').split(',').map(s => s.trim()).filter(Boolean));
let prev = { cp: 1, led: 0, gone: 0, presence: 'unseen' };
frames.forEach((f, i) => {
  if (f.t < from || f.t > to) return;
  const obs = parseScreen(f.items, { pool, teams, username: arg('username') || null });
  if (dropKinds.has(obs.kind)) {
    if (!quiet) console.log(`#${String(i).padStart(4)} t=${f.t} ${String(obs.kind).padEnd(8)} DROPPED (--drop-kind)`);
    return;
  }
  session.ingest(obs, f.t * 1000);
  const s = session.getStatus();
  const delta = [];
  if (s.currentPick !== prev.cp) delta.push(`cp ${prev.cp}->${s.currentPick}`);
  if (s.ledgerSize !== prev.led) delta.push(`led +${s.ledgerSize - prev.led}`);
  if (s.inferredGone !== prev.gone) delta.push(`gone ${s.inferredGone - prev.gone > 0 ? '+' : ''}${s.inferredGone - prev.gone}`);
  if (s.presence !== prev.presence) delta.push(`room ${prev.presence}->${s.presence}`);
  prev = { cp: s.currentPick, led: s.ledgerSize, gone: s.inferredGone, presence: s.presence };
  if (!quiet || delta.length) {
    console.log(
      `#${String(i).padStart(4)} t=${f.t} ${String(obs.kind).padEnd(8)}`
      + ` pu=${obs.picksUntil ?? (obs.picksAwayDivider != null ? `div${obs.picksAwayDivider}` : '-')}`
      + ` cp=${s.currentPick} led=${s.ledgerSize} gone=${s.inferredGone} room=${s.presence}`
      + (delta.length ? `   << ${delta.join(', ')}` : ''),
    );
  }
});

const status = session.getStatus();
const glance = session.getGlance();
console.log('\n---- final status ----');
console.log(JSON.stringify({
  slot: status.slot,
  slotSource: status.slotSource,
  learnedUsername: status.learnedUsername,
  currentPick: status.currentPick,
  picksUntil: status.picksUntil,
  myNextPick: status.myNextPick,
  ledgerSize: status.ledgerSize,
  inferredGone: status.inferredGone,
  isResume: status.isResume,
  presence: status.presence,
  myPicks: status.myPicks.map(p => `${p.round}:${p.name}`),
}, null, 1));
console.log('\n---- glance ----');
console.log(JSON.stringify(glance, null, 1));
console.log('\n---- top 12 available ----');
for (const p of session.getDraftState().availablePlayers.slice(0, 12)) {
  console.log(`  ${p.position?.padEnd(2)} ${p.name}  (ADP ${p.adp})`);
}
