import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check, Minus, ChevronRight, X, Chrome, Puzzle, BookOpen, ArrowUpRight,
  Lock, TrendingUp, Network, ListOrdered, BarChart3, Swords,
} from 'lucide-react';
import BrandLogo from './BrandLogo';
import { getPublishedPosts, formatPostDate } from '../utils/blog';
import { addToBrowserLabel, browserDisplayName, detectBrowser } from '../utils/browserDetect';
import { trackEvent } from '../utils/analytics';
import styles from './LandingPage.module.css';

const EXTENSION_URL = '/install';

/* Pick a glyph that matches the user's browser. Chrome has a Lucide brand
   icon; Edge/Firefox/etc. fall back to the generic Puzzle (extension) icon. */
function ExtensionIcon({ size = 16 }) {
  const Icon = detectBrowser() === 'chrome' ? Chrome : Puzzle;
  return <Icon size={size} />;
}

/* ── Scroll-triggered fade-in ── */
function useFadeIn() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add(styles.fadeSectionVisible); observer.unobserve(el); } },
      { threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function FadeSection({ children, className = '', id }) {
  const ref = useFadeIn();
  return <section ref={ref} id={id} className={`${styles.fadeSection} ${className}`}>{children}</section>;
}

/* ── How it works ── */
const STEPS = [
  {
    title: 'Add the extension',
    desc: 'Install the BBE extension for Chrome, Edge, or Firefox. The whole setup takes about a minute.',
  },
  {
    title: 'Open your drafts',
    desc: 'Browse Underdog and DraftKings like you always do. The extension picks up every completed roster and syncs it to your account.',
  },
  {
    title: 'Read your portfolio',
    desc: 'Open BBE and everything is already computed: exposure, stacks, archetypes, ADP movement. Nothing to configure, ever.',
  },
];

/* ── Deep feature rows ── */
const SHOWCASE = [
  {
    kicker: 'Portfolio',
    title: 'Your whole portfolio on one screen',
    desc: 'Exposure leaders, roster archetypes, team stacks, and portfolio shape, computed the moment your drafts sync. The Dashboard is home base; every number drills down to the exact rosters behind it.',
    points: [
      'Underdog and DraftKings merged into one view',
      'Exposure percentages across every entry',
      'Click any stat to open the rosters behind it',
    ],
    screenshot: '/screenshots/dashboard-hero.png',
    alt: 'Best Ball Exposures dashboard showing exposure leaders, archetypes, and team stacks',
  },
  {
    kicker: 'Rosters',
    title: 'Know what you actually built',
    unique: true,
    desc: 'Every roster is classified by build: Hero RB, Zero RB, Elite QB, and more. Season mode layers in weekly results and a per-pod advance estimate, and any entry opens as a full draft board.',
    points: [
      'Archetype classification you won\'t find anywhere else',
      'Advance-rate estimates against your actual pod',
      'Full draft board view for every entry',
    ],
    screenshot: '/screenshots/roster-viewer.png',
    alt: 'Roster Viewer with archetype classification, advance rates, and projections',
    inset: {
      screenshot: '/screenshots/draft-board.png',
      alt: 'Full 12-team draft board with per-team projections, advance rates, and archetypes',
      label: 'Board view',
      width: 2784,
      height: 1692,
    },
  },
  {
    kicker: 'Draft day',
    title: 'Draft with the overlay on',
    desc: 'The live overlay brings your exposure and stack context into the draft room itself. No second monitor, no alt-tabbing, no spreadsheet on the side. Eliminator and superflex slates included.',
    points: [
      'Live exposure while you\'re on the clock',
      'Stack and combo context for every pick',
      'Feels native to Underdog and DraftKings',
    ],
    screenshot: '/screenshots/draft-overlay.png',
    alt: 'Live draft overlay showing exposure and stack context inside the draft room',
  },
];

/* ── Supporting tools grid ── */
const TOOLS = [
  {
    icon: TrendingUp,
    title: 'ADP Tracker',
    desc: 'Every player\'s ADP as a timeline, per platform. Spot risers and fallers before your next draft.',
    screenshot: '/screenshots/adp-tracker.png',
  },
  {
    icon: Network,
    title: 'Combos & Playoff Stacks',
    desc: 'See which QB stacks and player pairs you keep drafting, and how your stacks line up for weeks 15 to 17.',
    screenshot: '/screenshots/combo-analysis.png',
  },
  {
    icon: ListOrdered,
    title: 'Player Rankings',
    desc: 'A drag-and-drop draft board with tiers, a compare mode, and support for your own uploaded ranks.',
    screenshot: '/screenshots/rankings.png',
  },
  {
    icon: BarChart3,
    title: 'Exposure Table',
    desc: 'The classic exposure table, sortable and filterable, across both platforms at once.',
    screenshot: '/screenshots/exposures.png',
  },
];

/* ── Pricing ── */
const FREE_FEATURES = [
  'Portfolio Dashboard',
  'Exposure analysis across both platforms',
  'Roster Viewer with archetypes & advance rates',
  'Best Ball Arena',
  'Underdog + DraftKings auto-sync',
];

const PRO_FEATURES = [
  'Everything in Free, plus:',
  'Draft Assistant with live overlay',
  'Combo analysis & Playoff Stacks',
  'ADP Tracker timelines',
  'Player Rankings with compare mode',
  'Eliminator & superflex support',
  'All future Pro features',
];

/* ── Comparison table ── */
const COMP_ROWS = [
  { feature: 'Exposure tracking', free: 'Basic', usFree: true, usPro: true },
  { feature: 'Underdog + DraftKings in one portfolio', free: 'Rarely', usFree: true, usPro: true },
  { feature: 'Portfolio dashboard', free: false, usFree: true, usPro: true },
  { feature: 'Roster archetypes', free: false, usFree: true, usPro: true },
  { feature: 'Advance-rate estimates', free: false, usFree: true, usPro: true },
  { feature: 'Blind matchup Arena', free: false, usFree: true, usPro: true },
  { feature: 'Live draft overlay', free: false, usFree: false, usPro: true },
  { feature: 'Combo & playoff stack analysis', free: false, usFree: false, usPro: true },
  { feature: 'ADP timelines', free: 'Basic', usFree: false, usPro: true },
  { feature: 'Custom rankings board', free: false, usFree: false, usPro: true },
];

/* ── FAQ ── */
const FAQS = [
  {
    q: 'How do my drafts get into BBE?',
    a: 'Through the browser extension. Install it once, browse your drafts on Underdog or DraftKings, and every roster syncs to your account automatically. There are no CSV exports and no manual entry.',
  },
  {
    q: 'Which platforms are supported?',
    a: 'Underdog and DraftKings. Both merge into a single portfolio, so your exposure numbers reflect everything you\'ve drafted, not half of it.',
  },
  {
    q: 'What does the free plan include?',
    a: 'The Portfolio Dashboard, exposure analysis, the Roster Viewer with archetypes and advance rates, and the Arena. Free means free: no credit card, no trial clock.',
  },
  {
    q: 'Does it help during a live draft?',
    a: 'Yes. Pro includes the Draft Assistant and a live overlay that shows your exposure and stack context inside the draft room while you pick, on both platforms.',
  },
  {
    q: 'What happens once the season starts?',
    a: 'BBE switches into season mode. Weekly results land on your rosters, advance estimates update against your actual pods, and Playoff Stacks shows how your teams line up for weeks 15 to 17.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Subscriptions are handled by Stripe and you can cancel from your account settings in two clicks. Your synced data stays on the free plan.',
  },
];

function CellValue({ value }) {
  if (value === true) return <Check size={16} className={styles.cellCheck} />;
  if (value === false) return <Minus size={14} className={styles.cellDash} />;
  return <span className={styles.cellText}>{value}</span>;
}

/* ── Main component ── */
export default function LandingPage({ onSignUp, onTryDemo }) {
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const navigate = useNavigate();
  const installLabel = addToBrowserLabel();
  const browserName = browserDisplayName();
  const scrollTo = useCallback((id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleSignUp = useCallback((cta) => {
    trackEvent('landing_cta_clicked', { cta });
    onSignUp();
  }, [onSignUp]);

  const handleDemo = useCallback((cta) => {
    trackEvent('landing_cta_clicked', { cta });
    onTryDemo?.();
  }, [onTryDemo]);

  const handleArena = useCallback((cta) => {
    trackEvent('landing_cta_clicked', { cta });
    navigate('/arena');
  }, [navigate]);

  // Newest free issue + a short ledger of recent issues from the blog
  // ("Against ADP"). Guest landing page → live posts only, newest first.
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
          <BrandLogo size={30} />
          <span className={styles.navBrandName}>Best Ball Exposures</span>
        </div>
        <div className={styles.navActions}>
          <button className={styles.navLink} onClick={() => scrollTo('features')}>Features</button>
          <button className={styles.navLink} onClick={() => scrollTo('arena')}>Arena</button>
          <button className={styles.navLink} onClick={() => scrollTo('pricing')}>Pricing</button>
          {latestPost && (
            <button className={styles.navLink} onClick={() => scrollTo('journal')}>Journal</button>
          )}
          <button className={styles.navSignIn} onClick={() => handleSignUp('nav_signin')}>Sign in</button>
          <button className={styles.btnPrimary} onClick={() => handleSignUp('nav_signup')}>
            Get started <ChevronRight size={14} />
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <header className={`${styles.section} ${styles.hero}`}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>Best-ball portfolio analytics</p>
          <h1 className={styles.heroHeadline}>
            Every draft.<br />
            Every exposure.<br />
            <span className={styles.heroAccent}>One dashboard.</span>
          </h1>
          <p className={styles.heroSub}>
            BBE syncs your Underdog and DraftKings entries automatically, then shows
            exposure, stacks, archetypes, and advance odds across your whole portfolio.
            No spreadsheets. No manual entry.
          </p>
          <div className={styles.heroCtas}>
            <button className={`${styles.btnPrimary} ${styles.btnLarge}`} onClick={() => handleSignUp('hero_signup')}>
              Get started free <ChevronRight size={16} />
            </button>
            {onTryDemo && (
              <button className={`${styles.btnSecondary} ${styles.btnLarge}`} onClick={() => handleDemo('hero_demo')}>
                Explore the live demo
              </button>
            )}
          </div>
          <ul className={styles.heroChecklist}>
            <li><Check size={14} /> Free plan, no credit card</li>
            <li><Check size={14} /> Underdog + DraftKings in one place</li>
            <li><Check size={14} /> Set up in about a minute</li>
          </ul>
        </div>
        <div className={styles.heroShot}>
          <div className={styles.shotFrame}>
            <div className={styles.shotBar}>
              <span>bestballexposures.com</span>
            </div>
            <img
              src="/screenshots/dashboard-hero.png"
              alt="Best Ball Exposures portfolio dashboard showing exposure analysis, roster archetypes, and team stacks"
              width={2560}
              height={1600}
              loading="eager"
              onClick={() => setLightboxSrc('/screenshots/dashboard-hero.png')}
            />
          </div>
        </div>
      </header>

      {/* ── How it works ── */}
      <FadeSection className={`${styles.section} ${styles.how}`}>
        <p className={styles.kicker}>How it works</p>
        <h2 className={styles.sectionTitle}>From draft lobby to full portfolio in three steps</h2>
        <div className={styles.stepGrid}>
          {STEPS.map((s, i) => (
            <div key={s.title} className={styles.stepCard}>
              <span className={styles.stepNum}>{i + 1}</span>
              <h3 className={styles.stepTitle}>{s.title}</h3>
              <p className={styles.stepDesc}>{s.desc}</p>
              {i === 0 && (
                <a href={EXTENSION_URL} target="_blank" rel="noopener noreferrer" className={styles.stepLink}>
                  <ExtensionIcon size={14} /> {installLabel}
                </a>
              )}
            </div>
          ))}
        </div>
      </FadeSection>

      {/* ── Deep features ── */}
      <FadeSection id="features" className={`${styles.section} ${styles.showcase}`}>
        <p className={styles.kicker}>What's inside</p>
        <h2 className={styles.sectionTitle}>Built for people who draft in bulk</h2>
        <p className={styles.sectionSub}>
          One roster at a time is fine for redraft. Best ball is a portfolio game,
          and BBE treats it like one.
        </p>

        {SHOWCASE.map((f, i) => (
          <div key={f.title} className={`${styles.showRow} ${i % 2 === 1 ? styles.showRowFlip : ''}`}>
            <div className={styles.showCopy}>
              <p className={styles.rowKicker}>
                {f.kicker}
                {f.unique && <span className={styles.uniqueBadge}>Only here</span>}
              </p>
              <h3 className={styles.showTitle}>{f.title}</h3>
              <p className={styles.showDesc}>{f.desc}</p>
              <ul className={styles.showPoints}>
                {f.points.map((p) => (
                  <li key={p}><Check size={14} /> {p}</li>
                ))}
              </ul>
            </div>
            <div className={f.inset ? styles.showShotStack : styles.showShotWrap}>
              <div className={styles.showShot}>
                <img
                  src={f.screenshot}
                  alt={f.alt}
                  width={2560}
                  height={1600}
                  loading="lazy"
                  onClick={() => setLightboxSrc(f.screenshot)}
                />
                <span className={styles.zoomHint}>Click to expand</span>
              </div>
              {f.inset && (
                <button
                  className={styles.showShotInset}
                  onClick={() => setLightboxSrc(f.inset.screenshot)}
                  aria-label={`Expand: ${f.inset.alt}`}
                >
                  <img
                    src={f.inset.screenshot}
                    alt={f.inset.alt}
                    width={f.inset.width}
                    height={f.inset.height}
                    loading="lazy"
                  />
                  <span className={styles.insetLabel}>{f.inset.label}</span>
                </button>
              )}
            </div>
          </div>
        ))}

        <div className={styles.toolGrid}>
          {TOOLS.map((t) => (
            <div key={t.title} className={styles.toolCard}>
              <div
                className={styles.toolShot}
                onClick={() => setLightboxSrc(t.screenshot)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setLightboxSrc(t.screenshot); }}
              >
                <img src={t.screenshot} alt={t.title} width={2560} height={1600} loading="lazy" />
              </div>
              <div className={styles.toolBody}>
                <div className={styles.toolTitle}><t.icon size={16} /> {t.title}</div>
                <p className={styles.toolDesc}>{t.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </FadeSection>

      {/* ── Arena ── */}
      <FadeSection id="arena" className={`${styles.section} ${styles.arena}`}>
        <div className={styles.arenaPanel}>
          <div className={styles.arenaCopy}>
            <p className={styles.rowKicker}>
              <Swords size={14} /> New &middot; Free to play
            </p>
            <h2 className={styles.arenaTitle}>The Arena is open</h2>
            <p className={styles.arenaDesc}>
              Two real Best Ball Mania rosters, shown blind. Pick the one you'd rather
              have. Every vote moves a hidden Elo rating, and the best teams climb a
              public leaderboard.
            </p>
            <p className={styles.arenaDesc}>
              Your synced teams enter automatically. And you don't need an account
              to start judging.
            </p>
            <div className={styles.arenaCtas}>
              <button className={`${styles.btnPrimary} ${styles.btnLarge}`} onClick={() => handleArena('arena_enter')}>
                Enter the Arena <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className={styles.arenaShot}>
            <img
              src="/screenshots/arena.png"
              alt="Best Ball Arena blind matchup: two anonymized rosters side by side with a tale-of-the-tape comparison"
              width={2448}
              height={1800}
              loading="lazy"
              onClick={() => setLightboxSrc('/screenshots/arena.png')}
            />
            <span className={styles.zoomHint}>Click to expand</span>
          </div>
        </div>
      </FadeSection>

      {/* ── Pricing ── */}
      <FadeSection id="pricing" className={`${styles.section} ${styles.pricing}`}>
        <p className={styles.kicker}>Pricing</p>
        <h2 className={styles.sectionTitle}>Start free. Upgrade when it earns it.</h2>
        <div className={styles.pricingGrid}>
          {/* Free tier */}
          <div className={styles.pricingCard}>
            <div className={styles.pricingTier}>Free</div>
            <div className={styles.pricingPrice}>$0</div>
            <p className={styles.pricingNote}>No credit card. No trial clock.</p>
            <ul className={styles.pricingFeatures}>
              {FREE_FEATURES.map((f) => (
                <li key={f}><Check size={14} className={styles.checkIcon} /> {f}</li>
              ))}
            </ul>
            <button className={`${styles.btnSecondary} ${styles.pricingCta}`} onClick={() => handleSignUp('pricing_free')}>
              Create your free account
            </button>
          </div>

          {/* Pro tier */}
          <div className={styles.pricingCardPro}>
            <div className={styles.pricingTierRow}>
              <div className={styles.pricingTier}>Pro</div>
              <span className={styles.saveBadge}>Save 72% annually</span>
            </div>
            <div className={styles.pricingPrice}>$67 <span>/ year</span></div>
            <p className={styles.pricingNote}>or $20 / month. Cancel anytime.</p>
            <ul className={styles.pricingFeatures}>
              {PRO_FEATURES.map((f, i) => (
                <li key={f} className={i === 0 ? styles.featuresHeading : ''}>
                  {i !== 0 && <Check size={14} className={styles.checkIcon} />} {f}
                </li>
              ))}
            </ul>
            <button className={`${styles.btnPrimary} ${styles.pricingCta}`} onClick={() => handleSignUp('pricing_pro')}>
              Get Pro <ChevronRight size={14} />
            </button>
          </div>
        </div>
        <p className={styles.pricingFootnote}>Have a promo code? Apply it at checkout.</p>
      </FadeSection>

      {/* ── Comparison table ── */}
      <FadeSection className={`${styles.section} ${styles.comparison}`}>
        <p className={styles.kicker}>Side by side</p>
        <h2 className={styles.sectionTitle}>What you actually get</h2>
        <p className={styles.sectionSub}>
          Compared to the spreadsheets and free trackers floating around.
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

      {/* ── FAQ ── */}
      <FadeSection className={`${styles.section} ${styles.faq}`}>
        <p className={styles.kicker}>Questions</p>
        <h2 className={styles.sectionTitle}>Before you ask</h2>
        <div className={styles.faqList}>
          {FAQS.map((f) => (
            <details key={f.q} className={styles.faqItem}>
              <summary className={styles.faqQ}>{f.q}</summary>
              <p className={styles.faqA}>{f.a}</p>
            </details>
          ))}
        </div>
      </FadeSection>

      {/* ── Journal (blog) ── */}
      {latestPost && (
        <FadeSection id="journal" className={`${styles.section} ${styles.journal}`}>
          <p className={styles.kicker}>From the journal</p>
          <h2 className={styles.sectionTitle}>Against ADP</h2>
          <p className={styles.sectionSub}>
            A weekly read on what the draft room believes, and where it's wrong.
            Written off the same data the app runs on. No hot takes, just receipts.
          </p>

          <div className={`${styles.journalLayout} ${recentPosts.length ? '' : styles.journalLayoutSolo}`}>
            {/* Latest issue — free to read */}
            <a href={`/blog/${latestPost.slug}`} className={styles.journalFeature}>
              <div className={styles.journalFeatureTop}>
                <span className={styles.journalKicker}>Latest issue &middot; Free to read</span>
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
                <span className={styles.journalDot} aria-hidden="true">&middot;</span>
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
                <a href="/blog" className={styles.journalBrowse}>
                  <BookOpen size={14} /> Browse the full journal
                </a>
              </div>
            )}
          </div>
        </FadeSection>
      )}

      {/* ── Final CTA ── */}
      <FadeSection className={`${styles.section} ${styles.finalCta}`}>
        <h2 className={styles.finalHeadline}>
          Your portfolio is already drafted.<br />
          <span className={styles.heroAccent}>See it.</span>
        </h2>
        <p className={styles.finalSub}>Free to start. Synced in about a minute.</p>
        <div className={styles.finalCtas}>
          <button className={`${styles.btnPrimary} ${styles.btnLarge}`} onClick={() => handleSignUp('final_signup')}>
            Get started free <ChevronRight size={16} />
          </button>
          {onTryDemo && (
            <button className={`${styles.btnSecondary} ${styles.btnLarge}`} onClick={() => handleDemo('final_demo')}>
              Explore the live demo
            </button>
          )}
        </div>
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
        <div className={styles.footerBrand}>
          <BrandLogo size={26} />
          <span>Best Ball Exposures</span>
        </div>
        <nav className={styles.footerNav} aria-label="Footer">
          <button onClick={() => scrollTo('features')}>Features</button>
          <button onClick={() => scrollTo('arena')}>Arena</button>
          <button onClick={() => scrollTo('pricing')}>Pricing</button>
          <a href="/blog">Journal</a>
          <a href={EXTENSION_URL} target="_blank" rel="noopener noreferrer">Install extension</a>
          <a href="https://x.com/BBExposures" target="_blank" rel="noopener noreferrer">@BBExposures</a>
        </nav>
        <p className={styles.footerLegal}>
          &copy; {new Date().getFullYear()} Best Ball Exposures
          <span>&middot;</span>
          <a href="/privacy.html">Privacy</a>
          <span>&middot;</span>
          <a href="/terms.html">Terms</a>
          <span>&middot;</span>
          <a href="mailto:bestballexposures@gmail.com">Contact</a>
        </p>
      </footer>
    </div>
  );
}
