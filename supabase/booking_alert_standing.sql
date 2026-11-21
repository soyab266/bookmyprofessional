-- REVIEW ONLY. Standing booking-confirmation mode: replaces the one-booking
-- pilot gates with a permanent, owner-paused, daily-capped dispatch.
-- No activation, arming, unpause, schedule or send in this file: the standing
-- row starts paused=true and only an explicit owner UPDATE can unpause it.
-- Apply only while the booking flag is OFF and no pilot is armed/idle-checked.
begin;
DO $$ begin
 -- total_used is deliberately NOT checked: it is an audit counter (2 from the
 -- completed pilot) and must never block or be reset. Only an armed/active
 -- pilot window or an in-flight claim blocks this migration.
 if exists(select 1 from public.booking_alert_budget where total_cap<>0 or armed_at is not null or expires_at is not null)
  or exists(select 1 from public.booking_alert_outbox where status='sending') then
  raise exception 'standing_migration_requires_unarmed_idle_booking_pilot';
 end if;
end $$;

-- Activation watermark: mark every booking recorded before this migration as
-- already expanded, so the standing expander starts from a clean slate. No
-- historical, pilot or cancelled record can enter the standing backlog and
-- receive a late confirmation. This is dispatch bookkeeping only; booking,
-- payment and outbox audit rows are untouched.
update public.bookings set booking_alert_expanded_at=now()
 where booking_alert_expanded_at is null;

-- Standing config: one row, service-role only. paused=true until the owner
-- activates; daily_cap bounds worst-case spend per IST day (resets at
-- midnight Asia/Kolkata); the dispatcher flips paused=true itself on a Meta
-- billing rejection; owner email is optional and unset by default.
-- Owner-selected limit: 15 customer attempts and 15 professional attempts
-- per IST day. Separate counters enforce each side even if consent is uneven.
-- The aggregate ceiling stays 30 (about Rs 4.08/day at the verified rate).
-- Provider rejections and uncertain outcomes consume slots. Proven no-attempt
-- outcomes release only that role's reservation in the same IST budget day.
create table public.booking_alert_standing (
 id integer primary key check (id = 1),
 daily_cap integer not null check (daily_cap between 1 and 1000),
 used_today integer not null default 0 check (used_today >= 0),
 customer_cap integer not null default 15 check(customer_cap between 0 and 15),
 professional_cap integer not null default 15 check(professional_cap between 0 and 15),
 customer_used integer not null default 0 check(customer_used>=0),
 professional_used integer not null default 0 check(professional_used>=0),
 day date not null default ((now() at time zone 'Asia/Kolkata')::date),
 paused boolean not null default true,
 pause_reason text,
 updated_at timestamptz not null default now()
);
insert into public.booking_alert_standing(id, daily_cap) values (1, 30);
alter table public.booking_alert_standing enable row level security;
revoke all on public.booking_alert_standing from public, anon, authenticated;
grant all on public.booking_alert_standing to service_role;
create policy booking_alert_standing_service on public.booking_alert_standing for all to service_role using(true) with check(true);

-- Standing rows carry no pilot window marker.
alter table public.booking_alert_outbox alter column pilot_armed_at drop not null;
alter table public.booking_alert_outbox add column standing_reserved_day date;

-- Standing expansion: verified paid upcoming bookings with a v2 receipt,
-- consent-gated at expand time (and again at dispatch time in JS). No scope
-- row, no armed window. Idempotent via the outbox unique key.
-- Freshness bound: bookings verified more than 2 hours ago are marked
-- expanded WITHOUT queueing - a confirmation that old is noise, not service.
-- Together with the activation watermark above this intentionally covers the
-- migration-to-unpause gap: bookings paid in that window either queue while
-- fresh or expire via the dispatcher age guard; there is no historical replay.
create or replace function public.expand_booking_alert_receipts(p_limit integer default 25) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare b public.bookings%rowtype;
 party record; p public.profiles%rowtype; expanded integer:=0; errors integer:=0;
