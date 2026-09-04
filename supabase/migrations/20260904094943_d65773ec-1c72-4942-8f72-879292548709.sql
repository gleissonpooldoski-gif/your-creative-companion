CREATE OR REPLACE FUNCTION public.watchdog_requeue()
 RETURNS TABLE(requeued integer, failed integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r int; f int;
begin
  with stuck as (
    update public.queue_jobs
       set status = (case when attempts >= max_attempts then 'failed' else 'retry' end)::job_status,
           locked_at = null,
           scheduled_at = now() + interval '30 seconds',
           failed_at = case when attempts >= max_attempts then now() else null end,
           error = coalesce(error, 'watchdog: job travado sem progresso')
     where status = 'processing'
       and locked_at < now() - interval '5 minutes'
    returning status
  )
  select count(*) filter (where status = 'retry'), count(*) filter (where status = 'failed')
    into r, f from stuck;
  return query select coalesce(r,0), coalesce(f,0);
end $function$;