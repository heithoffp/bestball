// storage.js — AsyncStorage port of the web app's IndexedDB file store, keeping
// the identical API surface (saveFile/getFile/deleteFile/clearAllData/hasUserData
// plus the cloud-aware sync facade). Files here are small CSV texts (user
// rankings), well within AsyncStorage limits.
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'bbe-file:';

export async function saveFile({ id, type, filename, text }) {
  await AsyncStorage.setItem(PREFIX + id, JSON.stringify({ id, type, filename, text, uploadedAt: Date.now() }));
}

export async function getFile(id) {
  const raw = await AsyncStorage.getItem(PREFIX + id);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function deleteFile(id) {
  await AsyncStorage.removeItem(PREFIX + id);
}

export async function clearAllData() {
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter(k => k.startsWith(PREFIX)));
  // Sign-out / account-deletion hygiene (ADR-030): the on-device portfolio
  // cache and derived-model caches must not survive into another account's
  // session. Dynamic imports keep this module load-safe in node tests.
  try {
    const { clearEntriesCache } = await import('./entriesCache');
    clearEntriesCache();
  } catch { /* fail soft */ }
  try {
    const { cacheClearAll } = await import('./modelCache');
    await cacheClearAll();
  } catch { /* fail soft */ }
}

export async function hasUserData() {
  const keys = await AsyncStorage.getAllKeys();
  return keys.some(k => k.startsWith(PREFIX));
}

// --- Cloud-aware sync facade (identical logic to the web version) ---
import { cloudSaveFile, cloudGetFile, cloudHasUserData } from './cloudStorage';

export async function syncSaveFile({ id, type, filename, text, userId }) {
  await saveFile({ id, type, filename, text });
  if (userId) {
    await cloudSaveFile({ id, type, filename, text, userId });
  }
}

export async function syncGetFile(id, userId) {
  if (userId) {
    try {
      const cloudFile = await cloudGetFile(id, userId);
      if (cloudFile?.__notFound) {
        // Cloud explicitly says file doesn't exist — purge stale local copy
        await deleteFile(id);
        return null;
      }
      if (cloudFile) {
        await saveFile(cloudFile);
        return cloudFile;
      }
    } catch (e) {
      console.warn('Cloud fetch failed, falling back to local', e);
    }
  }
  return getFile(id);
}

export async function syncHasUserData(userId) {
  if (userId) {
    try {
      return await cloudHasUserData(userId);
    } catch {
      // fall through to local
    }
  }
  return hasUserData();
}
