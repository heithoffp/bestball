import BrandLogo from './BrandLogo';
import styles from './BlogChrome.module.css';

const X_URL = 'https://x.com/BBExposures';

function XIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/**
 * Standalone public chrome for the /blog routes — no app shell, no auth gate.
 * Mirrors the InstallPage pattern: a thin masthead + the BBE brand mark.
 */
export default function BlogChrome({ children }) {
  return (
    <div className={styles.page}>
      <div className={styles.grain} aria-hidden="true" />
      <div className={styles.glow} aria-hidden="true" />

      <header className={styles.masthead}>
        <a href="/blog" className={styles.brand} aria-label="Against ADP — Best Ball Exposures journal">
          <BrandLogo size={30} />
          <span className={styles.brandWord}>
            Against ADP
            <span className={styles.brandSub}>Best Ball Exposures</span>
          </span>
        </a>
        <nav className={styles.nav}>
          <a className={styles.navLink} href="/">Open the app</a>
          <a className={styles.iconLink} href={X_URL} target="_blank" rel="noopener noreferrer" aria-label="Follow @BBExposures on X">
            <XIcon />
          </a>
        </nav>
      </header>

      <main className={styles.main}>{children}</main>

      <footer className={styles.footer}>
        <div className={styles.footRule} aria-hidden="true" />
        <div className={styles.footInner}>
          <a href="/" className={styles.footBrand}>
            <BrandLogo size={22} />
            <span>Best Ball Exposures</span>
          </a>
          <span className={styles.footMeta}>Portfolio analytics for Underdog &amp; DraftKings best ball.</span>
          <a className={styles.iconLink} href={X_URL} target="_blank" rel="noopener noreferrer" aria-label="Follow @BBExposures on X">
            <XIcon size={14} />
          </a>
        </div>
      </footer>
    </div>
  );
}
