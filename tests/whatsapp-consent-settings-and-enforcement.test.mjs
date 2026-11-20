import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.NODE_ENV = 'test';

// 20 Nov 2026, owner decision ("Both compulsory", confirmed required-at-signup
// with later withdrawal): pins the three pieces that make the required
// WhatsApp agreement honest:
//   1. AuthModal signup requires the same unticked affirmative agreement.
//   2. Both roles get a Settings control that writes profiles.whatsapp_consent
//      (the fail-closed send gate) - visibly distinct from the
//      notification_prefs.whatsapp topic toggle, which it does NOT touch.
//   3. The required mobile number is enforced at the role destinations
//      (/dashboard, /vendor), not only at the post-OAuth redirect, so direct
//      navigation cannot bypass it. These are client-side destination gates;
//      API routes are not covered (reported as residual scope).

const authModalSrc = readFileSync(new URL('../src/components/AuthModal.jsx', import.meta.url), 'utf8');
const cardSrc = readFileSync(new URL('../src/components/WhatsAppConsentSettings.jsx', import.meta.url), 'utf8');
const dashboardSrc = readFileSync(new URL('../src/app/dashboard/page.jsx', import.meta.url), 'utf8');
const vendorSrc = readFileSync(new URL('../src/app/vendor/page.jsx', import.meta.url), 'utf8');
const authContextSrc = readFileSync(new URL('../src/context/AuthContext.jsx', import.meta.url), 'utf8');

describe('AuthModal signup requires the same agreement', () => {
  test('blocks submit until the box is ticked, with the withdrawal path named', () => {
    assert.match(authModalSrc, /if \(!signupForm\.agreeWhatsApp\)/);
    assert.match(authModalSrc, /Please agree to receive WhatsApp updates from BookMyProfessional to continue/);
  });

  test('the modal checkbox starts unticked and is no longer labelled optional', () => {
    assert.match(authModalSrc, /agreeWhatsApp: false/);
    assert.ok(!authModalSrc.includes('(Optional) Receive booking updates'), 'consent is no longer marked optional');
    assert.match(authModalSrc, /from\s*BookMyProfessional on WhatsApp\.\s*You can turn this off anytime in\s*Settings/);
  });
});

describe('settings WhatsApp agreement control (both roles)', () => {
  test('writes only profiles.whatsapp_consent through the user\'s own session', () => {
    assert.match(cardSrc, /\.from\("profiles"\)\s*\.update\(\{ whatsapp_consent: next \}\)\s*\.eq\("id", user\.id\)/);
    assert.ok(!cardSrc.includes('updateNotificationPrefs'), 'the agreement control must not write topic preferences');
    assert.ok(!cardSrc.includes('getNotificationPrefs'), 'the agreement control must not read topic preferences');
  });

  test('the click is the user\'s own act: state starts from the stored profile value', () => {
    assert.match(cardSrc, /setConsent\(Boolean\(profile \? profile\.whatsapp_consent : user\?\.whatsapp_consent\)\)/);
    assert.match(cardSrc, /onChange=\{\(e\) => updateConsent\(e\.target\.checked\)\}/);
  });

  test('a failed profile read never shows the agreement as off', () => {
    assert.match(cardSrc, /never show "off" on a read failure/);
  });

  test('wording names the business, the withdrawal right, and the distinction from topic prefs', () => {
    assert.match(cardSrc, /WhatsApp messages from BookMyProfessional/);
    assert.match(cardSrc, /turn this off anytime/i);
    assert.match(cardSrc, /separate from the\s*notification topics below/);
  });

  test('rendered in the customer dashboard profile tab and the vendor settings tab', () => {
    assert.match(dashboardSrc, /import WhatsAppConsentSettings from "@\/components\/WhatsAppConsentSettings"/);
    assert.match(dashboardSrc, /<WhatsAppConsentSettings \/>/);
    assert.match(vendorSrc, /import WhatsAppConsentSettings from "@\/components\/WhatsAppConsentSettings"/);
    assert.match(vendorSrc, /<WhatsAppConsentSettings \/>/);
  });
});

describe('withdrawal never re-gates the destinations', () => {
  test('completion marker alone passes the guard; consent appears only as a pass condition, never a blocker', () => {
    for (const src of [dashboardSrc, vendorSrc]) {
      assert.match(src, /Boolean\(user\.onboarding_completed_at\) \|\| \(hasValidPhone && user\.whatsapp_consent\)/);
      assert.ok(!src.includes('if (!user.whatsapp_consent)'), 'no guard may block on consent alone');
    }
  });
});

describe('onboarding enforcement at the destinations', () => {
  test('dashboard sends incomplete customers to finish onboarding', () => {
    assert.match(dashboardSrc, /router\.replace\("\/complete-profile\?next=\/dashboard"\)/);
    assert.match(dashboardSrc, /never sent back, and consent\s*withdrawal never re-gates/);
  });

  test('vendor portal sends incomplete professionals to finish onboarding', () => {
    assert.match(vendorSrc, /router\.replace\("\/complete-profile\?next=\/vendor"\)/);
  });

  test('both guards are honest about their client-side scope', () => {
    assert.match(dashboardSrc, /Client-side gate on the destination/);
    assert.match(vendorSrc, /Client-side gate on the destination/);
  });
});

