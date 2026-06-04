-- digest_snapshots — one row per user per ISO week capturing the portfolio
-- summary used to (a) diff exposure shifts week-over-week and (b) provide
-- idempotency so re-running the weekly digest does not double-send (TASK-188).
--
-- Access pattern:
--   - service_role: the operator digest script writes one row per emailed user
--                   and reads the prior week's row for the diff.
--   - authenticated/anon: not used (no client reads).
--
-- Migration runs before the 2026-10-30 grant cutoff; grants included for
-- forward-safety per CLAUDE.md. All statements idempotent.

create table if not exists public.digest_snapshots (
  user_id    uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  summary    jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

create index if not exists digest_snapshots_user_week_idx
  on public.digest_snapshots (user_id, week_start desc);

alter table public.digest_snapshots enable row level security;

-- Server-only table: only the service_role (operator script) touches it.
grant select, insert, update, delete on public.digest_snapshots to service_role;

-- No authenticated/anon policies: clients have no reason to read digest history.
