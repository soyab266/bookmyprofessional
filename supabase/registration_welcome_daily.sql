-- PREPARATION ONLY. Do not apply or arm without the separately reviewed live approval.
-- New ongoing daily stage. The expired 3-attempt pilot and its counters stay untouched.
-- Caps count provider attempts, not deliveries. Existing prepaid funds only, no top-up.
create table if not exists public.registration_welcome_daily (
 id smallint primary key check(id=1), enabled boolean not null default false,
 starts_at timestamptz, daily_cap integer not null default 15 check(daily_cap between 0 and 15),
 day_key date, daily_used integer not null default 0 check(daily_used>=0),
 total_used bigint not null default 0 check(total_used>=0)
);
insert into public.registration_welcome_daily(id) values(1) on conflict do nothing;
-- Permanent no-send record for the old test backlog. Do not delete outbox history.
create table if not exists public.registration_welcome_excluded (
 outbox_id uuid primary key references public.notification_outbox(id),
 reason text not null default 'owner_excluded_test', excluded_at timestamptz not null default now()
);
insert into public.registration_welcome_excluded(outbox_id)
 select id from public.notification_outbox where status='pending'
 and exists(select 1 from public.registration_welcome_daily where id=1 and starts_at is null and not enabled)
 on conflict do nothing;
create table if not exists public.registration_welcome_daily_claims (
 id uuid primary key default gen_random_uuid(), outbox_id uuid not null references public.notification_outbox(id),
 day_key date not null, finished boolean not null default false, outcome text,
 created_at timestamptz not null default now()
);
alter table public.registration_welcome_daily enable row level security;
alter table public.registration_welcome_excluded enable row level security;
alter table public.registration_welcome_daily_claims enable row level security;
revoke all on public.registration_welcome_daily,public.registration_welcome_excluded,public.registration_welcome_daily_claims from public,anon,authenticated;
grant select on public.registration_welcome_daily,public.registration_welcome_excluded,public.registration_welcome_daily_claims to service_role;

