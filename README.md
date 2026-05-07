# Best Ball Exposures

Portfolio analytics for fantasy best-ball drafters — see your exposures, ADP movement, archetype balance, and stack patterns across every roster, on Underdog and DraftKings.

[BestBallExposures.com](https://bestballexposures.com) · [@BBExposures](https://x.com/BBExposures)

## What's in this repo

| Path | Purpose |
|------|---------|
| `best-ball-manager/` | The web application (React 19 + Vite, deployed to Vercel) |
| `chrome-extension/` | Companion browser extension that syncs rosters from Underdog and DraftKings |
| `supabase/` | Edge Functions (Stripe webhooks) and SQL migrations |
| `scrapers/` | Python ADP scrapers |
| `simulation/` | Python Monte Carlo / projection tools |
| `scripts/` | Node admin scripts (e.g., `grant-pro.mjs`) |
| `docs/` | Vision, feature specs, ADRs, plans, governance |
| `brand/` | Brand assets |

## Local development (web app)

```bash
cd best-ball-manager
npm install
npm run dev      # Vite dev server with HMR
npm run build    # Production build
npm run lint     # ESLint
npx playwright test   # End-to-end tests
```

The web app runs without environment variables — Supabase auth and Stripe billing are optional. Without auth, the guest tier and IndexedDB fallback are active.

## Documentation

- **`docs/Vision_and_Scope.md`** — Product direction, design principles, exclusions
- **`docs/Feature_Specs/`** — Per-tab behavior specs
- **`docs/adr/`** — Architecture Decision Records
- **`BACKLOG.md`** — Active and completed tasks
- **`ROADMAP.md`** — Epics and features
- **`CLAUDE.md`** — Project context for AI-assisted development

## Tech stack

React 19, React Router 7, Vite 7, Recharts, Lucide React, @dnd-kit, @tanstack/react-virtual, PapaParse, Supabase, Stripe, Sentry, Vercel Analytics.

## Architecture (one-liner)

Roster data syncs from the Chrome extension into Supabase / IndexedDB. The web app loads rosters + bundled ADP snapshots + projections, normalizes player identity, and feeds the enriched data into seven tab views (Dashboard, Exposures, Rosters, ADP Tracker, Combos, Rankings, Draft Assistant). All analytics run client-side. See `docs/Vision_and_Scope.md` for the product story and `CLAUDE.md` for the working architecture.
