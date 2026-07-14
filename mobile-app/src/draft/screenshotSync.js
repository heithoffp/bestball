// screenshotSync.js — session-scoped sweep of new iOS screenshots (the v1
// "manual shutter" FrameSource). Reads only screenshots taken after the
// session started; images never leave the device (ADR-019 invariants).
import * as MediaLibrary from 'expo-media-library/legacy';

export async function ensurePhotoPermission() {
  try {
    const current = await MediaLibrary.getPermissionsAsync();
    if (current.granted || current.accessPrivileges === 'limited') return true;
    const res = await MediaLibrary.requestPermissionsAsync();
    return res.granted || res.accessPrivileges === 'limited';
  } catch {
    return false;
  }
}

/**
 * Screenshots created after `sinceMs`, excluding already-processed asset ids,
 * oldest first (so ledger observations arrive in draft order).
 */
export async function fetchNewScreenshots({ sinceMs, excludeIds = new Set(), max = 10 }) {
  const page = await MediaLibrary.getAssetsAsync({
    first: 24,
    mediaType: 'photo',
    mediaSubtypes: ['screenshot'],
    createdAfter: sinceMs,
    sortBy: [['creationTime', false]],
  });
  return (page.assets || [])
    .filter(a => !excludeIds.has(a.id))
    .sort((a, b) => a.creationTime - b.creationTime)
    .slice(-max)
    .map(a => ({ id: a.id, uri: a.uri, creationTime: a.creationTime }));
}
