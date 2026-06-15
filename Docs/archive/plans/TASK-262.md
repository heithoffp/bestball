<!-- Completed: 2026-06-15 | Commit: 4f23655 (uncommitted working tree) -->
# TASK-262: Draft-board hero image for The Allen Tax blog post (two-column fork)

**Status:** Done
**Priority:** P2

---

## Objective

Generate a synthetic "two-column fork" draft-board image by rendering the existing
`DraftBoardModal` component (its `boardOverride` prop bypasses Supabase) with fabricated
board data, capturing it with the project's existing Playwright harness pattern, and wiring
the result into `docs/blog/2026-06-16-the-allen-tax.md` as both the in-body hero (top of
post) and the OG social card.

The board illustrates the post's central fork in a single 12-team draft:
- **Rival column (slot 6)** runs a Hero-RB build: **Jonathan Taylor** in R1, **Josh Allen**
  in R3, **Chuba Hubbard** in R6.
- **Highlighted "YOU" column (slot 7, adjacent)** passes Allen, takes **Kyren Williams** in
  R3 and **Jayden Daniels** in R6.

Picks are seeded from ADP but **deliberately imperfect** — each player lands within ~2-3
picks of its ADP (seeded perturbation) so the board reads like a real draft, not a sorted
list.

Additive — the two existing hand-built SVGs (`allen-tax-packages-*`, `allen-tax-qb-gap-*`)
stay. Time-sensitive: blog releases 2026-06-16.

> Research: scoped via two parallel Explore agents (DraftBoardModal render deps; Playwright/Vite
> setup). KB not compiled at repo root — research ran without a KB-query agent.

## ADR check

Reusing the existing `boardOverride` prop for an offline capture is a contained, reversible
pattern; "render product UI as marketing imagery" is an editorial decision already made by the
developer. No architectural decision is introduced — **no ADR required.**

## Verification Criteria

1. `npm run build` succeeds with the new files present (the dev-only capture entry is served
   only by the dev server and is **not** included in the production `vite build` output —
   confirm no `dev-capture` asset appears in `dist/`).
2. The capture script produces two PNGs in `best-ball-manager/public/blog/images/`:
   - `allen-tax-board-2026-06-15.png` — full board panel (12 cols × 6 rounds), high-DPI.
   - `allen-tax-board-og-2026-06-15.png` — 1200×630 crop centered on the two fork columns.
3. In the captured board: the **"YOU"** column is **slot 7** (gold highlight + "YOU" header),
   showing Kyren Williams in R3 and Jayden Daniels in R6 with populated Proj/CLV stats and
   archetype pills. The adjacent **slot 6** rival column shows Jonathan Taylor (R1), Josh
   Allen (R3) + Chuba Hubbard (R6) and reads as a **Hero-RB** archetype. Position colors
   render correctly (QB purple, RB green, WR amber, TE blue).
4. `docs/blog/2026-06-16-the-allen-tax.md`: the hero image renders above the opening line
   with an italic "illustrative draft" caption; frontmatter `image:` points to the new OG
   PNG; the two existing SVGs and all body ADP numbers are unchanged.
5. The board's picks read as ADP-plausible — seeded from `underdog_adp_2026-06-15.csv` order,
   so pick numbers and surrounding players are consistent with the post's cited ADPs.

## Verification Approach

- **Automated (Claude runs):**
  - `cd best-ball-manager && npm run build` → report exit status; grep `dist/` to confirm no
    `dev-capture`/`BlogBoardCapture` asset shipped (criterion 1).
  - Start the dev server, run the new capture script, confirm both PNGs exist with expected
    pixel dimensions via an image-size check (criteria 2).
  - Re-read the blog markdown to confirm wiring (criterion 4).
- **Manual (developer confirms — flagged):**
  - Visual review of the two generated PNGs: YOU-column highlight, fork players in R3/R6,
    pills/stats populated, colors correct, OG crop framing (criterion 3).
  - Visual review of the hero rendering in the local blog view above the lede (criterion 4).

## Files to Change

| File | Change | Notes |
|------|--------|-------|
| `best-ball-manager/dev-capture.html` | **New** | Root-level dev-only Vite entry; served by dev server, excluded from `vite build`. Throwaway. |
| `best-ball-manager/src/dev/blogBoardCaptureEntry.jsx` | **New** | Mounts `BlogBoardCapture` to `#root`; imports `../index.css` for theme. |
| `best-ball-manager/src/dev/BlogBoardCapture.jsx` | **New** | Builds synthetic board + roster + adpByPlatform from the 2026-06-15 UD CSV; renders `DraftBoardModal` with `boardOverride`. |
| `best-ball-manager/scripts/capture-allen-tax-board.mjs` | **New** | Playwright (chromium) script mirroring `scripts/capture-screenshots.js`: goto dev entry, freeze animations, screenshot `.panel` (hero) + clipped OG crop into `public/blog/images/`. |
| `best-ball-manager/package.json` | **Modify** | Add `"capture:allen-board"` script. |
| `docs/blog/2026-06-16-the-allen-tax.md` | **Modify** | Add hero image + italic caption above the lede; update frontmatter `image:` to the new OG PNG. |

No changes to `DraftBoardModal.jsx`, the existing SVGs, or `vite.config.js`.

## Implementation Approach

**1. Synthetic data (`BlogBoardCapture.jsx`).**
- Import `../assets/adp/underdog_adp_2026-06-15.csv?raw`; parse with PapaParse (already a dep).
  Take the top ~72 rows (file is ADP-sorted) → the draft pool.
- **Seeded jitter:** perturb the ADP-sorted pool with a small deterministic PRNG (fixed seed)
  so each player ends up within ~2-3 picks of its ADP rank — organic-looking, not a sorted
  list, and reproducible across re-runs.
