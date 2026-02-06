import React, { useState } from 'react';

/**
 * ConfigSection handles:
 * - URL path inputs (roster/adp)
 * - Local file uploads (recommended to avoid CORS)
 *
 * Props:
 *  - config { rosterPath, adpPath }
 *  - onSave(config)
 *  - onLoad({ rosterPath, adpPath, rosterFile, adpFile })
 */
export default function ConfigSection({ config, onSave, onLoad }) {
  const [localConfig, setLocalConfig] = useState(config);
  const [rosterFile, setRosterFile] = useState(null);
  const [adpFile, setAdpFile] = useState(null);

  const handleSave = () => {
    onSave(localConfig);
  };

  const handleLoad = () => {
    onLoad({ ...localConfig, rosterFile, adpFile });
  };

  return (
    <div className="config-section card">
      <label>Roster CSV Path (or upload)</label>
      <input className="path-input" value={localConfig.rosterPath || ''} onChange={e => setLocalConfig({ ...localConfig, rosterPath: e.target.value })} placeholder="https://..." />
      <input type="file" accept=".csv,text/csv" onChange={e => setRosterFile(e.target.files?.[0] || null)} />

      <label style={{ marginTop: 12 }}>ADP CSV Path (or upload)</label>
      <input className="path-input" value={localConfig.adpPath || ''} onChange={e => setLocalConfig({ ...localConfig, adpPath: e.target.value })} placeholder="https://..." />
      <input type="file" accept=".csv,text/csv" onChange={e => setAdpFile(e.target.files?.[0] || null)} />

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="load-button" onClick={handleSave}>Save Config</button>
        <button className="load-button" onClick={handleLoad}>Load Data</button>
      </div>
    </div>
  );
}
