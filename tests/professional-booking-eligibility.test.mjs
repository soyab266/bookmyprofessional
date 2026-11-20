import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isProfessionalBookable, readProfessionalBookability, bookingNeedsVerificationReview } from '../src/lib/professional-booking-eligibility.js';
import { getBookingPaymentLabel, getBookingStatusLabel } from '../src/lib/booking-payment-label.js';
import { dispatchBookingConfirmedNotifications } from '../src/lib/booking-notifications.js';
import { confirmVerifiedPaidBooking, dispatchBookingAlerts } from '../src/lib/booking-alert-outbox.js';
const client = (data, error) => ({ from() { return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data, error }; } }; } });
test('eligibility requires both current fields and fails closed on missing/null/read failure', async () => {
  for (const pro of [null, {}, { verified: true }, { verified: false, verification_status: 'approved' }, { verified: true, verification_status: null }, { verified: true, verification_status: 'pending' }]) {
    assert.equal(isProfessionalBookable(pro), false);
    assert.equal(await readProfessionalBookability(client(pro), 'pro'), false);
  }
  assert.equal(await readProfessionalBookability(client({ verified: true, verification_status: 'approved' }), 'pro'), true);
  assert.equal(await readProfessionalBookability(client({ verified: true, verification_status: 'approved' }, { message: 'outage' }), 'pro'), false);
  assert.equal(await readProfessionalBookability({from(){throw Error('outage')}}, 'pro'), false);
});
test('receipt truth stays paid while service status requires review; terminal history unchanged', () => {
  const b = { status: 'upcoming', paymentStatus: 'paid', paymentMethod: 'PayU', professionalBookable: false };
  assert.equal(bookingNeedsVerificationReview(b), true);
  assert.equal(getBookingStatusLabel(b, 'upcoming'), 'Verification review required');
  assert.equal(getBookingPaymentLabel(b), 'Paid via PayU');
  for (const status of ['completed','cancelled','in_progress']) assert.equal(bookingNeedsVerificationReview({...b,status}), false);
});
test('verification loss and read failure suppress confirmation before dedupe or sends', async () => {
  for (const pro of [null,{verified:false,verification_status:'pending'}]) {
    const r=await dispatchBookingConfirmedNotifications({id:'race',professional_id:'pro'},client(pro));
    assert.equal(r.reason,'professional_verification_required');
  }
});
test('late payment receipt records paid without reviving status when alerts are off', async () => {
  delete process.env.META_WHATSAPP_BOOKINGS_ENABLED;
  const updates=[];
  const sb={from(t){return {update(v){updates.push([t,v]);return this;},eq(){return this;},neq(){return this;},async select(){return {data:[{id:'late',status:'cancelled',payment_status:'paid'}]};}}}};
  await confirmVerifiedPaidBooking(sb,'late',10,'provider-ref');
  assert.deepEqual(updates[0],['bookings',{payment_status:'paid'}]);
  assert.equal(updates[1][1].provider_ref,'provider-ref');
});
test('queued confirmation is suppressed after verification loss, with no provider send', async () => {
  process.env.META_WHATSAPP_BOOKINGS_ENABLED='true';
  const b={id:'B',professional_id:'pro',payment_status:'paid',status:'upcoming',date:'2099-01-01',time_slot:'10 AM',service_title:'Test'};
  const row={id:'queue',booking_id:'B',booking:b,claim_token:'token'};let claim=0,sends=0;const finished=[];
  const sb={from(t){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:t==='bookings'?b:{verified:false,verification_status:'pending'}};}};},async rpc(n,a){if(n==='expand_booking_alert_receipts')return {data:{errors:0}};if(n==='claim_booking_alert')return {data:claim++?null:row};finished.push(a);return {data:true};}};
  const r=await dispatchBookingAlerts(sb,{send(){sends++;}});
  assert.equal(sends,0);assert.equal(r.skipped,1);assert.equal(finished[0].p_release,true);
  delete process.env.META_WHATSAPP_BOOKINGS_ENABLED;
});
test('payment initiation, reminder, reschedule, and DB direct service paths have current verification gates',()=>{
  const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
  const hash=read('src/app/api/payu/hash/route.js');assert.ok(hash.indexOf('!await readProfessionalBookability')<hash.indexOf('const hash = generatePaymentHash'));
  assert.match(read('src/app/api/notifications/whatsapp-reminder/route.js'),/!await readProfessionalBookability\(supabase, booking.professional_id\)/);
  const bookings=read('src/lib/data/bookings.js');assert.match(bookings,/Service cannot start until/);assert.match(bookings,/Rescheduling is unavailable until/);
  const sql=read('supabase/booking_requires_verified_professional.sql');assert.match(sql,/new.status = 'in_progress'/);assert.match(sql,/to_jsonb\(new\)->'date'/);assert.match(sql,/for share/);assert.match(sql,/security definer set search_path=public,pg_temp/);
});
