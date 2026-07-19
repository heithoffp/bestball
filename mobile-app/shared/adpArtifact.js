// adpArtifact.js — remote ADP snapshot artifact with on-device cache and
// bundled fallback (ADR-031, mobile-only). ADP is the app's most frequently
// changing data; hosting it as a public Storage object (the ADR-018 pattern)
// lets a refresh ship via a file upload instead of a native rebuild + review.
//
// Load order (cache-first, stale-while-revalidate — ADR-030):
//   1. loadAdp() (in bundledData.js) renders immediately from the cached remote
//      copy, or the bundled copy shipped in the binary when there is no cache.
//   2. refreshAdp() fetches the remote artifact in the background; on a valid,
//      changed payload it rewrites the cache and returns it so the caller can
//      re-process. Any failure (offline, 404, bad JSON, unsupported
//      formatVersion) resolves to null and the cached/bundled copy stands.
//
// The remote payload is the byte-identical compacted shape written by
// scripts/build-data.mjs ({ names, snapshots }) wrapped with a formatVersion by
// scripts/publish-adp.mjs. The bundled copy is trusted (it shipped together with
// this code) and needs no version check; only the remote copy is validated.
import { File, Paths } from 'expo-file-system';
import { SUPABASE_URL } from './config';

// Bump when scripts/build-data.mjs changes the compacted ADP shape. An installed
// app ignores any remote payload whose formatVersion exceeds this and keeps its
// bundled copy (paired with the -v1 object name — ADR-031 / ADR-018).
export const ADP_FORMAT_VERSION = 1;

const REMOTE_URL =
  `${SUPABASE_URL}/storage/v1/object/public/app-data-public/adp-snapshots-v1.json`;

const CACHE_FILENAME = 'bbe-adp-cache-v1.json';

function cacheFile() {
  return new File(Paths.document, CACHE_FILENAME);
}

/**
 * Shape/version guard for a remote payload. Returns true only for the compacted
 * ADP shape this build understands; anything else falls back to the bundled copy.
 */
export function validateAdpPayload(p) {
  return !!p
    && typeof p === 'object'
    && Number.isFinite(p.formatVersion)
    && p.formatVersion <= ADP_FORMAT_VERSION
    && Array.isArray(p.names)
    && Array.isArray(p.snapshots);
}

/**
 * Read the cached remote artifact. Returns the payload ({ names, snapshots, ... })
 * or null on any miss: no file, corrupt JSON, or a payload that no longer
 * validates. Corrupt/incompatible files are deleted so they can't wedge future
 * launches. Async — the file read stays off the JS thread (expo-file-system 57
 * exposes File.text() as async; textSync is the sync variant).
 */
export async function readAdpCache() {
  const file = cacheFile();
  try {
    if (!file.exists) return null;
    const payload = JSON.parse(await file.text());
    if (!validateAdpPayload(payload)) {
      try { file.delete(); } catch { /* already gone */ }
      return null;
    }
    return payload;
  } catch {
    try { file.delete(); } catch { /* already gone */ }
    return null;
  }
}

/**
 * Persist a validated remote payload. Fail-soft: a write failure just means the
 * next launch refetches.
 */
export function writeAdpCache(payload) {
  const file = cacheFile();
  try {
    if (!file.exists) file.create();
    file.write(JSON.stringify(payload));
  } catch {
    /* fail soft */
  }
}

/** Fetch + validate the remote artifact. Returns the payload or null on any failure. */
export async function fetchRemoteAdp() {
  try {
    const res = await fetch(REMOTE_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const payload = await res.json();
    return validateAdpPayload(payload) ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Background refresh: fetch the remote artifact and, when it differs from the
 * cached copy, rewrite the cache and return the new payload so the caller can
 * re-process. Returns null when the fetch failed/invalid or the artifact is
 * unchanged (nothing to re-process). Fail-soft — never throws; the cached or
 * bundled copy already rendered.
 */
export async function refreshAdp() {
  const remote = await fetchRemoteAdp();
  if (!remote) return null;
  const cached = await readAdpCache();
  // generatedAt is stamped per publish (scripts/publish-adp.mjs); equal stamps
  // mean the cached copy is already this artifact — skip the re-process.
  if (cached && cached.generatedAt && remote.generatedAt
      && cached.generatedAt === remote.generatedAt) {
    return null;
  }
  writeAdpCache(remote);
  return remote;
}

/** Remove the ADP cache (e.g. troubleshooting / forced refetch). Fail-soft. */
export function clearAdpCache() {
  try {
    const file = cacheFile();
    if (file.exists) file.delete();
  } catch {
    /* fail soft */
  }
}
