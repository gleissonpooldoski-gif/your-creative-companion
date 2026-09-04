CREATE TABLE public.group_discovery_provider_configs (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider_type text NOT NULL DEFAULT 'directory_api',
  api_url text NOT NULL,
  api_key_ciphertext text NOT NULL,
  status text NOT NULL DEFAULT 'not_tested',
  last_tested_at timestamptz,
  last_test_message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_discovery_provider_type_check CHECK (provider_type IN ('directory_api')),
  CONSTRAINT group_discovery_provider_status_check CHECK (status IN ('not_tested','connected','error'))
);
GRANT ALL ON public.group_discovery_provider_configs TO service_role;
ALTER TABLE public.group_discovery_provider_configs ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_group_discovery_provider_configs_updated_at
BEFORE UPDATE ON public.group_discovery_provider_configs
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.group_mining_jobs
  ADD COLUMN provider text,
  ADD COLUMN progress_stage text NOT NULL DEFAULT 'queued',
  ADD COLUMN progress_message text,
  ADD COLUMN processed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN created_by uuid;

ALTER TABLE public.group_mining_jobs
  DROP CONSTRAINT group_mining_jobs_status_check;

ALTER TABLE public.group_mining_jobs
  ADD CONSTRAINT group_mining_jobs_status_check
  CHECK (status IN ('pending','processing','completed','completed_with_errors','failed','cancelled'));

CREATE INDEX group_mining_jobs_workspace_created_idx
  ON public.group_mining_jobs (workspace_id, created_at DESC);