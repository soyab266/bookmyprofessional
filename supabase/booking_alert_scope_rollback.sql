-- REVIEW ONLY. First disable booking flag, unschedule booking job and disarm budget.
-- Do not reset used counters or modify registration. Revert app separately.
begin;
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
   order by booking_alert_verified_at,id for update skip locked limit least(greatest(p_limit,0),100)
 loop
  begin
   if b.payment_status='paid' and b.status='upcoming'
    and (b.booking_alert_receipt->>'alert_created_at') is not null
    and (b.booking_alert_receipt->>'alert_created_at')::timestamptz>=budget.armed_at then
    for party in select b.booking_alert_receipt->>'customer_id' as uid,'customer' as role,'bmp_booking_received' as template
     union all select b.booking_alert_receipt->>'professional_id','professional','bmp_professional_booking_request'
    loop
     select * into p from public.profiles where id=party.uid::uuid;
     if not found or p.whatsapp_consent is not true or coalesce(p.phone,'')=''
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
  where status='pending' and pilot_armed_at=budget.armed_at order by created_at,id for update skip locked limit 1;
 if not found then return null; end if;
 update public.booking_alert_budget set total_used=total_used+1 where id=1;
 update public.booking_alert_outbox set status='sending',claim_token=gen_random_uuid(),attempts=attempts+1,updated_at=now()
  where id=q.id returning * into q;
 return to_jsonb(q) || jsonb_build_object('pilot_expires_at',budget.expires_at);
end $$;
drop function public.booking_alert_scope_allows(timestamptz,text,uuid,text,text);
drop function public.booking_alert_recipient_digits(text);
drop table public.booking_alert_scope;
commit;
