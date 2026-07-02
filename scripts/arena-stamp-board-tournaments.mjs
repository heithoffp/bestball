#!/usr/bin/env node
/**
 * arena-stamp-board-tournaments.mjs — tournament attribution for board rows.
 *
 * Board teams' frozen display_snapshots carry no tournamentTitle (board picks
 * never had one), so the featured-tournament scoping (BBM7) can't see them —
 * only owned teams match. But every board row stores its pod's draft_id, and any
 * synced entry in the same pod (extension_entries.entry_id == draft id) knows
 * the pod's tournament. This script joins the two and stamps
 * display_snapshot.tournamentTitle onto board rows whose pod tournament is
 * known unambiguously. Nothing else in the snapshot is touched; rows in pods
 * with no synced entry (e.g. admin-scraped-only pods) are left as-is.
 *
 * Re-runnable and idempotent: only rows with a NULL/missing tournamentTitle are
 * stamped, so a second run (or a run after arena-backfill-pool.mjs inserts more
 * unstamped board rows) picks up only the new work.
 *
 * Usage:
 *   node scripts/arena-stamp-board-tournaments.mjs           # dry-run (default)
 *   node scripts/arena-stamp-board-tournaments.mjs --apply   # write
 *
 * Requires <repoRoot>/.env.local with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Setup once: cd scripts && npm install
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
loadEnv({ path: join(repoRoot, '.env.local') });

function fail(msg, code = 1) {
  console.error(`error: ${msg}`);
  process.exit(code);
}

const APPLY = process.argv.slice(2).includes('--apply');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  fail(`Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in ${join(repoRoot, '.env.local')}.`);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function pageAll(table, columns, orderCol, filter = (q) => q) {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await filter(
      admin.from(table).select(columns).order(orderCol, { ascending: true }),
    ).range(from, from + PAGE - 1);
    if (error) fail(`${table} page failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

const t0 = Date.now();
console.log(`arena-stamp-board-tournaments ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

// ── Phase 1: pod → tournament map from synced entries ───────────────────────
// entry_id on extension_entries IS the pod's draft id (UD). Skip pods whose
// entries disagree on the title (shouldn't happen; a draft has one tournament).
const entries = await pageAll('extension_entries', 'entry_id, tournament', 'entry_id');
const titleByDraft = new Map();
const conflicted = new Set();
for (const e of entries) {
  const id = e.entry_id != null ? String(e.entry_id) : null;
  const title = (e.tournament || '').trim();
  if (!id || !title) continue;
  const prev = titleByDraft.get(id);
  if (prev && prev !== title) conflicted.add(id);
  else titleByDraft.set(id, title);
}
conflicted.forEach((id) => titleByDraft.delete(id));
console.log(`pods with a known tournament: ${titleByDraft.size} (from ${entries.length} synced entries, ${conflicted.size} conflicted → skipped)`);

// ── Phase 2: unstamped board rows in attributable pods ───────────────────────
const boardRows = await pageAll(
  'arena_teams',
  'id, draft_id, display_snapshot',
  'id',
  (q) => q.eq('source', 'board'),
);
const targets = [];
const titleTally = new Map();
let alreadyStamped = 0;
let unattributable = 0;
for (const r of boardRows) {
  const snap = r.display_snapshot;
  if (!snap || typeof snap !== 'object') continue;
  if (snap.tournamentTitle) { alreadyStamped += 1; continue; }
  const title = titleByDraft.get(String(r.draft_id));
  if (!title) { unattributable += 1; continue; }
  targets.push({ id: r.id, snapshot: { ...snap, tournamentTitle: title } });
  titleTally.set(title, (titleTally.get(title) || 0) + 1);
}
console.log(`rows already carrying a title: ${alreadyStamped}`);
console.log(`rows with no attributable pod (left as-is): ${unattributable}`);
console.log(`rows to stamp: ${targets.length}`);
for (const [title, n] of [...titleTally.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(6)}  ${title}`);
}

if (!APPLY) {
  console.log(`dry-run complete in ${((Date.now() - t0) / 1000).toFixed(1)}s — re-run with --apply to write.`);
  process.exit(0);
}

// ── Phase 3: write ───────────────────────────────────────────────────────────
// Per-row updates (each row gets its own snapshot), modest concurrency.
const CONCURRENCY = 10;
let written = 0;
let failed = 0;
for (let i = 0; i < targets.length; i += CONCURRENCY) {
  const chunk = targets.slice(i, i + CONCURRENCY);
  const results = await Promise.all(chunk.map(async ({ id, snapshot }) => {
    const { error } = await admin
      .from('arena_teams')
      .update({ display_snapshot: snapshot, updated_at: new Date().toISOString() })
      .eq('id', id);
    return error ? (console.error(`  update failed id=${id}: ${error.message}`), false) : true;
  }));
  written += results.filter(Boolean).length;
  failed += results.filter((ok) => !ok).length;
  if ((i / CONCURRENCY) % 50 === 0) console.log(`  ...${written}/${targets.length}`);
}
console.log(`stamped ${written} board rows (${failed} failed) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
