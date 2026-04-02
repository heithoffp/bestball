# TASK-061: Migrate AdpTimeSeries, DraftFlowAnalysis, and PlayerRankings to shared filter system

**Status:** Draft
**Priority:** P2

---

## Objective
These three tabs have simpler filter needs — primarily search and sort, with some view-switching (PlayerRankings position tabs, AdpTimeSeries time scale buttons). Migrating them completes the unified filter rollout across all tab components. Bundled as one task because each migration is small and the shared API should be stable after the ExposureTable and RosterViewer migrations.

## Dependencies
TASK-058, TASK-059, TASK-060

## Open Questions
- AdpTimeSeries has time-scale buttons (1W/1M/All) and a "Show My Pick Ranges" checkbox — these are view controls, not data filters. Should they go in the FilterBar or stay as separate toolbar controls?
