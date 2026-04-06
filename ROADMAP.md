# Roadmap

<!-- ROADMAP.md is the single planning authority for epics and features.
     Features are defined inline under their parent epic -- there is no separate FEATURES.md.
     Tasks in BACKLOG.md reference FEAT-NNN IDs defined here.
     Feature IDs: FEAT-NNN, zero-padded, sequential, never reused. -->

## EPIC-01: Commercial Foundation
**Goal:** Establish subscription model, authentication, and payment infrastructure for a viable SaaS product.
**Verification:** A new user can sign up, subscribe to a paid tier, and access the app with cloud-persisted data. Guest mode works without payment.
**Status:** Not Started
**ADRs:**

### FEAT-001: User Authentication & Accounts
**Status:** In Progress
**Description:** Supabase auth with signup/login flow, cloud data persistence for authenticated users, and guest mode fallback via IndexedDB. Auth scaffolding partially exists (AuthButton component, Supabase dependency).
**Tasks:** TASK-004, TASK-005, TASK-006, TASK-007, TASK-017, TASK-019, TASK-022, TASK-032

### FEAT-002: Subscription & Payment Integration
**Status:** Not Started
**Description:** Payment processing (Stripe or similar) with subscription tier gating and self-service subscription management. Determines which features are available to free vs paid users.
**Depends on:** FEAT-021 — pricing and tier decisions should be made before implementing payment integration.
**Tasks:** TASK-013, TASK-014, TASK-015, TASK-016, TASK-025, TASK-026

### FEAT-003: Deployment & Infrastructure Polish
**Status:** In Progress
**Description:** Production Vercel configuration with custom domain, Vercel Analytics and Speed Insights integration, and error monitoring. Vercel dependencies already installed; deployment pipeline needs hardening. Feature-level usage analytics beyond page views — track tab visits, CSV uploads, draft sessions started, and key user flows to validate assumptions about feature value and user retention.
**Tasks:** TASK-008, TASK-009, TASK-010, TASK-011, TASK-012, TASK-018

### FEAT-021: Commercial Strategy & Positioning
**Status:** Complete
**Description:** Competitive analysis (pricing, features, positioning vs. Best Ball Overlay), pricing model and tier definition, channel strategy for reaching serious best-ball drafters, and launch planning. This is a research/strategy feature — outputs inform FEAT-002 (tier gating) and FEAT-014 (landing page messaging).
**Tasks:** TASK-001, TASK-002, TASK-003, TASK-020, TASK-021, TASK-024

---

## EPIC-02: Core Analytics Polish
**Goal:** Remove personal bias, fix vision alignment issues, and make all analytics tabs production-quality for a general audience.
**Verification:** All six analysis tabs render correctly with no opinionated color coding, no prescriptive coaching language, and no disabled tabs. CSV export works on all data views.
**Status:** Not Started
**ADRs:**

### FEAT-004: Vision Alignment Fixes
**Status:** In Progress
**Description:** Neutralize opinionated color scales (correlation in Draft Assistant, Uniqueness Lift in Roster Viewer), remove RB Protocol Blurbs from Draft Assistant, remove Grading System and Spike Points from Roster Viewer, remove archetype target weightings, remove JaccardAnalysis tab, rename "Falling" badge to neutral "ADP Rising" label, replace Uniqueness Lift with First 6 Pick Uniqueness (Monte Carlo-based), and rename LIFT parameter to plain-English label. Each fix addresses a violation of the Mirror, Not Advisor design principle.
**Tasks:** TASK-033, TASK-034, TASK-035, TASK-036, TASK-037, TASK-038, TASK-039, TASK-040, TASK-112, TASK-113, TASK-114, TASK-115

### FEAT-005: Re-enable Combo Analysis
**Status:** Not Started
**Description:** Performance optimization to make the Combo Analysis tab usable at scale. Currently disabled due to performance issues. See `Docs/Feature_Specs/Combo_Analysis.md`.

### FEAT-006: Re-enable Roster Construction
**Status:** Not Started
**Description:** Performance optimization to make the Roster Construction tab usable at scale. Currently disabled due to performance issues. See `Docs/Feature_Specs/Roster_Construction.md`.

### FEAT-007: CSV Export
**Status:** Not Started
**Description:** Download current view as CSV from exposure table, roster viewer, and other analysis tabs. PapaParse already supports serialization. Copy-to-clipboard as secondary action.

### FEAT-008: Data Validation & Upload UX
**Status:** Not Started
**Description:** CSV format validation with actionable error messages for non-Underdog formats, upload confirmation dialog with one-level undo via backup key, ADP freshness indicator showing last-updated date, and drag-and-drop file upload support.

### FEAT-023: Cross-Module Roster Navigation
**Status:** Not Started
**Description:** Contextual "See Roster(s)" button that appears across analytical modules, allowing users to jump to the Roster Viewer tab with pre-set filters matching the insight they're exploring. Turns independent views into an interconnected analytical surface. Applies to Dashboard (player exposure, archetype segments), Exposure Analysis (player rows), Combo Analysis (stack profiles), ADP Tracker (player on chart), and Roster Construction (tree nodes). Does not apply to Roster Viewer (destination), Player Rankings (pre-draft prep), Draft Assistant (live draft), or Help Guide. Directly solves the Dashboard known limitation: "Drill-down cards do not pass filter state to destination tabs."
**Tasks:** TASK-124, TASK-125, TASK-126

