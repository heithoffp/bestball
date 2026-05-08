// Browser detection for the /install page.
// Returns one of: 'chrome' | 'edge' | 'chromium-other' | 'firefox' | 'safari' | 'mobile' | 'unknown'.
//
// Per ADR-007, all Chromium variants now share a single ZIP + load-unpacked install flow.
// The chrome / edge / chromium-other discriminator is preserved for analytics and per-browser
// copy hints (e.g., chrome:// vs edge:// extensions URL), but routing is unified.
export function detectBrowser() {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';

  if (/Android|iPhone|iPad|iPod/i.test(ua)) return 'mobile';

  const brands = navigator.userAgentData?.brands || [];
  const hasBrand = (name) => brands.some((b) => b.brand === name);
  if (hasBrand('Microsoft Edge')) return 'edge';

  if (/Edg\//.test(ua)) return 'edge';

  if (/Firefox\//.test(ua)) return 'firefox';

  const isChromium =
    /Chrome\//.test(ua) || hasBrand('Google Chrome') || hasBrand('Chromium');
  if (isChromium) {
    const isBrave = typeof navigator.brave?.isBrave === 'function';
    const isArc = /Arc\//.test(ua);
    const isOpera = /OPR\//.test(ua) || hasBrand('Opera');
    const isVivaldi = /Vivaldi\//.test(ua);
    if (isBrave || isArc || isOpera || isVivaldi) return 'chromium-other';
    if (hasBrand('Google Chrome') || /Chrome\//.test(ua)) return 'chrome';
    return 'chromium-other';
  }

  if (/Safari\//.test(ua)) return 'safari';

  return 'unknown';
}

// Returns a CTA label like "Add to Chrome" / "Add to Edge" / "Add to Browser"
// based on the detected browser. Falls back to "Add to Browser" for non-Chromium
// or unknown agents.
export function addToBrowserLabel() {
  switch (detectBrowser()) {
    case 'chrome': return 'Add to Chrome';
    case 'edge': return 'Add to Edge';
    case 'firefox': return 'Add to Firefox';
    default: return 'Add to Browser';
  }
}

// Returns a friendly browser name like "Chrome" / "Edge" / "Firefox" / "your browser".
export function browserDisplayName() {
  switch (detectBrowser()) {
    case 'chrome': return 'Chrome';
    case 'edge': return 'Edge';
    case 'firefox': return 'Firefox';
    case 'chromium-other': return 'your browser';
    case 'safari': return 'your browser';
    case 'mobile': return 'your browser';
    default: return 'your browser';
  }
}
