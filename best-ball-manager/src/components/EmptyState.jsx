import React from 'react';
import styles from './EmptyState.module.css';

export default function EmptyState({ icon: Icon, size = 48, title, children }) {
  return (
    <div className={styles.root}>
      {Icon && <Icon size={size} className={styles.icon} />}
      <div className={styles.title}>{title}</div>
      <div className={styles.description}>{children}</div>
    </div>
  );
}
