# ADR-006: Use unlisted self-distribution signing for the Firefox extension

**Date:** 2026-05-08
**Status:** Accepted

---

## Context

[ADR-005](adr-005-self-host-the-chrome-extension-with-browser-detecting.md) committed to self-hosting the Best Ball Exposures extension on bestballexposures.com with a browser-detecting install flow. Firefox accepts `.xpi` files installed from arbitrary URLs **only if the package is signed by Mozilla**. Two signing channels are available:

- **AMO listed** — submission to addons.mozilla.org with full human review, public listing, AMO-managed auto-updates.
- **Unlisted self-distribution** — automated signing via `web-ext sign --channel=unlisted`, no public listing, signed `.xpi` returned to us for self-hosting.

ADR-005 named Firefox unlisted signing as a contingency under "Risks" but did not commit to a primary path. TASK-216 forces the choice now so that signing can run in parallel with the TASK-213 install-page implementation.

Constraints shaping the decision:
- The Chrome Web Store rejection (which drove ADR-005) classified the extension as "gambling." Mozilla's editorial standards for AMO listed extensions could plausibly trigger the same classification under their addon policies, particularly the "promotes gambling" clause. A failed AMO submission would block the Firefox install flow entirely.
- Per ADR-005, the install funnel routes every Firefox user through `/install` regardless. Public AMO discoverability adds zero acquisition value when no users find the extension by browsing AMO.
- Self-hosted updates already require a Firefox-format `updates.json` for TASK-213 (and TASK-213 is already on the hook for the Chromium `updates.xml`). Adding AMO-managed auto-updates would split the update channel and introduce a second source of truth.
- Firefox's audience among best-ball drafters is small (likely <5% of installs based on general desktop browser share for fantasy-adjacent communities). The cost of signing-process complexity is paid once; the ceiling of users it serves is low.

## Decision

Distribute the Firefox `.xpi` via **unlisted self-distribution signing**.

- Submit each release to Mozilla via `web-ext sign --channel=unlisted` for automated signing.
- Host the signed `.xpi` at `https://bestballexposures.com/extension/bestballexposures-extension-<version>.xpi` (mirroring the `.crx` URL convention).
- Configure `manifest.json` with `browser_specific_settings.gecko.update_url = https://bestballexposures.com/updates.json` so installed Firefox extensions auto-update from our hosting, not from AMO.
- Do not pursue an AMO listed submission unless unlisted signing is denied or strategic priorities shift.

## Alternatives Considered

### Option A: Unlisted self-distribution signing (chosen)
- **Pros:** Automated review (minutes, not days). Lower bar — Mozilla's automated checks focus on technical validity, not editorial classification. Aligns with the self-hosted update channel already required by TASK-213. Avoids the public AMO surface and its associated review risk.
- **Cons:** No discoverability via AMO browse/search. We carry full responsibility for hosting and update integrity. Users encountering "is this safe?" friction cannot point to an AMO listing as social proof.

### Option B: AMO listed submission
- **Pros:** Public listing as discovery surface and trust signal. AMO-managed auto-updates remove a hosting dependency for Firefox-only users.
- **Cons:** Human review may flag the same "gambling" classification that killed Chrome Web Store distribution — a high-impact, low-control failure mode. Review timelines are days to weeks. Splits the update channel between AMO (Firefox) and self-hosted (Chromium) — two sources of truth, two release rituals. AMO's discoverability surface is weak for our niche audience; users find us via marketing, not browsing AMO.

### Option C: Skip Firefox entirely
- **Pros:** Eliminates a signing process, a manifest variant, and an additional release artifact. Smaller maintenance surface.
- **Cons:** Drops users who explicitly prefer Firefox — a small but vocal segment of fantasy-football enthusiasts. Undermines the "we support real desktop browsers" framing of the install page. Fully reversible only if we re-establish the gecko ID and rebuild trust.

## Consequences

### Positive
- Lower risk of distribution-blocking review rejection compared to AMO listed.
- Single update channel (`updates.json` for Firefox, `updates.xml` for Chromium — both self-hosted).
- Faster release cadence — automated signing in minutes, not waiting on AMO reviewers.
- Full control over rollout timing, including hotfix releases.

### Negative
- AMO API credentials (JWT issuer + secret) become a new operational secret. Loss of credentials forces regeneration but does not affect previously signed artifacts.
- No public AMO listing — Firefox users have no third-party trust signal beyond the bestballexposures.com domain itself.
- If Mozilla's automated signing later tightens policy enforcement on best-ball–adjacent extensions, this path becomes blocked with no fallback inside the chosen channel.

### Risks
- **Mozilla unlisted signing denied.** Rare but possible. Fallback: submit the same artifact via `--channel=listed` and accept the AMO review timeline. Same code, same credentials.
- **AMO API credential leak.** Bearer credentials grant signing rights for the gecko ID. Stored in `.env` only, not committed; rotation is a one-click regeneration on the AMO API key page.
- **gecko ID lock-in.** Once the first signed `.xpi` ships, `bbe-extension@bestballexposures.com` is bound to our AMO account. Changing it would orphan installed users (acceptable at zero installed users today, costly later).

## Revisit Conditions

- If Mozilla denies unlisted signing for our extension on policy grounds.
- If Firefox's share of our install base grows past ~15% and AMO discoverability becomes a measurable acquisition channel.
- If a future Mozilla policy shift removes the unlisted signing channel or materially changes its review bar.
- If we add a second maintainer and want AMO's review process as an external safety check on releases.

## Related
- ADRs: [ADR-005](adr-005-self-host-the-chrome-extension-with-browser-detecting.md) — establishes the self-hosting strategy this ADR refines.
- Tasks: TASK-216 (this decision), TASK-213 (install-page Firefox flow + `updates.json` hosting).

---

*Approved by: Patrick — 2026-05-08*
