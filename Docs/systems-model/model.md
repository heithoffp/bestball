# Systems Model — Best Ball Portfolio Manager

**Created:** 2026-03-27
**Mode:** Full (first model)
**Governance Tier:** Standard

---

## Vision & Aspirations

| ID | Aspiration | Description |
|----|-----------|-------------|
| A1 | One-Stop Portfolio Awareness | A best-ball drafter sees the complete shape of their portfolio in one place |
| A2 | Zero-Friction Value | Every feature delivers insight immediately after CSV upload with no setup |
| A3 | Mirror, Not Advisor | The app describes what is, never prescribes what should be |
| A4 | Shape at a Glance | Visual representations create instant pattern recognition |
| A5 | Draft-Time Speed | Draft assistant surfaces recommendations fast enough for 30-second windows |
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
| P1 | CSV Data Pipeline | Current |
| P2 | ADP Snapshot Collection | Current |
| P3 | Portfolio Analytics Engine | Current |
| P4 | Draft Scoring Engine | Current |
| P5 | Archetype Classification | Current |
| P6 | Auth & Cloud Sync Flow | Current (partial) |
| P7 | Build & Deploy Pipeline | Current |
| P8 | Subscription & Payment Flow | Aspirational |
| P9 | Chrome Extension Overlay | Aspirational |
| P10 | hus-skills Governance Process | Current |

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

### External Systems (Orange)

| ID | Name | State |
|----|------|-------|
| E1 | Underdog Fantasy Platform | Current |
| E2 | Supabase (Auth + Storage) | Current (partial) |
| E3 | Vercel (Hosting + Analytics) | Current |
| E4 | Stripe (Payments) | Aspirational |
| E5 | Sleeper / DraftKings Platforms | Aspirational |

---

## System Boundary

- **Internal:** R2, R3, P1–P7, P10, A1–A6
- **External:** E1–E5
- **Boundary-straddling:** P6 (our code, depends on E2), P7 (our config, depends on E3)
- **Aspirational & external:** P8 (depends on E4), P9 (depends on E1), A7, E4, E5

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
| 17 | R1 | P6 | Signs up / logs in | Current (partial) |
| 18 | P6 | E2 | Auth + cloud storage | Current (partial) |
| 19 | E2 | A4 | Syncs to/from cloud | Current (partial) |
| 20 | R1 | E1 | Drafts on Underdog | Current |
| 21 | E1 | A1 | Exports roster CSV | Current |
| 22 | R2 | R3 | Directs development | Current |
| 23 | R3 | A3 | Writes/modifies code | Current |
| 24 | R3 | A5 | Updates documentation | Current |
| 25 | R3 | P10 | Follows governance | Current |
| 26 | P10 | A6 | Maintains gov artifacts | Current |
| 27 | A6 | R3 | Guides work priorities | Current |
| 28 | A5 | R3 | Informs design decisions | Current |
| 29 | P8 | E4 | Processes payments | Aspirational |
| 30 | R1 | P8 | Subscribes to plan | Aspirational |
| 31 | P9 | E1 | Overlays on draft page | Aspirational |
| 32 | P9 | P4 | Uses scoring engine | Aspirational |
| 33 | E5 | A1 | Exports roster CSV | Aspirational |
| 34 | R1 | A7 | Discovers product | Aspirational |
| 35 | A7 | P6 | Drives signup | Aspirational |

---

## Feedback Loops

| ID | Name | Type | State | Blocks | Description |
|----|------|------|-------|--------|-------------|
| FL1 | Draft-Analyze-Draft | Reinforcing | Active | R1→E1→A1→P1→P3→A3→R1 | Core value loop: draft, upload, see portfolio shape, make better next draft. More drafts = richer data = better insights. |
| FL2 | ADP-Value Discovery | Reinforcing | Active | R2→P2→A2→P1→P3→A3→R1 | Fresh ADP snapshots update CLV and trends. More snapshots = richer timeline. Bottlenecked on R2 manual collection. |
| FL3 | Governance-Development | Balancing | Active | R2→R3→P10→A6→R3 | Governance constrains pace to prevent scope drift. Balancing: faster dev resisted by process overhead. |
| FL4 | Adoption-Revenue-Investment | Reinforcing | Aspirational | R1→P8→E4→R2→R3→A3→R1 | Subscribers fund new features, attracting more subscribers. Not active — P8/E4 don't exist. |
| FL5 | Portfolio Context Sync | Reinforcing | Aspirational | R1→P9→P4→P3→R1 | Chrome extension uses portfolio context during live drafts, producing better picks that feed back. |

---

## Diagrams

| File | Focus |
|------|-------|
| `core.d2` / `core.svg` | All blocks and interactions (current + aspirational) |
| `feedback.d2` / `feedback.svg` | Five feedback loops with state annotations |

---

## Integration Summary

### Tier 1 — Address Now
- **T1: Commercial Strategy Gap** — Add new feature to EPIC-01 for commercial strategy & positioning (pricing, competitive analysis, channel strategy). Sequence before FEAT-002 and FEAT-014.

### Tier 2 — Address Soon
- **T2: User Insight Blindness** — Expand FEAT-003 to include feature-level usage analytics. Assumption validation (F-003, F-005) handled through T1 research.
- **T3: Auth-Payment Chain** — Already tracked as FEAT-001/FEAT-002. Add dependency: FEAT-002 consumes pricing decisions from T1.

### Tier 3 — Address Later
- **T4: Operational Resilience** — Automate ADP scraping before scaling to paying users.
- **T5: Governance Calibration** — Revisit if velocity feels constrained.
