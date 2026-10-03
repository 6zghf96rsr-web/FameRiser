import {createHash,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {getUser} from '@/lib/supabase/server';
import type {SupabaseClient} from '@supabase/supabase-js';
import {ACCOUNT_ACCEPTANCE_VERSIONS,POLICY_VERSION,policySnapshot} from './policies';
import {serviceRequestInput} from './service-requests';
import {dispatchMail,mailConfigured,queueMail} from './mail';
import {ServiceError} from './service-error';
export {ServiceError} from './service-error';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function input(req:Request){const text=await req.text();if(text.length>15000)throw new ServiceError(413,'Požadavek je příliš velký.');return JSON.parse(text);}
function check(r:any){if(r.error)throw new ServiceError(503,'Údaje se nepodařilo uložit nebo načíst.');return r.data;}
async function signedIn(){const u=await getUser();if(!u)throw new ServiceError(401,'Nejdříve se přihlas.');return u;}
export function workerAuthorized(req:Request){const key=process.env.MAIL_WORKER_SECRET;if(!key)return false;const a=Buffer.from(req.headers.get('authorization')||''),b=Buffer.from(`Bearer ${key}`);return a.length===b.length&&timingSafeEqual(a,b);}
export async function serviceAPI(req:Request,route:string,db:SupabaseClient,isAdmin=false){
 if(route==='account/acceptance'){
  const u=await signedIn();if(!u.email_confirmed_at)throw new ServiceError(403,'Nejdříve potvrď kontaktní e-mail.');
  if(req.method==='GET')return {accepted:!!check(await db.from('account_acceptances').select('version').eq('user_id',u.id).in('version',ACCOUNT_ACCEPTANCE_VERSIONS).maybeSingle())};
  const v=z.object({adult:z.literal(true),accepted:z.literal(true),version:z.literal(POLICY_VERSION)}).strict().parse(await input(req));
  const documents=policySnapshot();check(await db.from('account_acceptances').upsert({user_id:u.id,adult:v.adult,version:v.version,documents,documents_hash:hash(documents),accepted_at:new Date().toISOString()}));return {ok:true};
 }
 if(route==='service-requests'&&req.method==='POST'){
  const v=serviceRequestInput.parse(await input(req));const u=await getUser();
  if(['appeal','country'].includes(v.kind)&&(!u||!u.email_confirmed_at))throw new ServiceError(401,'Pro tuto žádost se přihlas účtem s potvrzeným e-mailem.');
  if(v.kind==='country'){
   const p=check(await db.from('profiles').select('id').eq('id',z.string().uuid().parse(v.reference)).eq('user_id',u!.id).maybeSingle());if(!p)throw new ServiceError(403,'Tento profil ti nepatří.');
  }
  if(v.kind==='appeal'){
   const decision=check(await db.from('moderation_decisions').select('id').eq('id',z.string().uuid().parse(v.reference)).eq('user_id',u!.id).maybeSingle());if(!decision)throw new ServiceError(404,'Rozhodnutí pro tento účet se nepodařilo najít.');
  }
  const email=['country','appeal'].includes(v.kind)?u!.email!:v.email;
  const payload={kind:v.kind,email,name:v.name,reference:v.reference,details:v.details,country:v.country||null,user_id:u?.id||null};const fingerprint=hash(payload);
  let row=check(await db.from('service_requests').select('*').eq('request_id',v.request_id).maybeSingle());
  if(!row){const result=await db.from('service_requests').insert({...payload,request_id:v.request_id,payload_hash:fingerprint}).select('*').single();if(result.error?.code==='23505')row=check(await db.from('service_requests').select('*').eq('request_id',v.request_id).single());else row=check(result);}
  if(row.payload_hash!==fingerprint)throw new ServiceError(409,'Tento identifikátor patří jiné žádosti. Obnov formulář.');
  const caseId=`FR-S-${row.case_number}`;
  await queueMail(db,'service-receipt-'+row.id,row.email,`FameRiser — přijetí žádosti ${caseId}`,`Přijali jsme tvou žádost. Číslo: ${caseId}\nDruh: ${row.kind}\nPřijato: ${row.created_at}\nJméno: ${row.name}\nReference: ${row.reference}\nText žádosti: ${row.details || "Neuveden (není povinný pro odstoupení)."}\nVyřízení a případné ověření oprávnění probíhá samostatně. Kontakt: info@fameriser.com`);
  return {case_id:caseId,created_at:row.created_at,email_state:'queued'};
 }
 if(route==='service-requests'&&req.method==='GET'){
  const u=await signedIn();return {items:check(await db.from('service_requests').select('id,case_number,kind,reference,status,resolution,created_at').eq('user_id',u.id).order('created_at',{ascending:false}).limit(100)),decisions:check(await db.from('moderation_decisions').select('*').eq('user_id',u.id).order('created_at',{ascending:false}).limit(100))};
 }
 if(route.startsWith('admin/service')){
  if(!isAdmin)throw new ServiceError(403,'Přístup pouze pro správce.');
  const u=await signedIn();
  if(req.method==='GET')return {requests:check(await db.from('service_requests').select('*').order('created_at',{ascending:false}).limit(100)),mail:check(await db.from('email_outbox').select('id,subject,status,attempts,last_error,created_at').in('status',['pending','sending','failed']).order('created_at').limit(100)),orders:check(await db.from('dodo_orders').select('id,status,amount,currency,refunded_amount,provider_payment_id').order('created_at',{ascending:false}).limit(100)),mail_configured:await mailConfigured(db)};
  const v=await input(req);
  if(v.action==='dispatch')return dispatchMail(db);
  if(v.action==='moderate'){
   const s=z.object({id:z.string().uuid(),status:z.enum(['active','under_review','hidden','banned','deleted','edit','ban_user','unban_user']),reason:z.string().trim().min(20).max(5000),rule:z.string().trim().min(3).max(500),impact:z.string().trim().min(10).max(2000),name:z.string().trim().min(2).max(60).optional(),bio:z.string().max(1000).optional(),remove_avatar:z.boolean().optional()}).parse(v);
   if(['edit','ban_user','unban_user'].includes(s.status))return {id:check(await db.rpc('decide_account_content',{p_admin:u.id,p_profile:s.id,p_action:s.status,p_reason:s.reason,p_rule:s.rule,p_impact:s.impact,p_name:s.name||null,p_bio:s.bio??null,p_remove_avatar:s.remove_avatar||false}))};
   return {id:check(await db.rpc('decide_profile',{p_admin:u.id,p_profile:s.id,p_action:s.status,p_reason:s.reason,p_rule:s.rule,p_impact:s.impact}))};
  }
  const s=z.object({id:z.string().uuid(),resolution:z.string().trim().min(20).max(5000),verified_country:z.string().regex(/^[A-Z]{2}$/).nullable().optional()}).parse(v);
  check(await db.rpc('resolve_service_request',{p_admin:u.id,p_id:s.id,p_resolution:s.resolution,p_verified_country:s.verified_country||null}));return {ok:true};
 }
 throw new ServiceError(404,'Neznámý požadavek.');
}
