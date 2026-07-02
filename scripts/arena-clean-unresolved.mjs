#!/usr/bin/env node
/**
 * arena-clean-unresolved.mjs — unenroll Arena pool teams with unresolved players.
 *
 * Some rosters synced before their player lookup loaded carry the extension's
 * "Unknown (<appearanceId>)" fallback names; registered into arena_teams, they
 * surface in blind matchups as rosters full of UUIDs. Registration now refuses
 * such teams (hasUnresolvedPlayers in arenaSnapshot.js) — this script sweeps the
 * rows that entered the pool before that guard existed.
 *
 * Rows are UNENROLLED (enrolled=false), not deleted: Elo history is kept, the
 * pairing pool and leaderboard both require enrolled=true, and a later proper
 * re-sync can heal the row — claim-on-sync replaces the snapshot and re-enrolls
 * under the owner's account pref. Note the one gap: an already-OWNED degraded
 * row is never re-written by arena-register (insert-new-only), so it stays
 * unenrolled until a snapshot-refresh path exists.
 *
 * Re-runnable: dry-run by default (ZERO writes); a re-run after --apply must
 * report 0 pending. Usage:
 *   node scripts/arena-clean-unresolved.mjs           # dry-run (default)
 *   node scripts/arena-clean-unresolved.mjs --apply   # write
 *
 * Requires <repoRoot>/.env.local with:
 *   SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...   # service role — never commit
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { hasUnresolvedPlayers } from '../best-ball-manager/src/utils/arenaSnapshot.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
loadEnv({ path: join(repoRoot, '.env.local') });

const APPLY = process.argv.includes('--apply');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`error: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in ${join(repoRoot, '.env.local')}.`);
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PAGE = 1000;
const found = [];           // enrolled rows to unenroll
let alreadyOut = 0;         // degraded but already unenrolled
let scanned = 0;

for (let from = 0; ; from += PAGE) {
  const { data, error } = await admin
    .from('arena_teams')
    .select('id, source, platform, enrolled, display_snapshot')
    .order('id', { ascending: true })
    .range(from, from + PAGE - 1);
  if (error) {
    console.error('error: scan failed:', error.message);
    process.exit(1);
  }
  if (!data?.length) break;
  scanned += data.length;

  for (const row of data) {
    if (!hasUnresolvedPlayers(row.display_snapshot?.players)) continue;
    if (row.enrolled) found.push(row);
    else alreadyOut += 1;
  }
  if (data.length < PAGE) break;
}

const bySource = found.reduce((acc, r) => {
  acc[r.source] = (acc[r.source] || 0) + 1;
  return acc;
}, {});
console.log(`scanned ${scanned} arena_teams rows`);
console.log(`degraded + enrolled: ${found.length} (${JSON.stringify(bySource)})`);
console.log(`degraded + already unenrolled: ${alreadyOut}`);

if (!found.length) {
  console.log('nothing to do.');
  process.exit(0);
}

if (!APPLY) {
  console.log('\ndry-run — no writes. Re-run with --apply to unenroll these rows.');
  process.exit(0);
}

const CHUNK = 200;
let updated = 0;
for (let i = 0; i < found.length; i += CHUNK) {
  const ids = found.slice(i, i + CHUNK).map((r) => r.id);
  const { error } = await admin
    .from('arena_teams')
    .update({ enrolled: false, updated_at: new Date().toISOString() })
    .in('id', ids);
  if (error) {
    console.error(`error: update failed after ${updated} rows:`, error.message);
    process.exit(1);
  }
  updated += ids.length;
}
console.log(`unenrolled ${updated} degraded rows.`);
