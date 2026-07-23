// build-data.mjs — precompute the compacted ADP artifact for the web app
// (TASK-365; same compaction as mobile-app/scripts/build-data.mjs, ADR-031).
//
// The app previously bundled ~134 raw ADP snapshot CSVs (~13 MB) via Vite
// import.meta.glob and parsed them with PapaParse on every page load (~1.7s).
// This script does that work at build time, with two size reductions that
// don't change pipeline behavior:
//   1. Player names are dictionary-encoded (they repeat across every snapshot).
//   2. Historical snapshots keep only [nameIdx, adp] — the pipeline reads
//      position/team/projections/positionRank/byeWeek exclusively from each
//      platform's LATEST snapshot, so only those keep full rows.
//
// Runs automatically via the predev / prebuild npm hooks, so the artifact can
// never go stale relative to src/assets/adp/*.csv — the "drop a CSV, deploy"
// workflow is unchanged. The output is also committed for repo parity with
// mobile-app/shared/data/adpSnapshots.json.
//
// Reads (read-only) from src/assets/adp/, writes src/data/adpSnapshots.json.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADP_DIR = resolve(__dirname, '../src/assets/adp');
const OUT_DIR = resolve(__dirname, '../src/data');

if (!existsSync(ADP_DIR)) {
  console.error(`ADP directory not found: ${ADP_DIR}`);
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });

/** Minimal RFC-4180-ish CSV parser (quoted fields, embedded commas/newlines). */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); }
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map(r => {
    const obj = {};
    header.forEach((h, idx) => { if (h) obj[h] = r[idx] ?? ''; });
    return obj;
  });
}

function rowName(row) {
  const fl = `${row.firstName || row['First Name'] || ''} ${row.lastName || row['Last Name'] || ''}`.trim();
  return (fl || row.Name || row['Player Name'] || row.Player || '').trim().replace(/\s+/g, ' ');
}

const roundAdp = (raw) => {
  const s = String(raw).trim();
  if (s === '') return null; // Number('') === 0 — an absent ADP must stay a gap, not 0
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

// Date/platform parsing mirrors the retired loadBundledAdp() in src/App.jsx.
const parsed = [];
for (const fileName of readdirSync(ADP_DIR).filter(f => f.endsWith('.csv')).sort()) {
  const text = readFileSync(join(ADP_DIR, fileName), 'utf8');
  const normalized = fileName.replace(/(\d{4})_(\d{2})_(\d{2})/, '$1-$2-$3');
  const dateMatch = normalized.match(/(\d{4}-\d{2}-\d{2})/);
  const isSuperflex = /^superflex_adp/.test(fileName);
  const isEliminator = /^eliminator_adp/.test(fileName);
  const dateStr = dateMatch ? dateMatch[1] : ((isSuperflex || isEliminator) ? '1900-01-01' : fileName);
  // Accept both the canonical "draftking_" prefix and the stray "draftkings_"
  // variant so a misnamed export doesn't land in an orphan "unknown" platform.
  const platformMatch = fileName.match(/^(underdog|draftkings?)_adp_/);
  let platform = 'unknown';
  if (isSuperflex) platform = 'superflex';
  else if (isEliminator) platform = 'eliminator';
  else if (platformMatch) platform = platformMatch[1].startsWith('draftking') ? 'draftkings' : platformMatch[1];
  parsed.push({ date: dateStr, filename: fileName, platform, rows: parseCSV(text) });
}

// Identify each platform's latest snapshot (same "last by date" rule as the pipeline).
const latestByPlatform = {};
for (const snap of parsed) {
  const cur = latestByPlatform[snap.platform];
  if (!cur || snap.date.localeCompare(cur.date) >= 0) latestByPlatform[snap.platform] = snap;
}
const fullSet = new Set(Object.values(latestByPlatform));

const nameIndex = new Map();
const names = [];
const idx = (name) => {
  let i = nameIndex.get(name);
  if (i === undefined) { i = names.length; names.push(name); nameIndex.set(name, i); }
  return i;
};

const snapshots = parsed.map(snap => {
  const full = fullSet.has(snap);
  const rows = snap.rows.map(row => {
    const name = rowName(row);
    if (!name) return null;
    const adp = roundAdp(row.adp ?? row.ADP ?? '');
    if (!full) return [idx(name), adp];
    return [
      idx(name),
      row.slotName || row.Position || row.position || '',
      row.teamName || row.Team || row.team || '',
      adp,
      row.projectedPoints !== undefined && row.projectedPoints !== '' ? Number(row.projectedPoints) : null,
      row.positionRank ?? '',
      row.byeWeek ?? '',
      row.lineupStatus ?? '',
    ];
  }).filter(Boolean);
  return { date: snap.date, filename: snap.filename, platform: snap.platform, full, rows };
});

writeFileSync(join(OUT_DIR, 'adpSnapshots.json'), JSON.stringify({ names, snapshots }));
console.log(`adpSnapshots.json: ${snapshots.length} snapshots (${fullSet.size} full), ${names.length} unique names, ${snapshots.reduce((n, s) => n + s.rows.length, 0)} rows`);
