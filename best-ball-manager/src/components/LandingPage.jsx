import { useEffect, useRef, useCallback, useState } from 'react';
import {
  LayoutDashboard, Users, TrendingUp, BarChart3, Network, Crosshair,
  Check, Minus, ChevronRight, Shield, Zap, Globe, X, Chrome, Puzzle,
  BookOpen, ArrowUpRight, Lock,
} from 'lucide-react';
import BrandLogo from './BrandLogo';
import { getPublishedPosts, formatPostDate } from '../utils/blog';
import { addToBrowserLabel, browserDisplayName, detectBrowser } from '../utils/browserDetect';

/* Pick a glyph that matches the user's browser. Chrome has a Lucide brand
   icon; Edge/Firefox/etc. fall back to the generic Puzzle (extension) icon. */
function ExtensionIcon({ size = 16 }) {
  const Icon = detectBrowser() === 'chrome' ? Chrome : Puzzle;
  return <Icon size={size} />;
}
import styles from './LandingPage.module.css';

const EXTENSION_URL = '/install';

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
    screenshot: '/screenshots/draft-overlay.png',
  },
  {
    icon: Globe,
    title: 'Multi-Platform Support',
    desc: 'Sync from Underdog and DraftKings. See your whole portfolio, not half of it.',
    unique: false,
    screenshot: '/screenshots/multi-platform.png',
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

/* ── Floating hero chips (visual flavor) ── */
const HERO_CHIPS = [
  { label: 'Hero RB', value: '22%', tone: 'gold', x: '6%',  y: '18%', delay: '0s'   },
  { label: 'Zero RB', value: '14%', tone: 'mute', x: '88%', y: '12%', delay: '.6s' },
  { label: 'Elite QB Stack', value: '31%', tone: 'gold', x: '92%', y: '64%', delay: '1.2s' },
  { label: 'Underdog · DK', value: 'synced', tone: 'mute', x: '4%',  y: '70%', delay: '.3s' },
  { label: 'CMC', value: '↑ 3.4', tone: 'pos',  x: '14%', y: '46%', delay: '.9s' },
  { label: 'Bijan', value: '↓ 1.1', tone: 'neg',  x: '82%', y: '38%', delay: '1.5s' },
];

function CellValue({ value }) {
  if (value === true) return <Check size={16} className={styles.cellCheck} />;
  if (value === false) return <Minus size={14} className={styles.cellDash} />;
  return <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{value}</span>;
}

/* ── Main component ── */
export default function LandingPage({ onSignUp, onTryDemo }) {
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const installLabel = addToBrowserLabel();
  const browserName = browserDisplayName();
  const browserKey = detectBrowser();
  const scrollTo = useCallback((id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Surface the newest free issue + a short ledger of recent issues from the
  // blog ("Against ADP"). Guest landing page → live posts only, newest first.
  const blogPosts = getPublishedPosts();
  const latestPost = blogPosts[0];
  const recentPosts = blogPosts.slice(1, 4);

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
          {latestPost && (
            <button className={styles.navScrollLink} onClick={() => scrollTo('journal')}>Journal</button>
          )}
          <button className={styles.navLink} onClick={onSignUp}>Sign In</button>
          <button className={styles.btnPrimary} onClick={onSignUp}>
            Get Started <ChevronRight size={14} />
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className={`${styles.section} ${styles.hero}`}>
        {/* Decorative background */}
        <div className={styles.heroBg} aria-hidden="true">
          <div className={styles.heroGrid} />
          <div className={styles.heroGlow} />
          <div className={styles.heroGlowAlt} />
          {HERO_CHIPS.map((c, i) => (
            <div
              key={i}
              className={`${styles.heroChip} ${styles[`chip_${c.tone}`]}`}
              style={{ left: c.x, top: c.y, animationDelay: c.delay }}
            >
              <span className={styles.chipLabel}>{c.label}</span>
              <span className={styles.chipValue}>{c.value}</span>
            </div>
          ))}
        </div>

        <div className={styles.heroEyebrow}>
          <span className={styles.eyebrowDot} />
          <span>Live · Best-ball portfolio analytics</span>
        </div>

        <h1 className={styles.heroHeadline}>
          <span className={styles.headlineLine}>
            <span className={styles.headlineMuted}>You draft</span>{' '}
            <span className={styles.headlineGold}>portfolios.</span>
          </span>
          <span className={styles.headlineLine}>
            <span className={styles.headlineMuted}>Your tools should</span>{' '}
            <span className={styles.headlineGold}>analyze them.</span>
          </span>
        </h1>

        <p className={styles.heroSub}>
          Most tools show you one roster at a time. That's useless when you're 50 entries in
          and can't remember what you drafted last Tuesday. Sync your Underdog and DK rosters.
          See <em>all</em> of it.
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
          <a
            href={EXTENSION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.btnExtension} ${styles.btnLarge}`}
            data-browser={browserKey}
          >
            <ExtensionIcon size={16} /> {installLabel}
          </a>
        </div>

        {/* Stat strip */}
        <div className={styles.statStrip}>
          <div className={styles.statCell}>
            <div className={styles.statValue}>50+</div>
            <div className={styles.statLabel}>Drafts at a glance</div>
          </div>
          <div className={styles.statCell}>
            <div className={styles.statValue}>2</div>
            <div className={styles.statLabel}>Platforms unified</div>
          </div>
          <div className={styles.statCell}>
            <div className={styles.statValue}>0</div>
            <div className={styles.statLabel}>Setup required</div>
          </div>
          <div className={styles.statCell}>
            <div className={styles.statValue}>∞</div>
            <div className={styles.statLabel}>Entries supported</div>
          </div>
        </div>

        <div className={styles.heroScreenshot}>
          <div className={styles.screenshotFrame}>
            <span className={styles.frameDot} />
            <span className={styles.frameDot} />
            <span className={styles.frameDot} />
            <span className={styles.frameLabel}>bestballexposures.com / dashboard</span>
          </div>
          <img
            src="/screenshots/dashboard-hero.png"
            alt="Best Ball Exposures — portfolio dashboard showing exposure analysis, roster archetypes, and team stacks"
            width={2560}
            height={1600}
            loading="eager"
          />
        </div>
      </section>

      {/* ── Trust bar (ticker) ── */}
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
          <div className={styles.trustDivider} />
          <div className={styles.trustItem}>
            <Puzzle size={16} className={styles.trustIcon} />
            <a href={EXTENSION_URL} target="_blank" rel="noopener noreferrer" className={styles.trustLink}>
              Browser extension — auto-sync your drafts
            </a>
          </div>
        </div>
      </FadeSection>

      {/* ── Features ── */}
      <FadeSection id="features" className={`${styles.section} ${styles.features}`}>
        <div className={styles.sectionLabel}>
          <span className={styles.sectionNum}>01</span> What's inside
        </div>
        <h2 className={styles.sectionTitle}>One place for all of it</h2>
        <p className={styles.sectionSub}>
          Sync your Underdog and DK rosters. See exposure, archetypes, stacks, draft patterns,
          and ADP trends across your whole portfolio.
        </p>
        <div className={styles.featureGrid}>
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className={`${styles.featureCard} ${f.unique ? styles.featureCardUnique : ''} ${i === 0 ? styles.featureCardWide : ''}`}
            >
              {f.unique && (
                <>
                  <span className={`${styles.corner} ${styles.cornerTL}`} />
                  <span className={`${styles.corner} ${styles.cornerTR}`} />
                  <span className={`${styles.corner} ${styles.cornerBL}`} />
                  <span className={`${styles.corner} ${styles.cornerBR}`} />
                </>
              )}
              {f.screenshot && (
                <div
                  className={styles.featureScreenshot}
                  onClick={() => setLightboxSrc(f.screenshot)}
                  role="button"
                  tabIndex={0}
                >
                  <img src={f.screenshot} alt={f.title} width={2560} height={1600} loading="lazy" />
                  <span className={styles.zoomHint}>Click to expand</span>
                </div>
              )}
              <div className={styles.featureBody}>
                <div className={styles.featureIconWrap}>
                  <f.icon size={20} />
                </div>
                <div className={styles.featureCardTitle}>
                  {f.title}
                  {f.unique && <span className={styles.uniqueBadge}>Only here</span>}
                </div>
                <p className={styles.featureCardDesc}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </FadeSection>

      {/* ── Pricing ── */}
      <FadeSection id="pricing" className={`${styles.section} ${styles.pricing}`}>
        <div className={styles.sectionLabel}>
          <span className={styles.sectionNum}>02</span> What it costs
        </div>
        <h2 className={styles.sectionTitle}>Simple pricing. No surprises.</h2>
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
            <div className={styles.proGlow} aria-hidden="true" />
            <div className={styles.pricingTier}>Pro</div>
            <div className={styles.pricingPrice}>$20 <span>/ month</span></div>
            <ul className={styles.pricingFeatures}>
              {PRO_FEATURES.map((f, i) => (
                <li key={f} className={i === 0 ? styles.featuresHeading : ''}>
                  <Check size={14} className={styles.checkIcon} /> {f}
                </li>
              ))}
            </ul>
            <button className={`${styles.btnPrimary} ${styles.pricingCta}`} onClick={onSignUp}>
              Get Pro <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </FadeSection>

      {/* ── Comparison table ── */}
      <FadeSection className={`${styles.section} ${styles.comparison}`}>
        <div className={styles.sectionLabel}>
          <span className={styles.sectionNum}>03</span> Side by side
        </div>
        <h2 className={styles.sectionTitle}>What you actually get</h2>
        <p className={styles.sectionSub}>
          Compared to the free tools floating around.
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

      {/* ── Journal (blog) ── */}
      {latestPost && (
        <FadeSection id="journal" className={`${styles.section} ${styles.journal}`}>
          <div className={styles.sectionLabel}>
            <span className={styles.sectionNum}>04</span> From the journal
          </div>
          <h2 className={styles.sectionTitle}>Against ADP</h2>
          <p className={styles.sectionSub}>
            A weekly read on what the draft room believes — and where it's wrong. Written off
            the same data the app runs on. No hot takes, just receipts.
          </p>

          <div className={`${styles.journalLayout} ${recentPosts.length ? '' : styles.journalLayoutSolo}`}>
            {/* Latest issue — free to read */}
            <a href={`/blog/${latestPost.slug}`} className={styles.journalFeature}>
              <div className={styles.journalFeatureTop}>
                <span className={styles.journalKicker}>Latest issue · Free to read</span>
                {latestPost.topicTags.length > 0 && (
                  <span className={styles.journalTags}>
                    {latestPost.topicTags.slice(0, 3).map((t) => (
                      <span key={t} className={styles.journalTag}>{t}</span>
                    ))}
                  </span>
                )}
              </div>
              <h3 className={styles.journalFeatureTitle}>{latestPost.title}</h3>
              <p className={styles.journalFeatureExcerpt}>{latestPost.excerpt}</p>
              <div className={styles.journalMeta}>
                <span>{formatPostDate(latestPost.date)}</span>
                <span className={styles.journalDot} aria-hidden="true">·</span>
                <span>{latestPost.readingTime} min read</span>
                <span className={styles.journalReadCta}>
                  Read it <ArrowUpRight size={15} strokeWidth={2.25} />
                </span>
              </div>
            </a>

            {/* Recent issues ledger */}
            {recentPosts.length > 0 && (
              <div className={styles.journalArchive}>
                <div className={styles.journalArchiveHead}>
                  <span>Recent issues</span>
                  <span className={styles.journalArchiveLock}>
                    <Lock size={11} strokeWidth={2.5} /> Pro
                  </span>
                </div>
                <ol className={styles.journalLedger}>
                  {recentPosts.map((p) => (
                    <li key={p.slug}>
                      <a href={`/blog/${p.slug}`} className={styles.journalRow}>
                        <span className={styles.journalRowDate}>{formatPostDate(p.date)}</span>
                        <span className={styles.journalRowTitle}>{p.title}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          <div className={styles.journalCtaRow}>
            <a href="/blog" className={`${styles.btnSecondary} ${styles.btnLarge}`}>
              <BookOpen size={16} /> Browse the full journal
            </a>
          </div>
        </FadeSection>
      )}

      {/* ── Final CTA ── */}
      <FadeSection className={`${styles.section} ${styles.finalCta}`}>
        <div className={styles.finalScan} aria-hidden="true" />
        <h2 className={styles.finalHeadline}>
          See the shape of <span className={styles.finalAccent}>50 drafts</span> in 5 seconds.
        </h2>
        <p className={styles.finalSub}>Free to start. No credit card.</p>
        <button className={`${styles.btnPrimary} ${styles.btnLarge}`} onClick={onSignUp}>
          Get Started Free <ChevronRight size={16} />
        </button>
        <a
          href={EXTENSION_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.extensionCta}
        >
          <ExtensionIcon size={14} /> or install the {browserName} extension first
        </a>
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
          <a href="mailto:bestballexposures@gmail.com" className={styles.footerLink}>Contact</a>
        </p>
      </footer>
    </div>
  );
}
