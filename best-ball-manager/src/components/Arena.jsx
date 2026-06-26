// Arena — the Best Ball Arena pillar (ADR-013). A new /arena tab with a blind
// head-to-head voting screen (free + guest). Leaderboard and team enrollment
// are added by TASK-283 and TASK-284. Mirror-Not-Advisor is carved out here on
// purpose: the Arena is the explicit competitive zone where crowd opinion is the
// product (the analytics tabs stay single-user mirrors).

import React, { useState } from 'react';
import { Swords, X } from 'lucide-react';
import ArenaVote from './arena/ArenaVote';
import ArenaLeaderboard from './arena/ArenaLeaderboard';
import ArenaMyTeams from './arena/ArenaMyTeams';
import css from './Arena.module.css';

const NAV = [
  { key: 'vote', label: 'Vote' },
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'myteams', label: 'My Teams' },
];

function ArenaHelp({ onClose }) {
  return (
    <div className={css.help}>
      <button className={css.helpClose} onClick={onClose} aria-label="Close help"><X size={16} /></button>
      <h3>How the Arena works</h3>
      <ul>
        <li><strong>Vote</strong> — two real best-ball teams, shown blind (no owners). Pick the one you’d rather have. Your vote nudges each team’s hidden Elo rating.</li>
        <li><strong>Blind &amp; fair</strong> — owner identity is never shown while voting, and you’ll never be shown your own teams.</li>
        <li><strong>Free to play</strong> — anyone can vote. Entering your own teams to be ranked is a Pro feature.</li>
      </ul>
    </div>
  );
}

export default function Arena({ rosterData, helpOpen, onHelpToggle }) {
  const [view, setView] = useState('vote');

  return (
    <div className={css.root}>
      <div className={css.toolbar}>
        <div className={css.brand}>
          <Swords size={18} />
          <span>Best Ball Arena</span>
        </div>
        <nav className={css.subnav} aria-label="Arena sections">
          {NAV.map(({ key, label }) => (
            <button
              key={key}
              className={`${css.subnavBtn} ${view === key ? css.subnavActive : ''}`}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {helpOpen && <ArenaHelp onClose={onHelpToggle} />}

      <div className={css.body}>
        {view === 'vote' && <ArenaVote onGoToMyTeams={() => setView('myteams')} />}
        {view === 'leaderboard' && <ArenaLeaderboard />}
        {view === 'myteams' && <ArenaMyTeams rosterData={rosterData} />}
      </div>
    </div>
  );
}
