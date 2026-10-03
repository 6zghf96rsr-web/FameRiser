"use client";
import { useRef, useState } from 'react';
import { CheckCircle2, Download, FilePlus2, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { noticeInput, noticeReasons, MAX_NOTICE_FILES, MAX_NOTICE_FILE_SIZE, receiptText } from '@/lib/rankme/notices';

type Receipt = { case_id: string; created_at: string; receipt_state: string };
export function ReportForm({ initialURL = '', demo }: { initialURL?: string; demo: boolean }) {
  const [url, setURL] = useState(initialURL), [reason, setReason] = useState('impersonation');
  const [details, setDetails] = useState(''), [name, setName] = useState(''), [email, setEmail] = useState('');
  const [child, setChild] = useState(false), [faith, setFaith] = useState(false);
  const [files, setFiles] = useState<File[]>([]), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [receipt, setReceipt] = useState<Receipt | null>(null);
  const requestID = useRef('');
  const submitted = useRef(false);
  function downloadReceipt() {
    if (!receipt) return;
    const blob = new Blob([(demo ? 'UKÁZKA — OZNÁMENÍ NEBYLO ODESLÁNO\n\n' : '') + receiptText(receipt.case_id, receipt.created_at)], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${receipt.case_id}.txt`; link.click(); URL.revokeObjectURL(link.href);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setError('');
    requestID.current ||= crypto.randomUUID();
    const value = { request_id: requestID.current, content_url: url, reason, details, reporter_name: name, reporter_email: email, child_safety: child, good_faith: faith };
    const parsed = noticeInput.safeParse(value);
    if (!parsed.success) { setError(parsed.error.issues.map(i => i.message).join(' ')); return; }
    if (demo) { setReceipt({ case_id: 'DEMO-NEODESLANO', created_at: new Date().toISOString(), receipt_state: 'demo' }); return; }
    setBusy(true); submitted.current = true;
    try {
      const data = new FormData(); data.set('notice', JSON.stringify(parsed.data)); files.forEach(file => data.append('files', file));
      const response = await fetch('/api/notices', { method: 'POST', body: data });
      const result = await response.json() as Receipt & { error?: string };
      if (!response.ok) { submitted.current = response.status >= 500; throw new Error(result.error || 'Oznámení se nepodařilo odeslat.'); }
      setReceipt(result);
    } catch (err) { setError((err as Error).message + (submitted.current ? ' Můžeš odeslání zopakovat; stejné oznámení se neuloží dvakrát.' : '')); }
    finally { setBusy(false); }
  }
  if (receipt) return <section className="notice-receipt" role="status">
    <CheckCircle2 size={36} aria-hidden="true" />
    <h2>{demo ? 'Ukázka potvrzení' : 'Oznámení jsme přijali'}</h2>
    <p>{demo ? 'Toto je pouze demo. Nic se neuložilo do administrace a žádný e-mail se neodeslal.' : 'Oznámení je uložené k posouzení. Přijetí neznamená, že obsah byl shledán nezákonným.'}</p>
    <div className="notice-case"><span>Číslo případu</span><strong>{receipt.case_id}</strong><span>{new Date(receipt.created_at).toLocaleString('cs-CZ')}</span></div>
    {!demo && <p>{receipt.receipt_state === 'sent' ? 'Potvrzení bylo předáno e-mailové službě k odeslání.' : receipt.receipt_state === 'not_requested' ? 'Kontaktní e-mail nebyl uveden. Potvrzení si můžeš stáhnout; pro další komunikaci použij číslo případu.' : 'Potvrzení na e-mail zatím nebylo odesláno. Je připravené ke zpracování podporou; potvrzení si můžeš stáhnout už teď.'}</p>}
    <Button onClick={downloadReceipt} variant="outline"><Download size={16}/> Stáhnout potvrzení</Button>
    <p>Dotazy k oznámení: <a href="mailto:info@fameriser.com">info@fameriser.com</a>. Uveď číslo případu.</p>
  </section>;
  return <form className="content-notice-form" onSubmit={submit}>
    <div className="notice"><ShieldCheck size={21}/><p>Oznámení můžeš podat bez přihlášení. Kontaktní údaje a přílohy nejsou veřejné. Hlášení posuzuje člověk.</p></div>
    {demo && <p className="demo-inline">Ukázkový formulář: lze vyzkoušet i potvrzení, ale oznámení ani přílohy se neodesílají.</p>}
    <fieldset disabled={busy || submitted.current}>
      <label className="flow-label">Přesný odkaz na obsah na FameRiser <Input value={url} onChange={e => setURL(e.target.value)} type="url" required maxLength={2000} placeholder="https://fameriser.com/p/…" autoComplete="off" /></label>
      <p className="field-help">Odkaz je předvyplněný při hlášení profilu. Pro konkrétní komentář může obsahovat i jeho označení za #.</p>
      <label className="flow-label">Důvod oznámení
        <Select value={reason} onValueChange={v => { setReason(v); if (v !== 'sexual') setChild(false); }}>
          <SelectTrigger className="full-width" aria-label="Důvod oznámení"><SelectValue/></SelectTrigger>
          <SelectContent>{noticeReasons.map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
        </Select>
      </label>
      {reason === 'sexual' && <label className="check-line"><Checkbox checked={child} onCheckedChange={v => { setChild(v === true); if (v) setFiles([]); }}/><span>Jde o podezření na sexuální zneužívání nebo vykořisťování dítěte. Jméno a e-mail mohu vynechat.</span></label>}
      <label className="flow-label">Popis problému <Textarea value={details} onChange={e => setDetails(e.target.value)} required minLength={20} maxLength={10000} rows={6} placeholder="Které části profilu nebo komentáře se problém týká? Popiš, proč je podle tebe obsah nezákonný nebo porušuje pravidla. U práv k obsahu uveď, jaká práva a komu náleží. Není nutné znát číslo zákona."/></label>
      <div className="notice-fields">
        <label className="flow-label">Jméno nebo název organizace{child ? ' (nepovinné)' : ''}<Input value={name} onChange={e => setName(e.target.value)} required={!child} minLength={child ? undefined : 2} maxLength={150} autoComplete="name"/></label>
        <label className="flow-label">Kontaktní e-mail{child ? ' (nepovinné)' : ''}<Input value={email} onChange={e => setEmail(e.target.value)} type="email" required={!child} maxLength={254} autoComplete="email"/></label>
      </div>
      <p className="field-help">Na uvedený e-mail patří potvrzení přijetí a následné rozhodnutí s informací o možnostech přezkumu. Bez e-mailu ti je nemůžeme zaslat.</p>
      {child ? <p className="notice">Nepřikládej ani nestahuj materiál zobrazující sexuální zneužívání dětí. Stačí přesný odkaz a slovní popis.</p> : <div className="notice-files">
        <label className="flow-label"><span><FilePlus2 size={17}/> Přílohy (nepovinné)</span><Input type="file" accept="image/png,image/jpeg,application/pdf" multiple onChange={e => {
          const incoming = Array.from(e.target.files || []); e.target.value = '';
          if (files.length + incoming.length > MAX_NOTICE_FILES || incoming.some(f => !f.size || f.size > MAX_NOTICE_FILE_SIZE || !['image/png','image/jpeg','application/pdf'].includes(f.type))) { setError('Povoleny jsou nejvýše 3 neprázdné přílohy PNG, JPG nebo PDF, každá do 2 MB.'); return; }
          setError(''); setFiles([...files,...incoming]);
        }}/></label>
        <p className="field-help">Nejvýše 3 soubory PNG, JPG nebo PDF, každý do 2 MB. Přilož jen důkazy potřebné k posouzení a nezbytné osobní údaje.</p>
        {files.map((file,i) => <div className="notice-file" key={`${file.name}-${i}`}><span>{file.name} · {Math.ceil(file.size / 1024)} kB</span><Button type="button" variant="ghost" size="icon" aria-label={`Odebrat ${file.name}`} onClick={() => setFiles(files.filter((_,index) => index !== i))}><X size={16}/></Button></div>)}
      </div>}
      <label className="check-line"><Checkbox checked={faith} onCheckedChange={v => setFaith(v === true)}/><span>V dobré víře prohlašuji, že informace a tvrzení v tomto oznámení jsou podle mého vědomí přesné a úplné.</span></label>
      <p className="field-help">Údaje použijeme k vyřízení oznámení a související komunikaci. <a href="/privacy" target="_blank" rel="noreferrer">Zásady soukromí</a></p>
    </fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    <Button type="submit" disabled={busy}>{busy && <LoaderCircle className="animate-spin" size={16}/>} {demo ? 'Vyzkoušet potvrzení v demu' : 'Odeslat oznámení'}</Button>
    <p className="field-help">Při bezprostředním ohrožení života kontaktuj místní tísňovou linku. Tento formulář není pohotovostní služba.</p>
  </form>;
}
