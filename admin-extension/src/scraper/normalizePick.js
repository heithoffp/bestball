/**
 * Normalize a UD draft response into our storage shape.
 *
 * Input: the JSON body of GET /v2/drafts/{id}
 * Output: { picks: [...], entryCount, rounds }
 *
 * Picks are shaped: { pick, round, slot, draftEntryId, userId, name, position, team }
 *
 * The slot (seat 1..N in the snake order) is derived from draft.draft_entries[].pick_order
 * or .slot_index. If neither is present, returns null — the caller skips the draft.
 */
export function normalizeDraft(draft) {
  const picks = draft.picks ?? [];
  const entryCount = draft.entry_count ?? draft.entryCount ?? 12;
  const rounds = draft.rounds ?? Math.ceil(picks.length / entryCount);

  const slotByEntry = {};
  const draftEntries = draft.draft_entries ?? draft.draftEntries ?? [];
  for (const e of draftEntries) {
    const slot = e.pick_order ?? e.slot_index ?? e.slotIndex ?? null;
    if (slot != null) slotByEntry[String(e.id)] = slot;
  }

  const hasSlots = Object.keys(slotByEntry).length > 0;
  if (!hasSlots) return null;

  const normalized = picks.map((p) => {
    const deId = String(p.draft_entry_id ?? p.draftEntryId ?? '');
    return {
      pick:         p.number ?? p.pick_number ?? null,
      round:        p.round ?? null,
      slot:         slotByEntry[deId] ?? null,
      draftEntryId: deId,
      userId:       String(p.user_id ?? p.userId ?? ''),
      name:         p.appearance?.name ?? p.player_name ?? null,
      position:     p.appearance?.position ?? p.position ?? null,
      team:         p.appearance?.team_abbr ?? p.team ?? null,
    };
  });

  return { picks: normalized, entryCount, rounds };
}
