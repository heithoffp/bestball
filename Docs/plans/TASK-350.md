# TASK-350: DraftKings live draft capture parity — DK parser, platform-aware engine + onboarding platform selector

**Status:** Approved — developer explicitly directed this implementation in-session
(2026-07-18: "implement the same functionality as we did on Underdog but get it working
for draftkings now. Also in this update change the onboard flow for the user to select
between draftkings or underdog"). Research ran inline (no subagents, per developer
instruction).
**Priority:** P2

---

## Objective

The Underdog live screen-capture pipeline (ReplayKit broadcast → Vision OCR →
`underdogParser` → `sessionEngine` → Live Activity) works well on device. DraftKings
drafts are unsupported: the parser only knows Underdog screen grammar. Implement a
DraftKings parser producing the same observation contract, thread a platform choice
(`underdog` | `draftkings`) through session start, engine config, and the broadcast
extension, and add a platform selector to the Draft Assistant onboarding so the two
platforms' logic stays separated.

## Context (from the real DK frame log)

`mobile-app/docs/draftkings_debug/frames-1784385816.jsonl` (26 frames, recorded on
device in a live DK slow draft) shows the DK draft room renders **more explicit**
signals than Underdog:

- **Header, every tab:** `Round 4, Pick 12` (exact current overall), `You're up in 4
  pick(s)` (exact picks-until), `On The Clock: <username>`, `Last Pick: T. McLaurin
  WAS-WR` (event evidence at overall−1), a slow-draft clock `06:35:49`, and an
  upcoming-pick number strip (`48 49 50 …` with `R5` round dividers).
- **Board tab:** one column per slot — username header (may truncate: `BirdEnthusi...`),
  a QB/RB/WR/TE tally row, then cells of `r.p` / `overall` / `F. Surname` / `POS TEAM`
  (ledger-grade picks with exact overalls; future cells show label + `→`; the live cell
  shows `ON THE CLOCK`).
- **Rosters tab:** owner username, `QB 0/1 RB 1/2 WR 3/3 TE 0/1` fill tally, a left POS
  rail (QB/RB/RB/WR/WR/WR/TE/FLEX/BN…), rows of `F. Surname` + `POS TEAM (BYE n)` with
  RANK/ADP right rail. Rows are drafted players — must never feed availability.
- **Players tab:** `SHOW DRAFTED PLAYERS|ALL` toggle, abbreviated-name rows +
  `POS TEAM (BYE n)` meta, RANK + ADP right rail (ADP is overall-pick scale, matching
  the bundled DK ADP snapshot).
- **Queue tab:** `No players in Queue` empty state.
- DK names are abbreviated (`D. Montgomery`) everywhere → row matching uses
  `matchAbbrevPlayer` with pos/team corroboration, not `matchPlayer`.
- DK usernames are mixed-case (`ski2sun`, `BirdEnthusiast`); DK Best Ball is 12 teams ×
  **20 rounds** (UD is 18).
- The user's expanded BBE Live Activity overlays DK frames exactly as it does UD frames
  (frames 8/10/17/21) → the self-overlay excision must be shared, and needs one new
  weak signal (`P1 • R1` glance line) plus tolerance for a garbled roster-bar leading
  glyph (`2BO-RB O • …`).

The DK player pool is already bundled: `adpByPlatform.draftkings.latestRows` (47
snapshots, full rows with position/team/adp). Per-platform rankings already load
(`rankingsByPlatform.draftkings`).

## Verification Criteria

1. Replaying `frames-1784385816.jsonl` through the extension engine with
   `platform: 'draftkings'` and username `BirdEnthusiast` lands: slot 4, currentPick 48,
   picksUntil 4, the user's four picks (P. Nacua, D. Henry, R. Rice, T. McMillan) on the
   roster bar, and a ledger populated from the Board frames — with zero picks/state
   produced by the BBE self-overlay frames.
2. The Draft Assistant setup screen offers an Underdog / DraftKings choice; the choice
   drives pool, rounds (18 vs 20), remembered username, and parser selection, and is
   remembered for next session.
3. The existing Underdog fixture/replay suite (`npm run test:draft`) still passes
   unchanged.

## Verification Approach

- Add `scripts/test-dk-draft-replay.mjs` (wired into `npm run test:draft`) that replays
  the committed DK frame log through `BBEEngine` (init with `platform: 'draftkings'`,
  pool from the bundled DK ADP snapshot) and asserts criterion 1's facts plus: presence
  flips out-of-room on the trailing BBE-app frames, and no self-overlay frame adds
  ledger entries.
- Run `npm run build:engine` then `npm run test:draft` (parser fixtures + UD replay +
  slow-draft replay + new DK replay) — all green.
- `npx eslint` over the touched files.
- Manual (developer): EAS build → record a real DK draft with platform set to
  DraftKings; confirm the Live Activity tracks picks/turn; capture a frame log for any
  parser gap. (Cannot be automated from Windows.)

## Files to Change

