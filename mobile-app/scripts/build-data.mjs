// build-data.mjs — precompute bundled data for the mobile app.
//
// The web app bundles ~120 raw ADP snapshot CSVs (~12 MB) via Vite import.meta.glob
// and parses them with PapaParse at startup. On mobile that work happens at build
// time, with two size reductions that don't change pipeline behavior:
//   1. Player names are dictionary-encoded (they repeat across every snapshot).
//   2. Historical snapshots keep only [nameIdx, adp] — the pipeline reads position/
//      team/projections/positionRank/byeWeek exclusively from each platform's LATEST
//      snapshot (see processMasterList / buildLookupsFromRows / PlayerRankings), so
//      only those keep full rows. projections.csv remains the authoritative
//      projection source and is bundled in full.
//
// Run before every EAS build (or whenever new ADP snapshots land):
//   npm run build:data
//
// Reads (read-only) from best-ball-manager/src/assets/, writes shared/data/*.json.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(__dirname, '../../best-ball-manager/src/assets');
const OUT = resolve(__dirname, '../shared/data');

if (!existsSync(ASSETS)) {
  console.error(`Assets directory not found: ${ASSETS}`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

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
  const n = Number(String(raw).trim());
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

// ---- ADP snapshots ------------------------------------------------------------------
// Date/platform parsing mirrors loadBundledAdp() in best-ball-manager/src/App.jsx.
const adpDir = join(ASSETS, 'adp');
const parsed = [];
for (const fileName of readdirSync(adpDir).filter(f => f.endsWith('.csv')).sort()) {
  const text = readFileSync(join(adpDir, fileName), 'utf8');
  const normalized = fileName.replace(/(\d{4})_(\d{2})_(\d{2})/, '$1-$2-$3');
  const dateMatch = normalized.match(/(\d{4}-\d{2}-\d{2})/);
  const isSuperflex = /^superflex_adp/.test(fileName);
  const isEliminator = /^eliminator_adp/.test(fileName);
  const dateStr = dateMatch ? dateMatch[1] : ((isSuperflex || isEliminator) ? '1900-01-01' : fileName);
  const platformMatch = fileName.match(/^(underdog|draftking)_adp_/);
  let platform = 'unknown';
  if (isSuperflex) platform = 'superflex';
  else if (isEliminator) platform = 'eliminator';
  else if (platformMatch) platform = platformMatch[1] === 'draftking' ? 'draftkings' : platformMatch[1];
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

writeFileSync(join(OUT, 'adpSnapshots.json'), JSON.stringify({ names, snapshots }));
console.log(`adpSnapshots.json: ${snapshots.length} snapshots (${fullSet.size} full), ${names.length} unique names, ${snapshots.reduce((n, s) => n + s.rows.length, 0)} rows`);

// ---- Small assets: keep full parsed rows so behavior matches the web exactly --------
for (const [src, out] of [
  ['projections.csv', 'projections.json'],
  ['rankings.csv', 'rankings.json'],
  ['demo-rosters.csv', 'demoRosters.json'],
]) {
  const p = join(ASSETS, src);
  const rows = existsSync(p) ? parseCSV(readFileSync(p, 'utf8')) : [];
  writeFileSync(join(OUT, out), JSON.stringify(rows));
  console.log(`${out}: ${rows.length} rows`);
}

// ---- Weekly actuals (present only once the season starts) ---------------------------
const actualsDir = join(ASSETS, 'actuals');
const actuals = [];
if (existsSync(actualsDir)) {
  for (const fileName of readdirSync(actualsDir).filter(f => f.endsWith('.csv')).sort()) {
    actuals.push({ filename: fileName, rows: parseCSV(readFileSync(join(actualsDir, fileName), 'utf8')) });
  }
}
writeFileSync(join(OUT, 'actuals.json'), JSON.stringify(actuals));
console.log(`actuals.json: ${actuals.length} files`);

console.log('Done.');
