// PortfolioContext — mobile port of the data-bootstrap logic in the web App.jsx.
// Authenticated users load rosters synced by the Chrome extension (Supabase
// extension_entries); guests can load bundled demo data. Bundled ADP snapshots +
// projections always load so ADP Tracker / Rankings / Arena work without rosters.
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { processLoadedData } from '../../shared/utils/dataLoader';
import { syncGetFile } from '../../shared/utils/storage';
import { parseCSVText } from '../../shared/utils/csv';
import { supabase } from '../../shared/utils/supabaseClient';
import { trackEvent } from '../../shared/utils/analytics';
import {
  loadBundledAdp, getProjectionsRows, getRankingsRows, getDemoRosterRows, getActualsFiles,
} from '../../shared/bundledData';
import { useAuth } from './AuthContext';

const PortfolioContext = createContext(null);

export function PortfolioProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [rosterData, setRosterData] = useState([]);
  const [masterPlayers, setMasterPlayers] = useState([]);
  const [adpSnapshots, setAdpSnapshots] = useState([]);
  const [adpByPlatform, setAdpByPlatform] = useState({});
  const [rankingsByPlatform, setRankingsByPlatform] = useState({});
  const [status, setStatus] = useState({ type: 'loading', msg: 'Loading data...' });
  const [isUsingDemoData, setIsUsingDemoData] = useState(false);
  const [weeklyActuals, setWeeklyActuals] = useState(null);
  // Cross-tab "See rosters" hand-off (web: navigateToRosters + initialFilter).
  // A screen sets the context then routes to /portfolio; the Rosters view
  // consumes and clears it.
  const [rosterNavContext, setRosterNavContext] = useState(null);

  // Parse bundled weekly actuals once — independent of auth state.
  useEffect(() => {
    const files = getActualsFiles();
    if (!files.length) return;
    let cancelled = false;
    (async () => {
      try {
        const { parseActualsFiles } = await import('../../shared/utils/advanceModel');
        if (!cancelled) setWeeklyActuals(parseActualsFiles(files));
      } catch (err) {
        console.error('Weekly actuals failed to parse', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const applyResult = useCallback((result) => {
    setRosterData(result.rosterData);
    setMasterPlayers(result.masterPlayers);
    setAdpSnapshots(result.adpSnapshots);
    setAdpByPlatform(result.adpByPlatform || {});
    setStatus({ type: '', msg: '' });
  }, []);

  const loadPerPlatformRankings = useCallback(async (userId) => {
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
  }, []);

  const loadData = useCallback(async () => {
    setStatus({ type: 'loading', msg: 'Loading data...' });
    try {
      const adpFiles = loadBundledAdp();
      const projectionsRows = getProjectionsRows();

      if (user?.id && supabase) {
        // Authenticated: the Chrome extension is the only roster data source.
        const { readExtensionEntries, convertEntriesToRosterRows } = await import('../../shared/utils/extensionBridge');
        const entries = await readExtensionEntries(user.id);
        if (entries.length > 0) {
          const rosterRows = convertEntriesToRosterRows(entries);
          const result = await processLoadedData({ rosterRows, adpFiles, projectionsRows });
          applyResult(result);
          setIsUsingDemoData(false);
          trackEvent('extension_sync_loaded', { count: entries.length });
        } else {
          // No extension entries yet — ADP data still loads so Tracker/Rankings/
          // Exposures work; rosterData stays empty so empty-state CTAs show.
          const result = await processLoadedData({ adpFiles, projectionsRows });
          setAdpSnapshots(result.adpSnapshots);
          setAdpByPlatform(result.adpByPlatform || {});
          setMasterPlayers(result.masterPlayers);
          setRosterData([]);
          setIsUsingDemoData(false);
          setStatus({ type: '', msg: '' });
        }
        await loadPerPlatformRankings(user.id);
        setStatus({ type: '', msg: '' });
      } else {
        // Guest: bundled ADP + projections only (public Arena needs them too).
        const result = await processLoadedData({ adpFiles, projectionsRows });
        setAdpSnapshots(result.adpSnapshots);
        setAdpByPlatform(result.adpByPlatform || {});
        setMasterPlayers(result.masterPlayers);
        setStatus({ type: '', msg: '' });
      }
    } catch (err) {
      console.error('Load failed', err);
      setStatus({ type: 'error', msg: String(err) });
    }
  }, [user?.id, applyResult, loadPerPlatformRankings]);

  useEffect(() => {
    if (authLoading) return;
    loadData();
  }, [user?.id, authLoading, loadData]);

  // Load bundled demo data on demand ("Try Demo").
  const loadDemoData = useCallback(async () => {
    setStatus({ type: 'loading', msg: 'Loading demo...' });
    try {
      const result = await processLoadedData({
        rosterCsvRows: getDemoRosterRows(),
        adpFiles: loadBundledAdp(),
        rankingsRows: getRankingsRows(),
        projectionsRows: getProjectionsRows(),
      });
      applyResult(result);
      if (result.rankingsSource?.length > 0) {
        setRankingsByPlatform({ underdog: result.rankingsSource });
      }
      setIsUsingDemoData(true);
      trackEvent('demo_loaded');
    } catch (err) {
      console.error('Demo load failed', err);
      setStatus({ type: 'error', msg: String(err) });
    }
  }, [applyResult]);

  const exitDemo = useCallback(() => {
    setIsUsingDemoData(false);
    loadData();
  }, [loadData]);

  const deleteRoster = useCallback(async (entryId) => {
    // Only authenticated, non-demo sessions have real rows in extension_entries.
    if (!user?.id || !supabase || isUsingDemoData) return;
    const { deleteExtensionEntry } = await import('../../shared/utils/extensionBridge');
    await deleteExtensionEntry(user.id, entryId);
    setRosterData(prev => prev.filter(r => r.entry_id !== entryId));
    trackEvent('roster_deleted');
  }, [user?.id, isUsingDemoData]);

  // Pre-warm the Roster Viewer's slow columns (captured boards → pod-exact Adv %,
  // real-draft combo tables → Early Combo %) once roster data is loaded.
  useEffect(() => {
    if (!rosterData.length || isUsingDemoData) return;
    import('../../shared/utils/rosterPrewarm')
      .then(({ prewarmRosterModels }) => prewarmRosterModels({
        rosterData,
        masterPlayers,
        adpByPlatform,
        actuals: weeklyActuals,
      }))
      .catch(() => { /* best-effort */ });
  }, [rosterData, masterPlayers, adpByPlatform, weeklyActuals, isUsingDemoData]);

  const value = useMemo(() => ({
    rosterData,
    masterPlayers,
    adpSnapshots,
    adpByPlatform,
    rankingsByPlatform,
    setRankingsByPlatform,
    weeklyActuals,
    status,
    isUsingDemoData,
    loadDemoData,
    exitDemo,
    reload: loadData,
    deleteRoster,
    rosterNavContext,
    setRosterNavContext,
  }), [rosterData, masterPlayers, adpSnapshots, adpByPlatform, rankingsByPlatform,
       weeklyActuals, status, isUsingDemoData, loadDemoData, exitDemo, loadData, deleteRoster,
       rosterNavContext]);

  return (
    <PortfolioContext.Provider value={value}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (ctx === null) throw new Error('usePortfolio must be used within PortfolioProvider');
  return ctx;
}
