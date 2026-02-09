import React, { useState, useMemo } from 'react';
import { classifyRoster, ROSTER_ARCHETYPES } from '../utils/rosterArchetypes';

// --- Configuration: Define the "Winning Combinations" ---
const STRATEGY_BUCKETS = [
  {
    id: 'GOD_SQUAD',
    name: 'The God Squad',
    description: 'Zero RB + Elite QB + Elite TE',
    target: 25,
    color: '#8b5cf6', // Purple
    matcher: (tags) => tags.includes('RB_ZERO') && tags.includes('QB_ELITE') && tags.includes('TE_ELITE')
  },
  {
    id: 'WR_AVALANCHE',
    name: 'The WR Avalanche',
    description: 'Hyper Fragile RB + Late QB + Late TE',
    target: 25,
    color: '#f97316', // Orange
    matcher: (tags) => tags.includes('RB_HYPER_FRAGILE') && tags.includes('QB_LATE') && tags.includes('TE_LATE')
  },
  {
    id: 'RELIABLE_SPIKE',
    name: 'The Reliable Spike',
    description: 'Hero RB + Core QB + Anchor TE',
    target: 20,
    color: '#4bf1db', // Teal
    matcher: (tags) => tags.includes('RB_HERO') && tags.includes('QB_CORE') && tags.includes('TE_ANCHOR')
  },
  {
    id: 'ZERO_MID',
    name: 'Zero RB / Mid-Late',
    description: 'Zero RB + Core QB + Late TE',
    target: 15,
    color: '#a78bfa', // Light Purple
    matcher: (tags) => tags.includes('RB_ZERO') && tags.includes('QB_CORE') && tags.includes('TE_LATE')
  },
  {
    id: 'FRAGILE_MID',
    name: 'Hyper Fragile / Mid-Late',
    description: 'Hyper Fragile RB + Core QB + Late TE',
    target: 15,
    color: '#fdba74', // Light Orange
    matcher: (tags) => tags.includes('RB_HYPER_FRAGILE') && tags.includes('QB_CORE') && tags.includes('TE_LATE')
  },
  // Catch-all for everything else
  {
    id: 'OFF_META',
    name: 'Off-Meta / Suboptimal',
    description: 'Combinations that lack structural leverage (e.g., Fragile + Elite QB)',
    target: 0,
    color: '#ef4444', // Red
    matcher: () => true // Fallback
  }
];

const COLORS = {
  QB: '#bf44ef',
  RB: '#10b981',
  WR: '#f59e0b',
  TE: '#3b82f6',
  default: '#6b7280'
};

