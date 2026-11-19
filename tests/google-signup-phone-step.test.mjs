import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.NODE_ENV = 'test';

import { cleanPhone, isValidIndianPhone } from '../src/lib/phone.js';

// 20 Nov 2026: the first live Google signup after the consent fix stored
// whatsapp_consent correctly, but no welcome could queue because Google
// does not share a mobile number and the profile had none. Owner decision
// (20 Nov, WhatsApp): ask new Google users for their number immediately
// after signing in, for both roles, instead of leaving them to find it in
// the dashboard. This suite pins that step: brand-new Google accounts are
// sent to /complete-profile once; existing users never see it; saving the
// number uses the user's own session (same path as the dashboard profile
// form) and never touches whatsapp_consent.

const callbackSrc = readFileSync(
  new URL('../src/app/api/auth/google/callback/route.js', import.meta.url),
  'utf8'
);
const pageSrc = readFileSync(
  new URL('../src/app/complete-profile/page.jsx', import.meta.url),
  'utf8'
);
const clientSrc = readFileSync(
  new URL('../src/app/complete-profile/CompleteProfileClient.jsx', import.meta.url),
  'utf8'
);

describe('google callback sends only brand-new accounts to the phone step', () => {
  test('brand-new accounts are redirected to /complete-profile with the original destination', () => {
    assert.match(callbackSrc, /\/complete-profile\?next=\$\{encodeURIComponent\(destination\)\}/);
  });

  test('the phone step applies exactly when there was no existing profile', () => {
    assert.match(callbackSrc, /const finalDestination = existingProfile\s*\?\s*destination\s*:\s*`\/complete-profile\?next=/);
  });

  test('existing users keep the previous destination behavior verbatim', () => {
    assert.match(callbackSrc, /const destination = \(targetNext && targetNext !== '\/' && targetNext !== '\/login' && targetNext !== '\/register'\)/);
    assert.match(callbackSrc, /resolvedRole === 'professional' \? '\/vendor' : '\/dashboard'/);
  });

  test('consent storage semantics are untouched by this change', () => {
    assert.match(callbackSrc, /\.\.\.\(existingProfile \? \{\} : \{ whatsapp_consent: whatsappConsent \}\)/);
    assert.match(callbackSrc, /whatsapp_consent: existingProfile \? existingProfile\.whatsapp_consent : whatsappConsent/);
  });
});

describe('complete-profile page', () => {
  test('is a noindex force-dynamic auth utility page rendering the client', () => {
    assert.match(pageSrc, /export const dynamic = "force-dynamic"/);
    assert.match(pageSrc, /robots: \{ index: false, follow: true \}/);
    assert.match(pageSrc, /<CompleteProfileClient \/>/);
  });

  test('requires a session and never nags users who already have a number', () => {
    assert.match(clientSrc, /if \(!user\) \{\s*router\.replace\("\/login"\)/);
    assert.match(clientSrc, /user\.phone && cleanPhone\(user\.phone\)\.length === 10/);
  });

  test('explains why the number is asked (Google does not share it)', () => {
    assert.match(clientSrc, /Google does not share your mobile number/);
  });

  test('covers both roles with role-aware copy', () => {
    assert.match(clientSrc, /role === "professional"\s*\?\s*"\/vendor" : "\/dashboard"/);
    assert.match(clientSrc, /role === "professional"[\s\S]*leads, bookings and payouts[\s\S]*about your bookings/);
  });

  test('shows the WhatsApp context only to users who opted in', () => {
    assert.match(clientSrc, /\{user\.whatsapp_consent && \(/);
    assert.match(clientSrc, /opted in to WhatsApp updates during signup/);
  });

  test('never promises WhatsApp dispatch or verification on save', () => {
    assert.ok(!clientSrc.includes('WhatsApp updates start once'), 'must not promise dispatch once a number is saved');
    assert.ok(!clientSrc.includes('this is the number they will come to'), 'must not promise messages will arrive');
    assert.match(clientSrc, /can only reach a saved number/);
    assert.match(clientSrc, /not verification/);
  });

  test('validates with the shared Indian-phone rules before saving', () => {
    assert.match(clientSrc, /import \{ cleanPhone, isValidIndianPhone \} from "@\/lib\/phone"/);
    assert.match(clientSrc, /if \(!isValidIndianPhone\(phone\)\)/);
  });

  test('saves only the phone through the user\'s own session, never consent', () => {
    assert.match(clientSrc, /\.from\("profiles"\)\s*\.update\(\{ phone: cleanPhone\(phone\) \}\)\s*\.eq\("id", user\.id\)/);
    const updateCall = clientSrc.slice(clientSrc.indexOf('.from("profiles")'), clientSrc.indexOf('.eq("id", user.id)'));
    assert.ok(!updateCall.includes('whatsapp_consent'), 'the update must not touch whatsapp_consent');
  });

  test('skip path goes to the same sanitized destination', () => {
    assert.match(clientSrc, /<Link href=\{destination\}[^>]*>\s*Skip for now/);
  });

  test('next is sanitized: internal only, no auth-page or self loops', () => {
    assert.match(clientSrc, /!raw\.startsWith\("\/"\) \|\| raw\.startsWith\("\/\/"\)/);
    assert.match(clientSrc, /raw === "\/login" \|\| raw === "\/register" \|\| raw\.startsWith\("\/complete-profile"\)/);
  });
});

describe('phone validation rules the step relies on', () => {
  test('accepts ordinary 10-digit Indian mobiles', () => {
    assert.equal(isValidIndianPhone('9876543210'), true);
    assert.equal(isValidIndianPhone('+91 98765 43210'), true);
    assert.equal(isValidIndianPhone('09876543210'), true);
  });

  test('rejects short, long and non-mobile numbers', () => {
    assert.equal(isValidIndianPhone('12345'), false);
    assert.equal(isValidIndianPhone('12345678901'), false);
    assert.equal(isValidIndianPhone('4876543210'), false);
    assert.equal(isValidIndianPhone(''), false);
  });

  test('cleanPhone normalises prefixes to the stored 10-digit form', () => {
    assert.equal(cleanPhone('+91 98765 43210'), '9876543210');
    assert.equal(cleanPhone('09876543210'), '9876543210');
  });
});
