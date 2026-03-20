import { supabase } from './supabaseClient';

const BUCKET = 'user-files';

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

  const { data: csvData, error: csvError } = await supabase.storage
    .from(BUCKET)
    .download(csvPath);
  if (csvError) return null;

  const text = await csvData.text();

  const { data: metaData, error: metaError } = await supabase.storage
    .from(BUCKET)
    .download(metaPath);

  let meta = { type: id, filename: `${id}.csv`, uploadedAt: Date.now() };
  if (!metaError && metaData) {
    try {
      meta = JSON.parse(await metaData.text());
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
