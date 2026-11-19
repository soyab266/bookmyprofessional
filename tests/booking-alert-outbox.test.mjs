import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bookingAlertsEnabled, confirmVerifiedPaidBooking, dispatchBookingAlerts } from '../src/lib/booking-alert-outbox.js';
const profile={id:'u',full_name:'Example',phone:'9000000001',whatsapp_consent:true};
const row={id:'q',booking_id:'B',pilot_expires_at:'2099-01-01T00:00:00Z',claim_token:'token',user_id:'u',recipient_role:'customer',template:'bmp_booking_details_v2',recipient_phone:profile.phone,booking:{id:'B',service_title:'Cleaning',date:'2026-11-21',time_slot:'3 PM',customer_id:'u',professional_id:'pro',address:'TEST address',total_paid:'500.00',template_version:2}};
function db({p=profile,rows=[row],profileError=null,claimError=null,finishError=null,scope=true,scopeError=null,contact=profile,contactError=null,booking={...row.booking,payment_status:'paid',status:'upcoming'}}={}) {
 const finished=[];let claims=0;
 return {finished,get claims(){return claims},from(table){assert.ok(['profiles','bookings'].includes(table));let id;return {select(){return this},eq(k,v){id=v;return this},async maybeSingle(){return table==='bookings'?{data:booking}:id==='u'&&p?.id==='pro'?{data:contact,error:contactError}:{data:p,error:profileError}}}},async rpc(name,args){
  if(name==='expand_booking_alert_receipts')return {data:{expanded:0,errors:0}};
  if(name==='booking_alert_scope_allows')return {data:scope,error:scopeError};
  if(name==='claim_booking_alert'){claims++;return {data:rows.shift()||null,error:claimError}}
  assert.equal(name,'finish_booking_alert');finished.push(args);return {data:!finishError,error:finishError};
 }};
}
async function run(opts={},result={success:true,metaMessageId:'wamid.test'}) {
 const sb=db(opts);let sends=0;
 const summary=await dispatchBookingAlerts(sb,{send:async()=>{sends++;if(result instanceof Error)throw result;return result;}});
 return {sb,sends,summary,finish:sb.finished[0]};
}
test('booking flag is exact, off by default',()=>{assert.equal(bookingAlertsEnabled({}),false);assert.equal(bookingAlertsEnabled({META_WHATSAPP_BOOKINGS_ENABLED:'1'}),false);assert.equal(bookingAlertsEnabled({META_WHATSAPP_BOOKINGS_ENABLED:'true'}),true)});
test('disabled dispatcher touches nothing',async()=>{delete process.env.META_WHATSAPP_BOOKINGS_ENABLED;assert.equal((await dispatchBookingAlerts({rpc(){throw Error('must not run')}})).disabled,true)});
test('isolated dispatcher outcome and privacy checks',async t=>{
 process.env.META_WHATSAPP_BOOKINGS_ENABLED='true';
 for(const role of ['customer','professional'])await t.test(role+' acceptance persisted, no delivery claim',async()=>{const q={...row,recipient_role:role,user_id:role==='customer'?'u':'pro',template:role==='customer'?'bmp_booking_details_v2':'bmp_professional_booking_details_v2'};const r=await run({p:role==='professional'?{...profile,id:'pro'}:profile,rows:[q]});assert.equal(r.sends,1);assert.equal(r.finish.p_status,'accepted');assert.equal(r.finish.p_message_id,'wamid.test');assert.equal(r.finish.p_release,false)});
 for(const result of [{success:false,status:400,error:'bad'},{success:false,status:500,error:'down'},new Error('network'),{success:true}])await t.test('real or ambiguous request keeps slot '+JSON.stringify(result),async()=>{const r=await run({},result);assert.equal(r.sends,1);assert.equal(r.finish.p_status,'uncertain');assert.equal(r.finish.p_release,false)});
 for(const result of [{success:false,skipped:'missing_credentials'},{success:true,simulated:true},{success:false,error:'validation_failed:bad'}])await t.test('proven no-send releases '+JSON.stringify(result),async()=>{const r=await run({},result);assert.equal(r.finish.p_release,true);assert.notEqual(r.finish.p_status,'accepted')});
 for(const p of [null,{...profile,whatsapp_consent:false},{...profile,notification_prefs:{whatsapp:false}},{...profile,phone:'9000000002'}])await t.test('fresh consent and recipient guard '+JSON.stringify(p),async()=>{const r=await run({p});assert.equal(r.sends,0);assert.equal(r.finish.p_release,true);assert.equal(r.finish.p_status,'skipped')});
 await t.test('profile read failure no send',async()=>{const r=await run({profileError:{message:'fail'}});assert.equal(r.sends,0);assert.equal(r.finish.p_release,true)});
 await t.test('unknown template cannot send',async()=>{const r=await run({rows:[{...row,template:'bmp_customer_registration_received'}]});assert.equal(r.sends,0);assert.equal(r.finish.p_status,'failed')});
 await t.test('finish failure stops, no resend',async()=>{const r=await run({rows:[row,row],finishError:{message:'fail'}});assert.equal(r.sends,1);assert.equal(r.sb.claims,1);assert.equal(r.summary.error,'booking_finish_failed')});
 await t.test('claim failure fails closed',async()=>{const r=await run({claimError:{message:'fail'}});assert.equal(r.sends,0);assert.equal(r.summary.error,'booking_claim_failed')});
 await t.test('cancelled booking is skipped',async()=>{const r=await run({booking:{payment_status:'paid',status:'cancelled'}});assert.equal(r.sends,0);assert.equal(r.finish.p_release,true)});
 await t.test('expired pilot between claim and send is skipped',async()=>{const r=await run({rows:[{...row,pilot_expires_at:'2020-01-01T00:00:00Z'}]});assert.equal(r.sends,0);assert.equal(r.finish.p_release,true)});
 for(const opts of [{scope:false},{scope:null},{scopeError:{message:'unavailable'}}])await t.test('scope denied or unavailable prevents request '+JSON.stringify(opts),async()=>{const r=await run(opts);assert.equal(r.sends,0);assert.equal(r.finish.p_status,'skipped');assert.equal(r.finish.p_release,true)});
 await t.test('null claim ends run without send',async()=>{const r=await run({rows:[]});assert.equal(r.sends,0)});
 delete process.env.META_WHATSAPP_BOOKINGS_ENABLED;
});
test('enabled confirmation uses atomic RPC only, propagates failure',async()=>{
 process.env.META_WHATSAPP_BOOKINGS_ENABLED='true';let call;
 assert.deepEqual(await confirmVerifiedPaidBooking({async rpc(n,a){call={n,a};return {data:{id:'B'}}}},'B','10','ref'),{id:'B'});
 assert.equal(call.n,'record_verified_booking_payment');assert.equal(call.a.p_amount,'10');
 await assert.rejects(()=>confirmVerifiedPaidBooking({async rpc(){return {error:{message:'fail'}}}},'B','10','ref'),/transaction_failed/);
 delete process.env.META_WHATSAPP_BOOKINGS_ENABLED;
});
test('both PayU routes preserve verification before confirmation and do not send directly',()=>{
 for(const route of ['callback','webhook']){const s=readFileSync(new URL('../src/app/api/payu/'+route+'/route.js',import.meta.url),'utf8');assert.ok(s.indexOf('const valid = verifyPaymentHash')<s.indexOf('const confirmedBooking ='));assert.ok(s.indexOf('if (!amountsMatch')<s.indexOf('const confirmedBooking ='));assert.match(s,/if \(confirmedBooking\)/)}
 const s=readFileSync(new URL('../src/lib/booking-notifications.js',import.meta.url),'utf8');assert.doesNotMatch(s,/notifyBookingConfirmedMeta|notification_outbox|enqueueFailedBookingSends/);assert.match(s,/bookingWhatsAppProvider\(\) === 'brevo'/);
});

