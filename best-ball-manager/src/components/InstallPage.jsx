import { useState, useCallback, useMemo } from 'react';
import { Chrome, Globe, Download, Copy, Check, ArrowLeft, Info } from 'lucide-react';
import { detectBrowser } from '../utils/browserDetect';
import BrandLogo from './BrandLogo';
import styles from './InstallPage.module.css';

const VERSION = '1.0.5';
const CRX_HREF = `/extension/bestballexposures-extension-${VERSION}.crx`;
const XPI_HREF = `/extension/bestballexposures-extension-${VERSION}.xpi`;

export default function InstallPage() {
  const browser = useMemo(() => detectBrowser(), []);

  const view = useMemo(() => {
    switch (browser) {
      case 'edge': return <EdgeView />;
      case 'firefox': return <FirefoxView />;
      case 'chrome':
      case 'chromium-other':
        return <ChromeGuidedView />;
      case 'safari':
      case 'mobile':
      case 'unknown':
      default:
        return <UnsupportedView browser={browser} />;
    }
  }, [browser]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a href="/" className={styles.brandLink} aria-label="Back to Best Ball Exposures">
          <BrandLogo size={32} />
          <span className={styles.brandText}>Best Ball Exposures</span>
        </a>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>Install the Best Ball Exposures extension</h1>
        <p className={styles.subtitle}>
          Sync your rosters from Underdog and DraftKings into the dashboard.
        </p>

        <div className={styles.viewWrap}>{view}</div>

        <Transparency />
      </main>
    </div>
  );
}

function ChromeGuidedView() {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText('chrome://extensions');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // user can select+copy manually
    }
  }, []);

  return (
    <section className={styles.card}>
      <div className={styles.flowHeader}>
        <Chrome size={22} />
        <span>Install for Chrome</span>
      </div>
      <p className={styles.lede}>
        Chrome doesn't allow one-click installs from outside the Web Store, so the install
        is a few short steps. Takes about a minute.
      </p>

      <ol className={styles.steps}>
        <li>
          <div className={styles.stepLabel}>1. Download the extension</div>
          <a className={styles.primaryDownload} href={CRX_HREF} download>
            <Download size={16} />
            Download .crx ({VERSION})
          </a>
          <p className={styles.hint}>
            Chrome will warn that this file isn't commonly downloaded — click <strong>Keep</strong>.
          </p>
        </li>

        <li>
          <div className={styles.stepLabel}>2. Open Chrome's extensions page</div>
          <div className={styles.codeRow}>
            <code className={styles.code}>chrome://extensions</code>
            <button type="button" className={styles.copyBtn} onClick={onCopy} aria-label="Copy URL">
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className={styles.hint}>
            Paste it into the address bar. (Chrome blocks linking to <code>chrome://</code> URLs.)
          </p>
        </li>

        <li>
          <div className={styles.stepLabel}>3. Turn on Developer mode</div>
          <p className={styles.hint}>Toggle in the top-right of the extensions page.</p>
        </li>

        <li>
          <div className={styles.stepLabel}>4. Drag the .crx onto the page</div>
          <p className={styles.hint}>
            Drag the file you downloaded in step 1 anywhere on the extensions page. Click
            <strong> Add extension</strong> when Chrome asks to confirm.
          </p>
        </li>
      </ol>

      <p className={styles.callout}>
        <Info size={14} /> The extension auto-updates from our server — you only do this once.
      </p>
    </section>
  );
}

function EdgeView() {
  return (
    <section className={styles.card}>
      <div className={styles.flowHeader}>
        <Chrome size={22} />
        <span>Install for Edge</span>
      </div>
      <p className={styles.lede}>
        Edge accepts our signed extension directly. Download, then drag the file onto Edge's
        extensions page and confirm.
      </p>

      <a className={styles.primaryDownload} href={CRX_HREF} download>
        <Download size={16} />
        Download .crx ({VERSION})
      </a>

      <ol className={styles.steps}>
        <li>
          <div className={styles.stepLabel}>1. Open <code>edge://extensions</code></div>
          <p className={styles.hint}>Paste the URL into Edge's address bar.</p>
        </li>
        <li>
          <div className={styles.stepLabel}>2. Turn on Developer mode</div>
          <p className={styles.hint}>Toggle on the left side of the extensions page.</p>
        </li>
        <li>
          <div className={styles.stepLabel}>3. Drag the .crx onto the page</div>
          <p className={styles.hint}>Click <strong>Add extension</strong> when Edge asks to confirm.</p>
        </li>
      </ol>

      <p className={styles.callout}>
        <Info size={14} /> The extension auto-updates from our server — you only do this once.
      </p>
    </section>
  );
}

function FirefoxView() {
  return (
    <section className={styles.card}>
      <div className={styles.flowHeader}>
        <Globe size={22} />
        <span>Install for Firefox</span>
      </div>
      <p className={styles.lede}>
        We're a Mozilla-signed Firefox add-on. Click below — Firefox will ask you to confirm,
        then install.
      </p>

      <a className={styles.primaryDownload} href={XPI_HREF}>
        <Download size={16} />
        Install for Firefox ({VERSION})
      </a>

      <p className={styles.hint}>
        If your browser downloads the file instead of prompting to install, drag the
        downloaded <code>.xpi</code> onto <code>about:addons</code>.
      </p>

      <p className={styles.callout}>
        <Info size={14} /> The extension auto-updates from our server — you only do this once.
      </p>
    </section>
  );
}

function UnsupportedView({ browser }) {
  const message = browser === 'mobile'
    ? "BBE's extension runs in desktop browsers — Underdog and DraftKings drafts don't expose the same APIs on mobile."
    : "BBE's extension supports desktop Chrome, Edge, and Firefox. Open BestBallExposures.com on one of those to install.";

  return (
    <section className={styles.card}>
      <div className={styles.flowHeader}>
        <Globe size={22} />
        <span>Desktop browser required</span>
      </div>
      <p className={styles.lede}>{message}</p>
      <a className={styles.secondaryLink} href="/">
        <ArrowLeft size={14} /> Back to dashboard
      </a>
    </section>
  );
}

function Transparency() {
  return (
    <details className={styles.transparency}>
      <summary>Why isn't this on the Chrome Web Store?</summary>
      <div className={styles.transparencyBody}>
        <p>
          Best Ball Exposures was rejected from the Chrome Web Store under a category we
          disagree with. Rather than appeal indefinitely, we host the extension directly on
          our own domain.
        </p>
        <p>
          The install is a few extra clicks on Chrome compared to the Web Store, but the
          extension itself is identical and updates automatically.
        </p>
      </div>
    </details>
  );
}

