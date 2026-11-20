const eligibleClient = { from() { return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: { verified: true, verification_status: 'approved' } }; } }; } };
// Regression coverage for the old direct Meta booking path being removed.
// Outcome/consent coverage now lives in booking-alert-outbox.test.mjs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dispatchBookingConfirmedNotifications,bookingWhatsAppProvider} from '../src/lib/booking-notifications.js';
process.env.NODE_ENV='test';
test('booking provider remains Brevo unless exact flag true',()=>{
 assert.equal(bookingWhatsAppProvider({}),'brevo');assert.equal(bookingWhatsAppProvider({META_WHATSAPP_BOOKINGS_ENABLED:'false'}),'brevo');assert.equal(bookingWhatsAppProvider({META_WHATSAPP_BOOKINGS_ENABLED:'1'}),'brevo');assert.equal(bookingWhatsAppProvider({META_WHATSAPP_BOOKINGS_ENABLED:'true'}),'meta');
});
test('booking emails path cannot directly send Meta or write registration queue',()=>{
 const s=readFileSync(new URL('../src/lib/booking-notifications.js',import.meta.url),'utf8');
 assert.doesNotMatch(s,/notifyBookingConfirmedMeta|sendMetaTemplateMessage|notification_outbox|enqueueFailedBookingSends/);
 assert.match(s,/bookingWhatsAppProvider\(\) === 'brevo'/);
});
test('enabled path no longer queries WhatsApp recipients or sends from email hook',async()=>{
 process.env.META_WHATSAPP_BOOKINGS_ENABLED='true';const cols=[];
 const sb={from(t){if(t==='professionals') return eligibleClient.from(t);assert.equal(t,'profiles');return {select(c){cols.push(c);return {async in(){return {data:[]}}}}}}};
 const r=await dispatchBookingConfirmedNotifications({id:'regression-queue-only',professional_id:'pro'},sb);assert.equal(r.success,true);
 assert.equal(cols.some(c=>c.includes('whatsapp_consent')),false);
 delete process.env.META_WHATSAPP_BOOKINGS_ENABLED;
});
test('in-process email dedupe preserved, not claimed as durable WhatsApp dedupe',async()=>{
 const b={id:'regression-email-dedupe',professional_id:'pro'};const first=await dispatchBookingConfirmedNotifications(b,eligibleClient);const second=await dispatchBookingConfirmedNotifications(b,eligibleClient);
 assert.equal(first.success,true);assert.equal(second.deduplicated,true);
});
test('missing booking id fails without action',async()=>assert.equal((await dispatchBookingConfirmedNotifications(null,null)).reason,'missing_booking_id'));
