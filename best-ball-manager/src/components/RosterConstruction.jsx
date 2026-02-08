import React, { useState, useMemo } from 'react';
import { analyzeRosterConstructions, ROSTER_ARCHETYPES } from '../utils/rosterArchetypes';

const COLORS = {
  QB: '#bf44ef',
  RB: '#10b981',
  WR: '#f59e0b',
  TE: '#3b82f6',
  default: '#6b7280'
};

export default function RosterConstruction({ rosterData }) {
  const [selectedArchetype, setSelectedArchetype] = useState(null);
  
  const analysis = useMemo(() => {
    return analyzeRosterConstructions(rosterData, 12);
  }, [rosterData]);
  
  const { totalEntries, archetypes, entriesMap } = analysis;
  
  // Get details for selected archetype
  const selectedDetails = useMemo(() => {
    if (!selectedArchetype) return null;
    
    const archetype = archetypes.find(a => a.key === selectedArchetype);
    if (!archetype) return null;
    
    // Build roster details for each entry
    const rosterDetails = archetype.entries.map(entryId => {
      const roster = entriesMap[entryId];
      const sortedRoster = [...roster].sort((a, b) => (a.pick || 999) - (b.pick || 999));
      
      // Count positions
      const positionCounts = {};
      roster.forEach(player => {
        const pos = player.position || 'N/A';
        positionCounts[pos] = (positionCounts[pos] || 0) + 1;
      });
      
      return {
        entryId,
        roster: sortedRoster,
        positionCounts,
        totalPlayers: roster.length
      };
    });
    
    return {
      ...archetype,
      rosterDetails
    };
  }, [selectedArchetype, archetypes, entriesMap]);
  
  return (
    <div className="roster-construction">
      <div className="construction-header">
        <h2>Roster Construction Analysis</h2>
        <div className="construction-summary">
          <p>Analyzing {totalEntries} total roster{totalEntries !== 1 ? 's' : ''}</p>
        </div>
      </div>
      
      <div className="archetypes-grid">
        {archetypes.map(archetype => (
          <div 
            key={archetype.key}
            className={`archetype-card ${selectedArchetype === archetype.key ? 'selected' : ''}`}
            onClick={() => setSelectedArchetype(selectedArchetype === archetype.key ? null : archetype.key)}
            style={{ borderLeftColor: archetype.color }}
          >
            <div className="archetype-header">
              <h3>{archetype.name}</h3>
            </div>
            <p className="archetype-description">{archetype.description}</p>
            <div className="archetype-stats">
              <div className="stat-main">
                <span className="stat-percentage">{archetype.percentage}%</span>
                <span className="stat-count">({archetype.count}/{totalEntries})</span>
              </div>
              <div className="stat-bar-container">
                <div 
                  className="stat-bar"
                  style={{ 
                    width: `${archetype.percentage}%`,
                    backgroundColor: archetype.color
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {selectedDetails && (
        <div className="archetype-details">
          <div className="details-header">
            <h3>
              {selectedDetails.name} Rosters ({selectedDetails.count})
            </h3>
            <button 
              className="close-button"
              onClick={() => setSelectedArchetype(null)}
            >
              ✕
            </button>
          </div>
          
          <div className="rosters-list">
            {selectedDetails.rosterDetails.map(({ entryId, roster, positionCounts, totalPlayers }) => (
              <div key={entryId} className="roster-detail-card">
                <div className="roster-detail-header">
                  <h4>{entryId}</h4>
                  <span className="roster-size">{totalPlayers} players</span>
                </div>
                
                <div className="position-breakdown">
                  {Object.entries(positionCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([pos, count]) => (
                      <span key={pos} className="position-badge">
                        {pos}: {count}
                      </span>
                    ))}
                </div>
                
                <div className="round-timeline">
                  {Array.from({length: 20}, (_, i) => i + 1).map(round => {
                    const playersInRound = roster.filter(p => {
                      const r = typeof p.round === 'number' ? p.round : parseInt(p.round);
                      return r === round;
                    });
                    
                    return (
                      <div key={round} className="round-marker">
                        <div className="round-label">R{round}</div>
                        <div className="round-picks">
                          {playersInRound.map((p, idx) => (
                            <span 
                              key={idx} 
                              className="round-pick-badge"
                              style={{ backgroundColor: COLORS[p.position] || COLORS.default }}
                            >
                              {p.position}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                <div className="roster-players">
                  {roster.map((player, idx) => (
                    <div key={idx} className="player-item">
                      <span className="player-pick">#{player.pick}</span>
                      <span className="player-name">{player.name}</span>
                      <span className="player-position" style={{ color: COLORS[player.position] || COLORS.default }}>
                        {player.position}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <style jsx>{`
        .roster-construction {
          padding: 20px 0;
        }
        
        .construction-header {
          margin-bottom: 30px;
        }
        
        .construction-header h2 {
          margin: 0 0 10px 0;
          color: #1f2937;
        }
        
        .construction-summary p {
          margin: 0;
          color: #6b7280;
          font-size: 14px;
        }
        
        .archetypes-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
          margin-bottom: 30px;
        }
        
        .archetype-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-left: 4px solid;
          border-radius: 8px;
          padding: 20px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .archetype-card:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          transform: translateY(-2px);
        }
        
        .archetype-card.selected {
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
          border-left-width: 6px;
        }
        
        .archetype-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }
        
        
        .archetype-header h3 {
          margin: 0;
          font-size: 16px;
          color: #1f2937;
        }
        
        .archetype-description {
          margin: 0 0 8px 0;
          color: #6b7280;
          font-size: 13px;
          line-height: 1.5;
        }
        
        .archetype-stats {
          margin-top: 12px;
        }
        
        .stat-main {
          display: flex;
          align-items: baseline;
          gap: 8px;
          margin-bottom: 8px;
        }
        
        .stat-percentage {
          font-size: 24px;
          font-weight: 700;
          color: #1f2937;
        }
        
        .stat-count {
          font-size: 14px;
          color: #6b7280;
        }
        
        .stat-bar-container {
          height: 6px;
          background: #f3f4f6;
          border-radius: 3px;
          overflow: hidden;
        }
        
        .stat-bar {
          height: 100%;
          transition: width 0.3s ease;
        }
        
        .archetype-details {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 24px;
          margin-top: 20px;
        }
        
        .details-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 2px solid #e5e7eb;
        }
        
        .details-header h3 {
          margin: 0;
          display: flex;
          align-items: center;
          gap: 10px;
          color: #1f2937;
        }
        
        .close-button {
          background: #f3f4f6;
          border: none;
          border-radius: 6px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 18px;
          color: #6b7280;
          transition: all 0.2s;
        }
        
        .close-button:hover {
          background: #e5e7eb;
          color: #1f2937;
        }
        
        .rosters-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
          gap: 20px;
        }
        
        .roster-detail-card {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 16px;
        }
        
        .roster-detail-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        
        .roster-detail-header h4 {
          margin: 0;
          color: #1f2937;
          font-size: 16px;
        }
        
        .roster-size {
          font-size: 13px;
          color: #6b7280;
        }
        
        .position-breakdown {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid #e5e7eb;
        }
        
        .position-badge {
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          padding: 4px 10px;
          font-size: 12px;
          font-weight: 600;
          color: #374151;
        }
        
        .round-timeline {
          display: flex;
          gap: 4px;
          margin-bottom: 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid #e5e7eb;
          overflow-x: auto;
        }
        
        .round-marker {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 45px;
        }
        
        .round-label {
          font-size: 10px;
          font-weight: 700;
          color: #9ca3af;
          text-align: center;
        }
        
        .round-picks {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-height: 20px;
        }
        
        .round-pick-badge {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 4px;
          border-radius: 3px;
          text-align: center;
          color: white;
        }
        
        .roster-players {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 400px;
          overflow-y: auto;
          padding-right: 4px;
        }
        
        .roster-players::-webkit-scrollbar {
          width: 6px;
        }
        
        .roster-players::-webkit-scrollbar-track {
          background: #f3f4f6;
          border-radius: 3px;
        }
        
        .roster-players::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 3px;
        }
        
        .roster-players::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }
        
        .player-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
          background: white;
          border-radius: 4px;
          font-size: 13px;
        }
        
        .player-pick {
          font-weight: 600;
          color: #6b7280;
          min-width: 35px;
        }
        
        .player-name {
          flex: 1;
          color: #1f2937;
        }
        
        .player-position {
          font-weight: 700;
          font-size: 12px;
          min-width: 30px;
          text-align: right;
        }
      `}</style>
    </div>
  );
}