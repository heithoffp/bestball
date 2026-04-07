<!-- Completed: 2026-04-07 | Commit: pending -->
# TASK-165: Landing page — build complete marketing page

**Status:** Approved
**Priority:** P1

---

## Objective
Build a marketing landing page that serves as the primary acquisition surface — the first thing a Reddit or social media visitor sees. Converts visitors into signups using copy from the value proposition (TASK-164) and competitive positioning (TASK-163). Must look polished, load fast, and work on mobile.

## Verification Criteria
1. Unauthenticated guests with no data see the landing page instead of the app.
2. Clicking "Get Started Free" or "Sign In" opens the auth modal.
3. After sign-up, the landing page is replaced by the tab-based app.
4. All 8 sections render correctly at desktop (1440px), tablet (768px), and phone (375px) widths.
5. No horizontal scrolling on any viewport width down to 320px.
6. All text uses existing design tokens (CSS custom properties from `index.css`).
7. No competitor names appear in any copy (per `docs/value-proposition.md` messaging guidelines).
8. `npm run build` succeeds with no errors.
9. `npm run lint` passes with no new warnings.

## Verification Approach
1. Run `npm run build` from `best-ball-manager/` — must succeed with no errors.
2. Run `npm run lint` from `best-ball-manager/` — must pass cleanly.
3. Run `npm run dev` and open in browser:
   - Without signing in, confirm landing page renders (not the app).
   - Click "Get Started Free" — confirm auth modal opens.
   - Click "Sign In" — confirm auth modal opens.
   - Developer: resize browser to 1440px, 768px, 480px, 375px — confirm layout adapts correctly with no horizontal overflow.
   - Developer: sign in — confirm landing page is replaced by the tab-based app.
4. Grep all copy in `LandingPage.jsx` for competitor names (BBO, Spike Week, LegUp, Draft Caddy, Bag Manager, SOLVER) — must find zero matches.

Steps 1-2 and step 4 can be run by Claude. Step 3 requires the developer.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/LandingPage.jsx` | Create | Full marketing landing page component |
| `best-ball-manager/src/components/LandingPage.module.css` | Create | Styles for all landing page sections with responsive breakpoints |
| `best-ball-manager/src/App.jsx` | Modify | Add conditional render: show LandingPage for guests with no data |

## Implementation Approach

### Architecture: In-App Conditional Render

No router needed. `App.jsx` already tracks `tier` (from `useSubscription`) and `rosterData` state. Add a conditional at the top of the render:

- If `tier === 'guest'` AND `rosterData.length === 0` AND `!isUsingDemoData` → render `<LandingPage />`
- Otherwise → render the existing tab-based app

The LandingPage component is lazy-loaded so it's tree-shaken once the user enters the app. It receives two callbacks: `onSignUp` (opens AuthModal) and `onTryDemo` (loads demo data — disabled/hidden until TASK-168).

### Landing Page Sections (top to bottom)

1. **Nav bar** — `BrandLogo` + "Best Ball Portfolio Manager" on left, "Sign In" (text link) and "Get Started" (gold accent button) on right. Fixed at top with subtle backdrop blur. On mobile: logo + single "Get Started" CTA.

2. **Hero** — Headline: "You Draft Portfolios. Your Tools Should Analyze Them." (Option C from value-proposition.md). Subheadline: "Individual roster tools miss the point. When you're 40 drafts deep, the questions that matter are portfolio questions. We answer all of them." Two CTAs: "Get Started Free" (primary gold) and "Try Demo" (secondary outlined, hidden until TASK-168). Beta badge: "Free through the NFL Draft — no credit card required."

3. **Trust bar** — Horizontal strip: "Supports Underdog & DraftKings" • "Zero config — upload and go" • "Free tier available". Minimal, confidence-building.

4. **Feature showcase** — 6 feature cards in a responsive grid (3 cols → 2 → 1). Each card: icon (Lucide), headline, 2-sentence copy, and optional "Only here" badge for unique features. Cards for: Portfolio Dashboard, Roster Archetypes (unique badge), Draft Flow Analysis (unique badge), Multi-Platform Support, Combo/Stacking Analysis, ADP Tracking. Copy sourced directly from `docs/value-proposition.md` feature callouts.

5. **Pricing** — Two-tier card layout side by side (stacked on mobile). Free tier: Dashboard, Exposures, Roster Viewer with Archetypes, CTA "Get Started Free". Pro tier ($20/mo): All 7 analytics tabs listed, CTA "Start Free Beta", badge "Free through April 25". Pro card has gold accent border to draw the eye.

6. **Comparison table** — "What you get" table. Columns: Feature | Free Tools | Us (Free) | Us (Pro). Rows from value-proposition.md pricing justification table. Checkmarks and dashes, no competitor names. Responsive: horizontal scroll wrapper on mobile.

7. **Final CTA** — Large centered text: "See the shape of 50 drafts in 5 seconds." + "Get Started Free" button.

8. **Footer** — "Best Ball Portfolio Manager" + copyright year + "Built for serious best-ball drafters."

### Design Approach

- All colors, fonts, spacing, and radii from `index.css` CSS custom properties
- Dark theme with gold accent — consistent with the app
- Feature cards use `var(--surface-1)` background with `var(--border-subtle)` border
- CTAs use `var(--gradient-accent)` with `var(--text-inverse)` text
- Hero text uses `var(--font-mono)` for headline (matches app h1 style), `var(--font-body)` for subheadline
- Subtle fade-in on scroll via IntersectionObserver (no animation libraries)
- Max content width ~1200px, centered, with consistent horizontal padding

### Mobile Strategy

Three breakpoints in CSS module:
- `@media (max-width: 768px)` — tablet: 2-column feature grid, stacked pricing cards
- `@media (max-width: 480px)` — phone: single-column everything, reduced font sizes, simplified nav

### Integration with App.jsx

- Add `const LandingPage = lazy(() => import('./components/LandingPage'))` alongside other lazy imports
- In the render, before the existing app-container div, add the conditional check
- The landing page renders INSTEAD of the app (not inside the app-container), so it gets its own full-page layout without the app header/tabs

## Dependencies
- TASK-164 (value proposition copy) — **Completed**
- TASK-166 (product screenshots) — Not started; feature cards will use icons instead of screenshots. Screenshots can be added later as a polish pass.

## Open Questions
- "Try Demo" button: hidden until TASK-168 provides sample data. The button slot exists in the hero but will be rendered only when demo data is available (or omitted entirely for now).

---
*Approved by: PH — 2026-04-06*
