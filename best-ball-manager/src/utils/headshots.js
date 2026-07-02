// headshots.js — resolves a player name to a Sleeper CDN headshot URL (TASK-298
// direction: Sleeper CDN, keyless, backed by a bundled name -> player-id map that
// scripts/build-headshot-map.mjs regenerates). Browser-only: the JSON import is a
// Vite-ism, so keep this module out of the Node-loadable arenaSnapshot chain —
// components look faces up at render time; snapshots never store image URLs.
//
// Misses are normal (retired players, deep rookies, name-format drift) and cheap:
// callers keep the position-colored monogram and only fade the photo in when the
// image actually loads.

import map from '../data/sleeperHeadshots.json';
import { headshotNameKey } from './headshotName.js';

/**
 * Sleeper headshot URL for a player, or null when the name doesn't resolve.
 * Position (when given) disambiguates shared names before the plain-name key.
 */
export function headshotUrl(name, position) {
  const key = headshotNameKey(name);
  if (!key) return null;
  const pos = String(position || '').toUpperCase();
  const id = (pos && map.byNamePos[`${key}|${pos}`]) || map.byName[key] || null;
  return id ? `https://sleepercdn.com/content/nfl/players/thumb/${id}.jpg` : null;
}

/**
 * Sleeper team-logo URL for a DST/DEF roster slot, or null without a team.
 * (Defense "players" have no headshot; the franchise mark is their face.)
 */
export function teamLogoUrl(teamAbbrev) {
  const t = String(teamAbbrev || '').trim().toLowerCase();
  return t && t !== 'n/a' && t !== 'fa'
    ? `https://sleepercdn.com/images/team_logos/nfl/${t}.png`
    : null;
}
