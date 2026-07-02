// build-headshot-map.mjs — regenerates the bundled name -> Sleeper player-id map
// that powers Arena player headshots (TASK-298 direction: Sleeper CDN, no API key).
//
//   node scripts/build-headshot-map.mjs
//
// Fetches the full Sleeper NFL player database (their docs ask for at most one
// call per day — this is a manual, occasional refresh, e.g. after the draft class
// lands or a big free-agency wave), filters to rostered fantasy-relevant players,
// and writes a compact JSON map into the web app source tree. Headshot URLs are
// then https://sleepercdn.com/content/nfl/players/thumb/{id}.jpg (see
// src/utils/headshots.js for the runtime lookup).
//
// Map shape (values are Sleeper player ids as numbers-in-strings):
//   byName:    unambiguous "first last" key -> id
//   byNamePos: "first last|POS" key -> id, written for EVERY player so name
//              collisions (two active Josh Allens) resolve by position first.

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { headshotNameKey } from '../best-ball-manager/src/utils/headshotName.js';

const SLEEPER_URL = 'https://api.sleeper.app/v1/players/nfl';
const OUT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'best-ball-manager', 'src', 'data', 'sleeperHeadshots.json',
);

// Fantasy-relevant, rostered, search-relevant. search_rank < 1000 comfortably
// covers every best-ball-draftable player (top drafted rookies rank inside 100)
// while keeping the bundled map small.
const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);
const MAX_SEARCH_RANK = 1000;

function eligible(p) {
  return (
    p &&
    p.full_name &&
    p.team && // unsigned/retired players have team: null
    POSITIONS.has(p.position) &&
    p.active === true &&
    Number.isFinite(p.search_rank) &&
    p.search_rank < MAX_SEARCH_RANK
  );
}

const res = await fetch(SLEEPER_URL);
if (!res.ok) {
  console.error(`Sleeper API returned ${res.status}`);
  process.exit(1);
}
const players = Object.values(await res.json()).filter(eligible);

const byNamePos = {};
const nameBuckets = new Map(); // key -> [{id, rank}]
for (const p of players) {
  const key = headshotNameKey(p.full_name);
  if (!key) continue;
  const posKey = `${key}|${p.position}`;
  // Same name AND position (rare): keep the more search-relevant player.
  const existing = byNamePos[posKey];
  if (!existing || p.search_rank < existing.rank) {
    byNamePos[posKey] = { id: p.player_id, rank: p.search_rank };
  }
  (nameBuckets.get(key) ?? nameBuckets.set(key, []).get(key)).push({
    id: p.player_id,
    rank: p.search_rank,
  });
}

const byName = {};
for (const [key, bucket] of nameBuckets) {
  const ids = new Set(bucket.map((b) => b.id));
  if (ids.size === 1) byName[key] = bucket[0].id; // unambiguous only
}

const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  byName,
  byNamePos: Object.fromEntries(
    Object.entries(byNamePos).map(([k, v]) => [k, v.id]),
  ),
};

await writeFile(OUT_PATH, JSON.stringify(out));
console.log(
  `Wrote ${Object.keys(byName).length} names / ${Object.keys(out.byNamePos).length} name+pos entries -> ${OUT_PATH}`,
);
