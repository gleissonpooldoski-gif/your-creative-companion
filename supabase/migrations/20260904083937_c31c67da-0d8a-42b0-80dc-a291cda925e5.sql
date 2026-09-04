-- Reelyx v2 — core multi-tenant foundation

create type public.app_role as enum ('owner','admin','manager','operator','viewer');
create type public.account_status as enum ('online','pending_auth','failed','checking','paused');
create type public.campaign_status as enum ('draft','scheduled','running','paused','finished','cancelled','failed');
create type public.job_status as enum ('pending','processing','completed','failed','retry','cancelled');
create type public.queue_item_status as enum ('pending','processing','sent','skipped','failed','retry','cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  onboarding_done boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null,
  demo_mode boolean not null default false,
  global_pause boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  role public.app_role not null default 'owner',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create or replace function public.has_workspace_access(_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members m
    where m.workspace_id = _workspace_id and m.user_id = auth.uid())
$$;

create or replace function public.current_workspace_id()
returns uuid language sql stable security definer set search_path = public as $$
  select m.workspace_id from public.workspace_members m
   where m.user_id = auth.uid() order by m.created_at limit 1
$$;

create or replace function public.has_workspace_role(_workspace_id uuid, _roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members m
    where m.workspace_id = _workspace_id and m.user_id = auth.uid() and m.role = any(_roles))
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare ws_id uuid;
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), new.email);

  insert into public.workspaces (name, owner_id)
  values (coalesce(new.raw_user_meta_data->>'workspace_name', 'Meu Workspace'), new.id)
  returning id into ws_id;

  insert into public.workspace_members (workspace_id, user_id, role) values (ws_id, new.id, 'owner');
  insert into public.wallets (workspace_id) values (ws_id);
  insert into public.workspace_settings (workspace_id) values (ws_id);
  return new;
end; $$;

create table public.workspace_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  messages_per_hour int not null default 60,
  daily_cap_per_account int not null default 20,
  niche text,
  telegram_configured boolean not null default false,
  instagram_configured boolean not null default false,
  payments_configured boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.telegram_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  kind text not null default 'bot',
  username text,
  phone_masked text,
  telegram_id text,
  status public.account_status not null default 'pending_auth',
  paused boolean not null default false,
  worker text,
  proxy text,
  last_sync_at timestamptz,
  last_activity_at timestamptz,
  last_error text,
  webhook_secret text,
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table public.telegram_credentials (
  account_id uuid primary key references public.telegram_accounts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  bot_token text,
  tdata_object text,
  created_at timestamptz not null default now()
);

create table public.telegram_updates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_id uuid not null references public.telegram_accounts(id) on delete cascade,
  telegram_update_id bigint not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, account_id, telegram_update_id)
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text,
  username text,
  phone text,
  telegram_id text,
  source text,
  status text not null default 'new',
  opt_in boolean not null default false,
  opt_out boolean not null default false,
  score int not null default 0,
  last_interaction_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
create unique index contacts_ws_tg_uniq on public.contacts (workspace_id, telegram_id) where telegram_id is not null;
create unique index contacts_ws_user_uniq on public.contacts (workspace_id, lower(username)) where username is not null;

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  color text default 'violet',
  unique (workspace_id, name)
);

create table public.contact_tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  unique (contact_id, tag_id)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  stage text not null default 'new',
  value numeric(14,2) default 0,
  owner_id uuid,
  created_at timestamptz not null default now()
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  kind text not null,
  content text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  network text not null default 'telegram',
  message text,
  link text,
  status public.campaign_status not null default 'draft',
  pace_presets text[] not null default '{}',
  scheduled_at timestamptz,
  next_run_at timestamptz,
  posted_count int not null default 0,
  failed_count int not null default 0,
  created_at timestamptz not null default now()
);

create table public.campaign_variations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  content text not null,
  generated_by text not null default 'human',
  approved boolean not null default false
);

create table public.campaign_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  account_id uuid not null references public.telegram_accounts(id) on delete cascade,
  unique (campaign_id, account_id)
);

