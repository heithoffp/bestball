# TASK-345: Add Google + Apple sign-in (mobile native + Apple on web) per ADR-029

**Status:** Pending Approval
**Priority:** P2

---

## Objective

Implement ADR-029: native Google & Apple sign-in on mobile via `supabase.auth.signInWithIdToken` (`expo-apple-authentication` + `@react-native-google-signin/google-signin`), and add Apple sign-in to the web app via the existing `signInWithOAuth` flow. Google-on-iOS triggers App Store Guideline 4.8, so Apple sign-in ships alongside it. Requires a custom EAS/dev build (not Expo Go) plus Supabase provider + Apple Developer + Google OAuth client configuration.

## Verification Criteria

1. On a dev/EAS build running on the iPhone, tapping **Sign in with Apple** and **Continue with Google** each completes the native flow and lands an authenticated Supabase session — the Account tab then shows the user's email and tier.
2. Signing in with a provider using the **same email** as an existing email/password account resolves to the **same Supabase user** (no duplicate identity, tier preserved) — confirmed in the Supabase dashboard's Auth users list.
3. On the web app, a **Sign in with Apple** button renders in the auth modal (both Sign In and Sign Up forms) and completes OAuth to an authenticated session, alongside the existing Google button.

## Verification Approach

**Automated / Windows-side (Claude can run):**
- `cd best-ball-manager && npm run lint` — web changes lint clean.
- `cd best-ball-manager && npm run build` — web bundle builds with the new Apple button + context method.
- `cd mobile-app && npx expo config --type prebuild` — config resolves with the new plugins (Windows-safe check per prior iOS-workflow notes; `expo prebuild` skips `ios/` on Windows).
- Confirm the three native deps (`expo-apple-authentication`, `@react-native-google-signin/google-signin`, `expo-crypto`) are listed as **direct** dependencies in `mobile-app/package.json` (not peer-only) — the autolink/`dyld` launch-crash class requires direct deps.

**Manual — requires the developer (external config + on-device, no Mac/Expo Go):**
1. **Supabase dashboard:** enable Apple and Google providers; register the Google iOS + web client IDs and the Apple Services ID / key; confirm identity-linking (link-by-email) behavior.
2. **Apple Developer portal:** enable "Sign in with Apple" capability on `com.bestballexposures.app`; create the Services ID + signing key used by Supabase.
3. **Google Cloud console:** create OAuth iOS client (bundle `com.bestballexposures.app`) and a web/server client; put the iOS reversed-client-ID URL scheme into the app config; supply IDs via `EXPO_PUBLIC_GOOGLE_*` env.
4. **EAS dev build → iPhone:** run the Apple and Google flows; confirm each lands an authenticated session (Criterion 1).
5. **Same-email test:** with an existing email/password account, sign in via Google/Apple using that email; confirm it maps to the same user in the Supabase Auth list (Criterion 2).
6. **`.ipa` Frameworks check:** after the EAS build, confirm the two native auth modules are present in the bundle's `Frameworks/` (guards the known peer-dep autolink crash).
7. **Web:** in `npm run dev`, open the auth modal and complete the Apple OAuth flow (Criterion 3).

## Files to Change

