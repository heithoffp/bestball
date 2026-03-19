// src/App.jsx
import React, { useEffect, useState, Suspense, lazy, useCallback } from 'react';
import { processLoadedData } from './utils/dataLoader';
import { saveFile, getFile, hasUserData } from './utils/storage';

// Lazy-loaded tab components (P2: code splitting)
const ExposureTable = lazy(() => import('./components/ExposureTable'));
const AdpTimeSeries = lazy(() => import('./components/AdpTimeSeries'));
const DraftFlowAnalysis = lazy(() => import('./components/DraftFlowAnalysis'));
const RosterViewer = lazy(() => import('./components/RosterViewer'));
const PlayerRankings = lazy(() => import('./components/PlayerRankings'));
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
  const [activeTab, setActiveTab] = useState('exposures');
  const [rankingsSource, setRankingsSource] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setStatus({ type: 'loading', msg: 'Loading data...' });
    try {
      if (await hasUserData()) {
        await loadFromIndexedDB();
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
  }

  async function loadFromIndexedDB() {
    const rosterFile = await getFile('roster');
    const rankingsFile = await getFile('rankings');

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
      await saveFile({ id: 'roster', type: 'roster', filename, text });
      await loadFromIndexedDB();
    } catch (err) {
      console.error('Roster upload failed', err);
      setStatus({ type: 'error', msg: String(err) });
    }
  }, []);

  const handleRankingsUpload = useCallback(async (text, filename) => {
    setStatus({ type: 'loading', msg: 'Processing rankings...' });
    try {
      await saveFile({ id: 'rankings', type: 'rankings', filename, text });
      await loadFromIndexedDB();
    } catch (err) {
      console.error('Rankings upload failed', err);
      setStatus({ type: 'error', msg: String(err) });
    }
  }, []);

  return (
    <div className="app-container">
      <h1>BEST BALL MANAGER</h1>

      {status.msg && (
        <div className={`card`} style={{ flex: 'none' }}>
          <strong>{status.type.toUpperCase()}</strong>: {status.msg}
        </div>
      )}

      <div className="card">
        <div className="tab-bar">
          <button className={`tab-button ${activeTab === 'exposures' ? 'active' : ''}`} onClick={() => setActiveTab('exposures')}>Exposures</button>
          <button className={`tab-button ${activeTab === 'timeseries' ? 'active' : ''}`} onClick={() => setActiveTab('timeseries')}>ADP Time Series</button>
          <button className={`tab-button ${activeTab === 'draftflow' ? 'active' : ''}`} onClick={() => setActiveTab('draftflow')}>Draft Flow</button>
          {/* DISABLED: Combo Analysis, Roster Construction, Jaccard Analysis */}
          <button className={`tab-button ${activeTab === 'rosters' ? 'active' : ''}`} onClick={() => setActiveTab('rosters')}>Rosters</button>
          <button className={`tab-button ${activeTab === 'rankings' ? 'active' : ''}`} onClick={() => setActiveTab('rankings')}>Rankings</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading tab...</div>}>
            {activeTab === 'exposures' && <ExposureTable masterPlayers={masterPlayers} rosterData={rosterData} onRosterUpload={handleRosterUpload} />}
            {activeTab === 'draftflow' && <DraftFlowAnalysis rosterData={rosterData} masterPlayers={masterPlayers} />}
            {activeTab === 'rosters' && <RosterViewer rosterData={rosterData} />}
            {activeTab === 'rankings' && <PlayerRankings initialPlayers={rankingsSource} masterPlayers={masterPlayers} onRankingsUpload={handleRankingsUpload} />}
            {activeTab === 'timeseries' && (
              <AdpTimeSeries
                adpSnapshots={adpSnapshots}
                masterPlayers={masterPlayers}
                teams={12}
                rosterData={rosterData}
              />
            )}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
