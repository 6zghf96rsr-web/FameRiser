"use client";
import {useEffect,useId,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {defaultReactions,validReaction,changeDemoReaction,type Reaction} from '@/lib/rankme/reactions';
import {api} from './join-form';
const labels:Record<string,string>={'❤️':'Srdíčko','👍':'Palec nahoru','👎':'Palec dolů','😠':'Zlost'};
export function ReviewReactions({reviewId,replyId,initial,enabled,demo}:{reviewId:string;replyId?:string;initial:Reaction[];enabled:boolean;demo:boolean}){
 const [items,setItems]=useState(initial),[open,setOpen]=useState(false),[custom,setCustom]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const pickerId=useId();
 useEffect(()=>{setItems(initial)},[initial]);
 const react=async(emoji:string)=>{if(!validReaction(emoji)){setError('Vlož právě jeden smajlík nebo emoji, například 🤩.');return}setBusy(true);setError('');try{
  if(demo)setItems(old=>changeDemoReaction(old,old.find(r=>r.emoji===emoji)?.mine?null:emoji));
  else setItems((await api(`reviews/${reviewId}/reaction`,{emoji,...(replyId?{reply_id:replyId}:{})})).reactions);
  setOpen(false);setCustom('');
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 const emojis=[...new Set([...defaultReactions,...items.map(r=>r.emoji)])];
 return <div className="review-reactions"><div className="reaction-buttons" role="group" aria-label="Reakce na příspěvek">
  {emojis.map(emoji=>{const r=items.find(r=>r.emoji===emoji);return <Button key={emoji} type="button" variant="outline" className="reaction-button" aria-pressed={!!r?.mine} aria-label={`${labels[emoji]||emoji}: ${r?.count||0}${r?.mine?', tvoje reakce':''}`} disabled={!enabled||busy} onClick={()=>void react(emoji)}><span aria-hidden="true">{emoji}</span><small>{r?.count||0}</small></Button>})}
  <Button type="button" variant="outline" className="reaction-button" aria-label="Přidat vlastní emoji" aria-expanded={open} aria-controls={pickerId} disabled={!enabled||busy} onClick={()=>{setOpen(v=>!v);setError('')}}>+</Button>
 </div>
 {open&&<form id={pickerId} className="custom-reaction" onSubmit={e=>{e.preventDefault();void react(custom.trim())}}><label>Vlastní emoji<Input value={custom} maxLength={32} onChange={e=>setCustom(e.target.value)} placeholder="Např. 🤩" autoFocus aria-describedby={`${pickerId}-hint`}/></label><Button type="submit" disabled={busy||!custom.trim()}>Použít</Button><p id={`${pickerId}-hint`} className="subtle-note">Vlož jeden smajlík z klávesnice nebo ho zkopíruj. Vybranou reakci odebereš opětovným kliknutím.</p></form>}
 {error&&<p className="form-error" role="alert">{error}</p>}
 </div>
}
type Reply={id:string;author_name:string;body:string;status:'pending'|'published'|'hidden';created_at:string;updated_at:string;is_mine:boolean;is_owner:boolean;reactions:Reaction[]};
type Thread={items:Reply[];count:number;page:number;can_reply:boolean;viewer_name:string|null;is_owner:boolean};
const blank:Thread={items:[],count:0,page:1,can_reply:false,viewer_name:null,is_owner:false};
export function ReviewDiscussion({reviewId,replyCount,signedIn,demo}:{reviewId:string;replyCount:number;signedIn:boolean;demo:boolean}){
 const [open,setOpen]=useState(false),[loaded,setLoaded]=useState(demo),[data,setData]=useState<Thread>(demo?{...blank,can_reply:true,viewer_name:'Majitel profilu (ukázka)',is_owner:true}:blank),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[text,setText]=useState(''),[edit,setEdit]=useState<Reply|null>(null);
 const regionId=useId();
 useEffect(()=>{if(!open||demo)return;let alive=true;setLoading(true);setError('');api(`reviews/${reviewId}/discussion?page=${page}`).then(r=>{if(alive){setData(r);setLoaded(true)}}).catch(e=>{if(alive)setError(e.message)}).finally(()=>{if(alive)setLoading(false)});return()=>{alive=false}},[open,demo,reviewId,page,refresh]);
 const save=async()=>{setBusy(true);setError('');try{
  if(demo){const now=new Date().toISOString();setData(old=>{const items=edit?old.items.map(r=>r.id===edit.id?{...r,body:text.trim(),updated_at:now}:r):[...old.items,{id:crypto.randomUUID(),author_name:old.viewer_name!,body:text.trim(),status:'published' as const,created_at:now,updated_at:now,is_mine:true,is_owner:true,reactions:[]}];return {...old,items,count:items.length}})}
  else {await api(`reviews/${reviewId}/replies`,{body:text,...(edit?{reply_id:edit.id}:{})});setPage(1);setRefresh(n=>n+1)}
  setText('');setEdit(null);setMessage(demo?'Ukázková odpověď je viditelná jen v tomto náhledu.':'Odpověď čeká na kontrolu před zveřejněním.');
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 const remove=async(r:Reply)=>{setBusy(true);setError('');try{if(demo)setData(old=>({...old,items:old.items.filter(x=>x.id!==r.id),count:old.count-1}));else{await api(`reviews/${reviewId}/replies`,{reply_id:r.id},'DELETE');setPage(1);setRefresh(n=>n+1)}if(edit?.id===r.id){setEdit(null);setText('')}setMessage('Odpověď byla odstraněna.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 return <div className="review-discussion"><Button type="button" variant="outline" aria-expanded={open} aria-controls={regionId} onClick={()=>setOpen(v=>!v)}>{open?'Zavřít diskusi':'Otevřít diskusi'} · {loaded?data.count:replyCount}</Button>
 {open&&<div id={regionId} className="discussion-thread">
  {loading&&<p role="status">Načítání diskuse…</p>}
  {!loading&&!error&&!data.items.length&&<p className="subtle-note">Zatím žádné odpovědi.</p>}
  {!loading&&data.items.map(r=><article key={r.id} className="discussion-reply"><header><strong>{r.author_name}</strong><span className="reply-role">{r.is_owner?'Majitel profilu':'Autor komentáře'}</span><time>{new Date(r.created_at).toLocaleDateString('cs-CZ')}</time></header><p>{r.body}</p>
   {r.status!=='published'&&<p className="subtle-note">{r.status==='pending'?'Čeká na kontrolu · viditelné jen pro tebe':'Skryto moderátorem · viditelné jen pro tebe'}</p>}
   {r.status==='published'&&<ReviewReactions reviewId={reviewId} replyId={r.id} initial={r.reactions} enabled={signedIn&&!r.is_mine} demo={demo}/>}
   <div className="reply-actions">{r.is_mine?<><Button variant="ghost" disabled={busy} onClick={()=>{setEdit(r);setText(r.body)}}>Upravit odpověď</Button><Button variant="ghost" disabled={busy} onClick={()=>void remove(r)}>Odstranit odpověď</Button></>:signedIn&&<Button variant="ghost" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{if(!demo)await api(`replies/${r.id}/report`,{});setMessage(demo?'Ukázkové nahlášení se neodesílá.':'Odpověď byla předána ke kontrole.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>Nahlásit odpověď</Button>}</div>
  </article>)}
  {data.count>20&&!demo&&<nav className="review-pagination" aria-label="Stránky diskuse"><Button variant="outline" disabled={page===1||loading} onClick={()=>setPage(p=>p-1)}>Předchozí odpovědi</Button><span>{page} / {Math.ceil(data.count/20)}</span><Button variant="outline" disabled={page*20>=data.count||loading} onClick={()=>setPage(p=>p+1)}>Další odpovědi</Button></nav>}
  {!loading&&data.can_reply&&<form className="reply-form" onSubmit={e=>{e.preventDefault();void save()}}><label>{edit?'Upravit odpověď':'Napsat odpověď'}<Textarea required minLength={2} maxLength={2000} value={text} disabled={busy} onChange={e=>setText(e.target.value)} placeholder="Navaž na komentář…"/></label><p className="subtle-note">Odpovídáš jako {data.viewer_name}. {demo?'Ukázka se neukládá.':'Odpověď i její úpravy procházejí kontrolou před zveřejněním.'}</p><div className="reply-actions"><Button disabled={busy||!text.trim()} type="submit">{demo?'Vyzkoušet odpověď':'Odeslat odpověď ke kontrole'}</Button>{edit&&<Button type="button" variant="ghost" disabled={busy} onClick={()=>{setEdit(null);setText('')}}>Zrušit úpravu</Button>}</div></form>}
  {!loading&&!error&&!data.can_reply&&<p className="subtle-note">Odpovídat mohou majitel profilu a autor původního komentáře. Ostatní mohou po přihlášení reagovat emoji.</p>}
  {message&&<p role="status" className="form-success">{message}</p>}{error&&<p role="alert" className="form-error">{error}</p>}
 </div>}
 </div>
}
