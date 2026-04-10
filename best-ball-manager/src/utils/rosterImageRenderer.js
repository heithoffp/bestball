// src/utils/rosterImageRenderer.js
// Canvas 2D renderer that produces a branded PNG image of a roster for social media sharing.
// Optimized for phone-sized social media feeds (Twitter, Reddit, Instagram stories).

import { BRAND_LOGO_SVG } from '../components/BrandLogo.jsx';
import { ARCHETYPE_METADATA } from './rosterArchetypes';
import { calcCLV, clvLabel } from './clvHelpers';
import { compactTournamentName } from './helpers';
import { NFL_TEAMS_ABBREV } from './nflTeams';

// ── Constants ────────────────────────────────────────────────────────────────

const W = 480;
const SCALE = 2; // retina
const PAD = 14;
const ROW_H = 21;

const COLORS = {
  bg0: '#060E1F',
  bg1: '#0C1A30',
  bg2: '#142440',
  accent: '#E8BF4A',
  textPrimary: '#E8E8E8',
  textSecondary: '#8A9BB5',
  textMuted: '#5a6a80',
  border: '#1a2d50',
};

const POS_COLORS = {
  QB: '#BF44EF',
  RB: '#10B981',
  WR: '#F59E0B',
  TE: '#3B82F6',
  K:  '#8A9BB5',
  DEF: '#8A9BB5',
  DST: '#8A9BB5',
};

const FONT_BODY = 'DM Sans';
const FONT_MONO = 'JetBrains Mono';

// ── Drawing helpers ──────────────────────────────────────────────────────────

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawPill(ctx, x, y, text, bgColor, textColor = '#fff', fontSize = 10) {
  ctx.font = `600 ${fontSize}px ${FONT_MONO}`;
  const tw = ctx.measureText(text).width;
  const pw = tw + 10;
  const ph = 17;
  ctx.fillStyle = bgColor + '33';
  roundRect(ctx, x, y, pw, ph, 3);
  ctx.fill();
  ctx.fillStyle = textColor;
  ctx.fillText(text, x + 5, y + 12.5);
  return pw;
}

function loadImage(svgString) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG load failed')); };
    img.src = url;
  });
}

function teamAbbrev(team) {
  if (!team) return '—';
  return NFL_TEAMS_ABBREV[team.toUpperCase()] || team;
}

// ── Main renderer ────────────────────────────────────────────────────────────

