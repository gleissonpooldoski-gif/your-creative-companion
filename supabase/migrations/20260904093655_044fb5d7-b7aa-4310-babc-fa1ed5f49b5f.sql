CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.group_mining_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  keywords text[] NOT NULL DEFAULT '{}',
  categories text[] NOT NULL DEFAULT '{}',
  total_found integer NOT NULL DEFAULT 0,
  total_new integer NOT NULL DEFAULT 0,
  total_duplicate integer NOT NULL DEFAULT 0,
  total_invalid integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_mining_jobs_status_check CHECK (status IN ('pending','processing','completed','failed','cancelled'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_mining_jobs TO authenticated;
GRANT ALL ON public.group_mining_jobs TO service_role;
ALTER TABLE public.group_mining_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage mining jobs" ON public.group_mining_jobs FOR ALL TO authenticated
  USING (public.has_workspace_access(workspace_id)) WITH CHECK (public.has_workspace_access(workspace_id));

CREATE TABLE public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  telegram_id text,
  username text,
  title text NOT NULL,
  description text,
  invite_link text,
  canonical_identifier text NOT NULL,
  category text,
  keywords text[] NOT NULL DEFAULT '{}',
  member_count integer,
  is_public boolean NOT NULL DEFAULT true,
  is_valid boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'new',
  score integer NOT NULL DEFAULT 0,
  source text,
  mining_job_id uuid REFERENCES public.group_mining_jobs(id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT groups_status_check CHECK (status IN ('new','validated','invalid','archived','blocked')),
  CONSTRAINT groups_score_check CHECK (score >= 0 AND score <= 100)
);
CREATE UNIQUE INDEX groups_workspace_canonical_key ON public.groups (workspace_id, canonical_identifier);
CREATE INDEX groups_workspace_status_idx ON public.groups (workspace_id, status, score DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT ALL ON public.groups TO service_role;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage groups" ON public.groups FOR ALL TO authenticated
  USING (public.has_workspace_access(workspace_id)) WITH CHECK (public.has_workspace_access(workspace_id));

ALTER TABLE public.campaign_destinations
  ADD COLUMN group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  ADD COLUMN status text NOT NULL DEFAULT 'pending',
  ADD COLUMN scheduled_at timestamptz,
  ADD COLUMN last_attempt_at timestamptz,
  ADD COLUMN last_result text,
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX campaign_destinations_campaign_group_key
  ON public.campaign_destinations (campaign_id, group_id) WHERE group_id IS NOT NULL;
CREATE UNIQUE INDEX campaign_destinations_campaign_target_key
  ON public.campaign_destinations (campaign_id, destination) WHERE group_id IS NULL;

ALTER TABLE public.queue_jobs
  ADD COLUMN campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  ADD COLUMN destination_id uuid REFERENCES public.campaign_destinations(id) ON DELETE CASCADE,
  ADD COLUMN account_id uuid REFERENCES public.telegram_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.workspace_settings
  ADD COLUMN radar_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN radar_interval_minutes integer NOT NULL DEFAULT 360,
  ADD COLUMN radar_keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN radar_last_run_at timestamptz;

ALTER TABLE public.campaigns
  ADD COLUMN messages_per_hour integer NOT NULL DEFAULT 30,
  ADD COLUMN daily_cap_per_account integer NOT NULL DEFAULT 50;

CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER update_group_mining_jobs_updated_at BEFORE UPDATE ON public.group_mining_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER update_campaign_destinations_updated_at BEFORE UPDATE ON public.campaign_destinations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();