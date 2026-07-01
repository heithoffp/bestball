#!/usr/bin/env node
/**
 * arena-backfill-pool.mjs — Full-database Arena pool backfill (ADR-016 / TASK-306).
 *
 * Enrolls every roster the product has stored into arena_teams:
 *   Phase 1 — every seat of every draft_boards_admin board (BOTH sources:
 *             'extension' and 'admin_scraper'; guardrail #3 retired by ADR-016),
 *             inserted as ownerless source='board' rows.
 *   Phase 2 — every extension_entries roster, inserted as source='owned' rows
 *             under their real user (or CLAIMING / MERGING a matching board row —
 *             same semantics as arena-register's claim-on-sync).
 *
 * Three-layer dedup, mirroring the server:
 *   1. owned unique key   (user_id, entry_id, platform)
 *   2. board unique key   (board_entry_ref, platform)
 *   3. roster fingerprint (playerNameKey) — per-draft for board seats,
 *      platform-wide when matching owned entries (extension_entries has no pod id)
 *
 * Re-runnable: dry-run by default (all reads + matching, ZERO writes); a re-run
 * after --apply must report 0 pending writes. Requires TASK-305 (claim-on-sync)
 * to be DEPLOYED first, or post-backfill syncs will duplicate board rows.
 *
 * Usage:
 *   node scripts/arena-backfill-pool.mjs                # dry-run (default)
 *   node scripts/arena-backfill-pool.mjs --apply        # write
 *   node scripts/arena-backfill-pool.mjs --limit 5      # first N boards + N entries
 *
 * Requires <repoRoot>/.env.local with:
 *   SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...   # service role — never commit
 *   ARENA_TOKEN_SECRET=...          # MUST equal the Edge Function secret, or
 *                                   # board_user_hash diverges from server hashing
 *
 * Setup once: cd scripts && npm install
 */

