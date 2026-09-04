ALTER TABLE public.bot_flows
  ADD COLUMN IF NOT EXISTS trigger_keyword text,
  ADD COLUMN IF NOT EXISTS response text;