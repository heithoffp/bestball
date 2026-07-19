#!/usr/bin/env node
/**
 * publish-adp.mjs — Publish the mobile ADP artifact to Supabase Storage (ADR-031).
 *
 * ADP snapshots are the app's most frequently changing data. Instead of a native
 * rebuild + App Store review per refresh, the mobile app fetches this artifact
 * from a PUBLIC bucket, cache-first with the bundled copy as fallback. Publishing
 * an update is: `cd mobile-app && npm run build:data`, then this script.
 *
 * Reads the compacted bundle written by mobile-app/scripts/build-data.mjs and
 * wraps it with a formatVersion (the script<->client contract — ADR-031 / ADR-018).
 * The object name carries the same major version (-v1); a breaking shape change
 * bumps BOTH the object name here and ADP_FORMAT_VERSION in shared/adpArtifact.js.
 *
 * Usage:
 *   node scripts/publish-adp.mjs            # build wrapper + upload
 *   node scripts/publish-adp.mjs --dry-run  # report only, no upload
 *
 * Requires <repoRoot>/.env.local with:
 *   SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...   # service role — never commit
 *
 * Setup once: cd scripts && npm install
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
loadEnv({ path: join(repoRoot, '.env.local') });

const BUCKET = 'app-data-public';
const OBJECT = 'adp-snapshots-v1.json';
const FORMAT_VERSION = 1; // must match ADP_FORMAT_VERSION in mobile-app/shared/adpArtifact.js
const SOURCE = join(repoRoot, 'mobile-app', 'shared', 'data', 'adpSnapshots.json');

const DRY_RUN = process.argv.includes('--dry-run');

let bundle;
try {
  bundle = JSON.parse(readFileSync(SOURCE, 'utf8'));
} catch (err) {
  console.error(`error: could not read ${SOURCE}: ${err.message}`);
  console.error('run `cd mobile-app && npm run build:data` first.');
  process.exit(1);
}
if (!Array.isArray(bundle?.names) || !Array.isArray(bundle?.snapshots)) {
  console.error('error: source is not a valid compacted ADP bundle ({ names, snapshots })');
  process.exit(1);
}

const artifact = {
  formatVersion: FORMAT_VERSION,
  generatedAt: new Date().toISOString(),
  names: bundle.names,
  snapshots: bundle.snapshots,
};
const body = JSON.stringify(artifact);
console.log(
  `ADP artifact: ${bundle.snapshots.length} snapshots, ${bundle.names.length} names, `
  + `${(body.length / 1e6).toFixed(2)} MB JSON (formatVersion ${FORMAT_VERSION})`,
);

if (DRY_RUN) {
  console.log('--dry-run: skipping upload (no credentials required)');
  process.exit(0);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('error: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);

// Create the bucket public on first run; flip an existing private bucket to
// public if it somehow predates this script. service_role bypasses RLS.
async function ensureBucket() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`listBuckets failed: ${error.message}`);
  const existing = buckets?.find((b) => b.name === BUCKET);
  if (existing) {
    if (!existing.public) {
      const { error: updErr } = await supabase.storage.updateBucket(BUCKET, { public: true });
      if (updErr) throw new Error(`updateBucket failed: ${updErr.message}`);
      console.log(`updated bucket "${BUCKET}" to public`);
    }
    return;
  }
  const { error: createErr } = await supabase.storage.createBucket(BUCKET, { public: true });
  if (createErr) throw new Error(`createBucket failed: ${createErr.message}`);
  console.log(`created public bucket "${BUCKET}"`);
}

await ensureBucket();
const { error: upErr } = await supabase.storage
  .from(BUCKET)
  .upload(OBJECT, body, {
    upsert: true,
    contentType: 'application/json',
    cacheControl: '60', // short TTL so a refresh propagates within a minute
  });
if (upErr) {
  console.error(`error: upload failed: ${upErr.message}`);
  process.exit(1);
}
console.log(
  `Uploaded ${BUCKET}/${OBJECT} (public): `
  + `${url}/storage/v1/object/public/${BUCKET}/${OBJECT}`,
);
