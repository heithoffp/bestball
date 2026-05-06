#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TEST_RECIPIENT = 'heithoff.patrick@gmail.com';
const FROM = 'Patrick <noreply@bestballexposures.com>';
const REPLY_TO = 'heithoff.patrick@gmail.com';
const SUBJECT = 'Quick update on the Best Ball Exposures Chrome extension';

const PLAIN_TEXT = `Hey,

Wanted to give you a quick heads up. Our Chrome extension (v1.0.3) is sitting in review with the Chrome Web Store right now, and it'll be unavailable for normal install until that wraps up.

Underdog recently started redirecting all traffic from underdogfantasy.com over to underdogsports.com, so the older version of the extension doesn't work anywhere anymore. Until the store review clears, you'll need to install v1.0.3 manually. I put together a quick walkthrough that should get you set up in about 2 minutes:

https://bestballexposures.com/#install-extension

That link works whether you're signed in or not. It covers downloading the extension and loading it through chrome://extensions.

I'll send another note as soon as we're back on the Chrome store. If you hit any snags with the install, just reply to this email and I'll help you through it.

Thanks for sticking with us.

Patrick
Best Ball Exposures
`;

function usage() {
  console.error(`Usage:
  node scripts/send-chrome-review-email.js --test
  node scripts/send-chrome-review-email.js --to a@x.com,b@y.com,c@z.com

Requires RESEND_API_KEY in environment.`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { test: false, recipients: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--test') {
      args.test = true;
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
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('Missing RESEND_API_KEY in environment.');
    process.exit(1);
  }

  const args = parseArgs(process.argv);
  const recipients = args.test ? [TEST_RECIPIENT] : args.recipients;
  if (recipients.length === 0) usage();

  const html = readFileSync(join(__dirname, 'templates', 'chrome-review-email.html'), 'utf8');

  console.log(`Mode: ${args.test ? 'TEST' : 'SEND'}`);
  console.log(`Recipients (${recipients.length}): ${recipients.join(', ')}`);
  console.log('');

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