export default function RosterConstruction({ rosterData }) {
  const [selectedStrategy, setSelectedStrategy] = useState(null);

  // --- Analysis Engine ---
  const analysis = useMemo(() => {
    const totalEntries = rosterData.length;
    const bucketCounts = {};
    const bucketEntries = {};

    // Initialize buckets
    STRATEGY_BUCKETS.forEach(bucket => {
      bucketCounts[bucket.id] = 0;
      bucketEntries[bucket.id] = [];
    });

    // Process each roster
    rosterData.forEach(entry => {
      const tags = classifyRoster(entry.roster); // Uses your helper function
      
      // Find the first matching strategy
      const strategy = STRATEGY_BUCKETS.find(bucket => bucket.id !== 'OFF_META' && bucket.matcher(tags)) 
                      || STRATEGY_BUCKETS.find(b => b.id === 'OFF_META');
      
      bucketCounts[strategy.id]++;
      bucketEntries[strategy.id].push({
        ...entry,
        tags // Store tags for display
      });
    });

    return {
      totalEntries,
      strategies: STRATEGY_BUCKETS.map(bucket => ({
        ...bucket,
        count: bucketCounts[bucket.id],
        percentage: totalEntries > 0 ? Math.round((bucketCounts[bucket.id] / totalEntries) * 100) : 0,
        entries: bucketEntries[bucket.id]
      }))
    };
  }, [rosterData]);

  const activeStrategyData = selectedStrategy 
    ? analysis.strategies.find(s => s.id === selectedStrategy) 
    : null;

  return (
    <div className="portfolio-dashboard">
      <div className="dashboard-header">
        <div>
          <h2>Portfolio Architecture</h2>
          <p>Alignment with Top-0.1% Bimodal Volatility Protocol</p>
        </div>
        <div className="portfolio-stats">
          <div className="stat-badge">
            <span className="label">Total Entries</span>
            <span className="value">{analysis.totalEntries}</span>
          </div>
        </div>
      </div>

      {/* --- Strategy Grid --- */}
      <div className="strategy-grid">
        {analysis.strategies.map(strategy => {
          const isSelected = selectedStrategy === strategy.id;
          const delta = strategy.percentage - strategy.target;
          const isOffMeta = strategy.id === 'OFF_META';
          
          return (
            <div 
              key={strategy.id}
              className={`strategy-card ${isSelected ? 'selected' : ''} ${isOffMeta && strategy.count > 0 ? 'warning' : ''}`}
              onClick={() => setSelectedStrategy(isSelected ? null : strategy.id)}
              style={{ borderTopColor: strategy.color }}
            >
              <div className="card-header">
                <h3>{strategy.name}</h3>
                <span className="count-badge" style={{ backgroundColor: strategy.color + '20', color: strategy.color }}>
                  {strategy.count} teams
                </span>
              </div>
              
              <p className="description">{strategy.description}</p>
              
              <div className="allocation-meter">
                <div className="meter-labels">
                  <span>Actual: <strong>{strategy.percentage}%</strong></span>
                  <span className="target-label">Target: {strategy.target}%</span>
                </div>
                
                <div className="meter-track">
                  {/* Target Marker */}
                  {strategy.target > 0 && (
                    <div 
                      className="target-marker" 
                      style={{ left: `${strategy.target}%` }} 
                      title={`Target: ${strategy.target}%`} 
                    />
                  )}
                  {/* Actual Fill */}
                  <div 
                    className="meter-fill"
                    style={{ 
                      width: `${strategy.percentage}%`,
                      backgroundColor: strategy.color
                    }}
                  />
                </div>
                
                {strategy.target > 0 && (
                  <div className={`delta-indicator ${Math.abs(delta) > 5 ? 'alert' : 'good'}`}>
                    {delta > 0 ? '+' : ''}{delta}% vs Target
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* --- Detailed Roster View (Expandable) --- */}
      {activeStrategyData && (
        <div className="strategy-details-panel">
          <div className="panel-header">
            <h3>Analyzing: {activeStrategyData.name}</h3>
            <button className="close-btn" onClick={() => setSelectedStrategy(null)}>✕ Close</button>
          </div>

          <div className="roster-list">
            {activeStrategyData.entries.map((entry, index) => (
              <RosterCard key={entry.id || index} entry={entry} tags={entry.tags} />
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .portfolio-dashboard {
          padding: 24px;
          background: #f8fafc;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 32px;
        }

        .dashboard-header h2 {
          margin: 0;
          color: #1e293b;
          font-size: 24px;
        }

        .dashboard-header p {
          margin: 4px 0 0;
          color: #64748b;
        }

        .stat-badge {
          background: white;
          padding: 8px 16px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .stat-badge .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; }
        .stat-badge .value { font-size: 20px; font-weight: 700; color: #0f172a; }

        /* Strategy Grid */
        .strategy-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
          margin-bottom: 32px;
        }

        .strategy-card {
          background: white;
          border-radius: 12px;
          padding: 20px;
          border: 1px solid #e2e8f0;
          border-top-width: 4px;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .strategy-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        }

        .strategy-card.selected {
          ring: 2px solid #3b82f6;
          box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
        }

        .strategy-card.warning {
          background-color: #fef2f2;
          border-color: #fee2e2;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: start;
          margin-bottom: 12px;
        }

        .card-header h3 {
          margin: 0;
          font-size: 16px;
          color: #1e293b;
          font-weight: 600;
        }

        .count-badge {
          font-size: 12px;
          padding: 2px 8px;
          border-radius: 12px;
          font-weight: 600;
        }

        .description {
          font-size: 13px;
          color: #64748b;
          margin: 0 0 20px 0;
          line-height: 1.4;
          height: 36px; /* Fixed height for alignment */
        }

        /* Meters */
        .allocation-meter {
          background: #f8fafc;
          padding: 12px;
          border-radius: 8px;
        }

        .meter-labels {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          margin-bottom: 6px;
          color: #475569;
        }

        .meter-track {
          height: 8px;
          background: #e2e8f0;
          border-radius: 4px;
          position: relative;
          margin-bottom: 8px;
        }

        .meter-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 0.5s ease-out;
        }

        .target-marker {
          position: absolute;
          top: -2px;
          bottom: -2px;
          width: 2px;
          background: #0f172a;
          z-index: 2;
        }

        .delta-indicator {
          font-size: 11px;
          text-align: right;
          font-weight: 500;
        }
        .delta-indicator.good { color: #10b981; }
        .delta-indicator.alert { color: #ef4444; }

        /* Details Panel */
        .strategy-details-panel {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 24px;
          animation: slideDown 0.3s ease-out;
        }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 1px solid #e2e8f0;
        }

        .close-btn {
          background: none;
          border: none;
          color: #64748b;
          cursor: pointer;
          font-size: 14px;
        }

        .roster-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
          gap: 16px;
        }
      `}</style>
    </div>
  );
}

// --- Sub-Component: Individual Roster Card ---
function RosterCard({ entry, tags }) {
  // Sort roster by round/pick
  const sortedRoster = [...entry.roster].sort((a, b) => 
    (parseInt(a.pick) || 0) - (parseInt(b.pick) || 0)
  );
  
  // Calculate Position Counts
  const counts = sortedRoster.reduce((acc, p) => {
    acc[p.position] = (acc[p.position] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="roster-card">
      <div className="roster-header">
        <div className="roster-meta">
          <span className="entry-id">#{entry.entryId || 'Entry'}</span>
          <div className="tag-row">
            {tags.map(tag => (
              <span key={tag} className="mini-tag">{tag.replace('RB_', '').replace('QB_', '').replace('TE_', '')}</span>
            ))}
          </div>
        </div>
        <div className="roster-counts">
          {['QB', 'RB', 'WR', 'TE'].map(pos => (
            <span key={pos} className={`count-pill ${pos}`}>
              {pos} {counts[pos] || 0}
            </span>
          ))}
        </div>
      </div>

      <div className="pick-visualization">
        {/* Render rounds 1-10 as blocks */}
        <div className="draft-strip">
          {sortedRoster.slice(0, 10).map((player, i) => (
            <div 
              key={i} 
              className="draft-pick" 
              style={{ backgroundColor: COLORS[player.position] || COLORS.default }}
              title={`${player.name} (${player.position})`}
            >
              <span className="pick-pos">{player.position}</span>
              <span className="pick-round">{i + 1}</span>
            </div>
          ))}
        </div>
        <div className="key-players">
          {sortedRoster.slice(0, 3).map(p => p.name).join(', ')}...
        </div>
      </div>

      <style jsx>{`
        .roster-card {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 16px;
          background: #fff;
        }

        .roster-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .mini-tag {
          font-size: 10px;
          background: #f1f5f9;
          color: #64748b;
          padding: 2px 6px;
          border-radius: 4px;
          margin-right: 4px;
        }

        .roster-counts { display: flex; gap: 6px; }
        
        .count-pill {
          font-size: 11px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 4px;
          background: #f3f4f6;
          color: #475569;
        }

        .draft-strip {
          display: flex;
          gap: 2px;
          margin-bottom: 8px;
        }

        .draft-pick {
          flex: 1;
          height: 32px;
          border-radius: 2px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 10px;
        }

        .pick-pos { font-weight: 700; line-height: 1; }
        .pick-round { font-size: 8px; opacity: 0.8; }

        .key-players {
          font-size: 12px;
          color: #64748b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </div>
  );
}