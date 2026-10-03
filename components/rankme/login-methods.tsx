"use client";
import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {ShieldCheck} from 'lucide-react';
import type {AuthStatus} from '@/lib/rankme/auth-status';
import {loginProviders,loginProviderNames} from '@/lib/rankme/login-providers';
import {api} from './join-form';

export function LoginMethods(){
  const [data,setData]=useState<{status:AuthStatus;identities:{provider:string}[]}|null>(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState('');
  useEffect(()=>{let alive=true;void Promise.all([api('config'),api('connections')]).then(([config,account])=>{if(alive)setData({status:config.auth,identities:account.identities});}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[]);
  return <section className="settings-card login-methods"><h3>Přihlašování do FameRiseru</h3><p>Další způsob přihlášení připojíš ke stejnému účtu. Své profily spravuješ v <a href="/connections">Propojených účtech</a>.</p>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {!data&&!error&&<p role="status">Načítám možnosti přihlášení…</p>}
    {data&&<div className="login-method-list">{loginProviders.filter(provider=>data.status[provider]||data.identities.some(i=>i.provider===provider)).map(provider=>{
      const linked=data.identities.some(i=>i.provider===provider);
      return <div key={provider}><strong>{loginProviderNames[provider]}</strong>{linked?<span><ShieldCheck size={16}/> Připojeno</span>:<Button variant="outline" disabled={!!busy} onClick={async()=>{setBusy(provider);setError('');try{const r=await api('auth/link',{provider});location.assign(r.url);}catch(e){setError((e as Error).message);}finally{setBusy('');}}}>{busy===provider?'Přesměrovávám…':'Připojit'}</Button>}</div>;
    })}{!loginProviders.some(p=>data.status[p]||data.identities.some(i=>i.provider===p))&&<p>Další sociální přihlašování zatím není dostupné.</p>}</div>}
    <details className="legacy-account-links"><summary>Dříve uložené odkazy</summary><p>Pokud jsi v testovací verzi ukládal/a Instagram přes ChatGPT, své odkazy najdeš v <a href="/instagram">původním přehledu Instagramu</a>. Jde o samostatné soukromé návrhy.</p></details>
  </section>;
}
