import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
// These wiring tests exercise the Meta path, which requires explicit activation.
process.env.META_WHATSAPP_BOOKINGS_ENABLED = 'true';

import { dispatchBookingConfirmedNotifications, bookingWhatsAppProvider } from '../src/lib/booking-notifications.js';

// Recording supabase mock: the Meta connector is the only dispatch step that
// queries the profiles table through the passed-in client, so these calls
// prove the booking flow is wired to it.
function recordingSupabase(profiles, calls) {
  return {
    from(table) {
      if (table !== 'profiles') {
        return {
          select() { return this; },
        };
      }
      return {
        select(cols) {
          calls.push({ table, cols });
          return {
            async in(col, ids) {
              calls.push({ table, col, ids });
              return { data: profiles.filter((p) => ids.includes(p.id)) };
            },
          };
        },
      };
    },
  };
}

const BOOKING = {
  id: `BMP-WIRING-${Date.now()}`,
  customer_id: 'cust-1',
  professional_id: 'pro-1',
  service_title: 'Home Cleaning',
  total_paid: 999,
  date: '2026-11-21',
  time_slot: '3 PM',
  address: 'Flat 1, Test Street, Mumbai',
};

const CUSTOMER = { id: 'cust-1', full_name: 'Soyab', phone: '9970897799', whatsapp_consent: true };
const PRO = { id: 'pro-1', full_name: 'Ravi', phone: '8919328705', whatsapp_consent: true };

test('booking confirmation is wired to the Meta connector (profiles queried for WhatsApp)', async () => {
  const calls = [];
  const booking = { ...BOOKING, id: `${BOOKING.id}-A` };
  const result = await dispatchBookingConfirmedNotifications(booking, recordingSupabase([CUSTOMER, PRO], calls));

  assert.equal(result.success, true);

  // The dispatch itself also queries profiles (for emails), so find the
  // connector's own query: the one that selects the consent fields.
  const select = calls.find((c) => c.cols && c.cols.includes('whatsapp_consent'));
  assert.ok(select, 'the Meta connector queried profiles with consent fields');
  assert.ok(select.cols.includes('phone'), 'phone column selected');

  // ...for both booking parties
  const lookup = calls.find((c) => c.col === 'id' && c.ids.includes('cust-1') && c.ids.includes('pro-1'));
  assert.ok(lookup, 'both booking parties were looked up');
});

test('booking confirmation dedupe still applies with the Meta wiring', async () => {
  const calls = [];
  const booking = { ...BOOKING, id: `${BOOKING.id}-B` };
  const sb = recordingSupabase([CUSTOMER, PRO], calls);

  const first = await dispatchBookingConfirmedNotifications(booking, sb);
  assert.equal(first.success, true);
  assert.equal(first.deduplicated, undefined);

  const second = await dispatchBookingConfirmedNotifications(booking, sb);
  assert.equal(second.success, true);
  assert.equal(second.deduplicated, true);
});

test('booking confirmation tolerates a missing supabase client', async () => {
  const booking = { ...BOOKING, id: `${BOOKING.id}-C` };
  const result = await dispatchBookingConfirmedNotifications(booking, null);
  assert.equal(result.success, true);
});

test('booking confirmation works when the professional is not consenting', async () => {
  const calls = [];
  const booking = { ...BOOKING, id: `${BOOKING.id}-D` };
  const noConsentPro = { ...PRO, whatsapp_consent: false };
  const result = await dispatchBookingConfirmedNotifications(booking, recordingSupabase([CUSTOMER, noConsentPro], calls));
  // Dispatch succeeds overall; the connector internally skips the non-consenting pro.
  assert.equal(result.success, true);
  assert.ok(calls.find((c) => c.cols && c.cols.includes('whatsapp_consent')), 'profiles were still queried');
});

test('bookingWhatsAppProvider keeps the existing Brevo provider by default', () => {
  assert.equal(bookingWhatsAppProvider({}), 'brevo');
  assert.equal(bookingWhatsAppProvider({ META_WHATSAPP_BOOKINGS_ENABLED: 'false' }), 'brevo');
  assert.equal(bookingWhatsAppProvider({ META_WHATSAPP_BOOKINGS_ENABLED: '1' }), 'brevo');
});

test('bookingWhatsAppProvider selects Meta only on exact explicit enablement', () => {
  assert.equal(bookingWhatsAppProvider({ META_WHATSAPP_BOOKINGS_ENABLED: 'true' }), 'meta');
});

test('dispatch consults the provider gate (source-level)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/lib/booking-notifications.js', import.meta.url), 'utf8');
  assert.match(src, /bookingWhatsAppProvider\(\) === 'meta'/);
  assert.match(src, /notifyBookingConfirmed\(booking, supabase\)/, 'existing provider preserved as the default call');
});

test('failed Meta booking sends are queued for dispatcher retry', async () => {
  const savedEnv = { ...process.env };
  const inserted = [];
  let fetchCalls = 0;
  const fetchMock = async () => { fetchCalls++; return { ok: false, status: 500, text: async () => 'server error' }; };
  try {
    delete process.env.NODE_ENV;
    delete process.env.META_WHATSAPP_SIMULATE;
    process.env.META_WHATSAPP_ACCESS_TOKEN = 'test-token';
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = '1448961308297408';
    const profiles = [CUSTOMER, PRO];
    const sb = {
      from(table) {
        if (table === 'notification_outbox') {
          return { async insert(record) { inserted.push(record); return { data: [record], error: null }; } };
        }
        return { select() { return { async in(col, ids) { return { data: profiles.filter((p) => ids.includes(p.id)) }; } }; } };
      },
    };
    const booking = { ...BOOKING, id: `${BOOKING.id}-Q` };
    const result = await dispatchBookingConfirmedNotifications(booking, sb, { fetchImpl: fetchMock });
    assert.equal(result.success, true, 'booking flow itself still succeeds');
    assert.equal(fetchCalls, 2, 'both parties: a single attempt each, no automatic resend of an ambiguous outcome');
    assert.equal(inserted.length, 2, 'both failed sends recorded');
    const byUser = Object.fromEntries(inserted.map((r) => [r.user_id, r]));
    assert.equal(byUser['cust-1'].template, 'bmp_booking_received');
    assert.equal(byUser['pro-1'].template, 'bmp_professional_booking_request');
    assert.equal(byUser['cust-1'].status, 'uncertain', 'answered 5xx: held for reconciliation, never auto-resent');
    assert.equal(byUser['cust-1'].channel, 'whatsapp');
    assert.equal(byUser['cust-1'].payload.template.name, 'bmp_booking_received', 'exact payload preserved for retry');
  } finally {
    process.env = savedEnv;
  }
});

test('simulated Meta booking sends are NOT queued for retry', async () => {
  const inserted = [];
  const profiles = [CUSTOMER, PRO];
  const sb = {
    from(table) {
      if (table === 'notification_outbox') {
        return { async insert(record) { inserted.push(record); return { data: [record], error: null }; } };
      }
      return { select() { return { async in(col, ids) { return { data: profiles.filter((p) => ids.includes(p.id)) }; } }; } };
    },
  };
  const booking = { ...BOOKING, id: `${BOOKING.id}-SIM` };
  await dispatchBookingConfirmedNotifications(booking, sb);
  assert.equal(inserted.length, 0, 'simulated sends are not failures');
});
