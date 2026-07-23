# TASK-363: Android port: full app on Google Play + Google Play Billing (excludes live overlay)

**Status:** Draft
**Priority:** P2

---

## Objective
Port the existing Expo/React Native app (mobile-app/) to run and ship on Android, covering everything EXCEPT the live-draft overlay (tracked separately). Scope: verify all eight tabs, expo-router navigation, Supabase auth/storage, and the shared analytics pipeline render and function on Android; configure Google Sign-In for Android and adapt or hide iOS-only auth (Apple Sign-In); implement a Google Play Billing path for Pro in src/iap.js (currently iOS-only) plus a server-side purchase-verification edge function mirroring sync-apple-purchase for Google Play; add Android EAS build and submit profiles, keystore, adaptive icon/splash, and Google Play Console listing; device-test on real Android hardware. Broad and non-prescriptive: the implementer chooses libraries and architecture (no ADR pre-selection). Surface any hard-to-reverse decision for a quick developer check but do not block on it.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
