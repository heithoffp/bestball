#!/usr/bin/env node
/**
 * build-combo-boards.mjs — Precompute the slim combo-board artifact (TASK-315).
 *
 * The Early Combo frequency tables (realDraftData.js) only need each board's
 * draft_id, slate_title, and the FIRST FOUR pick names per seat. Shipping the
 * full draft_boards_admin table to every client (~62 MB of picks JSONB per app
 * load as of 2026-07-09) was the dominant consumer of the Supabase Disk IO
 * Budget, so this script slims the boards server-side and publishes a small
 * JSON artifact to Supabase Storage; the web app fetches that instead.
 *
 * The bucket is PRIVATE — reads require an authenticated session, granted by
 * the storage policy in migration 016. This preserves the exact access
 * boundary of the table it replaces (draft_boards_admin is authenticated-only;
 * guests have always resolved to empty combo tables).
 *
 * Seat grouping mirrors the client logic this replaces: picks group by
 * draftEntryId (falling back to slot for older captures), sort by pick number,
 * and keep the first PATH_ROUNDS names. Boards from the pre-fix scraper hold
 * null player names and are skipped entirely — same filter the client applied.
 *
 * Re-run cadence: manual, whenever fresh boards should show up in the combo
 * tables (e.g. alongside the weekly digest). Consumers fail soft on a stale or
 * missing artifact, so there is no hard deadline — rarity percentages just lag.
 *
 * Usage:
 *   node scripts/build-combo-boards.mjs            # build + upload
 *   node scripts/build-combo-boards.mjs --dry-run  # build + report, no upload
 *
 * Requires <repoRoot>/.env.local with:
 *   SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...   # service role — never commit
 *
 * Setup once: cd scripts && npm install
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
loadEnv({ path: join(repoRoot, '.env.local') });

const BUCKET = 'app-data';
const OBJECT = 'combo-boards-v1.json';
const PAGE = 100; // rows per fetch page — full picks are ~40 KB each
const PATH_ROUNDS = 4; // must match realDraftData.js

const DRY_RUN = process.argv.includes('--dry-run');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('error: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local');
  process.exit(1);
}
const supabase = createClient(url, key);

async function fetchAllBoards() {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('draft_boards_admin')
      .select('draft_id, slate_title, picks')
      .order('draft_id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`board fetch failed at offset ${from}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
    process.stdout.write(`\r  fetched ${out.length} boards...`);
  }
  process.stdout.write('\n');
  return out;
}

function slimBoard(board) {
  const picks = Array.isArray(board.picks) ? board.picks : [];
  // Pre-fix scraper rows hold null player names — unusable, skip the board.
  if (picks.length === 0 || picks[0]?.name == null) return null;

  const bySeat = new Map();
  for (const pk of picks) {
    let seat = pk?.draftEntryId;
    if (seat == null || seat === '') seat = pk?.slot;
    if (seat == null) continue;
    if (!bySeat.has(seat)) bySeat.set(seat, []);
    bySeat.get(seat).push(pk);
  }

  const seats = [];
  for (const seatPicks of bySeat.values()) {
    seatPicks.sort((a, b) => (Number(a.pick) || 0) - (Number(b.pick) || 0));
    const names = seatPicks.slice(0, PATH_ROUNDS).map((pk) => pk.name ?? null);
    if (names.length > 0 && names[0] != null) seats.push(names);
  }
  if (seats.length === 0) return null;

  return { id: String(board.draft_id), slate: board.slate_title ?? null, seats };
}

async function ensureBucket() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`listBuckets failed: ${error.message}`);
  if (buckets?.some((b) => b.name === BUCKET)) return;
  const { error: createErr } = await supabase.storage.createBucket(BUCKET, { public: false });
  if (createErr) throw new Error(`createBucket failed: ${createErr.message}`);
  console.log(`created private bucket "${BUCKET}" (authenticated reads granted by migration 016)`);
}

console.log('Fetching draft_boards_admin...');
const boards = await fetchAllBoards();
console.log(`  ${boards.length} rows`);

const slim = boards.map(slimBoard).filter(Boolean);
const seatCount = slim.reduce((n, b) => n + b.seats.length, 0);
const artifact = {
  version: 1,
  generatedAt: new Date().toISOString(),
  boardCount: slim.length,
  seatCount,
  boards: slim,
};
const body = JSON.stringify(artifact);
console.log(`Slimmed: ${slim.length} usable boards, ${seatCount} seats, ${(body.length / 1e6).toFixed(2)} MB JSON`);

if (DRY_RUN) {
  console.log('--dry-run: skipping upload');
  process.exit(0);
}

await ensureBucket();
const { error: upErr } = await supabase.storage
  .from(BUCKET)
  .upload(OBJECT, body, {
    upsert: true,
    contentType: 'application/json',
    cacheControl: '3600',
  });
if (upErr) {
  console.error(`error: upload failed: ${upErr.message}`);
  process.exit(1);
}
console.log(`Uploaded ${BUCKET}/${OBJECT} (private bucket — authenticated reads only)`);
