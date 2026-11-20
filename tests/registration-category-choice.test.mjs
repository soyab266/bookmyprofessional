import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for(const [path,form,setter] of [['src/app/register/RegisterClient.jsx','form','setForm'],['src/components/AuthModal.jsx','signupForm','setSignupForm']]){
 const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 test(path+' starts blank and never auto-selects the first loaded category',()=>{
  assert.match(source,/category: "",/);assert.doesNotMatch(source,/category: "Doctors"|category: cats\[0\]/);
  const expression=source.match(new RegExp(setter+'\\(\\(f\\) => ([^;]+)\\);'))[1];
  const refresh=new Function('f','cats','return '+expression);
  assert.deepEqual(refresh({category:'',subcategory:''},['Doctor','Tutor']),{category:'',subcategory:''});
  const chosen={category:'Tutor',subcategory:'Math'};assert.equal(refresh(chosen,['Doctor','Tutor']),chosen);
  assert.deepEqual(refresh(chosen,['Doctor']),{category:'',subcategory:''});
 });
 test(path+' requires deliberate valid category before downstream signup requests',()=>{
  const start=source.indexOf(`      if (!${form}.category || !categories.includes(${form}.category))`);
  assert.ok(start>0);const end=source.indexOf('      const availableSubs',start);
  const validate=new Function(form,'categories','setErrorMessage',source.slice(start,end)+'return "continue";');
  let error='';assert.equal(validate({category:''},['Doctor'],x=>error=x),undefined);assert.equal(error,'Please select your profession category.');
  assert.equal(validate({category:'gone'},['Doctor'],()=>{}),undefined);
  assert.equal(validate({category:'Doctor'},['Doctor'],()=>{}),'continue');
  assert.match(source,/<option value="" disabled>Select your category<\/option>/);
  assert.match(source,new RegExp('required\\s+value=\\{'+form+'\\.category\\}'));
  assert.ok(source.includes('category: e.target.value, subcategory: ""'));
 });
}
