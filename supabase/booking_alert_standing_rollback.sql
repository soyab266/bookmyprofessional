-- REVIEW ONLY. Full rollback of booking_alert_standing.sql: restores the
-- pilot-gated expand/claim/finish functions byte-faithfully (PR46/PR47
-- versions), drops the standing config, re-imposes pilot_armed_at NOT NULL.
-- Refuses to run while any standing (pilot_armed_at IS NULL) outbox row
-- exists or the standing row is currently unpaused: re-imposing NOT NULL
-- would fail on standing rows anyway, and silently dropping the standing
-- table could strand queued sends.
--
-- Practical recovery paths:
--  A. Pre-live (no standing sends ever made): pause is still true and no
--     standing outbox rows exist, so this file runs cleanly and restores the
--     exact PR46/PR47 pilot state.
--  B. Post-live (real standing sends exist): the standing outbox rows are
--     audit and are never deleted, so this file will keep refusing. The
--     supported stop is instead: cron.unschedule, standing paused=true, app
--     flag false + redeploy. That is a full, durable stop that preserves all
--     audit rows; the nullable pilot_armed_at column is inert for the pilot
--     functions, which only match pilot_armed_at=budget.armed_at rows.
-- Operator must keep the app booking flag OFF and the booking job unscheduled
-- during rollback.
begin;
DO $$ begin
 if exists(select 1 from public.booking_alert_outbox where pilot_armed_at is null)
  or exists(select 1 from public.booking_alert_standing where paused is not true) then
  raise exception 'standing_rollback_requires_no_standing_rows_and_never_unpaused';
 end if;
end $$;

create or replace function public.expand_booking_alert_receipts(p_limit integer default 25) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare budget public.booking_alert_budget%rowtype; b public.bookings%rowtype;
 party record; p public.profiles%rowtype; expanded integer:=0; errors integer:=0;
begin
 select * into budget from public.booking_alert_budget where id=1 for share;
 if budget.armed_at is null or budget.expires_at is null or now()<budget.armed_at
   or now()>=budget.expires_at or budget.total_cap<=0 then return jsonb_build_object('expanded',0,'errors',0); end if;
 for b in select * from public.bookings where booking_alert_verified_at>=budget.armed_at
   and booking_alert_verified_at<budget.expires_at and booking_alert_expanded_at is null
   and booking_alert_receipt->>'template_version'='2'
   and exists(select 1 from public.booking_alert_scope s where s.id=1 and s.booking_id=bookings.id and s.pilot_armed_at=budget.armed_at)
   order by booking_alert_verified_at,id for update skip locked limit least(greatest(p_limit,0),100)
 loop
  begin
   if b.payment_status='paid' and b.status='upcoming'
    and (b.booking_alert_receipt->>'alert_created_at') is not null
    and (b.booking_alert_receipt->>'alert_created_at')::timestamptz>=budget.armed_at then
    for party in select b.booking_alert_receipt->>'customer_id' as uid,'customer' as role,'bmp_booking_details_v2' as template
     union all select b.booking_alert_receipt->>'professional_id','professional','bmp_professional_booking_details_v2'
    loop
     select * into p from public.profiles where id=party.uid::uuid;
     if not found or not public.booking_alert_scope_allows(budget.armed_at,b.id,p.id,party.role,public.booking_alert_recipient_digits(p.phone)) or p.whatsapp_consent is not true or coalesce(p.phone,'')=''
       or p.notification_prefs->>'whatsapp'='false' then continue; end if;
     insert into public.booking_alert_outbox(booking_id,user_id,recipient_role,template,booking,recipient_phone,pilot_armed_at)
      values(b.id,p.id,party.role,party.template,b.booking_alert_receipt,p.phone,budget.armed_at)
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

create or replace function public.claim_booking_alert() returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare budget public.booking_alert_budget%rowtype; q public.booking_alert_outbox%rowtype;
begin
 select * into budget from public.booking_alert_budget where id = 1 for update;
 if budget.armed_at is null or budget.expires_at is null or now() < budget.armed_at
    or now() >= budget.expires_at or budget.total_used >= budget.total_cap then return null; end if;
 -- A crashed worker might have sent. Hold it forever for review, do not retry.
 update public.booking_alert_outbox set status='uncertain',last_error='stale_claim_uncertain',updated_at=now()
  where status='sending' and updated_at < now()-interval '10 minutes';
 select * into q from public.booking_alert_outbox
  where status='pending' and pilot_armed_at=budget.armed_at
    and public.booking_alert_scope_allows(pilot_armed_at,booking_id,user_id,recipient_role,public.booking_alert_recipient_digits(recipient_phone))
    order by created_at,id for update skip locked limit 1;
 if not found then return null; end if;
 update public.booking_alert_budget set total_used=total_used+1 where id=1;
 update public.booking_alert_outbox set status='sending',claim_token=gen_random_uuid(),attempts=attempts+1,updated_at=now()
  where id=q.id returning * into q;
 return to_jsonb(q) || jsonb_build_object('pilot_expires_at',budget.expires_at);
end $$;

create or replace function public.finish_booking_alert(p_id uuid,p_claim_token uuid,p_status text,p_message_id text,p_error text,p_release boolean)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare q public.booking_alert_outbox%rowtype; budget public.booking_alert_budget%rowtype;
begin
 -- Same lock order as claim: budget, then queue. Avoid finish/claim deadlocks.
 select * into budget from public.booking_alert_budget where id=1 for update;
 if p_status not in ('accepted','uncertain','skipped','failed')
    or p_release is null or (p_release and p_status not in ('skipped','failed')) then raise exception 'invalid_finish'; end if;
 update public.booking_alert_outbox set status=p_status,meta_message_id=p_message_id,last_error=p_error,updated_at=now()
  where id=p_id and claim_token=p_claim_token and status='sending' returning * into q;
 if not found then return false; end if;
 if p_release and q.pilot_armed_at=budget.armed_at then
  update public.booking_alert_budget set total_used=greatest(0,total_used-1) where id=1;
 end if;
 return true;
end $$;

alter table public.booking_alert_outbox alter column pilot_armed_at set not null;
drop table public.booking_alert_standing;

revoke all on function public.expand_booking_alert_receipts(integer), public.claim_booking_alert(), public.finish_booking_alert(uuid,uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.expand_booking_alert_receipts(integer), public.claim_booking_alert(), public.finish_booking_alert(uuid,uuid,text,text,text,boolean) to service_role;
commit;