create table public.campaign_destinations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  destination text not null,
  authorized boolean not null default false,
  unique (campaign_id, destination)
);

create table public.prospecting_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null default 'Prospecção no privado',
  message text,
  status public.campaign_status not null default 'paused',
  messages_per_hour int not null default 60,
  daily_cap_per_account int not null default 20,
  niche text,
  created_at timestamptz not null default now()
);

create table public.prospecting_queue (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  prospecting_campaign_id uuid references public.prospecting_campaigns(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  account_id uuid references public.telegram_accounts(id) on delete set null,
  message text,
  status public.queue_item_status not null default 'pending',
  attempts int not null default 0,
  error text,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (prospecting_campaign_id, contact_id)
);

create table public.group_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  unique (workspace_id, name)
);

create table public.group_keywords (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  keyword text not null,
  category text,
  created_at timestamptz not null default now(),
  unique (workspace_id, keyword)
);

create table public.group_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  link text,
  category text,
  keyword text,
  origin text default 'manual',
  status text not null default 'available',
  score int not null default 0,
  discovered_at timestamptz not null default now(),
  last_checked_at timestamptz
);
create unique index group_sources_link_uniq on public.group_sources (workspace_id, lower(link)) where link is not null;

create table public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  group_source_id uuid references public.group_sources(id) on delete set null,
  group_name text not null,
  account_id uuid references public.telegram_accounts(id) on delete set null,
  status text not null default 'pending',
  known_members int not null default 0,
  origin text,
  last_sync_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.group_mirrors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_group text not null,
  destination_group text not null,
  account_id uuid references public.telegram_accounts(id) on delete set null,
  rules jsonb not null default '{}',
  status text not null default 'paused',
  authorized boolean not null default false,
  last_sync_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.bots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  username text,
  account_id uuid references public.telegram_accounts(id) on delete set null,
  status text not null default 'draft',
  cloned_from uuid references public.bots(id) on delete set null,
  version int not null default 1,
  last_event_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.bot_flows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  bot_id uuid references public.bots(id) on delete cascade,
  name text not null,
  status text not null default 'draft',
  graph jsonb not null default '{"nodes":[],"edges":[]}',
  created_at timestamptz not null default now()
);

create table public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  goal text,
  personality text,
  instructions text,
  provider text not null default 'lovable-ai',
  model text not null default 'google/gemini-3.7-flash',
  status text not null default 'draft',
  channels text[] not null default '{}',
  mode text not null default 'ai',
  created_at timestamptz not null default now()
);

create table public.ai_knowledge (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  content text not null,
  category text,
  priority int not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  result jsonb,
  status public.job_status not null default 'pending',
  priority int not null default 100,
  attempts int not null default 0,
  max_attempts int not null default 3,
  idempotency_key text,
  locked_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (workspace_id, idempotency_key)
);

create table public.personas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  niche text, audience text, pains text, goals text,
  language text, tone text, cta text,
  preferred_words text[] default '{}',
  forbidden_words text[] default '{}',
  context text,
  created_at timestamptz not null default now()
);

create table public.mini_apps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text, logo_url text, url text, cta text,
  fields jsonb not null default '[]',
  post_signup_message text,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table public.mini_app_submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  mini_app_id uuid references public.mini_apps(id) on delete cascade,
  payload jsonb not null default '{}',
  contact_id uuid references public.contacts(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.remarketing_calls (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  phone text,
  status text not null default 'pending',
  owner_id uuid,
  scheduled_at timestamptz,
  result text, observation text, next_action text,
  created_at timestamptz not null default now()
);

create table public.instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  username text not null,
  ig_user_id text,
  status text not null default 'pending_config',
  last_error text,
  created_at timestamptz not null default now(),
  unique (workspace_id, username)
);

