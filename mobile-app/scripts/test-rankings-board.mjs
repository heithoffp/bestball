// test-rankings-board.mjs — Node regression tests for the Rankings drag-board
// state logic (src/screens/rankings/boardItems.js).
// Run from mobile-app/:  node scripts/test-rankings-board.mjs

import {
  buildFlatItems, applyFlatReorder, applyFilteredReorder,
  computeTierMaps, moveToRank, reorderItems,
} from '../src/screens/rankings/boardItems.js';

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function ids(players) { return players.map(p => p.id).join(','); }

const P = (id, pos = 'WR') => ({ id, name: id.toUpperCase(), slotName: pos });

// Board: a b | c d | e   (breaks above c and e)
const players = [P('a'), P('b'), P('c'), P('d'), P('e')];
const breaks = new Set(['c', 'e']);
const labels = { __tier1__: 'Elite', c: 'Mid', e: 'Late' };

// ── buildFlatItems ───────────────────────────────────────────────
{
  const flat = buildFlatItems(players, breaks);
  const shape = flat.map(i => (i.type === 'player' ? i.player.id : `${i.type[0]}:${i.ownerId}`)).join(' ');
  check('flat interleaving', shape === 'a i:b b d:c c i:d d d:e e', shape);
  check('flat tier numbers', flat.filter(i => i.type === 'player').map(i => i.tierNum).join('') === '11223');

  const noEdit = buildFlatItems(players, breaks, { editable: false });
  check('read-only omits insert pills', noEdit.every(i => i.type !== 'insert') && noEdit.length === 7);

  const { tierByPlayer, labelByTier } = computeTierMaps(players, breaks, labels);
  check('tier map', tierByPlayer.get('a') === 1 && tierByPlayer.get('d') === 2 && tierByPlayer.get('e') === 3);
  check('tier labels', labelByTier.get(1) === 'Elite' && labelByTier.get(2) === 'Mid' && labelByTier.get(3) === 'Late');
}

// ── applyFlatReorder: simple same-tier move ──────────────────────
{
  const flat = buildFlatItems(players, breaks);
  // drag a (idx 0) just past b (insert pill idx 1, b idx 2) → drop at idx 2
  const res = applyFlatReorder(flat, 0, 2, labels);
  check('same-tier swap order', ids(res.players) === 'b,a,c,d,e', ids(res.players));
  check('same-tier swap keeps breaks', [...res.breaks].sort().join(',') === 'c,e');
  check('same-tier swap keeps labels', res.labels.__tier1__ === 'Elite' && res.labels.c === 'Mid');
}

// ── applyFlatReorder: drop directly beneath a divider (new first of tier) ──
{
  const flat = buildFlatItems(players, breaks);
  // flat: a(0) i(1) b(2) div-c(3) c(4) i(5) d(6) div-e(7) e(8)
  // drag a to idx 3 → after removal+insert it sits right under div-c, above c
  // → a becomes the first player of tier 2
  const res = applyFlatReorder(flat, 0, 3, labels);
  check('drop under divider order', ids(res.players) === 'b,a,c,d,e', ids(res.players));
  check('break re-attaches to dropped player', res.breaks.has('a') && !res.breaks.has('c'));
  check('label migrates to new owner', res.labels.a === 'Mid' && res.labels.c === undefined);
}

// ── applyFlatReorder: break-owning player dragged away ───────────
{
  const flat = buildFlatItems(players, breaks);
  // drag c (idx 4) to end (idx 8) → divider above c now sits above d
  const res = applyFlatReorder(flat, 4, 8, labels);
  check('owner-moved order', ids(res.players) === 'a,b,d,e,c', ids(res.players));
  check('break stays physical, re-attaches to d', res.breaks.has('d') && !res.breaks.has('c'));
  check('label follows the boundary', res.labels.d === 'Mid');
  check('tier-3 break survives', res.breaks.has('e') && res.labels.e === 'Late');
}

