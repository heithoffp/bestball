#!/usr/bin/env node
/**
 * grant-pro.mjs — Admin tool to grant or revoke Pro access by email.
 *
 * Sets profiles.comp_expires_at, which the app treats as a Pro grant
 * independent of beta_expires_at and Stripe subscriptions
 * (see best-ball-manager/src/contexts/SubscriptionContext.jsx).
 *
 * Usage:
 *   node scripts/grant-pro.mjs <email>                # lifetime comp (2099-12-31)
 *   node scripts/grant-pro.mjs <email> 90             # 90-day comp
 *   node scripts/grant-pro.mjs <email> lifetime       # explicit lifetime
 *   node scripts/grant-pro.mjs <email> revoke         # clear comp
 *
 * Requires <repoRoot>/.env.local with:
 *   SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...   # service role — never commit, never ship to browser
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

const LIFETIME_ISO = '2099-12-31T23:59:59Z';

function fail(msg, code = 1) {
  console.error(`error: ${msg}`);
  process.exit(code);
}

function usage() {
  console.error('usage: node scripts/grant-pro.mjs <email> [days|lifetime|revoke]');
  process.exit(1);
}

const [, , emailArg, modeArgRaw] = process.argv;
if (!emailArg) usage();

const email = emailArg.trim().toLowerCase();
const modeArg = (modeArgRaw ?? 'lifetime').trim().toLowerCase();

let compExpiresAt;
let modeLabel;
if (modeArg === 'revoke') {
  compExpiresAt = null;
  modeLabel = 'revoked';
} else if (modeArg === 'lifetime') {
  compExpiresAt = LIFETIME_ISO;
  modeLabel = `lifetime (${LIFETIME_ISO})`;
} else {
  const days = Number.parseInt(modeArg, 10);
  if (!Number.isFinite(days) || days <= 0 || String(days) !== modeArg) {
    usage();
  }
  compExpiresAt = new Date(Date.now() + days * 86400000).toISOString();
  modeLabel = `${days} day(s) (${compExpiresAt})`;
}

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

const user = await findUserByEmail(email);
if (!user) fail(`user not found for email: ${email}`);

const { error: upsertError } = await admin
  .from('profiles')
  .upsert({ id: user.id, comp_expires_at: compExpiresAt }, { onConflict: 'id' });

if (upsertError) fail(`profiles upsert failed: ${upsertError.message}`);

console.log(`ok: ${email} (${user.id}) — comp ${modeLabel}`);
