import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { adminDB, configured, demoEnabled, getUser } from '@/lib/supabase/server';
import { facebookPageConsent, facebookPageCursor, facebookPageId, facebookPageList } from './facebook-pages';
import { z } from 'zod';
import type { ProviderIdentity } from './provider-profile';

const graph='https://graph.facebook.com/v25.0/';
const callbackPath='/auth/facebook-pages/callback';
const stateCookie='fameriser-pages-state', tokenCookie='fameriser-pages-session';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const cookieOptions={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const};
export class FacebookPagesError extends Error {constructor(message:string,public status=409){super(message);}}
export function facebookPagesReady(){return configured()&&!demoEnabled()&&Boolean(process.env.FACEBOOK_APP_ID&&process.env.FACEBOOK_PAGES_APP_ID&&process.env.FACEBOOK_PAGES_APP_SECRET&&process.env.APP_URL);}
function config(){
  if(!facebookPagesReady()) throw new FacebookPagesError('Připojování Facebook stránek čeká na dokončení nastavení Meta.',503);
  return {client:process.env.FACEBOOK_PAGES_APP_ID!,secret:process.env.FACEBOOK_PAGES_APP_SECRET!,callback:new URL(callbackPath,process.env.APP_URL!).href};
}
function key(){return createHash('sha256').update('fameriser-pages-session:'+config().secret).digest();}
function seal(value:unknown){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);return Buffer.concat([iv,cipher.update(JSON.stringify(value)),cipher.final(),cipher.getAuthTag()]).toString('base64url');}
function unseal(raw:string){const bytes=Buffer.from(raw,'base64url');if(bytes.length<29||bytes.length>3500)throw new Error('session');const d=createDecipheriv('aes-256-gcm',key(),bytes.subarray(0,12));d.setAuthTag(bytes.subarray(-16));return JSON.parse(Buffer.concat([d.update(bytes.subarray(12,-16)),d.final()]).toString());}

