const DB_NAME = 'bestball-db';
const DB_VERSION = 1;
const STORE_NAME = 'files';

let dbConnection = null;

function openDB() {
  if (dbConnection) return Promise.resolve(dbConnection);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = (e) => {
      dbConnection = e.target.result;
      dbConnection.onclose = () => { dbConnection = null; };
      resolve(dbConnection);
    };

    request.onerror = (e) => reject(e.target.error);
  });
}

export async function saveFile({ id, type, filename, text }) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ id, type, filename, text, uploadedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function getFile(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function deleteFile(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function clearAllData() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function hasUserData() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).count();
    request.onsuccess = () => resolve(request.result > 0);
    request.onerror = (e) => reject(e.target.error);
  });
}

// --- Cloud-aware sync facade ---
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
