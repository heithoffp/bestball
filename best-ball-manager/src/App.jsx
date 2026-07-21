// src/App.jsx
import React, { useEffect, useState, Suspense, lazy, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { processLoadedData } from './utils/dataLoader';
import { syncSaveFile, syncGetFile } from './utils/storage';
import { useAuth } from './contexts/AuthContext';
import { supabase } from './utils/supabaseClient';
import { useSubscription } from './contexts/SubscriptionContext';
import { canAccessFeature } from './utils/featureAccess';
import { isArenaBetaUser } from './utils/arenaBeta';
import { getArenaBetaMode } from './utils/arenaClient';
import AuthButton from './components/AuthButton';
import LockedFeature from './components/LockedFeature';
import AuthModal from './components/AuthModal';
import AccountSettings from './components/AccountSettings';
import BetaBanner from './components/BetaBanner';
import PlanPicker from './components/PlanPicker';
import useMediaQuery from './hooks/useMediaQuery';
import { trackEvent } from './utils/analytics';
import FeedbackButton from './components/FeedbackButton';
import InstallExtensionButton from './components/InstallExtensionButton';
import { SideNav, MobileNav } from './components/AppNav';
import { LayoutDashboard, BarChart3, Users, TrendingUp, ListOrdered, Crosshair, Info, Settings, Network, Swords } from 'lucide-react';

const TAB_PATHS = {
  dashboard: '/',
  exposures: '/exposures',
  rosters: '/rosters',
  timeseries: '/adp-tracker',
  combo: '/combos',
  rankings: '/rankings',
  draftflow: '/draft-assistant',
  arena: '/arena',
};

const PATH_TO_TAB = Object.fromEntries(Object.entries(TAB_PATHS).map(([k, v]) => [v, k]));

const tabs = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'exposures', label: 'Exposures', icon: BarChart3 },
  { key: 'rosters', label: 'Rosters', icon: Users },
  { key: 'timeseries', label: 'ADP Tracker', icon: TrendingUp },
  { key: 'combo', label: 'Combos', icon: Network },
  { key: 'rankings', label: 'Rankings', icon: ListOrdered },
  { key: 'draftflow', label: 'Draft Assistant', icon: Crosshair },
  { key: 'arena', label: 'Arena', icon: Swords, isNew: true },
];

// Navigation grouping — encodes the product's real structure: the portfolio
// drill-downs, the market data views, and the draft-time tools.
const NAV_GROUPS = [
  { label: null, keys: ['dashboard'] },
  { label: 'Portfolio', keys: ['exposures', 'rosters', 'combo'] },
  { label: 'Market', keys: ['timeseries', 'rankings'] },
  { label: 'Draft Day', keys: ['draftflow', 'arena'] },
];

// Lazy-loaded tab components (P2: code splitting)
const ExposureTable = lazy(() => import('./components/ExposureTable'));
const AdpTimeSeries = lazy(() => import('./components/AdpTimeSeries'));
const DraftFlowAnalysis = lazy(() => import('./components/DraftFlowAnalysis'));
const RosterViewer = lazy(() => import('./components/RosterViewer'));
const PlayerRankings = lazy(() => import('./components/PlayerRankings'));
// HelpGuide tab removed — contextual help is now per-tab via global Help button
const Dashboard = lazy(() => import('./components/Dashboard'));
const ComboAnalysis = lazy(() => import('./components/ComboAnalysis'));
const Arena = lazy(() => import('./components/Arena'));
// DISABLED for performance — keep source file intact
// const RosterConstruction = lazy(() => import('./components/RosterConstruction'));
const LandingPage = lazy(() => import('./components/LandingPage'));
const InstallPage = lazy(() => import('./components/InstallPage'));
const Unsubscribe = lazy(() => import('./components/Unsubscribe'));
const MobileCheckoutReturn = lazy(() => import('./components/MobileCheckoutReturn'));
const BlogChrome = lazy(() => import('./components/BlogChrome'));
const BlogIndex = lazy(() => import('./components/BlogIndex'));
const BlogPost = lazy(() => import('./components/BlogPost'));

