#!/usr/bin/env node
/**
 * send-weekly-digest.mjs — Weekly portfolio digest (manual, operator-run).
 *
 * Three phases:
 *   node scripts/send-weekly-digest.mjs                 # DRY RUN: print manifest, send nothing
 *   node scripts/send-weekly-digest.mjs --preview       # send ONE combined review email to yourself
 *   node scripts/send-weekly-digest.mjs --send --confirm # send each eligible user their digest
 *   node scripts/send-weekly-digest.mjs --to a@b.com    # send one sample to an address (dev test)
 *   node scripts/send-weekly-digest.mjs ... --limit 5   # cap recipients
 *
 * Friday flow: run --preview, eyeball it in Gmail, then run --send --confirm.
 *
 * Requires <repoRoot>/.env.local with:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY
 *
 * Setup once: cd scripts && npm install
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

import { loadAdpData } from './lib/digest/loadAdp.mjs';
import { buildDigest } from './lib/digest/assemble.mjs';
import { renderUserEmail, renderPreview } from './lib/digest/template.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
loadEnv({ path: join(repoRoot, '.env.local') });

const PREVIEW_RECIPIENT = 'heithoff.patrick@gmail.com';
const FROM = 'Best Ball Exposures <noreply@bestballexposures.com>';
const ADP_DIR = join(repoRoot, 'best-ball-manager', 'src', 'assets', 'adp');
const BLOG_INDEX = join(repoRoot, 'docs', 'blog', 'index.md');
const SITE = 'https://bestballexposures.com';

function fail(msg, code = 1) { console.error(`error: ${msg}`); process.exit(code); }

function parseArgs(argv) {
  const args = { mode: 'dry', confirm: false, to: null, limit: Infinity };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--preview') args.mode = 'preview';
    else if (a === '--send') args.mode = 'send';
    else if (a === '--confirm') args.confirm = true;
    else if (a === '--to') args.to = argv[++i];
    else if (a === '--limit') args.limit = Number.parseInt(argv[++i], 10) || Infinity;
    else fail(`unknown argument: ${a}`);
  }
  return args;
}

function weekStartISO(now) {
  // Monday of the current week, as YYYY-MM-DD (stable idempotency key).
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

function platformOf(slateTitle) {
  return slateTitle && String(slateTitle).startsWith('DK') ? 'draftkings' : 'underdog';
}

/** Flatten an extension_entries row's players into digest roster rows. */
function rowsFromEntries(entries) {
  const rosters = [];
  for (const e of entries) {
    for (const p of (e.players ?? [])) {
      const name = p.name?.trim().replace(/\s+/g, ' ');
      if (!name) continue;
      rosters.push({
        name,
        position: p.position || 'N/A',
        team: p.team || 'N/A',
        entry_id: e.entry_id,
        pick: Number(p.pick) || 0,
        round: p.round ?? (p.pick > 0 ? Math.ceil(p.pick / 18) : '-'),
        slateTitle: e.slate_title || null,
      });
    }
  }
  return rosters;
}

function loadLatestBlog() {
  if (!existsSync(BLOG_INDEX)) return null;
  const text = readFileSync(BLOG_INDEX, 'utf8');
  // Table rows: | Date | Title | Slug | Status | KB sources |
  const rows = text.split('\n').filter((l) => /^\|\s*\d{4}-\d{2}-\d{2}\s*\|/.test(l));
  if (rows.length === 0) return null;
  const last = rows[rows.length - 1].split('|').map((s) => s.trim());
  const title = last[2];
  const slug = last[3];
  if (!title || !slug) return null;
  return { title, url: `${SITE}/blog/${slug}` };
}

async function loadAdminMaps(admin, userIds) {
  const inList = (q) => q.in('user_id', userIds);
  const [subs, profiles, prefs, snaps] = await Promise.all([
    inList(admin.from('subscriptions').select('user_id,status')),
    admin.from('profiles').select('id,beta_expires_at,comp_expires_at').in('id', userIds),
    inList(admin.from('email_preferences').select('user_id,weekly_digest,unsubscribe_token')),
    inList(admin.from('digest_snapshots').select('user_id,week_start,summary').order('week_start', { ascending: false })),
  ]);
  for (const r of [subs, profiles, prefs, snaps]) if (r.error) fail(r.error.message);

  const subMap = new Map();
  for (const s of subs.data) if (['active', 'trialing', 'past_due'].includes(s.status)) subMap.set(s.user_id, true);
  const profMap = new Map(profiles.data.map((p) => [p.id, p]));
  const prefMap = new Map(prefs.data.map((p) => [p.user_id, p]));
  const snapMap = new Map();
  for (const s of snaps.data) if (!snapMap.has(s.user_id)) snapMap.set(s.user_id, s); // most recent kept
  return { subMap, profMap, prefMap, snapMap };
}

function deriveTier(userId, subMap, profMap, now) {
  if (subMap.get(userId)) return 'pro';
  const p = profMap.get(userId);
  const future = (v) => v && new Date(v).getTime() > now.getTime();
  if (p && (future(p.beta_expires_at) || future(p.comp_expires_at))) return 'pro';
  return 'free';
}