| File | Change |
|------|--------|
| `mobile-app/package.json` | Add direct deps: `expo-apple-authentication`, `@react-native-google-signin/google-signin`, `expo-crypto`. |
| `mobile-app/app.json` | Add config plugins for `expo-apple-authentication` and `@react-native-google-signin/google-signin` (with iOS reversed-client-ID URL scheme); set `ios.usesAppleSignIn: true`. |
| `mobile-app/shared/config.js` | Add `GOOGLE_IOS_CLIENT_ID` / `GOOGLE_WEB_CLIENT_ID` following the existing `process.env.EXPO_PUBLIC_… \|\| ''` pattern (empty default disables the buttons). |
| `mobile-app/eas.json` | Add the `EXPO_PUBLIC_GOOGLE_*` vars to the `preview` and `production` `env` blocks (mirroring the Stripe/Apple IAP vars). |
| `mobile-app/src/contexts/AuthContext.jsx` | Add `signInWithApple()` and `signInWithGoogle()` using `signInWithIdToken` with `expo-crypto` nonce handling; expose both in context value; rewrite the header comment (supersede the "no OAuth" rationale, cite ADR-029). |
| `mobile-app/app/(tabs)/account.jsx` | Render the native Apple button (`AppleAuthentication.AppleAuthenticationButton`) and a Google button below the email form when signed out; wire to the new context methods with error handling; hide/disable gracefully when client IDs are unset or Apple is unavailable. |
| `best-ball-manager/src/contexts/AuthContext.jsx` | Add `signInWithApple()` = `signInWithOAuth({ provider: 'apple', options: { redirectTo: window.location.origin } })`; expose in context value. |
| `best-ball-manager/src/components/AuthModal.jsx` | Add an Apple sign-in button next to the Google button in both the Sign In and Sign Up forms; add an `AppleIcon`. |
| `best-ball-manager/src/index.css` | Add `.modal-apple-btn` styling (black button, matching layout of `.modal-google-btn`). |
| `docs/migrations/` or plan appendix | Document the external setup steps (Supabase providers, Apple Developer Services ID, Google OAuth clients) so the manual config is reproducible. |

## Implementation Approach

**Mobile — nonce + native token exchange.** Both providers use the Supabase native pattern: generate a random nonce with `expo-crypto`, SHA-256 hash it, pass the hashed nonce into the native sign-in call, then pass the *raw* nonce plus the returned ID token into `supabase.auth.signInWithIdToken({ provider, token, nonce })`. `onAuthStateChange` (already wired in `AuthContext`) picks up the new session — no extra session plumbing needed. Google requires a one-time `GoogleSignin.configure({ iosClientId, webClientId })` (the web client ID is the token audience Supabase validates against).

**Mobile UI.** In `account.jsx`, below the existing email/password `Button`, add an "or" separator, the native `AppleAuthenticationButton` (iOS renders the system-styled button — the reviewer-expected control), and a Google `Button` (reuse the `ui.jsx` `Button` with a leading Google icon). Each handler sets `busy`, calls the context method, and surfaces `authError` via the existing `authError` display. If `GOOGLE_IOS_CLIENT_ID` is empty or `AppleAuthentication.isAvailableAsync()` is false, omit that button rather than showing a broken control.

**Web.** `signInWithApple` mirrors the existing `signInWithGoogle` (same `signInWithOAuth` shape, `provider: 'apple'`). In `AuthModal.jsx`, render an Apple button under the Google one in both forms, using a new `.modal-apple-btn` class (black background, white Apple glyph) to match Apple's brand guidance while keeping the existing button layout.

**Config & build.** The native modules do not run in Expo Go, so testing is via an EAS/dev build. Client IDs are injected through `EXPO_PUBLIC_*` env (empty defaults keep the buttons hidden until configured), consistent with the Stripe/IAP config already in `shared/config.js` and `eas.json`. No Supabase migration or edge function is needed — provider setup is dashboard-only, and the `subscriptions.provider` column (migration 017) is billing-only and unrelated to sign-in identity.

## Scope Items

- **Chrome extension Sign in with Apple** (added mid-task, developer-approved 2026-07-17 via scope-drift gate). Mirror the extension's existing Google button: `background.js` `provider=apple` branch via `chrome.identity.launchWebAuthFlow`, `bridge.js` `signInWithApple`, an Apple button in the `draft-overlay.js` auth section, and rebuild (`cd chrome-extension && npm run build`). *Verification:* overlay shows an Apple button; the flow returns tokens and sets the session; `npm run build` bundles cleanly. Not a Guideline 4.8 requirement (that's iOS-only) — pure parity across the three login surfaces.

## Related
- ADR-029 (native Google + Apple sign-in mobile, Apple on web)
- ADR-022 (Expo/EAS shell), ADR-028 (Apple IAP — shared review-risk context)
