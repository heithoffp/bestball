// ArenaRosterCard — one anonymized contender in the blind matchup, styled as a
// fighter's corner (ADR-013). No owner identity is ever shown. The red/blue corner
// is purely POSITIONAL (the server already randomizes left/right), so it carries no
// owner signal and blind fairness holds.
//
// The card is built to put a WHOLE roster on screen at once: dense single-line
// rows with real player headshots (Sleeper CDN, monogram fallback — TASK-298),
// NFL-team-colored stack rails, a switchable stat lens (CLV or projected points),
// and the draft date when the snapshot carries one.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { posColor } from '../../utils/positionColors';
import { nflTeamColor } from '../../utils/nflTeamColors';
import { NFL_TEAMS_ABBREV } from '../../utils/nflTeams';
import { headshotUrl, teamLogoUrl } from '../../utils/headshots';
import { analyzeRosterStacks } from '../../utils/stackAnalysis';
import css from '../Arena.module.css';

const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'DEF'];

// Frozen snapshots carry teams as the source platform stored them: DraftKings uses
// abbreviations ("MIN"), Underdog uses full names ("Minnesota Vikings"). Collapse to
// the abbreviation so the row text, stack rails, and team-color lookups all agree.
function teamAbbrev(team) {
  if (!team) return team;
  return NFL_TEAMS_ABBREV[String(team).toUpperCase()] || team;
}

// First + last initial, e.g. "Justin Jefferson" -> "JJ". Defensive states/teams
// (e.g. "Eagles") fall back to a single letter.
function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// "2026-06-12" -> "Jun 12" (year appended only when it isn't the current year).
function draftDateLabel(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d)) return null;
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

// CLV → text + sign class + bar magnitude (0–1). ±15% reads as a full half-bar.
function clvView(clv) {
  if (clv == null) return { text: '—', cls: css.clvNeutral, mag: 0, pos: true };
  const pos = clv >= 0;
  return {
    text: `${pos ? '+' : ''}${clv.toFixed(1)}%`,
    cls: pos ? css.clvPos : css.clvNeg,
    mag: Math.min(1, Math.abs(clv) / 15),
    pos,
  };
}

// Reveal ticker: holds the pre-vote Elo just long enough to register, then rolls
// it to the post-vote value. Writes straight to the DOM via requestAnimationFrame —
// no React re-renders mid-roll, so it stays smooth alongside the card transitions.
// The whole sequence fits well inside the 2s reveal window.
const TICK_HOLD_MS = 420;
const TICK_ROLL_MS = 850;

function RatingTicker({ before, after }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const from = Math.round(before);
    const to = Math.round(after);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || from === to) {
      el.textContent = String(to);
      return undefined;
    }
    el.textContent = String(from);
    let raf;
    let start;
    const roll = (now) => {
      if (start === undefined) start = now;
      const t = Math.min(1, (now - start) / TICK_ROLL_MS);
      const eased = 1 - (1 - t) ** 3;
      el.textContent = String(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(roll);
    };
    const hold = setTimeout(() => { raf = requestAnimationFrame(roll); }, TICK_HOLD_MS);
    return () => { clearTimeout(hold); cancelAnimationFrame(raf); };
  }, [before, after]);
  return <span ref={ref} className={css.ribbonNum} />;
}