| File | Change |
|---|---|
| `mobile-app/src/draft/selfOverlay.js` | **New.** Self-overlay (BBE Live Activity) signal patterns + `exciseSelfOverlay(lines)` extracted from `underdogParser.js`; adds `P·R` glance-line weak signal and garble-tolerant roster-bar pattern. Shared by both parsers. |
| `mobile-app/src/draft/underdogParser.js` | Use the shared excision (behavior-identical otherwise). |
| `mobile-app/src/draft/draftkingsParser.js` | **New.** `parseDraftKingsScreen(items, ctx)` → same observation contract as UD, plus `currentOverall` (from `Round X, Pick Y`), `lastPick`, and `slotAnchors` (from Board columns). |
| `mobile-app/src/draft/sessionEngine.js` | Generic extensions: ratchet from `obs.currentOverall`; ledger the `obs.lastPick` event at `currentOverall−1`; anchor slot + usernameSlots from `obs.slotAnchors`; roster-owner tally via `obs.rosterTally`. All optional fields — UD observations unchanged. |
| `mobile-app/src/draft/extensionEngine.entry.js` | Parser selection by `config.platform`; bump `ENGINE_VERSION`/`ENGINE_BUILD`. |
| `mobile-app/src/draft/sessionController.js` | `startSession({ platform })`; per-platform remembered-username keys (`bbe.udUsername` / `bbe.dkUsername`) + remembered platform key; platform in `baseConfig`; platform-aware error copy. |
| `mobile-app/src/screens/draft/useSessionInputs.js` | Accept platform; pool from `adpByPlatform[platform]`, rankings from `rankingsByPlatform[platform]`. |
| `mobile-app/src/screens/draft/AssistantSetup.jsx` | Platform selector step (Underdog / DraftKings segmented control) ahead of username; platform-aware copy, rounds 18/20, per-platform username prefill. |
| `mobile-app/src/screens/draft/CaptureGuide.jsx` | Platform-aware copy (UD-only banner-tap tip hidden for DK; generic wording elsewhere). |
| `mobile-app/src/screens/LiveSessionPanel.jsx` | Platform-aware copy (three "Underdog" strings). |
| `mobile-app/scripts/replay-frames.mjs` | `--platform dk|underdog` flag selecting the parser. |
| `mobile-app/scripts/test-dk-draft-replay.mjs` | **New.** DK replay regression test over the committed frame log. |
| `mobile-app/package.json` | Add DK test to `test:draft`. |
| `mobile-app/targets/draft-broadcast/assets/engine.js`, `mobile-app/src/draft/generated/engineSource.js` | Regenerated by `npm run build:engine`. |

## Implementation Approach

1. **Shared self-overlay module.** Move the `self*` patterns and the excision block into
   `selfOverlay.js` exporting `exciseSelfOverlay(lines)` → `{ lines, wasSelf }`. Add
   `selfPickLine` (`P1 • R1` glance form) as a weak kind and loosen the roster-bar
   anchor to tolerate a garbled leading glyph. UD parser behavior stays covered by the
   existing fixtures.
2. **DK parser.** Geometric-first (all Vision items carry boxes), with boxless
   sequential fallbacks mirroring the UD parser's structure:
   - Header (any tab, top zone): `roundPick` → `currentOverall`; `upIn` → `picksUntil`;
     `On The Clock: <name>` → `onClock` when it matches the configured username;
     `lastPick` → `{ nameRaw, team, pos }`; slow-draft clock.
   - Board cells: `r.p` label with `overall` beneath (snake-math validated), abbreviated
     name + `POS TEAM` meta below → `boardPicks` via `matchAbbrevPlayer` (team + pos
     corroboration). Column username header (truncation-tolerant prefix match vs the
     configured username) + any cell's overall → `slotAnchors: [{ username, slot }]`.
   - Rosters tab: POS rail + owner + `n/m` tally ⇒ `kind: 'roster'`, `rosterOwner`;
     rows matched but never fed to availability (engine already guards roster kind).
   - Players tab: `SHOW DRAFTED` toggle ⇒ `kind: 'players'`; abbreviated-name rows with
     `POS TEAM (BYE n)` meta → `rows`; availability window built exactly like UD (pool
     ADP of matched rows, inversion guard) — safe under both toggle states (ALL shows
     everyone ⇒ no gaps ⇒ no marks).
   - Queue: empty-state text ⇒ `kind: 'queue'`.
3. **Engine extensions** (all optional-field, UD-safe): `currentOverall` ratchets
   directly (exact); `lastPick` becomes an event-ledger entry at `currentOverall−1`
   (deduped, ADP-sanity-checked like confirm cards); `slotAnchors` feed
   `proposeAnchor`/`usernameSlots`; roster tally recorded for the owner.
4. **Platform threading.** `startSession({ platform })` → config → extension `init`
   picks the parser. Per-platform username memory. Rounds default 18 (UD) / 20 (DK).
   Engine version bump so the panel proves the new engine is live.
5. **Onboarding.** Segmented Underdog/DraftKings control as the first interaction on
   the setup card (defaulting to the remembered platform, else Underdog); username step
   prefills from that platform's remembered value; copy adapts.
6. **Harness.** `replay-frames.mjs --platform`, new DK replay test, `build:engine`,
   full `test:draft`.

## Out of Scope (follow-ups)

- DK auto new-draft detection (UD's uses roster-panel overalls, which DK's roster tab
  doesn't show — manual reset + board evidence cover DK for now).
- DK lobby/pre-draft screens (no frames captured yet).
- Auto-learning the DK username (setup requires it anyway).
