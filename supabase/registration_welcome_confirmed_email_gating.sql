-- DRAFT hardening variant for review - NOT applied to any environment.
-- Confirmed-contact gating for the registration welcome WhatsApp.
--
-- RECOMMENDATION (18 Nov 2026): enqueue the welcome message only after the
-- account's email is confirmed, instead of at the moment of signup.
--
-- EVIDENCE behind the recommendation (verified in-repo, main @ d49e7cd):
--   - profiles.phone comes straight from signup metadata:
--     supabase/schema.sql handle_new_user() inserts
--     new.raw_user_meta_data->>'phone'. It is free text, never verified.
--   - The product's OTP flow (src/app/api/auth/send-otp + verify-otp)
--     verifies the EMAIL address via Brevo email. No phone-OTP or
--     phone-verification flow exists anywhere in the codebase.
--   - The app's register UI runs that email OTP before signUp, but the
--     Supabase signUp endpoint itself is public (anon key): a direct API
--     call bypasses the app OTP entirely and still creates a profiles row
--     with whatever phone + whatsapp_consent the caller supplies.
--   - The enqueue trigger in registration_welcome_enqueue_activation.sql
--     fires AFTER INSERT on profiles, i.e. at signUp, BEFORE Supabase email
--     confirmation (handle_new_user runs on auth.users insert; confirmation
--     happens later when the user clicks the email link).
--   Consequence of the un-gated design: anyone can trigger a PAID WhatsApp
--   template message (Utility, base Rs0.115 + tax, charged on delivery) to
--   an arbitrary, unverified phone number - an abuse and cost vector, and a
--   Meta quality-rating risk (unexpected messages get blocked/reported).
--
-- WHAT THIS VARIANT CHANGES:
--   The welcome is enqueued when auth.users.email_confirmed_at transitions
--   from NULL to set (the user clicked the confirmation email). Email
--   ownership is then established by Supabase itself, independent of the
--   app UI. Consent and phone are re-read from the profile at confirmation
--   time, which is fresher than signup-time data.
--
-- INSERT COVERAGE (reviewed 18 Nov, second round): the trigger fires AFTER
-- INSERT OR UPDATE, not only on the NULL->set UPDATE, so an auth user
-- created ALREADY confirmed (e.g. admin.createUser with email_confirm, a
-- pre-verified OAuth identity, or any future flow that inserts
-- email_confirmed_at directly) is covered by the same gate. The partial
-- unique index makes the two firing paths overlap-safe (one active welcome
-- per user+template).
--
-- SUPPORTED SIGNUP AUDIENCE (precise):
--   - Email+password registrations (app UI OR direct signUp API call) that
--     go on to confirm their email: welcome queued at confirmation, if the
--     profile then has whatsapp_consent=true and a phone.
--   - Google OAuth registrations (src/app/api/auth/google/callback): the
--     OAuth metadata carries NO phone and NO whatsapp_consent (verified in
--     the callback route), so the consent+phone checks queue nothing. OAuth
--     users are OUT of the welcome audience by data shape. (If they later
--     add phone+consent in settings, that profile UPDATE is a separate,
--     future path - not covered by this trigger.)
--   The welcome therefore goes only to a self-declared phone attached to a
--   CONFIRMED-email account. The phone itself is never verified by any
--   current flow - see the honesty note below.
--
-- WHAT THIS DOES NOT FIX (stated honestly):
--   The PHONE number itself remains unverified - a confirmed-email user can
--   still register with someone else's phone. Closing that needs a phone-OTP
--   flow (e.g. WhatsApp OTP via Meta, or Supabase Phone auth), which is a
--   separate, larger product decision. Until then the residual exposure is
--   bounded by the dispatcher volume caps (25/day, 500 all-in by default)
--   and the prepaid balance, and Meta-side abuse signals (blocks/reports)
--   should be watched after activation.
--   Accounts that never confirm their email never get the welcome message.
--
-- RELATIONSHIP TO THE BASE ARTIFACTS:
--   This variant REPLACES the profiles-insert trigger in
--   registration_welcome_enqueue_activation.sql. Apply EITHER that file
--   (enqueue at signup) OR this one (enqueue at email confirmation) - never
--   both, or a confirming user could be queued twice (the partial unique
--   index prevents a duplicate row, but the choice should be deliberate).
--   The choice is the owner's; this file exists so both options are concrete.
--
-- REVERSAL (full):
--   drop trigger if exists on_auth_user_confirmed_enqueue_welcome on auth.users;
--   drop function if exists public.enqueue_registration_welcome_on_confirm();
-- Rows already queued stay pending and unsent; delete them if unwanted.

create or replace function public.enqueue_registration_welcome_on_confirm() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles%rowtype;
  v_template text;
  v_name text;
begin
  -- Fire only when this row is now confirmed, and either it was just
  -- inserted that way (pre-confirmed flows) or it transitioned NULL -> set
  -- (normal email confirmation).
  if new.email_confirmed_at is null then
    return new;
  end if;
  if TG_OP = 'UPDATE' and old.email_confirmed_at is not null then
    return new;
  end if;

  select * into v_profile from public.profiles where id = new.id;
  if not found then
    return new;
  end if;

  -- Consent-only: no WhatsApp consent, no welcome message.
  if v_profile.whatsapp_consent is not true then
    return new;
  end if;
  -- A phone number is required to send anything.
  if v_profile.phone is null or btrim(v_profile.phone) = '' then
    return new;
  end if;

  if v_profile.role = 'professional' then
    v_template := 'bmp_professional_registration_received';
    v_name := coalesce(nullif(btrim(v_profile.full_name), ''), 'Professional');
  else
    v_template := 'bmp_customer_registration_received';
    v_name := coalesce(nullif(btrim(v_profile.full_name), ''), 'Customer');
  end if;

  -- Payload shape identical to the signup-time trigger (mirrors
  -- src/lib/meta-whatsapp-templates.js buildTemplateMessage).
  insert into public.notification_outbox (user_id, channel, template, payload, status)
  values (
    v_profile.id,
    'whatsapp',
    v_template,
    jsonb_build_object(
      'messaging_product', 'whatsapp',
      'recipient_type', 'individual',
      'to', v_profile.phone,
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
  -- Welcome delivery must never break account confirmation.
  return new;
end; $$;

drop trigger if exists on_auth_user_confirmed_enqueue_welcome on auth.users;
create trigger on_auth_user_confirmed_enqueue_welcome
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.enqueue_registration_welcome_on_confirm();
