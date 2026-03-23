# Backlog

Prioritized work items for the Best Ball Portfolio Manager. Updated during development sessions.

For product direction and design principles, see `Vision_and_Scope.md`.
For detailed feature behavior, see `Feature_Specs/`.

---

## v1.0 Remaining

| Item | Status | Spec | Notes |
|------|--------|------|-------|
| Dashboard landing page | To build | — | Portfolio snapshot with headline metrics and shape visualizations. Primary entry point per design principles. |
| CSV export on analysis tabs | To build | — | Download current view as CSV from exposure table and roster viewer |

## Vision Alignment Revisions

Issues identified by auditing implemented features against `Vision_and_Scope.md` design principles.

| Item | Type | Priority | Notes |
|------|------|----------|-------|
| Neutralize correlation color scale in Draft Assistant | Revision | High | Green/red implies good/bad for stacking, which is a valid strategy. Change to neutral intensity scale. |
| Remove RB_BALANCED auto-gray-out at Round 3 | Revision | High | App forces strategic commitment timing. Should only gray out mathematically impossible paths. |
| Remove RB Protocol Blurbs from Draft Assistant | Removal | Medium | Coaching instructions ("Draft 5-6 WRs before first RB") cross from decision support into prescription. Strategy viability cards are sufficient. |
| Neutralize Uniqueness Lift color coding in Roster Viewer | Revision | Medium | Green=unique/red=chalk encodes opinion that uniqueness is good. Use neutral color scale. |
| Delete JaccardAnalysis orphan files | Removal | Medium | Disabled component with no Vision entry, Feature Spec, or Backlog item. "CONCENTRATION WARNING" labels violate Mirror, Not Advisor. |
| Rename "Falling" badge to neutral label in Draft Assistant | Revision | Low | "Falling knife" connotation implies avoidance. Rename to "ADP Rising" to describe the fact, not the implication. |

## Improvements

Gaps identified through user journey analysis. Not prioritized — sequence TBD by user feedback.

| Item | Status | Notes |
|------|--------|-------|
| CSV format validation with user feedback | To build | Non-Underdog CSVs silently produce empty results. Need column validation + actionable error messages. |
| First-run / empty state onboarding | To build | New users see empty table with no guidance. Need welcome state with upload instructions. |
| Upload confirmation dialog with undo | To build | Upload silently replaces all data. Need diff summary + one-level undo via backup key. |
| Draft Assistant quick-setup mode | To build | No way to catch up to a live draft in progress. Need bulk pick import or rapid-entry UI. |
| ADP freshness indicator | To build | No "last updated" date shown anywhere. Users can't assess data staleness. |
| Drag-and-drop file upload | To build | Currently file-picker button only. |
| Re-enable Combo Analysis | To build | Disabled for performance. Needs optimization. See `Feature_Specs/Combo_Analysis.md`. |
| Re-enable Roster Construction | To build | Disabled for performance. Needs optimization. See `Feature_Specs/Roster_Construction.md`. |

## Future Features

Planned for subsequent releases. Filtered through design principles. No priority order — sequence determined by user feedback.

| Item | Design Principle Alignment | Notes |
|------|---------------------------|-------|
| Multi-platform CSV support (Sleeper, DraftKings) | Zero-config — auto-detect format, no user selection | |
| ADP movement alerts | Zero-config — passively surface risers/fallers, no watchlist required | |
| Roster comparison mode (2-3 rosters side-by-side) | Layered depth — drill-down from roster viewer | |
| Player correlation heatmap | Shape over spreadsheet — visual co-occurrence matrix | |
| Season-long projection integration | Extends utility beyond draft season | |
| Bye week conflict analysis | Mirror — shows conflict facts per roster, doesn't judge | |
| Historical season backtesting | Transparency — show how construction choices performed historically | |