describe('durable onboarding marker migration (applied before the code ships)', () => {
  const migration = readFileSync(new URL('../supabase/onboarding_completion_marker.sql', import.meta.url), 'utf8');

  test('adds the column idempotently', () => {
    assert.match(migration, /add column if not exists onboarding_completed_at timestamptz/);
  });

  test('grandfathers every account existing at release - the boundary is the release, not a date constant', () => {
    assert.match(migration, /update public\.profiles\s*set onboarding_completed_at = now\(\)\s*where onboarding_completed_at is null/);
    assert.ok(!migration.includes('2026-11-20T00'), 'no arbitrary date cutoff');
  });

  test('the backfill is guarded to run exactly once, so a script re-run cannot grandfather post-release accounts', () => {
    assert.match(migration, /_release_flags/);
    assert.match(migration, /if not exists \(\s*select 1 from public\._release_flags/);
    assert.match(migration, /insert into public\._release_flags \(key\)\s*values \('onboarding_completion_backfill_20261120'\)/);
  });

  test('the bookkeeping table is locked down: RLS enabled, revoked from anon and authenticated', () => {
    assert.match(migration, /alter table public\._release_flags enable row level security/);
    assert.match(migration, /revoke all on public\._release_flags from anon, authenticated/);
  });

  test('the migration is atomic: one transaction wraps everything, so a failure leaves no partial state', () => {
    assert.match(migration, /^begin;/m);
    assert.match(migration, /^commit;/m);
    assert.ok(migration.indexOf('begin;') < migration.indexOf('add column if not exists onboarding_completed_at'));
    assert.ok(migration.lastIndexOf('commit;') > migration.indexOf('create or replace function public.handle_new_user'));
  });

  test('rollback removes only this migration\'s own flag row, never a shared flags table', () => {
    assert.match(migration, /delete from public\._release_flags[\s\S]{0,120}where key = 'onboarding_completion_backfill_20261120'/);
    const rollback = migration.slice(migration.indexOf('ROLLBACK'));
    assert.ok(!/drop table if exists public\._release_flags;/.test(rollback.split('NOTE ON EXISTING DATA')[0]), 'documented rollback must not drop _release_flags as a step');
  });

  test('new email signups are marked complete only with phone AND consent in metadata', () => {
    assert.match(migration, /whatsapp_consent'\)::boolean, false\)\s*and coalesce\(new\.raw_user_meta_data->>'phone', ''\) <> ''\s*then now\(\)/);
  });

  test('the marker is never rewritten on conflict, so completion survives later sign-ins', () => {
    assert.match(migration, /onboarding_completed_at deliberately not touched on conflict/);
  });

  test('documents deploy order, rollback and the self-write security note', () => {
    assert.match(migration, /DEPLOY ORDER/);
    assert.match(migration, /ROLLBACK/);
    assert.match(migration, /SECURITY/);
  });

  test('rollback reverts the app code BEFORE the column is dropped', () => {
    const rollback = migration.slice(migration.indexOf('ROLLBACK'));
    assert.ok(
      rollback.indexOf('Redeploy the PREVIOUS app code first') < rollback.indexOf('drop column if exists onboarding_completed_at'),
      'code revert must be documented before the column drop'
    );
  });
});

describe('the settings copy promise holds: every active send path re-checks consent', () => {
  const welcomeOutbox = readFileSync(new URL('../src/lib/registration-outbox.js', import.meta.url), 'utf8');
  const bookingOutbox = readFileSync(new URL('../src/lib/booking-alert-outbox.js', import.meta.url), 'utf8');
  const whatsappLib = readFileSync(new URL('../src/lib/whatsapp.js', import.meta.url), 'utf8');
  const metaLib = readFileSync(new URL('../src/lib/meta-whatsapp.js', import.meta.url), 'utf8');
  const reminderRoute = readFileSync(new URL('../src/app/api/notifications/whatsapp-reminder/route.js', import.meta.url), 'utf8');

  test('queued welcome re-reads the profile at dispatch and skips on withdrawal', () => {
    assert.match(welcomeOutbox, /Fresh consent check at dispatch/);
    assert.match(welcomeOutbox, /last_error: 'consent_withdrawn'/);
  });

  test('queued booking alerts re-read the profile at dispatch and skip on withdrawal', () => {
    assert.match(bookingOutbox, /consent_withdrawn_or_profile_missing/);
  });

  test('every Brevo sender and the Meta sender gate on hasWhatsAppConsent at send time', () => {
    const gates = whatsappLib.split('hasWhatsAppConsent(profile)').length - 1;
    assert.ok(gates >= 8, `expected the shared gate on every sender, found ${gates}`);
    assert.match(metaLib, /if \(!hasWhatsAppConsent\(profile\)\)/);
  });

  test('the reminder route checks consent at request time', () => {
    assert.match(reminderRoute, /customerProfile\?\.whatsapp_consent && customerProfile\?\.phone/);
    assert.match(reminderRoute, /proProfile\?\.whatsapp_consent && proProfile\?\.phone/);
  });
});

describe('auth context carries the durable completion marker', () => {
  test('mapUser exposes onboarding_completed_at from the profile', () => {
    assert.match(authContextSrc, /onboarding_completed_at: profile\?\.onboarding_completed_at \|\| null/);
  });
});
