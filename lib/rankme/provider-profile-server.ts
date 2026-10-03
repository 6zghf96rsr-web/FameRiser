import { adminDB } from '@/lib/supabase/server';
import { createHmac } from 'node:crypto';
import { verifiedProviderProfile, type ProfileProvider, type ProviderIdentity } from './provider-profile';

export async function connectProviderProfile(user: {id:string;identities?:ProviderIdentity[]}, provider: ProfileProvider, token: string) {
  const urls = {facebook:'https://graph.facebook.com/v25.0/me?fields=id,name,link,picture', twitch:'https://api.twitch.tv/helix/users',x:'https://api.x.com/2/users/me?user.fields=profile_image_url'};
  const address = new URL(urls[provider]);
  if (provider==='facebook' && process.env.FACEBOOK_APP_SECRET) address.searchParams.set('appsecret_proof',createHmac('sha256',process.env.FACEBOOK_APP_SECRET).update(token).digest('hex'));
  const headers:Record<string,string> = {Authorization:`Bearer ${token}`};
  if (provider==='twitch') {
    if(!process.env.TWITCH_CLIENT_ID) throw new Error('Ověření Twitche ještě není nakonfigurované.');
    headers['Client-Id']=process.env.TWITCH_CLIENT_ID;
  }
  const response=await fetch(address,{headers,cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw new Error(provider==='facebook' ? 'Facebook neposkytl údaje pro propojení. Povol přístup k odkazu profilu; aplikace potřebuje oprávnění user_link.' : 'Síť nepotvrdila propojení. Přihlas se znovu.');
  const profile=verifiedProviderProfile(provider,user.identities||[],await response.json());
  const {data,error}=await adminDB().rpc('verify_provider_connection',{p_user:user.id,p_platform:profile.platform,p_remote_id:profile.remote_id,p_url:profile.social_url,p_label:profile.label,p_avatar:profile.avatar_url});
  if(error) throw new Error(error.code==='23505' ? 'Tento sociální účet už je připojený. Každý profil lze připojit jen jednou.' : 'Ověřený účet se nepodařilo uložit. Zkus to později.');
  const placement=await adminDB().rpc('activate_login_profile',{p_user:user.id,p_connection:data});
  if(placement.error) throw new Error('Účet je ověřený, ale automatické zařazení se nepodařilo dokončit. Zkus přihlášení znovu.');
  return data as string;
}
