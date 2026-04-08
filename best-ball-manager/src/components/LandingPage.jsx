import { useEffect, useRef, useCallback, useState } from 'react';
import {
  LayoutDashboard, Users, TrendingUp, BarChart3, Network, Crosshair,
  Check, Minus, ChevronRight, Shield, Zap, Globe, X,
} from 'lucide-react';
import BrandLogo from './BrandLogo';
import styles from './LandingPage.module.css';

/* ── Scroll-triggered fade-in ── */
function useFadeIn() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add(styles.fadeSectionVisible); observer.unobserve(el); } },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function FadeSection({ children, className = '', id }) {
  const ref = useFadeIn();
  return <div ref={ref} id={id} className={`${styles.fadeSection} ${className}`}>{children}</div>;
}

/* ── Feature data ── */
const FEATURES = [
  {
    icon: LayoutDashboard,
    title: 'Portfolio Dashboard',
    desc: 'Your exposure, archetypes, and portfolio shape on one screen. No digging.',
    unique: false,
    screenshot: '/screenshots/dashboard-hero.png',
  },
  {
    icon: Users,
    title: 'Roster Archetypes',
    desc: 'You know your exposure. You don\'t know your strategy mix. Every roster gets classified across RB, QB, and TE tiers so you can see what you\'re actually building across your portfolio.',
    unique: true,
    screenshot: '/screenshots/roster-viewer.png',
  },
  {
    icon: Crosshair,
    title: 'Draft Overlay',
    desc: 'Live exposure and combo analysis seamlessly integrated into your draft screen. No second window, no alt-tabbing.',
    unique: false,
    screenshot: '/screenshots/draft-assistant.png',
  },
  {
    icon: Globe,
    title: 'Multi-Platform Support',
    desc: 'Sync from Underdog and DraftKings. See your whole portfolio, not half of it.',
    unique: false,
    screenshot: '/screenshots/exposures.png',
  },
  {
    icon: Network,
    title: 'Combo & Stacking Analysis',
    desc: 'Find which QB-WR stacks and correlation plays keep showing up across your entries.',
    unique: false,
    screenshot: '/screenshots/combo-analysis.png',
  },
  {
    icon: TrendingUp,
    title: 'ADP Tracking',
    desc: 'Track who\'s rising and falling so you know where the value is before your next draft.',
    unique: false,
    screenshot: '/screenshots/adp-tracker.png',
  },
];

/* ── Pricing tiers ── */
const FREE_FEATURES = [
  'Portfolio Dashboard',
  'Exposure Analysis',
  'Roster Viewer with Archetypes',
  'Multi-platform support (UD + DK)',
  'Zero config. Upload and go.',
];

const PRO_FEATURES = [
  'Everything in Free, plus:',
  'Draft Flow Analysis',
  'Combo & Stacking Analysis',
  'ADP Tracker',
  'Player Rankings',
  'Roster Construction',
  'All future Pro features',
];

/* ── Comparison table ── */
const COMP_ROWS = [
  { feature: 'Basic exposure tracking', free: true, usFree: true, usPro: true },
  { feature: 'Multi-platform (UD + DK)', free: 'Rarely', usFree: true, usPro: true },
  { feature: 'Portfolio dashboard', free: false, usFree: true, usPro: true },
  { feature: 'Roster archetypes', free: false, usFree: true, usPro: true },
  { feature: 'Draft overlay', free: false, usFree: false, usPro: true },
  { feature: 'Combo / stacking analysis', free: false, usFree: false, usPro: true },
  { feature: 'ADP tracking', free: 'Basic', usFree: false, usPro: true },
  { feature: 'Player rankings', free: false, usFree: false, usPro: true },
  { feature: 'Zero setup required', free: 'Varies', usFree: true, usPro: true },
];

function CellValue({ value }) {
  if (value === true) return <Check size={16} className={styles.cellCheck} />;
  if (value === false) return <Minus size={14} className={styles.cellDash} />;
  return <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{value}</span>;
}

