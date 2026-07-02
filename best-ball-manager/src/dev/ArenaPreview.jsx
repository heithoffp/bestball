// DEV-ONLY Arena matchup preview (loaded by /dev-arena.html, never in the
// production build). Renders the blind-matchup screen with two fixture rosters
// so the Arena card/tape UI can be iterated on without the live backend,
// pairings, or an allowlisted account. Mirrors ArenaVote's layout and the
// scouting-lens controls; voting is inert.

import React, { useCallback, useRef, useState } from 'react';
import { Swords, Gavel, Zap, Link2, ArrowRight } from 'lucide-react';
import ArenaRosterCard from '../components/arena/ArenaRosterCard';
import ArenaTape from '../components/arena/ArenaTape';
import useMediaQuery from '../hooks/useMediaQuery';
import { buildEnrollableTeams, enrichSnapshotDisplay, buildAdpLookup } from '../utils/arenaSnapshot';
import css from '../components/Arena.module.css';

// Seat-3 and seat-8 snake picks in a 12-team, 18-round UD draft.
const picksFor = (seat) => Array.from({ length: 18 }, (_, r) =>
  (r % 2 === 0 ? r * 12 + seat : (r + 1) * 12 - seat + 1));

// [name, position, team, adpOffset, projectedPoints] — ADP is derived from the
// seat's actual pick number plus a small offset, so CLV reads like real drafts
// (a few percent either way), with the offset controlling reach vs value.
const ROSTER_A = [
  ['Ja\'Marr Chase', 'WR', 'CIN', -0.8, 288],
  ['Tee Higgins', 'WR', 'CIN', 2.1, 231],
  ['Trey McBride', 'TE', 'ARI', -1.4, 214],
  ['Joe Burrow', 'QB', 'CIN', 3.6, 362],
  ['James Cook', 'RB', 'BUF', -2.2, 226],
  ['DK Metcalf', 'WR', 'PIT', 5.4, 208],
  ['Brian Thomas', 'WR', 'JAX', -3.1, 246],
  ['Tony Pollard', 'RB', 'TEN', 7.9, 187],
  ['Trevor Lawrence', 'QB', 'JAX', -6.2, 301],
  ['Jaylen Warren', 'RB', 'PIT', 4.3, 158],
  ['Khalil Shakir', 'WR', 'BUF', -8.5, 176],
  ['Brandon Aiyuk', 'WR', 'SF', 11.2, 168],
  ['Tyler Allgeier', 'RB', 'ATL', -4.7, 121],
  ['Pat Freiermuth', 'TE', 'PIT', 9.8, 141],
  ['Rashid Shaheed', 'WR', 'NO', -12.4, 148],
  ['Ray Davis', 'RB', 'BUF', 6.1, 102],
  ['Jalen McMillan', 'WR', 'TB', -9.3, 128],
  ['Will Shipley', 'RB', 'PHI', 14.6, 84],
];
const ROSTER_B = [
  ['Bijan Robinson', 'RB', 'ATL', 1.2, 292],
  ['A.J. Brown', 'WR', 'PHI', -1.9, 254],
  ['Jalen Hurts', 'QB', 'PHI', 4.4, 340],
  ['DeVonta Smith', 'WR', 'PHI', -2.8, 218],
  ['Kyren Williams', 'RB', 'LAR', 3.2, 232],
  ['Ladd McConkey', 'WR', 'LAC', -5.6, 238],
  ['David Njoku', 'TE', 'CLE', 6.7, 164],
  ['Chuba Hubbard', 'RB', 'CAR', -4.1, 196],
  ['Jordan Addison', 'WR', 'MIN', 8.9, 191],
  ['Jakobi Meyers', 'WR', 'LV', -7.2, 172],
  ['Justin Herbert', 'QB', 'LAC', 5.8, 312],
  ['Rhamondre Stevenson', 'RB', 'NE', -10.3, 152],
  ['Dallas Goedert', 'TE', 'PHI', 7.4, 132],
  ['Keon Coleman', 'WR', 'BUF', -6.8, 144],
  ['Braelon Allen', 'RB', 'NYJ', 12.1, 96],
  ['Romeo Doubs', 'WR', 'GB', -8.7, 131],
  ['Tyler Lockett', 'WR', 'TEN', 10.4, 118],
  ['Isaac Guerendo', 'RB', 'SF', -13.2, 88],
];

