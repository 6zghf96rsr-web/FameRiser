import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const owner='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
const c1='10000000-0000-4000-8000-000000000001';
const c2='10000000-0000-4000-8000-000000000002';
const c3='10000000-0000-4000-8000-000000000003';
const c4='10000000-0000-4000-8000-000000000004';
const q=async(sql,params=[])=> (await db.query(sql,params)).rows;
const one=async(sql,params=[])=> (await q(sql,params))[0];
const board=async(period='all_time')=>(await one('select public.core_v1_board($1) as value',[period])).value;
const authEvent=(email,provider='email')=>({user:{email,app_metadata:{provider}}});

await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key);
  create table public.users(id uuid primary key references auth.users(id),banned boolean not null default false);
  create table public.categories(id text primary key);
  insert into public.categories values('creators');
  create table public.social_connections(id uuid primary key,user_id uuid not null,
    platform text not null,remote_id text,status text not null,method text,
    social_url text not null,label text not null,account_kind text);
  create table public.deletion_requests(user_id uuid not null,prepared_at timestamptz);
`);
await db.exec(await readFile(new URL('../supabase/migrations/032_core_private_v1.sql',import.meta.url),'utf8'));
await q('insert into auth.users(id) values($1),($2)',[owner,other]);
await q('insert into public.users(id) values($1),($2)',[owner,other]);

test('Auth hook admits only unexpired invited email signups',async()=>{
  const check=async(event)=>(await one('select public.core_v1_before_user_created($1::jsonb) as result',
    [JSON.stringify(event)])).result;
  assert.equal((await check(authEvent('pilot@example.test'))).error.http_code,403);
  await q(`insert into core_v1.signup_invites(email,created_at,expires_at)
    values('pilot@example.test',now(),now()+interval '1 day'),
      ('old@example.test',now()-interval '2 days',now()-interval '1 hour')`);
  assert.deepEqual(await check(authEvent('PILOT@example.test')),{});
  assert.equal((await check(authEvent('pilot@example.test','facebook'))).error.http_code,403);
  assert.equal((await check(authEvent('old@example.test'))).error.http_code,403);
  assert.equal((await check(authEvent('other@example.test'))).error.http_code,403);
  assert.equal((await one('select public.core_v1_prune_limits() as result')).result.invites,1);
  assert.equal((await one('select count(*)::int as n from core_v1.signup_invites')).n,1);
  await db.exec('set role authenticated');
  await assert.rejects(()=>q('select * from core_v1.signup_invites'));
  await assert.rejects(()=>q(`select public.core_v1_before_user_created('{}'::jsonb)`));
  await db.exec('reset role');
});

test('new private core registers one creator, awards verified FC once, and hides unverified data',async()=>{
  await assert.rejects(()=>one('select public.core_v1_register($1,$2,$3,$4,$5,$6) as id',
    [owner,'Creator A','CZ',true,true,'old-policy']));
  const a=(await one('select public.core_v1_register($1,$2,$3,$4,$5,$6) as id',
    [owner,'Creator A','CZ',true,true,'2026-10-03.1'])).id;
  const b=(await one('select public.core_v1_register($1,$2,$3,$4,$5,$6) as id',
    [other,'Creator B','CZ',true,true,'2026-10-03.1'])).id;
  assert.notEqual(a,b);
  assert.equal((await board()).rows.length,0);
  await q(`insert into public.social_connections(id,user_id,platform,remote_id,status,method,social_url,label) values
    ($1,$4,'YouTube','UCaaaaaaaaaaaaaaaaaaaaaa','verified','youtube_oauth',
      'https://youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa','A channel'),
    ($2,$4,'Twitch','123','verified','provider_oauth','https://twitch.tv/a','A Twitch'),
    ($3,$5,'YouTube','UCbbbbbbbbbbbbbbbbbbbbbb','verified','youtube_oauth',
      'https://youtube.com/channel/UCbbbbbbbbbbbbbbbbbbbbbb','B channel')`,
    [c1,c2,c3,owner,other]);
  const attach=async(user,connection)=> (await one(
    'select public.core_v1_attach_verified($1,$2,$3) as value',[user,connection,'creators'])).value;
  assert.equal((await attach(owner,c1)).welcome_granted,true);
  assert.equal((await attach(owner,c1)).welcome_granted,false);
  assert.equal((await attach(owner,c2)).welcome_granted,true);
  assert.equal((await attach(other,c3)).welcome_granted,true);
  const all=await board();
  assert.equal(all.rows.length,2);
  assert.equal(all.rows[0].creator_id,a);
  assert.deepEqual(all.rows.map(row=>[row.fc,row.cash_usd_minor,row.combined_usd_minor]),
    [[2,0,200],[1,0,100]]);
  assert.equal(all.rows[0].accounts.length,2);
  assert.equal((await one('select count(*)::int as n from core_v1.fc_grants where kind=\'launch\'')).n,0);
  assert.equal((await board('daily')).rows.length,2);
  assert.equal((await board('weekly')).rows.length,2);
  await assert.rejects(()=>board('rolling_24h'));

  const beforeDisconnect=(await board()).projection_revision;
  await q('delete from public.social_connections where id in ($1,$2)',[c1,c2]);
  assert.ok((await board()).projection_revision>beforeDisconnect);
  assert.deepEqual((await board()).rows.map(row=>row.creator_id),[b]);
  assert.equal((await one('select public.core_v1_owner($1) as value',[owner])).value.fc,2);
  await q(`insert into public.social_connections(id,user_id,platform,remote_id,status,method,social_url,label) values($1,$2,'YouTube',
    'UCaaaaaaaaaaaaaaaaaaaaaa','verified','youtube_oauth',
    'https://youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa','A channel')`,[c4,owner]);
  assert.equal((await attach(owner,c4)).welcome_granted,false);
  assert.equal((await board()).rows.find(row=>row.creator_id===a).fc,2);
  assert.equal((await one('select public.core_v1_set_publication($1,false) as changed',[owner])).changed,true);
  assert.deepEqual((await board()).rows.map(row=>row.creator_id),[b]);
  assert.equal((await one('select public.core_v1_set_publication($1,true) as changed',[owner])).changed,true);
  await assert.rejects(()=>attach(other,c4));
  const page='10000000-0000-4000-8000-000000000005';
  await q(`insert into public.social_connections(id,user_id,platform,remote_id,status,method,
    social_url,label,account_kind) values($1,$2,'Facebook','990','verified','provider_oauth',
    'https://facebook.com/990','Expired page','facebook_page')`,[page,owner]);
  await assert.rejects(()=>attach(owner,page));
});

test('exact ties use public UUID and browser roles cannot cross the read/write boundary',async()=>{
  const equalAt='2026-10-03T00:00:00Z';
  await q('update core_v1.fc_grants set granted_at=$1',[equalAt]);
  await q('delete from core_v1.fc_grants where creator_id=(select id from core_v1.creators where user_id=$1) and social_account_id=(select id from core_v1.social_accounts where subject=$2)',[owner,'123']);
  const rows=(await board()).rows;
  assert.equal(rows.length,2);
  assert.equal(rows[0].fc,1);
  assert.equal(rows[1].fc,1);
  assert.deepEqual(rows.map(row=>row.creator_id),[...rows.map(row=>row.creator_id)].sort());
  await db.exec('set role authenticated');
  await assert.rejects(()=>q('select * from core_v1.creators'));
  await assert.rejects(()=>q("select public.core_v1_board('all_time')"));
  await db.exec('reset role');
});

test('welcome FC caps at ten and UTC periods exclude older grants',async()=>{
  const third='00000000-0000-4000-8000-000000000003';
  await q('insert into auth.users(id) values($1)',[third]);
  await q('insert into public.users(id) values($1)',[third]);
  const creator=(await one('select public.core_v1_register($1,$2,$3,$4,$5,$6) as id',
    [third,'Creator C','CZ',true,true,'2026-10-03.1'])).id;
  for(let i=0;i<11;i++){
    const connection=crypto.randomUUID();
    const subject='UC'+String(i).padStart(22,'0');
    await q(`insert into public.social_connections(id,user_id,platform,remote_id,status,method,social_url,label)
      values($1,$2,'YouTube',$3,'verified','youtube_oauth',$4,$5)`,
      [connection,third,subject,'https://youtube.com/channel/'+subject,'Channel '+i]);
    const result=(await one('select public.core_v1_attach_verified($1,$2,null) as value',
      [third,connection])).value;
    assert.equal(result.welcome_granted,i<10);
  }
  assert.equal((await board()).rows.find(row=>row.creator_id===creator).fc,10);
  await q(`update core_v1.fc_grants set granted_at=
    (date_trunc('week',now() at time zone 'UTC') at time zone 'UTC')-interval '1 millisecond'
    where social_account_id=(select id from core_v1.social_accounts where creator_id=$1
      order by first_attached_at,id limit 1)`,[creator]);
  await q(`update core_v1.fc_grants set granted_at=
    (date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')-interval '1 millisecond'
    where social_account_id=(select id from core_v1.social_accounts where creator_id=$1
      order by first_attached_at,id offset 1 limit 1)`,[creator]);
  assert.equal((await board()).rows.find(row=>row.creator_id===creator).fc,10);
  assert.equal((await board('daily')).rows.find(row=>row.creator_id===creator).fc,8);
  const expectedWeekly=new Date().getUTCDay()===1?8:9;
  assert.equal((await board('weekly')).rows.find(row=>row.creator_id===creator).fc,expectedWeekly);
});

test('bans hide immediately and account erasure removes new social evidence and FC',async()=>{
  for(let i=0;i<3;i++)assert.equal((await one(
    'select public.core_v1_consume_right($1,$2) as allowed',[owner,'export'])).allowed,true);
  assert.equal((await one('select public.core_v1_consume_right($1,$2) as allowed',
    [owner,'export'])).allowed,false);
  assert.equal((await one('select public.core_v1_consume_right($1,$2) as allowed',
    [owner,'erase'])).allowed,true);
  assert.equal((await one('select public.core_v1_consume_action($1) as allowed',
    [owner])).allowed,true);
  await q("update core_v1.rights_limits set window_start=now()-interval '2 days' where user_id=$1 and kind='export'",[owner]);
  await q("update core_v1.action_limits set window_start=now()-interval '2 days' where user_id=$1",[owner]);
  const pruned=(await one('select public.core_v1_prune_limits() as result')).result;
  assert.deepEqual(pruned,{actions:1,rights:1,invites:0});
  assert.equal((await one('select public.core_v1_consume_right($1,$2) as allowed',
    [owner,'export'])).allowed,true);
  const beforeBan=(await board()).projection_revision;
  await q('update public.users set banned=true where id=$1',[owner]);
  assert.ok((await board()).projection_revision>beforeBan);
  assert.ok(!(await board()).rows.some(row=>row.display_name==='Creator A'));
  await q('insert into public.deletion_requests(user_id) values($1)',[owner]);
  await q('update public.deletion_requests set prepared_at=now() where user_id=$1',[owner]);
  assert.equal((await one('select public.core_v1_owner($1) as value',[owner])).value,null);
  const saved=await one('select display_name,country,publish_requested from core_v1.creators where user_id=$1',[owner]);
  assert.equal(saved.display_name,'Odstraněný profil');
  assert.equal(saved.country,null);
  assert.equal(saved.publish_requested,false);
  assert.equal((await one('select count(*)::int as n from core_v1.rights_limits where user_id=$1',[owner])).n,0);
  assert.equal((await one('select count(*)::int as n from core_v1.fc_grants')).n,11);
  await q('delete from public.users where id=$1',[owner]);
  assert.equal((await one('select count(*)::int as n from core_v1.creators where erased_at is not null')).n,1);
});
