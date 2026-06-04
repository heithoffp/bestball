// scripts/lib/digest/template.mjs
//
// PURE rendering — turns the assemble.mjs model into email HTML + text.
// Mirror, not advisor: copy describes state only. The token list below is the
// guardrail the unit test asserts against.

export const BANNED_ADVISOR_TOKENS = ['should', 'fade', 'target', 'avoid', 'must', 'recommend'];

const BRAND = 'Best Ball Exposures';
const C = { ink: '#0f172a', muted: '#64748b', line: '#e2e8f0', accent: '#7c3aed', up: '#059669', down: '#dc2626' };

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function section(title, inner) {
  return `<tr><td style="padding:20px 24px 0 24px;">
    <div style="font:600 13px/1.4 system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:${C.muted};">${esc(title)}</div>
    <div style="margin-top:8px;font:400 15px/1.5 system-ui,sans-serif;color:${C.ink};">${inner}</div>
  </td></tr>`;
}

function moverLine(m) {
  const color = m.direction === 'riser' ? C.up : C.down;
  const arrow = m.direction === 'riser' ? '▲' : '▼';
  const pct = Math.round(m.pct * 100);
  return `<div style="padding:4px 0;">
    <span style="color:${color};font-weight:600;">${arrow} ${esc(m.name)}</span>
    <span style="color:${C.muted};"> ${m.fromPick.toFixed(1)} → ${m.toPick.toFixed(1)} (${pct}%, ${esc(m.platform)})</span>
  </div>`;
}

function whatChanged(model) {
  const parts = [];
  if (model.newRosterCount > 0) {
    parts.push(`<div style="padding:4px 0;">➕ ${model.newRosterCount} new roster${model.newRosterCount === 1 ? '' : 's'} synced this week</div>`);
  }
  for (const s of model.exposureShifts) {
    const color = s.delta > 0 ? C.up : C.down;
    const sign = s.delta > 0 ? '+' : '';
    parts.push(`<div style="padding:4px 0;">📊 ${esc(s.name)} exposure ${esc(s.fromPct.toFixed(0))}% → <span style="color:${color};font-weight:600;">${esc(s.toPct.toFixed(0))}%</span> (${sign}${s.delta.toFixed(0)} pts)</div>`);
  }
  return parts.join('') || `<div style="color:${C.muted};">No major changes since last week.</div>`;
}

function ownedMovers(model) {
  if (model.ownedMovers.length === 0) return '';
  return section('ADP movers in your portfolio', model.ownedMovers.map(moverLine).join(''));
}

function leagueMovers(model) {
  const { risers, fallers } = model.leagueMovers;
  if (risers.length === 0 && fallers.length === 0) return '';
  return section('ADP movers this week', risers.concat(fallers).map(moverLine).join(''));
}

function teaserBlock(model) {
  const t = model.teaser;
  if (!t) return '';
  // Free-tier hook: a locked insight described, with a deep-link CTA.
  return `<tr><td style="padding:20px 24px 0 24px;">
    <div style="border:1px solid ${C.line};border-radius:12px;padding:16px;background:#faf5ff;">
      <div style="font:600 15px/1.4 system-ui,sans-serif;color:${C.accent};">🔒 ${esc(t.title)}</div>
      <div style="margin-top:6px;font:400 14px/1.5 system-ui,sans-serif;color:${C.ink};">${esc(t.body)}</div>
      <a href="${esc(t.ctaUrl)}" style="display:inline-block;margin-top:12px;background:${C.accent};color:#fff;text-decoration:none;font:600 14px system-ui,sans-serif;padding:10px 16px;border-radius:8px;">${esc(t.ctaText)} →</a>
    </div>
  </td></tr>`;
}

function fullInsightBlock(model) {
  // Paid tier: the same kind of insight, shown in full (no lock, no upsell).
  const a = model.archetypeMix.slice(0, 4)
    .map((x) => `<div style="padding:3px 0;">${esc(x.label)}: ${x.count} (${x.pct}%)</div>`).join('');
  return section('Your portfolio mix', a || `<span style="color:${C.muted};">Sync rosters to see your archetype mix.</span>`);
}

function blogBlock(model) {
  if (!model.blog) return '';
  return section('From the blog', `<a href="${esc(model.blog.url)}" style="color:${C.accent};font-weight:600;text-decoration:none;">${esc(model.blog.title)} →</a>`);
}

function syncNudge(model) {
  if (model.rosterCount > 0) return '';
  return section('Get your portfolio picture', `Sync your Underdog or DraftKings drafts to see your exposures, archetypes, and stacks. <a href="${SITE_INSTALL}" style="color:${C.accent};font-weight:600;text-decoration:none;">Install the extension →</a>`);
}
const SITE_INSTALL = 'https://bestballexposures.com/install';