export async function startFacebookPages(userId:string){
  const {client,callback}=config(),state=randomBytes(32).toString('base64url');
  const result=await adminDB().from('social_oauth_states').insert({state_hash:hash(state),user_id:userId,verifier:'facebook-pages'});
  if(result.error)throw new FacebookPagesError('Propojení teď nelze zahájit. Zkus to znovu.',503);
  const jar=await cookies();
  jar.set(stateCookie,state,{...cookieOptions,path:callbackPath,maxAge:600});
  jar.set(tokenCookie,'',{...cookieOptions,path:'/api/connections/facebook-pages',maxAge:0});
  const url=new URL('https://www.facebook.com/v25.0/dialog/oauth');
  url.search=new URLSearchParams({client_id:client,redirect_uri:callback,response_type:'code',state,scope:'pages_show_list,pages_read_engagement',auth_type:'rerequest'}).toString();
  return url.href;
}
export async function finishFacebookPages(req:Request){
  const {client,secret,callback}=config(),url=new URL(req.url),jar=await cookies();
  const state=url.searchParams.get('state')||'',stored=jar.get(stateCookie)?.value||'';
  jar.set(stateCookie,'',{...cookieOptions,path:callbackPath,maxAge:0});
  if(!/^[\w-]{43}$/.test(state)||stored.length!==state.length||!timingSafeEqual(Buffer.from(state),Buffer.from(stored)))throw new FacebookPagesError('Neplatné nebo vypršené propojení. Spusť ho znovu.');
  const user=await getUser();if(!user)throw new FacebookPagesError('Přihlas se znovu do FameRiseru.',401);
  const consumed=await adminDB().rpc('consume_social_oauth',{p_hash:hash(state),p_user:user.id});
  if(consumed.error||consumed.data!=='facebook-pages')throw new FacebookPagesError('Propojení vypršelo nebo už bylo použito. Spusť ho znovu.');
  if(url.searchParams.has('error'))return 'facebook-pages-cancelled';
  const code=z.string().min(1).max(4096).parse(url.searchParams.get('code'));
  const tokenURL=new URL('oauth/access_token',graph);
  tokenURL.search=new URLSearchParams({client_id:client,client_secret:secret,redirect_uri:callback,code}).toString();
  const response=await fetch(tokenURL,{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new FacebookPagesError('Facebook propojení nepotvrdil. Zkus to znovu.');
  const token=z.object({access_token:z.string().min(1).max(2048),expires_in:z.number().positive().optional()}).parse(await response.json());
  // A short-lived, encrypted, HttpOnly cookie; provider credentials never reach browser JavaScript.
  const seconds=Math.min(600,token.expires_in||600);
  jar.set(tokenCookie,seal({user:user.id,token:token.access_token,expires:Date.now()+seconds*1000}),{...cookieOptions,path:'/api/connections/facebook-pages',maxAge:seconds});
  return 'facebook-pages';
}
async function pageToken(userId:string){
  config();
  try {
    const raw=(await cookies()).get(tokenCookie)?.value;if(!raw)throw new Error('missing');
    const value=z.object({user:z.string(),token:z.string().min(1).max(2048),expires:z.number()}).parse(unseal(raw));
    if(value.user!==userId||value.expires<=Date.now())throw new Error('expired');
    await assertPageOwner(value.token,userId);
    return value.token;
  }catch(error){if(error instanceof FacebookPagesError)throw error;throw new FacebookPagesError('Výběr stránek vypršel. Znovu klikni na „Připojit Facebook stránku“.');}
}
// Same-account proof is separate from Page permissions. App-scoped IDs from
// different Meta apps may only be matched through Meta's own mapping endpoint.
async function assertPageOwner(token:string,userId:string){
  const user=await getUser();
  const identity:ProviderIdentity|undefined=user?.identities?.find(i=>i.provider==='facebook');
  const expected=identity?.provider_id||identity?.identity_data?.provider_id||identity?.identity_data?.sub;
  const loginApp=process.env.FACEBOOK_APP_ID;
  if(user?.id!==userId||typeof expected!=='string'||!/^\d+$/.test(expected)||!loginApp)throw new FacebookPagesError('Nejdříve se přihlas svým Facebook účtem.');
  if(loginApp===config().client){
    const me=z.object({id:facebookPageId}).parse(await graphRead(token,'me',{fields:'id'}));
    if(me.id===expected)return;
  }else{
    const mapping=z.object({data:z.array(z.object({id:facebookPageId,app:z.object({id:facebookPageId})})).max(100)}).parse(await graphRead(token,'me/ids_for_apps',{app:loginApp,fields:'id,app'}));
    if(mapping.data.some(row=>row.id===expected&&row.app.id===loginApp))return;
  }
  throw new FacebookPagesError('Stránku připoj pod stejným Facebook účtem, kterým jsi přihlášen/a do FameRiseru. Meta musí potvrdit shodu účtu.',403);
}
async function graphRead(token:string,path:string,params:Record<string,string>){
  const url=new URL(path,graph);
  url.search=new URLSearchParams({...params,appsecret_proof:createHmac('sha256',config().secret).update(token).digest('hex')}).toString();
  const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new FacebookPagesError('Meta neposkytla přístup ke stránkám. Obnov propojení a povol seznam stránek i čtení údajů. Pokud aplikaci testuješ, musí mít tvůj účet také roli v Meta aplikaci.');
  return response.json();
}
async function readPages(token:string,after?:string){
  const params:Record<string,string>={fields:'id,name,tasks,category,picture',limit:'100'};
  if(after)params.after=facebookPageCursor.parse(after);
  return facebookPageList(await graphRead(token,'me/accounts',params));
}
export async function listFacebookPages(userId:string,after?:string){return readPages(await pageToken(userId),after);}
export async function connectFacebookPage(userId:string,pageId:string,rawConsent:unknown){
  const consent=facebookPageConsent.parse(rawConsent);
  facebookPageId.parse(pageId);const token=await pageToken(userId);
  // Re-fetch authoritative membership on every write. A submitted Page ID is never proof.
  let after:string|undefined;const seen=new Set<string>();
  for(let n=0;n<50;n++){
    const result=await readPages(token,after),page=result.pages.find(p=>p.id===pageId);
    if(page){
      const grant=await durableGrant(token);
      const saved=await adminDB().rpc('prepare_monitored_facebook_page',{p_user:userId,p_remote_id:page.id,p_label:page.name,p_avatar:page.avatar_url,p_version:consent.version,p_accepted:consent.accepted,p_non_political:consent.non_political,p_token:seal({token:grant.token}),p_expires:grant.expires});
      if(saved.error)throw new FacebookPagesError(/23505/.test(saved.error.code)||/already connected/i.test(saved.error.message)?'Tato stránka už je propojená s jiným účtem FameRiser.':'Ověřenou stránku nelze uložit. Zkus to znovu později.');
      return saved.data as {id:string;profile_id:string};
    }
    if(!result.after||seen.has(result.after))break;
    seen.add(result.after);after=result.after;
  }
  throw new FacebookPagesError('Meta nepotvrdila oprávnění tuto stránku spravovat. Obnov seznam a vyber dostupnou stránku.',403);
}

// Store only an encrypted user grant, never a Page token: /me/accounts must keep
// proving that this particular person still has management/content authority.
async function durableGrant(token:string){
  const {client,secret}=config();
  const url=new URL('oauth/access_token',graph);
  url.search=new URLSearchParams({grant_type:'fb_exchange_token',client_id:client,client_secret:secret,fb_exchange_token:token}).toString();
  const response=await fetch(url,{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new FacebookPagesError('Průběžné ověřování se nepodařilo připravit. Propojení zkus znovu.');
  const grant=z.object({access_token:z.string().min(1).max(2048),expires_in:z.number().positive().max(60*24*3600)}).parse(await response.json());
  return {token:grant.access_token,expires:new Date(Date.now()+grant.expires_in*1000).toISOString()};
}
export async function probePageGrant(token:string,pageId:string,deadline=Date.now()+20000):Promise<'valid'|'permission_removed'|'token_expired'|'provider_unavailable'>{
  let after:string|undefined;const seen=new Set<string>();
  try{
    for(let n=0;n<50&&Date.now()<deadline;n++){
      const url=new URL('me/accounts',graph);
      url.search=new URLSearchParams({fields:'id,name,tasks',limit:'100',...(after?{after}:{}),appsecret_proof:createHmac('sha256',config().secret).update(token).digest('hex')}).toString();
      const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(Math.max(1,Math.min(8000,deadline-Date.now())))});
      const body=await response.json();
      const error=z.object({error:z.object({code:z.number().optional(),is_transient:z.boolean().optional()}).optional()}).safeParse(body);
      const providerError=error.success?error.data.error:undefined;
      if(!response.ok){
        if(providerError?.is_transient||response.status>=500||response.status===429)return 'provider_unavailable';
        if(providerError?.code===190)return 'token_expired';
        if([10,200].includes(providerError?.code??0))return 'permission_removed';
        return 'provider_unavailable';
      }
      const result=facebookPageList(body);
      if(result.pages.some(page=>page.id===pageId))return 'valid';
      if(!result.after)return 'permission_removed';
      if(seen.has(result.after))return 'provider_unavailable';
      seen.add(result.after);after=result.after;
    }
  }catch{/* Do not log provider responses or credentials. A network failure isn't a revocation. */}
  return 'provider_unavailable';
}
export async function checkFacebookPageGrants(){
  const db=adminDB();
  const jobs=await db.rpc('claim_page_checks');
  if(jobs.error)throw new FacebookPagesError('Kontrolu oprávnění nelze zahájit.',503);
  let processed=0;const deadline=Date.now()+20000;
  for(const job of jobs.data||[]){
    if(Date.now()>=deadline)break; // Unfinished claims become eligible again after five minutes.
    let result:'valid'|'permission_removed'|'token_expired'|'provider_unavailable'='provider_unavailable';
    if(Date.parse(job.token_expires_at)<=Date.now())result='token_expired';
    else{
      const connection=await db.from('social_connections').select('remote_id').eq('id',job.connection_id).maybeSingle();
      if(connection.error)continue;
      if(!connection.data)continue;
      try{const grant=z.object({token:z.string().min(1).max(2048)}).parse(unseal(job.encrypted_token));result=await probePageGrant(grant.token,facebookPageId.parse(connection.data.remote_id),deadline);}catch{/* Key rotation or invalid ciphertext must never renew proof. */}
    }
    const saved=await db.rpc('finish_page_check',{p_connection:job.connection_id,p_version:job.version,p_result:result});
    if(saved.error)throw new FacebookPagesError('Výsledek kontroly nelze uložit.',503);
    if(saved.data)processed++;
  }
  return {processed};
}
