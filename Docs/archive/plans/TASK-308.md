<!-- Completed: 2026-07-02 | Commit: pending -->
# TASK-308: Arena mobile matchup comparison UX — swipeable contender deck with quick-toggle and sticky pick bar

**Status:** Approved
**Priority:** P2

---

## Objective
On phones the blind-matchup screen stacks Red card, tape, and Blue card vertically — comparing two 18-20-pick rosters means scrolling across ~40 player rows with no way to see the teams side by side. Replace the stacked mobile layout with a swipe/toggle comparison: compact tale-of-the-tape summary up top, a horizontally swipeable contender deck (scroll-snap with peek edges), a Red/Blue quick-toggle indicator, and a sticky always-visible pick bar so voting never requires scrolling. Desktop layout unchanged.

## Verification Criteria
1. **Desktop unchanged** (≥900px): three-column matchup, per-card pick buttons, skip row, kbd hints, keyboard voting (`←`/`→`/`S`/`Space`/`L`) all behave exactly as before.
2. **Mobile order** (<900px): topRow → tale-of-the-tape → Red/Blue toggle → deck (Red card centered, Blue edge peeking) → sticky pick bar. No per-card pick buttons, no kbd row.
3. **Deck ↔ toggle sync**: swiping snaps to exactly one card and highlights the matching toggle segment; tapping the other segment smooth-scrolls the deck (instant jump under `prefers-reduced-motion: reduce`).
4. **Voting without scrolling**: Pick Red / Pick Blue / Skip remain visible at every vertical scroll position; the bar sits above (never under) the MobileNav dock, and the last roster rows are reachable by scrolling to the end.
5. **Reveal on mobile**: tapping a pick swaps the bar to note + countdown + Next, the deck auto-scrolls to the picked card showing its delta ribbon / "Upset" stamp, and it auto-advances after 1.5s; the next pairing starts back on Red with the toggle showing Red. Guest-capped note appears in the bar when applicable.
6. **Blindness invariant** (ADR-013/014): no owner identity or pre-vote rating signal added anywhere in the new markup; Red/Blue corners remain positional-only.
7. `npm run lint` and `npm run build` pass; the dev harness at mobile width renders the same structure as ArenaVote.

## Verification Approach
```
cd best-ball-manager
npm run lint
npm run build
npm run dev    # → http://localhost:5173/dev-arena.html
```
**Harness (Chrome DevTools device emulation, e.g. 390×844 and ~800px tablet width):** confirm criteria 2–3 (layout order, snap + toggle sync, peek edge, reduced-motion via DevTools Rendering → emulate `prefers-reduced-motion`); resize across the 899/900px boundary and confirm the layout flips both directions without errors. The harness has no MobileNav, so the pick bar sits flush at the viewport bottom there — expected.

**Real app (`http://localhost:5173/` at mobile emulation, arena-enabled account or guest):** confirm criteria 4–5 — vote flow, bar swap on reveal, auto-scroll to picked card, auto-advance, deck reset on next pairing, skip from the bar. Desktop regression (criterion 1) at full width including keyboard voting.

**Requires the developer** (real phone or accurate emulation): touch swipe/snap feel and momentum, that horizontal deck swipes don't trigger the browser back gesture, iOS Safari sticky behavior + safe-area spacing above the MobileNav dock, and tap-target comfort of the 48px pick buttons.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/arena/ArenaVote.jsx` | Modify | Add `useMediaQuery` branch: mobile render path (tape → corner toggle → swipe deck → sticky pick dock) with `deckIndex` state, `deckRef`, scroll-sync + reveal auto-scroll. Desktop JSX byte-identical. |
| `best-ball-manager/src/components/Arena.module.css` | Modify | New "Mobile matchup deck" section (`.mobileMatchup`, `.mobileTape`, `.cornerToggle`, `.cornerTab*`, `.deck`, `.deckItem`, `.pickDock`, `.dockPicks`); retarget comments in the `@media (max-width:899px)` block whose stacking rules now serve only `MatchupSkeleton`. |
| `best-ball-manager/src/dev/ArenaPreview.jsx` | Modify | Mirror the new mobile structure (same branch, local deck state, inert buttons) so the harness doesn't diverge. |
| `Docs/Feature_Specs/Best_Ball_Arena.md` | Modify | Rewrite the mobile-layout bullet ("stacked mobile layout scrolls as one page") to document the deck + sticky pick bar. |

