import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

import {
  sendMetaTemplateMessage,
  notifyBookingConfirmedMeta,
  sendRegistrationWelcomeMeta,
} from '../src/lib/meta-whatsapp.js';
import { buildCustomerRegistrationReceived } from '../src/lib/meta-whatsapp-templates.js';

const BOOKING = {
  id: 'BMP-90001',
  customer_id: 'cust-1',
  professional_id: 'pro-1',
  service_title: 'Home Cleaning',
  date: '2026-11-20',
  time_slot: '3 PM',
};

function mockSupabase(profiles) {
  return {
    from(table) {
      assert.equal(table, 'profiles');
      return {
        select(cols) {
          assert.ok(cols.includes('whatsapp_consent'));
          return {
            async in(col, ids) {
              assert.equal(col, 'id');
              return { data: profiles.filter((p) => ids.includes(p.id)) };
            },
          };
        },
      };
    },
  };
}

const CUSTOMER = { id: 'cust-1', full_name: 'Soyab', phone: '9970897799', whatsapp_consent: true };
const PRO = { id: 'pro-1', full_name: 'Ravi', phone: '8919328705', whatsapp_consent: true };

test('sendMetaTemplateMessage simulates a successful send in test mode', async () => {
  const payload = buildCustomerRegistrationReceived({ to: '919970897799', customerName: 'Soyab' });
  const result = await sendMetaTemplateMessage(payload);
  assert.deepEqual(result, { success: true, simulated: true });
});

test('sendMetaTemplateMessage refuses an invalid payload without sending', async () => {
  const result = await sendMetaTemplateMessage({ messaging_product: 'sms' });
  assert.equal(result.success, false);
  assert.match(result.error, /^validation_failed:/);
});

test('sendMetaTemplateMessage skips when credentials are missing (non-test)', async () => {
  const savedEnv = { ...process.env };
  try {
    delete process.env.NODE_ENV;
    delete process.env.META_WHATSAPP_SIMULATE;
    delete process.env.META_WHATSAPP_ACCESS_TOKEN;
    delete process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    const payload = buildCustomerRegistrationReceived({ to: '919970897799', customerName: 'Soyab' });
    const result = await sendMetaTemplateMessage(payload);
    assert.deepEqual(result, { success: false, skipped: 'missing_credentials' });
  } finally {
    process.env = savedEnv;
  }
});

test('sendMetaTemplateMessage posts the sanitised payload to the Graph API', async () => {
  const savedEnv = { ...process.env };
  const calls = [];
  const fetchMock = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.TEST123' }] }),
      text: async () => '',
    };
  };
  try {
    delete process.env.NODE_ENV;
    delete process.env.META_WHATSAPP_SIMULATE;
    process.env.META_WHATSAPP_ACCESS_TOKEN = 'test-token';
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = '1448961308297408';
    const payload = buildCustomerRegistrationReceived({ to: '+91 99708 97799', customerName: 'Soyab\nShekh' });
    const result = await sendMetaTemplateMessage(payload, { fetchImpl: fetchMock });
    assert.equal(result.success, true);
    assert.equal(result.metaMessageId, 'wamid.TEST123');

    assert.equal(calls.length, 1);
    const { url, opts } = calls[0];
    assert.equal(url, 'https://graph.facebook.com/v21.0/1448961308297408/messages');
    assert.equal(opts.method, 'POST');
    assert.equal(opts.headers.Authorization, 'Bearer test-token');
    const sentBody = JSON.parse(opts.body);
    assert.equal(sentBody.to, '919970897799');
    // newline was sanitised before sending
    assert.equal(sentBody.template.components[0].parameters[0].text, 'Soyab Shekh');
  } finally {
    process.env = savedEnv;
  }
});

