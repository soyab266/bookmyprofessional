import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomerBookingDetails, buildProfessionalBookingDetails, buildCustomerRegistrationReceived, buildProfessionalRegistrationReceived, buildTemplateMessage, META_TEMPLATE } from '../src/lib/meta-whatsapp-templates.js';
import { validateTemplateMessage } from '../src/lib/meta-whatsapp-validate.js';
const booking={id:'BMP-SAMPLE001',customer_id:'customer',professional_id:'pro',service_title:'Home tutoring',date:'2026-11-25',time_slot:'10:00 AM',address:'Sample address, Mumbai',total_paid:'500.00'};
const customer={id:'customer',full_name:'Sample Customer',phone:'+91 90000 00001'};
const args={to:'9000000002',booking};
const params=p=>p.template.components[0].parameters.map(p=>p.text);
test('fuller approved customer seven-field order, no contact leak',()=>{
 const p=buildCustomerBookingDetails({...args,customerName:customer.full_name});
 assert.equal(p.template.name,'bmp_booking_details_v2');
 assert.deepEqual(params(p),['Sample Customer','BMP-SAMPLE001','Home tutoring','Wednesday, 25 November 2026','10:00 AM','Sample address, Mumbai','₹500.00']);
 assert.equal(validateTemplateMessage(p).ok,true);assert.ok(!JSON.stringify(p).includes(customer.phone));
});
test('fuller approved professional eight-field order, gross not net',()=>{
 const p=buildProfessionalBookingDetails({...args,professionalName:'Sample Professional',customer});
 assert.equal(p.template.name,'bmp_professional_booking_details_v2');
 assert.deepEqual(params(p),['Sample Professional','BMP-SAMPLE001','Home tutoring','Sample Customer (+91 90000 00001)','Wednesday, 25 November 2026','10:00 AM','Sample address, Mumbai','₹500.00']);
 assert.equal(validateTemplateMessage(p).ok,true);
 const noPhone=buildProfessionalBookingDetails({...args,customer:{...customer,phone:null}});
 assert.equal(params(noPhone)[3],'Sample Customer');
});
test('fuller builders fail closed for incomplete receipts or wrong customer',()=>{
 for(const patch of [{id:''},{service_title:''},{date:'bad'},{time_slot:''},{address:null},{address:' '},{total_paid:null},{total_paid:undefined},{total_paid:''},{total_paid:'bad'},{total_paid:-1}]) {
  assert.equal(buildCustomerBookingDetails({...args,booking:{...booking,...patch}}),null,JSON.stringify(patch));
  assert.equal(buildProfessionalBookingDetails({...args,customer,booking:{...booking,...patch}}),null);
 }
 for(const c of [null,{id:'wrong',full_name:'Other'}])assert.equal(buildProfessionalBookingDetails({...args,customer:c}),null);
});
test('new template counts cannot accept old five-field bodies',()=>{
 for(const name of [META_TEMPLATE.BOOKING_DETAILS,META_TEMPLATE.PRO_BOOKING_DETAILS]){
  assert.equal(buildTemplateMessage({to:args.to,templateName:name,bodyParams:['a','b','c','d','e']}),null);
 }
 const p=buildCustomerBookingDetails(args);p.template.components[0].parameters.push({type:'text',text:'extra'});assert.equal(validateTemplateMessage(p).ok,false);
});
test('new detail parameters sanitize lines without truncating contact or address',()=>{
 const p=buildProfessionalBookingDetails({...args,booking:{...booking,address:'Flat 1\nStreet\tMumbai'},customer:{...customer,full_name:'Sample\nCustomer'}});
 const v=validateTemplateMessage(p);assert.equal(v.ok,true);assert.equal(params(v.sanitised)[6],'Flat 1 Street Mumbai');assert.equal(params(v.sanitised)[3],'Sample Customer (+91 90000 00001)');
});
test('welcome payloads remain exactly one parameter with old identities',()=>{
 const a=buildCustomerRegistrationReceived({to:args.to,customerName:'Customer'});const b=buildProfessionalRegistrationReceived({to:args.to,professionalName:'Professional'});
 assert.equal(a.template.name,'bmp_customer_registration_received');assert.deepEqual(params(a),['Customer']);assert.equal(b.template.name,'bmp_professional_registration_received');assert.deepEqual(params(b),['Professional']);
});
