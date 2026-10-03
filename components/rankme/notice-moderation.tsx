"use client";
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { noticeCase, reasonLabel, receiptText } from '@/lib/rankme/notices';
import { api } from './join-form';
function NoticeItem({ item:r, refresh, mailConfigured }: {item:any;refresh:()=>Promise<void>;mailConfigured:boolean}) {
  const [decision,setDecision]=useState(r.decision),[redress,setRedress]=useState(r.redress),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const number=noticeCase(r.case_number);
  const receipt=receiptText(number,r.created_at);
  const decisionMessage=`FameRiser — rozhodnutí k oznámení ${number}\n\n${r.decision}\n\nMožnosti přezkumu:\n${r.redress}\n\nKontakt: info@fameriser.com`;
  const mail=(text:string)=>`mailto:${encodeURIComponent(r.reporter_email)}?subject=${encodeURIComponent(`FameRiser — ${number}`)}&body=${encodeURIComponent(text)}`;
  async function action(action:string) {
    setBusy(true);setError('');
    try { const data=await api('admin/notices',{id:r.id,action,...(action==='decision'?{decision,redress}:{})}); if(data.receipt_state==='pending')setError('E-mail zatím nebyl odeslán. Zkontroluj nastavení odesílatele nebo odešli potvrzení ručně.'); await refresh(); }
    catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  return <article className="settings-card">
    <h3>{number} · {reasonLabel(r.reason)}</h3>
    <p><strong>{r.child_safety?'Priorita: podezření na sexuální zneužívání dítěte · ':''}</strong>{new Date(r.created_at).toLocaleString('cs-CZ')} · {({open:'Nové',reviewing:'V posouzení',resolved:'Rozhodnuto'} as Record<string,string>)[r.status]}</p>
    <a href={r.content_url} target="_blank" rel="noreferrer">{r.content_url}</a>
    <p>{r.details}</p>
    <p>Oznamovatel: {r.reporter_name||'Neuveden (výjimka)'} · {r.reporter_email||'Bez e-mailu'}</p>
    <p className="field-help">Prohlášení v dobré víře: {r.good_faith?'potvrzeno':'chybí'}. Kontaktní údaje ani důkazy nezveřejňuj.</p>
    {r.attachments.length>0&&<div>{r.attachments.map((f:any,i:number)=><p key={i}><a href={`/api/admin/notices/${r.id}/attachment/${i}`} download>{f.name} · {Math.ceil(f.size/1024)} kB — stáhnout</a></p>)}<p className="field-help">Soubory pocházejí od oznamovatele. Nejsou automaticky kontrolované antivirem.</p></div>}
    <div className="notice-admin-controls">
      {r.status==='open'&&<Button variant="outline" disabled={busy} onClick={()=>action('reviewing')}>Zahájit posouzení</Button>}
      {r.reporter_email&&r.receipt_state==='pending'&&<><Button variant="outline" asChild><a href={mail(receipt)}>Připravit potvrzení v e-mailu</a></Button>{mailConfigured&&<Button variant="outline" disabled={busy} onClick={()=>action('retry_receipt')}>Zkusit automatické odeslání</Button>}<Button variant="outline" disabled={busy} onClick={()=>action('receipt_sent')}>Potvrzuji, že jsem potvrzení odeslal/a</Button></>}
    </div>
    <p className="field-help">Potvrzení přijetí: {({pending:'čeká na odeslání',sent:'předáno e-mailové službě',manual:'ručně odesláno',not_requested:'bez kontaktního e-mailu'} as Record<string,string>)[r.receipt_state]}</p>
    <details><summary>Rozhodnutí a vyrozumění</summary><div>
      <p className="field-help">Nejdříve proveď potřebné opatření v moderaci profilu nebo komentáře. Zápis rozhodnutí sám obsah neskrývá. Pokud omezuješ profil, použij odůvodněnou moderaci výše; vlastník dostane své samostatné rozhodnutí.</p>
      <label className="flow-label">Rozhodnutí a odůvodnění<Textarea value={decision} onChange={e=>setDecision(e.target.value)} minLength={20} maxLength={10000} placeholder="Co bylo rozhodnuto, proč, podle kterého pravidla nebo právního důvodu a zda bylo využito automatizované zpracování."/></label>
      <label className="flow-label">Možnosti přezkumu<Textarea value={redress} onChange={e=>setRedress(e.target.value)} minLength={10} maxLength={5000} placeholder="Konkrétní postup a kontakt, jak požádat o přezkum rozhodnutí; další dostupné prostředky nápravy."/></label>
      <Button disabled={busy||decision.trim().length<20||redress.trim().length<10} onClick={()=>action('decision')}>Uložit rozhodnutí</Button>
      {r.status==='resolved'&&<><p>{r.decision}</p><p>{r.redress}</p>{r.reporter_email?<div className="notice-admin-controls"><Button variant="outline" asChild><a href={mail(decisionMessage)}>Připravit vyrozumění v e-mailu</a></Button><Button variant="outline" disabled={busy||!!r.decision_sent_at} onClick={()=>action('decision_sent')}>{r.decision_sent_at?'Odeslání vyrozumění evidováno':'Potvrzuji, že jsem vyrozumění odeslal/a'}</Button></div>:<p className="field-help">Bez kontaktního e-mailu nelze zaslat vyrozumění.</p>}</>}
    </div></details>
    {error&&<p className="form-error" role="alert">{error}</p>}
  </article>;
}
export function NoticeModeration({demo}:{demo:boolean}) {
  const [status,setStatus]=useState('open'),[page,setPage]=useState(1),[data,setData]=useState<any>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  async function refresh(){setLoading(true);setError('');try{setData(await api(`admin/notices?status=${status}&page=${page}`))}catch(e){setError((e as Error).message)}finally{setLoading(false)}}
  useEffect(()=>{if(!demo)void refresh()},[demo,status,page]);
  return <section className="notice-admin"><h2 className="tab-title">Oznámení obsahu · případy</h2>
    {demo?<p className="notice">Demo nevytváří skutečná oznámení. Zde bude fronta případů, soukromé důkazy, potvrzení přijetí a rozhodnutí.</p>:<>
      <div className="notice-admin-controls"><Select value={status} onValueChange={v=>{setStatus(v);setPage(1)}}><SelectTrigger aria-label="Stav oznámení"><SelectValue/></SelectTrigger><SelectContent>{[['open','Nová'],['reviewing','V posouzení'],['resolved','Rozhodnutá'],['all','Všechna']].map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select><Button variant="outline" disabled={loading} onClick={refresh}>Obnovit</Button></div>
      {data&&!data.mail_configured&&<p className="notice">Automatické e-maily nejsou nakonfigurované. Potvrzení přijetí odesílej bez zbytečného odkladu ručně z info@fameriser.com a zaznamenej odeslání. Rozhodnutí se ukládají do fronty k odeslání.</p>}
      {error&&<p className="form-error" role="alert">{error}</p>}
      {loading&&<p role="status">Načítám oznámení…</p>}
      {!loading&&data?.items.map((r:any)=><NoticeItem key={r.id} item={r} refresh={refresh} mailConfigured={data.mail_configured}/>)}
      {!loading&&data?.items.length===0&&<p>V této frontě nejsou žádná oznámení.</p>}
      <div className="notice-admin-controls"><Button variant="outline" disabled={loading||page===1} onClick={()=>setPage(page-1)}>Předchozí</Button><span>Strana {page}</span><Button variant="outline" disabled={loading||!data||page*50>=data.count} onClick={()=>setPage(page+1)}>Další</Button></div>
    </>}
  </section>;
}
