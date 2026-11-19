-- REVIEW ONLY. Apply AFTER booking_alert_outbox.sql and PR29 booking_alert_scope.sql.
-- No activation, backfill, queue reset, pilot rearm, schedule or send.
-- Operator must keep app booking flag OFF and booking job absent during migration.
begin;
DO $$ begin
 if exists(select 1 from public.booking_alert_budget where total_cap<>0 or total_used<>0 or armed_at is not null or expires_at is not null)
  or exists(select 1 from public.booking_alert_outbox where status='sending') then
  raise exception 'fuller_migration_requires_unarmed_idle_booking_pilot';
 end if;
end $$;
alter table public.booking_alert_outbox drop constraint booking_alert_outbox_template_check;
alter table public.booking_alert_outbox add constraint booking_alert_outbox_template_check
 check(template in ('bmp_booking_received','bmp_professional_booking_request',
 'bmp_booking_details_v2','bmp_professional_booking_details_v2'));
create or replace function public.record_verified_booking_payment(p_booking_id text,p_amount numeric,p_provider_ref text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare b public.bookings%rowtype; was_paid boolean;
begin
 select * into b from public.bookings where id=p_booking_id for update;
 if not found then raise exception 'booking_not_found'; end if;
 if p_amount is null or b.total_paid is null or round(b.total_paid::numeric,2)<>round(p_amount,2) then raise exception 'amount_mismatch'; end if;
 if b.booking_alert_verified_at is not null then return null; end if;
 was_paid := b.payment_status='paid';
 update public.bookings set payment_status='paid',
  booking_alert_verified_at=now(),booking_alert_provider_ref=p_provider_ref,
  booking_alert_receipt=jsonb_build_object('id',b.id,'customer_id',b.customer_id,'professional_id',b.professional_id,
    'service_title',b.service_title,'date',b.date,'time_slot',b.time_slot,'alert_created_at',b.booking_alert_created_at,
    'address',b.address,'total_paid',b.total_paid,'template_version',2)
  where id=p_booking_id returning * into b;
 -- Preserve the existing email transition gate. Reconciliation uses the marker
 -- independently, even if another legacy/client path had already set paid.
 -- Never resurrect or rewind a booking on a delayed verified callback.
 -- Ordinary new bookings already start upcoming. Terminal/in-progress bookings
 -- retain their state and produce no confirmation event.
 if was_paid or b.status is distinct from 'upcoming' then return null; end if;
 return to_jsonb(b);
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
commit;
