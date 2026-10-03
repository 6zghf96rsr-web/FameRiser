'use client';
import {useEffect,useState,useRef} from 'react';
import {api,ApiError} from './join-form';
import {Button} from '@/components/ui/button';
import {requestKinds} from '@/lib/rankme/service-requests';
import {POLICY_VERSION} from '@/lib/rankme/policies';
import {countries,countryLabel} from '@/lib/rankme/discovery';
import {authReturnPath} from '@/lib/rankme/connections';
export function Acceptance() {
 const [adult,setAdult]=useState(false),[agree,setAgree]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[sessionExpired,setSessionExpired]=useState(false);
 return <form className="form-card account-consent-card" aria-label="Potvrzení podmínek účtu" onSubmit={async e=>{
  e.preventDefault();setError('');setBusy(true);
  try {await api('account/acceptance',{adult,accepted:agree,version:POLICY_VERSION});location.assign(authReturnPath(new URLSearchParams(location.search).get('next')))}
  catch(e){
   if(e instanceof ApiError && e.status===401){setSessionExpired(true);setError('Přihlášení vypršelo. Přihlas se znovu a potom potvrď podmínky.');}
   else setError((e as Error).message);
  }finally{setBusy(false)}
 }}>
  <p className="consent-intro">Pro dokončení účtu potvrď následující dvě položky.</p>
  <fieldset className="consent-options" disabled={busy}>
   <legend className="sr-only">Povinná potvrzení</legend>
   <label className="consent-option">
    <input type="checkbox" name="adult" checked={adult} onChange={e=>setAdult(e.target.checked)} required/>
    <span><strong>Je mi alespoň 18 let.</strong></span>
   </label>
   <label className="consent-option">
    <input type="checkbox" name="terms" checked={agree} onChange={e=>setAgree(e.target.checked)} required/>
    <span><strong>Podmínky a soukromí</strong><span className="consent-description">Souhlasím s <a href="/policies/terms">podmínkami služby</a> a <a href="/policies/ranking">pravidly žebříčku</a>. Seznámil/a jsem se se <a href="/policies/privacy">zásadami soukromí</a>.</span></span>
   </label>
  </fieldset>
  {error&&<p className="form-error" role="alert">{error}</p>}
  {sessionExpired ? <a className="primary-button" href={'/login?error=session&next='+encodeURIComponent(authReturnPath(new URLSearchParams(location.search).get('next')))}>Znovu se přihlásit</a> : <Button type="submit" className="consent-submit" disabled={busy||!adult||!agree}>
   {busy?'Ukládám…':'Potvrdit a pokračovat'}
  </Button>}
 </form>;
}
export function ServiceRequests({demo}:{demo:boolean}){
 const [kind,setKind]=useState<keyof typeof requestKinds>('withdrawal'),[email,setEmail]=useState(''),[name,setName]=useState(''),[reference,setReference]=useState(''),[details,setDetails]=useState(''),[country,setCountry]=useState('CZ'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[receipt,setReceipt]=useState<any>(null),[history,setHistory]=useState<any>(null);const requestId=useRef('');
 useEffect(()=>{requestId.current=crypto.randomUUID();const q=new URLSearchParams(location.search);if(q.get('payment'))setReference(q.get('payment')!);if(q.get('decision')){setKind('appeal');setReference(q.get('decision')!)}if(!demo)void api('service-requests').then(setHistory).catch(()=>{})},[demo]);
 async function submit(e:React.FormEvent){e.preventDefault();setError('');if(demo){setError('Toto je demo. Žádost nebyla odeslána.');return}setBusy(true);try{setReceipt(await api('service-requests',{request_id:requestId.current,kind,email,name,reference,details,...kind==='country'?{country}:{}}))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <><p>Odstoupení a reklamaci lze podat i bez přihlášení. Nevyžadujeme zdůvodnění odstoupení. Před vyřízením může být potřeba ověřit vztah k platbě. Pro odvolání a změnu země se přihlas.</p>{receipt?<div className="form-success"><h2>Žádost přijata · {receipt.case_id}</h2><p>{new Date(receipt.created_at).toLocaleString('cs-CZ')}</p><p>{requestKinds[kind]} · {name} · {email}</p><p>Reference: {reference}</p>{details&&<p>{details}</p>}<p>Potvrzení je zařazené k odeslání e-mailem. Tento doklad si můžeš uložit i nyní.</p><button onClick={()=>window.print()}>Uložit / vytisknout potvrzení</button></div>:<form className="form-card service-form" onSubmit={submit}><fieldset disabled={busy}><label>Typ žádosti<select value={kind} onChange={e=>setKind(e.target.value as keyof typeof requestKinds)}>{Object.entries(requestKinds).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Jméno<input value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={150} required/></label><label>Kontaktní e-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254} required/></label><label>{kind==='appeal'?'Číslo rozhodnutí':kind==='country'?'ID tvého profilu':'Identifikátor platby / objednávky'}<input value={reference} onChange={e=>setReference(e.target.value)} maxLength={200} required/></label>{kind==='country'&&<label>Požadovaná země<select value={country} onChange={e=>setCountry(e.target.value)}>{countries.map(c=><option key={c} value={c}>{countryLabel(c)}</option>)}</select></label>}<label>{kind==='withdrawal'?'Doplňující informace (nepovinné)':'Popis a souvislosti'}<textarea value={details} onChange={e=>setDetails(e.target.value)} maxLength={10000} required={kind==='appeal'} minLength={kind==='appeal'?20:undefined}/></label><p>Údaje použijeme pouze pro vyřízení podle <a href="/policies/privacy">zásad soukromí</a>. Doklady totožnosti, údaje karty ani hesla sem nevkládej.</p><button className="primary-button">{kind==='withdrawal'?'Potvrdit odstoupení od smlouvy':'Odeslat žádost'}</button></fieldset>{error&&<p className="form-error" role="alert">{error}</p>}</form>}
 {history&&<section><h2>Moje žádosti a rozhodnutí</h2>{history.decisions.map((d:any)=><article className="settings-card" key={d.id}><h3>Rozhodnutí {d.id}</h3><p>{d.reason}</p><p>Pravidlo: {d.rule} · opatření: {d.action}</p><p>{d.payment_impact}</p><a href={`/requests?decision=${d.id}`}>Požádat o přezkum</a></article>)}{history.items.map((r:any)=><article key={r.id}><strong>FR-S-{r.case_number}</strong> · {r.status}<p>{r.resolution}</p></article>)}</section>}<p>Alternativně napiš na <a href="mailto:info@fameriser.com">info@fameriser.com</a>.</p></>;
}
