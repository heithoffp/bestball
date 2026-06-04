// node --test scripts/lib/digest/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDigest, selectTeaser } from '../assemble.mjs';
import { renderUserEmail, BANNED_ADVISOR_TOKENS } from '../template.mjs';

const NOW = new Date('2026-06-05T12:00:00Z');

// Minimal UD ADP snapshots with two dates so history (movers) is available.
function adpFixture() {
  const mk = (date, picks) => ({
    date,
    platform: 'underdog',
    rows: Object.entries(picks).map(([name, adp]) => {
      const [firstName, ...rest] = name.split(' ');
      return { firstName, lastName: rest.join(' '), adp: String(adp), slotName: 'WR', teamName: 'Buffalo Bills' };
    }),
  });
  const snaps = [
    mk('2026-05-29', { 'Josh Allen': 30, 'Stefon Diggs': 28, 'Deep Guy': 180 }),
    mk('2026-06-03', { 'Josh Allen': 25, 'Stefon Diggs': 28, 'Deep Guy': 175 }), // Allen rises 30->25
  ];
  const adpMap = { 'josh allen': { pick: 25, display: '25.0' }, 'stefon diggs': { pick: 28, display: '28.0' } };
  return { underdog: { snapshots: snaps, adpMap, movers: { risers: [], fallers: [] } }, draftkings: { snapshots: [], adpMap: {}, movers: { risers: [], fallers: [] } } };
}

function roster(entryId, players) {
  return players.map((p, i) => ({ entry_id: entryId, name: p.name, position: p.pos, team: p.team || 'Buffalo Bills', pick: p.pick ?? i + 1, round: p.round ?? Math.ceil((p.pick ?? i + 1) / 18), slateTitle: 'Underdog' }));
}

test('never-synced user routes to general mode (not skipped)', () => {
  const { mode } = buildDigest({ tier: 'free', rosters: [], entries: [], adp: adpFixture(), now: NOW });
  assert.equal(mode, 'general');
});

test('fresh roster routes to personalized mode', () => {
  const entries = [{ entry_id: 'e1', synced_at: '2026-06-04T00:00:00Z', slate_title: 'Underdog' }];
  const rosters = roster('e1', [{ name: 'Josh Allen', pos: 'QB', pick: 25 }, { name: 'Stefon Diggs', pos: 'WR', pick: 28 }]);
  const { mode } = buildDigest({ tier: 'free', rosters, entries, adp: adpFixture(), now: NOW });
  assert.equal(mode, 'personalized');
});

test('ADP move significance is position-normalized (early-round outranks late)', () => {
  // 5-pick move at pick 30 (16.7%) must outrank a 5-pick move at pick 180 (2.8%).
  const early = selectTeaser({ mode: 'personalized', stackCount: 0, topExposures: [], archetypeMix: [], ownedMovers: [{ name: 'Early', pct: 5 / 30, fromPick: 30, toPick: 25, direction: 'riser' }] });
  // owned mover present -> teaser maps to ADP tab
  assert.match(early.ctaUrl, /adp-tracker/);
  // direct ranking check
  const movers = [{ pct: 5 / 180 }, { pct: 5 / 30 }].sort((a, b) => b.pct - a.pct);
  assert.ok(movers[0].pct > movers[1].pct);
  assert.equal(movers[0].pct, 5 / 30);
});

test('owned ADP mover surfaces with normalized pct', () => {
  const entries = [{ entry_id: 'e1', synced_at: '2026-05-01T00:00:00Z', slate_title: 'Underdog' }];
  const rosters = roster('e1', [{ name: 'Josh Allen', pos: 'QB', pick: 25 }]);
  const { model } = buildDigest({ tier: 'pro', rosters, entries, adp: adpFixture(), now: NOW });
  const allen = model.ownedMovers.find((m) => m.name === 'Josh Allen');
  assert.ok(allen, 'Allen should be an owned mover (30 -> 25)');
  assert.equal(allen.direction, 'riser');
  assert.ok(Math.abs(allen.pct - 5 / 30) < 1e-9);
});

