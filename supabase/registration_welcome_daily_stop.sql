-- REVIEW ONLY. Roll back sending first, never erase delivery/attempt history.
-- Apply only after separate live approval if the new daily stage must be stopped.
begin;
update public.registration_welcome_daily set enabled=false where id=1;
select cron.unschedule(jobid) from cron.job where jobname='registration-welcome-daily-dispatch';
commit;
-- Keep exclusion records, tickets and old pilot counters. Do not reset, delete,
-- rearm the expired pilot, release uncertain tickets or replay pending rows.
-- Reverting the route code afterward is optional: the old pilot remains expired
-- and its cron was removed. Verify OFF state and job absence read-only afterward.
