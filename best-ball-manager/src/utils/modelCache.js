// src/utils/modelCache.js
// Tiny IndexedDB key-value store for derived model caches (pod advance odds,
// combo frequency tables). Deliberately a SEPARATE database from storage.js:
// that store's hasUserData() gates app flows on record count, so cache entries
// must never land there. Every operation fails soft — a broken/unavailable
// IndexedDB (private windows, quota) just means caches don't persist.

const DB_NAME = 'bbe-model-cache';
const DB_VERSION = 1;
const STORE = 'kv';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
  return dbPromise;
}

/** Read a cached value. Resolves null on any failure or miss. */
export async function cacheGet(key) {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Write a cached value (structured-clonable). Best-effort — never throws. */
export async function cachePut(key, value) {
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // best-effort
  }
}
