// Arena — the Best Ball Arena pillar (ADR-013). A /arena tab with a blind
// head-to-head voting screen, leaderboard, and team management. Mirror-Not-Advisor
// is carved out here on purpose: the Arena is the explicit competitive zone where
// crowd opinion is the product (the analytics tabs stay single-user mirrors).
//
// Visibility (TASK-310): App.jsx mounts this only when the Arena is visible to the
// viewer — allowlisted accounts during the private beta (ADR-015), everyone once
// arena_config.beta_mode flips false. On mount we auto-register the user's own +
// participant-captured board teams into the opt-out pool (ADR-014 / TASK-288), once
// per session.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Swords, X } from 'lucide-react';
import ArenaVote from './arena/ArenaVote';
import ArenaLeaderboard from './arena/ArenaLeaderboard';
import ArenaMyTeams from './arena/ArenaMyTeams';
import { useAuth } from '../contexts/AuthContext';
import useMediaQuery from '../hooks/useMediaQuery';
import { canonicalName } from '../utils/helpers';
import { buildEnrollableTeams, buildBoardTeams, buildAdpLookup, playerNameKey } from '../utils/arenaSnapshot';
import { loadRealDraftData, comboRateForSnapshot } from '../utils/realDraftData';
import { fetchDraftBoards } from '../utils/draftBoards';
import { registerAllArenaTeams, ARENA_AVAILABLE } from '../utils/arenaClient';
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
        <li><strong>Vote</strong> — two real Best Ball Mania VII teams, shown blind (no owners). Pick the one you’d rather have. Your vote nudges each team’s hidden Elo rating.</li>
        <li><strong>Blind &amp; fair</strong> — owner identity is never shown while voting, and you’ll never be shown your own teams.</li>
        <li><strong>Free to play</strong> — anyone can vote. Your synced teams enter the Arena automatically; you can leave (and rejoin) any time from My Teams.</li>
        <li><strong>BBM7 season</strong> — the Arena runs on Best Ball Mania VII for now. More slates and platforms come later.</li>
      </ul>
    </div>
  );
}

// Auto-register the user's own + board teams into the opt-out pool, once per session.
// Best-effort: failures are swallowed and retried next session. Board rows are written
// service-side (arena-register); the server re-checks the beta gate. No client beta
// check here — this hook only runs when <Arena> is mounted, and App.jsx mounts it
// solely when the Arena is visible to the viewer (allowlisted during the private
// beta, everyone once beta_mode flips false — TASK-310). The server stays the real
// boundary: a non-allowlisted caller reaching register during beta gets 403.
function useAutoRegister(user, rosterData, masterPlayers) {
  const ref = useRef(false);
  useEffect(() => {
    if (ref.current) return;
    if (!ARENA_AVAILABLE || !user?.id) return;
    if (!Array.isArray(rosterData) || rosterData.length === 0) return;

    const sessionKey = `bbe_arena_registered_${user.id}`;
    try {
      if (sessionStorage.getItem(sessionKey)) { ref.current = true; return; }
    } catch { /* sessionStorage unavailable — proceed */ }

    ref.current = true; // guard re-entry while the async work runs
    let cancelled = false;

    (async () => {
      try {
        const adpLookup = buildAdpLookup(masterPlayers);
        const ownedTeams = buildEnrollableTeams(rosterData, masterPlayers).map((t) => ({
          entryId: t.entryId, platform: t.platform, draftId: t.entryId, snapshot: t.snapshot,
        }));

        // Board teams: fetch each synced pod's stored board (any source — ADR-016),
        // excluding the user's own seat (matched by player-name fingerprint). The
        // pod's tournament is known from the user's own entry in the same draft and
        // is stamped onto each board snapshot — board picks carry no tournament of
        // their own, and the BBM7 featured scoping matches on it.
        const draftIds = [...new Set(rosterData.map((r) => r.entry_id).filter(Boolean))];
        const ownKeyByDraft = {};
        const titleByDraft = {};
        const draftedAtByDraft = {};
        draftIds.forEach((id) => {
          const rows = rosterData.filter((r) => r.entry_id === id);
          ownKeyByDraft[id] = playerNameKey(rows);
          titleByDraft[id] = rows.find((r) => r.tournamentTitle)?.tournamentTitle || null;
          // Every seat in this draft was drafted simultaneously, so the user's own
          // pick timestamps (board picks carry none) give the whole pod its date.
          const times = rows
            .map((r) => (r.pickedAt ? new Date(r.pickedAt).getTime() : NaN))
            .filter((t) => Number.isFinite(t));
          draftedAtByDraft[id] = times.length
            ? new Date(Math.min(...times)).toISOString().slice(0, 10)
            : null;
        });
        const boards = await fetchDraftBoards(draftIds);
        const boardTeams = [];
        boards.forEach((board) => {
          boardTeams.push(...buildBoardTeams(
            board, ownKeyByDraft[board.draftId], adpLookup, titleByDraft[board.draftId],
            draftedAtByDraft[board.draftId],
          ));
        });

        if (cancelled) return;
        if (ownedTeams.length || boardTeams.length) {
          await registerAllArenaTeams({ ownedTeams, boardTeams });
        }
        try { sessionStorage.setItem(sessionKey, '1'); } catch { /* ignore */ }
      } catch {
        ref.current = false; // allow a retry on a later render / next session
      }
    })();

    return () => { cancelled = true; };
  }, [user, rosterData, masterPlayers]);
}

