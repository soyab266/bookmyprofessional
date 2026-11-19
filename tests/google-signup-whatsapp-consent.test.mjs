import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.NODE_ENV = 'test';

import { signState, verifyState } from '../src/lib/google-oauth.js';
import {
  buildCustomerRegistrationReceived,
  buildProfessionalRegistrationReceived,
} from '../src/lib/meta-whatsapp-templates.js';
import { validateRecipient } from '../src/lib/meta-whatsapp-validate.js';

// 19 Nov 2026: a Google-signup customer got no registration welcome because
// the Google path never collected WhatsApp consent (and collects no phone).
// This suite pins the fix: consent is captured for BOTH roles on the Google
// path, carried through the signed OAuth state, stored on the profile, and
// the profile-ready trigger queues the welcome once a confirmed in-pilot
// account has consent + phone.

const registerClientSrc = readFileSync(
  new URL('../src/app/register/RegisterClient.jsx', import.meta.url),
  'utf8'
);
const authContextSrc = readFileSync(
  new URL('../src/context/AuthContext.jsx', import.meta.url),
  'utf8'
);
const googleStartSrc = readFileSync(
  new URL('../src/app/api/auth/google/route.js', import.meta.url),
  'utf8'
);
const googleCallbackSrc = readFileSync(
  new URL('../src/app/api/auth/google/callback/route.js', import.meta.url),
  'utf8'
);
const sql = readFileSync(
  new URL('../supabase/registration_welcome_profile_ready.sql', import.meta.url),
  'utf8'
);

describe('register page collects the opt-in for the Google path', () => {
  test('passes the shared agreeWhatsApp state into social auth', () => {
    assert.match(registerClientSrc, /loginWithProvider\(provider\.toLowerCase\(\), \{ role: authRole, next: target, whatsappConsent: form\.agreeWhatsApp \}\)/);
  });

  test('shows the opt-in checkbox under the Google button, bound to the same state', () => {
    const googleBtn = registerClientSrc.indexOf('Continue with Google');
    assert.ok(googleBtn > -1, 'Google button must exist');
    const after = registerClientSrc.slice(googleBtn);
    assert.match(after, /checked=\{form\.agreeWhatsApp\}/);
    assert.match(after, /applies when you continue with Google/);
  });
});

describe('consent is carried through the OAuth start route and signed state', () => {
  test('AuthContext forwards wa=1 only when consent was given', () => {
    assert.match(authContextSrc, /if \(options\.whatsappConsent === true\) \{\s*targetUrl\.searchParams\.set\("wa", "1"\);/);
  });

  test('start route reads wa and signs it into the state payload', () => {
    assert.match(googleStartSrc, /searchParams\.get\('wa'\) === '1'/);
    assert.match(googleStartSrc, /whatsapp_consent: whatsappConsent/);
  });

  test('state round-trips the consent flag for both roles', () => {
    for (const role of ['customer', 'professional']) {
      const token = signState({ role, next: '/x', nonce: 'n', whatsapp_consent: true, iat: Date.now() });
      const decoded = verifyState(token);
      assert.equal(decoded.role, role);
      assert.equal(decoded.whatsapp_consent, true);
    }
  });

  test('a state without the flag verifies to no consent', () => {
    const token = signState({ role: 'customer', next: '/x', nonce: 'n', iat: Date.now() });
    const decoded = verifyState(token);
    assert.equal(decoded.whatsapp_consent, undefined);
  });
});

describe('callback stores consent for new accounts and preserves existing users exactly', () => {
  test('reads consent strictly from the verified state', () => {
    assert.match(googleCallbackSrc, /stateData\.whatsapp_consent === true/);
  });

  test('passes consent into generateLink metadata ONLY for brand-new accounts', () => {
    // Existing users: no whatsapp_consent in the metadata at all, so a later
    // Google sign-in can never grant (or clear) consent for them here.
    assert.match(googleCallbackSrc, /\.\.\.\(existingProfile \? \{\} : \{ whatsapp_consent: whatsappConsent \}\),/);
  });

  test('profile upsert preserves an existing user consent exactly; only new profiles take the tick', () => {
    assert.match(googleCallbackSrc, /whatsapp_consent: existingProfile \? existingProfile\.whatsapp_consent : whatsappConsent/);
    assert.doesNotMatch(googleCallbackSrc, /Boolean\(existingProfile\?\.whatsapp_consent\) \|\| whatsappConsent/);
  });
});

// Simulate the callback upsert consent decision for both account kinds.
function callbackConsent(existingProfile, ticked) {
  const whatsappConsent = ticked === true;
  return existingProfile ? existingProfile.whatsapp_consent : whatsappConsent;
}

test('existing users never gain or lose consent via a later Google sign-in', () => {
  assert.equal(callbackConsent({ whatsapp_consent: true }, false), true, 'prior true survives unticked sign-in');
  assert.equal(callbackConsent({ whatsapp_consent: false }, true), false, 'ticked box does NOT grant consent to an existing user');
  assert.equal(callbackConsent({ whatsapp_consent: null }, true), null, 'null preserved exactly');
  assert.equal(callbackConsent(null, true), true, 'new account with tick gets consent');
  assert.equal(callbackConsent(null, false), false, 'new account without tick stays false');
});

// Mirrors the SQL logic of enqueue_registration_welcome_on_profile_ready()
// exactly, so queued payloads can be compared with the reviewed JS builders.
function simulateProfileReadyEnqueue(profile, { confirmed = true, inPilot = true, existingRow = false, createdAfterInstall = true } = {}) {
  if (profile.whatsapp_consent !== true) return null;
  if (!profile.phone || !profile.phone.trim()) return null;
  if (!confirmed || !inPilot) return null;
  if (!createdAfterInstall) return null; // rollout cutoff: future registrations only
  const isPro = profile.role === 'professional';
  const template = isPro
    ? 'bmp_professional_registration_received'
    : 'bmp_customer_registration_received';
  if (existingRow) return null;
  const name =
    profile.full_name && profile.full_name.trim()
      ? profile.full_name.trim()
      : isPro
        ? 'Professional'
        : 'Customer';
  return {
    template,
    payload: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: profile.phone,
      type: 'template',
      template: {
        name: template,
        language: { code: 'en' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: name }] },
        ],
      },
    },
  };
}

