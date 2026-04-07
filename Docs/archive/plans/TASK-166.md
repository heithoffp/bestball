<!-- Completed: 2026-04-07 | Commit: pending -->
# TASK-166: Product demo assets — screenshots and GIFs for landing page and social

**Status:** Approved
**Priority:** P1

---

## Objective
Create polished screenshots of key app features for use on the landing page, Reddit posts, and social media outreach. Build a curated demo roster dataset and automated capture pipeline so screenshots are repeatable as the UI evolves.

## Verification Criteria
1. Demo roster CSV exists and loads correctly via `?demo=true` URL param, producing a populated Dashboard with all sections filled (metrics, exposure bars, archetype chart, draft capital, stacks).
2. Playwright script captures all 7 target screenshots at 1280×800 @2× (2560×1600 output) to `best-ball-manager/public/screenshots/`.
3. Landing page feature cards display corresponding screenshots with proper responsive sizing.
4. OG image updated to use dashboard screenshot crop (1200×628).
5. `npm run build` completes without errors.
6. No real user data in any screenshot — all from curated demo set.

## Verification Approach
1. Run `npm run dev` in `best-ball-manager/`, open `http://localhost:5173?demo=true` — confirm Dashboard shows populated data (not empty state).
2. Run `npx playwright test scripts/capture-screenshots.js` — confirm 7+ PNG files written to `public/screenshots/`, each ≥100KB (not blank).
3. Open landing page at `/` — confirm feature screenshots render in feature cards at desktop width (1280px).
4. Check `index.html` meta tags point to new OG image. Validate via `og:image` meta tag inspection.
5. Run `npm run build` — clean build, no errors.
6. Visual inspection of screenshots for data quality (realistic names, interesting patterns, no personal data).

Steps 1–5 can be run by Claude. Step 6 requires developer visual review.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/assets/demo-rosters.csv` | Create | 25 curated rosters with realistic players, varied archetypes, team stacks |
| `best-ball-manager/src/utils/dataLoader.js` | Modify | Add `loadDemoRosters()` that loads demo-rosters.csv when `?demo=true` |
| `best-ball-manager/src/App.jsx` | Modify | Check URL param on mount; call `loadDemoRosters()` when `?demo=true` |
| `best-ball-manager/scripts/capture-screenshots.js` | Create | Playwright script — launches dev server, navigates tabs, captures PNGs |
| `best-ball-manager/public/screenshots/` | Create | Output directory for captured PNGs |
| `best-ball-manager/src/components/LandingPage.jsx` | Modify | Add screenshot images to feature cards |
| `best-ball-manager/src/components/LandingPage.module.css` | Modify | Styles for screenshot images in feature cards |
| `best-ball-manager/index.html` | Modify | Update og:image meta to new dashboard crop |
| `best-ball-manager/package.json` | Modify | Add Playwright as devDependency, add `capture-screenshots` script |

## Implementation Approach

### Phase 1: Demo Roster Data (curated for visual impact)

Create `demo-rosters.csv` with 25 rosters × 18 picks = 450 rows. Design rosters to produce:

- **High-exposure players**: Ja'Marr Chase (~60%), Bijan Robinson (~50%), Josh Allen (~40%) — creates visually interesting exposure bars
- **Archetype variety**: Mix of RB_HERO (heavy early RB), RB_ZERO (no early RB), QB_ELITE (Allen/Mahomes early), balanced builds
- **Team stacks**: Josh Allen + Amari Cooper (BUF), Lamar Jackson + Derrick Henry (BAL), Joe Burrow + Ja'Marr Chase (CIN) — populates Combo Analysis
- **Realistic pick positions**: Each player drafted at plausible ADP (±3 rounds from current ADP)
- **Tournament variety**: 3-4 different tournament titles across entries

Format: `Picked At,Pick Number,First Name,Last Name,Team,Position,Draft Entry,Draft Size,Tournament Title`

Use UUIDs for entry IDs. Timestamps spread across Feb–Apr 2026. Draft size = 18 (standard best ball).

### Phase 2: Demo Data Loading

Add a lightweight mechanism in App.jsx to load demo roster data:

1. On mount, check `window.location.search` for `?demo=true`
2. If present, import `demo-rosters.csv` from assets and parse through existing pipeline
3. Set `isUsingDemoData = true` flag (already exists in codebase)
4. All existing processing (processMasterList, archetype classification, etc.) runs on this data normally

This reuses the existing `loadFromAssets` pattern but with the demo roster CSV. No new parsing logic needed.

### Phase 3: Playwright Screenshot Capture

Install Playwright and create capture script:

```
npx playwright install chromium
```

Script (`scripts/capture-screenshots.js`):
1. Launch Chromium at 1280×800, deviceScaleFactor: 2
2. Navigate to `http://localhost:5173?demo=true`
3. Wait for data to load (wait for dashboard metrics to appear)
4. Capture sequences:

| # | Screenshot | Tab/State | Filename |
|---|-----------|-----------|----------|
| 1 | Dashboard hero | Dashboard tab, full viewport | `dashboard-hero.png` |
| 2 | Dashboard full | Dashboard tab, full page scroll | `dashboard-full.png` |
| 3 | Exposure table | Exposures tab, sorted by exposure | `exposures.png` |
| 4 | ADP Tracker | ADP Tracker tab, 4-5 players selected | `adp-tracker.png` |
| 5 | Draft Assistant | Draft Asst tab, mid-draft state | `draft-assistant.png` |
| 6 | Roster Viewer | Rosters tab, sorted by CLV | `roster-viewer.png` |
| 7 | Combo Analysis | Combos tab, showing stacks | `combo-analysis.png` |

For tabs requiring interaction (ADP Tracker player selection, Draft Assistant picks), the script will click to set up the state before capturing.

### Phase 4: Landing Page Integration

Update `LandingPage.jsx` feature cards to include screenshots:

- Each of the 6 feature cards (Portfolio Dashboard, Roster Archetypes, Draft Overlay, Multi-Platform, Combo & Stacking, ADP Tracking) gets a corresponding screenshot
- Images displayed above the card text with a subtle border/shadow treatment matching the dark theme
- Responsive: full-width on mobile, constrained on desktop
- Lazy loading for performance (`loading="lazy"`)

### Phase 5: OG Image Update

- Crop `dashboard-hero.png` to 1200×628 (OG standard) using canvas or sharp
- Save as `public/og-image-dashboard.png`
- Update `index.html` `og:image` meta tag to reference new image
- Keep the old branding-only OG image as fallback

### Phase 6: GIF Capture Guide (stretch — manual)

Document instructions for manual GIF recording (developer captures these):
- Tool recommendation: ShareX (Windows) or LICEcap
- Dashboard scroll, Exposure filtering, ADP player toggle, Draft flow
- Target: 800px wide, 10fps, 3-4 seconds each

## Dependencies
None — demo data is self-contained using players from existing ADP snapshots.

## Open Questions
- ~~Landing page hero: should we add a large dashboard screenshot above the fold?~~ **Resolved: Yes — add hero screenshot above the fold.**
- ~~Playwright script: auto-start dev server or require running?~~ **Resolved: Require dev server already running.**

---
*Approved by: <!-- developer name/initials and date once approved -->*