test('sendMetaTemplateMessage reports an API error without throwing', async () => {
  const savedEnv = { ...process.env };
  const fetchMock = async () => ({ ok: false, status: 400, text: async () => 'bad request' });
  try {
    delete process.env.NODE_ENV;
    process.env.META_WHATSAPP_ACCESS_TOKEN = 'test-token';
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = '1448961308297408';
    const payload = buildCustomerRegistrationReceived({ to: '919970897799', customerName: 'Soyab' });
    const result = await sendMetaTemplateMessage(payload, { fetchImpl: fetchMock });
    assert.deepEqual(result, { success: false, status: 400, error: 'bad request' });
  } finally {
    process.env = savedEnv;
  }
});

test('sendMetaTemplateMessage reports a network failure without throwing', async () => {
  const savedEnv = { ...process.env };
  const fetchMock = async () => { throw new Error('socket hang up'); };
  try {
    delete process.env.NODE_ENV;
    process.env.META_WHATSAPP_ACCESS_TOKEN = 'test-token';
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = '1448961308297408';
    const payload = buildCustomerRegistrationReceived({ to: '919970897799', customerName: 'Soyab' });
    const result = await sendMetaTemplateMessage(payload, { fetchImpl: fetchMock });
    assert.equal(result.success, false);
    assert.equal(result.error, 'socket hang up');
  } finally {
    process.env = savedEnv;
  }
});

test('notifyBookingConfirmedMeta sends to both consenting parties', async () => {
  const result = await notifyBookingConfirmedMeta(BOOKING, mockSupabase([CUSTOMER, PRO]));
  assert.equal(result.customer.accepted, true);
  assert.equal(result.customer.result.simulated, true);
  assert.equal(result.professional.accepted, true);
});

test('notifyBookingConfirmedMeta skips a party without consent', async () => {
  const noConsent = { ...CUSTOMER, whatsapp_consent: false };
  const result = await notifyBookingConfirmedMeta(BOOKING, mockSupabase([noConsent, PRO]));
  assert.deepEqual(result.customer, { accepted: false, reason: 'no_consent_or_phone' });
  assert.equal(result.professional.accepted, true);
});

test('notifyBookingConfirmedMeta skips a party without a phone number', async () => {
  const noPhone = { ...CUSTOMER, phone: '' };
  const result = await notifyBookingConfirmedMeta(BOOKING, mockSupabase([noPhone, PRO]));
  assert.deepEqual(result.customer, { accepted: false, reason: 'no_consent_or_phone' });
});

test('notifyBookingConfirmedMeta reports a missing profile', async () => {
  const result = await notifyBookingConfirmedMeta(BOOKING, mockSupabase([PRO]));
  assert.deepEqual(result.customer, { accepted: false, reason: 'profile_not_found' });
  assert.equal(result.professional.accepted, true);
});

test('notifyBookingConfirmedMeta tolerates a broken supabase client', async () => {
  const result = await notifyBookingConfirmedMeta(BOOKING, { from: () => null });
  assert.deepEqual(result.customer, { accepted: false, reason: 'profile_not_found' });
  assert.deepEqual(result.professional, { accepted: false, reason: 'profile_not_found' });
});

test('notifyBookingConfirmedMeta handles null inputs', async () => {
  assert.deepEqual(await notifyBookingConfirmedMeta(null, mockSupabase([])), { customer: null, professional: null });
  assert.deepEqual(await notifyBookingConfirmedMeta(BOOKING, null), { customer: null, professional: null });
});

test('sendRegistrationWelcomeMeta picks the customer template', async () => {
  const result = await sendRegistrationWelcomeMeta({ ...CUSTOMER, role: 'customer' });
  assert.equal(result.accepted, true);
  assert.equal(result.result.simulated, true);
});

test('sendRegistrationWelcomeMeta picks the professional template', async () => {
  const result = await sendRegistrationWelcomeMeta({ ...PRO, role: 'professional' });
  assert.equal(result.accepted, true);
});

test('sendRegistrationWelcomeMeta requires consent', async () => {
  const result = await sendRegistrationWelcomeMeta({ ...CUSTOMER, role: 'customer', whatsapp_consent: false });
  assert.deepEqual(result, { accepted: false, reason: 'no_consent_or_phone' });
});

