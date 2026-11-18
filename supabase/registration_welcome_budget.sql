-- DRAFT migration for review - NOT applied to any environment.
-- Atomic send-budget reservation for the registration welcome dispatcher.
--
-- WHY THIS EXISTS (revised 18 Nov 2026, second review round):
--   Budget caps must be GENUINELY ATOMIC across every dispatcher invocation
--   (the 5-minute cron, a manual POST, overlapping runs). A count-then-claim
--   check races: two invocations can both observe "under cap" and both send.
--   This file replaces counting with a single-row counter that is
--   conditionally incremented in ONE UPDATE. PostgreSQL row locking
--   serializes concurrent UPDATEs on that row, so exactly one invocation
--   can take the last available slot - the reservation itself is the lock.
--
-- WHAT THE CAPS MEAN (unchanged position, stated again here):
--   These are message VOLUME caps, never rupees. Meta charges per DELIVERED
--   message plus applicable tax (base Rs0.115/Utility verified, tax
--   unverified), so no counter bounds money. The rupee bound is the prepaid
--   balance, which only the owner funds - a separate owner decision.
--
-- RESERVATION SEMANTICS (implemented in src/lib/registration-outbox.js):
--   - reserve_welcome_send() runs BEFORE a row is claimed. It returns true
--     only if the row was atomically incremented under both caps.
--   - The reservation is KEPT when Meta accepted the message AND when the
--     outcome is 'uncertain' (Meta may have accepted it - a held, possibly
--     real send; it must consume budget so retries-plus-uncertains cannot
--     ratchet spend past the cap).
--   - The reservation is RELEASED (release_welcome_send) only when Meta was
--     definitely never reached: claim lost to a concurrent run, simulated
--     send, or a not-attempted outcome (missing credentials, payload
--     validation). Those cost nothing, so they must not consume budget.
--   - KNOWN CONSERVATIVE LEAK: if the worker crashes after reserving but
--     before the outcome is persisted, that slot stays consumed. Leaks only
--     ever REDUCE what can be sent (never increase), so the failure
--     direction is safe; the owner can reset the row if needed.
--   - Day boundary: daily_used resets lazily inside the same atomic UPDATE
--     when the IST day changes (Asia/Kolkata, UTC+5:30, no DST).
--
-- CAP NUMBERS: seeded at the PROPOSED conservative caps 5/day and 20 all-in
--   (proposal pending owner approval 18 Nov - these are NOT approved
--   numbers). When either cap is reached, dispatch STOPS and queued rows
--   wait for owner review: nothing else sends until the owner raises a cap
--   with one UPDATE on this row (no code or env change needed):
--     update public.notification_dispatch_budget
--       set daily_cap = <N>, total_cap = <M> where id = 1;
--
-- REVERSAL (full):
--   drop function if exists public.release_welcome_send();
--   drop function if exists public.reserve_welcome_send();
--   drop table if exists public.notification_dispatch_budget;
--   The dispatcher fails CLOSED without the functions (no sends).

create table if not exists public.notification_dispatch_budget (
  id smallint primary key default 1 check (id = 1),
  day_key date not null default ((now() at time zone 'Asia/Kolkata')::date),
  daily_used integer not null default 0 check (daily_used >= 0),
  total_used integer not null default 0 check (total_used >= 0),
  daily_cap integer not null default 5 check (daily_cap >= 0),
  total_cap integer not null default 20 check (total_cap >= 0),
  updated_at timestamptz not null default now()
);

insert into public.notification_dispatch_budget (id)
values (1)
on conflict (id) do nothing;

alter table public.notification_dispatch_budget enable row level security;

-- Only the service role (server) touches the budget; no client access.
-- Same convention as public.notification_outbox.
create policy "service role full access"
  on public.notification_dispatch_budget
  for all
  to service_role
  using (true)
  with check (true);

-- Atomically take one send slot under both caps. Returns
--   {"taken": true, "day": <IST date reserved against>}  when a slot was
--   taken, or {"taken": false} when a cap is reached. The day is returned
--   so a later release can target the SAME day's counter (see below).
-- Concurrent callers serialize on the single row's lock; the loser of the
-- race for the LAST slot gets taken=false.
create or replace function public.reserve_welcome_send() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_taken integer;
begin
  update public.notification_dispatch_budget
     set daily_used = case when day_key = v_today then daily_used + 1 else 1 end,
         day_key = v_today,
         total_used = total_used + 1,
         updated_at = now()
   where id = 1
     and total_used < total_cap
     and (day_key <> v_today or daily_used < daily_cap);
  get diagnostics v_taken = row_count;
  if v_taken > 0 then
    return jsonb_build_object('taken', true, 'day', v_today);
  end if;
  return jsonb_build_object('taken', false);
end; $$;

-- Give one slot back when Meta was definitely never reached. Never drops
-- below zero (defensive against double-release after a crash/retry mixup).
-- p_day is the day the reservation was taken against (from the reserve
-- result). total_used always gives the slot back; daily_used is decremented
-- ONLY when that same day is still the current budget day - so a release
-- landing after midnight never eats into the NEW day's allowance.
create or replace function public.release_welcome_send(p_day date) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.notification_dispatch_budget
     set total_used = greatest(total_used - 1, 0),
         daily_used = case when day_key = p_day
                           then greatest(daily_used - 1, 0)
                           else daily_used end,
         updated_at = now()
   where id = 1;
end; $$;

-- ACCESS CONTROL (verified offline against PostgreSQL 16, 18 Nov):
--   PostgreSQL grants EXECUTE on new functions to PUBLIC by default - left
--   alone, anon/authenticated (and anyone with database access) could call
--   reserve/release and rewrite the budget. Close that explicitly; only the
--   service role (server) may call them. Direct table access is already
--   blocked for non-owners by RLS above (no policy for anon/authenticated).
revoke all on function public.reserve_welcome_send() from public, anon, authenticated;
revoke all on function public.release_welcome_send(date) from public, anon, authenticated;
grant execute on function public.reserve_welcome_send() to service_role;
grant execute on function public.release_welcome_send(date) to service_role;
