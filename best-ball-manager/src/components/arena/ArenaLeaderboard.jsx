// ArenaLeaderboard — the opt-in public leaderboard (ADR-013 / TASK-283).
// Enrolled teams ranked by hidden Elo, with W/L, win%, rank movement, and a
// "your rank" highlight for the signed-in owner. Owner identity is never shown
// for OTHER users' teams (only the viewer's own rows are flagged). The whole
// board is scoped to the featured tournament (BBM7) — no platform or tournament
// filters until more slates are presented.

import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, RefreshCw, ChevronDown, LocateFixed } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getLeaderboard, getMyBestArenaTeam, getArenaRank, ARENA_AVAILABLE } from '../../utils/arenaClient';
import { FEATURED_TOURNAMENT } from '../../utils/arenaFeatured';
import { ARCHETYPE_METADATA } from '../../utils/rosterArchetypes';
import { enrichSnapshotCLV } from '../../utils/arenaSnapshot';
import ArenaRosterCard from './ArenaRosterCard';
import css from '../Arena.module.css';

const RANK_STORE_KEY = 'bbe_arena_lb_ranks';
// Single BBM7 view for now; the store stays keyed so past per-filter entries are
// simply ignored and future views can bring their own key.
const RANK_VIEW_KEY = 'featured:bbm7';

