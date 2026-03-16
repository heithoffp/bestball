# Best Ball Manager — Feature Roadmap

## Context

The vision is a deployable website that is the one-stop shop for managing a best-ball portfolio — users gain actionable insights through a simple interface with minimal friction. The app currently has 6 polished analysis tabs, sophisticated scoring utilities (some unused), but is localhost-only with hardcoded CSV data. This feature list bridges the gap between "developer tool" and "product anyone can use."

---

## P0 — Ship Blockers

*Required for anyone besides the developer to use this.*

### 1. CSV Upload UI + Data Persistence

Upload zone (drag-and-drop) for roster and ADP CSVs. Persist to localStorage/IndexedDB so data survives page reloads. "Clear data" button. Currently data is hardcoded into the build — no one else can use the app without this.

### 2. Deployment Configuration

Static hosting setup (GitHub Pages, Vercel, or Netlify) with build + deploy workflow. Without this, the app is localhost-only and unshareable.

### 3. Dashboard / Portfolio Summary (new default tab)

Single-screen portfolio health overview: total rosters, average CLV, archetype distribution donut, top overexposed/underexposed players, portfolio grade, and quick-link cards to each analysis tab. This is the "one-stop shop" anchor — answers "how am I doing?" in 3 seconds without digging through 6 tabs. Powered by existing `analyzePortfolioTree` and `masterPlayers` data.

### 4. Mobile / Responsive Layout

Current layout uses hardcoded pixel widths and has no breakpoints. Best ball drafters check portfolios on their phones constantly. Add responsive CSS, collapsible tab bar, card-based layouts for narrow screens, and touch-friendly controls.

---

## P1 — High Value

*Differentiation + leveraging existing unused code.*

### 5. Draft Assistant / Pick Recommender

The killer feature. New "Draft Mode" tab where users enter their draft slot and picks-so-far. Uses the *already-built but unused* `scoreCandidate()` from `draftScorer.js` to rank available players by composite utility (projected value, diversification, exposure penalty, strategy fit, reach penalty, strategy kills). Recommendations update in real-time as picks are entered. This transforms the app from retrospective analysis into a live decision-making tool.

### 6. Portfolio Alerts / Flags System

Proactive warnings with zero user effort: overexposure alerts, archetype imbalance vs targets, low uniqueness clusters, ADP movers worth acting on. Displayed as alert badges on the Dashboard and a collapsible panel on any tab. All data to power these already exists in `masterPlayers`, `PROTOCOL_TREE`, and `adpSnapshots`.

### 7. Export Functionality

"Export to CSV" and "Copy to clipboard" on each analysis tab. Table-stakes for any data tool — users want to share analysis, paste into spreadsheets, or archive snapshots. PapaParse already supports serialization.

### 8. Onboarding / Help System

First-visit welcome modal explaining data format, tab purposes, and a glossary (CLV%, Uniqueness Lift, archetype names). Tooltip `?` icons on key metrics. A "Sample Data" button that loads bundled demo CSVs so users can explore without their own data. Critical for the moment before going public.

---

## P2 — Medium Value

*Depth + polish.*

### 9. ADP Movement Alerts + Watchlist

Mark players as "watched." Surface risers/fallers prominently (data already in `masterPlayers[].history`). "Risers & Fallers" section on Dashboard. Gives users a personal lens into ADP movement.

### 10. Roster Comparison Mode

Select 2–3 rosters side-by-side: position fills by round, CLV comparison, archetype paths, shared players highlighted. Saves cognitive load users currently spend mentally comparing builds.

### 11. Archetype "What If" Simulator

In Roster Construction, simulate shifting N rosters from one archetype path to another. See how exposure percentages would change. Makes the `PROTOCOL_TREE` targets actionable rather than just descriptive.

### 12. Player Correlation Heatmap

Heatmap showing co-occurrence frequency for any two players. Leverages the already-built `computeCooccurrenceMetrics` (Jaccard + Phi) from `draftScorer.js`. Exposes hidden portfolio concentration risk.

### 13. Dark / Light Theme Toggle

Currently hard-coded dark. Add theme toggle via CSS custom properties. Low effort, solid usability improvement.

---

## P3 — Nice-to-Have

*Season-long + advanced.*

### 14. Season-Long Projection Integration

Import weekly projections and overlay projected points onto rosters. Calculate expected weekly lineup scores using best-ball auto-optimal lineup rules. Transforms the tool from draft-phase to year-round.

### 15. Bye Week Conflict Analyzer

Highlight weeks where bye-week stacking creates thin lineups per roster. Show portfolio-wide bye week risk.

### 16. Multi-Platform CSV Support (Underdog, Sleeper, DraftKings)

Platform-specific CSV parsers with auto-detection. Expands addressable user base beyond a single platform's export format.

### 17. Cloud Sync / User Accounts

Optional accounts with cloud storage for multi-device persistence. Major scope jump (requires backend + auth), only after validating demand.

### 18. Live Draft Log Import

Connect to platform APIs to auto-populate the Draft Assistant during a live draft instead of manual entry.

### 19. Historical Season Backtesting

Load prior season results to see how current portfolio construction would have performed historically.

---

## Recommended Build Order

1. **P0 together** — gets the app to "usable by someone other than the developer"
2. **Draft Assistant (P1.5)** — highest single-feature impact, surfaces orphaned `draftScorer.js`
3. **Export + Alerts (P1.7, P1.6)** — quick wins that make existing tabs stickier
4. **Onboarding (P1.8)** — do right before sharing publicly
5. **P2 items** based on user feedback
6. **P3 items** as the product matures
