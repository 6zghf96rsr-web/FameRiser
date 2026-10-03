import {notFound,redirect} from 'next/navigation';
import {adminDB,getUser,publicConfig} from '@/lib/supabase/server';
import {privateCoreEnabled,privateEmailUser,privatePilotReady} from '@/lib/core/private-v1';
import {PrivateLogin} from './private-login';
import '../private.css';
export const dynamic='force-dynamic';
export const metadata={title:'Přihlášení — FameRiser pilot',robots:{index:false,follow:false}};
export default async function PrivateLoginPage({searchParams}:{searchParams:Promise<{reset?:string;confirm?:string;error?:string;erased?:string}>}){
  if(!privateCoreEnabled())notFound();
  const user=await getUser();
  const query=await searchParams;
  if(user&&privateEmailUser(user)&&query.reset!=='1'){
    const account=await adminDB().from('users').select('banned').eq('id',user.id).single();
    if(account.data&&!account.data.banned)redirect('/private');
  }
  return <PrivateLogin config={publicConfig()} appUrl={process.env.APP_URL||null}
    legalReady={privatePilotReady()} initialReset={query.reset==='1'}
    initialConfirm={query.confirm==='1'} initialError={Boolean(query.error)}
    initialErased={query.erased==='1'}/>;
}
