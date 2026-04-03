/**
 * BrandLogo — Best Ball Portfolio Manager circular mark
 *
 * Abstract mark: 4 unequal arc segments on an inner circle, representing
 * portfolio exposure distribution across positions. Gold gradient on dark.
 *
 * Circle geometry (48×48 viewBox, center 24,24):
 *   Outer ring:  r=22.5, 2px stroke
 *   Arc ring:    r=14,   3.5px stroke, circumference≈87.96
 *   Arc pattern: "18 7 10 7 23 7 8 7.96" (4 arcs, irregular gaps)
 *   Center dot:  r=2.5
 *
 * Props:
 *   size      {number}  px dimension (default 40)
 *   className {string}
 *   style     {object}
 */
import { useId } from 'react';

export default function BrandLogo({ size = 40, className = '', style = {} }) {
  const uid = useId().replace(/:/g, '');

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      role="img"
      aria-label="Best Ball Portfolio Manager"
    >
      <defs>
        {/* Gold gradient across the inner mark area (top-left → bottom-right) */}
        <linearGradient
          id={`${uid}-gold`}
          x1="10" y1="10" x2="38" y2="38"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%"   stopColor="#F0CC5B" />
          <stop offset="50%"  stopColor="#D4A843" />
          <stop offset="100%" stopColor="#E8BF4A" />
        </linearGradient>

        {/* Background gradient — surface-1 → surface-0 */}
        <linearGradient id={`${uid}-bg`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#0C1A30" />
          <stop offset="100%" stopColor="#060E1F" />
        </linearGradient>
      </defs>

      {/* Background */}
      <circle cx="24" cy="24" r="24" fill={`url(#${uid}-bg)`} />

      {/* Outer ring */}
      <circle
        cx="24" cy="24" r="22.5"
        fill="none"
        stroke={`url(#${uid}-gold)`}
        strokeWidth="2"
      />

      {/* Faint guide circle behind the arcs */}
      <circle
        cx="24" cy="24" r="14"
        fill="none"
        stroke="#E8BF4A"
        strokeWidth="0.5"
        opacity="0.18"
      />

      {/*
        4 segmented arcs — unequal lengths simulate real portfolio exposure.
        Circumference of r=14 ≈ 87.96.
        dasharray: arc1=18  gap=7  arc2=10  gap=7  arc3=23  gap=7  arc4=8  gap≈7.96
        rotate(-90) starts drawing from the top (12 o'clock).
      */}
      <circle
        cx="24" cy="24" r="14"
        fill="none"
        stroke={`url(#${uid}-gold)`}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray="18 7 10 7 23 7 8 7.96"
        transform="rotate(-90 24 24)"
      />

      {/* Center anchor dot */}
      <circle cx="24" cy="24" r="2.5" fill={`url(#${uid}-gold)`} />
    </svg>
  );
}

/**
 * Raw SVG string for chrome extension content scripts.
 * Fixed gradient IDs — safe for single-instance injection.
 */
export const BRAND_LOGO_SVG = `<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Best Ball Portfolio Manager">
  <defs>
    <linearGradient id="bb-gold" x1="10" y1="10" x2="38" y2="38" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="#F0CC5B"/>
      <stop offset="50%"  stop-color="#D4A843"/>
      <stop offset="100%" stop-color="#E8BF4A"/>
    </linearGradient>
    <linearGradient id="bb-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#0C1A30"/>
      <stop offset="100%" stop-color="#060E1F"/>
    </linearGradient>
  </defs>
  <circle cx="24" cy="24" r="24" fill="url(#bb-bg)"/>
  <circle cx="24" cy="24" r="22.5" fill="none" stroke="url(#bb-gold)" stroke-width="2"/>
  <circle cx="24" cy="24" r="14" fill="none" stroke="#E8BF4A" stroke-width="0.5" opacity="0.18"/>
  <circle cx="24" cy="24" r="14" fill="none" stroke="url(#bb-gold)" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="18 7 10 7 23 7 8 7.96" transform="rotate(-90 24 24)"/>
  <circle cx="24" cy="24" r="2.5" fill="url(#bb-gold)"/>
</svg>`;