begin
 for b in select * from public.bookings where booking_alert_verified_at is not null
   and booking_alert_expanded_at is null
   and booking_alert_receipt->>'template_version'='2'
   and booking_alert_verified_at >= now() - interval '2 hours'
   order by booking_alert_verified_at,id for update skip locked limit least(greatest(p_limit,0),100)
 loop
  begin
   if b.payment_status='paid' and b.status='upcoming'
    and (b.booking_alert_receipt->>'alert_created_at') is not null
    and (b.booking_alert_receipt->>'alert_created_at')::timestamptz >= now() - interval '2 hours' then
    for party in select b.booking_alert_receipt->>'customer_id' as uid,'customer' as role,'bmp_booking_details_v2' as template
     union all select b.booking_alert_receipt->>'professional_id','professional','bmp_professional_booking_details_v2'
    loop
     select * into p from public.profiles where id=party.uid::uuid;
     if not found or p.whatsapp_consent is not true or coalesce(p.phone,'')=''
       or p.notification_prefs->>'whatsapp'='false' then continue; end if;
     insert into public.booking_alert_outbox(booking_id,user_id,recipient_role,template,booking,recipient_phone,pilot_armed_at)
      values(b.id,p.id,party.role,party.template,b.booking_alert_receipt,p.phone,null)
      on conflict(booking_id,user_id,event) do nothing;
    end loop;
   end if;
   update public.bookings set booking_alert_expanded_at=now(),booking_alert_expand_error=null where id=b.id;
   expanded:=expanded+1;
  exception when others then
   -- Do not retain raw SQL/profile errors in this audit field.
   update public.bookings set booking_alert_expand_error='notification_expansion_failed' where id=b.id;
   errors:=errors+1;
  end;
 end loop;
 return jsonb_build_object('expanded',expanded,'errors',errors);
end $$;

-- Standing claim: one transaction claims ONE BOOKING GROUP (usually the
-- customer+professional pair) and reserves that many daily allowances.
-- All-or-nothing: when the whole group does not fit the remaining allowance,
-- nothing claims, so a pair never splits across the daily cap. Rows left
-- pending are expired unsent by the dispatcher's age guard (never sent late).
-- Claims are fully serialized by the standing row lock; the advisory lock is
-- belt-and-braces. Day rolls over lazily on first claim of a new IST day.
-- Paused (owner or billing) denies everything. Stale in-flight claims still
-- park as uncertain forever; no automatic retry. Standing rows only: legacy
-- pilot rows (pilot_armed_at not null) are never claimed here.
create or replace function public.claim_booking_alert() returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare standing public.booking_alert_standing%rowtype; q public.booking_alert_outbox%rowtype;
 gsize integer; csize integer; psize integer; fits boolean:=false; rows_json jsonb;
 ist_day date := (now() at time zone 'Asia/Kolkata')::date;
