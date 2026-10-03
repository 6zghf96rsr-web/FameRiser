import {connectProviderProfile} from '@/lib/rankme/provider-profile-server';
import { NextResponse } from "next/server";
import {ACCOUNT_ACCEPTANCE_VERSIONS} from "@/lib/rankme/policies";
import { sessionDB,adminDB } from "@/lib/supabase/server";
import { authReturnPath } from "@/lib/rankme/connections";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = process.env.APP_URL ? new URL(process.env.APP_URL).origin : url.origin;
  // An older login may still return to the preview host. Restart on the
  // canonical host; exchanging here would strand session cookies on preview.
  if (url.origin !== origin) {
    const login = new URL('/login', origin);
    login.searchParams.set('error', 'session');
    login.searchParams.set('next', authReturnPath(url.searchParams.get('next')));
    return NextResponse.redirect(login, { headers: { 'Cache-Control': 'no-store' } });
  }
  const code = url.searchParams.get("code");
  const db = await sessionDB();
  if (code && db) {
    const { data:auth, error } = await db.auth.exchangeCodeForSession(code);
    if (!error) {
      const {data:{user}}=await db.auth.getUser();
      if (!user) return NextResponse.redirect(origin + '/login?error=session', { headers: { 'Cache-Control': 'no-store' } });
      const provider=url.searchParams.get('profile_provider') || user.app_metadata?.provider;
      let profileFailed=false;
      let connectedId:string|undefined;
      if(auth?.session?.provider_token && typeof provider==='string' && ['facebook','twitch','x'].includes(provider)) {
        try {connectedId=await connectProviderProfile(user,provider as 'facebook'|'twitch'|'x',auth.session.provider_token);}
        catch { profileFailed=true; }
      }
      const requestedPath=authReturnPath(url.searchParams.get("next"));
      const nextPath=connectedId&&requestedPath.split("?")[0]==='/connections'?'/connections?review='+encodeURIComponent(connectedId):requestedPath;
      const accepted=user?await adminDB().from("account_acceptances").select("version").eq("user_id",user.id).in("version",ACCOUNT_ACCEPTANCE_VERSIONS).maybeSingle():null;
      return NextResponse.redirect(
        origin + (accepted?.data?(profileFailed?'/connections?error=auto-placement':nextPath):"/account-consent?next="+encodeURIComponent(nextPath)),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
  }
  return NextResponse.redirect(origin + "/login?error=auth");
}
