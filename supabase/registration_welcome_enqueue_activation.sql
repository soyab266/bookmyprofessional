-- DRAFT activation script for review - NOT applied to any environment.
-- Registration welcome enqueue: connects signup to the welcome WhatsApp queue.
--
-- Reviewed live state (18 Nov 2026, production project ijqjwombejroyrbbakaw):
--   - public.notification_outbox EXISTS (created manually, no CLI migrations),
--     with RLS enabled and its service-role policy; NO meta_message_id column.
--   - This trigger does NOT exist yet.
--   - handle_new_user() exists (trigger, security definer); profiles rows are
--     created from signup metadata (full_name, role, phone, whatsapp_consent).
-- Because the table, indexes and policy are already live, ONLY the function
-- and trigger below are applied here - running the merged
-- supabase/registration_welcome_outbox.sql in full would fail at its
-- 'create policy' step (the policy already exists).
--
-- Effect once applied: inserting a profiles row with whatsapp_consent = true
-- and a phone queues one pending welcome row. The message is NOT sent until
-- the dispatcher runs (see supabase/registration_welcome_schedule.sql).
-- Consent=false registrations queue nothing.
--
-- REVERSAL (full):
--   drop trigger if exists on_profile_created_enqueue_welcome on public.profiles;
--   drop function if exists public.enqueue_registration_welcome();
-- Rows already queued stay pending and unsent; delete them if unwanted.
--
-- Function and trigger body below are verbatim from the merged
-- supabase/registration_welcome_outbox.sql (main @ d49e7cd).


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
