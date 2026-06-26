// ArenaRosterCard — renders one anonymized team snapshot for the blind matchup.
// No owner identity is ever shown. Mirrors the position/archetype visual idiom
// from RosterViewer (shared position colors + archetype metadata) so the Arena
// feels native, while staying self-contained on the snapshot payload.

import React from 'react';
import { posColor } from '../../utils/positionColors';
import { ARCHETYPE_METADATA } from '../../utils/rosterArchetypes';
import css from '../Arena.module.css';

const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'DEF'];

function platformLabel(platform) {
  return platform === 'draftkings' ? 'DraftKings' : 'Underdog';
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
          style={{ color: posColor(pos), background: `${posColor(pos)}22`, borderColor: `${posColor(pos)}55` }}
        >
          {posSnap[pos]}{pos}
        </span>
      ))}
    </div>
  );
}

function ArchetypePills({ path }) {
  if (!path) return null;
  const keys = [path.rb, path.qb, path.te].filter((k) => ARCHETYPE_METADATA[k]);
  return (
    <div className={css.archetypes}>
      {keys.map((k) => {
        const meta = ARCHETYPE_METADATA[k];
        const color = meta.color || '#6b7280';
        return (
          <span
            key={k}
            className={css.archetypePill}
            title={meta.desc}
            style={{ color, background: `${color}1a`, borderColor: `${color}44` }}
          >
            {meta.name}
          </span>
        );
      })}
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.snapshot  display_snapshot payload
 * @param {string} props.sideLabel e.g. "Team A"
 * @param {'idle'|'win'|'loss'|null} props.outcome  reveal state
 * @param {number|null} props.delta  Elo delta to reveal
 */
export default function ArenaRosterCard({ snapshot, sideLabel, outcome = null, delta = null }) {
  if (!snapshot) return null;
  const { players = [], posSnap = {}, path, count, platform } = snapshot;
  const isDk = platform === 'draftkings';

  const cardClass = [
    css.card,
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

      <div className={css.cardHead}>
        <span className={css.sideLabel}>{sideLabel}</span>
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

      <ArchetypePills path={path} />
      <PosSnapshot posSnap={posSnap} />

      <ol className={css.playerList}>
        {players.map((p, i) => (
          <li key={`${p.name}-${i}`} className={css.playerRow}>
            <span className={css.pickNo}>{p.pick || '—'}</span>
            <span
              className={css.posBadge}
              style={{ color: posColor(p.position), background: `${posColor(p.position)}22`, borderColor: `${posColor(p.position)}55` }}
            >
              {p.position}
            </span>
            <span className={css.playerName}>{p.name}</span>
            <span className={css.playerTeam}>{p.team}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
