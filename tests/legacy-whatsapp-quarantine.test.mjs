import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POST } from '../src/app/api/notifications/event/route.js';
import * as legacy from '../src/lib/whatsapp.js';
import { sendEmail } from '../src/lib/email.js';
import { sendRegistrationWelcomeMeta } from '../src/lib/meta-whatsapp.js';

const profile = { id: 'synthetic-user', full_name: 'Sample', phone: '9000000001', whatsapp_consent: true };
const pro = { ...profile, id: 'synthetic-pro', phone: '9000000002' };
const booking = { id: 'SAMPLE-ONLY', customer_id: profile.id, professional_id: pro.id, service_title: 'Sample service', date: '2026-11-25', time_slot: '10:00 AM' };
const payout = { id: 'SAMPLE-PAYOUT', professional_id: pro.id, amount: 500 };

async function withEnv(values, run) {
  const before = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
  try {
    for (const [k,v] of Object.entries(values)) v === undefined ? delete process.env[k] : process.env[k] = v;
    return await run();
  } finally {
    for (const [k,v] of Object.entries(before)) v === undefined ? delete process.env[k] : process.env[k] = v;
  }
}
async function withoutNetwork(run) {
  const old = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('network forbidden'); };
  try { await run(); assert.equal(calls, 0); } finally { globalThis.fetch = old; }
}

test('event endpoint quarantined for every legacy event without parsing input or network', async () => {
  await withoutNetwork(async () => {
    for (const event of ['booking_cancelled','booking_completed','refund_processed','payout_requested','payout_paid','unknown',null]) {
      let reads = 0;
      const request = new Proxy({}, { get() { reads++; throw new Error('request must not be read'); } });
      const response = await POST(request);
      assert.equal(reads, 0, String(event));
      assert.equal(response.status, 410);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), { error: 'notification_event_disabled' });
    }
  });
});
test('event route has no DB, provider, cookie or body dependency', () => {
  const source = readFileSync(new URL('../src/app/api/notifications/event/route.js',import.meta.url),'utf8');
  assert.doesNotMatch(source, /\bimport\b|createClient\(|fetch\(|req\.(json|headers)|notify[A-Z]\w*\(/);
});
test('low-level Brevo cannot send with production credentials or simulation flags', async () => {
  await withoutNetwork(async () => {
    for (const mode of [
      { NODE_ENV: 'production', BREVO_SIMULATE: undefined },
      { NODE_ENV: 'production', BREVO_SIMULATE: 'false' },
      { NODE_ENV: 'production', BREVO_SIMULATE: 'true' },
      { NODE_ENV: 'test', BREVO_SIMULATE: 'true' },
    ]) {
      await withEnv({ ...mode, BREVO_API_KEY: 'synthetic-not-a-secret', META_WHATSAPP_BOOKINGS_ENABLED: 'true' }, async () => {
        assert.equal(await legacy.sendWhatsApp({to:profile.phone,body:'Sample only'}),false);
        assert.equal(await legacy.sendWhatsApp(null),false);
        assert.equal(await legacy.sendWhatsApp(),false);
      });
    }
  });
});
test('all legacy customer/professional lifecycle and financial senders return false', async () => {
  await withoutNetwork(async () => {
    for (const role of ['customer','professional']) {
      assert.equal(await legacy.sendBookingConfirmationWhatsApp(profile,booking,role),false);
      assert.equal(await legacy.sendBookingCancellationWhatsApp(profile,booking,role),false);
      assert.equal(await legacy.sendBookingReminderWhatsApp(profile,booking,role),false);
    }
    assert.equal(await legacy.sendBookingCompletedWhatsApp(profile,booking),false);
    assert.equal(await legacy.sendRefundProcessedWhatsApp(profile,booking,500),false);
    assert.equal(await legacy.sendPayoutRequestedWhatsApp(profile,payout),false);
    assert.equal(await legacy.sendPayoutPaidWhatsApp(profile,payout),false);
  });
});
test('direct refund/payout and booking wrappers cannot bypass the shared block', async () => {
  const sb = { from(table) { assert.equal(table,'profiles'); return { select() { return { async in(_column,ids) { return {data:[profile,pro].filter(p=>ids.includes(p.id))}; } }; } }; } };
  await withoutNetwork(async () => {
    await legacy.notifyBookingConfirmed(booking,sb);
    await legacy.notifyBookingCompleted(booking,sb);
    await legacy.notifyBookingCancelled(booking,sb);
    await legacy.notifyRefundProcessed(booking,500,sb);
    await legacy.notifyPayoutRequested(payout,sb);
    await legacy.notifyPayoutPaid(payout,sb);
  });
});
test('email uses its separate SMTP transport, not the blocked WhatsApp transport', async () => {
  const old = globalThis.fetch;
  const captures=[];
  globalThis.fetch=async (url,options)=>{captures.push({url,body:JSON.parse(options.body)});return {ok:true};};
  try {
    await withEnv({BREVO_API_KEY:'synthetic-not-a-secret',BREVO_SENDER_EMAIL:'sample@example.invalid',BREVO_SENDER_NAME:'Sample'},async()=>{
      assert.equal(await sendEmail({to:'sample@example.invalid',subject:'Synthetic',text:'Sample only'}),true);
    });
    assert.equal(captures.length,1);assert.equal(captures[0].url,'https://api.brevo.com/v3/smtp/email');
  } finally {globalThis.fetch=old;}
});
test('Meta registration welcomes for BOTH roles retain their own simulated connector', async () => {
  await withoutNetwork(async () => withEnv({NODE_ENV:'test'},async()=>{
    for (const role of ['customer','professional']) {
      const result=await sendRegistrationWelcomeMeta({...profile,role});
      assert.equal(result.accepted,true);
      assert.equal(result.result.simulated,true);
      assert.equal(result.payload.template.name,`bmp_${role}_registration_received`);
    }
  }));
});
