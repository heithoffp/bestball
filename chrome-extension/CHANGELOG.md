# Changelog

All notable changes to the BBE Chrome extension are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [1.0.8] - 2026-05-10

- Fix Firefox Google sign-in from the FAB auth panel: wrap `chrome.runtime.sendMessage({ type: 'GOOGLE_OAUTH' })` in a sandbox-owned Promise via the callback form. v1.0.6 covered `chrome.storage.*` but missed this one chrome.* await in `signInWithGoogle`, so the Google button silently failed in Firefox with "Permission denied to access property 'then'". Email/password sign-in was already working post-1.0.6.
- Sync popup version string to manifest (was still showing v1.0.6).

## [1.0.7] - 2026-05-10

- Fix DraftKings roster name matching (TASK-227). DK's lineup API returns abbreviated first names, so synced rosters were stored as "B. Robinson", "J. Cook III", "L. Burden III" and never matched DK ADP CSV keys — silently breaking ADP, projections, team, and stack lookups across Exposures, ADP Tracker, Combos, Draft Assistant, and Roster Viewer. The DK adapter now prefers `displayName` from the draftables endpoint we already fetch, falling back to the abbreviated concatenation only when unavailable.
- Live-overlay name resolution: capture team in `getCurrentPicks` and pass it through `resolvePlayerKey`, so ambiguous abbreviations like "B. Robinson" (Bijan vs. Brian, both RB) disambiguate by team.
- Live-overlay abbreviation map: build and lookup both route through `canonicalName`, fixing 0% exposure on last names with embedded periods (e.g. Amon-Ra St. Brown).
- Existing already-synced rosters keep their abbreviated names until the user re-syncs; no auto-backfill.

## [1.0.6] - 2026-05-09

- Fix Firefox content-script auth panel: switch `chrome.storage.local` calls used in content-script context (Supabase auth storage adapter, post-sync writes) to callback form so Firefox's Xray vision doesn't block `.then` access on cross-compartment Promises.
- Bump `browser_specific_settings.gecko.strict_min_version` to `128.0` (required for `world: "MAIN"` content scripts).
- Sync popup version string to manifest.

## [1.0.5] - 2026-05-08

- Add Chromium self-hosted auto-update via top-level `update_url` (TASK-213). Resolves Edge "unknown source" install warning that grayed out the enable toggle when dragging a self-hosted `.crx` onto `edge://extensions`.

## [1.0.4] - 2026-05-08

- First release produced by the self-hosted build pipeline (TASK-215). No functional changes from 1.0.3.
