import {z} from 'zod';
import {NextResponse} from 'next/server';
import {adminDB,getUser,sessionDB} from '@/lib/supabase/server';
import {privateCoreEnabled,privateEmailUser,privatePilotReady,PRIVATE_RULES_VERSION} from '@/lib/core/private-v1';
import {startYouTube} from '@/lib/rankme/social-oauth';

export const dynamic='force-dynamic';
const input=z.discriminatedUnion('action',[
  z.object({action:z.literal('register'),name:z.string().trim().min(2).max(80),
    country:z.union([z.string().regex(/^[A-Z]{2}$/),z.literal('')]),
    publish:z.boolean(),adult:z.literal(true),accepted:z.literal(true),
    version:z.literal(PRIVATE_RULES_VERSION)}).strict(),
  z.object({action:z.literal('attach'),connection_id:z.string().uuid(),
    category:z.string().min(1).max(100).nullable()}).strict(),
  z.object({action:z.literal('disconnect'),connection_id:z.string().uuid()}).strict(),
  z.object({action:z.literal('publish'),publish:z.boolean()}).strict(),
  z.object({action:z.literal('youtube')}).strict(),
  z.object({action:z.literal('export')}).strict(),
  z.object({action:z.literal('erase'),confirm:z.literal('SMAZAT')}).strict(),
  z.object({action:z.literal('logout')}).strict(),
]);
function answer(body:unknown,status=200){return NextResponse.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
async function limitedJson(req:Request):Promise<unknown>{
  const reader=req.body?.getReader();if(!reader)throw new Error('Empty body');
  let size=0;const chunks:Uint8Array[]=[];
  while(true){
    const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;
    if(size>4096){await reader.cancel();throw new Error('Body too large');}
    chunks.push(value);
  }
  const body=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));
}
export async function POST(req:Request){
  if(!privateCoreEnabled())return answer({error:'UNAVAILABLE'},404);
  const target=new URL(req.url);
  const expected=process.env.APP_URL?new URL(process.env.APP_URL).origin:target.origin;
  if(target.origin!==expected||req.headers.get('origin')!==expected||
    !req.headers.get('content-type')?.startsWith('application/json'))return answer({error:'FORBIDDEN'},403);
  const user=await getUser();
  if(!user||!privateEmailUser(user))return answer({error:'LOGIN_REQUIRED'},401);
  const parsed=input.safeParse(await limitedJson(req).catch(()=>null));
  if(!parsed.success)return answer({error:'INVALID_REQUEST'},422);
  const v=parsed.data;
  if(!privatePilotReady()&&!['logout','export','erase'].includes(v.action))return answer({error:'PILOT_NOT_READY'},503);
  if(v.action==='logout'){
    await (await sessionDB())?.auth.signOut();
    return answer({ok:true});
  }
  const db=adminDB();
  if(v.action==='export'){
    const quota=await db.rpc('core_v1_consume_right',{p_user:user.id,p_kind:'export'});
    if(quota.error)return answer({error:'UNAVAILABLE'},503);
    if(quota.data!==true)return answer({error:'RATE_LIMITED'},429);
    const [core,social]=await Promise.all([
      db.rpc('core_v1_export',{p_user:user.id}),
      db.from('social_connections').select('platform,social_url,label,status,method,verified_at,created_at')
        .eq('user_id',user.id),
    ]);
    if(core.error||social.error)return answer({error:'UNAVAILABLE'},503);
    return answer({exported_at:new Date().toISOString(),email:user.email,
      core:core.data,social_connections:social.data,
      note:'O starší záznamy mimo tento export lze požádat na kontaktní adrese provozovatele.'});
  }
  if(v.action==='erase'){
    const previous=await db.from('deletion_requests').select('id').eq('user_id',user.id)
      .not('prepared_at','is',null).order('created_at',{ascending:false}).limit(1);
    if(previous.error)return answer({error:'UNAVAILABLE'},503);
    if(previous.data?.length){
      await (await sessionDB())?.auth.signOut();
      return answer({ok:true,request_id:previous.data[0].id});
    }
    const quota=await db.rpc('core_v1_consume_right',{p_user:user.id,p_kind:'erase'});
    if(quota.error)return answer({error:'UNAVAILABLE'},503);
    if(quota.data!==true)return answer({error:'RATE_LIMITED'},429);
    const result=await db.rpc('request_account_erasure',{p_user:user.id});
    if(result.error)return answer({error:'UNAVAILABLE'},503);
    await (await sessionDB())?.auth.signOut();
    return answer({ok:true,request_id:result.data?.id});
  }
  const account=await db.from('users').select('banned').eq('id',user.id).single();
  if(account.error||!account.data||account.data.banned)return answer({error:'FORBIDDEN'},403);
  const quota=await db.rpc('core_v1_consume_action',{p_user:user.id});
  if(quota.error)return answer({error:'UNAVAILABLE'},503);
  if(quota.data!==true)return answer({error:'RATE_LIMITED'},429);
  if(v.action==='youtube'){
    try{return answer({url:await startYouTube(user.id)});}
    catch{return answer({error:'YOUTUBE_UNAVAILABLE'},503);}
  }
  if(v.action==='disconnect'){
    const disconnected=await db.rpc('connection_action',{
      p_user:user.id,p_action:'disconnect',p_id:v.connection_id});
    if(disconnected.error)return answer({error:'ACTION_REJECTED'},409);
    return answer({ok:true});
  }
  const result=v.action==='register'
    ?await db.rpc('core_v1_register',{p_user:user.id,p_name:v.name,
      p_country:v.country||null,p_publish:v.publish,p_adult:v.adult,p_rules_version:v.version})
    :v.action==='attach'
      ?await db.rpc('core_v1_attach_verified',{p_user:user.id,p_connection:v.connection_id,p_category:v.category})
      :await db.rpc('core_v1_set_publication',{p_user:user.id,p_publish:v.publish});
  if(result.error){
    // Do not expose SQL errors, identifiers or provider evidence to the browser.
    return answer({error:'ACTION_REJECTED'},409);
  }
  return answer({ok:true,result:result.data});
}
