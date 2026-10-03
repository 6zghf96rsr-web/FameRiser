import { accountURL } from './connections';

export type ProfileProvider = 'facebook' | 'twitch' | 'x';
export type ProviderIdentity = { provider: string; provider_id?: string; identity_data?: Record<string, unknown> };
export type ProviderProfile = { platform: 'Facebook' | 'Twitch' | 'X'; remote_id: string; social_url: string; label: string; avatar_url: string | null };

// Only pass identities from auth.getUser() and a server-fetched provider response.
// Never use editable user_metadata, an email, or a browser-supplied URL as proof.
export function verifiedProviderProfile(provider: ProfileProvider, identities: ProviderIdentity[], payload: any): ProviderProfile {
  const row = provider === 'twitch' ? payload?.data?.[0] : provider === 'x' ? payload?.data : payload;
  const id = row?.id;
  if (typeof id !== 'string' || !/^\d{1,40}$/.test(id) || !identities.some(i => i.provider === provider && (i.provider_id || i.identity_data?.provider_id || i.identity_data?.sub) === id)) {
    throw new Error('Sociální síť nepotvrdila totožnost připojovaného účtu. Přihlas se znovu.');
  }
  const platform = provider === 'facebook' ? 'Facebook' : provider === 'twitch' ? 'Twitch' : 'X';
  let raw: string;
  if (provider === 'facebook') {
    if (typeof row.link !== 'string' || !row.link) throw new Error('Facebook potvrdil přihlášení, ale neposkytl odkaz na profil. Pro zařazení je potřeba povolit přístup k odkazu profilu (user_link).');
    raw = row.link;
  } else {
    const handle = provider === 'twitch' ? row.login : row.username;
    if (typeof handle !== 'string' || !(provider === 'twitch' ? /^\w{1,25}$/ : /^\w{1,15}$/).test(handle)) throw new Error('Síť neposkytla platné uživatelské jméno.');
    raw = `https://${provider === 'twitch' ? 'twitch.tv' : 'x.com'}/${handle}`;
  }
  const name = provider === 'twitch' ? row.display_name : row.name;
  const label = typeof name === 'string' && name.trim() && !name.includes('@') ? name.trim().slice(0,200) : `${platform} profil`;
  const avatar = provider === 'facebook' ? row.picture?.data?.url : row.profile_image_url;
  return {platform, remote_id:id, social_url:accountURL(raw,platform), label, avatar_url:typeof avatar==='string' && /^https:\/\//.test(avatar) && !/[?&]access_token=/i.test(avatar) ? avatar : null};
}
