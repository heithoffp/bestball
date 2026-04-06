# Systems Model — Best Ball Portfolio Manager

**Created:** 2026-03-27
**Last Updated:** 2026-04-06
**Mode:** Delta (3-day update)
**Governance Tier:** Standard

---

## Vision & Aspirations

| ID | Aspiration | Description |
|----|-----------|-------------|
| A1 | One-Stop Portfolio Awareness | A best-ball drafter sees the complete shape of their portfolio in one place |
| A2 | Zero-Friction Value | Every feature delivers insight immediately after CSV upload with no setup |
| A3 | Mirror, Not Advisor | The app describes what is, never prescribes what should be |
| A4 | Shape at a Glance | Visual representations create instant pattern recognition |
| A5 | Draft-Time Speed | Extension surfaces portfolio context fast enough for 30-second draft windows |
| A6 | Commercial Viability | Compete with Best Ball Overlay, target 500 subscribers by NFL 2026 |
| A7 | Platform Reach | Works on all devices, supports multiple fantasy platforms |

---

## Block Inventory

### Roles (Blue)

| ID | Name | State |
|----|------|-------|
| R1 | Best-Ball Drafter (End User) | Current |
| R2 | Developer (Patrick) | Current |
| R3 | Claude Code (AI Dev Agent) | Current |

### Processes/Tools (Purple)

| ID | Name | State |
|----|------|-------|
| P1 | CSV Data Pipeline | Current (multi-platform — Underdog + DraftKings) |
| P2 | ADP Snapshot Collection | Current |
| P3 | Portfolio Analytics Engine | Current (platform-aware CLV, per-platform ADP, cross-module nav) |
| P4 | Draft Scoring Engine | Current |
| P5 | Archetype Classification | Current |
| P6 | Auth & Cloud Sync Flow | Current |
| P7 | Build & Deploy Pipeline | Current |
| P8 | Subscription & Payment Flow | Current |
| P9 | Chrome Extension Overlay | Current (partial — Underdog only) |
| P10 | hus-skills Governance Process | Current |
| P11 | Entries Scraper (Extension → Supabase) | Current |
| P12 | Contextual Help System | Current |
| P13 | User Feedback Pipeline | Current |
| P14 | Feature Gating Engine | Current |

### Artifacts (Green)

| ID | Name | State |
|----|------|-------|
| A1 | Roster CSV Files | Current |
| A2 | ADP Snapshot CSVs | Current |
| A3 | Analytics UI (React Tab Components) | Current |
| A4 | IndexedDB Local Storage | Current |
| A5 | Project Docs (Vision, Feature Specs, CLAUDE.md) | Current |
| A6 | Governance Artifacts (ROADMAP, BACKLOG, LIFECYCLE, ADRs, Plans) | Current |
| A7 | Landing Page | Aspirational |
| A8 | Design System (CSS Token Layer) | Current |
| A9 | Chrome Extension Package | Current |

### External Systems (Orange)

| ID | Name | State |
|----|------|-------|
| E1 | Underdog Fantasy Platform | Current |
| E2 | Supabase (Auth + Storage + Edge Functions) | Current |
| E3 | Vercel (Hosting + Analytics) | Current |
| E4 | Stripe (Payments) | Current |
| E5 | DraftKings / Sleeper Platforms | Partially Current (DK live, Sleeper aspirational) |

---

## System Boundary

- **Internal:** R2, R3, P1–P7, P10–P14, A1–A6, A8, A9
- **External:** E1–E5
- **Boundary-straddling:** P6 (our code, depends on E2), P7 (our config, depends on E3), P8 (our code, depends on E4), P9/P11 (our code, depends on E1+E2), P13 (our code, depends on E2)
- **Aspirational:** A7, E5 (Sleeper only)

---

## Interaction Map

| ID | From | To | Label | State |
|----|------|----|-------|-------|
| 1 | R1 | A1 | Uploads roster CSV | Current |
| 2 | A1 | P1 | Parsed by pipeline | Current |
| 3 | P1 | P3 | Feeds enriched data | Current |
| 4 | A2 | P1 | ADP snapshots joined | Current |
| 5 | P3 | A3 | Renders analytics tabs | Current |
| 6 | A3 | R1 | Views portfolio insights | Current |
| 7 | P3 | P5 | Classifies archetypes | Current |
| 8 | P3 | P4 | Scores draft candidates | Current |
| 9 | R1 | P4 | Initiates draft session | Current |
| 10 | R2 | P2 | Runs ADP scraper | Current |
| 11 | P2 | A2 | Produces ADP snapshots | Current |
| 12 | R1 | A4 | Data persists locally | Current |
| 13 | A4 | P1 | Loads saved data | Current |
| 14 | R2 | P7 | Triggers build/deploy | Current |
| 15 | P7 | E3 | Deploys to Vercel | Current |
| 16 | E3 | R1 | Serves application | Current |
| 17 | R1 | P6 | Signs up / logs in | Current |
| 18 | P6 | E2 | Auth + cloud storage | Current |
| 19 | E2 | A4 | Syncs to/from cloud | Current |
| 20 | R1 | E1 | Drafts on Underdog | Current |
| 21 | E1 | A1 | Exports roster CSV | Current |
| 22 | R2 | R3 | Directs development | Current |
| 23 | R3 | A3 | Writes/modifies code | Current |
| 24 | R3 | A5 | Updates documentation | Current |
| 25 | R3 | P10 | Follows governance | Current |
| 26 | P10 | A6 | Maintains gov artifacts | Current |
| 27 | A6 | R3 | Guides work priorities | Current |
| 28 | A5 | R3 | Informs design decisions | Current |
| 29 | P8 | E4 | Processes payments | Current |
| 30 | R1 | P8 | Subscribes to plan | Current |
| 31 | P9 | E1 | Overlays on draft page | Current |
| 34 | R1 | A7 | Discovers product | Aspirational |
| 35 | A7 | P6 | Drives signup | Aspirational |
| 36 | P11 | E1 | Scrapes entries from Underdog | Current |
| 37 | P11 | E2 | Writes roster data to Supabase | Current |
| 38 | P9 | E2 | Reads portfolio data for overlay | Current |
| 39 | A8 | A3 | Token system styles all UI | Current |
| 40 | P8 | P6 | Subscription requires auth | Current |
| 41 | P9 | P3 | Uses portfolio analytics for exposure/correlation | Current |
| 42 | R1 | P13 | Submits in-app feedback | Current |
| 43 | P13 | E2 | Routes via Edge Function | Current |
| 44 | P13 | R2 | Delivers feedback email | Current |
| 45 | P14 | A3 | Gates tab access by tier | Current |
| 46 | P8 | P14 | Subscription tier feeds gating | Current |
| 47 | P12 | A3 | Overlays help annotations | Current |
| 48 | E5 | A2 | DraftKings ADP snapshots | Current |
| 49 | E5 | A1 | DraftKings roster CSVs | Current |