test('flag-off paid update preserves legacy provider and conditional transition',async()=>{
 delete process.env.META_WHATSAPP_BOOKINGS_ENABLED;const calls=[];
 const sb={rpc(){throw Error('no booking RPC while off')},from(t){calls.push(t);return {update(v){calls.push(v);return this},eq(k,v){calls.push([k,v]);return this},neq(k,v){calls.push([k,v]);return this},async select(){return {data:[{id:'legacy'}]}}}}};
 const b=await confirmVerifiedPaidBooking(sb,'legacy',10,'ref');assert.equal(b.id,'legacy');assert.deepEqual(calls[0],'bookings');assert.ok(calls.some(x=>Array.isArray(x)&&x[0]==='payment_status'&&x[1]==='paid'));assert.ok(calls.includes('payments'));
});

test('reconciliation outage fails closed without attempting Meta',async()=>{
 process.env.META_WHATSAPP_BOOKINGS_ENABLED='true';let sent=0;const r=await dispatchBookingAlerts({async rpc(name){assert.equal(name,'expand_booking_alert_receipts');return {data:{errors:1}}}},{send(){sent++}});assert.equal(r.error,'booking_expansion_failed');assert.equal(sent,0);delete process.env.META_WHATSAPP_BOOKINGS_ENABLED;
});
test('payment-recording RPC has no optional notification operations',()=>{
 const sql=readFileSync(new URL('../supabase/booking_alert_outbox.sql',import.meta.url),'utf8');const body=sql.split('create function public.record_verified_booking_payment')[1].split('end $$;')[0];
 assert.doesNotMatch(body,/booking_alert_outbox|booking_alert_budget|public.profiles/);assert.match(body,/booking_alert_verified_at=now\(\)/);assert.match(body,/payment_status='paid'/);
});

