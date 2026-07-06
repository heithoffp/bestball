// ArenaLeaderboard — the opt-in public leaderboard (ADR-013 / TASK-283).
// Enrolled teams ranked by hidden Elo, with W/L, win%, rank movement, and a
// "your rank" highlight for the signed-in owner. Owner identity is never shown
// for OTHER users' teams (only the viewer's own rows are flagged). The whole
// board is scoped to the featured tournament (BBM7) — no platform or tournament
// filters until more slates are presented.
//
// Each row previews the same portfolio facts the Rosters tab leads with — draft
// date, position build, avg CLV — so a team can be sized up before expanding it.
// A chip-based player / NFL-team search filters the board to teams carrying every
// selected chip ("the best team with X and Y"), best Elo first.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trophy, RefreshCw, ChevronDown, ChevronLeft, ChevronRight, LocateFixed, Search, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getLeaderboard, searchLeaderboard, getMyBestArenaTeam, getArenaRank, ARENA_AVAILABLE } from '../../utils/arenaClient';
import { FEATURED_TOURNAMENT } from '../../utils/arenaFeatured';
import { ARCHETYPE_METADATA } from '../../utils/rosterArchetypes';
import { enrichSnapshotCLV } from '../../utils/arenaSnapshot';
import { NFL_TEAMS, teamAbbrev } from '../../utils/nflTeams';
import { nflTeamColor } from '../../utils/nflTeamColors';
import { posColor } from '../../utils/positionColors';
import ArenaRosterCard from './ArenaRosterCard';
import css from '../Arena.module.css';

const RANK_STORE_KEY = 'bbe_arena_lb_ranks';
// Single BBM7 view for now; the store stays keyed so past per-filter entries are
// simply ignored and future views can bring their own key.
const RANK_VIEW_KEY = 'featured:bbm7';
const PAGE_SIZE = 50;
const SEARCH_LIMIT = 50;

// Client-side movement: compare each team's current rank to the rank it held the
// last time THIS browser viewed the board. No schema/history table needed (v1).
// Ranks are global (offset + index), not page-relative, so movement stays correct
// no matter which page a team currently lands on.
// Returns a map id -> delta (positive = moved up) and persists the new ranks.
function computeMovement(rows, viewKey, offset) {
  let store = {};
  try {
    store = JSON.parse(localStorage.getItem(RANK_STORE_KEY) || '{}');
  } catch { store = {}; }
  const prev = store[viewKey] || {};
  const moves = {};
  const next = { ...prev };
  rows.forEach((r, i) => {
    const rank = offset + i + 1;
    next[r.id] = rank;
    moves[r.id] = prev[r.id] != null ? prev[r.id] - rank : null;
  });
  try {
    store[viewKey] = next;
    localStorage.setItem(RANK_STORE_KEY, JSON.stringify(store));
  } catch { /* ignore quota / private mode */ }
  return moves;
}

// Windowed page numbers with ellipsis gaps: first, last, and a run around the
// current page — keeps the control compact even with hundreds of pages.
function pageWindow(page, pageCount) {
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  return [...pages]
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b)
    .reduce((acc, p) => {
      if (acc.length > 0 && p - acc[acc.length - 1] > 1) acc.push('…');
      acc.push(p);
      return acc;
    }, []);
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

// "2026-06-12" -> "Jun 12" (year appended only when it isn't the current year).
function draftDateLabel(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d)) return null;
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

// Escape SQL LIKE wildcards in a user-entered / player-name term.
function escapeLike(s) {
  return s.replace(/[\\%_]/g, '\\$&');
}

// The pre-click preview facts for one snapshot: draft date, position build
// ("2QB 6RB 8WR 4TE"), and avg CLV recomputed against the viewer's ADP (stored
// values can be stale — same treatment as the expanded card).
function snapshotMeta(snapshot, adpLookup) {
  const snap = enrichSnapshotCLV(snapshot, adpLookup) || {};
  const posSnap = snap.posSnap || {};
  const build = ['QB', 'RB', 'WR', 'TE']
    .map((p) => (posSnap[p] ? `${posSnap[p]}${p}` : null))
    .filter(Boolean)
    .join(' ');
  return {
    date: snap.draftedAt ? draftDateLabel(snap.draftedAt) : null,
    build: build || null,
    clv: Number.isFinite(snap.avgCLV) ? snap.avgCLV : null,
  };
}