export async function renderRosterImage(roster, alpha = 0.5) {
  await document.fonts.ready;

  const sorted = [...roster.players].sort((a, b) => (a.pick || 999) - (b.pick || 999));
  const playerCount = sorted.length;

  // Dynamic height based on player count
  const H = 40 + 52 + 22 + (playerCount * ROW_H) + 62 + 26 + 14;

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  // ── Background ───────────────────────────────────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, COLORS.bg1);
  bgGrad.addColorStop(1, COLORS.bg0);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, W - 2, H - 2, 8);
  ctx.stroke();

  // ── Header ───────────────────────────────────────────────────────────────
  const headerH = 38;
  ctx.fillStyle = COLORS.bg2;
  ctx.fillRect(0, 0, W, headerH);
  ctx.strokeStyle = COLORS.accent + '44';
  ctx.beginPath();
  ctx.moveTo(0, headerH);
  ctx.lineTo(W, headerH);
  ctx.stroke();

  let logoX = PAD;
  try {
    const logo = await loadImage(BRAND_LOGO_SVG);
    ctx.drawImage(logo, logoX, 5, 28, 28);
    logoX += 33;
  } catch {
    logoX = PAD;
  }

  const goldGrad = ctx.createLinearGradient(logoX, 0, logoX + 200, 0);
  goldGrad.addColorStop(0, '#F0CC5B');
  goldGrad.addColorStop(0.5, '#D4A843');
  goldGrad.addColorStop(1, '#E8BF4A');
  ctx.font = `700 13px ${FONT_MONO}`;
  ctx.fillStyle = goldGrad;
  ctx.fillText('BEST BALL EXPOSURES', logoX, 24);

  ctx.font = `500 9px ${FONT_MONO}`;
  ctx.fillStyle = COLORS.textMuted;
  const urlText = 'bestballexposures.com';
  const urlW = ctx.measureText(urlText).width;
  ctx.fillText(urlText, W - urlW - PAD, 24);

  // ── Meta: tournament, date, archetypes, stats ────────────────────────────
  let y = headerH + 14;

  // Tournament name
  const tournamentName = compactTournamentName(roster.tournamentTitle) || 'Best Ball Draft';
  ctx.font = `600 12px ${FONT_BODY}`;
  ctx.fillStyle = COLORS.textPrimary;
  let tName = tournamentName;
  while (ctx.measureText(tName).width > W * 0.55 && tName.length > 3) {
    tName = tName.slice(0, -2) + '…';
  }
  ctx.fillText(tName, PAD, y);

  // Date right-aligned
  if (roster.draftDate) {
    const dateStr = roster.draftDate.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
    ctx.font = `500 10px ${FONT_MONO}`;
    ctx.fillStyle = COLORS.textSecondary;
    const dw = ctx.measureText(dateStr).width;
    ctx.fillText(dateStr, W - dw - PAD, y);
  }

  // Archetype pills + stats
  y += 21;
  let pillX = PAD;
  if (roster.path) {
    for (const key of [roster.path.rb, roster.path.qb, roster.path.te]) {
      if (!key) continue;
      const meta = ARCHETYPE_METADATA[key];
      if (!meta) continue;
      const pw = drawPill(ctx, pillX, y - 12, meta.name, meta.color, meta.color, 9);
      pillX += pw + 4;
    }
  }

  // Stats right-aligned
  ctx.font = `500 10px ${FONT_MONO}`;
  let sx = W - PAD;
  const projText = roster.projectedPoints?.toFixed(0) ?? '—';
  const projLabel = `Proj: ${projText}`;
  const projW = ctx.measureText(projLabel).width;
  sx -= projW;
  ctx.fillStyle = COLORS.textSecondary;
  ctx.fillText(projLabel, sx, y);

  if (roster.avgCLV !== null && roster.avgCLV !== undefined) {
    const clv = clvLabel(roster.avgCLV);
    const clvText = `CLV: ${clv.text}`;
    ctx.font = `600 10px ${FONT_MONO}`;
    const clvW = ctx.measureText(clvText).width;
    sx -= clvW + 10;
    ctx.fillStyle = clv.color;
    ctx.fillText(clvText, sx, y);
  }

  // ── Separator ────────────────────────────────────────────────────────────
  y += 12;
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();

  // ── Player table ─────────────────────────────────────────────────────────
  y += 14;
  const cw = W - PAD * 2; // content width

  // Columns: PLAYER POS TEAM PICK ADP PROJ CLV%
  // No RD column — redundant with PICK
  const cols = [
    { label: 'PLAYER', x: PAD,          align: 'left',  w: 140 },
    { label: 'POS',    x: PAD + 144,    align: 'left',  w: 28  },
    { label: 'TEAM',   x: PAD + 176,    align: 'left',  w: 30  },
    { label: 'PICK',   x: PAD + 218,    align: 'right', w: 32  },
    { label: 'ADP',    x: PAD + 262,    align: 'right', w: 38  },
    { label: 'PROJ',   x: PAD + 312,    align: 'right', w: 42  },
    { label: 'CLV%',   x: PAD + 366,    align: 'right', w: 55  },
  ];

  ctx.font = `700 8px ${FONT_MONO}`;
  ctx.fillStyle = COLORS.textMuted;
  for (const col of cols) {
    if (col.align === 'right') {
      const tw = ctx.measureText(col.label).width;
      ctx.fillText(col.label, col.x + col.w - tw, y);
    } else {
      ctx.fillText(col.label, col.x, y);
    }
  }

  y += 4;
  ctx.strokeStyle = COLORS.border;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();

  // ── Player rows ──────────────────────────────────────────────────────────
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    y += ROW_H;

    if (i % 2 === 1) {
      ctx.fillStyle = 'rgba(12, 26, 48, 0.5)';
      ctx.fillRect(PAD - 2, y - 14, cw + 4, ROW_H);
    }

    const posColor = POS_COLORS[p.position] || COLORS.textSecondary;

    // Name
    ctx.font = `500 11px ${FONT_BODY}`;
    ctx.fillStyle = COLORS.textPrimary;
    let name = p.name || 'Unknown';
    while (ctx.measureText(name).width > 135 && name.length > 3) {
      name = name.slice(0, -2) + '…';
    }
    ctx.fillText(name, cols[0].x, y);

    // Position pill
    const posStr = p.position || '??';
    ctx.font = `700 8px ${FONT_MONO}`;
    const ppw = ctx.measureText(posStr).width + 8;
    ctx.fillStyle = posColor + '33';
    roundRect(ctx, cols[1].x, y - 10, ppw, 14, 3);
    ctx.fill();
    ctx.fillStyle = posColor;
    ctx.fillText(posStr, cols[1].x + 4, y);

    // Team
    ctx.font = `500 10px ${FONT_MONO}`;
    ctx.fillStyle = COLORS.textSecondary;
    ctx.fillText(teamAbbrev(p.team), cols[2].x, y);

    // Pick
    ctx.font = `500 11px ${FONT_MONO}`;
    ctx.fillStyle = COLORS.textPrimary;
    const pickText = p.pick ? String(p.pick) : '—';
    const pickW = ctx.measureText(pickText).width;
    ctx.fillText(pickText, cols[3].x + cols[3].w - pickW, y);

    // ADP
    const adpText = p.latestADP ? p.latestADP.toFixed(1) : '—';
    const adpW = ctx.measureText(adpText).width;
    ctx.fillStyle = COLORS.textSecondary;
    ctx.fillText(adpText, cols[4].x + cols[4].w - adpW, y);

    // Proj
    const projPts = p.projectedPoints ? p.projectedPoints.toFixed(1) : '—';
    const projPtsW = ctx.measureText(projPts).width;
    ctx.fillStyle = COLORS.textPrimary;
    ctx.fillText(projPts, cols[5].x + cols[5].w - projPtsW, y);

    // CLV
    const playerCLV = calcCLV(p.pick, p.latestADP, alpha);
    const clv = clvLabel(playerCLV);
    ctx.font = `600 10px ${FONT_MONO}`;
    const clvW = ctx.measureText(clv.text).width;
    ctx.fillStyle = clv.color;
    ctx.fillText(clv.text, cols[6].x + cols[6].w - clvW, y);
  }

  // ── Draft Capital Map ────────────────────────────────────────────────────
  y += 20;
  ctx.strokeStyle = COLORS.border;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();

  y += 12;
  ctx.font = `700 8px ${FONT_MONO}`;
  ctx.fillStyle = COLORS.textMuted;
  ctx.fillText('DRAFT CAPITAL', PAD, y);

  y += 7;
  const mapW = W - PAD * 2;
  const totalRounds = Math.max(18, ...sorted.map(p => p.round || (p.pick ? Math.ceil(p.pick / 12) : 0)));
  const cellW = Math.floor(mapW / totalRounds);
  const cellH = 18;

  const roundMap = {};
  for (const p of sorted) {
    const rd = p.round || (p.pick ? Math.ceil(p.pick / 12) : null);
    if (rd && rd >= 1 && rd <= totalRounds) {
      if (!roundMap[rd]) roundMap[rd] = [];
      roundMap[rd].push(p.position);
    }
  }

  for (let rd = 1; rd <= totalRounds; rd++) {
    const cx = PAD + (rd - 1) * cellW;
    const positions = roundMap[rd] || [];

    if (positions.length > 0) {
      const mainPos = positions[0];
      const color = POS_COLORS[mainPos] || COLORS.textMuted;
      ctx.fillStyle = color + '44';
      roundRect(ctx, cx + 1, y, cellW - 2, cellH, 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.font = `700 7px ${FONT_MONO}`;
      const label = positions.length > 1 ? `${positions.length}` : mainPos;
      const lw = ctx.measureText(label).width;
      ctx.fillText(label, cx + (cellW - lw) / 2, y + 12);
    } else {
      ctx.fillStyle = 'rgba(26, 45, 80, 0.3)';
      roundRect(ctx, cx + 1, y, cellW - 2, cellH, 2);
      ctx.fill();
    }

    ctx.font = `500 6px ${FONT_MONO}`;
    ctx.fillStyle = COLORS.textMuted;
    const rdLabel = String(rd);
    const rdLW = ctx.measureText(rdLabel).width;
    ctx.fillText(rdLabel, cx + (cellW - rdLW) / 2, y + cellH + 9);
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  const footerY = H - 8;
  ctx.fillStyle = COLORS.bg2;
  ctx.fillRect(0, H - 24, W, 24);
  ctx.strokeStyle = COLORS.accent + '33';
  ctx.beginPath();
  ctx.moveTo(0, H - 24);
  ctx.lineTo(W, H - 24);
  ctx.stroke();

  ctx.font = `600 9px ${FONT_MONO}`;
  ctx.fillStyle = COLORS.accent;
  ctx.fillText('bestballexposures.com', PAD, footerY);

  ctx.fillStyle = COLORS.textMuted;
  ctx.font = `500 8px ${FONT_MONO}`;
  const footerRight = 'Share your portfolio';
  const frW = ctx.measureText(footerRight).width;
  ctx.fillText(footerRight, W - frW - PAD, footerY);

  // ── Export ───────────────────────────────────────────────────────────────
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
      'image/png'
    );
  });
}
