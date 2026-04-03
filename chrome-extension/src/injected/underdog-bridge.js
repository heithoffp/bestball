/**
 * Underdog Page Bridge
 *
 * Injected into the page execution context (world: MAIN) at document_start.
 * Intercepts XMLHttpRequest (Underdog uses XHR, not fetch) to capture the
 * auth token, stats query params, and reference data as the app loads.
 *
 * No imports — fully self-contained.
 */

if (!window.__BBM_initialized) {
  window.__BBM_initialized = true;

  window.__BBM = {
    token:            null,
    userId:           null,
    statsParams:      '',    // query string captured from any stats XHR (e.g. "product=fantasy&...")
    nflScoringTypeId: null,  // cached from /v1/scoring_types — constant across sessions
    appearances:      {},    // appearance_id → { player_id, ... }
    players:          {},    // player_id     → { first_name, last_name, position_name, team_id }
    teams:            {},    // team_id       → { abbr, abbreviation }
  };

  // ── XHR interceptor ───────────────────────────────────────────────────────
  // Underdog uses XMLHttpRequest for all API calls.
  // We wrap open/setRequestHeader/send to:
  //   1. Capture the Bearer token from the first api.underdogfantasy.com call
  //   2. Capture the stats query params from the first stats.underdogfantasy.com call
  //   3. Passively cache teams, players, appearances, and the NFL scoring type ID

  const _open             = XMLHttpRequest.prototype.open;
  const _setRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const _send             = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._bbmUrl     = typeof url === 'string' ? url : String(url);
    this._bbmHeaders = {};
    return _open.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (this._bbmHeaders) this._bbmHeaders[name] = value;
    return _setRequestHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    const url     = this._bbmUrl     ?? '';
    const headers = this._bbmHeaders ?? {};

    // Capture auth token from first Underdog API call
    if (!window.__BBM.token && url.includes('api.underdogfantasy.com')) {
      const raw = headers['Authorization'] || headers['authorization'];
      if (raw) {
        const auth = raw.startsWith('Bearer ') ? raw : 'Bearer ' + raw;
        window.__BBM.token = auth;
        try {
          const payload = JSON.parse(atob(auth.replace('Bearer ', '').split('.')[1]));
          window.__BBM.userId = payload.sub ?? payload.user_id ?? null;
        } catch {}
      }
    }

    // Capture stats query params and passively cache reference data
    if (url.includes('stats.underdogfantasy.com')) {
      // Capture query string once (same params on every stats call)
      if (!window.__BBM.statsParams) {
        try {
          const q = new URL(url).search.slice(1); // strip leading '?'
          if (q) window.__BBM.statsParams = q;
        } catch {}
      }

      this.addEventListener('load', function () {
        try {
          const data = JSON.parse(this.responseText);
          if (data.appearances)   data.appearances.forEach(a   => { window.__BBM.appearances[a.id] = a; });
          if (data.players)       data.players.forEach(p       => { window.__BBM.players[p.id]     = p; });
          if (data.teams)         data.teams.forEach(t         => { window.__BBM.teams[t.id]       = t; });
          if (data.scoring_types && !window.__BBM.nflScoringTypeId) {
            const nfl = data.scoring_types.find(s => s.sport_id === 'NFL');
            if (nfl) window.__BBM.nflScoringTypeId = nfl.id;
          }
        } catch {}
      });
    }

    return _send.apply(this, arguments);
  };

  // ── API helpers ───────────────────────────────────────────────────────────

  async function apiFetch(path) {
    const res = await fetch(path, { headers: { Authorization: window.__BBM.token } });
    if (!res.ok) throw new Error('API ' + res.status + ': ' + path);
    return res.json();
  }

  async function statsFetch(path) {
    const q   = window.__BBM.statsParams ? '?' + window.__BBM.statsParams : '';
    const res = await fetch('https://stats.underdogfantasy.com' + path + q);
    if (!res.ok) throw new Error('Stats API ' + res.status + ': ' + path);
    return res.json();
  }

  // ── Slate data loader ─────────────────────────────────────────────────────
  // Fetches players + appearances for a slate and merges into window.__BBM caches.
  // Deduplicates — safe to call multiple times with the same slateId.

  const _loadedSlates = new Set();

  async function ensureSlateLoaded(slateId) {
    if (_loadedSlates.has(slateId)) return;
    _loadedSlates.add(slateId);

    // Resolve NFL scoring type ID if not yet cached
    if (!window.__BBM.nflScoringTypeId) {
      try {
        const data = await statsFetch('/v1/scoring_types');
        const nfl  = data.scoring_types?.find(s => s.sport_id === 'NFL');
        if (nfl) window.__BBM.nflScoringTypeId = nfl.id;
      } catch {}
    }

    const scoringTypeId = window.__BBM.nflScoringTypeId;

    const fetches = [
      statsFetch('/v1/slates/' + slateId + '/players').then(data => {
        (data.players ?? []).forEach(p => { window.__BBM.players[p.id] = p; });
      }).catch(() => {}),
    ];

    if (scoringTypeId) {
      fetches.push(
        statsFetch('/v1/slates/' + slateId + '/scoring_types/' + scoringTypeId + '/appearances').then(data => {
          (data.appearances ?? []).forEach(a => { window.__BBM.appearances[a.id] = a; });
        }).catch(() => {})
      );
    }

    await Promise.all(fetches);
  }

  // ── Pick normalisation ────────────────────────────────────────────────────

  function normalizePick(pick, draft) {
    const appearanceId = pick.appearance_id ?? pick.appearanceId;
    const app          = window.__BBM.appearances[appearanceId] ?? {};
    const playerId     = app.player_id ?? app.playerId;
    const pl           = window.__BBM.players[playerId] ?? {};
    const teamId       = pl.team_id ?? pl.teamId ?? app.team_id ?? app.teamId;
    const team         = window.__BBM.teams[teamId] ?? {};

    const firstName = pl.first_name  ?? pl.firstName  ?? '';
    const lastName  = pl.last_name   ?? pl.lastName   ?? '';
    const name = firstName
      ? (firstName + ' ' + lastName).trim()
      : 'Unknown (' + appearanceId + ')';

    const position   = pl.position_name ?? pl.positionName ?? '';
    const entryCount = draft.entry_count ?? draft.entryCount ?? 1;

    return {
      name,
      position: String(position).toUpperCase(),
      team:     team.abbr ?? team.abbreviation ?? '',
      pick:     pick.number,
      round:    Math.ceil(pick.number / entryCount),
    };
  }

  // ── Sync logic ────────────────────────────────────────────────────────────

  async function resolveUnderdogUserId() {
    // JWT sub is Auth0 format (auth0|...), not the Underdog internal UUID.
    // Fetch /v1/user to get the real UUID used in draft_entries.
    if (window.__BBM.userId && !window.__BBM.userId.startsWith('auth0|')) return;
    try {
      const data = await apiFetch('https://api.underdogfantasy.com/v1/user');
      const id   = data.user?.id ?? data.id ?? null;
      if (id) window.__BBM.userId = id;
    } catch {}
  }

  async function syncEntries() {
    await resolveUnderdogUserId();

    const { slates } = await apiFetch('https://api.underdogfantasy.com/v2/user/completed_slates');
    if (!slates?.length) return [];

    const bestBallSlates = slates.filter(s => s.best_ball);
    const draftMeta      = [];

    for (const slate of bestBallSlates) {
      const { tournament_rounds } = await apiFetch(
        'https://api.underdogfantasy.com/v1/user/slates/' + slate.id + '/tournament_rounds'
      );
      for (const tr of (tournament_rounds ?? [])) {
        let page = 1;
        while (page) {
          const data = await apiFetch(
            'https://api.underdogfantasy.com/v1/user/tournament_rounds/' + tr.id + '/drafts?page=' + page
          );
          for (const draft of (data.drafts ?? [])) {
            draftMeta.push({
              draftId:         draft.id,
              tournamentTitle: tr.title ?? slate.title ?? '',
              slateTitle:      slate.title ?? '',
              draftAt:         draft.draft_at ?? draft.draftAt ?? null,
            });
          }
          page = data.meta?.next ?? null;
        }
      }
    }

    const entries = [];

    for (const { draftId, tournamentTitle, slateTitle, draftAt } of draftMeta) {
      let data;
      try {
        data = await apiFetch('https://api.underdogfantasy.com/v2/drafts/' + draftId);
      } catch {
        continue;
      }

      const draft        = data.draft ?? data;
      const slateId      = draft.slate_id;
      const userId       = window.__BBM.userId;
      const draftEntries = draft.draft_entries ?? draft.draftEntries ?? [];
      const userEntry    = draftEntries.find(e => (e.user_id ?? e.userId) === userId);
      if (!userEntry) continue;

      // Load players + appearances for this slate (no-op if already loaded)
      if (slateId) await ensureSlateLoaded(slateId);

      const userPicks = (draft.picks ?? []).filter(
        p => (p.draft_entry_id ?? p.draftEntryId) === userEntry.id
      );

      entries.push({
        entryId:         String(draft.id),
        tournamentTitle: draft.title ?? tournamentTitle,
        slateTitle,
        draftDate:       draftAt,
        players:         userPicks.map(p => normalizePick(p, draft)),
      });
    }

    return entries;
  }

  // ── Message listener ──────────────────────────────────────────────────────

  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.data?.type !== 'BBM_SYNC_REQUEST') return;

    if (!window.__BBM.token) {
      window.postMessage({
        type:  'BBM_SYNC_ERROR',
        error: 'Not signed in to Underdog — please sign in and retry',
      }, '*');
      return;
    }

    try {
      const entries = await syncEntries();
      window.postMessage({ type: 'BBM_SYNC_RESULT', entries }, '*');
    } catch (err) {
      window.postMessage({ type: 'BBM_SYNC_ERROR', error: err.message }, '*');
    }
  });
}
