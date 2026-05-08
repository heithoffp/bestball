import React from 'react';
import styles from './InstallExtensionButton.module.css';

// Header CTA that links to the public /install page (TASK-213).
// Previously opened a modal walking through a `.zip` + load-unpacked flow against
// the now-removed 1.0.3 artifact; that flow is replaced by `/install` which serves
// signed `.crx`/`.xpi` artifacts and detects the user's browser.
export default function InstallExtensionButton({ showButton = true }) {
  if (!showButton) return null;
  return (
    <a
      href="/install"
      className={styles.headerButton}
      aria-label="Install the Best Ball Exposures extension"
    >
      Install Extension
    </a>
  );
}
