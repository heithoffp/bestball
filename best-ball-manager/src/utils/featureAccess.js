// Feature access configuration based on TASK-002 pricing spec.
// Minimum tier required to access each tab feature.
const FEATURE_ACCESS = {
  dashboard:    'guest',
  exposures:    'guest',
  timeseries:   'pro',
  help:         'guest',
  draftflow:    'pro',
  rosters:      'pro',
  rankings:     'pro',
  combo:        'pro',
  construction: 'pro',
};

const TIER_LEVEL = { guest: 0, free: 1, pro: 2 };

export function canAccessFeature(tier, featureKey) {
  const required = FEATURE_ACCESS[featureKey] ?? 'pro';
  return TIER_LEVEL[tier] >= TIER_LEVEL[required];
}
