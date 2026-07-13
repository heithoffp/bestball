// arenaFeatured.js — the Arena's featured tournament (TASK-301). With a small
// daily audience, votes spread across every synced tournament dilute the Elo
// signal, so the WHOLE Arena presents one featured queue for now: pairing,
// leaderboard, and My Teams are all scoped to Best Ball Mania VII (the full
// database is retained — other slates/platforms just aren't presented yet).
// Matched against the frozen display_snapshot's tournamentTitle OR slateTitle
// (board teams registered before tournament attribution carry only a slate
// title). Queries filter on the arena_teams.featured GENERATED column
// (migration 016) — index-served, instead of ilike-scanning JSONB per request.
// Keep in sync with the server-side constants in
// supabase/functions/_shared/arena.ts AND the generated-column expression in
// supabase/migrations/016_arena_featured_flag_and_app_data_bucket.sql.

export const FEATURED_TOURNAMENT = {
  label: 'Best Ball Mania VII',
  shortLabel: 'BBM7',
  match: /best ball mania/i,
};

/** True when a display snapshot belongs to the featured tournament. */
export function isFeaturedSnapshot(snapshot) {
  return (
    FEATURED_TOURNAMENT.match.test(snapshot?.tournamentTitle || '') ||
    FEATURED_TOURNAMENT.match.test(snapshot?.slateTitle || '')
  );
}
