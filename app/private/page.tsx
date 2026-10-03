import {notFound,redirect} from 'next/navigation';
import {adminDB,getUser} from '@/lib/supabase/server';
import {privateCoreEnabled,privateEmailUser,privatePilotReady,type PrivateBoard,type PrivateOwner} from '@/lib/core/private-v1';
import {PrivateCore} from './private-core';
import './private.css';

export const dynamic='force-dynamic';
export const metadata={title:'Soukromý pilot — FameRiser',robots:{index:false,follow:false}};
export default async function PrivatePage({searchParams}:{searchParams:Promise<{period?:string;result?:string}>}){
  if(!privateCoreEnabled())notFound();
  const user=await getUser();
  if(!user)redirect('/private/login');
  if(!user.email_confirmed_at)redirect('/private/login?confirm=1');
  if(!privateEmailUser(user))redirect('/private/login?error=provider');
  const db=adminDB();
  const account=await db.from('users').select('banned').eq('id',user.id).single();
  if(account.error||!account.data||account.data.banned)notFound();
  const params=await searchParams;
  const period=['all_time','daily','weekly'].includes(params.period||'')
    ?params.period!:'all_time';
  const [owner,connections]=await Promise.all([
    db.rpc('core_v1_owner',{p_user:user.id}),
    db.from('social_connections').select('id,platform,label,social_url,method,remote_id,account_kind')
      .eq('user_id',user.id).eq('status','verified')
      .in('method',['youtube_oauth','provider_oauth']).not('remote_id','is',null),
  ]);
  if(owner.error||connections.error)throw new Error('Soukromé žebříčky nejsou připojené k nové databázi.');
  const board=owner.data?await db.rpc('core_v1_board',{p_period:period}):null;
  if(board?.error)throw new Error('Žebříček není dostupný.');
  const emptyBoard:PrivateBoard={rules_version:'2026-10-03.1',period:period as PrivateBoard['period'],
    period_start:null,as_of:new Date().toISOString(),projection_revision:0,rows:[]};
  const available=(connections.data||[]).filter(c=>c.account_kind!=='facebook_page'&&
    ['YouTube','Facebook','Twitch','X'].includes(c.platform));
  return <PrivateCore owner={owner.data as PrivateOwner|null}
    board={(board?.data as PrivateBoard|undefined)||emptyBoard} period={period as PrivateBoard['period']}
    connections={available.map(c=>({id:c.id,platform:c.platform,label:c.label,url:c.social_url}))}
    youtubeReady={Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET)}
    legalReady={privatePilotReady()}
    result={params.result||null}/>;
}
