import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

// Run the real callback and consent-page guards with an isolated fake session.
// No provider calls or legal acceptances are made by these tests.
await build({
  stdin: { contents: `export {GET} from './app/auth/callback/route';
    export {default as Consent} from './app/account-consent/page';
    export {canonicalLoginUrl} from './lib/rankme/auth-navigation';
    export {state} from '@/lib/supabase/server';`, resolveDir: process.cwd() },
  outfile: 'work/auth-session-fixture.mjs', bundle: true, platform: 'node', format: 'esm', packages: 'external',
  plugins: [{name:'fake-session', setup(b){
    b.onResolve({filter:/^(?:@\/lib\/supabase\/server|next\/server|next\/navigation|@\/components\/rankme\/(?:shell|service-requests))$/}, a=>({path:a.path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'}, a=>({contents:
      a.path==='next/server' ? `export const NextResponse={redirect:(url,init)=>new Response(null,{status:307,headers:{...init?.headers,Location:String(url)}})};` :
      a.path==='next/navigation' ? `export function redirect(url){throw new Error('redirect:'+url)}` :
      a.path.endsWith('/shell') ? `export const PageShell=()=>null;` :
      a.path.endsWith('/service-requests') ? `export const Acceptance=()=>null;` :
      `export const state={user:{id:'test-user'},accepted:false,exchanges:0,exchangeError:null};
       export const demoEnabled=()=>false;
       export const getUser=async()=>state.user;
       export const sessionDB=async()=>({auth:{
         exchangeCodeForSession:async()=>{state.exchanges++;return {error:state.exchangeError}},
         getUser:async()=>({data:{user:state.user}})
       }});
       export function adminDB(){const q={select:()=>q,eq:()=>q,in:()=>q,maybeSingle:async()=>({data:state.accepted?{version:'current'}:null})};return {from:()=>q};}`
    }));
  }}],
});
const {GET, Consent, canonicalLoginUrl, state} = await import('../work/auth-session-fixture.mjs');
process.env.APP_URL='https://fameriser.com';
const callback=(origin='https://fameriser.com',next='/dashboard')=>GET(new Request(origin+'/auth/callback?code=fake-code&next='+encodeURIComponent(next)));

test('login moves to canonical host before PKCE starts and preserves return path',()=>{
  assert.equal(canonicalLoginUrl('https://preview.example/login?next=%2Fconnections#_=_',process.env.APP_URL),'https://fameriser.com/login?next=%2Fconnections');
  assert.equal(canonicalLoginUrl('https://fameriser.com/login',process.env.APP_URL),null);
  assert.equal(canonicalLoginUrl('http://localhost:5173/login'),null);
});
test('legacy preview callback restarts login without stranding session cookies or forwarding code',async()=>{
  state.exchanges=0;
  const r=await callback('https://preview.example','/connections');
  assert.equal(r.headers.get('location'),'https://fameriser.com/login?error=session&next=%2Fconnections');
  assert.equal(state.exchanges,0);
  assert.equal(r.headers.get('cache-control'),'no-store');
});
test('canonical callback sends authenticated new account to consent on the same host',async()=>{
  const r=await callback();
  assert.equal(r.headers.get('location'),'https://fameriser.com/account-consent?next=%2Fdashboard');
  assert.equal(state.exchanges,1);
});
test('accepted account returns to requested internal page, never an external target',async()=>{
  state.accepted=true;
  assert.equal((await callback(undefined,'/connections')).headers.get('location'),'https://fameriser.com/connections');
  assert.equal((await callback(undefined,'/connections?add=1')).headers.get('location'),'https://fameriser.com/connections?add=1');
  assert.equal((await callback(undefined,'/dashboard?tab=settings')).headers.get('location'),'https://fameriser.com/dashboard?tab=settings');
  assert.equal((await callback(undefined,'https://evil.example')).headers.get('location'),'https://fameriser.com/dashboard');
  state.accepted=false;
});
test('new account keeps the account chooser as its destination through consent',async()=>{
  state.accepted=false;
  const r=await callback(undefined,'/connections?add=1');
  const consent=new URL(r.headers.get('location'));
  assert.equal(consent.pathname,'/account-consent');
  assert.equal(consent.searchParams.get('next'),'/connections?add=1');
});
test('missing session cannot enter consent via callback or direct page navigation',async()=>{
  state.user=null;
  assert.equal((await callback()).headers.get('location'),'https://fameriser.com/login?error=session');
  await assert.rejects(Consent(),/redirect:\/login\?error=session/);
  await assert.rejects(Consent({searchParams:Promise.resolve({next:'/connections?add=1'})}),e=>e.message==='redirect:/login?error=session&next=%2Fconnections%3Fadd%3D1');
  state.user={id:'test-user'};
  assert.ok(await Consent());
});
test('failed provider exchange returns to login',async()=>{
  state.exchangeError={message:'expired code'};
  assert.equal((await callback()).headers.get('location'),'https://fameriser.com/login?error=auth');
});