No changes to `ArenaRosterCard.jsx`, `ArenaTape.jsx`, `Arena.jsx`, `index.css`, or `dev-arena.html`.

## Implementation Approach

### Step 1 — ArenaVote.jsx: mobile branch (the only JS change)

**Setup** (top of `ArenaVote`):
- `import useMediaQuery from '../../hooks/useMediaQuery';`
- `const { isDesktop } = useMediaQuery();` — mobile path is `!isDesktop` (matches the 899px CSS boundary).
- New state/refs: `const [deckIndex, setDeckIndex] = useState(0);` `const deckRef = useRef(null);`

**Deck helpers** (near the other callbacks):
```js
const scrollDeckTo = useCallback((idx) => {
  const el = deckRef.current;
  if (!el) return;
  const left = idx === 0 ? 0 : el.scrollWidth - el.clientWidth;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollTo({ left, behavior: reduced ? 'auto' : 'smooth' });
}, []);

const onDeckScroll = useCallback(() => {
  const el = deckRef.current;
  if (!el) return;
  const max = el.scrollWidth - el.clientWidth;
  setDeckIndex(el.scrollLeft > max / 2 ? 1 : 0);   // 2 items: midpoint test beats stride math
}, []);
```
Two effects:
- **Reset on new pairing** — the `key={pairing.pairing_id}` remount resets the DOM's `scrollLeft` to 0 but NOT ArenaVote's React state (the state lives above the keyed node): `useEffect(() => { setDeckIndex(0); }, [pairing?.pairing_id]);`
- **Reveal auto-scroll** — `useEffect(() => { if (status === 'revealed' && result && !isDesktop) scrollDeckTo(result.winner === 'a' ? 0 : 1); }, [status, result, isDesktop, scrollDeckTo]);` (effect, not inside `vote()`, so it runs after the reveal DOM exists; desktop untouched).

**Render**: keep `.topRow` shared and unchanged, then branch. To avoid duplicating the reveal footer, hoist the existing `.advanceRow` JSX (guest-capped note, `.advanceTrack`/`.advanceFill`, Next button) into a local `const advanceContent = (...)` used by both branches — desktop output stays byte-identical.

- `isDesktop`: existing `.matchup` (keyed) + `.skipRow` + `.kbdRow`, untouched.
- `!isDesktop`:
```jsx
<div className={css.mobileMatchup} key={pairing.pairing_id}>
  <div className={css.mobileTape}><ArenaTape a={snapA} b={snapB} active={revealed} /></div>
  <div className={css.cornerToggle} role="group" aria-label="Jump to contender">
    <button className={`${css.cornerTab} ${css.cornerTabRed} ${deckIndex === 0 ? css.cornerTabActive : ''}`}
      aria-pressed={deckIndex === 0} onClick={() => scrollDeckTo(0)}>Red Corner</button>
    <button className={`${css.cornerTab} ${css.cornerTabBlue} ${deckIndex === 1 ? css.cornerTabActive : ''}`}
      aria-pressed={deckIndex === 1} onClick={() => scrollDeckTo(1)}>Blue Corner</button>
  </div>
  <div className={css.deck} ref={deckRef} onScroll={onDeckScroll} aria-label="Contender rosters">
    <div className={css.deckItem}><ArenaRosterCard snapshot={snapA} corner="red" {...same props as desktop} /></div>
    <div className={css.deckItem}><ArenaRosterCard snapshot={snapB} corner="blue" {...same props as desktop} /></div>
  </div>
</div>
<div className={css.pickDock}>
  {!revealed ? (
    <>
      <div className={css.dockPicks}>
        <button className={`${css.pickBtn} ${css.pickRed}`} onClick={() => vote('a')} disabled={submitting}>Pick Red</button>
        <button className={`${css.pickBtn} ${css.pickBlue}`} onClick={() => vote('b')} disabled={submitting}>Pick Blue</button>
      </div>
      <div className={css.skipRow}>
        <button className={css.skipBtn} onClick={fetchNext} disabled={submitting}>Skip <ArrowRight size={15} /></button>
      </div>
    </>
  ) : advanceContent}
</div>
```
Notes: no per-card pick buttons, no `.kbdRow` on mobile (keyboard handlers stay registered — harmless). `pickDock` is a **sibling** of the keyed wrapper (last child of `.arena`) so its sticky containing block spans the full scroll content and it isn't remounted mid-reveal. `MatchupSkeleton` is left alone — see Step 2.

### Step 2 — Arena.module.css

