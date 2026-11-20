-- Onboarding completion marker (owner decision, 20 Nov 2026):
-- required mobile number + required unticked WhatsApp agreement for NEW
-- signups, with later withdrawal in Settings. Existing accounts are never
-- forced retroactively.
--
-- WHAT THIS DOES
-- 1. Adds profiles.onboarding_completed_at (timestamptz, nullable). It is set
--    exactly once, when onboarding completes, and is NEVER cleared - in
--    particular, withdrawing WhatsApp consent in Settings does not clear it,
--    so a withdrawn user is never gated back through signup.
-- 2. One-time backfill, guarded so it can never run a second time: every
--    profile row that exists when this migration is applied is marked
--    complete. The boundary between "legacy, untouched" and "new, must
--    complete onboarding" is the release itself, not an arbitrary date
--    constant: anyone with an account at release keeps today's behavior.
-- 3. handle_new_user() marks NEW email/password signups complete at creation
--    when the signup metadata already carries a phone number AND
--    whatsapp_consent=true (the register form and AuthModal require both).
--    Google signups arrive with no phone, stay NULL, and are marked complete
--    by the /complete-profile step after their required tick + number save.
--
-- ONE-TIME BACKFILL GUARD (load-bearing): the backfill must never mark
-- accounts created AFTER this release as complete. A bare
-- "where onboarding_completed_at is null" would do exactly that if this
-- script were ever re-run (dashboard SQL Editor runs do not track applied
-- migrations). The _release_flags bookkeeping row below makes the backfill
-- physically one-time: re-running this script re-adds the column (no-op) and
-- re-replaces the function (same definition), but skips the backfill.
--
-- DEPLOY ORDER (load-bearing): run THIS migration BEFORE deploying the app
-- code that reads the column. If the code ships first, pre-release accounts
-- (marker NULL) would be treated as incomplete and redirected into the
-- required-agreement step - exactly the retroactive forcing this design
-- exists to avoid.
--
-- GAP BETWEEN MIGRATION AND CODE DEPLOY: safe in this direction. While the
-- old app code runs against the migrated schema, it ignores the new column
-- entirely, so no account's behavior changes. New email signups created in
-- the gap get their marker set by the new trigger (harmless; the old code
-- never reads it, and it is the value the new code will want). New Google
-- signups in the gap stay NULL and are simply not gated until the code
-- deploys - a short, acceptable relaxation, never a false forcing. A signup
-- landing in the milliseconds between the backfill statement and the trigger
-- replacement keeps a NULL marker, but email signups carry phone + consent,
-- so the app-side fallback condition (valid phone AND consent) still treats
-- them as complete; no account is wrongly gated by the race.
--
-- TRIGGER vs WITHDRAWAL: handle_new_user fires on auth.users INSERT only.
-- Its ON CONFLICT path deliberately never touches onboarding_completed_at,
-- and the Settings card writes only whatsapp_consent - so completion, once
-- recorded, survives re-sign-ins, metadata refreshes, and consent withdrawal.
--
-- SECURITY: the column is writable by the row owner under the existing
-- profiles RLS self-update policy, same as phone today. A user who sets it
-- themselves only skips their own required-number step; their
-- whatsapp_consent stays fail-closed false, so no WhatsApp can be sent to
-- them (every send path re-checks consent at send time). handle_new_user
-- remains security definer with the same exception fallback as before; only
-- the column list and this one value change. _release_flags is RLS-enabled
-- with no policies and revoked from anon/authenticated: only the service
-- role / SQL Editor (postgres) can read or write it.
--
-- ROLLBACK (in this order):
--   1. Redeploy the PREVIOUS app code first, so no running client consults
--      the marker. (The new code reads profiles via select('*'), so dropping
--      the column would not throw - but under the new code a missing marker
--      silently re-gates marker-dependent users, which is why the code
--      reverts first.)
--   2. Re-apply the previous handle_new_user() definition from
--      supabase/schema.sql.
--   3. alter table public.profiles drop column if exists onboarding_completed_at;
--   4. delete from public._release_flags
--      where key = 'onboarding_completion_backfill_20261120';
--      (NOT drop table: _release_flags may hold unrelated future flags; only
--      this migration's own row is removed. Drop the table only if a live
--      preflight confirms it holds no other keys.)
-- The backfilled timestamps are discarded with the column; that is harmless
-- pre-release. The migration is additive and non-destructive up to step 3.
--
-- NOTE ON EXISTING DATA: this migration WRITES a new value (the marker) onto
-- every existing profiles row. It changes no pre-existing column (phone,
-- consent, role, etc. are untouched) and changes no account's behavior.
--
-- ATOMICITY: the whole script runs inside one transaction. Any error aborts
-- everything - no partial state (column without backfill, flags table
-- without lockdown, new trigger without marker) can persist.
--
-- KNOWN PRE-EXISTING ISSUE (logged, deliberately NOT fixed in this release):
-- the handle_new_user conflict arm coalesces excluded.whatsapp_consent over
-- the stored value, and its values clause coalesces missing metadata to
-- false, so a conflict event with consentless metadata would overwrite a
-- stored consent=true with false. This is byte-identical to the current
-- production function and narrow (the arm only fires on an auth.users INSERT
-- that finds an existing profile). A consent timestamp/source column plus a
-- conflict-arm fix is recommended as a separate future migration.

begin;

alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz;

-- Bookkeeping for one-time operations. Not part of the app schema; no app
-- code reads it.
create table if not exists public._release_flags (
  key text primary key,
  applied_at timestamptz not null default now()
);
alter table public._release_flags enable row level security;

-- Grandfather every account that exists at release time. Guarded to run
-- exactly once, even if this whole script is re-executed later.
do $$
begin
  if not exists (
    select 1 from public._release_flags
    where key = 'onboarding_completion_backfill_20261120'
  ) then
    update public.profiles
    set onboarding_completed_at = now()
    where onboarding_completed_at is null;
    insert into public._release_flags (key)
    values ('onboarding_completion_backfill_20261120');
  end if;
end $$;

-- Lockdown inside the same transaction: with begin/commit wrapping, the
-- backfill and the permission lockdown commit together or not at all.
-- Supabase projects always have the anon and authenticated roles.
revoke all on public._release_flags from anon, authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, phone, city, whatsapp_consent, onboarding_completed_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'customer'),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'city',
    coalesce((new.raw_user_meta_data->>'whatsapp_consent')::boolean, false),
    -- Email/password signup completed phone + required consent inside the
    -- form, so their onboarding is done at creation. Google signups carry no
    -- phone here and stay NULL until the phone step completes.
    case
      when coalesce((new.raw_user_meta_data->>'whatsapp_consent')::boolean, false)
           and coalesce(new.raw_user_meta_data->>'phone', '') <> ''
      then now()
      else null
    end
  )
  on conflict (id) do update set
    whatsapp_consent = coalesce(excluded.whatsapp_consent, public.profiles.whatsapp_consent);
    -- onboarding_completed_at deliberately not touched on conflict: an
    -- existing row keeps its completion state exactly as-is.
  return new;
exception when others then
  -- Fallback to essential columns so user registration never fails
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'customer')
  )
  on conflict (id) do nothing;
  return new;
end; $$;

commit;
