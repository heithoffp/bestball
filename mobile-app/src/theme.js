// theme.js — design tokens ported from best-ball-manager/src/index.css :root.
// One dark theme (the web app's brand look): layered navy surfaces + gold accent.

export const colors = {
  // Surfaces (layered depth)
  surface0: '#060E1F',
  surface1: '#0C1A30',
  surface2: '#142440',
  surface3: '#1C3055',

  // Borders
  borderSubtle: '#1a2d50',
  borderDefault: '#243a5c',
  borderStrong: '#2e4a6e',

  // Text
  textPrimary: '#E8E8E8',
  textSecondary: '#8A9BB5',
  textMuted: '#5a6a80',
  textInverse: '#060E1F',

  // Brand accent (gold)
  accent: '#E8BF4A',
  accentHover: '#F0CC5B',
  accentMuted: 'rgba(232, 191, 74, 0.15)',

  // Semantic
  positive: '#2ECC71',
  negative: '#E74C3C',
  info: '#3B82F6',

  // Positions (canonical — matches utils/positionColors.js)
  posQB: '#BF44EF',
  posRB: '#10B981',
  posWR: '#F59E0B',
  posTE: '#3B82F6',
};

export const posBg = {
  QB: 'rgba(191, 68, 239, 0.15)',
  RB: 'rgba(16, 185, 129, 0.15)',
  WR: 'rgba(245, 158, 11, 0.15)',
  TE: 'rgba(59, 130, 246, 0.15)',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export const radii = { sm: 6, md: 10, lg: 14, pill: 999 };

export const type = {
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  h2: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  h3: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  body: { fontSize: 14, color: colors.textPrimary },
  secondary: { fontSize: 13, color: colors.textSecondary },
  muted: { fontSize: 12, color: colors.textMuted },
  mono: { fontSize: 13, fontVariant: ['tabular-nums'], color: colors.textPrimary },
};
