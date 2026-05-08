# ADR-005: Self-host the Chrome extension with browser-detecting install flow

**Date:** 2026-05-08
**Status:** Accepted

---

## Context

The BBE Chrome extension (item id `cnljeadelfnabalcdongglhfhiceakaj`) was rejected by the Chrome Web Store as "gambling," classified as an unrectifiable violation. The developer account will not be reinstated — appeals are exhausted.

The extension is a hard dependency of the product: it's the only roster-sync mechanism for Underdog and DraftKings. Without a working distribution channel, paid users cannot onboard. We are in Pre-Launch Polish phase with a goal of 500 subs by NFL 2026. Distribution must be solved this sprint.

Constraints:
- Chrome blocks one-click installs of self-hosted `.crx` files (since 2018). Only the Web Store grants seamless install.
- Edge (Chromium) accepts one-click `.crx` install from arbitrary URLs.
- Firefox accepts `.xpi` install from arbitrary URLs **only if signed by Mozilla** (AMO listing or unlisted self-distribution signing).
- We have no existing CDN, signing key infrastructure, or update-manifest pipeline. Web Store auto-update is lost.
- Audience is overwhelmingly desktop Chrome (best-ball drafters).

## Decision

Distribute the extension directly from BestBallExposures.com via a single `/install` page that detects the user's browser and presents the appropriate install flow:

- **Chrome / Brave / Arc / other Chromium (non-Edge):** guided 4-step flow — download `.crx`, open `chrome://extensions`, enable Developer Mode, drag-drop. Animated walkthrough with copy-able URL.
- **Edge:** direct `.crx` link, one-click install via Edge's native handler.
- **Firefox:** signed `.xpi` (Mozilla-signed unlisted distribution), one-click install.
- **Safari / mobile / unknown:** unsupported message with desktop browser recommendation.

Extension binaries are hosted on Vercel (or Supabase storage), versioned, and served with a self-hosted update manifest (`updates.xml`) so installed extensions auto-update.

A transparency note ("Why isn't this on the Chrome Web Store?") is linked from the install page to address the policy rejection openly.

## Alternatives Considered

### Option A: Self-host with browser-detecting install flow (chosen)
- **Pros:** Universal coverage of all desktop browsers. Honest about the Web Store situation. Edge/Firefox users get true one-click. Chrome users get a polished guided flow. Full control over distribution and update cadence.
- **Cons:** Chrome's flow is 4 steps, materially worse than Web Store. Update manifest must be maintained. Firefox signing adds a process step per release. Some users will bounce on the Developer Mode requirement.

### Option B: Edge-only or Firefox-only distribution
- **Pros:** Truly seamless install on the supported browser.
- **Cons:** Drops the majority of the target audience (Chrome users on desktop). Non-starter for revenue goals.

### Option C: Resubmit under a new developer account with a UD-only or rebranded variant
- **Pros:** Restores Web Store distribution if successful.
- **Cons:** Google links accounts (payment, IP, fingerprint) — high risk of immediate ban that poisons the new account. Even on success, the "gambling" classification will likely re-trigger because best-ball products as a category are flagged. Doesn't solve the underlying policy problem.

### Option D: Replace extension with CSV/clipboard import flow
- **Pros:** No browser store dependency. Immune to policy rejection. Works everywhere.
- **Cons:** Materially worse UX — users must export/copy from each draft individually. Removes the live-draft companion (Draft Assistant) entirely. Undermines "zero-config insights" principle.

## Consequences

### Positive
- Distribution is no longer at the mercy of Chrome Web Store policy review.
- We control update cadence and rollout (no review delays for hotfixes).
- Edge and Firefox users get the best-possible install UX.
- Transparency note can become a brand-trust moment.

### Negative
- Chrome onboarding conversion will drop measurably vs. a Web Store install. Friction is real and unavoidable.
- We must operate signing infrastructure for Firefox `.xpi` (Mozilla key) and maintain a `.crx` private key for self-host updates.
- `updates.xml` and binary hosting become a production dependency — outage breaks updates for all users.
- Loss of Web Store review removes one external safety check on extension releases.

### Risks
- **Chrome may further restrict self-hosted `.crx` install** (they have tightened repeatedly). Revisit if Developer Mode drag-drop is removed or gated.
- **Firefox signing approval** for an extension serving best-ball platforms could face the same "gambling" classification. Mitigate by using unlisted signing if AMO listing is rejected.
- **Conversion drop on Chrome** — if measured drop-off in the install funnel exceeds ~40%, revisit with a more aggressive intervention (native helper installer, Edge-redirect prompt, or deeper CSV-import fallback).
- **Update key compromise** — losing the `.crx` signing key bricks updates for all installed users. Store in a secret manager with backup.

## Revisit Conditions

If Chrome removes self-host install entirely; if Firefox signing is denied; if install-funnel conversion drops below acceptable thresholds; if the product can be repositioned such that a new Web Store submission has a credible path.

## Related
- Tasks: TASK-NNN (implement self-host distribution), TASK-NNN (refactor existing extension links)
- ADRs: —

---

*Approved by: Patrick — 2026-05-08*
