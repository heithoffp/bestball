# TASK-239: Combos — Playoff Stacks sub-tab (portfolio-level W15/16/17 game stacks)

**Status:** Pending Approval
**Priority:** P2

---

## Objective

Add a fourth sub-tab to the Combos tab — **Playoff Stacks** — that surfaces how the user's portfolio is concentrated across NFL playoff-week (W15/16/17) game stacks. Reuses the 2026 playoff schedule and the position-pair "meaningful stack" matrix already shipped in the extension overlay (TASK-232), but reframes them from candidate-vs-rostered (live draft) to roster-vs-roster (portfolio aggregate). The view answers three questions: (1) what fraction of my rosters carry a meaningful playoff game stack in each of W15/16/17, (2) which specific playoff matchups am I most leveraged on, and (3) which rosters are "naked" in the playoffs.

## Verification Criteria

1. **Sub-tab visible.** A new `Playoff Stacks` button appears in the Combos toolbar `filter-btn-group`, positioned between `Roster Similarity` and `Draft Explorer`. Clicking it activates the view; clicking another sub-tab deactivates it. The existing three sub-tabs are unchanged.
2. **Three week sections render.** The view renders three vertically-stacked sections labeled `WEEK 15`, `WEEK 16`, `WEEK 17`. Each section has its own header KPI tile and a grid of game cards underneath.
3. **KPI tile correctness.** The KPI tile for each week shows: total rosters with ≥1 meaningful game stack in that week, the percentage of total rosters, and a horizontal segmented bar where each segment represents one roster (filled if that roster has a stack in this week, dimmed otherwise). Total roster count matches `rosters.length` after the active tournament filter applies.
4. **Game card correctness.** For each week, every NFL game where the portfolio contains at least one meaningful cross-team stack pair renders one card. The card shows:
   - Both teams' abbreviations as a scoreboard ribbon (`TEAM_A`, vs-pill, `TEAM_B`).
   - The unique player chips on each side (one chip per distinct rostered player on that team, color-coded by position, with a small superscript count of rosters containing them).
   - A roster-count badge: number of rosters that have at least one meaningful pair across the matchup, plus percentage of total rosters.
   - A `Rosters →` button that calls `onNavigateToRosters({ players: <all players appearing in the matchup pieces> })`.
5. **Position-pair rule matches extension.** A "meaningful stack pair" between players `pA` and `pB` in a game means: `{pA.position, pB.position} ⊆ {QB, WR, TE}` AND not both are `TE`. RB on either side never counts. TE↔TE never counts. Cards render iff at least one such pair exists across the two teams.
6. **Same-week-same-roster pair correctness.** A roster counts toward a game card iff at least one valid pair `(pA, pB)` exists with `pA` and `pB` in the same roster, `pA` on `TEAM_A`, `pB` on `TEAM_B`, and the schedule says `TEAM_A` plays `TEAM_B` in that week.
7. **Sort order.** Within each week, cards are sorted by roster count desc, then by `(TEAM_A, TEAM_B)` alphabetical for ties. The leading card in each week renders with the gold accent treatment (border `rgba(232,191,74,0.25)` and gold-tinted fill); all others render with the teal accent (`rgba(6,182,212,0.18)` border).
8. **Bye-week tolerance.** If the 2026 schedule has no entry for a team in a given week, no game card involving that team renders for that week and no errors appear in the console.
9. **Empty state.** If `rosters.length === 0` (no roster data after the tournament filter), the same EmptyState block already shown by the other sub-tabs renders. If the portfolio has rosters but no meaningful playoff stacks exist in a given week, that week's section renders only the KPI tile with `0%` and a short "No game stacks" caption — no card grid for that week.
10. **Min count filter respected.** The toolbar-level "Min count" input filters game cards: only games with `rosterCount >= minCount` render. Default `minCount = 1` shows everything.
11. **Tournament filter respected.** Selecting tournaments in the existing `TournamentMultiSelect` restricts the roster set fed into the playoff analysis identically to how it restricts the other Combos sub-tabs.
12. **Help annotations.** Hitting the Help icon while on the Playoff Stacks sub-tab opens `HelpOverlay` with a `PLAYOFF_HELP_ANNOTATIONS` block describing: (a) what a playoff game stack is, (b) the KPI tile, (c) the game card, (d) the `Rosters →` navigation.
13. **Theme parity.** The component uses only existing CSS variables (`--surface-*`, `--border-*`, `--text-*`, `--accent`, position colors, font tokens). The teal accent for the playoff treatment matches the extension overlay color (`#06B6D4`). No new color tokens introduced beyond two playoff-specific accents declared at the component's top.
14. **No regressions.** All three existing Combos sub-tabs (Stack Profiles, QB Pairs, Roster Similarity, Draft Explorer) render and behave identically to before.

