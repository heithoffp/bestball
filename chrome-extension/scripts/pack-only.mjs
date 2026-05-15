#!/usr/bin/env node
// One-shot packer: builds .crx + source .zip from dist/ without doing any
// git operations or changelog/version mutation. Used when bundling artifacts
// alongside an in-flight working tree (parallel agent edits). Mirrors the
// pack step of scripts/release.mjs.
import { mkdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { deriveExtensionId, packCrx } from './lib/crx-pack.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const RELEASES = path.join(ROOT, 'releases');
const MANIFEST = path.join(ROOT, 'manifest.json');

loadEnv({ path: path.join(ROOT, '.env') });

const keyPath = process.env.BBE_CRX_PRIVATE_KEY_PATH;
const declaredId = process.env.BBE_EXTENSION_ID;
if (!keyPath) throw new Error('BBE_CRX_PRIVATE_KEY_PATH missing');
if (!declaredId) throw new Error('BBE_EXTENSION_ID missing');
await access(keyPath);

const derivedId = await deriveExtensionId(keyPath);
if (derivedId !== declaredId) {
  throw new Error(`Signing key produces ${derivedId}, .env declares ${declaredId}`);
}

const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
const VERSION = manifest.version;

await mkdir(RELEASES, { recursive: true });
const crxPath = path.join(RELEASES, `bestballexposures-extension-${VERSION}.crx`);
const zipPath = path.join(RELEASES, `bestballexposures-extension-${VERSION}.zip`);

await packCrx({ srcDir: DIST, keyPath, crxPath, zipPath });

console.log(`Packed v${VERSION}:`);
console.log(`  ${crxPath}`);
console.log(`  ${zipPath}`);