begin
 select * into standing from public.booking_alert_standing where id = 1 for update;
 if not found or standing.paused then return null; end if;
 if standing.day < ist_day then
  update public.booking_alert_standing set day=ist_day, used_today=0, customer_used=0, professional_used=0, updated_at=now() where id=1
   returning * into standing;
 end if;
 -- A crashed worker might have sent. Hold it forever for review, do not retry.
 update public.booking_alert_outbox set status='uncertain',last_error='stale_claim_uncertain',updated_at=now()
  where status='sending' and updated_at < now()-interval '10 minutes';
 -- Expire aged pending rows even when no budget remains. These never claimed
 -- a reservation and made no provider request, so no counter is released.
 update public.booking_alert_outbox o set status='skipped',last_error='expired_notification_age',updated_at=now()
  from public.bookings b where o.booking_id=b.id and o.status='pending'
   and o.pilot_armed_at is null and b.booking_alert_verified_at < now()-interval '2 hours';
 -- A blocked customer pair must not block a later professional-only booking.
 -- Scan FIFO for the first WHOLE group that fits both role limits.
 for q in select * from public.booking_alert_outbox
  where status='pending' and pilot_armed_at is null
  order by created_at,id for update skip locked
 loop
  select count(*),count(*) filter(where recipient_role='customer'),count(*) filter(where recipient_role='professional')
   into gsize,csize,psize from public.booking_alert_outbox
   where status='pending' and pilot_armed_at is null and booking_id=q.booking_id;
  if gsize=csize+psize and standing.used_today+gsize<=standing.daily_cap
   and standing.customer_used+csize<=standing.customer_cap
   and standing.professional_used+psize<=standing.professional_cap then
   if pg_try_advisory_xact_lock(hashtext(q.booking_id::text)) then fits:=true; exit; end if;
  end if;
 end loop;
 if not fits then return null; end if;
 update public.booking_alert_standing set used_today=used_today+gsize,
  customer_used=customer_used+csize,professional_used=professional_used+psize,updated_at=now() where id=1;
 with upd as (
  update public.booking_alert_outbox set status='sending',claim_token=gen_random_uuid(),attempts=attempts+1,updated_at=now(),standing_reserved_day=ist_day
   where booking_id=q.booking_id and status='pending' and pilot_armed_at is null returning *
 ) select jsonb_agg(to_jsonb(upd) order by upd.created_at,upd.id) into rows_json from upd;
 return jsonb_build_object('rows', coalesce(rows_json,'[]'::jsonb), 'pilot_expires_at', null);
end $$;

-- Finish: release returns the day's allowance only where JS proved no Meta
-- request was made. Handles legacy pilot rows (pilot_armed_at not null)
-- against the pilot budget exactly as before.
create or replace function public.finish_booking_alert(p_id uuid,p_claim_token uuid,p_status text,p_message_id text,p_error text,p_release boolean)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare q public.booking_alert_outbox%rowtype; budget public.booking_alert_budget%rowtype;
begin
 -- Same lock order as claim: budget/standing first, then queue.
 select * into budget from public.booking_alert_budget where id=1 for update;
 perform 1 from public.booking_alert_standing where id=1 for update;
 if p_status not in ('accepted','uncertain','skipped','failed')
    or p_release is null or (p_release and p_status not in ('skipped','failed')) then raise exception 'invalid_finish'; end if;
 update public.booking_alert_outbox set status=p_status,meta_message_id=p_message_id,last_error=p_error,updated_at=now()
  where id=p_id and claim_token=p_claim_token and status='sending' returning * into q;
 if not found then return false; end if;
 if p_release then
  if q.pilot_armed_at is not null and q.pilot_armed_at=budget.armed_at then
   update public.booking_alert_budget set total_used=greatest(0,total_used-1) where id=1;
  elsif q.pilot_armed_at is null then
   update public.booking_alert_standing set used_today=greatest(0,used_today-1),
    customer_used=greatest(0,customer_used-case when q.recipient_role='customer' then 1 else 0 end),
    professional_used=greatest(0,professional_used-case when q.recipient_role='professional' then 1 else 0 end),
    updated_at=now() where id=1 and day=q.standing_reserved_day;
  end if;
 end if;
 return true;
end $$;

revoke all on function public.expand_booking_alert_receipts(integer), public.claim_booking_alert(), public.finish_booking_alert(uuid,uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.expand_booking_alert_receipts(integer), public.claim_booking_alert(), public.finish_booking_alert(uuid,uuid,text,text,text,boolean) to service_role;
commit;

-- Rollback: booking_alert_standing_rollback.sql restores the pilot functions
-- byte-faithfully and re-imposes pilot_armed_at NOT NULL. It refuses to run
-- while standing rows exist or the standing row was ever unpaused, so a
-- rollback can never silently strand accepted/queued sends.