function toRows(roster, entryId, seat, draftedAt) {
  const picks = picksFor(seat);
  return roster.map(([name, position, team, adpOffset], i) => ({
    name, position, team,
    entry_id: entryId,
    pick: picks[i],
    round: i + 1,
    latestADP: Math.max(1, picks[i] + adpOffset),
    pickedAt: draftedAt,
    tournamentTitle: 'The Big Board',
    slateTitle: 'UD 2026 Best Ball',
  }));
}

const PROJ = new Map([...ROSTER_A, ...ROSTER_B].map(([name, , , , proj]) => [name.toLowerCase(), proj]));
const projLookup = (name) => PROJ.get(String(name || '').toLowerCase()) ?? null;

function buildFixture() {
  const rows = [
    ...toRows(ROSTER_A, 'fixture-a', 3, '2026-06-12T19:04:00Z'),
    ...toRows(ROSTER_B, 'fixture-b', 8, '2026-05-28T02:11:00Z'),
  ];
  const teams = buildEnrollableTeams(rows);
  const adpLookup = buildAdpLookup([]); // per-row latestADP already supplies CLV
  const byId = Object.fromEntries(teams.map((t) => [t.entryId, t.snapshot]));
  return {
    a: enrichSnapshotDisplay(byId['fixture-a'], adpLookup, projLookup),
    b: enrichSnapshotDisplay(byId['fixture-b'], adpLookup, projLookup),
  };
}

const FIXTURE = buildFixture();