function BuildMeta({ meta }) {
  if (!meta || (!meta.date && !meta.build && meta.clv == null)) return null;
  return (
    <span className={css.lbBuildLine}>
      {meta.date && <span className={css.lbMetaBit}>{meta.date}</span>}
      {meta.build && <span className={css.lbMetaBit}>{meta.build}</span>}
      {meta.clv != null && (
        <span className={`${css.lbMetaBit} ${meta.clv >= 0 ? css.lbClvPos : css.lbClvNeg}`}>
          {meta.clv >= 0 ? '+' : ''}{meta.clv.toFixed(1)}% CLV
        </span>
      )}
    </span>
  );
}

export default function ArenaLeaderboard({ adpLookup, comboLookup = null, masterPlayers = null }) {
  const { user } = useAuth();
  const [rows, setRows] = useState(null); // null = loading
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [moves, setMoves] = useState({});
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [yourRank, setYourRank] = useState(null); // {best, rank, total} | null
  const [flashId, setFlashId] = useState(null);
  const [pendingScrollId, setPendingScrollId] = useState(null);

  // Search chips: {key, kind: 'player'|'team'|'text', label, meta?, color?, pattern}.
  const [chips, setChips] = useState([]);
  const [query, setQuery] = useState('');
  const [searchFocus, setSearchFocus] = useState(false);
  const [searchRes, setSearchRes] = useState(null); // {key, rows, total, error}
  const searchInputRef = useRef(null);

  const offset = (page - 1) * PAGE_SIZE;

  // All setState happens after the await (or in catch) so the effect never sets
  // state synchronously. rows stays null until the first load resolves.
  useEffect(() => {
    if (!ARENA_AVAILABLE) return undefined;
    let ignore = false;
    (async () => {
      try {
        const { rows: data, total: count } = await getLeaderboard({ tournament: 'featured', limit: PAGE_SIZE, offset });
        if (ignore) return;
        setRows(data);
        setTotal(count);
        setMoves(computeMovement(data, RANK_VIEW_KEY, offset));
        setError(null);
      } catch {
        if (!ignore) { setRows([]); setError('Couldn’t load the leaderboard.'); }
      }
    })();
    return () => { ignore = true; };
  }, [offset]);

  // Search fetch. Keyed by the chip set: while searchRes.key trails chipsKey the
  // view is loading — no synchronous "reset" setState needed (lint: set-state-in-effect).
  const chipsKey = chips.map((c) => c.key).join('|');
  useEffect(() => {
    if (!ARENA_AVAILABLE || chips.length === 0) return undefined;
    let ignore = false;
    const key = chipsKey;
    (async () => {
      try {
        const { rows: data, total: count } = await searchLeaderboard({
          patterns: chips.map((c) => c.pattern),
          tournament: 'featured',
          limit: SEARCH_LIMIT,
        });
        if (!ignore) setSearchRes({ key, rows: data, total: count, error: null });
      } catch {
        if (!ignore) setSearchRes({ key, rows: [], total: 0, error: 'Couldn’t run the search.' });
      }
    })();
    return () => { ignore = true; };
  }, [chips, chipsKey]);

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

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const searching = chips.length > 0;
  const searchLoading = searching && searchRes?.key !== chipsKey;
  const shownRows = searching ? (searchLoading ? null : searchRes.rows) : rows;
  const shownError = searching ? (searchLoading ? null : searchRes?.error) : error;

  // Suggestions: the viewer's master player list (names match snapshot names —
  // same normName equality buildAdpLookup relies on) plus the 32 NFL teams.
  const chipKeys = useMemo(() => new Set(chips.map((c) => c.key)), [chips]);
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const seen = new Set();
    const players = [];
    (masterPlayers || []).forEach((p) => {
      const name = p?.name;
      if (!name) return;
      const lower = name.toLowerCase();
      if (!lower.includes(q) || seen.has(lower)) return;
      seen.add(lower);
      players.push(p);
    });
    players.sort((a, b) => (Number(a.adpPick) || 9999) - (Number(b.adpPick) || 9999));
    const out = players.slice(0, 6).map((p) => ({
      key: `p:${p.name.toLowerCase()}`,
      kind: 'player',
      label: p.name,
      meta: [p.position, p.team && p.team !== 'N/A' ? teamAbbrev(p.team) : null].filter(Boolean).join(' · '),
      color: posColor(p.position),
      pattern: `%${escapeLike(p.name)}%`,
    }));
    const seenTeams = new Set();
    Object.entries(NFL_TEAMS).forEach(([abbr, full]) => {
      if (seenTeams.has(full)) return; // JAC/JAX both map to the Jaguars
      if (!abbr.toLowerCase().startsWith(q) && !full.toLowerCase().includes(q)) return;
      seenTeams.add(full);
      out.push({
        key: `t:${full}`,
        kind: 'team',
        label: full.split(' ').pop(),
        meta: 'NFL team',
        color: nflTeamColor(abbr),
        // Snapshots store teams as the platform stored them; the featured (UD)
        // board carries full names, so the full name is the match key.
        pattern: `%${escapeLike(full)}%`,
      });
    });
    return out.filter((s) => !chipKeys.has(s.key)).slice(0, 8);
  }, [query, masterPlayers, chipKeys]);

  const addChip = (chip) => {
    setChips((prev) => (prev.some((c) => c.key === chip.key) ? prev : [...prev, chip]));
    setQuery('');
  };
  const removeChip = (key) => setChips((prev) => prev.filter((c) => c.key !== key));

  const onSearchKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const term = query.trim();
      if (suggestions.length > 0) addChip(suggestions[0]);
      else if (term.length >= 2) {
        // Free-text chip — covers name spellings the master list doesn't carry.
        addChip({ key: `x:${term.toLowerCase()}`, kind: 'text', label: term, pattern: `%${escapeLike(term)}%` });
      }
    } else if (e.key === 'Backspace' && query === '' && chips.length > 0) {
      setChips((prev) => prev.slice(0, -1));
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  };

  // Preview facts per visible row (normal board + search results share the map).
  const metaById = useMemo(() => {
    const map = {};
    [...(rows || []), ...(searchRes?.rows || [])].forEach((r) => {
      map[r.id] = snapshotMeta(r.display_snapshot, adpLookup);
    });
    return map;
  }, [rows, searchRes, adpLookup]);

  // Elo bars are scaled within the visible rows, so the spread reads at a glance.
  const eloRange = useMemo(() => {
    if (!shownRows || shownRows.length === 0) return null;
    const vals = shownRows.map((r) => r.elo);
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [shownRows]);
  const eloPct = (elo) => {
    if (!eloRange || eloRange.max === eloRange.min) return 100;
    return 10 + (90 * (elo - eloRange.min)) / (eloRange.max - eloRange.min);
  };

  const scrollToRow = (id) => {
    const el = document.getElementById(`arena-lb-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashId(id);
    setTimeout(() => setFlashId(null), 1800);
  };

  // Jumps to whichever page holds the viewer's best team before scrolling — the
  // team may be well past the page currently on screen. An active search is
  // cleared first (the target row only exists on the full board).
  const findMyRow = () => {
    const id = yourRank?.best?.id;
    if (!id) return;
    setChips([]);
    if (rows?.some((r) => r.id === id)) {
      scrollToRow(id);
      return;
    }
    const targetPage = Math.max(1, Math.ceil(yourRank.rank / PAGE_SIZE));
    setPendingScrollId(id);
    setPage(targetPage);
  };

  // Runs once the target page's rows land, so "Find my team" works across pages.
  // The scroll/flash setState calls are deferred a tick (lint: set-state-in-effect) —
  // they also need the row's DOM node to exist post-render, not just the data to arrive.
  useEffect(() => {
    if (!pendingScrollId || !rows) return undefined;
    if (!rows.some((r) => r.id === pendingScrollId)) return undefined;
    const id = pendingScrollId;
    const timer = setTimeout(() => {
      scrollToRow(id);
      setPendingScrollId(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [rows, pendingScrollId]);

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
        <div className={css.lbSearch}>
          <div className={css.lbSearchBox} onClick={() => searchInputRef.current?.focus()}>
            <Search size={13} className={css.lbSearchIcon} />
            {chips.map((c) => (
              <span
                key={c.key}
                className={css.lbChip}
                style={c.color ? { color: c.color, background: `${c.color}1f`, borderColor: `${c.color}66` } : undefined}
              >
                {c.label}
                <button
                  type="button"
                  className={css.lbChipX}
                  onClick={(e) => { e.stopPropagation(); removeChip(c.key); }}
                  aria-label={`Remove ${c.label}`}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
            <input
              ref={searchInputRef}
              className={css.lbSearchInput}
              value={query}
              placeholder={chips.length > 0 ? 'Add another…' : 'Search player or NFL team…'}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchFocus(true)}
              onBlur={() => setSearchFocus(false)}
              onKeyDown={onSearchKey}
              aria-label="Search teams by player or NFL team"
            />
          </div>
          {searchFocus && suggestions.length > 0 && (
            <div className={css.lbSugg} role="listbox" aria-label="Search suggestions">
              {suggestions.map((s) => (
                <button
                  type="button"
                  key={s.key}
                  className={css.lbSuggBtn}
                  role="option"
                  aria-selected={false}
                  // mousedown (not click) so the pick lands before the input blurs.
                  onMouseDown={(e) => { e.preventDefault(); addChip(s); }}
                >
                  <span className={css.lbSuggDot} style={{ background: s.color || 'var(--text-muted)' }} />
                  <span className={css.lbSuggName}>{s.label}</span>
                  <span className={css.lbSuggMeta}>{s.meta}</span>
                </button>
              ))}
            </div>
          )}
        </div>
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
          <button className={css.lbFindBtn} onClick={findMyRow}>
            <LocateFixed size={14} /> Find my team
          </button>
        </div>
      )}

      {shownError && <p className={css.errorNote}>{shownError}</p>}

      {shownRows === null ? (
        <div className={css.stateBox}><RefreshCw size={26} className={css.stateSpin} /><p>{searching ? 'Searching teams…' : 'Loading rankings…'}</p></div>
      ) : shownRows.length === 0 ? (
        // A failed fetch also lands here with rows=[] — show only the error note
        // above, not a contradictory "no teams yet" message.
        shownError ? null : searching ? (
          <div className={css.stateBox}>
            <Search size={32} className={css.stateIcon} />
            <h3>No teams match</h3>
            <p>No ranked team has {chips.map((c) => c.label).join(' + ')}. Remove a chip to widen the search.</p>
          </div>
        ) : (
          <div className={css.stateBox}>
            <Trophy size={32} className={css.stateIcon} />
            <h3>No ranked teams yet</h3>
            <p>Once teams are entered and votes come in, the leaderboard fills in here.</p>
          </div>
        )
      ) : (
        <>
          {searching && (
            <p className={css.lbSearchSummary}>
              {searchRes.total.toLocaleString()} team{searchRes.total === 1 ? '' : 's'} with {chips.map((c) => c.label).join(' + ')} · best Elo first
              {searchRes.total > SEARCH_LIMIT ? ` · showing top ${SEARCH_LIMIT}` : ''}
            </p>
          )}
          {!searching && page === 1 && rows.length >= 3 && (
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
                  <BuildMeta meta={metaById[r.id]} />
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
              <span className={css.cMove}>{searching ? '' : 'Move'}</span>
            </div>
            {shownRows.map((r, i) => {
              // In search mode the rank is the match ordinal (global rank isn't
              // fetched per match) — best Elo first, so #1 is the best fit.
              const rank = searching ? i + 1 : offset + i + 1;
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
                    <span className={`${css.cRank} ${css.rankBadge} ${searching ? '' : rankClass(rank)}`}>{rank}</span>
                    <span className={css.cTeam}>
                      <span className={css.lbTeamLine}>
                        {mine && <span className={css.youTag}>You</span>}
                        <span className={css.lbArche}>{archetypeSummary(r.display_snapshot?.path) || 'Best-ball team'}</span>
                        {r.provisional && <span className={css.lbTeamMeta}>new</span>}
                      </span>
                      <BuildMeta meta={metaById[r.id]} />
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
                    <span className={css.cMove}>{!searching && <Movement delta={moves[r.id]} />}<ChevronDown size={13} className={`${css.chev} ${isOpen ? css.chevOpen : ''}`} /></span>
                  </button>
                  {isOpen && (
                    <div className={css.lbExpand}>
                      <ArenaRosterCard snapshot={enrichSnapshotCLV(r.display_snapshot, adpLookup)} corner="neutral" cornerLabel={searching ? `${Math.round(r.elo)} Elo` : `Rank #${rank}`} comboLookup={comboLookup} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {!searching && pageCount > 1 && (
            <div className={css.lbPager}>
              <button
                className={css.lbPagerBtn}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label="Previous page"
              >
                <ChevronLeft size={14} />
              </button>
              {pageWindow(page, pageCount).map((p, i) => (
                p === '…' ? (
                  <span key={`gap-${i}`} className={css.lbPagerEllipsis}>…</span>
                ) : (
                  <button
                    key={p}
                    className={`${css.lbPagerNum} ${p === page ? css.lbPagerActive : ''}`}
                    onClick={() => setPage(p)}
                    aria-current={p === page ? 'page' : undefined}
                  >
                    {p}
                  </button>
                )
              ))}
              <button
                className={css.lbPagerBtn}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page === pageCount}
                aria-label="Next page"
              >
                <ChevronRight size={14} />
              </button>
              <span className={css.lbPagerInfo}>Page {page} of {pageCount}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
