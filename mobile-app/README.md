# BBE Mobile — Best Ball Exposures for iOS

The full Best Ball Exposures app as a native iOS port (Expo / React Native), plus the
Live Draft Assistant work (EPIC-08). Every web tab is here: Dashboard, Exposures,
Rosters, ADP Tracker, Combos (Stacks / QB Pairs / Similarity / Playoffs / Explorer),
Rankings, Draft Assistant (with Eliminator mode), and the Best Ball Arena. Desktop-only
steps (Chrome-extension roster sync, subscription checkout, rankings CSV upload) hand
off to the website.

**Status:** implemented and running on-device via EAS dev builds. **Live Draft
Session** (docs/LIVE_SESSION_V1.md) is in, with a single hands-free capture path:

- **Live capture (hands-free):** a ReplayKit broadcast extension
  (`targets/draft-broadcast/`) watches the screen while you draft in Underdog —
  Vision OCR → the shared JS parse engine running in JavaScriptCore → pick
  ledger → Live Activity updates pushed through the `live-activity-relay` Edge
  Function (APNs). One-time APNs key setup required for background pushes (see
  the doc's runbook). **Mid-draft resume:** joining a draft already in progress
  is detected automatically — the ledger backfills every existing pick the first
  time the capture sees the board, and the panel shows a "Resumed mid-draft"
  banner. (The earlier screenshot/Shortcuts fallbacks were removed in TASK-327
  once live capture was proven on device.)

Capture feeds the Draft Assistant screen and the lock-screen/Dynamic Island Live
Activity (`targets/draft-glance/`) through the same `src/draft/` engine and
`draftFeed.js` seam (DraftState contract, ADR-021). A ScreenCaptureKit mode is
planned for iOS 27 (spike Q3) — the extension core is already capture-agnostic.

**The live session IS the Draft Assistant (TASK-339).** The tab opens on a setup
screen — a required Underdog username (it anchors automatic slot detection,
TASK-328; remembered between drafts), a Start CTA, and a "Try a demo draft"
that replays a real room through the full assistant UI. There is no draft-slot
selector and no manual pick entry anywhere; picks, round, and slot arrive only
from the capture feed, and a one-time three-step coach-mark overlay introduces
the columns and badges in place.
`npm run test:draft` runs the parse-engine regression (including the JSC bundle
the extension executes) against the real OCR fixture from a live UD draft.

## Layout

```
mobile-app/                # Expo project root (SDK 57, expo-router, JS)
  app/                     # Screens: (tabs)/ index·portfolio·market·draft·account
  src/
    components/            # UI primitives, scaffold, charts, board modal, filters
    contexts/              # Auth / Subscription / Portfolio (data bootstrap)
    screens/               # One view per web tab (ports of the web components)
    draft/draftFeed.js     # Seam for the capture/OCR engine → DraftState
    theme.js               # Design tokens from the web app's index.css
  shared/
    utils/                 # Ported analytics/data layer (see below)
    data/                  # Build-time compacted CSVs (npm run build:data)
    bundledData.js         # Decoder for the compacted assets
    config.js              # Supabase URL/key (publishable), website URLs
  scripts/build-data.mjs   # Reads best-ball-manager/src/assets → shared/data/*.json
  modules/                 # (future) Expo native modules: capture, activity bridge
  spike/                   # TASK-318 throwaway test app — self-contained, excluded from Metro
  docs/                    # EPIC-08 design docs (ARCHITECTURE, RESEARCH_NOTES, …)
```

`shared/utils/` is a **port snapshot** of `best-ball-manager/src/utils/` — the web
files stay the source of truth. Most are verbatim copies (helpers, dataLoader pipeline,
rosterArchetypes, stackAnalysis, advanceModel, podAdvance, uniquenessEngine,
playoffStacks, eliminatorModel, draftModel, realDraftData, arenaSnapshot, …). Adapted
for RN: `supabaseClient` (AsyncStorage sessions), `storage`/`modelCache` (AsyncStorage
instead of IndexedDB), `podAdvanceStore` (no Web Worker — chunked JS-thread path),
`arenaClient` (async guest id), `rankingsExport` (share sheet instead of download).

## Commands

```bash
npm install                 # once
npm run build:data          # refresh bundled ADP/projections/rankings/demo JSON
npx expo start              # dev server (needs a dev build or Expo Go*)
npx expo export --platform ios   # CI-style bundle check (no device needed)

npm run eas:dev             # EAS development build (internal, real iPhone)
npm run eas:preview         # EAS preview build (internal distribution)
```

*Expo Go works for most screens; anything touching view-shot/sharing needs a dev build.

**Refresh `npm run build:data` before every EAS build** so the app ships the latest
ADP snapshots — same workflow as committing new CSVs for the web app.

## First build on your iPhone (after Apple enrollment clears)

1. `npm i -g eas-cli && eas login` (Expo account), then from `mobile-app/`: `eas init`
   (creates the EAS project id; accept defaults).
2. `eas device:create` — register your iPhone's UDID via the emailed link.
3. `npm run eas:dev` — first run walks through Apple credentials (sign in with the
   enrolled Apple ID; EAS manages certs/profiles).
4. Install from the build QR / link, then `npx expo start` and connect.
   For a standalone install without the dev server, use `npm run eas:preview`.

## Notes

- **Auth:** email/password only (same Supabase accounts as the website). No third-party
  login on iOS — adding one would trigger the Sign in with Apple requirement.
- **Payments:** none in-app (Apple IAP rules). Upgrade/manage flows open the website.
  Revisit the external-purchase-link entitlement question before App Store submission.
- **Arena:** same Edge Functions/RLS surface as the web; visibility tracks
  `arena_config.beta_mode` exactly like the web tab.
- **Governance:** EPIC-08 (ROADMAP.md), ADR-019…022. The in-app Draft Assistant is the
  opinionated surface; everything else stays mirror-not-advisor (ADR-002).
