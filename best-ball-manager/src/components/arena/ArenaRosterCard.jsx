// ArenaRosterCard — one anonymized contender in the blind matchup, styled as a
// fighter's corner (ADR-013). No owner identity is ever shown. The red/blue corner
// is purely POSITIONAL (the server already randomizes left/right), so it carries no
// owner signal and blind fairness holds. Per-player CLV + a position-colored monogram
// give the snap judgment real signal without a headshot dependency (headshots: TASK-298).

import React from 'react';
import { posColor } from '../../utils/positionColors';
import { compactTournamentName } from '../../utils/helpers';
import css from '../Arena.module.css';

const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'DEF'];

function platformLabel(platform) {
  return platform === 'draftkings' ? 'DraftKings' : 'Underdog';
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

function PosSnapshot({ posSnap }) {
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
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.snapshot   display_snapshot payload
 * @param {'red'|'blue'|'neutral'} props.corner  positional corner (random per matchup);
 *   'neutral' drops the fight tint (used outside the matchup, e.g. leaderboard expansion)
 * @param {string} props.cornerLabel e.g. "Red Corner"
 * @param {'win'|'loss'|null} props.outcome  reveal state
 * @param {number|null} props.delta  Elo delta to reveal
 * @param {string|null} props.stamp  post-reveal scorecard stamp (e.g. "Upset") — TASK-302
 */
export default function ArenaRosterCard({ snapshot, corner = 'red', cornerLabel, outcome = null, delta = null, stamp = null }) {
  if (!snapshot) return null;
  const { players = [], posSnap = {}, count, platform, tournamentTitle, slateTitle } = snapshot;
  const isDk = platform === 'draftkings';
  const context = tournamentTitle || slateTitle;

  const cardClass = [
    css.card,
    corner === 'blue' ? css.cardBlue : corner === 'red' ? css.cardRed : '',
    outcome === 'win' ? css.cardWin : '',
    outcome === 'loss' ? css.cardLoss : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClass}>
      {outcome && delta != null && (
        <div className={`${css.deltaRibbon} ${delta >= 0 ? css.deltaUp : css.deltaDown}`}>
          {delta >= 0 ? '+' : '−'}{Math.abs(Math.round(delta))} Elo
        </div>
      )}
      {stamp && <div className={css.stamp}>{stamp}</div>}

      <div className={css.cardHead}>
        <span className={css.cornerDot} />
        <span className={css.sideLabel}>{cornerLabel}</span>
        <span
          className={css.platformChip}
          style={{
            color: isDk ? 'var(--platform-dk)' : 'var(--platform-ud)',
            background: isDk ? 'var(--platform-dk-bg)' : 'var(--platform-ud-bg)',
          }}
        >
          {platformLabel(platform)}
        </span>
        <span className={css.pickCount}>{count} picks</span>
      </div>

      {context && <div className={css.contextLine} title={context}>{compactTournamentName(context)}</div>}

      <PosSnapshot posSnap={posSnap} />

      <ol className={css.playerList}>
        {players.map((p, i) => {
          const clv = clvView(p.clv);
          const color = posColor(p.position);
          return (
            <li key={`${p.name}-${i}`} className={css.playerRow}>
              <span
                className={css.avatar}
                style={{ color, background: `${color}24`, borderColor: `${color}66` }}
                aria-hidden="true"
              >
                {initials(p.name)}
              </span>
              <span className={css.playerMain}>
                <span className={css.playerName}>{p.name}</span>
                <span className={css.playerMeta}>
                  <span style={{ color }}>{p.position}</span> · {p.team || '—'}{p.pick ? ` · ${p.pick}` : ''}
                </span>
              </span>
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
            </li>
          );
        })}
      </ol>
    </div>
  );
}
