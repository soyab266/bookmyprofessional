import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmPublicProfileStatus } from '../src/lib/confirm-public-profile-status.js';
const id='63b7898e-4ce3-4b07-bf8d-aa7e1289bf2e';
function setup(anonymous, data, error=null) {
  const calls=[];
  const q={from:(...a)=>{calls.push(['from',...a]);return q;},select:(...a)=>{calls.push(['select',...a]);return q;},eq:(...a)=>{calls.push(['eq',...a]);return q;},limit:(...a)=>{calls.push(['limit',...a]);return q;},abortSignal:async signal=>{assert.ok(signal instanceof AbortSignal);return {data,error};}};
  return {calls, opts:{readAnonymousStatus:async()=>anonymous,createAdminClient:()=>q}};
}
test('RLS-hidden active pending UUID is found by bounded ID-only server confirmation',async()=>{
 const {calls,opts}=setup('missing',[{id}]);assert.equal(await confirmPublicProfileStatus(id,opts),'found');
 assert.deepEqual(calls,[['from','professionals'],['select','id'],['eq','id',id],['eq','is_active',true],['limit',1]]);
});
test('approved anonymous found and unknown failures never need privileged confirmation',async()=>{
 for(const status of ['found','unknown']) {const {calls,opts}=setup(status,[]);assert.equal(await confirmPublicProfileStatus(id,opts),status);assert.equal(calls.length,0);}
});
test('only confirmed absent or inactive UUID becomes missing',async()=>{
 assert.equal(await confirmPublicProfileStatus(id,setup('missing',[]).opts),'missing');
 for(const [rows,error] of [[null,null],[{},null],[[{id:'wrong'}],null],[[{id},{id}],null],[[],{message:'unavailable'}]]) assert.equal(await confirmPublicProfileStatus(id,setup('missing',rows,error).opts),'unknown');
});
test('no broad names scan or invalid UUID privilege probe; exceptions fail open to existing retry UI',async()=>{
 for(const invalid of ['someone','',null]) {const {calls,opts}=setup('missing',[]);assert.equal(await confirmPublicProfileStatus(invalid,opts),'unknown');assert.equal(calls.length,0);}
 assert.equal(await confirmPublicProfileStatus(id,{readAnonymousStatus:async()=>'missing',createAdminClient:()=>{throw Error('offline');}}),'unknown');
});