## Verification Approach

**Automated (Claude runs):**
1. `cd best-ball-manager && npm run lint` — confirm no new lint warnings.
2. `cd best-ball-manager && npm run build` — confirm a clean Vite production build.
3. Static check via Grep: confirm `analyzeRosterPlayoffStacks` and `aggregatePortfolioPlayoffStacks` are exported from `src/utils/playoffStacks.js` and consumed by `PlayoffStacks.jsx`.
4. Static check: confirm the new `Playoff Stacks` button is added to the `filter-btn-group` array in `ComboAnalysis.jsx` and that `activeTab === 'playoffs'` mounts `PlayoffStacks`.
5. Static check: confirm `src/data/playoff-schedule-2026.json` is identical (excluding `_README`) to `chrome-extension/src/data/playoff-schedule-2026.json` — keep the two files structurally identical until a shared module split is warranted.

**Manual (developer runs):**
6. `cd best-ball-manager && npm run dev`, sign in as a Pro user, sync rosters (or use demo data).
7. Visit `/combos`, click `Playoff Stacks`. Confirm the three week sections, KPI tiles, and game cards render.
8. Probe one specific game where the developer knows the portfolio holds a real game stack (e.g. BUF-CHI W15 if you have Allen and a Bears WR). Confirm both teams' player chips appear and the roster count looks plausible.
9. Click `Rosters →` on a card. Confirm the Roster Viewer opens filtered to the matchup's player list.
10. Toggle a tournament filter; confirm KPI tiles and card grids re-render with the filtered roster set.
11. Set `Min count` to a high number (e.g. 10); confirm only high-frequency game cards remain.
12. Confirm no console errors across all three weeks and on tournament/min-count changes.

Developer must explicitly confirm steps 7–12 before TASK-239 is marked Verified.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/PlayoffStacks.jsx` | Create | New sub-component. Receives `rosters`, `totalRosters`, `minCount`, `onNavigateToRosters`; renders the KPI strip + three week sections + game card grids. |
| `best-ball-manager/src/components/PlayoffStacks.module.css` | Create | Component-scoped styles. Defines week-header, KPI tile, game card (scoreboard ribbon, vs-pill, pieces column), frequency fill, leader-gold accent variants, and the segmented roster bar. |
| `best-ball-manager/src/data/playoff-schedule-2026.json` | Create | Copy of the extension's `chrome-extension/src/data/playoff-schedule-2026.json`. Same shape; web-app duplicate so Vite can resolve it from the web-app workspace without a cross-package import. |
| `best-ball-manager/src/utils/playoffStacks.js` | Create | Pure logic module. Exports: `MEANINGFUL_GAME_PAIRS`, `isMeaningfulPair(posA, posB)`, `analyzeRosterPlayoffStacks(roster, schedule)` → per-roster stack map, `aggregatePortfolioPlayoffStacks(rosters, schedule)` → portfolio-level aggregate keyed by `(week, teamA, teamB)`. No React imports — pure functions, unit-test-friendly. |
| `best-ball-manager/src/components/ComboAnalysis.jsx` | Modify | Add `{ key: 'playoffs', label: 'Playoff Stacks' }` to the `filter-btn-group` array (between `similarity` and `explorer`). Add `PLAYOFF_HELP_ANNOTATIONS`. Mount `<PlayoffStacks .../>` when `activeTab === 'playoffs'`. Extend `handleTabClick` to reset any new sub-tab state. |
| `docs/Feature_Specs/Combo_Analysis.md` | Modify | Add the `Playoff Stacks` sub-tab to the Tabs/Views list. Document the position-pair rule, KPI tile, card structure, and the schedule data dependency. |

No changes to `App.jsx`, no new feature gating (the Combos tab is already Pro-gated via `featureAccess.js`), no Supabase migrations.

## Implementation Approach

### Visual / aesthetic direction

The view is designed as a **playoff scoreboard slate** — three week sections stacked vertically, each one a self-contained scoreboard panel. The aesthetic stays inside the existing dark-and-gold theme but borrows a single teal accent (`#06B6D4` — already shipped in the extension overlay) to create visual continuity between the extension's playoff pill and the web app's playoff view. The user should be able to look at the page and immediately see (a) is my portfolio playoff-leveraged at all, (b) which week am I weakest in, (c) which matchups am I over-indexed on.