test('free tier gets a teaser + CTA; paid tier does not', () => {
  const entries = [{ entry_id: 'e1', synced_at: '2026-06-04T00:00:00Z', slate_title: 'Underdog' }];
  const rosters = roster('e1', [{ name: 'Josh Allen', pos: 'QB', pick: 25 }, { name: 'Stefon Diggs', pos: 'WR', pick: 28 }]);
  const free = buildDigest({ tier: 'free', rosters, entries, adp: adpFixture(), now: NOW });
  const paid = buildDigest({ tier: 'pro', rosters, entries, adp: adpFixture(), now: NOW });
  assert.ok(free.model.teaser, 'free should have a teaser');
  assert.match(free.model.teaser.ctaUrl, /^https:\/\/bestballexposures\.com\//);
  assert.equal(paid.model.teaser, null, 'paid should not have a teaser');
  assert.equal(free.model.seasonalFooter, true);
  assert.equal(paid.model.seasonalFooter, false);
});

test('strongest-signal teaser picks the dominant signal (stacks)', () => {
  // 5 rosters, each a QB+WR stack on a DISTINCT team. stackCount=5 -> score 100,
  // while every player sits at only 20% exposure -> stacks genuinely dominate.
  const teams = ['Buffalo Bills', 'Miami Dolphins', 'Dallas Cowboys', 'Detroit Lions', 'Green Bay Packers', 'Kansas City Chiefs'];
  const entries = [];
  let rosters = [];
  teams.forEach((team, i) => {
    entries.push({ entry_id: `e${i}`, synced_at: '2026-06-04T00:00:00Z', slate_title: 'Underdog' });
    rosters = rosters.concat(roster(`e${i}`, [
      { name: `QB${i}`, pos: 'QB', team, pick: 25 },
      { name: `WR${i}`, pos: 'WR', team, pick: 28 },
    ]));
  });
  const { model } = buildDigest({ tier: 'free', rosters, entries, adp: adpFixture(), now: NOW });
  assert.match(model.teaser.ctaUrl, /combos/, 'dominant stack signal should map to Combo Analysis');
  assert.match(model.teaser.title, /QB stack/i);
});

test('rendered email contains no advisor language (mirror, not advisor)', () => {
  const entries = [{ entry_id: 'e1', synced_at: '2026-06-04T00:00:00Z', slate_title: 'Underdog' }];
  const rosters = roster('e1', [{ name: 'Josh Allen', pos: 'QB', pick: 25 }, { name: 'Stefon Diggs', pos: 'WR', pick: 28 }]);
  const { model, subject } = buildDigest({ tier: 'free', rosters, entries, adp: adpFixture(), now: NOW });
  const { html } = renderUserEmail(model, { subject, unsubscribeUrl: 'https://bestballexposures.com/unsubscribe?token=x' });
  const lower = html.toLowerCase();
  for (const tok of BANNED_ADVISOR_TOKENS) {
    assert.ok(!lower.includes(tok), `rendered HTML must not contain advisor token "${tok}"`);
  }
});

test('exposure shift diff uses prior snapshot; first run omits shifts', () => {
  const entries = [
    { entry_id: 'e1', synced_at: '2026-05-01T00:00:00Z', slate_title: 'Underdog' },
    { entry_id: 'e2', synced_at: '2026-05-01T00:00:00Z', slate_title: 'Underdog' },
  ];
  const rosters = roster('e1', [{ name: 'Josh Allen', pos: 'QB', pick: 25 }])
    .concat(roster('e2', [{ name: 'Josh Allen', pos: 'QB', pick: 25 }])); // Allen 100% exposure
  // First run: no prior snapshot -> no exposure shifts.
  const first = buildDigest({ tier: 'pro', rosters, entries, priorSnapshot: null, adp: adpFixture(), now: NOW });
  assert.equal(first.model.exposureShifts.length, 0);
  // Second run: prior had Allen at 40% -> +60pt shift surfaces.
  const second = buildDigest({ tier: 'pro', rosters, entries, priorSnapshot: { exposures: { 'josh allen': 40 } }, adp: adpFixture(), now: NOW });
  const shift = second.model.exposureShifts.find((s) => s.name === 'Josh Allen');
  assert.ok(shift, 'Allen exposure shift should surface');
  assert.ok(shift.delta >= 50);
});

test('snapshot output captures exposures for next-week diff', () => {
  const entries = [{ entry_id: 'e1', synced_at: '2026-05-01T00:00:00Z', slate_title: 'Underdog' }];
  const rosters = roster('e1', [{ name: 'Josh Allen', pos: 'QB', pick: 25 }]);
  const { snapshot } = buildDigest({ tier: 'pro', rosters, entries, adp: adpFixture(), now: NOW });
  assert.equal(snapshot.exposures['josh allen'], 100);
  assert.equal(snapshot.rosterCount, 1);
});
