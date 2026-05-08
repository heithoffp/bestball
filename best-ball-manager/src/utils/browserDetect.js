// Browser detection for the /install page.
// Returns one of: 'chrome' | 'edge' | 'chromium-other' | 'firefox' | 'safari' | 'mobile' | 'unknown'.
//
// Edge accepts drag-drop .crx without the "unknown source" warning when the manifest carries
// a Chromium update_url (1.0.5+). Brave/Arc/Vivaldi/Opera don't expose Edge's relaxed handler,
// so they get the same guided 4-step flow as Chrome.
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
