# TASK-364: Android live-draft overlay: full capture to OCR to guide differentiator

**Status:** Draft
**Priority:** P2

---

## Objective
Build the full Android equivalent of the iOS live-draft experience end to end: on-screen capture of the live Underdog/DraftKings draft, OCR, reuse of the shared parse engine (engine.js / src/draft/draftFeed.js and shared analytics) to derive DraftState, and a glanceable always-on-top surface showing current pick, picks-until-turn, and top available players by the user's own rankings, degrading gracefully when capture/OCR is unavailable. This is the market differentiator and has no iOS-portable code (ActivityKit/ReplayKit/Vision are iOS-only; liveActivity.js already no-ops on Android). Deliberately broad and non-prescriptive: the implementer decides the native language (e.g. Kotlin), capture mechanism (e.g. MediaProjection), OCR engine (e.g. ML Kit), and the Live-Activity analog (floating bubble, foreground-service/persistent notification, or other). Reuse the shared parse engine and remote parse templates rather than reimplementing analysis. Belongs to FEAT-032.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
