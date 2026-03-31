# Chrome Extension Systems Model

**Created:** 2026-03-31
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
| P1 | Background Service Worker | Aspirational | S1 |
| P2 | Platform Adapter — Underdog | Aspirational | S2 |
| P3 | Platform Adapter — DraftKings | Aspirational | S2 |
| P4 | Scrape Orchestrator | Aspirational | S3 |
| P5 | Draft Board Observer | Aspirational | S4 |
| P7 | Data Sync Pipeline | Aspirational | S3 |

### Artifacts (Green)

| ID | Name | State | Subsystems |
|----|------|-------|------------|
| A1 | Manifest v3 | Aspirational | S1 |
| A2 | Popup UI | Aspirational | S1 |
| A3 | Draft Overlay (Context Display) | Aspirational | S4 |
| A4 | Platform Adapter Interface | Aspirational | S2 |
| A5 | Local Cache (chrome.storage) | Aspirational | S3 |

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
| S1 | Auth & Lifecycle | P1, A1, A2, E4 | Aspirational |
| S2 | Platform Abstraction | P2, P3, A4, E2, E3 | Aspirational |
| S3 | Data Pipeline | P4, P7, A5, E1, R2 | Aspirational |
| S4 | Draft Context | P5, A3, R1 | Aspirational |

---

## Interactions

| # | From | To | Label | State | Crosses |
|---|------|----|-------|-------|---------|
| 1 | R1 | A2 | Opens popup, logs in | Aspirational | -> S1 |
| 2 | A2 | P1 | Triggers auth flow | Aspirational | S1 internal |
| 3 | P1 | E1 | Authenticates via Supabase | Aspirational | S1 -> S3 |
| 4 | P1 | E4 | Registers service worker | Aspirational | S1 internal |
| 5 | A1 | E4 | Declares permissions | Aspirational | S1 internal |
| 6 | P1 | A4 | Routes by URL to adapter | Aspirational | S1 -> S2 |
| 7 | P2 | E2 | Reads Underdog DOM | Aspirational | S2 -> external |
| 8 | P3 | E3 | Reads DraftKings DOM | Aspirational | S2 -> external |
| 9 | P4 | A4 | Calls adapter.getEntries() | Aspirational | S3 -> S2 |
| 10 | P4 | P7 | Passes scraped entries | Aspirational | S3 internal |
| 11 | P7 | E1 | Writes roster data | Aspirational | S3 -> external |
| 12 | P7 | A5 | Caches portfolio locally | Aspirational | S3 internal |
| 13 | R2 | E1 | Reads synced portfolio | Current | -> S3 |
| 14 | P5 | A4 | Calls adapter.getDraftState() | Aspirational | S4 -> S2 |
| 15 | P5 | A5 | Reads cached portfolio context | Aspirational | S4 -> S3 |
| 16 | P5 | A3 | Feeds context data to overlay | Aspirational | S4 internal |
| 17 | A3 | A4 | Calls adapter.getInjectionTarget() | Aspirational | S4 -> S2 |
| 18 | R1 | A3 | Views context during draft | Aspirational | -> S4 |
| 19 | P7 | P1 | Reports sync status | Aspirational | S3 -> S1 |

---

## Feedback Loops

| Loop | Type | State | Description |
|------|------|-------|-------------|
| FL1 | Reinforcing | Aspirational | Draft -> Portfolio update -> Better context in next draft |
| FL2 | Balancing | Aspirational | High exposure shown -> User avoids player -> Exposure stays balanced |
| FL3 | Balancing | Aspirational | DOM change -> MutationObserver re-injects -> Stability maintained |

---

## Interrogation Findings

| ID | Category | Severity | Blocks | Aspiration | Finding |
|----|----------|----------|--------|------------|---------|
| F-001 | tension | High | A3 | A3, A4 | Overlay must feel native, not bolted-on. Streamers avoid Best Ball Overlay because it's distracting. Inline annotations matching platform style, not a floating panel. |
| F-002 | assumption | High | P2, E2 | A4, A6 | DOM scraping is fragile. Platform markup can change anytime. Adapters need resilient selectors and graceful degradation. |
| F-003 | gap | Medium | P2, P3, A4 | A6 | Adapter interface needs a clear contract defined before building any adapter. |
| F-004 | boundary-issue | Medium | P1, E1 | A5 | Extension needs its own Supabase auth context (stored token in chrome.storage), separate from web app session. |
| F-005 | assumption | Medium | P4, P2 | A1 | Entries may require pagination or drill-in — needs verification against live site. |
| F-006 | gap | Medium | A3, A4 | A3, A6 | Overlay styling must adapt per platform. Adapter needs getStyles() hook. |
| F-007 | waste | Low | P7, E1 | A1 | Full-replace sync is simpler for v1. |
| F-008 | gap | Low | A2 | A3 | Popup needs minimal status indicator (last sync, entry count). |
| F-009 | unencoded-method | Low | P5, A3 | A2 | MutationObserver reconnection pattern needed — should be inherited by all adapters. |

---

## Prioritization

| Tier | Theme | Findings | Action |
|------|-------|----------|--------|
| Tier 1 | "Native, Not Overlay" | F-001, F-006 | Shapes scaffold decisions — design constraint for TASK-046 |
| Tier 1 | "Platform Adapter Contract" | F-003, F-002, F-009 | Define interface in TASK-042 scaffold |
| Tier 2 | "Extension Auth Flow" | F-004 | Required for TASK-043 |
| Tier 2 | "Scraping Resilience" | F-005, F-002 | Required for TASK-044, needs live site research |
| Tier 3 | "Sync UX & Trust" | F-007, F-008 | Polish, not blocking |