Structural choices:

- **Week header.** Mono-font, uppercase, letterspaced (`WEEK 15`), 18–20px, with a 2px teal underglow strip directly below to evoke a stadium light bar. Week label is followed inline by `"N/M rosters stacked · X%"` in `--text-secondary`.
- **Segmented roster bar.** Below the header, a thin horizontal bar where each segment represents one roster in the portfolio (capped visually at, say, 80 segments — when there are more rosters, segments are aggregated proportionally). Filled (teal) for rosters with ≥1 stack in this week, dim (`--surface-2`) for the rest. This gives the user an instant visual sense of coverage without needing to do math on the count.
- **Game cards.** CSS grid (`grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`), gap 12px. Each card is structured as a horizontal scoreboard:
  - Top row: `TEAM_A` left, a small teal vs-pill in the middle (`vs`), `TEAM_B` right. Both team abbreviations rendered in `--font-mono`, uppercase, ~16px.
  - Body: two columns. Left column = TEAM_A's contributing players, right column = TEAM_B's. Each is a vertical stack of `PlayerBadge`-styled chips colored by position (existing `POS_COLORS` map). Each chip has a small superscript count of rosters that hold this specific player (`Allen³` style) when count > 1.
  - Bottom-right: roster count badge in mono, with a percentage of total rosters in `--text-muted` underneath, plus the `Rosters →` navigation button (matches existing `seeRostersBtnStyle`).
  - Background: a faint frequency-fill identical in concept to the QB Pairs treatment — the fraction of card width filled corresponds to that card's rosterCount divided by the leader's rosterCount in that week, tinted teal (or gold for the leader).
- **Leader treatment.** The #1 card in each week gets the gold accent border (`rgba(232, 191, 74, 0.25)`) and gold-tinted frequency fill (`rgba(232, 191, 74, 0.07)`). Echoes the QB Pairs and Roster Similarity top-row treatment, keeping the dashboard visually consistent across all four sub-tabs.
- **Naked-week caption.** If a week has KPI of 0%, the card grid is replaced with a single line of text: `No portfolio rosters have a meaningful playoff stack in W15.` Italic, `--text-muted`, ~13px.
- **Naked-portfolio footer.** Below all three week sections, a small footer line: `N rosters have no meaningful stack in any playoff week.` This is the diversification flip-side of the per-week KPIs. When `N === 0`, the footer is omitted.

The visual identity is intentionally restrained — it does not deviate from the existing site theme. The differentiation comes from the **information architecture** (scoreboard-shaped cards, week-grouping, segmented coverage bar) rather than from typographic or color novelty. This keeps the new view feeling native to the rest of the Combos tab while still being immediately recognizable as the "playoffs view."

### Position-pair rule (shared with extension)

Lift the canonical matrix from `chrome-extension/src/content/draft-overlay.js` into the new web-app util:

```js
// Mirrors MEANINGFUL_GAME_PAIRS from chrome-extension/src/content/draft-overlay.js.
// Symmetric formulation for portfolio analysis: a pair is meaningful iff both
// positions are in the receiving game (QB/WR/TE) and not both are TE.
const MEANINGFUL_POSITIONS = new Set(['QB', 'WR', 'TE']);
export function isMeaningfulPair(posA, posB) {
  if (!MEANINGFUL_POSITIONS.has(posA) || !MEANINGFUL_POSITIONS.has(posB)) return false;
  if (posA === 'TE' && posB === 'TE') return false;
  return true;
}
```

This is equivalent to the extension's directional `MEANINGFUL_GAME_PAIRS` matrix when collapsed to "is this pair valid in either direction."

### Per-roster analysis

