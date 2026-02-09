import React, { useState, useMemo } from 'react';
import { analyzePortfolioTree, PROTOCOL_TREE, ARCHETYPE_METADATA } from '../utils/rosterArchetypes';

// Position colors optimized for dark theme visibility
const POS_COLORS = { 
  QB: 'var(--accent-red)', 
  RB: 'var(--accent-green)', 
  WR: 'var(--accent-blue)', 
  TE: 'var(--accent-yellow)', 
  default: 'var(--text-muted)' 
};

export default function RosterConstruction({ rosterData = [] }) {
  const [nav, setNav] = useState({ rb: null, qb: null, te: null });

  const { totalEntries, tree } = useMemo(() => analyzePortfolioTree(rosterData), [rosterData]);

  // Navigation handlers
  const selectRB = (key) => setNav({ rb: key, qb: null, te: null });
  const selectQB = (key) => setNav({ ...nav, qb: key, te: null });
  const selectTE = (key) => setNav({ ...nav, te: key });

  return (
    <div className="protocol-container">
      <style>{`
        .protocol-container { padding: 1rem 0; }
        .section-label { 
          font-family: 'JetBrains Mono', monospace; 
          font-size: 0.8rem; 
          color: var(--text-muted); 
          text-transform: uppercase; 
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .section-label::after { content: ""; flex: 1; height: 1px; background: var(--border); }
        
        .tree-grid { 
          display: grid; 
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); 
          gap: 1rem; 
          margin-bottom: 2.5rem; 
        }

        .tree-card { 
          background: var(--bg-card); 
          border: 1px solid var(--border); 
          border-radius: 12px; 
          padding: 1.5rem; 
          cursor: pointer; 
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
        }
        .tree-card:hover { background: var(--bg-hover); border-color: var(--text-muted); transform: translateY(-2px); }
        .tree-card.active { border-color: var(--accent-blue); background: rgba(59, 130, 246, 0.05); box-shadow: 0 0 15px rgba(59, 130, 246, 0.1); }
        
        .card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; }
        .card-title { font-weight: 700; color: var(--text-primary); }
        .card-pct { font-family: 'JetBrains Mono', monospace; font-size: 1.5rem; font-weight: 800; color: var(--text-primary); }
        
        .progress-track { height: 4px; background: var(--bg-dark); border-radius: 2px; margin: 12px 0; position: relative; }
        .progress-fill { height: 100%; border-radius: 2px; transition: width 1s ease; }
        .target-dot { 
          position: absolute; 
          top: -4px; 
          width: 2px; 
          height: 12px; 
          background: var(--text-primary); 
          z-index: 2; 
          box-shadow: 0 0 8px var(--text-primary);
        }

        .breadcrumb-nav { 
          display: flex; 
          gap: 12px; 
          margin-bottom: 2rem; 
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.9rem;
        }
        .bc-node { color: var(--accent-blue); }
        .bc-sep { color: var(--text-muted); }

        .roster-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 1rem; }
        .mini-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }
        .mini-card:hover { border-color: var(--accent-blue); }
        
        .draft-strip { display: flex; gap: 3px; margin: 12px 0; }
        .pick-block { 
          flex: 1; 
          height: 22px; 
          border-radius: 3px; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          font-size: 10px; 
          font-weight: 900; 
          color: white; 
          text-shadow: 0 1px 2px rgba(0,0,0,0.5);
        }
        .player-preview { font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      `}</style>

      {/* TIER 1: RB (CAPITAL ANCHOR) */}
      <div className="section-label">Tier 1 // RB Structural Anchor</div>
      <div className="tree-grid">
        {Object.entries(PROTOCOL_TREE).map(([key, config]) => {
          const data = tree[key];
          const pct = totalEntries > 0 ? (data.count / totalEntries) * 100 : 0;
          const isActive = nav.rb === key;
          
          return (
            <div key={key} className={`tree-card ${isActive ? 'active' : ''}`} onClick={() => selectRB(key)}>
              <div className="card-header">
                <div>
                  <div className="card-title">{ARCHETYPE_METADATA[key]?.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{data.count} Teams</div>
                </div>
                <div className="card-pct">{pct.toFixed(1)}%</div>
              </div>
              <div className="progress-track">
                <div className="target-dot" style={{ left: `${config.target}%` }} />
                <div className="progress-fill" style={{ width: `${pct}%`, background: config.color || 'var(--accent-blue)' }} />
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                TARGET: {config.target}%
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
              
              return (
                <div key={key} className={`tree-card ${nav.qb === key ? 'active' : ''}`} onClick={() => selectQB(key)}>
                  <div className="card-header">
                    <div className="card-title">{ARCHETYPE_METADATA[key]?.name}</div>
                    <div className="card-pct">{pct.toFixed(0)}%</div>
                  </div>
                  <div className="progress-track">
                    <div className="target-dot" style={{ left: `${config.target}%` }} />
                    <div className="progress-fill" style={{ width: `${pct}%`, background: 'var(--text-secondary)' }} />
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
              
              return (
                <div key={key} className={`tree-card ${nav.te === key ? 'active' : ''}`} onClick={() => selectTE(key)}>
                  <div className="card-header">
                    <div className="card-title">{ARCHETYPE_METADATA[key]?.name}</div>
                    <div className="card-pct">{pct.toFixed(0)}%</div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Target: {target}%</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* DEEP DIVE: ROSTER LIST */}
      {nav.te && (
        <div className="config-section" style={{ padding: '1.5rem' }}>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontFamily: 'JetBrains Mono' }}>
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