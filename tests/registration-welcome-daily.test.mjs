import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dispatchDailyRegistrationWelcome,isIndiaWelcomePayload} from '../src/lib/registration-welcome-daily.js';
const payload={to:'919876543210',type:'template',template:{name:'bmp_customer_registration_received',language:{code:'en'}}};
function mock(claims,options={}){
 const calls=[];
 return {calls,async rpc(name,args){calls.push([name,args]);
  if(name==='claim_daily_welcome'){
   if(options.claimThrow)throw Error('read');
   return options.claimError?{error:{message:'db'}}:{data:claims.shift()||{taken:false,reason:'empty'}};
  }
  return options.finishThrow?Promise.reject(Error('persist')):options.finishError?{error:{message:'persist'}}:{data:options.finishValue??true};
 }};
}
const claim=()=>({taken:true,ticket:'fixture-ticket',payload});
test('daily payload is restricted to reviewed English Indian utility templates',()=>{
 assert.equal(isIndiaWelcomePayload(payload),true);
 for(const to of ['447700900123','9876543210','911234567890',''])assert.equal(isIndiaWelcomePayload({...payload,to}),false);
 assert.equal(isIndiaWelcomePayload({...payload,template:{name:'bmp_booking_received',language:{code:'en'}}}),false);
 assert.equal(isIndiaWelcomePayload({...payload,template:{name:'bmp_customer_registration_received',language:{code:'hi'}}}),false);
});
test('off or future stage never calls sender',async()=>{
 let sent=0;const db=mock([{taken:false,reason:'off_or_not_started'}]);
 const r=await dispatchDailyRegistrationWelcome(db,{sendImpl:async()=>sent++});assert.equal(sent,0);assert.equal(r.stopped,'off_or_not_started');
});
test('database failure fails closed and returns unhealthy result',async()=>{
 for(const options of [{claimError:true},{claimThrow:true}]){let sent=0;const r=await dispatchDailyRegistrationWelcome(mock([],options),{sendImpl:async()=>sent++});assert.equal(sent,0);assert.equal(r.error,'daily_claim_failed');}
});
test('provider accepted is recorded accepted, never described as delivered',async()=>{
 const db=mock([claim()]);let sent=0;
 const r=await dispatchDailyRegistrationWelcome(db,{sendImpl:async()=>{sent++;return {success:true,metaMessageId:'fixture'};}});
 assert.equal(sent,1);assert.equal(r.accepted,1);assert.equal(db.calls[1][1].p_outcome,'accepted');assert.equal(r.delivered,undefined);
});
test('all sends require atomic claim and whole-run upper bound15',async()=>{
 const db=mock(Array.from({length:30},claim));let sent=0;
 const r=await dispatchDailyRegistrationWelcome(db,{limit:100,sendImpl:async()=>{sent++;return {success:true,metaMessageId:"fixture"};}});
 assert.equal(sent,15);assert.equal(r.accepted,15);assert.equal(db.calls.filter(([n])=>n==='claim_daily_welcome').length,15);
});
test('simulation and missing credentials do not consume attempts or loop',async()=>{
 for(const response of [{success:true,simulated:true},{success:false,skipped:'missing_credentials'}]){
  const db=mock([claim(),claim()]);let sent=0;
  const r=await dispatchDailyRegistrationWelcome(db,{sendImpl:async()=>{sent++;return response;}});
  assert.equal(sent,1);assert.equal(r.not_attempted,1);assert.equal(db.calls[1][1].p_outcome,'not_attempted');
 }
});
test('foreign or unsupported payload is rejected before network',async()=>{
 const db=mock([{...claim(),payload:{...payload,to:'447700900123'}}]);let sent=0;
 const r=await dispatchDailyRegistrationWelcome(db,{sendImpl:async()=>sent++});assert.equal(sent,0);assert.equal(r.not_attempted,1);
});
test('provider rejection, missing result and exceptions remain held and consume attempts',async()=>{
 for(const sendImpl of [async()=>({success:false,status:400,error:'rejected'}),async()=>null,async()=>{throw Error('network');}]){
  const db=mock([claim(),claim()]);const r=await dispatchDailyRegistrationWelcome(db,{sendImpl});assert.equal(r.uncertain,1);assert.equal(db.calls[1][1].p_outcome,'uncertain');assert.equal(db.calls.length,2);
 }
});
test('failed persistence stops immediately with ticket held, no resend',async()=>{
 for(const options of [{finishError:true},{finishThrow:true},{finishValue:false}]){
  const db=mock([claim(),claim()],options);let sent=0;
  const r=await dispatchDailyRegistrationWelcome(db,{sendImpl:async()=>{sent++;return {success:true,metaMessageId:"fixture"};}});assert.equal(sent,1);assert.equal(r.error,'daily_settle_failed_held');assert.equal(db.calls.length,2);
 }
});
test('missing claim ticket never sends',async()=>{
 const db=mock([{taken:true,payload}]);let sent=0;const r=await dispatchDailyRegistrationWelcome(db,{sendImpl:async()=>sent++});assert.equal(sent,0);assert.equal(r.error,'daily_claim_invalid');
});

test('success without provider message identifier is held, not reported accepted',async()=>{
 const db=mock([claim()]);const r=await dispatchDailyRegistrationWelcome(db,{sendImpl:async()=>({success:true})});assert.equal(r.accepted,0);assert.equal(r.uncertain,1);
});
