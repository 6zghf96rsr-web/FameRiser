import { build } from 'esbuild';
import { test } from 'node:test';
import assert from 'node:assert/strict';
await build({stdin:{contents:`export * from './lib/rankme/facebook-pages-server';export * from './lib/rankme/facebook-pages';export {POLICY_VERSION} from './lib/rankme/policies';export {connectProviderProfile} from './lib/rankme/provider-profile-server';export {fixture} from '@/lib/supabase/server';`,resolveDir:process.cwd()},outfile:'work/facebook-pages-fixture.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'page-proof-fixture',setup(b){
 b.onResolve({filter:/^(?:@\/lib\/supabase\/server|next\/headers)$/},a=>({path:'fixture',namespace:'page-proof'}));
 b.onLoad({filter:/.*/,namespace:'page-proof'},()=>({contents:`
 export const fixture={owner:'owner-1',cookies:new Map(),states:new Map(),saved:[],failSave:false};
 export const configured=()=>true,demoEnabled=()=>false;
 export const getUser=async()=>fixture.owner?{id:fixture.owner,identities:[{provider:'facebook',provider_id:'321'}]}:null;
 export const cookies=async()=>({get:n=>fixture.cookies.get(n),set:(n,value,options)=>{if(!options.maxAge)fixture.cookies.delete(n);else fixture.cookies.set(n,{value,options});}});
 export const adminDB=()=>({from:()=>({insert:async row=>{fixture.states.set(row.state_hash,row);return {error:null}}}),rpc:async(name,args)=>{
  if(name==='consume_social_oauth'){const row=fixture.states.get(args.p_hash);if(!row||row.user_id!==args.p_user)return {error:{}};fixture.states.delete(args.p_hash);return {data:row.verifier};}
  if(fixture.failSave)return {error:{code:'23505',message:'duplicate'}};
  if(name==='prepare_monitored_facebook_page'){fixture.saved.push(args);return {data:{id:'connection-id',profile_id:'profile-id'}};}
  if(name==='activate_login_profile'){fixture.activated=args;return {data:'profile-id'};}
  fixture.saved.push(args);return {data:'connection-id'};
 }});`}));
}}]});
const m=await import('../work/facebook-pages-fixture.mjs');
process.env.FACEBOOK_APP_ID='123';process.env.FACEBOOK_PAGES_APP_ID='123';process.env.FACEBOOK_PAGES_APP_SECRET='test-secret-not-real';process.env.APP_URL='https://fameriser.com';
const consent={accepted:true,non_political:true,version:m.POLICY_VERSION};
const page=(id='99',tasks=['MANAGE'])=>({id,name:'Test Page',tasks,picture:{data:{url:'https://example.com/avatar.png'}},category:'Creator'});
test('Page list only includes management/content authority and never exposes provider tokens',()=>{
 const result=m.facebookPageList({data:[{...page(),access_token:'secret'},page('88',['ANALYZE']),page('77',['PROFILE_PLUS_CREATE_CONTENT']),page('66',[])],paging:{next:'https://evil.test/?access_token=secret',cursors:{after:'safe-cursor'}}});
 assert.deepEqual(result.pages.map(p=>p.id),['99','77']);assert.equal(result.after,'safe-cursor');
 assert.equal(result.pages[0].social_url,'https://facebook.com/99');assert.ok(!JSON.stringify(result).includes('secret'));
 assert.equal(m.facebookPageList({data:[{...page(),picture:{data:{url:'https://example.com/?access_token=secret'}}}]}).pages[0].avatar_url,null);
 assert.throws(()=>m.facebookPageList({data:[page('../me')]}));
});
test('Pages OAuth binds state and encrypted credential to owner, rechecks page authority before saving',async()=>{
 const original=global.fetch;let data=[page()],urls=[],facebookOwner='321',mappedOwner='321';
 global.fetch=async(raw,options)=>{
  const url=new URL(raw);urls.push(url);
  assert.equal(options.redirect,'manual');
  if(url.pathname.endsWith('/oauth/access_token'))return Response.json({access_token:'provider-token',expires_in:3600});
  assert.equal(url.origin,'https://graph.facebook.com');
  if(url.pathname==='/v25.0/me')return Response.json({id:facebookOwner});
  if(url.pathname==='/v25.0/me/ids_for_apps')return Response.json({data:[{id:mappedOwner,app:{id:process.env.FACEBOOK_APP_ID}}]});
  assert.equal(url.pathname,'/v25.0/me/accounts');
  assert.equal(options.headers.Authorization,'Bearer provider-token');assert.ok(url.searchParams.has('appsecret_proof'));
  return Response.json({data});
 };
 try{
  const start=new URL(await m.startFacebookPages('owner-1'));
  assert.equal(start.searchParams.get('scope'),'pages_show_list,pages_read_engagement');
  assert.equal(start.searchParams.get('redirect_uri'),'https://fameriser.com/auth/facebook-pages/callback');
  const callback=new Request('https://fameriser.com/auth/facebook-pages/callback?code=test&state='+start.searchParams.get('state'));
  assert.equal(await m.finishFacebookPages(callback),'facebook-pages');assert.equal(m.fixture.saved.length,0);
  const cookie=m.fixture.cookies.get('fameriser-pages-session');assert.equal(cookie.options.httpOnly,true);assert.equal(cookie.options.maxAge,600);assert.ok(!cookie.value.includes('provider-token'));
  assert.equal((await m.listFacebookPages('owner-1')).pages.length,1);
  await assert.rejects(()=>m.listFacebookPages('another-owner'),/vypršel/);
  facebookOwner='999';await assert.rejects(()=>m.connectFacebookPage('owner-1','99',consent));assert.equal(m.fixture.saved.length,0);facebookOwner='321';
  process.env.FACEBOOK_PAGES_APP_ID='456';mappedOwner='999';await assert.rejects(()=>m.connectFacebookPage('owner-1','99',consent));mappedOwner='321';assert.equal((await m.listFacebookPages('owner-1')).pages.length,1);process.env.FACEBOOK_PAGES_APP_ID='123';
  await assert.rejects(()=>m.finishFacebookPages(callback),/Neplatné/);
  await assert.rejects(()=>m.connectFacebookPage('owner-1','101',consent),/nepotvrdila/);assert.equal(m.fixture.saved.length,0);
  data=[page('99',['ANALYZE'])];await assert.rejects(()=>m.connectFacebookPage('owner-1','99',consent),/nepotvrdila/);
  data=[page()];
  for(const bad of [undefined,{...consent,accepted:false},{...consent,non_political:false},{...consent,version:'old'}]) await assert.rejects(()=>m.connectFacebookPage('owner-1','99',bad));
  assert.equal(m.fixture.saved.length,0);
  assert.deepEqual(await m.connectFacebookPage('owner-1','99',consent),{id:'connection-id',profile_id:'profile-id'});
  assert.equal(m.fixture.activated,undefined);
  assert.ok(m.fixture.saved[0].p_token&&!m.fixture.saved[0].p_token.includes('provider-token'));assert.ok(Date.parse(m.fixture.saved[0].p_expires)>Date.now());
  const {p_token,p_expires,...saved}=m.fixture.saved[0];assert.deepEqual(saved,{p_user:'owner-1',p_remote_id:'99',p_label:'Test Page',p_avatar:'https://example.com/avatar.png',p_version:m.POLICY_VERSION,p_accepted:true,p_non_political:true});
  m.fixture.failSave=true;await assert.rejects(()=>m.connectFacebookPage('owner-1','99',consent),/jiným účtem/);
  m.fixture.cookies.set('fameriser-pages-session',{...cookie,value:cookie.value.slice(0,-8)+'xxxxxxxx'});await assert.rejects(()=>m.listFacebookPages('owner-1'),/vypršel/);
  assert.ok(urls.length>3);
 }finally{global.fetch=original;}
});
test('provider proof works with Worker-compatible redirect handling and rejects redirects without saving',async()=>{
 const original=global.fetch;const user={id:'owner-1',identities:[{provider:'facebook',provider_id:'123'}]};
 m.fixture.failSave=false;const before=m.fixture.saved.length;
 try{
  global.fetch=async(raw,options)=>{assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{location:'https://evil.example'}});};
  await assert.rejects(()=>m.connectProviderProfile(user,'facebook','test-token'),/Facebook neposkytl/);
  assert.equal(m.fixture.saved.length,before);
  global.fetch=async(raw,options)=>{assert.equal(options.redirect,'manual');assert.equal(new URL(raw).hostname,'graph.facebook.com');return Response.json({id:'123',name:'Test Owner',link:'https://facebook.com/test.owner'});};
  assert.equal(await m.connectProviderProfile(user,'facebook','test-token'),'connection-id');
  assert.equal(m.fixture.saved.length,before+1);
  assert.deepEqual(m.fixture.activated,{p_user:'owner-1',p_connection:'connection-id'});
 }finally{global.fetch=original;}
});

