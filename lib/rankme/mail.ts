import type {SupabaseClient} from '@supabase/supabase-js';
const envConfigured=()=>Boolean(process.env.NOTICES_RESEND_API_KEY&&process.env.NOTICES_FROM_EMAIL);
async function databaseConfigured(db:SupabaseClient){try{const r=await db.rpc('database_mail_configured');return !r.error&&r.data===true}catch{return false}}
export async function mailConfigured(db:SupabaseClient){return envConfigured()||await databaseConfigured(db);}
export async function queueMail(db:SupabaseClient,key:string,to:string,subject:string,body:string){
 const {error}=await db.from('email_outbox').upsert({dedupe_key:key,recipient:to,subject,body},{onConflict:'dedupe_key',ignoreDuplicates:true});
 if(error)throw new Error('Odeslání zprávy se nepodařilo zařadit do fronty.');
}
export async function dispatchMail(db:SupabaseClient){
 if(await databaseConfigured(db)){const r=await db.rpc('process_mail_queue');if(r.error)throw r.error;return r.data as {configured:boolean;accepted:number;queued:number};}
 if(!envConfigured())return {configured:false,accepted:0};
 const {data,error}=await db.rpc('claim_email_batch');if(error)throw error;let accepted=0;
 await Promise.all((data||[]).map(async (row:any)=>{
  try{
   // Provider idempotency expires after 24h. Never risk duplicate sends from an ambiguous old lease.
   if(row.attempts>1&&Date.now()-Date.parse(row.first_attempt_at||row.created_at)>23*3600000)throw new Error('manual_review_required');
   const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.NOTICES_RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':row.id},body:JSON.stringify({from:process.env.NOTICES_FROM_EMAIL,to:[row.recipient],subject:row.subject,text:row.body}),signal:AbortSignal.timeout(8000)});
   const result=await r.json() as {id?:string;name?:string};
   if(r.status===429){let delay=Number(r.headers.get('retry-after'))||60;if(result.name==='daily_quota_exceeded')delay=Math.max(delay,(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth(),new Date().getUTCDate()+1)-Date.now())/1000);if(result.name==='monthly_quota_exceeded')delay=Math.max(delay,86400);const paused=await db.rpc('pause_mail_delivery',{p_seconds:Math.ceil(Math.max(1,Math.min(86400,delay)))});if(paused.error)throw paused.error;}if(!r.ok||!result.id)throw new Error(`provider_${r.status}`);
   const saved=await db.from('email_outbox').update({status:'sent',provider_id:result.id,sent_at:new Date().toISOString(),last_error:null}).eq('id',row.id).eq('attempts',row.attempts);if(saved.error)throw saved.error;accepted++;
  }catch(e){await db.from('email_outbox').update({status:'failed',last_error:e instanceof Error&&/^provider_\d+$|^manual_review_required$/.test(e.message)?e.message:'delivery_unconfirmed',next_attempt_at:new Date(Date.now()+Math.min(3600,60*2**row.attempts)*1000).toISOString()}).eq('id',row.id).eq('attempts',row.attempts);}
 }));
 return {configured:true,accepted};
}
