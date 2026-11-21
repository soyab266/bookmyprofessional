-- REVIEW ONLY. One-booking pilot isolation; no activation, schedule or scope row.
-- Apply only while booking flag OFF, budget zero/unarmed and booking job absent.
begin;
do $$ begin
 if exists(select 1 from public.booking_alert_budget where total_cap<>0 or total_used<>0 or armed_at is not null or expires_at is not null)
  or exists(select 1 from public.booking_alert_outbox where status='sending') then
  raise exception 'scope_migration_requires_unarmed_idle_booking_pilot';
 end if;
end $$;
create table public.booking_alert_scope (
 id integer primary key check (id=1),
 pilot_armed_at timestamptz not null,
 booking_id text not null references public.bookings(id) on delete cascade,
 customer_id uuid not null references public.profiles(id) on delete cascade,
 professional_id uuid not null references public.profiles(id) on delete cascade,
 customer_phone text not null check (customer_phone ~ '^[1-9][0-9]{9,14}$'),
 professional_phone text not null check (professional_phone ~ '^[1-9][0-9]{9,14}$')
);
alter table public.booking_alert_scope enable row level security;
revoke all on public.booking_alert_scope from public,anon,authenticated;
grant all on public.booking_alert_scope to service_role;
create policy booking_alert_scope_service on public.booking_alert_scope for all to service_role using(true) with check(true);
create function public.booking_alert_recipient_digits(p_phone text) returns text
language sql immutable set search_path=public,pg_temp as $$
 select case when length(d)<10 then '' when length(d)=10 then '91'||d else d end
 from (select regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') d) x
$$;
create function public.booking_alert_scope_allows(p_armed_at timestamptz,p_booking_id text,p_user_id uuid,p_role text,p_phone text)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(
  select 1 from public.booking_alert_scope s
  join public.booking_alert_budget budget on budget.id=1
  join public.bookings b on b.id=s.booking_id
  where s.id=1 and s.pilot_armed_at=p_armed_at and s.pilot_armed_at=budget.armed_at
   and now()>=budget.armed_at and now()<budget.expires_at and budget.total_cap between 1 and 2
   and s.booking_id=p_booking_id and b.customer_id=s.customer_id and b.professional_id=s.professional_id
   and b.payment_status='paid' and b.status='upcoming' and b.booking_alert_verified_at>=budget.armed_at
   and b.booking_alert_created_at>=budget.armed_at
   and ((p_role='customer' and p_user_id=s.customer_id and p_phone=s.customer_phone)
    or (p_role='professional' and p_user_id=s.professional_id and p_phone=s.professional_phone))
 )
$$;
revoke all on function public.booking_alert_recipient_digits(text),public.booking_alert_scope_allows(timestamptz,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.booking_alert_recipient_digits(text),public.booking_alert_scope_allows(timestamptz,text,uuid,text,text) to service_role;

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
   and exists(select 1 from public.booking_alert_scope s where s.id=1 and s.booking_id=bookings.id and s.pilot_armed_at=budget.armed_at)
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
commit;