test('Page recheck follows all cursors and separates revoked access from provider failures',async()=>{
 const original=global.fetch;
 try{
  global.fetch=async url=>new URL(url).searchParams.has('after')?Response.json({data:[page()]}):Response.json({data:[page('88')],paging:{next:'https://untrusted.example',cursors:{after:'next'}}});
  assert.equal(await m.probePageGrant('token','99'),'valid');
  global.fetch=async()=>Response.json({data:[page('99',['ANALYZE'])]});assert.equal(await m.probePageGrant('token','99'),'permission_removed');
  global.fetch=async()=>Response.json({error:{code:190}},{status:400});assert.equal(await m.probePageGrant('token','99'),'token_expired');
  global.fetch=async()=>Response.json({error:{code:200}},{status:403});assert.equal(await m.probePageGrant('token','99'),'permission_removed');
  global.fetch=async()=>Response.json({error:{code:190,is_transient:true}},{status:500});assert.equal(await m.probePageGrant('token','99'),'provider_unavailable');
  global.fetch=async()=>Response.json({data:[],paging:{next:'https://untrusted.example',cursors:{after:'loop'}}});assert.equal(await m.probePageGrant('token','99'),'provider_unavailable');
  global.fetch=async()=>{throw new Error('offline')};assert.equal(await m.probePageGrant('token','99'),'provider_unavailable');
 }finally{global.fetch=original;}
});
