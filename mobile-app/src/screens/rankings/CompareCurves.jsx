// CompareCurves.jsx — react-native-svg port of the web CompareCurves canvas.
// Draws Bézier curves in the gutter between the UD and DK columns connecting
// each player's rank position on both sides; edge markers replace curves whose
// counterpart endpoint is off-screen.
import React from 'react';
import Svg, { Defs, LinearGradient, Stop, Path, Polygon, Rect, G, Text as SvgText } from 'react-native-svg';
import { colors } from '../../theme';

export default function CompareCurves({
  width,
  height,
  curves,           // [{ id, name, leftY, rightY, leftRank, rightRank, leftVisible, rightVisible }]
  activePlayerId,
  udColor = colors.platformUd,
  dkColor = colors.platformDk,
}) {
  if (!width || !height) return null;
  return (
    <Svg width={width} height={height} pointerEvents="none">
      <Defs>
        <LinearGradient id="bbe-compare-gradient" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={udColor} />
          <Stop offset="1" stopColor={dkColor} />
        </LinearGradient>
      </Defs>

      {curves.map(c => {
        const isActive = activePlayerId === c.id;
        const otherActive = activePlayerId && !isActive;
        const delta = (c.leftRank != null && c.rightRank != null)
          ? c.rightRank - c.leftRank
          : null;
        const deltaAbs = delta == null ? 0 : Math.abs(delta);
        const strokeWidth = 1 + Math.min(8, deltaAbs / 5);
        const opacity = otherActive ? 0.15 : (deltaAbs >= 20 ? 0.8 : 0.5);

        if (!c.leftVisible && !c.rightVisible) return null;

        // One endpoint off-screen → edge marker only
        if (!c.leftVisible || !c.rightVisible) {
          const visibleSide = c.leftVisible ? 'left' : 'right';
          const visibleY = c.leftVisible ? c.leftY : c.rightY;
          const xPos = visibleSide === 'left' ? 0 : width;
          const xDir = visibleSide === 'left' ? 8 : -8;
          return (
            <G key={c.id} opacity={isActive ? 1 : opacity}>
              <Polygon
                points={`${xPos},${visibleY - 4} ${xPos + xDir},${visibleY} ${xPos},${visibleY + 4}`}
                fill={visibleSide === 'left' ? dkColor : udColor}
              />
              {isActive && (
                <SvgText
                  x={xPos + xDir * 1.5}
                  y={visibleY + 3}
                  textAnchor={visibleSide === 'left' ? 'start' : 'end'}
                  fontSize="9"
                  fill={colors.textSecondary}
                >
                  {`#${visibleSide === 'left' ? c.rightRank : c.leftRank}`}
                </SvgText>
              )}
            </G>
          );
        }

        const path = `M 0,${c.leftY} C ${width / 2},${c.leftY} ${width / 2},${c.rightY} ${width},${c.rightY}`;
        const midX = width / 2;
        const midY = (c.leftY + c.rightY) / 2;

        return (
          <G key={c.id}>
            <Path
              d={path}
              fill="none"
              stroke="url(#bbe-compare-gradient)"
              strokeWidth={isActive ? strokeWidth + 1 : strokeWidth}
              strokeLinecap="round"
              opacity={isActive ? 1 : opacity}
            />
            {isActive && delta != null && (
              <G>
                <Rect
                  x={midX - 18}
                  y={midY - 9}
                  width={36}
                  height={18}
                  rx={9}
                  fill={delta > 0 ? dkColor : udColor}
                  opacity={0.95}
                />
                <SvgText
                  x={midX}
                  y={midY + 4}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  fill={colors.surface1}
                >
                  {delta > 0 ? `+${delta}` : `${delta}`}
                </SvgText>
              </G>
            )}
          </G>
        );
      })}
    </Svg>
  );
}
