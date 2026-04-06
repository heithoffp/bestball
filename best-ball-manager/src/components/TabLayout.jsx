import React, { useRef, lazy, Suspense } from 'react';
import styles from './TabLayout.module.css';

const HelpOverlay = lazy(() => import('./HelpOverlay'));

/**
 * Shared wrapper for every tab. Provides consistent toolbar → filters → banner → content structure.
 *
 * Props:
 *  - title            (string)    — section heading, displayed left in toolbar
 *  - toolbar          (ReactNode) — controls rendered right in toolbar
 *  - filters          (ReactNode) — filter bar below toolbar
 *  - banner           (ReactNode) — contextual banner below filters
 *  - flush            (boolean)   — if true, content area has no padding (for tables)
 *  - helpAnnotations  (Array)     — annotation data for contextual help overlay
 *  - helpOpen         (boolean)   — whether help overlay is currently shown (controlled by App)
 *  - onHelpToggle     (Function)  — callback to toggle help overlay (controlled by App)
 *  - children         (ReactNode) — main content
 */
export default function TabLayout({ title, toolbar, filters, banner, flush, helpAnnotations, helpOpen, onHelpToggle, children }) {
  const contentRef = useRef(null);

  const hasHelp = helpAnnotations && helpAnnotations.length > 0 && onHelpToggle;

  return (
    <div className={styles.root}>
      {(title || toolbar) && (
        <div className={styles.toolbar}>
          {title && <h2 className={styles.toolbarTitle}>{title}</h2>}
          <div className={styles.toolbarControls}>
            {toolbar}
          </div>
        </div>
      )}

      {filters && <div className={styles.filters}>{filters}</div>}

      {banner && <div className={styles.banner}>{banner}</div>}

      <div
        ref={contentRef}
        className={`${styles.content}${flush ? ` ${styles.contentFlush}` : ''} ${styles.contentRelative}`}
      >
        {children}
        {hasHelp && helpOpen && (
          <Suspense fallback={null}>
            <HelpOverlay
              annotations={helpAnnotations}
              onClose={onHelpToggle}
              containerRef={contentRef}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