export default function Arena({ rosterData, masterPlayers, adpByPlatform, helpOpen, onHelpToggle }) {
  const [view, setView] = useState('vote');
  const { user } = useAuth();
  // On mobile the toolbar moves INSIDE the scrolling .body so it scrolls away
  // with the content instead of permanently eating vertical space; on desktop
  // it stays pinned above as part of the app frame.
  const { isDesktop } = useMediaQuery();
  useAutoRegister(user, rosterData, masterPlayers);

  // The viewer's own ADP, used to compute CLV at display time for every matchup —
  // stored snapshots are frozen insert-new-only, so live computation is what makes
  // Team/player CLV reliably appear (see enrichSnapshotCLV).
  const adpLookup = useMemo(() => buildAdpLookup(masterPlayers), [masterPlayers]);

  // Early Combo rarity, same display-time treatment as CLV/projections: computed
  // fresh from the real-draft frequency tables (captured boards + the viewer's
  // synced rosters) so every snapshot gets it regardless of registration age.
  // Guests resolve to empty tables and the chip simply doesn't render.
  const [comboData, setComboData] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadRealDraftData(masterPlayers ?? [], rosterData ?? [])
      .then((d) => { if (!cancelled) setComboData(d); })
      .catch(() => { /* fail soft — chip hidden */ });
    return () => { cancelled = true; };
  }, [masterPlayers, rosterData]);
  const comboLookup = useMemo(
    () => (comboData ? (snapshot) => comboRateForSnapshot(comboData, snapshot) : null),
    [comboData],
  );

  // The viewer's projections, same display-time treatment as CLV. dataLoader shares
  // one projPointsMap across every platform entry, so any entry's map is THE map.
  const projLookup = useMemo(() => {
    const map = Object.values(adpByPlatform || {}).find((p) => p?.projPointsMap)?.projPointsMap;
    if (!map) return null;
    return (name) => {
      const v = map[canonicalName(name)];
      return Number.isFinite(v) ? v : null;
    };
  }, [adpByPlatform]);

  const toolbar = (
    <div className={css.toolbar}>
      <div className={css.brand}>
        <Swords size={18} />
        <span>Best Ball Arena</span>
        <span className={css.seasonTag} title="The Arena runs on Best Ball Mania VII for now">BBM7</span>
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
  );

  return (
    <div className={css.root}>
      {isDesktop && toolbar}

      {helpOpen && <ArenaHelp onClose={onHelpToggle} />}

      <div className={css.body}>
        {!isDesktop && toolbar}
        {view === 'vote' && <ArenaVote adpLookup={adpLookup} projLookup={projLookup} comboLookup={comboLookup} onGoToMyTeams={() => setView('myteams')} />}
        {view === 'leaderboard' && <ArenaLeaderboard adpLookup={adpLookup} comboLookup={comboLookup} masterPlayers={masterPlayers} />}
        {view === 'myteams' && <ArenaMyTeams rosterData={rosterData} masterPlayers={masterPlayers} />}
      </div>
    </div>
  );
}
