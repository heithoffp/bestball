import React, { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import styles from './HelpOverlay.module.css';

/**
 * Phased contextual help overlay — shows one annotation at a time with
 * navigation controls. Each step highlights a single element and positions
 * a callout card near it.
 *
 * Props:
 *  - annotations  (Array)     — [{ id, label, description, anchor? }]
 *  - onClose      (Function)  — called when overlay should dismiss
 *  - containerRef (RefObject) — ref to the positioned container wrapping tab content
 *
 * Anchor values per annotation (optional, default: 'below'):
 *  'below'  — callout appears below the element
 *  'above'  — callout appears above the element
 *  'right'  — callout appears to the right of the element
 *  'left'   — callout appears to the left of the element
 */

const CALLOUT_W = 240;
const CALLOUT_H_EST = 80;
const GAP = 10;

function computePosition(elRect, containerRect, anchor = 'below') {
  let top, left;

  switch (anchor) {
    case 'above':
      top = elRect.top - containerRect.top - CALLOUT_H_EST - GAP;
      left = elRect.left - containerRect.left;
      break;
    case 'right':
      top = elRect.top - containerRect.top;
      left = elRect.right - containerRect.left + GAP;
      break;
    case 'left':
      top = elRect.top - containerRect.top;
      left = elRect.left - containerRect.left - CALLOUT_W - GAP;
      break;
    default: // 'below'
      top = elRect.bottom - containerRect.top + GAP;
      left = elRect.left - containerRect.left;
  }

  // Clamp within container bounds
  const maxLeft = containerRect.width - CALLOUT_W - 8;
  left = Math.max(8, Math.min(left, maxLeft));
  top = Math.max(8, top);

  return { top, left };
}

/** Find the nearest scrollable ancestor within (or equal to) the container. */
function findScrollParent(container) {
  if (container.scrollHeight > container.clientHeight) return container;
  const queue = [container];
  while (queue.length) {
    const node = queue.shift();
    if (node.scrollHeight > node.clientHeight + 1) {
      const style = getComputedStyle(node);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') return node;
    }
    for (const child of node.children) queue.push(child);
  }
  return container;
}

export default function HelpOverlay({ annotations, onClose, containerRef }) {
  const [step, setStep] = useState(0);
  const [position, setPosition] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const highlightedEl = useRef(null);
  const rafId = useRef(null);

  const total = annotations?.length || 0;
  const current = annotations?.[step];

  const goNext = useCallback(() => setStep(s => Math.min(s + 1, total - 1)), [total]);
  const goPrev = useCallback(() => setStep(s => Math.max(s - 1, 0)), []);

  // Position the callout for the current step
  const calculate = useCallback(() => {
    if (!containerRef?.current || !current) return;

    setIsMobile(window.innerWidth < 600);

    const el = containerRef.current.querySelector(`[data-help-id="${current.id}"]`);
    if (!el) { setPosition(null); return; }

    const containerRect = containerRef.current.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const pos = computePosition(elRect, containerRect, current.anchor);
    setPosition(pos);

    // Scroll element into view if needed
    const scrollParent = findScrollParent(containerRef.current);
    const scrollRect = scrollParent.getBoundingClientRect();
    if (elRect.top < scrollRect.top || elRect.bottom > scrollRect.bottom) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [current, containerRef]);

  // Throttled recalculation for scroll/resize
  const scheduleRecalc = useCallback(() => {
    if (rafId.current) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      calculate();
    });
  }, [calculate]);

  // Recalculate on step change
  useLayoutEffect(() => {
    calculate();
  }, [calculate]);

  // Listen for resize and scroll
  useEffect(() => {
    if (!containerRef?.current) return;
    const scrollEl = findScrollParent(containerRef.current);
    window.addEventListener('resize', scheduleRecalc);
    scrollEl.addEventListener('scroll', scheduleRecalc, { passive: true });
    return () => {
      window.removeEventListener('resize', scheduleRecalc);
      scrollEl.removeEventListener('scroll', scheduleRecalc);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [containerRef, scheduleRecalc]);

  // Highlight only the current step's element
  useEffect(() => {
    if (!containerRef?.current || !current) return;

    // Remove previous highlight
    if (highlightedEl.current) {
      highlightedEl.current.classList.remove(styles.highlightRing);
    }

    const el = containerRef.current.querySelector(`[data-help-id="${current.id}"]`);
    if (el) {
      el.classList.add(styles.highlightRing);
      highlightedEl.current = el;
    }

    return () => {
      if (highlightedEl.current) {
        highlightedEl.current.classList.remove(styles.highlightRing);
        highlightedEl.current = null;
      }
    };
  }, [current, containerRef]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goNext(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goPrev(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, goNext, goPrev]);

  if (!current) return null;

  const isFirst = step === 0;
  const isLast = step === total - 1;

  return (
    <div className={styles.backdrop}>
      {/* Positioned callout (desktop) */}
      {!isMobile && position && (
        <div
          key={current.id}
          className={styles.callout}
          style={{ top: position.top, left: position.left }}
        >
          <div className={styles.calloutLabel}>{current.label}</div>
          {current.description && <p className={styles.calloutDesc}>{current.description}</p>}
        </div>
      )}

      {/* Navigation bar — fixed at bottom of container */}
      <div className={styles.navBar}>
        {/* Mobile: show card content inline in nav bar */}
        {isMobile && (
          <div className={styles.navCardContent}>
            <div className={styles.calloutLabel}>{current.label}</div>
            {current.description && <p className={styles.calloutDesc}>{current.description}</p>}
          </div>
        )}
        <div className={styles.navControls}>
          <button
            className={styles.navBtn}
            onClick={goPrev}
            disabled={isFirst}
            aria-label="Previous"
          >
            <ChevronLeft size={16} />
          </button>
          <span className={styles.navStep}>
            {step + 1} / {total}
          </span>
          <button
            className={styles.navBtn}
            onClick={isLast ? onClose : goNext}
            aria-label={isLast ? 'Done' : 'Next'}
          >
            {isLast ? (
              <X size={16} />
            ) : (
              <ChevronRight size={16} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
