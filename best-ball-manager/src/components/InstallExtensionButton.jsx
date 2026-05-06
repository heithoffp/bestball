import React, { useState, useCallback, useEffect } from 'react';
import { X, Copy, Check } from 'lucide-react';
import styles from './InstallExtensionButton.module.css';

const EXTENSION_FILENAME = 'bestballexposures-extension-1.0.3.zip';
const EXTENSION_VERSION = '1.0.3';
const EXTENSIONS_URL = 'chrome://extensions';
const HASH = '#install-extension';

export default function InstallExtensionButton({ showButton = true }) {
  const [isOpen, setIsOpen] = useState(() =>
    typeof window !== 'undefined' && window.location.hash === HASH
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash === HASH) setIsOpen(true);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    if (window.location.hash !== HASH) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${HASH}`);
    }
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setCopied(false);
    if (window.location.hash === HASH) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(EXTENSIONS_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — user can still select-and-copy from the code element
    }
  }, []);

  return (
    <>
      {showButton && (
        <button
          className={styles.headerButton}
          onClick={handleOpen}
          aria-label="Install extension manually"
        >
          Install Extension
        </button>
      )}

      {isOpen && (
        <div
          className={styles.overlay}
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Install Extension">
            <div className={styles.header}>
              <h2 className={styles.title}>Install Extension (Manual)</h2>
              <button className={styles.closeButton} onClick={handleClose} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className={styles.body}>
              <p className={styles.intro}>
                Chrome Web Store review of v{EXTENSION_VERSION} is pending. In the meantime,
                install it manually with the steps below — takes about a minute.
              </p>

              <ol className={styles.steps}>
                <li>
                  <strong>Download the extension.</strong>
                  <div className={styles.downloadRow}>
                    <a
                      className={styles.downloadButton}
                      href={`/extension/${EXTENSION_FILENAME}`}
                      download
                    >
                      Download {EXTENSION_FILENAME}
                    </a>
                  </div>
                  <span className={styles.hint}>Then unzip the file somewhere you can find it (e.g. Downloads).</span>
                </li>

                <li>
                  <strong>Open Chrome's extensions page.</strong>
                  <div className={styles.codeRow}>
                    <code className={styles.code}>{EXTENSIONS_URL}</code>
                    <button
                      type="button"
                      className={styles.copyButton}
                      onClick={handleCopy}
                      aria-label="Copy chrome://extensions"
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <span className={styles.hint}>Paste it into Chrome's address bar (links to chrome:// URLs are blocked by the browser).</span>
                </li>

                <li>
                  <strong>Enable Developer mode.</strong>
                  <span className={styles.hint}>Toggle in the top-right of the extensions page.</span>
                </li>

                <li>
                  <strong>Load unpacked.</strong>
                  <span className={styles.hint}>
                    Click "Load unpacked" and select the <code className={styles.inlineCode}>dist</code> folder
                    <em> inside</em> the unzipped folder. Selecting the outer folder will fail with a
                    "manifest file is missing" error.
                  </span>
                </li>
              </ol>

              <p className={styles.outro}>
                Once Chrome Web Store review completes, you'll be able to install from the
                store and can remove this manual install.
              </p>
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.doneButton} onClick={handleClose}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
