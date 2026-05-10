import { useState, useEffect, useCallback, useMemo } from 'react';
import { Chrome, Globe, Download, Copy, Check, ArrowLeft, Info } from 'lucide-react';
import { detectBrowser } from '../utils/browserDetect';
import BrandLogo from './BrandLogo';
import styles from './InstallPage.module.css';

const VERSION = '1.0.7';
const ZIP_HREF = `/extension/bestballexposures-extension-${VERSION}.zip`;
const XPI_HREF = `/extension/bestballexposures-extension-${VERSION}.xpi`;

export default function InstallPage() {
  const browser = useMemo(() => detectBrowser(), []);
  const [isUpdate, setIsUpdate] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setIsUpdate(window.location.hash === '#update');
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const isChromium = browser === 'chrome' || browser === 'edge' || browser === 'chromium-other';

  const view = useMemo(() => {
    if (isChromium) return <ChromiumView browser={browser} isUpdate={isUpdate} />;
    if (browser === 'firefox') return <FirefoxView />;
    return <UnsupportedView browser={browser} />;
  }, [browser, isChromium, isUpdate]);

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

        {isUpdate && <UpdateBanner />}

        <div className={styles.viewWrap}>{view}</div>
      </main>
    </div>
  );
}

function UpdateBanner() {
  return (
    <div className={styles.updateBanner} role="status">
      <Info size={18} />
      <div>
        <div className={styles.updateBannerTitle}>It's time to update Best Ball Exposures</div>
        <div className={styles.updateBannerBody}>
          Your installed version is older than the latest. Follow the steps below to install the
          new version on top of your existing one.
        </div>
      </div>
    </div>
  );
}

function ChromiumView({ browser, isUpdate }) {
  const isEdge = browser === 'edge';
  const extUrl = isEdge ? 'edge://extensions' : 'chrome://extensions';
  const browserLabel = isEdge ? 'Edge' : browser === 'chromium-other' ? 'your browser' : 'Chrome';

  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(extUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // user can select+copy manually
    }
  }, [extUrl]);

  return (
    <section className={styles.card}>
      <div className={styles.flowHeader}>
        <Chrome size={22} />
        <span>Install for {browserLabel}</span>
      </div>
      <p className={styles.lede}>
        {browserLabel} blocks one-click installs of extensions hosted outside the Web Store, so
        the install is a few short steps. Takes about a minute.
      </p>

      <ol className={styles.steps}>
        <li>
          <div className={styles.stepLabel}>1. Download the extension</div>
          <a className={styles.primaryDownload} href={ZIP_HREF} download>
            <Download size={16} />
            Download .zip ({VERSION})
          </a>
          <p className={styles.hint}>
            If {browserLabel} warns about the download, click <strong>Keep</strong>.
          </p>
        </li>

        <li>
          <div className={styles.stepLabel}>2. Unzip the file</div>
          <p className={styles.hint}>
            You should end up with a folder named{' '}
            <code>bestballexposures-extension-{VERSION}</code> containing{' '}
            <code>manifest.json</code> and other files. On Mac the OS may unzip it automatically —
            note where it left the folder.
          </p>
        </li>

        <li>
          <div className={styles.stepLabel}>3. Open the extensions page</div>
          <div className={styles.codeRow}>
            <code className={styles.code}>{extUrl}</code>
            <button type="button" className={styles.copyBtn} onClick={onCopy} aria-label="Copy URL">
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className={styles.hint}>
            Paste it into the address bar. ({browserLabel} blocks linking to{' '}
            <code>{isEdge ? 'edge://' : 'chrome://'}</code> URLs.)
          </p>
        </li>

        <li>
          <div className={styles.stepLabel}>4. Turn on Developer mode</div>
          <p className={styles.hint}>
            Toggle in the {isEdge ? 'left side' : 'top-right'} of the extensions page. The warning
            that appears is expected — Developer mode is required for any self-hosted extension.
          </p>
        </li>

        <li>
          <div className={styles.stepLabel}>5. Click "Load unpacked"</div>
          <p className={styles.hint}>The button appears in the top-left after Developer mode is on.</p>
        </li>

        <li>
          <div className={styles.stepLabel}>6. Select the unzipped folder</div>
          <p className={styles.hint}>
            Pick the folder from step 2 — the inner folder containing <code>manifest.json</code>,
            not the outer download folder.
          </p>
        </li>
      </ol>

      {isUpdate && (
        <p className={styles.callout}>
          <Info size={14} /> Do I need to remove the old version first? No — loading the new
          unpacked folder replaces the old one and your saved settings stay put.
        </p>
      )}
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

