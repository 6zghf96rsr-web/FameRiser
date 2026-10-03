'use client';
import {useState} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {useRouter} from 'next/navigation';
import {browserDB} from '@/lib/supabase/client';
export function PrivateLogin({config,appUrl,legalReady,initialReset,initialConfirm,initialError,initialErased}:{config:{url:string;key:string};appUrl:string|null;legalReady:boolean;initialReset:boolean;initialConfirm:boolean;initialError:boolean;initialErased:boolean}){
  const router=useRouter();
  const [mode,setMode]=useState<'login'|'register'|'reset'>(initialReset?'reset':'login');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [adult,setAdult]=useState(false);
  const [accepted,setAccepted]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState(initialErased?'Žádost o odstranění účtu byla přijata. Profil je skrytý; dokončení výmazu potvrdí správce.':initialConfirm?'Nejdříve potvrď e-mail z registrační zprávy.':'');
  const [error,setError]=useState(initialError?'Ověření odkazu se nepodařilo. Vyžádej si nový.':'');
  async function submit(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError('');setMessage('');
    try{
      if(appUrl&&new URL(appUrl).origin!==location.origin)throw new Error('Použij hlavní adresu '+new URL(appUrl).origin+'.');
      const db=browserDB(config);
      if(!db)throw new Error('Přihlášení ještě není nakonfigurované.');
      if(mode==='register'){
        if(!adult||!accepted)throw new Error('Potvrď věk a pravidla pilotu.');
        const {error}=await db.auth.signUp({email,password,
          options:{emailRedirectTo:location.origin+'/auth/private-confirm'}});
        if(error)throw error;
        setMessage('Pokud lze účet vytvořit, pošleme ti odkaz pro potvrzení e-mailu.');
      }else if(mode==='login'){
        const {error}=await db.auth.signInWithPassword({email,password});
        if(error)throw new Error('E-mail nebo heslo není správné.');
        router.push('/private');router.refresh();
      }else{
        const {error}=await db.auth.updateUser({password});
        if(error)throw error;
        setMessage('Heslo je změněné. Nyní můžeš pokračovat do pilotu.');
      }
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function forgot(){
    setBusy(true);setError('');setMessage('');
    try{
      const db=browserDB(config);if(!db)throw new Error('Přihlášení není dostupné.');
      const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/auth/private-confirm?reset=1'});
      if(error)throw error;
      setMessage('Pokud účet existuje, pošleme odkaz pro nastavení hesla.');
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <main className="private-core"><header className="private-header"><Link className="private-brand" href="/private"><Image src="/brand/fameriser-fr-icon.png" width={40} height={40} alt=""/> FameRiser</Link><span>Soukromý pilot</span></header><div className="private-inner private-login"><p className="private-eyebrow">ÚČET</p><h1>{mode==='register'?'Vytvořit účet':mode==='reset'?'Nové heslo':'Přihlášení'}</h1><p>V první fázi používáme e-mail. Další způsoby přihlášení přidáme po veřejném spuštění.</p>{!legalReady&&<p role="status" className="private-note">Nové registrace čekají na schválení textů a nastavení provozu.</p>}{error&&<p role="alert" className="private-error">{error}</p>}{message&&<p role="status" className="private-note">{message}</p>}
    <form className="private-panel" onSubmit={e=>void submit(e)}>{mode!=='reset'&&<label>E-mail<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>}<label>Heslo<input type="password" autoComplete={mode==='login'?'current-password':'new-password'} minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/></label>{mode==='register'&&<><label className="private-check"><input type="checkbox" checked={adult} onChange={e=>setAdult(e.target.checked)}/> Je mi alespoň 18 let.</label><label className="private-check"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/> Přečetl(a) jsem si <Link href="/private/rules">pravidla a informace o soukromí</Link>.</label></>}<button disabled={busy||mode==='register'&&(!adult||!accepted||!legalReady)}>{mode==='register'?'Vytvořit účet':mode==='reset'?'Uložit heslo':'Přihlásit se'}</button></form>
    <div className="private-login-links">{mode!=='login'&&<button onClick={()=>setMode('login')}>Mám účet</button>}{mode!=='register'&&<button onClick={()=>setMode('register')}>Nový účet</button>}{mode==='login'&&<button disabled={busy||!email} onClick={()=>void forgot()}>Zapomenuté heslo</button>}</div><p><Link href="/private/rules">Pravidla pilotu a ochrana údajů</Link></p></div></main>;
}
