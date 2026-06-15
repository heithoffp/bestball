<!-- Completed: 2026-06-15 -->

# TASK-266: Tap/click-to-zoom lightbox for blog figures

**Status:** Approved (developer approved in session 2026-06-15)
**Priority:** P2

---

## Objective

The Allen Tax draft board (`/blog/images/allen-tax-board-2026-06-15.png`, 3120×764) is
forced into the 720px article column at `width:100%`, shrinking 12 draft columns to ~60px
each — player names are unreadable on the web. Give readers a way to view the board (and any
future raster figure) full-screen at native resolution.

## Verification Criteria

1. In the Allen Tax post, the draft board PNG shows a visible "Enlarge" affordance and
   `cursor: zoom-in` on hover.
2. Clicking/tapping the board opens a full-screen overlay rendering the image at native size;
   when larger than the viewport it scrolls/pans (and pinch-zoom works on touch).
3. The overlay closes on backdrop click, the ✕ button, or the Esc key; body scroll is locked
   while open and restored on close.
4. The two inline SVG figures (qb-gap, packages) render exactly as before — no Enlarge
   affordance, not clickable.
5. `npm run build` succeeds; `npm run lint` is clean for the touched files.

## Verification Approach

- Run `cd best-ball-manager && npm run lint && npm run build` — report output.
- Developer manually previews `/blog/the-allen-tax` in the dev server: hover/click the board,
  confirm overlay opens/zooms/closes (mouse + Esc), confirm SVGs unaffected, check mobile
  width via devtools responsive mode.

## Files to Change

| File | Change |
|------|--------|
| `best-ball-manager/src/components/BlogPost.jsx` | Lift `zoomed` state into `BlogPost`; replace static `MD_COMPONENTS` with `makeComponents(onZoom)`; raster `img` → clickable button + Enlarge badge; add `Lightbox` overlay (Esc/backdrop/✕ close, body-scroll lock, fit↔100% toggle). |
| `best-ball-manager/src/components/BlogPost.module.css` | Styles: `.zoomFigure` button reset, `.zoomHint` badge, `.lightbox` overlay, `.lightboxScroll`, `.lightboxImg`, `.lightboxClose`; reduced-motion + mobile handling, matching the gold/mono blog aesthetic. |

## Implementation Approach

- Detect raster images by extension (`/\.(png|jpe?g)$/i`) — these become zoomable; SVG and the
  `#insert-image` placeholder keep current rendering. Future board captures get zoom for free.
- `makeComponents(onZoom)` is memoized in `BlogPost` so the `img` renderer can call back into
  component state without a module-level singleton.
- `Lightbox`: fixed full-screen flexbox, dark backdrop; image in an `overflow:auto` container
  at natural size; click image toggles fit-to-viewport ↔ 100%. `useEffect` adds an Esc keydown
  listener and locks `document.body.style.overflow`, restoring on cleanup. `role="dialog"`,
  `aria-label`, autofocus the close button. Honor `prefers-reduced-motion` for the fade-in.

## Out of Scope

Markdown post content, the capture script (`scripts/capture-allen-tax-board.mjs`),
`BlogBoardCapture.jsx`, and the inline SVG figures are unchanged.
