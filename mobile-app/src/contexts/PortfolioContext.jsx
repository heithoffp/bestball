// PortfolioContext — mobile port of the data-bootstrap logic in the web App.jsx.
// Authenticated users load rosters synced by the Chrome extension (Supabase
// extension_entries); guests can load bundled demo data. Bundled ADP snapshots +
// projections always load so ADP Tracker / Rankings / Arena work without rosters.
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { processLoadedData } from '../../shared/utils/dataLoader';
import { syncGetFile, getFile } from '../../shared/utils/storage';
import { parseCSVText } from '../../shared/utils/csv';
import { supabase } from '../../shared/utils/supabaseClient';
import { trackEvent } from '../../shared/utils/analytics';
import {
  loadAdp, refreshAdpFiles, getProjectionsRows, getRankingsRows, getDemoRosterRows, getActualsFiles,
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

  // Latest entries applied to state — kept so deleteRoster and the background
  // refresh can rewrite the on-device cache without refetching (ADR-030).
  const entriesRef = useRef(null);
  // Bumped per loadData call; async continuations from a superseded load
  // (user switched, reload fired) check it and drop their results.
  const loadGeneration = useRef(0);

  const applyResult = useCallback((result) => {
    setRosterData(result.rosterData);
    setMasterPlayers(result.masterPlayers);
    setAdpSnapshots(result.adpSnapshots);
    setAdpByPlatform(result.adpByPlatform || {});
    setStatus({ type: '', msg: '' });
  }, []);

  const loadPerPlatformRankings = useCallback(async (userId) => {
    const platforms = ['underdog', 'draftkings'];

    // Local-first (ADR-030): render whatever copies are already on device,
    // then refresh from cloud in the background and re-set only on change.
    const localTexts = {};
    const localMap = {};
    for (const p of platforms) {
      let file = await getFile(`rankings_${p}`);
      if (!file && p === 'underdog') file = await getFile('rankings');
      if (file) {
        localTexts[p] = file.text;
        localMap[p] = await parseCSVText(file.text);
      }
    }
    if (Object.keys(localMap).length > 0) setRankingsByPlatform(localMap);

    const cloudTexts = {};
    const cloudMap = {};
    for (const p of platforms) {
      let file = await syncGetFile(`rankings_${p}`, userId);
      // One-time legacy fallback: migrate 'rankings' → rankings_underdog for existing users
      if (!file && p === 'underdog') {
        file = await syncGetFile('rankings', userId);
      }
      if (file) {
        cloudTexts[p] = file.text;
        cloudMap[p] = await parseCSVText(file.text);
      }
    }
    const changed = platforms.some(p => cloudTexts[p] !== localTexts[p]);
    if (changed || Object.keys(localMap).length === 0) setRankingsByPlatform(cloudMap);
  }, []);

  // Process a mapped entries array into app state. Empty portfolios still load
  // ADP data so Tracker/Rankings/Exposures work; rosterData stays empty so
  // empty-state CTAs show.
  const applyEntries = useCallback(async (entries, adpFiles, projectionsRows) => {
    if (entries.length > 0) {
      const { convertEntriesToRosterRows } = await import('../../shared/utils/extensionBridge');
      const rosterRows = convertEntriesToRosterRows(entries);
      const result = await processLoadedData({ rosterRows, adpFiles, projectionsRows });
      applyResult(result);
    } else {
      const result = await processLoadedData({ adpFiles, projectionsRows });
      setAdpSnapshots(result.adpSnapshots);
      setAdpByPlatform(result.adpByPlatform || {});
      setMasterPlayers(result.masterPlayers);
      setRosterData([]);
      setStatus({ type: '', msg: '' });
    }
    setIsUsingDemoData(false);
  }, [applyResult]);

  const loadData = useCallback(async ({ forceFull = false } = {}) => {
    const gen = ++loadGeneration.current;
    setStatus({ type: 'loading', msg: 'Loading data...' });
    try {
      const adpFiles = await loadAdp();
      const projectionsRows = getProjectionsRows();

      if (user?.id && supabase) {
        // Authenticated: the Chrome extension is the only roster data source.
        const userId = user.id;
        const entriesCache = await import('../../shared/utils/entriesCache');
        const cached = forceFull ? null : await entriesCache.readEntriesCache(userId);

        if (cached) {
          // Cache-first render (ADR-030): the portfolio appears at local-CPU
          // speed; a delta refresh reconciles adds/edits/deletes in background.
          entriesRef.current = cached.entries;
          await applyEntries(cached.entries, adpFiles, projectionsRows);
          trackEvent('entries_cache_hit', { count: cached.entries.length });

          entriesCache.refreshEntries(userId, cached).then(async ({ entries, changed }) => {
            if (gen !== loadGeneration.current) return; // superseded load
            if (!changed) return;
            entriesRef.current = entries;
            entriesCache.writeEntriesCache(userId, entries);
            // Re-read ADP from the memo (loadAdp) rather than the load-start
            // closure: the background ADP refresh (ADR-031) may have landed
            // meanwhile, and applying old ADP here would overwrite it.
            await applyEntries(entries, await loadAdp(), projectionsRows);
          }).catch(() => { /* refresh is best-effort; cache already rendered */ });
        } else {
          const { readExtensionEntries } = await import('../../shared/utils/extensionBridge');
          const entries = await readExtensionEntries(userId);
          if (gen !== loadGeneration.current) return;
          entriesRef.current = entries;
          entriesCache.writeEntriesCache(userId, entries);
          await applyEntries(entries, adpFiles, projectionsRows);
          if (entries.length > 0) {
            trackEvent('extension_sync_loaded', { count: entries.length });
          }
        }
        // Not awaited: rankings render local-first inside and must not hold
        // up the portfolio, which is already on screen.
        loadPerPlatformRankings(userId).catch(() => {});
      } else {
        // Guest: bundled ADP + projections only (public Arena needs them too).
        const result = await processLoadedData({ adpFiles, projectionsRows });
        setAdpSnapshots(result.adpSnapshots);
        setAdpByPlatform(result.adpByPlatform || {});
        setMasterPlayers(result.masterPlayers);
        setStatus({ type: '', msg: '' });
      }

      // Background ADP refresh (ADR-031, stale-while-revalidate): pull a newer
      // remote artifact and re-apply it without blocking the already-rendered
      // screen. Fail-soft — the bundled/cached ADP already rendered above.
      refreshAdpFiles().then(async (freshAdpFiles) => {
        if (!freshAdpFiles || gen !== loadGeneration.current) return;
        if (user?.id && supabase) {
          await applyEntries(entriesRef.current ?? [], freshAdpFiles, projectionsRows);
        } else {
          const result = await processLoadedData({ adpFiles: freshAdpFiles, projectionsRows });
          if (gen !== loadGeneration.current) return;
          setAdpSnapshots(result.adpSnapshots);
          setAdpByPlatform(result.adpByPlatform || {});
          setMasterPlayers(result.masterPlayers);
        }
      }).catch(() => { /* best-effort; bundled/cached ADP already rendered */ });
    } catch (err) {
      console.error('Load failed', err);
      setStatus({ type: 'error', msg: String(err) });
    }
  }, [user?.id, applyEntries, loadPerPlatformRankings]);

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
        adpFiles: await loadAdp(),
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

  // Explicit reload (pull-to-refresh, sync hand-off return) bypasses the
  // on-device cache and rewrites it from a full fetch.
  const reload = useCallback(() => loadData({ forceFull: true }), [loadData]);

  const deleteRoster = useCallback(async (entryId) => {
    // Only authenticated, non-demo sessions have real rows in extension_entries.
    if (!user?.id || !supabase || isUsingDemoData) return;
    const { deleteExtensionEntry } = await import('../../shared/utils/extensionBridge');
    await deleteExtensionEntry(user.id, entryId);
    setRosterData(prev => prev.filter(r => r.entry_id !== entryId));
    // Keep the on-device cache in step so a relaunch doesn't resurrect the row.
    if (entriesRef.current) {
      entriesRef.current = entriesRef.current.filter(e => e.entryId !== entryId);
      const { writeEntriesCache } = await import('../../shared/utils/entriesCache');
      writeEntriesCache(user.id, entriesRef.current);
    }
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
    reload,
    deleteRoster,
    rosterNavContext,
    setRosterNavContext,
  }), [rosterData, masterPlayers, adpSnapshots, adpByPlatform, rankingsByPlatform,
       weeklyActuals, status, isUsingDemoData, loadDemoData, exitDemo, reload, deleteRoster,
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