```js
// rosters: Array<Array<player>>  -- player has { name, team, position }
// schedule: { [team]: { '15': opp, '16': opp, '17': opp } }
// Returns: Array<{ entryId, weeks: Map<week, Array<{ teamA, teamB, pairs: Array<[playerA, playerB]> }>>}>
export function analyzeRosterPlayoffStacks(roster, schedule) {
  const byTeam = new Map();
  for (const p of roster) {
    if (!p.team || p.team === 'FA' || p.team === 'N/A') continue;
    if (!byTeam.has(p.team)) byTeam.set(p.team, []);
    byTeam.get(p.team).push(p);
  }
  const result = { '15': [], '16': [], '17': [] };
  for (const week of ['15', '16', '17']) {
    const seenMatchup = new Set(); // canonical key prevents double-counting
    for (const [teamA, playersA] of byTeam) {
      const opp = schedule[teamA]?.[week];
      if (!opp) continue;
      if (!byTeam.has(opp)) continue;
      const canonical = teamA < opp ? `${teamA}|${opp}` : `${opp}|${teamA}`;
      if (seenMatchup.has(canonical)) continue;
      seenMatchup.add(canonical);
      const playersB = byTeam.get(opp);
      const pairs = [];
      for (const pA of playersA) {
        for (const pB of playersB) {
          if (isMeaningfulPair(pA.position, pB.position)) pairs.push([pA, pB]);
        }
      }
      if (pairs.length > 0) {
        const [tA, tB] = teamA < opp ? [teamA, opp] : [opp, teamA];
        result[week].push({ teamA: tA, teamB: tB, pairs });
      }
    }
  }
  return result;
}
```

### Portfolio aggregation

```js
// Returns: { weeks: { '15': { games: Map<canonicalMatchup, GameAgg>, rostersWithAny: Set<entryId> }, ... }, nakedRosters: Set<entryId> }
// GameAgg = { teamA, teamB, rosterEntryIds: Set, piecesByTeam: { [team]: Map<playerName, { position, rosterCount }> } }
export function aggregatePortfolioPlayoffStacks(rosters, schedule) { /* ... */ }
```

Stable matchup key: `${week}|${teamA}|${teamB}` where `teamA < teamB` alphabetically (canonicalization avoids double-counting `BUF-CHI` and `CHI-BUF`).

Each `GameAgg` tracks:
- `rosterEntryIds` — set of entry IDs that contribute at least one meaningful pair in this game.
- `piecesByTeam[teamA]` — `Map<playerName, { position, rosterCount }>` — distinct players appearing on TEAM_A across all contributing rosters, with how many rosters each appears in. Same for `piecesByTeam[teamB]`.

`nakedRosters` is the set of entry IDs that contribute no game stack in any of W15/16/17 — used for the footer caption.

### React structure

```jsx
// PlayoffStacks.jsx (high-level pseudocode)
function PlayoffStacks({ rosters, totalRosters, minCount, onNavigateToRosters }) {
  const aggregate = useMemo(() => aggregatePortfolioPlayoffStacks(rosters, playoffSchedule), [rosters]);
  return (
    <>
      <WeekKpiStrip aggregate={aggregate} totalRosters={totalRosters} />
      {['15','16','17'].map(week => (
        <WeekSection
          key={week}
          week={week}
          weekData={aggregate.weeks[week]}
          totalRosters={totalRosters}
          minCount={minCount}
          onNavigateToRosters={onNavigateToRosters}
        />
      ))}
      {aggregate.nakedRosters.size > 0 && (
        <div className={styles.nakedFooter}>
          {aggregate.nakedRosters.size} rosters have no meaningful stack in any playoff week.
        </div>
      )}
    </>
  );
}
```

`WeekSection` renders the week header + segmented bar + game card grid. `GameCard` renders the scoreboard ribbon, pieces, count, and `Rosters →` button. Cards are sorted by `rosterEntryIds.size` desc inside `WeekSection`.

### Integration into ComboAnalysis

Add to the toolbar's `filter-btn-group`:
```js
{ key: 'playoffs', label: 'Playoff Stacks' },
```

Mount the component:
```jsx
{activeTab === 'playoffs' && (
  <PlayoffStacks
    rosters={rosters}
    totalRosters={totalRosters}
    minCount={minCount}
    onNavigateToRosters={onNavigateToRosters}
  />
)}
```

