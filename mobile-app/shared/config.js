// Publishable client configuration. These values also ship in the public web
// bundle (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) — they are not secrets.
// EXPO_PUBLIC_* env vars override for local experiments.

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://cwjorshxkbbxjvhqxdlh.supabase.co';

export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_QO_54PsAAhC3FUclrgm7HQ_U6igw1u6';

export const SUPABASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

// The web app is the desktop companion — roster sync (Chrome extension),
// subscription checkout, and rankings CSV upload all live there.
export const WEB_APP_URL = 'https://bestballexposures.com';
export const INSTALL_URL = `${WEB_APP_URL}/install`;
export const BLOG_URL = `${WEB_APP_URL}/blog`;
export const X_URL = 'https://x.com/BBExposures';
