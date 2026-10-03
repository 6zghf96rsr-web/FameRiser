import type { AuthStatus } from './auth-status';
export type ConnectionOption = {
  id: 'facebook' | 'facebookPages' | 'youtube' | 'twitch' | 'x' | 'instagram' | 'tiktok';
  label: string;
  description: string;
  provider?: 'facebook' | 'twitch' | 'x';
  available: boolean;
};
export function connectionOptions(status: AuthStatus): ConnectionOption[] {
  return [
    {id:'facebook',label:'Facebook profil',description:'Tvůj osobní profil',provider:'facebook',available:status.ready&&status.facebook},
    {id:'facebookPages',label:'Facebook stránka',description:'Vybereš stránku, kterou spravuješ',available:status.ready&&status.facebookPages},
    {id:'youtube',label:'YouTube',description:'Kanál ověřený přes Google',available:status.ready&&status.youtube},
    {id:'twitch',label:'Twitch',description:'Tvůj účet a kanál',provider:'twitch',available:status.ready&&status.twitch},
    {id:'x',label:'X',description:'Tvůj osobní profil',provider:'x',available:status.ready&&status.x},
    {id:'instagram',label:'Instagram',description:'',available:false},
    {id:'tiktok',label:'TikTok',description:'',available:false},
  ];
}