Add help annotations:
```js
const PLAYOFF_HELP_ANNOTATIONS = [
  { id: 'playoff-kpi', label: 'Week KPI', anchor: 'below', description: 'Percentage of rosters that have at least one meaningful playoff game stack in this week. The segmented bar shows per-roster coverage at a glance.' },
  { id: 'playoff-card', label: 'Game Card', anchor: 'below', description: 'Each card is a playoff game where your portfolio carries a meaningful stack. The pieces shown are the distinct players on each side across all your rosters. The gold card is your most concentrated game in the week.' },
  { id: 'playoff-rosters', label: 'See Rosters', anchor: 'above', description: 'Open the Roster Viewer filtered to the players in this matchup to inspect your actual stacked rosters.' },
];
```

Extend `handleTabClick` so switching tabs clears any sub-tab-local state (currently there is none for playoffs — only `minCount` is shared at the toolbar level).

### Schedule data: duplicate or share?

For now, **duplicate**: copy `chrome-extension/src/data/playoff-schedule-2026.json` to `best-ball-manager/src/data/playoff-schedule-2026.json`. Reasons:
- The two workspaces are independent Vite bundles; cross-imports require either monorepo wiring or a relative `../../chrome-extension/...` import, both of which are larger structural changes.
- The JSON is ~35 lines of static data with a one-time annual refresh (when the 2027 schedule drops). Duplication cost is minimal.
- The verification approach includes a static check that the two files match. A future task can extract a shared package if the data layer grows.

Add a header comment at the top of the web-app copy: `"_README": "Mirror of chrome-extension/src/data/playoff-schedule-2026.json. Keep in sync until shared schedule module is extracted."`

### Edge cases

- **Roster with players from teams not in the schedule (e.g. legacy data, FA, defenses):** `byTeam.get(opp)` returns `undefined` → skip; no error.
- **Player with missing `team` or `position`:** filtered out at the `byTeam` build step.
- **Roster with both teams of a playoff game but only RBs:** `isMeaningfulPair` returns false for every pair → no game stack recorded; correct behavior.
- **Two rosters share the same matchup but different player pairs:** both contribute to `rosterEntryIds`; pieces aggregate over both rosters' players.
- **Player appears in multiple rosters:** `piecesByTeam[team]` Map dedupes by `playerName` and increments `rosterCount`. Displayed as `Allen³`.
- **Portfolio has zero qualifying matchups in a week:** `weekData.games` is empty → render the "No game stacks" caption, no grid.
- **Tournament filter empties the roster set:** the upstream EmptyState already in `ComboAnalysis.jsx` (line 500–506) handles `totalRosters === 0` before we mount.

### Out of scope

- Drag/select rosters into the card to see which rosters contribute (deferred — `Rosters →` is sufficient).
- A 4th "all playoff weeks" composite view (deferred — three-week breakdown is the clearest framing).
- Position-pair toggle (exclude TE, exclude RB equivalents) — deferred. The rule is already restrictive and most users will not want to filter further; the existing `Min count` filter covers volume control.
- Live updates from the extension (the web app reads from the same Supabase store; no special wiring needed).
- Shared schedule module across workspaces (deferred — see above).
- W18 / Super Bowl coverage (deferred; matches extension scope from TASK-232).

## Dependencies

None. The schedule data exists, the position-pair rule is canonical from TASK-232, and the Combos tab is already gated as Pro via `featureAccess.js`.

## Open Questions

1. **Schedule single-source-of-truth.** The current plan duplicates the schedule JSON across the extension and the web app. A follow-up task could extract it into a shared package or a top-level `data/` directory loaded by both. Tracking as a candidate task if it becomes a maintenance burden.
2. **Pieces dedupe granularity.** Player chips dedupe by name. If two rosters hold "different" players of the same name (e.g. a junior/senior with shared first+last), they would be incorrectly merged — but the rest of the app already keys by `name` (see `stableId()` upstream), so this is consistent and not a new risk.
3. **Naked rosters expansion.** The footer currently shows a count; a future enhancement could make it clickable and surface the actual naked rosters in the Roster Viewer. Out of scope here.
4. **Segmented bar cap.** When a portfolio has hundreds of rosters, the per-roster segmented bar would be unreadable at thinness < 1px. Implementation will visually cap at ~80 segments and show one segment per ~`ceil(N/80)` rosters with proportional fill. This is a small visual fidelity trade-off; flag if it bothers anyone.

---
*Approved by: <!-- pending -->*