create or replace function public.daily_welcome_phone(p_phone text) returns text
language sql immutable set search_path=public,pg_temp as $$
 select case when d ~ '^[6-9][0-9]{9}$' then '91'||d
             when d ~ '^91[6-9][0-9]{9}$' then d else null end
 from (select regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') d) x
$$;

-- Both email-confirmation and later profile-readiness paths call the same helper.
-- Never catches up old accounts. Never sends and never consumes an attempt here.
create or replace function public.enqueue_daily_welcome(p_user uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.registration_welcome_daily%rowtype; p public.profiles%rowtype; u auth.users%rowtype; t text; n text; phone text;
begin
 select * into c from public.registration_welcome_daily where id=1;
 if not found or not c.enabled or c.starts_at is null or now()<c.starts_at then return; end if;
 select * into u from auth.users where id=p_user;
 if not found or u.email_confirmed_at is null or u.created_at<c.starts_at then return; end if;
 select * into p from public.profiles where id=p_user;
 if not found or p.role not in ('customer','professional') or p.whatsapp_consent is distinct from true
  or coalesce(p.notification_prefs->>'whatsapp','true')='false' then return; end if;
 phone:=public.daily_welcome_phone(p.phone); if phone is null then return; end if;
 t:=case when p.role='professional' then 'bmp_professional_registration_received' else 'bmp_customer_registration_received' end;
 if exists(select 1 from public.notification_outbox where user_id=p_user and template=t) then return; end if;
 n:=coalesce(nullif(btrim(p.full_name),''),case when p.role='professional' then 'Professional' else 'Customer' end);
 insert into public.notification_outbox(user_id,channel,template,payload,status)
 values(p_user,'whatsapp',t,jsonb_build_object('messaging_product','whatsapp','recipient_type','individual','to',phone,'type','template',
 'template',jsonb_build_object('name',t,'language',jsonb_build_object('code','en'),'components',jsonb_build_array(jsonb_build_object('type','body','parameters',jsonb_build_array(jsonb_build_object('type','text','text',n)))))),'pending')
 on conflict do nothing;
end $$;
create or replace function public.enqueue_daily_welcome_trigger() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.enqueue_daily_welcome(new.id); return new;
exception when others then return new;
end $$;
drop trigger if exists daily_welcome_auth_ready on auth.users;
create constraint trigger daily_welcome_auth_ready after insert or update on auth.users
 deferrable initially deferred for each row execute function public.enqueue_daily_welcome_trigger();
drop trigger if exists daily_welcome_profile_ready on public.profiles;
create trigger daily_welcome_profile_ready after insert or update on public.profiles
 for each row execute function public.enqueue_daily_welcome_trigger();

-- Atomic eligibility + daily budget + claim. Serialized on the stage row.
-- Old dispatcher/RPC remain expired. New dispatcher cannot select the old 13 tests,
-- even if their status is still pending: permanent exclusion AND both fresh cutoffs.
create or replace function public.claim_daily_welcome() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.registration_welcome_daily%rowtype; q public.notification_outbox%rowtype;
 p public.profiles%rowtype; today date:=(now() at time zone 'Asia/Kolkata')::date; ticket uuid; payload jsonb; phone text;
begin
 select * into c from public.registration_welcome_daily where id=1 for update;
 if not found or not c.enabled or c.starts_at is null or now()<c.starts_at then return jsonb_build_object('taken',false,'reason','off_or_not_started'); end if;
 if c.day_key=today and c.daily_used>=c.daily_cap or c.daily_cap=0 then return jsonb_build_object('taken',false,'reason','daily_cap'); end if;
 select o.* into q from public.notification_outbox o join auth.users u on u.id=o.user_id join public.profiles prof on prof.id=o.user_id
 where o.status='pending' and o.created_at>=c.starts_at and u.created_at>=c.starts_at and u.email_confirmed_at is not null
 and o.channel='whatsapp' and prof.role in ('customer','professional') and prof.whatsapp_consent=true
 and coalesce(prof.notification_prefs->>'whatsapp','true')<>'false' and public.daily_welcome_phone(prof.phone) is not null
 and o.template=case when prof.role='professional' then 'bmp_professional_registration_received' else 'bmp_customer_registration_received' end
 and not exists(select 1 from public.registration_welcome_excluded e where e.outbox_id=o.id)
 and not exists(select 1 from public.registration_welcome_daily_claims d join public.notification_outbox prior on prior.id=d.outbox_id where prior.user_id=o.user_id and prior.template=o.template and (not d.finished or d.outcome<>'not_attempted'))
 order by o.created_at,o.id for update of o skip locked limit 1;
 if not found then return jsonb_build_object('taken',false,'reason','empty'); end if;
 select * into p from public.profiles where id=q.user_id;
 phone:=public.daily_welcome_phone(p.phone);
 payload:=jsonb_build_object(
  'messaging_product','whatsapp','recipient_type','individual','to',phone,'type','template',
  'template',jsonb_build_object(
   'name',q.template,'language',jsonb_build_object('code','en'),
   'components',jsonb_build_array(jsonb_build_object(
    'type','body','parameters',jsonb_build_array(jsonb_build_object(
     'type','text','text',coalesce(nullif(btrim(p.full_name),''),case when p.role='professional' then 'Professional' else 'Customer' end)
    ))
   ))
  )
 );
 update public.notification_outbox set status='sending',updated_at=now() where id=q.id;
 update public.registration_welcome_daily set day_key=today,daily_used=case when day_key=today then daily_used+1 else 1 end,total_used=total_used+1 where id=1;
 insert into public.registration_welcome_daily_claims(outbox_id,day_key) values(q.id,today) returning id into ticket;
 return jsonb_build_object('taken',true,'ticket',ticket,'payload',payload);
end $$;

-- A ticket is settled at most once. Unknown/ambiguous requests consume an attempt
-- and stay held. Only proven no-provider-request outcomes release their own ticket.
create or replace function public.finish_daily_welcome(p_ticket uuid,p_outcome text,p_error text default null) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.registration_welcome_daily_claims%rowtype;
begin
 if p_outcome is null or p_outcome not in ('accepted','failed','uncertain','not_attempted') then raise exception 'Invalid welcome outcome'; end if;
 -- Same lock order as claim, including crossing IST midnight.
 perform 1 from public.registration_welcome_daily where id=1 for update;
 select * into d from public.registration_welcome_daily_claims where id=p_ticket for update;
 if not found or d.finished then return false; end if;
 update public.registration_welcome_daily_claims set finished=true,outcome=p_outcome where id=p_ticket;
 update public.notification_outbox set status=case when p_outcome='not_attempted' then 'pending' else p_outcome end,
 attempts=attempts+case when p_outcome='not_attempted' then 0 else 1 end,
 accepted_at=case when p_outcome='accepted' then now() else accepted_at end,last_error=left(p_error,1000),updated_at=now()
 where id=d.outbox_id and status='sending';
 if p_outcome='not_attempted' then
  update public.registration_welcome_daily set total_used=greatest(total_used-1,0),
   daily_used=case when day_key=d.day_key then greatest(daily_used-1,0) else daily_used end where id=1;
 end if;
 return true;
end $$;
revoke all on function public.daily_welcome_phone(text),public.enqueue_daily_welcome(uuid),public.enqueue_daily_welcome_trigger(),public.claim_daily_welcome(),public.finish_daily_welcome(uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_daily_welcome(),public.finish_daily_welcome(uuid,text,text) to service_role;
-- NO activation, budget reset, scheduler, replay, deletion, billing or booking change here.
-- Final approved activation must choose starts_at>=2026-11-20T18:30:00Z (Sat21Nov midnight IST),
-- verify exclusions, then enable. Propose manual stop via enabled=false; no guessed expiry.
