/**
 * Normalize a UD draft response into our storage shape.
 *
 * Input: the JSON body of GET /v2/drafts/{id}, plus the slate reference data
 * (appearances / players / teams) fetched from the stats API. UD picks carry
 * only `appearance_id` — player identity requires the join
 * appearance → player → team, mirroring the customer extension's
 * `normalizePick` in chrome-extension/src/injected/underdog-bridge.js.
 * (The original TASK-241 implementation read `p.appearance?.name`, which
 * never exists on the wire — it stored null names for every pick.)
 *
 * Output: { picks: [...], entryCount, rounds }
 * Picks are shaped: { pick, round, slot, draftEntryId, userId, name, position, team }
 *
 * The slot (seat 1..N in the snake order) is derived from draft.draft_entries[].pick_order
 * or .slot_index. If neither is present, returns null — the caller skips the draft.
 * If player identity cannot be resolved for any pick (missing reference data),
 * returns null as well — a nameless board is useless to the web app.
 */
export function normalizeDraft(draft, refs = {}) {
  const appearances = refs.appearances ?? {};
  const players     = refs.players ?? {};
  const teams       = refs.teams ?? {};

  const picks = draft.picks ?? [];
  const entryCount = draft.entry_count ?? draft.entryCount ?? 12;
  const rounds = draft.rounds ?? Math.ceil(picks.length / entryCount);

  const slotByEntry = {};
  const userByEntry = {};
  const draftEntries = draft.draft_entries ?? draft.draftEntries ?? [];
  for (const e of draftEntries) {
    const slot = e.pick_order ?? e.slot_index ?? e.slotIndex ?? null;
    if (slot != null) slotByEntry[String(e.id)] = slot;
    userByEntry[String(e.id)] = String(e.user_id ?? e.userId ?? '');
  }

  const hasSlots = Object.keys(slotByEntry).length > 0;
  if (!hasSlots) return null;

  let unresolved = 0;
  const normalized = picks.map((p) => {
    const deId = String(p.draft_entry_id ?? p.draftEntryId ?? '');
    const pickNumber = p.number ?? p.pick_number ?? null;

    const appearanceId = p.appearance_id ?? p.appearanceId;
    const app = appearances[appearanceId] ?? {};
    const playerId = app.player_id ?? app.playerId;
    const pl = players[playerId] ?? {};
    const teamId = pl.team_id ?? pl.teamId ?? app.team_id ?? app.teamId;
    const team = teams[teamId] ?? {};

    const firstName = pl.first_name ?? pl.firstName ?? '';
    const lastName  = pl.last_name ?? pl.lastName ?? '';
    const name = firstName ? `${firstName} ${lastName}`.trim() : null;
    if (!name) unresolved++;

    const position = pl.position_name ?? pl.positionName ?? null;

    return {
      pick:         pickNumber,
      round:        p.round ?? (pickNumber ? Math.ceil(pickNumber / entryCount) : null),
      slot:         slotByEntry[deId] ?? null,
      draftEntryId: deId,
      userId:       String(p.user_id ?? p.userId ?? '') || userByEntry[deId] || '',
      name,
      position:     position ? String(position).toUpperCase() : null,
      team:         team.abbr ?? team.abbreviation ?? null,
    };
  });

  if (unresolved > 0) return null;

  return { picks: normalized, entryCount, rounds };
}
