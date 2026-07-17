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

// Apple StoreKit 2 product IDs for the auto-renewable Pro subscription (ADR-028).
// These must exactly match the product IDs created in the App Store Connect
// subscription group. Injected at EAS build time via EXPO_PUBLIC_* env; the empty
// default disables the Subscribe button rather than requesting an unknown product.
export const APPLE_PRO_MONTHLY_PRODUCT_ID =
  process.env.EXPO_PUBLIC_APPLE_PRO_MONTHLY_PRODUCT_ID || '';
export const APPLE_PRO_YEARLY_PRODUCT_ID =
  process.env.EXPO_PUBLIC_APPLE_PRO_YEARLY_PRODUCT_ID || '';

// Google Sign-In OAuth client IDs (ADR-029). The iOS client ID identifies the
// native app; the web (server) client ID is the audience Supabase validates the
// returned ID token against — it must match the Google provider config in the
// Supabase dashboard. Injected at EAS build time via EXPO_PUBLIC_*; the empty
// default hides the Google button rather than starting an unconfigured flow.
export const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';

// Apple's account-level subscription management screen. "Manage subscription"
// for an IAP-purchased account deep-links here (Stripe-purchased accounts still
// use the Stripe billing portal — see SubscriptionContext.openBillingPortal).
export const APPLE_MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';
