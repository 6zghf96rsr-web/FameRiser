import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

// Exercise the exported HTTP route and real API handler, not just its inner RPC.
// Session/storage boundaries are isolated; no production data is touched.
await build({
  stdin: { contents: `export * from './app/api/[...path]/route';
    export {fixture} from '@/lib/supabase/server';`, resolveDir: process.cwd() },
  outfile: 'work/review-routes-fixture.mjs', bundle: true, platform: 'node', format: 'esm', packages: 'external',
  plugins: [{ name: 'review-route-boundaries', setup(b) {
    b.onResolve({filter: /^(?:@\/lib\/supabase\/server|next\/server|next\/headers)$/}, a => ({path:a.path, namespace:'review-route'}));
    b.onLoad({filter:/.*/, namespace:'review-route'}, a => ({contents:
      a.path === 'next/server' ? `export const NextResponse={json:(value,init)=>Response.json(value,init)};` :
      a.path === 'next/headers' ? `export const cookies=async()=>({});` : `
      export const fixture={user:{id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-09-22'},calls:[],rpcError:null};
      export const configured=()=>true, demoEnabled=()=>false, publicConfig=()=>({});
      export const getUser=async()=>fixture.user;
      export const sessionDB=async()=>({});
      export function adminDB(){return {
        from(table){const q={select:()=>q,eq:()=>q,in:()=>q,
          single:async()=>({data:{role:'user',banned:false},error:null}),
          maybeSingle:async()=>({data:{version:'accepted'},error:null})};return q;},
        async rpc(name,args){
          if(name==='consume_rate')return {data:true,error:null};
          fixture.calls.push({name,args});
          return {data:{ok:true},error:fixture.rpcError};
        }
      };}`
    }));
  }}],
});
const route = await import('../work/review-routes-fixture.mjs');
const {fixture} = route;
const profile = '22222222-2222-4222-8222-222222222222';
const review = '33333333-3333-4333-8333-333333333333';
const reply = '44444444-4444-4444-8444-444444444444';
const paths = [`profiles/${profile}/reviews`, `reviews/${review}/replies`];
process.env.APP_URL = 'https://fameriser.com';
function remove(path, body, origin = process.env.APP_URL) {
  return route.DELETE(new Request(`${process.env.APP_URL}/api/${path}`, {
    method:'DELETE', headers:{Origin:origin, ...(body ? {'Content-Type':'application/json'} : {})},
    ...(body ? {body:JSON.stringify(body)} : {}),
  }), {params:Promise.resolve({path:path.split('/')})});
}

test('DELETE is exported and removes the session owner’s comment without a request body', async () => {
  assert.equal(typeof route.DELETE, 'function', 'The HTTP route must expose DELETE');
  fixture.calls=[];
  const response=await remove(paths[0]);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true});
  assert.deepEqual(fixture.calls,[{name:'save_profile_review',args:{
    p_user:fixture.user.id,p_profile:profile,p_author:null,p_body:null,p_score:null,
  }}]);
});

test('DELETE forwards the reply ID, parent and authenticated owner to the ownership-enforcing RPC', async () => {
  fixture.calls=[];
  const response=await remove(paths[1],{reply_id:reply});
  assert.equal(response.status,200);
  assert.deepEqual(fixture.calls,[{name:'save_review_reply',args:{
    p_user:fixture.user.id,p_review:review,p_body:null,p_reply:reply,
  }}]);
});

test('unauthenticated and cross-origin deletion requests never reach storage', async () => {
  const user=fixture.user;
  fixture.calls=[];
  try {
    fixture.user=null;
    for(const path of paths) assert.equal((await remove(path,{reply_id:reply})).status,401);
    fixture.user=user;
    for(const path of paths) assert.equal((await remove(path,{reply_id:reply},'https://other.example')).status,403);
    assert.deepEqual(fixture.calls,[]);
  } finally {fixture.user=user;}
});

test('deletion rejects invalid IDs and forged reply ownership and preserves database errors', async () => {
  fixture.calls=[];
  assert.equal((await remove('profiles/not-an-id/reviews')).status,400);
  assert.equal((await remove(paths[1],{reply_id:'not-an-id'})).status,400);
  assert.equal((await remove(paths[1],{reply_id:reply,p_user:profile})).status,400);
  assert.deepEqual(fixture.calls,[]);
  fixture.rpcError={message:'Reply not owned'};
  try {
    const response=await remove(paths[1],{reply_id:reply});
    assert.equal(response.status,400);
    assert.match((await response.json()).error,/vlastní odpovědi/);
  } finally {fixture.rpcError=null;}
});
