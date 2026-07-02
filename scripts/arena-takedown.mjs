#!/usr/bin/env node
/**
 * arena-takedown.mjs — service-side removal path for Arena teams (TASK-290 / ADR-014).
 *
 * ADR-014 guardrail: board (third-party) teams are captured from participants' pods,
 * so their subjects are NON-users who cannot log in to unenroll themselves. This
 * script is the operator's response to a removal request (a person objects to their
 * roster appearing, or Underdog requests takedown — the ADR-009 revisit condition).
 * It also handles owned rows when explicitly asked (--include-owned).
 *
 * Default action is UNENROLL (enrolled=false): combined with migration 014 the row
 * then disappears from every read path — anon + authenticated SELECT, the pairing
 * pool, and the leaderboard all require enrolled=true. Elo history is preserved and
 * the removal is reversible. Use --delete for a hard erasure (a legal / GDPR-style
 * request) that removes the row (and cascades its arena_matches) entirely.
 *
 * Selectors (exactly one required):
 *   --team-id <uuid>          a single arena_teams row
 *   --draft-id <id>           every board row in a pod (draft_id)
 *   --entry-ref <udEntryId>   a single seat by raw UD draftEntryId (board_entry_ref)
 *   --user-hash <hash>        every board seat of a UD user, by stored board_user_hash
 *   --user-id <udUserId>      same, but hashes the raw UD userId with ARENA_TOKEN_SECRET
 *                             (must match the function/backfill salt)
 *
 * Scope: board rows only by default (the ADR-014 use case). Add --include-owned to
 * also affect owned rows matched by the selector (e.g. a whole-pod takedown).
 *
 * Dry-run by default (ZERO writes). Usage:
 *   node scripts/arena-takedown.mjs --draft-id abc123            # preview
 *   node scripts/arena-takedown.mjs --draft-id abc123 --apply    # unenroll
 *   node scripts/arena-takedown.mjs --entry-ref 999 --delete --apply
 *
 * Requires <repoRoot>/.env.local with:
 *   SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...   # service role — never commit
 *   ARENA_TOKEN_SECRET=...          # only needed for --user-id (to hash the UD id)
 */

import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
loadEnv({ path: join(repoRoot, '.env.local') });

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const DELETE = argv.includes('--delete');
const INCLUDE_OWNED = argv.includes('--include-owned');

function argVal(flag) {
  const i = argv.indexOf(flag);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
}

const selectors = {
  'team-id': argVal('--team-id'),
  'draft-id': argVal('--draft-id'),
  'entry-ref': argVal('--entry-ref'),
  'user-hash': argVal('--user-hash'),
  'user-id': argVal('--user-id'),
};
const active = Object.entries(selectors).filter(([, v]) => v != null);
if (active.length !== 1) {
  console.error('error: pass exactly one selector (--team-id | --draft-id | --entry-ref | --user-hash | --user-id).');
  process.exit(1);
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ARENA_TOKEN_SECRET } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`error: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in ${join(repoRoot, '.env.local')}.`);
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Salted hash of a raw UD userId — MUST match arena-register hashUserId and the
// backfill script (HMAC-SHA256, standard base64) so --user-id resolves the same
// board_user_hash stored on the rows.
function hashUserId(userId) {
  return createHmac('sha256', ARENA_TOKEN_SECRET).update(String(userId)).digest('base64');
}

// Build the filtered query for the chosen selector.
function applySelector(q) {
  const [key, value] = active[0];
  switch (key) {
    case 'team-id': return q.eq('id', value);
    case 'draft-id': return q.eq('draft_id', value);
    case 'entry-ref': return q.eq('board_entry_ref', value);
    case 'user-hash': return q.eq('board_user_hash', value);
    case 'user-id': {
      if (!ARENA_TOKEN_SECRET) {
        console.error('error: --user-id needs ARENA_TOKEN_SECRET in .env.local to hash the UD id.');
        process.exit(1);
      }
      return q.eq('board_user_hash', hashUserId(value));
    }
    default: return q;
  }
}

// ── Find matching rows ──────────────────────────────────────────────────────
let q = admin
  .from('arena_teams')
  .select('id, source, platform, enrolled, draft_id, board_entry_ref, display_snapshot');
q = applySelector(q);
if (!INCLUDE_OWNED) q = q.eq('source', 'board');

const { data: rows, error } = await q;
if (error) {
  console.error('error: lookup failed:', error.message);
  process.exit(1);
}

if (!rows?.length) {
  console.log(`no matching ${INCLUDE_OWNED ? '' : 'board '}rows for ${active[0][0]}=${active[0][1]}.`);
  process.exit(0);
}

console.log(`matched ${rows.length} row(s) for ${active[0][0]}=${active[0][1]}` +
  `${INCLUDE_OWNED ? ' (incl. owned)' : ' (board only)'}:`);
for (const r of rows) {
  const snap = r.display_snapshot || {};
  const players = Array.isArray(snap.players) ? snap.players.length : 0;
  console.log(`  ${r.id}  source=${r.source} platform=${r.platform} enrolled=${r.enrolled} ` +
    `draft=${r.draft_id ?? '-'} ref=${r.board_entry_ref ?? '-'} ` +
    `tourney="${snap.tournamentTitle ?? snap.slateTitle ?? '?'}" players=${players}`);
}

const action = DELETE ? 'DELETE' : 'UNENROLL';
if (!APPLY) {
  console.log(`\ndry-run — no writes. Re-run with --apply to ${action} the row(s) above.`);
  process.exit(0);
}

// ── Apply ────────────────────────────────────────────────────────────────────
const ids = rows.map((r) => r.id);
if (DELETE) {
  const { error: delErr } = await admin.from('arena_teams').delete().in('id', ids);
  if (delErr) {
    console.error('error: delete failed:', delErr.message);
    process.exit(1);
  }
  console.log(`deleted ${ids.length} row(s) (their arena_matches cascade).`);
} else {
  const { error: updErr } = await admin
    .from('arena_teams')
    .update({ enrolled: false, updated_at: new Date().toISOString() })
    .in('id', ids);
  if (updErr) {
    console.error('error: unenroll failed:', updErr.message);
    process.exit(1);
  }
  console.log(`unenrolled ${ids.length} row(s) — now hidden from pairing, leaderboard, and all reads.`);
}