test('notifyBookingConfirmedMeta does not retry an answered 5xx (acceptance uncertain)', async () => {
  const savedEnv = { ...process.env };
  let calls = 0;
  const fetchMock = async () => {
    calls++;
    return { ok: false, status: 500, text: async () => 'server error' };
  };
  try {
    delete process.env.NODE_ENV;
    delete process.env.META_WHATSAPP_SIMULATE;
    process.env.META_WHATSAPP_ACCESS_TOKEN = 'test-token';
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = '1448961308297408';
    const profile = { id: 'cust-1', full_name: 'Soyab', phone: '9970897799', whatsapp_consent: true };
    const sb = { from: () => ({ select: () => ({ in: async () => ({ data: [profile] }) }) }) };
    const booking = { id: 'BMP-RETRY-1', customer_id: 'cust-1', professional_id: 'pro-none', service_title: 'Home Cleaning', total_paid: 999, date: '2026-11-21', time_slot: '3 PM', address: 'Flat 1, Mumbai' };
    const result = await notifyBookingConfirmedMeta(booking, sb, { fetchImpl: fetchMock });
    assert.equal(result.customer.accepted, false);
    assert.equal(calls, 1, 'Meta answered 5xx: acceptance is uncertain, so no automatic resend - the caller holds it for reconciliation');
  } finally {
    process.env = savedEnv;
  }
});

test('notifyBookingConfirmedMeta does not retry permanent failures', async () => {
  const savedEnv = { ...process.env };
  let calls = 0;
  const fetchMock = async () => { calls++; return { ok: false, status: 400, text: async () => 'bad request' }; };
  try {
    delete process.env.NODE_ENV;
    delete process.env.META_WHATSAPP_SIMULATE;
    process.env.META_WHATSAPP_ACCESS_TOKEN = 'test-token';
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = '1448961308297408';
    const profile = { id: 'cust-1', full_name: 'Soyab', phone: '9970897799', whatsapp_consent: true };
    const sb = { from: () => ({ select: () => ({ in: async () => ({ data: [profile] }) }) }) };
    const booking = { id: 'BMP-NORETRY-1', customer_id: 'cust-1', professional_id: 'pro-none', service_title: 'Home Cleaning', total_paid: 999, date: '2026-11-21', time_slot: '3 PM', address: 'Flat 1, Mumbai' };
    const result = await notifyBookingConfirmedMeta(booking, sb, { fetchImpl: fetchMock });
    assert.equal(result.customer.accepted, false);
    assert.equal(result.customer.result.status, 400);
    assert.equal(calls, 1, 'a Meta 4xx is permanent: no retry');
  } finally {
    process.env = savedEnv;
  }
});

test('notifyBookingConfirmedMeta does not retry network errors with no response (ambiguous outcome)', async () => {
  const savedEnv = { ...process.env };
  let calls = 0;
  const fetchMock = async () => { calls++; throw new Error('socket hang up'); };
  try {
    delete process.env.NODE_ENV;
    delete process.env.META_WHATSAPP_SIMULATE;
    process.env.META_WHATSAPP_ACCESS_TOKEN = 'test-token';
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = '1448961308297408';
    const profile = { id: 'cust-1', full_name: 'Soyab', phone: '9970897799', whatsapp_consent: true };
    const sb = { from: () => ({ select: () => ({ in: async () => ({ data: [profile] }) }) }) };
    const booking = { id: 'BMP-AMBIG-1', customer_id: 'cust-1', professional_id: 'pro-none', service_title: 'Home Cleaning', total_paid: 999, date: '2026-11-21', time_slot: '3 PM', address: 'Flat 1, Mumbai' };
    const result = await notifyBookingConfirmedMeta(booking, sb, { fetchImpl: fetchMock });
    assert.equal(result.customer.accepted, false);
    assert.equal(calls, 1, 'no response received: outcome ambiguous, no blind retry (the request may have been accepted)');
  } finally {
    process.env = savedEnv;
  }
});
