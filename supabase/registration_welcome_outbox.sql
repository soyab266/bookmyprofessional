-- Draft migration for review - NOT applied to any environment.
-- Registration welcome notification outbox for Meta Cloud API WhatsApp sends.
--
-- Purpose: when a customer or professional registers with WhatsApp consent,
-- a row is queued here; a dispatcher (cron or post-registration hook) sends
-- the approved welcome template and records the outcome. This keeps welcome
-- delivery reliable even if the registration request itself finishes first.

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  channel text not null default 'whatsapp',
  template text not null,
  payload jsonb not null,
  status text not null default 'pending', -- pending | sending (claimed) | accepted (Meta accepted; NOT proof of delivery) | failed | skipped | uncertain (held for reconciliation, never auto-resent)
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- One active welcome per user and template.
create unique index if not exists notification_outbox_user_template_pending
  on public.notification_outbox (user_id, template)
  where status = 'pending';

create index if not exists notification_outbox_status_created
  on public.notification_outbox (status, created_at);

alter table public.notification_outbox enable row level security;

-- Only the service role (server) reads and writes the outbox; no client access.
create policy "service role full access"
  on public.notification_outbox
  for all
  to service_role
  using (true)
  with check (true);

-- ---------- registration welcome enqueue trigger (DRAFT - not applied) ----------
-- Connects signup to the welcome queue: the existing on_auth_user_created
-- trigger on auth.users already creates the profiles row (with
-- whatsapp_consent and phone from signup metadata); this trigger enqueues the
-- approved welcome WhatsApp for consenting new profiles. Client-side queueing
-- is not possible: with email confirmation on there is no session at signup,
-- and the outbox is service-role only. Signup code is unchanged by this hook.
create or replace function public.enqueue_registration_welcome() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_template text;
  v_name text;
begin
  -- Consent-only: no WhatsApp consent, no welcome message.
  if new.whatsapp_consent is not true then
    return new;
  end if;
  -- A phone number is required to send anything.
  if new.phone is null or btrim(new.phone) = '' then
    return new;
  end if;

  if new.role = 'professional' then
    v_template := 'bmp_professional_registration_received';
    v_name := coalesce(nullif(btrim(new.full_name), ''), 'Professional');
  else
    v_template := 'bmp_customer_registration_received';
    v_name := coalesce(nullif(btrim(new.full_name), ''), 'Customer');
  end if;

  -- Payload shape mirrors src/lib/meta-whatsapp-templates.js
  -- buildTemplateMessage exactly (language code 'en'); the connector
  -- re-validates and normalises the recipient at dispatch time.
  insert into public.notification_outbox (user_id, channel, template, payload, status)
  values (
    new.id,
    'whatsapp',
    v_template,
    jsonb_build_object(
      'messaging_product', 'whatsapp',
      'recipient_type', 'individual',
      'to', new.phone,
      'type', 'template',
      'template', jsonb_build_object(
        'name', v_template,
        'language', jsonb_build_object('code', 'en'),
        'components', jsonb_build_array(
          jsonb_build_object(
            'type', 'body',
            'parameters', jsonb_build_array(
              jsonb_build_object('type', 'text', 'text', v_name)
            )
          )
        )
      )
    ),
    'pending'
  )
  on conflict do nothing; -- one active welcome per user+template (partial unique index)
  return new;
exception when others then
  -- Welcome delivery must never break signup.
  return new;
end; $$;

drop trigger if exists on_profile_created_enqueue_welcome on public.profiles;
create trigger on_profile_created_enqueue_welcome
  after insert on public.profiles
  for each row execute function public.enqueue_registration_welcome();
