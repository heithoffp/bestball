# ADR-029: Add native Google and Apple sign-in on mobile, and Apple sign-in on web

**Date:** 2026-07-17
**Status:** Accepted

---

## Context

The mobile app (ADR-022) ships email/password auth only. `mobile-app/src/contexts/AuthContext.jsx:2-4` documents the reason explicitly: OAuth was omitted because **adding a third-party social login on iOS triggers App Store Review Guideline 4.8**, which requires offering **Sign in with Apple** as an equivalent option whenever a third-party/social login (Google, Facebook, etc.) is used to establish the primary account. The web app (`best-ball-manager/src/contexts/AuthContext.jsx:65-71`) already offers Google via `supabase.auth.signInWithOAuth`, so accounts are shared Supabase users across both surfaces.

What changed: the developer wants Google sign-in on mobile for faster onboarding and **accepts the Guideline 4.8 obligation** — so Apple sign-in must ship alongside it. The developer also wants **Apple sign-in added to the web app**, keeping the two surfaces at parity (web would then offer email + Google + Apple).

Constraints shaping the decision:

- **Windows-only dev, no Mac; EAS cloud builds** (ADR-022). Any native module must build on EAS and cannot be validated in Expo Go.
- The app already carries **elevated App Review scrutiny** from on-device screen capture (ADR-019/020) and native IAP (ADR-028). Guideline 4.8 compliance is not optional here — a Google-only sign-in would be a near-certain rejection.
- Supabase is the single identity store; both surfaces derive tier from the shared `subscriptions` table. Sign-in must resolve to the **same Supabase user** regardless of method.
- `mobile-app/shared/utils/supabaseClient.js` runs with `detectSessionInUrl: false` (no browser redirect handling on native) and AsyncStorage persistence.

## Decision

Mobile authenticates Google and Apple **natively** and exchanges the provider ID token for a Supabase session:

- **Apple:** `expo-apple-authentication` → `supabase.auth.signInWithIdToken({ provider: 'apple', token: identityToken, nonce })`
- **Google:** `@react-native-google-signin/google-signin` → `supabase.auth.signInWithIdToken({ provider: 'google', token: idToken, nonce })`

The web app adds Apple as a second `signInWithOAuth({ provider: 'apple' })` button next to the existing Google button (browser redirect, unchanged mechanism).

This requires provider configuration in the **Supabase dashboard** (Apple + Google enabled with the right client IDs/secrets), an **Apple Developer** Services ID + Sign in with Apple capability, a **Google OAuth client** (iOS + web/server client IDs), and a **custom EAS/dev build** (the native modules do not run in Expo Go). This **supersedes the email-only rationale** in the `AuthContext.jsx` comment.

## Alternatives Considered

### Option A: Native SDKs → `signInWithIdToken` (chosen)

`expo-apple-authentication` + `@react-native-google-signin/google-signin`; exchange the native ID token for a Supabase session.

- **Pros:** Native iOS sheets (Face ID / system Google picker) — best UX and the flow Apple's reviewers expect; renders the genuine "Sign in with Apple" button, the safest posture for 4.8 on an already-scrutinized app; no in-app browser round-trip; tokens verified by Supabase.
- **Cons:** Two new native dependencies to keep autolinked correctly (a known crash class here — peer-dep autolink causing `dyld` launch crashes); requires client-ID config and a dev/EAS build to test — no Expo Go; more first-time setup (Apple Services ID, Google iOS + web client IDs, nonce handling).

### Option B: Supabase web OAuth via in-app browser + deep link

`signInWithOAuth({ redirectTo: 'bbexposures://auth' })` opened with `expo-web-browser`, parse tokens back, `setSession`.

- **Pros:** Reuses the web Google provider config; minimal native deps (already installed); one code path for both providers.
- **Cons:** Apple runs in a browser sheet rather than the native button — weaker UX and a shakier 4.8 posture on a high-scrutiny app; token round-trip parsing is fiddly and easy to get subtly wrong; feels less native.

### Option C: Keep mobile email-only; add Apple to web only

Do nothing on mobile.

- **Pros:** Zero App Review exposure; no native work.
- **Cons:** Fails the actual request (Google on mobile). Non-starter.

## Consequences

### Positive

- Faster mobile onboarding via one-tap Google/Apple; parity with the web sign-in surface.
- Genuine Sign in with Apple button satisfies Guideline 4.8, keeping the payments/screen-capture review risks (ADR-028/019) as the only open axes.
- All methods resolve to the same Supabase user, so the shared `subscriptions` tier logic and `isAuthorEmail` checks are untouched.

### Negative

- Two new native modules → the autolink/`dyld` crash class must be re-verified in the `.ipa`; every auth test now needs a dev/EAS build.
- New external config lives outside the repo (Apple Developer portal, Google Cloud console, Supabase provider settings) — setup steps that must be documented, not just coded.
- Apple returns the user's name/email **only on first authorization**; if we ever need the name we must capture it on that first call.

### Risks

- **Duplicate/split accounts by email:** a user who signed up with email+password and later taps "Sign in with Google" for the same address may get a second identity unless Supabase identity-linking behaves as expected. Mitigation: enable/verify Supabase's link-by-email behavior; document the expected merge; test the same-email cross-provider case explicitly.
- **Apple private-relay emails:** Apple may return a `@privaterelay.appleid.com` address; anything keyed on real email (author preview, support lookups) must tolerate this. Mitigation: never assume a human-readable email; key on Supabase user id.
- **Nonce handling:** `signInWithIdToken` requires the raw/hashed nonce to match; getting it wrong yields opaque failures. Mitigation: follow Supabase's documented nonce pattern with `expo-crypto`; test on-device early.
- **Config drift between environments:** wrong client ID / bundle mismatch fails silently at runtime. Mitigation: inject IDs via `EXPO_PUBLIC_*` (mirroring the existing Stripe/Supabase config pattern) and verify in a sandbox build before release.

## Revisit Conditions

- Native module maintenance or autolink breakage becomes costly enough to prefer the Option B browser flow.
- Supabase ships a materially simpler native auth path.
- Android distribution begins (Google config would extend; Apple sign-in on Android would need the web flow).

## Related

- Supersedes: the email-only OAuth rationale in `mobile-app/src/contexts/AuthContext.jsx`
- ADRs: ADR-022 (Expo/EAS shell), ADR-028 (Apple IAP — shared review-risk context), ADR-001 (Supabase-backed identity/billing)
- Tasks: a new implementation task will follow this ADR

---
*Approved by: developer, 2026-07-17*
