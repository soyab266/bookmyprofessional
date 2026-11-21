import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchBookingAlerts, isMetaBillingFailure, notifyOwnerBillingPause, pauseStandingBookings } from '../src/lib/booking-alert-outbox.js';

const profile = { id: 'u', full_name: 'Example', phone: '9000000001', whatsapp_consent: true };
// Standing row: pilot_expires_at null, no pilot scope, template v2 snapshot.
const standingRow = { id: 'q', booking_id: 'B', pilot_expires_at: null, pilot_armed_at: null, claim_token: 'token', user_id: 'u', recipient_role: 'customer', template: 'bmp_booking_details_v2', recipient_phone: profile.phone, booking: { id: 'B', service_title: 'Cleaning', date: '2026-11-21', time_slot: '3 PM', customer_id: 'u', professional_id: 'pro', address: 'TEST address', total_paid: '500.00', template_version: 2 } };

function db({ p = profile, rows = [standingRow], standingUpdates = [], booking = { ...standingRow.booking, payment_status: 'paid', status: 'upcoming' } } = {}) {
  const finished = []; let claims = 0; const rpcCalls = [];
  return { finished, rpcCalls, standingUpdates, get claims() { return claims },
    from(table) { assert.ok(['profiles', 'bookings', 'professionals', 'booking_alert_standing'].includes(table)); let id;
      return { select() { return this }, eq(k, v) { id = v; return this },
        update(v) { assert.equal(table, 'booking_alert_standing'); standingUpdates.push(v); return this },
        async maybeSingle() { return table === 'professionals' ? { data: { verified: true, verification_status: 'approved' } } : table === 'bookings' ? { data: booking } : { data: p } } } },
    async rpc(name, args) {
      rpcCalls.push(name);
      if (name === 'expand_booking_alert_receipts') return { data: { expanded: 0, errors: 0 } };
      if (name === 'claim_booking_alert') { claims++; return { data: rows.shift() || null, error: null } }
      assert.equal(name, 'finish_booking_alert'); finished.push(args); return { data: true, error: null };
    } };
}

async function run(opts = {}, result = { success: true, metaMessageId: 'wamid.test' }) {
  process.env.META_WHATSAPP_BOOKINGS_ENABLED = 'true';
  const sb = db(opts); let sends = 0;
  const summary = await dispatchBookingAlerts(sb, { send: async () => { sends++; if (result instanceof Error) throw result; return result; } });
  delete process.env.META_WHATSAPP_BOOKINGS_ENABLED;
  return { sb, sends, summary, finish: sb.finished[0] };
}

test('standing row sends without pilot scope RPC', async () => {
  const r = await run();
  assert.equal(r.sends, 1);
  assert.equal(r.finish.p_status, 'accepted');
  assert.equal(r.finish.p_message_id, 'wamid.test');
  assert.ok(!r.sb.rpcCalls.includes('booking_alert_scope_allows'), 'scope RPC must not run for standing rows');
});

test('standing row skips scope check but keeps live consent guard', async () => {
  const r = await run({ p: { ...profile, whatsapp_consent: false } });
  assert.equal(r.sends, 0);
  assert.equal(r.finish.p_status, 'skipped');
  assert.equal(r.finish.p_release, true);
});

test('standing row skipped when booking changed after claim', async () => {
  const r = await run({ booking: { payment_status: 'paid', status: 'cancelled' } });
  assert.equal(r.sends, 0);
  assert.equal(r.finish.p_status, 'skipped');
  assert.equal(r.finish.p_release, true);
});

test('pilot rows keep pilot guards', async () => {
  const r = await run({ rows: [{ ...standingRow, pilot_expires_at: '2020-01-01T00:00:00Z', pilot_armed_at: '2019-01-01T00:00:00Z' }] });
  assert.equal(r.sends, 0);
  assert.equal(r.finish.p_status, 'skipped');
  assert.equal(r.finish.p_error, 'pilot_expired');
});

