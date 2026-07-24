-- Central store for security-gate reports — one row per (repo, commit).
-- Replaces the per-repo `gate-reports` branch: the table IS the history, so
-- the dashboard reads the trend with a single SELECT, provider-agnostic.

create table if not exists public.gate_reports (
  repo_full       text        not null,
  provider        text        not null default 'github',
  head_sha        text        not null,
  score           integer     not null,
  grade           text        not null,
  blocking_count  integer     not null default 0,
  advisory_count  integer     not null default 0,
  report          jsonb       not null,
  generated_at    timestamptz not null default now(),
  primary key (repo_full, head_sha)
);

-- Trend queries: latest first, per repo.
create index if not exists gate_reports_repo_time_idx
  on public.gate_reports (repo_full, generated_at desc);

alter table public.gate_reports enable row level security;

-- Dashboard reads are public (anon + authenticated); the reports contain no
-- secrets (findings are redacted). Tighten to `authenticated` if the
-- portfolio should be private.
drop policy if exists gate_reports_read on public.gate_reports;
create policy gate_reports_read
  on public.gate_reports
  for select
  using (true);

-- Writes come ONLY from the gate container, which authenticates with the
-- service-role key. service_role bypasses RLS, so no INSERT/UPDATE policy is
-- granted to anon/authenticated — the dashboard can never write.