// ── applyFlatReorder: tier emptied → adjacent dividers collapse ──
{
  // Board: a | b | c  (b alone in tier 2)
  const pl = [P('a'), P('b'), P('c')];
  const br = new Set(['b', 'c']);
  const lb = { b: 'Solo', c: 'Last' };
  const flat = buildFlatItems(pl, br);
  // flat: a(0) div-b(1) b(2) div-c(3) c(4); drag b to end (idx 4)
  const res = applyFlatReorder(flat, 2, 4, lb);
  check('emptied-tier order', ids(res.players) === 'a,c,b', ids(res.players));
  check('adjacent dividers collapse to one', res.breaks.size === 1 && res.breaks.has('c'));
  check('closest divider label wins', res.labels.c === 'Last' && res.labels.b === undefined);
}

// ── applyFlatReorder: drop at very top (above tier-1 header is impossible;
//     index 0 crowns a new #1) ─────────────────────────────────────
{
  const flat = buildFlatItems(players, breaks);
  // drag d (idx 6) to idx 0
  const res = applyFlatReorder(flat, 6, 0, labels);
  check('new #1 order', ids(res.players) === 'd,a,b,c,e', ids(res.players));
  check('breaks unchanged by top drop', res.breaks.has('c') && res.breaks.has('e') && res.breaks.size === 2);
}

// ── applyFlatReorder: first tier emptied → divider dissolves into tier-1 rail ──
{
  // Board: a | b c  — drag a below b: dividers left above new first player
  const pl = [P('a'), P('b'), P('c')];
  const br = new Set(['b']);
  const lb = { __tier1__: 'Top', b: 'Next' };
  const flat = buildFlatItems(pl, br);
  // flat: a(0) div-b(1) b(2) i(3) c(4); drag a to idx 2 (below div-b, above b)…
  // that's the "drop under divider" case. To empty tier 1 entirely, drop a at the END.
  const res = applyFlatReorder(flat, 0, 4, lb);
  check('tier-1 emptied order', ids(res.players) === 'b,c,a', ids(res.players));
  check('leading divider dissolves', res.breaks.size === 0);
  check('dissolved divider label becomes tier-1 label', res.labels.__tier1__ === 'Next');
}

// ── applyFlatReorder: trailing divider dissolves ─────────────────
{
  // Board: a b | c — drag c (last tier's only player) to the top
  const pl = [P('a'), P('b'), P('c')];
  const br = new Set(['c']);
  const flat = buildFlatItems(pl, br);
  // flat: a(0) i(1) b(2) div-c(3) c(4); drag c to idx 0
  const res = applyFlatReorder(flat, 4, 0, { c: 'Tail' });
  check('trailing order', ids(res.players) === 'c,a,b', ids(res.players));
  check('trailing divider dissolves', res.breaks.size === 0);
  check('trailing label dropped', res.labels.c === undefined);
}

// ── applyFlatReorder: no-ops ─────────────────────────────────────
{
  const flat = buildFlatItems(players, breaks);
  check('same-index move is null', applyFlatReorder(flat, 0, 0, labels) === null);
  check('dragging a divider is null', applyFlatReorder(flat, 3, 0, labels) === null);
}

// ── applyFilteredReorder (position views) ────────────────────────
{
  const full = [P('a', 'WR'), P('b', 'RB'), P('c', 'WR'), P('d', 'RB'), P('e', 'WR')];
  const wrs = full.filter(p => p.slotName === 'WR'); // a, c, e
  // Move e (filtered idx 2) above a (filtered idx 0)
  const res = applyFilteredReorder(full, wrs, 2, 0);
  check('filtered move to front', ids(res) === 'e,a,b,c,d', ids(res));
  // Move a (filtered idx 0) after c (filtered idx 1)
  const res2 = applyFilteredReorder(full, wrs, 0, 1);
  check('filtered move anchors after prev neighbor', ids(res2) === 'b,c,a,d,e', ids(res2));
  check('filtered no-op is null', applyFilteredReorder(full, wrs, 1, 1) === null);
}

// ── moveToRank / reorderItems ────────────────────────────────────
{
  check('reorderItems basic', ids(reorderItems(players, 0, 4)) === 'b,c,d,e,a');
  check('moveToRank clamps high', ids(moveToRank(players, 'a', 99)) === 'b,c,d,e,a');
  check('moveToRank exact', ids(moveToRank(players, 'e', 2)) === 'a,e,b,c,d');
  check('moveToRank same rank is null', moveToRank(players, 'b', 2) === null);
  check('moveToRank unknown id is null', moveToRank(players, 'zz', 1) === null);
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll rankings board tests passed.');
