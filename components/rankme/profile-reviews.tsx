"use client";
import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {RadioGroup,RadioGroupItem} from '@/components/ui/radio-group';
import {ReviewReactions,ReviewDiscussion} from "./review-discussion";
import type {Reaction} from "@/lib/rankme/reactions";
import {api} from './join-form';
type Review={is_mine?:boolean;reactions?:Reaction[];reply_count?:number;id:string;author_name:string;body:string;score:number|null;status?:string;created_at:string;updated_at:string};
type Reviews={items:Review[];count:number;rated_count:number;average:number|null;mine:Review|null;can_write:boolean;is_owner:boolean;signed_in:boolean;page:number};
const empty:Reviews={items:[],count:0,rated_count:0,average:null,mine:null,can_write:false,is_owner:false,signed_in:false,page:1};
const demoReview:Review={id:'demo-review',author_name:'Návštěvník (ukázka)',body:'Které téma plánuješ zpracovat příště? Rád bych o tvé tvorbě věděl víc.',score:null,created_at:'2026-09-16T12:00:00Z',updated_at:'2026-09-16T12:00:00Z',reactions:[],reply_count:0,is_mine:false};
export function ProfileReviews({id,slug,demo}:{id:string;slug:string;demo:boolean}){
 const [data,setData]=useState<Reviews>(demo?{...empty,items:[demoReview],signed_in:true,is_owner:true}:empty),[page,setPage]=useState(1),[author,setAuthor]=useState(''),[body,setBody]=useState(''),[score,setScore]=useState('none'),[busy,setBusy]=useState(false),[loading,setLoading]=useState(!demo),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{if(demo)return;let alive=true;setLoading(true);setError('');api(`profiles/${id}/reviews?page=${page}`).then(r=>{if(alive){setData(r);setAuthor(r.mine?.author_name||'');setBody(r.mine?.body||'');setScore(r.mine?.score?String(r.mine.score):'none')}}).catch(e=>{if(alive)setError(e.message)}).finally(()=>{if(alive)setLoading(false)});return()=>{alive=false}},[id,demo,page]);
 const save=async(remove=false)=>{setBusy(true);setError('');try{const r=await api(`profiles/${id}/reviews`,remove?undefined:{author_name:author,body,score:score==='none'?null:Number(score)},remove?'DELETE':'POST');if(remove){setData(await api(`profiles/${id}/reviews`));setBody('');setScore('none')}else setData(r);setPage(1);setMessage(remove?'Tvůj komentář byl odstraněn.':'Komentář čeká na kontrolu před zveřejněním.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 return <section className="profile-rating-card profile-reviews" aria-labelledby="reviews-title">
  <h2 id="reviews-title">Komentáře návštěvníků</h2><p>Komentuj tvorbu, ne vzhled nebo osobní život. Hvězdičky jsou volitelné a nemění pořadí. Příspěvky procházejí kontrolou; názor není ověřenou zákaznickou recenzí.</p>
  {data.rated_count>0&&<p><strong>★ {Number(data.average).toLocaleString('cs-CZ',{maximumFractionDigits:1})} / 5</strong> · {data.rated_count} komentářů s hvězdičkami · {data.count} komentářů celkem</p>}
  {loading?<p role="status">Načítání komentářů…</p>:!error&&!data.items.length&&<p className="notice">Zatím žádné zveřejněné komentáře.</p>}
  {demo&&<p className="notice">Ukázková diskuse: můžeš vyzkoušet reakce a odpověď majitele. Změny zůstanou jen v tomto náhledu.</p>}
  <div className="review-list">{data.items.map(r=><article key={r.id}><header><strong>{r.author_name}</strong>{r.score&&<span aria-label={`${r.score} z 5 hvězdiček`}>{'★'.repeat(r.score)}{'☆'.repeat(5-r.score)}</span>}<time>{new Date(r.created_at).toLocaleDateString('cs-CZ')}</time></header><p>{r.body}</p><ReviewReactions reviewId={r.id} initial={r.reactions||[]} enabled={data.signed_in&&!r.is_mine} demo={demo}/><ReviewDiscussion reviewId={r.id} replyCount={r.reply_count||0} signedIn={data.signed_in} demo={demo}/>{data.signed_in&&!demo&&<Button variant="ghost" disabled={busy} onClick={async()=>{setBusy(true);try{await api(`reviews/${r.id}/report`,{});setMessage('Komentář byl předán ke kontrole.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>Nahlásit komentář</Button>}</article>)}</div>
  {data.count>20&&<nav aria-label="Stránky komentářů" className="review-pagination"><Button variant="outline" disabled={page===1||loading} onClick={()=>setPage(p=>p-1)}>Předchozí</Button><span>{page} / {Math.ceil(data.count/20)}</span><Button variant="outline" disabled={page*20>=data.count||loading} onClick={()=>setPage(p=>p+1)}>Další</Button></nav>}
  {(data.can_write||demo)&&<form className="review-form" onSubmit={e=>{e.preventDefault();void save()}}>
   <h3>{data.mine?'Upravit vlastní komentář':'Přidat komentář'}</h3>
   {data.mine?.status&&<p>Stav: {({pending:'čeká na kontrolu',published:'zveřejněný',hidden:'skrytý moderátorem'} as Record<string,string>)[data.mine.status]}</p>}
   <label>Veřejné jméno nebo přezdívka<Input required minLength={2} maxLength={60} value={author} onChange={e=>setAuthor(e.target.value)} disabled={demo||busy}/></label>
   <label>Tvůj komentář<Textarea required minLength={10} maxLength={2000} value={body} onChange={e=>setBody(e.target.value)} disabled={demo||busy} placeholder="Popiš konkrétně, co tě na tvorbě zaujalo…"/></label>
   <RadioGroup value={score} onValueChange={setScore} disabled={demo||busy} className="review-stars" aria-label="Volitelné hvězdičky">{['none','1','2','3','4','5'].map(v=><label key={v}><RadioGroupItem value={v}/>{v==='none'?'Bez hvězdiček':`${v} ★`}</label>)}</RadioGroup>
   <p className="subtle-note">Jeden komentář na účet a profil, zdarma po přihlášení. Zadané jméno, text a případné hvězdičky budou veřejné. Po úpravě komentář znovu čeká na kontrolu.</p>
   <div className="rating-actions"><Button type="submit" disabled={demo||busy||loading}>Odeslat ke kontrole</Button>{data.mine&&<Button type="button" variant="ghost" disabled={busy} onClick={()=>void save(true)}>Odstranit můj komentář</Button>}</div>
  </form>}
  {demo?<p className="notice">V demu se komentáře neukládají.</p>:data.is_owner?<p className="subtle-note">Vlastní profil nemůžeš recenzovat. Na komentáře ostatních ale můžeš odpovídat v diskusi.</p>:!loading&&!error&&!data.signed_in&&<Button asChild variant="outline"><a href={`/login?next=${encodeURIComponent(`/p/${slug}`)}`}>Přihlásit se a komentovat zdarma</a></Button>}
  {error&&<p className="form-error" role="alert">{error}</p>}{message&&<p className="form-success" role="status">{message}</p>}
 </section>
}
