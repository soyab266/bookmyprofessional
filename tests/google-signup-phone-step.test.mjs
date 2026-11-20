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

  test('no editable URL marker carries authority: requirement comes from the durable profile state', () => {
    assert.ok(!callbackSrc.includes('signup=1'), 'the callback must not mark signups via URL');
    assert.match(callbackSrc, /never from a URL parameter/);
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

  test('requires a session and never nags completed or legacy-exempt accounts', () => {
    assert.match(clientSrc, /if \(!user\) \{\s*router\.replace\("\/login"\)/);
    assert.match(clientSrc, /if \(!mustComplete\) \{\s*router\.replace\(destination\);/);
    assert.match(clientSrc, /const hasPhone = Boolean\(user\?\.phone\) && cleanPhone\(user\.phone\)\.length === 10;/);
  });

  test('post-save navigation is a full load so guards re-read the saved profile (live loop fix, 20 Nov)', () => {
    // First live Google signup (20 Nov): the save wrote phone + consent +
    // marker correctly, but router.replace evaluated the destination guard
    // against AuthContext's pre-save profile and looped back to this step.
    assert.match(clientSrc, /window\.location\.assign\(destination\);/);
    assert.match(clientSrc, /PRE-SAVE profile[\s\S]*loop straight back/);
    const saveNavBlock = clientSrc.split('Mobile number saved.')[1] || '';
    assert.ok(saveNavBlock.slice(0, 700).includes('window.location.assign(destination);'),
      'the save success path must hard-navigate');
    assert.ok(!saveNavBlock.slice(0, 700).includes('router.replace(destination)'),
      'the save success path must not client-side navigate to the guarded destination');
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

  test('saves the phone through the user\'s own session; consent only from the user\'s own tick', () => {
    // Default payload is the phone only; whatsapp_consent is added solely when
    // the checkbox was ticked by the user - never pre-ticked, never derived.
    assert.match(clientSrc, /const update = \{\s*phone: cleanPhone\(phone\),\s*onboarding_completed_at: new Date\(\)\.toISOString\(\),\s*\};/);
    assert.match(clientSrc, /if \(agreeWhatsApp\) update\.whatsapp_consent = true;/);
    assert.match(clientSrc, /\.from\("profiles"\)\s*\.update\(update\)\s*\.eq\("id", user\.id\)/);
    assert.match(clientSrc, /const \[agreeWhatsApp, setAgreeWhatsApp\] = useState\(false\)/);
  });

  test('no skip path: a valid number is required to continue', () => {
    assert.ok(!clientSrc.includes('Skip for now'), 'mandatory-number step must not offer a skip');
    assert.ok(!clientSrc.includes('You can add it later from your dashboard'), 'no later-add footnote once the number is required');
    assert.match(clientSrc, /A mobile number is required to continue/);
    assert.match(clientSrc, /Save and continue/);
  });

  test('next is sanitized: internal only, no auth-page or self loops', () => {
    assert.match(clientSrc, /!raw\.startsWith\("\/"\) \|\| raw\.startsWith\("\/\/"\)/);
    assert.match(clientSrc, /raw === "\/login" \|\| raw === "\/register" \|\| raw\.startsWith\("\/complete-profile"\)/);
  });
});

describe('required WhatsApp agreement on the phone step (owner decision, 20 Nov 2026)', () => {
  test('consent already on file is untouched: no checkbox, notice only', () => {
    assert.match(clientSrc, /const needsConsent = !user\?\.whatsapp_consent;/);
    assert.match(clientSrc, /\{needsConsent && \(/);
    assert.match(clientSrc, /\{user\.whatsapp_consent && \(/);
  });

  test('incomplete accounts must tick to continue; nothing is pre-ticked', () => {
    assert.match(clientSrc, /const mustComplete = !onboardingComplete && \(needsPhone \|\| needsConsent\);/);
    assert.match(clientSrc, /const consentRequired = mustComplete && needsConsent;/);
    assert.match(clientSrc, /if \(consentRequired && !agreeWhatsApp\)/);
    assert.match(clientSrc, /Please agree to receive WhatsApp updates from BookMyProfessional to continue/);
    assert.match(clientSrc, /const \[agreeWhatsApp, setAgreeWhatsApp\] = useState\(false\)/);
  });

  test('the agreement names the business and the withdrawal path', () => {
    assert.match(clientSrc, /from BookMyProfessional on WhatsApp at this number/);
    assert.match(clientSrc, /turn this off anytime in Settings/);
  });

  test('completion is durable: saving sets the marker once, and only consent comes from the tick', () => {
    assert.match(clientSrc, /onboarding_completed_at: new Date\(\)\.toISOString\(\)/);
    assert.match(clientSrc, /if \(agreeWhatsApp\) update\.whatsapp_consent = true;/);
    assert.ok(!clientSrc.includes('(Optional)'), 'incomplete new signups get no optional branch');
  });

  test('withdrawing consent never re-gates: the marker, not current consent, decides completion', () => {
    assert.match(clientSrc, /const onboardingComplete = Boolean\(user\?\.onboarding_completed_at\);/);
    assert.match(clientSrc, /if \(!mustComplete\) \{\s*router\.replace\(destination\);/);
    assert.ok(!clientSrc.includes('if (!user?.whatsapp_consent) return'), 'no hard gate on consent alone');
  });

  test('already-consented users see the notice, not a duplicate agreement', () => {
    assert.match(clientSrc, /\{user\.whatsapp_consent && \(/);
    assert.match(clientSrc, /\{needsConsent && \(/);
  });

  test('a user who owes only the agreement gets their saved number prefilled, not retyped', () => {
    assert.match(clientSrc, /if \(hasPhone\) setPhone\(\(current\) => current \|\| cleanPhone\(user\.phone\)\);/);
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
