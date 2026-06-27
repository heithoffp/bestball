// Feature access configuration based on TASK-002 pricing spec.
// Minimum tier required to access each tab feature.
const FEATURE_ACCESS = {
  dashboard:    'guest',
  exposures:    'guest',
  timeseries:   'pro',
  help:         'guest',
  draftflow:    'pro',
  rosters:      'guest',
  rankings:     'pro',
  combo:        'pro',
  construction: 'pro',
  arena:        'guest',   // viewing + voting are free (viral top-of-funnel)
  arena_enroll: 'pro',     // entering your own teams to be ranked is paid (ADR-013)
};

const TIER_LEVEL = { guest: 0, free: 1, pro: 2 };

export function canAccessFeature(tier, featureKey) {
  const required = FEATURE_ACCESS[featureKey] ?? 'pro';
  return TIER_LEVEL[tier] >= TIER_LEVEL[required];
}
