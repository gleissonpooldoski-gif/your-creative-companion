create table if not exists public.mtproto_service_configs (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  service_url text not null,
  service_token_ciphertext text not null,
  status text not null default 'not_tested',
  last_tested_at timestamptz,
  last_test_message text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant all on public.mtproto_service_configs to service_role;
alter table public.mtproto_service_configs enable row level security;

drop policy if exists "mtproto service config is server only" on public.mtproto_service_configs;
create policy "mtproto service config is server only"
  on public.mtproto_service_configs for all to authenticated
  using (false) with check (false);

drop trigger if exists update_mtproto_service_configs_updated_at on public.mtproto_service_configs;
create trigger update_mtproto_service_configs_updated_at
  before update on public.mtproto_service_configs
  for each row execute function public.touch_updated_at();

create table if not exists public.telegram_mtproto_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  label text not null,
  phone_masked text not null,
  remote_session_id text,
  status text not null default 'not_connected',
  last_error text,
  last_connected_at timestamptz,
  flood_wait_until timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists telegram_mtproto_sessions_workspace_label_key
  on public.telegram_mtproto_sessions (workspace_id, lower(label));

grant all on public.telegram_mtproto_sessions to service_role;
alter table public.telegram_mtproto_sessions enable row level security;

drop policy if exists "mtproto sessions are server only" on public.telegram_mtproto_sessions;
create policy "mtproto sessions are server only"
  on public.telegram_mtproto_sessions for all to authenticated
  using (false) with check (false);

drop trigger if exists update_telegram_mtproto_sessions_updated_at on public.telegram_mtproto_sessions;
create trigger update_telegram_mtproto_sessions_updated_at
  before update on public.telegram_mtproto_sessions
  for each row execute function public.touch_updated_at();

alter table public.group_mining_jobs
  add column if not exists requested_provider text not null default 'auto',
  add column if not exists mtproto_session_id uuid references public.telegram_mtproto_sessions(id) on delete set null;

alter table public.groups
  add column if not exists entity_type text,
  add column if not exists source_keyword text;