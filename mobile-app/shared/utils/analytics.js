// analytics.js — mobile stub for the web's Vercel Analytics shim. Keeps the
// trackEvent(name, props) call sites identical; wire a mobile analytics
// provider here later if wanted.
export function trackEvent(name, props) {
  if (__DEV__) {
    console.log(`[analytics] ${name}`, props ?? '');
  }
}
