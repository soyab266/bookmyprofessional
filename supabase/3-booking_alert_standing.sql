-- REVIEW ONLY. Standing booking-confirmation mode: replaces the one-booking
-- pilot gates with a permanent, owner-paused, daily-capped dispatch.
-- No activation, arming, unpause, schedule or send in this file: the standing
-- row starts paused=true and only an explicit owner UPDATE can unpause it.
-- Apply only while the booking flag is OFF and no pilot is armed/idle-checked.
begin;
DO $$ begin
 if exists(select 1 from public.booking_alert_budget where total_cap<>0 or total_used<>0 or armed_at is not null or expires_at is not null)
  or exists(select 1 from public.booking_alert_outbox where status='sending') then
  raise exception 'standing_migration_requires_unarmed_idle_booking_pilot';
 end if;
end $$;

-- Standing config: one row, service-role only. paused=true until the owner
-- activates; daily_cap bounds worst-case spend per UTC day; the dispatcher
-- flips paused=true itself on a Meta billing rejection (balance exhausted).
create table public.booking_alert_standing (
 id integer primary key check (id = 1),
 daily_cap integer not null check (daily_cap between 1 and 1000),
 used_today integer not null default 0 check (used_today >= 0),
 day date not null default current_date,
 paused boolean not null default true,
 pause_reason text,
 updated_at timestamptz not null default now()
);
insert into public.booking_alert_standing(id, daily_cap) values (1, 50);
alter table public.booking_alert_standing enable row level security;
revoke all on public.booking_alert_standing from public, anon, authenticated;
grant all on public.booking_alert_standing to service_role;
create policy booking_alert_standing_service on public.booking_alert_standing for all to service_role using(true) with check(true);

-- Standing rows carry no pilot window marker.
alter table public.booking_alert_outbox alter column pilot_armed_at drop not null;

-- Standing expansion: every verified paid upcoming booking with a v2 receipt,
-- consent-gated at expand time (and again at dispatch time in JS). No scope
-- row, no armed window. Idempotent via the outbox unique key.
create or replace function public.expand_booking_alert_receipts(p_limit integer default 25) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare b public.bookings%rowtype;
 party record; p public.profiles%rowtype; expanded integer:=0; errors integer:=0;
begin
 for b in select * from public.bookings where booking_alert_verified_at is not null
   and booking_alert_expanded_at is null
   and booking_alert_receipt->>'template_version'='2'
   order by booking_alert_verified_at,id for update skip locked limit least(greatest(p_limit,0),100)
 loop
  begin
   if b.payment_status='paid' and b.status='upcoming'
    and (b.booking_alert_receipt->>'alert_created_at') is not null then
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

-- Standing claim: one transaction claims one row and reserves one daily
-- allowance. Day rolls over lazily on first claim of a new UTC day. Paused
-- (owner or billing) denies everything. Stale in-flight claims still park as
-- uncertain forever; no automatic retry.
create or replace function public.claim_booking_alert() returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare standing public.booking_alert_standing%rowtype; q public.booking_alert_outbox%rowtype;
begin
 select * into standing from public.booking_alert_standing where id = 1 for update;
 if standing.paused then return null; end if;
 if standing.day < current_date then
  update public.booking_alert_standing set day=current_date, used_today=0, updated_at=now() where id=1
   returning * into standing;
 end if;
 if standing.used_today >= standing.daily_cap then return null; end if;
 -- A crashed worker might have sent. Hold it forever for review, do not retry.
 update public.booking_alert_outbox set status='uncertain',last_error='stale_claim_uncertain',updated_at=now()
  where status='sending' and updated_at < now()-interval '10 minutes';
 select * into q from public.booking_alert_outbox
  where status='pending'
    order by created_at,id for update skip locked limit 1;
 if not found then return null; end if;
 update public.booking_alert_standing set used_today=used_today+1, updated_at=now() where id=1;
 update public.booking_alert_outbox set status='sending',claim_token=gen_random_uuid(),attempts=attempts+1,updated_at=now()
  where id=q.id returning * into q;
 return to_jsonb(q) || jsonb_build_object('pilot_expires_at',null);
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
   update public.booking_alert_standing set used_today=greatest(0,used_today-1), updated_at=now() where id=1;
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