/* ── Main component ── */
export default function LandingPage({ onSignUp, onTryDemo }) {
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const scrollTo = useCallback((id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <div className={styles.page}>
      {/* ── Screenshot lightbox ── */}
      {lightboxSrc && (
        <div className={styles.lightbox} onClick={() => setLightboxSrc(null)}>
          <button className={styles.lightboxClose} onClick={() => setLightboxSrc(null)} aria-label="Close">
            <X size={24} />
          </button>
          <img src={lightboxSrc} alt="" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
      {/* ── Nav ── */}
      <nav className={styles.nav}>
        <div className={styles.navBrand}>
          <BrandLogo size={32} />
          <span className={styles.navBrandName}>Best Ball Exposures</span>
        </div>
        <div className={styles.navActions}>
          <button className={styles.navScrollLink} onClick={() => scrollTo('features')}>Features</button>
          <button className={styles.navScrollLink} onClick={() => scrollTo('pricing')}>Pricing</button>
          <button className={styles.navLink} onClick={onSignUp}>Sign In</button>
          <button className={styles.btnPrimary} onClick={onSignUp}>
            Get Started <ChevronRight size={14} />
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className={`${styles.section} ${styles.hero}`}>
        <div className={styles.heroBadge}>Free through the NFL Draft. No credit card required.</div>
        <h1 className={styles.heroHeadline}>
          You Draft Portfolios. Your Tools Should Analyze Them.
        </h1>
        <p className={styles.heroSub}>
          Most tools show you one roster at a time. That's useless when you're 50 entries in and can't remember what you drafted last Tuesday. Sync your Underdog and DK rosters. See all of it.
        </p>
        <div className={styles.heroCtas}>
          <button className={`${styles.btnPrimary} ${styles.btnLarge}`} onClick={onSignUp}>
            Get Started Free <ChevronRight size={16} />
          </button>
          {onTryDemo && (
            <button className={`${styles.btnSecondary} ${styles.btnLarge}`} onClick={onTryDemo}>
              Try Demo
            </button>
          )}
        </div>
        <div className={styles.heroScreenshot}>
          <img
            src="/screenshots/dashboard-hero.png"
            alt="Best Ball Exposures — portfolio dashboard showing exposure analysis, roster archetypes, and team stacks"
            width={2560}
            height={1600}
            loading="eager"
          />
        </div>
      </section>

      {/* ── Trust bar ── */}
      <FadeSection className={`${styles.section} ${styles.trust}`}>
        <div className={styles.trustInner}>
          <div className={styles.trustItem}>
            <Globe size={16} className={styles.trustIcon} />
            <span>Supports Underdog &amp; DraftKings</span>
          </div>
          <div className={styles.trustDivider} />
          <div className={styles.trustItem}>
            <Zap size={16} className={styles.trustIcon} />
            <span>Zero config. Upload and go.</span>
          </div>
          <div className={styles.trustDivider} />
          <div className={styles.trustItem}>
            <Shield size={16} className={styles.trustIcon} />
            <span>Free tier available</span>
          </div>
        </div>
      </FadeSection>

      {/* ── Features ── */}
      <FadeSection id="features" className={`${styles.section} ${styles.features}`}>
        <h2 className={styles.sectionTitle}>One place for all of it</h2>
        <p className={styles.sectionSub}>
          Sync your Underdog and DK rosters. See exposure, archetypes, stacks, draft patterns, and ADP trends across your whole portfolio.
        </p>
        <div className={styles.featureGrid}>
          {FEATURES.map((f) => (
            <div key={f.title} className={styles.featureCard}>
              {f.screenshot && (
                <div className={styles.featureScreenshot} onClick={() => setLightboxSrc(f.screenshot)} role="button" tabIndex={0}>
                  <img src={f.screenshot} alt={f.title} width={2560} height={1600} loading="lazy" />
                </div>
              )}
              <div className={styles.featureIconWrap}>
                <f.icon size={20} />
              </div>
              <div className={styles.featureCardTitle}>
                {f.title}
                {f.unique && <span className={styles.uniqueBadge}>Only here</span>}
              </div>
              <p className={styles.featureCardDesc}>{f.desc}</p>
            </div>
          ))}
        </div>
      </FadeSection>

      {/* ── Pricing ── */}
      <FadeSection id="pricing" className={`${styles.section} ${styles.pricing}`}>
        <h2 className={styles.sectionTitle}>What it costs</h2>
        <div className={styles.pricingGrid}>
          {/* Free tier */}
          <div className={styles.pricingCard}>
            <div className={styles.pricingTier}>Free</div>
            <div className={styles.pricingPrice}>$0</div>
            <p className={styles.pricingNote}>No account required</p>
            <ul className={styles.pricingFeatures}>
              {FREE_FEATURES.map((f) => (
                <li key={f}><Check size={14} className={styles.checkIcon} /> {f}</li>
              ))}
            </ul>
            <button className={`${styles.btnSecondary} ${styles.pricingCta}`} onClick={onSignUp}>
              Get Started Free
            </button>
          </div>

          {/* Pro tier */}
          <div className={styles.pricingCardPro}>
            <div className={styles.pricingPopular}>Free through April 25</div>
            <div className={styles.pricingTier}>Pro</div>
            <div className={styles.pricingPrice}>$20 <span>/ month</span></div>
            <p className={styles.pricingPromo}>$15/mo with a creator promo code</p>
            <ul className={styles.pricingFeatures}>
              {PRO_FEATURES.map((f) => (
                <li key={f}><Check size={14} className={styles.checkIcon} /> {f}</li>
              ))}
            </ul>
            <button className={`${styles.btnPrimary} ${styles.pricingCta}`} onClick={onSignUp}>
              Start Free Beta <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </FadeSection>

      {/* ── Comparison table ── */}
      <FadeSection className={`${styles.section} ${styles.comparison}`}>
        <h2 className={styles.sectionTitle}>What you get</h2>
        <p className={styles.sectionSub}>
          Here's what you actually get compared to the free tools floating around.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.compTable}>
            <thead>
              <tr>
                <th>Feature</th>
                <th>Free tools</th>
                <th className={styles.colHighlight}>BBE Free</th>
                <th className={styles.colHighlight}>BBE Pro</th>
              </tr>
            </thead>
            <tbody>
              {COMP_ROWS.map((row) => (
                <tr key={row.feature}>
                  <td>{row.feature}</td>
                  <td><CellValue value={row.free} /></td>
                  <td className={styles.colHighlight}><CellValue value={row.usFree} /></td>
                  <td className={styles.colHighlight}><CellValue value={row.usPro} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FadeSection>

      {/* ── Final CTA ── */}
      <FadeSection className={`${styles.section} ${styles.finalCta}`}>
        <h2 className={styles.finalHeadline}>See the shape of 50 drafts in 5 seconds.</h2>
        <p className={styles.finalSub}>Free to start. No credit card.</p>
        <button className={`${styles.btnPrimary} ${styles.btnLarge}`} onClick={onSignUp}>
          Get Started Free <ChevronRight size={16} />
        </button>
      </FadeSection>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <p className={styles.footerText}>
          Best Ball Exposures <span>&middot;</span> &copy; {new Date().getFullYear()} <span>&middot;</span> Built for serious best-ball drafters
        </p>
        <p className={styles.footerLinks}>
          <a href="/privacy.html" className={styles.footerLink}>Privacy Policy</a>
          <span>&middot;</span>
          <a href="/terms.html" className={styles.footerLink}>Terms of Service</a>
          <span>&middot;</span>
          <a href="mailto:bestballexposures@outlook.com" className={styles.footerLink}>Contact</a>
        </p>
      </footer>
    </div>
  );
}
