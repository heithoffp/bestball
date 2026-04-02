import React from 'react';
import styles from './TabLayout.module.css';

/**
 * Shared wrapper for every tab. Provides consistent toolbar → filters → banner → content structure.
 *
 * Props:
 *  - title       (string)    — section heading, displayed left in toolbar
 *  - toolbar     (ReactNode) — controls rendered right in toolbar
 *  - filters     (ReactNode) — filter bar below toolbar
 *  - banner      (ReactNode) — contextual banner below filters
 *  - flush       (boolean)   — if true, content area has no padding (for tables)
 *  - children    (ReactNode) — main content
 */
export default function TabLayout({ title, toolbar, filters, banner, flush, children }) {
  return (
    <div className={styles.root}>
      {(title || toolbar) && (
        <div className={styles.toolbar}>
          {title && <h2 className={styles.toolbarTitle}>{title}</h2>}
          {toolbar && <div className={styles.toolbarControls}>{toolbar}</div>}
        </div>
      )}

      {filters && <div className={styles.filters}>{filters}</div>}

      {banner && <div className={styles.banner}>{banner}</div>}

      <div className={`${styles.content}${flush ? ` ${styles.contentFlush}` : ''}`}>
        {children}
      </div>
    </div>
  );
}
