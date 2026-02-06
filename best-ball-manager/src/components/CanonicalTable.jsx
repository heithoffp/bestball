import React from 'react';

export default function CanonicalTable({ masterPlayers }) {
  return (
    <>
      <h2>Canonical Player Table</h2>
      <table>
        <thead>
          <tr>
            <th>Player ID</th><th>Player</th><th>Pos</th><th>Team</th><th>Rookie</th>
          </tr>
        </thead>
        <tbody>
          {masterPlayers.map(p => (
            <tr key={p.player_id}>
              <td style={{ fontFamily: 'JetBrains Mono, monospace' }}>{p.player_id}</td>
              <td>{p.name}</td>
              <td>{p.position}</td>
              <td>{p.team}</td>
              <td>{p.rookie ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
