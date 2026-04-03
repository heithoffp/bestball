# Chrome Extension Systems Model

**Created:** 2026-03-31
**Last Updated:** 2026-04-03
**Scope:** EPIC-03 — Chrome Extension / Draft Overlay

---

## Aspirations

| ID | Aspiration |
|----|-----------|
| A1 | **Zero-friction portfolio sync** — Eliminate the manual CSV download/upload loop entirely. Visiting a draft platform = portfolio is synced. |
| A2 | **Real-time draft intelligence** — Surface portfolio-aware context during live drafts, fast enough for 30-second pick windows. |
| A3 | **Invisible when not needed** — Unnoticeable until the user is on a relevant page, then show exactly what matters. |
| A4 | **Lightweight and stable** — Never break the draft site, never slow it down, survive React re-renders. |
| A5 | **Shared identity** — One login works for both the web app and extension; portfolio data flows seamlessly. |
| A6 | **Cross-platform usability** — Same extension works across Underdog, DraftKings, and eventually other draft sites with a consistent look and feel. Platform-specific logic is isolated behind a common interface. |

---

## Block Inventory

### Roles (Blue)

| ID | Name | State | Subsystems |
|----|------|-------|------------|
| R1 | Drafter (User) | Current | S4 (primary), all |
| R2 | Web App | Current | S3 |

### Processes (Purple)

| ID | Name | State | Subsystems |
|----|------|-------|------------|
| P1 | Background Service Worker | Current | S1 |
| P2 | Platform Adapter — Underdog | Current | S2 |
| P3 | Platform Adapter — DraftKings | Aspirational | S2 |
| P4 | Scrape Orchestrator | Current | S3 |
| P5 | Draft Board Observer | Current (partial) | S4 |
| P7 | Data Sync Pipeline | Current | S3 |

### Artifacts (Green)

| ID | Name | State | Subsystems |
|----|------|-------|------------|
| A1 | Manifest v3 | Current | S1 |
| A2 | Popup UI (Auth + Status) | Current | S1 |
| A3 | Draft Overlay (Context Display) | Current | S4 |
| A4 | Platform Adapter Interface | Current | S2 |
| A5 | Local Cache (chrome.storage) | Current | S3 |

### External Systems (Orange)

| ID | Name | State | Subsystems |
|----|------|-------|------------|
| E1 | Supabase (Auth + Data) | Current | S1, S3 |
| E2 | Underdog Fantasy | Current | S2 |
| E3 | DraftKings | Aspirational | S2 |
| E4 | Chrome Extensions API | Current | S1 |

---

## Subsystems

| ID | Name | Member Blocks | State |
|----|------|--------------|-------|
| S1 | Auth & Lifecycle | P1, A1, A2, E4 | Current |
| S2 | Platform Abstraction | P2, P3, A4, E2, E3 | Current (Underdog only) |
| S3 | Data Pipeline | P4, P7, A5, E1, R2 | Current |
| S4 | Draft Context | P5, A3, R1 | Current |

---

## Interactions

| # | From | To | Label | State | Crosses |
|---|------|----|-------|-------|---------|
| 1 | R1 | A2 | Opens popup, logs in | Current | -> S1 |
| 2 | A2 | P1 | Triggers auth flow | Current | S1 internal |
| 3 | P1 | E1 | Authenticates via Supabase | Current | S1 -> S3 |
| 4 | P1 | E4 | Registers service worker | Current | S1 internal |
| 5 | A1 | E4 | Declares permissions | Current | S1 internal |
| 6 | P1 | A4 | Routes by URL to adapter | Current | S1 -> S2 |
| 7 | P2 | E2 | Reads Underdog DOM | Current | S2 -> external |
| 8 | P3 | E3 | Reads DraftKings DOM | Aspirational | S2 -> external |
| 9 | P4 | A4 | Calls adapter.getEntries() | Current | S3 -> S2 |
| 10 | P4 | P7 | Passes scraped entries | Current | S3 internal |
| 11 | P7 | E1 | Writes roster data | Current | S3 -> external |
| 12 | P7 | A5 | Caches portfolio locally | Current | S3 internal |
| 13 | R2 | E1 | Reads synced portfolio | Current | -> S3 |
| 14 | P5 | A4 | Calls adapter.getDraftState() | Current (partial) | S4 -> S2 |
| 15 | P5 | A5 | Reads cached portfolio context | Current | S4 -> S3 |
| 16 | P5 | A3 | Feeds context data to overlay | Current | S4 internal |
| 17 | A3 | A4 | Calls adapter.getInjectionTarget() | Current | S4 -> S2 |
| 18 | R1 | A3 | Views context during draft | Current | -> S4 |
| 19 | P7 | P1 | Reports sync status | Current (partial) | S3 -> S1 |