// Bundled assets (developer-controlled) — all use glob so missing files don't break the build
const rosterModules = import.meta.glob('./assets/rosters.csv', { as: 'raw', eager: true });
const demoRosterModules = import.meta.glob('./assets/demo-rosters.csv', { as: 'raw', eager: true });
const adpModules = import.meta.glob('./assets/adp/*.csv', { as: 'raw' });
const projectionsModules = import.meta.glob('./assets/projections.csv', { as: 'raw', eager: true });
const rankingsModules = import.meta.glob('./assets/rankings.csv', { as: 'raw', eager: true });
// Weekly actual fantasy points, dropped in as the season progresses (same
// workflow as ADP snapshots): {halfppr|fullppr}_week_{N}.csv — e.g.
// halfppr_week_01.csv. Absent files are fine; the Roster Viewer stays in
// pure-projection mode until the first week's results land.
const actualsModules = import.meta.glob('./assets/actuals/*.csv', { as: 'raw', eager: true });

async function loadBundledAdp() {
  const adpEntries = Object.entries(adpModules);
  if (adpEntries.length === 0) return [];
  const files = await Promise.all(adpEntries.map(async ([filePath, resolver]) => {
    const text = await resolver();
    const parts = filePath.split('/');
    const fileName = parts[parts.length - 1];
    // Normalize underscore date separators (e.g. 2026_06_25) to dashes before
    // matching, so a malformed filename never falls back to the raw string and
    // corrupts snapshot date sorting / timeline alignment (TASK-278).
    const normalized = fileName.replace(/(\d{4})_(\d{2})_(\d{2})/, '$1-$2-$3');
    const dateMatch = normalized.match(/(\d{4}-\d{2}-\d{2})/);
    const isSuperflex = /^superflex_adp/.test(fileName);
    const isEliminator = /^eliminator_adp/.test(fileName);
    // Superflex and Eliminator have different scoring / player pools; never let them win
    // the global "latest" fallback used for slates that don't resolve to a specific platform.
    const dateStr = dateMatch ? dateMatch[1] : ((isSuperflex || isEliminator) ? '1900-01-01' : fileName);
    // Accept both the canonical "draftking_" prefix and the stray "draftkings_"
    // variant so a misnamed export doesn't land in an orphan "unknown" platform.
    const platformMatch = fileName.match(/^(underdog|draftkings?)_adp_/);
    let platform = 'unknown';
    if (isSuperflex) platform = 'superflex';
    else if (isEliminator) platform = 'eliminator';
    else if (platformMatch) platform = platformMatch[1].startsWith('draftking') ? 'draftkings' : platformMatch[1];
    return { text: String(text), date: dateStr, filename: fileName, platform };
  }));
  return files;
}