async function sendResend(apiKey, { to, subject, html, text, headers }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text, headers }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body}`);
  return body;
}

async function main() {
  const args = parseArgs(process.argv);
  const now = new Date();
  const week = weekStartISO(now);

  const apiKey = process.env.RESEND_API_KEY;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  if (args.mode !== 'dry' && !apiKey) fail('Missing RESEND_API_KEY in .env.local');

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  console.log(`Mode: ${args.mode.toUpperCase()}  Week: ${week}`);
  const adp = loadAdpData(ADP_DIR);
  const blog = loadLatestBlog();
  console.log(`ADP: UD ${adp.underdog.snapshots.length} snaps, DK ${adp.draftkings.snapshots.length} snaps. Blog: ${blog ? blog.title : 'none'}`);

  // Gather users (auth) + their email.
  const users = [];
  for (let page = 1; page < 1000; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`listUsers failed: ${error.message}`);
    users.push(...data.users.filter((u) => u.email));
    if (data.users.length < 200) break;
  }
  const userIds = users.map((u) => u.id);
  let { subMap, profMap, prefMap, snapMap } = await loadAdminMaps(admin, userIds);

  // Materialize default preference rows (so every recipient has a real
  // unsubscribe token) before any real send. Skipped on dry runs.
  if (args.mode !== 'dry') {
    const missing = userIds.filter((id) => !prefMap.has(id));
    if (missing.length) {
      const { error } = await admin.from('email_preferences')
        .upsert(missing.map((user_id) => ({ user_id })), { onConflict: 'user_id' });
      if (error) fail(`email_preferences upsert failed: ${error.message}`);
      const { data, error: e2 } = await admin.from('email_preferences')
        .select('user_id,weekly_digest,unsubscribe_token').in('user_id', userIds);
      if (e2) fail(e2.message);
      prefMap = new Map(data.map((p) => [p.user_id, p]));
    }
  }

  // All entries, grouped per user.
  const { data: allEntries, error: entErr } = await admin
    .from('extension_entries')
    .select('user_id,entry_id,slate_title,players,synced_at');
  if (entErr) fail(entErr.message);
  const entriesByUser = new Map();
  for (const e of allEntries) {
    if (!entriesByUser.has(e.user_id)) entriesByUser.set(e.user_id, []);
    entriesByUser.get(e.user_id).push(e);
  }

  // Build per-user digests.
  const items = [];
  for (const u of users) {
    const pref = prefMap.get(u.id);
    const optedOut = pref && pref.weekly_digest === false;
    const tier = deriveTier(u.id, subMap, profMap, now);
    const entries = entriesByUser.get(u.id) ?? [];
    const rosters = rowsFromEntries(entries);
    const prior = snapMap.get(u.id)?.summary ?? null;

    if (optedOut) {
      items.push({ email: u.email, userId: u.id, tier, included: false });
      continue;
    }

    const { mode, subject, model, snapshot } = buildDigest({ tier, rosters, entries, priorSnapshot: prior, adp, blog, now });
    const unsubToken = pref?.unsubscribe_token;
    const unsubscribeUrl = unsubToken
      ? `${SITE}/unsubscribe?token=${unsubToken}`
      : `${SITE}/unsubscribe?email=${encodeURIComponent(u.email)}`;
    const rendered = renderUserEmail(model, { subject, unsubscribeUrl });
    items.push({ email: u.email, userId: u.id, tier, included: true, mode, subject, snapshot, ...rendered });
  }

  const eligible = items.filter((i) => i.included).slice(0, args.limit);
  const excluded = items.filter((i) => !i.included);
  const counts = eligible.reduce((m, i) => ((m[i.mode] = (m[i.mode] || 0) + 1), m), {});

  console.log(`\nEligible: ${eligible.length} (personalized ${counts.personalized || 0}, general ${counts.general || 0}); excluded ${excluded.length}`);
  for (const i of items.slice(0, 50)) {
    console.log(`  ${i.included ? i.mode.padEnd(12) : 'excluded   '} ${i.tier.padEnd(5)} ${i.email}`);
  }

  if (args.mode === 'dry' && !args.to) {
    console.log('\nDry run — nothing sent. Use --preview to review, then --send --confirm.');
    return;
  }

  if (args.to) {
    const sample = eligible[0];
    if (!sample) fail('no eligible users to sample');
    await sendResend(apiKey, { to: args.to, subject: sample.subject, html: sample.html, text: sample.text, headers: sample.headers });
    console.log(`Sent sample (${sample.email}'s digest) to ${args.to}`);
    return;
  }

  if (args.mode === 'preview') {
    const preview = renderPreview(items.slice(0, args.limit));
    await sendResend(apiKey, { to: PREVIEW_RECIPIENT, subject: preview.subject, html: preview.html, text: 'Preview (HTML only).' });
    console.log(`\nPreview sent to ${PREVIEW_RECIPIENT}. Review, then run --send --confirm.`);
    return;
  }

  if (args.mode === 'send') {
    if (!args.confirm) fail('refusing to send without --confirm');
    let sent = 0, skipped = 0, failed = 0;
    for (const i of eligible) {
      // Idempotency: skip if a snapshot already exists for this week.
      const existing = snapMap.get(i.userId);
      if (existing && existing.week_start === week) { skipped++; continue; }
      try {
        await sendResend(apiKey, { to: i.email, subject: i.subject, html: i.html, text: i.text, headers: i.headers });
        const { error } = await admin.from('digest_snapshots')
          .upsert({ user_id: i.userId, week_start: week, summary: i.snapshot }, { onConflict: 'user_id,week_start' });
        if (error) throw error;
        sent++;
        console.log(`  OK   ${i.email}`);
      } catch (err) {
        failed++;
        console.error(`  FAIL ${i.email}  ${err.message}`);
      }
    }
    console.log(`\nDone. sent ${sent}, skipped(already-sent) ${skipped}, failed ${failed}.`);
    process.exit(failed === 0 ? 0 : 2);
  }
}

main().catch((e) => fail(e.stack || e.message));
