# Draft Assistant

## Purpose
The one place the app is opinionated. Provides strategy-aware pick recommendations during live drafts, balancing value, portfolio diversification, and archetype viability within the 30-second decision window.

## Current Status
Active

## User-Facing Behavior

### Desktop
- Three-panel layout: Draft Board (left), Candidate Players (center), Strategy Breakdown (right)
- Draft board tracks current picks round-by-round
- Candidate list shows scored players within ADP window with color-coded value indicators
- Strategy panel shows archetype viability badges and portfolio health bars

### Mobile
- Sub-view toggle between "Board" and "Players" views (`mobileSubView` state)
- Same functionality, responsive layout
- Touch-friendly pick selection

### Core Workflow
1. User selects draft slot (1-12)
2. App calculates snake draft pick positions
3. User clicks players to add them to draft board (click-to-draft)
4. After each pick, candidate list re-scores remaining players
5. Strategy viability updates in real time — shows which RB/QB/TE paths are still achievable

### Feedback
- Toast notifications (2-second auto-dismiss) on pick added
- ADP divider auto-scrolls candidate list to current pick position

## Key Controls & Interactions

| Control | Behavior |
|---------|----------|
| Draft Slot Selector | 1-12, recalculates all pick positions |
| Player Search | Searchable candidate list with 250ms debounce |
| Click-to-Draft | Tap player card to add to draft board |
| Strategy Badges | Color-coded: locked (committed), viable (still possible), impossible (killed) |
| Correlation Breakdown | Hover to see co-occurrence lift scores with existing picks |
| Strategy Reminder | Collapsible box showing protocol, execution notes, constraints |

## Computations & Data Dependencies

**Props received:** `masterPlayers`, `rosterData`, `allRosters`

**Key computations:**

### Strategy Viability (`checkStrategyViability()`)
Multi-dimensional check against `PROTOCOL_TREE`:
- **RB_ZERO:** No RBs in rounds 1-5
- **RB_HERO:** Exactly 1 RB in rounds 1-3, none in 4-6
- **RB_HYPER_FRAGILE:** 3+ RBs in rounds 1-4, max 4 total
- **RB_BALANCED:** Catch-all (grayed out after round 3)
- QB tiers: Elite (R1-4), Core (R5-8), Late (R9+)
- TE tiers: Elite (R1-4), Anchor (R5-8), Late (R9+)

### Candidate Scoring (`scoreCandidate()` from `utils/draftScorer.js`)
6-factor weighted utility composition:
```
U = 0.50 * V_proj      (projected value)
  + 0.30 * D_div       (diversification — low portfolio overlap)
  + 0.10 * globalScore  (1 - global exposure %)
  + 0.10 * S_fit        (strategy fit)
  - 0.60 * R_reach      (reach penalty — drafting ahead of ADP)
  - 1.00 * K_kills      (strategy kill — hard penalty)
```

### Co-occurrence Metrics (`computeCooccurrenceMetrics()`)
- Lift score via conditional probability with Laplace smoothing
- Jaccard similarity across roster pairs
- Phi coefficient (binary Pearson correlation)

### Stack Detection (`analyzeStack()` from `utils/stackAnalysis.js`)
- Identifies same-team correlations: Elite Overstack, Elite Stack, Overstack, RB Stack, Game Stack

### ADP Delta Visualization
- Smooth gradient: red (reaching) → neutral → green (value) based on pick vs. current ADP

## Known Limitations
- **No bulk pick import** — user must click-to-draft each previous pick to catch up to a live draft in progress
- No undo button for picks
- No "what-if" hover simulation (mentioned in `DraftFlowAnalysis_Requirements.md` but not fully implemented)
- Limited projection display in candidate rows
- Performance may lag on mid-range phones with 80+ rosters of strategy pool computation

## Prior Art
See `Docs/DraftFlowAnalysis_Requirements.md` for the original requirements document (historical reference).

## Key Files
- `src/components/DraftFlowAnalysis.jsx` — main component (1445 lines)
- `src/utils/draftScorer.js` — `scoreCandidate()`, `computeCooccurrenceMetrics()`
- `src/utils/rosterArchetypes.js` — `classifyRosterPath()`, `PROTOCOL_TREE`
- `src/utils/stackAnalysis.js` — `analyzeStack()`, stack type classification
