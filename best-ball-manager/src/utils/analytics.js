import { track } from '@vercel/analytics';

export function trackEvent(name, props = {}) {
  track(name, props);
}