function footer(model, unsubscribeUrl) {
  const seasonal = model.seasonalFooter
    ? `<div style="margin-bottom:10px;">Drafting all summer? <strong>Seasonal is $50</strong> (vs $20/mo) for the full analytics suite. <a href="https://bestballexposures.com" style="color:${C.accent};text-decoration:none;">See plans →</a></div>`
    : '';
  return `<tr><td style="padding:24px;border-top:1px solid ${C.line};margin-top:16px;">
    <div style="font:400 12px/1.6 system-ui,sans-serif;color:${C.muted};">
      ${seasonal}
      ${BRAND} — your portfolio, mirrored.<br/>
      <a href="${esc(unsubscribeUrl)}" style="color:${C.muted};text-decoration:underline;">Unsubscribe from the weekly digest</a>
    </div>
  </td></tr>`;
}

/**
 * Render one user's digest.
 * @returns {{ subject, html, text, headers }}
 */
export function renderUserEmail(model, { subject, unsubscribeUrl }) {
  const body = [
    `<tr><td style="padding:24px 24px 0 24px;">
       <div style="font:700 20px/1.3 system-ui,sans-serif;color:${C.ink};">${BRAND}</div>
       <div style="font:400 14px system-ui,sans-serif;color:${C.muted};">Your week — ${model.rosterCount} roster${model.rosterCount === 1 ? '' : 's'}</div>
     </td></tr>`,
    model.mode === 'personalized'
      ? section('What changed', whatChanged(model))
      : leagueMovers(model),
    ownedMovers(model),
    model.tier === 'free' ? teaserBlock(model) : fullInsightBlock(model),
    blogBlock(model),
    syncNudge(model),
    footer(model, unsubscribeUrl),
  ].join('');

  const html = `<!doctype html><html><body style="margin:0;background:#f8fafc;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid ${C.line};border-radius:16px;overflow:hidden;max-width:600px;">
          ${body}
        </table>
      </td></tr>
    </table>
  </body></html>`;

  return { subject, html, text: toText(model), headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` } };
}

function toText(model) {
  const lines = [`${BRAND} — your week (${model.rosterCount} rosters)`, ''];
  if (model.mode === 'personalized') {
    if (model.newRosterCount) lines.push(`+ ${model.newRosterCount} new rosters synced`);
    for (const s of model.exposureShifts) lines.push(`${s.name}: ${s.fromPct.toFixed(0)}% -> ${s.toPct.toFixed(0)}%`);
  }
  for (const m of model.ownedMovers) lines.push(`${m.direction === 'riser' ? 'UP' : 'DOWN'} ${m.name} ${m.fromPick.toFixed(1)} -> ${m.toPick.toFixed(1)}`);
  if (model.teaser) lines.push('', model.teaser.title, model.teaser.ctaUrl);
  if (model.blog) lines.push('', `Blog: ${model.blog.title} ${model.blog.url}`);
  return lines.join('\n');
}

/**
 * Render a single combined preview email (manifest + every user's rendered digest)
 * for the developer to review before sending to everyone.
 */
export function renderPreview(items) {
  const eligible = items.filter((i) => i.included);
  const manifest = items.map((i) =>
    `<tr><td style="padding:4px 8px;border-bottom:1px solid ${C.line};font:13px system-ui;">${esc(i.email)}</td>
     <td style="padding:4px 8px;border-bottom:1px solid ${C.line};font:13px system-ui;color:${C.muted};">${i.included ? i.mode : 'excluded (opted out)'}</td>
     <td style="padding:4px 8px;border-bottom:1px solid ${C.line};font:13px system-ui;color:${C.muted};">${esc(i.tier)}</td></tr>`
  ).join('');

  const previews = eligible.map((i) =>
    `<div style="margin:24px 0;"><div style="font:600 13px system-ui;color:${C.muted};padding:8px 0;">↓ ${esc(i.email)} (${i.mode}, ${i.tier}) — subject: "${esc(i.subject)}"</div>${i.html}</div>`
  ).join('<hr/>');

  const html = `<!doctype html><html><body style="font-family:system-ui;padding:16px;">
    <h2>Weekly digest preview — ${eligible.length} to send, ${items.length - eligible.length} excluded</h2>
    <table style="border-collapse:collapse;width:100%;max-width:700px;">
      <tr><th align="left" style="font:600 12px system-ui;color:${C.muted};padding:4px 8px;">email</th>
          <th align="left" style="font:600 12px system-ui;color:${C.muted};padding:4px 8px;">mode</th>
          <th align="left" style="font:600 12px system-ui;color:${C.muted};padding:4px 8px;">tier</th></tr>
      ${manifest}
    </table>
    ${previews}
  </body></html>`;

  return { subject: `[PREVIEW] Weekly digest — ${eligible.length} recipients`, html };
}
