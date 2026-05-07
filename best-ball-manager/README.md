# Best Ball Exposures — Web App

Your best-ball portfolio, analyzed. Sync rosters from Underdog and DraftKings via the companion Chrome extension, and explore exposures, archetypes, ADP movement, and draft strategy from one dashboard.

## Tabs

- **Dashboard** — Headline metrics, top exposures, RB archetype distribution, draft capital by round, and drill-down cards.
- **Exposures** — Sortable player exposure table with inline ADP sparklines and archetype filters.
- **Rosters** — Per-roster grading (projected points, CLV, draft rarity, spike week), archetype classification, and stack analysis.
- **ADP Tracker** — Multi-platform historical ADP timelines with the user's pick-range overlay.
- **Combos** — QB stack and dual-QB pair analysis across the portfolio.
- **Rankings** — Tier-based drag-and-drop draft board with per-platform Underdog / DraftKings boards.
- **Draft Assistant** — The opinionated tab. Multi-factor candidate scoring (projected value, diversification, exposure penalty, strategy fit, reach penalty, strategy kill detection) for live-draft decisions.

Help is contextual: a global Help button overlays per-tab annotations on the active screen.

## Getting started

```bash
npm install
npm run dev      # dev server
npm run build    # production build
npm run lint
npx playwright test
```

The app runs without environment variables. Supabase auth and Stripe billing are optional — without them, the guest tier renders the landing page with a "Try Demo" path.

## Tech stack

React 19, React Router 7, Vite 7, Recharts, @dnd-kit, @tanstack/react-virtual, PapaParse, Supabase, Stripe, Sentry, Vercel Analytics, Playwright.

## Documentation

See `../docs/Feature_Specs/` for per-tab specs, `../docs/Vision_and_Scope.md` for product direction, and `../CLAUDE.md` for architecture and contribution guidelines.
