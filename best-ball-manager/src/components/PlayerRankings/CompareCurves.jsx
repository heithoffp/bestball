import React from 'react';
import s from './CompareView.module.css';

/**
 * SVG canvas drawn between the two Compare columns.
 *
 * Receives precomputed Y positions (in viewport coords) for each player on each side
 * and renders Bézier curves connecting them, plus edge markers for off-screen endpoints.
 */
export default function CompareCurves({
  width,
  height,
  curves,           // [{ id, name, leftY, rightY, leftRank, rightRank, leftVisible, rightVisible }]
  activePlayerId,
  udColor = 'var(--platform-ud)',
  dkColor = 'var(--platform-dk)',
}) {
  return (
    <svg
      className={s.curveCanvas}
      width={width}
      height={height}
      preserveAspectRatio="none"
      role="presentation"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="bbe-compare-gradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={udColor} />
          <stop offset="100%" stopColor={dkColor} />
        </linearGradient>
      </defs>

      {/* Curves */}
      {curves.map(c => {
        const isActive = activePlayerId === c.id;
        const otherActive = activePlayerId && !isActive;
        const delta = (c.leftRank != null && c.rightRank != null)
          ? c.rightRank - c.leftRank
          : null;
        const deltaAbs = delta == null ? 0 : Math.abs(delta);
        const strokeWidth = 1 + Math.min(8, deltaAbs / 5);
        const opacity = otherActive ? 0.18 : (deltaAbs >= 20 ? 0.85 : 0.55);

        // Both endpoints off-screen → skip entirely
        if (!c.leftVisible && !c.rightVisible) return null;

        // One endpoint off-screen → render edge marker only
        if (!c.leftVisible || !c.rightVisible) {
          const visibleSide = c.leftVisible ? 'left' : 'right';
          const visibleY = c.leftVisible ? c.leftY : c.rightY;
          const xPos = visibleSide === 'left' ? 0 : width;
          const xDir = visibleSide === 'left' ? 8 : -8;
          const labelText = `${c.name} · #${visibleSide === 'left' ? c.rightRank : c.leftRank}`;

          return (
            <g key={c.id} className={isActive ? s.curveActive : ''} opacity={isActive ? 1 : opacity}>
              <polygon
                points={`${xPos},${visibleY - 4} ${xPos + xDir},${visibleY} ${xPos},${visibleY + 4}`}
                fill={visibleSide === 'left' ? dkColor : udColor}
              />
              {isActive && (
                <text
                  x={xPos + xDir * 1.5}
                  y={visibleY + 3}
                  textAnchor={visibleSide === 'left' ? 'start' : 'end'}
                  fontSize="10"
                  fill="var(--text-secondary)"
                >
                  {labelText}
                </text>
              )}
            </g>
          );
        }

        const path = `M 0,${c.leftY} C ${width / 2},${c.leftY} ${width / 2},${c.rightY} ${width},${c.rightY}`;
        const midX = width / 2;
        const midY = (c.leftY + c.rightY) / 2;

        return (
          <g key={c.id} className={isActive ? s.curveActive : ''}>
            <path
              d={path}
              fill="none"
              stroke="url(#bbe-compare-gradient)"
              strokeWidth={isActive ? strokeWidth + 1 : strokeWidth}
              strokeLinecap="round"
              opacity={isActive ? 1 : opacity}
            />
            {isActive && delta != null && (
              <g>
                <rect
                  x={midX - 18}
                  y={midY - 9}
                  width={36}
                  height={18}
                  rx={9}
                  fill={delta > 0 ? dkColor : udColor}
                  opacity={0.95}
                />
                <text
                  x={midX}
                  y={midY + 4}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  fill="#0c1a30"
                >
                  {delta > 0 ? `+${delta}` : delta}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
