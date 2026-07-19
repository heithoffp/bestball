import { supabase } from './supabaseClient';

const BUCKET = 'user-files';

// Read path diverges from the web source-of-truth here by necessity (TASK-356).
// The web calls supabase.storage.download() and reads the returned Blob with
// Blob.text(), but storage-js resolves download() via response.blob(), and React
// Native's Blob implements neither construction-from-ArrayBuffer nor .text()/
// .arrayBuffer(). So download() throws "Creating blobs from 'ArrayBuffer'..." and
// every cloud fetch silently falls back to local. Instead we sign a short-lived
// URL and read it with fetch(), whose Response.text() IS implemented on RN — the
// same pattern realDraftData.js uses for the boards artifact (ADR-030).
//
// Returns { text } on success, { notFound: true } when the object is absent, or
// { error } for network/other failures. Callers translate these to the __notFound
// / null / file-object contract that storage.js depends on.
async function cloudDownloadText(path) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60);
  if (error) {
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('not found') || error.statusCode === 404 || error.error === 'not_found') {
      return { notFound: true };
    }
    return { error };
  }
  if (!data?.signedUrl) return { error: new Error('No signed URL returned') };

  const res = await fetch(data.signedUrl);
  if (res.status === 404) return { notFound: true };
  if (!res.ok) return { error: new Error(`HTTP ${res.status}`) };
  return { text: await res.text() };
}

export async function cloudSaveFile({ id, type, filename, text, userId }) {
  const csvPath = `${userId}/${id}.csv`;
  const metaPath = `${userId}/${id}.meta.json`;

  const { error: csvError } = await supabase.storage
    .from(BUCKET)
    .upload(csvPath, text, { contentType: 'text/csv', upsert: true });
  if (csvError) throw csvError;

  const meta = JSON.stringify({ type, filename, uploadedAt: Date.now() });
  const { error: metaError } = await supabase.storage
    .from(BUCKET)
    .upload(metaPath, meta, { contentType: 'application/json', upsert: true });
  if (metaError) throw metaError;
}

export async function cloudGetFile(id, userId) {
  const csvPath = `${userId}/${id}.csv`;
  const metaPath = `${userId}/${id}.meta.json`;

  const csvResult = await cloudDownloadText(csvPath);
  // Distinguish explicit not-found from network/other errors so callers can
  // invalidate their local cache rather than silently serving stale data.
  if (csvResult.notFound) return { __notFound: true };
  if (csvResult.error || typeof csvResult.text !== 'string') return null;
  const text = csvResult.text;

  let meta = { type: id, filename: `${id}.csv`, uploadedAt: Date.now() };
  const metaResult = await cloudDownloadText(metaPath);
  if (typeof metaResult.text === 'string') {
    try {
      meta = JSON.parse(metaResult.text);
    } catch { /* use defaults */ }
  }

  return { id, type: meta.type, filename: meta.filename, text, uploadedAt: meta.uploadedAt };
}

export async function cloudHasUserData(userId) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(userId, { limit: 10 });
  if (error) throw error;
  return data.some(f => f.name.endsWith('.csv'));
}

export async function cloudDeleteFile(id, userId) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([`${userId}/${id}.csv`, `${userId}/${id}.meta.json`]);
  if (error) throw error;
}

export async function cloudClearAllData(userId) {
  const { data, error: listError } = await supabase.storage
    .from(BUCKET)
    .list(userId);
  if (listError) throw listError;
  if (!data || data.length === 0) return;

  const paths = data.map(f => `${userId}/${f.name}`);
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) throw error;
}