---

## EPIC-03: Chrome Extension / Draft Overlay
**Goal:** Deliver a browser extension that provides real-time portfolio-aware draft assistance directly on the Underdog platform.
**Verification:** A user can install the Chrome extension, connect it to their portfolio data, and see real-time candidate scoring overlaid on the Underdog draft interface.
**Status:** Not Started
**ADRs:**

### FEAT-009: Extension Architecture & Scaffold
**Status:** Not Started
**Description:** Chrome extension manifest v3, content script injection targeting Underdog draft pages, and communication bridge to web app data (via shared Supabase storage or local messaging).
**Tasks:** TASK-042, TASK-043, TASK-048, TASK-049

### FEAT-010: Draft Overlay UI
**Status:** In Progress
**Description:** Inline overlay on Underdog live draft pages showing portfolio context (exposure %, correlation) injected directly into player rows. Handles react-virtualized recycling, theme-adaptive styling, and popup toggle. Per ADR-002, displays data only — no scoring or recommendations.
**Tasks:** TASK-046, TASK-047, TASK-096, TASK-138, TASK-139

### FEAT-011: Portfolio Context Sync
**Status:** Not Started
**Description:** Sync portfolio data between the web app and extension so the overlay has access to current exposure percentages, archetype distribution, and draft history for exposure-aware recommendations.
**Tasks:** TASK-044, TASK-045

### FEAT-022: Extension Setup & Trust UX
**Status:** Not Started
**Description:** The overlay's floating icon serves as a "confidence hub" — sync progress visibility, connectivity status with actionable errors, tournament selection for scoping overlay data, and a setup verification summary. Users open the panel, verify everything is configured and connected, close it, and draft with confidence. Addresses systems model findings F-010, F-011, F-012, F-013.
**Depends on:** TASK-100 (floating logo button provides the UI surface)
**Tasks:** TASK-106, TASK-107, TASK-108

---

## EPIC-04: Onboarding & Growth
**Goal:** Reduce friction to zero for new users and create a compelling public-facing presence that drives signups.
**Verification:** A first-time visitor can understand the product value, sign up, load sample data, and explore all tabs with contextual guidance — all within 60 seconds.
**Status:** Not Started
**ADRs:**

### FEAT-012: First-Run Experience
**Status:** Not Started
**Description:** Empty state guidance on all tabs (Dashboard has partial empty state; other tabs need it). Sample data button that loads bundled demo CSVs so users can explore without their own data.
**Tasks:** TASK-023

### FEAT-013: Contextual Help
**Status:** Not Started
**Description:** Replace standalone Help tab with per-tab help widgets that highlight key features, important elements, and terminology contextually. Serves as onboarding for new users and reference for experienced ones.

### FEAT-014: Landing Page
**Status:** Not Started
**Description:** Marketing site with clear value proposition, product screenshots, pricing tiers, competitor comparison, and signup CTA. First touchpoint for potential subscribers.

---

## EPIC-05: Mobile Experience
**Goal:** Make the full app usable on phones and tablets without compromising functionality.
**Verification:** All tabs render correctly and are fully interactive on a 375px-wide viewport. No horizontal scrolling, no unreadable text, no unreachable controls.
**Status:** Not Started
**ADRs:**

### FEAT-015: Responsive Layout System
**Status:** Not Started
**Description:** CSS breakpoints, card-based layouts for narrow screens, collapsible tab navigation, and responsive chart sizing. Current layout uses hardcoded pixel widths with no breakpoints.

### FEAT-016: Touch-Friendly Controls
**Status:** Not Started
**Description:** Appropriately sized tap targets (minimum 44px), swipe gestures for tab navigation, mobile-optimized data tables with horizontal scroll or card view alternatives.

---

## EPIC-06: Advanced Analytics
**Goal:** Expand analytical depth with features that differentiate the product from competitors.
**Verification:** Each new analytics view renders correctly with real portfolio data and provides insights not available in competing tools.
**Status:** Not Started
**ADRs:**

### FEAT-017: Player Correlation Heatmap
**Status:** Not Started
**Description:** Heatmap visualization showing co-occurrence frequency for any two players. Leverages existing `computeCooccurrenceMetrics` (Jaccard + Phi) from draftScorer.js. Exposes hidden portfolio concentration patterns.

### FEAT-018: Roster Comparison Mode
**Status:** Not Started
**Description:** Select 2-3 rosters for side-by-side comparison: position fills by round, CLV comparison, archetype paths, and shared players highlighted.

### FEAT-019: ADP Movement Alerts
**Status:** Not Started
**Description:** Passively surface risers and fallers on the dashboard using existing `masterPlayers[].history` data. Zero-config — no watchlist required, consistent with the Zero-Config Insights design principle.

### FEAT-020: Multi-Platform CSV Support
**Status:** In Progress
**Description:** Auto-detect and parse Sleeper and DraftKings CSV export formats alongside Underdog. No user selection required — format detection is automatic per the Zero-Config Insights principle.
**Tasks:** TASK-141, TASK-142, TASK-143, TASK-144, TASK-145