test('billing classifier is narrow', () => {
  assert.equal(isMetaBillingFailure({ success: true, metaMessageId: 'x' }), false);
  assert.equal(isMetaBillingFailure({ success: true, simulated: true }), false);
  assert.equal(isMetaBillingFailure({ success: false, status: 402 }), true);
  assert.equal(isMetaBillingFailure({ success: false, status: 400, error: '{"error":{"code":131042,"message":"business payment issue"}}' }), true);
  assert.equal(isMetaBillingFailure({ success: false, status: 400, error: '{"error":{"code":132000,"message":"template param count"}}' }), false);
  assert.equal(isMetaBillingFailure({ success: false, status: 500, error: 'down' }), false);
  assert.equal(isMetaBillingFailure(null), false);
});

test('billing rejection holds row, pauses standing, stops the run', async () => {
  const r = await run({ rows: [standingRow, { ...standingRow, id: 'q2' }] }, { success: false, status: 400, error: '{"error":{"code":131042}}' });
  assert.equal(r.sends, 1, 'must stop after the billing rejection, never keep claiming');
  assert.equal(r.sb.claims, 1);
  assert.equal(r.finish.p_status, 'failed');
  assert.equal(r.finish.p_error, 'meta_billing_failure');
  assert.equal(r.finish.p_release, false);
  assert.equal(r.summary.paused, 'meta_billing_failure');
  assert.deepEqual(r.sb.standingUpdates.length, 1);
  assert.equal(r.sb.standingUpdates[0].paused, true);
  assert.equal(r.sb.standingUpdates[0].pause_reason, 'meta_billing_failure');
});

test('non-billing rejection stays uncertain and never pauses', async () => {
  const r = await run({}, { success: false, status: 500, error: 'down' });
  assert.equal(r.finish.p_status, 'uncertain');
  assert.equal(r.finish.p_release, false);
  assert.equal(r.sb.standingUpdates.length, 0);
  assert.equal(r.summary.paused, undefined);
});

test('pause write is best-effort and never throws', async () => {
  const bad = { from() { return { update() { return this }, eq() { throw new Error('db down') } } } };
  await pauseStandingBookings(bad, 'meta_billing_failure');
});

test('stale row from a past booking date expires unsent and releases the allowance', async () => {
  const stale = { ...standingRow, booking: { ...standingRow.booking, date: '2000-01-01' } };
  const r = await run({ rows: [stale], booking: { ...stale.booking, payment_status: 'paid', status: 'upcoming' } });
  assert.equal(r.sends, 0);
  assert.equal(r.finish.p_status, 'skipped');
  assert.equal(r.finish.p_error, 'booking_date_passed');
  assert.equal(r.finish.p_release, true);
  assert.equal(r.summary.skipped, 1);
});

test('billing rejection emails the owner once via the injected notifier', async () => {
  process.env.META_WHATSAPP_BOOKINGS_ENABLED = 'true';
  const sb = db({ rows: [standingRow, { ...standingRow, id: 'q2' }] });
  let notices = 0;
  const summary = await dispatchBookingAlerts(sb, {
    send: async () => ({ success: false, status: 402 }),
    notifyOwner: async () => { notices++; return true; },
  });
  delete process.env.META_WHATSAPP_BOOKINGS_ENABLED;
  assert.equal(summary.paused, 'meta_billing_failure');
  assert.equal(summary.owner_notified, true);
  assert.equal(notices, 1);
});

test('owner notice is skipped without an address and never throws on failure', async () => {
  assert.equal(await notifyOwnerBillingPause({ env: {} }), false);
  let called = 0;
  const ok = await notifyOwnerBillingPause({ env: { BOOKING_ALERT_OWNER_EMAIL: 'owner@example.com' }, sendEmail: async () => { called++; } });
  assert.equal(ok, true);
  assert.equal(called, 1);
  const failed = await notifyOwnerBillingPause({ env: { BOOKING_ALERT_OWNER_EMAIL: 'owner@example.com' }, sendEmail: async () => { throw new Error('brevo down'); } });
  assert.equal(failed, false);
});