---

## Feedback Loops

| Loop | Type | State | Description |
|------|------|-------|-------------|
| FL1 | Reinforcing | Active | Draft -> Portfolio update -> Better context in next draft |
| FL2 | Balancing | Active | High exposure shown -> User avoids player -> Exposure stays balanced |
| FL3 | Balancing | Active | DOM change -> MutationObserver re-injects -> Stability maintained |

---

## Interrogation Findings

| ID | Category | Severity | Blocks | Aspiration | Finding | Status |
|----|----------|----------|--------|------------|---------|--------|
| F-001 | tension | High | A3 | A3, A4 | Overlay must feel native, not bolted-on. Streamers avoid Best Ball Overlay because it's distracting. | **Active** — design constraint applied |
| F-002 | assumption | High | P2, E2 | A4, A6 | DOM scraping is fragile. Platform markup can change anytime. | **Active** — adapters built with resilient selectors |
| F-003 | gap | Medium | P2, P3, A4 | A6 | Adapter interface needs a clear contract. | **Resolved** — `adapters/interface.js` defines contract |
| F-004 | boundary-issue | Medium | P1, E1 | A5 | Extension needs its own Supabase auth context. | **Resolved** — stored token in chrome.storage |
| F-005 | assumption | Medium | P4, P2 | A1 | Entries may require pagination or drill-in. | **Resolved** — verified against live site |
| F-006 | gap | Medium | A3, A4 | A3, A6 | Overlay styling must adapt per platform. | **Active** — Underdog styling done, DraftKings TBD |
| F-007 | waste | Low | P7, E1 | A1 | Full-replace sync is simpler for v1. | **Accepted** — full-replace implemented |
| F-008 | gap | Low | A2 | A3 | Popup needs minimal status indicator (last sync, entry count). | **Open** — popup shows auth + tier, not sync details |
| F-009 | unencoded-method | Low | P5, A3 | A2 | MutationObserver reconnection pattern needed. | **Resolved** — `utils/observer.js` implements pattern |

### Delta Findings (2026-04-03)

These findings are tracked at the top-level model (F-010 through F-014) as they affect the system boundary, not just the extension subsystem:

- **F-010** (gap, high): No confidence layer — sync progress invisible, connectivity silent
- **F-011** (gap, high): No tournament selection in overlay
- **F-012** (tension, medium): Popup vs overlay icon — two competing UX surfaces
- **F-013** (gap, medium): No reconnection/retry UX for Supabase drops
- **F-014** (unencoded-method, medium): Overlay start/stop on SPA navigation not built (TASK-103)

---

## Prioritization

| Tier | Theme | Findings | Action |
|------|-------|----------|--------|
| ~~Tier 1~~ | ~~"Native, Not Overlay"~~ | F-001, F-006 | **Active constraint** — applied to TASK-046 scaffold |
| ~~Tier 1~~ | ~~"Platform Adapter Contract"~~ | F-003, F-002, F-009 | **Resolved** — interface defined, observer pattern built |
| ~~Tier 2~~ | ~~"Extension Auth Flow"~~ | F-004 | **Resolved** — auth context in chrome.storage |
| ~~Tier 2~~ | ~~"Scraping Resilience"~~ | F-005, F-002 | **Resolved** (F-005), **Active** (F-002 ongoing concern) |
| Tier 2 | "Sync UX & Trust" | F-007, F-008 | Now escalated to **Tier 1** via top-level T6 (Extension Confidence & Trust) |
