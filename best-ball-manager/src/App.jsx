import React, { useEffect, useState } from 'react';
import ConfigSection from './components/ConfigSection';
import ExposureTable from './components/ExposureTable';
import CanonicalTable from './components/CanonicalTable';
import { parseCSVFile, parseCSVText } from './utils/csv';
import { processMasterList } from './utils/helpers';
import { parseAdpString } from './utils/helpers';

export default function App() {
  const [config, setConfig] = useState({ rosterPath: '', adpPath: '' });
  const [rosterData, setRosterData] = useState([]);
  const [masterPlayers, setMasterPlayers] = useState([]);
  const [adpMap, setAdpMap] = useState({});
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [activeTab, setActiveTab] = useState('exposures');

  useEffect(() => {
    const stored = localStorage.getItem('bb_config_v2');
    if (stored) setConfig(JSON.parse(stored));
  }, []);

  const saveConfig = (newConfig = config) => {
    localStorage.setItem('bb_config_v2', JSON.stringify(newConfig));
    setConfig(newConfig);
    // keep UX predictable: explicit load call after config saved
  };

  // Primary loader that supports either URL paths (fetch) or local File objects passed in via the components
  const loadFilesFromPaths = async ({ rosterPath, adpPath, rosterFile, adpFile } = {}) => {
    setStatus({ type: 'loading', msg: 'Loading...' });
    try {
      let rosters = [];
      let localAdpMap = {};

      // ROSTER
      if (rosterFile) {
        rosters = await parseCSVFile(rosterFile);
      } else if (rosterPath) {
        const rRes = await fetch(rosterPath);
        if (!rRes.ok) throw new Error(`Could not fetch roster file: ${rosterPath}`);
        const txt = await rRes.text();
        rosters = await parseCSVText(txt);
      } else {
        throw new Error('Please provide a roster file (upload) or roster URL path.');
      }

      // Map roster rows into normalized roster entries (kept close to your original mapping)
      const mappedRosters = rosters.map(row => {
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

      // ADP
      if (adpFile) {
        const rows = await parseCSVFile(adpFile);
        rows.forEach(row => {
          // try typical column names for ADP, preserve raw string
          const rawAdp = row.adp ?? row.ADP ?? row['ADP'] ?? row['Adp'] ?? row['Adp.'] ?? row['Round.Pick'] ?? row['ADP (R.P)'] ?? '';
          // build name from possible columns
          const name = ( `${row.firstName || row.first_name || row['First Name'] || ''} ${row.lastName || row.last_name || row['Last Name'] || ''}`.trim()
                        || row['Player Name'] || row.player_name || row.Player );
          if (!name) return;
          const parsed = parseAdpString(rawAdp, 12); // default 12-team; change if you expose leaguesize
          // store keyed by the normalized name used in rosters (we assume same normalization)
          const normalizedName = name.trim().replace(/\s+/g, ' ');
          localAdpMap[normalizedName] = parsed ? parsed : { raw: String(rawAdp), pick: NaN };
        });
      } else if (adpPath) {
        try {
          const aRes = await fetch(adpPath);
          if (aRes.ok) {
            const txt = await aRes.text();
            const rows = await parseCSVText(txt);
            rows.forEach(row => {
              const rawAdp = row.adp ?? row.ADP ?? row['ADP'] ?? row['Adp'] ?? row['Round.Pick'] ?? '';
              const name = ( `${row.firstName || row.first_name || row['First Name'] || ''} ${row.lastName || row.last_name || row['Last Name'] || ''}`.trim()
                            || row['Player Name'] || row.player_name || row.Player );
              if (!name) return;
              const parsed = parseAdpString(rawAdp, 12);
              const normalizedName = name.trim().replace(/\s+/g, ' ');
              localAdpMap[normalizedName] = parsed ? parsed : { raw: String(rawAdp), pick: NaN };
            });
          }
        } catch (e) {
          console.warn('ADP load failed', e);
        }
      }

      setAdpMap(localAdpMap);
      const master = processMasterList(mappedRosters, localAdpMap);
      setMasterPlayers(master);
      setStatus({ type: 'success', msg: `Loaded ${mappedRosters.length} roster rows, ${Object.keys(localAdpMap).length} ADP rows` });
    } catch (err) {
      setStatus({ type: 'error', msg: err.message });
    }
  };

  return (
    <div className="app-container">
      <h1>BEST BALL MANAGER</h1>

      <ConfigSection
        config={config}
        onSave={(c) => { saveConfig(c); }}
        onLoad={(opts) => loadFilesFromPaths(opts)}
      />

      {status.msg && (
        <div className={`card`}>
          <strong>{status.type.toUpperCase()}</strong>: {status.msg}
        </div>
      )}

      {masterPlayers.length > 0 && (
        <div className="card">
          <div className="tab-bar">
            <button className={`tab-button ${activeTab === 'exposures' ? 'active' : ''}`} onClick={() => setActiveTab('exposures')}>Top Exposures</button>
            <button className={`tab-button ${activeTab === 'canonical' ? 'active' : ''}`} onClick={() => setActiveTab('canonical')}>Canonical Player Table</button>
          </div>

          {activeTab === 'exposures' && <ExposureTable masterPlayers={masterPlayers} />}
          {activeTab === 'canonical' && <CanonicalTable masterPlayers={masterPlayers} />}
        </div>
      )}
    </div>
  );
}
