// arenaFeatured.js — the Arena's featured tournament (TASK-301). With a small
// daily audience, votes spread across every synced tournament dilute the Elo
// signal, so pairing and the default leaderboard view concentrate on one featured
// queue. Matched against the frozen display_snapshot's tournamentTitle OR
// slateTitle (board teams carry only a slate title). Keep in sync with the
// server-side constants in supabase/functions/_shared/arena.ts.

export const FEATURED_TOURNAMENT = {
  label: 'Best Ball Mania',
  // PostgREST or() filter string — `*` is the ilike wildcard in URL filter syntax.
  orFilter:
    'display_snapshot->>tournamentTitle.ilike.*best ball mania*,' +
    'display_snapshot->>slateTitle.ilike.*best ball mania*',
  match: /best ball mania/i,
};

/** True when a display snapshot belongs to the featured tournament. */
export function isFeaturedSnapshot(snapshot) {
  return (
    FEATURED_TOURNAMENT.match.test(snapshot?.tournamentTitle || '') ||
    FEATURED_TOURNAMENT.match.test(snapshot?.slateTitle || '')
  );
}
