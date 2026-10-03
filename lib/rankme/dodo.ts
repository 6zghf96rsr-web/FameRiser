import {enforcePaymentMinimum} from './payment-minimum';
import DodoPayments from 'dodopayments';
import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {commerceInput,computeScore,historicalFixing,launchBlockers,type PriceCurrency} from './commerce';
import {contractHTML} from './contract';
import {policySnapshot} from './policies';
import {ServiceError} from './service-error';
export function dodoClient(){if(!process.env.DODO_PAYMENTS_API_KEY)throw new ServiceError(503,'Dodo Payments čeká na konfiguraci.');return new DodoPayments({bearerToken:process.env.DODO_PAYMENTS_API_KEY,webhookKey:process.env.DODO_PAYMENTS_WEBHOOK_KEY,environment:process.env.DODO_PAYMENTS_ENVIRONMENT==='live_mode'?'live_mode':'test_mode',timeout:10000,maxRetries:0});}
const checked=(r:any)=>{if(r.error)throw new ServiceError(503,'Platební záznam se nepodařilo uložit.');return r.data;};
export async function createDodoCheckout(raw:unknown,u:{id:string;email?:string},db:SupabaseClient){
 const v=commerceInput.parse(raw);
 if(launchBlockers(process.env).length||process.env.DODO_PAYMENTS_ENVIRONMENT!=='live_mode')throw new ServiceError(503,'Ostré platby čekají na doplnění provozovatele, schválení Dodo a právní kontrolu.');
 // A flag cannot accidentally mix the old CZK ranking with a new EUR score.
 const legacy=await db.from('payments').select('id',{count:'exact',head:true}).in('status',['paid','partially_refunded']).gt('amount',0);if(legacy.error||legacy.count)throw new ServiceError(503,'Nejdříve je nutné doloženě převést historické pořadí.');
 const p=checked(await db.from('profiles').select('id,verified,status,demo,non_political_confirmed_at,payment_required,publication_consent').eq('id',v.profile_id).eq('user_id',u.id).single());
 if(!checked(await db.rpc('page_proof_current',{p_profile:p.id})))throw new ServiceError(409,'Ověření stránky vypršelo. Obnov propojení před platbou.');
 if(!p.verified||p.demo||!['active','pending_payment'].includes(p.status))throw new ServiceError(409,'Platba vyžaduje aktivní ověření profilu.');
 if(p.payment_required&&(p.publication_consent?.public!==true||!p.non_political_confirmed_at))throw new ServiceError(409,'Nejdříve potvrď zveřejnění vybrané Facebook stránky v Propojených účtech.');
 await enforcePaymentMinimum(v.amount,v.currency);
 const product=process.env[`DODO_PRODUCT_${v.currency}`];if(!product)throw new ServiceError(503,'Tato měna zatím není nakonfigurovaná.');
 const client=dodoClient();
 const cart=[{product_id:product,quantity:1,amount:v.amount}];
 const preview=await client.checkoutSessions.preview({product_cart:cart,billing_address:{country:v.country as any},billing_currency:v.currency});
 if(preview.currency!==v.currency||preview.current_breakup.total_amount!==v.amount||preview.product_cart.length!==1||!preview.product_cart[0].tax_inclusive)throw new ServiceError(409,'Cena včetně daně neodpovídá nabídce. Platba nebyla vytvořena.');
 const acceptedAt=new Date().toISOString(),snapshot=policySnapshot(),operator={name:process.env.BUSINESS_NAME,address:process.env.BUSINESS_ADDRESS,id:process.env.BUSINESS_ID,support:process.env.SUPPORT_EMAIL};
 const documents={...snapshot,operator,html:contractHTML(snapshot,operator,v.amount,v.currency,v.country,acceptedAt),buyer_terms_url:'https://dodopayments.com/buyer-terms'},digest=createHash('sha256').update(JSON.stringify(documents)).digest('hex');
 let order=checked(await db.from('dodo_orders').select('*').eq('request_id',v.request_id).maybeSingle());
 if(!order){const r=await db.from('dodo_orders').insert({request_id:v.request_id,created_at:acceptedAt,user_id:u.id,profile_id:p.id,amount:v.amount,currency:v.currency,billing_country:v.country,product_id:product,documents,documents_hash:digest,consents:{adult:true,immediate:true,non_political:true,accepted:true,version:v.version}}).select('*').single();order=r.error?.code==='23505'?checked(await db.from('dodo_orders').select('*').eq('request_id',v.request_id).single()):checked(r);}
 if(order.user_id!==u.id||order.profile_id!==p.id||order.amount!==v.amount||order.currency!==v.currency||order.billing_country!==v.country||order.status!=='pending')throw new ServiceError(409,'Platební požadavek neodpovídá uložené objednávce.');
 if(Date.now()-Date.parse(order.created_at)>23*3600000)throw new ServiceError(409,'Objednávka vypršela. Vytvoř novou.');
 if(order.checkout_url)return {url:order.checkout_url};
 const session=await client.checkoutSessions.create({product_cart:cart,billing_address:{country:v.country as any},billing_currency:v.currency,customer:{email:u.email!,name:'FameRiser creator'},return_url:process.env.APP_URL+'/dashboard?payment=processing',cancel_url:process.env.APP_URL+'/dashboard?payment=cancelled',metadata:{fameriser_order:order.id},feature_flags:{allow_currency_selection:false,allow_discount_code:false,allow_customer_editing_country:false,allow_customer_editing_email:false,allow_phone_number_collection:false,allow_tax_id:false}},{headers:{'Idempotency-Key':order.id}});
 if(!session.checkout_url)throw new ServiceError(503,'Platební odkaz není dostupný.');
 checked(await db.from('dodo_orders').update({session_id:session.session_id,checkout_url:session.checkout_url}).eq('id',order.id));return {url:session.checkout_url};
}
export async function dodoWebhook(req:Request,db:SupabaseClient){
 if(!process.env.DODO_PAYMENTS_WEBHOOK_KEY)throw new ServiceError(503,'Webhook není nakonfigurovaný.');
 const raw=await req.text();if(raw.length>500000)throw new ServiceError(413,'Webhook příliš velký.');
 const client=dodoClient();let event:any;try{event=client.webhooks.unwrap(raw,{headers:Object.fromEntries(req.headers)});}catch{throw new ServiceError(401,'Neplatný podpis webhooku.');}
 const eventId=req.headers.get('webhook-id')!;
 if(checked(await db.from('dodo_events').select('id').eq('id',eventId).maybeSingle()))return {received:true};
 if(!/^(payment\.succeeded|refund\.|dispute\.)/.test(event.type))return {received:true};
 const paymentId=event.data?.payment_id;if(typeof paymentId!=='string')throw new ServiceError(400,'Chybí identifikátor platby.');
 const payment=await client.payments.retrieve(paymentId);
 const orderId=payment.metadata.fameriser_order;if(typeof orderId!=='string')return {received:true};
 const order=checked(await db.from('dodo_orders').select('*').eq('id',orderId).single());
 if(!order.paid_at&&event.type!=='payment.succeeded')return {received:true}; // success retrieves all current refunds, including earlier deliveries
 if(payment.status!=='succeeded'||payment.payment_provider!=='dodo'||payment.currency!==order.currency||payment.total_amount!==order.amount||!payment.product_cart?.some(p=>p.product_id===order.product_id&&p.quantity===1)||payment.product_cart.length!==1||(order.session_id&&payment.checkout_session_id!==order.session_id))throw new ServiceError(409,'Platba neodpovídá objednávce; nutná kontrola.');
 if(payment.tax==null||!Number.isSafeInteger(payment.tax)||payment.tax<0||payment.tax>payment.total_amount)throw new ServiceError(409,'Chybí doložená daň. Pořadí nebylo změněno.');
 const paidAt=order.paid_at||event.timestamp;
 if(typeof paidAt!=='string'||!Number.isFinite(Date.parse(paidAt)))throw new ServiceError(400,'Neplatný čas platby.');
 let fixing={rate:order.fx_rate,date:order.fx_date};
 if(!order.paid_at){const fx=await fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml',{signal:AbortSignal.timeout(8000)});if(!fx.ok)throw new ServiceError(503,'Kurzovní data nejsou dostupná.');fixing=historicalFixing(await fx.text(),order.currency as PriceCurrency,paidAt);}
 const succeeded=payment.refunds.filter(r=>r.status==='succeeded');
 if(succeeded.some(r=>r.amount==null||r.currency!==payment.currency||!Number.isSafeInteger(r.amount)))throw new ServiceError(409,'Refundace vyžaduje kontrolu měny a částky.');
 const refunded=succeeded.reduce((n,r)=>n+r.amount!,0);
 const review=payment.disputes.some(d=>!['dispute_won','dispute_cancelled'].includes(d.dispute_status));
 checked(await db.rpc('apply_dodo_payment',{p_order:order.id,p_event:eventId,p_kind:event.type,p_payment:payment.payment_id,p_tax:payment.tax,p_fx:fixing.rate,p_fx_date:fixing.date,p_score:order.paid_at?order.rank_score:computeScore(payment.total_amount-payment.tax,order.currency,fixing.rate),p_refund:refunded,p_review:review,p_paid_at:paidAt}));return {received:true};
}
export async function requestDodoRefund(id:string,adminId:string,db:SupabaseClient){
 const o=checked(await db.from('dodo_orders').select('*').eq('id',id).single());
 if(!o.provider_payment_id||!['paid','review'].includes(o.status))throw new ServiceError(409,'Platbu nyní nelze refundovat.');
 const claim=await db.from('dodo_refund_jobs').insert({order_id:o.id,admin_id:adminId}).select('*').single();
 let job=claim.error?.code==='23505'?checked(await db.from('dodo_refund_jobs').select('*').eq('order_id',o.id).single()):checked(claim);
 if(job.provider_refund_id)return {message:'Žádost o refundaci již byla předána Dodo.'};
 if(Date.now()-Date.parse(job.created_at)>23*3600000)throw new ServiceError(409,'Stav dřívější žádosti ověř v Dodo. Automatické opakování by mohlo vytvořit duplicitu.');
 const refund=await dodoClient().refunds.create({payment_id:o.provider_payment_id,reason:'Approved FameRiser customer request'},{headers:{'Idempotency-Key':'refund-'+o.id}});
 checked(await db.from('dodo_refund_jobs').update({provider_refund_id:refund.refund_id}).eq('order_id',o.id));
 return {message:'Žádost předána Dodo. Pořadí upraví až potvrzená refundace.'};
}