export default function App() {
  const [rosterData, setRosterData] = useState([]);
  const [masterPlayers, setMasterPlayers] = useState([]);
  const [adpSnapshots, setAdpSnapshots] = useState([]);
  const [adpByPlatform, setAdpByPlatform] = useState({});
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = PATH_TO_TAB[location.pathname] ?? 'dashboard';
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [rankingsByPlatform, setRankingsByPlatform] = useState({});
  const { isDesktop } = useMediaQuery();
  const { user, loading: authLoading, recoveryMode } = useAuth();
  // Arena visibility (TASK-310): the Arena is public once arena_config.beta_mode
  // flips false; during the private beta (ADR-015) it stays limited to allowlisted
  // accounts. Tracking beta_mode here means the public launch needs no frontend
  // redeploy — the tab/route appear the instant the flag flips. Convenience gate
  // only; the server (Edge Functions + RLS) is the real boundary. Fails closed
  // (hidden) until the flag is known.
  const [arenaBetaMode, setArenaBetaMode] = useState(true);
  const [arenaBetaLoaded, setArenaBetaLoaded] = useState(false);
  const arenaVisible = !arenaBetaMode || isArenaBetaUser(user?.email);
  const { tier, loading: subLoading, openPlanPicker } = useSubscription();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMessage, setAuthModalMessage] = useState('');
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [pendingUpgrade, setPendingUpgrade] = useState(false);
  const [isUsingDemoData, setIsUsingDemoData] = useState(false);
  const [rosterNavContext, setRosterNavContext] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const toggleHelp = useCallback(() => setHelpOpen(h => !h), []);
  const openAuthModal = useCallback((message) => {
    setAuthModalMessage(message || '');
    setShowAuthModal(true);
  }, []);

  const navigateToRosters = useCallback((context) => {
    setRosterNavContext(context);
    navigate(TAB_PATHS.rosters);
    trackEvent('tab_viewed', { tab: 'rosters' });
  }, [navigate]);

  const handleSelectTab = useCallback((key) => {
    if (key === 'rosters') setRosterNavContext(null);
    navigate(TAB_PATHS[key]);
    setHelpOpen(false);
    trackEvent('tab_viewed', { tab: key });
  }, [navigate]);

  const handleOpenBlog = useCallback(() => {
    trackEvent('blog_opened', { from: 'nav' });
    navigate('/blog');
  }, [navigate]);

  useEffect(() => {
    if (authLoading) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading]);

  // Parse bundled weekly actuals once — independent of auth state.
  const [weeklyActuals, setWeeklyActuals] = useState(null);
  useEffect(() => {
    const entries = Object.entries(actualsModules);
    if (entries.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ parseCSVText }, { parseActualsFiles }] = await Promise.all([
          import('./utils/csv'),
          import('./utils/advanceModel'),
        ]);
        const files = await Promise.all(entries.map(async ([filePath, raw]) => ({
          filename: filePath.split('/').pop(),
          rows: await parseCSVText(String(raw)),
        })));
        if (!cancelled) setWeeklyActuals(parseActualsFiles(files));
      } catch (err) {
        console.error('Weekly actuals failed to parse', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Pre-warm the Roster Viewer's slow columns (captured boards → pod-exact
  // Adv %, real-draft combo tables → Early Combo %) as soon as roster data is
  // loaded, so opening the Rosters tab renders them instantly. Fire-and-forget
  // into module-level caches shared with the tab; dynamically imported so the
  // model code stays out of the main bundle. Demo mode synthesizes its own
  // boards inside the tab and skips this entirely.
  useEffect(() => {
    if (!rosterData.length || isUsingDemoData) return;
    import('./utils/rosterPrewarm')
      .then(({ prewarmRosterModels }) => prewarmRosterModels({
        rosterData,
        masterPlayers,
        adpByPlatform,
        actuals: weeklyActuals,
      }))
      .catch(() => { /* best-effort */ });
  }, [rosterData, masterPlayers, adpByPlatform, weeklyActuals, isUsingDemoData]);

  // Load the Arena beta switch once (public launch = beta_mode false).
  useEffect(() => {
    let cancelled = false;
    getArenaBetaMode()
      .then((m) => { if (!cancelled) { setArenaBetaMode(m); setArenaBetaLoaded(true); } })
      .catch(() => { if (!cancelled) setArenaBetaLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  // Redirect away from /arena when it isn't visible to this viewer — but only once
  // the beta switch is known, so a public visitor deep-linking to /arena isn't
  // bounced during the initial config read.
  useEffect(() => {
    if (authLoading || !arenaBetaLoaded) return;
    if (activeTab === 'arena' && !arenaVisible) navigate(TAB_PATHS.dashboard, { replace: true });
  }, [activeTab, arenaVisible, arenaBetaLoaded, authLoading, navigate]);

  useEffect(() => {
    if (recoveryMode) setShowAuthModal(true);
  }, [recoveryMode]);

  // TASK-231: arriving from the extension's "Upgrade to Pro" link (?upgrade=1).
  // Strip the param so refresh/back doesn't re-trigger. If the user is signed
  // in, open the PlanPicker immediately; if not, gate it behind the AuthModal
  // and complete the hand-off once auth resolves.
  useEffect(() => {
    if (authLoading) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('upgrade') !== '1') return;
    params.delete('upgrade');
    const next = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (next ? `?${next}` : ''));
    if (user) {
      openPlanPicker();
    } else {
      setPendingUpgrade(true);
      setAuthModalMessage('Create an account or sign in to subscribe.');
      setShowAuthModal(true);
    }
  }, [authLoading, user, openPlanPicker]);

  // Complete the deferred upgrade once the user has authenticated.
  useEffect(() => {
    if (!pendingUpgrade || !user || subLoading) return;
    setPendingUpgrade(false);
    setShowAuthModal(false);
    setAuthModalMessage('');
    openPlanPicker();
  }, [pendingUpgrade, user, subLoading, openPlanPicker]);


  async function loadFromExtension() {
    const { readExtensionEntries, convertEntriesToRosterRows } = await import('./utils/extensionBridge');
    const entries = await readExtensionEntries(user.id);
    if (entries.length === 0) return false;
    const rosterRows = convertEntriesToRosterRows(entries);
    const adpFiles = await loadBundledAdp();
    const projectionsRaw = Object.values(projectionsModules)[0];
    const result = await processLoadedData({
      rosterRows,
      adpFiles,
      projectionsText: projectionsRaw ? String(projectionsRaw) : undefined,
    });
    applyResult(result);
    setIsUsingDemoData(false);
    trackEvent('extension_sync_loaded', { count: entries.length });
    return true;
  }

  async function handleDeleteRoster(entryId) {
    // Only authenticated, non-demo sessions have real rows in extension_entries.
    if (!user?.id || !supabase || isUsingDemoData) return;
    const { deleteExtensionEntry } = await import('./utils/extensionBridge');
    await deleteExtensionEntry(user.id, entryId);
    // Optimistically drop every row for this entry from the in-memory portfolio.
    setRosterData(prev => prev.filter(r => r.entry_id !== entryId));
    trackEvent('roster_deleted');
  }

  async function loadPerPlatformRankings(userId) {
    const { parseCSVText } = await import('./utils/csv');
    const platforms = ['underdog', 'draftkings'];
    const rankingsMap = {};
    for (const p of platforms) {
      let file = await syncGetFile(`rankings_${p}`, userId);
      // One-time legacy fallback: migrate 'rankings' → rankings_underdog for existing users
      if (!file && p === 'underdog') {
        file = await syncGetFile('rankings', userId);
      }
      if (file) {
        rankingsMap[p] = await parseCSVText(file.text);
      }
    }
    setRankingsByPlatform(rankingsMap);
  }

  async function loadData() {
    setStatus({ type: 'loading', msg: 'Loading data...' });
    try {
      if (user?.id && supabase) {
        // Authenticated: extension is the only roster data source
        const loaded = await loadFromExtension();
        if (!loaded) {
          // No extension entries yet — load ADP data so Tracker/Rankings/Exposures still work,
          // but keep rosterData empty so the empty-state CTA shows on Dashboard/Rosters.
          const adpFiles = await loadBundledAdp();
          const projectionsRaw = Object.values(projectionsModules)[0];
          const result = await processLoadedData({
            adpFiles,
            projectionsText: projectionsRaw ? String(projectionsRaw) : undefined,
          });
          setAdpSnapshots(result.adpSnapshots);
          setAdpByPlatform(result.adpByPlatform || {});
          setMasterPlayers(result.masterPlayers);
          setRosterData([]);
          setIsUsingDemoData(false);
        }
        // Restore per-platform saved rankings from Supabase
        await loadPerPlatformRankings(user.id);
        setStatus({ type: '', msg: '' });
      } else {
        // Unauthenticated: still load bundled ADP + projections so the public Arena
        // can compute Team CLV / Proj points for guests. rosterData stays empty, so
        // the landing page still gates the non-Arena tabs (Arena is exempt).
        const adpFiles = await loadBundledAdp();
        const projectionsRaw = Object.values(projectionsModules)[0];
        const result = await processLoadedData({
          adpFiles,
          projectionsText: projectionsRaw ? String(projectionsRaw) : undefined,
        });
        setAdpSnapshots(result.adpSnapshots);
        setAdpByPlatform(result.adpByPlatform || {});
        setMasterPlayers(result.masterPlayers);
        setStatus({ type: '', msg: '' });
      }
    } catch (err) {
      console.error('Load failed', err);
      setStatus({ type: 'error', msg: String(err) });
    }
  }

  async function loadFromAssets({ forceDemo = false } = {}) {
    // Use demo rosters when explicitly requested (Try Demo button)
    const useDemo = forceDemo;
    const rosterRaw = useDemo
      ? Object.values(demoRosterModules)[0]
      : Object.values(rosterModules)[0];
    const adpFiles = await loadBundledAdp();
    const rankingsRaw = Object.values(rankingsModules)[0];
    const projectionsRaw = Object.values(projectionsModules)[0];

    if (!rosterRaw && adpFiles.length === 0) {
      setStatus({ type: '', msg: '' });
      return;
    }

    const result = await processLoadedData({
      rosterText: rosterRaw ? String(rosterRaw) : undefined,
      adpFiles,
      rankingsText: rankingsRaw ? String(rankingsRaw) : undefined,
      projectionsText: projectionsRaw ? String(projectionsRaw) : undefined,
    });

    applyResult(result);
    // Demo mode: seed rankings from bundled rankings.csv (underdog slot as default)
    if (result.rankingsSource?.length > 0) {
      setRankingsByPlatform({ underdog: result.rankingsSource });
    }
    setIsUsingDemoData(true);
  }

  function applyResult(result) {
    setRosterData(result.rosterData);
    setMasterPlayers(result.masterPlayers);
    setAdpSnapshots(result.adpSnapshots);
    setAdpByPlatform(result.adpByPlatform || {});
    setStatus({ type: '', msg: '' });
    if (result.adpSnapshots?.length > 0) trackEvent('adp_snapshot_loaded');
  }

  const handleRankingsUpload = useCallback(async (text, filename, platform = 'underdog') => {
    setStatus({ type: 'loading', msg: 'Processing rankings...' });
    try {
      const storageId = `rankings_${platform}`;
      await syncSaveFile({ id: storageId, type: 'rankings', filename, text, userId: user?.id });
      const rankingsFile = await syncGetFile(storageId, user?.id);
      if (rankingsFile) {
        const rows = await import('./utils/csv').then(m => m.parseCSVText(rankingsFile.text));
        setRankingsByPlatform(prev => ({ ...prev, [platform]: rows }));
      }
      setStatus({ type: '', msg: '' });
    } catch (err) {
      console.error('Rankings upload failed', err);
      setStatus({ type: 'error', msg: String(err) });
    }
  }, [user?.id]);

  // Auth guard for rankings upload — blocks guests and shows auth modal
  const uploadAuthGuard = useCallback(() => {
    if (user) return true;
    openAuthModal('Sign in or create an account to upload custom rankings.');
    return false;
  }, [user, openAuthModal]);

  // Load bundled demo data on demand (triggered from landing page "Try Demo")
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loadDemoData = useCallback(() => { loadFromAssets({ forceDemo: true }); }, []);

  // Standalone /mobile/checkout-return — public, no auth gate, no tab chrome.
  // Stripe success/cancel/portal-return target for the iOS app (ADR-027);
  // deep-links straight back into the app.
  if (location.pathname === '/mobile/checkout-return') {
    return (
      <Suspense fallback={null}>
        <MobileCheckoutReturn />
      </Suspense>
    );
  }

  // Standalone /unsubscribe — public, no auth gate, no tab chrome (email link target)
  if (location.pathname === '/unsubscribe') {
    return (
      <Suspense fallback={null}>
        <Unsubscribe />
      </Suspense>
    );
  }

  // Standalone /blog and /blog/:slug — public, no auth gate, no app chrome.
  // The newest published issue is free to all; older issues are Pro-gated.
  if (location.pathname === '/blog' || location.pathname.startsWith('/blog/')) {
    const rawSlug = location.pathname.startsWith('/blog/')
      ? decodeURIComponent(location.pathname.slice('/blog/'.length).replace(/\/+$/, ''))
      : '';
    return (
      <Suspense fallback={null}>
        <BlogChrome>
          {rawSlug ? <BlogPost slug={rawSlug} /> : <BlogIndex />}
        </BlogChrome>
        <Analytics />
        <SpeedInsights />
      </Suspense>
    );
  }

  // Standalone /install — public, no auth gate, no tab chrome
  if (location.pathname === '/install') {
    return (
      <Suspense fallback={null}>
        <InstallPage />
        <Analytics />
        <SpeedInsights />
      </Suspense>
    );
  }

  // Show landing page for unauthenticated guests with no data — Arena is a
  // no-login-required public area, so it's exempt from this redirect.
  const showLanding = tier === 'guest' && rosterData.length === 0 && !isUsingDemoData && !authLoading && !subLoading && activeTab !== 'arena';

  if (showLanding) {
    return (
      <Suspense fallback={null}>
        <LandingPage onSignUp={() => setShowAuthModal(true)} onTryDemo={loadDemoData} />
        <AuthModal isOpen={showAuthModal} onClose={() => { setShowAuthModal(false); setAuthModalMessage(''); }} message={authModalMessage} />
        <Analytics />
        <SpeedInsights />
      </Suspense>
    );
  }

  // Resolved nav model shared by SideNav (desktop rail) and MobileNav (dock + sheet)
  const tabByKey = Object.fromEntries(tabs.map(t => [t.key, t]));
  const navGroups = NAV_GROUPS.map(g => ({
    label: g.label,
    items: g.keys
      .filter(k => k !== 'arena' || arenaVisible)
      .map(k => ({ ...tabByKey[k], locked: !subLoading && !canAccessFeature(tier, k) })),
  })).filter(g => g.items.length > 0);

  const xLink = (
    <a
      href="https://x.com/BBExposures"
      target="_blank"
      rel="noopener noreferrer"
      className="toolbar-btn toolbar-btn--ghost x-link"
      aria-label="Follow @BBExposures on X"
      title="Follow @BBExposures on X"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    </a>
  );

  const settingsButton = user && supabase && (
    <button
      className="toolbar-btn toolbar-btn--ghost icon-btn"
      onClick={() => setShowAccountSettings(true)}
      aria-label="Account settings"
    >
      <Settings size={17} />
    </button>
  );

  // Desktop rail footer — account + secondary actions
  const accountCluster = (
    <div className="side-account">
      <InstallExtensionButton showButton={!!(user && supabase)} />
      <div className="side-account-row">
        {xLink}
        <FeedbackButton />
        {settingsButton}
      </div>
      <AuthButton />
    </div>
  );

  // Mobile sheet footer — same actions, stacked
  const sheetAccountCluster = (
    <div className="sheet-account">
      <InstallExtensionButton showButton={!!(user && supabase)} />
      <div className="side-account-row">
        {xLink}
        <FeedbackButton />
      </div>
    </div>
  );

  return (
    <div className="app-shell">
      {isDesktop && (
        <SideNav
          groups={navGroups}
          activeTab={activeTab}
          onSelect={handleSelectTab}
          helpOpen={helpOpen}
          onToggleHelp={toggleHelp}
          onOpenBlog={handleOpenBlog}
          footer={accountCluster}
        />
      )}
      <div className="app-main">
        {!isDesktop && (
          <MobileNav
            groups={navGroups}
            activeTab={activeTab}
            onSelect={handleSelectTab}
            helpOpen={helpOpen}
            onToggleHelp={toggleHelp}
            onOpenBlog={handleOpenBlog}
            topActions={<>{settingsButton}<AuthButton /></>}
            sheetActions={sheetAccountCluster}
          />
        )}

        {status.msg && (
          <div className="status-strip">
            <strong>{status.type.toUpperCase()}</strong>: {status.msg}
          </div>
        )}

        <BetaBanner />

        {isUsingDemoData && rosterData.length > 0 && (
          <div className="demo-banner">
            <Info size={16} />
            <span>You're viewing sample data. Sign in and connect the <a href="/install" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Chrome extension</a> to load your portfolio.</span>
          </div>
        )}

        <div className="app-content">
          <Suspense fallback={<div style={{ padding: '2.5rem', textAlign: 'center' }}>Loading tab...</div>}>
            {activeTab === 'dashboard' && <Dashboard rosterData={rosterData} masterPlayers={masterPlayers} adpSnapshots={adpSnapshots} onNavigate={(key) => navigate(TAB_PATHS[key])} onNavigateToRosters={navigateToRosters} helpOpen={helpOpen} onHelpToggle={toggleHelp} />}
            {activeTab === 'exposures' && <ExposureTable masterPlayers={masterPlayers} rosterData={rosterData} adpByPlatform={adpByPlatform} actuals={weeklyActuals} demoMode={isUsingDemoData} onNavigateToRosters={navigateToRosters} helpOpen={helpOpen} onHelpToggle={toggleHelp} />}
            {activeTab === 'draftflow' && (
              canAccessFeature(tier, 'draftflow') || subLoading
                ? <DraftFlowAnalysis rosterData={rosterData} masterPlayers={masterPlayers} helpOpen={helpOpen} onHelpToggle={toggleHelp} />
                : <LockedFeature featureName="Draft Assistant" onSignUp={() => setShowAuthModal(true)} />
            )}
            {activeTab === 'rosters' && (
              canAccessFeature(tier, 'rosters') || subLoading
                ? <RosterViewer rosterData={rosterData} masterPlayers={masterPlayers} adpByPlatform={adpByPlatform} actuals={weeklyActuals} initialFilter={rosterNavContext} helpOpen={helpOpen} onHelpToggle={toggleHelp} demoMode={isUsingDemoData} onDeleteRoster={user?.id && !isUsingDemoData ? handleDeleteRoster : undefined} />
                : <LockedFeature featureName="Roster Viewer" onSignUp={() => setShowAuthModal(true)} />
            )}
            {activeTab === 'rankings' && (
              canAccessFeature(tier, 'rankings') || subLoading
                ? <PlayerRankings rankingsByPlatform={rankingsByPlatform} masterPlayers={masterPlayers} adpByPlatform={adpByPlatform} onRankingsUpload={handleRankingsUpload} uploadAuthGuard={uploadAuthGuard} helpOpen={helpOpen} onHelpToggle={toggleHelp} />
                : <LockedFeature featureName="Player Rankings" onSignUp={() => setShowAuthModal(true)} />
            )}
            {activeTab === 'timeseries' && (
              canAccessFeature(tier, 'timeseries') || subLoading
                ? <AdpTimeSeries
                    adpSnapshots={adpSnapshots}
                    adpByPlatform={adpByPlatform}
                    masterPlayers={masterPlayers}
                    teams={12}
                    rosterData={rosterData}
                    onNavigateToRosters={navigateToRosters}
                    helpOpen={helpOpen}
                    onHelpToggle={toggleHelp}
                  />
                : <LockedFeature featureName="ADP Tracker" onSignUp={() => setShowAuthModal(true)} />
            )}
            {activeTab === 'combo' && (
              canAccessFeature(tier, 'combo') || subLoading
                ? <ComboAnalysis rosterData={rosterData} masterPlayers={masterPlayers} onNavigateToRosters={navigateToRosters} helpOpen={helpOpen} onHelpToggle={toggleHelp} />
                : <LockedFeature featureName="Combo Analysis" onSignUp={() => setShowAuthModal(true)} />
            )}
            {/* Arena visibility tracks arena_config.beta_mode (TASK-310): allowlisted-only
                during the private beta, everyone once public. Server is the real boundary. */}
            {activeTab === 'arena' && arenaVisible && <Arena rosterData={rosterData} masterPlayers={masterPlayers} adpByPlatform={adpByPlatform} helpOpen={helpOpen} onHelpToggle={toggleHelp} />}
          </Suspense>
        </div>
      </div>
      <AuthModal isOpen={showAuthModal} onClose={() => { setShowAuthModal(false); setAuthModalMessage(''); }} message={authModalMessage} />
      <AccountSettings isOpen={showAccountSettings} onClose={() => setShowAccountSettings(false)} />
      <PlanPicker />
      <Analytics />
      <SpeedInsights />
    </div>
  );
}