// Client-side movement: compare each team's current rank to the rank it held the
// last time THIS browser viewed the board. No schema/history table needed (v1).
// Returns a map id -> delta (positive = moved up) and persists the new ranks.
function computeMovement(rows, viewKey) {
  let store = {};
  try {
    store = JSON.parse(localStorage.getItem(RANK_STORE_KEY) || '{}');
  } catch { store = {}; }
  const prev = store[viewKey] || {};
  const moves = {};
  const next = {};
  rows.forEach((r, i) => {
    const rank = i + 1;
    next[r.id] = rank;
    moves[r.id] = prev[r.id] != null ? prev[r.id] - rank : null;
  });
  try {
    store[viewKey] = next;
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
  const [rows, setRows] = useState(null); // null = loading
  const [moves, setMoves] = useState({});
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [yourRank, setYourRank] = useState(null); // {best, rank, total} | null
  const [flashId, setFlashId] = useState(null);

  // All setState happens after the await (or in catch) so the effect never sets
  // state synchronously. rows stays null until the first load resolves.
  useEffect(() => {
    if (!ARENA_AVAILABLE) return undefined;
    let ignore = false;
    (async () => {
      try {
        const data = await getLeaderboard({ tournament: 'featured' });
        if (ignore) return;
        setRows(data);
        setMoves(computeMovement(data, RANK_VIEW_KEY));
        setError(null);
      } catch {
        if (!ignore) { setRows([]); setError('Couldn’t load the leaderboard.'); }
      }
    })();
    return () => { ignore = true; };
  }, []);

  // Your-team banner (TASK-303): true rank via server counts, so it stays correct
  // even when the viewer's best team sits beyond the fetched leaderboard page.
  useEffect(() => {
    // No sync setState here (lint: set-state-in-effect); the banner render-gates on
    // `user`, so a stale value from a previous sign-in is never shown.
    if (!ARENA_AVAILABLE || !user) return undefined;
    let ignore = false;
    (async () => {
      try {
        const best = await getMyBestArenaTeam({ tournament: 'featured' });
        if (ignore) return;
        if (!best) { setYourRank(null); return; }
        const rank = await getArenaRank({ elo: best.elo, tournament: 'featured' });
        if (!ignore) setYourRank(rank ? { best, ...rank } : null);
      } catch {
        if (!ignore) setYourRank(null); // banner is progressive enhancement — never block the table
      }
    })();
    return () => { ignore = true; };
  }, [user]);

  // Elo bars are scaled within the visible rows, so the spread reads at a glance.
  const eloRange = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const vals = rows.map((r) => r.elo);
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [rows]);
  const eloPct = (elo) => {
    if (!eloRange || eloRange.max === eloRange.min) return 100;
    return 10 + (90 * (elo - eloRange.min)) / (eloRange.max - eloRange.min);
  };

  const findMyRow = () => {
    const id = yourRank?.best?.id;
    if (!id) return;
    const el = document.getElementById(`arena-lb-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashId(id);
    setTimeout(() => setFlashId(null), 1800);
  };

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
        <span className={css.lbScope}>
          <Trophy size={13} /> {FEATURED_TOURNAMENT.label}
          <span className={css.lbScopeMeta}>· ranked by community vote</span>
        </span>
      </div>

      {user && yourRank && (
        <div className={css.lbBanner}>
          <div className={css.lbBannerMain}>
            <span className={css.lbBannerRank}>#{yourRank.rank}</span>
            <div className={css.lbBannerText}>
              <span className={css.lbBannerTitle}>Your best team</span>
              <span className={css.lbBannerMeta}>
                {yourRank.total > 0 && (
                  <>Top {Math.max(1, Math.ceil((yourRank.rank / yourRank.total) * 100))}% of {yourRank.total.toLocaleString()} teams · </>
                )}
                {Math.round(yourRank.best.elo)} Elo · {yourRank.best.wins}–{yourRank.best.losses}
              </span>
            </div>
          </div>
          {rows?.some((r) => r.id === yourRank.best.id) && (
            <button className={css.lbFindBtn} onClick={findMyRow}>
              <LocateFixed size={14} /> Find my team
            </button>
          )}
        </div>
      )}

      {error && <p className={css.errorNote}>{error}</p>}

      {rows === null ? (
        <div className={css.stateBox}><RefreshCw size={26} className={css.stateSpin} /><p>Loading rankings…</p></div>
      ) : rows.length === 0 ? (
        // A failed fetch also lands here with rows=[] — show only the error note
        // above, not a contradictory "no teams yet" message.
        error ? null : (
          <div className={css.stateBox}>
            <Trophy size={32} className={css.stateIcon} />
            <h3>No ranked teams yet</h3>
            <p>Once teams are entered and votes come in, the leaderboard fills in here.</p>
          </div>
        )
      ) : (
        <>
          {rows.length >= 3 && (
            <div className={css.podium}>
              {[{ r: rows[1], rank: 2 }, { r: rows[0], rank: 1 }, { r: rows[2], rank: 3 }].map(({ r, rank }) => (
                <button
                  key={r.id}
                  className={`${css.podiumCard} ${rank === 1 ? css.podiumFirst : ''}`}
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  title="Show roster"
                >
                  <span className={css.podiumHead}>
                    <span className={`${css.rankBadge} ${rankClass(rank)}`}>{rank}</span>
                  </span>
                  <span className={css.podiumElo}>{Math.round(r.elo)}</span>
                  <span className={css.podiumArche}>{archetypeSummary(r.display_snapshot?.path) || 'Best-ball team'}</span>
                  <span className={css.podiumRec}>{r.wins}–{r.losses}{r.wins + r.losses > 0 ? ` · ${Math.round((r.wins / (r.wins + r.losses)) * 100)}%` : ''}</span>
                </button>
              ))}
            </div>
          )}
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
                <div key={r.id} id={`arena-lb-${r.id}`} className={css.lbRowGroup}>
                  <button
                    className={`${css.lbRow} ${css.lbRowBtn} ${mine ? css.lbRowYou : ''} ${flashId === r.id ? css.rowFlash : ''}`}
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                    aria-expanded={isOpen}
                  >
                    <span className={`${css.cRank} ${css.rankBadge} ${rankClass(rank)}`}>{rank}</span>
                    <span className={css.cTeam}>
                      <span className={css.lbTeamLine}>
                        {mine && <span className={css.youTag}>You</span>}
                        <span className={css.lbArche}>{archetypeSummary(r.display_snapshot?.path) || 'Best-ball team'}</span>
                      </span>
                      {r.provisional && <span className={css.lbTeamMeta}>new</span>}
                    </span>
                    <span className={css.cElo}>
                      <span className={css.eloWrap}>
                        <span className={css.eloVal}>{Math.round(r.elo)}</span>
                        <span className={css.eloTrack}>
                          <span className={css.eloFill} style={{ width: `${eloPct(r.elo)}%` }} />
                        </span>
                      </span>
                    </span>
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
        </>
      )}
    </div>
  );
}
