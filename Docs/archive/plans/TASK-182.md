# TASK-182: Submit Chrome extension to Chrome Web Store

**Status:** Draft
**Priority:** P1

---

## Objective
Package and submit the Chrome extension to the Chrome Web Store for public distribution. Run `npm run build` in chrome-extension/, zip the dist/ folder, and submit via the Chrome Web Store Developer Dashboard. The privacy policy URL is already set in the manifest. Chrome Web Store review typically takes 1-3 business days for new submissions. If not approved by launch time, mention "Chrome extension coming soon" in the Reddit post and add the CWS link later.

## Dependencies
- Privacy policy page deployed (done — /privacy.html)
- Extension icons present (done — icons/ directory)
- Console.log cleanup (done — removed debug logging)

## Open Questions
- Do you have a Chrome Web Store developer account ($5 one-time fee)?
- Should the extension listing include screenshots of the overlay in action?
