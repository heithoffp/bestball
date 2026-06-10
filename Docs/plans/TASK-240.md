# TASK-240: Roster Viewer — full Draft Board view (Underdog)

**Status:** Pending Approval — implementation proceeding under the developer's /goal
directive of 2026-06-10 ("implement … I will review it once complete"); formal plan
review happens with the completed work.
**Priority:** P3

---

## Objective
Add a per-roster "Draft Board" action on Underdog rows in RosterViewer that opens a modal
showing the complete snake draft board (entry_count columns × rounds rows), with the user's
column clearly highlighted. Each board column (roster) also shows its **Avg CLV%**,
**roster archetypes (RB/QB/TE)**, and **projected points** — computed opinions are allowed
in Roster Viewer per the Mirror-not-Advisor carve-out.

**Data source (interim, per developer directive 2026-06-10):** the existing
`draft_boards_admin` table populated by the developer's admin scraper (TASK-241). This
deviates from ADR-009's retirement plan for that table — the directive explicitly calls for
using the already-scraped boards now, with chrome-extension participant capture to follow
later. Consequence: **TASK-252 (retire draft_boards_admin) is blocked until the extension
capture path lands**; noted there.

**Discovered defect (2026-06-09 data):** all 89 rows in `draft_boards_admin` have
`name/position/team/round = null` on every pick. Root cause: `admin-extension/src/scraper/normalizePick.js`
reads `p.appearance?.name`, but UD's `/v2/drafts/{id}` picks only carry `appearance_id`;
names require joining slate `appearances` → `players` → `teams` (exactly what
`chrome-extension/src/injected/underdog-bridge.js` does via `ensureSlateLoaded`). The stored
boards are unrecoverable without a re-fetch. This task therefore also fixes the admin
scraper's normalization and adds a **repair mode** so the developer can re-scrape the 89
boards (their accounts own those pods, so fetches will succeed).

## Verification Criteria
1. Migration file exists granting `select` on `public.draft_boards_admin` to `authenticated`
   with an RLS read policy. (**Manual:** developer applies it via Supabase SQL editor —
   project is not CLI-linked.)
2. Admin scraper `normalizePick.js` resolves player name/position/team via the
   appearances/players join; a board scraped after the fix has every pick named.
   Repair mode: boards whose picks lack names are re-fetched instead of skipped as cached.
   (**Manual:** developer runs the admin extension once to repair the 89 boards.)
3. In RosterViewer, UD roster rows whose `entry_id` has a board in `draft_boards_admin`
   show a "Board" action; rows without one show nothing (no disabled clutter).
4. Clicking it opens a modal rendering `entry_count` columns × `rounds` rows, every cell
   showing pick number, player name, position pill (shared position colors), team.
5. The user's column is visually distinct (accent highlight + "YOU" label), identified by
   matching the clicked roster's player names against board slots.
6. Each column header shows: projected points total, Avg CLV%, and RB/QB/TE archetype
   pills, computed with the same helpers RosterViewer uses (`calcCLV`, `classifyRosterPath`),
   enriched via the Underdog ADP map + projections map (`adpByPlatform`).
7. Modal closes on backdrop click, Esc, and X. Under 900px the grid scrolls horizontally
   with a sticky round column.
8. DraftKings rosters show no board action. Guests (unauthenticated) see no board actions.
9. `npm run build` and `npm run lint` pass in `best-ball-manager/`; admin-extension builds.

## Verification Approach
1. **Automated:** `npm run lint` + `npm run build` in `best-ball-manager/`; build admin-extension.
2. **Visual smoke:** temporary dev harness route rendering `DraftBoardModal` with a realistic
   fixture board (removed before commit), screenshot-verified.
