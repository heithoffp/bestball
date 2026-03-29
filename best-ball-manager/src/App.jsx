// src/App.jsx
import React, { useEffect, useState, Suspense, lazy, useCallback } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { processLoadedData } from './utils/dataLoader';
import { saveFile, getFile, hasUserData, syncSaveFile, syncGetFile, syncHasUserData } from './utils/storage';
import { useAuth } from './contexts/AuthContext';
import { supabase } from './utils/supabaseClient';
import { useSubscription } from './contexts/SubscriptionContext';
import { canAccessFeature } from './utils/featureAccess';
import AuthButton from './components/AuthButton';
import LockedFeature from './components/LockedFeature';
import AuthModal from './components/AuthModal';
import AccountSettings from './components/AccountSettings';
import BetaBanner from './components/BetaBanner';
import useMediaQuery from './hooks/useMediaQuery';
import { LayoutDashboard, BarChart3, Users, TrendingUp, ListOrdered, Crosshair, HelpCircle, Lock, Info, Settings } from 'lucide-react';

const tabs = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'exposures', label: 'Exposures', icon: BarChart3 },
  { key: 'rosters', label: 'Rosters', icon: Users },
  { key: 'timeseries', label: 'ADP Tracker', icon: TrendingUp },
  { key: 'rankings', label: 'Rankings', icon: ListOrdered },
  { key: 'draftflow', label: 'Draft Asst', icon: Crosshair },
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
// DISABLED for performance — keep source files intact
// const ComboAnalysis = lazy(() => import('./components/ComboAnalysis'));
// const RosterConstruction = lazy(() => import('./components/RosterConstruction'));
// const JaccardAnalysis = lazy(() => import('./components/JaccardAnalysis'));

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
  const { user, loading: authLoading } = useAuth();
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
  }, [user?.id, authLoading]);

  // One-time migration: push local IndexedDB data to cloud on first sign-in
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const hasLocal = await hasUserData();
        if (!hasLocal) return;
        const { cloudHasUserData } = await import('./utils/cloudStorage');
        const hasCloud = await cloudHasUserData(user.id);
        if (hasCloud) return;
        const rosterFile = await getFile('roster');
        if (rosterFile) await syncSaveFile({ ...rosterFile, userId: user.id });
        const rankingsFile = await getFile('rankings');
        if (rankingsFile) await syncSaveFile({ ...rankingsFile, userId: user.id });
      } catch (e) {
        console.warn('Migration to cloud failed', e);
      }
    })();
  }, [user?.id]);

  async function loadData() {
    setStatus({ type: 'loading', msg: 'Loading data...' });
    try {
      if (await syncHasUserData(user?.id)) {
        await loadFromStorage();
      } else {
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
      // Nothing at all to load
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

  async function loadFromStorage() {
    const rosterFile = await syncGetFile('roster', user?.id);
    const rankingsFile = await syncGetFile('rankings', user?.id);

    if (!rosterFile) {
      await loadFromAssets();
      return;
    }

    // ADP + projections always come from bundled assets
    const adpFiles = await loadBundledAdp();
    const projectionsRaw = Object.values(projectionsModules)[0];

    const result = await processLoadedData({
      rosterText: rosterFile.text,
      adpFiles,
      rankingsText: rankingsFile ? rankingsFile.text : undefined,
      projectionsText: projectionsRaw ? String(projectionsRaw) : undefined,
    });

    applyResult(result);
    setIsUsingDemoData(false);
  }

  function applyResult(result) {
    setRosterData(result.rosterData);
    setMasterPlayers(result.masterPlayers);
    setAdpSnapshots(result.adpSnapshots);
    setRankingsSource(result.rankingsSource);
    setStatus({ type: '', msg: '' });
  }

  const handleRosterUpload = useCallback(async (text, filename) => {
    setStatus({ type: 'loading', msg: 'Processing exposure data...' });
    try {
      await syncSaveFile({ id: 'roster', type: 'roster', filename, text, userId: user?.id });
      await loadFromStorage();
    } catch (err) {
      console.error('Roster upload failed', err);
      setStatus({ type: 'error', msg: String(err) });
    }
  }, [user?.id]);

  const handleRankingsUpload = useCallback(async (text, filename) => {
    setStatus({ type: 'loading', msg: 'Processing rankings...' });
    try {
      await syncSaveFile({ id: 'rankings', type: 'rankings', filename, text, userId: user?.id });
      await loadFromStorage();
    } catch (err) {
      console.error('Rankings upload failed', err);
      setStatus({ type: 'error', msg: String(err) });
    }
  }, [user?.id]);

  // Auth guard for upload buttons — blocks file picker and shows auth modal for guests
  const uploadAuthGuard = useCallback(() => {
    if (user) return true;
    openAuthModal('Sign in or create an account to upload and save your data.');
    return false;
  }, [user, openAuthModal]);

  return (
    <div className="app-container">
      <div className="app-header">
        <h1>{isMobile ? 'BB MANAGER' : 'BEST BALL MANAGER'}</h1>
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
                onClick={() => setActiveTab(key)}
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
            <span>You're viewing sample data.</span>
            <label className="demo-banner-upload" onClick={(e) => { if (!uploadAuthGuard()) e.preventDefault(); }}>
              Upload your rosters
              <input type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => handleRosterUpload(ev.target.result, file.name);
                reader.readAsText(file);
                e.target.value = '';
              }} />
            </label>
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Suspense fallback={<div style={{ padding: '2.5rem', textAlign: 'center' }}>Loading tab...</div>}>
            {activeTab === 'dashboard' && <Dashboard rosterData={rosterData} masterPlayers={masterPlayers} adpSnapshots={adpSnapshots} onNavigate={setActiveTab} onRosterUpload={handleRosterUpload} uploadAuthGuard={uploadAuthGuard} />}
            {activeTab === 'exposures' && <ExposureTable masterPlayers={masterPlayers} rosterData={rosterData} onRosterUpload={handleRosterUpload} uploadAuthGuard={uploadAuthGuard} />}
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
            {activeTab === 'help' && <HelpGuide />}
          </Suspense>
        </div>
      </div>
      <AuthModal isOpen={showAuthModal} onClose={() => { setShowAuthModal(false); setAuthModalMessage(''); }} message={authModalMessage} />
      <AccountSettings isOpen={showAccountSettings} onClose={() => setShowAccountSettings(false)} />
      <Analytics />
      <SpeedInsights />
    </div>
  );
}
