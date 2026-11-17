import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.NODE_ENV = 'test';

import {
  buildCustomerRegistrationReceived,
  buildProfessionalRegistrationReceived,
} from '../src/lib/meta-whatsapp-templates.js';
import { validateRecipient } from '../src/lib/meta-whatsapp-validate.js';

const sql = readFileSync(
  new URL('../supabase/registration_welcome_outbox.sql', import.meta.url),
  'utf8'
);

// The draft migration's enqueue trigger inserts rows whose payload is built
// in SQL; this simulates that SQL logic exactly so it can be compared with
// the reviewed JS builders.
function simulateSqlEnqueue(profile) {
  if (profile.whatsapp_consent !== true) return null;
  if (!profile.phone || !profile.phone.trim()) return null;
  const isPro = profile.role === 'professional';
  const name =
    profile.full_name && profile.full_name.trim()
      ? profile.full_name.trim()
      : isPro
        ? 'Professional'
        : 'Customer';
  return {
    template: isPro
      ? 'bmp_professional_registration_received'
      : 'bmp_customer_registration_received',
    payload: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: profile.phone,
      type: 'template',
      template: {
        name: isPro
          ? 'bmp_professional_registration_received'
          : 'bmp_customer_registration_received',
        language: { code: 'en' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: name }] },
        ],
      },
    },
  };
}

test('migration enqueue trigger exists with consent and phone guards', () => {
  assert.match(sql, /create or replace function public\.enqueue_registration_welcome\(\)/);
  assert.match(sql, /new\.whatsapp_consent is not true/);
  assert.match(sql, /new\.phone is null or btrim\(new\.phone\) = ''/);
  assert.match(sql, /create trigger on_profile_created_enqueue_welcome\s+after insert on public\.profiles/);
});

test('migration trigger never breaks signup and dedupes', () => {
  assert.match(sql, /on conflict do nothing/);
  assert.match(sql, /exception when others then/);
});

test('migration uses only the approved registration templates with JS-matching fallbacks', () => {
  assert.match(sql, /v_template := 'bmp_professional_registration_received'/);
  assert.match(sql, /v_template := 'bmp_customer_registration_received'/);
  assert.match(sql, /'Professional'\)/);
  assert.match(sql, /'Customer'\)/);
  assert.doesNotMatch(sql, /bmp_booking_received|bmp_professional_booking_request/);
});

// The SQL trigger stores the raw phone; the dispatcher's validation
// normalises it at send time. So the payload minus `to` must deep-equal the
// builder output minus `to`, and the normalised recipients must match.
function withoutTo(payload) {
  const copy = { ...payload };
  delete copy.to;
  return copy;
}

test('SQL-enqueued customer payload matches the reviewed JS builder after dispatch-time normalisation', () => {
  const row = simulateSqlEnqueue({
    whatsapp_consent: true,
    phone: '99708 97799',
    role: 'customer',
    full_name: 'Soyab',
  });
  const built = buildCustomerRegistrationReceived({
    to: '99708 97799',
    customerName: 'Soyab',
  });
  assert.deepEqual(withoutTo(row.payload), withoutTo(built));
  assert.equal(validateRecipient(row.payload.to).to, built.to);
  assert.equal(row.template, 'bmp_customer_registration_received');
});

test('SQL-enqueued professional payload matches the reviewed JS builder after dispatch-time normalisation', () => {
  const row = simulateSqlEnqueue({
    whatsapp_consent: true,
    phone: '+91 9970897799',
    role: 'professional',
    full_name: ' Ravi Kumar ',
  });
  const built = buildProfessionalRegistrationReceived({
    to: '+91 9970897799',
    professionalName: 'Ravi Kumar',
  });
  assert.deepEqual(withoutTo(row.payload), withoutTo(built));
  assert.equal(validateRecipient(row.payload.to).to, built.to);
  assert.equal(row.template, 'bmp_professional_registration_received');
});

test('enqueue guards: no consent, no phone, empty name fallbacks', () => {
  assert.equal(simulateSqlEnqueue({ whatsapp_consent: false, phone: '9970897799', role: 'customer' }), null);
  assert.equal(simulateSqlEnqueue({ whatsapp_consent: true, phone: '  ', role: 'customer' }), null);
  assert.equal(simulateSqlEnqueue({ whatsapp_consent: true, phone: null, role: 'professional' }), null);
  const fallback = simulateSqlEnqueue({ whatsapp_consent: true, phone: '9970897799', role: 'customer', full_name: '' });
  assert.equal(fallback.payload.template.components[0].parameters[0].text, 'Customer');
});

// Route checks are static: importing a Next.js route module needs the Next
// runtime, which is not available under plain node --test. The dispatch logic
// itself is covered by registration-outbox.test.mjs.
const routeSrc = readFileSync(
  new URL('../src/app/api/notifications/registration-welcome/route.js', import.meta.url),
  'utf8'
);

test('dispatcher route is secret-gated like the reminder route', () => {
  assert.match(routeSrc, /export async function POST/);
  assert.match(routeSrc, /process\.env\.INTERNAL_SECRET/);
  assert.match(routeSrc, /x-internal-secret/);
  assert.match(routeSrc, /401/);
});

test('dispatcher route uses the service role and the reviewed dispatcher', () => {
  assert.match(routeSrc, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(routeSrc, /dispatchRegistrationWelcomeOutbox/);
  assert.match(routeSrc, /@\/lib\/registration-outbox/);
});

test('dispatcher route maps a queue read failure to 503, not a healthy 200', () => {
  assert.match(routeSrc, /result\?\.error/);
  assert.match(routeSrc, /503/);
});