import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  playerNameKey,
  buildBoardTeams,
  buildEnrollableTeams,
} from '../best-ball-manager/src/utils/arenaSnapshot.js';

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

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ARENA_TOKEN_SECRET } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  fail(`Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in ${join(repoRoot, '.env.local')}.`);
}
if (!ARENA_TOKEN_SECRET) {
  fail(
    'Missing ARENA_TOKEN_SECRET. It MUST be the same value as the Edge Function secret ' +
    '(supabase secrets) — with a different value every board_user_hash this script writes ' +
    'would silently diverge from arena-register, breaking dedup and hash-based takedown.',
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Matches hashUserId in supabase/functions/arena-register/index.ts (HMAC-SHA256, base64).
function hashUserId(userId) {
  return createHmac('sha256', ARENA_TOKEN_SECRET).update(String(userId)).digest('base64');
}

const INSERT_BATCH = 500;
// A seat with only a handful of resolved picks is a capture artifact, not a team —
// don't rank it. Full rosters are 18 (UD) / 20 (DK).
const MIN_SEAT_PICKS = 10;

const ownedKey = (userId, entryId, platform) => `${userId}::${entryId}::${platform}`;
const refKey = (ref, platform) => `${ref}::${platform}`;
const draftFpKey = (draftId, platform, fp) => `${draftId}::${platform}::${fp}`;
const platFpKey = (platform, fp) => `${platform}::${fp}`;
const fpOfSnapshot = (snapshot) => playerNameKey(snapshot?.players);

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

// ── Phase 0: preload existing pool + prefs into dedup maps ──────────────────
const existing = await pageAll(
  'arena_teams',
  'id, source, user_id, entry_id, platform, draft_id, board_entry_ref, elo, matches, wins, losses, provisional, display_snapshot',
  'id',
  1000,
);
const ownedKeys = new Set(); // user_id::entry_id::platform
const boardByRef = new Map(); // ref::platform -> board row
const fpByDraft = new Set(); // draft_id::platform::fp (owned + board)
const boardFpByPlatform = new Map(); // platform::fp -> board row (first match wins)
for (const row of existing) {
  const fp = fpOfSnapshot(row.display_snapshot);
  if (row.draft_id && fp) fpByDraft.add(draftFpKey(row.draft_id, row.platform, fp));
  if (row.source === 'owned') {
    ownedKeys.add(ownedKey(row.user_id, row.entry_id, row.platform));
  } else {
    if (row.board_entry_ref) boardByRef.set(refKey(row.board_entry_ref, row.platform), row);
    if (fp && !boardFpByPlatform.has(platFpKey(row.platform, fp))) {
      boardFpByPlatform.set(platFpKey(row.platform, fp), row);
    }
  }
}
const prefRows = await pageAll('arena_user_prefs', 'user_id, enrolled', 'user_id', 1000);
const prefByUser = new Map(prefRows.map((r) => [r.user_id, r.enrolled]));
console.log(`phase 0: ${existing.length} existing arena rows (${ownedKeys.size} owned), ${prefRows.length} prefs`);

const stats = {
  boardsScanned: 0, boardsEmpty: 0, seatsFound: 0, seatsShort: 0,
  seatsDupRef: 0, seatsDupFp: 0, boardInserts: 0,
  entriesScanned: 0, ownedExisting: 0, ownedInserts: 0, claims: 0, merges: 0, mergeDeletes: 0,
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

// ── Phase 1: every board seat → source='board' rows ─────────────────────────
{
  const boards = await pageAll(
    'draft_boards_admin',
    'draft_id, slate_title, entry_count, rounds, picks',
    'draft_id',
    100,
    Number.isFinite(LIMIT) ? LIMIT : Infinity,
  );
  const inserts = [];
  for (const b of boards) {
    stats.boardsScanned += 1;
    const seats = buildBoardTeams(
      {
        draftId: String(b.draft_id),
        slateTitle: b.slate_title ?? null,
        picks: b.picks ?? [],
      },
      null, // no own-seat exclusion — every seat is pool-eligible
    );
    if (seats.length === 0) { stats.boardsEmpty += 1; continue; }
    for (const seat of seats) {
      stats.seatsFound += 1;
      if ((seat.snapshot?.count ?? 0) < MIN_SEAT_PICKS) { stats.seatsShort += 1; continue; }
      if (boardByRef.has(refKey(seat.boardEntryRef, seat.platform))) { stats.seatsDupRef += 1; continue; }
      const fp = fpOfSnapshot(seat.snapshot);
      if (fp && fpByDraft.has(draftFpKey(seat.draftId, seat.platform, fp))) { stats.seatsDupFp += 1; continue; }

      const row = {
        user_id: null,
        entry_id: null,
        platform: seat.platform,
        source: 'board',
        draft_id: seat.draftId,
        board_entry_ref: seat.boardEntryRef,
        board_user_hash: seat.userId ? hashUserId(seat.userId) : null,
        display_snapshot: seat.snapshot,
        enrolled: true,
      };
      inserts.push(row);
      stats.boardInserts += 1;
      boardByRef.set(refKey(seat.boardEntryRef, seat.platform), row);
      if (fp) {
        fpByDraft.add(draftFpKey(seat.draftId, seat.platform, fp));
        if (!boardFpByPlatform.has(platFpKey(seat.platform, fp))) {
          boardFpByPlatform.set(platFpKey(seat.platform, fp), row);
        }
      }
    }
  }
  await flushInserts(inserts, 'board');
  console.log(`phase 1: ${stats.boardsScanned} boards → ${stats.boardInserts} board inserts ` +
    `(${stats.boardsEmpty} empty/nameless, ${stats.seatsShort} short seats, ` +
    `${stats.seatsDupRef} ref dups, ${stats.seatsDupFp} fingerprint dups)`);
}

// Remove a board row from the in-run maps once it is claimed, merged away, or owned.
function releaseBoardRow(row) {
  if (row.board_entry_ref) boardByRef.delete(refKey(row.board_entry_ref, row.platform));
  const fp = fpOfSnapshot(row.display_snapshot);
  if (fp && boardFpByPlatform.get(platFpKey(row.platform, fp)) === row) {
    boardFpByPlatform.delete(platFpKey(row.platform, fp));
  }
}

// ── Phase 2: every extension_entries roster → owned rows (insert/claim/merge) ─
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
    if (!team) continue;
    const enrolled = prefByUser.get(e.user_id) ?? true;
    const fp = fpOfSnapshot(team.snapshot);

    // Locate a board twin: exact seat ref first, then platform-wide fingerprint
    // (extension_entries carries no pod id, so per-draft scoping isn't possible).
    const twin =
      boardByRef.get(refKey(e.entry_id, team.platform)) ??
      (fp ? boardFpByPlatform.get(platFpKey(team.platform, fp)) : undefined);

    if (ownedKeys.has(ownedKey(e.user_id, e.entry_id, team.platform))) {
      stats.ownedExisting += 1;
      if (twin && twin.id) {
        // Merge: owned row keeps identity; the twin's rating history wins only
        // if it has actually been voted on more; then the twin is deleted.
        stats.merges += 1;
        if (APPLY) {
          const { data: ownedRow, error: oErr } = await admin
            .from('arena_teams')
            .select('id, matches')
            .match({ user_id: e.user_id, entry_id: e.entry_id, platform: team.platform, source: 'owned' })
            .maybeSingle();
          if (oErr) fail(`merge owned lookup failed: ${oErr.message}`);
          if (ownedRow) {
            if ((twin.matches ?? 0) > (ownedRow.matches ?? 0)) {
              const { error: upErr } = await admin
                .from('arena_teams')
                .update({
                  elo: twin.elo, matches: twin.matches, wins: twin.wins,
                  losses: twin.losses, provisional: twin.provisional,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', ownedRow.id);
              if (upErr) fail(`merge rating copy failed: ${upErr.message}`);
            }
            const { error: delErr } = await admin.from('arena_teams').delete().eq('id', twin.id);
            if (delErr) fail(`merge delete failed: ${delErr.message}`);
            stats.mergeDeletes += 1;
          }
        }
        releaseBoardRow(twin);
      }
      continue;
    }

    if (twin) {
      // Claim: convert the board row to this user's owned row, keeping ratings.
      stats.claims += 1;
      if (APPLY && twin.id) {
        const { error } = await admin
          .from('arena_teams')
          .update({
            user_id: e.user_id,
            entry_id: e.entry_id,
            source: 'owned',
            display_snapshot: team.snapshot, // owned snapshot carries tournamentTitle
            enrolled,
            updated_at: new Date().toISOString(),
          })
          .eq('id', twin.id);
        if (error) fail(`claim update failed: ${error.message}`);
      }
      releaseBoardRow(twin);
      ownedKeys.add(ownedKey(e.user_id, e.entry_id, team.platform));
      continue;
    }

    inserts.push({
      user_id: e.user_id,
      entry_id: e.entry_id,
      platform: team.platform,
      source: 'owned',
      draft_id: e.entry_id, // no pod id in extension_entries; entry id is the UD draft id
      display_snapshot: team.snapshot,
      enrolled,
    });
    stats.ownedInserts += 1;
    ownedKeys.add(ownedKey(e.user_id, e.entry_id, team.platform));
    if (fp) fpByDraft.add(draftFpKey(e.entry_id, team.platform, fp));
  }
  await flushInserts(inserts, 'owned');
  console.log(`phase 2: ${stats.entriesScanned} entries → ${stats.ownedInserts} owned inserts, ` +
    `${stats.claims} claims, ${stats.merges} merges (${stats.mergeDeletes} twins deleted), ` +
    `${stats.ownedExisting} already owned`);
}

const pending = stats.boardInserts + stats.ownedInserts + stats.claims + stats.merges;
console.log('—'.repeat(60));
console.log(JSON.stringify(stats, null, 2));
console.log(`${APPLY ? 'applied' : 'pending (dry-run)'} writes: ${pending} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (!APPLY && pending > 0) {
  console.log('re-run with --apply to write. Idempotency check: a dry-run after --apply must report 0.');
}
