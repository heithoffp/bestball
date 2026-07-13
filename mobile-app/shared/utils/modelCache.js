// modelCache.js — AsyncStorage-backed key-value store for derived model caches
// (pod advance odds, combo frequency tables). Mobile port of the web's IndexedDB
// version; keeps the same fail-soft contract — a broken store just means caches
// don't persist.
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'bbe-model-cache:';

export async function cacheGet(key) {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw == null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function cachePut(key, value) {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* fail soft */
  }
}

export async function cacheDelete(key) {
  try {
    await AsyncStorage.removeItem(PREFIX + key);
  } catch {
    /* fail soft */
  }
}

export async function cacheClearAll() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter(k => k.startsWith(PREFIX)));
  } catch {
    /* fail soft */
  }
}
