# Changelog

All notable changes to the BBE Chrome extension are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [1.0.6] - 2026-05-09

- Fix Firefox content-script auth panel: switch `chrome.storage.local` calls used in content-script context (Supabase auth storage adapter, post-sync writes) to callback form so Firefox's Xray vision doesn't block `.then` access on cross-compartment Promises.
- Bump `browser_specific_settings.gecko.strict_min_version` to `128.0` (required for `world: "MAIN"` content scripts).
- Sync popup version string to manifest.

## [1.0.5] - 2026-05-08

- Add Chromium self-hosted auto-update via top-level `update_url` (TASK-213). Resolves Edge "unknown source" install warning that grayed out the enable toggle when dragging a self-hosted `.crx` onto `edge://extensions`.

## [1.0.4] - 2026-05-08

- First release produced by the self-hosted build pipeline (TASK-215). No functional changes from 1.0.3.
