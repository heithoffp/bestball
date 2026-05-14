#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TEST_RECIPIENT = 'heithoff.patrick@gmail.com';
const FROM = 'Patrick <support@bestballexposures.com>';
const REPLY_TO = 'bestballexposures@gmail.com';
const SUBJECT = 'Extension updates are moving off the Chrome Web Store';

const PLAIN_TEXT = `Hey,

The BBE extension is moving to a new install location. Reinstall takes 2 minutes:

https://bestballexposures.com/install

What you get on the new version:
- Faster updates (no more waiting on Chrome Web Store review)
- Works on Chrome, Edge, Brave, and Firefox
- Better syncing for large team counts
- Weeks 15/16/17 stack tracking in the draft overlay (next release, once schedules are released)

Why the move: Chrome stopped letting us push updates after Underdog renamed their domain. The change tripped a gambling-policy filter on our store listing. Your current extension still runs, it just can't receive updates anymore.

Your rosters, rankings, and account are safe. They live on our side, not in the extension. Uninstall the old version, install the new one, sign in on the popup, done.

Reply if anything's stuck and I'll help you through it.

Patrick
`;

function usage() {
  console.error(`Usage:
  node scripts/send-extension-migration-email.mjs --test
  node scripts/send-extension-migration-email.mjs --to a@x.com,b@y.com
  node scripts/send-extension-migration-email.mjs --from-supabase   # pull all auth.users emails
  node scripts/send-extension-migration-email.mjs --from-supabase --dry-run   # list recipients, do not send

Requires RESEND_API_KEY in environment (not required with --dry-run).
For --from-supabase, also requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { test: false, recipients: [], fromSupabase: false, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--test') {
      args.test = true;
    } else if (a === '--from-supabase') {
      args.fromSupabase = true;
    } else if (a === '--dry-run') {
      args.dryRun = true;
    } else if (a === '--to') {
      const next = argv[++i];
      if (!next) usage();
      args.recipients = next.split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      console.error(`Unknown argument: ${a}`);
      usage();
    }
  }
  return args;
}

async function fetchSupabaseEmails() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for --from-supabase.');
    process.exit(1);
  }
  const emails = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      throw new Error(`Supabase admin users ${res.status}: ${await res.text()}`);
    }
    const body = await res.json();
    const users = body.users || [];
    for (const u of users) {
      if (u.email) emails.push(u.email);
    }
    if (users.length < 200) break;
    page++;
  }
  return [...new Set(emails)];
}

async function sendOne({ apiKey, to, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      reply_to: REPLY_TO,
      subject: SUBJECT,
      html,
      text: PLAIN_TEXT,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${body}`);
  }
  return body;
}

async function main() {
  const args = parseArgs(process.argv);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey && !args.dryRun) {
    console.error('Missing RESEND_API_KEY in environment.');
    process.exit(1);
  }

  let recipients;
  if (args.test) {
    recipients = [TEST_RECIPIENT];
  } else if (args.fromSupabase) {
    recipients = await fetchSupabaseEmails();
  } else {
    recipients = args.recipients;
  }
  if (recipients.length === 0) usage();

  const html = readFileSync(join(__dirname, 'templates', 'extension-migration-email.html'), 'utf8');

  const mode = args.dryRun ? 'DRY-RUN' : args.test ? 'TEST' : args.fromSupabase ? 'SUPABASE' : 'SEND';
  console.log(`Mode: ${mode}`);
  console.log(`Recipients (${recipients.length}): ${recipients.join(', ')}`);
  console.log('');

  if (args.dryRun) {
    console.log('Dry run: no emails sent.');
    process.exit(0);
  }

  let failures = 0;
  for (const to of recipients) {
    try {
      const result = await sendOne({ apiKey, to, html });
      console.log(`  OK   ${to}  ${result}`);
    } catch (err) {
      failures++;
      console.error(`  FAIL ${to}  ${err.message}`);
    }
  }

  console.log('');
  console.log(`Done. ${recipients.length - failures}/${recipients.length} sent.`);
  process.exit(failures === 0 ? 0 : 2);
}

main();