test('new booking marker and deletion-following queue are declared',()=>{
 const sql=readFileSync(new URL('../supabase/booking_alert_outbox.sql',import.meta.url),'utf8');
 assert.match(sql,/booking_id text not null references public.bookings\(id\) on delete cascade/);
 assert.match(sql,/user_id uuid not null references public.profiles\(id\) on delete cascade/);
 assert.match(sql,/new.booking_alert_created_at:=clock_timestamp\(\)/);
 assert.match(sql,/protected_booking_creation_marker/);
 assert.doesNotMatch(sql,/alter table public.profiles|alter policy|drop policy/);
});

test('receipt recording preserves operational status and suppresses non-upcoming confirmation events',()=>{
 const sql=readFileSync(new URL('../supabase/booking_alert_outbox.sql',import.meta.url),'utf8');
 const body=sql.split('create function public.record_verified_booking_payment')[1].split('end $$;')[0];
 assert.doesNotMatch(body,/set payment_status='paid',status='upcoming'/);
 assert.match(body,/if was_paid or b.status is distinct from 'upcoming' then return null/);
});

test('fuller dispatcher rejects stale details and legacy payloads without a send', async t => {
 process.env.META_WHATSAPP_BOOKINGS_ENABLED='true';
 for (const patch of [{address:'changed'},{total_paid:501},{customer_id:'another'},{professional_id:'another'}, {total_paid:null}]) {
  await t.test(JSON.stringify(patch), async()=>{
   const r=await run({booking:{...row.booking,payment_status:'paid',status:'upcoming',...patch}});
   assert.equal(r.sends,0);assert.equal(r.finish.p_status,'skipped');assert.equal(r.finish.p_release,true);
  });
 }
 for (const patch of [{template_version:1},{address:null},{total_paid:null},{total_paid:'no amount'},{date:'invalid'},{time_slot:''}]) {
  await t.test('incomplete receipt '+JSON.stringify(patch),async()=>{
   const b={...row.booking,...patch};const r=await run({rows:[{...row,booking:b}],booking:{...b,payment_status:'paid',status:'upcoming'}});
   assert.equal(r.sends,0);assert.equal(r.finish.p_release,true);
  });
 }
 const old=await run({rows:[{...row,template:'bmp_booking_received'}]});assert.equal(old.sends,0);
 delete process.env.META_WHATSAPP_BOOKINGS_ENABLED;
});
test('fuller professional uses fresh assigned customer contact only',async()=>{
 process.env.META_WHATSAPP_BOOKINGS_ENABLED='true';const captured=[];
 const q={...row,recipient_role:'professional',user_id:'pro',template:'bmp_professional_booking_details_v2'};
 const sb=db({p:{...profile,id:'pro',full_name:'Professional'},contact:{id:'u',full_name:'Fresh Customer',phone:'9000000099'},rows:[q]});
 await dispatchBookingAlerts(sb,{send:async payload=>{captured.push(payload);return {success:true,simulated:true}}});
 assert.equal(captured.length,1);assert.equal(captured[0].template.components[0].parameters[3].text,'Fresh Customer (9000000099)');
 for(const opts of [{contact:null},{contact:{id:'another',full_name:'Wrong'}},{contactError:{message:'unavailable'}}]) {
  const x=await run({p:{...profile,id:'pro'},rows:[q],...opts});assert.equal(x.sends,0);
 }
 delete process.env.META_WHATSAPP_BOOKINGS_ENABLED;
});
