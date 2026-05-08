#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const RELEASES = path.join(ROOT, 'releases');
const MANIFEST = path.join(ROOT, 'manifest.json');

loadEnv({ path: path.join(ROOT, '.env') });

const args = parseArgs(process.argv.slice(2));
const CHANNEL = args.channel || 'unlisted';
if (!['unlisted', 'listed'].includes(CHANNEL)) fatal(`--channel must be unlisted or listed (got ${CHANNEL})`);

await main();

async function main() {
  const apiKey = process.env.AMO_JWT_ISSUER;
  const apiSecret = process.env.AMO_JWT_SECRET;
  if (!apiKey) fatal('AMO_JWT_ISSUER is not set in .env. Generate at https://addons.mozilla.org/developers/addon/api/key/');
  if (!apiSecret) fatal('AMO_JWT_SECRET is not set in .env.');

  if (!existsSync(DIST)) fatal(`dist/ does not exist. Run "npm run build" (or "npm run release") first.`);
  if (!existsSync(path.join(DIST, 'manifest.json'))) fatal(`dist/manifest.json missing — vite build did not run cleanly.`);

  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  const version = manifest.version;
  const geckoId = manifest.browser_specific_settings?.gecko?.id;
  if (!geckoId) fatal('manifest.json is missing browser_specific_settings.gecko.id — Firefox cannot sign without it.');

  step(`Signing Firefox extension v${version} (channel: ${CHANNEL})`);
  await mkdir(RELEASES, { recursive: true });

  // web-ext sign downloads the signed .xpi into --artifacts-dir.
  // For unlisted: Mozilla automated signing; expect a few minutes.
  // For listed: submission goes into AMO review queue.
  const cmd = [
    'npx web-ext sign',
    `--source-dir="${DIST}"`,
    `--artifacts-dir="${RELEASES}"`,
    `--channel=${CHANNEL}`,
    `--api-key="${apiKey}"`,
    `--api-secret="${apiSecret}"`,
  ].join(' ');

  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
  } catch (err) {
    fatal(`web-ext sign failed. See output above. Common causes:\n` +
          `  - Wrong API credentials\n` +
          `  - gecko.id collision with an existing AMO entry\n` +
          `  - Manifest validation errors (run "npx web-ext lint --source-dir=dist")\n`);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Firefox signing complete (channel: ${CHANNEL}).`);
  console.log('='.repeat(60));
  console.log(`Look in ${RELEASES} for the signed .xpi.`);
  console.log(`Rename to bestballexposures-extension-${version}.xpi if web-ext used a different name.`);
  console.log(`Test by dragging the .xpi onto about:addons in a real Firefox profile.`);
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    if (a.startsWith('--channel=')) out.channel = a.slice('--channel='.length);
  }
  return out;
}

function step(msg) { console.log(`\n→ ${msg}`); }
function fatal(msg) { console.error(`\n✗ ${msg}`); process.exit(1); }
