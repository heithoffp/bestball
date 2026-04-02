// src/App.jsx
import React, { useEffect, useState, Suspense, lazy, useCallback } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { processLoadedData } from './utils/dataLoader';
import { syncSaveFile, syncGetFile } from './utils/storage';
import { useAuth } from './contexts/AuthContext';
import { supabase } from './utils/supabaseClient';
import { useSubscription } from './contexts/SubscriptionContext';
import { canAccessFeature } from './utils/featureAccess';
import AuthButton from './components/AuthButton';
import LockedFeature from './components/LockedFeature';
import AuthModal from './components/AuthModal';
import AccountSettings from './components/AccountSettings';
import BetaBanner from './components/BetaBanner';
import PlanPicker from './components/PlanPicker';
import useMediaQuery from './hooks/useMediaQuery';
import { trackEvent } from './utils/analytics';
import { LayoutDashboard, BarChart3, Users, TrendingUp, ListOrdered, Crosshair, HelpCircle, Lock, Info, Settings, Network } from 'lucide-react';

const tabs = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'exposures', label: 'Exposures', icon: BarChart3 },
  { key: 'rosters', label: 'Rosters', icon: Users },
  { key: 'timeseries', label: 'ADP Tracker', icon: TrendingUp },
  { key: 'rankings', label: 'Rankings', icon: ListOrdered },
  { key: 'draftflow', label: 'Draft Asst', icon: Crosshair },
  { key: 'combo', label: 'Combos', icon: Network },
  { key: 'help', label: 'Help', icon: HelpCircle },
];

