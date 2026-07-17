// Publishable client configuration. These values also ship in the public web
// bundle (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) — they are not secrets.
// EXPO_PUBLIC_* env vars override for local experiments.

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://cwjorshxkbbxjvhqxdlh.supabase.co';

export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_QO_54PsAAhC3FUclrgm7HQ_U6igw1u6';

export const SUPABASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

// The web app is the desktop companion — roster sync (Chrome extension) and
// rankings CSV upload live there. Subscription checkout is in-app (ADR-027).
export const WEB_APP_URL = 'https://bestballexposures.com';
export const INSTALL_URL = `${WEB_APP_URL}/install`;
export const BLOG_URL = `${WEB_APP_URL}/blog`;
export const X_URL = 'https://x.com/BBExposures';

// Stripe price IDs — publishable identifiers (like the anon key), same values
// as the web build's VITE_STRIPE_PRO_*_PRICE_ID env vars. Live IDs are injected
// at EAS build time via EXPO_PUBLIC_* env; the empty default disables the
// Subscribe button rather than pointing at the wrong Stripe mode.
export const STRIPE_PRO_MONTHLY_PRICE_ID =
  process.env.EXPO_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID || '';
export const STRIPE_PRO_YEARLY_PRICE_ID =
  process.env.EXPO_PUBLIC_STRIPE_PRO_YEARLY_PRICE_ID || '';

// Hosted https return page for Stripe Checkout / billing portal (Stripe
// requires https URLs); it deep-links back to bbexposures://checkout-return.
export const CHECKOUT_RETURN_URL = `${WEB_APP_URL}/mobile/checkout-return`;
export const CHECKOUT_DEEP_LINK = 'bbexposures://checkout-return';
