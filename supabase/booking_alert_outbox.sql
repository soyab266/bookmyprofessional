-- REVIEW ONLY. Separate booking queue/budget, unarmed by default. No cron is created.
-- Service-role receipt RPC replaces ONLY the verified PayU success branch when the new
-- booking flag is explicitly enabled. Hash/amount verification stays in the routes.
-- Apply/arm/schedule only with separate owner approval. Never reset a live pilot.
begin;
create table public.booking_alert_budget (
 id integer primary key check (id = 1), total_cap integer not null default 0 check (total_cap >= 0),
 total_used integer not null default 0 check (total_used >= 0),
 armed_at timestamptz, expires_at timestamptz,
 check (expires_at is null or armed_at is not null and expires_at > armed_at)
);
insert into public.booking_alert_budget(id) values (1);
create table public.booking_alert_outbox (
 id uuid primary key default gen_random_uuid(),
 booking_id text not null references public.bookings(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, recipient_role text not null check (recipient_role in ('customer','professional')),
 event text not null default 'booking_paid' check (event = 'booking_paid'),
 template text not null check (template in ('bmp_booking_received','bmp_professional_booking_request')),
 booking jsonb not null, recipient_phone text not null, pilot_armed_at timestamptz not null,
 status text not null default 'pending' check (status in ('pending','sending','accepted','uncertain','skipped','failed')),
 claim_token uuid, attempts integer not null default 0, meta_message_id text, last_error text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(booking_id, user_id, event)
);
create index on public.booking_alert_outbox(status,created_at);
alter table public.booking_alert_budget enable row level security;
alter table public.booking_alert_outbox enable row level security;
revoke all on public.booking_alert_budget, public.booking_alert_outbox from public, anon, authenticated;
grant all on public.booking_alert_budget, public.booking_alert_outbox to service_role;
create policy booking_alert_budget_service on public.booking_alert_budget for all to service_role using (true) with check (true);
create policy booking_alert_outbox_service on public.booking_alert_outbox for all to service_role using (true) with check (true);

-- Minimal verified receipt is part of the canonical booking row. No optional
-- queue/profile/budget access occurs while recording payment. The receipt is
-- populated only by the verified server success path, never by a client edit.
alter table public.bookings
 add column booking_alert_created_at timestamptz,
 add column booking_alert_verified_at timestamptz,
 add column booking_alert_provider_ref text,
 add column booking_alert_receipt jsonb,
 add column booking_alert_expanded_at timestamptz,
 add column booking_alert_expand_error text;
create index booking_alert_receipts_pending on public.bookings(booking_alert_verified_at,id)
 where booking_alert_verified_at is not null and booking_alert_expanded_at is null;
create function public.guard_booking_alert_receipt() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 -- Server-owned INSERT cutoff. ALTER leaves all pre-migration rows NULL.
 -- Ignore any caller-supplied creation marker, including client backdating.
 if TG_OP='INSERT' then new.booking_alert_created_at:=clock_timestamp();
 elsif new.booking_alert_created_at is distinct from old.booking_alert_created_at then
  raise exception 'protected_booking_creation_marker';
 end if;
 if current_user not in ('service_role','postgres') then
  if TG_OP='INSERT' then
   if new.booking_alert_verified_at is not null or new.booking_alert_provider_ref is not null
      or new.booking_alert_receipt is not null or new.booking_alert_expanded_at is not null
      or new.booking_alert_expand_error is not null then raise exception 'protected_verified_payment_receipt'; end if;
  elsif row(new.booking_alert_verified_at,new.booking_alert_provider_ref,new.booking_alert_receipt,new.booking_alert_expanded_at,new.booking_alert_expand_error)
    is distinct from row(old.booking_alert_verified_at,old.booking_alert_provider_ref,old.booking_alert_receipt,old.booking_alert_expanded_at,old.booking_alert_expand_error) then
    raise exception 'protected_verified_payment_receipt';
  end if;
 end if;
 return new;
end $$;
create trigger guard_booking_alert_receipt before insert or update on public.bookings
 for each row execute function public.guard_booking_alert_receipt();

-- Called only after the existing PayU hash/amount checks. This RPC has zero
-- references to notification queue, profiles or budget. A queue outage cannot
-- roll it back. Missing canonical schema/DB failure can still fail payment
-- recording, exactly why schema validation is a deployment prerequisite.
create function public.record_verified_booking_payment(p_booking_id text,p_amount numeric,p_provider_ref text)
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
    'service_title',b.service_title,'date',b.date,'time_slot',b.time_slot,'alert_created_at',b.booking_alert_created_at)
  where id=p_booking_id returning * into b;
 -- Preserve the existing email transition gate. Reconciliation uses the marker
 -- independently, even if another legacy/client path had already set paid.
 -- Never resurrect or rewind a booking on a delayed verified callback.
 -- Ordinary new bookings already start upcoming. Terminal/in-progress bookings
 -- retain their state and produce no confirmation event.
 if was_paid or b.status is distinct from 'upcoming' then return null; end if;
 return to_jsonb(b);
end $$;

-- Independent reconciliation, called before dispatch. Per-receipt subtransactions
-- make queue/profile failures retryable without undoing verified payment. No
-- success marker until BOTH eligible recipient rows (or consent skips) commit.
create function public.expand_booking_alert_receipts(p_limit integer default 25) returns jsonb
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

-- One transaction claims one row and reserves one real-request allowance.
-- Competing dispatchers serialize on the budget row. No count-then-send race.
create function public.claim_booking_alert() returns jsonb
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

-- Only release where JS proved no Meta request was made. Every HTTP rejection
-- and ambiguous network outcome keeps its slot. A crash conservatively leaks a
-- slot, reducing the remaining allowance. No daily reset or automatic re-arm.
create function public.finish_booking_alert(p_id uuid,p_claim_token uuid,p_status text,p_message_id text,p_error text,p_release boolean)
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
revoke all on function public.record_verified_booking_payment(text,numeric,text), public.expand_booking_alert_receipts(integer), public.guard_booking_alert_receipt(), public.claim_booking_alert(), public.finish_booking_alert(uuid,uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.record_verified_booking_payment(text,numeric,text), public.expand_booking_alert_receipts(integer), public.guard_booking_alert_receipt(), public.claim_booking_alert(), public.finish_booking_alert(uuid,uuid,text,text,text,boolean) to service_role;
commit;

-- Rollback after disabling booking flag and unscheduling booking-only job:
-- revert app commit; leave additive tables for audit. If removing objects later,
-- drop booking-only functions/trigger, then these two booking tables and receipt columns. No registration
-- function, queue, budget, scheduler or data is touched by this migration.