3. **Manual (developer):**
   1. Apply `supabase/migrations/009_grant_draft_boards_admin_read.sql` in the SQL editor.
   2. Load the rebuilt admin-extension, open Underdog signed in, run the scraper (repair
      mode re-fetches the 89 nameless boards; ~2 runs at 50/run cap).
   3. Open `/rosters` signed in, click "Board" on a UD roster, confirm grid, highlight,
      and per-column stats.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/009_grant_draft_boards_admin_read.sql` | Create | `grant select to authenticated` + RLS read policy on `draft_boards_admin`. |
| `admin-extension/src/scraper/normalizePick.js` | Modify | Join picks → appearances → players → teams (port of customer-extension logic); compute `round` from pick number. |
| `admin-extension/src/scraper/run.js` | Modify | Fetch slate appearances/players per draft (stats API); repair mode: treat nameless cached boards as un-cached. |
| `best-ball-manager/src/utils/positionColors.js` | Create | Shared `POS_COLORS` / `posColor` (extracted from RosterViewer). |
| `best-ball-manager/src/utils/draftBoards.js` | Create | `fetchAvailableBoardIds()` + `fetchDraftBoard(draftId)` against `draft_boards_admin`; silent-empty on RLS/guest errors. |
| `best-ball-manager/src/components/DraftBoardModal.jsx` | Create | Presentational board modal: grid, user-column detection by name overlap, per-column Proj/CLV/archetype header, snake pick ordering. |
| `best-ball-manager/src/components/DraftBoardModal.module.css` | Create | Overlay + grid styling matching app tokens; sticky headers; <900px horizontal scroll. |
| `best-ball-manager/src/components/RosterViewer.jsx` | Modify | Board availability fetch, "Board" action per UD row, modal mount, `trackEvent('roster_draft_board_open')`; import shared position colors. |
| `best-ball-manager/src/App.jsx` | Modify | Pass `adpByPlatform` prop to RosterViewer (for opponent ADP/projection enrichment). |

## Implementation Approach

### 1. Migration (manual apply)
```sql
grant select on public.draft_boards_admin to authenticated;
create policy "Authenticated users can read draft boards"
  on public.draft_boards_admin for select to authenticated using (true);
```

### 2. Admin scraper fix
- `run.js`: after fetching a draft, fetch `https://stats.../v1/slates/{slate_id}/players`
  (and appearances via scoring type) — the admin extension already captures the UD token;
  capture stats host/params the same way the customer bridge does, or fall back to
  `stats.underdogsports.com` with no params.
- `normalizePick.js`: `normalizeDraft(draft, { appearances, players, teams })` → resolve
  name/position/team per pick; `round = Math.ceil(pick / entryCount)`.
- Repair: in the cached-IDs query, select `picks` head and exclude boards whose first pick
  has `name == null` from the cached set (cheap: `picks->0->>name is null` filter or
  client-side check).

### 3. Web app
- `draftBoards.js`: lazy board fetch on modal open; availability set fetched once per
  RosterViewer mount (only `draft_id` column — 89 rows today).
- `DraftBoardModal.jsx`:
  - Bucket `picks` by `(round, slot)`; `round` computed from pick number when null.
  - Enrich each pick: `latestADP` via `adpByPlatform.underdog.latestAdpMap[canonicalName(name)]`,
    `projectedPoints` via `projPointsMap`.
  - Per slot: `classifyRosterPath`, sum projections, avg `calcCLV`.
  - User slot = slot with max name-overlap vs the clicked roster's players (require >50%).
  - Desktop: CSS grid, sticky column-header row and sticky round column; position-tinted
    cells; user column accent-bordered with "YOU" chip.
- RosterViewer: `LayoutGrid` lucide icon button in the row actions (and expanded actions
  on mobile), rendered only when `boardIds.has(entry_id)`.

## Dependencies
None. Blocks TASK-252 (retire draft_boards_admin) until extension capture replaces this read path.

## Open Questions
- Stats API access from the admin extension context (host/params capture) — verified during
  the developer's repair run; falls back gracefully (skips board, logs) if appearances can't load.

---
*Approved by: <!-- pending — developer reviews the completed implementation per the
2026-06-10 /goal directive. Original extension-capture plan superseded by this interim
read-from-draft_boards_admin approach at the developer's explicit instruction; extension
capture remains the eventual path (ADR-009) and will be planned separately. -->*
