#!/usr/bin/env node
/**
 * arena-backfill-draft-dates.mjs — draft date attribution for Arena team rows.
 *
 * Board teams' frozen display_snapshots carry no draftedAt (board picks never had
 * per-pick timestamps of their own) — the Arena card can't show a draft date for
 * them. Some owned rows are missing it too: rows inserted by arena-backfill-pool.mjs
 * phase 2 were built from extension_entries.players directly, which never carried
 * a timestamp either. But every seat in a pod is drafted simultaneously, and
 * extension_entries.entry_id IS the pod's draft id, with its own draft_date column
 * (the same value the live client stamps onto every player row as pickedAt — see
 * convertEntriesToRosterRows in extensionBridge.js). This script joins the two and
 * stamps display_snapshot.draftedAt onto any arena_teams row whose pod's draft date
 * is known, mirroring arena-stamp-board-tournaments.mjs's tournament backfill.
 *
 * Re-runnable and idempotent: only rows with a NULL/missing draftedAt are stamped,
 * so a second run (or a run after arena-backfill-pool.mjs inserts more unstamped
 * rows) picks up only the new work.
 *
 * Usage:
 *   node scripts/arena-backfill-draft-dates.mjs           # dry-run (default)
 *   node scripts/arena-backfill-draft-dates.mjs --apply   # write
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

// "2026-06-12T04:31:00.000Z" or "2026-06-12" -> "2026-06-12". Mirrors the
// normalization buildSnapshot applies to pickedAt in arenaSnapshot.js.
function toDateOnly(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const t0 = Date.now();
console.log(`arena-backfill-draft-dates ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

// ── Phase 1: pod → draft date map from synced entries ───────────────────────
// entry_id on extension_entries IS the pod's draft id (UD). Skip pods whose
// entries disagree on the date (shouldn't happen; a draft happens once).
const entries = await pageAll('extension_entries', 'entry_id, draft_date', 'entry_id');
const dateByDraft = new Map();
const conflicted = new Set();
for (const e of entries) {
  const id = e.entry_id != null ? String(e.entry_id) : null;
  const date = toDateOnly(e.draft_date);
  if (!id || !date) continue;
  const prev = dateByDraft.get(id);
  if (prev && prev !== date) conflicted.add(id);
  else dateByDraft.set(id, date);
}
conflicted.forEach((id) => dateByDraft.delete(id));
console.log(`pods with a known draft date: ${dateByDraft.size} (from ${entries.length} synced entries, ${conflicted.size} conflicted → skipped)`);

// ── Phase 2: unstamped arena_teams rows in attributable pods ────────────────
// Both sources are eligible: board rows never had a date, and some owned rows
// (inserted by arena-backfill-pool.mjs phase 2) never got one either.
const teamRows = await pageAll('arena_teams', 'id, draft_id, source, display_snapshot', 'id');
const targets = [];
let alreadyStamped = 0;
let unattributable = 0;
let noDraftId = 0;
for (const r of teamRows) {
  const snap = r.display_snapshot;
  if (!snap || typeof snap !== 'object') continue;
  if (snap.draftedAt) { alreadyStamped += 1; continue; }
  if (!r.draft_id) { noDraftId += 1; continue; }
  const date = dateByDraft.get(String(r.draft_id));
  if (!date) { unattributable += 1; continue; }
  targets.push({ id: r.id, snapshot: { ...snap, draftedAt: date } });
}
console.log(`rows already carrying a date: ${alreadyStamped}`);
console.log(`rows with no draft_id (left as-is): ${noDraftId}`);
console.log(`rows with no attributable pod (left as-is): ${unattributable}`);
console.log(`rows to stamp: ${targets.length}`);

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
console.log(`stamped ${written} rows (${failed} failed) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
