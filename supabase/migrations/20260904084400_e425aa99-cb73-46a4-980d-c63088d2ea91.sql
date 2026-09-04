create or replace function public.claim_queue_jobs(_limit int default 10)
returns setof public.queue_jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  with picked as (
    select id from public.queue_jobs
     where status in ('pending','retry')
       and scheduled_at <= now()
       and attempts < max_attempts
     order by priority asc, scheduled_at asc
     limit greatest(1, least(_limit, 50))
     for update skip locked
  )
  update public.queue_jobs q
     set status = 'processing',
         locked_at = now(),
         started_at = coalesce(q.started_at, now()),
         attempts = q.attempts + 1
    from picked p
   where q.id = p.id
   returning q.*;
end $$;

revoke all on function public.claim_queue_jobs(int) from anon, authenticated, public;
grant execute on function public.claim_queue_jobs(int) to service_role;

create or replace function public.watchdog_requeue()
returns table(requeued int, failed int)
language plpgsql security definer set search_path = public as $$
declare r int; f int;
begin
  with stuck as (
    update public.queue_jobs
       set status = case when attempts >= max_attempts then 'failed' else 'retry' end,
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
end $$;

revoke all on function public.watchdog_requeue() from anon, authenticated, public;
grant execute on function public.watchdog_requeue() to service_role;