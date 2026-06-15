// DEV-ONLY harness — not part of the production build.
//
// Renders DraftBoardModal with a fully synthetic "two-column fork" board for the
// The Allen Tax blog post (TASK-262). Served by the dev server at
// /dev-capture.html and screenshotted by scripts/capture-allen-tax-board.mjs.
// vite build only bundles index.html, so nothing here ships to production.
//
// The board is seeded from real 2026-06-15 Underdog ADP order, then deliberately
// jittered (±~3 picks) so it reads like a real draft rather than a sorted list.
// The R1 top (slots 1-5) is pinned for a recognizable open, and two columns are
// hand-curated to stage the post's fork:
//   slot 6 (rival): Jonathan Taylor R1 · A.J. Brown R2 · Josh Allen R3 · D.J. Moore (BUF stack) R5 · Chuba Hubbard R6
//   YOU (rendered at slot 8 after the column swap below):
//                   Drake London R2 · Kyren Williams R3 · Davante Adams R5 · Jayden Daniels R6  (highlighted)
// A post-build step swaps the YOU column from seat 7 to seat 8 and applies a few
// player swaps. Rendered with hideColumnSummary so the image is clean
// (no Proj/CLV/archetype pills).

import Papa from 'papaparse';
import udCsv from '../assets/adp/underdog_adp_2026-06-15.csv?raw';
import { canonicalName } from '../utils/helpers';
import { NFL_TEAMS_ABBREV } from '../utils/nflTeams';
import DraftBoardModal from '../components/DraftBoardModal';

const ENTRY_COUNT = 12;
const ROUNDS = 6;
const SEED = 20260615;

// Deterministic PRNG so re-runs produce an identical board (reproducible capture).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Snake pick number for (round, slot) in a serpentine draft.
function pickNumber(round, slot) {
  const base = (round - 1) * ENTRY_COUNT;
  return round % 2 === 1 ? base + slot : base + (ENTRY_COUNT - slot + 1);
}

function abbrev(fullTeam) {
  if (!fullTeam) return '';
  return NFL_TEAMS_ABBREV[String(fullTeam).toUpperCase()] || fullTeam;
}

// --- Parse the ADP pool -----------------------------------------------------
const rows = Papa.parse(udCsv.trim(), { header: true, skipEmptyLines: true }).data;
const players = rows
  .map((r) => ({
    name: `${r.firstName} ${r.lastName}`.trim(),
    position: (r.slotName || '').trim(),
    team: abbrev(r.teamName),
    adp: parseFloat(r.adp),
    proj: parseFloat(r.projectedPoints) || 0,
  }))
  .filter((p) => p.name && Number.isFinite(p.adp))
  .sort((a, b) => a.adp - b.adp);

const byName = new Map(players.map((p) => [p.name, p]));
const pick = (name) => {
  const p = byName.get(name);
  if (!p) throw new Error(`BlogBoardCapture: player not found in ADP CSV: "${name}"`);
  return p;
};

// --- Curated picks ----------------------------------------------------------
// slot -> { round -> player }. Slots 1-5 pin only R1 (a recognizable draft open);
// their later rounds fall through to the jittered fill pool. Slots 6 & 7 are the
// fully-curated fork columns.
const CURATED = {
  1: { 1: pick('Jahmyr Gibbs') },
  2: { 1: pick('Bijan Robinson') },
  3: { 1: pick("Ja'Marr Chase") },
  4: { 1: pick('Puka Nacua') },
  5: { 1: pick('Jaxon Smith-Njigba') },
  6: { // rival — spends up on Allen; D.J. Moore stacks with him (BUF)
    1: pick('Jonathan Taylor'),
    2: pick('Drake London'),
    3: pick('Josh Allen'),
    4: pick('Mike Evans'),
    5: pick('D.J. Moore'),
    6: pick('Chuba Hubbard'),
  },
  7: { // YOU — pass Allen, take the back in R3 and the QB late
    1: pick('Amon-Ra St. Brown'),
    2: pick('A.J. Brown'),
    3: pick('Kyren Williams'),
    4: pick('Garrett Wilson'),
    5: pick('Davante Adams'),
    6: pick('Jayden Daniels'),
  },
};

