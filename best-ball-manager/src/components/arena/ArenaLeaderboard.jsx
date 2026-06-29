// ArenaLeaderboard — the opt-in public leaderboard (ADR-013 / TASK-283).
// Enrolled teams ranked by hidden Elo, with W/L, win%, rank movement, a platform
// filter, and a "your rank" highlight for the signed-in owner. Owner identity is
// never shown for OTHER users' teams (only the viewer's own rows are flagged).

import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, RefreshCw, ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getLeaderboard, ARENA_AVAILABLE } from '../../utils/arenaClient';
import { ARCHETYPE_METADATA } from '../../utils/rosterArchetypes';
import { enrichSnapshotCLV } from '../../utils/arenaSnapshot';
import ArenaRosterCard from './ArenaRosterCard';
import css from '../Arena.module.css';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'underdog', label: 'Underdog' },
  { key: 'draftkings', label: 'DraftKings' },
];

const RANK_STORE_KEY = 'bbe_arena_lb_ranks';

// Client-side movement: compare each team's current rank to the rank it held the
// last time THIS browser viewed the same platform filter. No schema/history table
// needed (v1). Returns a map id -> delta (positive = moved up) and persists the
// new ranks for next time.
function computeMovement(rows, platform) {
  let store = {};
  try {
    store = JSON.parse(localStorage.getItem(RANK_STORE_KEY) || '{}');
  } catch { store = {}; }
  const prev = store[platform] || {};
  const moves = {};
  const next = {};
  rows.forEach((r, i) => {
    const rank = i + 1;
    next[r.id] = rank;
    moves[r.id] = prev[r.id] != null ? prev[r.id] - rank : null;
  });
  try {
    store[platform] = next;
    localStorage.setItem(RANK_STORE_KEY, JSON.stringify(store));
  } catch { /* ignore quota / private mode */ }
  return moves;
}

function archetypeSummary(path) {
  if (!path) return '';
  return [path.rb, path.qb, path.te]
    .map((k) => ARCHETYPE_METADATA[k]?.name)
    .filter(Boolean)
    .join(' · ');
}

function rankClass(rank) {
  if (rank === 1) return css.rankGold;
  if (rank === 2) return css.rankSilver;
  if (rank === 3) return css.rankBronze;
  return '';
}

function Movement({ delta }) {
  if (delta == null) return <span className={css.moveFlat}>•</span>;
  if (delta > 0) return <span className={css.moveUp}>▲{delta}</span>;
  if (delta < 0) return <span className={css.moveDown}>▼{Math.abs(delta)}</span>;
  return <span className={css.moveFlat}>—</span>;
}

export default function ArenaLeaderboard({ adpLookup }) {
  const { user } = useAuth();
  const [platform, setPlatform] = useState('all');
  const [rows, setRows] = useState(null); // null = loading
  const [moves, setMoves] = useState({});
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  // All setState happens after the await (or in catch) so the effect never sets
  // state synchronously. rows stays null until the first load resolves.
  useEffect(() => {
    if (!ARENA_AVAILABLE) return undefined;
    let ignore = false;
    (async () => {
      try {
        const data = await getLeaderboard({ platform });
        if (ignore) return;
        setRows(data);
        setMoves(computeMovement(data, platform));
        setError(null);
      } catch {
        if (!ignore) { setRows([]); setError('Couldn’t load the leaderboard.'); }
      }
    })();
    return () => { ignore = true; };
  }, [platform]);

  const yourBest = useMemo(() => {
    if (!user || !rows) return null;
    const idx = rows.findIndex((r) => r.user_id === user.id);
    return idx >= 0 ? { rank: idx + 1, row: rows[idx] } : null;
  }, [user, rows]);

  if (!ARENA_AVAILABLE) {
    return (
      <div className={css.stateBox}>
        <Trophy size={32} className={css.stateIcon} />
        <h3>The Arena is warming up</h3>
        <p>The leaderboard appears once the Arena is live and teams start collecting votes.</p>
      </div>
    );
  }

  return (
    <div className={css.lbWrap}>
      <div className={css.lbBar}>
        <div className={css.lbFilters}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`${css.lbChip} ${platform === f.key ? css.lbChipActive : ''}`}
              onClick={() => setPlatform(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        {yourBest && (
          <div className={css.lbYou}>
            Your best: <strong>#{yourBest.rank}</strong> · {Math.round(yourBest.row.elo)} Elo
          </div>
        )}
      </div>

      {error && <p className={css.errorNote}>{error}</p>}

      {rows === null ? (
        <div className={css.stateBox}><RefreshCw size={26} className={css.stateSpin} /><p>Loading rankings…</p></div>
      ) : rows.length === 0 ? (
        <div className={css.stateBox}>
          <Trophy size={32} className={css.stateIcon} />
          <h3>No ranked teams yet</h3>
          <p>Once teams are entered and votes come in, the leaderboard fills in here.</p>
        </div>
      ) : (
        <div className={css.lbTableWrap}>
          <div className={`${css.lbRow} ${css.lbHead}`}>
            <span className={css.cRank}>#</span>
            <span className={css.cTeam}>Team</span>
            <span className={css.cElo}>Elo</span>
            <span className={css.cRec}>W–L</span>
            <span className={css.cPct}>Win%</span>
            <span className={css.cMove}>Move</span>
          </div>
          {rows.map((r, i) => {
            const rank = i + 1;
            const games = r.wins + r.losses;
            const pct = games > 0 ? Math.round((r.wins / games) * 100) : null;
            const mine = user && r.user_id === user.id;
            const isOpen = expanded === r.id;
            return (
              <div key={r.id} className={css.lbRowGroup}>
                <button
                  className={`${css.lbRow} ${css.lbRowBtn} ${mine ? css.lbRowYou : ''}`}
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  aria-expanded={isOpen}
                >
                  <span className={`${css.cRank} ${css.rankBadge} ${rankClass(rank)}`}>{rank}</span>
                  <span className={css.cTeam}>
                    <span className={css.lbTeamLine}>
                      {mine && <span className={css.youTag}>You</span>}
                      <span className={css.lbArche}>{archetypeSummary(r.display_snapshot?.path) || 'Best-ball team'}</span>
                    </span>
                    <span className={css.lbTeamMeta}>
                      {r.platform === 'draftkings' ? 'DraftKings' : 'Underdog'}
                      {r.provisional ? ' · new' : ''}
                    </span>
                  </span>
                  <span className={`${css.cElo} ${css.eloVal}`}>{Math.round(r.elo)}</span>
                  <span className={css.cRec}>{r.wins}–{r.losses}</span>
                  <span className={css.cPct}>{pct == null ? '—' : `${pct}%`}</span>
                  <span className={css.cMove}><Movement delta={moves[r.id]} /><ChevronDown size={13} className={`${css.chev} ${isOpen ? css.chevOpen : ''}`} /></span>
                </button>
                {isOpen && (
                  <div className={css.lbExpand}>
                    <ArenaRosterCard snapshot={enrichSnapshotCLV(r.display_snapshot, adpLookup)} corner="neutral" cornerLabel={`Rank #${rank}`} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
