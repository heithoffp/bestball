// src/App.jsx
import React, { useEffect, useState } from 'react';
import ExposureTable from './components/ExposureTable';
import CanonicalTable from './components/CanonicalTable';
import { parseCSVFile, parseCSVText } from './utils/csv';
import { processMasterList, parseAdpString } from './utils/helpers';

// NOTE: roster CSV is a single, fixed file inside src/assets
// The ?raw import returns the file contents as a string at build/dev time.
import rosterRaw from './assets/rosters.csv?raw';

// import.meta.glob for all CSVs inside src/assets/adp/ — returns functions that resolve to raw text
// Vite will statically analyze and include these modules.
const adpModules = import.meta.glob('./assets/adp/*.csv', { as: 'raw' });

export default function App() {
  const [rosterData, setRosterData] = useState([]);
  const [masterPlayers, setMasterPlayers] = useState([]);
  const [adpSnapshots, setAdpSnapshots] = useState([]); // [{ date: '2026-02-03', rows: [...] }, ...]
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [activeTab, setActiveTab] = useState('exposures');

  useEffect(() => {

    // Immediately auto-load the CSVs from src/assets
    autoLoadFromAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save config but we won't rely on config for the auto-load case
  // const saveConfig = (newConfig = config) => {
  //   localStorage.setItem('bb_config_v2', JSON.stringify(newConfig));
  //   setConfig(newConfig);
  // };

  // -------------------------
  // AUTO-LOAD IMPLEMENTATION
  // -------------------------
  async function autoLoadFromAssets() {
    setStatus({ type: 'loading', msg: 'Auto-loading roster + ADP snapshots...' });

    try {
      // ----------------
      // 1) Parse roster
      // ----------------
      // rosterRaw is already the CSV text imported at module time
      const rosterRows = await parseCSVText(String(rosterRaw));
      // map roster rows into normalized roster entries (same logic you had before)
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
          round
        };
      }).filter(p => p.name !== 'Unknown');

      setRosterData(mappedRosters);

      // ----------------
      // 2) Load ADP snapshots (all files matched by import.meta.glob)
      // ----------------
      // adpModules is an object mapping filepath -> async function that returns raw text
      const adpEntries = Object.entries(adpModules); // [ ['./assets/adp/underdog_adp_2026-02-03.csv', resolver], ... ]

      // If no ADP files found, keep adpSnapshots empty
      if (adpEntries.length === 0) {
        setAdpSnapshots([]);
        // Still build master list without ADP
        const master = processMasterList(mappedRosters, {}, 12);
        setMasterPlayers(master);
        setStatus({ type: 'success', msg: `Loaded ${mappedRosters.length} roster rows; no ADP snapshots found.` });
        return;
      }

      // load each file and extract a date from the filename (expects YYYY-MM-DD somewhere in filename)
      const snapshots = await Promise.all(adpEntries.map(async ([filePath, resolver]) => {
        const text = await resolver(); // returns raw CSV text
        // extract filename from path
        const parts = filePath.split('/');
        const fileName = parts[parts.length - 1];
        // look for a date pattern like 2026-02-03
        const dateMatch = fileName.match(/(\d{4}-\d{2}-\d{2})/);
        const dateStr = dateMatch ? dateMatch[1] : fileName;

        // parse CSV into rows
        const rows = await parseCSVText(String(text));
        return { date: dateStr, fileName, rows, rawText: text };
      }));

      // sort snapshots by date ascending (old -> new) when date is ISO (YYYY-MM-DD). Non-ISO filenames will be stable by fileName.
      snapshots.sort((a, b) => {
        // if both dates look like YYYY-MM-DD compare lexically (works for ISO)
        if (/^\d{4}-\d{2}-\d{2}$/.test(a.date) && /^\d{4}-\d{2}-\d{2}$/.test(b.date)) {
          return a.date.localeCompare(b.date);
        }
        return a.fileName.localeCompare(b.fileName);
      });

      setAdpSnapshots(snapshots);

      // ----------------
      // 3) Build ADP map from the latest snapshot (last in snapshots array)
      // ----------------
      const latest = snapshots[snapshots.length - 1];
      const localAdpMap = {};
      if (latest && latest.rows) {
        latest.rows.forEach(row => {
          // Attempt common ADP column names and name columns. Keep raw string and parse.
          const rawAdp = row.adp ?? row.ADP ?? row['ADP'] ?? row['Adp'] ?? row['Round.Pick'] ?? row['Round.Pick'] ?? '';
          const name = ( `${row.firstName || row.first_name || row['First Name'] || ''} ${row.lastName || row.last_name || row['Last Name'] || ''}`.trim()
                        || row['Player Name'] || row.player_name || row.Player );
          if (!name) return;
          const parsed = parseAdpString(rawAdp, 12); // you can make 12 configurable later
          const normalizedName = name.trim().replace(/\s+/g, ' ');
          localAdpMap[normalizedName] = parsed ? parsed : { display: String(rawAdp), pick: NaN };
        });
      }

      // ----------------
      // 4) Build canonical master list with latest ADP
      // ----------------
      const master = processMasterList(mappedRosters, localAdpMap, 12);
      setMasterPlayers(master);

      setStatus({ type: 'success', msg: `Loaded ${mappedRosters.length} roster rows; ${snapshots.length} ADP snapshots loaded (latest: ${latest ? latest.date : 'n/a'}).` });
    } catch (err) {
      console.error('Auto-load failed', err);
      setStatus({ type: 'error', msg: String(err) });
    }
  }

  // keep ConfigSection available but default behavior is auto-loaded — user can still use UI later for manual overrides
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
            <button className={`tab-button ${activeTab === 'canonical' ? 'active' : ''}`} onClick={() => setActiveTab('canonical')}>Canonical Player Table</button>
          </div>

          {activeTab === 'exposures' && <ExposureTable masterPlayers={masterPlayers} />}
          {activeTab === 'canonical' && <CanonicalTable masterPlayers={masterPlayers} />}
        </div>
      )}
    </div>
  );
}