- Lay the perturbed pool onto a 12-team × 6-round **snake** board (R1 slots 1→12, R2 12→1,
  R3 1→12, …). Build `picks[]` with `{ pick, round, slot, name, position, team }`.
- **Pinned fork picks** (placed exactly, then removed from the jittered pool to avoid dupes;
  snake pick numbers for 12 teams):
  - Slot 6 (rival, Hero RB): R1 pick 6 → **Jonathan Taylor**; R3 pick 30 → **Josh Allen**
    (a ~4-pick reach vs his 33.6 ADP — reinforces the post's "manufactured urgency"); R6
    pick 67 → **Chuba Hubbard**.
  - Slot 7 (YOU): R3 pick 31 → **Kyren Williams** (≈ADP); R6 pick 66 → **Jayden Daniels**.
- `roster.players` = the slot-7 column's players (so `userSlot` resolves to **7** via name
  overlap >50%). Set `roster.draftDate`, `roster.tournamentTitle` to plausible values.
- Build `adpByPlatform.underdog.latestAdpMap` (`{ canonicalName: { pick } }`) and
  `projPointsMap` (`{ canonicalName: projectedPoints }`) from the same CSV rows so the
  column Proj/CLV stats and archetype pills populate. Use `canonicalName` from `utils/helpers`.
  CLV uses the *real* ADP vs the (jittered) board pick, so the small reaches/values surface
  naturally in the column stats.
- Render `<DraftBoardModal roster={…} adpByPlatform={…} boardOverride={board} onClose={()=>{}} />`.

**2. Dev entry (no App.jsx/router changes).**
- `dev-capture.html` at project root with `<div id="root">` + `<script type="module"
  src="/src/dev/blogBoardCaptureEntry.jsx">`. Vite's dev server serves root HTML files
  directly; `vite build` bundles only `index.html`, so this never ships to production.

**3. Capture script (`capture-allen-tax-board.mjs`).**
- Follow `scripts/capture-screenshots.js`: launch chromium, viewport sized to fit the
  1560px panel at `deviceScaleFactor: 2`, `page.goto('http://localhost:5173/dev-capture.html',
  { waitUntil: 'networkidle' })`, wait for `[role="dialog"] .panel`.
- `page.addStyleTag` to zero out animations/`backdrop-filter` for a clean, deterministic frame.
- `locator('.panel').screenshot()` → `allen-tax-board-2026-06-15.png` (hero).
- Second capture for the OG card: a 1200×630 `clip` box framed on the slot-8/9 columns plus
  their headers (or a narrower re-render) → `allen-tax-board-og-2026-06-15.png`.
- Prereq: dev server running (`npm run dev`); script documents this like the existing one.

**4. Blog wiring (`2026-06-16-the-allen-tax.md`).**
- Insert the hero image immediately after the frontmatter, before "At pick 33…", with an
  italic caption: *Illustrative draft board — picks ordered by 2026-06-15 Underdog ADP.*
- Update frontmatter `image:` → `/blog/images/allen-tax-board-og-2026-06-15.png`.
- Leave the existing two in-body SVGs and all body ADP figures untouched.

## Rollback Approach

Throwaway and self-contained: delete the three new `dev/` + html + script files, revert the
`package.json` and blog-markdown edits. The dev entry is not in the production bundle, so
nothing to unwind there. Existing SVGs are untouched; `DraftBoardModal` gained only an
opt-in, default-off prop (revert that one block to undo).

## Final implementation (as shipped — deltas from the approved plan)

Closed after several developer-directed refinement rounds. Net differences from the plan above:

- **Layout / fork.** The rival (Hero-RB-leaning) column is **slot 6**; the highlighted **YOU**
  column was built at slot 7 then swapped wholesale to **slot 8** (developer request — "swap my
  team and team 8"). R1 top is pinned (Gibbs · Bijan · Chase · Puka · JSN · Jonathan Taylor).
  D.J. Moore sits on the Allen team (slot 6, R5) as a Buffalo stack. Kyren stays R3, Daniels R6.
- **Player swaps applied as deterministic post-build steps** (by name, keeping each seat's
  pick/round/slot): Drake London ↔ A.J. Brown, Brian Thomas ↔ Jordyn Tyson, Lamar Jackson ↔
  Bhayshul Tuten.
- **Clean render.** Added a small **opt-in `hideColumnSummary` prop to `DraftBoardModal.jsx`**
  (default `false` — existing Roster Viewer usage unchanged) so the captured board shows no
  Proj/CLV/archetype pills. *(Deviation from the plan's "no changes to DraftBoardModal" note —
  chosen over a fragile CSS-hash hack; flagged to and accepted by the developer.)*
- **Presentation.** Dropped the "Illustrative (ADP-based)" framing; board header reads
  **"Best Ball Mania · Jun 10, 2026"**, presented as a real draft (developer call; prose ADP
  claims remain real). In-body caption updated to match.
- **Shared-parser fix (necessary scope addition).** `buildExcerpt` (`blogParse.js`) and
  `getLede` (`blog.js`) now skip image-only paragraphs, so a hero-image-led post keeps a real
  OG description / teaser. Zero regression (only affects image-led posts).
- **Capture.** Two captures from `dev-capture.html`: hero = full-panel element screenshot
  (`3120×764` @2×); OG = `1200×630` page-clip. Close (✕) button hidden in both. Image filenames
  retain the `-2026-06-15` ADP-vintage date (board *displays* Jun 10; filename not user-visible).
- **Open at close:** post remains `status: draft` — flip to `published` at release to activate
  the per-post OG card + page. Optional follow-ups noted to developer: rename images to
  `-2026-06-10`, rename the "Best Ball Mania" label.
