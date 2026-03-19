// src/App.jsx
import React, { useEffect, useState, Suspense, lazy } from 'react';
import CanonicalTable from './components/CanonicalTable';
import { parseCSVFile, parseCSVText } from './utils/csv';
import { processMasterList, parseAdpString } from './utils/helpers';

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

import rosterRaw from './assets/rosters.csv?raw';
const adpModules = import.meta.glob('./assets/adp/*.csv', { as: 'raw' });
const projectionsModules = import.meta.glob('./assets/projections.csv', { as: 'raw', eager: true });
const rankingsModules = import.meta.glob('./assets/rankings.csv', { as: 'raw', eager: true });

export default function App() {
  const [rosterData, setRosterData] = useState([]);
  const [masterPlayers, setMasterPlayers] = useState([]);
  const [adpSnapshots, setAdpSnapshots] = useState([]);
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [activeTab, setActiveTab] = useState('exposures');
  const [rankingsSource, setRankingsSource] = useState([]);

  useEffect(() => {
    autoLoadFromAssets();
  }, []);

  async function autoLoadFromAssets() {
    setStatus({ type: 'loading', msg: 'Auto-loading roster + ADP snapshots...' });

    try {
      // 1) Parse roster
      const rosterRows = await parseCSVText(String(rosterRaw));
      const mappedRosters = rosterRows.map(row => {
        let name = row['Player Name'] || row.player_name || row.Player;
        if (!name && (row['First Name'] || row.firstName)) {
          name = `${row['First Name'] || row.firstName || ''} ${row['Last Name'] || row.lastName || ''}`;
        }
        const entry = row['Draft Entry'] || row['Entry ID'] || row.entry_id || 'Entry1';
        const pick = parseInt(row['Pick Number'] || row.pick_number || row.Pick || 0);
        const draftSize = parseInt(row['Draft Size'] || 12);
        const round = row['Round'] || (pick > 0 ? Math.ceil(pick / (draftSize || 12)) : '-');

        return {
          name: name ? name.trim().replace(/\s+/g, ' ') : 'Unknown',
          position: row['Position'] || row.position || 'N/A',
          team: row['Team'] || row.team || 'N/A',
          entry_id: entry,
          pick,
          round,
          pickedAt: row['Picked At'] || null,
          tournamentTitle: row['Tournament Title'] || null,
        };
      }).filter(p => p.name !== 'Unknown');

      // 2) Load ADP snapshots
      const adpEntries = Object.entries(adpModules);
      if (adpEntries.length === 0) {
        setRosterData(mappedRosters);
        setAdpSnapshots([]);
        const master = processMasterList(mappedRosters, {}, 12, []);
        setMasterPlayers(master);
        setStatus({ type: 'success', msg: `Loaded ${mappedRosters.length} rows; no ADP found.` });
        return;
      }

      const snapshots = await Promise.all(adpEntries.map(async ([filePath, resolver]) => {
        const text = await resolver();
        const parts = filePath.split('/');
        const fileName = parts[parts.length - 1];
        const dateMatch = fileName.match(/(\d{4}-\d{2}-\d{2})/);
        const dateStr = dateMatch ? dateMatch[1] : fileName;
        const rows = await parseCSVText(String(text));
        return { date: dateStr, fileName, rows, rawText: text };
      }));

      snapshots.sort((a, b) => a.date.localeCompare(b.date));
      setAdpSnapshots(snapshots);

      // 3) Build ADP & Team & Projected Points Lookup from the LATEST snapshot
      const latest = snapshots[snapshots.length - 1];
      const localAdpMap = {};
      const teamLookup = {};
      const projPointsMap = {};

      if (latest && latest.rows) {
        latest.rows.forEach(row => {
          // 1. Identify Name
          const name = (`${row.firstName || row.first_name || row['First Name'] || ''} ${row.lastName || row.last_name || row['Last Name'] || ''}`.trim()
            || row['Player Name'] || row.player_name || row.Player);
          if (!name) return;
          const normalizedName = name.trim().replace(/\s+/g, ' ');

          // 2. Identify Team (Handle empty strings)
          const rawTeam = row.team || row.Team || row['Team Abbr'] || row['team_abbr'] || '';
          const teamVal = rawTeam.trim().toUpperCase();
          if (teamVal) {
            teamLookup[normalizedName] = teamVal;
          }

          // 3. Identify ADP
          const rawAdp = row.adp ?? row.ADP ?? row['ADP'] ?? row['Adp'] ?? row['Round.Pick'] ?? '';
          const parsed = parseAdpString(rawAdp, 12);
          localAdpMap[normalizedName] = parsed ? parsed : { display: String(rawAdp), pick: NaN };

          // 4. Identify Projected Points
          const rawProj = row.projectedPoints || row.projected_points || row['Projected Points'] || '';
          const projVal = parseFloat(rawProj);
          if (!isNaN(projVal)) {
            projPointsMap[normalizedName] = projVal;
          }
        });
      }

      // 3.5) Build the "Universe" of all players in the ADP file
      const universePlayers = [];
      if (latest && latest.rows) {
        latest.rows.forEach(row => {
          const name = (`${row.firstName || row.first_name || row['First Name'] || ''} ${row.lastName || row.last_name || row['Last Name'] || ''}`.trim()
            || row['Player Name'] || row.player_name || row.Player);
          if (!name) return;
          const normalizedName = name.trim().replace(/\s+/g, ' ');

          universePlayers.push({
            name: normalizedName,
            // Get position and team from the ADP row so undrafted players have info
            position: row.position || row.Position || row.pos || 'N/A',
            team: teamLookup[normalizedName] || 'N/A'
          });
        });
      }

      // 4) Enrich Rosters (Use "latest" team if available, otherwise original)
      const enrichedRosters = mappedRosters.map(player => {
        const latestTeam = teamLookup[player.name];
        const adpData = localAdpMap[player.name];
        return {
          ...player,
          team: latestTeam || player.team || 'N/A',
          // Adding the ADP fields here
          latestADP: adpData ? adpData.pick : null,
          latestADPDisplay: adpData ? adpData.display : 'N/A',
          // Optional: Calculate "Value" (Draft Pick vs ADP)
          adpDiff: adpData && player.pick ? (adpData.pick - player.pick).toFixed(2) : null,
          projectedPoints: projPointsMap[player.name] || null,
        };
      });

      // 5) UPDATE BOTH STATES WITH ENRICHED DATA
      setRosterData(enrichedRosters);
      // 5) Update Master List using the Universe
      // Pass the universePlayers array as the source list
      const master = processMasterList(enrichedRosters, localAdpMap, 12, snapshots, universePlayers);
      setMasterPlayers(master);

      // Load rankings source: rankings.csv first, then projections.csv, then latest ADP
      const rankingsRaw = Object.values(rankingsModules)[0];
      const projectionsRaw = Object.values(projectionsModules)[0];
      if (rankingsRaw) {
        const rankRows = await parseCSVText(String(rankingsRaw));
        setRankingsSource(rankRows);
      } else if (projectionsRaw) {
        const projRows = await parseCSVText(String(projectionsRaw));
        setRankingsSource(projRows);
      } else if (latest) {
        setRankingsSource(latest.rows);
      }

      setStatus({ type: '', msg: '' });
    } catch (err) {
      console.error('Auto-load failed', err);
      setStatus({ type: 'error', msg: String(err) });
    }
  }

  return (
    <div className="app-container">
      <h1>BEST BALL MANAGER</h1>

      {status.msg && (
        <div className={`card`}>
          <strong>{status.type.toUpperCase()}</strong>: {status.msg}
        </div>
      )}

      {masterPlayers.length > 0 && (
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
              {activeTab === 'exposures' && <ExposureTable masterPlayers={masterPlayers} rosterData={rosterData} />}
              {activeTab === 'draftflow' && <DraftFlowAnalysis rosterData={rosterData} masterPlayers={masterPlayers} />}
              {activeTab === 'rosters' && <RosterViewer rosterData={rosterData} />}
              {activeTab === 'rankings' && <PlayerRankings initialPlayers={rankingsSource} masterPlayers={masterPlayers} />}
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
      )}
    </div>
  );
}