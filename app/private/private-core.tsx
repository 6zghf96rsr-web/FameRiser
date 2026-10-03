'use client';
import {useState} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {useRouter} from 'next/navigation';
import type {PrivateBoard,PrivateOwner} from '@/lib/core/private-v1';
import {PRIVATE_RULES_VERSION} from '@/lib/core/private-v1';

type Connection={id:string;platform:string;label:string;url:string};
export function PrivateCore({owner,board,period,connections,youtubeReady,legalReady,result}:{
  owner:PrivateOwner|null;board:PrivateBoard;period:PrivateBoard['period'];
  connections:Connection[];youtubeReady:boolean;legalReady:boolean;result:string|null;
}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [name,setName]=useState('');
  const [country,setCountry]=useState('');
  const [adult,setAdult]=useState(false);
  const [accepted,setAccepted]=useState(false);
  const [publish,setPublish]=useState(false);
  const [eraseWord,setEraseWord]=useState('');
  async function action(payload:Record<string,unknown>){
    setBusy(true);setError('');
    try{
      const r=await fetch('/api/private/core',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload),credentials:'same-origin'});
      const data=await r.json() as {error?:string;url?:string};
      if(!r.ok)throw new Error(data.error==='LOGIN_REQUIRED'?'Přihlas se a potvrď e-mail.':
        data.error==='YOUTUBE_UNAVAILABLE'?'Propojení YouTube ještě není nakonfigurované.':
        data.error==='RATE_LIMITED'?'Příliš mnoho změn. Zkus to v další hodině.':
        data.error==='PILOT_NOT_READY'?'Registrace čeká na schválení aktuálních právních textů a nastavení provozu.':'Akci se nepodařilo dokončit. Zkus to znovu.');
      if(payload.action==='export'){
        const href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
        const link=document.createElement('a');link.href=href;link.download='fameriser-pilot-export.json';
        document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(href),1000);
        setBusy(false);return;
      }
      if(payload.action==='erase'){router.push('/private/login?erased=1');router.refresh();return;}
      if(data.url){location.assign(data.url);return;}
      if(payload.action==='logout'){router.push('/private/login');router.refresh();return;}
      setBusy(false);
      router.refresh();
    }catch(e){setError((e as Error).message);setBusy(false);}
  }
  const connected=new Set(owner?.accounts.filter(a=>a.active).map(a=>a.url)||[]);
  return <main className="private-core">
    <header className="private-header"><Link className="private-brand" href="/private"><Image src="/brand/fameriser-fr-icon.png" width={40} height={40} alt=""/> FameRiser</Link><span>Soukromý pilot · platby vypnuty</span><button onClick={()=>void action({action:'logout'})} disabled={busy}>Odhlásit</button></header>
    <div className="private-inner">
      <section className="private-hero"><p className="private-eyebrow">NOVÁ PRAVIDLA · {PRIVATE_RULES_VERSION}</p><h1>Jeden creator. Více účtů. Jedno pořadí.</h1><p>Pořadí určuje součet ověřených FameCreditů a později potvrzených plateb v USD. Nyní získáš 1 FC za každý nově připojený ověřený sociální účet, nejvýše 10 FC. FC nelze vyplatit. Startovní bonus 5 FC se v soukromém pilotu nepřiděluje.</p></section>
      {result&&<p role="status" className="private-note">Výsledek propojení YouTube: {result==='youtube'?'účet byl ověřen. Připoj jej níže.':result==='no-channel'?'nebyl nalezen kanál.':'ověření nebylo dokončeno.'}</p>}
      {error&&<p role="alert" className="private-error">{error}</p>}
      {!legalReady&&<p role="status" className="private-note">Registrace se připravuje. Čeká na schválení aktuálních právních textů a nastavení provozu.</p>}
      <div className="private-columns"><section className="private-panel"><h2>Můj creator profil</h2>
        {!owner?<form onSubmit={e=>{e.preventDefault();void action({action:'register',name,country,publish,adult,accepted,version:PRIVATE_RULES_VERSION});}}>
          <label>Veřejné jméno<input required minLength={2} maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>
          <label>Země (volitelně)<input maxLength={2} pattern="[A-Za-z]{2}" placeholder="CZ" value={country} onChange={e=>setCountry(e.target.value.toUpperCase())}/></label>
          <label className="private-check"><input type="checkbox" checked={adult} onChange={e=>setAdult(e.target.checked)}/> Je mi alespoň 18 let.</label>
          <label className="private-check"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/> Přijímám <Link href="/private/rules">pravidla soukromého pilotu</Link>.</label>
          <label className="private-check"><input type="checkbox" checked={publish} onChange={e=>setPublish(e.target.checked)}/> Chci zobrazit profil a uvedené veřejné údaje v pilotním žebříčku po ověření účtu.</label>
          <button type="submit" disabled={busy||!adult||!accepted||!legalReady}>Vytvořit profil</button>
        </form>:<><p><strong>{owner.display_name}</strong>{owner.country?` · ${owner.country}`:''}</p><p>{owner.fc} FC · {owner.accounts.length} připojených účtů</p><label className="private-check"><input type="checkbox" checked={owner.publish_requested} disabled={busy} onChange={e=>void action({action:'publish',publish:e.target.checked})}/> Zobrazovat profil v pilotním žebříčku</label></>}
      </section><section className="private-panel"><h2>Ověřené sociální účty</h2>
        {youtubeReady&&owner&&<button type="button" disabled={busy||!legalReady} onClick={()=>void action({action:'youtube'})}>Ověřit YouTube</button>}
        {connections.length===0?<p>Po ověření účtu u podporovaného poskytovatele se objeví zde. Samotný odkaz není důkazem vlastnictví.</p>:<ul className="private-connections">{connections.map(c=><li key={c.id}><span><strong>{c.platform}</strong> · {c.label}</span>{owner&&!connected.has(c.url)&&<button disabled={busy} onClick={()=>void action({action:'attach',connection_id:c.id,category:null})}>Připojit a získat FC</button>}<button disabled={busy} onClick={()=>void action({action:'disconnect',connection_id:c.id})}>Odpojit ověření</button></li>)}</ul>}
        {owner?.accounts.filter(a=>!a.active).length?<p>Odpojené účty se nezobrazují; dříve udělené FC zůstávají.</p>:null}
      </section></div>
      <section className="private-panel"><h2>Žebříček · Global</h2><p>Cash USD a FC jsou zobrazené zvlášť. Při stejném součtu rozhoduje dřívější dosažení, pak veřejné UUID creatora.</p>{!owner&&<p>Žebříček uvidíš po vytvoření profilu a přijetí aktuálních pravidel.</p>}<nav className="private-periods" aria-label="Období žebříčku"><Link aria-current={period==='all_time'?'page':undefined} href="/private?period=all_time">Celkem</Link><Link aria-current={period==='daily'?'page':undefined} href="/private?period=daily">Dnes UTC</Link><Link aria-current={period==='weekly'?'page':undefined} href="/private?period=weekly">Týden UTC</Link></nav>
        {board.rows.length===0?<p>Zatím tu není žádný ověřený zveřejněný creator se skóre v tomto období.</p>:<ol className="private-board">{board.rows.map(row=><li key={row.creator_id} id={row.creator_id}><b>#{row.rank}</b><div><strong>{row.display_name}</strong>{row.country?` · ${row.country}`:''}<div className="private-accounts">{row.accounts.map(a=><a key={a.provider+a.url} href={a.url} target="_blank" rel="noopener noreferrer">{a.provider}: {a.label}</a>)}</div><Link href={`/private/report?url=${encodeURIComponent(`https://fameriser.com/private?period=${period}#${row.creator_id}`)}`}>Oznámit profil</Link></div><span>{(row.combined_usd_minor/100).toFixed(2)} USD hodnota<br/><small>cash {(row.cash_usd_minor/100).toFixed(2)} USD · {row.fc} FC</small></span></li>)}</ol>}
      </section><section className="private-panel"><h2>Údaje a odstranění účtu</h2><p>Stáhni nový profil a propojení. O starší záznamy můžeš požádat na kontaktní adrese v pravidlech. Při žádosti o výmaz se profil ihned skryje; dokončení posoudí správce podle nutných lhůt.</p><button type="button" disabled={busy} onClick={()=>void action({action:'export'})}>Stáhnout moje údaje</button><label>Pro žádost o odstranění napiš SMAZAT<input value={eraseWord} onChange={e=>setEraseWord(e.target.value)} autoComplete="off"/></label><button type="button" disabled={busy||eraseWord!=='SMAZAT'} onClick={()=>void action({action:'erase',confirm:eraseWord})}>Požádat o odstranění účtu</button></section><footer className="private-footer"><Link href="/private/rules">Pravidla a soukromí</Link><Link href="/private/report">Oznámit obsah</Link><span>Revize {board.projection_revision} · {board.as_of}</span></footer>
    </div>
  </main>;
}
