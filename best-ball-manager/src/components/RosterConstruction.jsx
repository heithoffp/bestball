import React, { useState, useMemo } from 'react';
import { analyzePortfolioTree, PROTOCOL_TREE, ARCHETYPE_METADATA } from '../utils/rosterArchetypes';

// Position colors optimized for dark theme visibility
const POS_COLORS = { 
  QB: 'var(--pos-qb)',
  RB: 'var(--pos-rb)',
  WR: 'var(--pos-wr)',
  TE: 'var(--pos-te)', 
  default: 'var(--text-muted)' 
};

export default function RosterConstruction({ rosterData = [] }) {
  const [nav, setNav] = useState({ rb: null, qb: null, te: null });
  const [searchQuery, setSearchQuery] = useState('');

  const { totalEntries, tree } = useMemo(() => analyzePortfolioTree(rosterData), [rosterData]);

  // Player archetype analysis
  const playerArchetypes = useMemo(() => {
    if (!searchQuery.trim()) return null;
    
    const query = searchQuery.toLowerCase().trim();
    const archetypeMap = new Map();
    let totalOccurrences = 0;

    // Traverse the tree and find all instances of the player
    Object.entries(tree).forEach(([rbKey, rbData]) => {
      Object.entries(rbData.children).forEach(([qbKey, qbData]) => {
        Object.entries(qbData.children).forEach(([teKey, teData]) => {
          teData.entries.forEach(entry => {
            const hasPlayer = entry.roster.some(p => 
              p.name.toLowerCase().includes(query)
            );
            
            if (hasPlayer) {
              const archetypePath = `${rbKey}/${qbKey}/${teKey}`;
              archetypeMap.set(archetypePath, (archetypeMap.get(archetypePath) || 0) + 1);
              totalOccurrences++;
            }
          });
        });
      });
    });

    const results = Array.from(archetypeMap.entries()).map(([path, count]) => {
      const [rb, qb, te] = path.split('/');
      return {
        rb,
        qb,
        te,
        count,
        pct: (count / totalOccurrences) * 100
      };
    }).sort((a, b) => b.count - a.count);

    return { results, totalOccurrences };
  }, [searchQuery, tree]);

  // Navigation handlers
  const selectRB = (key) => setNav({ rb: key, qb: null, te: null });
  const selectQB = (key) => setNav({ ...nav, qb: key, te: null });
  const selectTE = (key) => setNav({ ...nav, te: key });

  return (
    <div className="protocol-container">
      <style>{`
        .protocol-container { padding: 1.25rem 0; }

        .player-search-panel {
          background: var(--surface-1);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          padding: 1.9rem;
          margin-bottom: 2.5rem;
        }

        .search-input {
          width: 100%;
          background: var(--surface-0);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          padding: 15px 20px;
          color: var(--text-primary);
          font-size: 1.25rem;
          font-family: 'JetBrains Mono', monospace;
          transition: border-color 0.2s;
        }
        .search-input:focus {
          outline: none;
          border-color: var(--accent);
        }
        .search-input::placeholder {
          color: var(--text-muted);
        }

        .search-results {
          margin-top: 1.25rem;
        }
        .search-result-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px;
          background: var(--surface-0);
          border-radius: 6px;
          margin-bottom: 10px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .search-result-item:hover {
          background: var(--surface-2);
          transform: translateX(4px);
        }
        .search-path {
          font-family: 'JetBrains Mono', monospace;
          font-size: 1.05rem;
          color: var(--text-secondary);
        }
        .search-path-sep {
          color: var(--text-muted);
          margin: 0 10px;
        }
        .search-count {
          display: flex;
          align-items: center;
          gap: 15px;
        }
        .search-pct {
          font-family: 'JetBrains Mono', monospace;
          font-size: 1.4rem;
          font-weight: 700;
          color: var(--accent);
        }
        .search-teams {
          font-size: 0.95rem;
          color: var(--text-muted);
        }
        
        .section-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 1rem;
          color: var(--text-muted);
          text-transform: uppercase;
          margin-bottom: 1.25rem;
          display: flex;
          align-items: center;
          gap: 13px;
        }
        .section-label::after { content: ""; flex: 1; height: 1px; background: var(--border-subtle); }
        
        .tree-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1.25rem;
          margin-bottom: 3.1rem;
        }

        .tree-card {
          background: var(--surface-1);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          padding: 1.9rem;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
        }
        .tree-card:hover { 
          background: var(--surface-2); 
          border-color: var(--text-muted); 
          transform: translateY(-2px); 
        }
        .tree-card.active { 
          border-color: var(--accent); 
          background: rgba(59, 130, 246, 0.05); 
          box-shadow: 0 0 15px rgba(59, 130, 246, 0.1); 
        }
        
        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1.25rem;
        }
        .card-title {
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 5px;
        }
        .card-count {
          font-size: 0.95rem;
          color: var(--text-muted);
        }
        .card-pct {
          font-family: 'JetBrains Mono', monospace;
          font-size: 1.9rem;
          font-weight: 800;
          color: var(--text-primary);
        }
        
        .dual-progress {
          margin: 15px 0;
        }
        .progress-label {
          display: flex;
          justify-content: space-between;
          font-size: 0.9rem;
          margin-bottom: 8px;
          font-family: 'JetBrains Mono', monospace;
        }
        .progress-track { 
          height: 8px; 
          background: var(--surface-0); 
          border-radius: 3px; 
          position: relative; 
          overflow: visible;
        }
        .progress-fill { 
          height: 100%; 
          border-radius: 3px; 
          transition: width 1s ease; 
          position: relative;
        }
        .target-marker {
          position: absolute;
          top: -2px;
          width: 4px;
          height: 13px;
          background: white;
          border-radius: 2px;
          z-index: 2;
          box-shadow: 0 0 8px rgba(255,255,255,0.8);
          transition: left 0.3s;
        }
        .target-marker::before {
          content: '';
          position: absolute;
          top: -10px;
          left: 50%;
          transform: translateX(-50%);
          border: 4px solid transparent;
          border-bottom-color: white;
        }

        .delta-badge {
          display: inline-block;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.9rem;
          font-weight: 700;
          padding: 3px 10px;
          border-radius: 4px;
          margin-top: 10px;
        }
        .delta-over {
          background: rgba(34, 197, 94, 0.15);
          color: var(--positive);
        }
        .delta-under {
          background: rgba(239, 68, 68, 0.15);
          color: var(--negative);
        }
        .delta-perfect {
          background: rgba(59, 130, 246, 0.15);
          color: var(--accent);
        }

        .breadcrumb-nav {
          display: flex;
          gap: 15px;
          margin-bottom: 2.5rem;
          font-family: 'JetBrains Mono', monospace;
          font-size: 1.1rem;
        }
        .bc-node { color: var(--accent); }
        .bc-sep { color: var(--text-muted); }

        .roster-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 1.25rem;
        }
        .mini-card {
          background: var(--surface-1);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          padding: 1.25rem;
        }
        .mini-card:hover { border-color: var(--accent); }
        
        .draft-strip { display: flex; gap: 4px; margin: 15px 0; }
        .pick-block {
          flex: 1;
          height: 28px;
          border-radius: 3px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 900;
          color: white;
          text-shadow: 0 1px 2px rgba(0,0,0,0.5);
        }
        .player-preview {
          font-size: 0.95rem;
          color: var(--text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>

      {/* PLAYER SEARCH PANEL */}
      <div className="player-search-panel">
        <input
          type="text"
          className="search-input"
          placeholder="Search player name to see archetype allocation..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        
        {playerArchetypes && playerArchetypes.totalOccurrences > 0 && (
          <div className="search-results">
            <div style={{
              fontSize: '0.95rem',
              color: 'var(--text-muted)',
              marginBottom: '15px',
              fontFamily: 'JetBrains Mono'
            }}>
              Found in {playerArchetypes.totalOccurrences} teams across {playerArchetypes.results.length} archetypes
            </div>
            
            {playerArchetypes.results.map((result, idx) => (
              <div 
                key={idx} 
                className="search-result-item"
                onClick={() => {
                  setNav({ rb: result.rb, qb: result.qb, te: result.te });
                  setSearchQuery('');
                }}
              >
                <div className="search-path">
                  <span>{ARCHETYPE_METADATA[result.rb]?.name || result.rb}</span>
                  <span className="search-path-sep">→</span>
                  <span>{ARCHETYPE_METADATA[result.qb]?.name || result.qb}</span>
                  <span className="search-path-sep">→</span>
                  <span>{ARCHETYPE_METADATA[result.te]?.name || result.te}</span>
                </div>
                <div className="search-count">
                  <span className="search-teams">{result.count} teams</span>
                  <span className="search-pct">{result.pct.toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {playerArchetypes && playerArchetypes.totalOccurrences === 0 && (
          <div style={{
            marginTop: '15px',
            fontSize: '1.05rem',
            color: 'var(--text-muted)',
            textAlign: 'center',
            padding: '25px'
          }}>
            No teams found with this player
          </div>
        )}
      </div>

      {/* TIER 1: RB (CAPITAL ANCHOR) */}
      <div className="section-label">Tier 1 // RB Structural Anchor</div>
      <div className="tree-grid">
        {Object.entries(PROTOCOL_TREE).map(([key, config]) => {
          const data = tree[key];
          const pct = totalEntries > 0 ? (data.count / totalEntries) * 100 : 0;
          const isActive = nav.rb === key;
          const delta = pct - config.target;
          
          return (
            <div key={key} className={`tree-card ${isActive ? 'active' : ''}`} onClick={() => selectRB(key)}>
              <div className="card-header">
                <div>
                  <div className="card-title">{ARCHETYPE_METADATA[key]?.name}</div>
                  <div className="card-count">{data.count} Teams</div>
                </div>
                <div className="card-pct">{pct.toFixed(1)}%</div>
              </div>
              
              <div className="dual-progress">
                <div className="progress-label">
                  <span style={{ color: 'var(--text-secondary)' }}>Actual</span>
                  <span style={{ color: 'var(--text-primary)' }}>Target: {config.target}%</span>
                </div>
                <div className="progress-track">
                  <div 
                    className="target-marker" 
                    style={{ left: `${Math.min(config.target, 100)}%` }} 
                  />
                  <div 
                    className="progress-fill" 
                    style={{ 
                      width: `${Math.min(pct, 100)}%`, 
                      background: config.color || 'var(--accent)' 
                    }} 
                  />
                </div>
              </div>

              <div className={`delta-badge ${
                Math.abs(delta) < 2 ? 'delta-perfect' : 
                delta > 0 ? 'delta-over' : 'delta-under'
              }`}>
                {delta > 0 ? '+' : ''}{delta.toFixed(1)}% {Math.abs(delta) < 2 ? 'ON TARGET' : delta > 0 ? 'OVER' : 'UNDER'}
              </div>
            </div>
          );
        })}
      </div>

      {/* TIER 2: QB (CORRELATION) */}
      {nav.rb && tree[nav.rb].count > 0 && (
        <>
          <div className="section-label">Tier 2 // QB Capital Allocation</div>
          <div className="tree-grid">
            {Object.entries(PROTOCOL_TREE[nav.rb].children).map(([key, config]) => {
              const data = tree[nav.rb].children[key];
              const parentCount = tree[nav.rb].count;
              const pct = parentCount > 0 ? (data.count / parentCount) * 100 : 0;
              const delta = pct - config.target;
              
              return (
                <div key={key} className={`tree-card ${nav.qb === key ? 'active' : ''}`} onClick={() => selectQB(key)}>
                  <div className="card-header">
                    <div>
                      <div className="card-title">{ARCHETYPE_METADATA[key]?.name}</div>
                      <div className="card-count">{data.count} Teams</div>
                    </div>
                    <div className="card-pct">{pct.toFixed(1)}%</div>
                  </div>
                  
                  <div className="dual-progress">
                    <div className="progress-label">
                      <span style={{ color: 'var(--text-secondary)' }}>Actual</span>
                      <span style={{ color: 'var(--text-primary)' }}>Target: {config.target}%</span>
                    </div>
                    <div className="progress-track">
                      <div 
                        className="target-marker" 
                        style={{ left: `${Math.min(config.target, 100)}%` }} 
                      />
                      <div
                        className="progress-fill"
                        style={{
                          width: `${Math.min(pct, 100)}%`,
                          background: ARCHETYPE_METADATA[key]?.color || 'var(--accent)'
                        }}
                      />
                    </div>
                  </div>

                  <div className={`delta-badge ${
                    Math.abs(delta) < 2 ? 'delta-perfect' : 
                    delta > 0 ? 'delta-over' : 'delta-under'
                  }`}>
                    {delta > 0 ? '+' : ''}{delta.toFixed(1)}% {Math.abs(delta) < 2 ? 'ON TARGET' : delta > 0 ? 'OVER' : 'UNDER'}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* TIER 3: TE (THE HEDGE) */}
      {nav.qb && tree[nav.rb].children[nav.qb].count > 0 && (
        <>
          <div className="section-label">Tier 3 // TE Completion</div>
          <div className="tree-grid">
            {Object.entries(PROTOCOL_TREE[nav.rb].children[nav.qb].children).map(([key, target]) => {
              const data = tree[nav.rb].children[nav.qb].children[key];
              const parentCount = tree[nav.rb].children[nav.qb].count;
              const pct = parentCount > 0 ? (data.count / parentCount) * 100 : 0;
              const delta = pct - target;
              
              return (
                <div key={key} className={`tree-card ${nav.te === key ? 'active' : ''}`} onClick={() => selectTE(key)}>
                  <div className="card-header">
                    <div>
                      <div className="card-title">{ARCHETYPE_METADATA[key]?.name}</div>
                      <div className="card-count">{data.count} Teams</div>
                    </div>
                    <div className="card-pct">{pct.toFixed(1)}%</div>
                  </div>
                  
                  <div className="dual-progress">
                    <div className="progress-label">
                      <span style={{ color: 'var(--text-secondary)' }}>Actual</span>
                      <span style={{ color: 'var(--text-primary)' }}>Target: {target}%</span>
                    </div>
                    <div className="progress-track">
                      <div 
                        className="target-marker" 
                        style={{ left: `${Math.min(target, 100)}%` }} 
                      />
                      <div
                        className="progress-fill"
                        style={{
                          width: `${Math.min(pct, 100)}%`,
                          background: ARCHETYPE_METADATA[key]?.color || 'var(--accent)'
                        }}
                      />
                    </div>
                  </div>

                  <div className={`delta-badge ${
                    Math.abs(delta) < 2 ? 'delta-perfect' : 
                    delta > 0 ? 'delta-over' : 'delta-under'
                  }`}>
                    {delta > 0 ? '+' : ''}{delta.toFixed(1)}% {Math.abs(delta) < 2 ? 'ON TARGET' : delta > 0 ? 'OVER' : 'UNDER'}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* DEEP DIVE: ROSTER LIST */}
      {nav.te && (
        <div className="config-section" style={{ padding: '1.9rem' }}>
          <div className="breadcrumb-nav">
            <span className="bc-node">{ARCHETYPE_METADATA[nav.rb].name}</span>
            <span className="bc-sep">/</span>
            <span className="bc-node">{ARCHETYPE_METADATA[nav.qb].name}</span>
            <span className="bc-sep">/</span>
            <span className="bc-node">{ARCHETYPE_METADATA[nav.te].name}</span>
          </div>

          <div className="roster-grid">
            {tree[nav.rb].children[nav.qb].children[nav.te].entries.map((entry, idx) => (
              <RosterMiniCard key={idx} entry={entry} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RosterMiniCard({ entry }) {
  const sorted = [...entry.roster].sort((a, b) => (a.pick || 0) - (b.pick || 0));
  
  return (
    <div className="mini-card">
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.9rem',
        fontFamily: 'JetBrains Mono',
        marginBottom: '10px'
      }}>
        <span style={{ color: 'var(--text-secondary)' }}>ID: {entry.id.substring(0, 10)}</span>
      </div>
      
      <div className="draft-strip">
        {sorted.slice(0, 10).map((p, i) => (
          <div 
            key={i} 
            className="pick-block" 
            style={{ backgroundColor: POS_COLORS[p.position] || POS_COLORS.default }}
          >
            {p.position}
          </div>
        ))}
      </div>

      <div className="player-preview">
        {sorted.slice(0, 3).map(p => p.name).join(' → ')}
      </div>
    </div>
  );
}