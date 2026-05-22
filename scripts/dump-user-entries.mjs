#!/usr/bin/env node
/**
 * dump-user-entries.mjs — Admin tool to dump a user's extension_entries
 * for diagnostic inspection (mismatched exposure / correlation reports, etc).
 *
 * Pure read-only dump: no normalization, no exposure math. The point is to
 * confirm the raw synced data is clean before chasing downstream bugs.
 *
 * Usage:
 *   node scripts/dump-user-entries.mjs <email> [outDir]
 *
 * Writes to <outDir>/<email>/:
 *   - entries-raw.json   full Supabase rows
 *   - entries-flat.csv   one row per pick
 *   - summary.txt        anomaly summary (also echoed to stdout)
 *
 * Requires <repoRoot>/.env.local with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

loadEnv({ path: join(repoRoot, '.env.local') });

function fail(msg, code = 1) {
  console.error(`error: ${msg}`);
  process.exit(code);
}

function usage() {
  console.error('usage: node scripts/dump-user-entries.mjs <email> [outDir]');
  process.exit(1);
}

const [, , emailArg, outDirArg] = process.argv;
if (!emailArg) usage();

const email = emailArg.trim().toLowerCase();
const outRoot = outDirArg ? outDirArg : join(repoRoot, 'tmp');
const outDir = join(outRoot, email);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  fail(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
      `Add them to ${join(repoRoot, '.env.local')}.`
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(target) {
  const perPage = 200;
  for (let page = 1; page < 1000; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) fail(`listUsers failed: ${error.message}`);
    const match = data.users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
  return null;
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function platformOf(slateTitle) {
  if (!slateTitle) return 'unknown';
  if (slateTitle.startsWith('DK')) return 'draftkings';
  return 'underdog';
}

const user = await findUserByEmail(email);
if (!user) fail(`user not found for email: ${email}`);

const { data: rows, error } = await admin
  .from('extension_entries')
  .select('entry_id, tournament, slate_title, draft_date, players, synced_at')
  .eq('user_id', user.id)
  .order('synced_at', { ascending: false });

if (error) fail(`extension_entries query failed: ${error.message}`);

mkdirSync(outDir, { recursive: true });

writeFileSync(join(outDir, 'entries-raw.json'), JSON.stringify(rows, null, 2));

const csvHeader = [
  'entry_id', 'platform', 'tournament', 'slate_title', 'draft_date',
  'pick', 'round', 'name', 'position', 'team', 'synced_at',
].join(',');
const csvLines = [csvHeader];

const perPlatform = new Map();
const perSlate = new Map();
const incomplete = [];
const dupEntryIds = new Map();
const dupPickInDraft = [];
const nullishFields = [];

for (const row of rows ?? []) {
  const platform = platformOf(row.slate_title);
  perPlatform.set(platform, (perPlatform.get(platform) ?? 0) + 1);
  perSlate.set(row.slate_title ?? '(null)', (perSlate.get(row.slate_title ?? '(null)') ?? 0) + 1);
  dupEntryIds.set(row.entry_id, (dupEntryIds.get(row.entry_id) ?? 0) + 1);

  const players = row.players ?? [];
  if (players.length !== 18) {
    incomplete.push({ entry_id: row.entry_id, count: players.length, slate: row.slate_title });
  }
  const pickSet = new Set();
  for (const p of players) {
    if (pickSet.has(p.pick)) {
      dupPickInDraft.push({ entry_id: row.entry_id, pick: p.pick, name: p.name });
    }
    pickSet.add(p.pick);
    if (!p.name || !p.position || !p.team) {
      nullishFields.push({ entry_id: row.entry_id, pick: p.pick, name: p.name, position: p.position, team: p.team });
    }
    csvLines.push([
      row.entry_id, platform, row.tournament, row.slate_title, row.draft_date,
      p.pick, p.round, p.name, p.position, p.team, row.synced_at,
    ].map(csvEscape).join(','));
  }
}

writeFileSync(join(outDir, 'entries-flat.csv'), csvLines.join('\n'));

const dupes = [...dupEntryIds.entries()].filter(([, n]) => n > 1);

const summaryLines = [];
summaryLines.push(`email:        ${email}`);
summaryLines.push(`user_id:      ${user.id}`);
summaryLines.push(`entry count:  ${rows?.length ?? 0}`);
summaryLines.push('');
summaryLines.push('per platform:');
for (const [k, v] of perPlatform) summaryLines.push(`  ${k}: ${v}`);
summaryLines.push('');
summaryLines.push('per slate:');
for (const [k, v] of [...perSlate.entries()].sort()) summaryLines.push(`  ${k}: ${v}`);
summaryLines.push('');
summaryLines.push(`duplicate entry_ids (count > 1): ${dupes.length}`);
for (const [id, n] of dupes) summaryLines.push(`  ${id}: ${n}`);
summaryLines.push('');
summaryLines.push(`drafts with player count != 18: ${incomplete.length}`);
for (const r of incomplete) summaryLines.push(`  ${r.entry_id} [${r.slate}]: ${r.count} picks`);
summaryLines.push('');
summaryLines.push(`duplicate (entry_id, pick) rows: ${dupPickInDraft.length}`);
for (const r of dupPickInDraft.slice(0, 20)) summaryLines.push(`  ${r.entry_id} pick ${r.pick}: ${r.name}`);
if (dupPickInDraft.length > 20) summaryLines.push(`  ... +${dupPickInDraft.length - 20} more`);
summaryLines.push('');
summaryLines.push(`picks missing name/position/team: ${nullishFields.length}`);
for (const r of nullishFields.slice(0, 20)) {
  summaryLines.push(`  ${r.entry_id} pick ${r.pick}: name=${r.name} pos=${r.position} team=${r.team}`);
}
if (nullishFields.length > 20) summaryLines.push(`  ... +${nullishFields.length - 20} more`);

const summary = summaryLines.join('\n');
writeFileSync(join(outDir, 'summary.txt'), summary + '\n');

console.log(summary);
console.log('');
console.log(`wrote: ${outDir}`);
