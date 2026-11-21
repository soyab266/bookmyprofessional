import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingStartIST, dispatchBookingAlerts, isMetaBillingFailure, notifyOwnerBillingPause, pauseStandingBookings } from '../src/lib/booking-alert-outbox.js';

const profile = { id: 'u', full_name: 'Example', phone: '9000000001', whatsapp_consent: true };
const NOW = new Date().toISOString();
const FUTURE_DATE = '2099-01-01';
// Standing row: pilot_expires_at null, no pilot scope, template v2 snapshot.
const standingRow = { id: 'q', booking_id: 'B', created_at: NOW, pilot_expires_at: null, pilot_armed_at: null, claim_token: 'token', user_id: 'u', recipient_role: 'customer', template: 'bmp_booking_details_v2', recipient_phone: profile.phone, booking: { id: 'B', service_title: 'Cleaning', date: FUTURE_DATE, time_slot: '3:00 PM', customer_id: 'u', professional_id: 'pro', address: 'TEST address', total_paid: '500.00', template_version: 2, alert_created_at: NOW } };

function db({ p = profile, groups = [[standingRow]], standingUpdates = [], booking = { ...standingRow.booking, payment_status: 'paid', status: 'upcoming' } } = {}) {
  const finished = []; let claims = 0; const rpcCalls = [];
  return { finished, rpcCalls, standingUpdates, get claims() { return claims },
    from(table) { assert.ok(['profiles', 'bookings', 'professionals', 'booking_alert_standing', 'booking_alert_outbox'].includes(table)); let id;
      return { select() { return this }, eq(k, v) { id = v; return this },
        update(v) { assert.equal(table, 'booking_alert_standing'); standingUpdates.push(v); return this },
        async maybeSingle() { return table === 'professionals' ? { data: { verified: true, verification_status: 'approved' } } : table === 'bookings' ? { data: booking } : { data: p } } } },
    async rpc(name, args) {
      rpcCalls.push(name);
      if (name === 'expand_booking_alert_receipts') return { data: { expanded: 0, errors: 0 } };
      if (name === 'claim_booking_alert') { claims++; const g = groups.shift(); return { data: g ? { rows: g, pilot_expires_at: null } : null, error: null } }
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

test('standing group sends both pair members from one claim', async () => {
  const pro = { ...standingRow, id: 'q2', recipient_role: 'professional', template: 'bmp_professional_booking_details_v2' };
  const r = await run({ groups: [[standingRow, pro]] });
  assert.equal(r.sb.claims, 2, 'one group claim plus the final empty claim');
  assert.equal(r.sends, 2);
  assert.deepEqual(r.sb.finished.map((f) => f.p_status), ['accepted', 'accepted']);
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

test('pilot rows keep pilot guards and skip standing expiry guards', async () => {
  const r = await run({ groups: [[{ ...standingRow, pilot_expires_at: '2020-01-01T00:00:00Z', pilot_armed_at: '2019-01-01T00:00:00Z' }]] });
  assert.equal(r.sends, 0);
  assert.equal(r.finish.p_status, 'skipped');
  assert.equal(r.finish.p_error, 'pilot_expired');
});

test('row older than the notification age bound expires unsent with allowance back', async () => {
  const old = new Date(Date.now() - 3 * 3600e3).toISOString();
  const stale = { ...standingRow, booking: { ...standingRow.booking, alert_created_at: old } };
  const r = await run({ groups: [[stale]] });
  assert.equal(r.sends, 0);
  assert.equal(r.finish.p_status, 'skipped');
  assert.equal(r.finish.p_error, 'expired_notification_age');
  assert.equal(r.finish.p_release, true);
});

test('row whose appointment already started expires unsent', async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const started = { ...standingRow, booking: { ...standingRow.booking, date: today, time_slot: '12:01 AM' } };
  const r = await run({ groups: [[started]], booking: { ...started.booking, payment_status: 'paid', status: 'upcoming' } });
  assert.equal(r.sends, 0);
  assert.equal(r.finish.p_error, 'booking_started');
  assert.equal(r.finish.p_release, true);
});

test('past booking date with an unparseable slot falls back to the date guard', async () => {
  const past = { ...standingRow, booking: { ...standingRow.booking, date: '2000-01-01', time_slot: 'whenever' } };
  const r = await run({ groups: [[past]], booking: { ...past.booking, payment_status: 'paid', status: 'upcoming' } });
  assert.equal(r.sends, 0);
  assert.equal(r.finish.p_error, 'booking_date_passed');
  assert.equal(r.finish.p_release, true);
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

test('billing rejection holds the attempted row, releases the unattempted pair half, pauses, stops', async () => {
  const pro = { ...standingRow, id: 'q2', recipient_role: 'professional', template: 'bmp_professional_booking_details_v2' };
  const r = await run({ groups: [[standingRow, pro], [standingRow]] }, { success: false, status: 400, error: '{"error":{"code":131042}}' });
  assert.equal(r.sends, 1, 'must stop after the billing rejection, never keep claiming');
  assert.equal(r.sb.claims, 1, 'one group claim; the second group is never claimed after a billing stop');
  assert.equal(r.finish.p_status, 'failed');
  assert.equal(r.finish.p_error, 'meta_billing_failure');
  assert.equal(r.finish.p_release, false);
  assert.equal(r.sb.finished.length, 2, 'attempted row plus its unattempted pair half');
  for (const sib of r.sb.finished.slice(1)) {
    assert.equal(sib.p_status, 'skipped');
    assert.equal(sib.p_error, 'not_attempted_billing_pause');
    assert.equal(sib.p_release, true, 'no Meta request was made, allowance goes back');
  }
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

test('idle claim reports the pending backlog for monitoring', async () => {
  const r = await run({ groups: [] });
  assert.equal(r.sends, 0);
  assert.equal(r.summary.pending_remaining, null, 'mock has no count; live supabase returns the pending count');
});

test('pause write is best-effort and never throws', async () => {
  const bad = { from() { return { update() { return this }, eq() { throw new Error('db down') } } } };
  await pauseStandingBookings(bad, 'meta_billing_failure');
});

test('billing rejection emails the owner once via the injected notifier', async () => {
  process.env.META_WHATSAPP_BOOKINGS_ENABLED = 'true';
  const sb = db({ groups: [[standingRow]] });
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

test('bookingStartIST parses slots and rejects junk', () => {
  assert.equal(bookingStartIST('2026-11-22', '3:00 PM'), Date.UTC(2026, 10, 22, 15, 0) - 5.5 * 3600e3);
  assert.equal(bookingStartIST('2026-11-22', '12 AM'), Date.UTC(2026, 10, 22, 0, 0) - 5.5 * 3600e3);
  assert.equal(bookingStartIST('2026-11-22', '12:30 PM'), Date.UTC(2026, 10, 22, 12, 30) - 5.5 * 3600e3);
  assert.equal(bookingStartIST('22-11-2026', '3 PM'), null);
  assert.equal(bookingStartIST('2026-11-22', '15:00'), null);
  assert.equal(bookingStartIST('2026-11-22', ''), null);
});

// Optional local PostgreSQL-engine SQL check; never connects to production.
// Install @electric-sql/pglite separately and point BMP_PGLITE_MODULE to its
// dist/index.js. This is not an independent-session concurrency stress test.
test('SQL integration: exact role caps and reservation accounting', { skip: !process.env.BMP_PGLITE_MODULE }, async () => {
  const { pathToFileURL, fileURLToPath } = await import('node:url');
  const path = await import('node:path');
  const fs = await import('node:fs');
  const { PGlite } = await import(pathToFileURL(process.env.BMP_PGLITE_MODULE).href);
  const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;
create table public.profiles(id uuid,whatsapp_consent boolean,phone text,notification_prefs jsonb);
create table public.bookings(id text primary key,booking_alert_verified_at timestamptz,booking_alert_expanded_at timestamptz,booking_alert_receipt jsonb,payment_status text,status text,booking_alert_expand_error text);
create table public.booking_alert_budget(id int,total_cap int,total_used int,armed_at timestamptz,expires_at timestamptz);
insert into booking_alert_budget values(1,0,2,null,null);
create table public.booking_alert_outbox(id uuid primary key default gen_random_uuid(),booking_id text,user_id uuid,recipient_role text,event text default 'booking_paid',template text,booking jsonb,recipient_phone text,pilot_armed_at timestamptz not null,status text default 'pending',claim_token uuid,attempts int default 0,meta_message_id text,last_error text,created_at timestamptz default now(),updated_at timestamptz default now(),unique(booking_id,user_id,event));`);
await db.exec(fs.readFileSync(path.join(ROOT,'supabase/booking_alert_standing.sql'),'utf8'));
const q=async(s)=>(await db.query(s)).rows;
function check(b,label){if(!b)throw Error(label);console.log('PASS',label)}
const claim=async()=> (await q('select claim_booking_alert() as v'))[0].v;
async function add(id,roles,age='1 minute'){await db.query(`insert into bookings(id,booking_alert_verified_at) values($1,now()-$2::interval)`,[id,age]);for(const role of roles)await db.query(`insert into booking_alert_outbox(booking_id,user_id,recipient_role,booking,pilot_armed_at) values($1,gen_random_uuid(),$2,'{}',null)`,[id,role]);}
check(await claim()===null,'paused migration denies claims');
await db.exec('update booking_alert_standing set paused=false');
for(let i=0;i<16;i++)await add('C'+i,['customer']);
for(let i=0;i<15;i++){let r=await claim();check(r?.rows.length===1,'customer reservation '+i)}
check(await claim()===null,'16th customer blocked despite spare aggregate slots');
await add('P',['professional']);let p=await claim();check(p?.rows[0].recipient_role==='professional','professional-only passes blocked customer head');
let stats=(await q('select * from booking_alert_standing'))[0];check(stats.customer_used===15&&stats.professional_used===1&&stats.used_today===16,'separate counters exact');
await db.query('select finish_booking_alert($1,$2,$3,null,null,true)',[p.rows[0].id,p.rows[0].claim_token,'skipped']);
stats=(await q('select * from booking_alert_standing'))[0];check(stats.customer_used===15&&stats.professional_used===0&&stats.used_today===15,'no-attempt releases professional only');
await add('PAIR',['customer','professional']);check(await claim()===null,'pair cannot partially claim when customer side exhausted');
await db.exec('update booking_alert_standing set day=day-1');let next=await claim();check(next?.rows.length===1,'new IST day replenishes both counters');
stats=(await q('select * from booking_alert_standing'))[0];check(stats.customer_used===1&&stats.professional_used===0,'rollover resets role counters');
let pair=await claim();check(pair?.rows.length===2,'whole pair takes one slot per role');
await db.query('select finish_booking_alert($1,$2,$3,null,null,false)',[pair.rows[0].id,pair.rows[0].claim_token,'uncertain']);
stats=(await q('select * from booking_alert_standing'))[0];check(stats.customer_used===2&&stats.professional_used===1,'uncertain attempt keeps reservation');
await db.exec('update booking_alert_standing set day=day+1,used_today=10,customer_used=5,professional_used=5');
await db.query('select finish_booking_alert($1,$2,$3,null,null,true)',[pair.rows[1].id,pair.rows[1].claim_token,'failed']);
stats=(await q('select * from booking_alert_standing'))[0];check(stats.used_today===10&&stats.customer_used===5&&stats.professional_used===5,'late previous-day release cannot reduce new-day usage');
await add('STALE',['customer','professional'],'3 hours');await db.exec('update booking_alert_standing set customer_used=15,professional_used=15,used_today=30');await claim();
check((await q("select count(*)::int as n from booking_alert_outbox where booking_id='STALE' and status='skipped' and last_error='expired_notification_age'"))[0].n===2,'stale cap overflow expires without reservation');
await db.exec('delete from booking_alert_standing');check(await claim()===null,'missing config fails closed');
await db.close();

});