const curatedNames = new Set(
  Object.values(CURATED).flatMap((col) => Object.values(col).map((p) => p.name)),
);

// --- Jittered fill for the other 10 columns ---------------------------------
const rng = mulberry32(SEED);
const fillPool = players
  .filter((p) => !curatedNames.has(p.name))
  .map((p, i) => ({ p, key: i + (rng() * 2 - 1) * 3 })) // ±3 rank jitter
  .sort((a, b) => a.key - b.key)
  .map((x) => x.p);

// --- Assemble the board in pick order ---------------------------------------
const picks = [];
let fillIdx = 0;
for (let p = 1; p <= ENTRY_COUNT * ROUNDS; p++) {
  const round = Math.ceil(p / ENTRY_COUNT);
  const posInRound = p - (round - 1) * ENTRY_COUNT;
  const slot = round % 2 === 1 ? posInRound : ENTRY_COUNT - posInRound + 1;

  const player = CURATED[slot]?.[round] ?? fillPool[fillIdx++];
  picks.push({
    pick: pickNumber(round, slot), // === p
    round,
    slot,
    name: player.name,
    position: player.position,
    team: player.team,
  });
}

// --- Post-build swaps (keep every other cell exactly where it is) -----------
// Swap only the player occupying two cells; pick/round/slot stay fixed so the
// pick numbers remain correct for each seat.
const swapCells = (a, b) => {
  for (const f of ['name', 'position', 'team']) { const t = a[f]; a[f] = b[f]; b[f] = t; }
};
const cellAt = (round, slot) => picks.find((p) => p.round === round && p.slot === slot);
const cellByName = (name) => {
  const c = picks.find((p) => p.name === name);
  if (!c) throw new Error(`BlogBoardCapture: cannot swap — player not on board: "${name}"`);
  return c;
};

// Move the YOU column from seat 7 to seat 8 (swap the two columns wholesale).
// roster.players matches by name, so userSlot follows the curated picks to slot 8.
for (let r = 1; r <= ROUNDS; r++) swapCells(cellAt(r, 7), cellAt(r, 8));

// Requested player swaps.
swapCells(cellByName('Drake London'), cellByName('A.J. Brown'));
swapCells(cellByName('Brian Thomas'), cellByName('Jordyn Tyson'));
swapCells(cellByName('Lamar Jackson'), cellByName('Bhayshul Tuten'));

// --- adpByPlatform maps (real ADP + projections drive CLV / Proj / pills) ----
const latestAdpMap = {};
const projPointsMap = {};
for (const p of players) {
  latestAdpMap[canonicalName(p.name)] = { pick: p.adp };
  projPointsMap[canonicalName(p.name)] = p.proj;
}

const board = {
  draftId: 'allen-tax-board',
  slateTitle: 'Best Ball Mania',
  entryCount: ENTRY_COUNT,
  rounds: ROUNDS,
  picks,
};

// roster.players = the curated YOU column (built at slot 7, swapped to slot 8
// below) so userSlot resolves to the highlighted column.
const roster = {
  entry_id: 'allen-tax-board',
  players: Object.values(CURATED[7]).map((p) => ({ name: p.name, position: p.position })),
  draftDate: new Date('2026-06-10T00:00:00'),
  tournamentTitle: 'Best Ball Mania',
};

const adpByPlatform = { underdog: { latestAdpMap, projPointsMap } };

export default function BlogBoardCapture() {
  return (
    <DraftBoardModal
      roster={roster}
      adpByPlatform={adpByPlatform}
      boardOverride={board}
      onClose={() => {}}
      hideColumnSummary
    />
  );
}