export default function ArenaPreview() {
  // ?lens=proj / ?stacks=off preseed the toggles so states can be screenshot.
  const params = new URLSearchParams(window.location.search);
  const [lens, setLens] = useState(params.get('lens') === 'proj' ? 'proj' : 'clv');
  const [showStacks, setShowStacks] = useState(params.get('stacks') !== 'off');
  const maxProj = Math.max(
    ...(FIXTURE.a.players || []).map((p) => p.proj || 0),
    ...(FIXTURE.b.players || []).map((p) => p.proj || 0),
  );

  // Mobile deck (TASK-308) — mirrors ArenaVote's deck logic so the harness
  // previews the swipe/toggle behavior; only voting is inert.
  const { isDesktop } = useMediaQuery();
  const [deckIndex, setDeckIndex] = useState(0);
  const deckRef = useRef(null);
  const scrollDeckTo = useCallback((idx) => {
    const el = deckRef.current;
    if (!el) return;
    const left = idx === 0 ? 0 : el.scrollWidth - el.clientWidth;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left, behavior: reduced ? 'auto' : 'smooth' });
  }, []);
  const onDeckScroll = useCallback(() => {
    const el = deckRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setDeckIndex(el.scrollLeft > max / 2 ? 1 : 0);
  }, []);

  return (
    <div className={css.root} style={{ height: '100vh', padding: '10px 18px' }}>
      <div className={css.body}>
        <div className={css.arena}>
          <div className={css.topRow}>
            <div className={css.lensStrip} role="group" aria-label="Scouting lens">
              <span className={css.lensSeg}>
                <button className={`${css.lensBtn} ${lens === 'clv' ? css.lensActive : ''}`} onClick={() => setLens('clv')}>CLV</button>
                <button className={`${css.lensBtn} ${lens === 'proj' ? css.lensActive : ''}`} onClick={() => setLens('proj')}>Proj</button>
              </span>
              <button
                className={`${css.lensBtn} ${css.lensToggle} ${showStacks ? css.lensActive : ''}`}
                onClick={() => setShowStacks((s) => !s)}
                aria-pressed={showStacks}
              >
                <Link2 size={11} /> Stacks
              </button>
            </div>
            <div className={css.contextBar}>
              <span className={css.ctxBrand}><Swords size={13} /> Blind Matchup</span>
              <span className={css.ctxDot} />
              <span className={css.ctxPlatform}>Underdog</span>
              <span className={css.ctxDot} />
              <span className={css.ctxSlate}>The Big Board</span>
            </div>
            <div className={css.scoreStrip}>
              <span className={css.statChip}><Gavel size={12} /> <strong>12</strong> judged</span>
              <span className={css.statChip}><Zap size={12} /> <strong>3</strong> upsets</span>
            </div>
          </div>

          {isDesktop ? (
            <>
              <div className={css.matchup}>
                <div className={css.sideCol}>
                  <ArenaRosterCard snapshot={FIXTURE.a} corner="red" cornerLabel="Red Corner" lens={lens} showStacks={showStacks} maxProj={maxProj} pickable onPick={() => {}} />
                </div>
                <div className={css.tapeCol}>
                  <ArenaTape a={FIXTURE.a} b={FIXTURE.b} />
                </div>
                <div className={css.sideCol}>
                  <ArenaRosterCard snapshot={FIXTURE.b} corner="blue" cornerLabel="Blue Corner" lens={lens} showStacks={showStacks} maxProj={maxProj} pickable onPick={() => {}} />
                </div>
              </div>

              <div className={css.kbdRow} aria-hidden="true">
                <span><kbd>←</kbd> Pick Red</span>
                <span>Pick Blue <kbd>→</kbd></span>
                <span><kbd>S</kbd> Skip</span>
                <span><kbd>Space</kbd> Next</span>
                <span><kbd>L</kbd> Lens</span>
              </div>
            </>
          ) : (
            <>
              <div className={css.mobileMatchup}>
                <div className={css.mobileTape}>
                  <ArenaTape a={FIXTURE.a} b={FIXTURE.b} />
                </div>
                <div className={css.cornerToggle} role="group" aria-label="Jump to contender">
                  <button
                    className={`${css.cornerTab} ${css.cornerTabRed} ${deckIndex === 0 ? css.cornerTabActive : ''}`}
                    aria-pressed={deckIndex === 0}
                    onClick={() => scrollDeckTo(0)}
                  >
                    Red Corner
                  </button>
                  <button
                    className={`${css.cornerTab} ${css.cornerTabBlue} ${deckIndex === 1 ? css.cornerTabActive : ''}`}
                    aria-pressed={deckIndex === 1}
                    onClick={() => scrollDeckTo(1)}
                  >
                    Blue Corner
                  </button>
                </div>
                <div className={css.deck} ref={deckRef} onScroll={onDeckScroll} aria-label="Contender rosters">
                  <div className={css.deckItem}>
                    <ArenaRosterCard snapshot={FIXTURE.a} corner="red" cornerLabel="Red Corner" lens={lens} showStacks={showStacks} maxProj={maxProj} />
                  </div>
                  <div className={css.deckItem}>
                    <ArenaRosterCard snapshot={FIXTURE.b} corner="blue" cornerLabel="Blue Corner" lens={lens} showStacks={showStacks} maxProj={maxProj} />
                  </div>
                </div>
              </div>

              <div className={css.pickDock}>
                <div className={css.dockPicks}>
                  <button className={`${css.pickBtn} ${css.pickRed}`}>Pick Red</button>
                  <button className={`${css.pickBtn} ${css.pickBlue}`}>Pick Blue</button>
                </div>
                <div className={css.skipRow}>
                  <button className={css.skipBtn}>Skip <ArrowRight size={15} /></button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
