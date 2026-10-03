import {test} from 'node:test';
import assert from 'node:assert/strict';
import {computeScore,remainingScore,historicalFixing,launchBlockers,commerceInput,usdMinimumMinor} from '../lib/rankme/commerce';
import {POLICY_VERSION} from '../lib/rankme/policies';
import {serviceRequestInput} from '../lib/rankme/service-requests';
test('tax-exclusive score is currency-aware, deterministic and uses integer precision',()=>{
 assert.equal(computeScore(10000,'CZK','25'),4000000);
 assert.equal(computeScore(500,'EUR','1'),5000000);
 assert.equal(computeScore(800,'JPY','160'),5000000);
 assert.equal(computeScore(101,'USD','1.1'),918181);
 assert.throws(()=>computeScore(-1,'CZK','25'));assert.throws(()=>computeScore(100,'EUR','0'));assert.throws(()=>computeScore(1.2,'EUR','1'));
});
test('refund never increases score and full refund leaves zero',()=>{assert.equal(remainingScore(4000000,12100,6050),2000000);assert.equal(remainingScore(4000000,12100,12100),0);assert.throws(()=>remainingScore(100,10,11));});
test('ECB fixing excludes payment day to avoid retroactively using a not-yet-published rate',()=>{
 const xml=`<Cube time='2026-09-17'><Cube currency='CZK' rate='99'/></Cube><Cube time='2026-09-16'><Cube currency='CZK' rate='25'/></Cube>`;
 assert.deepEqual(historicalFixing(xml,'CZK','2026-09-17T01:00:00Z'),{date:'2026-09-16',rate:'25'});
 assert.throws(()=>historicalFixing(xml,'CZK','2026-10-01T00:00:00Z'));
});
test('launch requires all independent safeguards, not just payments flag',()=>{assert.ok(launchBlockers({PAYMENTS_ENABLED:'true'}).includes('DODO_APPROVED'));assert.ok(launchBlockers({}).includes('BUSINESS_ID'));});
test('checkout rejects underage, missing consent, fractional minor units and microtransactions',()=>{
 const v={profile_id:crypto.randomUUID(),request_id:crypto.randomUUID(),currency:'USD',amount:500,country:'CZ',accepted:true,adult:true,immediate:true,non_political:true,version:POLICY_VERSION};assert.ok(commerceInput.safeParse(v).success);
 for(const edit of [{adult:false},{amount:499},{amount:500.1},{amount:1000000},{immediate:false},{non_political:false},{version:'old'}])assert.equal(commerceInput.safeParse({...v,...edit}).success,false);
});
test('withdrawal requires no reason; appeal does',()=>{const v={request_id:crypto.randomUUID(),kind:'withdrawal',name:'Test User',email:'test@example.com',reference:'payment-1'};assert.ok(serviceRequestInput.safeParse(v).success);assert.equal(serviceRequestInput.safeParse({...v,kind:'appeal'}).success,false);});

import {dodoWebhook} from '../lib/rankme/dodo';
import {contractHTML} from '../lib/rankme/contract';
import {policySnapshot} from '../lib/rankme/policies';
import {createHmac} from 'node:crypto';
test('Dodo rejects forged webhooks before any database or provider call; signed replay is a no-op',async()=>{
 const oldKey=process.env.DODO_PAYMENTS_API_KEY,oldHook=process.env.DODO_PAYMENTS_WEBHOOK_KEY;
 const secret=Buffer.alloc(32,1);process.env.DODO_PAYMENTS_API_KEY='test_not_a_real_key';process.env.DODO_PAYMENTS_WEBHOOK_KEY='whsec_'+secret.toString('base64');
 try{
  const forbiddenDB={from(){throw new Error('database must not be touched')}} as any;
  await assert.rejects(()=>dodoWebhook(new Request('https://example.test/api/dodo/webhook',{method:'POST',body:'{}'}),forbiddenDB),(e:any)=>e.status===401);
  const body=JSON.stringify({type:'payment.succeeded',timestamp:new Date().toISOString(),data:{payment_id:'pay_test'}}),id='evt_replay',ts=Math.floor(Date.now()/1000).toString();
  const signature=createHmac('sha256',secret).update(`${id}.${ts}.${body}`).digest('base64');
  const db={from(table:string){assert.equal(table,'dodo_events');return {select(){return this},eq(){return this},maybeSingle:async()=>({data:{id},error:null})}}} as any;
  assert.deepEqual(await dodoWebhook(new Request('https://example.test/api/dodo/webhook',{method:'POST',body,headers:{'webhook-id':id,'webhook-timestamp':ts,'webhook-signature':'v1,'+signature}}),db),{received:true});
 }finally{if(oldKey===undefined)delete process.env.DODO_PAYMENTS_API_KEY;else process.env.DODO_PAYMENTS_API_KEY=oldKey;if(oldHook===undefined)delete process.env.DODO_PAYMENTS_WEBHOOK_KEY;else process.env.DODO_PAYMENTS_WEBHOOK_KEY=oldHook;}
});
test('downloadable contract contains accepted policies and escaped operator data',()=>{
 const html=contractHTML(policySnapshot(),{name:'<script>bad</script>',id:'DEMO'},12900,'CZK','CZ','2026-09-17T00:00:00Z');
 assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));assert.ok(!html.includes('<script>bad'));
 assert.ok(html.includes('sandbox srcdoc='));assert.ok(html.includes('RankScore'));assert.ok(html.includes(POLICY_VERSION));
});

import {paymentMinimum,enforcePaymentMinimum} from '../lib/rankme/payment-minimum';
test('every first payment and increment has a USD 5 minimum, rounded up in each local currency',async()=>{
 const rates={CZK:'25',EUR:'1',USD:'1.25',PLN:'4.25',JPY:'160'};
 const expected={CZK:10000,EUR:400,USD:500,PLN:1700,JPY:640};
 for(const currency of Object.keys(rates) as (keyof typeof rates)[]){
  assert.equal(usdMinimumMinor(currency,'1.25',rates[currency]),expected[currency]);
 }
 assert.equal(usdMinimumMinor('EUR','1.1','1'),455);
 assert.throws(()=>usdMinimumMinor('EUR','0','1'));
 const original=globalThis.fetch;
 const date=new Date(Date.now()-86400000).toISOString().slice(0,10);
 globalThis.fetch=async()=>new Response(`<Cube time='${date}'><Cube currency='USD' rate='1.25'/><Cube currency='CZK' rate='25'/><Cube currency='PLN' rate='4.25'/><Cube currency='JPY' rate='160'/></Cube>`);
 try{
  for(const currency of Object.keys(rates) as (keyof typeof rates)[]){
   const quote=await paymentMinimum(currency);assert.equal(quote.minimum,expected[currency]);
   await assert.rejects(()=>enforcePaymentMinimum(quote.minimum-1,currency),/5 USD/);
   await enforcePaymentMinimum(quote.minimum,currency);
   await enforcePaymentMinimum(quote.minimum+1,currency);
  }
  globalThis.fetch=async()=>new Response('',{status:503});
  await assert.rejects(()=>paymentMinimum('EUR'),/nelze přepočítat/);
  assert.equal((await paymentMinimum('USD')).minimum,500);
 }finally{globalThis.fetch=original;}
});
