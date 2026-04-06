<!-- Completed: 2026-04-06 | Commit: pending -->
# TASK-154: Contextual Help — Rosters annotations

**Status:** Done
**Priority:** P3

---

## Objective
Implement annotation overlay for the Rosters tab. Add `data-help-id` attributes to key elements and define a `HELP_ANNOTATIONS` array covering search/archetype filters, sortable columns, expand/collapse, CLV%, Uniqueness Score, and stack detection.

## Dependencies
TASK-151 — Complete.

## Design Reference (from TASK-151 + Dashboard implementation)
- **No backdrop dimming** — transparent overlay, page stays visible and interactive
- **Gold highlight rings** on annotated elements (`box-shadow: 0 0 0 2px var(--accent-glow)`)
- **Callout cards** anchored consistently to **top-left** of each target element
- **Concise copy** — one short sentence per annotation (see Dashboard.jsx `HELP_ANNOTATIONS` for tone)
- Add `data-help-id="xxx"` attributes to target elements in JSX
- Tab component owns `helpOpen` state via `useState(false)`
- Pass `helpAnnotations`, `helpOpen`, `onHelpToggle={() => setHelpOpen(h => !h)}` to TabLayout
- If tab doesn't use TabLayout yet, wrap content in it (Dashboard pattern: `<TabLayout title="..." flush ...><div className={styles.root}>...</div></TabLayout>`)
- Annotations on collapsed default state only — don't try to annotate expanded detail views

## Annotations Implemented
| `data-help-id` | Element | Description |
|---|---|---|
| `filter-search` | Player/Team search wrapper | "Search by player or team name to filter to rosters containing that pick." |
| `filter-tournament` | TournamentMultiSelect wrapper div | "Filter to a specific tournament or slate." |
| `filter-clv` | +CLV/-CLV chip group div | "Filter by CLV direction — +CLV rosters contain picks that got cheaper after the draft." |
| `filter-archetype` | filterRow2 div (RB/QB/TE chips) | "Filter by construction archetype. Counts show how many of your rosters match each style." |
| `col-archetype` | RB Arch `<th>` | "Each roster's RB, QB, and TE draft strategy, classified by pick position and capital." |
| `col-uniqueness` | Early Combo Rate `<th>` | "How often this first-4-round combo appeared per 1M simulated drafts. Lower = rarer construction." |
| `col-clv` | Avg CLV% `<th>` | "Average Closing Line Value across all picks. Positive means the player's ADP rose after your draft." |