create table public.instagram_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  instagram_account_id uuid references public.instagram_accounts(id) on delete cascade,
  media_url text,
  caption text,
  hashtags text[] default '{}',
  cta text,
  scheduled_at timestamptz,
  status text not null default 'upload',
  attempts int not null default 0,
  error text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.smm_services (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null, category text, provider text,
  cost numeric(14,4) not null default 0,
  price numeric(14,4) not null default 0,
  status text not null default 'active'
);

create table public.smm_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  service_id uuid references public.smm_services(id) on delete set null,
  customer text, quantity int not null default 0,
  cost numeric(14,4) not null default 0,
  price numeric(14,4) not null default 0,
  status text not null default 'pending',
  provider_order_id text,
  created_at timestamptz not null default now()
);

create table public.wallets (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  balance numeric(14,2) not null default 0,
  total_in numeric(14,2) not null default 0,
  total_out numeric(14,2) not null default 0,
  pending numeric(14,2) not null default 0,
  updated_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null,
  amount numeric(14,2) not null,
  status text not null default 'pending',
  customer text, method text, reference text,
  created_at timestamptz not null default now()
);

create table public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  direction text not null,
  amount numeric(14,2) not null,
  balance_after numeric(14,2) not null,
  description text,
  created_at timestamptz not null default now()
);

create table public.pix_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  amount numeric(14,2) not null,
  provider text not null default 'unconfigured',
  provider_charge_id text,
  qr_code text, copy_paste text,
  status text not null default 'awaiting_config',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, provider_charge_id)
);

create table public.queue_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  priority int not null default 100,
  status public.job_status not null default 'pending',
  attempts int not null default 0,
  max_attempts int not null default 5,
  idempotency_key text,
  locked_at timestamptz,
  scheduled_at timestamptz not null default now(),
  started_at timestamptz, completed_at timestamptz, failed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);
create index queue_jobs_pick on public.queue_jobs (status, scheduled_at, priority);

create table public.job_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_id uuid,
  level text not null default 'info',
  message text not null,
  created_at timestamptz not null default now()
);

create table public.system_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scope text not null,
  level text not null default 'info',
  message text not null,
  meta jsonb default '{}',
  created_at timestamptz not null default now()
);

create table public.integration_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  action text not null,
  success boolean not null default false,
  message text,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid,
  action text not null,
  resource text,
  result text,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "update own profile" on public.profiles for update to authenticated using (id = auth.uid());

grant select, insert, update on public.workspaces to authenticated;
grant all on public.workspaces to service_role;
alter table public.workspaces enable row level security;
create policy "member reads workspace" on public.workspaces for select to authenticated using (public.has_workspace_access(id));
create policy "owner updates workspace" on public.workspaces for update to authenticated using (public.has_workspace_role(id, array['owner','admin']::public.app_role[]));

grant select, insert, update, delete on public.workspace_members to authenticated;
grant all on public.workspace_members to service_role;
alter table public.workspace_members enable row level security;
create policy "read members" on public.workspace_members for select to authenticated using (public.has_workspace_access(workspace_id));
create policy "admin manages members" on public.workspace_members for all to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin']::public.app_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner','admin']::public.app_role[]));

do $$
declare t text;
  tenant_tables text[] := array[
    'workspace_settings','telegram_accounts','telegram_updates','contacts','tags','contact_tags','leads',
    'activities','campaigns','campaign_variations','campaign_accounts','campaign_destinations',
    'prospecting_campaigns','prospecting_queue','group_categories','group_keywords','group_sources',
    'group_memberships','group_mirrors','bots','bot_flows','ai_agents','ai_knowledge','ai_jobs','personas',
    'mini_apps','mini_app_submissions','remarketing_calls','instagram_accounts','instagram_posts',
    'smm_services','smm_orders','wallets','transactions','wallet_ledger','pix_payments','queue_jobs',
    'job_logs','system_logs','integration_logs','audit_logs','notifications'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "tenant access" on public.%I for all to authenticated using (public.has_workspace_access(workspace_id)) with check (public.has_workspace_access(workspace_id))', t);
  end loop;
end $$;

grant all on public.telegram_credentials to service_role;
alter table public.telegram_credentials enable row level security;