// Headshot over the position-colored monogram ring. The monogram renders
// immediately; the photo fades in only once it has actually loaded, and a
// failed fetch (unmapped name, CDN miss) simply never covers it.
function PlayerFace({ name, position, team }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const isDefense = position === 'DST' || position === 'DEF';
  const src = isDefense ? teamLogoUrl(team) : headshotUrl(name, position);
  const color = posColor(position);
  return (
    <span
      className={css.avatar}
      style={{ color, background: `${color}24`, borderColor: `${color}66` }}
      aria-hidden="true"
    >
      {initials(name)}
      {src && !failed && (
        <img
          className={`${css.face} ${loaded ? css.faceLoaded : ''}`}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

function PosSnapshot({ posSnap, stacks, showStacks }) {
  const keys = [
    ...POS_ORDER.filter((p) => posSnap[p]),
    ...Object.keys(posSnap).filter((p) => !POS_ORDER.includes(p)),
  ];
  return (
    <div className={css.posSnap}>
      {keys.map((pos) => (
        <span
          key={pos}
          className={css.posChip}
          style={{ color: posColor(pos), background: `${posColor(pos)}1f`, borderColor: `${posColor(pos)}55` }}
        >
          {posSnap[pos]}{pos}
        </span>
      ))}
      {showStacks && stacks.map((s) => {
        const color = nflTeamColor(s.team);
        const qbAnchored = s.members.some((m) => m.position === 'QB');
        return (
          <span
            key={s.team}
            className={css.stackChip}
            style={{
              color,
              borderColor: `${color}99`,
              background: `${color}${qbAnchored ? '3d' : '24'}`,
            }}
            title={`${s.type} — ${s.members.map((m) => `${m.position} ${m.name}`).join(', ')}`}
          >
            {s.team} ×{s.members.length}
          </span>
        );
      })}
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.snapshot   display_snapshot payload (display-enriched)
 * @param {'red'|'blue'|'neutral'} props.corner  positional corner (random per matchup);
 *   'neutral' drops the fight tint (used outside the matchup, e.g. leaderboard expansion)
 * @param {string} props.cornerLabel e.g. "Red Corner"
 * @param {'win'|'loss'|null} props.outcome  reveal state
 * @param {number|null} props.delta  Elo delta to reveal (fallback when no rating)
 * @param {{before:number, after:number, delta:number}|null} props.rating  full Elo
 *   reveal payload — drives the before→after rolling ticker
 * @param {string|null} props.stamp  post-reveal scorecard stamp ("Winner" / "Upset Win")
 * @param {'clv'|'proj'} props.lens  which stat rides the right column of each row
 * @param {boolean} props.showStacks paint NFL-team-colored stack rails + chips
 * @param {number|null} props.maxProj proj-bar scale ceiling (max across the matchup)
 * @param {function|null} props.comboLookup (snapshot) => Early Combo rate
 *   ({count, totalRosters, pctText}) from the real-draft frequency tables;
 *   null (guest / still loading) hides the chip
 * @param {boolean} props.pickable   desktop: the card itself is the vote target
 * @param {boolean} props.picked     post-reveal: this was the voter's pick
 * @param {function|null} props.onPick vote handler when the card is pickable
 */
export default function ArenaRosterCard({
  snapshot, corner = 'red', cornerLabel, outcome = null, delta = null, rating = null,
  stamp = null, lens = 'clv', showStacks = true, maxProj = null, comboLookup = null,
  pickable = false, picked = false, onPick = null,
}) {
  const { players: rawPlayers = [], posSnap = {}, count, draftedAt } = snapshot || {};

  // Normalize teams to abbreviations up front so stack detection, rail colors, and
  // the rendered team text are all driven off the same canonical value.
  const players = useMemo(
    () => rawPlayers.map((p) => (p.team ? { ...p, team: teamAbbrev(p.team) } : p)),
    [rawPlayers],
  );

  // Qualifying stacks (2+ teammates, game stacks and up) and a per-player rail
  // color. Players in multiple relationships take their team's single stack color,
  // so a roster's rails read as vertical threads of franchise color.
  const stacks = useMemo(
    () => (players.length ? analyzeRosterStacks(players) : []),
    [players],
  );
  const stackTeams = useMemo(() => {
    const map = new Map();
    stacks.forEach((s) => map.set(s.team, nflTeamColor(s.team)));
    return map;
  }, [stacks]);

  const projCeiling = Math.max(
    1,
    maxProj ?? players.reduce((m, p) => Math.max(m, p.proj || 0), 0),
  );

  // Early Combo rarity — how big a share of all tracked real drafts start with
  // this team's first-3 picks. Null (guest, loading, unresolvable) hides it.
  const combo = useMemo(
    () => (comboLookup ? comboLookup(snapshot) : null),
    [comboLookup, snapshot],
  );

  // The roster rows never change during a matchup — memoizing their JSX means the
  // reveal's re-renders (outcome/delta/stamp flips, deck-scroll state) reconcile
  // 20 identical elements instead of re-building every headshot row mid-animation.
  const rows = useMemo(() => players.map((p, i) => {
    const color = posColor(p.position);
    const railColor = showStacks ? stackTeams.get(p.team) : null;
    return (
      <li
        key={`${p.name}-${i}`}
        className={`${css.playerRow} ${railColor ? css.playerRowStacked : ''}`}
        style={railColor ? { '--rail': railColor, '--rail-bg': `${railColor}2e` } : undefined}
      >
        <PlayerFace name={p.name} position={p.position} team={p.team} />
        <span className={css.playerName}>{p.name}</span>
        <span className={css.playerMeta}>
          <span style={{ color }}>{p.position}</span>
          {p.team && p.team !== 'N/A' ? (
            <>·<span style={railColor ? { color: railColor, fontWeight: 700 } : undefined}>{p.team}</span></>
          ) : ''}
          {p.pick ? `·${p.pick}` : ''}
        </span>
        {lens === 'proj' ? (
          <span className={css.projCell}>
            <span className={css.projVal}>{p.proj != null ? Math.round(p.proj) : '—'}</span>
            <span className={css.projBar}>
              {p.proj != null && (
                <span
                  className={css.projBarFill}
                  style={{
                    width: `${Math.min(100, (p.proj / projCeiling) * 100)}%`,
                    background: color,
                  }}
                />
              )}
            </span>
          </span>
        ) : (() => {
          const clv = clvView(p.clv);
          return (
            <span className={`${css.clvCell} ${clv.cls}`}>
              <span className={css.clvVal}>{clv.text}</span>
              <span className={css.clvBar}>
                {clv.mag > 0 && (
                  <span
                    className={css.clvBarFill}
                    style={clv.pos
                      ? { left: '50%', width: `${clv.mag * 50}%` }
                      : { right: '50%', width: `${clv.mag * 50}%` }}
                  />
                )}
              </span>
            </span>
          );
        })()}
      </li>
    );
  }), [players, stackTeams, showStacks, lens, projCeiling]);

  if (!snapshot) return null;
  const dateLabel = draftedAt ? draftDateLabel(draftedAt) : null;

  const clickable = pickable && typeof onPick === 'function';
  const cardClass = [
    css.card,
    corner === 'blue' ? css.cardBlue : corner === 'red' ? css.cardRed : '',
    outcome === 'win' ? css.cardWin : '',
    outcome === 'loss' ? css.cardLoss : '',
    clickable ? css.cardPickable : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cardClass}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `Pick ${cornerLabel}` : undefined}
      onClick={clickable ? onPick : undefined}
      onKeyDown={clickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(); }
      } : undefined}
    >
      {outcome && (rating || delta != null) && (() => {
        const d = Math.round(rating ? rating.delta : delta);
        return (
          <div className={`${css.deltaRibbon} ${d > 0 ? css.deltaUp : d < 0 ? css.deltaDown : ''}`}>
            {rating ? (
              <>
                <RatingTicker before={rating.before} after={rating.after} />
                <span className={css.ribbonUnit}>Elo</span>
                <span className={css.ribbonDelta}>
                  {d === 0 ? '±0' : `${d > 0 ? '▲ +' : '▼ −'}${Math.abs(d)}`}
                </span>
              </>
            ) : (
              <>{d === 0 ? '±0' : `${d > 0 ? '+' : '−'}${Math.abs(d)}`} Elo</>
            )}
          </div>
        );
      })()}
      {stamp && <div className={css.stamp}>{stamp}</div>}

      <div className={css.cardHead}>
        <span className={css.cornerDot} />
        <span className={css.sideLabel}>{cornerLabel}</span>
        {picked && <span className={css.pickedTag}>Your pick ✓</span>}
        <span className={css.headMeta}>
          {dateLabel && (
            <span className={css.draftDate} title={`Drafted ${dateLabel}`}>
              <CalendarDays size={11} /> {dateLabel}
            </span>
          )}
          {combo?.pctText && (
            <span
              className={css.pickCount}
              title={`Early Combo: this team's first-3-pick combo starts ${combo.count.toLocaleString()} of ${combo.totalRosters.toLocaleString()} tracked real drafts`}
            >
              {combo.pctText} combo
            </span>
          )}
          <span className={css.pickCount}>{count} picks</span>
        </span>
      </div>

      <PosSnapshot posSnap={posSnap} stacks={stacks} showStacks={showStacks} />

      <ol className={css.playerList}>{rows}</ol>

      {clickable && (
        <span className={css.pickHint} aria-hidden="true">Pick {cornerLabel}</span>
      )}
    </div>
  );
}
