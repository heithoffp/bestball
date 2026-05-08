#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { deriveExtensionId, packCrx } from './lib/crx-pack.mjs';
import { renderUpdatesXml, resolveDownloadUrl } from './lib/updates-xml.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const RELEASES = path.join(ROOT, 'releases');
const MANIFEST = path.join(ROOT, 'manifest.json');
const PKG = path.join(ROOT, 'package.json');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');
const PLACEHOLDER = 'TODO: fill in changes';

loadEnv({ path: path.join(ROOT, '.env') });

const args = parseArgs(process.argv.slice(2));
if (!args.version) fatal('Missing required --version=X.Y.Z');
if (!/^\d+\.\d+\.\d+$/.test(args.version)) fatal(`Invalid semver: ${args.version}`);

const VERSION = args.version;
const TAG = `extension-v${VERSION}`;
const DRY = args.dryRun;
const ALLOW_EMPTY_CHANGELOG = args.allowEmptyChangelog;

await main();

async function main() {
  step(`Release ${VERSION} ${DRY ? '(DRY RUN)' : ''}`);

  const keyPath = process.env.BBE_CRX_PRIVATE_KEY_PATH;
  if (!keyPath) fatal('BBE_CRX_PRIVATE_KEY_PATH is not set in .env');
  try { await access(keyPath); } catch {
    fatal(`Signing key not found at ${keyPath}. Restore from offline backup before continuing — see RELEASE.md.`);
  }

  const declaredId = process.env.BBE_EXTENSION_ID;
  if (!declaredId) fatal('BBE_EXTENSION_ID is not set in .env');

  const urlTemplate = process.env.BBE_CRX_DOWNLOAD_URL_TEMPLATE;
  if (!urlTemplate) fatal('BBE_CRX_DOWNLOAD_URL_TEMPLATE is not set in .env');

  step('Verifying signing key matches declared extension ID');
  const derivedId = await deriveExtensionId(keyPath);
  if (derivedId !== declaredId) {
    fatal(
      `Signing key produces extension ID '${derivedId}', but .env declares '${declaredId}'.\n` +
      `If this is a NEW key, you are about to break auto-update for every installed user.\n` +
      `Recover the original key from offline backup, or update BBE_EXTENSION_ID intentionally.`
    );
  }

  step('Pre-flight: clean working tree');
  const dirty = run('git status --porcelain', { cwd: ROOT }).trim();
  if (dirty) fatal(`Working tree is dirty:\n${dirty}`);

  step('Pre-flight: tag does not exist');
  const tags = run('git tag --list', { cwd: ROOT }).split('\n');
  if (tags.includes(TAG)) fatal(`Tag ${TAG} already exists.`);

  step('Pre-flight: version is monotonically increasing');
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  const pkg = JSON.parse(await readFile(PKG, 'utf8'));
  if (compareVersions(VERSION, manifest.version) <= 0) {
    fatal(`Version ${VERSION} is not greater than manifest.json version ${manifest.version}`);
  }

  step('Building extension (vite)');
  if (!DRY) run('npm run build', { cwd: ROOT, stdio: 'inherit' });

  step('Bumping versions in manifest.json and package.json');
  if (!DRY) {
    manifest.version = VERSION;
    pkg.version = VERSION;
    await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
    await writeFile(PKG, JSON.stringify(pkg, null, 2) + '\n');
    const distManifestPath = path.join(DIST, 'manifest.json');
    if (existsSync(distManifestPath)) {
      const distManifest = JSON.parse(await readFile(distManifestPath, 'utf8'));
      distManifest.version = VERSION;
      await writeFile(distManifestPath, JSON.stringify(distManifest, null, 2));
    }
  }

  step('Packaging .crx and source .zip');
  await mkdir(RELEASES, { recursive: true });
  const crxPath = path.join(RELEASES, `bestballexposures-extension-${VERSION}.crx`);
  const zipPath = path.join(RELEASES, `bestballexposures-extension-${VERSION}.zip`);
  if (!DRY) {
    await packCrx({ srcDir: DIST, keyPath, crxPath, zipPath });
  }

  step('Generating updates.xml snippet');
  const downloadUrl = resolveDownloadUrl(urlTemplate, VERSION);
  const xml = renderUpdatesXml({ extensionId: declaredId, version: VERSION, downloadUrl });
  const xmlPath = path.join(RELEASES, `updates-${VERSION}.xml`);
  if (!DRY) await writeFile(xmlPath, xml);

  step('Updating CHANGELOG.md');
  await prependChangelog(VERSION);
  if (!DRY && !ALLOW_EMPTY_CHANGELOG) {
    const cl = await readFile(CHANGELOG, 'utf8');
    if (cl.includes(PLACEHOLDER)) {
      fatal(
        `CHANGELOG.md still contains "${PLACEHOLDER}". Fill in the changes for ${VERSION}, ` +
        `then re-run (or pass --allow-empty-changelog to skip this guard).`
      );
    }
  }

  step(`Committing and tagging ${TAG}`);
  if (!DRY) {
    run(`git add manifest.json package.json CHANGELOG.md`, { cwd: ROOT });
    run(`git commit -m "chore(extension): release v${VERSION}"`, { cwd: ROOT });
    run(`git tag ${TAG}`, { cwd: ROOT });
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Release v${VERSION} prepared${DRY ? ' (DRY RUN — no files written)' : ''}.`);
  console.log('='.repeat(60));
  if (!DRY) {
    console.log(`Artifacts:`);
    console.log(`  ${crxPath}`);
    console.log(`  ${zipPath}`);
    console.log(`  ${xmlPath}`);
    console.log(`Tag (local, not pushed): ${TAG}`);
  }
  console.log('\nupdates.xml snippet to merge into the hosted manifest:');
  console.log(xml);
  console.log('REMINDER: confirm your offline backup of the .crx signing key is current.');
  console.log('See RELEASE.md for the backup checklist. Losing this key bricks auto-update for every installed user.');
}

async function prependChangelog(version) {
  const date = new Date().toISOString().slice(0, 10);
  const header = `## [${version}] - ${date}\n\n- ${PLACEHOLDER}\n\n`;
  let existing = '';
  if (existsSync(CHANGELOG)) existing = await readFile(CHANGELOG, 'utf8');
  if (!existing.startsWith('# Changelog')) {
    existing = `# Changelog\n\nAll notable changes to the BBE Chrome extension are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/).\n\n${existing}`;
  }
  const [head, ...rest] = existing.split(/\n(?=## )/);
  const next = [head, header.trimEnd(), ...rest].filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  if (!DRY) await writeFile(CHANGELOG, next);
}

function parseArgs(argv) {
  const out = { dryRun: false, allowEmptyChangelog: false };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--allow-empty-changelog') out.allowEmptyChangelog = true;
    else if (a.startsWith('--version=')) out.version = a.slice('--version='.length);
  }
  return out;
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', ...opts });
}

function step(msg) {
  console.log(`\n→ ${msg}`);
}

function fatal(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}
