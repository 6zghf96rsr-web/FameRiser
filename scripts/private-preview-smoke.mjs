import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const port=8766;
const origin=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,[
  '--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js',
  'dev','--config','dist/server/wrangler.json','--local','--persist-to','.wrangler/state',
  '--ip','127.0.0.1','--inspector-port','0','--port',String(port),
  '--var','CORE_V1_PRIVATE_ENABLED:true','--var',`APP_URL:${origin}`,
  '--var','RANKME_DEMO:false','--var','PAYMENTS_ENABLED:false',
],{cwd:root,env:{...process.env,CORE_V1_PRIVATE_ENABLED:'true',
  RANKME_DEMO:'false',PAYMENTS_ENABLED:'false',APP_URL:origin},
  stdio:['ignore','pipe','pipe']});
let output='';let exited=false;
server.on('exit',()=>{exited=true;});
server.on('error',error=>{output+=`\n${error.message}`;exited=true;});
for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>{output=(output+chunk.toString()).slice(-6000);});
try{
  let ready=false;
  for(let i=0;i<100&&!exited;i++){
    try{const r=await fetch(origin+'/private/login',{signal:AbortSignal.timeout(1500)});
      if(r.ok){ready=true;break;}}
    catch{/* wait for Worker */}
    await delay(400);
  }
  assert.ok(ready,`Private preview unavailable: ${output}`);
  const home=await fetch(origin+'/',{redirect:'manual'});
  assert.equal(home.status,307);
  assert.equal(new URL(home.headers.get('location'),origin).pathname,'/private');
  const login=await fetch(origin+'/private/login');
  assert.equal(login.status,200);
  assert.match(await login.text(),/Nové registrace čekají/);
  const rules=await fetch(origin+'/private/rules');
  assert.equal(rules.status,200);
  assert.match(await rules.text(),/1 FC/);
  const oldApi=await fetch(origin+'/api/leaderboard');
  assert.equal(oldApi.status,410);
  assert.equal((await oldApi.json()).error,'LEGACY_DISABLED');
  const mutate=await fetch(origin+'/api/private/core',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json','Origin':origin},body:JSON.stringify({action:'youtube'})});
  assert.equal(mutate.status,401,`Unauthenticated mutation: ${mutate.status} ${mutate.headers.get('location')||''} ${(await mutate.text()).slice(0,400)}`);
  console.log('Private preview smoke passed: redirect, login, new rules, legacy API block and auth gate.');
}finally{
  if(!exited){server.kill('SIGTERM');await Promise.race([new Promise(resolve=>server.once('exit',resolve)),delay(3000)]);if(!exited)server.kill('SIGKILL');}
}
