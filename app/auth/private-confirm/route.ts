import {NextResponse} from 'next/server';
import {sessionDB} from '@/lib/supabase/server';
import {privateCoreEnabled} from '@/lib/core/private-v1';
export const dynamic='force-dynamic';
export async function GET(req:Request){
  const url=new URL(req.url);
  const origin=process.env.APP_URL?new URL(process.env.APP_URL).origin:url.origin;
  if(!privateCoreEnabled()||url.origin!==origin)return NextResponse.redirect(origin+'/private/login?error=confirmation');
  const db=await sessionDB();
  if(!db)return NextResponse.redirect(origin+'/private/login?error=confirmation');
  let okay=false;
  const hash=url.searchParams.get('token_hash');
  const type=url.searchParams.get('type');
  if(hash&&['signup','email','recovery'].includes(type||'')){
    const result=await db.auth.verifyOtp({token_hash:hash,type:type as 'signup'|'email'|'recovery'});
    okay=!result.error;
  }else if(url.searchParams.get('code')){
    const result=await db.auth.exchangeCodeForSession(url.searchParams.get('code')!);
    okay=!result.error;
  }
  return NextResponse.redirect(origin+(okay?(url.searchParams.get('reset')==='1'?'/private/login?reset=1':'/private'):'/private/login?error=confirmation'),
    {headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}
