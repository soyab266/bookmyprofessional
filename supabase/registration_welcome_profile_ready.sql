-- DRAFT companion migration for review - NOT applied to any environment.
-- Registration welcome for Google-signup (and any post-confirmation) profiles:
-- enqueue when a CONFIRMED, in-pilot account's profile first has BOTH
-- whatsapp_consent = true AND a phone number - STRICTLY for accounts
-- registered after this migration is installed.
--
-- WHY THIS EXISTS (verified 19 Nov 2026, main @ 1cf4da6):
--   The confirmation-time trigger (registration_welcome_confirmed_email_gating.sql,
--   live) fires only when auth.users.email_confirmed_at is set - for Google
--   signups that is the generateLink INSERT in
--   src/app/api/auth/google/callback/route.js, when the freshly created
--   profile still has NO phone (Google supplies none; users add one later in
--   the dashboard profile form). The consent+phone checks then queue
--   nothing, and nothing ever re-fires: Google registrants could never
--   receive the welcome even after opting in. Reported live on 19 Nov: a
--   Google customer registration got no welcome (profile had a phone but
--   whatsapp_consent stayed false because the Google path never asked).
--
-- WHAT THE COMPANION CODE CHANGE DOES (same patch):
--   The register page collects the same optional WhatsApp opt-in for the
--   Google button and carries it through the signed OAuth state into the
--   callback, which stores it ONLY for brand-new accounts (auth metadata ->
--   handle_new_user -> profiles, and the profile upsert). An existing user's
--   stored consent is preserved exactly as-is on later Google sign-ins:
--   never granted, never cleared. A later opt-in flow for existing accounts
--   is a separate change, outside this fix.
--
-- ROLLOUT CUTOFF - FUTURE REGISTRATIONS ONLY (owner review decision 19 Nov):
--   First apply records the install time in
--   public.registration_welcome_rollout ('profile_ready_trigger'). The
--   trigger enrolls only auth users created at/after BOTH the pilot
--   armed_at AND that recorded install time. Every account created before
--   the install - including in-pilot accounts such as the 19 Nov Google
--   registration that exposed this gap - is NEVER enrolled by this trigger,
--   whatever consent it later gains. Re-running this migration does NOT
--   move the cutoff: the insert is on conflict do nothing and
--   create or replace function only swaps the function body (verified by
--   test). Fail closed if the rollout row is missing.
--
-- OTHER GUARDS (all must hold; fail closed on any):
--     1. whatsapp_consent IS true and phone is non-empty;
--     2. the pilot is armed and unexpired (same budget row read, same
--        semantics as the confirmation trigger);
--     3. the auth user is email-CONFIRMED (preserves the owner-approved
--        option-1 rule: welcome only after email verification);
--     4. no welcome row exists yet for this user+template in ANY status -
--        one welcome per account, ever (the partial unique index only covers
--        'pending'; this check also covers accepted/failed/skipped/
--        uncertain, so a later phone edit can never re-welcome).
--   Roles: template and fallback name follow profiles.role exactly like the
--   confirmation trigger - customers and professionals are both covered.
--
-- RELATIONSHIP TO THE EXISTING TRIGGER (no double-send):
--   Email+password path: profile is created at signup while unconfirmed ->
--   guard 3 skips; the existing confirmation trigger queues at email
--   confirmation as today. Unchanged.
--   Google path (post-install registrations): confirmation trigger fires at
--   account creation when the profile has no phone -> skips; this trigger
--   queues when the phone (or consent) later completes the pair. Each
--   enqueue is additionally guarded by check 4 and the pending-only unique
--   index, so the two triggers cannot queue twice even if their conditions
--   ever overlap.
--
-- WHAT THIS DOES NOT CHANGE:
--   Sending itself stays behind the dispatcher's atomic budget reservation
--   (reserve_welcome_send), caps and hard expiry. This trigger only queues
--   'pending' rows; it cannot send. The phone remains unverified by any
--   current flow (see the honesty note in
--   registration_welcome_confirmed_email_gating.sql).
--
-- REVERSAL (full):
--   drop trigger if exists on_profile_ready_enqueue_welcome on public.profiles;
--   drop function if exists public.enqueue_registration_welcome_on_profile_ready();
--   drop table if exists public.registration_welcome_rollout;
-- Rows already queued stay pending and unsent; delete them if unwanted.

-- Install-time rollout record. Written once; reruns never move it.
create table if not exists public.registration_welcome_rollout (
  key text primary key,
  applied_at timestamptz not null
);
insert into public.registration_welcome_rollout (key, applied_at)
values ('profile_ready_trigger', now())
on conflict (key) do nothing;

create or replace function public.enqueue_registration_welcome_on_profile_ready() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_confirmed_at timestamptz;
  v_user_created_at timestamptz;
  v_rollout_cutoff timestamptz;
  v_template text;
  v_name text;
begin
  -- Only when the profile now has both consent and a phone.
  if new.whatsapp_consent is not true then
    return new;
  end if;
  if new.phone is null or btrim(new.phone) = '' then
    return new;
  end if;

  -- Rollout cutoff recorded at install; fail closed without it.
  select applied_at into v_rollout_cutoff
    from public.registration_welcome_rollout
   where key = 'profile_ready_trigger';
  if not found then
    return new;
  end if;

  -- Verified email + audience: confirmed account, registered at/after the
  -- pilot arming AND at/after this migration's install (future
  -- registrations only).
  select u.email_confirmed_at, u.created_at
    into v_confirmed_at, v_user_created_at
    from auth.users u
   where u.id = new.id;
  if not found or v_confirmed_at is null then
    return new;
  end if;

  perform 1 from public.notification_dispatch_budget
   where id = 1
     and armed_at is not null
     and expires_at is not null
     and now() < expires_at
     and v_user_created_at >= armed_at
     and v_user_created_at >= v_rollout_cutoff;
  if not found then
    return new;
  end if;

  if new.role = 'professional' then
    v_template := 'bmp_professional_registration_received';
    v_name := coalesce(nullif(btrim(new.full_name), ''), 'Professional');
  else
    v_template := 'bmp_customer_registration_received';
    v_name := coalesce(nullif(btrim(new.full_name), ''), 'Customer');
  end if;

  -- One welcome per account, ever: any existing row for this user+template
  -- (pending, sending, accepted, failed, skipped or uncertain) means the
  -- welcome has already been handled and must not be queued again.
  perform 1 from public.notification_outbox
   where user_id = new.id and template = v_template;
  if found then
    return new;
  end if;

  -- Payload shape identical to the confirmation trigger (mirrors
  -- src/lib/meta-whatsapp-templates.js buildTemplateMessage).
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
  -- Welcome delivery must never break a profile write.
  return new;
end; $$;

drop trigger if exists on_profile_ready_enqueue_welcome on public.profiles;
create trigger on_profile_ready_enqueue_welcome
  after insert or update of whatsapp_consent, phone on public.profiles
  for each row execute function public.enqueue_registration_welcome_on_profile_ready();