**Removed:** Interaction 32 (P9 → P4 "Uses scoring engine") — per ADR-002, overlay shows data only.
**Removed:** Interaction 33 (E5 → A1 aspirational) — replaced by interactions 48 and 49 (DraftKings now current).

---

## Feedback Loops

| ID | Name | Type | State | Blocks | Description |
|----|------|------|-------|--------|-------------|
| FL1 | Draft-Analyze-Draft | Reinforcing | Active | R1→E1→A1→P1→P3→A3→R1 | Core value loop: draft, upload, see portfolio shape, make better next draft. More drafts = richer data = better insights. |
| FL2 | ADP-Value Discovery | Reinforcing | Active | R2→P2→A2→P1→P3→A3→R1 | Fresh ADP snapshots update CLV and trends. More snapshots = richer timeline. Bottlenecked on R2 manual collection. |
| FL3 | Governance-Development | Balancing | Active | R2→R3→P10→A6→R3 | Governance constrains pace to prevent scope drift. Balancing: faster dev resisted by process overhead. |
| FL4 | Adoption-Revenue-Investment | Reinforcing | Partially Active | R1→P8→E4→R2→R3→A3→R1 | Subscribers fund new features, attracting more subscribers. Payment infrastructure is live; no subscribers yet. Blocked upstream by T8 (acquisition funnel). |
| FL5 | Portfolio Context Sync | Reinforcing | Active | R1→P11→E2→P9→P3→A3→R1 | Extension scrapes entries → Supabase → web app reads portfolio → extension overlay shows exposure/correlation during draft. |
| FL6 | Design Consistency | Reinforcing | Active | A8→A3→R1 | Token system ensures new components inherit consistent styling. More components → tokens refined → higher quality floor. |
| FL7 | User Feedback | Reinforcing | Partially Active | R1→P13→E2→R2→R3→A3→R1 | Users submit in-app feedback → Supabase Edge Function → email to developer → improvements built → users benefit. Infrastructure live; no external users yet. |

---

## Diagrams

| File | Focus |
|------|-------|
| `core.d2` / `core.svg` | All blocks and interactions (current + aspirational) |
| `feedback.d2` / `feedback.svg` | Seven feedback loops with state annotations |
| `subsystems/chrome-extension.d2` / `.svg` | Chrome extension architecture |
| `subsystems/chrome-extension-data-flow.d2` / `.svg` | Extension runtime data flow |

---

## Integration Summary

### Delta 2026-04-06 — Resolved Themes

| Theme | Status | Resolution |
|-------|--------|------------|
| T1: Commercial Strategy Gap | **Resolved** | FEAT-021 complete — pricing, positioning, channel strategy decided |
| T2: User Insight Blindness | **Mostly Resolved** | Feature analytics + extension scraper + feedback button. F-005 residual partially resolved by DraftKings support. |
| T3: Auth-Payment Chain | **Resolved** | Full auth + Stripe + subscription management live |

### Delta 2026-04-06 — Current Tiers

#### Tier 1 — Address Now
- **T8: Acquisition Funnel & Discoverability** — No landing page, no public presence. Competitors already posting on r/bestball. The product is invisible to potential users.
- **T10: Commercial Strategy Refresh** — March 30 competitive analysis didn't account for free tools now appearing on r/bestball. "Why pay $20/mo?" needs a sharper answer.

#### Tier 2 — Address Soon
- **T9: Conversion Path & First Impression** — Guest tier shows only 2 of 7 tabs. No sample data for empty-state users. Free competitors show everything. Bridge needed.
- **T6: Extension Confidence & Trust** — Overlay lacks sync visibility, tournament selection, connectivity status. Demoted from Tier 1 — launch readiness takes priority.

#### Tier 3 — Address Later
- **T7: Extension Lifecycle Management** — SPA navigation handling. Tracked as TASK-103.
- **T5: Governance Calibration** — Revisit if velocity feels constrained.
- **T4: Operational Resilience** — Automate ADP scraping before scaling to paying users.