function withoutTo(payload) {
  const copy = { ...payload };
  delete copy.to;
  return copy;
}

describe('profile-ready trigger migration', () => {
  test('fires only on consent/phone changes on profiles', () => {
    assert.match(sql, /create or replace function public\.enqueue_registration_welcome_on_profile_ready\(\)/);
    assert.match(sql, /after insert or update of whatsapp_consent, phone on public\.profiles/);
  });

  test('keeps the option-1 rule: confirmed email and in-pilot accounts only', () => {
    assert.match(sql, /email_confirmed_at/);
    assert.match(sql, /v_confirmed_at is null/);
    assert.match(sql, /now\(\) < expires_at/);
    assert.match(sql, /v_user_created_at >= armed_at/);
  });

  test('rollout cutoff: persisted at install, never slides on rerun, fail-closed without it', () => {
    assert.match(sql, /create table if not exists public\.registration_welcome_rollout/);
    assert.match(sql, /insert into public\.registration_welcome_rollout \(key, applied_at\)\s*values \('profile_ready_trigger', now\(\)\)\s*on conflict \(key\) do nothing/);
    assert.match(sql, /v_user_created_at >= v_rollout_cutoff/);
    assert.match(sql, /drop table if exists public\.registration_welcome_rollout/);
  });

  test('one welcome per account ever, never breaks profile writes', () => {
    assert.match(sql, /user_id = new\.id and template = v_template/);
    assert.match(sql, /on conflict do nothing/);
    assert.match(sql, /exception when others then/);
  });

  test('uses only the approved registration templates for both roles', () => {
    assert.match(sql, /v_template := 'bmp_professional_registration_received'/);
    assert.match(sql, /v_template := 'bmp_customer_registration_received'/);
    assert.doesNotMatch(sql, /bmp_booking_received|bmp_professional_booking_request/);
  });

  test('customer payload matches the reviewed JS builder', () => {
    const row = simulateProfileReadyEnqueue({ whatsapp_consent: true, phone: '7000558792', role: 'customer', full_name: 'Shanee' });
    const built = buildCustomerRegistrationReceived({ to: '7000558792', customerName: 'Shanee' });
    assert.deepEqual(withoutTo(row.payload), withoutTo(built));
    assert.equal(validateRecipient(row.payload.to).to, built.to);
    assert.equal(row.template, 'bmp_customer_registration_received');
  });

  test('professional payload matches the reviewed JS builder', () => {
    const row = simulateProfileReadyEnqueue({ whatsapp_consent: true, phone: '+91 9970897799', role: 'professional', full_name: ' Ravi Kumar ' });
    const built = buildProfessionalRegistrationReceived({ to: '+91 9970897799', professionalName: 'Ravi Kumar' });
    assert.deepEqual(withoutTo(row.payload), withoutTo(built));
    assert.equal(validateRecipient(row.payload.to).to, built.to);
    assert.equal(row.template, 'bmp_professional_registration_received');
  });

  test('rollout cutoff excludes accounts created before install, even with consent+phone', () => {
    assert.equal(simulateProfileReadyEnqueue({ whatsapp_consent: true, phone: '7000558792', role: 'customer', full_name: 'Shanee' }, { createdAfterInstall: false }), null);
    assert.equal(simulateProfileReadyEnqueue({ whatsapp_consent: true, phone: '7000558792', role: 'customer', full_name: 'Shanee' }, { createdAfterInstall: true })?.template, 'bmp_customer_registration_received');
  });

  test('guards: no consent, no phone, unconfirmed, outside pilot, already welcomed', () => {
    assert.equal(simulateProfileReadyEnqueue({ whatsapp_consent: false, phone: '9970897799', role: 'customer' }), null);
    assert.equal(simulateProfileReadyEnqueue({ whatsapp_consent: true, phone: ' ', role: 'professional' }), null);
    assert.equal(simulateProfileReadyEnqueue({ whatsapp_consent: true, phone: '9970897799', role: 'customer' }, { confirmed: false }), null);
    assert.equal(simulateProfileReadyEnqueue({ whatsapp_consent: true, phone: '9970897799', role: 'customer' }, { inPilot: false }), null);
    assert.equal(simulateProfileReadyEnqueue({ whatsapp_consent: true, phone: '9970897799', role: 'professional' }, { existingRow: true }), null);
  });
});