**New base-level section** (markup only exists on mobile via the JS branch, so no media query needed; place after `.skipRow`/`.advanceRow`):
```css
/* ── Mobile matchup deck (rendered only when !isDesktop) ───────────────── */
.mobileMatchup { display: flex; flex-direction: column; gap: var(--space-sm); }
.mobileTape .tapeHairline { display: none; }
.mobileTape .vsMedallion { width: 44px; height: 44px; font-size: 0.95rem; }

.cornerToggle { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); overflow: hidden; }
.cornerTab { min-height: 40px; background: transparent; border: none; cursor: pointer; font-family: var(--font-mono); font-weight: 700; font-size: var(--text-sm); letter-spacing: 0.04em; color: var(--text-muted); }
.cornerTabRed.cornerTabActive { color: var(--corner-red); background: var(--corner-red-glow); box-shadow: inset 0 -2px 0 var(--corner-red); }
.cornerTabBlue.cornerTabActive { color: var(--corner-blue); background: var(--corner-blue-glow); box-shadow: inset 0 -2px 0 var(--corner-blue); }

.deck {
  display: flex; gap: 8px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;      /* don't trigger browser back-swipe */
  padding: 2px 7% 12px;                /* side padding centers snapped card; ~5% neighbor peek */
  scrollbar-width: none;
}
.deck::-webkit-scrollbar { display: none; }
.deckItem { flex: 0 0 86%; scroll-snap-align: center; min-width: 0; }

.pickDock {
  position: sticky; bottom: 0; z-index: 20;   /* < 100 (MobileNav dock) */
  background: var(--surface-0);
  border-top: 1px solid var(--border-default);
  padding: 8px 2px 10px;
  display: flex; flex-direction: column; gap: 4px;
}
.dockPicks { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.pickDock .pickBtn { min-height: 48px; }
```
Sticky mechanics (verified): `.body` is the Arena's scroll container; on mobile `.app-main` already reserves `calc(64px + env(safe-area-inset-bottom))` (index.css) below it for the fixed `MobileNav` dock, so `bottom: 0` sits flush above the dock with no extra safe-area padding needed. Optional polish (not in scope unless it reads better): translucent dock via `color-mix` + `backdrop-filter: blur(6px)` — start solid.

**Existing media block (`@media (max-width:899px)`)**: keep — `.matchup { grid-template-columns: 1fr }` and the `--clash-from: 0` overrides now serve only `MatchupSkeleton` (update the comment to say so); `.playerList { flex: none; overflow-y: visible }` still governs deck-card height; `.kbdRow { display:none }` is now redundant but harmless. The `.vsMedallion` 50px rule can be dropped in favor of the `.mobileTape` rule above (the skeleton has no medallion).

### Step 3 — Dev harness mirror (`src/dev/ArenaPreview.jsx`)

Add `useMediaQuery` + local `deckIndex`/`deckRef`/`scrollDeckTo`/`onDeckScroll` (copy of Step 1 logic). Branch the markup below `.topRow` exactly as ArenaVote does: desktop = current markup; mobile = `mobileTape → cornerToggle → deck → pickDock` with inert Pick/Skip buttons. Deck swiping and toggle sync are live in the harness (pure DOM); only voting is inert.

### Step 4 — Feature spec (`Docs/Feature_Specs/Best_Ball_Arena.md`)

Replace "the stacked mobile layout scrolls as one page" with: on <900px the tape shows first, the two rosters become a horizontally snap-scrolled deck (~86% cards with peek) with a Red/Blue corner toggle synced to scroll position, and a sticky Pick Red / Pick Blue / Skip bar (swapping to note + countdown + Next on reveal) keeps voting on-screen at every scroll position; on reveal the deck auto-scrolls to the picked card. Blindness invariant unchanged (corners remain positional).

## Dependencies
None

## Open Questions
Alternatives considered and rejected:
- **Tap-the-card-to-vote** — rejected: accidental votes while swiping/scrolling; sticky explicit buttons are safer and equally reachable.
- **Side-by-side dual-column full rosters on phones** — rejected: ~185px per column is unreadably cramped for 18–20 dense rows; the tale-of-the-tape already provides the aggregate side-by-side, and the deck peek + toggle covers detail flipping.
- **Fixed-position pick bar with dock offset** (DraftFlowAnalysis pattern) — rejected in favor of `position: sticky` inside the Arena's own scroll container: no magic offsets, coexists with the MobileNav dock for free.

Research note: KB not compiled — research phase ran without KB context.

---
*Approved by: PH, 2026-07-02*
