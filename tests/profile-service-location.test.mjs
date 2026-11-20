import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifiedServiceLocation } from '../src/lib/registration-service-location.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('profile location binds to exact current PIN and never retains old state',()=>{
  assert.equal(verifiedServiceLocation('110001',{pincode:'400001',valid:true,city:'Mumbai',state:'Maharashtra'}),null);
  assert.equal(verifiedServiceLocation('110001',{pincode:'110001',valid:false,city:'Mumbai'}),null);
  assert.deepEqual(verifiedServiceLocation('110001',{pincode:'110001',valid:true,district:'New Delhi'}),{city:'New Delhi',state:''});
  const s=read('src/components/ServiceLocationFields.jsx');
  assert.match(s,/pincode, city: "", state: ""/);
  assert.match(s,/verifiedServiceLocation\(prev.pincode, result\)/);
  assert.doesNotMatch(s,/prev.state|readOnly|Locked/);
  assert.match(s,/Updates automatically/);
});
test('profile save uses lookup-bound location and blocks stale lookup instead of stale city',()=>{
  const s=read('src/app/vendor/page.jsx');
  assert.match(s,/verifiedServiceLocation\(vendorProfile.pincode, serviceLocationResult\)/);
  assert.match(s,/vendorProfile.pincode && !serviceLocation/);
  assert.match(s,/city: serviceLocation\?\.city \|\| ""/);
});
