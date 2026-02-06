// src/components/AdpTimeSeries.jsx
import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, Legend, Brush, CartesianGrid
} from 'recharts';
import { parseAdpString } from '../utils/helpers';

function AdpTimeSeries({ adpSnapshots = [], masterPlayers = [], teams = 12 }) {
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => {
    return (masterPlayers || []).slice(0, 5).map(p => p.player_id);
  });

  const colorPalette = [
    '#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd',
    '#8c564b','#e377c2','#7f7f7f','#bcbd22','#17becf'
  ];

  const playersIndex = useMemo(() => {
    const map = new Map();
    masterPlayers.forEach(p => {
      map.set(p.player_id, {
        player_id: p.player_id,
        name: p.name,
        position: p.position,
        team: p.team
      });
    });
    adpSnapshots.forEach(snapshot => {
      snapshot.rows.forEach(row => {
        const name =
          (row.firstName || row.first_name || row['First Name'] || '') + ' ' +
          (row.lastName || row.last_name || row['Last Name'] || '');
        const possibleName = (name.trim() || row['Player Name'] || row.player_name || row.Player || '').trim();
        if (!possibleName) return;
        const normalized = possibleName.replace(/\s+/g, ' ');
        const found = Array.from(map.values()).find(m => m.name === normalized);
        if (!found) {
          const syntheticId = `s_${normalized.replace(/\W+/g, '_')}`;
          if (!map.has(syntheticId)) {
            map.set(syntheticId, {
              player_id: syntheticId,
              name: normalized,
              position: row['Position'] || row.position || 'N/A',
              team: row['Team'] || row.team || 'N/A'
            });
          }
        }
      });
    });
    return map;
  }, [masterPlayers, adpSnapshots]);

  const dates = useMemo(() => adpSnapshots.map(s => s.date), [adpSnapshots]);

  const snapshotAdpLookups = useMemo(() => {
    return adpSnapshots.map(snap => {
      const lookup = new Map();
      snap.rows.forEach(row => {
        const name = (`${row.firstName || row.first_name || row['First Name'] || ''} ${row.lastName || row.last_name || row['Last Name'] || ''}`.trim()
                      || row['Player Name'] || row.player_name || row.Player || '');
        if (!name) return;
        const normalized = name.replace(/\s+/g, ' ');
        const rawAdp = row.adp ?? row.ADP ?? row['ADP'] ?? row['Round.Pick'] ?? row['Adp'] ?? '';
        const parsed = parseAdpString(rawAdp, teams);
        lookup.set(normalized, parsed);
      });
      return lookup;
    });
  }, [adpSnapshots, teams]);

  const playersList = useMemo(() => {
    const arr = Array.from(playersIndex.values());
    if (masterPlayers && masterPlayers.length > 0) {
      const orderMap = new Map(masterPlayers.map((p, i) => [p.player_id, i]));
      arr.sort((a, b) => {
        const ai = orderMap.has(a.player_id) ? orderMap.get(a.player_id) : Infinity;
        const bi = orderMap.has(b.player_id) ? orderMap.get(b.player_id) : Infinity;
        if (ai !== bi) return ai - bi;
        return a.name.localeCompare(b.name);
      });
    } else {
      arr.sort((x, y) => x.name.localeCompare(y.name));
    }
    return arr;
  }, [playersIndex, masterPlayers]);

  const chartData = useMemo(() => {
    const rows = dates.map(date => ({ date }));
    adpSnapshots.forEach((snap, idx) => {
      const lookup = snapshotAdpLookups[idx];
      playersList.forEach(player => {
        const mp = masterPlayers.find(m => m.player_id === player.player_id);
        let normalizedName;
        if (mp) normalizedName = mp.name;
        else normalizedName = player.name;
        const parsed = lookup.get(normalizedName);
        const pick = parsed && !Number.isNaN(parsed.pick) ? parsed.pick : null;
        rows[idx][player.player_id] = pick;
      });
    });
    return rows;
  }, [dates, adpSnapshots, snapshotAdpLookups, playersList, masterPlayers]);

  const displayLookup = useMemo(() => {
    const map = new Map();
    adpSnapshots.forEach((snap, idx) => {
      const lookup = snapshotAdpLookups[idx];
      if (!lookup) return;
      playersList.forEach(player => {
        const mp = masterPlayers.find(m => m.player_id === player.player_id);
        const normalizedName = mp ? mp.name : player.name;
        const parsed = lookup.get(normalizedName);
        if (!map.has(player.player_id)) map.set(player.player_id, new Map());
        map.get(player.player_id).set(snap.date, (parsed && parsed.display) || '-');
      });
    });
    return map;
  }, [adpSnapshots, snapshotAdpLookups, playersList, masterPlayers]);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      return [...prev, id];
    });
  };

  const selectTopN = (n = 5) => {
    const top = playersList.slice(0, n).map(p => p.player_id);
    setSelectedIds(top);
  };

  const filteredPlayers = useMemo(() => {
    const q = (query || '').toLowerCase().trim();
    return q ? playersList.filter(p => (`${p.name} ${p.team} ${p.position}`).toLowerCase().includes(q)) : playersList;
  }, [playersList, query]);

  const CustomTooltip = ({ active, label, payload }) => {
    if (!active || !label) return null;
    return (
      <div style={{ background: '#0f1724', color: '#e8eaed', padding: 8, borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 13, marginBottom: 6 }}>{label}</div>
        {selectedIds.map((id, i) => {
          const entry = (payload || []).find(p => p.dataKey === id);
          if (!entry) return null;
          const val = entry.value;
          const display = (displayLookup.get(id) && displayLookup.get(id).get(label)) || (val !== null ? String(val) : '-');
          const player = playersList.find(p => p.player_id === id);
          return (
            <div key={id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <div style={{ width: 12, height: 12, background: colorPalette[i % colorPalette.length], borderRadius: 2 }} />
              <div style={{ fontSize: 12 }}>
                <strong style={{ marginRight: 6 }}>{player ? player.name : id}</strong>
                <span style={{ color: '#9ca3af' }}>{display}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ minWidth: 320 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              className="path-input"
              placeholder="Search players (name, team, pos)..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ width: '100%' }}
            />
            <button className="load-button" onClick={() => selectTopN(5)} style={{ padding: '0.5rem 0.8rem', width: 'auto' }}>Select Top 5</button>
            <button className="load-button" onClick={() => setSelectedIds([])} style={{ padding: '0.5rem 0.8rem', width: 'auto' }}>Clear</button>
          </div>

          <div style={{ maxHeight: '36vh', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8, background: 'var(--bg-card)' }}>
            {filteredPlayers.map((p) => {
              const checked = selectedIds.includes(p.player_id);
              return (
                <label key={p.player_id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleSelect(p.player_id)} />
                  <div style={{ fontSize: 13 }}>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{p.team} • {p.position}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 320 }}>
          <div style={{ height: 420 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis
                  reversed
                  allowDecimals={false}
                  tick={{ fontSize: 12 }}
                  domain={[1, 'dataMax']}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Brush dataKey="date" height={30} stroke="#8884d8" />
                {selectedIds.map((id, idx) => {
                  const player = playersList.find(p => p.player_id === id);
                  if (!player) return null;
                  return (
                    <Line
                      key={id}
                      dataKey={id}
                      name={player.name}
                      stroke={colorPalette[idx % colorPalette.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        Note: ADP display preserved as strings; Y-axis is absolute pick number (1 = top pick). Missing ADP shows as gaps.
      </div>
    </div>
  );
}

export default AdpTimeSeries;
