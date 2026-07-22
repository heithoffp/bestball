#!/usr/bin/env node
/**
 * arena-backfill-pool.mjs — Featured-tournament owned backfill (ADR-032 / TASK-359).
 *
 * SUPERSEDES the ADR-016 full-database backfill. ADR-032 narrows the Arena pool to
 * the featured tournament (owned BBM7) only, so this script no longer:
 *   - inserts ownerless source='board' rows (the entire board phase was removed), nor
 *   - claims/merges board rows into owned rows (claim-on-sync is dormant — there are
 *     no board rows to claim).
 *
 * What it does now: enroll every FEATURED extension_entries roster into arena_teams as
 * a source='owned' row under its real user, deduped by (user_id, entry_id, platform).
 * Non-featured entries are skipped. This mirrors the arena-register featured-only write
 * gate for a bulk/one-off re-seed.
 *
 * Re-runnable: dry-run by default (all reads + matching, ZERO writes); a re-run after
 * --apply must report 0 pending writes.
 *
 * Usage:
 *   node scripts/arena-backfill-pool.mjs                # dry-run (default)
 *   node scripts/arena-backfill-pool.mjs --apply        # write
 *   node scripts/arena-backfill-pool.mjs --limit 5      # first N entries
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
import { buildEnrollableTeams } from '../best-ball-manager/src/utils/arenaSnapshot.js';
import { isFeaturedSnapshot } from '../best-ball-manager/src/utils/arenaFeatured.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
loadEnv({ path: join(repoRoot, '.env.local') });

function fail(msg, code = 1) {
  console.error(`error: ${msg}`);
  process.exit(code);
}

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx !== -1 ? Number.parseInt(args[limitIdx + 1], 10) : Infinity;
if (limitIdx !== -1 && (!Number.isFinite(LIMIT) || LIMIT <= 0)) fail('--limit needs a positive integer');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  fail(`Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in ${join(repoRoot, '.env.local')}.`);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const INSERT_BATCH = 500;

const ownedKey = (userId, entryId, platform) => `${userId}::${entryId}::${platform}`;

async function pageAll(table, columns, orderCol, pageSize, cap = Infinity) {
  const rows = [];
  for (let from = 0; rows.length < cap; from += pageSize) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order(orderCol, { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) fail(`${table} page failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows.slice(0, cap === Infinity ? rows.length : cap);
}

const t0 = Date.now();
console.log(`arena-backfill-pool ${APPLY ? 'APPLY' : 'DRY-RUN'}${Number.isFinite(LIMIT) ? ` (limit ${LIMIT})` : ''}`);

// ── Phase 0: preload existing owned keys into a dedup set ────────────────────
const existing = await pageAll(
  'arena_teams',
  'source, user_id, entry_id, platform',
  'id',
  1000,
);
const ownedKeys = new Set(); // user_id::entry_id::platform
for (const row of existing) {
  if (row.source === 'owned') ownedKeys.add(ownedKey(row.user_id, row.entry_id, row.platform));
}
console.log(`phase 0: ${existing.length} existing arena rows (${ownedKeys.size} owned)`);

const stats = {
  entriesScanned: 0, notFeatured: 0, noTeam: 0, ownedExisting: 0, ownedInserts: 0,
};

async function flushInserts(queue, label) {
  for (let i = 0; i < queue.length; i += INSERT_BATCH) {
    const batch = queue.slice(i, i + INSERT_BATCH);
    if (APPLY) {
      const { error } = await admin.from('arena_teams').insert(batch);
      if (error) fail(`${label} insert failed: ${error.message}`);
    }
  }
}

// ── Featured extension_entries rosters → owned rows (insert-new-only) ────────
{
  const entries = await pageAll(
    'extension_entries',
    'id, user_id, entry_id, tournament, slate_title, players',
    'id',
    500,
    Number.isFinite(LIMIT) ? LIMIT : Infinity,
  );
  const inserts = [];
  for (const e of entries) {
    stats.entriesScanned += 1;
    const rows = (e.players ?? []).map((p) => ({
      name: p.name,
      position: p.position,
      team: p.team,
      entry_id: e.entry_id,
      pick: Number(p.pick) || 0,
      round: p.round ?? null,
      tournamentTitle: e.tournament || null,
      slateTitle: e.slate_title || null,
    }));
    const [team] = buildEnrollableTeams(rows); // one entry → one team (or none)
    if (!team) { stats.noTeam += 1; continue; }

    // Featured-only write gate (ADR-032): mirror arena-register / the featured
    // generated column, so a bulk backfill can't re-seed non-BBM7 teams.
    if (!isFeaturedSnapshot(team.snapshot)) { stats.notFeatured += 1; continue; }

    if (ownedKeys.has(ownedKey(e.user_id, e.entry_id, team.platform))) {
      stats.ownedExisting += 1;
      continue;
    }

    inserts.push({
      user_id: e.user_id,
      entry_id: e.entry_id,
      platform: team.platform,
      source: 'owned',
      draft_id: e.entry_id, // no pod id in extension_entries; entry id is the UD draft id
      display_snapshot: team.snapshot,
      enrolled: true,
    });
    stats.ownedInserts += 1;
    ownedKeys.add(ownedKey(e.user_id, e.entry_id, team.platform));
  }
  await flushInserts(inserts, 'owned');
  console.log(`entries: ${stats.entriesScanned} scanned → ${stats.ownedInserts} owned inserts ` +
    `(${stats.notFeatured} not featured, ${stats.noTeam} no team, ${stats.ownedExisting} already owned)`);
}

const pending = stats.ownedInserts;
console.log('—'.repeat(60));
console.log(JSON.stringify(stats, null, 2));
console.log(`${APPLY ? 'applied' : 'pending (dry-run)'} writes: ${pending} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (!APPLY && pending > 0) {
  console.log('re-run with --apply to write. Idempotency check: a dry-run after --apply must report 0.');
}
