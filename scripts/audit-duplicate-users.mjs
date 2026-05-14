#!/usr/bin/env node
/**
 * audit-duplicate-users.mjs — Read-only audit for dual-account pairs.
 *
 * Finds auth.users rows that share an email (case-insensitive). For each
 * pair, reports: which row is email/password vs google, created_at,
 * and row counts in extension_entries / profiles / subscriptions so the
 * operator can pick a merge target.
 *
 * Read-only. Makes no mutations. Safe to run anytime.
 *
 * Usage:
 *   node scripts/audit-duplicate-users.mjs
 *
 * Requires <repoRoot>/.env.local with:
 *   SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
loadEnv({ path: join(repoRoot, '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function listAllUsers() {
  const all = [];
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    all.push(...data.users);
    if (data.users.length < perPage) break;
    page += 1;
  }
  return all;
}

function providersOf(user) {
  const ids = user.identities ?? [];
  const provs = ids.map((i) => i.provider);
  return provs.length ? provs : ['unknown'];
}

async function countRows(table, userIdColumn, userId) {
  const { count, error } = await sb
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(userIdColumn, userId);
  if (error) {
    return `err:${error.code ?? error.message}`;
  }
  return count ?? 0;
}

async function main() {
  console.log('Fetching all auth.users…');
  const users = await listAllUsers();
  console.log(`Total users: ${users.length}`);

  const byEmail = new Map();
  for (const u of users) {
    const email = (u.email ?? '').toLowerCase();
    if (!email) continue;
    const arr = byEmail.get(email) ?? [];
    arr.push(u);
    byEmail.set(email, arr);
  }

  const dupes = [...byEmail.entries()].filter(([, arr]) => arr.length > 1);
  if (dupes.length === 0) {
    console.log('\nNo duplicate-email auth.users rows found.');
    return;
  }

  console.log(`\nFound ${dupes.length} email(s) with duplicate auth.users rows:\n`);

  for (const [email, rows] of dupes) {
    console.log(`────────────────────────────────────────────────────────────`);
    console.log(`email: ${email}`);
    for (const u of rows) {
      const entries = await countRows('extension_entries', 'user_id', u.id);
      const profiles = await countRows('profiles', 'id', u.id);
      const subs = await countRows('subscriptions', 'user_id', u.id);
      console.log(
        `  • ${u.id}` +
          `\n      providers:    ${providersOf(u).join(', ')}` +
          `\n      created_at:   ${u.created_at}` +
          `\n      last_sign_in: ${u.last_sign_in_at ?? '—'}` +
          `\n      extension_entries: ${entries}   profiles: ${profiles}   subscriptions: ${subs}`,
      );
    }
    console.log('');
  }

  console.log('Audit complete. No data modified.');
}

main().catch((err) => {
  console.error('audit failed:', err);
  process.exit(1);
});