// Lazy-loaded tab components (P2: code splitting)
const ExposureTable = lazy(() => import('./components/ExposureTable'));
const AdpTimeSeries = lazy(() => import('./components/AdpTimeSeries'));
const DraftFlowAnalysis = lazy(() => import('./components/DraftFlowAnalysis'));
const RosterViewer = lazy(() => import('./components/RosterViewer'));
const PlayerRankings = lazy(() => import('./components/PlayerRankings'));
const HelpGuide = lazy(() => import('./components/HelpGuide'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const ComboAnalysis = lazy(() => import('./components/ComboAnalysis'));
// DISABLED for performance — keep source file intact
// const RosterConstruction = lazy(() => import('./components/RosterConstruction'));

// Bundled assets (developer-controlled) — all use glob so missing files don't break the build
const rosterModules = import.meta.glob('./assets/rosters.csv', { as: 'raw', eager: true });
const adpModules = import.meta.glob('./assets/adp/*.csv', { as: 'raw' });
const projectionsModules = import.meta.glob('./assets/projections.csv', { as: 'raw', eager: true });
const rankingsModules = import.meta.glob('./assets/rankings.csv', { as: 'raw', eager: true });

async function loadBundledAdp() {
  const adpEntries = Object.entries(adpModules);
  if (adpEntries.length === 0) return [];
  const files = await Promise.all(adpEntries.map(async ([filePath, resolver]) => {
    const text = await resolver();
    const parts = filePath.split('/');
    const fileName = parts[parts.length - 1];
    const dateMatch = fileName.match(/(\d{4}-\d{2}-\d{2})/);
    const dateStr = dateMatch ? dateMatch[1] : fileName;
    return { text: String(text), date: dateStr, filename: fileName };
  }));
  return files;
}

export default function App() {
  const [rosterData, setRosterData] = useState([]);
  const [masterPlayers, setMasterPlayers] = useState([]);
  const [adpSnapshots, setAdpSnapshots] = useState([]);
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [activeTab, setActiveTab] = useState('dashboard');
  const [rankingsSource, setRankingsSource] = useState([]);
  const { isMobile } = useMediaQuery();
  const { user, loading: authLoading, recoveryMode } = useAuth();
  const { tier, loading: subLoading } = useSubscription();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMessage, setAuthModalMessage] = useState('');
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [isUsingDemoData, setIsUsingDemoData] = useState(false);
  const openAuthModal = useCallback((message) => {
    setAuthModalMessage(message || '');
    setShowAuthModal(true);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading]);

  useEffect(() => {
    if (recoveryMode) setShowAuthModal(true);
  }, [recoveryMode]);


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
          setMasterPlayers(result.masterPlayers);
          setRankingsSource(result.rankingsSource);
          setRosterData([]);
          setIsUsingDemoData(false);
        }
        setStatus({ type: '', msg: '' });
      } else {
        // Unauthenticated: read-only demo preview
        await loadFromAssets();
      }
    } catch (err) {
      console.error('Load failed', err);
      setStatus({ type: 'error', msg: String(err) });
    }
  }

  async function loadFromAssets() {
    const rosterRaw = Object.values(rosterModules)[0];
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
    setIsUsingDemoData(true);
  }

  function applyResult(result) {
    setRosterData(result.rosterData);
    setMasterPlayers(result.masterPlayers);
    setAdpSnapshots(result.adpSnapshots);
    setRankingsSource(result.rankingsSource);
    setStatus({ type: '', msg: '' });
    if (result.adpSnapshots?.length > 0) trackEvent('adp_snapshot_loaded');
  }

  const handleRankingsUpload = useCallback(async (text, filename) => {
    setStatus({ type: 'loading', msg: 'Processing rankings...' });
    try {
      await syncSaveFile({ id: 'rankings', type: 'rankings', filename, text, userId: user?.id });
      const rankingsFile = await syncGetFile('rankings', user?.id);
      if (rankingsFile) setRankingsSource(await import('./utils/csv').then(m => m.parseCSVText(rankingsFile.text)));
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

  return (
    <div className="app-container">
      <div className="app-header">
        <h1>{isMobile ? 'BB EXPOSURES' : 'BEST BALL EXPOSURES'}</h1>
        <div className="auth-button-group">
          {user && supabase && (
            <button
              className="toolbar-btn"
              onClick={() => setShowAccountSettings(true)}
              aria-label="Account settings"
              style={{ display: 'flex', alignItems: 'center', padding: '0.4rem' }}
            >
              <Settings size={18} />
            </button>
          )}
          <AuthButton />
        </div>
      </div>

      {status.msg && (
        <div className={`card`} style={{ flex: 'none' }}>
          <strong>{status.type.toUpperCase()}</strong>: {status.msg}
        </div>
      )}

      <BetaBanner />
      <div className="card">
        <div className="tab-bar">
          {tabs.map(({ key, label, icon: Icon }) => {
            const locked = !subLoading && !canAccessFeature(tier, key);
            return (
              <button
                key={key}
                className={`tab-button${activeTab === key ? ' active' : ''}${locked ? ' locked' : ''}`}
                onClick={() => { setActiveTab(key); trackEvent('tab_viewed', { tab: key }); }}
              >
                {isMobile ? (
                  <>
                    <Icon className="tab-icon" size={20} />
                    <span>{label}</span>
                    {locked && <Lock size={12} style={{ marginLeft: 2, opacity: 0.5 }} />}
                  </>
                ) : (
                  <>
                    {label}
                    {locked && <Lock size={12} style={{ marginLeft: 4, opacity: 0.5 }} />}
                  </>
                )}
              </button>
            );
          })}
        </div>

        {isUsingDemoData && rosterData.length > 0 && (
          <div className="demo-banner">
            <Info size={16} />
            <span>You're viewing sample data. Sign in and connect the Chrome extension to load your portfolio.</span>
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Suspense fallback={<div style={{ padding: '2.5rem', textAlign: 'center' }}>Loading tab...</div>}>
            {activeTab === 'dashboard' && <Dashboard rosterData={rosterData} masterPlayers={masterPlayers} adpSnapshots={adpSnapshots} onNavigate={setActiveTab} />}
            {activeTab === 'exposures' && <ExposureTable masterPlayers={masterPlayers} rosterData={rosterData} />}
            {activeTab === 'draftflow' && (
              canAccessFeature(tier, 'draftflow') || subLoading
                ? <DraftFlowAnalysis rosterData={rosterData} masterPlayers={masterPlayers} />
                : <LockedFeature featureName="Draft Assistant" onSignUp={() => setShowAuthModal(true)} />
            )}
            {activeTab === 'rosters' && (
              canAccessFeature(tier, 'rosters') || subLoading
                ? <RosterViewer rosterData={rosterData} />
                : <LockedFeature featureName="Roster Viewer" onSignUp={() => setShowAuthModal(true)} />
            )}
            {activeTab === 'rankings' && (
              canAccessFeature(tier, 'rankings') || subLoading
                ? <PlayerRankings initialPlayers={rankingsSource} masterPlayers={masterPlayers} onRankingsUpload={handleRankingsUpload} uploadAuthGuard={uploadAuthGuard} />
                : <LockedFeature featureName="Player Rankings" onSignUp={() => setShowAuthModal(true)} />
            )}
            {activeTab === 'timeseries' && (
              <AdpTimeSeries
                adpSnapshots={adpSnapshots}
                masterPlayers={masterPlayers}
                teams={12}
                rosterData={rosterData}
              />
            )}
            {activeTab === 'combo' && <ComboAnalysis rosterData={rosterData} />}
            {activeTab === 'help' && <HelpGuide />}
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
